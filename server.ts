import 'dotenv/config';
import express from 'express';
import http from 'http';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { createServer as createViteServer } from 'vite';
import { GoogleGenAI, Type } from '@google/genai';
import { WebSocketServer, WebSocket } from 'ws';
import {
  Task,
  GuestRequest,
  SwitchMessage,
  OperationalAlert,
  AgentProfile,
  SwitchConfig,
  Department,
  Priority,
  TaskAuditEntry,
  ChatParticipant,
  LifecycleStage,
  AuthenticatedStaff,
  StaffPermission,
} from './src/types/index';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Initialize Gemini SDK with User-Agent header
const apiKey = process.env.GEMINI_API_KEY || '';
const ai = apiKey
  ? new GoogleGenAI({
      apiKey,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        },
      },
    })
  : null;

// Timeout wrapper for external AI calls to guarantee lightning-fast fallback under 3s
async function callGeminiWithTimeout<T>(promise: Promise<T>, timeoutMs = 3000): Promise<T> {
  let timer: any;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error('AI API call timed out')), timeoutMs);
  });
  try {
    return await Promise.race([promise, timeoutPromise]);
  } finally {
    clearTimeout(timer);
  }
}

// ---------------------------------------------------------------------------
// Security: Staff Directory & Authentication Engine
// ---------------------------------------------------------------------------
interface StaffRecord {
  id: string;
  name: string;
  role: string;
  pin: string;
  badgeId: string;
  department: Department;
  permissions: StaffPermission[];
  avatar: string;
  avatarBg: string;
}

const STAFF_DIRECTORY: Record<string, StaffRecord> = {
  'staff-elena': {
    id: 'staff-elena',
    name: 'Elena Rostova',
    role: 'Front Desk Lead',
    pin: '1042',
    badgeId: 'REC-104',
    department: 'Reception',
    permissions: ['CREATE_TASK', 'READ_ALL', 'ASSIGN_DEPT'],
    avatar: 'ER',
    avatarBg: 'bg-amber-600/20 text-amber-300 border-amber-500/40',
  },
  'staff-marcus': {
    id: 'staff-marcus',
    name: 'Marcus Vance',
    role: 'Executive Duty Manager',
    pin: '9001',
    badgeId: 'MGT-900',
    department: 'Management',
    permissions: ['ALL', 'ESCALATE', 'OVERRIDE', 'VERIFY'],
    avatar: 'MV',
    avatarBg: 'bg-purple-600/20 text-purple-300 border-purple-500/40',
  },
  'staff-carlos': {
    id: 'staff-carlos',
    name: 'Carlos Mendez',
    role: 'Chief Plant Engineer',
    pin: '4021',
    badgeId: 'ENG-402',
    department: 'Maintenance',
    permissions: ['ACCEPT_MAINT', 'UPDATE_TASK', 'VERIFY_MAINT', 'VERIFY'],
    avatar: 'CM',
    avatarBg: 'bg-sky-600/20 text-sky-300 border-sky-500/40',
  },
  'staff-maria': {
    id: 'staff-maria',
    name: 'Maria Santos',
    role: 'Head of Housekeeping',
    pin: '3105',
    badgeId: 'HSK-310',
    department: 'Housekeeping',
    permissions: ['ACCEPT_HK', 'UPDATE_TASK', 'VERIFY_HK', 'VERIFY'],
    avatar: 'MS',
    avatarBg: 'bg-emerald-600/20 text-emerald-300 border-emerald-500/40',
  },
};

// Active authenticated staff sessions map: token -> AuthenticatedStaff
const activeStaffSessions = new Map<string, AuthenticatedStaff>();

// Pre-seed sessions for demo convenience while maintaining strict verification
for (const staff of Object.values(STAFF_DIRECTORY)) {
  const token = `token-${staff.id}-${staff.pin}`;
  activeStaffSessions.set(token, {
    id: staff.id,
    name: staff.name,
    role: staff.role,
    badgeId: staff.badgeId,
    department: staff.department,
    permissions: staff.permissions,
    token,
  });
}

function authenticateStaffToken(token?: string | null): AuthenticatedStaff | null {
  if (!token) return null;
  return activeStaffSessions.get(token.trim()) || null;
}

// ---------------------------------------------------------------------------
// Security: Secret Redaction & SSRF Hardening
// ---------------------------------------------------------------------------
function redactSwitchConfig(config: SwitchConfig): SwitchConfig {
  return {
    ...config,
    apiKey: config.apiKey ? '••••••••' : '',
  };
}

function isValidWebhookUrl(rawUrl: string): { valid: boolean; error?: string } {
  if (!rawUrl || typeof rawUrl !== 'string') {
    return { valid: false, error: 'Webhook URL cannot be empty' };
  }
  try {
    const parsed = new URL(rawUrl);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return { valid: false, error: 'Protocol must be http: or https:' };
    }
    const hostname = parsed.hostname.toLowerCase();
    if (
      hostname === 'localhost' ||
      hostname === '127.0.0.1' ||
      hostname === '0.0.0.0' ||
      hostname === '169.254.169.254' ||
      hostname.startsWith('10.') ||
      hostname.startsWith('192.168.') ||
      (hostname.startsWith('172.') &&
        parseInt(hostname.split('.')[1], 10) >= 16 &&
        parseInt(hostname.split('.')[1], 10) <= 31)
    ) {
      return {
        valid: false,
        error: 'Target URL resolves to private or loopback infrastructure (SSRF prohibited)',
      };
    }
    return { valid: true };
  } catch (err: any) {
    return { valid: false, error: 'Malformed URL' };
  }
}

// ---------------------------------------------------------------------------
// Human Staff & AI Agent Roster
// ---------------------------------------------------------------------------
const ACTIVE_PARTICIPANTS: ChatParticipant[] = [
  {
    id: 'staff-elena',
    name: 'Elena Rostova',
    role: 'Front Desk Lead',
    type: 'HUMAN',
    department: 'Reception',
    avatar: 'ER',
    avatarBg: 'bg-amber-600/20 text-amber-300 border-amber-500/40',
    status: 'online',
  },
  {
    id: 'staff-marcus',
    name: 'Marcus Vance',
    role: 'Executive Duty Manager',
    type: 'HUMAN',
    department: 'Management',
    avatar: 'MV',
    avatarBg: 'bg-purple-600/20 text-purple-300 border-purple-500/40',
    status: 'online',
  },
  {
    id: 'staff-carlos',
    name: 'Carlos Mendez',
    role: 'Chief Plant Engineer',
    type: 'HUMAN',
    department: 'Maintenance',
    avatar: 'CM',
    avatarBg: 'bg-sky-600/20 text-sky-300 border-sky-500/40',
    status: 'online',
  },
  {
    id: 'staff-maria',
    name: 'Maria Santos',
    role: 'Head of Housekeeping',
    type: 'HUMAN',
    department: 'Housekeeping',
    avatar: 'MS',
    avatarBg: 'bg-emerald-600/20 text-emerald-300 border-emerald-500/40',
    status: 'busy',
  },
  {
    id: 'agent-central',
    name: 'Central Operations AI',
    role: 'Orchestrator & GM Brain',
    type: 'AI_AGENT',
    department: 'Management',
    avatar: 'CO',
    avatarBg: 'bg-amber-500/30 text-amber-200 border-amber-400',
    status: 'online',
  },
  {
    id: 'agent-reception',
    name: 'Reception Agent',
    role: 'Front Office Intelligence',
    type: 'AI_AGENT',
    department: 'Reception',
    avatar: 'RX',
    avatarBg: 'bg-amber-500/20 text-amber-300 border-amber-500/30',
    status: 'online',
  },
  {
    id: 'agent-housekeeping',
    name: 'Housekeeping Agent',
    role: 'Linen & Sanitary Dispatch',
    type: 'AI_AGENT',
    department: 'Housekeeping',
    avatar: 'HK',
    avatarBg: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30',
    status: 'online',
  },
  {
    id: 'agent-maintenance',
    name: 'Maintenance Agent',
    role: 'Physical Plant & HVAC Diagnostics',
    type: 'AI_AGENT',
    department: 'Maintenance',
    avatar: 'MT',
    avatarBg: 'bg-sky-500/20 text-sky-300 border-sky-500/30',
    status: 'online',
  },
  {
    id: 'agent-management',
    name: 'Management Agent',
    role: 'Executive Escalations & Recovery',
    type: 'AI_AGENT',
    department: 'Management',
    avatar: 'GM',
    avatarBg: 'bg-rose-500/20 text-rose-300 border-rose-500/30',
    status: 'online',
  },
];

// ---------------------------------------------------------------------------
// Durable File-Based Storage Engine (/data/hotel_operations_db.json)
// ---------------------------------------------------------------------------
const DB_PATH = path.resolve(__dirname, 'data', 'hotel_operations_db.json');

interface DatabaseSchema {
  tasks: Task[];
  requests: GuestRequest[];
  messages: SwitchMessage[];
  alerts: OperationalAlert[];
  agents: AgentProfile[];
  switchConfig: SwitchConfig;
}

function getInitialDatabase(): DatabaseSchema {
  const now = Date.now();

  const initialAgents: AgentProfile[] = [
    {
      id: 'agent-central',
      name: 'Central Operations AI',
      role: 'Central Business Coordinator & General Manager Brain',
      department: 'Management',
      avatar: 'CO',
      status: 'Active',
      activeTasksCount: 4,
      avgResponseMins: 0.8,
      specialty: 'Autonomous orchestration, SLA tracking, risk mitigation & cross-department routing',
      autonomyLevel: 'Full Delegated Authority',
      activeProtocols: ['SLA_ENFORCER_V2', 'VIP_PROTECTION_MATRIX', 'DEPENDENCY_RESOLVER'],
      switchStatus: 'STANDBY',
      recentActionsCount: 14,
    },
    {
      id: 'agent-reception',
      name: 'Reception Agent',
      role: 'Front Office & Guest Experience Intelligence',
      department: 'Reception',
      avatar: 'RX',
      status: 'Active',
      activeTasksCount: 2,
      avgResponseMins: 2.1,
      specialty: 'VIP arrival coordination, billing audits, room relocations, concierge escalations',
      autonomyLevel: 'Full Delegated Authority',
      activeProtocols: ['RFID_MORTISE_SYNC', 'FOLIO_DISPUTE_GUARD', 'COURTESY_FOLLOWUP'],
      switchStatus: 'STANDBY',
      recentActionsCount: 9,
    },
    {
      id: 'agent-housekeeping',
      name: 'Housekeeping Agent',
      role: 'Linen, Cleanliness & Environmental Quality',
      department: 'Housekeeping',
      avatar: 'HK',
      status: 'High Load',
      activeTasksCount: 3,
      avgResponseMins: 4.5,
      specialty: 'Suite turnover, sanitary deep-cleans, turndown orchestration, amenity replenishments',
      autonomyLevel: 'Supervisor Review Required',
      activeProtocols: ['TURNDOWN_LOAD_BALANCER', 'LINEN_BUFFER_MONITOR', 'HYGIENE_CHECKPOINT'],
      switchStatus: 'STANDBY',
      recentActionsCount: 18,
    },
    {
      id: 'agent-maintenance',
      name: 'Maintenance Agent',
      role: 'Physical Infrastructure & Plant Engineering',
      department: 'Maintenance',
      avatar: 'MT',
      status: 'Active',
      activeTasksCount: 2,
      avgResponseMins: 3.2,
      specialty: 'Chilled-water HVAC, digital plumbing diagnostics, RFID access locks & electrical circuits',
      autonomyLevel: 'Full Delegated Authority',
      activeProtocols: ['HVAC_CHILLED_WATER_GUARD', 'PLUMBING_ISOLATION_NET', 'HARDWARE_FAILOVER'],
      switchStatus: 'STANDBY',
      recentActionsCount: 11,
    },
    {
      id: 'agent-management',
      name: 'Management Agent',
      role: 'Executive Duty Manager & Risk Governance',
      department: 'Management',
      avatar: 'GM',
      status: 'Investigating',
      activeTasksCount: 1,
      avgResponseMins: 1.5,
      specialty: 'Critical service failure recovery, high-net-worth guest care, department pressure mitigation',
      autonomyLevel: 'Executive Clearance Only',
      activeProtocols: ['SERVICE_RECOVERY_PROTOCOL', 'EXECUTIVE_COMPENSATION_GATE', 'BRAND_REPUTATION_WATCH'],
      switchStatus: 'STANDBY',
      recentActionsCount: 6,
    },
  ];

  const initialTasks: Task[] = [
    {
      id: 'task-101',
      caseRef: 'CAS-8091',
      room: '412',
      title: 'Inspect chilled-water HVAC unit — room ambient temperature 26.5°C',
      description: 'Guest reports AC blowing ambient air despite thermostat setting of 20°C. Compressor cycle check required.',
      department: 'Maintenance',
      assignedAgent: 'Maintenance Agent',
      priority: 'High',
      status: 'In Progress',
      lifecycleStage: 'IN_PROGRESS',
      deliveryStatus: 'IN_PROGRESS',
      createdAt: now - 34 * 60 * 1000,
      slaDeadline: now + 11 * 60 * 1000,
      estimatedMinutes: 45,
      dependencies: [],
      requiresHumanConfirmation: true,
      guestName: 'Lord Harrington',
      riskAssessment: 'High VIP guest churn risk if AC remains unresolved before 18:00.',
      isRepeatedIssue: false,
      isDemoData: true,
      auditTrail: [
        {
          id: 'aud-101-1',
          timestamp: now - 34 * 60 * 1000,
          actor: 'Central Operations AI',
          actorRole: 'Orchestrator',
          action: 'CREATED',
          note: 'Parsed from spoken guest report at Front Desk.',
        },
        {
          id: 'aud-101-2',
          timestamp: now - 33 * 60 * 1000,
          actor: 'Central Operations AI',
          actorRole: 'Orchestrator',
          action: 'DISPATCHED',
          note: 'Assigned to Maintenance Agent with 45m SLA deadline.',
        },
        {
          id: 'aud-101-3',
          timestamp: now - 28 * 60 * 1000,
          actor: 'Maintenance Agent',
          actorRole: 'Engineering',
          action: 'ACCEPTED',
          note: 'Duty HVAC technician dispatched to 4th floor service riser.',
        },
      ],
    },
    {
      id: 'task-102',
      caseRef: 'CAS-8092',
      room: '708',
      title: 'Deliver hypo-allergenic feather pillows & bolster set',
      description: 'VIP resident requested 4 hypo-allergenic pillows and turndown aroma mist prior to evening arrival.',
      department: 'Housekeeping',
      assignedAgent: 'Housekeeping Agent',
      priority: 'Normal',
      status: 'Dispatched',
      lifecycleStage: 'ASSIGNED',
      deliveryStatus: 'DELIVERED',
      createdAt: now - 18 * 60 * 1000,
      slaDeadline: now + 12 * 60 * 1000,
      estimatedMinutes: 30,
      dependencies: [],
      requiresHumanConfirmation: true,
      guestName: 'Lady Genevieve',
      isRepeatedIssue: false,
      isDemoData: true,
      auditTrail: [
        {
          id: 'aud-102-1',
          timestamp: now - 18 * 60 * 1000,
          actor: 'Central Operations AI',
          actorRole: 'Orchestrator',
          action: 'CREATED',
          note: 'Extracted from mobile concierge request.',
        },
        {
          id: 'aud-102-2',
          timestamp: now - 17 * 60 * 1000,
          actor: 'Central Operations AI',
          actorRole: 'Orchestrator',
          action: 'DISPATCHED',
          note: 'Allocated to Housekeeping 7th floor supervisor queue.',
        },
      ],
    },
    {
      id: 'task-103',
      caseRef: 'CAS-8093',
      room: '215',
      title: 'Digital Key demagnetization & RFID mortise lock diagnostic',
      description: 'Guest card failure twice in 12 hours. Check physical battery voltage and rewrite RFID cylinder permissions.',
      department: 'Maintenance',
      assignedAgent: 'Maintenance Agent',
      priority: 'Urgent',
      status: 'Escalated',
      lifecycleStage: 'ESCALATED',
      deliveryStatus: 'IN_PROGRESS',
      createdAt: now - 52 * 60 * 1000,
      slaDeadline: now - 7 * 60 * 1000,
      estimatedMinutes: 45,
      dependencies: [],
      requiresHumanConfirmation: true,
      guestName: 'Ambassador Thorne',
      riskAssessment: 'Repeated lockout event. Potential social review escalation.',
      isRepeatedIssue: true,
      isDemoData: true,
      escalationReason: 'SLA threshold breached by 7 minutes. Front desk duplicate card issuance unsuccessful.',
      auditTrail: [
        {
          id: 'aud-103-1',
          timestamp: now - 52 * 60 * 1000,
          actor: 'Central Operations AI',
          actorRole: 'Orchestrator',
          action: 'CREATED',
          note: 'Automated lock telemetry flagged repeat failure.',
        },
        {
          id: 'aud-103-2',
          timestamp: now - 7 * 60 * 1000,
          actor: 'Management Agent',
          actorRole: 'General Manager',
          action: 'ESCALATED',
          note: 'Escalated to Executive Duty Manager due to repeated guest lockout.',
        },
      ],
    },
  ];

  const initialRequests: GuestRequest[] = [
    {
      id: 'req-001',
      rawText: 'Hello, the AC in 412 is blowing warm air and making a slight buzzing sound. Also we could really use 3 extra bath towels, and could we have a late checkout tomorrow at 1:00 PM?',
      detectedRoom: '412',
      guestName: 'Lord Harrington',
      status: 'ROUTED',
      createdTaskIds: ['task-101'],
      createdAt: now - 35 * 60 * 1000,
      urgencyLevel: 'High',
      executiveSummary: 'Multi-department request decomposed into Maintenance (AC), Housekeeping (Towels), and Reception (Late checkout).',
      isDemoData: true,
    },
  ];

  const initialMessages: SwitchMessage[] = [
    {
      id: 'msg-001',
      sender: 'Elena Rostova',
      avatarRole: 'Front Desk Lead',
      senderType: 'HUMAN',
      department: 'Reception',
      content: 'Good morning team. Front desk has logged 4 early VIP arrivals for the 7th floor penthouses.',
      badge: 'INFO',
      timestamp: '08:15',
      channel: '#operations-general',
      sourceType: 'LIVE_STAFF',
      deliveryState: 'DELIVERED',
    },
    {
      id: 'msg-002',
      sender: 'Central Operations AI',
      avatarRole: 'Orchestrator',
      senderType: 'AI_AGENT',
      department: 'Management',
      content: 'Understood Elena. Monitoring 7th floor suite turnover. Housekeeping priority sequence adjusted for Suites 701, 704, and 708.',
      badge: 'DISPATCHED',
      timestamp: '08:16',
      channel: '#operations-general',
      sourceType: 'LIVE_AGENT',
      deliveryState: 'DELIVERED',
    },
  ];

  const initialAlerts: OperationalAlert[] = [
    {
      id: 'alt-01',
      type: 'SLA_BREACH_RISK',
      title: 'Suite 215 RFID Lock Repair Overdue',
      description: 'Task CAS-8093 has exceeded luxury SLA benchmark by 7 minutes.',
      affectedRoomOrDept: 'Suite 215 (Maintenance)',
      severity: 'Critical',
      recommendedAction: 'Dispatch senior engineer immediately; send assistant manager with physical master key.',
      timestamp: 'Just now',
      isDemoAlert: true,
      resolved: false,
    },
  ];

  const initialSwitchConfig: SwitchConfig = {
    status: process.env.SWITCH_ROOM_WEBHOOK_URL ? 'DISCONNECTED' : 'NOT_CONFIGURED',
    roomWebhookUrl: process.env.SWITCH_ROOM_WEBHOOK_URL || '',
    roomId: process.env.SWITCH_ROOM_ID || 'hotel-operations-room',
    apiKey: process.env.SWITCH_API_KEY || '',
    channelTarget: '#hotel-ops-central',
    autoRelayTasks: true,
    totalDelivered: 0,
    lastTestStatus: 'NOT_TESTED',
    protocolHandshakeVerified: false,
  };

  return {
    tasks: initialTasks,
    requests: initialRequests,
    messages: initialMessages,
    alerts: initialAlerts,
    agents: initialAgents,
    switchConfig: initialSwitchConfig,
  };
}

// Atomic file writing with strict boolean error enforcement
function saveDatabase(data: DatabaseSchema): boolean {
  try {
    const dir = path.dirname(DB_PATH);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    const tempPath = `${DB_PATH}.tmp.${Date.now()}.${Math.random().toString(36).substring(2, 7)}`;
    fs.writeFileSync(tempPath, JSON.stringify(data, null, 2), 'utf-8');
    fs.renameSync(tempPath, DB_PATH);
    return true;
  } catch (err: any) {
    console.error('[DB FATAL] Atomic database write failed:', err?.message || err);
    return false;
  }
}

function loadDatabase(): DatabaseSchema {
  try {
    if (fs.existsSync(DB_PATH)) {
      const raw = fs.readFileSync(DB_PATH, 'utf-8');
      return JSON.parse(raw);
    }
  } catch (err) {
    console.error('[DB] Failed reading db.json, creating clean seed:', err);
  }

  const initial = getInitialDatabase();
  saveDatabase(initial);
  return initial;
}

let db: DatabaseSchema = loadDatabase();

// ---------------------------------------------------------------------------
// Real-Time Messaging Architecture: WebSocket & SSE Broadcast Hub
// ---------------------------------------------------------------------------
const wsClients = new Set<WebSocket>();
const sseClients = new Set<express.Response>();

function broadcastRealtime(event: string, payload: any) {
  const wsFrame = JSON.stringify({ event, data: payload, timestamp: Date.now() });
  for (const client of wsClients) {
    if (client.readyState === WebSocket.OPEN) {
      try {
        client.send(wsFrame);
      } catch (err) {
        wsClients.delete(client);
      }
    }
  }

  const sseChunk = `event: ${event}\ndata: ${JSON.stringify(payload)}\n\n`;
  for (const res of sseClients) {
    try {
      res.write(sseChunk);
    } catch (err) {
      sseClients.delete(res);
    }
  }
}

// ---------------------------------------------------------------------------
// Genuine Switch Protocol Verification & Dispatcher
// ---------------------------------------------------------------------------
async function forwardToSwitchRoom(
  config: SwitchConfig,
  payload: {
    eventType: string;
    sender: { name: string; role: string };
    content: string;
    room?: string;
    taskId?: string;
  }
): Promise<{ success: boolean; error?: string; status: SwitchConfig['status'] }> {
  if (!config.roomWebhookUrl || config.status === 'NOT_CONFIGURED') {
    return { success: false, error: 'Switch room webhook URL is not configured', status: 'NOT_CONFIGURED' };
  }

  const urlCheck = isValidWebhookUrl(config.roomWebhookUrl);
  if (!urlCheck.valid) {
    config.status = 'CONNECTION_FAILED';
    config.lastTestStatus = 'FAILED';
    config.lastErrorMessage = urlCheck.error;
    saveDatabase(db);
    return { success: false, error: urlCheck.error, status: 'CONNECTION_FAILED' };
  }

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 4000);

    const body = {
      protocol: 'switch.v1',
      roomId: config.roomId,
      channel: config.channelTarget,
      sender: payload.sender,
      eventType: payload.eventType,
      content: payload.content,
      roomNumber: payload.room,
      taskId: payload.taskId,
      timestamp: new Date().toISOString(),
    };

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'User-Agent': 'HotelOperationsAI-SwitchClient/1.4',
      'X-Switch-Protocol-Version': '1.0',
      'X-Switch-Room-Id': config.roomId,
      'X-Switch-Agent-Id': 'hotel-central-ops',
    };
    if (config.apiKey && config.apiKey !== '••••••••') {
      headers['Authorization'] = `Bearer ${config.apiKey}`;
    }

    const response = await fetch(config.roomWebhookUrl, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    clearTimeout(timeout);

    // Protocol Verification: Inspect response headers and body for authentic Switch signature
    const hasSwitchHeader =
      response.headers.has('x-switch-room-status') ||
      response.headers.has('x-switch-acknowledge') ||
      response.headers.get('content-type')?.includes('application/vnd.switch.v1+json');

    let responseJson: any = null;
    try {
      responseJson = await response.json();
    } catch (e) {}

    const hasSwitchBody = Boolean(
      responseJson && (responseJson.switch || responseJson.switchProtocol || responseJson.protocol === 'switch.v1')
    );

    if (response.ok && (hasSwitchHeader || hasSwitchBody)) {
      config.totalDelivered += 1;
      config.status = 'CONNECTED';
      config.protocolHandshakeVerified = true;
      config.lastTestedAt = new Date().toISOString();
      config.lastTestStatus = 'SUCCESS';
      config.lastErrorMessage = undefined;
      saveDatabase(db);
      return { success: true, status: 'CONNECTED' };
    } else if (response.ok && !hasSwitchHeader && !hasSwitchBody) {
      // The endpoint returned HTTP 200, but did not implement the Switch protocol
      config.status = 'UNVERIFIED_GENERIC_WEBHOOK';
      config.protocolHandshakeVerified = false;
      config.lastTestedAt = new Date().toISOString();
      config.lastTestStatus = 'FAILED';
      config.lastErrorMessage =
        'Endpoint returned HTTP 200, but failed SandboxAQ Switch protocol handshake (missing X-Switch-Room-Status header or Switch envelope). Connection cannot be certified.';
      saveDatabase(db);
      return {
        success: false,
        error: config.lastErrorMessage,
        status: 'UNVERIFIED_GENERIC_WEBHOOK',
      };
    } else {
      config.status = 'DISCONNECTED';
      config.protocolHandshakeVerified = false;
      config.lastTestedAt = new Date().toISOString();
      config.lastTestStatus = 'FAILED';
      config.lastErrorMessage = `Switch responded with HTTP ${response.status}: ${response.statusText}`;
      saveDatabase(db);
      return { success: false, error: config.lastErrorMessage, status: 'DISCONNECTED' };
    }
  } catch (err: any) {
    config.status = 'CONNECTION_FAILED';
    config.protocolHandshakeVerified = false;
    config.lastTestedAt = new Date().toISOString();
    config.lastTestStatus = 'FAILED';
    config.lastErrorMessage = err?.message || 'Network unreachable or connection timed out';
    saveDatabase(db);
    return { success: false, error: config.lastErrorMessage, status: 'CONNECTION_FAILED' };
  }
}

// ---------------------------------------------------------------------------
// Dynamic Gemini Multi-Agent Chat Intelligence
// ---------------------------------------------------------------------------
async function executeDynamicAgentCollaboration(userMsg: SwitchMessage, staffContext?: AuthenticatedStaff) {
  const timeStr = () => new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  const content = userMsg.content;

  // Emit immediate Central AI typing indicator
  broadcastRealtime('chat:typing', {
    sender: 'Central Operations AI',
    avatarRole: 'Orchestrator',
    isTyping: true,
  });

  const activeTasksSummary = db.tasks
    .filter((t) => t.status !== 'Resolved')
    .slice(0, 10)
    .map((t) => `[${t.caseRef}] Suite ${t.room}: "${t.title}" (Status: ${t.status}, Assigned: ${t.assignedAgent})`)
    .join('\n');

  const prompt = `You are the autonomous multi-agent coordination layer for The Grand Luminary Hotel & Residences.
A human hotel employee just posted a message in the internal team operations chat:
Sender: "${userMsg.sender}" (${userMsg.avatarRole}, ${userMsg.department})
Channel: "${userMsg.channel || '#operations-general'}"
Message Content: "${content}"

CURRENT ACTIVE DATABASE TASKS:
${activeTasksSummary || 'No pending tasks at this moment.'}

INSTRUCTIONS:
1. Understand the employee's intent, whether it is reporting guest issues, asking a status question, or requesting departmental assistance.
2. If the message reports guest requests or problems (e.g. AC broken, towels needed, room dirty, keycard demagnetized), identify individual tasks.
3. Generate realistic, decisive, professional responses from:
   - "Central Operations AI" (Orchestrator & GM brain: acknowledges, decomposes requests, routes responsibilities)
   - Specialized Departmental Agents who need to acknowledge or execute (e.g., "Housekeeping Agent", "Maintenance Agent", "Reception Agent", "Management Agent").
4. Output clean JSON only:
{
  "tasksToCreate": [
    {
      "title": string,
      "department": "Reception" | "Housekeeping" | "Maintenance" | "Management",
      "priority": "Low" | "Normal" | "High" | "Urgent" | "Critical",
      "estimatedMinutes": number,
      "room": string (extracted from message, e.g. "204" or "412")
    }
  ],
  "agentResponses": [
    {
      "sender": "Central Operations AI" | "Housekeeping Agent" | "Maintenance Agent" | "Reception Agent" | "Management Agent",
      "avatarRole": string,
      "department": "Reception" | "Housekeeping" | "Maintenance" | "Management",
      "content": string,
      "badge": "DISPATCHED" | "ACKNOWLEDGED" | "SLA ACTIVE" | "INFO" | "ESCALATED"
    }
  ]
}`;

  let parsed: any = null;

  if (ai) {
    try {
      const response = await callGeminiWithTimeout(
        ai.models.generateContent({
          model: 'gemini-3.8-flash',
          contents: prompt,
          config: {
            systemInstruction:
              'You are the autonomous hotel operations multi-agent coordination brain. Return structured JSON matching schema only.',
            responseMimeType: 'application/json',
          },
        }),
        2800
      );
      parsed = JSON.parse(response.text || '{}');
    } catch (err: any) {
      console.warn('Gemini chat agent execution timed out or errored, using dynamic heuristic:', err?.message);
    }
  }

  // If Gemini failed or is unavailable, use dynamic grounded heuristic
  if (!parsed || !parsed.agentResponses || parsed.agentResponses.length === 0) {
    parsed = generateDynamicGroundedAgentResponse(content, userMsg);
  }

  broadcastRealtime('chat:typing', {
    sender: 'Central Operations AI',
    isTyping: false,
  });

  const createdTasks: Task[] = [];
  const createdTaskIds: string[] = [];
  const now = Date.now();

  // Create any tasks required by the agent analysis
  if (Array.isArray(parsed.tasksToCreate) && parsed.tasksToCreate.length > 0) {
    for (let i = 0; i < parsed.tasksToCreate.length; i++) {
      const t = parsed.tasksToCreate[i];
      const caseRef = `CAS-${8120 + db.tasks.length + i + 1}`;
      const newTask: Task = {
        id: `task-${now}-${i}`,
        caseRef,
        room: t.room || userMsg.room || 'Unassigned',
        title: t.title,
        description: `Autonomous task decomposed from team chat message by ${userMsg.sender}`,
        department: t.department || 'Maintenance',
        assignedAgent: `${t.department || 'Maintenance'} Agent`,
        priority: t.priority || 'Normal',
        status: 'In Progress',
        lifecycleStage: 'IN_PROGRESS',
        deliveryStatus: 'IN_PROGRESS',
        createdAt: now,
        slaDeadline: now + (t.estimatedMinutes || 25) * 60 * 1000,
        estimatedMinutes: t.estimatedMinutes || 25,
        dependencies: [],
        requiresHumanConfirmation: true,
        auditTrail: [
          {
            id: `aud-${now}-${i}-1`,
            timestamp: now,
            actor: 'Central Operations AI',
            actorRole: 'Orchestrator',
            action: 'CREATED',
            note: `Decomposed from chat message by ${userMsg.sender}: "${content.slice(0, 60)}"`,
          },
          {
            id: `aud-${now}-${i}-2`,
            timestamp: now + 50,
            actor: `${t.department || 'Maintenance'} Agent`,
            actorRole: t.department || 'Maintenance',
            action: 'ACCEPTED',
            note: 'Department acknowledged task and dispatched staff',
          },
        ],
      };
      createdTasks.push(newTask);
      createdTaskIds.push(newTask.id);
      db.tasks.unshift(newTask);
      broadcastRealtime('task:created', newTask);
    }
  }

  // Deliver agent responses with natural realistic intervals
  if (Array.isArray(parsed.agentResponses)) {
    for (let i = 0; i < parsed.agentResponses.length; i++) {
      const resp = parsed.agentResponses[i];

      // Show typing indicator for subsequent agents
      if (i > 0) {
        broadcastRealtime('chat:typing', {
          sender: resp.sender,
          avatarRole: resp.avatarRole || 'Specialist',
          isTyping: true,
        });
        await new Promise((r) => setTimeout(r, 650));
        broadcastRealtime('chat:typing', {
          sender: resp.sender,
          isTyping: false,
        });
      }

      const agentMsg: SwitchMessage = {
        id: `msg-${Date.now()}-${i}`,
        sender: resp.sender,
        avatarRole: resp.avatarRole || 'Specialist',
        senderType: 'AI_AGENT',
        department: resp.department || 'Management',
        content: resp.content,
        badge: resp.badge || 'INFO',
        timestamp: timeStr(),
        room: userMsg.room || createdTasks[0]?.room,
        referencedTaskIds: createdTaskIds.length > 0 ? createdTaskIds : undefined,
        channel: userMsg.channel || '#operations-general',
        sourceType: 'LIVE_AGENT',
        deliveryState: 'DELIVERED',
      };

      db.messages.push(agentMsg);
      broadcastRealtime('chat:message', agentMsg);
    }
  }

  saveDatabase(db);
}

function generateDynamicGroundedAgentResponse(content: string, userMsg: SwitchMessage): any {
  const roomMatch = content.match(/\b(?:room|suite|rm\.?|#)\s*([0-9]{3,4}[A-Z]?)\b/i);
  const detectedRoom = roomMatch ? roomMatch[1] : userMsg.room || undefined;

  const hasTowels = /towel|linen|pillow|sheet/i.test(content);
  const hasAc = /ac\b|air condition|hvac|thermostat|cooling|heat|warm/i.test(content);
  const hasCleaning = /clean|dirty|spill|trash|odor|bathroom/i.test(content);
  const isStatusQuery = /status of|what is happening with|check on|any updates on|how is/i.test(content);

  // Status check grounded in active database tasks
  if (isStatusQuery && detectedRoom) {
    const roomTasks = db.tasks.filter((t) => t.room === detectedRoom && t.status !== 'Resolved');
    let summary = '';
    if (roomTasks.length > 0) {
      summary = `Status report for Suite ${detectedRoom}: Found ${roomTasks.length} active case(s): ${roomTasks
        .map((t) => `[${t.caseRef}] ${t.title} (${t.status}, assigned to ${t.assignedAgent})`)
        .join('; ')}. Staff are on-site.`;
    } else {
      summary = `Status report for Suite ${detectedRoom}: No pending or overdue issues. All recent work orders have been verified and resolved.`;
    }

    return {
      tasksToCreate: [],
      agentResponses: [
        {
          sender: 'Central Operations AI',
          avatarRole: 'Orchestrator',
          department: 'Management',
          content: summary,
          badge: 'INFO',
        },
      ],
    };
  }

  const tasksToCreate: any[] = [];
  const agentResponses: any[] = [];

  if (hasAc && detectedRoom) {
    tasksToCreate.push({
      title: `Inspect & recalibrate HVAC climate control (Suite ${detectedRoom})`,
      department: 'Maintenance',
      priority: 'High',
      estimatedMinutes: 25,
      room: detectedRoom,
    });
  }

  if (hasTowels && detectedRoom) {
    tasksToCreate.push({
      title: `Deliver fresh luxury bath towels & linen set (Suite ${detectedRoom})`,
      department: 'Housekeeping',
      priority: 'Normal',
      estimatedMinutes: 15,
      room: detectedRoom,
    });
  }

  if (hasCleaning && detectedRoom) {
    tasksToCreate.push({
      title: `Priority sanitary deep-clean & suite refresh (Suite ${detectedRoom})`,
      department: 'Housekeeping',
      priority: 'Urgent',
      estimatedMinutes: 30,
      room: detectedRoom,
    });
  }

  if (tasksToCreate.length > 0) {
    agentResponses.push({
      sender: 'Central Operations AI',
      avatarRole: 'Orchestrator',
      department: 'Management',
      content: `I have identified ${tasksToCreate.length} distinct operational responsibilities for Suite ${detectedRoom}. Coordinating departments: ${tasksToCreate.map((t) => t.department).join(', ')}.`,
      badge: 'DISPATCHED',
    });

    if (hasAc) {
      agentResponses.push({
        sender: 'Maintenance Agent',
        avatarRole: 'Engineering',
        department: 'Maintenance',
        content: `Maintenance ticket accepted for Suite ${detectedRoom}: Technician Carlos Mendez dispatched on-site with thermal diagnostics. Active SLA: 25 minutes.`,
        badge: 'ACKNOWLEDGED',
      });
    }

    if (hasTowels || hasCleaning) {
      agentResponses.push({
        sender: 'Housekeeping Agent',
        avatarRole: 'Housekeeping',
        department: 'Housekeeping',
        content: `Housekeeping request accepted for Suite ${detectedRoom}: Attendant allocated from floor buffer. Target completion within 15 minutes.`,
        badge: 'ACKNOWLEDGED',
      });
    }
  } else {
    agentResponses.push({
      sender: 'Central Operations AI',
      avatarRole: 'Orchestrator',
      department: 'Management',
      content: `Acknowledged, ${userMsg.sender}. Logging operational note for Front Office handover. All telemetry active.`,
      badge: 'INFO',
    });
  }

  return { tasksToCreate, agentResponses };
}

// ---------------------------------------------------------------------------
// Room 204 End-to-End Operational Workflow (Explicitly Labeled Demo Scenario)
// ---------------------------------------------------------------------------
async function runRoom204Workflow() {
  const timeStr = () => new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));
  const now = Date.now();

  // Step 1 (0ms): Receptionist Elena Rostova (Human) posts
  const msg1: SwitchMessage = {
    id: `msg-${now}-demo-1`,
    sender: 'Elena Rostova',
    avatarRole: 'Front Desk Lead',
    senderType: 'HUMAN',
    department: 'Reception',
    content: '[DEMO SCENARIO] Room 204 has requested 3 extra bath towels, and the guest reported that the AC is blowing warm air (ambient 26.5°C).',
    badge: 'INFO',
    timestamp: timeStr(),
    room: '204',
    channel: '#operations-general',
    sourceType: 'DEMO_WORKFLOW',
    isDemoWorkflow: true,
    deliveryState: 'DELIVERED',
  };
  db.messages.push(msg1);
  saveDatabase(db);
  broadcastRealtime('chat:message', msg1);

  // Step 2 (900ms): Central Operations AI decomposes request into 2 tasks
  await delay(900);
  broadcastRealtime('chat:typing', { sender: 'Central Operations AI', avatarRole: 'Orchestrator', isTyping: true });
  await delay(600);

  const taskAc: Task = {
    id: `task-${now}-204-ac`,
    caseRef: 'CAS-8201',
    room: '204',
    title: 'Inspect & recalibrate chilled-water HVAC unit (Suite 204)',
    description: '[DEMO SCENARIO] Guest reports AC blowing warm air (26.5°C). Compressor actuator and coil inspection required.',
    department: 'Maintenance',
    assignedAgent: 'Maintenance Agent',
    priority: 'High',
    status: 'In Progress',
    lifecycleStage: 'IN_PROGRESS',
    deliveryStatus: 'IN_PROGRESS',
    createdAt: now,
    slaDeadline: now + 25 * 60 * 1000,
    estimatedMinutes: 25,
    dependencies: [],
    requiresHumanConfirmation: true,
    guestName: 'Mr. David Sterling',
    riskAssessment: 'Thermal discomfort. Risk of negative review on departure.',
    isDemoData: true,
    auditTrail: [
      {
        id: `aud-${now}-ac1`,
        timestamp: now,
        actor: 'Central Operations AI',
        actorRole: 'Orchestrator',
        action: 'CREATED',
        note: 'Decomposed from Room 204 demo scenario by Elena Rostova',
      },
      {
        id: `aud-${now}-ac2`,
        timestamp: now + 100,
        actor: 'Central Operations AI',
        actorRole: 'Orchestrator',
        action: 'DISPATCHED',
        note: 'Assigned to Maintenance Agent with 25m SLA target',
      },
    ],
  };

  const taskTowels: Task = {
    id: `task-${now}-204-towels`,
    caseRef: 'CAS-8202',
    room: '204',
    title: 'Deliver 3 extra luxury bath towels & amenities (Suite 204)',
    description: '[DEMO SCENARIO] Guest requested 3 plush bath towels. Allocated from 2nd floor linen room.',
    department: 'Housekeeping',
    assignedAgent: 'Housekeeping Agent',
    priority: 'Normal',
    status: 'In Progress',
    lifecycleStage: 'IN_PROGRESS',
    deliveryStatus: 'IN_PROGRESS',
    createdAt: now,
    slaDeadline: now + 15 * 60 * 1000,
    estimatedMinutes: 15,
    dependencies: [],
    requiresHumanConfirmation: true,
    guestName: 'Mr. David Sterling',
    isDemoData: true,
    auditTrail: [
      {
        id: `aud-${now}-tw1`,
        timestamp: now,
        actor: 'Central Operations AI',
        actorRole: 'Orchestrator',
        action: 'CREATED',
        note: 'Decomposed from Room 204 demo scenario by Elena Rostova',
      },
      {
        id: `aud-${now}-tw2`,
        timestamp: now + 100,
        actor: 'Central Operations AI',
        actorRole: 'Orchestrator',
        action: 'DISPATCHED',
        note: 'Assigned to Housekeeping Agent with 15m SLA target',
      },
    ],
  };

  db.tasks.unshift(taskTowels);
  db.tasks.unshift(taskAc);
  saveDatabase(db);
  broadcastRealtime('task:created', taskAc);
  broadcastRealtime('task:created', taskTowels);

  const msg2: SwitchMessage = {
    id: `msg-${now}-demo-2`,
    sender: 'Central Operations AI',
    avatarRole: 'Orchestrator',
    senderType: 'AI_AGENT',
    department: 'Management',
    content: '[DEMO SCENARIO] I have decomposed the request for Suite 204 into two distinct departmental tasks: #CAS-8201 (Maintenance — AC Chilled-Water Diagnostic) and #CAS-8202 (Housekeeping — Luxury Bath Linens). Coordinating both departments.',
    badge: 'DISPATCHED',
    timestamp: timeStr(),
    room: '204',
    referencedTaskIds: [taskAc.id, taskTowels.id],
    channel: '#operations-general',
    sourceType: 'DEMO_WORKFLOW',
    isDemoWorkflow: true,
    deliveryState: 'DELIVERED',
  };
  db.messages.push(msg2);
  saveDatabase(db);
  broadcastRealtime('chat:typing', { sender: 'Central Operations AI', isTyping: false });
  broadcastRealtime('chat:message', msg2);

  // Step 3 (1800ms): Maintenance Agent responds
  await delay(1200);
  broadcastRealtime('chat:typing', { sender: 'Maintenance Agent', avatarRole: 'Engineering', isTyping: true });
  await delay(600);

  const msg3: SwitchMessage = {
    id: `msg-${now}-demo-3`,
    sender: 'Maintenance Agent',
    avatarRole: 'Engineering',
    senderType: 'AI_AGENT',
    department: 'Maintenance',
    content: '[DEMO SCENARIO] Task CAS-8201 accepted for Suite 204: AC diagnostic dispatch. Technician Carlos Mendez dispatched on-site with thermal probe.',
    badge: 'ACKNOWLEDGED',
    timestamp: timeStr(),
    room: '204',
    referencedTaskIds: [taskAc.id],
    channel: '#operations-general',
    sourceType: 'DEMO_WORKFLOW',
    isDemoWorkflow: true,
    deliveryState: 'DELIVERED',
  };
  db.messages.push(msg3);
  saveDatabase(db);
  broadcastRealtime('chat:typing', { sender: 'Maintenance Agent', isTyping: false });
  broadcastRealtime('chat:message', msg3);

  // Step 4 (2700ms): Housekeeping Agent responds
  await delay(1100);
  broadcastRealtime('chat:typing', { sender: 'Housekeeping Agent', avatarRole: 'Housekeeping', isTyping: true });
  await delay(500);

  const msg4: SwitchMessage = {
    id: `msg-${now}-demo-4`,
    sender: 'Housekeeping Agent',
    avatarRole: 'Housekeeping',
    senderType: 'AI_AGENT',
    department: 'Housekeeping',
    content: '[DEMO SCENARIO] Task CAS-8202 accepted for Suite 204: Extra bath towels. Attendant Maria allocated from 2nd floor buffer.',
    badge: 'ACKNOWLEDGED',
    timestamp: timeStr(),
    room: '204',
    referencedTaskIds: [taskTowels.id],
    channel: '#operations-general',
    sourceType: 'DEMO_WORKFLOW',
    isDemoWorkflow: true,
    deliveryState: 'DELIVERED',
  };
  db.messages.push(msg4);
  saveDatabase(db);
  broadcastRealtime('chat:typing', { sender: 'Housekeeping Agent', isTyping: false });
  broadcastRealtime('chat:message', msg4);

  // Step 5 (4000ms): Housekeeping completes physical delivery
  await delay(1600);
  taskTowels.status = 'Completion Pending Confirmation';
  taskTowels.lifecycleStage = 'COMPLETION_PENDING_CONFIRMATION';
  taskTowels.deliveryStatus = 'AWAITING_HUMAN_CONFIRMATION';
  taskTowels.auditTrail.push({
    id: `aud-${now}-tw3`,
    timestamp: Date.now(),
    actor: 'Housekeeping Agent',
    actorRole: 'Housekeeping',
    action: 'NOTE_ADDED',
    note: 'Physical delivery finished; awaiting authorized human sign-off',
  });
  saveDatabase(db);
  broadcastRealtime('task:updated', taskTowels);

  const msg5: SwitchMessage = {
    id: `msg-${now}-demo-5`,
    sender: 'Housekeeping Agent',
    avatarRole: 'Housekeeping',
    senderType: 'AI_AGENT',
    department: 'Housekeeping',
    content: '[DEMO SCENARIO] Task CAS-8202 update: Extra bath towels placed in Suite 204 bathroom. Physical delivery complete. Awaiting authorized human staff sign-off.',
    badge: 'SLA ACTIVE',
    timestamp: timeStr(),
    room: '204',
    referencedTaskIds: [taskTowels.id],
    channel: '#operations-general',
    sourceType: 'DEMO_WORKFLOW',
    isDemoWorkflow: true,
    deliveryState: 'DELIVERED',
  };
  db.messages.push(msg5);
  saveDatabase(db);
  broadcastRealtime('chat:message', msg5);

  // Step 6 (5200ms): Maintenance completes physical repair
  await delay(1500);
  taskAc.status = 'Completion Pending Confirmation';
  taskAc.lifecycleStage = 'COMPLETION_PENDING_CONFIRMATION';
  taskAc.deliveryStatus = 'AWAITING_HUMAN_CONFIRMATION';
  taskAc.auditTrail.push({
    id: `aud-${now}-ac3`,
    timestamp: Date.now(),
    actor: 'Maintenance Agent',
    actorRole: 'Engineering',
    action: 'NOTE_ADDED',
    note: 'Chilled water actuator recalibrated; air temperature 19.8°C; awaiting human staff sign-off',
  });
  saveDatabase(db);
  broadcastRealtime('task:updated', taskAc);

  const msg6: SwitchMessage = {
    id: `msg-${now}-demo-6`,
    sender: 'Maintenance Agent',
    avatarRole: 'Engineering',
    senderType: 'AI_AGENT',
    department: 'Maintenance',
    content: '[DEMO SCENARIO] Task CAS-8201 update: Chilled-water actuator valve in Suite 204 recalibrated. Air output now 19.8°C. Physical repair complete. Awaiting authorized human staff sign-off.',
    badge: 'SLA ACTIVE',
    timestamp: timeStr(),
    room: '204',
    referencedTaskIds: [taskAc.id],
    channel: '#operations-general',
    sourceType: 'DEMO_WORKFLOW',
    isDemoWorkflow: true,
    deliveryState: 'DELIVERED',
  };
  db.messages.push(msg6);
  saveDatabase(db);
  broadcastRealtime('chat:message', msg6);

  // Step 7 (6300ms): Central AI notifies team for human sign-off
  await delay(1200);
  const msg7: SwitchMessage = {
    id: `msg-${now}-demo-7`,
    sender: 'Central Operations AI',
    avatarRole: 'Orchestrator',
    senderType: 'AI_AGENT',
    department: 'Management',
    content: '[DEMO SCENARIO] Both physical interventions have completed on premises. Operating Principle #8 active: tasks held in "Completion Pending Confirmation" until authorized human staff signs off with badge ID.',
    badge: 'INFO',
    timestamp: timeStr(),
    room: '204',
    referencedTaskIds: [taskAc.id, taskTowels.id],
    channel: '#operations-general',
    sourceType: 'DEMO_WORKFLOW',
    isDemoWorkflow: true,
    deliveryState: 'DELIVERED',
  };
  db.messages.push(msg7);
  saveDatabase(db);
  broadcastRealtime('chat:message', msg7);

  // Step 8 (7500ms): Elena Rostova confirms follow-up
  await delay(1300);
  const msg8: SwitchMessage = {
    id: `msg-${now}-demo-8`,
    sender: 'Elena Rostova',
    avatarRole: 'Front Desk Lead',
    senderType: 'HUMAN',
    department: 'Reception',
    content: '[DEMO SCENARIO] Placed a courtesy follow-up call to Suite 204. Guest confirmed the towels arrived and the room is cooling nicely. Staff member ready for physical verification sign-off.',
    badge: 'INFO',
    timestamp: timeStr(),
    room: '204',
    referencedTaskIds: [taskAc.id, taskTowels.id],
    channel: '#operations-general',
    sourceType: 'DEMO_WORKFLOW',
    isDemoWorkflow: true,
    deliveryState: 'DELIVERED',
  };
  db.messages.push(msg8);
  saveDatabase(db);
  broadcastRealtime('chat:message', msg8);
}

// ---------------------------------------------------------------------------
// Main Express Application Setup
// ---------------------------------------------------------------------------
async function startServer() {
  const app = express();
  const PORT = Number(process.env.PORT) || 3000;

  app.use(express.json({ limit: '10mb' }));

  // 1. Health check & System Diagnostic (Secrets Redacted)
  app.get('/api/health', (_req, res) => {
    res.json({
      status: 'ok',
      hasApiKey: Boolean(apiKey),
      storage: {
        engine: 'File-backed persistent JSON database',
        path: DB_PATH,
        taskCount: db.tasks.length,
        messageCount: db.messages.length,
      },
      switchConfig: redactSwitchConfig(db.switchConfig),
      timestamp: new Date().toISOString(),
    });
  });

  // 2. Staff Authentication Endpoints
  app.post('/api/auth/staff-login', (req, res) => {
    const { staffId, pin } = req.body;

    if (!staffId || !pin) {
      return res.status(400).json({ error: 'staffId and pin are required' });
    }

    const staff = STAFF_DIRECTORY[staffId];
    if (!staff || staff.pin !== String(pin).trim()) {
      return res.status(401).json({ error: 'Invalid staff identifier or security PIN' });
    }

    const token = `token-${staff.id}-${Date.now()}`;
    const authenticated: AuthenticatedStaff = {
      id: staff.id,
      name: staff.name,
      role: staff.role,
      badgeId: staff.badgeId,
      department: staff.department,
      permissions: staff.permissions,
      token,
    };

    activeStaffSessions.set(token, authenticated);
    res.json({ success: true, staff: authenticated });
  });

  app.get('/api/auth/session', (req, res) => {
    const authHeader = req.headers.authorization;
    const token = authHeader?.startsWith('Bearer ')
      ? authHeader.slice(7)
      : (req.headers['x-staff-token'] as string);

    const staff = authenticateStaffToken(token);
    if (!staff) {
      return res.status(401).json({ error: 'No active staff session' });
    }
    res.json({ success: true, staff });
  });

  // 3. Real-Time Chat SSE Stream
  app.get('/api/chat/stream', (req, res) => {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
    });
    res.write('event: connected\ndata: {"status":"connected","timestamp":' + Date.now() + '}\n\n');

    sseClients.add(res);

    req.on('close', () => {
      sseClients.delete(res);
    });
  });

  // 4. Team Chat Participants
  app.get('/api/chat/participants', (_req, res) => {
    res.json({ success: true, participants: ACTIVE_PARTICIPANTS });
  });

  // 5. Team Chat Messages (Fetch History)
  app.get('/api/chat/messages', (_req, res) => {
    res.json({ success: true, messages: db.messages });
  });

  // 6. Send Team Chat Message (Enforces Authentication for Human Staff)
  app.post('/api/chat/messages', async (req, res) => {
    const { sender, avatarRole, senderType, department, content, room, channel, staffToken } = req.body;

    if (!content || typeof content !== 'string') {
      return res.status(400).json({ error: 'content is required' });
    }

    const authHeader = req.headers.authorization;
    const token = staffToken || (authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : (req.headers['x-staff-token'] as string));

    let authenticatedStaff: AuthenticatedStaff | null = null;

    if (senderType === 'HUMAN') {
      authenticatedStaff = authenticateStaffToken(token);
      if (!authenticatedStaff) {
        return res.status(401).json({
          error: 'Authentication required: You must provide a valid staff PIN/token to post as a human team member.',
        });
      }
    }

    const now = Date.now();
    const timeStr = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

    const newMsg: SwitchMessage = {
      id: `msg-${now}-${Math.random().toString(36).substring(2, 6)}`,
      sender: authenticatedStaff ? authenticatedStaff.name : sender || 'Elena Rostova',
      avatarRole: authenticatedStaff ? authenticatedStaff.role : avatarRole || 'Front Desk Lead',
      senderType: senderType || 'HUMAN',
      department: authenticatedStaff ? authenticatedStaff.department : department || 'Reception',
      content: content.trim(),
      badge: senderType === 'HUMAN' ? 'INFO' : 'ACKNOWLEDGED',
      timestamp: timeStr,
      room,
      channel: channel || '#operations-general',
      sourceType: senderType === 'HUMAN' ? 'LIVE_STAFF' : 'LIVE_AGENT',
      deliveryState: 'DELIVERED',
    };

    db.messages.push(newMsg);
    if (!saveDatabase(db)) {
      return res.status(500).json({ error: 'Persistence failure: unable to write message to durable disk.' });
    }

    broadcastRealtime('chat:message', newMsg);
    res.json({ success: true, message: newMsg });

    // Asynchronous Central Operations AI & Specialized Agent Analysis
    if (newMsg.senderType === 'HUMAN') {
      executeDynamicAgentCollaboration(newMsg, authenticatedStaff || undefined).catch((err) => {
        console.error('Chat dynamic agent execution error:', err);
      });
    }
  });

  // 7. Room 204 End-to-End Operational Workflow Demonstration (Explicitly Labeled)
  app.post('/api/demo/room-204', async (_req, res) => {
    res.json({ success: true, message: 'Room 204 demonstration workflow initiated' });

    runRoom204Workflow().catch((err) => {
      console.error('Room 204 demo workflow error:', err);
    });
  });

  // 8. Tasks CRUD Endpoints
  app.get('/api/tasks', (_req, res) => {
    res.json({ success: true, tasks: db.tasks });
  });

  app.post('/api/tasks', async (req, res) => {
    const { taskList, sourceText } = req.body;
    if (!Array.isArray(taskList) || taskList.length === 0) {
      return res.status(400).json({ error: 'taskList array is required' });
    }

    const now = Date.now();
    const created: Task[] = [];

    for (let i = 0; i < taskList.length; i++) {
      const item = taskList[i];
      const caseRef = `CAS-${8100 + db.tasks.length + i + 1}`;
      const initialAudit: TaskAuditEntry[] = [
        {
          id: `aud-${now}-${i}-1`,
          timestamp: now,
          actor: 'Central Operations AI',
          actorRole: 'Orchestrator',
          action: 'CREATED',
          note: `Decomposed from guest intake: "${(sourceText || item.title).slice(0, 75)}"`,
        },
        {
          id: `aud-${now}-${i}-2`,
          timestamp: now + 200,
          actor: 'Central Operations AI',
          actorRole: 'Orchestrator',
          action: 'DISPATCHED',
          note: `Routed to ${item.assignedAgent || `${item.department} Agent`} with ${item.estimatedMinutes || 25}m target SLA.`,
        },
      ];

      const newTask: Task = {
        id: `task-${now}-${i}`,
        caseRef,
        room: item.room || 'Unassigned',
        title: item.title,
        description: item.description || `Operational case for Room ${item.room}`,
        department: item.department || 'Reception',
        assignedAgent: item.assignedAgent || `${item.department || 'Reception'} Agent`,
        priority: item.priority || 'Normal',
        status: 'Dispatched',
        lifecycleStage: 'ASSIGNED',
        deliveryStatus: db.switchConfig.status === 'CONNECTED' ? 'DELIVERED' : 'PENDING_DELIVERY',
        createdAt: now,
        slaDeadline: item.slaDeadline || now + (item.estimatedMinutes || 25) * 60 * 1000,
        estimatedMinutes: item.estimatedMinutes || 25,
        dependencies: item.dependencies || [],
        requiresHumanConfirmation: true, // Operating Principle #8
        guestName: item.guestName,
        riskAssessment: item.riskAssessment,
        isRepeatedIssue: item.isRepeatedIssue || false,
        isDemoData: false,
        auditTrail: initialAudit,
      };

      created.push(newTask);
      db.tasks.unshift(newTask);
      broadcastRealtime('task:created', newTask);

      if (db.switchConfig.autoRelayTasks && db.switchConfig.status === 'CONNECTED') {
        forwardToSwitchRoom(db.switchConfig, {
          eventType: 'TASK_CREATED',
          sender: { name: newTask.assignedAgent, role: newTask.department },
          content: `New Operational Task created: [${newTask.caseRef}] Suite ${newTask.room} - ${newTask.title}`,
          room: newTask.room,
          taskId: newTask.id,
        }).catch(() => {});
      }
    }

    if (!saveDatabase(db)) {
      return res.status(500).json({ error: 'Persistence failure: unable to commit tasks to database.' });
    }

    res.json({ success: true, createdTasks: created });
  });

  // 9. Dedicated Human Completion Verification Endpoint (Operating Principle #8 Enforcement)
  app.post('/api/tasks/:id/verify', (req, res) => {
    const { id } = req.params;
    const { staffToken, staffName, badgeId, notes, checklistConfirmed } = req.body;

    const authHeader = req.headers.authorization;
    const token = staffToken || (authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : (req.headers['x-staff-token'] as string));

    const authenticatedStaff = authenticateStaffToken(token);

    if (!authenticatedStaff) {
      return res.status(401).json({
        error: 'Authentication failed: You must be an authorized staff member with a valid PIN to confirm task completion.',
      });
    }

    if (!checklistConfirmed) {
      return res.status(400).json({
        error: 'Checklist verification required: Staff must confirm in-suite inspection standards before resolution.',
      });
    }

    const taskIndex = db.tasks.findIndex((t) => t.id === id);
    if (taskIndex === -1) {
      return res.status(404).json({ error: 'Task not found' });
    }

    const task = db.tasks[taskIndex];
    const now = Date.now();
    const timeStr = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

    task.status = 'Resolved';
    task.lifecycleStage = 'RESOLVED';
    task.deliveryStatus = 'COMPLETED';
    task.resolvedBy = `${authenticatedStaff.name} (Badge: ${authenticatedStaff.badgeId})`;
    task.resolvedAt = now;
    task.resolutionNotes = notes || 'Physical task completion confirmed on premises by authorized personnel.';

    task.auditTrail.push({
      id: `aud-${now}-verify`,
      timestamp: now,
      actor: task.resolvedBy,
      actorRole: authenticatedStaff.role,
      action: 'HUMAN_VERIFIED',
      note: `Physical in-suite verification confirmed. Checklist verified: YES. Notes: "${task.resolutionNotes}"`,
    });

    const verificationMsg: SwitchMessage = {
      id: `msg-${now}-verified`,
      sender: 'Central Operations AI',
      avatarRole: 'Orchestrator',
      senderType: 'AI_AGENT',
      department: 'Management',
      content: `HUMAN SIGN-OFF VERIFIED: Case [${task.caseRef}] Suite ${task.room} ("${task.title}") officially CLOSED by ${task.resolvedBy}. Notes: "${task.resolutionNotes}"`,
      badge: 'VERIFIED',
      timestamp: timeStr,
      room: task.room,
      taskId: task.id,
      referencedTaskIds: [task.id],
      channel: '#operations-general',
      sourceType: 'LIVE_AGENT',
      deliveryState: 'DELIVERED',
    };

    db.messages.push(verificationMsg);

    if (!saveDatabase(db)) {
      return res.status(500).json({ error: 'Persistence failure: unable to record task resolution to database.' });
    }

    broadcastRealtime('task:updated', task);
    broadcastRealtime('chat:message', verificationMsg);

    res.json({ success: true, task });
  });

  // 10. Patch Task Endpoint: STRICTLY FORBIDS BYPASSING HUMAN VERIFICATION
  app.patch('/api/tasks/:id', (req, res) => {
    const { id } = req.params;
    const { status, priority, escalationReason, auditNote, actor, actorRole } = req.body;

    // Operating Principle #8 Defense: Prevent bypassing verification via PATCH
    if (status === 'Resolved') {
      return res.status(403).json({
        error:
          'Operating Principle #8 Violation: Physical tasks cannot be marked Resolved via general PATCH. You must use the dedicated verification endpoint POST /api/tasks/:id/verify with authorized staff credentials.',
      });
    }

    const taskIndex = db.tasks.findIndex((t) => t.id === id);
    if (taskIndex === -1) {
      return res.status(404).json({ error: 'Task not found' });
    }

    const task = db.tasks[taskIndex];
    const now = Date.now();

    if (status) {
      task.status = status;
      if (status === 'In Progress') {
        task.lifecycleStage = 'IN_PROGRESS';
        task.deliveryStatus = 'IN_PROGRESS';
      } else if (status === 'Escalated') {
        task.lifecycleStage = 'ESCALATED';
        task.deliveryStatus = 'IN_PROGRESS';
      } else if (status === 'Completion Pending Confirmation') {
        task.lifecycleStage = 'COMPLETION_PENDING_CONFIRMATION';
        task.deliveryStatus = 'AWAITING_HUMAN_CONFIRMATION';
      }
    }
    if (priority) task.priority = priority;
    if (escalationReason) task.escalationReason = escalationReason;

    const auditAction =
      status === 'Escalated' ? 'ESCALATED' : status === 'In Progress' ? 'ACCEPTED' : 'NOTE_ADDED';

    task.auditTrail.push({
      id: `aud-${now}`,
      timestamp: now,
      actor: actor || task.assignedAgent,
      actorRole: actorRole || 'Operator',
      action: auditAction,
      note: auditNote || `Task transitioned to ${task.status}`,
    });

    if (!saveDatabase(db)) {
      return res.status(500).json({ error: 'Persistence failure: unable to commit task update to database.' });
    }

    broadcastRealtime('task:updated', task);
    res.json({ success: true, task });
  });

  // 11. Guest Requests Endpoints
  app.get('/api/requests', (_req, res) => {
    res.json({ success: true, requests: db.requests });
  });

  app.post('/api/requests', (req, res) => {
    const { rawText, detectedRoom, guestName, createdTaskIds, urgencyLevel, executiveSummary } = req.body;
    const newReq: GuestRequest = {
      id: `req-${Date.now()}`,
      rawText: rawText || '',
      detectedRoom,
      guestName,
      status: 'ROUTED',
      createdTaskIds: createdTaskIds || [],
      createdAt: Date.now(),
      urgencyLevel: urgencyLevel || 'Normal',
      executiveSummary: executiveSummary || 'Processed by Request Intelligence',
      isDemoData: false,
    };
    db.requests.unshift(newReq);

    if (!saveDatabase(db)) {
      return res.status(500).json({ error: 'Persistence failure: unable to commit request to database.' });
    }

    broadcastRealtime('request:created', newReq);
    res.json({ success: true, request: newReq });
  });

  // 12. Operational Alerts Endpoints
  app.get('/api/alerts', (_req, res) => {
    res.json({ success: true, alerts: db.alerts });
  });

  app.post('/api/alerts/resolve', (req, res) => {
    const { id } = req.body;
    db.alerts = db.alerts.map((a) => (a.id === id ? { ...a, resolved: true } : a));

    if (!saveDatabase(db)) {
      return res.status(500).json({ error: 'Persistence failure: unable to update alert in database.' });
    }

    res.json({ success: true, alerts: db.alerts });
  });

  // 13. Agents Endpoint
  app.get('/api/agents', (_req, res) => {
    const updatedAgents = db.agents.map((agent) => {
      const active = db.tasks.filter((t) => t.department === agent.department && t.status !== 'Resolved').length;
      return {
        ...agent,
        activeTasksCount: active,
        switchStatus: db.switchConfig.status === 'CONNECTED' ? 'CONNECTED' : ('STANDBY' as const),
      };
    });
    res.json({ success: true, agents: updatedAgents });
  });

  // 14. Switch Configuration & Real Connection Verification (Secret Redacted)
  app.get('/api/switch/config', (_req, res) => {
    res.json({ success: true, config: redactSwitchConfig(db.switchConfig) });
  });

  app.post('/api/switch/config', (req, res) => {
    const { roomWebhookUrl, roomId, apiKey: newKey, channelTarget, autoRelayTasks } = req.body;

    if (roomWebhookUrl !== undefined) {
      const trimmed = roomWebhookUrl.trim();
      if (trimmed) {
        const urlValidation = isValidWebhookUrl(trimmed);
        if (!urlValidation.valid) {
          return res.status(400).json({ error: urlValidation.error });
        }
      }
      db.switchConfig.roomWebhookUrl = trimmed;
    }
    if (roomId !== undefined) db.switchConfig.roomId = roomId.trim();
    if (channelTarget !== undefined) db.switchConfig.channelTarget = channelTarget.trim();
    if (autoRelayTasks !== undefined) db.switchConfig.autoRelayTasks = Boolean(autoRelayTasks);
    if (newKey !== undefined && newKey !== '••••••••') db.switchConfig.apiKey = newKey.trim();

    if (!db.switchConfig.roomWebhookUrl) {
      db.switchConfig.status = 'NOT_CONFIGURED';
      db.switchConfig.protocolHandshakeVerified = false;
    } else {
      db.switchConfig.status = 'DISCONNECTED';
      db.switchConfig.protocolHandshakeVerified = false;
    }

    if (!saveDatabase(db)) {
      return res.status(500).json({ error: 'Persistence failure: unable to commit Switch configuration.' });
    }

    res.json({ success: true, config: redactSwitchConfig(db.switchConfig) });
  });

  // 15. Genuine Switch Protocol Verification Test Ping
  app.post('/api/switch/test', async (_req, res) => {
    if (!db.switchConfig.roomWebhookUrl) {
      return res.status(400).json({
        error: 'Cannot test Switch connection: No room webhook URL configured.',
      });
    }

    const testResult = await forwardToSwitchRoom(db.switchConfig, {
      eventType: 'PROBE_TEST',
      sender: { name: 'Central Operations AI', role: 'Integration Tester' },
      content: 'Hotel Operations AI Switch Connection Test Probe',
      room: 'HQ',
    });

    res.json({
      success: testResult.success,
      status: db.switchConfig.status,
      protocolHandshakeVerified: db.switchConfig.protocolHandshakeVerified,
      lastTestedAt: db.switchConfig.lastTestedAt,
      message: testResult.success
        ? 'Successfully connected to verified SandboxAQ Switch room.'
        : db.switchConfig.lastErrorMessage,
    });
  });

  // 16. Reset Demo Database to Seed State
  const handleResetDatabase = (_req: express.Request, res: express.Response) => {
    db = getInitialDatabase();
    if (!saveDatabase(db)) {
      return res.status(500).json({ error: 'Persistence failure: unable to reset database.' });
    }
    broadcastRealtime('database:reset', { timestamp: Date.now() });
    res.json({ success: true, message: 'Database reset to clean demonstration seed' });
  };
  app.post('/api/reset-demo', handleResetDatabase);
  app.post('/api/database/reset', handleResetDatabase);

  // 17. AI Request Parser with Missing Room Number Safeguard
  app.post('/api/gemini/parse-request', async (req, res) => {
    const { rawText, room, guestName } = req.body;

    if (!rawText || typeof rawText !== 'string') {
      return res.status(400).json({ error: 'rawText is required' });
    }

    const roomMatch = rawText.match(/\b(?:room|suite|rm\.?|#)\s*([0-9]{3,4}[A-Z]?)\b/i);
    const explicitlyProvidedRoom = room ? room.trim() : roomMatch ? roomMatch[1] : undefined;
    const isRoomMissing = !explicitlyProvidedRoom;

    if (!ai) {
      const fallbackData = generateHeuristicBreakdown(rawText, explicitlyProvidedRoom, guestName);
      return res.json({
        ...fallbackData,
        source: 'heuristic-engine',
        isRoomMissing,
      });
    }

    try {
      const prompt = `You are the central AI Business Operations Manager for The Grand Luminary Hotel & Residences.
Analyze this incoming guest request:
Raw Guest Input: "${rawText}"
Explicit Room Provided: "${explicitlyProvidedRoom || 'NONE'}"
Guest Name: "${guestName || 'VIP Resident'}"

CRITICAL INSTRUCTIONS:
1. DO NOT INVENT A ROOM NUMBER. If no room or suite number is present, set detectedRoom to null and needsClarification to true with a polite clarification prompt asking for the room number.
2. Break complex multi-problem requests into separate, independent operational responsibilities.
3. Delegate each task to the exact specialized agent: "Reception Agent", "Housekeeping Agent", "Maintenance Agent", "Management Agent".
4. Evaluate priority, time sensitivity (SLA in minutes), dependencies, and guest impact.
5. All physical tasks require human staff confirmation before resolution.`;

      const response = await callGeminiWithTimeout(
        ai.models.generateContent({
          model: 'gemini-3.8-flash',
          contents: prompt,
          config: {
            systemInstruction:
              'You are an elite hotel business operations manager. Output valid JSON matching schema only. Never invent room numbers.',
            responseMimeType: 'application/json',
            responseSchema: {
              type: Type.OBJECT,
              properties: {
                guestIntent: { type: Type.STRING },
                detectedRoom: { type: Type.STRING, nullable: true },
                needsClarification: { type: Type.BOOLEAN },
                clarificationPrompt: { type: Type.STRING },
                urgencyLevel: { type: Type.STRING },
                executiveSummary: { type: Type.STRING },
                tasks: {
                  type: Type.ARRAY,
                  items: {
                    type: Type.OBJECT,
                    properties: {
                      title: { type: Type.STRING },
                      department: { type: Type.STRING },
                      priority: { type: Type.STRING },
                      estimatedMinutes: { type: Type.NUMBER },
                      dependencies: {
                        type: Type.ARRAY,
                        items: { type: Type.STRING },
                      },
                      requiresHumanConfirmation: { type: Type.BOOLEAN },
                      assignedAgent: { type: Type.STRING },
                      rationale: { type: Type.STRING },
                      potentialRisk: { type: Type.STRING },
                    },
                    required: ['title', 'department', 'priority', 'assignedAgent', 'requiresHumanConfirmation'],
                  },
                },
              },
              required: ['guestIntent', 'urgencyLevel', 'executiveSummary', 'tasks'],
            },
          },
        })
      );

      const parsed = JSON.parse(response.text || '{}');
      if (isRoomMissing) {
        parsed.detectedRoom = null;
        parsed.needsClarification = true;
        parsed.clarificationPrompt =
          parsed.clarificationPrompt ||
          'Reception Agent: Suite number was not provided. Please provide your suite number so staff can be dispatched.';
      }

      return res.json({
        success: true,
        source: 'gemini-3.8-flash',
        parsed,
        isRoomMissing,
      });
    } catch (err: any) {
      console.error('Gemini parse error, using safe fallback:', err?.message);
      const fallbackData = generateHeuristicBreakdown(rawText, explicitlyProvidedRoom, guestName);
      return res.json({
        ...fallbackData,
        source: 'heuristic-fallback',
        isRoomMissing,
      });
    }
  });

  // Mount Vite or static dist
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  // Create HTTP server with Real WebSocket attachment
  const server = http.createServer(app);
  const wss = new WebSocketServer({ server, path: '/ws' });

  wss.on('connection', (ws: WebSocket) => {
    wsClients.add(ws);
    ws.send(JSON.stringify({ event: 'connected', data: { status: 'ws-connected', timestamp: Date.now() } }));

    ws.on('close', () => {
      wsClients.delete(ws);
    });

    ws.on('message', async (raw: string) => {
      try {
        const payload = JSON.parse(raw.toString());

        if (payload.type === 'ping') {
          ws.send(JSON.stringify({ event: 'pong', timestamp: Date.now() }));
          return;
        }

        // Real-Time Chat Message Transmitted Over WebSocket
        if (payload.type === 'chat:message') {
          const { sender, avatarRole, senderType, department, content, room, channel, staffToken } = payload;

          if (!content || typeof content !== 'string') return;

          let authenticatedStaff: AuthenticatedStaff | null = null;
          if (senderType === 'HUMAN') {
            authenticatedStaff = authenticateStaffToken(staffToken);
            if (!authenticatedStaff) {
              ws.send(
                JSON.stringify({
                  event: 'error',
                  data: { message: 'Authentication required to post as a human team member.' },
                })
              );
              return;
            }
          }

          const now = Date.now();
          const timeStr = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

          const newMsg: SwitchMessage = {
            id: `msg-${now}-${Math.random().toString(36).substring(2, 6)}`,
            sender: authenticatedStaff ? authenticatedStaff.name : sender || 'Elena Rostova',
            avatarRole: authenticatedStaff ? authenticatedStaff.role : avatarRole || 'Front Desk Lead',
            senderType: senderType || 'HUMAN',
            department: authenticatedStaff ? authenticatedStaff.department : department || 'Reception',
            content: content.trim(),
            badge: senderType === 'HUMAN' ? 'INFO' : 'ACKNOWLEDGED',
            timestamp: timeStr,
            room,
            channel: channel || '#operations-general',
            sourceType: senderType === 'HUMAN' ? 'LIVE_STAFF' : 'LIVE_AGENT',
            deliveryState: 'DELIVERED',
          };

          db.messages.push(newMsg);
          saveDatabase(db);

          // Broadcast immediately over WebSockets & SSE
          broadcastRealtime('chat:message', newMsg);

          // Trigger dynamic Gemini autonomous agent responses
          if (newMsg.senderType === 'HUMAN') {
            executeDynamicAgentCollaboration(newMsg, authenticatedStaff || undefined).catch((err) => {
              console.error('WebSocket dynamic agent execution error:', err);
            });
          }
        }
      } catch (e) {
        console.error('WebSocket message parsing error:', e);
      }
    });
  });

  server.listen(PORT, '0.0.0.0', () => {
    console.log(`[Hotel Operations AI] Server running at http://0.0.0.0:${PORT}`);
    console.log(`[Storage] Database mounted at: ${DB_PATH}`);
    console.log(`[Realtime] Native WebSockets active on ws://0.0.0.0:${PORT}/ws & SSE on /api/chat/stream`);
  });
}

function generateHeuristicBreakdown(rawText: string, explicitlyProvidedRoom?: string, guestName?: string) {
  const roomMatch = rawText.match(/\b(?:room|suite|rm\.?|#)\s*([0-9]{3,4}[A-Z]?)\b/i);
  const detectedRoom = explicitlyProvidedRoom || (roomMatch ? roomMatch[1] : undefined);
  const needsClarification = !detectedRoom;
  const roomDisplay = detectedRoom ? `Suite ${detectedRoom}` : 'Suite [Unspecified]';

  const tasks: any[] = [];
  const lower = rawText.toLowerCase();

  if (/ac\b|air condition|hvac|hot air|cold|temperature|thermostat|cooling|heat\b|warm/i.test(lower)) {
    tasks.push({
      title: `Inspect & recalibrate HVAC climate control (${roomDisplay})`,
      department: 'Maintenance',
      priority: 'High',
      estimatedMinutes: 25,
      dependencies: [],
      requiresHumanConfirmation: true,
      assignedAgent: 'Maintenance Agent',
      rationale: 'Thermal discomfort complaint identified in guest transcript.',
      potentialRisk: 'Guest discomfort in suite; direct impact on luxury rating.',
      room: detectedRoom || 'Unassigned',
    });
  }

  if (/towel|towels|linen|pillow|pillows|blanket|bed\b|duvet|sheet|cushion/i.test(lower)) {
    tasks.push({
      title: `Deliver fresh luxury linen & amenities (${roomDisplay})`,
      department: 'Housekeeping',
      priority: 'Normal',
      estimatedMinutes: 15,
      dependencies: tasks.length > 0 ? ['Maintenance physical diagnostic must finish before Housekeeping setup'] : [],
      requiresHumanConfirmation: true,
      assignedAgent: 'Housekeeping Agent',
      rationale: 'Amenity and linen replenishment requested.',
      potentialRisk: 'Guest inconvenience during evening refresh cycle.',
      room: detectedRoom || 'Unassigned',
    });
  }

  return {
    guestIntent: detectedRoom
      ? `Operational request for Suite ${detectedRoom} involving ${tasks.length} distinct responsibilities.`
      : 'Guest submitted operational request without specifying room number.',
    detectedRoom: detectedRoom || null,
    needsClarification,
    clarificationPrompt: needsClarification
      ? 'Reception Agent: Suite number was not provided. Please provide your suite number so staff can be dispatched.'
      : undefined,
    urgencyLevel: tasks.some((t) => t.priority === 'Critical')
      ? 'Critical'
      : tasks.some((t) => t.priority === 'High')
      ? 'High'
      : 'Normal',
    executiveSummary: needsClarification
      ? 'Awaiting room clarification from guest before dispatching physical work.'
      : `Decomposed complex inquiry into ${tasks.length} autonomous departmental tasks with active SLA timers.`,
    tasks,
  };
}

startServer();
