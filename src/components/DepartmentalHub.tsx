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
  Brain,
  Shield,
  Activity,
  Layers,
  Key,
  Flame,
} from 'lucide-react';
import { AgentProfile, Task, Department } from '../types';

interface DepartmentalHubProps {
  agents: AgentProfile[];
  tasks: Task[];
  onSelectDepartment: (dept: Department) => void;
  onRequestVerification: (task: Task) => void;
  onOpenIntake: () => void;
  onTriggerAgentProtocol: (agentName: string, protocolName: string, department: Department) => void;
}

export const DepartmentalHub: React.FC<DepartmentalHubProps> = ({
  agents,
  tasks,
  onSelectDepartment,
  onRequestVerification,
  onOpenIntake,
  onTriggerAgentProtocol,
}) => {
  const getDeptIcon = (dept: Department) => {
    switch (dept) {
      case 'Reception':
        return <Building2 className="w-4 h-4 text-amber-400" />;
      case 'Housekeeping':
        return <Sparkles className="w-4 h-4 text-emerald-400" />;
      case 'Maintenance':
        return <Wrench className="w-4 h-4 text-sky-400" />;
      case 'Management':
        return <ShieldAlert className="w-4 h-4 text-rose-400" />;
    }
  };

  const getDeptBorderColor = (dept: Department) => {
    switch (dept) {
      case 'Reception':
        return 'border-amber-500/25';
      case 'Housekeeping':
        return 'border-emerald-500/25';
      case 'Maintenance':
        return 'border-sky-500/25';
      case 'Management':
        return 'border-rose-500/25';
    }
  };

  const getDepartmentProtocols = (dept: Department) => {
    switch (dept) {
      case 'Reception':
        return [
          { name: 'RFID_MORTISE_SYNC', label: 'Test RFID Corridor Mortises' },
          { name: 'FOLIO_DISPUTE_GUARD', label: 'Audit Pre-Auth Departure Folios' },
        ];
      case 'Housekeeping':
        return [
          { name: 'TURNDOWN_LOAD_BALANCER', label: 'Rebalance Turndown Corridor Floaters' },
          { name: 'LINEN_BUFFER_MONITOR', label: 'Verify Egyptian Cotton Stockpile' },
        ];
      case 'Maintenance':
        return [
          { name: 'HVAC_CHILLED_WATER_GUARD', label: 'Diagnostic 4th-Fl Riser Valve' },
          { name: 'PLUMBING_ISOLATION_NET', label: 'Test Hydraulic Shutoff Sensors' },
        ];
      case 'Management':
        return [
          { name: 'SERVICE_RECOVERY_PROTOCOL', label: 'Trigger VIP Service Recovery Kit' },
          { name: 'EXECUTIVE_COMPENSATION_GATE', label: 'Review Disputed Folio Credits' },
        ];
    }
  };

  return (
    <div className="space-y-6">
      {/* Central Business Decision-Maker Banner */}
      <div className="bg-gradient-to-r from-zinc-900 via-zinc-900 to-amber-950/20 border border-zinc-800 rounded-2xl p-6 shadow-xs">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="text-[11px] font-mono font-bold tracking-wider text-amber-400 uppercase flex items-center gap-1.5">
              <Brain className="w-4 h-4 text-amber-400" />
              <span>Central Operations AI · Primary Business Decision-Maker</span>
            </div>
            <h2 className="text-lg font-bold text-zinc-100">
              One Shared Intelligence · Four Autonomous Specialized Agents
            </h2>
            <p className="text-xs text-zinc-400 max-w-2xl leading-relaxed">
              The Central Operations AI operates as the General Manager intelligence: evaluating business impact, balancing multi-department capacity, resolving task blockers, and delegating responsibilities. Specialized agents execute independent domain protocols with distinct authority.
            </p>
          </div>
          <button
            onClick={onOpenIntake}
            className="flex items-center gap-2 px-4 py-2 text-xs font-bold text-zinc-950 bg-amber-400 hover:bg-amber-300 rounded-lg shadow-xs transition-all whitespace-nowrap self-start md:self-auto cursor-pointer"
          >
            <span>Decompose & Delegate Request</span>
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
          const protocols = getDepartmentProtocols(dept);

          return (
            <div
              key={dept}
              className={`bg-zinc-900 border ${getDeptBorderColor(
                dept
              )} rounded-2xl p-5 shadow-xs flex flex-col justify-between`}
            >
              <div>
                {/* Agent Header */}
                <div className="flex items-start justify-between gap-3 mb-4">
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-xl bg-zinc-950 border border-zinc-800 flex items-center justify-center">
                      {getDeptIcon(dept)}
                    </div>
                    <div>
                      <div className="text-sm font-bold text-zinc-100 flex items-center gap-2">
                        <span>{agent?.name || `${dept} Agent`}</span>
                      </div>
                      <div className="text-[11px] text-zinc-400 font-normal">
                        {agent?.role}
                      </div>
                    </div>
                  </div>

                  <span
                    className={`text-[10px] font-mono font-medium px-2 py-0.5 rounded border ${
                      agent?.status === 'High Load'
                        ? 'text-amber-400 bg-amber-500/10 border-amber-500/25'
                        : agent?.status === 'Investigating'
                        ? 'text-rose-400 bg-rose-500/10 border-rose-500/25'
                        : 'text-emerald-400 bg-emerald-500/10 border-emerald-500/25'
                    }`}
                  >
                    {agent?.status || 'Active'}
                  </span>
                </div>

                {/* Defined Responsibility & Authority */}
                <div className="mb-4 bg-zinc-950/70 p-3 rounded-xl border border-zinc-800/80 space-y-1">
                  <div className="flex items-center justify-between text-[10px] font-mono text-zinc-400">
                    <span className="uppercase">Authority Scope</span>
                    <span className="text-amber-400/90 font-medium">{agent?.autonomyLevel || 'Full Authority'}</span>
                  </div>
                  <p className="text-xs text-zinc-300 leading-relaxed">
                    {agent?.specialty}
                  </p>
                </div>

                {/* Metrics */}
                <div className="grid grid-cols-3 gap-2 mb-4 text-center">
                  <div className="bg-zinc-950 p-2.5 rounded-lg border border-zinc-800/80">
                    <div className="text-[10px] text-zinc-500 uppercase font-mono">Active Cases</div>
                    <div className="text-base font-bold font-mono text-zinc-100 mt-0.5 tabular-nums">
                      {deptTasks.length}
                    </div>
                  </div>
                  <div className="bg-zinc-950 p-2.5 rounded-lg border border-zinc-800/80">
                    <div className="text-[10px] text-zinc-500 uppercase font-mono">Response SLA</div>
                    <div className="text-base font-bold font-mono text-amber-400 mt-0.5 tabular-nums">
                      {agent?.avgResponseMins || 2.4}m
                    </div>
                  </div>
                  <div className="bg-zinc-950 p-2.5 rounded-lg border border-zinc-800/80">
                    <div className="text-[10px] text-zinc-500 uppercase font-mono">Verified Closed</div>
                    <div className="text-base font-bold font-mono text-emerald-400 mt-0.5 tabular-nums">
                      {resolvedTasks.length}
                    </div>
                  </div>
                </div>

                {/* Independent Operational Protocols */}
                <div className="mb-4 space-y-1.5">
                  <div className="text-[10px] font-mono font-medium text-zinc-400 uppercase tracking-wider">
                    Autonomous Domain Actions
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {protocols.map((p) => (
                      <button
                        key={p.name}
                        onClick={() => onTriggerAgentProtocol(agent?.name || `${dept} Agent`, p.label, dept)}
                        className="text-left p-2 rounded-lg bg-zinc-950 border border-zinc-800 hover:border-zinc-700 text-[11px] text-zinc-300 hover:text-amber-300 transition-colors cursor-pointer"
                      >
                        <span className="font-mono text-[9px] text-zinc-500 block">{p.name}</span>
                        <span className="font-medium truncate block">{p.label}</span>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Active Responsibilities in Department */}
                <div className="space-y-2 mb-4">
                  <div className="text-[10px] font-mono font-medium text-zinc-400 uppercase tracking-wider">
                    Active Assigned Cases ({deptTasks.length})
                  </div>
                  {deptTasks.length === 0 ? (
                    <div className="text-xs text-zinc-500 py-3 text-center bg-zinc-950/40 rounded-lg">
                      All departmental responsibilities fulfilled.
                    </div>
                  ) : (
                    deptTasks.slice(0, 2).map((task) => (
                      <div
                        key={task.id}
                        className="p-2.5 bg-zinc-950/70 border border-zinc-800/80 rounded-lg flex items-center justify-between gap-2"
                      >
                        <div className="min-w-0">
                          <div className="text-xs font-medium text-zinc-200 truncate">
                            Suite {task.room} · {task.title}
                          </div>
                          <div className="text-[10px] text-zinc-400 font-mono">
                            Priority: <span className="text-zinc-200 font-semibold">{task.priority}</span> · SLA: {task.estimatedMinutes}m
                          </div>
                        </div>

                        <button
                          onClick={() => onRequestVerification(task)}
                          title="Confirm physical completion by authorized human staff"
                          className="px-2 py-1 text-[10px] font-semibold text-zinc-950 bg-emerald-400 hover:bg-emerald-300 rounded shrink-0 flex items-center gap-1 cursor-pointer"
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
                className="w-full text-center py-2 text-xs font-semibold text-zinc-300 hover:text-amber-400 bg-zinc-950/90 hover:bg-zinc-800 border border-zinc-800 rounded-lg transition-colors cursor-pointer"
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
