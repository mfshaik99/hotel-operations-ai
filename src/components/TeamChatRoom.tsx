import React, { useState, useEffect, useRef } from 'react';
import {
  Send,
  Sparkles,
  Radio,
  User,
  Bot,
  ShieldCheck,
  CheckCircle2,
  Clock,
  Filter,
  Play,
  RefreshCw,
  Hash,
  ChevronDown,
  Activity,
  Layers,
  Flame,
  Wrench,
  BedDouble,
  Compass,
  AlertTriangle,
  ArrowRight,
  ExternalLink,
} from 'lucide-react';
import { SwitchMessage, ChatParticipant, Task, Department } from '../types';

interface TeamChatRoomProps {
  tasks: Task[];
  onRequestVerification: (task: Task) => void;
  onSelectTask: (task: Task) => void;
  showToast: (msg: string) => void;
}

export const TeamChatRoom: React.FC<TeamChatRoomProps> = ({
  tasks,
  onRequestVerification,
  onSelectTask,
  showToast,
}) => {
  const [messages, setMessages] = useState<SwitchMessage[]>([]);
  const [participants, setParticipants] = useState<ChatParticipant[]>([]);
  const [inputText, setInputText] = useState('');
  const [activeChannel, setActiveChannel] = useState<string>('#operations-general');
  const [selectedSenderId, setSelectedSenderId] = useState<string>('staff-elena');
  const [sourceFilter, setSourceFilter] = useState<'ALL' | 'HUMAN_ONLY' | 'AGENT_ONLY'>('ALL');
  const [isTypingState, setIsTypingState] = useState<{ sender: string; isTyping: boolean } | null>(null);
  const [isDemoRunning, setIsDemoRunning] = useState(false);
  const [isConnected, setIsConnected] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Fetch initial messages and participants
  useEffect(() => {
    fetch('/api/chat/participants')
      .then((r) => r.json())
      .then((data) => {
        if (data?.participants) setParticipants(data.participants);
      })
      .catch(() => {});

    fetch('/api/chat/messages')
      .then((r) => r.json())
      .then((data) => {
        if (data?.messages) setMessages(data.messages);
      })
      .catch(() => {});
  }, []);

  // Connect Real-Time SSE Stream with auto-reconnect
  useEffect(() => {
    let eventSource: EventSource | null = null;

    const connectSSE = () => {
      eventSource = new EventSource('/api/chat/stream');

      eventSource.addEventListener('connected', () => {
        setIsConnected(true);
      });

      eventSource.addEventListener('chat:message', (e) => {
        try {
          const newMsg: SwitchMessage = JSON.parse(e.data);
          setMessages((prev) => {
            // Avoid duplicates
            if (prev.some((m) => m.id === newMsg.id)) return prev;
            return [...prev, newMsg];
          });
        } catch (err) {}
      });

      eventSource.addEventListener('chat:typing', (e) => {
        try {
          const data = JSON.parse(e.data);
          if (data.isTyping) {
            setIsTypingState({ sender: data.sender, isTyping: true });
          } else {
            setIsTypingState(null);
          }
        } catch (err) {}
      });

      eventSource.addEventListener('database:reset', () => {
        fetch('/api/chat/messages')
          .then((r) => r.json())
          .then((d) => setMessages(d.messages || []));
      });

      eventSource.onerror = () => {
        setIsConnected(false);
        eventSource?.close();
        setTimeout(connectSSE, 3000);
      };
    };

    connectSSE();

    return () => {
      eventSource?.close();
    };
  }, []);

  // Auto-scroll to bottom of chat
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isTypingState]);

  // Current selected sending identity
  const currentSender = participants.find((p) => p.id === selectedSenderId) || participants[0] || {
    name: 'Elena Rostova',
    role: 'Front Desk Lead',
    type: 'HUMAN',
    department: 'Reception' as Department,
  };

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputText.trim()) return;

    const content = inputText.trim();
    setInputText('');

    try {
      const res = await fetch('/api/chat/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sender: currentSender.name,
          avatarRole: currentSender.role,
          senderType: currentSender.type,
          department: currentSender.department,
          content,
          channel: activeChannel,
        }),
      });
      const data = await res.json();
      if (!data.success) {
        showToast('Failed to send message');
      }
    } catch (err) {
      showToast('Network error sending message');
    }
  };

  // Run Room 204 End-to-End Multi-Agent Workflow Demo
  const handleTriggerRoom204 = async () => {
    if (isDemoRunning) return;
    setIsDemoRunning(true);
    showToast('Executing Room 204 Teammate Collaboration Workflow...');

    try {
      await fetch('/api/demo/room-204', { method: 'POST' });
    } catch (err) {
      showToast('Error initiating Room 204 workflow');
    } finally {
      setTimeout(() => setIsDemoRunning(false), 8000);
    }
  };

  // Filter messages
  const filteredMessages = messages.filter((m) => {
    const matchesChannel = !m.channel || m.channel === activeChannel || activeChannel === '#operations-general';
    const matchesSource =
      sourceFilter === 'ALL'
        ? true
        : sourceFilter === 'HUMAN_ONLY'
        ? m.senderType === 'HUMAN' || m.sourceType === 'LIVE_STAFF'
        : m.senderType === 'AI_AGENT' || m.sourceType === 'LIVE_AGENT' || m.sourceType === 'SWITCH_PROTOCOL';

    return matchesChannel && matchesSource;
  });

  const channels = [
    { id: '#operations-general', name: 'General Operations', count: messages.length },
    { id: '#reception-frontdesk', name: 'Front Desk & Concierge', count: messages.filter((m) => m.department === 'Reception').length },
    { id: '#engineering-maintenance', name: 'Plant Engineering & HVAC', count: messages.filter((m) => m.department === 'Maintenance').length },
    { id: '#housekeeping-turnover', name: 'Housekeeping & Linens', count: messages.filter((m) => m.department === 'Housekeeping').length },
    { id: '#management-escalations', name: 'Duty Manager Escalations', count: messages.filter((m) => m.department === 'Management').length },
  ];

  return (
    <div className="space-y-4">
      {/* Collaboration Room Top Bar */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5 shadow-xs flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1.5">
            <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[11px] font-mono font-semibold bg-emerald-500/10 text-emerald-300 border border-emerald-500/30">
              <span className={`w-2 h-2 rounded-full ${isConnected ? 'bg-emerald-400 animate-pulse' : 'bg-rose-400'}`} />
              {isConnected ? 'REAL-TIME COLLABORATION MESH ACTIVE' : 'CONNECTING...'}
            </span>
            <span className="text-xs text-zinc-500 font-mono">WebSockets & Server-Sent Events</span>
          </div>
          <h1 className="text-xl font-bold text-zinc-100 tracking-tight flex items-center gap-2">
            <span>Hotel Operations Team Chat</span>
            <span className="text-xs font-mono font-normal text-zinc-400 px-2 py-0.5 rounded bg-zinc-800 border border-zinc-700">
              {participants.length} Active Teammates
            </span>
          </h1>
          <p className="text-xs text-zinc-400 mt-1 max-w-2xl leading-relaxed">
            A unified operations room where human teammates (Front Desk, Duty Manager, Engineers) and specialized AI Agents collaborate, assign work, coordinate multi-problem guest requests, and track real-time execution.
          </p>
        </div>

        {/* Room 204 Interactive Workflow Demo Button */}
        <div className="flex items-center gap-3 shrink-0">
          <button
            onClick={handleTriggerRoom204}
            disabled={isDemoRunning}
            className="inline-flex items-center gap-2 px-4 py-2.5 text-xs font-bold text-zinc-950 bg-amber-400 hover:bg-amber-300 disabled:opacity-50 rounded-xl shadow-xs transition-all cursor-pointer"
            title="Demonstrate Elena Rostova reporting Room 204 towels and AC failure, and watching Central AI and agents coordinate the resolution in real time"
          >
            {isDemoRunning ? (
              <>
                <RefreshCw className="w-4 h-4 animate-spin text-zinc-950" />
                <span>Running Room 204 Workflow...</span>
              </>
            ) : (
              <>
                <Play className="w-4 h-4 fill-current" />
                <span>Run Room 204 Live Teammate Demo</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* Main 2-Column Chat Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 h-[740px]">
        {/* Left Sidebar (3 Cols): Channels & Active Participants */}
        <div className="lg:col-span-3 bg-zinc-900 border border-zinc-800/90 rounded-2xl p-4 flex flex-col justify-between shadow-xs overflow-hidden space-y-4">
          <div className="space-y-4 overflow-y-auto pr-1">
            {/* Channels List */}
            <div className="space-y-1.5">
              <div className="text-[10px] font-mono text-zinc-400 uppercase tracking-wider px-2">
                Department Channels
              </div>
              <div className="space-y-0.5">
                {channels.map((chan) => (
                  <button
                    key={chan.id}
                    onClick={() => setActiveChannel(chan.id)}
                    className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors cursor-pointer ${
                      activeChannel === chan.id
                        ? 'bg-zinc-800 text-amber-300 font-semibold border border-zinc-700/60'
                        : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-850'
                    }`}
                  >
                    <span className="flex items-center gap-1.5 truncate">
                      <Hash className="w-3.5 h-3.5 opacity-60 shrink-0" />
                      <span className="truncate">{chan.name}</span>
                    </span>
                    <span className="text-[10px] font-mono text-zinc-500">{chan.count}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Teammates & Agents Roster */}
            <div className="space-y-2 pt-2 border-t border-zinc-800/80">
              <div className="flex items-center justify-between px-2">
                <span className="text-[10px] font-mono text-zinc-400 uppercase tracking-wider">
                  Active Roster ({participants.length})
                </span>
                <span className="text-[10px] text-emerald-400 font-mono">Live</span>
              </div>

              <div className="space-y-1.5">
                {participants.map((p) => {
                  const isHuman = p.type === 'HUMAN';

                  return (
                    <div
                      key={p.id}
                      onClick={() => setSelectedSenderId(p.id)}
                      className={`p-2 rounded-xl border transition-all flex items-center justify-between gap-2.5 cursor-pointer ${
                        selectedSenderId === p.id
                          ? 'bg-zinc-800/90 border-amber-400/50 shadow-xs'
                          : 'bg-zinc-950/60 border-zinc-800/60 hover:border-zinc-700'
                      }`}
                      title={isHuman ? 'Human Hotel Staff' : 'Specialized AI Agent'}
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <div
                          className={`w-7 h-7 rounded-lg flex items-center justify-center font-bold text-[10px] shrink-0 border ${
                            p.avatarBg || 'bg-zinc-800 text-zinc-300 border-zinc-700'
                          }`}
                        >
                          {p.avatar}
                        </div>
                        <div className="min-w-0">
                          <div className="text-xs font-semibold text-zinc-200 truncate flex items-center gap-1.5">
                            <span>{p.name}</span>
                            {selectedSenderId === p.id && (
                              <span className="text-[9px] font-mono text-amber-400 uppercase">
                                [Active]
                              </span>
                            )}
                          </div>
                          <div className="text-[10px] text-zinc-500 truncate">{p.role}</div>
                        </div>
                      </div>

                      <span
                        className={`text-[9px] font-mono px-1.5 py-0.2 rounded font-semibold shrink-0 uppercase ${
                          isHuman
                            ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                            : 'bg-purple-500/10 text-purple-400 border border-purple-500/20'
                        }`}
                      >
                        {isHuman ? 'Human' : 'Agent'}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Quick Filter */}
          <div className="pt-2 border-t border-zinc-800/80">
            <div className="text-[10px] font-mono text-zinc-500 uppercase tracking-wider mb-1">
              Filter Feed
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
                onClick={() => setSourceFilter('HUMAN_ONLY')}
                className={`py-1 rounded text-center transition-colors cursor-pointer ${
                  sourceFilter === 'HUMAN_ONLY'
                    ? 'bg-zinc-800 text-amber-300 font-semibold'
                    : 'text-zinc-400 hover:text-zinc-200'
                }`}
              >
                Human
              </button>
              <button
                onClick={() => setSourceFilter('AGENT_ONLY')}
                className={`py-1 rounded text-center transition-colors cursor-pointer ${
                  sourceFilter === 'AGENT_ONLY'
                    ? 'bg-zinc-800 text-amber-300 font-semibold'
                    : 'text-zinc-400 hover:text-zinc-200'
                }`}
              >
                Agents
              </button>
            </div>
          </div>
        </div>

        {/* Right Side (9 Cols): Main Chat Feed & Interactive Composer */}
        <div className="lg:col-span-9 bg-zinc-900 border border-zinc-800/90 rounded-2xl flex flex-col justify-between shadow-xs overflow-hidden">
          {/* Conversation Feed */}
          <div className="flex-1 overflow-y-auto p-4 space-y-3.5">
            {filteredMessages.length === 0 ? (
              <div className="py-24 text-center space-y-2">
                <div className="w-10 h-10 rounded-full bg-zinc-800 text-zinc-500 flex items-center justify-center mx-auto">
                  <Hash className="w-5 h-5" />
                </div>
                <div className="text-xs font-semibold text-zinc-300">No messages in this view</div>
                <div className="text-[11px] text-zinc-500 max-w-sm mx-auto">
                  Type a message below or click "Run Room 204 Live Teammate Demo" to see human staff and agents collaborate in real time.
                </div>
              </div>
            ) : (
              filteredMessages.map((msg) => {
                const isHuman = msg.senderType === 'HUMAN' || msg.sourceType === 'LIVE_STAFF';

                // Look up referenced tasks
                const linkedTasks = msg.referencedTaskIds
                  ? tasks.filter((t) => msg.referencedTaskIds?.includes(t.id))
                  : [];

                return (
                  <div
                    key={msg.id}
                    className={`p-3.5 rounded-xl border transition-all space-y-2 ${
                      isHuman
                        ? 'bg-zinc-950/80 border-zinc-800 hover:border-zinc-700/80'
                        : 'bg-zinc-950/90 border-zinc-800/80 hover:border-zinc-700/80'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex items-center gap-2.5">
                        <div
                          className={`w-7 h-7 rounded-lg flex items-center justify-center font-bold text-[10px] shrink-0 border ${
                            isHuman
                              ? 'bg-amber-600/20 text-amber-300 border-amber-500/40'
                              : 'bg-purple-600/20 text-purple-300 border-purple-500/40'
                          }`}
                        >
                          {isHuman ? 'ST' : 'AI'}
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-bold text-zinc-100">{msg.sender}</span>
                            <span className="text-[10px] text-zinc-400 font-mono">
                              ({msg.avatarRole})
                            </span>
                            <span
                              className={`text-[9px] font-mono px-1.5 py-0.2 rounded font-semibold uppercase ${
                                isHuman
                                  ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                                  : 'bg-purple-500/10 text-purple-400 border border-purple-500/20'
                              }`}
                            >
                              {isHuman ? 'Staff Teammate' : 'AI Agent'}
                            </span>
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        {msg.room && (
                          <span className="text-[10px] font-mono font-bold text-amber-400 bg-amber-500/10 px-1.5 py-0.2 rounded border border-amber-500/20">
                            Suite {msg.room}
                          </span>
                        )}
                        <span className="text-[10px] font-mono text-zinc-500">{msg.timestamp}</span>
                        <span className="text-[9px] font-mono text-emerald-400 bg-emerald-500/10 px-1 rounded">
                          {msg.deliveryState || 'DELIVERED'}
                        </span>
                      </div>
                    </div>

                    {/* Message Body */}
                    <p className="text-xs text-zinc-200 leading-relaxed font-normal pl-9">
                      {msg.content}
                    </p>

                    {/* Interactive Linked Task Chips */}
                    {linkedTasks.length > 0 && (
                      <div className="pl-9 pt-1 flex items-center gap-2 flex-wrap">
                        {linkedTasks.map((t) => (
                          <div
                            key={t.id}
                            className="inline-flex items-center gap-2 px-2.5 py-1 rounded-lg bg-zinc-900 border border-zinc-700/80 text-[11px]"
                          >
                            <span className="font-mono font-bold text-amber-400">{t.caseRef}</span>
                            <span className="text-zinc-300 truncate max-w-[200px]">{t.title}</span>
                            <span className="text-[10px] font-mono text-zinc-400">({t.status})</span>

                            {t.status === 'Completion Pending Confirmation' && (
                              <button
                                onClick={() => onRequestVerification(t)}
                                className="px-2 py-0.5 text-[10px] font-bold text-zinc-950 bg-emerald-400 hover:bg-emerald-300 rounded transition-colors cursor-pointer ml-1"
                              >
                                Sign Off
                              </button>
                            )}

                            <button
                              onClick={() => onSelectTask(t)}
                              className="text-zinc-400 hover:text-zinc-200 cursor-pointer"
                              title="Inspect Task Details"
                            >
                              <ExternalLink className="w-3 h-3" />
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })
            )}

            {/* Active AI Agent Typing Indicator */}
            {isTypingState?.isTyping && (
              <div className="p-3 rounded-xl bg-zinc-950/90 border border-purple-500/30 flex items-center gap-3 animate-pulse">
                <RefreshCw className="w-3.5 h-3.5 text-purple-400 animate-spin" />
                <span className="text-xs text-purple-300 font-mono">
                  {isTypingState.sender} is analyzing conversation and coordinating agents...
                </span>
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>

          {/* Bottom Message Composer */}
          <div className="p-3.5 bg-zinc-950 border-t border-zinc-800 space-y-3">
            {/* Quick Action Prompt Chips */}
            <div className="flex items-center gap-1.5 overflow-x-auto pb-1 text-[11px]">
              <span className="text-zinc-500 font-mono shrink-0 text-[10px]">Quick:</span>
              <button
                type="button"
                onClick={() => setInputText('Room 204 needs extra towels and the AC is not working.')}
                className="px-2.5 py-1 rounded-lg bg-zinc-900 hover:bg-zinc-800 text-zinc-300 border border-zinc-800 transition-colors shrink-0 cursor-pointer"
              >
                "Room 204 needs extra towels and AC is not working"
              </button>
              <button
                type="button"
                onClick={() => setInputText('What is the status of Suite 412?')}
                className="px-2.5 py-1 rounded-lg bg-zinc-900 hover:bg-zinc-800 text-zinc-300 border border-zinc-800 transition-colors shrink-0 cursor-pointer"
              >
                "What is the status of Suite 412?"
              </button>
              <button
                type="button"
                onClick={() => setInputText('Housekeeping, please prioritize Room 310 turndown.')}
                className="px-2.5 py-1 rounded-lg bg-zinc-900 hover:bg-zinc-800 text-zinc-300 border border-zinc-800 transition-colors shrink-0 cursor-pointer"
              >
                "Housekeeping, please prioritize Room 310"
              </button>
            </div>

            {/* Input Form with Identity Selection */}
            <form onSubmit={handleSendMessage} className="space-y-2">
              <div className="flex items-center justify-between text-xs">
                <div className="flex items-center gap-2">
                  <span className="text-zinc-400 font-medium">Posting as:</span>
                  <select
                    value={selectedSenderId}
                    onChange={(e) => setSelectedSenderId(e.target.value)}
                    className="bg-zinc-900 border border-zinc-700 rounded-lg px-2.5 py-1 text-xs text-amber-300 font-semibold focus:outline-none cursor-pointer"
                  >
                    {participants.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name} ({p.role} — {p.type === 'HUMAN' ? 'Human' : 'AI Agent'})
                      </option>
                    ))}
                  </select>
                </div>

                <span className="text-[10px] text-zinc-500 font-mono hidden sm:inline">
                  Press Enter to send, Shift+Enter for new line
                </span>
              </div>

              <div className="flex items-end gap-2">
                <textarea
                  value={inputText}
                  onChange={(e) => setInputText(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      handleSendMessage(e);
                    }
                  }}
                  placeholder={`Send message to ${activeChannel} as ${currentSender.name}...`}
                  rows={2}
                  className="flex-1 bg-zinc-900 border border-zinc-800 rounded-xl p-2.5 text-xs text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-amber-400/80 font-sans resize-none"
                />

                <button
                  type="submit"
                  disabled={!inputText.trim()}
                  className="px-4 py-2.5 bg-amber-400 hover:bg-amber-300 disabled:opacity-40 text-zinc-950 font-bold text-xs rounded-xl shadow-xs transition-colors flex items-center gap-1.5 shrink-0 cursor-pointer"
                >
                  <Send className="w-3.5 h-3.5" />
                  <span>Send</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
};
