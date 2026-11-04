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
} from 'lucide-react';
import { Task } from '../types';

interface TaskDetailDrawerProps {
  task: Task | null;
  onClose: () => void;
  onAcceptTask: (taskId: string) => void;
  onEscalateTask: (taskId: string, reason?: string) => void;
  onRequestVerification: (task: Task) => void;
}

export const TaskDetailDrawer: React.FC<TaskDetailDrawerProps> = ({
  task,
  onClose,
  onAcceptTask,
  onEscalateTask,
  onRequestVerification,
}) => {
  if (!task) return null;

  const isOverdue = task.status !== 'Resolved' && Date.now() > task.slaDeadline;

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-slate-950/70 backdrop-blur-xs">
      <div className="w-full max-w-lg bg-slate-900 border-l border-slate-800 h-full p-6 sm:p-7 overflow-y-auto flex flex-col justify-between shadow-2xl">
        <div className="space-y-6">
          {/* Header */}
          <div className="flex items-center justify-between pb-4 border-b border-slate-800">
            <div>
              <div className="flex items-center gap-2">
                <span className="font-mono text-xs font-bold text-amber-400">
                  {task.caseRef}
                </span>
                <span className="text-slate-600">·</span>
                <span className="text-xs text-slate-300 font-semibold">
                  Suite {task.room}
                </span>
              </div>
              <h3 className="text-base font-bold text-slate-100 mt-1">
                Operational Case Details
              </h3>
            </div>
            <button
              onClick={onClose}
              className="p-1.5 text-slate-400 hover:text-slate-200 hover:bg-slate-800 rounded-lg transition-colors cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Title & Status */}
          <div className="p-4 bg-slate-950/80 border border-slate-800 rounded-xl space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-mono uppercase tracking-wider text-slate-400">
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
            <div className="text-sm font-bold text-slate-100">
              {task.title}
            </div>
            <p className="text-xs text-slate-400 leading-relaxed">
              {task.description}
            </p>
          </div>

          {/* Operational Attributes */}
          <div className="grid grid-cols-2 gap-3 text-xs">
            <div className="p-3 bg-slate-950 border border-slate-800 rounded-lg">
              <div className="text-[10px] text-slate-500 uppercase font-mono">Assigned Agent</div>
              <div className="font-semibold text-slate-200 mt-0.5">{task.assignedAgent}</div>
            </div>
            <div className="p-3 bg-slate-950 border border-slate-800 rounded-lg">
              <div className="text-[10px] text-slate-500 uppercase font-mono">Priority Level</div>
              <div className="font-semibold text-amber-400 mt-0.5">{task.priority}</div>
            </div>
            <div className="p-3 bg-slate-950 border border-slate-800 rounded-lg">
              <div className="text-[10px] text-slate-500 uppercase font-mono">Guest / Suite</div>
              <div className="font-semibold text-slate-200 mt-0.5">
                {task.guestName || 'VIP Resident'} (Suite {task.room})
              </div>
            </div>
            <div className="p-3 bg-slate-950 border border-slate-800 rounded-lg">
              <div className="text-[10px] text-slate-500 uppercase font-mono">Estimated SLA</div>
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
                <span>Task Preconditions & Handover Dependencies</span>
              </div>
              <ul className="text-xs text-indigo-200/90 list-disc list-inside">
                {task.dependencies.map((dep, idx) => (
                  <li key={idx}>{dep}</li>
                ))}
              </ul>
            </div>
          )}

          {/* Resolution Audit Record */}
          {task.status === 'Resolved' && (
            <div className="p-4 bg-emerald-950/20 border border-emerald-900/40 rounded-xl space-y-2">
              <div className="flex items-center gap-2 text-xs font-bold text-emerald-400 font-mono uppercase">
                <ShieldCheck className="w-4 h-4 text-emerald-400" />
                <span>Verified Human Sign-Off Record</span>
              </div>
              <div className="text-xs text-slate-300">
                Confirmed by: <strong className="text-emerald-300">{task.resolvedBy}</strong>
              </div>
              {task.resolutionNotes && (
                <div className="text-xs text-slate-400 italic bg-slate-950/60 p-2.5 rounded border border-emerald-900/30">
                  "{task.resolutionNotes}"
                </div>
              )}
            </div>
          )}
        </div>

        {/* Action Controls */}
        <div className="pt-6 border-t border-slate-800 space-y-2">
          {task.status !== 'Resolved' && (
            <button
              onClick={() => {
                onRequestVerification(task);
                onClose();
              }}
              className="w-full py-2.5 px-4 text-xs font-bold text-slate-950 bg-emerald-400 hover:bg-emerald-300 rounded-lg shadow-md transition-all flex items-center justify-center gap-2 cursor-pointer"
            >
              <ShieldCheck className="w-4 h-4" />
              <span>Verify & Complete Physical Work (Human Staff)</span>
            </button>
          )}

          {task.status === 'Open' || task.status === 'Dispatched' ? (
            <button
              onClick={() => {
                onAcceptTask(task.id);
                onClose();
              }}
              className="w-full py-2 px-4 text-xs font-semibold text-slate-100 bg-sky-600 hover:bg-sky-500 rounded-lg transition-colors cursor-pointer"
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
