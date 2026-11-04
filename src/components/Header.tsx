import React from 'react';
import { Sparkles, Radio, Bell, Plus, ShieldCheck } from 'lucide-react';

interface HeaderProps {
  activeTab: 'command' | 'switch' | 'departments' | 'radar' | 'analytics';
  setActiveTab: (tab: 'command' | 'switch' | 'departments' | 'radar' | 'analytics') => void;
  onOpenIntake: () => void;
  openTaskCount: number;
  alertCount: number;
  hasApiKey: boolean;
}

export const Header: React.FC<HeaderProps> = ({
  activeTab,
  setActiveTab,
  onOpenIntake,
  openTaskCount,
  alertCount,
  hasApiKey,
}) => {
  return (
    <header className="sticky top-0 z-30 border-b border-slate-800 bg-slate-950/95 backdrop-blur-md px-6 py-3.5">
      <div className="flex items-center justify-between gap-8 max-w-[1600px] mx-auto">
        {/* Zone 1: Single text element wordmark */}
        <div className="flex items-center gap-3 shrink-0">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-amber-500/20 to-amber-700/30 border border-amber-500/30 flex items-center justify-center text-amber-400 font-bold tracking-wider text-sm shadow-inner">
            L
          </div>
          <div>
            <div className="text-base font-bold tracking-tight text-slate-100 flex items-center gap-2">
              <span>LUMINARY OPERATIONS</span>
              <span className="text-[10px] font-mono tracking-wider px-1.5 py-0.5 rounded bg-slate-800 text-amber-400/90 border border-slate-700/60 uppercase">
                AI Orchestrator
              </span>
            </div>
            <div className="text-[11px] text-slate-400 font-medium">
              Autonomous Central Hotel Coordination & Switch Room
            </div>
          </div>
        </div>

        {/* Zone 2: Navigation Links */}
        <nav className="hidden md:flex items-center gap-1 bg-slate-900/80 p-1 rounded-xl border border-slate-800/80">
          <button
            onClick={() => setActiveTab('command')}
            className={`px-3.5 py-1.5 text-xs font-medium rounded-lg transition-all duration-150 whitespace-nowrap ${
              activeTab === 'command'
                ? 'bg-amber-500/15 text-amber-300 border border-amber-500/30 shadow-sm'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
            }`}
          >
            Operations Command
            {openTaskCount > 0 && (
              <span className="ml-1.5 font-mono text-[11px] px-1.5 py-0.2 rounded bg-slate-800 text-slate-200">
                {openTaskCount}
              </span>
            )}
          </button>

          <button
            onClick={() => setActiveTab('switch')}
            className={`px-3.5 py-1.5 text-xs font-medium rounded-lg transition-all duration-150 whitespace-nowrap flex items-center gap-1.5 ${
              activeTab === 'switch'
                ? 'bg-amber-500/15 text-amber-300 border border-amber-500/30 shadow-sm'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
            }`}
          >
            <Radio className="w-3.5 h-3.5 text-amber-400" />
            Switch Ops Room
          </button>

          <button
            onClick={() => setActiveTab('departments')}
            className={`px-3.5 py-1.5 text-xs font-medium rounded-lg transition-all duration-150 whitespace-nowrap ${
              activeTab === 'departments'
                ? 'bg-amber-500/15 text-amber-300 border border-amber-500/30 shadow-sm'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
            }`}
          >
            Departmental Hub
          </button>

          <button
            onClick={() => setActiveTab('radar')}
            className={`px-3.5 py-1.5 text-xs font-medium rounded-lg transition-all duration-150 whitespace-nowrap flex items-center gap-1.5 ${
              activeTab === 'radar'
                ? 'bg-amber-500/15 text-amber-300 border border-amber-500/30 shadow-sm'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
            }`}
          >
            Risk Radar
            {alertCount > 0 && (
              <span className="font-mono text-[10px] px-1.5 py-0.2 rounded bg-rose-500/20 text-rose-300 border border-rose-500/30">
                {alertCount}
              </span>
            )}
          </button>

          <button
            onClick={() => setActiveTab('analytics')}
            className={`px-3.5 py-1.5 text-xs font-medium rounded-lg transition-all duration-150 whitespace-nowrap ${
              activeTab === 'analytics'
                ? 'bg-amber-500/15 text-amber-300 border border-amber-500/30 shadow-sm'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
            }`}
          >
            Executive Intelligence
          </button>
        </nav>

        {/* Zone 3: Primary Action & Status */}
        <div className="flex items-center gap-3 shrink-0">
          <div className="hidden lg:flex items-center gap-2 text-xs text-slate-400 font-mono">
            <span className="inline-block w-2 h-2 rounded-full bg-emerald-400" />
            <span>SWITCH ACTIVE</span>
            <span className="text-slate-600">·</span>
            <span className="text-slate-300">GMT+0 18:42</span>
          </div>

          <button
            onClick={onOpenIntake}
            className="flex items-center gap-2 px-3.5 py-2 text-xs font-semibold text-slate-950 bg-gradient-to-r from-amber-400 to-amber-500 hover:from-amber-300 hover:to-amber-400 rounded-lg shadow-md transition-all active:scale-[0.98] whitespace-nowrap cursor-pointer"
          >
            <Sparkles className="w-3.5 h-3.5 text-slate-950" />
            <span>Intelligent Intake</span>
          </button>
        </div>
      </div>
    </header>
  );
};
