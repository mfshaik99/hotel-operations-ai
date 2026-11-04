export type Department = 'Reception' | 'Housekeeping' | 'Maintenance' | 'Management';

export type Priority = 'Low' | 'Normal' | 'High' | 'Urgent' | 'Critical';

export type TaskStatus = 'Open' | 'Dispatched' | 'In Progress' | 'Escalated' | 'Resolved';

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
}
