import React from 'react';
import {
  X,
  Clock,
  ShieldCheck,
  AlertTriangle,
  User,
  Building,
  CheckCircle2,
  Link,
  Flame,
  ArrowRight,
  History,
  Brain,
  Layers,
} from 'lucide-react';
import { Task } from '../types';

interface TaskDetailDrawerProps {
  task: Task | null;
  onClose: () => void;
  onAcceptTask: (taskId: string) => void;
  onEscalateTask: (taskId: string, reason?: string) => void;
  onRequestVerification: (task: Task) => void;
  onRequestCentralDecision: (task: Task) => void;
}

export const TaskDetailDrawer: React.FC<TaskDetailDrawerProps> = ({
  task,
  onClose,
  onAcceptTask,
  onEscalateTask,
  onRequestVerification,
  onRequestCentralDecision,
}) => {
  if (!task) return null;

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-zinc-950/70 backdrop-blur-xs">
      <div className="w-full max-w-lg bg-zinc-900 border-l border-zinc-800 h-full p-6 sm:p-7 overflow-y-auto flex flex-col justify-between shadow-2xl">
        <div className="space-y-6">
          {/* Header */}
          <div className="flex items-center justify-between pb-4 border-b border-zinc-800">
            <div>
              <div className="flex items-center gap-2">
                <span className="font-mono text-xs font-bold text-amber-400">
                  {task.caseRef}
                </span>
                <span className="text-zinc-600">·</span>
                <span className="text-xs text-zinc-300 font-semibold">
                  Suite {task.room}
                </span>
                {task.isDemoData && (
                  <span className="text-[9px] font-mono px-1 py-0.2 rounded bg-zinc-800 text-zinc-400 border border-zinc-700/60">
                    DEMO SEED
                  </span>
                )}
              </div>
              <h3 className="text-base font-bold text-zinc-100 mt-1">
                Operational Case Details
              </h3>
            </div>
            <button
              onClick={onClose}
              className="p-1.5 text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 rounded-lg transition-colors cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Title & Status */}
          <div className="p-4 bg-zinc-950/80 border border-zinc-800 rounded-xl space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-mono uppercase tracking-wider text-zinc-400 font-medium">
                {task.department} Department
              </span>
              <span
                className={`text-[10px] font-mono font-bold px-2 py-0.5 rounded border ${
                  task.status === 'Resolved'
                    ? 'text-emerald-400 bg-emerald-500/10 border-emerald-500/30'
                    : task.status === 'Escalated'
                    ? 'text-rose-400 bg-rose-500/10 border-rose-500/30'
                    : 'text-amber-400 bg-amber-500/10 border-amber-500/30'
                }`}
              >
                {task.status}
              </span>
            </div>
            <div className="text-sm font-bold text-zinc-100">
              {task.title}
            </div>
            <p className="text-xs text-zinc-400 leading-relaxed">
              {task.description}
            </p>
          </div>

          {/* Operational Attributes */}
          <div className="grid grid-cols-2 gap-3 text-xs">
            <div className="p-3 bg-zinc-950 border border-zinc-800 rounded-lg">
              <div className="text-[10px] text-zinc-500 uppercase font-mono">Assigned Agent</div>
              <div className="font-semibold text-zinc-200 mt-0.5">{task.assignedAgent}</div>
            </div>
            <div className="p-3 bg-zinc-950 border border-zinc-800 rounded-lg">
              <div className="text-[10px] text-zinc-500 uppercase font-mono">Priority Level</div>
              <div className="font-semibold text-amber-400 mt-0.5">{task.priority}</div>
            </div>
            <div className="p-3 bg-zinc-950 border border-zinc-800 rounded-lg">
              <div className="text-[10px] text-zinc-500 uppercase font-mono">Guest / Suite</div>
              <div className="font-semibold text-zinc-200 mt-0.5">
                {task.guestName || 'VIP Resident'} (Suite {task.room})
              </div>
            </div>
            <div className="p-3 bg-zinc-950 border border-zinc-800 rounded-lg">
              <div className="text-[10px] text-zinc-500 uppercase font-mono">Target SLA</div>
              <div className="font-semibold text-sky-400 mt-0.5 font-mono">{task.estimatedMinutes} minutes</div>
            </div>
          </div>

          {/* Risk & Dependencies */}
          {task.riskAssessment && (
            <div className="p-3.5 bg-rose-950/20 border border-rose-900/30 rounded-xl space-y-1">
              <div className="text-[11px] font-bold text-rose-400 flex items-center gap-1.5 uppercase font-mono">
                <AlertTriangle className="w-3.5 h-3.5" />
                <span>Guest Experience & Business Risk</span>
              </div>
              <p className="text-xs text-rose-200/90 leading-relaxed">
                {task.riskAssessment}
              </p>
            </div>
          )}

          {task.dependencies && task.dependencies.length > 0 && (
            <div className="p-3.5 bg-indigo-950/20 border border-indigo-900/30 rounded-xl space-y-1">
              <div className="text-[11px] font-bold text-indigo-400 flex items-center gap-1.5 uppercase font-mono">
                <Link className="w-3.5 h-3.5" />
                <span>Preconditions & Handover Dependencies</span>
              </div>
              <ul className="text-xs text-indigo-200/90 list-disc list-inside">
                {task.dependencies.map((dep, idx) => (
                  <li key={idx}>{dep}</li>
                ))}
              </ul>
            </div>
          )}

          {/* Immutable Operational Audit Trail */}
          <div className="space-y-3">
            <div className="flex items-center justify-between text-xs font-bold text-zinc-200 font-mono uppercase">
              <span className="flex items-center gap-1.5">
                <History className="w-3.5 h-3.5 text-amber-400" />
                Operational History & Audit Log
              </span>
              <span className="text-[10px] text-zinc-500 font-normal">
                {task.auditTrail?.length || 1} Events
              </span>
            </div>

            <div className="space-y-2 border-l-2 border-zinc-800 pl-3 ml-1.5">
              {task.auditTrail && task.auditTrail.length > 0 ? (
                task.auditTrail.map((entry) => (
                  <div key={entry.id} className="relative text-xs space-y-0.5 pb-2">
                    <span className="absolute -left-[17px] top-1 w-2 h-2 rounded-full bg-amber-400" />
                    <div className="flex items-center justify-between text-[11px]">
                      <span className="font-semibold text-zinc-200">{entry.actor}</span>
                      <span className="font-mono text-zinc-500">
                        {new Date(entry.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </div>
                    <div className="text-zinc-400 leading-normal">{entry.note}</div>
                  </div>
                ))
              ) : (
                <div className="text-xs text-zinc-500">Case registered and tracked.</div>
              )}
            </div>
          </div>

          {/* Verified Human Sign-Off Record */}
          {task.status === 'Resolved' && (
            <div className="p-4 bg-emerald-950/20 border border-emerald-900/40 rounded-xl space-y-2">
              <div className="flex items-center gap-2 text-xs font-bold text-emerald-400 font-mono uppercase">
                <ShieldCheck className="w-4 h-4 text-emerald-400" />
                <span>Verified Human Sign-Off Record</span>
              </div>
              <div className="text-xs text-zinc-300">
                Confirmed by: <strong className="text-emerald-300">{task.resolvedBy}</strong>
              </div>
              {task.resolutionNotes && (
                <div className="text-xs text-zinc-400 italic bg-zinc-950/60 p-2.5 rounded border border-emerald-900/30">
                  "{task.resolutionNotes}"
                </div>
              )}
            </div>
          )}
        </div>

        {/* Action Controls */}
        <div className="pt-6 border-t border-zinc-800 space-y-2">
          {task.status !== 'Resolved' && (
            <button
              onClick={() => {
                onRequestVerification(task);
                onClose();
              }}
              className="w-full py-2.5 px-4 text-xs font-bold text-zinc-950 bg-emerald-400 hover:bg-emerald-300 rounded-lg shadow-xs transition-all flex items-center justify-center gap-2 cursor-pointer"
            >
              <ShieldCheck className="w-4 h-4" />
              <span>Verify & Complete Physical Work (Human Staff)</span>
            </button>
          )}

          {task.status !== 'Resolved' && (
            <button
              onClick={() => {
                onRequestCentralDecision(task);
                onClose();
              }}
              className="w-full py-2 px-4 text-xs font-semibold text-amber-300 hover:text-amber-200 bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/30 rounded-lg transition-colors flex items-center justify-center gap-2 cursor-pointer"
            >
              <Brain className="w-3.5 h-3.5 text-amber-400" />
              <span>Request Central AI Decision Directive</span>
            </button>
          )}

          {task.status === 'Open' || task.status === 'Dispatched' ? (
            <button
              onClick={() => {
                onAcceptTask(task.id);
                onClose();
              }}
              className="w-full py-2 px-4 text-xs font-semibold text-zinc-100 bg-sky-600 hover:bg-sky-500 rounded-lg transition-colors cursor-pointer"
            >
              Accept Responsibility & Dispatch Staff
            </button>
          ) : null}

          {task.status !== 'Resolved' && task.status !== 'Escalated' ? (
            <button
              onClick={() => {
                onEscalateTask(task.id, 'Elevated to GM review via Task Inspector');
                onClose();
              }}
              className="w-full py-2 px-4 text-xs font-semibold text-rose-400 hover:text-rose-300 bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/30 rounded-lg transition-colors cursor-pointer"
            >
              Escalate to General Management Agent
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
};
