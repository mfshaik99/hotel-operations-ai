import React, { useState, useRef, useEffect } from 'react';
import {
  Radio,
  Send,
  Sparkles,
  Shield,
  Bot,
  User,
  AlertTriangle,
  CheckCircle2,
  Clock,
  Filter,
  RefreshCw,
  Terminal,
  Zap,
  Activity,
  Layers,
} from 'lucide-react';
import { SwitchMessage, Department, Task, SwitchConnectionState, SwitchConfig } from '../types';

interface SwitchOpsRoomProps {
  messages: SwitchMessage[];
  tasks: Task[];
  switchState?: SwitchConnectionState;
  switchConfig?: SwitchConfig;
  onSendMessage: (sender: string, avatarRole: string, content: string, badge?: any, room?: string) => void;
  onRequestConsultation: (topic: string, room?: string) => Promise<void>;
  onDispatchSwitchEvent: (eventType: string, targetDept: Department, summary: string, room?: string) => void;
}

export const SwitchOpsRoom: React.FC<SwitchOpsRoomProps> = ({
  messages,
  tasks,
  switchState,
  switchConfig,
  onSendMessage,
  onRequestConsultation,
  onDispatchSwitchEvent,
}) => {
  const [inputText, setInputText] = useState('');
  const [selectedRoom, setSelectedRoom] = useState<string>('All');
  const [sourceFilter, setSourceFilter] = useState<'ALL' | 'LIVE_ONLY' | 'DEMO_ONLY'>('ALL');
  const [isConsulting, setIsConsulting] = useState(false);
  const [isEventModalOpen, setIsEventModalOpen] = useState(false);
  const [customEvent, setCustomEvent] = useState({
    eventType: 'CROSS_DEPT_HANDOVER',
    targetDept: 'Maintenance' as Department,
    summary: '',
    room: '412',
  });
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const roomsWithTasks = Array.from(new Set(tasks.map((t) => t.room))).filter(Boolean);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const filteredMessages = messages.filter((m) => {
    const matchesRoom = selectedRoom === 'All' || m.room === selectedRoom || !m.room;
    const matchesSource =
      sourceFilter === 'ALL'
        ? true
        : sourceFilter === 'LIVE_ONLY'
        ? m.sourceType === 'LIVE_AGENT' || m.sourceType === 'SWITCH_PROTOCOL'
        : m.sourceType === 'DEMO_SEED';

    return matchesRoom && matchesSource;
  });

  const handleSend = (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputText.trim()) return;

    onSendMessage(
      'Central Operations AI',
      'Orchestrator',
      inputText.trim(),
      'INFO',
      selectedRoom !== 'All' ? selectedRoom : undefined
    );
    setInputText('');
  };

  const handleTriggerConsultation = async (topic: string) => {
    setIsConsulting(true);
    await onRequestConsultation(topic, selectedRoom !== 'All' ? selectedRoom : '412');
    setIsConsulting(false);
  };

  const handleDispatchCustomEvent = (e: React.FormEvent) => {
    e.preventDefault();
    if (!customEvent.summary.trim()) return;
    onDispatchSwitchEvent(customEvent.eventType, customEvent.targetDept, customEvent.summary.trim(), customEvent.room);
    setCustomEvent({ ...customEvent, summary: '' });
    setIsEventModalOpen(false);
  };

  const getBadgeStyle = (badge?: string) => {
    switch (badge) {
      case 'ESCALATED':
      case 'ALERT':
        return 'text-rose-400 bg-rose-500/10 border-rose-500/30';
      case 'DISPATCHED':
        return 'text-indigo-400 bg-indigo-500/10 border-indigo-500/30';
      case 'ACKNOWLEDGED':
        return 'text-sky-400 bg-sky-500/10 border-sky-500/30';
      case 'VERIFIED':
        return 'text-emerald-400 bg-emerald-500/10 border-emerald-500/30';
      case 'SLA ACTIVE':
        return 'text-amber-400 bg-amber-500/10 border-amber-500/30';
      default:
        return 'text-zinc-400 bg-zinc-800 border-zinc-700';
    }
  };

  const getSourceBadge = (source: string) => {
    switch (source) {
      case 'LIVE_AGENT':
        return (
          <span className="text-[9px] font-mono px-1.5 py-0.2 rounded bg-amber-500/15 text-amber-300 border border-amber-500/30">
            LIVE AGENT
          </span>
        );
      case 'SWITCH_PROTOCOL':
        return (
          <span className="text-[9px] font-mono px-1.5 py-0.2 rounded bg-emerald-500/15 text-emerald-300 border border-emerald-500/30">
            SWITCH BUS
          </span>
        );
      default:
        return (
          <span className="text-[9px] font-mono px-1.5 py-0.2 rounded bg-zinc-800 text-zinc-400 border border-zinc-700/60">
            DEMO SEED
          </span>
        );
    }
  };

  const getSenderAvatar = (sender: string) => {
    if (sender.includes('Central')) {
      return (
        <div className="w-8 h-8 rounded-lg bg-amber-500/15 border border-amber-500/30 text-amber-300 flex items-center justify-center font-bold text-xs shrink-0 shadow-xs">
          CO
        </div>
      );
    }
    if (sender.includes('Maintenance')) {
      return (
        <div className="w-8 h-8 rounded-lg bg-sky-500/15 border border-sky-500/30 text-sky-300 flex items-center justify-center font-bold text-xs shrink-0 shadow-xs">
          MT
        </div>
      );
    }
    if (sender.includes('Housekeeping')) {
      return (
        <div className="w-8 h-8 rounded-lg bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 flex items-center justify-center font-bold text-xs shrink-0 shadow-xs">
          HK
        </div>
      );
    }
    if (sender.includes('Management')) {
      return (
        <div className="w-8 h-8 rounded-lg bg-rose-500/15 border border-rose-500/30 text-rose-300 flex items-center justify-center font-bold text-xs shrink-0 shadow-xs">
          GM
        </div>
      );
    }
    return (
      <div className="w-8 h-8 rounded-lg bg-amber-500/15 border border-amber-500/30 text-amber-300 flex items-center justify-center font-bold text-xs shrink-0 shadow-xs">
        RX
      </div>
    );
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-4 gap-4 h-[780px]">
      {/* Sidebar: Protocol Telemetry, Channels & Agent Bus Control */}
      <div className="lg:col-span-1 bg-zinc-900 border border-zinc-800/80 rounded-xl p-4 flex flex-col justify-between shadow-xs">
        <div className="space-y-4">
          {/* Telemetry Status Box */}
          <div className="bg-zinc-950/80 border border-zinc-800 p-3 rounded-lg space-y-1.5">
            <div className="flex items-center justify-between text-[11px] font-mono text-zinc-400">
              <span className="flex items-center gap-1.5 text-zinc-200 font-semibold">
                <Radio className="w-3.5 h-3.5 text-amber-400" />
                Switch Protocol v1.4
              </span>
              <span className={`text-[10px] px-1.5 py-0.2 rounded font-semibold ${
                switchConfig?.status === 'CONNECTED'
                  ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30'
                  : switchConfig?.status === 'DISCONNECTED'
                  ? 'bg-rose-500/15 text-rose-400 border border-rose-500/30'
                  : 'bg-zinc-800 text-amber-400 border border-zinc-700'
              }`}>
                {switchConfig?.status === 'CONNECTED'
                  ? 'CONNECTED'
                  : switchConfig?.status === 'DISCONNECTED'
                  ? 'DISCONNECTED'
                  : 'STANDBY'}
              </span>
            </div>
            <p className="text-[10px] text-zinc-400 leading-relaxed">
              {switchConfig?.status === 'CONNECTED'
                ? `Active Switch Room: ${switchConfig.roomId || 'hotel-operations-room'}`
                : 'Local agent mesh. Configure real Switch webhook in Settings.'}
            </p>
            <div className="pt-1 border-t border-zinc-850 flex items-center justify-between text-[10px] font-mono text-zinc-500">
              <span>Events: {switchConfig?.totalDelivered ?? switchState?.totalEventsProcessed ?? 0}</span>
              <span>Agents: 5 Active</span>
            </div>
          </div>

          {/* Filter by Source (Demo vs Live) */}
          <div>
            <div className="text-[10px] font-mono text-zinc-400 uppercase tracking-wider mb-1.5">
              Source Filter (Demo vs Live)
            </div>
            <div className="grid grid-cols-3 gap-1 bg-zinc-950 p-1 rounded-lg border border-zinc-800 text-[11px]">
              <button
                onClick={() => setSourceFilter('ALL')}
                className={`py-1 rounded text-center transition-colors cursor-pointer ${
                  sourceFilter === 'ALL'
                    ? 'bg-zinc-800 text-amber-300 font-semibold'
                    : 'text-zinc-400 hover:text-zinc-200'
                }`}
              >
                All
              </button>
              <button
                onClick={() => setSourceFilter('LIVE_ONLY')}
                className={`py-1 rounded text-center transition-colors cursor-pointer ${
                  sourceFilter === 'LIVE_ONLY'
                    ? 'bg-zinc-800 text-amber-300 font-semibold'
                    : 'text-zinc-400 hover:text-zinc-200'
                }`}
              >
                Live AI
              </button>
              <button
                onClick={() => setSourceFilter('DEMO_ONLY')}
                className={`py-1 rounded text-center transition-colors cursor-pointer ${
                  sourceFilter === 'DEMO_ONLY'
                    ? 'bg-zinc-800 text-amber-300 font-semibold'
                    : 'text-zinc-400 hover:text-zinc-200'
                }`}
              >
                Demo
              </button>
            </div>
          </div>

          {/* Suite Channel Filter */}
          <div>
            <div className="text-[10px] font-mono text-zinc-400 uppercase tracking-wider mb-1.5">
              Filter by Suite Channel
            </div>
            <div className="space-y-1 max-h-36 overflow-y-auto pr-1">
              <button
                onClick={() => setSelectedRoom('All')}
                className={`w-full text-left px-3 py-1.5 text-xs rounded-lg transition-colors flex items-center justify-between cursor-pointer ${
                  selectedRoom === 'All'
                    ? 'bg-amber-500/15 text-amber-300 font-semibold border border-amber-500/30'
                    : 'text-zinc-400 hover:bg-zinc-800/60'
                }`}
              >
                <span>All Operations</span>
                <span className="font-mono text-[10px]">{messages.length}</span>
              </button>
              {roomsWithTasks.map((rm) => (
                <button
                  key={rm}
                  onClick={() => setSelectedRoom(rm)}
                  className={`w-full text-left px-3 py-1.5 text-xs rounded-lg transition-colors flex items-center justify-between cursor-pointer ${
                    selectedRoom === rm
                      ? 'bg-amber-500/15 text-amber-300 font-semibold border border-amber-500/30'
                      : 'text-zinc-400 hover:bg-zinc-800/60'
                  }`}
                >
                  <span>Suite {rm}</span>
                  <span className="font-mono text-[10px] text-zinc-500">
                    {messages.filter((m) => m.room === rm).length}
                  </span>
                </button>
              ))}
            </div>
          </div>

          {/* Autonomous AI Consultation Triggers */}
          <div className="pt-2 border-t border-zinc-800">
            <div className="text-[10px] font-mono text-zinc-400 uppercase tracking-wider mb-2">
              Autonomous Team Consultations
            </div>
            <div className="space-y-1.5">
              <button
                disabled={isConsulting}
                onClick={() => handleTriggerConsultation('Cross-Department VIP Arrival Sync')}
                className="w-full text-left p-2 rounded-lg bg-zinc-950/70 border border-zinc-800 hover:border-amber-500/40 text-[11px] text-zinc-300 hover:text-amber-300 transition-all flex items-center gap-2 group cursor-pointer"
              >
                <Sparkles className="w-3.5 h-3.5 text-amber-400 group-hover:rotate-12 transition-transform" />
                <span>Sync VIP Arrival Sequence</span>
              </button>

              <button
                disabled={isConsulting}
                onClick={() => handleTriggerConsultation('Audit HVAC Delay & Redundancy in Suite 412')}
                className="w-full text-left p-2 rounded-lg bg-zinc-950/70 border border-zinc-800 hover:border-rose-500/40 text-[11px] text-zinc-300 hover:text-rose-300 transition-all flex items-center gap-2 group cursor-pointer"
              >
                <AlertTriangle className="w-3.5 h-3.5 text-rose-400 group-hover:scale-110 transition-transform" />
                <span>Trigger HVAC Redundancy Audit</span>
              </button>

              <button
                disabled={isConsulting}
                onClick={() => handleTriggerConsultation('Evening Turndown & Linen Bottleneck Review')}
                className="w-full text-left p-2 rounded-lg bg-zinc-950/70 border border-zinc-800 hover:border-emerald-500/40 text-[11px] text-zinc-300 hover:text-emerald-300 transition-all flex items-center gap-2 group cursor-pointer"
              >
                <Clock className="w-3.5 h-3.5 text-emerald-400 group-hover:scale-110 transition-transform" />
                <span>Review Housekeeping Queue</span>
              </button>
            </div>
          </div>
        </div>

        {/* Dispatch Switch Protocol Event Button */}
        <div className="mt-4 pt-3 border-t border-zinc-800 space-y-2">
          <button
            onClick={() => setIsEventModalOpen(true)}
            className="w-full py-2 px-3 text-xs font-semibold text-zinc-200 bg-zinc-800 hover:bg-zinc-750 border border-zinc-700/80 rounded-lg transition-colors flex items-center justify-center gap-1.5 cursor-pointer"
          >
            <Zap className="w-3.5 h-3.5 text-amber-400" />
            <span>Emit Switch Protocol Event</span>
          </button>
        </div>
      </div>

      {/* Main Switch Dialogue Feed */}
      <div className="lg:col-span-3 bg-zinc-900 border border-zinc-800/80 rounded-xl flex flex-col justify-between overflow-hidden shadow-xs">
        {/* Feed Header */}
        <div className="p-3.5 bg-zinc-950/80 border-b border-zinc-800 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            <span className="text-xs font-mono font-semibold text-zinc-200">
              SWITCH OPERATIONS CHANNEL · {selectedRoom === 'All' ? 'GLOBAL PROPERTY FEED' : `SUITE ${selectedRoom}`}
            </span>
          </div>
          {isConsulting && (
            <div className="flex items-center gap-2 text-xs text-amber-400 font-mono animate-pulse">
              <RefreshCw className="w-3.5 h-3.5 animate-spin" />
              <span>Agents synthesizing business directive...</span>
            </div>
          )}
        </div>

        {/* Message Log */}
        <div className="flex-1 p-4 overflow-y-auto space-y-3">
          {filteredMessages.map((msg) => (
            <div
              key={msg.id}
              className="p-3 bg-zinc-950/70 border border-zinc-800/80 rounded-xl flex items-start gap-3 hover:border-zinc-700/70 transition-all"
            >
              {getSenderAvatar(msg.sender)}

              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-2 mb-1 flex-wrap">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold text-zinc-200">
                      {msg.sender}
                    </span>
                    <span className="text-[10px] font-mono text-zinc-400">
                      [{msg.avatarRole}]
                    </span>
                    {msg.room && (
                      <span className="text-[10px] font-mono text-amber-400/90 font-semibold px-1.5 py-0.2 rounded bg-amber-500/10 border border-amber-500/20">
                        Suite {msg.room}
                      </span>
                    )}
                    {getSourceBadge(msg.sourceType)}
                  </div>
                  <div className="flex items-center gap-2">
                    {msg.badge && (
                      <span
                        className={`text-[9px] font-mono font-bold px-1.5 py-0.5 rounded border ${getBadgeStyle(
                          msg.badge
                        )}`}
                      >
                        {msg.badge}
                      </span>
                    )}
                    <span className="text-[11px] font-mono text-zinc-500">
                      {msg.timestamp}
                    </span>
                  </div>
                </div>

                <p className="text-xs text-zinc-300 leading-relaxed font-normal">
                  {msg.content}
                </p>
              </div>
            </div>
          ))}
          <div ref={messagesEndRef} />
        </div>

        {/* Transmission Input Bar */}
        <form onSubmit={handleSend} className="p-3 bg-zinc-950/80 border-t border-zinc-800 flex items-center gap-2">
          <input
            type="text"
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            placeholder="Broadcast instruction or operational note to Switch AI agents..."
            className="flex-1 bg-zinc-900 border border-zinc-800 rounded-lg px-3.5 py-2 text-xs text-zinc-100 placeholder:text-zinc-600 focus:outline-none focus:border-amber-500/40"
          />
          <button
            type="submit"
            disabled={!inputText.trim()}
            className="flex items-center gap-1.5 px-4 py-2 text-xs font-bold text-zinc-950 bg-amber-400 hover:bg-amber-300 disabled:opacity-40 disabled:cursor-not-allowed rounded-lg shadow-xs transition-all cursor-pointer"
          >
            <Send className="w-3.5 h-3.5" />
            <span>Transmit</span>
          </button>
        </form>
      </div>

      {/* Switch Protocol Event Modal */}
      {isEventModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-zinc-950/80 backdrop-blur-xs">
          <div className="w-full max-w-md bg-zinc-900 border border-zinc-800 rounded-2xl p-5 text-zinc-100 shadow-xl space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-zinc-800">
              <div className="flex items-center gap-2 text-sm font-bold text-zinc-100">
                <Zap className="w-4 h-4 text-amber-400" />
                <span>Emit Switch Protocol Event</span>
              </div>
              <button
                onClick={() => setIsEventModalOpen(false)}
                className="text-xs text-zinc-400 hover:text-zinc-200"
              >
                Close
              </button>
            </div>

            <form onSubmit={handleDispatchCustomEvent} className="space-y-3 text-xs">
              <div>
                <label className="block text-zinc-300 mb-1 font-medium">Event Type</label>
                <select
                  value={customEvent.eventType}
                  onChange={(e) => setCustomEvent({ ...customEvent, eventType: e.target.value })}
                  className="w-full bg-zinc-950 border border-zinc-800 rounded-lg p-2 text-zinc-100 focus:outline-none"
                >
                  <option value="CROSS_DEPT_HANDOVER">CROSS_DEPT_HANDOVER</option>
                  <option value="PRIORITY_ESCALATION">PRIORITY_ESCALATION</option>
                  <option value="SLA_TELEMETRY_ALERT">SLA_TELEMETRY_ALERT</option>
                  <option value="HUMAN_INTERVENTION_REQUEST">HUMAN_INTERVENTION_REQUEST</option>
                </select>
              </div>

              <div>
                <label className="block text-zinc-300 mb-1 font-medium">Target Department</label>
                <select
                  value={customEvent.targetDept}
                  onChange={(e) => setCustomEvent({ ...customEvent, targetDept: e.target.value as Department })}
                  className="w-full bg-zinc-950 border border-zinc-800 rounded-lg p-2 text-zinc-100 focus:outline-none"
                >
                  <option value="Maintenance">Maintenance</option>
                  <option value="Housekeeping">Housekeeping</option>
                  <option value="Reception">Reception</option>
                  <option value="Management">Management</option>
                </select>
              </div>

              <div>
                <label className="block text-zinc-300 mb-1 font-medium">Room #</label>
                <input
                  type="text"
                  value={customEvent.room}
                  onChange={(e) => setCustomEvent({ ...customEvent, room: e.target.value })}
                  className="w-full bg-zinc-950 border border-zinc-800 rounded-lg p-2 text-zinc-100 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-zinc-300 mb-1 font-medium">Operational Directive / Summary</label>
                <textarea
                  rows={2}
                  required
                  value={customEvent.summary}
                  onChange={(e) => setCustomEvent({ ...customEvent, summary: e.target.value })}
                  placeholder="e.g. Expedite chilled-water valve balancing before Housekeeping enters..."
                  className="w-full bg-zinc-950 border border-zinc-800 rounded-lg p-2 text-zinc-100 focus:outline-none"
                />
              </div>

              <div className="pt-2 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsEventModalOpen(false)}
                  className="px-3 py-1.5 text-zinc-400 hover:text-zinc-200"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 text-zinc-950 bg-amber-400 hover:bg-amber-300 font-bold rounded-lg cursor-pointer"
                >
                  Dispatch to Bus
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
