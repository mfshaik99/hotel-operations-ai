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
  const [webhookUrl, setWebhookUrl] = useState(switchConfig.roomWebhookUrl || '');
  const [roomId, setRoomId] = useState(switchConfig.roomId || 'hotel-operations-room');
  const [channelTarget, setChannelTarget] = useState(switchConfig.channelTarget || '#hotel-ops-central');
  const [apiKey, setApiKey] = useState(switchConfig.apiKey || '');
  const [autoRelay, setAutoRelay] = useState(switchConfig.autoRelayTasks ?? true);

  const [isSaving, setIsSaving] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string; timestamp?: string } | null>(null);
  const [dbStats, setDbStats] = useState<any>(null);

  // Sync inputs if switchConfig changes externally
  useEffect(() => {
    setWebhookUrl(switchConfig.roomWebhookUrl || '');
    setRoomId(switchConfig.roomId || 'hotel-operations-room');
    setChannelTarget(switchConfig.channelTarget || '#hotel-ops-central');
    setApiKey(switchConfig.apiKey || '');
    setAutoRelay(switchConfig.autoRelayTasks ?? true);
  }, [switchConfig]);

  // Fetch DB & health stats
  useEffect(() => {
    fetch('/api/health')
      .then((r) => r.json())
      .then((data) => setDbStats(data))
      .catch(() => {});
  }, []);

  const handleSaveConfig = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    setTestResult(null);

    try {
      const res = await fetch('/api/switch/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          roomWebhookUrl: webhookUrl.trim(),
          roomId: roomId.trim(),
          channelTarget: channelTarget.trim(),
          apiKey: apiKey.trim(),
          autoRelayTasks: autoRelay,
        }),
      });
      const data = await res.json();
      if (data.success) {
        await onRefreshConfig();
        showToast('Switch configuration saved to server');
      } else {
        showToast(data.error || 'Failed to save configuration');
      }
    } catch (err: any) {
      showToast(err?.message || 'Error saving configuration');
    } finally {
      setIsSaving(false);
    }
  };

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
          message: 'Real HTTP test ping delivered to Switch room successfully (HTTP 200).',
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
        message: err?.message || 'Network exception connecting to Switch webhook',
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
            <span className="text-xs text-zinc-500 font-mono">SandboxAQ Switch Protocol</span>
          </div>
          <h1 className="text-xl font-bold text-zinc-100 tracking-tight">
            Settings & Genuine Integrations
          </h1>
          <p className="text-xs text-zinc-400 mt-1 max-w-2xl leading-relaxed">
            Manage genuine API credentials, configure the SandboxAQ Switch multi-agent collaboration room webhook, and inspect the durable JSON persistence engine.
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
                  Switch Room Protocol Configuration
                </h2>
              </div>

              {/* Honest Connection Status Pill */}
              <div className="flex items-center gap-2">
                <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-mono font-semibold ${
                  switchConfig.status === 'CONNECTED'
                    ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30'
                    : switchConfig.status === 'DISCONNECTED'
                    ? 'bg-rose-500/10 text-rose-400 border border-rose-500/30'
                    : 'bg-zinc-800 text-amber-400/90 border border-zinc-700'
                }`}>
                  <span className={`w-2 h-2 rounded-full ${
                    switchConfig.status === 'CONNECTED'
                      ? 'bg-emerald-400 animate-pulse'
                      : switchConfig.status === 'DISCONNECTED'
                      ? 'bg-rose-400'
                      : 'bg-amber-400'
                  }`} />
                  <span>
                    {switchConfig.status === 'CONNECTED'
                      ? 'CONNECTED (Verified)'
                      : switchConfig.status === 'DISCONNECTED'
                      ? 'DISCONNECTED'
                      : 'NOT CONFIG (Standby)'}
                  </span>
                </span>
              </div>
            </div>

            <div className="p-3.5 rounded-xl bg-zinc-950/70 border border-zinc-800/80 text-xs text-zinc-400 leading-relaxed">
              <strong className="text-zinc-200">Engineering Protocol Notice: </strong>
              SandboxAQ's Switch enables autonomous agents and human teams to communicate in shared rooms. When a valid webhook URL is provided, events are delivered via real HTTP POST envelopes. When unconfigured, the application runs on internal local mesh and never fakes connection.
            </div>

            <form onSubmit={handleSaveConfig} className="space-y-4">
              <div>
                <label className="text-xs font-semibold text-zinc-300 block mb-1.5 flex items-center justify-between">
                  <span>Switch Room Webhook URL</span>
                  <span className="text-[10px] text-zinc-500 font-mono">e.g. https://switch.example.com/rooms/hotel-ops/webhook</span>
                </label>
                <input
                  type="text"
                  value={webhookUrl}
                  onChange={(e) => setWebhookUrl(e.target.value)}
                  placeholder="https://switch.your-domain.com/v1/rooms/hotel-ops/events"
                  className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-3.5 py-2.5 text-xs text-zinc-100 placeholder-zinc-600 focus:outline-none focus:border-amber-400 font-mono"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold text-zinc-300 block mb-1.5">
                    Room Identifier
                  </label>
                  <input
                    type="text"
                    value={roomId}
                    onChange={(e) => setRoomId(e.target.value)}
                    placeholder="hotel-operations-room"
                    className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2 text-xs text-zinc-100 placeholder-zinc-600 focus:outline-none focus:border-amber-400 font-mono"
                  />
                </div>

                <div>
                  <label className="text-xs font-semibold text-zinc-300 block mb-1.5">
                    Target Channel
                  </label>
                  <input
                    type="text"
                    value={channelTarget}
                    onChange={(e) => setChannelTarget(e.target.value)}
                    placeholder="#hotel-ops-central"
                    className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2 text-xs text-zinc-100 placeholder-zinc-600 focus:outline-none focus:border-amber-400 font-mono"
                  />
                </div>
              </div>

              <div>
                <label className="text-xs font-semibold text-zinc-300 block mb-1.5 flex items-center justify-between">
                  <span>Bearer Authorization Token (Optional)</span>
                  <span className="text-[10px] text-zinc-500 font-mono">Encrypted on server</span>
                </label>
                <input
                  type="password"
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  placeholder="Paste Switch Room bearer token or leave blank"
                  className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-3.5 py-2 text-xs text-zinc-100 placeholder-zinc-600 focus:outline-none focus:border-amber-400 font-mono"
                />
              </div>

              <div className="flex items-center gap-2 pt-1">
                <input
                  type="checkbox"
                  id="autoRelay"
                  checked={autoRelay}
                  onChange={(e) => setAutoRelay(e.target.checked)}
                  className="rounded bg-zinc-950 border-zinc-800 text-amber-400 focus:ring-0 cursor-pointer"
                />
                <label htmlFor="autoRelay" className="text-xs text-zinc-300 cursor-pointer">
                  Auto-relay newly decomposed tasks into Switch room channel
                </label>
              </div>

              <div className="pt-2 flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
                <button
                  type="submit"
                  disabled={isSaving}
                  className="px-4 py-2.5 text-xs font-semibold text-zinc-950 bg-amber-400 hover:bg-amber-300 disabled:opacity-50 rounded-xl shadow-xs transition-colors cursor-pointer"
                >
                  {isSaving ? 'Saving...' : 'Save Switch Settings'}
                </button>

                <button
                  type="button"
                  onClick={handleTestSwitch}
                  disabled={isTesting || !webhookUrl.trim()}
                  className="px-4 py-2.5 text-xs font-semibold text-zinc-200 bg-zinc-800 hover:bg-zinc-750 disabled:opacity-40 border border-zinc-700/80 rounded-xl transition-colors cursor-pointer flex items-center justify-center gap-2"
                >
                  {isTesting ? (
                    <>
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                      <span>Sending HTTP Probe...</span>
                    </>
                  ) : (
                    <>
                      <Send className="w-3.5 h-3.5 text-amber-400" />
                      <span>Send Switch Probe Ping</span>
                    </>
                  )}
                </button>
              </div>
            </form>

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
