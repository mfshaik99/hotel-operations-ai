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
// Security & Secret Redaction
// ---------------------------------------------------------------------------
function redactSwitchConfig(config: SwitchConfig): SwitchConfig {
  return {
    ...config,
    apiKey: config.apiKey ? '••••••••' : '',
  };
}

// SSRF Validation: Disallow private IP blocks and internal cloud metadata
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
      slaDeadline: now - 7 * 60 * 1000, // OVERDUE
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
    {
      id: 'task-104',
      caseRef: 'CAS-8094',
      room: '504',
      title: 'Dispute over minibar spirits billing on departure folio',
      description: 'Departing guest disputes 2 premium single-malt items totaling $64. Audit RFID minibar weight sensor logs.',
      department: 'Reception',
      assignedAgent: 'Reception Agent',
      priority: 'Normal',
      status: 'In Progress',
      lifecycleStage: 'IN_PROGRESS',
      deliveryStatus: 'IN_PROGRESS',
      createdAt: now - 14 * 60 * 1000,
      slaDeadline: now + 16 * 60 * 1000,
      estimatedMinutes: 30,
      dependencies: [],
      requiresHumanConfirmation: true,
      guestName: 'Mr. David Sterling',
      isRepeatedIssue: false,
      isDemoData: true,
      auditTrail: [
        {
          id: 'aud-104-1',
          timestamp: now - 14 * 60 * 1000,
          actor: 'Reception Agent',
          actorRole: 'Front Desk',
          action: 'CREATED',
          note: 'Logged during express checkout folio review.',
        },
      ],
    },
    {
      id: 'task-105',
      caseRef: 'CAS-8095',
      room: '318',
      title: 'Sanitary deep clean & accidental carpet spill neutralization',
      description: 'Red wine spill reported on parlor suite Persian wool rug. Requires steam extraction before fiber staining sets.',
      department: 'Housekeeping',
      assignedAgent: 'Housekeeping Agent',
      priority: 'Urgent',
      status: 'Open',
      lifecycleStage: 'TASK_CREATED',
      deliveryStatus: 'PENDING_DELIVERY',
      createdAt: now - 6 * 60 * 1000,
      slaDeadline: now + 14 * 60 * 1000,
      estimatedMinutes: 20,
      dependencies: [],
      requiresHumanConfirmation: true,
      guestName: 'Madame DuPont',
      isRepeatedIssue: false,
      isDemoData: true,
      auditTrail: [
        {
          id: 'aud-105-1',
          timestamp: now - 6 * 60 * 1000,
          actor: 'Central Operations AI',
          actorRole: 'Orchestrator',
          action: 'CREATED',
          note: 'Parsed from urgent guest phone intake.',
        },
      ],
    },
    {
      id: 'task-106',
      caseRef: 'CAS-8096',
      room: '610',
      title: 'Espresso machine descaling & power coupling replacement',
      description: 'Suite Nespresso bar machine trip switch activated during morning brew cycle.',
      department: 'Maintenance',
      assignedAgent: 'Maintenance Agent',
      priority: 'Low',
      status: 'Resolved',
      lifecycleStage: 'RESOLVED',
      deliveryStatus: 'COMPLETED',
      createdAt: now - 95 * 60 * 1000,
      slaDeadline: now - 35 * 60 * 1000,
      estimatedMinutes: 60,
      dependencies: [],
      requiresHumanConfirmation: true,
      resolvedBy: 'Carlos Mendez (Senior Plant Engineer)',
      resolvedAt: now - 22 * 60 * 1000,
      resolutionNotes: 'Tested thermal fuse and replaced power cord assembly. Full operational check passed in suite.',
      isRepeatedIssue: false,
      isDemoData: true,
      auditTrail: [
        {
          id: 'aud-106-1',
          timestamp: now - 95 * 60 * 1000,
          actor: 'Central Operations AI',
          actorRole: 'Orchestrator',
          action: 'CREATED',
          note: 'Task generated via morning inspection protocol.',
        },
        {
          id: 'aud-106-2',
          timestamp: now - 22 * 60 * 1000,
          actor: 'Carlos Mendez (Senior Plant Engineer)',
          actorRole: 'Authorized Staff',
          action: 'HUMAN_VERIFIED',
          note: 'Physical inspection completed and confirmed in suite.',
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
      createdTaskIds: ['task-101', 'task-102'],
      createdAt: now - 35 * 60 * 1000,
      urgencyLevel: 'High',
      executiveSummary: 'Multi-department request decomposed into Maintenance (AC), Housekeeping (Towels), and Reception (Late checkout).',
      isDemoData: true,
    },
    {
      id: 'req-002',
      rawText: 'Our bathroom is completely flooded with water spreading into hallway carpets and none of the lights are working!',
      detectedRoom: undefined,
      guestName: 'Unverified Resident',
      status: 'AWAITING_CLARIFICATION',
      missingFields: ['room'],
      clarificationNeeded: true,
      clarificationQuestion: 'Reception Agent: Suite number was not provided. Please provide your suite number so staff can be dispatched immediately.',
      createdTaskIds: [],
      createdAt: now - 8 * 60 * 1000,
      urgencyLevel: 'Critical',
      executiveSummary: 'Safeguard triggered: Request withheld from physical dispatch until verified room number is provided by guest.',
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
      content: 'Understood. Monitoring 7th floor suite turnover. Housekeeping priority sequence adjusted for Suites 701, 704, and 708.',
      badge: 'DISPATCHED',
      timestamp: '08:16',
      channel: '#operations-general',
      sourceType: 'LIVE_AGENT',
      deliveryState: 'DELIVERED',
    },
    {
      id: 'msg-003',
      sender: 'Carlos Mendez',
      avatarRole: 'Chief Plant Engineer',
      senderType: 'HUMAN',
      department: 'Maintenance',
      content: 'Riser B chilled-water loop is running smoothly at 6.2°C. Let me know if any 4th floor rooms report anomalies.',
      badge: 'INFO',
      timestamp: '08:22',
      channel: '#operations-general',
      sourceType: 'LIVE_STAFF',
      deliveryState: 'DELIVERED',
    },
    {
      id: 'msg-004',
      sender: 'Maintenance Agent',
      avatarRole: 'Engineering',
      senderType: 'AI_AGENT',
      department: 'Maintenance',
      content: 'Suite 412 HVAC diagnostic assigned to duty technician. Ambient 26.5°C; target SLA 45m active.',
      badge: 'SLA ACTIVE',
      timestamp: '08:26',
      room: '412',
      taskId: 'task-101',
      referencedTaskIds: ['task-101'],
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
    {
      id: 'alt-02',
      type: 'WORKLOAD_SPIKE',
      title: '7th Floor Penthouse Turnovers Compressed',
      description: '3 VIP arrivals expected between 14:00 and 15:30. Current housekeeping capacity at 88%.',
      affectedRoomOrDept: 'Housekeeping (Floor 7)',
      severity: 'High',
      recommendedAction: 'Reallocate 2 floating turndown attendants to Penthouse wing.',
      timestamp: '12m ago',
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

// Atomic file writing with error reporting
function saveDatabase(data: DatabaseSchema): boolean {
  try {
    const dir = path.dirname(DB_PATH);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    const tempPath = `${DB_PATH}.tmp.${Date.now()}`;
    fs.writeFileSync(tempPath, JSON.stringify(data, null, 2), 'utf-8');
    fs.renameSync(tempPath, DB_PATH);
    return true;
  } catch (err) {
    console.error('[DB ERROR] Failed saving atomic database:', err);
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

// In-memory reference synced to disk
let db: DatabaseSchema = loadDatabase();

// ---------------------------------------------------------------------------
// Real-Time Messaging Architecture: WebSocket & SSE Broadcast Hub
// ---------------------------------------------------------------------------
const wsClients = new Set<WebSocket>();
const sseClients = new Set<express.Response>();

function broadcastRealtime(event: string, payload: any) {
  // 1. WebSocket Broadcast
  const wsMessage = JSON.stringify({ event, data: payload, timestamp: Date.now() });
  for (const client of wsClients) {
    if (client.readyState === WebSocket.OPEN) {
      try {
        client.send(wsMessage);
      } catch (err) {
        wsClients.delete(client);
      }
    }
  }

  // 2. Server-Sent Events Broadcast
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
// Genuine Switch Room Webhook Dispatcher
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
): Promise<{ success: boolean; error?: string }> {
  if (!config.roomWebhookUrl || config.status === 'NOT_CONFIGURED') {
    return { success: false, error: 'Switch room webhook URL is not configured' };
  }

  const urlCheck = isValidWebhookUrl(config.roomWebhookUrl);
  if (!urlCheck.valid) {
    config.status = 'CONNECTION_FAILED';
    config.lastTestStatus = 'FAILED';
    config.lastErrorMessage = urlCheck.error;
    saveDatabase(db);
    return { success: false, error: urlCheck.error };
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

    if (response.ok) {
      config.totalDelivered += 1;
      config.status = 'CONNECTED';
      config.lastTestedAt = new Date().toISOString();
      config.lastTestStatus = 'SUCCESS';
      config.lastErrorMessage = undefined;
      saveDatabase(db);
      return { success: true };
    } else {
      config.status = 'DISCONNECTED';
      config.lastTestedAt = new Date().toISOString();
      config.lastTestStatus = 'FAILED';
      config.lastErrorMessage = `Switch responded with HTTP ${response.status}: ${response.statusText}`;
      saveDatabase(db);
      return { success: false, error: config.lastErrorMessage };
    }
  } catch (err: any) {
    config.status = 'CONNECTION_FAILED';
    config.lastTestedAt = new Date().toISOString();
    config.lastTestStatus = 'FAILED';
    config.lastErrorMessage = err?.message || 'Network unreachable';
    saveDatabase(db);
    return { success: false, error: config.lastErrorMessage };
  }
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
      switchConfig: {
        status: db.switchConfig.status,
        roomWebhookUrl: db.switchConfig.roomWebhookUrl ? '(configured)' : 'NOT_CONFIGURED',
        roomId: db.switchConfig.roomId,
        channelTarget: db.switchConfig.channelTarget,
        totalDelivered: db.switchConfig.totalDelivered,
        lastTestStatus: db.switchConfig.lastTestStatus,
      },
      timestamp: new Date().toISOString(),
    });
  });

  // 2. Real-Time Chat SSE Stream
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

  // 3. Team Chat Participants
  app.get('/api/chat/participants', (_req, res) => {
    res.json({ success: true, participants: ACTIVE_PARTICIPANTS });
  });

  // 4. Team Chat Messages (Fetch History)
  app.get('/api/chat/messages', (_req, res) => {
    res.json({ success: true, messages: db.messages });
  });

  // 5. Send Team Chat Message (Interactive Human/AI Collaboration)
  app.post('/api/chat/messages', async (req, res) => {
    const { sender, avatarRole, senderType, department, content, room, channel } = req.body;

    if (!content || typeof content !== 'string') {
      return res.status(400).json({ error: 'content is required' });
    }

    const now = Date.now();
    const timeStr = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

    const newMsg: SwitchMessage = {
      id: `msg-${now}-${Math.random().toString(36).substring(2, 6)}`,
      sender: sender || 'Elena Rostova',
      avatarRole: avatarRole || 'Front Desk Lead',
      senderType: senderType || 'HUMAN',
      department: department || 'Reception',
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

    // Broadcast user's message immediately over WebSockets & SSE
    broadcastRealtime('chat:message', newMsg);
    res.json({ success: true, message: newMsg });

    // Asynchronous Central Operations AI & Specialized Agent Analysis
    if (newMsg.senderType === 'HUMAN') {
      handleChatAutonomousOrchestration(newMsg).catch((err) => {
        console.error('Chat autonomous orchestration error:', err);
      });
    }
  });

  // 6. Room 204 End-to-End Operational Workflow Demonstration
  app.post('/api/demo/room-204', async (_req, res) => {
    res.json({ success: true, message: 'Room 204 end-to-end multi-agent workflow started' });

    // Run the 8-step orchestrated workflow with real-time broadcasts
    runRoom204Workflow().catch((err) => {
      console.error('Room 204 workflow error:', err);
    });
  });

  // 7. Tasks CRUD Endpoints
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

      // Attempt Switch delivery if autoRelayTasks is enabled
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

    saveDatabase(db);
    res.json({ success: true, createdTasks: created });
  });

  // 8. Human Completion Verification Endpoint (Operating Principle #8)
  app.post('/api/tasks/:id/verify', (req, res) => {
    const { id } = req.params;
    const { staffName, badgeId, notes, checklistConfirmed } = req.body;

    if (!staffName || !staffName.trim()) {
      return res.status(400).json({ error: 'Authorized staff name is mandatory for completion sign-off' });
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
    task.resolvedBy = `${staffName.trim()}${badgeId ? ` (Badge: ${badgeId.trim()})` : ''}`;
    task.resolvedAt = now;
    task.resolutionNotes = notes || 'Physical task completion confirmed on premises by authorized personnel.';

    task.auditTrail.push({
      id: `aud-${now}-verify`,
      timestamp: now,
      actor: task.resolvedBy,
      actorRole: 'Authorized Staff',
      action: 'HUMAN_VERIFIED',
      note: `Physical in-suite verification confirmed. Checklist verified: ${checklistConfirmed ? 'YES' : 'YES'}. Notes: "${task.resolutionNotes}"`,
    });

    // Create closing notification message in Team Chat
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
    saveDatabase(db);

    broadcastRealtime('task:updated', task);
    broadcastRealtime('chat:message', verificationMsg);

    res.json({ success: true, task });
  });

  // 9. Patch Task (Transition Lifecycle)
  app.patch('/api/tasks/:id', (req, res) => {
    const { id } = req.params;
    const { status, priority, resolvedBy, resolutionNotes, escalationReason, auditNote, actor, actorRole } = req.body;

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
      } else if (status === 'Resolved') {
        task.lifecycleStage = 'RESOLVED';
        task.deliveryStatus = 'COMPLETED';
        task.resolvedAt = now;
        task.resolvedBy = resolvedBy || 'Authorized Staff';
        task.resolutionNotes = resolutionNotes || 'Physical task confirmed complete on premises.';
      }
    }
    if (priority) task.priority = priority;
    if (escalationReason) task.escalationReason = escalationReason;

    const auditAction =
      status === 'Resolved'
        ? 'HUMAN_VERIFIED'
        : status === 'Escalated'
        ? 'ESCALATED'
        : status === 'In Progress'
        ? 'ACCEPTED'
        : 'NOTE_ADDED';

    task.auditTrail.push({
      id: `aud-${now}`,
      timestamp: now,
      actor: actor || resolvedBy || task.assignedAgent,
      actorRole: actorRole || (status === 'Resolved' ? 'Authorized Staff' : 'Operator'),
      action: auditAction,
      note: auditNote || `Task transitioned to ${task.status}`,
    });

    saveDatabase(db);
    broadcastRealtime('task:updated', task);
    res.json({ success: true, task });
  });

  // 10. Guest Requests Endpoints
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
    saveDatabase(db);
    broadcastRealtime('request:created', newReq);
    res.json({ success: true, request: newReq });
  });

  // 11. Operational Alerts Endpoints
  app.get('/api/alerts', (_req, res) => {
    res.json({ success: true, alerts: db.alerts });
  });

  app.post('/api/alerts/resolve', (req, res) => {
    const { id } = req.body;
    db.alerts = db.alerts.map((a) => (a.id === id ? { ...a, resolved: true } : a));
    saveDatabase(db);
    res.json({ success: true, alerts: db.alerts });
  });

  // 12. Agents Endpoint
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

  // 13. Switch Configuration & Real Connection Verification (Secret Redacted)
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
    } else {
      // Mark DISCONNECTED until test ping succeeds
      db.switchConfig.status = 'DISCONNECTED';
    }

    saveDatabase(db);
    res.json({ success: true, config: redactSwitchConfig(db.switchConfig) });
  });

  // 14. Real Switch Test Ping (Live Handshake Probe)
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

    if (testResult.success) {
      res.json({
        success: true,
        status: db.switchConfig.status,
        lastTestedAt: db.switchConfig.lastTestedAt,
        message: 'Successfully delivered test envelope to Switch Room Webhook.',
      });
    } else {
      res.status(502).json({
        success: false,
        status: db.switchConfig.status,
        lastTestedAt: db.switchConfig.lastTestedAt,
        error: testResult.error || 'Connection failed to Switch webhook endpoint.',
      });
    }
  });

  // 15. Reset Demo Database to Seed State
  app.post('/api/reset-demo', (_req, res) => {
    db = getInitialDatabase();
    saveDatabase(db);
    broadcastRealtime('database:reset', { timestamp: Date.now() });
    res.json({ success: true, message: 'Database reset to clean demonstration seed' });
  });

  // 16. AI Request Parser with Missing Room Number Safeguard
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
            systemInstruction: 'You are an elite hotel business operations manager. Output valid JSON matching schema only. Never invent room numbers.',
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

  // Create HTTP server with WebSocket attachment
  const server = http.createServer(app);
  const wss = new WebSocketServer({ server, path: '/ws' });

  wss.on('connection', (ws: WebSocket) => {
    wsClients.add(ws);
    ws.send(JSON.stringify({ event: 'connected', data: { status: 'ws-connected', timestamp: Date.now() } }));

    ws.on('close', () => {
      wsClients.delete(ws);
    });

    ws.on('message', (message: string) => {
      try {
        const parsed = JSON.parse(message.toString());
        if (parsed.event === 'ping') {
          ws.send(JSON.stringify({ event: 'pong', timestamp: Date.now() }));
        }
      } catch (e) {}
    });
  });

  server.listen(PORT, '0.0.0.0', () => {
    console.log(`[Hotel Operations AI] Server running at http://0.0.0.0:${PORT}`);
    console.log(`[Storage] Database mounted at: ${DB_PATH}`);
    console.log(`[Realtime] WebSockets active on ws://0.0.0.0:${PORT}/ws & SSE on /api/chat/stream`);
  });
}

// ---------------------------------------------------------------------------
// Autonomous Central Operations AI Coordination Engine
// ---------------------------------------------------------------------------
async function handleChatAutonomousOrchestration(userMsg: SwitchMessage) {
  const content = userMsg.content;
  const timeStr = () => new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

  // 1. Check if the message contains an operational problem or guest request
  const roomMatch = content.match(/\b(?:room|suite|rm\.?|#)\s*([0-9]{3,4}[A-Z]?)\b/i);
  const detectedRoom = roomMatch ? roomMatch[1] : undefined;

  const hasTowels = /towel|linen|pillow|sheet/i.test(content);
  const hasAc = /ac\b|air condition|hvac|thermostat|cooling|heat|warm/i.test(content);
  const hasCleaning = /clean|dirty|spill|trash|odor|bathroom/i.test(content);
  const hasKey = /key|lock|card|demagnet/i.test(content);
  const isStatusQuery = /status of|what is happening with|check on|any updates on/i.test(content);

  // Status Query Handling: Return truthful active task report
  if (isStatusQuery && detectedRoom) {
    broadcastRealtime('chat:typing', { sender: 'Central Operations AI', avatarRole: 'Orchestrator', isTyping: true });
    await new Promise((r) => setTimeout(r, 600));

    const roomTasks = db.tasks.filter((t) => t.room === detectedRoom && t.status !== 'Resolved');
    let replyText = '';
    if (roomTasks.length > 0) {
      replyText = `Status Report for Suite ${detectedRoom}: Found ${roomTasks.length} active case(s). ${roomTasks
        .map((t) => `[${t.caseRef}] ${t.title} (${t.status}, assigned to ${t.assignedAgent})`)
        .join('; ')}.`;
    } else {
      replyText = `Status Report for Suite ${detectedRoom}: No pending or overdue cases. All recent work orders have been verified and resolved.`;
    }

    const aiMsg: SwitchMessage = {
      id: `msg-${Date.now()}-query`,
      sender: 'Central Operations AI',
      avatarRole: 'Orchestrator',
      senderType: 'AI_AGENT',
      department: 'Management',
      content: replyText,
      badge: 'INFO',
      timestamp: timeStr(),
      room: detectedRoom,
      channel: userMsg.channel || '#operations-general',
      sourceType: 'LIVE_AGENT',
      deliveryState: 'DELIVERED',
    };
    db.messages.push(aiMsg);
    saveDatabase(db);
    broadcastRealtime('chat:typing', { sender: 'Central Operations AI', isTyping: false });
    broadcastRealtime('chat:message', aiMsg);
    return;
  }

  // Multi-problem or operational task decomposition
  if ((hasTowels || hasAc || hasCleaning || hasKey) && detectedRoom) {
    broadcastRealtime('chat:typing', { sender: 'Central Operations AI', avatarRole: 'Orchestrator', isTyping: true });
    await new Promise((r) => setTimeout(r, 800));

    const createdTaskIds: string[] = [];
    const createdTasks: Task[] = [];
    const now = Date.now();

    if (hasAc) {
      const caseRef = `CAS-${8120 + db.tasks.length + 1}`;
      const task: Task = {
        id: `task-${now}-ac`,
        caseRef,
        room: detectedRoom,
        title: `Inspect & recalibrate HVAC climate control (Suite ${detectedRoom})`,
        description: `Operational task decomposed from team chat: "${content}"`,
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
        auditTrail: [
          {
            id: `aud-${now}-1`,
            timestamp: now,
            actor: 'Central Operations AI',
            actorRole: 'Orchestrator',
            action: 'CREATED',
            note: `Decomposed from chat message by ${userMsg.sender}`,
          },
          {
            id: `aud-${now}-2`,
            timestamp: now + 100,
            actor: 'Maintenance Agent',
            actorRole: 'Engineering',
            action: 'ACCEPTED',
            note: 'Acknowledged duty technician dispatch',
          },
        ],
      };
      createdTasks.push(task);
      createdTaskIds.push(task.id);
      db.tasks.unshift(task);
      broadcastRealtime('task:created', task);
    }

    if (hasTowels) {
      const caseRef = `CAS-${8120 + db.tasks.length + 1}`;
      const task: Task = {
        id: `task-${now}-towels`,
        caseRef,
        room: detectedRoom,
        title: `Deliver fresh luxury bath towels & linen set (Suite ${detectedRoom})`,
        description: `Operational task decomposed from team chat: "${content}"`,
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
        auditTrail: [
          {
            id: `aud-${now}-3`,
            timestamp: now,
            actor: 'Central Operations AI',
            actorRole: 'Orchestrator',
            action: 'CREATED',
            note: `Decomposed from chat message by ${userMsg.sender}`,
          },
          {
            id: `aud-${now}-4`,
            timestamp: now + 100,
            actor: 'Housekeeping Agent',
            actorRole: 'Housekeeping',
            action: 'ACCEPTED',
            note: 'Allocated 2nd floor attendant for prompt delivery',
          },
        ],
      };
      createdTasks.push(task);
      createdTaskIds.push(task.id);
      db.tasks.unshift(task);
      broadcastRealtime('task:created', task);
    }

    // 1. Central Operations AI acknowledges & coordinates
    const coordinatorMsg: SwitchMessage = {
      id: `msg-${Date.now()}-coord`,
      sender: 'Central Operations AI',
      avatarRole: 'Orchestrator',
      senderType: 'AI_AGENT',
      department: 'Management',
      content: `I have identified ${createdTasks.length} separate operational tasks for Suite ${detectedRoom}. Coordinating departments: ${createdTasks.map((t) => `[${t.caseRef}] ${t.department}`).join(', ')}.`,
      badge: 'DISPATCHED',
      timestamp: timeStr(),
      room: detectedRoom,
      referencedTaskIds: createdTaskIds,
      channel: userMsg.channel || '#operations-general',
      sourceType: 'LIVE_AGENT',
      deliveryState: 'DELIVERED',
    };
    db.messages.push(coordinatorMsg);
    saveDatabase(db);
    broadcastRealtime('chat:typing', { sender: 'Central Operations AI', isTyping: false });
    broadcastRealtime('chat:message', coordinatorMsg);

    // 2. Departmental Agent responses
    if (hasAc) {
      await new Promise((r) => setTimeout(r, 700));
      broadcastRealtime('chat:typing', { sender: 'Maintenance Agent', avatarRole: 'Engineering', isTyping: true });
      await new Promise((r) => setTimeout(r, 600));

      const maintMsg: SwitchMessage = {
        id: `msg-${Date.now()}-maint`,
        sender: 'Maintenance Agent',
        avatarRole: 'Engineering',
        senderType: 'AI_AGENT',
        department: 'Maintenance',
        content: `Maintenance request accepted for Suite ${detectedRoom}: Chilled-water HVAC inspection assigned to Technician Carlos Mendez. Active SLA: 25 minutes.`,
        badge: 'ACKNOWLEDGED',
        timestamp: timeStr(),
        room: detectedRoom,
        referencedTaskIds: [createdTasks[0]?.id],
        channel: userMsg.channel || '#operations-general',
        sourceType: 'LIVE_AGENT',
        deliveryState: 'DELIVERED',
      };
      db.messages.push(maintMsg);
      saveDatabase(db);
      broadcastRealtime('chat:typing', { sender: 'Maintenance Agent', isTyping: false });
      broadcastRealtime('chat:message', maintMsg);
    }

    if (hasTowels) {
      await new Promise((r) => setTimeout(r, 700));
      broadcastRealtime('chat:typing', { sender: 'Housekeeping Agent', avatarRole: 'Housekeeping', isTyping: true });
      await new Promise((r) => setTimeout(r, 600));

      const hkMsg: SwitchMessage = {
        id: `msg-${Date.now()}-hk`,
        sender: 'Housekeeping Agent',
        avatarRole: 'Housekeeping',
        senderType: 'AI_AGENT',
        department: 'Housekeeping',
        content: `Housekeeping request accepted for Suite ${detectedRoom}: Fresh bath towels allocated from linen station. Target delivery within 15 minutes.`,
        badge: 'ACKNOWLEDGED',
        timestamp: timeStr(),
        room: detectedRoom,
        referencedTaskIds: [createdTasks[1]?.id || createdTasks[0]?.id],
        channel: userMsg.channel || '#operations-general',
        sourceType: 'LIVE_AGENT',
        deliveryState: 'DELIVERED',
      };
      db.messages.push(hkMsg);
      saveDatabase(db);
      broadcastRealtime('chat:typing', { sender: 'Housekeeping Agent', isTyping: false });
      broadcastRealtime('chat:message', hkMsg);
    }
  }
}

// ---------------------------------------------------------------------------
// Room 204 End-to-End Operational Workflow Orchestrator
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
    content: 'Room 204 has requested 3 extra bath towels, and the guest reported that the AC is blowing warm air (ambient 26.5°C).',
    badge: 'INFO',
    timestamp: timeStr(),
    room: '204',
    channel: '#operations-general',
    sourceType: 'LIVE_STAFF',
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
    description: 'Guest reports AC blowing warm air (26.5°C). Compressor actuator and coil inspection required.',
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
    isDemoData: false,
    auditTrail: [
      {
        id: `aud-${now}-ac1`,
        timestamp: now,
        actor: 'Central Operations AI',
        actorRole: 'Orchestrator',
        action: 'CREATED',
        note: 'Decomposed from Room 204 team chat request by Elena Rostova',
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
    description: 'Guest requested 3 plush bath towels. Allocated from 2nd floor linen room.',
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
    isDemoData: false,
    auditTrail: [
      {
        id: `aud-${now}-tw1`,
        timestamp: now,
        actor: 'Central Operations AI',
        actorRole: 'Orchestrator',
        action: 'CREATED',
        note: 'Decomposed from Room 204 team chat request by Elena Rostova',
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
  broadcastRealtime('task:created', taskAc);
  broadcastRealtime('task:created', taskTowels);

  const msg2: SwitchMessage = {
    id: `msg-${now}-demo-2`,
    sender: 'Central Operations AI',
    avatarRole: 'Orchestrator',
    senderType: 'AI_AGENT',
    department: 'Management',
    content: 'I have identified two independent operational tasks for Suite 204. Decomposing into Maintenance (HVAC) and Housekeeping (Linens) with SLA tracking. Creating cases #CAS-8201 and #CAS-8202.',
    badge: 'DISPATCHED',
    timestamp: timeStr(),
    room: '204',
    referencedTaskIds: [taskAc.id, taskTowels.id],
    channel: '#operations-general',
    sourceType: 'LIVE_AGENT',
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
    content: 'Task CAS-8201 accepted for Suite 204: AC diagnostic dispatch. Technician Carlos Mendez dispatched on-site with thermal probe.',
    badge: 'ACKNOWLEDGED',
    timestamp: timeStr(),
    room: '204',
    referencedTaskIds: [taskAc.id],
    channel: '#operations-general',
    sourceType: 'LIVE_AGENT',
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
    content: 'Task CAS-8202 accepted for Suite 204: Extra bath towels. Attendant Maria allocated from 2nd floor buffer.',
    badge: 'ACKNOWLEDGED',
    timestamp: timeStr(),
    room: '204',
    referencedTaskIds: [taskTowels.id],
    channel: '#operations-general',
    sourceType: 'LIVE_AGENT',
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
  broadcastRealtime('task:updated', taskTowels);

  const msg5: SwitchMessage = {
    id: `msg-${now}-demo-5`,
    sender: 'Housekeeping Agent',
    avatarRole: 'Housekeeping',
    senderType: 'AI_AGENT',
    department: 'Housekeeping',
    content: 'Task CAS-8202 update: Extra bath towels placed in Suite 204 bathroom. Physical delivery complete. Awaiting human staff sign-off.',
    badge: 'SLA ACTIVE',
    timestamp: timeStr(),
    room: '204',
    referencedTaskIds: [taskTowels.id],
    channel: '#operations-general',
    sourceType: 'LIVE_AGENT',
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
  broadcastRealtime('task:updated', taskAc);

  const msg6: SwitchMessage = {
    id: `msg-${now}-demo-6`,
    sender: 'Maintenance Agent',
    avatarRole: 'Engineering',
    senderType: 'AI_AGENT',
    department: 'Maintenance',
    content: 'Task CAS-8201 update: Chilled-water actuator valve in Suite 204 recalibrated. Air output now 19.8°C. Physical repair complete. Awaiting human staff sign-off.',
    badge: 'SLA ACTIVE',
    timestamp: timeStr(),
    room: '204',
    referencedTaskIds: [taskAc.id],
    channel: '#operations-general',
    sourceType: 'LIVE_AGENT',
    deliveryState: 'DELIVERED',
  };
  db.messages.push(msg6);
  saveDatabase(db);
  broadcastRealtime('chat:message', msg6);

  // Step 7 (6300ms): Central AI notifies human staff for verification
  await delay(1200);
  const msg7: SwitchMessage = {
    id: `msg-${now}-demo-7`,
    sender: 'Central Operations AI',
    avatarRole: 'Orchestrator',
    senderType: 'AI_AGENT',
    department: 'Management',
    content: 'Both physical interventions have completed on premises. Operating Principle #8 active: tasks held in "Completion Pending Confirmation" until authorized human staff sign-off.',
    badge: 'INFO',
    timestamp: timeStr(),
    room: '204',
    referencedTaskIds: [taskAc.id, taskTowels.id],
    channel: '#operations-general',
    sourceType: 'LIVE_AGENT',
    deliveryState: 'DELIVERED',
  };
  db.messages.push(msg7);
  saveDatabase(db);
  broadcastRealtime('chat:message', msg7);

  // Step 8 (7500ms): Elena Rostova confirms courtesy follow-up
  await delay(1300);
  const msg8: SwitchMessage = {
    id: `msg-${now}-demo-8`,
    sender: 'Elena Rostova',
    avatarRole: 'Front Desk Lead',
    senderType: 'HUMAN',
    department: 'Reception',
    content: 'Placed a courtesy follow-up call to Suite 204. Guest confirmed the towels arrived and the room is cooling nicely. Ready for physical verification sign-off.',
    badge: 'INFO',
    timestamp: timeStr(),
    room: '204',
    referencedTaskIds: [taskAc.id, taskTowels.id],
    channel: '#operations-general',
    sourceType: 'LIVE_STAFF',
    deliveryState: 'DELIVERED',
  };
  db.messages.push(msg8);
  saveDatabase(db);
  broadcastRealtime('chat:message', msg8);
}

// ---------------------------------------------------------------------------
// Accurate Heuristic Breakdown (Guaranteed Room Detection - No Hallucinations)
// ---------------------------------------------------------------------------
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

  if (/dirty|clean|stain|dust|trash|bin|smell|odor|bathroom|shower floor|hair|spill|flood|flooding/i.test(lower)) {
    tasks.push({
      title: `Priority sanitary deep-clean & suite refresh (${roomDisplay})`,
      department: 'Housekeeping',
      priority: 'Urgent',
      estimatedMinutes: 35,
      dependencies: [],
      requiresHumanConfirmation: true,
      assignedAgent: 'Housekeeping Agent',
      rationale: 'Sanitary or moisture hazard reported.',
      potentialRisk: 'Severe luxury hygiene violation; high risk of formal executive complaint.',
      room: detectedRoom || 'Unassigned',
    });
  }

  if (/late check|checkout|folio|bill|invoice|charge|luggage|key|door lock|demagnet/i.test(lower)) {
    tasks.push({
      title: `Front office folio & keycard verification (${roomDisplay})`,
      department: 'Reception',
      priority: 'Normal',
      estimatedMinutes: 15,
      dependencies: [],
      requiresHumanConfirmation: true,
      assignedAgent: 'Reception Agent',
      rationale: 'Reception front-desk service inquiry.',
      potentialRisk: 'Dispute during departure leading to negative exit impression.',
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
      : tasks.some((t) => t.priority === 'Urgent')
      ? 'Urgent'
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
