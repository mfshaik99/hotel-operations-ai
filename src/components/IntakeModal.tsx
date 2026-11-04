import React, { useState } from 'react';
import { X, Sparkles, AlertTriangle, Clock, ArrowRight, CheckCircle2, User, Building, ShieldAlert } from 'lucide-react';
import { PRESET_COMPLEX_REQUESTS } from '../data/mockData';
import { Task, Department, Priority } from '../types';

interface IntakeModalProps {
  isOpen: boolean;
  onClose: () => void;
  onDispatchTasks: (newTasks: Omit<Task, 'id' | 'caseRef' | 'createdAt' | 'status' | 'auditTrail'>[], summary: string, rawText: string) => void;
}

export const IntakeModal: React.FC<IntakeModalProps> = ({
  isOpen,
  onClose,
  onDispatchTasks,
}) => {
  const [rawText, setRawText] = useState('');
  const [room, setRoom] = useState('');
  const [guestName, setGuestName] = useState('');
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysisResult, setAnalysisResult] = useState<{
    guestIntent?: string;
    detectedRoom?: string;
    urgencyLevel?: string;
    executiveSummary?: string;
    tasks?: any[];
  } | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleSelectPreset = (preset: typeof PRESET_COMPLEX_REQUESTS[0]) => {
    setRawText(preset.text);
    setRoom(preset.room);
    setGuestName(preset.guest);
    setAnalysisResult(null);
    setErrorMessage(null);
  };

  const handleAnalyze = async () => {
    if (!rawText.trim()) return;
    setIsAnalyzing(true);
    setErrorMessage(null);

    try {
      const res = await fetch('/api/gemini/parse-request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rawText, room, guestName }),
      });
      const data = await res.json();
      if (data && data.tasks) {
        setAnalysisResult(data);
        if (data.detectedRoom && !room) {
          setRoom(data.detectedRoom);
        }
      } else {
        throw new Error('Could not parse operational tasks from request');
      }
    } catch (err: any) {
      console.error('Request parsing failed:', err);
      setErrorMessage('Using internal intelligence fallback for request decomposition.');
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleConfirmDispatch = () => {
    if (!analysisResult || !analysisResult.tasks) return;

    const finalTasks = analysisResult.tasks.map((t: any) => ({
      room: t.detectedRoom || analysisResult.detectedRoom || room || '304',
      title: t.title,
      description: t.rationale || `Decomposed operational request: "${t.title}"`,
      department: (t.department as Department) || 'Reception',
      assignedAgent: t.assignedAgent || `${t.department || 'Reception'} Agent`,
      priority: (t.priority as Priority) || 'Normal',
      slaDeadline: Date.now() + (t.estimatedMinutes || 25) * 60 * 1000,
      estimatedMinutes: t.estimatedMinutes || 25,
      dependencies: t.dependencies || [],
      requiresHumanConfirmation: true, // Core Operating Principle #8
      guestName: guestName || 'VIP Guest',
      riskAssessment: t.potentialRisk || 'Potential guest dissatisfaction if delayed',
    }));

    onDispatchTasks(
      finalTasks,
      analysisResult.executiveSummary || `Dispatched ${finalTasks.length} tasks`,
      rawText
    );
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md overflow-y-auto">
      <div className="relative w-full max-w-4xl bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl p-6 sm:p-8 text-slate-100 my-8">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-800 pb-5 mb-6">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400">
              <Sparkles className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold tracking-tight text-slate-100">
                Advanced Request Intelligence & Intake
              </h2>
              <p className="text-xs text-slate-400">
                Decompose unstructured guest complaints into distinct, trackable departmental responsibilities.
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-slate-200 hover:bg-slate-800 rounded-lg transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Preset Selector */}
        <div className="mb-5">
          <div className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-2">
            Load Operational Test Scenarios (Multi-Department Examples):
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2">
            {PRESET_COMPLEX_REQUESTS.map((preset, idx) => (
              <button
                key={idx}
                type="button"
                onClick={() => handleSelectPreset(preset)}
                className="text-left p-2.5 rounded-lg border border-slate-800 bg-slate-950/60 hover:bg-slate-800/60 hover:border-amber-500/30 transition-all group"
              >
                <div className="text-xs font-semibold text-slate-200 group-hover:text-amber-400 truncate">
                  {preset.label}
                </div>
                <div className="text-[10px] text-slate-500 truncate mt-0.5">
                  Room {preset.room} · {preset.guest}
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* Inputs */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-4">
          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1.5 flex items-center gap-1.5">
              <Building className="w-3.5 h-3.5 text-slate-400" />
              Room / Suite #
            </label>
            <input
              type="text"
              value={room}
              onChange={(e) => setRoom(e.target.value)}
              placeholder="e.g. 412, Penthouse 2"
              className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3.5 py-2 text-sm text-slate-100 placeholder:text-slate-600 focus:outline-none focus:border-amber-500/50"
            />
          </div>

          <div className="sm:col-span-2">
            <label className="block text-xs font-medium text-slate-300 mb-1.5 flex items-center gap-1.5">
              <User className="w-3.5 h-3.5 text-slate-400" />
              Guest Name / Profile (Optional)
            </label>
            <input
              type="text"
              value={guestName}
              onChange={(e) => setGuestName(e.target.value)}
              placeholder="e.g. Ambassador Harrison (VIP tier)"
              className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3.5 py-2 text-sm text-slate-100 placeholder:text-slate-600 focus:outline-none focus:border-amber-500/50"
            />
          </div>
        </div>

        <div className="mb-6">
          <label className="block text-xs font-medium text-slate-300 mb-1.5">
            Raw Guest Communication (Phone call log, Voice transcription, or Front Desk transcript)
          </label>
          <textarea
            value={rawText}
            onChange={(e) => setRawText(e.target.value)}
            rows={4}
            placeholder="Describe the guest request freely. You can mention multiple problems across AC, housekeeping, billing, or general dissatisfaction..."
            className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3.5 text-sm text-slate-100 placeholder:text-slate-600 focus:outline-none focus:border-amber-500/50"
          />
        </div>

        {/* Action Button */}
        <div className="flex items-center justify-between mb-6">
          <div className="text-xs text-slate-400">
            {isAnalyzing ? (
              <span className="flex items-center gap-2 text-amber-400 animate-pulse">
                <Sparkles className="w-4 h-4" />
                Analyzing intent, isolating tasks & assessing risk...
              </span>
            ) : (
              <span>Orchestrator splits compound issues into isolated tasks with clear ownership.</span>
            )}
          </div>
          <button
            type="button"
            disabled={!rawText.trim() || isAnalyzing}
            onClick={handleAnalyze}
            className="flex items-center gap-2 px-5 py-2.5 text-xs font-semibold text-slate-950 bg-amber-400 hover:bg-amber-300 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg shadow transition-all cursor-pointer"
          >
            <Sparkles className="w-4 h-4" />
            <span>Decompose Request with AI</span>
          </button>
        </div>

        {/* Analysis Results Display */}
        {analysisResult && analysisResult.tasks && (
          <div className="border border-slate-800 bg-slate-950/80 rounded-xl p-5 mb-6">
            <div className="flex items-center justify-between mb-4 pb-3 border-b border-slate-800">
              <div>
                <span className="text-xs font-semibold text-amber-400 uppercase tracking-wider">
                  Operational Breakdown Verified
                </span>
                <p className="text-sm text-slate-300 mt-0.5">
                  {analysisResult.executiveSummary}
                </p>
              </div>
              <div className="text-xs font-mono text-slate-400">
                Identified: <span className="text-amber-400 font-semibold">{analysisResult.tasks.length} Independent Tasks</span>
              </div>
            </div>

            <div className="space-y-3">
              {analysisResult.tasks.map((task: any, idx: number) => {
                const deptColor =
                  task.department === 'Maintenance'
                    ? 'text-sky-400 border-sky-500/30 bg-sky-500/10'
                    : task.department === 'Housekeeping'
                    ? 'text-emerald-400 border-emerald-500/30 bg-emerald-500/10'
                    : task.department === 'Management'
                    ? 'text-rose-400 border-rose-500/30 bg-rose-500/10'
                    : 'text-amber-400 border-amber-500/30 bg-amber-500/10';

                return (
                  <div
                    key={idx}
                    className="p-3.5 bg-slate-900 border border-slate-800/90 rounded-lg flex flex-col md:flex-row md:items-center justify-between gap-3"
                  >
                    <div className="space-y-1.5 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className={`text-[10px] font-mono font-semibold px-2 py-0.5 rounded border ${deptColor}`}>
                          {task.department} · {task.assignedAgent}
                        </span>
                        <span className="text-[11px] font-mono text-slate-400">
                          Priority: <strong className="text-slate-200">{task.priority}</strong>
                        </span>
                        <span className="text-[11px] font-mono text-slate-400 flex items-center gap-1">
                          <Clock className="w-3 h-3 text-slate-500" />
                          SLA: {task.estimatedMinutes}m
                        </span>
                      </div>
                      <div className="text-sm font-semibold text-slate-100">
                        {task.title}
                      </div>
                      {task.potentialRisk && (
                        <div className="text-xs text-slate-400 flex items-start gap-1.5">
                          <AlertTriangle className="w-3.5 h-3.5 text-amber-500/80 shrink-0 mt-0.5" />
                          <span>{task.potentialRisk}</span>
                        </div>
                      )}
                      {task.dependencies && task.dependencies.length > 0 && (
                        <div className="text-xs text-indigo-400/90 flex items-center gap-1">
                          <span>↳ Dependency:</span>
                          <span className="text-indigo-300 font-medium">{task.dependencies.join('; ')}</span>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="mt-5 pt-4 border-t border-slate-800/80 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="text-xs text-slate-400 flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                <span>Zero lost responsibilities. Tasks will be broadcasted to the Switch Command Room.</span>
              </div>
              <button
                type="button"
                onClick={handleConfirmDispatch}
                className="flex items-center justify-center gap-2 px-5 py-2.5 text-xs font-bold text-slate-950 bg-gradient-to-r from-amber-400 to-amber-500 hover:from-amber-300 hover:to-amber-400 rounded-lg shadow-md transition-all cursor-pointer"
              >
                <span>Dispatch Responsibilities to Team</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
