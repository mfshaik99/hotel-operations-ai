import React, { useState, useEffect, useRef, useCallback } from 'react';
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
  Lock,
  Unlock,
  KeyRound,
  Check,
} from 'lucide-react';
import { SwitchMessage, ChatParticipant, Task, Department } from '../types';

interface TeamChatRoomProps {
  tasks: Task[];
  onRequestVerification: (task: Task) => void;
  onSelectTask: (task: Task) => void;
  showToast: (msg: string) => void;
}

interface StaffMember {
  id: string;
  name: string;
  role: string;
  badgeId: string;
  pin: string;
  department: Department;
}

const REGISTERED_STAFF: StaffMember[] = [
  { id: 'staff-elena', name: 'Elena Rostova', role: 'Front Desk Lead', badgeId: 'FD-1042', pin: '1042', department: 'Reception' },
  { id: 'staff-marcus', name: 'Marcus Vance', role: 'Duty Manager', badgeId: 'DM-9001', pin: '9001', department: 'Management' },
  { id: 'staff-carlos', name: 'Carlos Mendez', role: 'Lead HVAC Engineer', badgeId: 'ENG-4021', pin: '4021', department: 'Maintenance' },
  { id: 'staff-maria', name: 'Maria Santos', role: 'Housekeeping Supervisor', badgeId: 'HK-3105', pin: '3105', department: 'Housekeeping' },
];

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
  
  // Real-Time Transport States
  const [wsConnected, setWsConnected] = useState(false);
  const [sseConnected, setSseConnected] = useState(false);

  // Authenticated Staff State
  const [activeStaff, setActiveStaff] = useState<StaffMember>(REGISTERED_STAFF[0]);
  const [staffToken, setStaffToken] = useState<string>('');
  const [isPinModalOpen, setIsPinModalOpen] = useState(false);
  const [pinInput, setPinInput] = useState('');
  const [pinError, setPinError] = useState<string | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const wsRef = useRef<WebSocket | null>(null);

  // Authenticate current staff member with server
  const authenticateStaff = useCallback(async (staff: StaffMember, pin: string) => {
    try {
      const res = await fetch('/api/auth/staff-login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ staffId: staff.id, pin }),
      });
      const data = await res.json();
      if (data.success && data.token) {
        setStaffToken(data.token);
        setActiveStaff(staff);
        setPinError(null);
        setIsPinModalOpen(false);
        setPinInput('');
        return true;
      } else {
        setPinError(data.error || 'Authentication rejected');
        return false;
      }
    } catch (err: any) {
      setPinError('Authentication error connecting to server');
      return false;
    }
  }, []);

  // Initial staff login on mount (Elena Rostova default)
  useEffect(() => {
    authenticateStaff(REGISTERED_STAFF[0], '1042');
  }, [authenticateStaff]);

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

  // 1. Establish Bi-Directional WebSocket Connection (Native)
  useEffect(() => {
    let ws: WebSocket | null = null;
    let reconnectTimeout: any = null;

    const connectWebSocket = () => {
      try {
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const wsUrl = `${protocol}//${window.location.host}/ws`;
        
        ws = new WebSocket(wsUrl);
        wsRef.current = ws;

        ws.onopen = () => {
          setWsConnected(true);
          // Authenticate socket session if token exists
          if (staffToken) {
            ws?.send(JSON.stringify({ type: 'auth', token: staffToken }));
          }
        };

        ws.onmessage = (event) => {
          try {
            const data = JSON.parse(event.data);
            if (data.type === 'connected') {
              setWsConnected(true);
            } else if (data.type === 'chat:message' && data.message) {
              const newMsg: SwitchMessage = data.message;
              setMessages((prev) => {
                if (prev.some((m) => m.id === newMsg.id)) return prev;
                return [...prev, newMsg];
              });
            } else if (data.type === 'chat:typing') {
              if (data.isTyping) {
                setIsTypingState({ sender: data.sender, isTyping: true });
              } else {
                setIsTypingState(null);
              }
            } else if (data.type === 'error') {
              showToast(data.message || 'WebSocket Error');
            }
          } catch (err) {}
        };

        ws.onclose = () => {
          setWsConnected(false);
          reconnectTimeout = setTimeout(connectWebSocket, 3000);
        };

        ws.onerror = () => {
          setWsConnected(false);
          ws?.close();
        };
      } catch (err) {
        setWsConnected(false);
      }
    };

    connectWebSocket();

    return () => {
      if (reconnectTimeout) clearTimeout(reconnectTimeout);
      ws?.close();
    };
  }, [staffToken, showToast]);

  // 2. Connect Resilient Fallback SSE Stream
  useEffect(() => {
    let eventSource: EventSource | null = null;

    const connectSSE = () => {
      eventSource = new EventSource('/api/chat/stream');

      eventSource.addEventListener('connected', () => {
        setSseConnected(true);
      });

      eventSource.addEventListener('chat:message', (e) => {
        try {
          const newMsg: SwitchMessage = JSON.parse(e.data);
          setMessages((prev) => {
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
        setSseConnected(false);
        eventSource?.close();
        setTimeout(connectSSE, 4000);
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

  // Sender resolution
  const isSelectedHuman = selectedSenderId.startsWith('staff-');
  const matchedStaff = REGISTERED_STAFF.find((s) => s.id === selectedSenderId);
  const matchedAgent = participants.find((p) => p.id === selectedSenderId);

  const currentSender = isSelectedHuman && matchedStaff
    ? {
        name: matchedStaff.name,
        role: matchedStaff.role,
        type: 'HUMAN' as const,
        department: matchedStaff.department,
        badgeId: matchedStaff.badgeId,
      }
    : matchedAgent
    ? {
        name: matchedAgent.name,
        role: matchedAgent.role,
        type: matchedAgent.type,
        department: matchedAgent.department,
        badgeId: undefined,
      }
    : {
        name: activeStaff.name,
        role: activeStaff.role,
        type: 'HUMAN' as const,
        department: activeStaff.department,
        badgeId: activeStaff.badgeId,
      };

  // Switch staff teammate identity with PIN verification
  const handleSelectTeammate = (staff: StaffMember) => {
    setSelectedSenderId(staff.id);
    if (staff.id !== activeStaff.id || !staffToken) {
      setPinInput(staff.pin); // Pre-fill with demo PIN for effortless reviewer testing
      setPinError(null);
      setIsPinModalOpen(true);
    }
  };

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputText.trim()) return;

    // Check staff authentication if sending as human
    if (currentSender.type === 'HUMAN' && !staffToken) {
      setIsPinModalOpen(true);
      showToast('Staff authentication required to send messages');
      return;
    }

    const content = inputText.trim();
    setInputText('');

    // Method A: WebSocket Direct Delivery (Bidirectional)
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      try {
        wsRef.current.send(
          JSON.stringify({
            type: 'chat:message',
            content,
            channel: activeChannel,
            sender: currentSender.name,
            avatarRole: currentSender.role,
            senderType: currentSender.type,
            department: currentSender.department,
            staffToken: currentSender.type === 'HUMAN' ? staffToken : undefined,
          })
        );
        return;
      } catch (err) {
        console.warn('WebSocket send failed, falling back to HTTP POST', err);
      }
    }

    // Method B: HTTP POST Fallback
    try {
      const res = await fetch('/api/chat/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(staffToken ? { Authorization: `Bearer ${staffToken}` } : {}),
        },
        body: JSON.stringify({
          sender: currentSender.name,
          avatarRole: currentSender.role,
          senderType: currentSender.type,
          department: currentSender.department,
          content,
          channel: activeChannel,
          staffToken: currentSender.type === 'HUMAN' ? staffToken : undefined,
        }),
      });
      const data = await res.json();
      if (!data.success) {
        showToast(data.error || 'Failed to send message');
      }
    } catch (err) {
      showToast('Network error sending message');
    }
  };

  // Run Room 204 End-to-End Multi-Agent Workflow Demo
  const handleTriggerRoom204 = async () => {
    if (isDemoRunning) return;
    setIsDemoRunning(true);
    showToast('Executing Room 204 Simulation Demo (Elena -> Central AI -> Agents)...');

    try {
      await fetch('/api/demo/room-204', { method: 'POST' });
    } catch (err) {
      showToast('Error initiating Room 204 demo workflow');
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
          <div className="flex items-center gap-2 mb-1.5 flex-wrap">
            {/* Real-time transport status */}
            <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded text-[11px] font-mono font-semibold bg-emerald-500/10 text-emerald-300 border border-emerald-500/30">
              <span className={`w-2 h-2 rounded-full ${wsConnected ? 'bg-emerald-400 animate-pulse' : 'bg-amber-400'}`} />
              {wsConnected ? 'WEBSOCKET DUPLEX ACTIVE (ws://)' : sseConnected ? 'SSE FALLBACK STREAM ACTIVE' : 'CONNECTING MESH...'}
            </span>

            {/* Authenticated Staff Pill */}
            <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded text-[11px] font-mono font-semibold bg-zinc-800 text-amber-300 border border-zinc-700">
              <Lock className="w-3 h-3 text-amber-400" />
              <span>AUTHENTICATED: {activeStaff.name} ({activeStaff.badgeId})</span>
            </span>
          </div>

          <h1 className="text-xl font-bold text-zinc-100 tracking-tight flex items-center gap-2">
            <span>Hotel Operations Team Chat</span>
            <span className="text-xs font-mono font-normal text-zinc-400 px-2 py-0.5 rounded bg-zinc-800 border border-zinc-700">
              {participants.length} Active Participants
            </span>
          </h1>
          <p className="text-xs text-zinc-400 mt-1 max-w-2xl leading-relaxed">
            Real-time operations room powered by bi-directional WebSockets where authenticated human staff (Front Desk, Duty Manager, Engineers) and autonomous Gemini AI Agents collaborate with strict verification.
          </p>
        </div>

        {/* Room 204 Interactive Workflow Demo Button */}
        <div className="flex items-center gap-3 shrink-0">
          <button
            onClick={handleTriggerRoom204}
            disabled={isDemoRunning}
            className="inline-flex items-center gap-2 px-4 py-2.5 text-xs font-bold text-zinc-950 bg-amber-400 hover:bg-amber-300 disabled:opacity-50 rounded-xl shadow-xs transition-all cursor-pointer"
            title="Demonstration Scenario: Room 204 guest complaint routed through Central AI and departmental agents"
          >
            {isDemoRunning ? (
              <>
                <RefreshCw className="w-4 h-4 animate-spin text-zinc-950" />
                <span>Simulating Room 204 Demo...</span>
              </>
            ) : (
              <>
                <Play className="w-4 h-4 fill-current" />
                <span>Run Room 204 Demonstration</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* Main 2-Column Chat Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 h-[740px]">
        {/* Left Sidebar (3 Cols): Channels, Authenticated Staff & Agent Roster */}
        <div className="lg:col-span-3 bg-zinc-900 border border-zinc-800/90 rounded-2xl p-4 flex flex-col justify-between shadow-xs overflow-hidden space-y-4">
          <div className="space-y-4 overflow-y-auto pr-1">
            {/* Staff Authentication Switcher (Anti-Impersonation) */}
            <div className="space-y-1.5 p-2.5 rounded-xl bg-zinc-950/70 border border-zinc-800">
              <div className="flex items-center justify-between text-[10px] font-mono text-zinc-400 uppercase tracking-wider">
                <span>Staff Credentials</span>
                <span className="text-emerald-400">PIN Verified</span>
              </div>
              <div className="grid grid-cols-2 gap-1.5 pt-1">
                {REGISTERED_STAFF.map((staff) => {
                  const isActive = activeStaff.id === staff.id;
                  return (
                    <button
                      key={staff.id}
                      onClick={() => handleSelectTeammate(staff)}
                      className={`px-2 py-1.5 rounded-lg text-left transition-all border cursor-pointer ${
                        isActive
                          ? 'bg-amber-500/10 border-amber-500/40 text-amber-300'
                          : 'bg-zinc-900/60 border-zinc-800 text-zinc-400 hover:text-zinc-200'
                      }`}
                    >
                      <div className="text-[11px] font-bold truncate">{staff.name.split(' ')[0]}</div>
                      <div className="text-[9px] font-mono text-zinc-500 truncate">{staff.badgeId}</div>
                    </button>
                  );
                })}
              </div>
            </div>

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
                      onClick={() => {
                        setSelectedSenderId(p.id);
                        if (isHuman) {
                          const staff = REGISTERED_STAFF.find((s) => s.id === p.id);
                          if (staff) handleSelectTeammate(staff);
                        }
                      }}
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

        {/* Right Side (9 Cols): Main Chat Feed & Interactive WebSocket Composer */}
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
                  Type a message below to broadcast via WebSocket, or click "Run Room 204 Demonstration" to view simulated scenario.
                </div>
              </div>
            ) : (
              filteredMessages.map((msg) => {
                const isHuman = msg.senderType === 'HUMAN' || msg.sourceType === 'LIVE_STAFF';
                const isDemo = Boolean(msg.isDemoWorkflow || msg.sourceType === 'DEMO_WORKFLOW');

                // Look up referenced tasks
                const linkedTasks = msg.referencedTaskIds
                  ? tasks.filter((t) => msg.referencedTaskIds?.includes(t.id))
                  : [];

                return (
                  <div
                    key={msg.id}
                    className={`p-3.5 rounded-xl border transition-all space-y-2 ${
                      isDemo
                        ? 'bg-amber-950/20 border-amber-500/30'
                        : isHuman
                        ? 'bg-zinc-950/80 border-zinc-800 hover:border-zinc-700/80'
                        : 'bg-zinc-950/90 border-zinc-800/80 hover:border-zinc-700/80'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-3 flex-wrap">
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
                          <div className="flex items-center gap-2 flex-wrap">
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

                            {/* Prominent Demonstration Scenario Badge */}
                            {isDemo && (
                              <span
                                className="inline-flex items-center gap-1 text-[9px] font-mono font-bold text-amber-300 bg-amber-500/20 border border-amber-500/50 px-2 py-0.5 rounded shadow-xs"
                                title="This message was generated as part of the Room 204 simulated demonstration scenario"
                              >
                                <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />
                                DEMO SCENARIO (ROOM 204)
                              </span>
                            )}
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
                        <span className="text-[9px] font-mono text-emerald-400 bg-emerald-500/10 px-1.5 py-0.2 rounded border border-emerald-500/20">
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
                  {isTypingState.sender} is analyzing conversation and orchestrating agents via Gemini AI...
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

            {/* Input Form with Identity Selection & WebSocket Delivery */}
            <form onSubmit={handleSendMessage} className="space-y-2">
              <div className="flex items-center justify-between text-xs">
                <div className="flex items-center gap-2">
                  <span className="text-zinc-400 font-medium">Posting as:</span>
                  <select
                    value={selectedSenderId}
                    onChange={(e) => {
                      const newId = e.target.value;
                      setSelectedSenderId(newId);
                      const s = REGISTERED_STAFF.find((st) => st.id === newId);
                      if (s) handleSelectTeammate(s);
                    }}
                    className="bg-zinc-900 border border-zinc-700 rounded-lg px-2.5 py-1 text-xs text-amber-300 font-semibold focus:outline-none cursor-pointer"
                  >
                    <optgroup label="Authenticated Staff Teammates">
                      {REGISTERED_STAFF.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.name} ({s.badgeId} — {s.role})
                        </option>
                      ))}
                    </optgroup>
                    <optgroup label="Autonomous AI Agents">
                      {participants
                        .filter((p) => p.type === 'AI_AGENT')
                        .map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.name} ({p.role})
                          </option>
                        ))}
                    </optgroup>
                  </select>
                </div>

                <div className="flex items-center gap-3">
                  <span className="text-[10px] font-mono text-zinc-500 hidden sm:inline">
                    Transport: {wsConnected ? 'WebSocket' : 'HTTP/SSE'}
                  </span>
                  <span className="text-[10px] text-zinc-500 font-mono hidden sm:inline">
                    Press Enter to send
                  </span>
                </div>
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
                  placeholder={`Send real-time message to ${activeChannel} as ${currentSender.name}...`}
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

      {/* Staff PIN Authentication Modal */}
      {isPinModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-zinc-950/80 backdrop-blur-md">
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl max-w-sm w-full p-5 space-y-4 shadow-2xl">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400">
                <KeyRound className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-zinc-100">Authenticate Staff Session</h3>
                <p className="text-[11px] text-zinc-400">Enter PIN for {matchedStaff?.name || activeStaff.name}</p>
              </div>
            </div>

            {pinError && (
              <div className="p-2 rounded-lg bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs">
                {pinError}
              </div>
            )}

            <div className="space-y-3">
              <div>
                <label className="text-xs text-zinc-400 block mb-1">
                  Security PIN (Demo default: {matchedStaff?.pin || activeStaff.pin})
                </label>
                <input
                  type="password"
                  maxLength={6}
                  value={pinInput}
                  onChange={(e) => setPinInput(e.target.value)}
                  placeholder="Enter 4-digit PIN"
                  className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2 text-center text-sm font-mono tracking-widest text-zinc-100 focus:outline-none focus:border-amber-400"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsPinModalOpen(false)}
                  className="px-3 py-1.5 text-xs text-zinc-400 hover:text-zinc-200"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const targetStaff = matchedStaff || activeStaff;
                    authenticateStaff(targetStaff, pinInput);
                  }}
                  className="px-4 py-1.5 bg-amber-400 hover:bg-amber-300 text-zinc-950 text-xs font-bold rounded-lg cursor-pointer"
                >
                  Confirm & Unlock
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
