import React, { useState } from 'react';
import {
  Users,
  ShieldCheck,
  Brain,
  Compass,
  BedDouble,
  Wrench,
  Radio,
  Clock,
  Sparkles,
  Play,
  CheckCircle2,
  AlertCircle,
  ExternalLink,
  Layers,
  Activity,
  Zap,
} from 'lucide-react';
import { AgentProfile, Department, Task } from '../types';

interface AgentManagementViewProps {
  agents: AgentProfile[];
  tasks: Task[];
  onTriggerAgentProtocol: (agentName: string, protocolName: string, department: Department) => void;
  onNavigateTab: (tab: any) => void;
}

export const AgentManagementView: React.FC<AgentManagementViewProps> = ({
  agents,
  tasks,
  onTriggerAgentProtocol,
  onNavigateTab,
}) => {
  const [selectedAgentId, setSelectedAgentId] = useState<string>(agents[0]?.id || 'agent-central');
  const [triggeredProtocols, setTriggeredProtocols] = useState<string[]>([]);

  const selectedAgent = agents.find((a) => a.id === selectedAgentId) || agents[0];
  const activeTasksForSelected = tasks.filter(
    (t) => (t.department === selectedAgent?.department || selectedAgent?.department === 'Management') && t.status !== 'Resolved'
  );

  const handleProtocolClick = (agentName: string, protocol: string, dept: Department) => {
    onTriggerAgentProtocol(agentName, protocol, dept);
    setTriggeredProtocols((prev) => [...prev, `${agentName}-${protocol}`]);
    setTimeout(() => {
      setTriggeredProtocols((prev) => prev.filter((p) => p !== `${agentName}-${protocol}`));
    }, 4000);
  };

  const getDepartmentIcon = (dept: Department) => {
    switch (dept) {
      case 'Reception':
        return Compass;
      case 'Housekeeping':
        return BedDouble;
      case 'Maintenance':
        return Wrench;
      case 'Management':
      default:
        return ShieldCheck;
    }
  };

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1.5">
            <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[11px] font-mono font-semibold bg-amber-500/10 text-amber-300 border border-amber-500/30">
              <Users className="w-3.5 h-3.5" />
              SPECIALIZED MULTI-AGENT ARCHITECTURE
            </span>
            <span className="text-xs text-zinc-500 font-mono">5 Independent Domain Agents</span>
          </div>
          <h1 className="text-xl font-bold text-zinc-100 tracking-tight">
            AI Agent Management & Domain Authorities
          </h1>
          <p className="text-xs text-zinc-400 mt-1 max-w-2xl leading-relaxed">
            Rather than one monolithic chatbot handling everything, our ecosystem divides responsibilities among specialized autonomous agents. Each maintains dedicated authority, independent protocols and Switch room presence.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={() => onNavigateTab('switch')}
            className="px-3.5 py-2 text-xs font-semibold text-zinc-200 bg-zinc-800 hover:bg-zinc-750 border border-zinc-700/80 rounded-xl transition-colors cursor-pointer flex items-center gap-2"
          >
            <Radio className="w-3.5 h-3.5 text-amber-400" />
            <span>Open Switch Team Room</span>
          </button>
        </div>
      </div>

      {/* Agents Grid (Cards for all 5 Agents) */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
        {agents.map((agent) => {
          const Icon = getDepartmentIcon(agent.department);
          const isSelected = agent.id === selectedAgentId;
          const liveActive = tasks.filter(
            (t) => (t.department === agent.department || agent.department === 'Management') && t.status !== 'Resolved'
          ).length;

          return (
            <div
              key={agent.id}
              onClick={() => setSelectedAgentId(agent.id)}
              className={`p-4 rounded-xl border transition-all cursor-pointer flex flex-col justify-between space-y-4 shadow-xs ${
                isSelected
                  ? 'bg-zinc-850/90 border-amber-400/80 ring-1 ring-amber-400/30'
                  : 'bg-zinc-900 border-zinc-800/80 hover:border-zinc-700'
              }`}
            >
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <div className="w-9 h-9 rounded-lg bg-zinc-800 border border-zinc-700/80 flex items-center justify-center font-bold text-amber-400 text-xs font-mono">
                    {agent.avatar}
                  </div>
                  <span className={`text-[10px] font-mono px-2 py-0.5 rounded font-medium ${
                    agent.status === 'Active'
                      ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                      : agent.status === 'High Load'
                      ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                      : 'bg-purple-500/10 text-purple-400 border border-purple-500/20'
                  }`}>
                    {agent.status}
                  </span>
                </div>

                <div>
                  <h3 className="text-sm font-bold text-zinc-100 flex items-center gap-1.5">
                    <span>{agent.name}</span>
                  </h3>
                  <div className="text-[11px] text-zinc-400 line-clamp-1 mt-0.5">
                    {agent.role}
                  </div>
                </div>
              </div>

              <div className="pt-2 border-t border-zinc-800/80 space-y-2 text-[11px]">
                <div className="flex items-center justify-between text-zinc-400">
                  <span>Active Tasks</span>
                  <span className="font-mono font-bold text-zinc-200">{liveActive}</span>
                </div>
                <div className="flex items-center justify-between text-zinc-400">
                  <span>Avg Response</span>
                  <span className="font-mono text-zinc-300">{agent.avgResponseMins}m</span>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Selected Agent Deep Dive Detail Panel */}
      {selectedAgent && (
        <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 shadow-xs space-y-6">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-6 border-b border-zinc-800">
            <div className="flex items-center gap-4">
              <div className="w-14 h-14 rounded-2xl bg-zinc-800 border border-zinc-700 flex items-center justify-center text-xl font-bold font-mono text-amber-400 shadow-xs">
                {selectedAgent.avatar}
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-lg font-bold text-zinc-100">{selectedAgent.name}</h2>
                  <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-zinc-800 text-zinc-300 border border-zinc-700">
                    {selectedAgent.department} Department
                  </span>
                </div>
                <p className="text-xs text-zinc-400 mt-1 max-w-2xl">
                  {selectedAgent.specialty}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-4 text-xs font-mono">
              <div className="p-3 rounded-xl bg-zinc-950 border border-zinc-800">
                <span className="text-zinc-500 text-[10px] block uppercase">Autonomy Clearance</span>
                <span className="text-amber-300 font-semibold">{selectedAgent.autonomyLevel}</span>
              </div>
              <div className="p-3 rounded-xl bg-zinc-950 border border-zinc-800">
                <span className="text-zinc-500 text-[10px] block uppercase">Switch Protocol</span>
                <span className="text-emerald-400 font-semibold">Active Standby</span>
              </div>
            </div>
          </div>

          {/* 2-Column: Active Protocols & Live Department Queue */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            {/* Left: Domain Specific Protocols (5 Cols) */}
            <div className="lg:col-span-5 space-y-3">
              <h3 className="text-xs font-bold text-zinc-200 uppercase tracking-wider font-mono flex items-center gap-2">
                <Zap className="w-3.5 h-3.5 text-amber-400" />
                <span>Autonomous Domain Protocols</span>
              </h3>
              <p className="text-xs text-zinc-400 leading-relaxed">
                Click any protocol to trigger simulated execution or broadcast an authoritative event into the Switch room.
              </p>

              <div className="space-y-2 pt-1">
                {selectedAgent.activeProtocols?.map((protocol) => {
                  const isFired = triggeredProtocols.includes(`${selectedAgent.name}-${protocol}`);

                  return (
                    <div
                      key={protocol}
                      className="p-3.5 rounded-xl bg-zinc-950/80 border border-zinc-800 hover:border-zinc-700/80 transition-all flex items-center justify-between gap-3"
                    >
                      <div>
                        <div className="text-xs font-mono font-bold text-zinc-200">{protocol}</div>
                        <div className="text-[11px] text-zinc-500 mt-0.5">
                          Autonomous compliance and SLA enforcement trigger
                        </div>
                      </div>

                      <button
                        onClick={() => handleProtocolClick(selectedAgent.name, protocol, selectedAgent.department)}
                        disabled={isFired}
                        className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-all flex items-center gap-1.5 cursor-pointer shrink-0 ${
                          isFired
                            ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                            : 'bg-amber-400 hover:bg-amber-300 text-zinc-950'
                        }`}
                      >
                        {isFired ? (
                          <>
                            <CheckCircle2 className="w-3.5 h-3.5" />
                            <span>Broadcasted</span>
                          </>
                        ) : (
                          <>
                            <Play className="w-3 h-3 fill-current" />
                            <span>Trigger</span>
                          </>
                        )}
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Right: Active Tasks for this Agent (7 Cols) */}
            <div className="lg:col-span-7 space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-bold text-zinc-200 uppercase tracking-wider font-mono flex items-center gap-2">
                  <Activity className="w-3.5 h-3.5 text-amber-400" />
                  <span>Assigned Operational Cases ({activeTasksForSelected.length})</span>
                </h3>
                <button
                  onClick={() => onNavigateTab('tasks')}
                  className="text-xs text-amber-400 hover:text-amber-300 font-medium"
                >
                  View in Task Center →
                </button>
              </div>

              <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
                {activeTasksForSelected.length === 0 ? (
                  <div className="p-8 text-center bg-zinc-950/60 border border-zinc-800/80 rounded-xl text-zinc-500 text-xs">
                    No active tasks currently assigned to {selectedAgent.name}.
                  </div>
                ) : (
                  activeTasksForSelected.map((t) => (
                    <div
                      key={t.id}
                      className="p-3 rounded-xl bg-zinc-950 border border-zinc-800 hover:border-zinc-700/80 transition-all flex items-center justify-between gap-3"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="font-mono text-xs font-bold text-amber-400 bg-amber-500/10 px-1.5 py-0.2 rounded border border-amber-500/20">
                            Suite {t.room}
                          </span>
                          <span className="font-mono text-[10px] text-zinc-500">{t.caseRef}</span>
                          <span className="text-[10px] font-mono uppercase text-zinc-400">{t.priority}</span>
                        </div>
                        <div className="text-xs font-medium text-zinc-200 truncate">{t.title}</div>
                      </div>

                      <div className="text-right shrink-0">
                        <span className="text-[11px] font-mono text-zinc-400 block">{t.status}</span>
                        <span className="text-[10px] text-zinc-500 font-mono">{t.estimatedMinutes}m target</span>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
