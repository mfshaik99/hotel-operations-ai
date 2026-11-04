import React from 'react';
import {
  Building2,
  Sparkles,
  Wrench,
  ShieldAlert,
  Clock,
  CheckCircle2,
  AlertCircle,
  ArrowRight,
  UserCheck,
} from 'lucide-react';
import { AgentProfile, Task, Department } from '../types';

interface DepartmentalHubProps {
  agents: AgentProfile[];
  tasks: Task[];
  onSelectDepartment: (dept: Department) => void;
  onRequestVerification: (task: Task) => void;
  onOpenIntake: () => void;
}

export const DepartmentalHub: React.FC<DepartmentalHubProps> = ({
  agents,
  tasks,
  onSelectDepartment,
  onRequestVerification,
  onOpenIntake,
}) => {
  const getDeptIcon = (dept: Department) => {
    switch (dept) {
      case 'Reception':
        return <Building2 className="w-5 h-5 text-amber-400" />;
      case 'Housekeeping':
        return <Sparkles className="w-5 h-5 text-emerald-400" />;
      case 'Maintenance':
        return <Wrench className="w-5 h-5 text-sky-400" />;
      case 'Management':
        return <ShieldAlert className="w-5 h-5 text-rose-400" />;
    }
  };

  const getDeptBorderColor = (dept: Department) => {
    switch (dept) {
      case 'Reception':
        return 'border-amber-500/30';
      case 'Housekeeping':
        return 'border-emerald-500/30';
      case 'Maintenance':
        return 'border-sky-500/30';
      case 'Management':
        return 'border-rose-500/30';
    }
  };

  return (
    <div className="space-y-6">
      {/* Central Orchestrator Banner */}
      <div className="bg-gradient-to-r from-slate-900 via-slate-900 to-amber-950/30 border border-slate-800 rounded-2xl p-6">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="text-[11px] font-mono font-bold tracking-wider text-amber-400 uppercase">
              Central Intelligence & Autonomous Delegation Layer
            </div>
            <h3 className="text-lg font-bold text-slate-100">
              One Shared Intelligence · Four Specialized AI Teammates
            </h3>
            <p className="text-xs text-slate-400 max-w-2xl">
              The Central AI coordinates, evaluates severity, enforces SLA deadlines, and delegates responsibilities. Each specialized agent maintains strict authority and accountability over its domain.
            </p>
          </div>
          <button
            onClick={onOpenIntake}
            className="flex items-center gap-2 px-4 py-2 text-xs font-bold text-slate-950 bg-amber-400 hover:bg-amber-300 rounded-lg shadow transition-all whitespace-nowrap self-start md:self-auto cursor-pointer"
          >
            <span>Delegate New Operational Case</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* 4 Specialized Department Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        {(['Reception', 'Housekeeping', 'Maintenance', 'Management'] as Department[]).map((dept) => {
          const agent = agents.find((a) => a.department === dept);
          const deptTasks = tasks.filter((t) => t.department === dept && t.status !== 'Resolved');
          const resolvedTasks = tasks.filter((t) => t.department === dept && t.status === 'Resolved');

          return (
            <div
              key={dept}
              className={`bg-slate-900 border ${getDeptBorderColor(
                dept
              )} rounded-2xl p-5 shadow-sm flex flex-col justify-between`}
            >
              <div>
                {/* Agent Header */}
                <div className="flex items-start justify-between gap-3 mb-4">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-slate-950 border border-slate-800 flex items-center justify-center">
                      {getDeptIcon(dept)}
                    </div>
                    <div>
                      <div className="text-sm font-bold text-slate-100 flex items-center gap-2">
                        <span>{agent?.name || `${dept} Agent`}</span>
                      </div>
                      <div className="text-[11px] text-slate-400">
                        {agent?.role}
                      </div>
                    </div>
                  </div>

                  <span
                    className={`text-[10px] font-mono font-bold px-2 py-0.5 rounded border ${
                      agent?.status === 'High Load'
                        ? 'text-amber-400 bg-amber-500/10 border-amber-500/30'
                        : agent?.status === 'Investigating'
                        ? 'text-rose-400 bg-rose-500/10 border-rose-500/30'
                        : 'text-emerald-400 bg-emerald-500/10 border-emerald-500/30'
                    }`}
                  >
                    {agent?.status || 'Active'}
                  </span>
                </div>

                {/* Specialty Description */}
                <p className="text-xs text-slate-300 mb-4 bg-slate-950/60 p-2.5 rounded-lg border border-slate-800/80">
                  <strong className="text-slate-400 block text-[10px] uppercase font-mono mb-0.5">
                    Defined Responsibility & Authority:
                  </strong>
                  {agent?.specialty}
                </p>

                {/* Metrics */}
                <div className="grid grid-cols-3 gap-2 mb-4 text-center">
                  <div className="bg-slate-950 p-2 rounded-lg border border-slate-800/80">
                    <div className="text-[10px] text-slate-500 uppercase font-mono">Active Queue</div>
                    <div className="text-base font-bold font-mono text-slate-100 mt-0.5">
                      {deptTasks.length}
                    </div>
                  </div>
                  <div className="bg-slate-950 p-2 rounded-lg border border-slate-800/80">
                    <div className="text-[10px] text-slate-500 uppercase font-mono">Avg Speed</div>
                    <div className="text-base font-bold font-mono text-amber-400 mt-0.5">
                      {agent?.avgResponseMins || 2.4}m
                    </div>
                  </div>
                  <div className="bg-slate-950 p-2 rounded-lg border border-slate-800/80">
                    <div className="text-[10px] text-slate-500 uppercase font-mono">Resolved Today</div>
                    <div className="text-base font-bold font-mono text-emerald-400 mt-0.5">
                      {resolvedTasks.length}
                    </div>
                  </div>
                </div>

                {/* Active Responsibilities List */}
                <div className="space-y-2 mb-4">
                  <div className="text-[11px] font-mono font-semibold text-slate-400 uppercase tracking-wider">
                    Current Active Tasks ({deptTasks.length})
                  </div>
                  {deptTasks.length === 0 ? (
                    <div className="text-xs text-slate-500 py-3 text-center bg-slate-950/40 rounded-lg">
                      All departmental commitments fulfilled.
                    </div>
                  ) : (
                    deptTasks.slice(0, 3).map((task) => (
                      <div
                        key={task.id}
                        className="p-2.5 bg-slate-950/70 border border-slate-800/80 rounded-lg flex items-center justify-between gap-2"
                      >
                        <div className="min-w-0">
                          <div className="text-xs font-medium text-slate-200 truncate">
                            Suite {task.room} · {task.title}
                          </div>
                          <div className="text-[10px] text-slate-400 font-mono">
                            Priority: <span className="text-slate-300 font-semibold">{task.priority}</span> · SLA: {task.estimatedMinutes}m
                          </div>
                        </div>

                        <button
                          onClick={() => onRequestVerification(task)}
                          title="Confirm physical completion by authorized human staff"
                          className="px-2 py-1 text-[10px] font-semibold text-slate-950 bg-emerald-400 hover:bg-emerald-300 rounded shrink-0 flex items-center gap-1 cursor-pointer"
                        >
                          <UserCheck className="w-3 h-3" />
                          <span>Verify</span>
                        </button>
                      </div>
                    ))
                  )}
                </div>
              </div>

              {/* Card Footer */}
              <button
                onClick={() => onSelectDepartment(dept)}
                className="w-full text-center py-2 text-xs font-semibold text-slate-300 hover:text-amber-400 bg-slate-950/90 hover:bg-slate-800 border border-slate-800 rounded-lg transition-colors cursor-pointer"
              >
                Inspect {dept} Task Queue in Operations Command →
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
};
