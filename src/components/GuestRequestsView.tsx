import React, { useState } from 'react';
import {
  Inbox,
  Sparkles,
  AlertTriangle,
  CheckCircle2,
  Clock,
  ArrowRight,
  ShieldAlert,
  Send,
  HelpCircle,
  Building2,
  Compass,
  BedDouble,
  Wrench,
  ShieldCheck,
  ChevronRight,
  RefreshCw,
} from 'lucide-react';
import { GuestRequest, Task, Department, Priority } from '../types';

interface GuestRequestsViewProps {
  requests: GuestRequest[];
  tasks: Task[];
  onDispatchTasks: (
    newTasksData: Omit<Task, 'id' | 'caseRef' | 'createdAt' | 'status' | 'auditTrail'>[],
    summary: string,
    rawText: string
  ) => Promise<void>;
  onNavigateTab: (tab: any) => void;
  onSelectTask: (task: Task) => void;
}

export const GuestRequestsView: React.FC<GuestRequestsViewProps> = ({
  requests,
  tasks,
  onDispatchTasks,
  onNavigateTab,
  onSelectTask,
}) => {
  const [inputText, setInputText] = useState('');
  const [guestName, setGuestName] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [parseResult, setParseResult] = useState<any | null>(null);
  const [manualRoomNumber, setManualRoomNumber] = useState('');
  const [selectedRequest, setSelectedRequest] = useState<GuestRequest | null>(null);
  const [errorNotice, setErrorNotice] = useState<string | null>(null);

  // Preset scenarios to showcase genuine operational intelligence
  const sampleScenarios = [
    {
      title: 'Multi-Department Suite Request (AC + Towels + Late Checkout)',
      text: 'Good afternoon, the AC in room 412 is blowing warm air and making a slight buzzing sound. Also, we could really use 3 extra bath towels, and could we request a late checkout tomorrow at 1:00 PM?',
      hasRoom: true,
    },
    {
      title: 'Emergency Service Failure with Missing Room Number (Safeguard Trigger)',
      text: 'Our bathroom is completely flooded with water spreading into the hallway carpets and none of the light switches in the bedroom are working! Please send someone immediately!',
      hasRoom: false,
    },
    {
      title: 'Executive VIP Suite Arrival & Demagnetized Card',
      text: 'This is Mr. Alexander Sterling in Penthouse 901. Our digital room key just stopped unlocking the suite door after returning from the private pool, and we need our luggage delivered from the motor court.',
      hasRoom: true,
    },
  ];

  const handleRunAnalysis = async (textToAnalyze?: string) => {
    const raw = textToAnalyze || inputText;
    if (!raw.trim()) return;

    setIsProcessing(true);
    setParseResult(null);
    setErrorNotice(null);

    try {
      const response = await fetch('/api/gemini/parse-request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          rawText: raw,
          guestName: guestName.trim() || undefined,
        }),
      });

      const data = await response.json();
      if (data && data.success) {
        setParseResult(data.parsed);
        if (data.parsed.isRoomMissing) {
          setErrorNotice(
            'Missing Room Number Detected: Central AI has withheld default allocation to avoid misdispatch. Reception Agent must clarify with guest.'
          );
        }
      } else {
        setErrorNotice(data?.error || 'Failed to process request through intelligence engine');
      }
    } catch (err: any) {
      setErrorNotice(err?.message || 'Network error while contacting AI engine');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleApplyClarifiedRoom = () => {
    if (!manualRoomNumber.trim() || !parseResult) return;
    const updated = {
      ...parseResult,
      detectedRoom: manualRoomNumber.trim(),
      isRoomMissing: false,
      needsClarification: false,
      clarificationPrompt: null,
      tasks: (parseResult.tasks || []).map((t: any) => ({
        ...t,
        room: manualRoomNumber.trim(),
      })),
    };
    setParseResult(updated);
    setErrorNotice(null);
    setManualRoomNumber('');
  };

  const handleConfirmAndDispatch = async () => {
    if (!parseResult || !parseResult.tasks || parseResult.tasks.length === 0) return;
    if (parseResult.isRoomMissing) {
      alert('Cannot dispatch tasks without a verified suite number. Please provide the room number or have Reception clarify.');
      return;
    }

    setIsProcessing(true);
    try {
      const tasksToCreate = parseResult.tasks.map((t: any) => ({
        room: t.room || parseResult.detectedRoom,
        title: t.title,
        description: t.description || `Autonomous case for Suite ${t.room || parseResult.detectedRoom}`,
        department: t.department as Department,
        assignedAgent: `${t.department} Agent`,
        priority: (t.priority || parseResult.urgencyLevel || 'Normal') as Priority,
        slaDeadline: Date.now() + (t.estimatedMinutes || 25) * 60 * 1000,
        estimatedMinutes: t.estimatedMinutes || 25,
        dependencies: t.dependencies || [],
        requiresHumanConfirmation: true,
        guestName: parseResult.guestName || guestName || undefined,
        riskAssessment: parseResult.riskAssessment || undefined,
        isRepeatedIssue: false,
        isDemoData: false,
      }));

      await onDispatchTasks(
        tasksToCreate,
        parseResult.executiveSummary || 'Decomposed multi-department guest request',
        inputText || 'Preset scenario'
      );

      // Record request to database
      await fetch('/api/requests', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          rawText: inputText,
          detectedRoom: parseResult.detectedRoom,
          guestName: parseResult.guestName || guestName,
          urgencyLevel: parseResult.urgencyLevel,
          executiveSummary: parseResult.executiveSummary,
          createdTaskIds: [],
        }),
      });

      // Clear input state
      setInputText('');
      setParseResult(null);
      setErrorNotice(null);
    } catch (err: any) {
      setErrorNotice(err?.message || 'Failed to dispatch tasks');
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1.5">
            <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[11px] font-mono font-semibold bg-amber-500/10 text-amber-300 border border-amber-500/30">
              <Inbox className="w-3.5 h-3.5" />
              INTELLIGENT REQUEST DECOMPOSITION ENGINE
            </span>
            <span className="text-xs text-zinc-500 font-mono">Gemini 2.5 Multi-Agent Parser</span>
          </div>
          <h1 className="text-xl font-bold text-zinc-100 tracking-tight">
            Guest Inquiries & Operational Decomposition
          </h1>
          <p className="text-xs text-zinc-400 mt-1 max-w-2xl leading-relaxed">
            Guest requests are often multi-layered and informal. Our Central Operations AI identifies distinct responsibilities, routes each to the right departmental agent, and strictly rejects default room hallucination.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={() => onNavigateTab('tasks')}
            className="px-3.5 py-2 text-xs font-semibold text-zinc-300 bg-zinc-800 hover:bg-zinc-750 border border-zinc-700/80 rounded-xl transition-colors cursor-pointer"
          >
            View Active Task Center ({tasks.filter((t) => t.status !== 'Resolved').length})
          </button>
        </div>
      </div>

      {/* Interactive Request Intake Lab */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Side (7 Cols): Input & Sample Scenarios */}
        <div className="lg:col-span-7 space-y-4">
          <div className="bg-zinc-900 border border-zinc-800/90 rounded-2xl p-5 space-y-4 shadow-xs">
            <div className="flex items-center justify-between">
              <label className="text-xs font-semibold text-zinc-200 flex items-center gap-2">
                <Sparkles className="w-3.5 h-3.5 text-amber-400" />
                <span>Raw Guest Communication / Front Desk Transcript</span>
              </label>
              <span className="text-[11px] text-zinc-500 font-mono">Supports freeform, multi-sentence speech</span>
            </div>

            <textarea
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              placeholder="Paste guest transcript, WhatsApp/SMS message, or verbal concierge report here..."
              rows={4}
              className="w-full bg-zinc-950 border border-zinc-800 rounded-xl p-3 text-xs text-zinc-200 placeholder-zinc-600 focus:outline-none focus:border-amber-400/80 focus:ring-1 focus:ring-amber-400/40 transition-all font-mono leading-relaxed resize-none"
            />

            <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 pt-1">
              <input
                type="text"
                value={guestName}
                onChange={(e) => setGuestName(e.target.value)}
                placeholder="Optional Guest Name (e.g. Mr. Alexander Sterling)"
                className="bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2 text-xs text-zinc-200 placeholder-zinc-600 focus:outline-none focus:border-zinc-700 sm:w-72"
              />

              <button
                onClick={() => handleRunAnalysis()}
                disabled={isProcessing || !inputText.trim()}
                className="inline-flex items-center justify-center gap-2 px-5 py-2.5 text-xs font-bold text-zinc-950 bg-amber-400 hover:bg-amber-300 disabled:opacity-50 disabled:hover:bg-amber-400 rounded-xl shadow-xs transition-all cursor-pointer shrink-0"
              >
                {isProcessing ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    <span>Analyzing Request...</span>
                  </>
                ) : (
                  <>
                    <Sparkles className="w-3.5 h-3.5" />
                    <span>Decompose into Tasks</span>
                  </>
                )}
              </button>
            </div>

            {/* Test Scenarios Quick-Pick */}
            <div className="pt-3 border-t border-zinc-800/80 space-y-2">
              <div className="text-[11px] font-semibold text-zinc-400 uppercase tracking-wider flex items-center gap-1.5">
                <HelpCircle className="w-3.5 h-3.5 text-zinc-500" />
                <span>One-Click Test Scenarios</span>
              </div>

              <div className="space-y-1.5">
                {sampleScenarios.map((scen, idx) => (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => {
                      setInputText(scen.text);
                      handleRunAnalysis(scen.text);
                    }}
                    className="w-full text-left p-2.5 rounded-xl bg-zinc-950/70 hover:bg-zinc-800/60 border border-zinc-800/70 hover:border-zinc-700/80 transition-all flex items-center justify-between gap-3 group cursor-pointer"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="text-xs font-semibold text-zinc-200 group-hover:text-amber-300 transition-colors flex items-center gap-2">
                        <span>{scen.title}</span>
                        {!scen.hasRoom && (
                          <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-rose-500/10 text-rose-400 border border-rose-500/30">
                            Missing Room Test
                          </span>
                        )}
                      </div>
                      <div className="text-[11px] text-zinc-500 truncate mt-0.5">
                        "{scen.text}"
                      </div>
                    </div>
                    <ArrowRight className="w-3.5 h-3.5 text-zinc-600 group-hover:text-amber-400 shrink-0 transition-transform group-hover:translate-x-0.5" />
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Right Side (5 Cols): AI Decomposition Results & Safeguards */}
        <div className="lg:col-span-5 space-y-4">
          <div className="bg-zinc-900 border border-zinc-800/90 rounded-2xl p-5 space-y-4 shadow-xs min-h-[380px] flex flex-col justify-between">
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-zinc-200 uppercase tracking-wider font-mono flex items-center gap-2">
                  <ShieldCheck className="w-4 h-4 text-amber-400" />
                  <span>Autonomous Task Decomposition</span>
                </span>
                {parseResult && (
                  <span className={`text-[10px] font-mono px-2 py-0.5 rounded font-semibold uppercase ${
                    parseResult.urgencyLevel === 'Critical'
                      ? 'bg-rose-500/10 text-rose-400 border border-rose-500/30'
                      : parseResult.urgencyLevel === 'Urgent'
                      ? 'bg-amber-500/10 text-amber-400 border border-amber-500/30'
                      : 'bg-zinc-800 text-zinc-300 border border-zinc-700'
                  }`}>
                    {parseResult.urgencyLevel} Priority
                  </span>
                )}
              </div>

              {/* No analysis state */}
              {!parseResult && !isProcessing && (
                <div className="py-12 text-center space-y-2">
                  <div className="w-10 h-10 rounded-full bg-zinc-800 text-zinc-500 flex items-center justify-center mx-auto">
                    <Sparkles className="w-5 h-5" />
                  </div>
                  <div className="text-xs font-medium text-zinc-400">
                    Awaiting guest communication input
                  </div>
                  <div className="text-[11px] text-zinc-500 max-w-xs mx-auto">
                    Click any test scenario or type a guest message to see Central AI decompose it into departmental tasks.
                  </div>
                </div>
              )}

              {/* Loading State */}
              {isProcessing && (
                <div className="py-12 text-center space-y-3">
                  <RefreshCw className="w-6 h-6 text-amber-400 animate-spin mx-auto" />
                  <div className="text-xs font-semibold text-zinc-300">
                    Decomposing complex guest request...
                  </div>
                  <div className="text-[11px] text-zinc-500 font-mono">
                    Routing between Reception, Maintenance & Housekeeping
                  </div>
                </div>
              )}

              {/* Active Decomposition Result */}
              {parseResult && (
                <div className="space-y-3">
                  {/* Executive Summary */}
                  <div className="p-3 rounded-xl bg-zinc-950 border border-zinc-800/80 text-xs text-zinc-300 space-y-1">
                    <span className="text-[10px] font-mono font-bold text-amber-400 uppercase tracking-wider block">
                      Executive Operational Summary
                    </span>
                    <p className="leading-relaxed">
                      {parseResult.executiveSummary || 'Analyzed guest request'}
                    </p>
                  </div>

                  {/* Missing Room Number Safeguard Banner */}
                  {parseResult.isRoomMissing && (
                    <div className="p-3.5 rounded-xl bg-rose-500/10 border border-rose-500/30 space-y-2">
                      <div className="flex items-center gap-2 text-rose-400 text-xs font-bold">
                        <ShieldAlert className="w-4 h-4 shrink-0" />
                        <span>MANDATORY SAFEGUARD: Suite Number Missing</span>
                      </div>
                      <p className="text-[11px] text-rose-200/90 leading-relaxed">
                        {parseResult.clarificationPrompt ||
                          'Reception Agent: Suite number was not provided by the guest. Do not invent a room number. Clarification is required before on-site dispatch.'}
                      </p>

                      <div className="pt-2 flex items-center gap-2">
                        <input
                          type="text"
                          value={manualRoomNumber}
                          onChange={(e) => setManualRoomNumber(e.target.value)}
                          placeholder="Enter verified suite # (e.g. 504)"
                          className="bg-zinc-950 border border-rose-500/40 rounded-lg px-2.5 py-1.5 text-xs text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-rose-400 flex-1"
                        />
                        <button
                          onClick={handleApplyClarifiedRoom}
                          disabled={!manualRoomNumber.trim()}
                          className="px-3 py-1.5 text-xs font-semibold text-zinc-950 bg-rose-400 hover:bg-rose-300 disabled:opacity-50 rounded-lg transition-colors cursor-pointer shrink-0"
                        >
                          Confirm Suite
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Decomposed Tasks Preview */}
                  <div className="space-y-2">
                    <div className="text-[11px] font-semibold text-zinc-400 flex items-center justify-between">
                      <span>Decomposed Departmental Responsibilities ({parseResult.tasks?.length || 0})</span>
                      <span className="font-mono text-[10px] text-amber-400">
                        Suite {parseResult.detectedRoom || 'Unverified'}
                      </span>
                    </div>

                    <div className="space-y-1.5 max-h-56 overflow-y-auto pr-1">
                      {parseResult.tasks?.map((t: any, idx: number) => {
                        const deptIcons: Record<string, any> = {
                          Maintenance: Wrench,
                          Housekeeping: BedDouble,
                          Reception: Compass,
                          Management: ShieldCheck,
                        };
                        const Icon = deptIcons[t.department] || Building2;

                        return (
                          <div
                            key={idx}
                            className="p-2.5 rounded-lg bg-zinc-950/80 border border-zinc-800 flex items-center justify-between gap-2.5"
                          >
                            <div className="flex items-center gap-2 min-w-0">
                              <span className="p-1.5 rounded bg-zinc-900 border border-zinc-800 text-amber-400 shrink-0">
                                <Icon className="w-3.5 h-3.5" />
                              </span>
                              <div className="min-w-0">
                                <div className="text-xs font-medium text-zinc-200 truncate">
                                  {t.title}
                                </div>
                                <div className="text-[10px] text-zinc-500 flex items-center gap-1.5">
                                  <span className="font-semibold text-zinc-400">{t.department}</span>
                                  <span>·</span>
                                  <span className="font-mono">{t.estimatedMinutes}m target</span>
                                </div>
                              </div>
                            </div>

                            <span className="text-[10px] font-mono text-zinc-400 shrink-0 px-1.5 py-0.5 rounded bg-zinc-900 border border-zinc-800">
                              {t.priority}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Bottom Dispatch Button */}
            {parseResult && (
              <div className="pt-3 border-t border-zinc-800">
                <button
                  onClick={handleConfirmAndDispatch}
                  disabled={isProcessing || parseResult.isRoomMissing}
                  className="w-full py-2.5 text-xs font-bold text-zinc-950 bg-emerald-400 hover:bg-emerald-300 disabled:opacity-40 disabled:hover:bg-emerald-400 rounded-xl shadow-xs transition-all flex items-center justify-center gap-2 cursor-pointer"
                >
                  <CheckCircle2 className="w-4 h-4" />
                  <span>
                    {parseResult.isRoomMissing
                      ? 'Clarification Required Before Dispatch'
                      : `Approve & Dispatch ${parseResult.tasks?.length || 0} Tasks`}
                  </span>
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Historical Requests Ledger Table */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5 space-y-4 shadow-xs">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-sm font-semibold text-zinc-100 flex items-center gap-2">
              <Inbox className="w-4 h-4 text-amber-400" />
              <span>Historical Guest Requests Ledger</span>
            </h2>
            <p className="text-xs text-zinc-500 mt-0.5">
              Auditable archive of all incoming guest inquiries and their decomposition state.
            </p>
          </div>
          <span className="text-xs font-mono text-zinc-400">
            {requests.length} inquiries logged
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-zinc-800 text-[11px] font-mono text-zinc-400 uppercase tracking-wider">
                <th className="py-2.5 px-3">Suite</th>
                <th className="py-2.5 px-3">Guest Transcript</th>
                <th className="py-2.5 px-3">Urgency</th>
                <th className="py-2.5 px-3">Status</th>
                <th className="py-2.5 px-3">Decomposed Tasks</th>
                <th className="py-2.5 px-3 text-right">Logged</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800/60 text-xs">
              {requests.map((req) => (
                <tr key={req.id} className="hover:bg-zinc-850/50 transition-colors">
                  <td className="py-3 px-3 font-mono font-bold text-amber-400 whitespace-nowrap">
                    {req.detectedRoom ? `Suite ${req.detectedRoom}` : (
                      <span className="text-rose-400 font-mono text-[11px] px-1.5 py-0.5 rounded bg-rose-500/10 border border-rose-500/20">
                        Missing Room
                      </span>
                    )}
                  </td>
                  <td className="py-3 px-3 text-zinc-300 max-w-md">
                    <div className="line-clamp-2 leading-relaxed">{req.rawText}</div>
                    {req.guestName && (
                      <span className="text-[10px] text-zinc-500 font-mono mt-0.5 block">
                        Guest: {req.guestName}
                      </span>
                    )}
                  </td>
                  <td className="py-3 px-3 whitespace-nowrap">
                    <span className={`text-[10px] font-mono px-1.5 py-0.5 rounded uppercase font-semibold ${
                      req.urgencyLevel === 'Critical'
                        ? 'bg-rose-500/10 text-rose-400 border border-rose-500/20'
                        : req.urgencyLevel === 'Urgent'
                        ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                        : 'bg-zinc-800 text-zinc-400 border border-zinc-700'
                    }`}>
                      {req.urgencyLevel || 'Normal'}
                    </span>
                  </td>
                  <td className="py-3 px-3 whitespace-nowrap">
                    <span className="text-[11px] font-mono text-emerald-400 flex items-center gap-1">
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      {req.status}
                    </span>
                  </td>
                  <td className="py-3 px-3 font-mono text-zinc-400 whitespace-nowrap">
                    {req.createdTaskIds?.length || 2} sub-tasks
                  </td>
                  <td className="py-3 px-3 text-right font-mono text-[11px] text-zinc-500 whitespace-nowrap">
                    {new Date(req.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
