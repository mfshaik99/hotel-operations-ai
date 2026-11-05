import React, { useState, useEffect } from 'react';
import {
  Settings,
  Radio,
  Sparkles,
  Database,
  CheckCircle2,
  AlertTriangle,
  RefreshCw,
  ExternalLink,
  ShieldCheck,
  Send,
  Trash2,
  Key,
  Globe,
  Sliders,
} from 'lucide-react';
import { SwitchConfig } from '../types';

interface SettingsViewProps {
  switchConfig: SwitchConfig;
  hasApiKey: boolean;
  onRefreshConfig: () => Promise<void>;
  onResetDatabase: () => Promise<void>;
  showToast: (msg: string) => void;
}

export const SettingsView: React.FC<SettingsViewProps> = ({
  switchConfig,
  hasApiKey,
  onRefreshConfig,
  onResetDatabase,
  showToast,
}) => {
  const [isTesting, setIsTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string; timestamp?: string } | null>(null);
  const [dbStats, setDbStats] = useState<any>(null);

  // Fetch DB & health stats
  useEffect(() => {
    fetch('/api/health')
      .then((r) => r.json())
      .then((data) => setDbStats(data))
      .catch(() => {});
  }, []);

  const handleTestSwitch = async () => {
    setIsTesting(true);
    setTestResult(null);

    try {
      const res = await fetch('/api/switch/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      const data = await res.json();
      if (data.success) {
        setTestResult({
          success: true,
          message: 'Authenticated with the Switch Agent API and delivered a test message to the selected room.',
          timestamp: new Date().toLocaleTimeString(),
        });
        await onRefreshConfig();
        showToast('Switch connection verified!');
      } else {
        setTestResult({
          success: false,
          message: data.error || 'Switch endpoint failed or was unreachable',
          timestamp: new Date().toLocaleTimeString(),
        });
        await onRefreshConfig();
        showToast('Switch connection failed');
      }
    } catch (err: any) {
      setTestResult({
        success: false,
        message: err?.message || 'Network exception connecting to the Switch Agent Bridge',
        timestamp: new Date().toLocaleTimeString(),
      });
    } finally {
      setIsTesting(false);
    }
  };

  const handleResetDbClick = async () => {
    if (confirm('Are you sure you want to restore the database to its clean seed state? This resets all active tasks and historical messages.')) {
      await onResetDatabase();
      const hRes = await fetch('/api/health');
      const hData = await hRes.json();
      setDbStats(hData);
      showToast('Database reset to clean demonstration seed');
    }
  };

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1.5">
            <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[11px] font-mono font-semibold bg-amber-500/10 text-amber-300 border border-amber-500/30">
              <Settings className="w-3.5 h-3.5" />
              INTEGRATION GATEWAY & PLATFORM SETTINGS
            </span>
            <span className="text-xs text-zinc-500 font-mono">HTTP + SSE Agent Protocol</span>
          </div>
          <h1 className="text-xl font-bold text-zinc-100 tracking-tight">
            Settings & Genuine Integrations
          </h1>
          <p className="text-xs text-zinc-400 mt-1 max-w-2xl leading-relaxed">
            Configure a real SandboxAQ Switch agent connection using its bridge URL, agent ID, API key, and room ID.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Side (7 Cols): Switch Room Configuration */}
        <div className="lg:col-span-7 space-y-4">
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 shadow-xs space-y-5">
            <div className="flex items-center justify-between pb-3 border-b border-zinc-800">
              <div className="flex items-center gap-2.5">
                <Radio className="w-4 h-4 text-amber-400" />
                <h2 className="text-sm font-bold text-zinc-100">
                  Switch Agent Protocol Configuration
                </h2>
              </div>

              {/* Honest Connection Status Pill */}
              <div className="flex items-center gap-2">
                <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-mono font-semibold ${
                  switchConfig.status === 'CONNECTED'
                    ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30'
                    : switchConfig.status === 'UNVERIFIED_GENERIC_WEBHOOK'
                    ? 'bg-amber-500/10 text-amber-300 border border-amber-500/30'
                    : switchConfig.status === 'DISCONNECTED'
                    ? 'bg-rose-500/10 text-rose-400 border border-rose-500/30'
                    : 'bg-zinc-800 text-zinc-400 border border-zinc-700'
                }`}>
                  <span className={`w-2 h-2 rounded-full ${
                    switchConfig.status === 'CONNECTED'
                      ? 'bg-emerald-400 animate-pulse'
                      : switchConfig.status === 'UNVERIFIED_GENERIC_WEBHOOK'
                      ? 'bg-amber-400'
                      : switchConfig.status === 'DISCONNECTED'
                      ? 'bg-rose-400'
                      : 'bg-zinc-400'
                  }`} />
                  <span>
                    {switchConfig.status === 'CONNECTED'
                      ? 'CONNECTED (Agent API + room stream)'
                      : switchConfig.status === 'UNVERIFIED_GENERIC_WEBHOOK'
                      ? 'UNVERIFIED GENERIC WEBHOOK'
                      : switchConfig.status === 'DISCONNECTED'
                      ? 'DISCONNECTED'
                      : 'NOT CONFIGURED (Standby)'}
                  </span>
                </span>
              </div>
            </div>

            <div className="p-3.5 rounded-xl bg-zinc-950/70 border border-zinc-800/80 text-xs text-zinc-400 leading-relaxed">
              <strong className="text-zinc-200">Engineering Protocol Notice: </strong>
              This integration uses the official Switch Agent Protocol: authenticated HTTP requests send messages and a server-sent event (SSE) stream receives room messages. A generic webhook URL is not a Switch connection.
            </div>

            <div className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="rounded-xl bg-zinc-950 border border-zinc-800 p-3">
                  <div className="text-[10px] text-zinc-500 mb-1">Agent Bridge Base URL</div>
                  <div className="text-xs text-zinc-200 font-mono break-all">{switchConfig.agentBaseUrl || 'Not configured'}</div>
                </div>
                <div className="rounded-xl bg-zinc-950 border border-zinc-800 p-3">
                  <div className="text-[10px] text-zinc-500 mb-1">Switch Agent ID</div>
                  <div className="text-xs text-zinc-200 font-mono break-all">{switchConfig.agentId || 'Not configured'}</div>
                </div>
                <div className="rounded-xl bg-zinc-950 border border-zinc-800 p-3">
                  <div className="text-[10px] text-zinc-500 mb-1">Room ID</div>
                  <div className="text-xs text-zinc-200 font-mono break-all">{switchConfig.roomId || 'Not configured'}</div>
                </div>
                <div className="rounded-xl bg-zinc-950 border border-zinc-800 p-3">
                  <div className="text-[10px] text-zinc-500 mb-1">Agent API Key</div>
                  <div className="text-xs text-zinc-200 font-mono">{switchConfig.apiKey ? 'Configured · hidden' : 'Not configured'}</div>
                </div>
              </div>
              <p className="text-[11px] text-zinc-500 leading-relaxed">
                Connection settings are read from server environment variables. Add the four SWITCH_* values from .env.example to your deployment secrets; credentials are not editable through this public settings endpoint.
              </p>
              <div className="flex items-center gap-2">
                <span className="text-xs text-zinc-400">Automatic task relay:</span>
                <span className="text-xs font-mono text-zinc-200">{switchConfig.autoRelayTasks ? 'Enabled' : 'Disabled'}</span>
              </div>
              <div className="pt-2">
                <button
                  type="button"
                  onClick={handleTestSwitch}
                  disabled={isTesting || !switchConfig.agentBaseUrl || !switchConfig.agentId || !switchConfig.roomId || !switchConfig.apiKey}
                  className="px-4 py-2.5 text-xs font-semibold text-zinc-200 bg-zinc-800 hover:bg-zinc-750 disabled:opacity-40 border border-zinc-700/80 rounded-xl transition-colors cursor-pointer flex items-center justify-center gap-2"
                >
                  {isTesting ? (
                    <>
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                      <span>Testing agent connection...</span>
                    </>
                  ) : (
                    <>
                      <Send className="w-3.5 h-3.5 text-amber-400" />
                      <span>Send Switch Test Message</span>
                    </>
                  )}
                </button>
              </div>
            </div>

            {/* Test Connection Result Box */}
            {testResult && (
              <div className={`p-4 rounded-xl border text-xs space-y-1 ${
                testResult.success
                  ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
                  : 'bg-rose-500/10 border-rose-500/30 text-rose-300'
              }`}>
                <div className="font-bold flex items-center gap-1.5">
                  {testResult.success ? <CheckCircle2 className="w-4 h-4" /> : <AlertTriangle className="w-4 h-4" />}
                  <span>{testResult.success ? 'Switch Test Succeeded' : 'Switch Connection Failed'}</span>
                </div>
                <p className="text-[11px] opacity-90">{testResult.message}</p>
                {testResult.timestamp && (
                  <span className="text-[10px] font-mono opacity-75 block">
                    Probe dispatched at {testResult.timestamp}
                  </span>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Right Side (5 Cols): Gemini AI Status & Durable Persistence */}
        <div className="lg:col-span-5 space-y-4">
          {/* Gemini AI Status Card */}
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5 shadow-xs space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-zinc-800">
              <div className="flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-amber-400" />
                <h3 className="text-xs font-bold text-zinc-100 uppercase tracking-wider font-mono">
                  Gemini Operations Engine
                </h3>
              </div>
              <span className={`text-[10px] font-mono px-2 py-0.5 rounded font-semibold ${
                hasApiKey
                  ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                  : 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
              }`}>
                {hasApiKey ? 'KEY ACTIVE' : 'HEURISTIC ACTIVE'}
              </span>
            </div>

            <div className="text-xs text-zinc-400 space-y-2">
              <p>
                The intelligence engine uses the modern <code className="text-amber-300 font-mono">@google/genai</code> SDK with a 3-second timeout protection and deterministic luxury hotel heuristics fallback.
              </p>
              <div className="p-3 rounded-xl bg-zinc-950 border border-zinc-800 space-y-1.5 font-mono text-[11px]">
                <div className="flex justify-between text-zinc-500">
                  <span>Model Alias:</span>
                  <span className="text-zinc-200">gemini-2.5-flash</span>
                </div>
                <div className="flex justify-between text-zinc-500">
                  <span>User-Agent Header:</span>
                  <span className="text-emerald-400">aistudio-build</span>
                </div>
                <div className="flex justify-between text-zinc-500">
                  <span>Room Safeguard:</span>
                  <span className="text-amber-400">Enforced (No Hallucination)</span>
                </div>
              </div>
            </div>
          </div>

          {/* Database Persistence Engine Card */}
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5 shadow-xs space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-zinc-800">
              <div className="flex items-center gap-2">
                <Database className="w-4 h-4 text-amber-400" />
                <h3 className="text-xs font-bold text-zinc-100 uppercase tracking-wider font-mono">
                  Durable File Persistence
                </h3>
              </div>
              <span className="text-[10px] font-mono text-zinc-400 px-2 py-0.5 rounded bg-zinc-800 border border-zinc-700">
                JSON DB
              </span>
            </div>

            <div className="text-xs text-zinc-400 space-y-3">
              <p>
                State is persisted to the server file system, preventing data loss on browser refresh:
              </p>
              <div className="p-3 rounded-xl bg-zinc-950 border border-zinc-800 space-y-1.5 font-mono text-[11px]">
                <div className="text-zinc-500 truncate">
                  Path: <span className="text-zinc-300">/data/hotel_operations_db.json</span>
                </div>
                <div className="flex justify-between text-zinc-500">
                  <span>Live Tasks in DB:</span>
                  <span className="text-zinc-200">{dbStats?.storage?.taskCount ?? '—'}</span>
                </div>
                <div className="flex justify-between text-zinc-500">
                  <span>Switch Messages:</span>
                  <span className="text-zinc-200">{dbStats?.storage?.messageCount ?? '—'}</span>
                </div>
              </div>

              <div className="pt-2">
                <button
                  type="button"
                  onClick={handleResetDbClick}
                  className="w-full py-2.5 px-3 text-xs font-semibold text-rose-400 bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/30 rounded-xl transition-colors flex items-center justify-center gap-2 cursor-pointer"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>Reset Demo Database to Pristine Seed</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
