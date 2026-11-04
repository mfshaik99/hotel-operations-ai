import React, { useState } from 'react';
import {
  AlertTriangle,
  Flame,
  Activity,
  Layers,
  ArrowRight,
  ShieldCheck,
  RefreshCw,
  Clock,
  Sparkles,
} from 'lucide-react';
import { OperationalAlert, Task } from '../types';

interface RiskRadarProps {
  alerts: OperationalAlert[];
  tasks: Task[];
  onExecuteRecommendation: (alertId: string, actionText: string) => void;
  onRunScan: () => void;
}

export const RiskRadar: React.FC<RiskRadarProps> = ({
  alerts,
  tasks,
  onExecuteRecommendation,
  onRunScan,
}) => {
  const [isScanning, setIsScanning] = useState(false);

  const handleScan = () => {
    setIsScanning(true);
    setTimeout(() => {
      onRunScan();
      setIsScanning(false);
    }, 800);
  };

  const getSeverityStyle = (severity: string) => {
    switch (severity) {
      case 'Critical':
        return 'text-rose-400 bg-rose-500/10 border-rose-500/30';
      case 'High':
        return 'text-orange-400 bg-orange-500/10 border-orange-500/30';
      default:
        return 'text-amber-400 bg-amber-500/10 border-amber-500/30';
    }
  };

  const getAlertIcon = (type: string) => {
    switch (type) {
      case 'CROSS_DEPARTMENT_CLUSTER':
        return <Layers className="w-5 h-5 text-rose-400" />;
      case 'SLA_BREACH_RISK':
        return <Flame className="w-5 h-5 text-amber-400" />;
      case 'REPEATED_COMPLAINT':
        return <AlertTriangle className="w-5 h-5 text-orange-400" />;
      default:
        return <Activity className="w-5 h-5 text-sky-400" />;
    }
  };

  // Find overdue or repeated tasks
  const overdueTasks = tasks.filter((t) => t.status !== 'Resolved' && Date.now() > t.slaDeadline);
  const repeatedTasks = tasks.filter((t) => t.isRepeatedIssue);

  return (
    <div className="space-y-6">
      {/* Top Banner */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-xs font-mono font-bold text-amber-400 uppercase tracking-wider mb-1">
            <Activity className="w-4 h-4 text-amber-400" />
            <span>Proactive Operations Radar</span>
          </div>
          <h2 className="text-lg font-bold text-slate-100">
            Autonomous Vulnerability & Bottleneck Detection
          </h2>
          <p className="text-xs text-slate-400 max-w-xl">
            Never wait for the General Manager or the guest to escalate. The AI continuously correlates multi-room issues, recurring failures, and impending SLA breaches.
          </p>
        </div>

        <button
          onClick={handleScan}
          disabled={isScanning}
          className="flex items-center gap-2 px-4 py-2.5 text-xs font-semibold text-slate-950 bg-amber-400 hover:bg-amber-300 disabled:opacity-50 rounded-lg shadow transition-all cursor-pointer whitespace-nowrap self-start md:self-auto"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${isScanning ? 'animate-spin' : ''}`} />
          <span>{isScanning ? 'Scanning Property...' : 'Run Proactive Deep Scan'}</span>
        </button>
      </div>

      {/* Real-Time Risk Indicators */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
          <div className="text-[11px] font-mono text-slate-400 uppercase tracking-wider mb-1 flex items-center justify-between">
            <span>SLA Breach Threat</span>
            <Flame className="w-4 h-4 text-rose-400" />
          </div>
          <div className="text-2xl font-bold font-mono text-slate-100">
            {overdueTasks.length} <span className="text-xs font-normal text-slate-400">cases critical</span>
          </div>
          <div className="text-[11px] text-slate-400 mt-1">
            Tasks nearing or exceeding resolution SLA
          </div>
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
          <div className="text-[11px] font-mono text-slate-400 uppercase tracking-wider mb-1 flex items-center justify-between">
            <span>Recurring Complaint Pattern</span>
            <AlertTriangle className="w-4 h-4 text-orange-400" />
          </div>
          <div className="text-2xl font-bold font-mono text-slate-100">
            {repeatedTasks.length} <span className="text-xs font-normal text-slate-400">suite histories</span>
          </div>
          <div className="text-[11px] text-slate-400 mt-1">
            Same technical failure reported in same suite &lt; 72h
          </div>
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
          <div className="text-[11px] font-mono text-slate-400 uppercase tracking-wider mb-1 flex items-center justify-between">
            <span>Multi-Room Infrastructure Strain</span>
            <Layers className="w-4 h-4 text-sky-400" />
          </div>
          <div className="text-2xl font-bold font-mono text-slate-100">
            4th Floor <span className="text-xs font-normal text-slate-400">Chilled Water Riser</span>
          </div>
          <div className="text-[11px] text-slate-400 mt-1">
            3 separate suites on same hydraulic branch
          </div>
        </div>
      </div>

      {/* Alert Feed with Direct Action Triggers */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6">
        <div className="text-sm font-bold text-slate-100 mb-4 flex items-center justify-between">
          <span>Active Operational Vulnerability Alerts ({alerts.length})</span>
          <span className="text-xs font-mono text-slate-400">Live Telemetry Synchronized</span>
        </div>

        <div className="space-y-4">
          {alerts.map((alert) => (
            <div
              key={alert.id}
              className="p-4 bg-slate-950/80 border border-slate-800 rounded-xl flex flex-col md:flex-row md:items-center justify-between gap-4 hover:border-slate-700 transition-all"
            >
              <div className="flex items-start gap-3.5">
                <div className="w-10 h-10 rounded-xl bg-slate-900 border border-slate-800 flex items-center justify-center shrink-0">
                  {getAlertIcon(alert.type)}
                </div>
                <div>
                  <div className="flex items-center gap-2 flex-wrap mb-1">
                    <span
                      className={`text-[10px] font-mono font-bold px-2 py-0.5 rounded border ${getSeverityStyle(
                        alert.severity
                      )}`}
                    >
                      {alert.severity} RISK
                    </span>
                    <span className="text-xs font-mono text-slate-400 font-medium">
                      {alert.affectedRoomOrDept}
                    </span>
                    <span className="text-[11px] font-mono text-slate-500">
                      · {alert.timestamp}
                    </span>
                  </div>
                  <div className="text-sm font-semibold text-slate-100">
                    {alert.title}
                  </div>
                  <p className="text-xs text-slate-400 mt-0.5 max-w-xl">
                    {alert.description}
                  </p>
                  <div className="mt-2 text-xs text-amber-300 font-medium flex items-center gap-1.5">
                    <span>↳ Recommended Action:</span>
                    <span className="text-slate-200">{alert.recommendedAction}</span>
                  </div>
                </div>
              </div>

              <button
                onClick={() => onExecuteRecommendation(alert.id, alert.recommendedAction)}
                className="flex items-center gap-1.5 px-4 py-2 text-xs font-bold text-slate-950 bg-amber-400 hover:bg-amber-300 rounded-lg shadow transition-all whitespace-nowrap self-end md:self-center cursor-pointer"
              >
                <span>Authorize & Execute Action</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
