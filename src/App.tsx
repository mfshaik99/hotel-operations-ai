import React, { useState, useEffect } from 'react';
import { Header } from './components/Header';
import { TaskQueue } from './components/TaskQueue';
import { SwitchOpsRoom } from './components/SwitchOpsRoom';
import { DepartmentalHub } from './components/DepartmentalHub';
import { RiskRadar } from './components/RiskRadar';
import { ManagementAnalytics } from './components/ManagementAnalytics';
import { IntakeModal } from './components/IntakeModal';
import { HumanVerificationModal } from './components/HumanVerificationModal';
import { TaskDetailDrawer } from './components/TaskDetailDrawer';
import {
  INITIAL_AGENTS,
  INITIAL_TASKS,
  INITIAL_SWITCH_MESSAGES,
  INITIAL_ALERTS,
} from './data/mockData';
import { Task, AgentProfile, SwitchMessage, OperationalAlert, Department } from './types';
import { Sparkles, Radio, ShieldCheck, Flame, Bell, CheckCircle2 } from 'lucide-react';

export default function App() {
  const [activeTab, setActiveTab] = useState<'command' | 'switch' | 'departments' | 'radar' | 'analytics'>('command');
  const [tasks, setTasks] = useState<Task[]>(() => {
    const saved = localStorage.getItem('hotelops_tasks_v2');
    return saved ? JSON.parse(saved) : INITIAL_TASKS;
  });
  const [agents, setAgents] = useState<AgentProfile[]>(INITIAL_AGENTS);
  const [switchMessages, setSwitchMessages] = useState<SwitchMessage[]>(() => {
    const saved = localStorage.getItem('hotelops_switch_v2');
    return saved ? JSON.parse(saved) : INITIAL_SWITCH_MESSAGES;
  });
  const [alerts, setAlerts] = useState<OperationalAlert[]>(INITIAL_ALERTS);

  const [isIntakeOpen, setIsIntakeOpen] = useState(false);
  const [verifyingTask, setVerifyingTask] = useState<Task | null>(null);
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [hasApiKey, setHasApiKey] = useState(false);

  // Check health and API key on mount
  useEffect(() => {
    fetch('/api/health')
      .then((r) => r.json())
      .then((data) => {
        if (data?.hasApiKey) setHasApiKey(true);
      })
      .catch(() => {});
  }, []);

  // Sync to local storage
  useEffect(() => {
    localStorage.setItem('hotelops_tasks_v2', JSON.stringify(tasks));
  }, [tasks]);

  useEffect(() => {
    localStorage.setItem('hotelops_switch_v2', JSON.stringify(switchMessages));
  }, [switchMessages]);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => {
      setToastMessage(null);
    }, 3200);
  };

  const getNextCaseId = () => {
    const maxNum = tasks.reduce((max, t) => {
      const match = t.caseRef.match(/\d+/);
      const num = match ? parseInt(match[0], 10) : 8000;
      return num > max ? num : max;
    }, 8100);
    return `CAS-${maxNum + 1}`;
  };

  // Add decomposed tasks from IntakeModal
  const handleDispatchTasks = async (
    newTasksData: Omit<Task, 'id' | 'caseRef' | 'createdAt' | 'status'>[],
    summary: string,
    rawText: string
  ) => {
    const now = Date.now();
    const createdTasks: Task[] = [];

    newTasksData.forEach((td, idx) => {
      const caseRef = `CAS-${8100 + tasks.length + idx + 1}`;
      const newTask: Task = {
        ...td,
        id: `task-${Date.now()}-${idx}`,
        caseRef,
        status: 'Dispatched',
        createdAt: now,
      };
      createdTasks.push(newTask);
    });

    setTasks((prev) => [...createdTasks, ...prev]);

    // Broadcast into Switch
    const timeStr = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const newMessages: SwitchMessage[] = [
      {
        id: `msg-${Date.now()}-1`,
        sender: 'Central Operations AI',
        avatarRole: 'Orchestrator',
        content: `DECOMPOSED INTAKE: ${summary}. Created ${createdTasks.length} separate departmental responsibilities for Suite ${createdTasks[0]?.room || 'Unknown'}.`,
        badge: 'DISPATCHED',
        timestamp: timeStr,
        room: createdTasks[0]?.room,
      },
    ];

    createdTasks.forEach((t, i) => {
      newMessages.push({
        id: `msg-${Date.now()}-${i + 2}`,
        sender: t.assignedAgent,
        avatarRole: t.department === 'Maintenance' ? 'Engineering' : t.department === 'Housekeeping' ? 'Housekeeping' : 'Front Desk',
        department: t.department,
        content: `Responsibility accepted for Suite ${t.room}: "${t.title}". SLA clock started (${t.estimatedMinutes}m).`,
        badge: 'ACKNOWLEDGED',
        timestamp: timeStr,
        room: t.room,
        taskId: t.id,
      });
    });

    setSwitchMessages((prev) => [...prev, ...newMessages]);
    showToast(`Dispatched ${createdTasks.length} tasks across departments`);
  };

  // Accept a task
  const handleAcceptTask = (taskId: string) => {
    const task = tasks.find((t) => t.id === taskId);
    if (!task) return;

    setTasks((prev) =>
      prev.map((t) => (t.id === taskId ? { ...t, status: 'In Progress' } : t))
    );

    const timeStr = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
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
      },
    ]);

    showToast(`Case ${task.caseRef} moved to In Progress`);
  };

  // Escalate a task
  const handleEscalateTask = (taskId: string, reason?: string) => {
    const task = tasks.find((t) => t.id === taskId);
    if (!task) return;

    setTasks((prev) =>
      prev.map((t) =>
        t.id === taskId
          ? {
              ...t,
              status: 'Escalated',
              priority: 'Critical',
              escalationReason: reason || 'Service delivery delayed past luxury expectation',
            }
          : t
      )
    );

    const timeStr = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    setSwitchMessages((prev) => [
      ...prev,
      {
        id: `msg-${Date.now()}-esc`,
        sender: 'Management Agent',
        avatarRole: 'General Manager',
        department: 'Management',
        content: `MANAGEMENT ESCALATION TRIGGERED: Suite ${task.room} - "${task.title}". Duty Manager alerted for VIP service recovery. Reason: ${reason || 'SLA threshold reached'}.`,
        badge: 'ESCALATED',
        timestamp: timeStr,
        room: task.room,
        taskId: task.id,
      },
    ]);

    showToast(`Case ${task.caseRef} escalated to Management`);
  };

  // Human confirmed completion
  const handleConfirmResolution = (taskId: string, staffName: string, notes: string) => {
    const task = tasks.find((t) => t.id === taskId);
    if (!task) return;

    const resolvedAt = Date.now();
    setTasks((prev) =>
      prev.map((t) =>
        t.id === taskId
          ? {
              ...t,
              status: 'Resolved',
              resolvedBy: staffName,
              resolvedAt,
              resolutionNotes: notes,
            }
          : t
      )
    );

    const timeStr = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    setSwitchMessages((prev) => [
      ...prev,
      {
        id: `msg-${Date.now()}-res`,
        sender: task.assignedAgent,
        avatarRole: task.department === 'Maintenance' ? 'Engineering' : task.department === 'Housekeeping' ? 'Housekeeping' : 'Front Desk',
        department: task.department,
        content: `HUMAN COMPLETION VERIFIED: Suite ${task.room} ("${task.title}"). Confirmed by ${staffName}. Notes: "${notes}"`,
        badge: 'VERIFIED',
        timestamp: timeStr,
        room: task.room,
        taskId: task.id,
      },
      {
        id: `msg-${Date.now()}-res2`,
        sender: 'Central Operations AI',
        avatarRole: 'Orchestrator',
        content: `Case ${task.caseRef} officially CLOSED in property ledger. Reception Agent instructed to place guest follow-up call.`,
        badge: 'INFO',
        timestamp: timeStr,
        room: task.room,
      },
    ]);

    showToast(`Case ${task.caseRef} verified & resolved by ${staffName}`);
  };

  // Switch chat sender
  const handleSendMessage = (
    sender: string,
    avatarRole: string,
    content: string,
    badge?: any,
    room?: string
  ) => {
    const timeStr = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    setSwitchMessages((prev) => [
      ...prev,
      {
        id: `msg-${Date.now()}`,
        sender,
        avatarRole,
        content,
        badge,
        timestamp: timeStr,
        room,
      },
    ]);
  };

  // Switch autonomous consultation trigger (queries server API)
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
        }));
        setSwitchMessages((prev) => [...prev, ...formatted]);
        showToast('Switch AI agents synchronized');
      }
    } catch (err) {
      console.error('Consultation error:', err);
    }
  };

  // Execute risk recommendation
  const handleExecuteRecommendation = (alertId: string, actionText: string) => {
    const timeStr = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    setSwitchMessages((prev) => [
      ...prev,
      {
        id: `msg-${Date.now()}-action`,
        sender: 'Central Operations AI',
        avatarRole: 'Orchestrator',
        content: `AUTHORIZED PROACTIVE ACTION: "${actionText}". Work orders transmitted directly to engineering supervisor radio.`,
        badge: 'DISPATCHED',
        timestamp: timeStr,
      },
    ]);

    setAlerts((prev) => prev.filter((a) => a.id !== alertId));
    showToast('Proactive corrective measure executed');
  };

  const handleRunScan = () => {
    showToast('Deep property scan complete: 3 critical telemetry points verified.');
  };

  const openTasksCount = tasks.filter((t) => t.status !== 'Resolved').length;

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans">
      {/* Top Navigation */}
      <Header
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        onOpenIntake={() => setIsIntakeOpen(true)}
        openTaskCount={openTasksCount}
        alertCount={alerts.length}
        hasApiKey={hasApiKey}
      />

      {/* Main Content Area */}
      <main className="flex-1 max-w-[1600px] w-full mx-auto px-4 sm:px-6 py-6">
        {activeTab === 'command' && (
          <div className="space-y-6">
            {/* Command Header Banner */}
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div>
                <div className="text-[11px] font-mono font-bold text-amber-400 uppercase tracking-wider mb-1 flex items-center gap-1.5">
                  <ShieldCheck className="w-4 h-4 text-amber-400" />
                  <span>Central Operations Command</span>
                </div>
                <h1 className="text-xl font-bold text-slate-100">
                  Guest Request & Departmental Coordination Queue
                </h1>
                <p className="text-xs text-slate-400 mt-0.5">
                  Every request has defined ownership. Every task is traceable. Real-time SLA countdowns active.
                </p>
              </div>

              <div className="flex items-center gap-2 flex-wrap">
                <button
                  onClick={() => setIsIntakeOpen(true)}
                  className="flex items-center gap-1.5 px-3.5 py-2 text-xs font-bold text-slate-950 bg-amber-400 hover:bg-amber-300 rounded-lg shadow transition-all cursor-pointer"
                >
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>+ Complex Request Intake</span>
                </button>

                <button
                  onClick={() => setActiveTab('switch')}
                  className="flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-slate-200 bg-slate-800 hover:bg-slate-700 rounded-lg border border-slate-700/80 transition-colors cursor-pointer"
                >
                  <Radio className="w-3.5 h-3.5 text-amber-400" />
                  <span>Open Switch Ops Room</span>
                </button>
              </div>
            </div>

            {/* Task Queue Grid */}
            <TaskQueue
              tasks={tasks}
              onAcceptTask={handleAcceptTask}
              onEscalateTask={handleEscalateTask}
              onRequestVerification={(t) => setVerifyingTask(t)}
              onSelectTask={(t) => setSelectedTask(t)}
            />
          </div>
        )}

        {activeTab === 'switch' && (
          <SwitchOpsRoom
            messages={switchMessages}
            tasks={tasks}
            onSendMessage={handleSendMessage}
            onRequestConsultation={handleRequestConsultation}
          />
        )}

        {activeTab === 'departments' && (
          <DepartmentalHub
            agents={agents}
            tasks={tasks}
            onSelectDepartment={(dept) => {
              setActiveTab('command');
            }}
            onRequestVerification={(t) => setVerifyingTask(t)}
            onOpenIntake={() => setIsIntakeOpen(true)}
          />
        )}

        {activeTab === 'radar' && (
          <RiskRadar
            alerts={alerts}
            tasks={tasks}
            onExecuteRecommendation={handleExecuteRecommendation}
            onRunScan={handleRunScan}
          />
        )}

        {activeTab === 'analytics' && (
          <ManagementAnalytics tasks={tasks} />
        )}
      </main>

      {/* Intake Modal */}
      <IntakeModal
        isOpen={isIntakeOpen}
        onClose={() => setIsIntakeOpen(false)}
        onDispatchTasks={handleDispatchTasks}
      />

      {/* Human Completion Verification Modal (Core Principle #8) */}
      <HumanVerificationModal
        task={verifyingTask}
        isOpen={Boolean(verifyingTask)}
        onClose={() => setVerifyingTask(null)}
        onConfirmResolution={handleConfirmResolution}
      />

      {/* Task Detail Drawer */}
      <TaskDetailDrawer
        task={selectedTask}
        onClose={() => setSelectedTask(null)}
        onAcceptTask={handleAcceptTask}
        onEscalateTask={handleEscalateTask}
        onRequestVerification={(t) => setVerifyingTask(t)}
      />

      {/* Toast Notification */}
      {toastMessage && (
        <div className="fixed bottom-5 right-5 z-50 flex items-center gap-2.5 px-4 py-3 bg-slate-900 border border-slate-700 text-slate-100 text-xs font-medium rounded-xl shadow-2xl animate-fade-in">
          <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
          <span>{toastMessage}</span>
        </div>
      )}
    </div>
  );
}
