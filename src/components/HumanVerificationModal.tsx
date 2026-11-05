import React, { useState } from 'react';
import { X, ShieldCheck, CheckSquare, UserCheck, AlertCircle } from 'lucide-react';
import { Task } from '../types';

interface HumanVerificationModalProps {
  task: Task | null;
  isOpen: boolean;
  onClose: () => void;
  onConfirmResolution: (taskId: string, staffName: string, notes: string, staffToken?: string, badgeId?: string) => void;
}

const AUTHORIZED_STAFF_MEMBERS = [
  { id: 'staff-carlos', name: 'Carlos Mendez', role: 'Chief Plant Engineer', badgeId: 'ENG-402', department: 'Maintenance' },
  { id: 'staff-maria', name: 'Maria Santos', role: 'Head of Housekeeping', badgeId: 'HSK-310', department: 'Housekeeping' },
  { id: 'staff-elena', name: 'Elena Rostova', role: 'Front Desk Lead', badgeId: 'REC-104', department: 'Reception' },
  { id: 'staff-marcus', name: 'Marcus Vance', role: 'Executive Duty Manager', badgeId: 'MGT-900', department: 'Management' },
];

export const HumanVerificationModal: React.FC<HumanVerificationModalProps> = ({
  task,
  isOpen,
  onClose,
  onConfirmResolution,
}) => {
  // Department-specific staff authorization: Only matching department staff or Executive Duty Manager
  const eligibleStaff = React.useMemo(() => {
    if (!task) return AUTHORIZED_STAFF_MEMBERS;
    return AUTHORIZED_STAFF_MEMBERS.filter(
      (s) => s.department === 'Management' || s.department === task.department
    );
  }, [task]);

  const [selectedStaffId, setSelectedStaffId] = useState<string>('');
  const [enteredPin, setEnteredPin] = useState('');
  const [notes, setNotes] = useState('Physical service inspection complete. Tested and verified directly in suite.');
  const [authError, setAuthError] = useState<string | null>(null);
  const [checklist, setChecklist] = useState({
    physicalInspectionDone: true,
    guestSafetyVerified: true,
    luxuryStandardsMet: true,
  });

  // Keep selectedStaffId aligned with eligible staff
  React.useEffect(() => {
    if (eligibleStaff.length > 0) {
      setSelectedStaffId(eligibleStaff[0].id);
      setEnteredPin('');
      setAuthError(null);
    }
  }, [eligibleStaff]);

  if (!isOpen || !task) return null;

  const currentStaff = eligibleStaff.find((s) => s.id === selectedStaffId) || eligibleStaff[0];

  const handleStaffChange = (staffId: string) => {
    setSelectedStaffId(staffId);
    setEnteredPin('');
    setAuthError(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError(null);

    if (!enteredPin.trim()) {
      setAuthError('Security PIN required to authorize sign-off.');
      return;
    }

    try {
      // Authenticate against server's salted SHA-256 PIN authentication endpoint
      const loginRes = await fetch('/api/auth/staff-login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          staffId: currentStaff.id,
          pin: enteredPin.trim(),
        }),
      });

      const loginData = await loginRes.json();
      if (!loginData.success) {
        setAuthError(loginData.error || 'Staff authentication failed');
        return;
      }

      const fullStaffSignature = `${currentStaff.name} [Badge: ${currentStaff.badgeId}]`;
      onConfirmResolution(task.id, fullStaffSignature, notes.trim(), loginData.token, currentStaff.badgeId);
      onClose();
    } catch (err: any) {
      setAuthError(err?.message || 'Authentication error connecting to server');
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-zinc-950/80 backdrop-blur-md">
      <div className="relative w-full max-w-xl bg-zinc-900 border border-zinc-800 rounded-2xl shadow-2xl p-6 sm:p-7 text-zinc-100">
        <div className="flex items-center justify-between border-b border-zinc-800 pb-4 mb-5">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-zinc-100">
                Human Completion Verification
              </h3>
              <p className="text-xs text-zinc-400">
                Operating Principle #8: Physical tasks require authorized human sign-off via POST /api/tasks/:id/verify.
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

        {/* Task Summary Banner */}
        <div className="p-3.5 bg-zinc-950/80 border border-zinc-800/90 rounded-xl mb-4">
          <div className="flex items-center justify-between text-xs text-zinc-400 mb-1">
            <span className="font-mono text-amber-400 font-semibold">{task.caseRef}</span>
            <span className="font-medium text-zinc-300">Suite {task.room}</span>
          </div>
          <div className="text-sm font-semibold text-zinc-100">
            {task.title}
          </div>
          <div className="text-xs text-zinc-400 mt-1">
            Department: <strong className="text-zinc-300">{task.department}</strong> · Priority: {task.priority}
          </div>
        </div>

        {authError && (
          <div className="mb-4 p-2.5 rounded-lg bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{authError}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-zinc-300 mb-1 flex items-center justify-between">
                <span>Authorized Sign-off Staff</span>
                <span className="text-[10px] text-amber-400/90 font-mono">
                  {task.department} or Duty Manager
                </span>
              </label>
              <select
                value={selectedStaffId}
                onChange={(e) => handleStaffChange(e.target.value)}
                className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-xs text-amber-300 font-semibold focus:outline-none focus:border-amber-500/50 cursor-pointer"
              >
                {eligibleStaff.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name} ({s.badgeId} — {s.role})
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-zinc-300 mb-1 flex items-center justify-between">
                <span>Security PIN Authorization</span>
                <span className="text-[10px] text-zinc-500 font-mono">Staff Security PIN</span>
              </label>
              <input
                type="password"
                required
                maxLength={6}
                value={enteredPin}
                onChange={(e) => setEnteredPin(e.target.value)}
                placeholder="Enter Staff PIN"
                className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-xs text-zinc-100 font-mono tracking-widest focus:outline-none focus:border-amber-500/50"
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
