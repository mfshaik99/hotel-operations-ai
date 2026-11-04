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
  Brain,
  History,
} from 'lucide-react';
import { Task, Department, TaskStatus } from '../types';

interface TaskQueueProps {
  tasks: Task[];
  onAcceptTask: (taskId: string) => void;
  onEscalateTask: (taskId: string, reason?: string) => void;
  onRequestVerification: (task: Task) => void;
  onSelectTask: (task: Task) => void;
  onRequestCentralDecision: (task: Task) => void;
}

export const TaskQueue: React.FC<TaskQueueProps> = ({
  tasks,
  onAcceptTask,
  onEscalateTask,
  onRequestVerification,
  onSelectTask,
  onRequestCentralDecision,
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
      <span className="text-[11px] font-mono text-zinc-400 flex items-center gap-1">
        <Clock className="w-3.5 h-3.5 text-zinc-500" />
        {diffMins}m SLA
      </span>
    );
  };

  const getPriorityStyle = (priority: string) => {
    switch (priority) {
      case 'Critical':
        return 'text-rose-400 bg-rose-500/10 border-rose-500/25';
      case 'Urgent':
        return 'text-amber-400 bg-amber-500/10 border-amber-500/25';
      case 'High':
        return 'text-orange-400 bg-orange-500/10 border-orange-500/25';
      default:
        return 'text-zinc-400 bg-zinc-800/80 border-zinc-700/60';
    }
  };

  const getStatusStyle = (status: TaskStatus) => {
    switch (status) {
      case 'Resolved':
        return 'text-emerald-400 bg-emerald-500/10 border-emerald-500/25';
      case 'In Progress':
        return 'text-sky-400 bg-sky-500/10 border-sky-500/25';
      case 'Escalated':
        return 'text-rose-400 bg-rose-500/10 border-rose-500/25 animate-pulse';
      case 'Dispatched':
        return 'text-indigo-400 bg-indigo-500/10 border-indigo-500/25';
      default:
        return 'text-amber-400 bg-amber-500/10 border-amber-500/25';
    }
  };

  return (
    <div className="space-y-4">
      {/* Search & Segmented Filter Bar */}
      <div className="bg-zinc-900/90 border border-zinc-800/80 p-3.5 rounded-xl flex flex-col md:flex-row md:items-center justify-between gap-3 shadow-xs">
        {/* Search */}
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search suite #, guest name, case ref or issue..."
            className="w-full bg-zinc-950 border border-zinc-800 rounded-lg pl-9 pr-4 py-1.5 text-xs text-zinc-100 placeholder:text-zinc-600 focus:outline-none focus:border-amber-500/40"
          />
        </div>

        {/* Filter Controls */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Department Filter */}
          <div className="flex items-center gap-0.5 bg-zinc-950 p-1 rounded-lg border border-zinc-800">
            {['All', 'Reception', 'Housekeeping', 'Maintenance', 'Management'].map((dept) => (
              <button
                key={dept}
                onClick={() => setSelectedDept(dept)}
                className={`px-2.5 py-1 text-[11px] font-medium rounded-md transition-colors whitespace-nowrap cursor-pointer ${
                  selectedDept === dept
                    ? 'bg-zinc-800 text-amber-300 font-semibold'
                    : 'text-zinc-400 hover:text-zinc-200'
                }`}
              >
                {dept}
              </button>
            ))}
          </div>

          {/* Status Filter */}
          <div className="flex items-center gap-0.5 bg-zinc-950 p-1 rounded-lg border border-zinc-800">
            {['All', 'Active', 'In Progress', 'Escalated', 'Resolved'].map((st) => (
              <button
                key={st}
                onClick={() => setSelectedStatus(st)}
                className={`px-2.5 py-1 text-[11px] font-medium rounded-md transition-colors whitespace-nowrap cursor-pointer ${
                  selectedStatus === st
                    ? 'bg-zinc-800 text-amber-300 font-semibold'
                    : 'text-zinc-400 hover:text-zinc-200'
                }`}
              >
                {st}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Enterprise Data Grid */}
      <div className="bg-zinc-900 border border-zinc-800/80 rounded-xl overflow-hidden shadow-xs">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-zinc-800 bg-zinc-950/60 text-[10px] uppercase tracking-wider font-mono text-zinc-400">
                <th className="py-2.5 px-4 font-medium">Case & Suite</th>
                <th className="py-2.5 px-4 font-medium">Operational Responsibility</th>
                <th className="py-2.5 px-4 font-medium">Assigned Agent & Dept</th>
                <th className="py-2.5 px-4 font-medium">Priority</th>
                <th className="py-2.5 px-4 font-medium">SLA Target</th>
                <th className="py-2.5 px-4 font-medium">Status</th>
                <th className="py-2.5 px-4 font-medium text-right">Human Verification & Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800/60 text-xs">
              {filteredTasks.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-12 text-center text-zinc-500 font-normal">
                    No matching hotel operations cases found.
                  </td>
                </tr>
              ) : (
                filteredTasks.map((task) => {
                  return (
                    <tr
                      key={task.id}
                      className="hover:bg-zinc-850/60 transition-colors group cursor-pointer"
                      onClick={() => onSelectTask(task)}
                    >
                      {/* Case / Suite */}
                      <td className="py-3 px-4 whitespace-nowrap">
                        <div className="flex items-center gap-1.5">
                          <span className="font-mono font-semibold text-zinc-200">
                            {task.caseRef}
                          </span>
                          {task.isDemoData && (
                            <span className="text-[9px] font-mono px-1 py-0.2 rounded bg-zinc-800 text-zinc-400 border border-zinc-700/50">
                              DEMO
                            </span>
                          )}
                        </div>
                        <div className="text-[11px] text-amber-400/90 font-medium">
                          Suite {task.room}
                        </div>
                        {task.guestName && (
                          <div className="text-[10px] text-zinc-400 truncate max-w-[130px]">
                            {task.guestName}
                          </div>
                        )}
                      </td>

                      {/* Title & Dependencies */}
                      <td className="py-3 px-4 min-w-[280px]">
                        <div className="font-medium text-zinc-100 group-hover:text-amber-300 transition-colors">
                          {task.title}
                        </div>
                        {task.dependencies && task.dependencies.length > 0 && (
                          <div className="text-[10px] text-indigo-400 flex items-center gap-1 mt-0.5">
                            <Link className="w-3 h-3 text-indigo-400/80" />
                            <span className="truncate max-w-[260px]">{task.dependencies[0]}</span>
                          </div>
                        )}
                        {task.isRepeatedIssue && (
                          <div className="text-[10px] font-mono text-rose-400 flex items-center gap-1 mt-0.5">
                            <AlertTriangle className="w-3 h-3" />
                            <span>Repeated complaint in suite &lt; 72h</span>
                          </div>
                        )}
                      </td>

                      {/* Agent & Dept */}
                      <td className="py-3 px-4 whitespace-nowrap">
                        <div className="font-medium text-zinc-200">
                          {task.assignedAgent}
                        </div>
                        <div className="text-[11px] text-zinc-400">
                          {task.department}
                        </div>
                      </td>

                      {/* Priority */}
                      <td className="py-3 px-4 whitespace-nowrap">
                        <span
                          className={`text-[10px] font-mono font-semibold px-2 py-0.5 rounded border ${getPriorityStyle(
                            task.priority
                          )}`}
                        >
                          {task.priority}
                        </span>
                      </td>

                      {/* SLA */}
                      <td className="py-3 px-4 whitespace-nowrap">
                        {getSlaBadge(task)}
                      </td>

                      {/* Status */}
                      <td className="py-3 px-4 whitespace-nowrap">
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
                        className="py-3 px-4 text-right whitespace-nowrap"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <div className="flex items-center justify-end gap-1.5">
                          {/* Central AI Decision Directives Button */}
                          {task.status !== 'Resolved' && (
                            <button
                              onClick={() => onRequestCentralDecision(task)}
                              title="Ask Central Operations AI for autonomous business directive"
                              className="px-2 py-1 text-[11px] font-medium text-amber-300 hover:text-amber-200 bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/20 rounded transition-colors flex items-center gap-1 cursor-pointer"
                            >
                              <Brain className="w-3 h-3 text-amber-400" />
                              <span>AI Directive</span>
                            </button>
                          )}

                          {task.status === 'Open' || task.status === 'Dispatched' ? (
                            <button
                              onClick={() => onAcceptTask(task.id)}
                              className="px-2.5 py-1 text-[11px] font-semibold text-zinc-950 bg-sky-400 hover:bg-sky-300 rounded shadow-xs transition-colors cursor-pointer"
                            >
                              Accept & Start
                            </button>
                          ) : null}

                          {task.status !== 'Resolved' ? (
                            <button
                              onClick={() => onRequestVerification(task)}
                              className="px-2.5 py-1 text-[11px] font-semibold text-zinc-950 bg-emerald-400 hover:bg-emerald-300 rounded shadow-xs transition-colors flex items-center gap-1 cursor-pointer"
                            >
                              <ShieldCheck className="w-3 h-3" />
                              Confirm Done
                            </button>
                          ) : (
                            <span className="text-[11px] text-zinc-500 font-mono">
                              Signed: {task.resolvedBy?.slice(0, 16)}...
                            </span>
                          )}

                          {task.status !== 'Resolved' && task.status !== 'Escalated' ? (
                            <button
                              onClick={() => onEscalateTask(task.id, 'Delayed past 5-star threshold')}
                              title="Escalate to General Management Agent"
                              className="px-2 py-1 text-[11px] font-medium text-rose-400 hover:text-rose-200 hover:bg-rose-500/10 rounded border border-rose-500/20 transition-colors cursor-pointer"
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
        <div className="p-3 bg-zinc-950/60 border-t border-zinc-800 text-[11px] text-zinc-400 flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
            <span>Human-in-the-loop integrity: AI delegates & monitors, but physical work requires authorized staff completion.</span>
          </div>
          <div className="font-mono text-zinc-500">
            Showing {filteredTasks.length} of {tasks.length} cases
          </div>
        </div>
      </div>
    </div>
  );
};
