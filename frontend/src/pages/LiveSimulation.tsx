import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import {
    Activity,
    Shield,
    Brain,
    Zap,
    Database,
    ChevronRight,
    Terminal,
    Cpu,
    Globe
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { supabase } from '../lib/supabase';
import axios from 'axios';

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:8000';
const DEFAULT_COMPANY_ID = 'ORG_DEMO';
const DEFAULT_SCENARIO = `Large order incoming: 50,000 units PROD_001 for Q3 delivery. Single-source dependency on SUPP_044 (Taiwan). Current inventory at 4.2 days cover. Assess risk and recommend procurement strategy.`;

interface ExecutionStep { agent?: string; action?: string; step?: number }
interface RecommendedPlan {
  plan_id?: string;
  name?: string;
  actions?: string[];
  expected_cost_usd?: number;
  expected_loss_prevented_usd?: number;
  expected_delay_days?: number;
  service_level?: number;
}
interface RiskCaseRow {
    case_id: string;
    headline: string;
    status: string;
    scores?: { likelihood?: number; impact?: number; urgency?: number; overall_risk?: number; overall?: number; probability?: number };
    hypotheses?: Array<{ title?: string; description?: string }> | { chain?: string[]; likelihood?: number; unknowns?: string[] };
    recommended_plan?: string | RecommendedPlan;
    alternative_plans?: unknown[];
    execution_steps?: ExecutionStep[] | string[];
}
interface ChangeProposalRow {
    proposal_id: string;
    action_run_id: string;
    system: string;
    entity_type: string;
    entity_id: string;
    diff: unknown;
    status: string;
}

export default function LiveSimulation() {
    const navigate = useNavigate();
    const [scenarioText, setScenarioText] = useState(DEFAULT_SCENARIO);
    const [severity, setSeverity] = useState(70);
    const [urgency, setUrgency] = useState(75);
    const [isSimulating, setIsSimulating] = useState(false);
    const [executionLog, setExecutionLog] = useState<string[]>([]);
    const [latestCase, setLatestCase] = useState<RiskCaseRow | null>(null);
    const [pendingProposal, setPendingProposal] = useState<ChangeProposalRow | null>(null);
    const [savingCase, setSavingCase] = useState(false);

    const [companyProfile, setCompanyProfile] = useState<{ company_name?: string; risk_appetite?: string; cost_cap_usd?: number }>({});
    const [suppliers, setSuppliers] = useState<any[]>([]);
    const [memoryPatterns, setMemoryPatterns] = useState<any[]>([]);
    const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
    const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const logEndRef = useRef<HTMLDivElement>(null);
    const POLL_INTERVAL_MS = 2000;
    const RUN_TIMEOUT_MS = 90000;

    useEffect(() => {
        logEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [executionLog]);

    useEffect(() => {
        if (!supabase) return;
        (async () => {
            try {
                const [prefsRes, suppRes, patRes] = await Promise.all([
                    supabase.from('memory_preferences').select('*').eq('org_id', DEFAULT_COMPANY_ID).maybeSingle(),
                    supabase.from('suppliers').select('*').order('supplier_id'),
                    supabase.from('memory_patterns').select('*').limit(20)
                ]);
                const obj = prefsRes.data?.objectives || {};
                setCompanyProfile({
                    company_name: 'Omni Manufacturing',
                    risk_appetite: obj.risk_appetite || 'medium',
                    cost_cap_usd: obj.cost_cap_usd ?? obj.cost_cap ?? 50000
                });
                setSuppliers(suppRes.data || []);
                setMemoryPatterns(patRes.data || []);
            } catch (_) {
                setSuppliers([]);
                setMemoryPatterns([]);
            }
        })();
    }, []);

    const stopSimulating = () => {
        setIsSimulating(false);
        if (pollRef.current) {
            clearInterval(pollRef.current);
            pollRef.current = null;
        }
        if (timeoutRef.current) {
            clearTimeout(timeoutRef.current);
            timeoutRef.current = null;
        }
    };

    const runCycle = async () => {
        setIsSimulating(true);
        setExecutionLog([]);
        setLatestCase(null);
        setPendingProposal(null);
        setExecutionLog(prev => [...prev, '[System] Starting agent pipeline...']);
        try {
            await axios.post(`${API_BASE}/api/agent/run`, {
                company_id: DEFAULT_COMPANY_ID,
                trigger: scenarioText.slice(0, 100),
                scenario_text: scenarioText,
                severity,
                urgency
            });
            if (pollRef.current) clearInterval(pollRef.current);
            pollRef.current = setInterval(pollCases, POLL_INTERVAL_MS);
            pollCases();
            timeoutRef.current = setTimeout(() => {
                if (pollRef.current) {
                    setExecutionLog(prev => [...prev, '[System] Run timed out (90s). Check backend logs.']);
                    stopSimulating();
                }
            }, RUN_TIMEOUT_MS);
        } catch (err: any) {
            setExecutionLog(prev => [...prev, `[System] Error: ${err.response?.data?.detail ?? err.message ?? 'Failed to start run'}`]);
            stopSimulating();
        }
    };

    const pollCases = async () => {
        try {
            const { data } = await axios.get(`${API_BASE}/api/agent/cases`, {
                params: { status: 'open', limit: 1, order: 'created_at.desc' }
            });
            const cases = Array.isArray(data) ? data : [];
            const c = cases[0] as RiskCaseRow | undefined;
            if (c) {
                setLatestCase(c);
                const steps = c.execution_steps || [];
                const stepLines = steps.map((s: ExecutionStep | string) =>
                    typeof s === 'string' ? s : `[${(s as ExecutionStep).agent || 'Step'}] ${(s as ExecutionStep).action || ''}`
                );
                setExecutionLog(prev => [...prev.filter(l => l.startsWith('[System]')), ...stepLines]);
                stopSimulating();
                if (supabase) {
                    const runsRes = await supabase.from('action_runs').select('action_run_id').eq('case_id', c.case_id);
                    const runIds = (runsRes.data || []).map((r: any) => r.action_run_id);
                    if (runIds.length) {
                        const propRes = await supabase.from('change_proposals').select('*').in('action_run_id', runIds).eq('status', 'pending').limit(1);
                        setPendingProposal(propRes.data?.[0] || null);
                    }
                }
            }
        } catch (_) {}
    };

    const handleApprove = async (decision: 'approve' | 'reject') => {
        if (!pendingProposal) return;
        try {
            await axios.post(`${API_BASE}/api/agent/approve`, {
                proposal_id: pendingProposal.proposal_id,
                approved_by: 'Omni Admin',
                decision
            });
            setPendingProposal(null);
        } catch (e) {
            console.error(e);
        }
    };

    const saveAsRiskCase = async () => {
        if (!latestCase) return;
        setSavingCase(true);
        try {
            const { id, ...rest } = latestCase as any;
            const payload = { ...rest, case_id: `SAVED-${latestCase.case_id}-${Date.now()}` };
            const { data } = await axios.post(`${API_BASE}/api/risk_cases`, payload);
            if (data?.case_id) navigate('/cases');
        } catch (e) {
            console.error(e);
        } finally {
            setSavingCase(false);
        }
    };

    const scores = latestCase?.scores || {};
    const likelihood = scores.likelihood ?? scores.probability ?? 0;
    const impact = scores.impact ?? 0;
    const urgencyVal = scores.urgency ?? 0;

    return (
        <div className="bg-slate-50 text-slate-900 font-sans h-full overflow-y-auto">
            <header className="border-b border-slate-200 p-6 flex justify-between items-center bg-white sticky top-0 z-50">
                <div>
                    <h1 className="text-2xl font-bold tracking-tighter flex items-center gap-2 text-slate-900">
                        <Cpu className="w-6 h-6 text-blue-600" /> OMNI <span className="font-light text-slate-400">/ LIVE SIMULATION</span>
                    </h1>
                    <p className="text-xs font-semibold text-slate-500 uppercase tracking-widest mt-1">Autonomous Multi-Agent System</p>
                </div>
                <div className="flex items-center gap-6">
                    <p className="text-xs font-mono font-semibold flex items-center gap-2">
                        <span className={`w-2 h-2 rounded-full ${isSimulating ? 'bg-amber-500 animate-pulse' : 'bg-emerald-500'}`}></span>
                        {isSimulating ? 'PROCESSING_CYCLE' : 'SYSTEM_IDLE'}
                    </p>
                </div>
            </header>

            <main className="grid grid-cols-1 lg:grid-cols-12 gap-0 min-h-[calc(100vh-88px)]">
                {/* Left: Company + Suppliers + Memory Patterns */}
                <aside className="lg:col-span-3 border-r border-slate-200 p-6 bg-white">
                    <section className="mb-8">
                        <h2 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-4 border-b border-slate-100 pb-2">Company Profile</h2>
                        <div className="space-y-3">
                            <div className="flex justify-between items-center text-sm">
                                <span className="text-slate-500">Entity</span>
                                <span className="font-mono font-semibold">{companyProfile.company_name || '—'}</span>
                            </div>
                            <div className="flex justify-between items-center text-sm">
                                <span className="text-slate-500">Appetite</span>
                                <span className="font-mono font-semibold uppercase">{companyProfile.risk_appetite || '—'}</span>
                            </div>
                            <div className="flex justify-between items-center text-sm">
                                <span className="text-slate-500">Cost Cap</span>
                                <span className="font-mono font-semibold">${(companyProfile.cost_cap_usd ?? 0).toLocaleString()}</span>
                            </div>
                        </div>
                    </section>
                    <section className="mb-8">
                        <h2 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-4 border-b border-slate-100 pb-2">Active Suppliers</h2>
                        <div className="space-y-4">
                            {suppliers.length === 0 && <p className="text-slate-500 text-sm">No suppliers in suppliers table.</p>}
                            {suppliers.map((s: any) => (
                                <div key={s.id} className="p-3 border border-slate-200 bg-slate-50 rounded-lg shadow-sm">
                                    <div className="flex justify-between items-start mb-2">
                                        <span className="font-mono text-xs font-bold text-slate-800">{s.supplier_id}</span>
                                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${s.single_source ? 'bg-amber-100 text-amber-800' : 'bg-slate-200 text-slate-700'}`}>
                                            {s.single_source ? 'SINGLE_SOURCE' : 'BACKUP'}
                                        </span>
                                    </div>
                                    <p className="text-sm font-medium text-slate-600 flex items-center gap-1.5"><Globe size={14} /> {s.country}</p>
                                    <div className="mt-3 flex justify-between items-center pt-2 border-t border-slate-200/50">
                                        <span className="text-xs text-slate-500 font-semibold">Criticality</span>
                                        <span className="font-mono text-sm font-bold text-rose-600">{s.criticality_score ?? '—'}</span>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </section>
                    <section>
                        <h2 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-4 border-b border-slate-100 pb-2">Memory Patterns</h2>
                        <div className="space-y-3">
                            {memoryPatterns.length === 0 && <p className="text-slate-500 text-sm">No rows in memory_patterns table.</p>}
                            {memoryPatterns.map((m: any, i: number) => (
                                <div key={m.id || i} className="text-xs p-3 border border-slate-200 bg-blue-50/50 rounded-lg shadow-sm text-slate-700">
                                    <p className="text-[10px] font-bold text-blue-600 mb-1">PATTERN_{i + 1}</p>
                                    <p className="font-semibold leading-tight">{m.pattern_id || JSON.stringify(m.trigger_conditions || '')}</p>
                                </div>
                            ))}
                        </div>
                    </section>
                </aside>

                {/* Center: Scenario + Run + Log + RiskCase + Approval */}
                <section className="lg:col-span-6 border-r border-slate-200 flex flex-col bg-slate-50">
                    <div className="p-4 border-b border-slate-200 bg-white shadow-sm">
                        <h2 className="text-sm font-bold text-slate-800 flex items-center gap-2 mb-4">
                            <Activity size={18} className="text-blue-600" /> Agent Execution Flow
                        </h2>
                        <div className="space-y-3">
                            <label className="block text-xs font-semibold text-slate-500 uppercase">Describe your operational scenario</label>
                            <textarea
                                value={scenarioText}
                                onChange={(e) => setScenarioText(e.target.value)}
                                className="w-full border border-slate-200 rounded-lg p-3 text-sm min-h-[80px]"
                                placeholder="e.g. We are planning a large contract with Toyota for 50,000 units of PROD_001 in Q3. Assess supply chain readiness and risks."
                            />
                            <div className="flex gap-6 items-center">
                                <div className="flex-1">
                                    <label className="block text-xs font-semibold text-slate-500 uppercase mb-1">Severity (0–100)</label>
                                    <input type="range" min="0" max="100" value={severity} onChange={(e) => setSeverity(Number(e.target.value))} className="w-full" />
                                    <span className="font-mono text-sm font-bold">{severity}</span>
                                </div>
                                <div className="flex-1">
                                    <label className="block text-xs font-semibold text-slate-500 uppercase mb-1">Urgency (0–100)</label>
                                    <input type="range" min="0" max="100" value={urgency} onChange={(e) => setUrgency(Number(e.target.value))} className="w-full" />
                                    <span className="font-mono text-sm font-bold">{urgency}</span>
                                </div>
                            </div>
                            <button
                                onClick={runCycle}
                                disabled={isSimulating}
                                className="px-6 py-2 border rounded-md font-mono text-xs uppercase tracking-widest font-bold transition-all border-blue-600 bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50"
                            >
                                {isSimulating ? 'Running...' : 'Run Cycle'}
                            </button>
                        </div>
                    </div>

                    <div className="flex-1 overflow-y-auto p-4 space-y-4">
                        {executionLog.length > 0 && (
                            <div className="bg-slate-900 text-green-400 font-mono text-xs p-4 rounded-lg space-y-1">
                                {executionLog.map((line, i) => (
                                    <div key={i}>{line}</div>
                                ))}
                                <div ref={logEndRef} />
                            </div>
                        )}

                        {!latestCase && executionLog.length === 0 && !isSimulating && (
                            <div className="h-full flex flex-col items-center justify-center text-slate-400 text-center py-20">
                                <Terminal className="w-16 h-16 mb-4 text-slate-300" />
                                <p className="font-mono text-sm font-semibold">AWAITING_COMMAND<br /><span className="text-xs opacity-70">INITIATE_SIMULATION_CYCLE</span></p>
                            </div>
                        )}

                        {latestCase && (
                            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="bg-white border border-slate-200 rounded-xl p-5 space-y-4">
                                <h3 className="font-bold text-slate-900 border-b pb-2">{latestCase.headline}</h3>
                                <div className="flex gap-4 justify-center flex-wrap">
                                    <Gauge label="Likelihood" value={likelihood} />
                                    <Gauge label="Impact" value={impact} />
                                    <Gauge label="Urgency" value={urgencyVal} />
                                </div>
                                {(() => {
                                    const hyp = latestCase.hypotheses;
                                    const chain = hyp && typeof hyp === 'object' && !Array.isArray(hyp) && (hyp as { chain?: string[] }).chain;
                                    const list = Array.isArray(hyp) ? hyp : (chain || []);
                                    return list.length > 0 ? (
                                        <div>
                                            <h4 className="text-xs font-bold text-slate-500 uppercase mb-2">Hypotheses chain</h4>
                                            <div className="flex flex-col gap-2 border-l-2 border-slate-200 pl-4">
                                                {list.map((h: any, i: number) => (
                                                    <div key={i} className="text-sm text-slate-700">
                                                        {typeof h === 'string' ? h : (<><span className="font-semibold">{h.title}</span>{h.description && ` — ${h.description}`}</>)}
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    ) : null;
                                })()}
                                {latestCase.recommended_plan && (() => {
                                    const rp = typeof latestCase.recommended_plan === 'string'
                                        ? (() => { try { return latestCase.recommended_plan!.startsWith('{') ? JSON.parse(latestCase.recommended_plan as string) : { name: latestCase.recommended_plan }; } catch { return { name: latestCase.recommended_plan }; } })()
                                        : (latestCase.recommended_plan as RecommendedPlan);
                                    return (
                                        <div>
                                            <h4 className="text-xs font-bold text-slate-500 uppercase mb-2">Recommended plan</h4>
                                            <p className="text-sm text-slate-700 font-medium">{rp.name ?? '—'}</p>
                                            {rp.actions?.length ? (
                                                <ul className="list-disc list-inside mt-1 text-sm text-slate-600">{rp.actions.map((a, i) => <li key={i}>{a}</li>)}</ul>
                                            ) : null}
                                        </div>
                                    );
                                })()}
                            </motion.div>
                        )}

                        {pendingProposal && (() => {
                            const rp = latestCase?.recommended_plan;
                            const plan = typeof rp === 'string' ? (() => { try { return rp.startsWith('{') ? JSON.parse(rp) : null; } catch { return null; } })() : (rp as RecommendedPlan | undefined);
                            const cost = plan?.expected_cost_usd ?? (pendingProposal.diff as any)?.expected_cost_usd;
                            const lossPrevented = plan?.expected_loss_prevented_usd ?? (pendingProposal.diff as any)?.expected_loss_prevented_usd;
                            const delayDays = plan?.expected_delay_days ?? (pendingProposal.diff as any)?.expected_delay_days;
                            const name = plan?.name ?? pendingProposal.entity_type;
                            const actions = plan?.actions ?? (pendingProposal.diff && typeof (pendingProposal.diff as any).actions === 'object' ? (pendingProposal.diff as any).actions : []);
                            const summary = [
                                name,
                                Array.isArray(actions) && actions.length ? ` + ${actions.slice(0, 2).join('; ')}` : '',
                                cost != null ? `  Estimated cost: $${Number(cost).toLocaleString()}` : '',
                                lossPrevented != null ? `  |  Loss prevented: $${Number(lossPrevented).toLocaleString()}` : '',
                                delayDays != null ? `  |  Lead time saved: ${delayDays} days` : ''
                            ].filter(Boolean).join('');
                            return (
                                <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex flex-wrap items-center justify-between gap-3">
                                    <span className="text-sm font-medium text-slate-800">
                                        Agent recommends: {summary || `Plan ${pendingProposal.entity_id}`}
                                    </span>
                                    <div className="flex gap-2">
                                        <button onClick={() => handleApprove('approve')} className="px-3 py-1.5 bg-emerald-600 text-white rounded-lg text-sm font-medium">APPROVE</button>
                                        <button onClick={() => handleApprove('reject')} className="px-3 py-1.5 bg-rose-600 text-white rounded-lg text-sm font-medium">REJECT</button>
                                    </div>
                                </div>
                            );
                        })()}
                    </div>
                </section>

                {/* Right: Risk Matrix + Supply Chain Health + Save */}
                <aside className="lg:col-span-3 p-6 bg-white">
                    <h2 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-6 border-b border-slate-100 pb-2">Live Risk Matrix</h2>
                    <div className="aspect-square border border-slate-200 bg-slate-50 relative mb-10 rounded-lg overflow-hidden">
                        <div className="absolute inset-0 grid grid-cols-2 grid-rows-2">
                            <div className="border-r border-b border-slate-200 bg-emerald-50/30"></div>
                            <div className="border-b border-slate-200 bg-amber-50/30"></div>
                            <div className="border-r border-slate-200 bg-amber-50/30"></div>
                            <div className="bg-rose-50/30"></div>
                        </div>
                        {latestCase?.scores && (
                            <div
                                className="absolute w-5 h-5 bg-rose-500 rounded-full border-2 border-white shadow-md z-10"
                                style={{
                                    left: `${(scores.probability ?? likelihood) / 100 * 100}%`,
                                    bottom: `${(scores.impact ?? impact) / 100 * 100}%`,
                                    transform: 'translate(-50%, 50%)'
                                }}
                            />
                        )}
                    </div>
                    <div className="space-y-8">
                        <div>
                            <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-4 border-b border-slate-100 pb-2">Supply Chain Health</h3>
                            <div className="space-y-4">
                                <HealthMetric label="Fill Rate Target" value="95%" status="nominal" />
                                <HealthMetric label="Inventory Days" value="4.2d" status="critical" />
                                <HealthMetric label="Safety Stock" value="10d" status="warning" />
                            </div>
                        </div>
                        <button
                            onClick={saveAsRiskCase}
                            disabled={!latestCase || savingCase}
                            className="w-full py-3 px-4 bg-blue-600 text-white rounded-xl font-semibold text-sm hover:bg-blue-700 disabled:opacity-50"
                        >
                            {savingCase ? 'Saving...' : 'Save as Risk Case'}
                        </button>
                        <div className="p-5 border border-slate-200 bg-slate-900 text-slate-300 rounded-xl shadow-md">
                            <h3 className="text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-3 border-b border-slate-700 pb-2">System Directives</h3>
                            <ul className="text-xs font-mono font-medium space-y-3">
                                <li className="flex items-start gap-2"><ChevronRight className="w-4 h-4 text-blue-400 shrink-0" /> MONITOR_GLOBAL_SIGNALS</li>
                                <li className="flex items-start gap-2"><ChevronRight className="w-4 h-4 text-blue-400 shrink-0" /> PROTECT_PROD_001_MARGIN</li>
                                <li className="flex items-start gap-2"><ChevronRight className="w-4 h-4 text-blue-400 shrink-0" /> MINIMIZE_LEAD_TIME_VARIANCE</li>
                            </ul>
                        </div>
                    </div>
                </aside>
            </main>
        </div>
    );
}

function Gauge({ label, value }: { label: string; value: number }) {
    const pct = Math.min(100, Math.max(0, value));
    const color = pct >= 70 ? 'border-rose-500 text-rose-600' : pct >= 40 ? 'border-amber-500 text-amber-600' : 'border-emerald-500 text-emerald-600';
    return (
        <div className="flex flex-col items-center">
            <div className={`w-16 h-16 rounded-full border-4 flex items-center justify-center ${color}`}>
                <span className="font-bold text-lg">{pct}</span>
            </div>
            <span className="text-[10px] font-semibold text-slate-500 uppercase mt-1">{label}</span>
        </div>
    );
}

function HealthMetric({ label, value, status }: { label: string; value: string; status: 'nominal' | 'warning' | 'critical' }) {
    const statusColor = { nominal: 'bg-emerald-500', warning: 'bg-amber-500', critical: 'bg-rose-500' }[status];
    return (
        <div className="flex justify-between items-center p-3 border border-slate-100 bg-slate-50 rounded-lg">
            <span className="text-xs font-semibold text-slate-600">{label}</span>
            <div className="flex items-center gap-3">
                <span className="font-mono text-sm font-bold text-slate-800">{value}</span>
                <div className={`w-2.5 h-2.5 rounded-full ${statusColor}`}></div>
            </div>
        </div>
    );
}
