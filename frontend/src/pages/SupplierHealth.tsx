import { useState, useEffect } from 'react';
import axios from 'axios';
import { Heart, RefreshCw, AlertTriangle, CheckCircle, Eye, TrendingDown } from 'lucide-react';

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:8000';

interface SupplierScore {
    supplier_id: string;
    supplier_name: string;
    country: string;
    health_score: number;
    status: 'healthy' | 'watch' | 'at_risk' | 'critical';
    is_single_source: boolean;
    lead_time_days: number;
    factors: {
        regional_signal_penalty: number;
        open_case_exposure_penalty: number;
        inventory_health_penalty: number;
        single_source_penalty: number;
        po_delay_penalty: number;
    };
    active_signals_in_region: number;
    open_case_risk_score: number;
}

interface HealthReport {
    total_suppliers: number;
    avg_health_score: number;
    critical_count: number;
    at_risk_count: number;
    watch_count: number;
    healthy_count: number;
    suppliers: SupplierScore[];
}

const STATUS_CONFIG = {
    healthy: { color: 'bg-emerald-100 text-emerald-700 border-emerald-200', bar: 'bg-emerald-500', icon: CheckCircle, label: 'Healthy' },
    watch: { color: 'bg-blue-100 text-blue-700 border-blue-200', bar: 'bg-blue-500', icon: Eye, label: 'Watch' },
    at_risk: { color: 'bg-amber-100 text-amber-700 border-amber-200', bar: 'bg-amber-500', icon: AlertTriangle, label: 'At Risk' },
    critical: { color: 'bg-red-100 text-red-700 border-red-200', bar: 'bg-red-500', icon: TrendingDown, label: 'Critical' },
};

function ScoreBar({ score }: { score: number }) {
    const color = score >= 80 ? 'bg-emerald-500' : score >= 60 ? 'bg-blue-500' : score >= 40 ? 'bg-amber-500' : 'bg-red-500';
    return (
        <div className="flex items-center gap-2">
            <div className="flex-1 bg-slate-100 rounded-full h-2">
                <div className={`${color} h-2 rounded-full transition-all`} style={{ width: `${score}%` }} />
            </div>
            <span className="text-sm font-bold w-8 text-right">{score}</span>
        </div>
    );
}

export default function SupplierHealth() {
    const [report, setReport] = useState<HealthReport | null>(null);
    const [loading, setLoading] = useState(false);
    const [expanded, setExpanded] = useState<string | null>(null);
    const [filter, setFilter] = useState<string>('all');

    useEffect(() => { loadReport(); }, []);

    async function loadReport() {
        setLoading(true);
        try {
            const res = await axios.get(`${API_BASE}/api/monitoring/supplier-health`);
            setReport(res.data);
        } catch (e) {
            console.error(e);
        } finally {
            setLoading(false);
        }
    }

    const filtered = (report?.suppliers || []).filter(s => filter === 'all' || s.status === filter);

    return (
        <div className="max-w-5xl mx-auto space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
                        <Heart size={24} className="text-red-500" />
                        Supplier Health Scores
                    </h1>
                    <p className="text-sm text-slate-500 mt-1">
                        Dynamic health scores computed from live signals, open risk cases, and inventory levels.
                    </p>
                </div>
                <button
                    onClick={loadReport}
                    disabled={loading}
                    className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50"
                >
                    <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
                    Refresh
                </button>
            </div>

            {/* Summary cards */}
            {report && (
                <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                    <div className="bg-white border border-slate-200 rounded-xl p-4 text-center">
                        <p className="text-2xl font-bold text-slate-900">{report.avg_health_score}</p>
                        <p className="text-xs text-slate-500 mt-0.5">Avg Score</p>
                    </div>
                    {(['critical', 'at_risk', 'watch', 'healthy'] as const).map(st => {
                        const cfg = STATUS_CONFIG[st];
                        const count = report[`${st}_count` as keyof HealthReport] as number;
                        return (
                            <button
                                key={st}
                                onClick={() => setFilter(filter === st ? 'all' : st)}
                                className={`bg-white border rounded-xl p-4 text-center transition-all ${filter === st ? cfg.color + ' ring-2 ring-offset-1' : 'border-slate-200 hover:border-slate-300'}`}
                            >
                                <p className="text-2xl font-bold">{count}</p>
                                <p className="text-xs mt-0.5">{cfg.label}</p>
                            </button>
                        );
                    })}
                </div>
            )}

            {/* Table */}
            <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
                <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between">
                    <h2 className="font-semibold text-slate-800">
                        {filter === 'all' ? 'All Suppliers' : STATUS_CONFIG[filter as keyof typeof STATUS_CONFIG]?.label} ({filtered.length})
                    </h2>
                    {filter !== 'all' && (
                        <button onClick={() => setFilter('all')} className="text-xs text-blue-600 hover:underline">Clear filter</button>
                    )}
                </div>

                {loading && !report ? (
                    <div className="flex items-center justify-center h-40 text-slate-400">
                        <RefreshCw size={20} className="animate-spin mr-2" /> Computing health scores…
                    </div>
                ) : filtered.length === 0 ? (
                    <div className="text-center text-slate-400 py-12">
                        No suppliers found. Add suppliers in Configuration to enable health scoring.
                    </div>
                ) : (
                    <div className="divide-y divide-slate-100">
                        {filtered.map(s => {
                            const cfg = STATUS_CONFIG[s.status];
                            const StatusIcon = cfg.icon;
                            const isOpen = expanded === s.supplier_id;
                            return (
                                <div key={s.supplier_id}>
                                    <button
                                        className="w-full px-5 py-4 flex items-center gap-4 hover:bg-slate-50 text-left"
                                        onClick={() => setExpanded(isOpen ? null : s.supplier_id)}
                                    >
                                        <StatusIcon size={18} className={cfg.color.split(' ')[1]} />
                                        <div className="w-28 flex-shrink-0">
                                            <p className="font-medium text-sm text-slate-800">{s.supplier_id}</p>
                                            <p className="text-xs text-slate-400">{s.supplier_name}</p>
                                        </div>
                                        <span className="text-sm text-slate-500 w-24 flex-shrink-0">{s.country}</span>
                                        <div className="flex-1">
                                            <ScoreBar score={s.health_score} />
                                        </div>
                                        <span className={`px-2 py-0.5 rounded-full text-xs font-medium border flex-shrink-0 ${cfg.color}`}>
                                            {cfg.label}
                                        </span>
                                        {s.is_single_source && (
                                            <span className="text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full flex-shrink-0">Single Source</span>
                                        )}
                                    </button>
                                    {isOpen && (
                                        <div className="px-5 pb-4 bg-slate-50 border-t border-slate-100">
                                            <p className="text-xs font-semibold text-slate-500 uppercase mb-3 mt-3">Score Breakdown</p>
                                            <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                                                {[
                                                    { label: 'Regional Signals', value: s.factors.regional_signal_penalty, desc: `${s.active_signals_in_region} signal(s) in region` },
                                                    { label: 'Open Case Risk', value: s.factors.open_case_exposure_penalty, desc: `Risk score: ${s.open_case_risk_score}/100` },
                                                    { label: 'Inventory Cover', value: s.factors.inventory_health_penalty, desc: 'vs safety stock' },
                                                    { label: 'Single Source', value: s.factors.single_source_penalty, desc: s.is_single_source ? 'No backup supplier' : 'Backup available' },
                                                    { label: 'PO Delays', value: s.factors.po_delay_penalty, desc: 'Open orders at risk' },
                                                ].map(f => (
                                                    <div key={f.label} className="bg-white rounded-lg border border-slate-200 p-3">
                                                        <p className="text-xs font-medium text-slate-600">{f.label}</p>
                                                        <p className="text-lg font-bold text-slate-800 mt-1">-{f.value.toFixed(0)}</p>
                                                        <p className="text-xs text-slate-400">{f.desc}</p>
                                                    </div>
                                                ))}
                                            </div>
                                            <p className="text-xs text-slate-400 mt-3">
                                                Lead time: {s.lead_time_days} days &nbsp;·&nbsp; Health score = 100 minus all penalties above
                                            </p>
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>
        </div>
    );
}
