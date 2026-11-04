import React, { useState } from 'react';
import { X, Brain, Sparkles, CheckCircle2, ShieldCheck, ArrowRight, AlertTriangle, Layers } from 'lucide-react';
import { Task } from '../types';

interface CentralDecisionModalProps {
  task: Task | null;
  isOpen: boolean;
  onClose: () => void;
  onApplyDirective: (taskId: string, directive: {
    recommendedPriority: string;
    recommendedDepartment: string;
    summary: string;
    directives: string[];
  }) => void;
}

export const CentralDecisionModal: React.FC<CentralDecisionModalProps> = ({
  task,
  isOpen,
  onClose,
  onApplyDirective,
}) => {
  const [isEvaluating, setIsEvaluating] = useState(false);
  const [decision, setDecision] = useState<{
    decisionType?: string;
    summary?: string;
    rationale?: string;
    confidenceScore?: number;
    recommendedDepartment?: string;
    recommendedPriority?: string;
    actionDirectives?: string[];
  } | null>(null);

  if (!isOpen || !task) return null;

  const handleEvaluate = async () => {
    setIsEvaluating(true);
    try {
      const res = await fetch('/api/gemini/operational-decision', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          situation: `Active operational task: "${task.title}" for Suite ${task.room}. Priority: ${task.priority}, Dept: ${task.department}, SLA deadline: ${task.estimatedMinutes}m.`,
          task,
          activeWorkload: { department: task.department, status: task.status },
          guestProfile: { name: task.guestName, tier: 'VIP Resident' },
        }),
      });
      const data = await res.json();
      if (data && data.decision) {
        setDecision(data.decision);
      }
    } catch (err) {
      console.error('Decision error:', err);
    } finally {
      setIsEvaluating(false);
    }
  };

  const handleApply = () => {
    if (!decision) return;
    onApplyDirective(task.id, {
      recommendedPriority: decision.recommendedPriority || task.priority,
      recommendedDepartment: decision.recommendedDepartment || task.department,
      summary: decision.summary || 'Central AI managerial directive applied',
      directives: decision.actionDirectives || [],
    });
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-zinc-950/80 backdrop-blur-xs">
      <div className="relative w-full max-w-xl bg-zinc-900 border border-zinc-800 rounded-2xl p-6 sm:p-7 text-zinc-100 shadow-2xl space-y-5">
        {/* Header */}
        <div className="flex items-center justify-between pb-4 border-b border-zinc-800">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-amber-500/15 border border-amber-500/30 flex items-center justify-center text-amber-400">
              <Brain className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-zinc-100">
                Central Operations AI Decision Engine
              </h3>
              <p className="text-xs text-zinc-400">
                Primary managerial evaluation of business tradeoffs, SLA risks & resource routing.
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 rounded-lg transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Target Case Context */}
        <div className="p-3.5 bg-zinc-950 border border-zinc-800 rounded-xl space-y-1">
          <div className="flex items-center justify-between text-xs font-mono text-zinc-400">
            <span className="text-amber-400 font-semibold">{task.caseRef}</span>
            <span>Suite {task.room} · {task.guestName || 'VIP Resident'}</span>
          </div>
          <div className="text-sm font-semibold text-zinc-100">{task.title}</div>
          <div className="text-xs text-zinc-400">
            Current: {task.department} · Priority: {task.priority} · Status: {task.status}
          </div>
        </div>

        {/* Action Trigger */}
        {!decision && (
          <div className="text-center py-6 space-y-3">
            <p className="text-xs text-zinc-400 max-w-sm mx-auto">
              Synthesize situation using Gemini 3.8 Flash to calculate business risk, inter-departmental blockers, and actionable management directives.
            </p>
            <button
              onClick={handleEvaluate}
              disabled={isEvaluating}
              className="px-5 py-2.5 text-xs font-bold text-zinc-950 bg-amber-400 hover:bg-amber-300 disabled:opacity-50 rounded-lg shadow-sm transition-all flex items-center gap-2 mx-auto cursor-pointer"
            >
              <Sparkles className="w-4 h-4" />
              <span>{isEvaluating ? 'Synthesizing Managerial Directive...' : 'Generate Central AI Decision'}</span>
            </button>
          </div>
        )}

        {/* Decision Results */}
        {decision && (
          <div className="space-y-4">
            <div className="p-4 bg-zinc-950/90 border border-amber-500/30 rounded-xl space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-amber-500/15 text-amber-300 border border-amber-500/30 font-semibold">
                  {decision.decisionType}
                </span>
                <span className="text-xs font-mono text-emerald-400 font-semibold">
                  {Math.round((decision.confidenceScore || 0.9) * 100)}% Decision Confidence
                </span>
              </div>
              <div className="text-sm font-bold text-zinc-100">
                {decision.summary}
              </div>
              <p className="text-xs text-zinc-300 leading-relaxed">
                {decision.rationale}
              </p>
            </div>

            {decision.actionDirectives && decision.actionDirectives.length > 0 && (
              <div className="space-y-1.5">
                <div className="text-[10px] font-mono font-medium text-zinc-400 uppercase tracking-wider">
                  Action Directives for Team
                </div>
                <ul className="space-y-1 text-xs text-zinc-300">
                  {decision.actionDirectives.map((d, i) => (
                    <li key={i} className="flex items-start gap-2 bg-zinc-950 p-2 rounded border border-zinc-850">
                      <CheckCircle2 className="w-3.5 h-3.5 text-amber-400 mt-0.5 shrink-0" />
                      <span>{d}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <div className="pt-2 flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 text-xs font-medium text-zinc-400 hover:text-zinc-200"
              >
                Dismiss
              </button>
              <button
                type="button"
                onClick={handleApply}
                className="px-5 py-2 text-xs font-bold text-zinc-950 bg-amber-400 hover:bg-amber-300 rounded-lg shadow-sm transition-all cursor-pointer"
              >
                Apply Directive & Log in Switch
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
