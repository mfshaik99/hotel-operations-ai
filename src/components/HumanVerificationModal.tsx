import React, { useState } from 'react';
import { X, ShieldCheck, CheckSquare, UserCheck, AlertCircle } from 'lucide-react';
import { Task } from '../types';

interface HumanVerificationModalProps {
  task: Task | null;
  isOpen: boolean;
  onClose: () => void;
  onConfirmResolution: (taskId: string, staffName: string, notes: string) => void;
}

export const HumanVerificationModal: React.FC<HumanVerificationModalProps> = ({
  task,
  isOpen,
  onClose,
  onConfirmResolution,
}) => {
  const [staffName, setStaffName] = useState('Elena Cruz (Duty Lead)');
  const [employeeId, setEmployeeId] = useState('EMP-7409');
  const [notes, setNotes] = useState('Physical service inspection complete. Tested and verified directly in suite.');
  const [checklist, setChecklist] = useState({
    physicalInspectionDone: true,
    guestSafetyVerified: true,
    luxuryStandardsMet: true,
  });

  if (!isOpen || !task) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!staffName.trim()) return;
    const fullStaffSignature = `${staffName.trim()} [${employeeId || 'Verified Staff'}]`;
    onConfirmResolution(task.id, fullStaffSignature, notes.trim());
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md">
      <div className="relative w-full max-w-xl bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl p-6 sm:p-7 text-slate-100">
        <div className="flex items-center justify-between border-b border-slate-800 pb-4 mb-5">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-100">
                Human Completion Verification
              </h3>
              <p className="text-xs text-slate-400">
                Operating Principle #8: Physical tasks require authorized human sign-off.
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-200 hover:bg-slate-800 rounded-lg transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Task Summary Banner */}
        <div className="p-3.5 bg-slate-950/80 border border-slate-800/90 rounded-xl mb-5">
          <div className="flex items-center justify-between text-xs text-slate-400 mb-1">
            <span className="font-mono text-amber-400 font-semibold">{task.caseRef}</span>
            <span className="font-medium text-slate-300">Room {task.room}</span>
          </div>
          <div className="text-sm font-semibold text-slate-100">
            {task.title}
          </div>
          <div className="text-xs text-slate-400 mt-1">
            Department: <strong className="text-slate-300">{task.department}</strong> · Priority: {task.priority}
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1">
                Authorized Staff Name
              </label>
              <input
                type="text"
                required
                value={staffName}
                onChange={(e) => setStaffName(e.target.value)}
                placeholder="Full Name"
                className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-slate-100 focus:outline-none focus:border-amber-500/50"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1">
                Staff ID / Badge #
              </label>
              <input
                type="text"
                required
                value={employeeId}
                onChange={(e) => setEmployeeId(e.target.value)}
                placeholder="e.g. EMP-9201"
                className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-slate-100 focus:outline-none focus:border-amber-500/50"
              />
            </div>
          </div>

          {/* Mandatory Checkpoints */}
          <div className="p-3.5 bg-slate-950/60 border border-slate-800 rounded-xl space-y-2.5">
            <div className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
              Verification Checkpoints (Physical Execution)
            </div>

            <label className="flex items-center gap-2.5 text-xs text-slate-300 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={checklist.physicalInspectionDone}
                onChange={(e) => setChecklist({ ...checklist, physicalInspectionDone: e.target.checked })}
                className="rounded border-slate-700 text-amber-500 focus:ring-0 w-4 h-4 bg-slate-900"
              />
              <span>Physical work or delivery physically verified on premises</span>
            </label>

            <label className="flex items-center gap-2.5 text-xs text-slate-300 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={checklist.guestSafetyVerified}
                onChange={(e) => setChecklist({ ...checklist, guestSafetyVerified: e.target.checked })}
                className="rounded border-slate-700 text-amber-500 focus:ring-0 w-4 h-4 bg-slate-900"
              />
              <span>Guest safety, privacy & room cleanliness maintained</span>
            </label>

            <label className="flex items-center gap-2.5 text-xs text-slate-300 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={checklist.luxuryStandardsMet}
                onChange={(e) => setChecklist({ ...checklist, luxuryStandardsMet: e.target.checked })}
                className="rounded border-slate-700 text-amber-500 focus:ring-0 w-4 h-4 bg-slate-900"
              />
              <span>Complies with Luminary 5-Star brand operational standards</span>
            </label>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1">
              Resolution & Handover Notes
            </label>
            <textarea
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Provide exact details of physical repair or delivery..."
              className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2.5 text-xs text-slate-100 focus:outline-none focus:border-amber-500/50"
            />
          </div>

          <div className="pt-2 flex items-center justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-medium text-slate-400 hover:text-slate-200 hover:bg-slate-800 rounded-lg transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!checklist.physicalInspectionDone || !checklist.guestSafetyVerified}
              className="flex items-center gap-2 px-5 py-2.5 text-xs font-bold text-slate-950 bg-emerald-400 hover:bg-emerald-300 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg shadow-md transition-all cursor-pointer"
            >
              <UserCheck className="w-4 h-4" />
              <span>Confirm Human Resolution</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
