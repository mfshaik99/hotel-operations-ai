import React, { useState } from 'react';
import { Sparkles, Radio, ShieldCheck, ChevronDown, CheckCircle2, Info, Layers } from 'lucide-react';
import { SwitchConnectionState } from '../types';

interface HeaderProps {
  activeTab: 'command' | 'switch' | 'departments' | 'radar' | 'analytics';
  setActiveTab: (tab: 'command' | 'switch' | 'departments' | 'radar' | 'analytics') => void;
  onOpenIntake: () => void;
  openTaskCount: number;
  alertCount: number;
  hasApiKey: boolean;
  switchState: SwitchConnectionState;
}

export const Header: React.FC<HeaderProps> = ({
  activeTab,
  setActiveTab,
  onOpenIntake,
  openTaskCount,
  alertCount,
  hasApiKey,
  switchState,
}) => {
  const [showSwitchDetails, setShowSwitchDetails] = useState(false);

  return (
    <header className="sticky top-0 z-30 border-b border-zinc-800/80 bg-zinc-950/90 backdrop-blur-md px-6 py-3">
      <div className="flex items-center justify-between gap-6 max-w-[1600px] mx-auto">
        {/* Zone 1: Brand Wordmark & Property Identity */}
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
            <div className="text-[11px] text-zinc-400 font-normal">
              Autonomous Hotel Operations & Multi-Agent Mesh
            </div>
          </div>
        </div>

        {/* Zone 2: Navigation Links */}
        <nav className="hidden md:flex items-center gap-1 bg-zinc-900/90 p-1 rounded-xl border border-zinc-800/80 shadow-xs">
          <button
            onClick={() => setActiveTab('command')}
            className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-all duration-150 whitespace-nowrap flex items-center gap-1.5 cursor-pointer ${
              activeTab === 'command'
                ? 'bg-zinc-800 text-amber-300 font-semibold shadow-xs border border-zinc-700/60'
                : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/50'
            }`}
          >
            <span>Operations Command</span>
            {openTaskCount > 0 && (
              <span className="font-mono text-[10px] px-1.5 py-0.2 rounded bg-zinc-900 text-zinc-300 border border-zinc-750">
                {openTaskCount}
              </span>
            )}
          </button>

          <button
            onClick={() => setActiveTab('switch')}
            className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-all duration-150 whitespace-nowrap flex items-center gap-1.5 cursor-pointer ${
              activeTab === 'switch'
                ? 'bg-zinc-800 text-amber-300 font-semibold shadow-xs border border-zinc-700/60'
                : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/50'
            }`}
          >
            <Radio className="w-3.5 h-3.5 text-amber-400" />
            <span>Switch Ops Room</span>
          </button>

          <button
            onClick={() => setActiveTab('departments')}
            className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-all duration-150 whitespace-nowrap cursor-pointer ${
              activeTab === 'departments'
                ? 'bg-zinc-800 text-amber-300 font-semibold shadow-xs border border-zinc-700/60'
                : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/50'
            }`}
          >
            Departmental Hub
          </button>

          <button
            onClick={() => setActiveTab('radar')}
            className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-all duration-150 whitespace-nowrap flex items-center gap-1.5 cursor-pointer ${
              activeTab === 'radar'
                ? 'bg-zinc-800 text-amber-300 font-semibold shadow-xs border border-zinc-700/60'
                : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/50'
            }`}
          >
            <span>Risk Radar</span>
            {alertCount > 0 && (
              <span className="font-mono text-[10px] px-1.5 py-0.2 rounded bg-rose-500/15 text-rose-300 border border-rose-500/25">
                {alertCount}
              </span>
            )}
          </button>

          <button
            onClick={() => setActiveTab('analytics')}
            className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-all duration-150 whitespace-nowrap cursor-pointer ${
              activeTab === 'analytics'
                ? 'bg-zinc-800 text-amber-300 font-semibold shadow-xs border border-zinc-700/60'
                : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/50'
            }`}
          >
            Management Intelligence
          </button>
        </nav>

        {/* Zone 3: Switch Integration Status & Primary Action */}
        <div className="flex items-center gap-3 shrink-0">
          {/* Switch Protocol Readiness Pill */}
          <div className="relative">
            <button
              onClick={() => setShowSwitchDetails(!showSwitchDetails)}
              className="hidden lg:flex items-center gap-2 px-2.5 py-1 text-[11px] rounded-lg bg-zinc-900 border border-zinc-800 text-zinc-300 hover:border-zinc-700 transition-colors font-mono cursor-pointer"
            >
              <span className="w-2 h-2 rounded-full bg-emerald-400" />
              <span>Switch: Standby (Local Mesh)</span>
              <ChevronDown className="w-3 h-3 text-zinc-500" />
            </button>

            {/* Switch Protocol Popover */}
            {showSwitchDetails && (
              <div className="absolute right-0 top-9 w-80 p-4 bg-zinc-900 border border-zinc-800 rounded-xl shadow-xl z-50 text-xs text-zinc-300 space-y-2">
                <div className="flex items-center justify-between pb-2 border-b border-zinc-800">
                  <span className="font-semibold text-zinc-100 flex items-center gap-1.5 font-mono">
                    <Radio className="w-3.5 h-3.5 text-amber-400" />
                    Switch Protocol v1.4
                  </span>
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-mono">
                    Ready
                  </span>
                </div>
                <p className="text-[11px] text-zinc-400 leading-relaxed">
                  Local multi-agent event bus active. External Switch production webhook integration is structured and ready for credential attachment. Zero simulated spoofing.
                </p>
                <div className="pt-1 text-[10px] font-mono text-zinc-500 space-y-0.5">
                  <div>Bus Endpoint: {switchState.busEndpoint}</div>
                  <div>Processed Events: {switchState.totalEventsProcessed}</div>
                  <div>Live Agents: 5/5 Synchronized</div>
                </div>
              </div>
            )}
          </div>

          {/* Primary Action Button */}
          <button
            onClick={onOpenIntake}
            className="flex items-center gap-2 px-3.5 py-2 text-xs font-semibold text-zinc-950 bg-amber-400 hover:bg-amber-300 active:scale-[0.98] rounded-lg shadow-sm transition-all whitespace-nowrap cursor-pointer"
          >
            <Sparkles className="w-3.5 h-3.5 text-zinc-950" />
            <span>Intelligent Intake</span>
          </button>
        </div>
      </div>
    </header>
  );
};
