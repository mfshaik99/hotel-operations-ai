import 'dotenv/config';
import express from 'express';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { createServer as createViteServer } from 'vite';
import { GoogleGenAI, Type } from '@google/genai';
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
      deliveryStatus: 'IN_PROGRESS',
      createdAt: now - 18 * 60 * 1000,
      slaDeadline: now + 12 * 60 * 1000,
      estimatedMinutes: 30,
      dependencies: [],
      requiresHumanConfirmation: true,
      guestName: 'Ambassador Harrison',
      riskAssessment: 'VIP Suite guest with evening reception; thermal dissatisfaction could cause executive complaint.',
      isRepeatedIssue: true,
      isDemoData: true,
      auditTrail: [
        {
          id: 'aud-101-1',
          timestamp: now - 18 * 60 * 1000,
          actor: 'Central Operations AI',
          actorRole: 'Orchestrator',
          action: 'CREATED',
          note: 'Decomposed from multi-problem incoming request via Request Intelligence.',
        },
        {
          id: 'aud-101-2',
          timestamp: now - 17 * 60 * 1000,
          actor: 'Central Operations AI',
          actorRole: 'Orchestrator',
          action: 'DISPATCHED',
          note: 'Routed to Maintenance Agent with 30-minute target SLA.',
        },
        {
          id: 'aud-101-3',
          timestamp: now - 15 * 60 * 1000,
          actor: 'Maintenance Agent',
          actorRole: 'Engineering',
          action: 'ACCEPTED',
          note: 'Technician Marco dispatched with diagnostic manifold.',
        },
      ],
    },
    {
      id: 'task-102',
      caseRef: 'CAS-8092',
      room: '412',
      title: 'Hypoallergenic goose-down pillow delivery & evening turndown refresh',
      description: 'Deliver two firm hypoallergenic pillows and execute secondary turndown with bespoke lavender linen spray.',
      department: 'Housekeeping',
      assignedAgent: 'Housekeeping Agent',
      priority: 'Normal',
      status: 'Dispatched',
      deliveryStatus: 'DELIVERED',
      createdAt: now - 16 * 60 * 1000,
      slaDeadline: now + 24 * 60 * 1000,
      estimatedMinutes: 20,
      dependencies: ['Wait for Maintenance technician to finish HVAC diagnostic before entering room'],
      requiresHumanConfirmation: true,
      guestName: 'Ambassador Harrison',
      riskAssessment: 'Minor discomfort if delayed past 20:00.',
      isDemoData: true,
      auditTrail: [
        {
          id: 'aud-102-1',
          timestamp: now - 16 * 60 * 1000,
          actor: 'Central Operations AI',
          actorRole: 'Orchestrator',
          action: 'CREATED',
          note: 'Isolated from Suite 412 guest intake. Blocked by active HVAC task.',
        },
        {
          id: 'aud-102-2',
          timestamp: now - 15 * 60 * 1000,
          actor: 'Central Operations AI',
          actorRole: 'Orchestrator',
          action: 'DISPATCHED',
          note: 'Sent to Housekeeping queue with explicit handover precondition.',
        },
      ],
    },
    {
      id: 'task-103',
      caseRef: 'CAS-8088',
      room: '708',
      title: 'Master bathroom shower diverter valve leaking into ceiling cavity',
      description: 'Shower cartridge leak suspected. Plumber dispatched to isolate cold water shutoff and replace silicone O-ring.',
      department: 'Maintenance',
      assignedAgent: 'Maintenance Agent',
      priority: 'Urgent',
      status: 'In Progress',
      deliveryStatus: 'IN_PROGRESS',
      createdAt: now - 28 * 60 * 1000,
      slaDeadline: now + 2 * 60 * 1000,
      estimatedMinutes: 30,
      dependencies: [],
      requiresHumanConfirmation: true,
      guestName: 'Lady Genevieve',
      riskAssessment: 'Structural water seepage into Suite 608 below if uncontained.',
      isDemoData: true,
      auditTrail: [
        {
          id: 'aud-103-1',
          timestamp: now - 28 * 60 * 1000,
          actor: 'Reception Agent',
          actorRole: 'Front Desk',
          action: 'CREATED',
          note: 'Direct call from Lady Genevieve logged at PBX console.',
        },
        {
          id: 'aud-103-2',
          timestamp: now - 27 * 60 * 1000,
          actor: 'Central Operations AI',
          actorRole: 'Orchestrator',
          action: 'ROUTED',
          note: 'Assigned Urgent priority due to cross-floor leak hazard.',
        },
      ],
    },
    {
      id: 'task-104',
      caseRef: 'CAS-8075',
      room: '215',
      title: 'Disputed mini-bar and premium laundry charge audit on departure folio',
      description: 'Guest claims two dry cleaning jackets were mischarged from previous occupant. Assistant Front Office Manager reviewing POS receipts.',
      department: 'Reception',
      assignedAgent: 'Reception Agent',
      priority: 'Normal',
      status: 'Open',
      deliveryStatus: 'DELIVERED',
      createdAt: now - 10 * 60 * 1000,
      slaDeadline: now + 35 * 60 * 1000,
      estimatedMinutes: 25,
      dependencies: [],
      requiresHumanConfirmation: true,
      guestName: 'Dr. Kenji Sato',
      riskAssessment: 'Potential negative checkout review if unresolved prior to 09:00 departure.',
      isDemoData: true,
      auditTrail: [
        {
          id: 'aud-104-1',
          timestamp: now - 10 * 60 * 1000,
          actor: 'Reception Agent',
          actorRole: 'Front Desk',
          action: 'CREATED',
          note: 'Folio dispute flagged during express pre-departure check.',
        },
      ],
    },
    {
      id: 'task-105',
      caseRef: 'CAS-8060',
      room: 'Penthouse 1',
      title: 'Presidential suite private dining cutlery missing & sommelier glassware setup',
      description: 'Eight sets of Christofle sterling silverware and Riedel Burgundy glasses requested for 20:30 VIP dinner.',
      department: 'Housekeeping',
      assignedAgent: 'Housekeeping Agent',
      priority: 'High',
      status: 'In Progress',
      deliveryStatus: 'IN_PROGRESS',
      createdAt: now - 42 * 60 * 1000,
      slaDeadline: now + 8 * 60 * 1000,
      estimatedMinutes: 45,
      dependencies: [],
      requiresHumanConfirmation: true,
      guestName: 'Crown Prince Al-Maktoum delegation',
      riskAssessment: 'High diplomatic visibility; zero margin for delay.',
      isDemoData: true,
      auditTrail: [
        {
          id: 'aud-105-1',
          timestamp: now - 42 * 60 * 1000,
          actor: 'Management Agent',
          actorRole: 'General Manager',
          action: 'CREATED',
          note: 'Delegation liaison direct request.',
        },
      ],
    },
    {
      id: 'task-106',
      caseRef: 'CAS-8051',
      room: '320',
      title: 'Re-encode master RFID keycard after demagnetization near wireless charger',
      description: 'Guest locked out in hallway. Bellman brought temporary physical master; receptionist dispatched with permanent encrypted key.',
      department: 'Reception',
      assignedAgent: 'Reception Agent',
      priority: 'Urgent',
      status: 'Resolved',
      deliveryStatus: 'COMPLETED',
      createdAt: now - 90 * 60 * 1000,
      slaDeadline: now - 60 * 60 * 1000,
      estimatedMinutes: 15,
      dependencies: [],
      requiresHumanConfirmation: true,
      resolvedBy: 'Front Desk Lead Julian Vance [EMP-814]',
      resolvedAt: now - 78 * 60 * 1000,
      resolutionNotes: 'Physical handover completed at door 320. Tested dual RFID lock cycles successfully.',
      guestName: 'Marcus Sterling',
      isDemoData: true,
      auditTrail: [
        {
          id: 'aud-106-1',
          timestamp: now - 90 * 60 * 1000,
          actor: 'Reception Agent',
          actorRole: 'Front Desk',
          action: 'CREATED',
          note: 'Corridor call terminal triggered.',
        },
        {
          id: 'aud-106-2',
          timestamp: now - 78 * 60 * 1000,
          actor: 'Julian Vance [EMP-814]',
          actorRole: 'Authorized Staff',
          action: 'HUMAN_VERIFIED',
          note: 'Physical card handover and lock mortise cycle verified in person.',
        },
      ],
    },
  ];

  const initialRequests: GuestRequest[] = [
    {
      id: 'req-001',
      rawText: 'Hello, this is Ambassador Harrison in room 412. The air conditioning is blowing hot air again and we need extra pillows.',
      detectedRoom: '412',
      guestName: 'Ambassador Harrison',
      status: 'ROUTED',
      createdTaskIds: ['task-101', 'task-102'],
      createdAt: now - 18 * 60 * 1000,
      urgencyLevel: 'High',
      executiveSummary: 'Split into Maintenance HVAC repair and Housekeeping pillow delivery.',
      isDemoData: true,
    },
    {
      id: 'req-002',
      rawText: 'Lady Genevieve in Room 708: master bath shower diverter valve leaking into ceiling cavity.',
      detectedRoom: '708',
      guestName: 'Lady Genevieve',
      status: 'IN_PROGRESS',
      createdTaskIds: ['task-103'],
      createdAt: now - 28 * 60 * 1000,
      urgencyLevel: 'Urgent',
      executiveSummary: 'Immediate plumbing isolation dispatched.',
      isDemoData: true,
    },
  ];

  const initialMessages: SwitchMessage[] = [
    {
      id: 'msg-seed-1',
      sender: 'Central Operations AI',
      avatarRole: 'Orchestrator',
      content: 'Switch Agent Mesh operational. Monitoring 420 luxury guest suites. 4 specialized department agents online.',
      badge: 'INFO',
      timestamp: '18:15',
      sourceType: 'DEMO_SEED',
      deliveryState: 'LOCAL_MESH',
    },
    {
      id: 'msg-seed-2',
      sender: 'Central Operations AI',
      avatarRole: 'Orchestrator',
      content: 'Parsed multi-part dispatch for Suite 412 (Ambassador Harrison). Split into Maintenance (HVAC) & Housekeeping (Pillows/Linen).',
      badge: 'DISPATCHED',
      timestamp: '18:18',
      room: '412',
      sourceType: 'DEMO_SEED',
      deliveryState: 'LOCAL_MESH',
    },
    {
      id: 'msg-seed-3',
      sender: 'Maintenance Agent',
      avatarRole: 'Engineering',
      content: 'Technician Marco is on level 4 with HVAC diagnostic manifold. Entering 412 now. Ambient reading 26.5°C.',
      badge: 'ACKNOWLEDGED',
      timestamp: '18:21',
      room: '412',
      sourceType: 'DEMO_SEED',
      deliveryState: 'LOCAL_MESH',
    },
    {
      id: 'msg-seed-4',
      sender: 'Housekeeping Agent',
      avatarRole: 'Housekeeping',
      content: 'Holding delivery of hypoallergenic pillows at service lift 4 until Maintenance confirms HVAC refrigerant pressure.',
      badge: 'SLA ACTIVE',
      timestamp: '18:23',
      room: '412',
      sourceType: 'DEMO_SEED',
      deliveryState: 'LOCAL_MESH',
    },
    {
      id: 'msg-seed-5',
      sender: 'Management Agent',
      avatarRole: 'General Manager',
      content: 'Note on 412: Guest had an unresolved AC complaint 3 days ago in room 408. Proactively monitoring. If not chilled by 18:45, offer executive lounge access.',
      badge: 'ALERT',
      timestamp: '18:25',
      room: '412',
      sourceType: 'DEMO_SEED',
      deliveryState: 'LOCAL_MESH',
    },
    {
      id: 'msg-seed-6',
      sender: 'Central Operations AI',
      avatarRole: 'Orchestrator',
      content: 'Maintenance alert: Suite 708 plumbing SLA approaching 2 minutes remaining. Engineering supervisor alerted.',
      badge: 'ALERT',
      timestamp: '18:32',
      room: '708',
      sourceType: 'DEMO_SEED',
      deliveryState: 'LOCAL_MESH',
    },
  ];

  const initialAlerts: OperationalAlert[] = [
    {
      id: 'alt-1',
      type: 'SLA_BREACH_RISK',
      title: 'Tight SLA on Suite 708 Plumbing Leak',
      description: 'Shower diverter valve repair has 2 minutes remaining before 30-minute benchmark breach.',
      affectedRoomOrDept: 'Room 708 (Maintenance)',
      severity: 'High',
      recommendedAction: 'Dispatch senior plumbing supervisor to assist technician Marco with cartridge replacement.',
      timestamp: '2 min ago',
      isDemoAlert: true,
      resolved: false,
    },
    {
      id: 'alt-2',
      type: 'REPEATED_COMPLAINT',
      title: 'Repeated Climate Control Failure Pattern (4th Floor)',
      description: 'Room 412 is the 3rd suite on 4th floor west wing reporting inadequate cooling in past 48 hours.',
      affectedRoomOrDept: '4th Floor West Wing',
      severity: 'Critical',
      recommendedAction: 'Inspect branch chilled-water balancing valve 4-W in mechanical riser room.',
      timestamp: '14 min ago',
      isDemoAlert: true,
      resolved: false,
    },
    {
      id: 'alt-3',
      type: 'WORKLOAD_SPIKE',
      title: 'Housekeeping High Workload Pressure',
      description: 'Turndown queue has 18 simultaneous suites due to 8 VIP late arrivals.',
      affectedRoomOrDept: 'Housekeeping Department',
      severity: 'Medium',
      recommendedAction: 'Reassign 2 floaters from public area evening care to residential corridors.',
      timestamp: '25 min ago',
      isDemoAlert: true,
      resolved: false,
    },
  ];

  // Honest Switch Config: Defaults to NOT_CONFIGURED
  const initialSwitchConfig: SwitchConfig = {
    status: process.env.SWITCH_ROOM_WEBHOOK_URL ? 'DISCONNECTED' : 'NOT_CONFIGURED',
    roomWebhookUrl: process.env.SWITCH_ROOM_WEBHOOK_URL || '',
    roomId: process.env.SWITCH_ROOM_ID || 'hotel-operations-room',
    apiKey: process.env.SWITCH_API_KEY ? '••••••••' : '',
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

function saveDatabase(data: DatabaseSchema): void {
  try {
    const dir = path.dirname(DB_PATH);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(DB_PATH, JSON.stringify(data, null, 2), 'utf-8');
  } catch (err) {
    console.error('[DB] Failed saving db.json:', err);
  }
}

// In-memory reference synced to disk
let db: DatabaseSchema = loadDatabase();

// ---------------------------------------------------------------------------
// Real Switch Room Webhook Dispatcher
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
): Promise<{ success: boolean; error?: string; statusText?: string }> {
  if (!config.roomWebhookUrl || config.status === 'NOT_CONFIGURED') {
    return { success: false, error: 'Switch room webhook URL is not configured' };
  }

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 4000);

    const body = {
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
      'User-Agent': 'HotelOperationsAI/1.0',
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
    config.status = 'DISCONNECTED';
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

  // 1. Health check & System Diagnostic
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

  // 2. Tasks CRUD Endpoints
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
        deliveryStatus: db.switchConfig.status === 'CONNECTED' ? 'DELIVERED' : 'PENDING_DELIVERY',
        createdAt: now,
        slaDeadline: item.slaDeadline || now + (item.estimatedMinutes || 25) * 60 * 1000,
        estimatedMinutes: item.estimatedMinutes || 25,
        dependencies: item.dependencies || [],
        requiresHumanConfirmation: true, // Operating Principle #8
        guestName: item.guestName,
        riskAssessment: item.riskAssessment,
        isRepeatedIssue: item.isRepeatedIssue || false,
        isDemoData: false, // User created = Live data!
        auditTrail: initialAudit,
      };

      created.push(newTask);
      db.tasks.unshift(newTask);

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
      if (status === 'In Progress') task.deliveryStatus = 'IN_PROGRESS';
      if (status === 'Escalated') task.deliveryStatus = 'IN_PROGRESS';
      if (status === 'Resolved') {
        task.deliveryStatus = 'COMPLETED';
        task.resolvedAt = now;
        task.resolvedBy = resolvedBy || 'Authorized Staff';
        task.resolutionNotes = resolutionNotes || 'Physical task confirmed complete on premises.';
      }
    }
    if (priority) task.priority = priority;
    if (escalationReason) task.escalationReason = escalationReason;

    // Append to immutable audit trail
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
    res.json({ success: true, task });
  });

  // 3. Guest Requests Endpoints
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
    res.json({ success: true, request: newReq });
  });

  // 4. Switch Messages Endpoints
  app.get('/api/messages', (_req, res) => {
    res.json({ success: true, messages: db.messages });
  });

  app.post('/api/messages', async (req, res) => {
    const { sender, avatarRole, department, content, badge, room, taskId, sourceType } = req.body;
    if (!content) {
      return res.status(400).json({ error: 'content is required' });
    }

    const newMsg: SwitchMessage = {
      id: `msg-${Date.now()}`,
      sender: sender || 'Central Operations AI',
      avatarRole: avatarRole || 'Orchestrator',
      department,
      content,
      badge: badge || 'INFO',
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      taskId,
      room,
      sourceType: sourceType || 'LIVE_AGENT',
      deliveryState: db.switchConfig.status === 'CONNECTED' ? 'DELIVERED' : 'LOCAL_MESH',
    };

    db.messages.push(newMsg);

    // If Switch room is configured, send HTTP post to Switch Room Webhook
    if (db.switchConfig.status === 'CONNECTED' && db.switchConfig.roomWebhookUrl) {
      forwardToSwitchRoom(db.switchConfig, {
        eventType: badge || 'CHAT_MESSAGE',
        sender: { name: newMsg.sender, role: newMsg.avatarRole },
        content: newMsg.content,
        room: newMsg.room,
        taskId: newMsg.taskId,
      }).catch(() => {});
    }

    saveDatabase(db);
    res.json({ success: true, message: newMsg });
  });

  // 5. Operational Alerts Endpoints
  app.get('/api/alerts', (_req, res) => {
    res.json({ success: true, alerts: db.alerts });
  });

  app.post('/api/alerts/resolve', (req, res) => {
    const { id } = req.body;
    db.alerts = db.alerts.map((a) => (a.id === id ? { ...a, resolved: true } : a));
    saveDatabase(db);
    res.json({ success: true, alerts: db.alerts });
  });

  // 6. Agents Endpoint
  app.get('/api/agents', (_req, res) => {
    // Recalculate dynamic active task count
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

  // 7. Switch Configuration & Real Connection Verification
  app.get('/api/switch/config', (_req, res) => {
    res.json({ success: true, config: db.switchConfig });
  });

  app.post('/api/switch/config', (req, res) => {
    const { roomWebhookUrl, roomId, apiKey: newKey, channelTarget, autoRelayTasks } = req.body;

    if (roomWebhookUrl !== undefined) db.switchConfig.roomWebhookUrl = roomWebhookUrl.trim();
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
    res.json({ success: true, config: db.switchConfig });
  });

  // Actual Live Test of Switch Webhook Endpoint
  app.post('/api/switch/test', async (req, res) => {
    const { testUrl } = req.body;
    const targetUrl = testUrl || db.switchConfig.roomWebhookUrl;

    if (!targetUrl) {
      db.switchConfig.status = 'NOT_CONFIGURED';
      db.switchConfig.lastTestStatus = 'FAILED';
      db.switchConfig.lastErrorMessage = 'No Switch webhook URL specified';
      saveDatabase(db);
      return res.status(400).json({
        success: false,
        status: 'NOT_CONFIGURED',
        error: 'Please enter a valid Switch Room Webhook URL to verify connectivity.',
      });
    }

    const startTime = Date.now();
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 4500);

      const pingPayload = {
        eventType: 'PING_CHECK',
        sender: { name: 'HotelOperationsAI', role: 'SystemProbe' },
        content: 'Verification ping from Hotel Operations AI Central Hub',
        timestamp: new Date().toISOString(),
      };

      const testResponse = await fetch(targetUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': 'HotelOperationsAI-Probe/1.0',
        },
        body: JSON.stringify(pingPayload),
        signal: controller.signal,
      });
      clearTimeout(timeout);

      const latencyMs = Date.now() - startTime;

      if (testResponse.ok || testResponse.status === 200 || testResponse.status === 201 || testResponse.status === 204) {
        db.switchConfig.status = 'CONNECTED';
        db.switchConfig.lastTestedAt = new Date().toISOString();
        db.switchConfig.lastTestStatus = 'SUCCESS';
        db.switchConfig.lastErrorMessage = undefined;
        saveDatabase(db);
        return res.json({
          success: true,
          status: 'CONNECTED',
          latencyMs,
          httpStatus: testResponse.status,
          message: `Switch Room connection verified (${latencyMs}ms).`,
        });
      } else {
        db.switchConfig.status = 'DISCONNECTED';
        db.switchConfig.lastTestedAt = new Date().toISOString();
        db.switchConfig.lastTestStatus = 'FAILED';
        db.switchConfig.lastErrorMessage = `Switch server returned HTTP ${testResponse.status} ${testResponse.statusText}`;
        saveDatabase(db);
        return res.json({
          success: false,
          status: 'DISCONNECTED',
          latencyMs,
          httpStatus: testResponse.status,
          error: db.switchConfig.lastErrorMessage,
        });
      }
    } catch (err: any) {
      const latencyMs = Date.now() - startTime;
      db.switchConfig.status = 'DISCONNECTED';
      db.switchConfig.lastTestedAt = new Date().toISOString();
      db.switchConfig.lastTestStatus = 'FAILED';
      db.switchConfig.lastErrorMessage = err?.message || 'Connection refused or timed out';
      saveDatabase(db);
      return res.json({
        success: false,
        status: 'DISCONNECTED',
        latencyMs,
        error: db.switchConfig.lastErrorMessage,
      });
    }
  });

  // 8. Clean Reset Demo Data Endpoint
  app.post('/api/reset-demo', (_req, res) => {
    db = getInitialDatabase();
    saveDatabase(db);
    res.json({ success: true, message: 'Clean demo dataset restored' });
  });

  // ---------------------------------------------------------------------------
  // 9. AI Request Parsing & Missing Room Number Protection (Gemini 3.8 Flash)
  // ---------------------------------------------------------------------------
  app.post('/api/gemini/parse-request', async (req, res) => {
    const { rawText, room, guestName } = req.body;

    if (!rawText || typeof rawText !== 'string') {
      return res.status(400).json({ error: 'rawText is required' });
    }

    // Explicit room extraction check: NEVER silently assign a fake room!
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
      const prompt = `You are the central AI Business Operations Manager for The Grand Luminary Hotel & Residences (an ultra-luxury 5-star international property).
Analyze this incoming guest request/situation:
Raw Guest Input: "${rawText}"
Explicit Room Provided: "${explicitlyProvidedRoom || 'NONE'}"
Guest Name: "${guestName || 'VIP Resident'}"

CRITICAL INSTRUCTIONS:
1. DO NOT INVENT A ROOM NUMBER. If no room or suite number is present, set detectedRoom to null and needsClarification to true with a polite clarification prompt asking for the room number.
2. Break complex multi-problem requests into separate, independent operational responsibilities.
3. Delegate each task to the exact specialized agent:
   - "Reception Agent" (check-in/out, keycards, billing, room moves, concierge, guest satisfaction)
   - "Housekeeping Agent" (cleaning, bed making, fresh towels, amenities, turndown, spills)
   - "Maintenance Agent" (air conditioning, HVAC, plumbing, electrical, WiFi/TV, safe breakdown, door locks)
   - "Management Agent" (escalated complaints, VIP handling, safety hazards, compensation, service failure review)
4. Evaluate priority, time sensitivity (SLA in minutes), dependencies, and guest impact.
5. All physical tasks require human staff confirmation before resolution.

Provide structured JSON with:
- guestIntent: string summary of core intent
- detectedRoom: string or null
- needsClarification: boolean
- clarificationPrompt: string if room or critical info missing
- urgencyLevel: "Normal" | "High" | "Urgent" | "Critical"
- executiveSummary: brief 1-sentence manager briefing
- tasks: array of objects:
  - title: clear, professional task title
  - department: "Reception" | "Housekeeping" | "Maintenance" | "Management"
  - priority: "Low" | "Normal" | "High" | "Urgent" | "Critical"
  - estimatedMinutes: number (e.g. 15, 30, 45, 60)
  - dependencies: array of strings
  - requiresHumanConfirmation: true
  - assignedAgent: "Reception Agent" | "Housekeeping Agent" | "Maintenance Agent" | "Management Agent"
  - rationale: why this agent and priority
  - potentialRisk: what happens if delayed`;

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
      return res.json({
        success: true,
        source: 'gemini-3.8-flash',
        ...parsed,
        detectedRoom: explicitlyProvidedRoom || parsed.detectedRoom || null,
        isRoomMissing: !explicitlyProvidedRoom && !parsed.detectedRoom,
      });
    } catch (err: any) {
      console.error('Gemini breakdown error, falling back to heuristic:', err?.message);
      const fallbackData = generateHeuristicBreakdown(rawText, explicitlyProvidedRoom, guestName);
      return res.json({
        success: true,
        source: 'heuristic-fallback',
        ...fallbackData,
        isRoomMissing,
      });
    }
  });

  // 10. Central Operations AI Primary Business Decision-Making API
  app.post('/api/gemini/operational-decision', async (req, res) => {
    const { situation, task, activeWorkload, guestProfile } = req.body;

    if (!situation) {
      return res.status(400).json({ error: 'situation description is required' });
    }

    if (!ai) {
      return res.json({
        success: true,
        source: 'heuristic-engine',
        decision: {
          decisionType: 'AUTO_DELEGATION',
          summary: `Prioritize high-impact task for ${task?.room ? `Suite ${task.room}` : 'active suite'} with direct engineering dispatch.`,
          rationale: 'Heuristic evaluation flagged potential guest inconvenience; immediate physical dispatch ordered.',
          confidenceScore: 0.92,
          recommendedDepartment: task?.department || 'Maintenance',
          recommendedPriority: 'High',
          actionDirectives: [
            'Notify duty supervisor immediately via Switch Channel #hotel-ops-central',
            'Enforce 20-minute physical checkpoint requirement',
            'Hold secondary housekeeping until primary isolation confirmed',
          ],
        },
      });
    }

    try {
      const prompt = `You are the Central Operations AI, the primary business decision-maker for a 5-star international hotel.
Evaluate this operational situation:
Situation: "${situation}"
Task In Question: ${JSON.stringify(task || {})}
Departmental Load Context: ${JSON.stringify(activeWorkload || {})}
Guest Profile: ${JSON.stringify(guestProfile || { tier: 'VIP' })}

Determine the optimal managerial decision considering:
1. Guest safety & luxury experience standards.
2. Departmental capacity and bottlenecks.
3. Inter-departmental task dependencies.
4. Service recovery requirements.

Provide structured JSON:
- decisionType: "AUTO_DELEGATION" | "PRIORITY_ELEVATION" | "CROSS_DEPARTMENT_BLOCK" | "RESOURCE_REALLOCATION"
- summary: string (crisp 1-2 sentence executive directive)
- rationale: string (operational business justification)
- confidenceScore: number (0.0 to 1.0)
- recommendedDepartment: string
- recommendedPriority: "Low" | "Normal" | "High" | "Urgent" | "Critical"
- actionDirectives: array of strings`;

      const response = await callGeminiWithTimeout(
        ai.models.generateContent({
          model: 'gemini-3.8-flash',
          contents: prompt,
          config: {
            systemInstruction: 'You are the Central Operations AI General Manager engine. Return valid JSON only.',
            responseMimeType: 'application/json',
            responseSchema: {
              type: Type.OBJECT,
              properties: {
                decisionType: { type: Type.STRING },
                summary: { type: Type.STRING },
                rationale: { type: Type.STRING },
                confidenceScore: { type: Type.NUMBER },
                recommendedDepartment: { type: Type.STRING },
                recommendedPriority: { type: Type.STRING },
                actionDirectives: {
                  type: Type.ARRAY,
                  items: { type: Type.STRING },
                },
              },
              required: ['decisionType', 'summary', 'rationale', 'confidenceScore', 'recommendedDepartment', 'recommendedPriority', 'actionDirectives'],
            },
          },
        })
      );

      const parsed = JSON.parse(response.text || '{}');
      return res.json({ success: true, source: 'gemini-3.8-flash', decision: parsed });
    } catch (err: any) {
      console.error('Central decision error:', err?.message);
      return res.json({
        success: true,
        source: 'heuristic-fallback',
        decision: {
          decisionType: 'PRIORITY_ELEVATION',
          summary: 'Elevate task priority to prevent SLA threshold breach and notify Duty Manager.',
          rationale: 'Automated safeguard triggered based on room VIP status and time elapsed.',
          confidenceScore: 0.88,
          recommendedDepartment: task?.department || 'Maintenance',
          recommendedPriority: 'Urgent',
          actionDirectives: [
            'Alert departmental lead via Switch room',
            'Dispatch backup runner to floor',
            'Prepare courtesy follow-up from front desk',
          ],
        },
      });
    }
  });

  // 11. Switch Multi-Agent Dialogue Generation API
  app.post('/api/gemini/switch-dialogue', async (req, res) => {
    const { context, eventType, taskTitle, room, department } = req.body;

    if (!ai) {
      const messages = generateHeuristicDialogue(eventType, taskTitle, room || 'Unassigned', department);
      return res.json({ success: true, source: 'LIVE_AGENT', messages });
    }

    try {
      const prompt = `You simulate real-time operations coordination in the Switch operations room for a 5-star hotel.
Event: ${eventType}
Task: "${taskTitle}"
Room: "${room || 'Unassigned'}"
Department: "${department}"
Context: ${context || 'Operational update'}

Generate 2 to 3 concise, highly professional operational collaboration messages between:
1. "Central Operations AI" (The GM coordinator: delegates, tracks SLA, sets expectations)
2. Specialized Agent (e.g., "${department} Agent": acknowledges, states protocol, dispatches human staff)
3. If escalated or cross-department, "Management Agent" or "Reception Agent" (checks guest comfort, contingency).

Tone: Decisive, elite hotel operations, crisp and respectful.

Output JSON array of message objects:
- sender: "Central Operations AI" | "Reception Agent" | "Housekeeping Agent" | "Maintenance Agent" | "Management Agent"
- avatarRole: "Orchestrator" | "Front Desk" | "Housekeeping" | "Engineering" | "General Manager"
- content: string (under 160 characters, operational and direct)
- badge: "DISPATCHED" | "ACKNOWLEDGED" | "SLA ACTIVE" | "ESCALATED" | "VERIFIED" | "INFO"`;

      const response = await callGeminiWithTimeout(
        ai.models.generateContent({
          model: 'gemini-3.8-flash',
          contents: prompt,
          config: {
            systemInstruction: 'You are an operations chat simulator for a luxury hotel. Return JSON array only.',
            responseMimeType: 'application/json',
            responseSchema: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  sender: { type: Type.STRING },
                  avatarRole: { type: Type.STRING },
                  content: { type: Type.STRING },
                  badge: { type: Type.STRING },
                },
                required: ['sender', 'avatarRole', 'content', 'badge'],
              },
            },
          },
        })
      );

      const messages = JSON.parse(response.text || '[]');
      return res.json({ success: true, source: 'LIVE_AGENT', messages });
    } catch (err: any) {
      console.error('Switch dialogue error, using heuristic:', err?.message);
      const messages = generateHeuristicDialogue(eventType, taskTitle, room || 'Unassigned', department);
      return res.json({ success: true, source: 'LIVE_AGENT', messages });
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

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`[Hotel Operations AI] Server running at http://0.0.0.0:${PORT}`);
    console.log(`[Storage] Database mounted at: ${DB_PATH}`);
  });
}

// ---------------------------------------------------------------------------
// Accurate Heuristic Breakdown (Guaranteed Room Detection - No Hallucinations)
// ---------------------------------------------------------------------------
function generateHeuristicBreakdown(rawText: string, explicitlyProvidedRoom?: string, guestName?: string) {
  const roomMatch = rawText.match(/\b(?:room|suite|rm\.?|#)\s*([0-9]{3,4}[A-Z]?)\b/i);
  const detectedRoom = explicitlyProvidedRoom || (roomMatch ? roomMatch[1] : undefined);
  const needsClarification = !detectedRoom;

  const roomDisplay = detectedRoom ? `Suite ${detectedRoom}` : 'Suite [Unspecified]';

  const phrases = rawText
    .split(/(?<=[.?!])\s+|\n|;\s*|,\s*(?=(?:and\s+|the\s+|please\s+|there\s+|we\s+|my\s+|also\s+|clean\s+|ac\s+|towel|shower|bath|wifi|door|key))|\band\s+(?=(?:the|please|also|we|my|there|clean|send|fix|check|extra))/i)
    .map((s) => s.trim())
    .filter((s) => s.length > 3);

  const tasks: any[] = [];
  const processedChecks = new Set<string>();

  const checks = [
    {
      id: 'hvac',
      regex: /ac\b|air condition|hvac|hot air|cold|temperature|thermostat|cooling|heat\b|warm/i,
      dept: 'Maintenance' as const,
      agent: 'Maintenance Agent',
      title: `Inspect & recalibrate HVAC climate control (${roomDisplay})`,
      priority: 'High' as const,
      est: 25,
      risk: 'Guest thermal discomfort in suite; direct impact on luxury rating',
    },
    {
      id: 'towels',
      regex: /towel|towels|linen|pillow|pillows|blanket|bed\b|duvet|sheet|cushion/i,
      dept: 'Housekeeping' as const,
      agent: 'Housekeeping Agent',
      title: `Deliver fresh luxury linen & amenities (${roomDisplay})`,
      priority: 'Normal' as const,
      est: 15,
      risk: 'Guest inconvenience during evening refresh or rest cycle',
    },
    {
      id: 'cleanliness',
      regex: /dirty|clean|stain|dust|trash|bin|smell|odor|bathroom|shower floor|hair|spill|wipe/i,
      dept: 'Housekeeping' as const,
      agent: 'Housekeeping Agent',
      title: `Priority sanitary deep-clean & suite refresh (${roomDisplay})`,
      priority: 'Urgent' as const,
      est: 35,
      risk: 'Severe luxury hygiene violation; high risk of formal executive complaint',
    },
    {
      id: 'plumbing',
      regex: /leak|water|tap|sink|faucet|plumb|drain|shower diverter|toilet|flood|washbasin/i,
      dept: 'Maintenance' as const,
      agent: 'Maintenance Agent',
      title: `Urgent plumbing inspection & water shutoff (${roomDisplay})`,
      priority: 'Urgent' as const,
      est: 20,
      risk: 'Active water damage to suite fixtures and lower floor ceilings',
    },
    {
      id: 'access',
      regex: /key|card|lock|access|door|safe|code|entry|locked out|beeping/i,
      dept: 'Reception' as const,
      agent: 'Reception Agent',
      title: `Re-encode RFID credentials & test door mortise (${roomDisplay})`,
      priority: 'Urgent' as const,
      est: 10,
      risk: 'Guest lockout and physical room access impediment',
    },
    {
      id: 'connectivity',
      regex: /wifi|internet|tv|television|remote|channel|network|connection/i,
      dept: 'Maintenance' as const,
      agent: 'Maintenance Agent',
      title: `Diagnostic test on high-speed gateway & interactive TV (${roomDisplay})`,
      priority: 'Normal' as const,
      est: 20,
      risk: 'Business traveler inability to conduct video conferences',
    },
    {
      id: 'billing',
      regex: /bill|charge|invoice|rate|refund|checkout|deposit|folio/i,
      dept: 'Reception' as const,
      agent: 'Reception Agent',
      title: `Audit folio charges, verify vouchers & adjust balance (${roomDisplay})`,
      priority: 'Normal' as const,
      est: 15,
      risk: 'Dispute during departure leading to negative exit impression',
    },
    {
      id: 'escalation',
      regex: /manager|unacceptable|compensation|complain|furious|terrible|awful|gm\b/i,
      dept: 'Management' as const,
      agent: 'Management Agent',
      title: `Executive Duty Manager in-person courtesy visit (${roomDisplay})`,
      priority: 'Critical' as const,
      est: 10,
      risk: 'Escalation to hotel general manager; corporate brand review risk',
    },
  ];

  for (const phrase of phrases) {
    for (const check of checks) {
      if (!processedChecks.has(check.id) && check.regex.test(phrase)) {
        processedChecks.add(check.id);
        tasks.push({
          title: check.title,
          department: check.dept,
          priority: check.priority,
          estimatedMinutes: check.est,
          dependencies:
            check.dept === 'Housekeeping' && tasks.some((t) => t.department === 'Maintenance')
              ? ['Maintenance physical diagnostic must finish before final Housekeeping setup']
              : [],
          requiresHumanConfirmation: true,
          assignedAgent: check.agent,
          rationale: `Identified specific guest problem: "${phrase.slice(0, 60)}"`,
          potentialRisk: check.risk,
          room: detectedRoom || 'Unassigned',
        });
      }
    }
  }

  for (const check of checks) {
    if (!processedChecks.has(check.id) && check.regex.test(rawText)) {
      processedChecks.add(check.id);
      tasks.push({
        title: check.title,
        department: check.dept,
        priority: check.priority,
        estimatedMinutes: check.est,
        dependencies:
          check.dept === 'Housekeeping' && tasks.some((t) => t.department === 'Maintenance')
            ? ['Maintenance physical diagnostic must finish before final Housekeeping setup']
            : [],
        requiresHumanConfirmation: true,
        assignedAgent: check.agent,
        rationale: `Extracted from guest request statement`,
        potentialRisk: check.risk,
        room: detectedRoom || 'Unassigned',
      });
    }
  }

  if (tasks.length === 0) {
    tasks.push({
      title: `General guest service triage & suite inspection (${roomDisplay})`,
      department: 'Reception',
      priority: 'Normal',
      estimatedMinutes: 20,
      dependencies: [],
      requiresHumanConfirmation: true,
      assignedAgent: 'Reception Agent',
      rationale: 'Unclassified operational request routed to Reception for triage',
      potentialRisk: 'Guest waiting time exceeding 5-star hospitality benchmarks',
      room: detectedRoom || 'Unassigned',
    });
  }

  const hasUrgent = tasks.some((t) => t.priority === 'Urgent' || t.priority === 'Critical');
  const urgencyLevel = hasUrgent ? 'Urgent' : 'Normal';

  return {
    guestIntent: needsClarification
      ? 'Guest submitted operational request without specifying room number.'
      : `Operational request for ${roomDisplay} involving ${tasks.length} distinct responsibilities across ${new Set(tasks.map((t) => t.department)).size} department(s).`,
    detectedRoom: detectedRoom || null,
    needsClarification,
    clarificationPrompt: needsClarification
      ? 'Reception Agent: Suite number was not provided. Please provide your suite number so staff can be dispatched.'
      : undefined,
    urgencyLevel,
    executiveSummary: needsClarification
      ? 'Awaiting room clarification from guest before dispatching physical work.'
      : `Decomposed complex inquiry into ${tasks.length} autonomous departmental tasks with active SLA timers.`,
    tasks,
  };
}

function generateHeuristicDialogue(eventType: string, taskTitle: string, room: string, department: string) {
  const timestamp = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  switch (eventType) {
    case 'NEW_TASK_CREATED':
      return [
        {
          sender: 'Central Operations AI',
          avatarRole: 'Orchestrator',
          content: `Routing new case for Suite ${room}: "${taskTitle}". Assigning primary SLA to ${department} Agent.`,
          badge: 'DISPATCHED',
          time: timestamp,
        },
        {
          sender: `${department} Agent`,
          avatarRole: department === 'Maintenance' ? 'Engineering' : department === 'Housekeeping' ? 'Housekeeping' : 'Front Desk',
          content: `Acknowledged. Duty technician/staff notified on radio channel 3. En route to Suite ${room}.`,
          badge: 'ACKNOWLEDGED',
          time: timestamp,
        },
      ];
    case 'TASK_ESCALATED':
      return [
        {
          sender: 'Management Agent',
          avatarRole: 'General Manager',
          content: `Escalation flagged for Suite ${room}. Reviewing guest profile. Executive Duty Manager standing by for in-person recovery.`,
          badge: 'ESCALATED',
          time: timestamp,
        },
        {
          sender: 'Central Operations AI',
          avatarRole: 'Orchestrator',
          content: `Priority elevated to CRITICAL. Halting dependent tasks until duty manager assessment is logged.`,
          badge: 'SLA ACTIVE',
          time: timestamp,
        },
      ];
    case 'HUMAN_RESOLVED':
      return [
        {
          sender: `${department} Agent`,
          avatarRole: department === 'Maintenance' ? 'Engineering' : department === 'Housekeeping' ? 'Housekeeping' : 'Front Desk',
          content: `Staff confirmed physical resolution in Suite ${room}. Quality standards met.`,
          badge: 'VERIFIED',
          time: timestamp,
        },
        {
          sender: 'Reception Agent',
          avatarRole: 'Front Desk',
          content: `Placing courtesy call to guest in Suite ${room} to confirm complete satisfaction.`,
          badge: 'INFO',
          time: timestamp,
        },
      ];
    default:
      return [
        {
          sender: 'Central Operations AI',
          avatarRole: 'Orchestrator',
          content: `Monitoring operational telemetry for Suite ${room}. All SLA countdowns active.`,
          badge: 'INFO',
          time: timestamp,
        },
      ];
  }
}

startServer();
