export type Department = 'Reception' | 'Housekeeping' | 'Maintenance' | 'Management';

export type Priority = 'Low' | 'Normal' | 'High' | 'Urgent' | 'Critical';

export type TaskStatus = 'Open' | 'Dispatched' | 'In Progress' | 'Escalated' | 'Resolved';

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
export type NavTab = 'overview' | 'requests' | 'departments' | 'activity' | 'dept-reception' | 'dept-housekeeping' | 'dept-maintenance';

export type MessageSourceType = 'LIVE_AGENT' | 'SWITCH_PROTOCOL' | 'DEMO_SEED';

export interface TaskAuditEntry {
  id: string;
  timestamp: number;
  actor: string;
  actorRole: string;
  action: 'CREATED' | 'ROUTED' | 'DISPATCHED' | 'ACCEPTED' | 'ESCALATED' | 'HUMAN_VERIFIED' | 'NOTE_ADDED';
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
  department?: Department;
  content: string;
  badge?: 'DISPATCHED' | 'ACKNOWLEDGED' | 'SLA ACTIVE' | 'ESCALATED' | 'VERIFIED' | 'INFO' | 'ALERT';
  timestamp: string;
  taskId?: string;
  room?: string;
  sourceType: MessageSourceType;
  switchPayload?: SwitchProtocolPayload;
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
