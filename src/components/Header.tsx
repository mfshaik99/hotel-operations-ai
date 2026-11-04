import React, { useState } from 'react';
import {
  Sparkles,
  Radio,
  ShieldCheck,
  ChevronDown,
  CheckCircle2,
  AlertCircle,
  Settings,
  Layers,
  BarChart3,
  Users,
  Inbox,
  ClipboardList,
  Home,
  MessageSquare,
} from 'lucide-react';
import { SwitchConfig, NavTab } from '../types';

interface HeaderProps {
  activeTab: NavTab;
  setActiveTab: (tab: NavTab) => void;
  onOpenIntake: () => void;
  openTaskCount: number;
  alertCount: number;
  hasApiKey: boolean;
  switchConfig: SwitchConfig;
}

export const Header: React.FC<HeaderProps> = ({
  activeTab,
  setActiveTab,
  onOpenIntake,
  openTaskCount,
  alertCount,
  hasApiKey,
  switchConfig,
}) => {
  const [showSwitchDetails, setShowSwitchDetails] = useState(false);

  const getSwitchStatusBadge = () => {
    switch (switchConfig.status) {
      case 'CONNECTED':
        return (
          <span className="flex items-center gap-1.5 text-emerald-400">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            <span>Switch: Connected</span>
          </span>
        );
      case 'DISCONNECTED':
        return (
          <span className="flex items-center gap-1.5 text-rose-400">
            <span className="w-2 h-2 rounded-full bg-rose-400" />
            <span>Switch: Disconnected</span>
          </span>
        );
      default:
        return (
          <span className="flex items-center gap-1.5 text-amber-400/90">
            <span className="w-2 h-2 rounded-full bg-amber-400" />
            <span>Switch: Standby (Local Mesh)</span>
          </span>
        );
    }
  };

  return (
    <header className="sticky top-0 z-40 border-b border-zinc-800/80 bg-zinc-950/90 backdrop-blur-md px-4 sm:px-6 py-2.5">
      <div className="flex items-center justify-between gap-4 max-w-[1680px] mx-auto">
        {/* Zone 1: Wordmark & Property Identity */}
        <div className="flex items-center gap-3 shrink-0">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-amber-500/20 via-amber-600/10 to-transparent border border-amber-500/30 flex items-center justify-center text-amber-400 font-bold tracking-wider text-xs shadow-xs">
            LO
          </div>
          <div>
            <div className="text-sm font-semibold tracking-tight text-zinc-100 flex items-center gap-2">
              <span>LUMINARY OPERATIONS</span>
              <span className="text-[10px] font-mono tracking-wider px-1.5 py-0.2 rounded bg-zinc-900 text-amber-400/90 border border-zinc-800 uppercase font-medium">
                Business AI
              </span>
            </div>
            <div className="text-[11px] text-zinc-400 font-normal hidden sm:block">
              One Hotel · One Shared Intelligence · Multiple AI Teammates
            </div>
          </div>
        </div>

        {/* Zone 2: Navigation Links (7 Required Sections) */}
        <nav className="hidden xl:flex items-center gap-0.5 bg-zinc-900/90 p-1 rounded-xl border border-zinc-800/80 shadow-xs">
          <button
            onClick={() => setActiveTab('overview')}
            className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-all whitespace-nowrap flex items-center gap-1.5 cursor-pointer ${
              activeTab === 'overview'
                ? 'bg-zinc-800 text-amber-300 font-semibold shadow-xs border border-zinc-700/60'
                : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/50'
            }`}
          >
            <Home className="w-3.5 h-3.5" />
            <span>Overview</span>
          </button>

          <button
            onClick={() => setActiveTab('requests')}
            className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-all whitespace-nowrap flex items-center gap-1.5 cursor-pointer ${
              activeTab === 'requests'
                ? 'bg-zinc-800 text-amber-300 font-semibold shadow-xs border border-zinc-700/60'
                : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/50'
            }`}
          >
            <Inbox className="w-3.5 h-3.5" />
            <span>Guest Requests</span>
          </button>

          <button
            onClick={() => setActiveTab('tasks')}
            className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-all whitespace-nowrap flex items-center gap-1.5 cursor-pointer ${
              activeTab === 'tasks'
                ? 'bg-zinc-800 text-amber-300 font-semibold shadow-xs border border-zinc-700/60'
                : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/50'
            }`}
          >
            <ClipboardList className="w-3.5 h-3.5" />
            <span>Task Center</span>
            {openTaskCount > 0 && (
              <span className="font-mono text-[10px] px-1.5 py-0.2 rounded bg-zinc-950 text-zinc-300 border border-zinc-750">
                {openTaskCount}
              </span>
            )}
          </button>

          <button
            onClick={() => setActiveTab('team-chat')}
            className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-all whitespace-nowrap flex items-center gap-1.5 cursor-pointer ${
              activeTab === 'team-chat'
                ? 'bg-zinc-800 text-amber-300 font-semibold shadow-xs border border-zinc-700/60'
                : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/50'
            }`}
          >
            <MessageSquare className="w-3.5 h-3.5 text-amber-400" />
            <span>Team Chat</span>
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
          </button>

          <button
            onClick={() => setActiveTab('switch')}
            className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-all whitespace-nowrap flex items-center gap-1.5 cursor-pointer ${
              activeTab === 'switch'
                ? 'bg-zinc-800 text-amber-300 font-semibold shadow-xs border border-zinc-700/60'
                : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/50'
            }`}
          >
            <Radio className="w-3.5 h-3.5 text-amber-400" />
            <span>Switch Room</span>
          </button>

          <button
            onClick={() => setActiveTab('agents')}
            className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-all whitespace-nowrap flex items-center gap-1.5 cursor-pointer ${
              activeTab === 'agents'
                ? 'bg-zinc-800 text-amber-300 font-semibold shadow-xs border border-zinc-700/60'
                : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/50'
            }`}
          >
            <Users className="w-3.5 h-3.5" />
            <span>AI Agents</span>
          </button>

          <button
            onClick={() => setActiveTab('intelligence')}
            className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-all whitespace-nowrap flex items-center gap-1.5 cursor-pointer ${
              activeTab === 'intelligence'
                ? 'bg-zinc-800 text-amber-300 font-semibold shadow-xs border border-zinc-700/60'
                : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/50'
            }`}
          >
            <BarChart3 className="w-3.5 h-3.5" />
            <span>Intelligence</span>
            {alertCount > 0 && (
              <span className="font-mono text-[10px] px-1.5 py-0.2 rounded bg-rose-500/15 text-rose-300 border border-rose-500/25">
                {alertCount}
              </span>
            )}
          </button>

          <button
            onClick={() => setActiveTab('settings')}
            className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-all whitespace-nowrap flex items-center gap-1.5 cursor-pointer ${
              activeTab === 'settings'
                ? 'bg-zinc-800 text-amber-300 font-semibold shadow-xs border border-zinc-700/60'
                : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/50'
            }`}
          >
            <Settings className="w-3.5 h-3.5" />
            <span>Settings</span>
          </button>
        </nav>

        {/* Zone 3: Switch Honest Connection Pill & Primary Action */}
        <div className="flex items-center gap-2.5 shrink-0">
          {/* Switch Status Dropdown Trigger */}
          <div className="relative">
            <button
              onClick={() => setShowSwitchDetails(!showSwitchDetails)}
              className="flex items-center gap-2 px-2.5 py-1.5 text-[11px] rounded-lg bg-zinc-900 border border-zinc-800 text-zinc-300 hover:border-zinc-700 transition-colors font-mono cursor-pointer"
            >
              {getSwitchStatusBadge()}
              <ChevronDown className="w-3 h-3 text-zinc-500" />
            </button>

            {/* Switch Protocol Context Popover */}
            {showSwitchDetails && (
              <div className="absolute right-0 top-10 w-80 p-4 bg-zinc-900 border border-zinc-800 rounded-xl shadow-2xl z-50 text-xs text-zinc-300 space-y-2.5">
                <div className="flex items-center justify-between pb-2 border-b border-zinc-800">
                  <span className="font-semibold text-zinc-100 flex items-center gap-1.5 font-mono">
                    <Radio className="w-3.5 h-3.5 text-amber-400" />
                    Switch Integration
                  </span>
                  <span className="text-[10px] px-1.5 py-0.2 rounded bg-zinc-800 text-zinc-300 border border-zinc-700 font-mono">
                    {switchConfig.status}
                  </span>
                </div>

                <div className="space-y-1 text-[11px] text-zinc-400 leading-relaxed">
                  <div>
                    <span className="text-zinc-500">Target Channel:</span>{' '}
                    <span className="font-mono text-zinc-200">{switchConfig.channelTarget}</span>
                  </div>
                  <div>
                    <span className="text-zinc-500">Room ID:</span>{' '}
                    <span className="font-mono text-zinc-200">{switchConfig.roomId}</span>
                  </div>
                  <div>
                    <span className="text-zinc-500">Delivered Events:</span>{' '}
                    <span className="font-mono text-amber-400">{switchConfig.totalDelivered}</span>
                  </div>
                </div>

                <p className="text-[10px] text-zinc-500 border-t border-zinc-800 pt-2">
                  {switchConfig.status === 'CONNECTED'
                    ? 'Verified live HTTP connection to external Switch Room webhook.'
                    : 'Switch webhook is not actively delivering external requests. Local multi-agent event bus is handling room dispatch.'}
                </p>

                <button
                  onClick={() => {
                    setActiveTab('settings');
                    setShowSwitchDetails(false);
                  }}
                  className="w-full text-center py-1.5 text-[11px] font-semibold text-amber-400 hover:text-amber-300 bg-zinc-950 border border-zinc-800 rounded-lg transition-colors cursor-pointer"
                >
                  Configure Switch Webhook in Settings →
                </button>
              </div>
            )}
          </div>

          {/* Intelligent Intake Action */}
          <button
            onClick={onOpenIntake}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-zinc-950 bg-amber-400 hover:bg-amber-300 active:scale-[0.98] rounded-lg shadow-xs transition-all whitespace-nowrap cursor-pointer"
          >
            <Sparkles className="w-3.5 h-3.5 text-zinc-950" />
            <span className="hidden sm:inline">+ Guest Intake</span>
            <span className="sm:hidden">+ Intake</span>
          </button>
        </div>
      </div>

      {/* Mobile Sub-Navigation Bar */}
      <div className="xl:hidden flex items-center gap-1 overflow-x-auto pt-2 pb-1 text-xs">
        {[
          { id: 'overview' as NavTab, label: 'Overview' },
          { id: 'requests' as NavTab, label: 'Requests' },
          { id: 'tasks' as NavTab, label: `Tasks (${openTaskCount})` },
          { id: 'team-chat' as NavTab, label: 'Team Chat' },
          { id: 'switch' as NavTab, label: 'Switch' },
          { id: 'agents' as NavTab, label: 'Agents' },
          { id: 'intelligence' as NavTab, label: 'Intelligence' },
          { id: 'settings' as NavTab, label: 'Settings' },
        ].map((item) => (
          <button
            key={item.id}
            onClick={() => setActiveTab(item.id)}
            className={`px-2.5 py-1 rounded-md text-[11px] font-medium whitespace-nowrap cursor-pointer ${
              activeTab === item.id
                ? 'bg-zinc-800 text-amber-300 font-semibold'
                : 'text-zinc-400 hover:text-zinc-200'
            }`}
          >
            {item.label}
          </button>
        ))}
      </div>
    </header>
  );
};
