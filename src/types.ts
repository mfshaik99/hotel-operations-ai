export type Department = 'Maintenance' | 'Housekeeping' | 'Reception';
export type Priority = 'Normal' | 'High' | 'Urgent';
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
  | 'departments' 
  | 'activity' 
  | 'dept-reception' 
  | 'dept-housekeeping' 
  | 'dept-maintenance';
