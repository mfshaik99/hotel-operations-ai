import React, { useState, useEffect } from 'react';
import {
  Search,
  Filter,
  Clock,
  AlertTriangle,
  ArrowUpRight,
  CheckCircle,
  ShieldCheck,
  ChevronRight,
  User,
  Sparkles,
  Link,
  Flame,
} from 'lucide-react';
import { Task, Department, TaskStatus } from '../types';

interface TaskQueueProps {
  tasks: Task[];
  onAcceptTask: (taskId: string) => void;
  onEscalateTask: (taskId: string, reason?: string) => void;
  onRequestVerification: (task: Task) => void;
  onSelectTask: (task: Task) => void;
}

export const TaskQueue: React.FC<TaskQueueProps> = ({
  tasks,
  onAcceptTask,
  onEscalateTask,
  onRequestVerification,
  onSelectTask,
}) => {
  const [search, setSearch] = useState('');
  const [selectedDept, setSelectedDept] = useState<string>('All');
  const [selectedStatus, setSelectedStatus] = useState<string>('All');
  const [currentTime, setCurrentTime] = useState(Date.now());

  // Update clock every 10 seconds for real-time SLA countdowns
  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(Date.now()), 10000);
    return () => clearInterval(timer);
  }, []);

  const filteredTasks = tasks.filter((task) => {
    const matchesSearch =
      task.room.toLowerCase().includes(search.toLowerCase()) ||
      task.title.toLowerCase().includes(search.toLowerCase()) ||
      task.caseRef.toLowerCase().includes(search.toLowerCase()) ||
      (task.guestName && task.guestName.toLowerCase().includes(search.toLowerCase()));

    const matchesDept = selectedDept === 'All' || task.department === selectedDept;

    const matchesStatus =
      selectedStatus === 'All'
        ? true
        : selectedStatus === 'Active'
        ? task.status === 'Open' || task.status === 'Dispatched' || task.status === 'In Progress'
        : task.status === selectedStatus;

    return matchesSearch && matchesDept && matchesStatus;
  });

  const getSlaBadge = (task: Task) => {
    if (task.status === 'Resolved') {
      return (
        <span className="text-[11px] font-mono text-emerald-400 flex items-center gap-1">
          <CheckCircle className="w-3.5 h-3.5" />
          Resolved
        </span>
      );
    }

    const diffMins = Math.round((task.slaDeadline - currentTime) / (60 * 1000));
    if (diffMins < 0) {
      return (
        <span className="text-[11px] font-mono text-rose-400 font-semibold flex items-center gap-1">
          <Flame className="w-3.5 h-3.5" />
          Overdue +{Math.abs(diffMins)}m
        </span>
      );
    }
    if (diffMins <= 10) {
      return (
        <span className="text-[11px] font-mono text-amber-400 font-semibold flex items-center gap-1">
          <Clock className="w-3.5 h-3.5" />
          {diffMins}m left
        </span>
      );
    }
    return (
      <span className="text-[11px] font-mono text-slate-400 flex items-center gap-1">
        <Clock className="w-3.5 h-3.5 text-slate-500" />
        {diffMins}m SLA
      </span>
    );
  };

  const getPriorityStyle = (priority: string) => {
    switch (priority) {
      case 'Critical':
        return 'text-rose-400 bg-rose-500/10 border-rose-500/30';
      case 'Urgent':
        return 'text-amber-400 bg-amber-500/10 border-amber-500/30';
      case 'High':
        return 'text-orange-400 bg-orange-500/10 border-orange-500/30';
      default:
        return 'text-slate-400 bg-slate-800/60 border-slate-700/60';
    }
  };

  const getStatusStyle = (status: TaskStatus) => {
    switch (status) {
      case 'Resolved':
        return 'text-emerald-400 bg-emerald-500/10 border-emerald-500/30';
      case 'In Progress':
        return 'text-sky-400 bg-sky-500/10 border-sky-500/30';
      case 'Escalated':
        return 'text-rose-400 bg-rose-500/10 border-rose-500/30 animate-pulse';
      case 'Dispatched':
        return 'text-indigo-400 bg-indigo-500/10 border-indigo-500/30';
      default:
        return 'text-amber-400 bg-amber-500/10 border-amber-500/30';
    }
  };

  return (
    <div className="space-y-4">
      {/* Search & Filter Bar */}
      <div className="bg-slate-900/90 border border-slate-800 p-4 rounded-xl flex flex-col md:flex-row md:items-center justify-between gap-4">
        {/* Search */}
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by Suite #, Guest name, Case ID or issue..."
            className="w-full bg-slate-950 border border-slate-800 rounded-lg pl-9 pr-4 py-2 text-xs text-slate-100 placeholder:text-slate-600 focus:outline-none focus:border-amber-500/50"
          />
        </div>

        {/* Filter Tabs */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Department Filter */}
          <div className="flex items-center gap-1 bg-slate-950 p-1 rounded-lg border border-slate-800">
            {['All', 'Reception', 'Housekeeping', 'Maintenance', 'Management'].map((dept) => (
              <button
                key={dept}
                onClick={() => setSelectedDept(dept)}
                className={`px-2.5 py-1 text-[11px] font-medium rounded-md transition-colors whitespace-nowrap ${
                  selectedDept === dept
                    ? 'bg-amber-500/20 text-amber-300 font-semibold'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                {dept}
              </button>
            ))}
          </div>

          {/* Status Filter */}
          <div className="flex items-center gap-1 bg-slate-950 p-1 rounded-lg border border-slate-800">
            {['All', 'Active', 'In Progress', 'Escalated', 'Resolved'].map((st) => (
              <button
                key={st}
                onClick={() => setSelectedStatus(st)}
                className={`px-2.5 py-1 text-[11px] font-medium rounded-md transition-colors whitespace-nowrap ${
                  selectedStatus === st
                    ? 'bg-amber-500/20 text-amber-300 font-semibold'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                {st}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* High-Density Data Grid */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-800 bg-slate-950/70 text-[11px] uppercase tracking-wider font-mono text-slate-400">
                <th className="py-3 px-4">Case / Suite</th>
                <th className="py-3 px-4">Operational Responsibility</th>
                <th className="py-3 px-4">Assigned Agent & Dept</th>
                <th className="py-3 px-4">Priority</th>
                <th className="py-3 px-4">SLA Countdown</th>
                <th className="py-3 px-4">Status</th>
                <th className="py-3 px-4 text-right">Human Verification & Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60 text-xs">
              {filteredTasks.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-12 text-center text-slate-500">
                    No matching hotel operations cases found.
                  </td>
                </tr>
              ) : (
                filteredTasks.map((task) => {
                  return (
                    <tr
                      key={task.id}
                      className="hover:bg-slate-800/40 transition-colors group cursor-pointer"
                      onClick={() => onSelectTask(task)}
                    >
                      {/* Case / Suite */}
                      <td className="py-3.5 px-4 whitespace-nowrap">
                        <div className="font-mono font-semibold text-slate-200">
                          {task.caseRef}
                        </div>
                        <div className="text-[11px] text-amber-400/90 font-medium">
                          Suite {task.room}
                        </div>
                        {task.guestName && (
                          <div className="text-[10px] text-slate-400 truncate max-w-[130px]">
                            {task.guestName}
                          </div>
                        )}
                      </td>

                      {/* Title & Dependencies */}
                      <td className="py-3.5 px-4 min-w-[280px]">
                        <div className="font-medium text-slate-100 group-hover:text-amber-300 transition-colors">
                          {task.title}
                        </div>
                        {task.dependencies && task.dependencies.length > 0 && (
                          <div className="text-[11px] text-indigo-400 flex items-center gap-1 mt-0.5">
                            <Link className="w-3 h-3 text-indigo-400/80" />
                            <span className="truncate max-w-[260px]">{task.dependencies[0]}</span>
                          </div>
                        )}
                        {task.isRepeatedIssue && (
                          <div className="text-[10px] font-mono text-rose-400 flex items-center gap-1 mt-0.5">
                            <AlertTriangle className="w-3 h-3" />
                            <span>Repeated complaint in this suite</span>
                          </div>
                        )}
                      </td>

                      {/* Agent & Dept */}
                      <td className="py-3.5 px-4 whitespace-nowrap">
                        <div className="font-medium text-slate-200">
                          {task.assignedAgent}
                        </div>
                        <div className="text-[11px] text-slate-400">
                          {task.department}
                        </div>
                      </td>

                      {/* Priority */}
                      <td className="py-3.5 px-4 whitespace-nowrap">
                        <span
                          className={`text-[10px] font-mono font-semibold px-2 py-0.5 rounded border ${getPriorityStyle(
                            task.priority
                          )}`}
                        >
                          {task.priority}
                        </span>
                      </td>

                      {/* SLA */}
                      <td className="py-3.5 px-4 whitespace-nowrap">
                        {getSlaBadge(task)}
                      </td>

                      {/* Status */}
                      <td className="py-3.5 px-4 whitespace-nowrap">
                        <span
                          className={`text-[10px] font-mono font-semibold px-2 py-0.5 rounded border ${getStatusStyle(
                            task.status
                          )}`}
                        >
                          {task.status}
                        </span>
                      </td>

                      {/* Actions */}
                      <td
                        className="py-3.5 px-4 text-right whitespace-nowrap"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <div className="flex items-center justify-end gap-1.5">
                          {task.status === 'Open' || task.status === 'Dispatched' ? (
                            <button
                              onClick={() => onAcceptTask(task.id)}
                              className="px-2.5 py-1 text-[11px] font-semibold text-slate-900 bg-sky-400 hover:bg-sky-300 rounded shadow-xs transition-colors"
                            >
                              Accept & Start
                            </button>
                          ) : null}

                          {task.status !== 'Resolved' ? (
                            <button
                              onClick={() => onRequestVerification(task)}
                              className="px-2.5 py-1 text-[11px] font-semibold text-slate-950 bg-emerald-400 hover:bg-emerald-300 rounded shadow-xs transition-colors flex items-center gap-1"
                            >
                              <ShieldCheck className="w-3 h-3" />
                              Confirm Done
                            </button>
                          ) : (
                            <span className="text-[11px] text-slate-500 font-mono">
                              Signed: {task.resolvedBy?.slice(0, 16)}...
                            </span>
                          )}

                          {task.status !== 'Resolved' && task.status !== 'Escalated' ? (
                            <button
                              onClick={() => onEscalateTask(task.id, 'Delayed past 5-star threshold')}
                              title="Escalate to General Management Agent"
                              className="px-2 py-1 text-[11px] font-medium text-rose-400 hover:text-rose-200 hover:bg-rose-500/10 rounded border border-rose-500/20 transition-colors"
                            >
                              Escalate
                            </button>
                          ) : null}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Footer Note */}
        <div className="p-3 bg-slate-950/60 border-t border-slate-800 text-[11px] text-slate-400 flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            <ShieldCheck className="w-4 h-4 text-emerald-400" />
            <span>Human-in-the-loop integrity: AI delegates & monitors, but physical work requires authorized staff completion.</span>
          </div>
          <div className="font-mono text-slate-500">
            Showing {filteredTasks.length} of {tasks.length} cases
          </div>
        </div>
      </div>
    </div>
  );
};
