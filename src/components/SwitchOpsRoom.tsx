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
} from 'lucide-react';
import { SwitchMessage, Department, Task } from '../types';

interface SwitchOpsRoomProps {
  messages: SwitchMessage[];
  tasks: Task[];
  onSendMessage: (sender: string, avatarRole: string, content: string, badge?: any, room?: string) => void;
  onRequestConsultation: (topic: string, room?: string) => Promise<void>;
}

export const SwitchOpsRoom: React.FC<SwitchOpsRoomProps> = ({
  messages,
  tasks,
  onSendMessage,
  onRequestConsultation,
}) => {
  const [inputText, setInputText] = useState('');
  const [selectedRoom, setSelectedRoom] = useState<string>('All');
  const [isConsulting, setIsConsulting] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const roomsWithTasks = Array.from(new Set(tasks.map((t) => t.room))).filter(Boolean);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const filteredMessages = messages.filter((m) => {
    if (selectedRoom === 'All') return true;
    return m.room === selectedRoom || !m.room;
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
        return 'text-slate-400 bg-slate-800 border-slate-700';
    }
  };

  const getSenderAvatar = (sender: string, role: string) => {
    if (sender.includes('Central')) {
      return (
        <div className="w-8 h-8 rounded-lg bg-amber-500/20 border border-amber-500/40 text-amber-300 flex items-center justify-center font-bold text-xs shrink-0">
          CO
        </div>
      );
    }
    if (sender.includes('Maintenance')) {
      return (
        <div className="w-8 h-8 rounded-lg bg-sky-500/20 border border-sky-500/40 text-sky-300 flex items-center justify-center font-bold text-xs shrink-0">
          MT
        </div>
      );
    }
    if (sender.includes('Housekeeping')) {
      return (
        <div className="w-8 h-8 rounded-lg bg-emerald-500/20 border border-emerald-500/40 text-emerald-300 flex items-center justify-center font-bold text-xs shrink-0">
          HK
        </div>
      );
    }
    if (sender.includes('Management')) {
      return (
        <div className="w-8 h-8 rounded-lg bg-rose-500/20 border border-rose-500/40 text-rose-300 flex items-center justify-center font-bold text-xs shrink-0">
          GM
        </div>
      );
    }
    return (
      <div className="w-8 h-8 rounded-lg bg-amber-500/20 border border-amber-500/40 text-amber-300 flex items-center justify-center font-bold text-xs shrink-0">
        RX
      </div>
    );
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-4 gap-4 h-[750px]">
      {/* Sidebar: Active Agents & Room Channels */}
      <div className="lg:col-span-1 bg-slate-900 border border-slate-800 rounded-xl p-4 flex flex-col justify-between">
        <div className="space-y-4">
          <div>
            <div className="flex items-center gap-2 text-xs font-bold text-slate-100 uppercase tracking-wider mb-2">
              <Radio className="w-4 h-4 text-amber-400" />
              <span>Switch Coordination Mesh</span>
            </div>
            <p className="text-[11px] text-slate-400">
              Shared operations command room linking Central AI, Reception, Housekeeping, Maintenance, and Management.
            </p>
          </div>

          {/* Room Filter Channels */}
          <div>
            <div className="text-[10px] font-mono text-slate-400 uppercase tracking-wider mb-1.5">
              Filter by Suite Channel
            </div>
            <div className="space-y-1">
              <button
                onClick={() => setSelectedRoom('All')}
                className={`w-full text-left px-3 py-1.5 text-xs rounded-lg transition-colors flex items-center justify-between ${
                  selectedRoom === 'All'
                    ? 'bg-amber-500/15 text-amber-300 font-semibold border border-amber-500/30'
                    : 'text-slate-400 hover:bg-slate-800/60'
                }`}
              >
                <span>All Operations</span>
                <span className="font-mono text-[10px]">{messages.length}</span>
              </button>
              {roomsWithTasks.map((rm) => (
                <button
                  key={rm}
                  onClick={() => setSelectedRoom(rm)}
                  className={`w-full text-left px-3 py-1.5 text-xs rounded-lg transition-colors flex items-center justify-between ${
                    selectedRoom === rm
                      ? 'bg-amber-500/15 text-amber-300 font-semibold border border-amber-500/30'
                      : 'text-slate-400 hover:bg-slate-800/60'
                  }`}
                >
                  <span>Suite {rm}</span>
                  <span className="font-mono text-[10px] text-slate-500">
                    {messages.filter((m) => m.room === rm).length}
                  </span>
                </button>
              ))}
            </div>
          </div>

          {/* Quick AI Consultation Triggers */}
          <div className="pt-2 border-t border-slate-800/80">
            <div className="text-[10px] font-mono text-slate-400 uppercase tracking-wider mb-2">
              Autonomous Team Consultations
            </div>
            <div className="space-y-1.5">
              <button
                disabled={isConsulting}
                onClick={() => handleTriggerConsultation('Cross-Department VIP Arrival Sync')}
                className="w-full text-left p-2 rounded-lg bg-slate-950/70 border border-slate-800 hover:border-amber-500/40 text-[11px] text-slate-300 hover:text-amber-300 transition-all flex items-center gap-2 group cursor-pointer"
              >
                <Sparkles className="w-3.5 h-3.5 text-amber-400 group-hover:rotate-12 transition-transform" />
                <span>Sync VIP Arrival Sequence</span>
              </button>

              <button
                disabled={isConsulting}
                onClick={() => handleTriggerConsultation('Audit HVAC Delay & Redundancy in Suite 412')}
                className="w-full text-left p-2 rounded-lg bg-slate-950/70 border border-slate-800 hover:border-rose-500/40 text-[11px] text-slate-300 hover:text-rose-300 transition-all flex items-center gap-2 group cursor-pointer"
              >
                <AlertTriangle className="w-3.5 h-3.5 text-rose-400 group-hover:scale-110 transition-transform" />
                <span>Trigger HVAC Redundancy Audit</span>
              </button>

              <button
                disabled={isConsulting}
                onClick={() => handleTriggerConsultation('Evening Turndown & Linen Bottleneck Review')}
                className="w-full text-left p-2 rounded-lg bg-slate-950/70 border border-slate-800 hover:border-emerald-500/40 text-[11px] text-slate-300 hover:text-emerald-300 transition-all flex items-center gap-2 group cursor-pointer"
              >
                <Clock className="w-3.5 h-3.5 text-emerald-400 group-hover:scale-110 transition-transform" />
                <span>Review Housekeeping Queue</span>
              </button>
            </div>
          </div>
        </div>

        {/* Operational Guardrail */}
        <div className="mt-4 p-2.5 bg-slate-950 border border-slate-800 rounded-lg text-[10px] text-slate-400">
          <strong className="text-slate-300 block mb-0.5">Integration Guardrail:</strong>
          Agent responses in Switch reflect confirmed status and dispatched work. Context is preserved across threads.
        </div>
      </div>

      {/* Main Switch Dialogue Feed */}
      <div className="lg:col-span-3 bg-slate-900 border border-slate-800 rounded-xl flex flex-col justify-between overflow-hidden">
        {/* Feed Header */}
        <div className="p-3.5 bg-slate-950/80 border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse" />
            <span className="text-xs font-mono font-bold text-slate-200">
              LIVE OPERATIONS CHANNEL · {selectedRoom === 'All' ? 'GLOBAL PROPERTY FEED' : `SUITE ${selectedRoom}`}
            </span>
          </div>
          {isConsulting && (
            <div className="flex items-center gap-2 text-xs text-amber-400 font-mono animate-pulse">
              <RefreshCw className="w-3.5 h-3.5 animate-spin" />
              <span>Agents collaborating...</span>
            </div>
          )}
        </div>

        {/* Message Log */}
        <div className="flex-1 p-4 overflow-y-auto space-y-3">
          {filteredMessages.map((msg) => (
            <div
              key={msg.id}
              className="p-3 bg-slate-950/70 border border-slate-800/80 rounded-xl flex items-start gap-3 hover:border-slate-700/70 transition-all"
            >
              {getSenderAvatar(msg.sender, msg.avatarRole)}

              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-2 mb-1 flex-wrap">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold text-slate-200">
                      {msg.sender}
                    </span>
                    <span className="text-[10px] font-mono text-slate-400">
                      [{msg.avatarRole}]
                    </span>
                    {msg.room && (
                      <span className="text-[10px] font-mono text-amber-400/90 font-semibold px-1.5 py-0.2 rounded bg-amber-500/10 border border-amber-500/20">
                        Suite {msg.room}
                      </span>
                    )}
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
                    <span className="text-[11px] font-mono text-slate-500">
                      {msg.timestamp}
                    </span>
                  </div>
                </div>

                <p className="text-xs text-slate-300 leading-relaxed font-normal">
                  {msg.content}
                </p>
              </div>
            </div>
          ))}
          <div ref={messagesEndRef} />
        </div>

        {/* Transmission Input Bar */}
        <form onSubmit={handleSend} className="p-3 bg-slate-950/80 border-t border-slate-800 flex items-center gap-2">
          <input
            type="text"
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            placeholder="Broadcast instruction or operational note to Switch AI agents..."
            className="flex-1 bg-slate-900 border border-slate-800 rounded-lg px-3.5 py-2 text-xs text-slate-100 placeholder:text-slate-600 focus:outline-none focus:border-amber-500/50"
          />
          <button
            type="submit"
            disabled={!inputText.trim()}
            className="flex items-center gap-1.5 px-4 py-2 text-xs font-bold text-slate-950 bg-amber-400 hover:bg-amber-300 disabled:opacity-40 disabled:cursor-not-allowed rounded-lg shadow transition-all cursor-pointer"
          >
            <Send className="w-3.5 h-3.5" />
            <span>Transmit</span>
          </button>
        </form>
      </div>
    </div>
  );
};
