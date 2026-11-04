import React, { useState, useEffect, useCallback } from 'react';
import { Header } from './components/Header';
import { ExecutiveOverview } from './components/ExecutiveOverview';
import { GuestRequestsView } from './components/GuestRequestsView';
import { TaskQueue } from './components/TaskQueue';
import { SwitchOpsRoom } from './components/SwitchOpsRoom';
import { AgentManagementView } from './components/AgentManagementView';
import { ManagementAnalytics } from './components/ManagementAnalytics';
import { SettingsView } from './components/SettingsView';
import { IntakeModal } from './components/IntakeModal';
import { HumanVerificationModal } from './components/HumanVerificationModal';
import { TaskDetailDrawer } from './components/TaskDetailDrawer';
import { CentralDecisionModal } from './components/CentralDecisionModal';
import {
  INITIAL_AGENTS,
  INITIAL_TASKS,
  INITIAL_SWITCH_MESSAGES,
  INITIAL_ALERTS,
  INITIAL_SWITCH_STATE,
} from './data/mockData';
import {
  Task,
  GuestRequest,
  AgentProfile,
  SwitchMessage,
  OperationalAlert,
  Department,
  SwitchConfig,
  SwitchConnectionState,
  TaskAuditEntry,
  NavTab,
} from './types';
import {
  Sparkles,
  Radio,
  ShieldCheck,
  CheckCircle2,
  AlertCircle,
  Inbox,
  Filter,
} from 'lucide-react';

const DEFAULT_SWITCH_CONFIG: SwitchConfig = {
  status: 'NOT_CONFIGURED',
  roomWebhookUrl: '',
  roomId: 'hotel-operations-room',
  apiKey: '',
  channelTarget: '#hotel-ops-central',
  autoRelayTasks: true,
  totalDelivered: 0,
  lastTestStatus: 'NOT_TESTED',
};

export default function App() {
  const [activeTab, setActiveTab] = useState<NavTab>('overview');
  const [tasks, setTasks] = useState<Task[]>(INITIAL_TASKS);
  const [requests, setRequests] = useState<GuestRequest[]>([]);
  const [agents, setAgents] = useState<AgentProfile[]>(INITIAL_AGENTS);
  const [switchMessages, setSwitchMessages] = useState<SwitchMessage[]>(INITIAL_SWITCH_MESSAGES);
  const [alerts, setAlerts] = useState<OperationalAlert[]>(INITIAL_ALERTS);
  const [switchConfig, setSwitchConfig] = useState<SwitchConfig>(DEFAULT_SWITCH_CONFIG);
  const [switchState, setSwitchState] = useState<SwitchConnectionState>(INITIAL_SWITCH_STATE);

  const [isIntakeOpen, setIsIntakeOpen] = useState(false);
  const [verifyingTask, setVerifyingTask] = useState<Task | null>(null);
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const [decisionTask, setDecisionTask] = useState<Task | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [hasApiKey, setHasApiKey] = useState(false);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => {
      setToastMessage(null);
    }, 3400);
  };

  // Synchronize state from durable server REST API
  const refreshAllState = useCallback(async () => {
    try {
      const [healthRes, tasksRes, reqsRes, msgsRes, alertsRes, agentsRes, switchRes] = await Promise.allSettled([
        fetch('/api/health').then((r) => r.json()),
        fetch('/api/tasks').then((r) => r.json()),
        fetch('/api/requests').then((r) => r.json()),
        fetch('/api/messages').then((r) => r.json()),
        fetch('/api/alerts').then((r) => r.json()),
        fetch('/api/agents').then((r) => r.json()),
        fetch('/api/switch/config').then((r) => r.json()),
      ]);

      if (healthRes.status === 'fulfilled' && healthRes.value?.hasApiKey) {
        setHasApiKey(true);
      }
      if (tasksRes.status === 'fulfilled' && tasksRes.value?.tasks) {
        setTasks(tasksRes.value.tasks);
      }
      if (reqsRes.status === 'fulfilled' && reqsRes.value?.requests) {
        setRequests(reqsRes.value.requests);
      }
      if (msgsRes.status === 'fulfilled' && msgsRes.value?.messages) {
        setSwitchMessages(msgsRes.value.messages);
      }
      if (alertsRes.status === 'fulfilled' && alertsRes.value?.alerts) {
        setAlerts(alertsRes.value.alerts);
      }
      if (agentsRes.status === 'fulfilled' && agentsRes.value?.agents) {
        setAgents(agentsRes.value.agents);
      }
      if (switchRes.status === 'fulfilled' && switchRes.value?.config) {
        setSwitchConfig(switchRes.value.config);
      }
    } catch (err) {
      console.warn('Initial server state fetch had network errors, using local seed:', err);
    }
  }, []);

  useEffect(() => {
    refreshAllState();
  }, [refreshAllState]);

  // Refresh Switch config
  const handleRefreshConfig = async () => {
    try {
      const res = await fetch('/api/switch/config');
      const data = await res.json();
      if (data?.config) {
        setSwitchConfig(data.config);
      }
    } catch (err) {
      console.error('Error refreshing Switch config:', err);
    }
  };

  // Reset database to seed
  const handleResetDatabase = async () => {
    try {
      const res = await fetch('/api/reset-demo', { method: 'POST' });
      const data = await res.json();
      if (data?.success) {
        await refreshAllState();
      }
    } catch (err) {
      console.error('Error resetting database:', err);
    }
  };

  // Add decomposed tasks from IntakeModal or GuestRequestsView
  const handleDispatchTasks = async (
    newTasksData: Omit<Task, 'id' | 'caseRef' | 'createdAt' | 'status' | 'auditTrail'>[],
    summary: string,
    rawText: string
  ) => {
    try {
      const res = await fetch('/api/tasks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          taskList: newTasksData,
          sourceText: rawText,
        }),
      });
      const data = await res.json();

      if (data.success && data.createdTasks) {
        const created: Task[] = data.createdTasks;
        setTasks((prev) => [...created, ...prev]);

        // Broadcast to Switch room
        const timeStr = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        const suite = created[0]?.room || 'Unknown';

        // Post dispatch message to server
        await fetch('/api/messages', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            sender: 'Central Operations AI',
            avatarRole: 'Orchestrator',
            content: `DECOMPOSED INTAKE: ${summary}. Created ${created.length} departmental responsibilities for Suite ${suite}.`,
            badge: 'DISPATCHED',
            room: suite,
            sourceType: 'LIVE_AGENT',
          }),
        });

        // Add to local message queue
        setSwitchMessages((prev) => [
          ...prev,
          {
            id: `msg-${Date.now()}-1`,
            sender: 'Central Operations AI',
            avatarRole: 'Orchestrator',
            content: `DECOMPOSED INTAKE: ${summary}. Created ${created.length} departmental responsibilities for Suite ${suite}.`,
            badge: 'DISPATCHED',
            timestamp: timeStr,
            room: suite,
            sourceType: 'LIVE_AGENT',
          },
        ]);

        showToast(`Dispatched ${created.length} tasks across departments`);
      }
    } catch (err) {
      console.error('Dispatch error:', err);
      showToast('Error dispatching tasks to server');
    }
  };

  // Accept a task
  const handleAcceptTask = async (taskId: string) => {
    const task = tasks.find((t) => t.id === taskId);
    if (!task) return;

    try {
      const res = await fetch(`/api/tasks/${taskId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          status: 'In Progress',
          actor: task.assignedAgent,
          actorRole: task.department === 'Maintenance' ? 'Engineering' : task.department === 'Housekeeping' ? 'Housekeeping' : 'Front Desk',
          auditNote: 'Department accepted responsibility and dispatched staff on-site.',
        }),
      });
      const data = await res.json();

      if (data.success) {
        setTasks((prev) => prev.map((t) => (t.id === taskId ? data.task : t)));

        // Broadcast to Switch
        const timeStr = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        await fetch('/api/messages', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            sender: task.assignedAgent,
            avatarRole: task.department === 'Maintenance' ? 'Engineering' : task.department === 'Housekeeping' ? 'Housekeeping' : 'Front Desk',
            department: task.department,
            content: `Staff dispatched on site for Suite ${task.room}: "${task.title}". Active execution in progress.`,
            badge: 'SLA ACTIVE',
            room: task.room,
            taskId: task.id,
            sourceType: 'LIVE_AGENT',
          }),
        });

        setSwitchMessages((prev) => [
          ...prev,
          {
            id: `msg-${Date.now()}`,
            sender: task.assignedAgent,
            avatarRole: task.department === 'Maintenance' ? 'Engineering' : task.department === 'Housekeeping' ? 'Housekeeping' : 'Front Desk',
            department: task.department,
            content: `Staff dispatched on site for Suite ${task.room}: "${task.title}". Active execution in progress.`,
            badge: 'SLA ACTIVE',
            timestamp: timeStr,
            room: task.room,
            taskId: task.id,
            sourceType: 'LIVE_AGENT',
          },
        ]);

        showToast(`Case ${task.caseRef} moved to In Progress`);
      }
    } catch (err) {
      console.error('Accept task error:', err);
    }
  };

  // Escalate a task
  const handleEscalateTask = async (taskId: string, reason?: string) => {
    const task = tasks.find((t) => t.id === taskId);
    if (!task) return;

    try {
      const res = await fetch(`/api/tasks/${taskId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          status: 'Escalated',
          priority: 'Critical',
          escalationReason: reason || 'Service delivery delayed past luxury standard threshold',
          actor: 'Management Agent',
          actorRole: 'General Manager',
          auditNote: `Escalated to GM level: ${reason || 'SLA threshold reached'}.`,
        }),
      });
      const data = await res.json();

      if (data.success) {
        setTasks((prev) => prev.map((t) => (t.id === taskId ? data.task : t)));

        const timeStr = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        await fetch('/api/messages', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            sender: 'Management Agent',
            avatarRole: 'General Manager',
            department: 'Management',
            content: `MANAGEMENT ESCALATION: Suite ${task.room} - "${task.title}". Duty Manager alerted for VIP recovery. Reason: ${reason || 'SLA threshold reached'}.`,
            badge: 'ESCALATED',
            room: task.room,
            taskId: task.id,
            sourceType: 'LIVE_AGENT',
          }),
        });

        setSwitchMessages((prev) => [
          ...prev,
          {
            id: `msg-${Date.now()}-esc`,
            sender: 'Management Agent',
            avatarRole: 'General Manager',
            department: 'Management',
            content: `MANAGEMENT ESCALATION: Suite ${task.room} - "${task.title}". Duty Manager alerted for VIP recovery. Reason: ${reason || 'SLA threshold reached'}.`,
            badge: 'ESCALATED',
            timestamp: timeStr,
            room: task.room,
            taskId: task.id,
            sourceType: 'LIVE_AGENT',
          },
        ]);

        showToast(`Case ${task.caseRef} escalated to Management`);
      }
    } catch (err) {
      console.error('Escalate error:', err);
    }
  };

  // Human confirmed completion (Strict human-in-the-loop sign-off)
  const handleConfirmResolution = async (taskId: string, staffName: string, notes: string) => {
    const task = tasks.find((t) => t.id === taskId);
    if (!task) return;

    try {
      const res = await fetch(`/api/tasks/${taskId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          status: 'Resolved',
          resolvedBy: staffName,
          resolutionNotes: notes,
          actor: staffName,
          actorRole: 'Authorized Staff',
          auditNote: `Physical verification confirmed in suite: "${notes}"`,
        }),
      });
      const data = await res.json();

      if (data.success) {
        setTasks((prev) => prev.map((t) => (t.id === taskId ? data.task : t)));

        const timeStr = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        await fetch('/api/messages', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            sender: task.assignedAgent,
            avatarRole: task.department === 'Maintenance' ? 'Engineering' : task.department === 'Housekeeping' ? 'Housekeeping' : 'Front Desk',
            department: task.department,
            content: `HUMAN COMPLETION VERIFIED: Suite ${task.room} ("${task.title}"). Verified by ${staffName}. Notes: "${notes}"`,
            badge: 'VERIFIED',
            room: task.room,
            taskId: task.id,
            sourceType: 'LIVE_AGENT',
          }),
        });

        setSwitchMessages((prev) => [
          ...prev,
          {
            id: `msg-${Date.now()}-res`,
            sender: task.assignedAgent,
            avatarRole: task.department === 'Maintenance' ? 'Engineering' : task.department === 'Housekeeping' ? 'Housekeeping' : 'Front Desk',
            department: task.department,
            content: `HUMAN COMPLETION VERIFIED: Suite ${task.room} ("${task.title}"). Verified by ${staffName}. Notes: "${notes}"`,
            badge: 'VERIFIED',
            timestamp: timeStr,
            room: task.room,
            taskId: task.id,
            sourceType: 'LIVE_AGENT',
          },
          {
            id: `msg-${Date.now()}-res2`,
            sender: 'Central Operations AI',
            avatarRole: 'Orchestrator',
            content: `Case ${task.caseRef} officially CLOSED. Reception Agent notified for courtesy follow-up.`,
            badge: 'INFO',
            timestamp: timeStr,
            room: task.room,
            sourceType: 'LIVE_AGENT',
          },
        ]);

        showToast(`Case ${task.caseRef} verified & resolved by ${staffName}`);
      }
    } catch (err) {
      console.error('Resolve error:', err);
    }
  };

  // Apply Central AI managerial decision directive
  const handleApplyDirective = async (
    taskId: string,
    directive: {
      recommendedPriority: string;
      recommendedDepartment: string;
      summary: string;
      directives: string[];
    }
  ) => {
    const task = tasks.find((t) => t.id === taskId);
    if (!task) return;

    try {
      const res = await fetch(`/api/tasks/${taskId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          priority: directive.recommendedPriority,
          actor: 'Central Operations AI',
          actorRole: 'Orchestrator',
          auditNote: `Central AI Directive: ${directive.summary}. Priority set to ${directive.recommendedPriority}.`,
        }),
      });
      const data = await res.json();

      if (data.success) {
        setTasks((prev) =>
          prev.map((t) =>
            t.id === taskId
              ? {
                  ...data.task,
                  department: directive.recommendedDepartment as Department,
                }
              : t
          )
        );

        const timeStr = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        await fetch('/api/messages', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            sender: 'Central Operations AI',
            avatarRole: 'Orchestrator',
            content: `MANAGERIAL DIRECTIVE APPLIED: Suite ${task.room} ("${task.title}"). ${directive.summary}`,
            badge: 'DISPATCHED',
            room: task.room,
            taskId: task.id,
            sourceType: 'LIVE_AGENT',
          }),
        });

        setSwitchMessages((prev) => [
          ...prev,
          {
            id: `msg-${Date.now()}-decision`,
            sender: 'Central Operations AI',
            avatarRole: 'Orchestrator',
            content: `MANAGERIAL DIRECTIVE APPLIED: Suite ${task.room} ("${task.title}"). ${directive.summary}`,
            badge: 'DISPATCHED',
            timestamp: timeStr,
            room: task.room,
            taskId: task.id,
            sourceType: 'LIVE_AGENT',
          },
        ]);

        showToast(`Applied Central AI directive for Suite ${task.room}`);
      }
    } catch (err) {
      console.error('Apply directive error:', err);
    }
  };

  // Dispatch Switch Protocol Event
  const handleDispatchSwitchEvent = async (
    eventType: string,
    targetDept: Department,
    summary: string,
    room?: string
  ) => {
    try {
      const res = await fetch('/api/switch/dispatch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          eventType,
          senderId: 'Central Operations AI',
          targetDepartment: targetDept,
          payload: { summary },
          room: room || '412',
        }),
      });
      const data = await res.json();
      const timeStr = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

      setSwitchMessages((prev) => [
        ...prev,
        {
          id: `msg-${Date.now()}-protocol`,
          sender: 'Central Operations AI',
          avatarRole: 'Orchestrator',
          content: `SWITCH PROTOCOL EVENT [${eventType}]: ${summary}`,
          badge: 'DISPATCHED',
          timestamp: timeStr,
          room: room || '412',
          sourceType: 'SWITCH_PROTOCOL',
          switchPayload: data?.envelope,
        },
      ]);

      showToast(`Switch event [${eventType}] broadcasted`);
    } catch (err) {
      console.error('Switch event dispatch error:', err);
    }
  };

  // Trigger specialized domain protocol from Agent Management
  const handleTriggerAgentProtocol = async (
    agentName: string,
    protocolName: string,
    department: Department
  ) => {
    const timeStr = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

    await fetch('/api/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sender: agentName,
        avatarRole: department === 'Maintenance' ? 'Engineering' : department === 'Housekeeping' ? 'Housekeeping' : department === 'Management' ? 'General Manager' : 'Front Desk',
        department,
        content: `AUTONOMOUS PROTOCOL TRIGGERED: ${protocolName}. Operational checklist verified.`,
        badge: 'ACKNOWLEDGED',
        sourceType: 'LIVE_AGENT',
      }),
    });

    setSwitchMessages((prev) => [
      ...prev,
      {
        id: `msg-${Date.now()}-proto`,
        sender: agentName,
        avatarRole: department === 'Maintenance' ? 'Engineering' : department === 'Housekeeping' ? 'Housekeeping' : department === 'Management' ? 'General Manager' : 'Front Desk',
        department,
        content: `AUTONOMOUS PROTOCOL TRIGGERED: ${protocolName}. Operational checklist verified.`,
        badge: 'ACKNOWLEDGED',
        timestamp: timeStr,
        sourceType: 'LIVE_AGENT',
      },
    ]);

    showToast(`Triggered ${protocolName} for ${agentName}`);
  };

  // Switch chat sender
  const handleSendMessage = async (
    sender: string,
    avatarRole: string,
    content: string,
    badge?: any,
    room?: string
  ) => {
    try {
      const res = await fetch('/api/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sender,
          avatarRole,
          content,
          badge,
          room,
          sourceType: 'LIVE_AGENT',
        }),
      });
      const data = await res.json();
      if (data?.message) {
        setSwitchMessages((prev) => [...prev, data.message]);
      }
    } catch (err) {
      console.error('Send message error:', err);
    }
  };

  // Switch autonomous consultation trigger
  const handleRequestConsultation = async (topic: string, room?: string) => {
    try {
      const res = await fetch('/api/gemini/switch-dialogue', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          eventType: 'NEW_TASK_CREATED',
          taskTitle: topic,
          room: room || '412',
          department: 'Maintenance',
          context: `Multi-agent alignment request regarding ${topic}`,
        }),
      });
      const data = await res.json();
      if (data && data.messages) {
        const timeStr = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        const formatted = data.messages.map((m: any, i: number) => ({
          id: `msg-${Date.now()}-${i}`,
          sender: m.sender,
          avatarRole: m.avatarRole || 'Specialist',
          content: m.content,
          badge: m.badge || 'INFO',
          timestamp: timeStr,
          room: room || '412',
          sourceType: 'LIVE_AGENT',
        }));
        setSwitchMessages((prev) => [...prev, ...formatted]);
        showToast('Switch AI agents synchronized');
      }
    } catch (err) {
      console.error('Consultation error:', err);
    }
  };

  const openTasksCount = tasks.filter((t) => t.status !== 'Resolved').length;

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 flex flex-col font-sans selection:bg-amber-500/20 selection:text-amber-200">
      {/* Top Navigation Bar with 7 Core Sections */}
      <Header
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        onOpenIntake={() => setIsIntakeOpen(true)}
        openTaskCount={openTasksCount}
        alertCount={alerts.length}
        hasApiKey={hasApiKey}
        switchConfig={switchConfig}
      />

      {/* Main Content Area */}
      <main className="flex-1 max-w-[1680px] w-full mx-auto px-4 sm:px-6 py-6">
        {/* Section 1: Executive Overview */}
        {activeTab === 'overview' && (
          <ExecutiveOverview
            tasks={tasks}
            alerts={alerts}
            agents={agents}
            switchConfig={switchConfig}
            onNavigateTab={setActiveTab}
            onOpenIntake={() => setIsIntakeOpen(true)}
            onRequestVerification={(t) => setVerifyingTask(t)}
            onSelectTask={(t) => setSelectedTask(t)}
          />
        )}

        {/* Section 2: Guest Requests (Intelligent Intake & Missing-Room Safeguard) */}
        {activeTab === 'requests' && (
          <GuestRequestsView
            requests={requests}
            tasks={tasks}
            onDispatchTasks={handleDispatchTasks}
            onNavigateTab={setActiveTab}
            onSelectTask={(t) => setSelectedTask(t)}
          />
        )}

        {/* Section 3: Operations Task Center */}
        {activeTab === 'tasks' && (
          <div className="space-y-6">
            <div className="bg-zinc-900 border border-zinc-800/80 rounded-2xl p-5 flex flex-col md:flex-row md:items-center justify-between gap-4 shadow-xs">
              <div>
                <div className="text-[11px] font-mono font-bold text-amber-400 uppercase tracking-wider mb-1 flex items-center gap-1.5">
                  <ShieldCheck className="w-4 h-4 text-amber-400" />
                  <span>Operations Task Center</span>
                </div>
                <h1 className="text-xl font-bold text-zinc-100">
                  Departmental Execution Queue & Live SLA Clocks
                </h1>
                <p className="text-xs text-zinc-400 mt-0.5">
                  Every request has defined ownership. Every task is auditable. Physical completion requires authorized human sign-off.
                </p>
              </div>

              <div className="flex items-center gap-2 flex-wrap">
                <button
                  onClick={() => setIsIntakeOpen(true)}
                  className="flex items-center gap-1.5 px-3.5 py-2 text-xs font-bold text-zinc-950 bg-amber-400 hover:bg-amber-300 rounded-lg shadow-xs transition-all cursor-pointer"
                >
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>+ Complex Request Intake</span>
                </button>

                <button
                  onClick={() => setActiveTab('switch')}
                  className="flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-zinc-200 bg-zinc-800 hover:bg-zinc-750 rounded-lg border border-zinc-700/80 transition-colors cursor-pointer"
                >
                  <Radio className="w-3.5 h-3.5 text-amber-400" />
                  <span>Open Switch Ops Room</span>
                </button>
              </div>
            </div>

            <TaskQueue
              tasks={tasks}
              onAcceptTask={handleAcceptTask}
              onEscalateTask={handleEscalateTask}
              onRequestVerification={(t) => setVerifyingTask(t)}
              onSelectTask={(t) => setSelectedTask(t)}
              onRequestCentralDecision={(t) => setDecisionTask(t)}
            />
          </div>
        )}

        {/* Section 4: Switch Operations Room */}
        {activeTab === 'switch' && (
          <SwitchOpsRoom
            messages={switchMessages}
            tasks={tasks}
            switchState={switchState}
            switchConfig={switchConfig}
            onSendMessage={handleSendMessage}
            onRequestConsultation={handleRequestConsultation}
            onDispatchSwitchEvent={handleDispatchSwitchEvent}
          />
        )}

        {/* Section 5: AI Agent Management */}
        {activeTab === 'agents' && (
          <AgentManagementView
            agents={agents}
            tasks={tasks}
            onTriggerAgentProtocol={handleTriggerAgentProtocol}
            onNavigateTab={setActiveTab}
          />
        )}

        {/* Section 6: Management Intelligence */}
        {activeTab === 'intelligence' && (
          <ManagementAnalytics tasks={tasks} />
        )}

        {/* Section 7: Settings & Integrations */}
        {activeTab === 'settings' && (
          <SettingsView
            switchConfig={switchConfig}
            hasApiKey={hasApiKey}
            onRefreshConfig={handleRefreshConfig}
            onResetDatabase={handleResetDatabase}
            showToast={showToast}
          />
        )}
      </main>

      {/* Intake Modal */}
      <IntakeModal
        isOpen={isIntakeOpen}
        onClose={() => setIsIntakeOpen(false)}
        onDispatchTasks={handleDispatchTasks}
      />

      {/* Human Completion Verification Modal (Strict Human-in-the-loop Gate) */}
      <HumanVerificationModal
        task={verifyingTask}
        isOpen={Boolean(verifyingTask)}
        onClose={() => setVerifyingTask(null)}
        onConfirmResolution={handleConfirmResolution}
      />

      {/* Central AI Decision Modal */}
      <CentralDecisionModal
        task={decisionTask}
        isOpen={Boolean(decisionTask)}
        onClose={() => setDecisionTask(null)}
        onApplyDirective={handleApplyDirective}
      />

      {/* Task Detail Drawer */}
      <TaskDetailDrawer
        task={selectedTask}
        onClose={() => setSelectedTask(null)}
        onAcceptTask={handleAcceptTask}
        onEscalateTask={handleEscalateTask}
        onRequestVerification={(t) => setVerifyingTask(t)}
        onRequestCentralDecision={(t) => setDecisionTask(t)}
      />

      {/* Toast Notification */}
      {toastMessage && (
        <div className="fixed bottom-5 right-5 z-50 flex items-center gap-2.5 px-4 py-3 bg-zinc-900 border border-zinc-700 text-zinc-100 text-xs font-medium rounded-xl shadow-2xl animate-fade-in">
          <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
          <span>{toastMessage}</span>
        </div>
      )}
    </div>
  );
}
