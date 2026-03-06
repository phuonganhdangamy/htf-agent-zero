import { useState, useEffect } from 'react';
import axios from 'axios';
import { Brain, RefreshCw, CheckCircle, XCircle, AlertTriangle, BookOpen, TrendingUp } from 'lucide-react';

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:8000';

interface Pattern {
    id?: string;
    pattern_type: string;
    pattern_data: Record<string, unknown>;
    created_at?: string;
}

interface MemorySummary {
    total_patterns: number;
    plans_with_outcomes: number;
    successful_resolutions: number;
    failed_resolutions: number;
    top_rejection_reasons: { reason: string; count: number }[];
    top_exposure_hotspots: { supplier_id: string; frequency: number }[];
    patterns: Pattern[];
}

interface FeedbackForm {
    case_id: string;
    outcome: string;
    actual_impact_usd: string;
    notes: string;
}

export default function MemoryLearning() {
    const [summary, setSummary] = useState<MemorySummary | null>(null);
    const [loading, setLoading] = useState(false);
    const [feedbackForm, setFeedbackForm] = useState<FeedbackForm>({ case_id: '', outcome: 'resolved', actual_impact_usd: '', notes: '' });
    const [feedbackResult, setFeedbackResult] = useState<string | null>(null);
    const [feedbackLoading, setFeedbackLoading] = useState(false);
    const [activeTab, setActiveTab] = useState<'summary' | 'patterns' | 'feedback'>('summary');

    useEffect(() => { loadSummary(); }, []);

    async function loadSummary() {
        setLoading(true);
        try {
            const res = await axios.get(`${API_BASE}/api/monitoring/memory`);
            setSummary(res.data);
        } catch (e) {
            console.error(e);
        } finally {
            setLoading(false);
        }
    }

    async function submitFeedback() {
        if (!feedbackForm.case_id.trim()) return;
        setFeedbackLoading(true);
        setFeedbackResult(null);
        try {
            const params: Record<string, string | number> = {
                case_id: feedbackForm.case_id.trim(),
                outcome: feedbackForm.outcome,
                notes: feedbackForm.notes,
            };
            if (feedbackForm.actual_impact_usd) {
                params.actual_impact_usd = Number(feedbackForm.actual_impact_usd);
            }
            const res = await axios.post(`${API_BASE}/api/monitoring/feedback`, null, { params });
            setFeedbackResult(`✓ Outcome recorded. ${res.data.patterns_saved} new pattern(s) learned.`);
            setFeedbackForm({ case_id: '', outcome: 'resolved', actual_impact_usd: '', notes: '' });
            loadSummary();
        } catch (e: unknown) {
            const err = e as { response?: { data?: { detail?: string } } };
            setFeedbackResult(`Error: ${err.response?.data?.detail || 'Failed to record outcome'}`);
        } finally {
            setFeedbackLoading(false);
        }
    }

    const PATTERN_ICONS: Record<string, React.ElementType> = {
        plan_outcome: TrendingUp,
        rejection_reason: XCircle,
        exposure_hotspot: AlertTriangle,
    };

    return (
        <div className="max-w-4xl mx-auto space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
                        <Brain size={24} className="text-purple-600" />
                        Memory & Learning
                    </h1>
                    <p className="text-sm text-slate-500 mt-1">
                        The agent learns from past decisions. Record case outcomes to improve future recommendations.
                    </p>
                </div>
                <button
                    onClick={loadSummary}
                    disabled={loading}
                    className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50"
                >
                    <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
                    Refresh
                </button>
            </div>

            {/* Tabs */}
            <div className="flex border-b border-slate-200 gap-6">
                {(['summary', 'patterns', 'feedback'] as const).map(tab => (
                    <button
                        key={tab}
                        onClick={() => setActiveTab(tab)}
                        className={`pb-2 text-sm font-medium capitalize transition-colors border-b-2 -mb-px ${activeTab === tab ? 'border-purple-600 text-purple-700' : 'border-transparent text-slate-500 hover:text-slate-800'}`}
                    >
                        {tab === 'feedback' ? 'Record Outcome' : tab}
                    </button>
                ))}
            </div>

            {activeTab === 'summary' && (
                <div className="space-y-4">
                    {/* Stats */}
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                        {[
                            { label: 'Total Patterns', value: summary?.total_patterns ?? 0, icon: BookOpen, color: 'blue' },
                            { label: 'Plans Tracked', value: summary?.plans_with_outcomes ?? 0, icon: TrendingUp, color: 'purple' },
                            { label: 'Successes', value: summary?.successful_resolutions ?? 0, icon: CheckCircle, color: 'emerald' },
                            { label: 'Failures', value: summary?.failed_resolutions ?? 0, icon: XCircle, color: 'red' },
                        ].map(stat => {
                            const Icon = stat.icon;
                            return (
                                <div key={stat.label} className="bg-white border border-slate-200 rounded-xl p-4">
                                    <div className="flex items-center gap-2 mb-2">
                                        <Icon size={16} className={`text-${stat.color}-600`} />
                                        <span className="text-xs text-slate-500">{stat.label}</span>
                                    </div>
                                    <p className="text-2xl font-bold text-slate-900">{stat.value}</p>
                                </div>
                            );
                        })}
                    </div>

                    {/* Top rejection reasons */}
                    {(summary?.top_rejection_reasons || []).length > 0 && (
                        <div className="bg-white border border-slate-200 rounded-xl p-5">
                            <h3 className="font-semibold text-slate-800 mb-3 flex items-center gap-2">
                                <XCircle size={16} className="text-red-500" />
                                Top Rejection Reasons (agent will avoid these)
                            </h3>
                            <div className="space-y-2">
                                {summary!.top_rejection_reasons.map(r => (
                                    <div key={r.reason} className="flex items-center gap-3">
                                        <div className="flex-1 bg-slate-100 rounded-full h-2">
                                            <div
                                                className="bg-red-400 h-2 rounded-full"
                                                style={{ width: `${Math.min(100, r.count * 20)}%` }}
                                            />
                                        </div>
                                        <span className="text-sm text-slate-700 w-48">{r.reason}</span>
                                        <span className="text-xs text-slate-400 w-12 text-right">{r.count}x</span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Top exposure hotspots */}
                    {(summary?.top_exposure_hotspots || []).length > 0 && (
                        <div className="bg-white border border-slate-200 rounded-xl p-5">
                            <h3 className="font-semibold text-slate-800 mb-3 flex items-center gap-2">
                                <AlertTriangle size={16} className="text-amber-500" />
                                Frequently Exposed Suppliers (flagged proactively)
                            </h3>
                            <div className="flex flex-wrap gap-2">
                                {summary!.top_exposure_hotspots.map(h => (
                                    <div key={h.supplier_id} className="flex items-center gap-2 bg-amber-50 border border-amber-200 text-amber-700 px-3 py-1.5 rounded-lg text-sm">
                                        <span className="font-medium font-mono">{h.supplier_id}</span>
                                        <span className="text-xs opacity-70">({h.frequency}x)</span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {summary?.total_patterns === 0 && (
                        <div className="text-center py-12 text-slate-400 bg-white rounded-xl border border-slate-200">
                            <Brain size={32} className="mx-auto mb-3 opacity-40" />
                            <p className="font-medium">No patterns learned yet</p>
                            <p className="text-sm mt-1">Resolve a risk case using the "Record Outcome" tab to start building memory.</p>
                        </div>
                    )}
                </div>
            )}

            {activeTab === 'patterns' && (
                <div className="space-y-3">
                    {(summary?.patterns || []).length === 0 ? (
                        <div className="text-center py-12 text-slate-400 bg-white rounded-xl border border-slate-200">
                            No patterns stored yet.
                        </div>
                    ) : (
                        (summary?.patterns || []).map((p, i) => {
                            const Icon = PATTERN_ICONS[p.pattern_type] || BookOpen;
                            return (
                                <div key={i} className="bg-white border border-slate-200 rounded-xl p-4">
                                    <div className="flex items-center gap-2 mb-2">
                                        <Icon size={14} className="text-purple-600" />
                                        <span className="text-xs font-medium text-purple-700 bg-purple-50 px-2 py-0.5 rounded">{p.pattern_type.replace('_', ' ')}</span>
                                        <span className="text-xs text-slate-400 ml-auto">{p.created_at ? new Date(p.created_at).toLocaleDateString() : ''}</span>
                                    </div>
                                    <pre className="text-xs text-slate-600 bg-slate-50 rounded p-3 overflow-x-auto">
                                        {JSON.stringify(p.pattern_data, null, 2)}
                                    </pre>
                                </div>
                            );
                        })
                    )}
                </div>
            )}

            {activeTab === 'feedback' && (
                <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-4">
                    <div>
                        <h2 className="font-semibold text-slate-800 mb-1">Record Case Outcome</h2>
                        <p className="text-sm text-slate-500">
                            After a disruption has passed, record what actually happened. The agent will use this to improve future recommendations.
                        </p>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                            <label className="block text-xs font-semibold text-slate-500 uppercase mb-1">Risk Case ID *</label>
                            <input
                                type="text"
                                placeholder="e.g. RC_1740000000_ABCDEF"
                                value={feedbackForm.case_id}
                                onChange={e => setFeedbackForm(f => ({ ...f, case_id: e.target.value }))}
                                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm font-mono"
                            />
                            <p className="text-xs text-slate-400 mt-1">Find this ID in Risk Cases or Agent Pipeline pages</p>
                        </div>
                        <div>
                            <label className="block text-xs font-semibold text-slate-500 uppercase mb-1">Outcome</label>
                            <select
                                value={feedbackForm.outcome}
                                onChange={e => setFeedbackForm(f => ({ ...f, outcome: e.target.value }))}
                                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm"
                            >
                                <option value="resolved">Resolved — disruption mitigated successfully</option>
                                <option value="partially_resolved">Partially Resolved — some impact remained</option>
                                <option value="failed">Failed — mitigation did not work</option>
                                <option value="abandoned">Abandoned — risk did not materialize</option>
                            </select>
                        </div>
                        <div>
                            <label className="block text-xs font-semibold text-slate-500 uppercase mb-1">Actual Financial Impact (USD)</label>
                            <input
                                type="number"
                                placeholder="e.g. 25000"
                                value={feedbackForm.actual_impact_usd}
                                onChange={e => setFeedbackForm(f => ({ ...f, actual_impact_usd: e.target.value }))}
                                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm"
                            />
                            <p className="text-xs text-slate-400 mt-1">Used to measure prediction accuracy</p>
                        </div>
                        <div>
                            <label className="block text-xs font-semibold text-slate-500 uppercase mb-1">Notes</label>
                            <input
                                type="text"
                                placeholder="What worked, what didn't..."
                                value={feedbackForm.notes}
                                onChange={e => setFeedbackForm(f => ({ ...f, notes: e.target.value }))}
                                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm"
                            />
                        </div>
                    </div>

                    <button
                        onClick={submitFeedback}
                        disabled={feedbackLoading || !feedbackForm.case_id.trim()}
                        className="flex items-center gap-2 px-5 py-2.5 bg-purple-600 text-white rounded-lg text-sm font-medium hover:bg-purple-700 disabled:opacity-50"
                    >
                        <Brain size={16} />
                        {feedbackLoading ? 'Recording…' : 'Record & Learn'}
                    </button>

                    {feedbackResult && (
                        <p className={`text-sm p-3 rounded-lg ${feedbackResult.startsWith('✓') ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700'}`}>
                            {feedbackResult}
                        </p>
                    )}
                </div>
            )}
        </div>
    );
}
