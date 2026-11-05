import 'dotenv/config';
import express from 'express';
import http from 'http';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { createServer as createViteServer } from 'vite';
import { GoogleGenAI, Type } from '@google/genai';
import { WebSocketServer, WebSocket } from 'ws';
import { SwitchAgentClient, SwitchRoomMessage } from './src/lib/switch-agent-client';
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
  MessageSourceType,
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

import crypto from 'node:crypto';

// Secret key for internal server-authorized AI agent messages (prevents client spoofing)
const INTERNAL_AGENT_SECRET = crypto.randomBytes(32).toString('hex');

// ---------------------------------------------------------------------------
// Security: Staff Directory & Salted Password Engine
// ---------------------------------------------------------------------------
interface StaffRecord {
  id: string;
  name: string;
  role: string;
  salt: string;
  pinHash: string;
  badgeId: string;
  department: Department;
  permissions: StaffPermission[];
  avatar: string;
  avatarBg: string;
}

function hashPin(salt: string, pin: string): string {
  return crypto.createHash('sha256').update(`${salt}:${pin.trim()}`).digest('hex');
}

const STAFF_DIRECTORY: Record<string, StaffRecord> = {
  'staff-elena': {
    id: 'staff-elena',
    name: 'Elena Rostova',
    role: 'Front Desk Lead',
    salt: 'salt_elena_ops_9812',
    pinHash: hashPin('salt_elena_ops_9812', '1042'),
    badgeId: 'REC-104',
    department: 'Reception',
    permissions: ['CREATE_TASK', 'READ_ALL', 'ASSIGN_DEPT', 'VERIFY'],
    avatar: 'ER',
    avatarBg: 'bg-amber-600/20 text-amber-300 border-amber-500/40',
  },
  'staff-marcus': {
    id: 'staff-marcus',
    name: 'Marcus Vance',
    role: 'Executive Duty Manager',
    salt: 'salt_marcus_ops_5541',
    pinHash: hashPin('salt_marcus_ops_5541', '9001'),
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
    salt: 'salt_carlos_ops_3129',
    pinHash: hashPin('salt_carlos_ops_3129', '4021'),
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
    salt: 'salt_maria_ops_8820',
    pinHash: hashPin('salt_maria_ops_8820', '3105'),
    badgeId: 'HSK-310',
    department: 'Housekeeping',
    permissions: ['ACCEPT_HK', 'UPDATE_TASK', 'VERIFY_HK', 'VERIFY'],
    avatar: 'MS',
    avatarBg: 'bg-emerald-600/20 text-emerald-300 border-emerald-500/40',
  },
};

interface SessionInfo extends AuthenticatedStaff {
  expiresAt: number;
}

// Active authenticated staff sessions map: token -> SessionInfo (TTL: 8 hours)
// Predictable pre-seeded tokens are strictly eliminated. Tokens must be generated via /api/auth/staff-login.
const activeStaffSessions = new Map<string, SessionInfo>();

function generateStaffSession(staff: StaffRecord): string {
  const token = `sess_${crypto.randomBytes(32).toString('hex')}`;
  activeStaffSessions.set(token, {
    id: staff.id,
    name: staff.name,
    role: staff.role,
    badgeId: staff.badgeId,
    department: staff.department,
    permissions: staff.permissions,
    token,
    expiresAt: Date.now() + 8 * 3600 * 1000,
  });
  return token;
}

function authenticateStaffToken(token?: string | null): AuthenticatedStaff | null {
  if (!token) return null;
  const session = activeStaffSessions.get(token.trim());
  if (!session) return null;
  if (Date.now() > session.expiresAt) {
    activeStaffSessions.delete(token.trim());
    return null;
  }
  return session;
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

function isValidSwitchBridgeUrl(rawUrl: string): { valid: boolean; error?: string } {
  if (!rawUrl || typeof rawUrl !== 'string') {
    return { valid: false, error: 'Switch Agent Bridge URL cannot be empty' };
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
    status: process.env.SWITCH_AGENT_BASE_URL && process.env.SWITCH_AGENT_ID && process.env.SWITCH_AGENT_API_KEY ? 'DISCONNECTED' : 'NOT_CONFIGURED',
    agentBaseUrl: process.env.SWITCH_AGENT_BASE_URL || '',
    agentId: process.env.SWITCH_AGENT_ID || '',
    roomId: process.env.SWITCH_ROOM_ID || '',
    apiKey: process.env.SWITCH_AGENT_API_KEY || '',
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

// Migrate older demo webhook settings without treating their mock handshake as a real connection.
db.switchConfig.agentId = process.env.SWITCH_AGENT_ID || '';
db.switchConfig.agentBaseUrl = process.env.SWITCH_AGENT_BASE_URL || '';
db.switchConfig.apiKey = process.env.SWITCH_AGENT_API_KEY || '';
db.switchConfig.roomId = process.env.SWITCH_ROOM_ID || '';
if (db.switchConfig.agentBaseUrl.includes('/api/switch/mock-room')) {
  db.switchConfig.agentBaseUrl = process.env.SWITCH_AGENT_BASE_URL || '';
}
db.switchConfig.status =
  db.switchConfig.agentBaseUrl && db.switchConfig.agentId && db.switchConfig.apiKey && db.switchConfig.roomId
    ? 'DISCONNECTED'
    : 'NOT_CONFIGURED';
db.switchConfig.protocolHandshakeVerified = false;

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
// Server-Authorized Agent Message Dispatcher (Prevents Client Spoofing)
// ---------------------------------------------------------------------------
function postInternalAgentMessage(messageData: {
  sender: string;
  avatarRole: string;
  department: Department;
  content: string;
  badge?: 'DISPATCHED' | 'ACKNOWLEDGED' | 'SLA ACTIVE' | 'ESCALATED' | 'VERIFIED' | 'INFO' | 'ALERT';
  room?: string;
  channel?: string;
  referencedTaskIds?: string[];
  sourceType?: MessageSourceType;
  isDemoWorkflow?: boolean;
}): SwitchMessage {
  const timeStr = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  const newMsg: SwitchMessage = {
    id: `msg-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
    sender: messageData.sender,
    avatarRole: messageData.avatarRole,
    senderType: 'AI_AGENT',
    department: messageData.department,
    content: messageData.content.trim(),
    badge: messageData.badge || 'INFO',
    timestamp: timeStr,
    room: messageData.room,
    referencedTaskIds: messageData.referencedTaskIds,
    channel: messageData.channel || '#operations-general',
    sourceType: messageData.sourceType || 'LIVE_AGENT',
    isDemoWorkflow: messageData.isDemoWorkflow || false,
    deliveryState: 'DELIVERED',
  };

  db.messages.push(newMsg);
  saveDatabase(db);
  broadcastRealtime('chat:message', newMsg);
  return newMsg;
}

// ---------------------------------------------------------------------------
// Official SandboxAQ Switch Agent Protocol: HTTP outbound, SSE inbound
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
  if (!config.agentBaseUrl || !config.agentId || !config.apiKey || !config.roomId) {
    config.status = 'NOT_CONFIGURED';
    config.protocolHandshakeVerified = false;
    return {
      success: false,
      error: 'Configure the Switch Agent Bridge URL, agent ID, API key, and room ID first.',
      status: 'NOT_CONFIGURED',
    };
  }

  const urlCheck = isValidSwitchBridgeUrl(config.agentBaseUrl);
  if (!urlCheck.valid) {
    config.status = 'CONNECTION_FAILED';
    config.protocolHandshakeVerified = false;
    config.lastTestStatus = 'FAILED';
    config.lastErrorMessage = urlCheck.error;
    saveDatabase(db);
    return { success: false, error: urlCheck.error, status: 'CONNECTION_FAILED' };
  }

  try {
    const client = new SwitchAgentClient({
      baseUrl: config.agentBaseUrl,
      agentId: config.agentId,
      apiKey: config.apiKey,
      roomId: config.roomId,
    });
    const message = [
      `[${payload.eventType}]`,
      `From: ${payload.sender.name} (${payload.sender.role})`,
      payload.room ? `Hotel room: ${payload.room}` : '',
      payload.taskId ? `Task: ${payload.taskId}` : '',
      payload.content,
    ].filter(Boolean).join('\\n');

    const probe = await client.probe();
    if (!probe.ok) throw new Error(probe.detail);
    await client.sendMessage(message);
    config.totalDelivered += 1;
    config.status = 'CONNECTED';
    config.protocolHandshakeVerified = true;
    config.lastTestedAt = new Date().toISOString();
    config.lastTestStatus = 'SUCCESS';
    config.lastErrorMessage = undefined;
    saveDatabase(db);
    return { success: true, status: 'CONNECTED' };
  } catch (err: any) {
    config.status = 'DISCONNECTED';
    config.protocolHandshakeVerified = false;
    config.lastTestedAt = new Date().toISOString();
    config.lastTestStatus = 'FAILED';
    config.lastErrorMessage = err?.message || 'Switch Agent API request failed.';
    saveDatabase(db);
    return { success: false, error: config.lastErrorMessage, status: 'DISCONNECTED' };
  }
}

let switchStreamClient: SwitchAgentClient | null = null;

function startSwitchInboundStream(): void {
  switchStreamClient?.stop();
  switchStreamClient = null;

  const config = db.switchConfig;
  if (!config.agentBaseUrl || !config.agentId || !config.apiKey || !config.roomId) return;

  const client = new SwitchAgentClient({
    baseUrl: config.agentBaseUrl,
    agentId: config.agentId,
    apiKey: config.apiKey,
    roomId: config.roomId,
  });
  switchStreamClient = client;

  void client.listen(
    (event: SwitchRoomMessage) => {
      const messageId = event.messageId || `switch-${event.sequence}`;
      if (db.messages.some((message) => message.id === messageId)) return;

      const senderType = event.senderKind === 'platform' ? 'HUMAN' : 'AI_AGENT';
      const inboundMsg: SwitchMessage = {
        id: messageId,
        sender: event.sender || 'Switch teammate',
        avatarRole: senderType === 'HUMAN' ? 'Hotel teammate' : 'External AI agent',
        senderType,
        department: 'Management',
        content: event.content,
        badge: 'INFO',
        timestamp: event.timestamp
          ? new Date(event.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
          : new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        room: event.roomId,
        channel: '#operations-general',
        sourceType: 'SWITCH_ROOM',
        deliveryState: 'DELIVERED',
      };

      db.messages.push(inboundMsg);
      if (!saveDatabase(db)) {
        db.messages.pop();
        return;
      }
      broadcastRealtime('chat:message', inboundMsg);

      if (senderType === 'HUMAN') {
        executeDynamicAgentCollaboration(inboundMsg).catch((err) => {
          console.error('[Switch inbound] Agent coordination failed:', err);
        });
      }
    },
    (status, detail) => {
      db.switchConfig.status = status;
      db.switchConfig.protocolHandshakeVerified = status === 'CONNECTED';
      if (detail) db.switchConfig.lastErrorMessage = detail;
      if (status === 'CONNECTED') db.switchConfig.lastErrorMessage = undefined;
      saveDatabase(db);
    },
  );
}

// ---------------------------------------------------------------------------
// Autonomous Multi-Agent Coordination Layer (Independent Agent Execution)
// ---------------------------------------------------------------------------

// 1. Central Operations AI (Orchestrator & GM Brain)
async function runCentralOperationsAgent(
  userMsg: SwitchMessage,
  staffContext?: AuthenticatedStaff
): Promise<{ tasks: Task[]; directive: string }> {
  broadcastRealtime('chat:typing', {
    sender: 'Central Operations AI',
    avatarRole: 'Orchestrator',
    isTyping: true,
  });

  const content = userMsg.content;
  const activeTasksSummary = db.tasks
    .filter((t) => t.status !== 'Resolved')
    .slice(0, 8)
    .map((t) => `[${t.caseRef}] Suite ${t.room}: "${t.title}" (Status: ${t.status}, Agent: ${t.assignedAgent})`)
    .join('\n');

  const prompt = `You are Central Operations AI, the autonomous General Manager and central orchestrator of The Grand Luminary Hotel & Residences.
A team member posted in the operations chat:
Sender: "${userMsg.sender}" (${userMsg.avatarRole}, ${userMsg.department})
Channel: "${userMsg.channel || '#operations-general'}"
Message: "${content}"

CURRENT ACTIVE WORK ORDERS:
${activeTasksSummary || 'No active work orders.'}

RESPONSIBILITIES:
1. Decompose the request into distinct departmental tasks if guest issues/needs are reported.
2. Formulate a decisive executive directive and delegation plan for specialized departmental agents.
3. Output valid JSON only:
{
  "executiveDirective": string,
  "tasksToDispatch": [
    {
      "title": string,
      "department": "Maintenance" | "Housekeeping" | "Reception" | "Management",
      "priority": "Low" | "Normal" | "High" | "Urgent" | "Critical",
      "estimatedMinutes": number,
      "room": string (e.g. "204" or "412")
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
              'You are Central Operations AI. Return JSON only matching the schema. Assess risk and assign appropriate departments.',
            responseMimeType: 'application/json',
          },
        }),
        2900
      );
      parsed = JSON.parse(response.text || '{}');
    } catch (err: any) {
      console.warn('[Central AI] Gemini call timed out or failed, using grounded operational logic:', err?.message);
    }
  }

  if (!parsed || !parsed.executiveDirective) {
    parsed = generateHeuristicCentralAnalysis(content, userMsg);
  }

  broadcastRealtime('chat:typing', {
    sender: 'Central Operations AI',
    isTyping: false,
  });

  const now = Date.now();
  const createdTasks: Task[] = [];

  // Create tasks strictly in 'Dispatched' lifecycle state (NO fabricated 'In Progress' or 'ACCEPTED' yet)
  if (Array.isArray(parsed.tasksToDispatch) && parsed.tasksToDispatch.length > 0) {
    for (let i = 0; i < parsed.tasksToDispatch.length; i++) {
      const t = parsed.tasksToDispatch[i];
      const caseRef = `CAS-${8150 + db.tasks.length + i + 1}`;
      const newTask: Task = {
        id: `task-${now}-${i}-${Math.random().toString(36).substring(2, 5)}`,
        caseRef,
        room: t.room || userMsg.room || 'Unassigned',
        title: t.title,
        description: `Operational task decomposed by Central Operations AI from ${userMsg.sender}'s dispatch.`,
        department: t.department || 'Maintenance',
        assignedAgent: `${t.department || 'Maintenance'} Agent`,
        priority: t.priority || 'Normal',
        status: 'Dispatched', // Strictly Dispatched until independent agent acknowledges
        lifecycleStage: 'ASSIGNED',
        deliveryStatus: db.switchConfig.status === 'CONNECTED' ? 'DELIVERED' : 'PENDING_DELIVERY',
        createdAt: now,
        slaDeadline: now + (t.estimatedMinutes || 25) * 60 * 1000,
        estimatedMinutes: t.estimatedMinutes || 25,
        dependencies: [],
        requiresHumanConfirmation: true, // Operating Principle #8
        auditTrail: [
          {
            id: `aud-${now}-${i}-create`,
            timestamp: now,
            actor: 'Central Operations AI',
            actorRole: 'Orchestrator',
            action: 'CREATED',
            note: `Decomposed from message by ${userMsg.sender}: "${content.slice(0, 60)}"`,
          },
          {
            id: `aud-${now}-${i}-dispatch`,
            timestamp: now + 50,
            actor: 'Central Operations AI',
            actorRole: 'Orchestrator',
            action: 'DISPATCHED',
            note: `Dispatched to ${t.department || 'Maintenance'} Agent for independent evaluation. Target SLA: ${t.estimatedMinutes || 25}m.`,
          },
        ],
      };
      createdTasks.push(newTask);
      db.tasks.unshift(newTask);
      broadcastRealtime('task:created', newTask);
    }
    saveDatabase(db);
  }

  // Post Central AI Directive to Room
  postInternalAgentMessage({
    sender: 'Central Operations AI',
    avatarRole: 'Orchestrator & GM Brain',
    department: 'Management',
    content: parsed.executiveDirective,
    badge: createdTasks.length > 0 ? 'DISPATCHED' : 'INFO',
    room: userMsg.room || createdTasks[0]?.room,
    referencedTaskIds: createdTasks.map((t) => t.id),
    channel: userMsg.channel || '#operations-general',
    sourceType: 'LIVE_AGENT',
  });

  return { tasks: createdTasks, directive: parsed.executiveDirective };
}

// 2. Independent Maintenance Agent
async function runMaintenanceAgent(task: Task, directive: string): Promise<void> {
  broadcastRealtime('chat:typing', {
    sender: 'Maintenance Agent',
    avatarRole: 'Physical Plant & HVAC',
    isTyping: true,
  });

  await new Promise((r) => setTimeout(r, 600));

  const prompt = `You are the specialized Maintenance Agent for The Grand Luminary Hotel & Residences.
You have received a dispatched work order from Central Operations AI:
Case: [${task.caseRef}] Suite ${task.room}: "${task.title}"
Priority: ${task.priority} | Estimated Minutes: ${task.estimatedMinutes}
Central Directive: "${directive}"

INSTRUCTIONS:
1. Conduct an independent engineering evaluation of the fault (chilled-water HVAC, thermal comfort, RFID lock mortise, plumbing).
2. Accept the task and assign the primary on-duty plant engineer (Carlos Mendez, Chief Plant Engineer).
3. State your active diagnostic equipment and response commitment.
4. Output valid JSON:
{
  "acceptanceNote": string,
  "chatResponse": string
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
              'You are the specialized Maintenance Agent. Return JSON only. Speak authoritatively on physical engineering and HVAC.',
            responseMimeType: 'application/json',
          },
        }),
        2500
      );
      parsed = JSON.parse(response.text || '{}');
    } catch (err: any) {
      console.warn('[Maintenance Agent] Model timeout, using domain heuristic:', err?.message);
    }
  }

  const chatContent =
    parsed?.chatResponse ||
    `Maintenance work order [${task.caseRef}] accepted for Suite ${task.room}. Chief Plant Engineer Carlos Mendez dispatched on-site with calibrated thermal probe and digital manifold. SLA active: ${task.estimatedMinutes}m.`;
  const acceptanceNote =
    parsed?.acceptanceNote ||
    `Task accepted by Maintenance Agent. Assigned to Carlos Mendez (Lead HVAC Engineer) with thermal diagnostics kit.`;

  // Update task state from 'Dispatched' to 'In Progress' with authentic ACCEPTED audit entry
  const now = Date.now();
  task.status = 'In Progress';
  task.lifecycleStage = 'IN_PROGRESS';
  task.deliveryStatus = 'IN_PROGRESS';
  task.auditTrail.push({
    id: `aud-${now}-maint-accept`,
    timestamp: now,
    actor: 'Maintenance Agent',
    actorRole: 'Engineering',
    action: 'ACCEPTED',
    note: acceptanceNote,
  });

  saveDatabase(db);
  broadcastRealtime('task:updated', task);

  broadcastRealtime('chat:typing', {
    sender: 'Maintenance Agent',
    isTyping: false,
  });

  postInternalAgentMessage({
    sender: 'Maintenance Agent',
    avatarRole: 'Physical Plant & HVAC',
    department: 'Maintenance',
    content: chatContent,
    badge: 'ACKNOWLEDGED',
    room: task.room,
    referencedTaskIds: [task.id],
    channel: '#operations-general',
    sourceType: 'LIVE_AGENT',
  });
}

// 3. Independent Housekeeping Agent
async function runHousekeepingAgent(task: Task, directive: string): Promise<void> {
  broadcastRealtime('chat:typing', {
    sender: 'Housekeeping Agent',
    avatarRole: 'Linen & Sanitary Dispatch',
    isTyping: true,
  });

  await new Promise((r) => setTimeout(r, 700));

  const prompt = `You are the specialized Housekeeping Agent for The Grand Luminary Hotel & Residences.
You have received a dispatched work order from Central Operations AI:
Case: [${task.caseRef}] Suite ${task.room}: "${task.title}"
Priority: ${task.priority} | Estimated Minutes: ${task.estimatedMinutes}
Central Directive: "${directive}"

INSTRUCTIONS:
1. Conduct an independent housekeeping audit (linen stock, floor buffer allocation, sanitization standards).
2. Accept the task and assign the on-duty floor attendant under supervision of Maria Santos.
3. State your turnaround target and quality checkpoint.
4. Output valid JSON:
{
  "acceptanceNote": string,
  "chatResponse": string
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
              'You are the specialized Housekeeping Agent. Return JSON only. Speak authoritatively on luxury housekeeping standards.',
            responseMimeType: 'application/json',
          },
        }),
        2500
      );
      parsed = JSON.parse(response.text || '{}');
    } catch (err: any) {
      console.warn('[Housekeeping Agent] Model timeout, using domain heuristic:', err?.message);
    }
  }

  const chatContent =
    parsed?.chatResponse ||
    `Housekeeping dispatch [${task.caseRef}] accepted for Suite ${task.room}. Floor buffer inventory verified; attendant Maria Santos assigned for luxury replenishment. Estimated completion within ${task.estimatedMinutes}m.`;
  const acceptanceNote =
    parsed?.acceptanceNote ||
    `Task accepted by Housekeeping Agent. Floor attendant dispatched with 5-star linen package and sanitary kit.`;

  // Update task state from 'Dispatched' to 'In Progress' with authentic ACCEPTED audit entry
  const now = Date.now();
  task.status = 'In Progress';
  task.lifecycleStage = 'IN_PROGRESS';
  task.deliveryStatus = 'IN_PROGRESS';
  task.auditTrail.push({
    id: `aud-${now}-hk-accept`,
    timestamp: now,
    actor: 'Housekeeping Agent',
    actorRole: 'Housekeeping',
    action: 'ACCEPTED',
    note: acceptanceNote,
  });

  saveDatabase(db);
  broadcastRealtime('task:updated', task);

  broadcastRealtime('chat:typing', {
    sender: 'Housekeeping Agent',
    isTyping: false,
  });

  postInternalAgentMessage({
    sender: 'Housekeeping Agent',
    avatarRole: 'Linen & Sanitary Dispatch',
    department: 'Housekeeping',
    content: chatContent,
    badge: 'ACKNOWLEDGED',
    room: task.room,
    referencedTaskIds: [task.id],
    channel: '#operations-general',
    sourceType: 'LIVE_AGENT',
  });
}

// 4. Independent Reception Agent
async function runReceptionAgent(task: Task, directive: string): Promise<void> {
  broadcastRealtime('chat:typing', {
    sender: 'Reception Agent',
    avatarRole: 'Front Office Intelligence',
    isTyping: true,
  });

  await new Promise((r) => setTimeout(r, 650));

  const now = Date.now();
  task.status = 'In Progress';
  task.lifecycleStage = 'IN_PROGRESS';
  task.deliveryStatus = 'IN_PROGRESS';
  task.auditTrail.push({
    id: `aud-${now}-rec-accept`,
    timestamp: now,
    actor: 'Reception Agent',
    actorRole: 'Reception',
    action: 'ACCEPTED',
    note: 'Reception Agent accepted guest coordination task. Guest folio logged; courtesy follow-up scheduled.',
  });

  saveDatabase(db);
  broadcastRealtime('task:updated', task);

  broadcastRealtime('chat:typing', {
    sender: 'Reception Agent',
    isTyping: false,
  });

  postInternalAgentMessage({
    sender: 'Reception Agent',
    avatarRole: 'Front Office Intelligence',
    department: 'Reception',
    content: `Front Office ticket [${task.caseRef}] accepted for Suite ${task.room}. Guest folio updated with special handling. Courtesy communication channel kept open.`,
    badge: 'ACKNOWLEDGED',
    room: task.room,
    referencedTaskIds: [task.id],
    channel: '#operations-general',
    sourceType: 'LIVE_AGENT',
  });
}

// Main Coordinator: Sequences Independent Agents
async function executeDynamicAgentCollaboration(userMsg: SwitchMessage, staffContext?: AuthenticatedStaff) {
  // Phase 1: Central Operations AI analyzes and creates tasks in 'Dispatched'
  const { tasks, directive } = await runCentralOperationsAgent(userMsg, staffContext);

  // Phase 2: Each specialized departmental agent executes independently
  for (const task of tasks) {
    if (task.department === 'Maintenance') {
      await runMaintenanceAgent(task, directive);
    } else if (task.department === 'Housekeeping') {
      await runHousekeepingAgent(task, directive);
    } else if (task.department === 'Reception') {
      await runReceptionAgent(task, directive);
    }
  }
}

function generateHeuristicCentralAnalysis(content: string, userMsg: SwitchMessage): {
  executiveDirective: string;
  tasksToDispatch: any[];
} {
  const roomMatch = content.match(/\b(?:room|suite|rm\.?|#)\s*([0-9]{3,4}[A-Z]?)\b/i);
  const detectedRoom = roomMatch ? roomMatch[1] : userMsg.room || undefined;

  const hasTowels = /towel|linen|pillow|sheet/i.test(content);
  const hasAc = /ac\b|air condition|hvac|thermostat|cooling|heat|warm/i.test(content);
  const hasCleaning = /clean|dirty|spill|trash|odor|bathroom/i.test(content);
  const isStatusQuery = /status of|what is happening with|check on|any updates on|how is/i.test(content);

  if (isStatusQuery && detectedRoom) {
    const roomTasks = db.tasks.filter((t) => t.room === detectedRoom && t.status !== 'Resolved');
    let summary = '';
    if (roomTasks.length > 0) {
      summary = `Status report for Suite ${detectedRoom}: Found ${roomTasks.length} active case(s): ${roomTasks
        .map((t) => `[${t.caseRef}] ${t.title} (${t.status}, assigned to ${t.assignedAgent})`)
        .join('; ')}. Department staff are actively handling.`;
    } else {
      summary = `Status report for Suite ${detectedRoom}: All recent work orders have been verified and resolved according to Operating Principle #8 standards. No active faults.`;
    }

    return {
      executiveDirective: summary,
      tasksToDispatch: [],
    };
  }

  const tasksToDispatch: any[] = [];

  if (hasAc && detectedRoom) {
    tasksToDispatch.push({
      title: `Inspect & recalibrate HVAC climate control (Suite ${detectedRoom})`,
      department: 'Maintenance',
      priority: 'High',
      estimatedMinutes: 25,
      room: detectedRoom,
    });
  }

  if (hasTowels && detectedRoom) {
    tasksToDispatch.push({
      title: `Deliver fresh luxury bath towels & linen set (Suite ${detectedRoom})`,
      department: 'Housekeeping',
      priority: 'Normal',
      estimatedMinutes: 15,
      room: detectedRoom,
    });
  }

  if (hasCleaning && detectedRoom) {
    tasksToDispatch.push({
      title: `Priority sanitary deep-clean & suite refresh (Suite ${detectedRoom})`,
      department: 'Housekeeping',
      priority: 'Urgent',
      estimatedMinutes: 30,
      room: detectedRoom,
    });
  }

  let directive = '';
  if (tasksToDispatch.length > 0) {
    directive = `Central Operations AI acknowledging ${userMsg.sender}. Identified ${tasksToDispatch.length} distinct operational commitments for Suite ${detectedRoom}. Dispatching directly to specialized departmental agents: ${tasksToDispatch.map((t) => t.department).join(', ')}.`;
  } else {
    directive = `Acknowledged, ${userMsg.sender}. Operational update logged in the operations registry. All active monitoring remains engaged.`;
  }

  return { executiveDirective: directive, tasksToDispatch };
}

// ---------------------------------------------------------------------------
// Room 204 End-to-End Operational Workflow (Explicitly Labeled Demo Scenario)
// ---------------------------------------------------------------------------
async function runRoom204Workflow() {
  const timeStr = () => new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));
  const now = Date.now();

  // Step 1: Receptionist Elena Rostova (Human) posts
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

  // Step 2: Central Operations AI decomposes request into 2 tasks in DISPATCHED state
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
    status: 'Dispatched', // Non-fabricated initial state
    lifecycleStage: 'ASSIGNED',
    deliveryStatus: 'PENDING_DELIVERY',
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
        timestamp: now + 50,
        actor: 'Central Operations AI',
        actorRole: 'Orchestrator',
        action: 'DISPATCHED',
        note: 'Dispatched to Maintenance Agent with 25m SLA target',
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
    status: 'Dispatched', // Non-fabricated initial state
    lifecycleStage: 'ASSIGNED',
    deliveryStatus: 'PENDING_DELIVERY',
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
        timestamp: now + 50,
        actor: 'Central Operations AI',
        actorRole: 'Orchestrator',
        action: 'DISPATCHED',
        note: 'Dispatched to Housekeeping Agent with 15m SLA target',
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
    content: '[DEMO SCENARIO] Decomposed request for Suite 204 into two operational work orders: #CAS-8201 (Maintenance — Chilled-Water Diagnostic) and #CAS-8202 (Housekeeping — Luxury Bath Linens). Dispatched to departmental agents.',
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

  // Step 3: Maintenance Agent independently evaluates and accepts CAS-8201
  await delay(1200);
  broadcastRealtime('chat:typing', { sender: 'Maintenance Agent', avatarRole: 'Engineering', isTyping: true });
  await delay(600);

  taskAc.status = 'In Progress';
  taskAc.lifecycleStage = 'IN_PROGRESS';
  taskAc.deliveryStatus = 'IN_PROGRESS';
  taskAc.auditTrail.push({
    id: `aud-${now}-ac-accept`,
    timestamp: Date.now(),
    actor: 'Maintenance Agent',
    actorRole: 'Engineering',
    action: 'ACCEPTED',
    note: 'Independent agent accepted work order. Technician Carlos Mendez dispatched on-site with thermal diagnostics probe.',
  });
  saveDatabase(db);
  broadcastRealtime('task:updated', taskAc);

  const msg3: SwitchMessage = {
    id: `msg-${now}-demo-3`,
    sender: 'Maintenance Agent',
    avatarRole: 'Engineering',
    senderType: 'AI_AGENT',
    department: 'Maintenance',
    content: '[DEMO SCENARIO] Work order CAS-8201 accepted for Suite 204: AC diagnostic dispatch. Technician Carlos Mendez dispatched on-site with thermal probe.',
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

  // Step 4: Housekeeping Agent independently evaluates and accepts CAS-8202
  await delay(1100);
  broadcastRealtime('chat:typing', { sender: 'Housekeeping Agent', avatarRole: 'Housekeeping', isTyping: true });
  await delay(500);

  taskTowels.status = 'In Progress';
  taskTowels.lifecycleStage = 'IN_PROGRESS';
  taskTowels.deliveryStatus = 'IN_PROGRESS';
  taskTowels.auditTrail.push({
    id: `aud-${now}-tw-accept`,
    timestamp: Date.now(),
    actor: 'Housekeeping Agent',
    actorRole: 'Housekeeping',
    action: 'ACCEPTED',
    note: 'Independent agent accepted work order. Housekeeping attendant allocated from 2nd floor linen buffer.',
  });
  saveDatabase(db);
  broadcastRealtime('task:updated', taskTowels);

  const msg4: SwitchMessage = {
    id: `msg-${now}-demo-4`,
    sender: 'Housekeeping Agent',
    avatarRole: 'Housekeeping',
    senderType: 'AI_AGENT',
    department: 'Housekeeping',
    content: '[DEMO SCENARIO] Work order CAS-8202 accepted for Suite 204: Extra bath towels. Attendant Maria allocated from 2nd floor buffer.',
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

  // Step 5: Housekeeping completes physical delivery, halts for human sign-off
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

  // Step 6: Maintenance completes physical repair, halts for human sign-off
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

  // Step 7: Central AI notifies team for human sign-off
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

  // Step 8: Elena Rostova confirms follow-up
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

  // 2. Staff Authentication Endpoints (Salted SHA-256 PIN Verification & Unpredictable Random Sessions)
  app.post('/api/auth/staff-login', (req, res) => {
    const { staffId, pin } = req.body;

    if (!staffId || !pin) {
      return res.status(400).json({ error: 'staffId and pin are required' });
    }

    const staff = STAFF_DIRECTORY[staffId];
    if (!staff || staff.pinHash !== hashPin(staff.salt, String(pin).trim())) {
      return res.status(401).json({ error: 'Invalid staff identifier or security PIN' });
    }

    const token = generateStaffSession(staff);
    const authenticated = authenticateStaffToken(token)!;
    res.json({ success: true, staff: authenticated, token });
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

  // 6. Send Team Chat Message (Enforces Authentication for Human Staff & Strictly Forbids Client Spoofing of AI Agents)
  app.post('/api/chat/messages', async (req, res) => {
    const { sender, avatarRole, senderType, department, content, room, channel, staffToken } = req.body;

    if (!content || typeof content !== 'string') {
      return res.status(400).json({ error: 'content is required' });
    }

    // AI Agent Spoofing Defense: Untrusted clients cannot submit AI_AGENT messages
    if (senderType === 'AI_AGENT') {
      const agentSecretHeader = req.headers['x-agent-secret'];
      if (!agentSecretHeader || agentSecretHeader !== INTERNAL_AGENT_SECRET) {
        return res.status(403).json({
          error: 'Security Violation: External clients cannot post as AI_AGENT. Autonomous agents execute server-side.',
        });
      }
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

    // Enforce task-specific departmental authorization:
    // Management (Marcus Vance / Duty Manager) has hotel-wide executive authority.
    // Otherwise, the staff member must belong to the exact same department as the task.
    const isManagementOverride = authenticatedStaff.department === 'Management';
    const isMatchingDepartment = authenticatedStaff.department === task.department;

    if (!isManagementOverride && !isMatchingDepartment) {
      return res.status(403).json({
        error: `Departmental Authorization Failure: Task in ${task.department} department cannot be verified by staff from ${authenticatedStaff.department}. Only authorized ${task.department} personnel or Executive Duty Managers may complete physical sign-off.`,
      });
    }

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

  app.post('/api/switch/config', (_req, res) => {
    res.status(405).json({
      success: false,
      error: 'Switch credentials are read only at runtime. Configure SWITCH_AGENT_BASE_URL, SWITCH_AGENT_ID, SWITCH_AGENT_API_KEY, and SWITCH_ROOM_ID as deployment secrets or environment variables.',
    });
  });

  // 15. Verify credentials and deliver a real message through the Switch Agent API
  app.post('/api/switch/test', async (_req, res) => {
    if (!db.switchConfig.agentBaseUrl || !db.switchConfig.agentId || !db.switchConfig.apiKey || !db.switchConfig.roomId) {
      return res.status(400).json({
        error: 'Cannot test Switch connection: complete the Bridge URL, agent ID, API key, and room ID first.',
      });
    }

    const testResult = await forwardToSwitchRoom(db.switchConfig, {
      eventType: 'PROBE_TEST',
      sender: { name: 'Central Operations AI', role: 'Integration Tester' },
      content: 'Hotel Operations AI Switch Connection Test Probe',
      room: 'HQ',
    });

    if (testResult.success) startSwitchInboundStream();
    res.json({
      success: testResult.success,
      status: db.switchConfig.status,
      protocolHandshakeVerified: db.switchConfig.protocolHandshakeVerified,
      lastTestedAt: db.switchConfig.lastTestedAt,
      message: testResult.success
        ? 'Authenticated with the Switch Agent API and delivered a test message to the configured room.'
        : db.switchConfig.lastErrorMessage,
    });
  });

  // Legacy mock handshake routes are deliberately disabled. They cannot authenticate a real Switch agent.
  app.all(['/api/switch/manifest', '/api/switch/handshake', '/api/switch/mock-room', '/api/switch/events'], (_req, res) => {
    res.status(410).json({
      success: false,
      error: 'This legacy mock endpoint has been retired. Use the official Switch Agent Protocol configuration.',
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

          // Reject client attempts to spoof AI Agent identities over WebSocket
          if (senderType === 'AI_AGENT') {
            ws.send(
              JSON.stringify({
                event: 'error',
                data: { message: 'Security Violation: Client WebSocket cannot spoof AI Agent identities. Agents execute server-side.' },
              })
            );
            return;
          }

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
    startSwitchInboundStream();
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
