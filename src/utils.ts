import { Department, CaseItem, ActivityItem } from './types';

export const INITIAL_CASES: CaseItem[] = [
  {
    id: "HO-0201",
    room: "204",
    title: "AC is not cooling",
    department: "Maintenance",
    priority: "High",
    status: "In progress",
    source: "Reception",
    created: "Just now"
  },
  {
    id: "HO-0202",
    room: "204",
    title: "Send two extra towels",
    department: "Housekeeping",
    priority: "Normal",
    status: "Open",
    source: "Reception",
    created: "Just now"
  },
  {
    id: "HO-0198",
    room: "108",
    title: "Bathroom tap is leaking",
    department: "Maintenance",
    priority: "Urgent",
    status: "Open",
    source: "Phone",
    created: "12 min ago"
  }
];

export const INITIAL_ACTIVITIES: ActivityItem[] = [
  {
    id: "act-1",
    title: "Reception logged request",
    detail: "Room 204 · Two guest requests received",
    timestamp: "Just now"
  },
  {
    id: "act-2",
    title: "Housekeeping assigned",
    detail: "Room 204 · Extra towels",
    timestamp: "Just now"
  },
  {
    id: "act-3",
    title: "Maintenance assigned",
    detail: "Room 204 · AC not cooling",
    timestamp: "Just now"
  }
];

export function departmentFor(s: string): Department {
  const x = s.toLowerCase();
  if (/ac|air condition|electric|power|light|plug|socket|tap|leak|plumb|toilet|shower|heater|broken|repair|fault|tv|remote|door lock|safe/.test(x)) {
    return "Maintenance";
  }
  if (/towel|pillow|clean|linen|blanket|soap|amenit|room service|water bottle|bed sheet|trash|shampoo|iron|slippers/.test(x)) {
    return "Housekeeping";
  }
  return "Reception";
}

export function getStatusBadgeClass(status: string): string {
  switch (status) {
    case 'Resolved':
      return 'resolved';
    case 'In progress':
      return 'progress';
    case 'Escalated':
      return 'escalated';
    default:
      return 'open';
  }
}
