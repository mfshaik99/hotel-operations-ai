export type Department = 'Reception' | 'Housekeeping' | 'Maintenance' | 'Management';

export type Priority = 'Low' | 'Normal' | 'High' | 'Urgent' | 'Critical';

export type TaskStatus =
  | 'Open'
  | 'Dispatched'
  | 'In Progress'
  | 'Completion Pending Confirmation'
  | 'Escalated'
  | 'Resolved'
  | 'Rejected';

// 10-Stage Reliable Task Lifecycle
export type LifecycleStage =
  | 'REQUEST_RECEIVED'
  | 'ANALYZING'
  | 'TASK_CREATED'
  | 'ASSIGNED'
  | 'DELIVERY_PENDING'
  | 'DELIVERED'
  | 'ACCEPTED'
  | 'IN_PROGRESS'
  | 'COMPLETION_PENDING_CONFIRMATION'
  | 'RESOLVED'
  | 'ESCALATED'
  | 'REJECTED';

export type DeliveryState =
  | 'PENDING_DELIVERY'
  | 'DELIVERED'
  | 'ACKNOWLEDGED'
  | 'IN_PROGRESS'
  | 'AWAITING_HUMAN_CONFIRMATION'
  | 'COMPLETED'
  | 'DELIVERY_FAILED'
  | 'LOCAL_MESH';

// Backward compatibility aliases
export type Status = 'Open' | 'In progress' | 'Resolved' | 'Escalated';
export type Source = 'Reception' | 'Phone' | 'Front desk' | 'Chat';

export interface CaseItem {
  id: string;
  room: string;
  title: string;
  department: Department;
  priority: Priority;
  status: Status;
  source: Source;
  created: string;
  completedBy?: string;
  assignedTo?: string;
}

export interface ActivityItem {
  id: string;
  title: string;
  detail: string;
  timestamp: string;
}

export type NavTab =
  | 'overview'
  | 'requests'
  | 'tasks'
  | 'team-chat'
  | 'switch'
  | 'agents'
  | 'intelligence'
  | 'settings'
  | 'departments'
  | 'activity'
  | 'dept-reception'
  | 'dept-housekeeping'
  | 'dept-maintenance';

export type MessageSourceType =
  | 'LIVE_STAFF'
  | 'LIVE_AGENT'
  | 'SWITCH_PROTOCOL'
  | 'DEMO_WORKFLOW'
  | 'DEMO_SEED';

export type ParticipantType = 'HUMAN' | 'AI_AGENT' | 'SYSTEM';

export interface ChatParticipant {
  id: string;
  name: string;
  role: string;
  type: ParticipantType;
  department: Department;
  avatar: string;
  status: 'online' | 'busy' | 'offline';
  isTyping?: boolean;
  avatarBg?: string;
}

export interface TaskAuditEntry {
  id: string;
  timestamp: number;
  actor: string;
  actorRole: string;
  action:
    | 'CREATED'
    | 'ROUTED'
    | 'DISPATCHED'
    | 'DELIVERY_CONFIRMED'
    | 'ACCEPTED'
    | 'ESCALATED'
    | 'HUMAN_VERIFIED'
    | 'NOTE_ADDED';
  note: string;
}

export interface Task {
  id: string;
  caseRef: string;
  room: string;
  title: string;
  description: string;
  department: Department;
  assignedAgent: string;
  priority: Priority;
  status: TaskStatus;
  lifecycleStage?: LifecycleStage;
  deliveryStatus?: DeliveryState;
  createdAt: number; // timestamp
  slaDeadline: number; // timestamp
  estimatedMinutes: number;
  dependencies: string[];
  requiresHumanConfirmation: boolean;
  resolvedBy?: string;
  resolvedAt?: number;
  resolutionNotes?: string;
  escalationReason?: string;
  guestName?: string;
  riskAssessment?: string;
  isRepeatedIssue?: boolean;
  isDemoData?: boolean;
  auditTrail: TaskAuditEntry[];
}

export interface GuestRequest {
  id: string;
  rawText: string;
  detectedRoom?: string;
  guestName?: string;
  status: 'AWAITING_CLARIFICATION' | 'DECOMPOSED' | 'ROUTED' | 'IN_PROGRESS' | 'COMPLETED';
  missingFields?: string[];
  clarificationNeeded?: boolean;
  clarificationQuestion?: string;
  createdTaskIds: string[];
  createdAt: number;
  urgencyLevel?: Priority;
  executiveSummary?: string;
  isDemoData?: boolean;
}

export interface AgentProfile {
  id: string;
  name: string;
  role: string;
  department: Department;
  avatar: string;
  status: 'Active' | 'High Load' | 'Investigating' | 'Available';
  activeTasksCount: number;
  avgResponseMins: number;
  specialty: string;
  autonomyLevel: 'Full Delegated Authority' | 'Supervisor Review Required' | 'Executive Clearance Only';
  activeProtocols: string[];
  switchStatus?: 'CONNECTED' | 'DISCONNECTED' | 'STANDBY';
  recentActionsCount?: number;
}

export interface SwitchProtocolPayload {
  protocolVersion: string;
  eventId: string;
  senderId: string;
  targetDepartment?: Department;
  actionType: string;
  acknowledgedByHuman: boolean;
}

export interface SwitchMessage {
  id: string;
  sender: string;
  avatarRole: string;
  senderType?: ParticipantType;
  department?: Department;
  content: string;
  badge?: 'DISPATCHED' | 'ACKNOWLEDGED' | 'SLA ACTIVE' | 'ESCALATED' | 'VERIFIED' | 'INFO' | 'ALERT';
  timestamp: string;
  taskId?: string;
  referencedTaskIds?: string[];
  room?: string;
  channel?: string;
  sourceType: MessageSourceType;
  deliveryState?: 'DELIVERED' | 'PENDING' | 'FAILED' | 'LOCAL_MESH' | 'SENDING' | 'ACKNOWLEDGED';
  switchPayload?: SwitchProtocolPayload;
}

export interface SwitchConfig {
  status: 'NOT_CONFIGURED' | 'DISCONNECTED' | 'CONNECTED' | 'CONNECTION_FAILED';
  roomWebhookUrl: string;
  roomId: string;
  apiKey: string; // Redacted when sent over wire
  channelTarget: string;
  lastTestedAt?: string;
  lastTestStatus?: 'SUCCESS' | 'FAILED' | 'NOT_TESTED';
  lastErrorMessage?: string;
  autoRelayTasks: boolean;
  totalDelivered: number;
}

export interface SwitchConnectionState {
  status: 'STANDBY_LOCAL' | 'CONNECTED_LIVE' | 'CONNECTING';
  protocolVersion: string;
  busEndpoint: string;
  activeAgentsCount: number;
  lastHeartbeat: string;
  totalEventsProcessed: number;
  isVerifiedIntegration: boolean;
}

export interface OperationalAlert {
  id: string;
  type: 'SLA_BREACH_RISK' | 'REPEATED_COMPLAINT' | 'WORKLOAD_SPIKE' | 'CROSS_DEPARTMENT_CLUSTER';
  title: string;
  description: string;
  affectedRoomOrDept: string;
  severity: 'Medium' | 'High' | 'Critical';
  recommendedAction: string;
  timestamp: string;
  isDemoAlert?: boolean;
  resolved?: boolean;
}

export interface AgentDecision {
  id: string;
  agent: string;
  department: Department;
  decisionType: 'AUTO_DELEGATION' | 'PRIORITY_ELEVATION' | 'CROSS_DEPARTMENT_BLOCK' | 'RESOURCE_REALLOCATION';
  summary: string;
  rationale: string;
  confidenceScore: number;
  timestamp: number;
}
