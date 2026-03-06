import { useState } from 'react';
import axios from 'axios';
import { Activity, X, CheckCircle2, XCircle, Loader2, ChevronDown, ChevronRight, Clock } from 'lucide-react';
import { cn } from '../lib/utils';

const API_BASE = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000';

interface HealthCheck {
  name: string;
  category: string;
  status: 'ok' | 'error';
  detail: string;
  latency_ms: number;
}

interface HealthReport {
  overall: 'healthy' | 'degraded' | 'critical';
  passed: number;
  failed: number;
  total: number;
  duration_ms: number;
  checks: HealthCheck[];
}

const CATEGORY_ORDER = ['Database', 'AI Services', 'Agents'];

const OVERALL_STYLES = {
  healthy:  { bg: 'bg-emerald-50',  border: 'border-emerald-300', text: 'text-emerald-700', dot: 'bg-emerald-500' },
  degraded: { bg: 'bg-amber-50',    border: 'border-amber-300',   text: 'text-amber-700',   dot: 'bg-amber-500'   },
  critical: { bg: 'bg-rose-50',     border: 'border-rose-300',    text: 'text-rose-700',    dot: 'bg-rose-500'    },
};

export default function HealthCheckPanel() {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [report, setReport] = useState<HealthReport | null>(null);
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const [lastRun, setLastRun] = useState<string | null>(null);

  const runChecks = async () => {
    setLoading(true);
    setReport(null);
    try {
      const res = await axios.get(`${API_BASE}/api/monitoring/health`);
      setReport(res.data);
      setLastRun(new Date().toLocaleTimeString());
    } catch (e) {
      setReport({
        overall: 'critical',
        passed: 0,
        failed: 1,
        total: 1,
        duration_ms: 0,
        checks: [{ name: 'Backend API', category: 'Database', status: 'error', detail: 'Cannot reach backend — is it running on port 8000?', latency_ms: 0 }],
      });
    } finally {
      setLoading(false);
    }
  };

  const handleOpen = () => {
    setOpen(true);
    runChecks();
  };

  const toggleCategory = (cat: string) =>
    setCollapsed((prev) => ({ ...prev, [cat]: !prev[cat] }));

  const grouped = report
    ? CATEGORY_ORDER.reduce<Record<string, HealthCheck[]>>((acc, cat) => {
        acc[cat] = report.checks.filter((c) => c.category === cat);
        return acc;
      }, {})
    : {};

  const overallStyle = report ? OVERALL_STYLES[report.overall] : null;

  return (
    <>
      {/* Floating button */}
      <button
        onClick={handleOpen}
        className={cn(
          'fixed bottom-6 right-6 z-50 flex items-center gap-2 px-4 py-3 rounded-full shadow-lg font-semibold text-sm transition-all',
          'bg-blue-600 hover:bg-blue-700 text-white',
          open && 'hidden'
        )}
        title="Run Agent Health Check"
      >
        <Activity size={18} />
        Health Check
      </button>

      {/* Modal overlay */}
      {open && (
        <div className="fixed inset-0 z-50 flex items-end justify-end p-6 pointer-events-none">
          <div className="pointer-events-auto w-[480px] max-h-[85vh] flex flex-col rounded-2xl shadow-2xl border border-slate-200 bg-white overflow-hidden">

            {/* Header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 bg-slate-50 flex-shrink-0">
              <div className="flex items-center gap-2">
                <Activity size={18} className="text-blue-600" />
                <span className="font-bold text-slate-900">System Health Report</span>
                {lastRun && <span className="text-xs text-slate-400 flex items-center gap-1"><Clock size={11}/>{lastRun}</span>}
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={runChecks}
                  disabled={loading}
                  className="text-xs px-3 py-1.5 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-100 transition-colors flex items-center gap-1 disabled:opacity-50"
                >
                  {loading ? <Loader2 size={12} className="animate-spin" /> : <Activity size={12} />}
                  Re-run
                </button>
                <button onClick={() => setOpen(false)} className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors">
                  <X size={16} />
                </button>
              </div>
            </div>

            {/* Overall status bar */}
            {loading && !report && (
              <div className="flex-shrink-0 flex items-center gap-3 px-5 py-4 border-b border-slate-100 bg-blue-50">
                <Loader2 size={16} className="animate-spin text-blue-500" />
                <span className="text-sm text-blue-700 font-medium">Running health checks across all agents…</span>
              </div>
            )}

            {report && overallStyle && (
              <div className={cn('flex-shrink-0 flex items-center justify-between px-5 py-3 border-b border-slate-100', overallStyle.bg)}>
                <div className="flex items-center gap-2">
                  <span className={cn('w-2.5 h-2.5 rounded-full animate-pulse', overallStyle.dot)} />
                  <span className={cn('font-bold text-sm capitalize', overallStyle.text)}>{report.overall}</span>
                  <span className="text-xs text-slate-500">
                    {report.passed}/{report.total} checks passed
                  </span>
                </div>
                <span className="text-xs text-slate-400">{report.duration_ms}ms total</span>
              </div>
            )}

            {/* Checks list */}
            <div className="overflow-y-auto flex-1 divide-y divide-slate-50">
              {report && CATEGORY_ORDER.map((cat) => {
                const items = grouped[cat] || [];
                if (!items.length) return null;
                const catFailed = items.filter((c) => c.status === 'error').length;
                const isCollapsed = collapsed[cat];

                return (
                  <div key={cat}>
                    {/* Category header */}
                    <button
                      onClick={() => toggleCategory(cat)}
                      className="w-full flex items-center justify-between px-5 py-2.5 bg-slate-50 hover:bg-slate-100 transition-colors"
                    >
                      <div className="flex items-center gap-2">
                        {isCollapsed ? <ChevronRight size={13} className="text-slate-400" /> : <ChevronDown size={13} className="text-slate-400" />}
                        <span className="text-xs font-bold text-slate-600 uppercase tracking-wider">{cat}</span>
                        <span className={cn(
                          'text-xs px-1.5 py-0.5 rounded-full font-medium',
                          catFailed > 0 ? 'bg-rose-100 text-rose-600' : 'bg-emerald-100 text-emerald-700'
                        )}>
                          {catFailed > 0 ? `${catFailed} error${catFailed > 1 ? 's' : ''}` : `${items.length} ok`}
                        </span>
                      </div>
                    </button>

                    {/* Check rows */}
                    {!isCollapsed && items.map((check) => (
                      <div
                        key={check.name}
                        className={cn(
                          'flex items-start gap-3 px-5 py-3 border-l-2 transition-colors',
                          check.status === 'ok'
                            ? 'border-l-emerald-300 hover:bg-emerald-50/30'
                            : 'border-l-rose-400 bg-rose-50/40 hover:bg-rose-50/60'
                        )}
                      >
                        <div className="flex-shrink-0 mt-0.5">
                          {check.status === 'ok'
                            ? <CheckCircle2 size={16} className="text-emerald-500" />
                            : <XCircle size={16} className="text-rose-500" />}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-sm font-semibold text-slate-800">{check.name}</span>
                            <span className="text-xs text-slate-400 flex-shrink-0">{check.latency_ms}ms</span>
                          </div>
                          <p className={cn(
                            'text-xs mt-0.5 leading-relaxed break-words',
                            check.status === 'ok' ? 'text-slate-500' : 'text-rose-600 font-medium'
                          )}>
                            {check.detail}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                );
              })}
            </div>

            {/* Footer */}
            {report && (
              <div className="flex-shrink-0 px-5 py-3 border-t border-slate-100 bg-slate-50 flex items-center justify-between">
                <span className="text-xs text-slate-400">
                  {report.failed === 0
                    ? 'All systems operational'
                    : `${report.failed} service${report.failed > 1 ? 's' : ''} need attention`}
                </span>
                <button
                  onClick={() => setOpen(false)}
                  className="text-xs px-3 py-1.5 rounded-lg bg-slate-200 hover:bg-slate-300 text-slate-700 transition-colors font-medium"
                >
                  Close
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
