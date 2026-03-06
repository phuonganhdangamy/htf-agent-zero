import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { Eye, Cpu, GitBranch, Zap, CheckCircle, Clock, AlertTriangle, ChevronDown, ChevronRight, Brain, Search, BarChart3 } from 'lucide-react';

const DEFAULT_COMPANY_ID = 'ORG_DEMO';

interface RiskCase {
    case_id: string;
    headline: string;
    status: string;
    risk_category: string;
    scores?: Record<string, number>;
    hypotheses?: { chain?: string[]; likelihood?: number; unknowns?: string[] } | unknown[];
    recommended_plan?: string | Record<string, unknown>;
    reasoning_summary?: string[];
    execution_steps?: (string | Record<string, unknown>)[];
    alternative_plans?: unknown[];
    exposure?: Record<string, unknown>;
    created_at?: string;
    iteration_count?: number;
    plan_iterations?: unknown[];
}

interface SignalEvent {
    event_id: string;
    title: string;
    country: string;
    event_type: string;
    confidence_score: number;
    summary: string;
    signal_sources?: string[];
    created_at?: string;
}

const STAGES = [
    { key: 'perception', label: 'Perception', icon: Search, color: 'blue', desc: 'Raw signals detected from the environment' },
    { key: 'reasoning', label: 'Reasoning', icon: Brain, color: 'purple', desc: 'Hypotheses formed and risk scored' },
    { key: 'planning', label: 'Planning', icon: GitBranch, color: 'amber', desc: 'Mitigation plans generated and compared' },
    { key: 'action', label: 'Action', icon: Zap, color: 'emerald', desc: 'Execution steps drafted for approval' },
];

const colorMap: Record<string, string> = {
    blue: 'bg-blue-100 text-blue-700 border-blue-200',
    purple: 'bg-purple-100 text-purple-700 border-purple-200',
    amber: 'bg-amber-100 text-amber-700 border-amber-200',
    emerald: 'bg-emerald-100 text-emerald-700 border-emerald-200',
};

const iconColorMap: Record<string, string> = {
    blue: 'text-blue-600',
    purple: 'text-purple-600',
    amber: 'text-amber-600',
    emerald: 'text-emerald-600',
};

const dotColorMap: Record<string, string> = {
    blue: 'bg-blue-500',
    purple: 'bg-purple-500',
    amber: 'bg-amber-500',
    emerald: 'bg-emerald-500',
};

function StatusBadge({ status }: { status: string }) {
    const map: Record<string, string> = {
        open: 'bg-amber-100 text-amber-700',
        resolved: 'bg-emerald-100 text-emerald-700',
        abandoned: 'bg-slate-100 text-slate-600',
    };
    return (
        <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${map[status] ?? 'bg-slate-100 text-slate-600'}`}>
            {status}
        </span>
    );
}

function ScorePill({ label, value }: { label: string; value: number }) {
    const color = value >= 75 ? 'bg-red-100 text-red-700' : value >= 50 ? 'bg-amber-100 text-amber-700' : 'bg-emerald-100 text-emerald-700';
    return (
        <div className={`flex flex-col items-center px-3 py-1.5 rounded-lg ${color} min-w-[60px]`}>
            <span className="text-lg font-bold leading-none">{value}</span>
            <span className="text-[10px] mt-0.5 opacity-80">{label}</span>
        </div>
    );
}

function PipelineStage({ stage, children, expanded, onToggle }: {
    stage: typeof STAGES[0];
    children: React.ReactNode;
    expanded: boolean;
    onToggle: () => void;
}) {
    const Icon = stage.icon;
    return (
        <div className={`border rounded-xl overflow-hidden ${colorMap[stage.color]}`}>
            <button
                className="w-full flex items-center gap-3 px-4 py-3 text-left hover:opacity-80 transition-opacity"
                onClick={onToggle}
            >
                <Icon size={18} className={iconColorMap[stage.color]} />
                <span className="font-semibold text-sm">{stage.label}</span>
                <span className="text-xs opacity-70 flex-1">{stage.desc}</span>
                {expanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
            </button>
            {expanded && <div className="px-4 pb-4 border-t border-current/20">{children}</div>}
        </div>
    );
}

export default function AgentPipeline() {
    const [cases, setCases] = useState<RiskCase[]>([]);
    const [signals, setSignals] = useState<SignalEvent[]>([]);
    const [selectedCase, setSelectedCase] = useState<RiskCase | null>(null);
    const [loading, setLoading] = useState(true);
    const [expanded, setExpanded] = useState<Record<string, boolean>>({
        perception: true,
        reasoning: true,
        planning: true,
        action: true,
    });

    useEffect(() => {
        loadData();
    }, []);

    async function loadData() {
        setLoading(true);
        const [casesRes, signalsRes] = await Promise.all([
            supabase.from('risk_cases').select('*').order('created_at', { ascending: false }).limit(20),
            supabase.from('signal_events').select('*').order('created_at', { ascending: false }).limit(30),
        ]);
        const caseList = casesRes.data || [];
        setCases(caseList);
        setSignals(signalsRes.data || []);
        if (caseList.length > 0 && !selectedCase) setSelectedCase(caseList[0]);
        setLoading(false);
    }

    function toggleStage(key: string) {
        setExpanded(prev => ({ ...prev, [key]: !prev[key] }));
    }

    function getRecommendedPlan(rc: RiskCase): Record<string, unknown> {
        if (!rc.recommended_plan) return {};
        if (typeof rc.recommended_plan === 'string') {
            try { return JSON.parse(rc.recommended_plan); } catch { return {}; }
        }
        return rc.recommended_plan as Record<string, unknown>;
    }

    function getHypothesesChain(rc: RiskCase): string[] {
        const h = rc.hypotheses;
        if (!h) return [];
        if (Array.isArray(h)) return h.map(item => typeof item === 'string' ? item : (item as Record<string, string>).title || JSON.stringify(item));
        if (typeof h === 'object' && (h as Record<string, unknown>).chain) return (h as { chain: string[] }).chain;
        return [];
    }

    function getExecutionSteps(rc: RiskCase): string[] {
        const steps = rc.execution_steps || [];
        return steps.map(s => typeof s === 'string' ? s : JSON.stringify(s));
    }

    // Find signal events that could be linked to the case (same keywords in headline)
    function getRelatedSignals(rc: RiskCase): SignalEvent[] {
        const headline = rc.headline.toLowerCase();
        return signals.filter(s => {
            const text = `${s.country} ${s.event_type}`.toLowerCase();
            return headline.includes(s.country.toLowerCase()) || headline.includes(s.event_type.toLowerCase()) || text.split(' ').some(w => w.length > 4 && headline.includes(w));
        }).slice(0, 3);
    }

    if (loading) return (
        <div className="flex items-center justify-center h-64 text-slate-500">
            <Clock size={20} className="animate-spin mr-2" /> Loading pipeline traces…
        </div>
    );

    return (
        <div className="flex gap-6 h-[calc(100vh-120px)]">
            {/* Left: case list */}
            <div className="w-80 flex-shrink-0 flex flex-col">
                <div className="mb-4">
                    <h1 className="text-xl font-bold text-slate-900 flex items-center gap-2">
                        <Cpu size={22} className="text-blue-600" />
                        Agent Pipeline
                    </h1>
                    <p className="text-sm text-slate-500 mt-1">Full reasoning trace for every risk case</p>
                </div>
                <div className="flex-1 overflow-y-auto space-y-2 pr-1">
                    {cases.map(rc => (
                        <button
                            key={rc.case_id}
                            onClick={() => setSelectedCase(rc)}
                            className={`w-full text-left px-3 py-3 rounded-xl border transition-all ${selectedCase?.case_id === rc.case_id ? 'bg-blue-50 border-blue-300 shadow-sm' : 'bg-white border-slate-200 hover:border-slate-300'}`}
                        >
                            <div className="flex items-center gap-2 mb-1">
                                <StatusBadge status={rc.status} />
                                <span className="text-xs text-slate-400 font-mono">{rc.case_id.slice(-8)}</span>
                            </div>
                            <p className="text-sm font-medium text-slate-800 line-clamp-2">{rc.headline}</p>
                            <div className="flex items-center gap-2 mt-1.5">
                                <span className="text-xs text-slate-400">{rc.risk_category}</span>
                                {rc.scores && (
                                    <span className={`text-xs font-bold ml-auto ${(rc.scores.overall ?? 0) >= 75 ? 'text-red-500' : 'text-amber-500'}`}>
                                        {rc.scores.overall ?? 0}/100
                                    </span>
                                )}
                            </div>
                        </button>
                    ))}
                    {cases.length === 0 && (
                        <div className="text-center text-slate-400 text-sm py-8">
                            No risk cases yet. Run a scan or simulation to generate one.
                        </div>
                    )}
                </div>
            </div>

            {/* Right: pipeline trace */}
            <div className="flex-1 overflow-y-auto">
                {!selectedCase ? (
                    <div className="flex items-center justify-center h-64 text-slate-400">
                        Select a risk case to view its reasoning trace
                    </div>
                ) : (() => {
                    const plan = getRecommendedPlan(selectedCase);
                    const chain = getHypothesesChain(selectedCase);
                    const steps = getExecutionSteps(selectedCase);
                    const relatedSignals = getRelatedSignals(selectedCase);
                    const hyp = selectedCase.hypotheses as Record<string, unknown> | null;
                    const altPlans = (selectedCase.alternative_plans || []) as Record<string, unknown>[];

                    return (
                        <div className="space-y-3">
                            {/* Header */}
                            <div className="bg-white rounded-xl border border-slate-200 p-4">
                                <div className="flex items-start justify-between gap-4">
                                    <div className="flex-1">
                                        <div className="flex items-center gap-2 mb-1">
                                            <StatusBadge status={selectedCase.status} />
                                            <span className="text-xs font-mono text-slate-400">{selectedCase.case_id}</span>
                                            {(selectedCase.iteration_count ?? 0) > 0 && (
                                                <span className="text-xs bg-slate-100 text-slate-500 px-2 py-0.5 rounded-full">
                                                    {selectedCase.iteration_count} revision{(selectedCase.iteration_count ?? 0) > 1 ? 's' : ''}
                                                </span>
                                            )}
                                        </div>
                                        <h2 className="font-semibold text-slate-900">{selectedCase.headline}</h2>
                                        <p className="text-sm text-slate-500 mt-0.5">{selectedCase.risk_category}</p>
                                    </div>
                                    {selectedCase.scores && (
                                        <div className="flex gap-2 flex-shrink-0">
                                            <ScorePill label="Likelihood" value={selectedCase.scores.likelihood ?? 0} />
                                            <ScorePill label="Impact" value={selectedCase.scores.impact ?? 0} />
                                            <ScorePill label="Urgency" value={selectedCase.scores.urgency ?? 0} />
                                            <ScorePill label="Overall" value={selectedCase.scores.overall ?? 0} />
                                        </div>
                                    )}
                                </div>
                            </div>

                            {/* Pipeline connector */}
                            <div className="flex items-center gap-2 px-2">
                                {STAGES.map((stage, i) => (
                                    <div key={stage.key} className="flex items-center gap-2 flex-1">
                                        <div className="flex items-center gap-1.5">
                                            <div className={`w-2.5 h-2.5 rounded-full ${dotColorMap[stage.color]}`} />
                                            <span className="text-xs font-medium text-slate-600">{stage.label}</span>
                                        </div>
                                        {i < STAGES.length - 1 && <div className="flex-1 h-px bg-slate-300 border-dashed" />}
                                    </div>
                                ))}
                            </div>

                            {/* PERCEPTION */}
                            <PipelineStage stage={STAGES[0]} expanded={expanded.perception} onToggle={() => toggleStage('perception')}>
                                <div className="mt-3 space-y-2">
                                    {relatedSignals.length > 0 ? (
                                        relatedSignals.map(sig => (
                                            <div key={sig.event_id} className="bg-white rounded-lg border border-blue-100 p-3">
                                                <div className="flex items-center gap-2 mb-1">
                                                    <span className="text-xs bg-blue-50 text-blue-600 px-2 py-0.5 rounded font-mono">{sig.event_type}</span>
                                                    <span className="text-xs text-slate-500">{sig.country}</span>
                                                    <span className="text-xs text-slate-400 ml-auto">
                                                        Confidence: <strong>{Math.round(sig.confidence_score * 100)}%</strong>
                                                    </span>
                                                </div>
                                                <p className="text-sm font-medium text-slate-800">{sig.title}</p>
                                                <p className="text-xs text-slate-500 mt-1 line-clamp-2">{sig.summary}</p>
                                                {sig.signal_sources && sig.signal_sources.length > 0 && (
                                                    <p className="text-xs text-slate-400 mt-1">Sources: {sig.signal_sources.join(', ')}</p>
                                                )}
                                            </div>
                                        ))
                                    ) : (
                                        <div className="text-sm text-slate-500 py-2">
                                            This case was triggered manually or by a scan. Check the Events Feed for raw signals that preceded it.
                                        </div>
                                    )}
                                    <div className="text-xs text-blue-600 bg-blue-50 rounded px-3 py-2">
                                        Perception layer monitored {signals.length} signal(s) in the last scan across all supplier regions.
                                    </div>
                                </div>
                            </PipelineStage>

                            {/* REASONING */}
                            <PipelineStage stage={STAGES[1]} expanded={expanded.reasoning} onToggle={() => toggleStage('reasoning')}>
                                <div className="mt-3 space-y-3">
                                    {chain.length > 0 && (
                                        <div>
                                            <p className="text-xs font-semibold text-purple-700 mb-2">Causal Chain</p>
                                            <ol className="space-y-1.5">
                                                {chain.map((step, i) => (
                                                    <li key={i} className="flex items-start gap-2">
                                                        <span className="flex-shrink-0 w-5 h-5 rounded-full bg-purple-500 text-white text-[10px] flex items-center justify-center font-bold">{i + 1}</span>
                                                        <span className="text-sm text-slate-700">{step}</span>
                                                    </li>
                                                ))}
                                            </ol>
                                        </div>
                                    )}
                                    {hyp && typeof hyp === 'object' && (hyp as Record<string, unknown>).unknowns && ((hyp as { unknowns: string[] }).unknowns).length > 0 && (
                                        <div>
                                            <p className="text-xs font-semibold text-purple-700 mb-1">Known Unknowns</p>
                                            <ul className="space-y-1">
                                                {((hyp as { unknowns: string[] }).unknowns).map((u, i) => (
                                                    <li key={i} className="text-sm text-slate-600 flex items-start gap-2">
                                                        <AlertTriangle size={12} className="text-amber-500 mt-0.5 flex-shrink-0" />
                                                        {u}
                                                    </li>
                                                ))}
                                            </ul>
                                        </div>
                                    )}
                                    {selectedCase.scores && (
                                        <div className="bg-white rounded-lg border border-purple-100 p-3">
                                            <p className="text-xs font-semibold text-purple-700 mb-2">Risk Scoring</p>
                                            <div className="grid grid-cols-2 gap-2 text-sm">
                                                {Object.entries(selectedCase.scores).map(([k, v]) => (
                                                    <div key={k} className="flex justify-between">
                                                        <span className="text-slate-500 capitalize">{k.replace('_', ' ')}</span>
                                                        <span className="font-medium">{v}/100</span>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    )}
                                    {chain.length === 0 && <p className="text-sm text-slate-400">No causal chain recorded for this case.</p>}
                                </div>
                            </PipelineStage>

                            {/* PLANNING */}
                            <PipelineStage stage={STAGES[2]} expanded={expanded.planning} onToggle={() => toggleStage('planning')}>
                                <div className="mt-3 space-y-3">
                                    {/* Reasoning summary — why this plan was chosen */}
                                    {(selectedCase.reasoning_summary || []).length > 0 && (
                                        <div>
                                            <p className="text-xs font-semibold text-amber-700 mb-2">Why This Plan Was Chosen</p>
                                            <ul className="space-y-1.5">
                                                {(selectedCase.reasoning_summary || []).map((bullet, i) => (
                                                    <li key={i} className="flex items-start gap-2">
                                                        <CheckCircle size={13} className="text-amber-500 mt-0.5 flex-shrink-0" />
                                                        <span className="text-sm text-slate-700">{bullet}</span>
                                                    </li>
                                                ))}
                                            </ul>
                                        </div>
                                    )}

                                    {/* Recommended plan */}
                                    {plan && Object.keys(plan).length > 0 && (
                                        <div className="bg-white rounded-lg border border-amber-200 p-3">
                                            <div className="flex items-center justify-between mb-2">
                                                <p className="text-xs font-semibold text-amber-700">Recommended Plan</p>
                                                <span className="text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded font-mono">{plan.plan_id as string}</span>
                                            </div>
                                            <p className="font-medium text-slate-800 mb-2">{plan.name as string}</p>
                                            <div className="grid grid-cols-3 gap-2 mb-3">
                                                <div className="text-center bg-slate-50 rounded p-2">
                                                    <p className="text-xs text-slate-500">Cost</p>
                                                    <p className="font-semibold text-sm">${((plan.expected_cost_usd as number) || 0).toLocaleString()}</p>
                                                </div>
                                                <div className="text-center bg-emerald-50 rounded p-2">
                                                    <p className="text-xs text-slate-500">Loss Prevented</p>
                                                    <p className="font-semibold text-sm text-emerald-700">${((plan.expected_loss_prevented_usd as number) || 0).toLocaleString()}</p>
                                                </div>
                                                <div className="text-center bg-blue-50 rounded p-2">
                                                    <p className="text-xs text-slate-500">Service Level</p>
                                                    <p className="font-semibold text-sm text-blue-700">{(((plan.service_level as number) || 0) * 100).toFixed(0)}%</p>
                                                </div>
                                            </div>
                                            {(plan.actions as string[] || []).map((action, i) => (
                                                <div key={i} className="text-sm text-slate-700 flex items-start gap-2 mb-1">
                                                    <span className="text-amber-500 flex-shrink-0">→</span>
                                                    {action}
                                                </div>
                                            ))}
                                        </div>
                                    )}

                                    {/* Alternative plans trade-off table */}
                                    {altPlans.length > 0 && (
                                        <div>
                                            <p className="text-xs font-semibold text-amber-700 mb-2 flex items-center gap-1">
                                                <BarChart3 size={12} /> Alternative Plans (Trade-off Comparison)
                                            </p>
                                            <div className="overflow-x-auto">
                                                <table className="w-full text-xs border-collapse">
                                                    <thead>
                                                        <tr className="bg-amber-50">
                                                            <th className="text-left px-2 py-1.5 font-semibold text-slate-600 border border-amber-100">Plan</th>
                                                            <th className="text-right px-2 py-1.5 font-semibold text-slate-600 border border-amber-100">Cost</th>
                                                            <th className="text-right px-2 py-1.5 font-semibold text-slate-600 border border-amber-100">Loss Prevented</th>
                                                            <th className="text-left px-2 py-1.5 font-semibold text-slate-600 border border-amber-100">Actions</th>
                                                        </tr>
                                                    </thead>
                                                    <tbody>
                                                        {/* Recommended first */}
                                                        {plan && Object.keys(plan).length > 0 && (
                                                            <tr className="bg-amber-50/50">
                                                                <td className="px-2 py-1.5 border border-amber-100 font-medium text-amber-700">{plan.plan_id as string} ★</td>
                                                                <td className="px-2 py-1.5 border border-amber-100 text-right">${((plan.expected_cost_usd as number) || 0).toLocaleString()}</td>
                                                                <td className="px-2 py-1.5 border border-amber-100 text-right text-emerald-700">${((plan.expected_loss_prevented_usd as number) || 0).toLocaleString()}</td>
                                                                <td className="px-2 py-1.5 border border-amber-100">{((plan.actions as string[]) || []).slice(0, 1).join(', ')}</td>
                                                            </tr>
                                                        )}
                                                        {altPlans.map((alt, i) => {
                                                            const a = alt as Record<string, unknown>;
                                                            return (
                                                                <tr key={i} className="hover:bg-slate-50">
                                                                    <td className="px-2 py-1.5 border border-slate-100 text-slate-500">{a.plan_id as string}</td>
                                                                    <td className="px-2 py-1.5 border border-slate-100 text-right">${((a.expected_cost_usd as number) || 0).toLocaleString()}</td>
                                                                    <td className="px-2 py-1.5 border border-slate-100 text-right text-emerald-600">${((a.expected_loss_prevented_usd as number) || 0).toLocaleString()}</td>
                                                                    <td className="px-2 py-1.5 border border-slate-100">{((a.actions as string[]) || []).slice(0, 1).join(', ')}</td>
                                                                </tr>
                                                            );
                                                        })}
                                                    </tbody>
                                                </table>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            </PipelineStage>

                            {/* ACTION */}
                            <PipelineStage stage={STAGES[3]} expanded={expanded.action} onToggle={() => toggleStage('action')}>
                                <div className="mt-3 space-y-2">
                                    {steps.length > 0 ? (
                                        steps.map((step, i) => (
                                            <div key={i} className="flex items-start gap-3">
                                                <div className="flex-shrink-0 w-6 h-6 rounded-full bg-emerald-500 text-white text-xs flex items-center justify-center font-bold">{i + 1}</div>
                                                <p className="text-sm text-slate-700 mt-0.5">{step}</p>
                                            </div>
                                        ))
                                    ) : (
                                        <p className="text-sm text-slate-400">No execution steps recorded yet.</p>
                                    )}
                                    <div className="text-xs text-emerald-700 bg-emerald-50 rounded px-3 py-2 mt-2">
                                        All actions require human approval before execution. Go to <strong>Actions</strong> to approve or reject.
                                    </div>
                                </div>
                            </PipelineStage>

                            {/* Plan revision history */}
                            {(selectedCase.plan_iterations || []).length > 0 && (
                                <div className="bg-white border border-slate-200 rounded-xl p-4">
                                    <p className="text-sm font-semibold text-slate-700 mb-3 flex items-center gap-1.5">
                                        <Eye size={14} /> Plan Revision History
                                    </p>
                                    <div className="space-y-2">
                                        {(selectedCase.plan_iterations as Record<string, unknown>[]).map((iter, i) => (
                                            <div key={i} className="flex items-start gap-3 text-sm border-l-2 border-slate-200 pl-3">
                                                <div>
                                                    <span className="font-medium text-slate-700">Revision {i + 1}</span>
                                                    <span className="text-slate-400 ml-2 text-xs">{iter.timestamp as string}</span>
                                                    <span className="ml-2 text-xs text-red-500 font-medium">{iter.status as string}</span>
                                                    {iter.rejected_reason && (
                                                        <p className="text-xs text-slate-500 mt-0.5">Reason: {iter.rejected_reason as string}</p>
                                                    )}
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>
                    );
                })()}
            </div>
        </div>
    );
}
