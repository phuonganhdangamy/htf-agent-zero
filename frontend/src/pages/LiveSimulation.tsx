import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
    Activity,
    Terminal,
    Cpu,
    Globe,
    Zap,
    Shield,
    Clock,
    DollarSign,
    AlertTriangle,
    Package,
    MapPin
} from 'lucide-react';
import { motion } from 'motion/react';
import { supabase } from '../lib/supabase';
import axios from 'axios';

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:8000';
const DEFAULT_COMPANY_ID = 'ORG_DEMO';
const DEFAULT_SCENARIO = `Large order incoming: 50,000 units PROD_001 for Q3 delivery. Single-source dependency on SUPP_044 (Taiwan). Current inventory at 4.2 days cover. Assess risk and recommend procurement strategy.`;

const ORDER_VOLUME_OPTIONS = [
    { value: 'routine', label: 'Routine reorder (< 10,000 units)' },
    { value: 'large', label: 'Large order (10,000 – 50,000 units)' },
    { value: 'critical', label: 'Critical surge (50,000 – 100,000 units)' },
    { value: 'emergency', label: 'Emergency max capacity (100k+ units)' },
] as const;
const TIMELINE_OPTIONS = [
    { value: 'flexible', label: 'Flexible (90+ days)' },
    { value: 'standard', label: 'Standard (60 days)' },
    { value: 'tight', label: 'Tight (30 days)' },
    { value: 'critical', label: 'Critical (< 2 weeks)' },
] as const;
const BUDGET_OPTIONS = [
    { value: 'strict', label: 'Strict — hold cost cap ($50k)' },
    { value: 'flexible', label: 'Flexible — up to 2× cap ($100k)' },
    { value: 'emergency', label: 'Emergency — no cap' },
] as const;
const RISK_TOLERANCE_OPTIONS = ['conservative', 'balanced', 'aggressive'] as const;

const DEFAULT_DIRECTIVES: Record<string, boolean> = {
    monitor_global_signals: true,
    protect_prod_001_margin: true,
    minimize_lead_time_variance: true,
    enforce_cost_cap: true,
    auto_escalate_critical: false,
    prefer_backup_suppliers: false,
};
const REJECTION_REASONS = ['No reason given', 'Too expensive', 'Wrong supplier', 'Wrong action type', 'Other'] as const;
const ACTION_TYPES = ['EXPEDITE_AIR_FREIGHT', 'ACTIVATE_BACKUP_SUPPLIER', 'REROUTE_SHIPMENT', 'INCREASE_SAFETY_STOCK', 'REALLOCATE_INVENTORY', 'DUAL_SOURCE_SUPPLIER', 'ADJUST_PRODUCTION_SCHEDULE', 'SUBSTITUTE_MATERIAL'];

const DIRECTIVE_LABELS: Record<string, { label: string; desc?: string; icon?: string }> = {
    monitor_global_signals: { label: 'MONITOR_GLOBAL_SIGNALS', desc: 'Pull live signals from perception layer', icon: '⚡' },
    protect_prod_001_margin: { label: 'PROTECT_PROD_001_MARGIN', desc: 'Prioritize margin protection in plans', icon: '🛡' },
    minimize_lead_time_variance: { label: 'MINIMIZE_LEAD_TIME_VARIANCE', icon: '⏱' },
    enforce_cost_cap: { label: 'ENFORCE_COST_CAP', desc: 'Hard stop at budget flexibility setting', icon: '💰' },
    auto_escalate_critical: { label: 'AUTO_ESCALATE_CRITICAL', desc: 'Bypass approval for critical cases', icon: '🔔' },
    prefer_backup_suppliers: { label: 'PREFER_BACKUP_SUPPLIERS', desc: 'Default to backup over expediting', icon: '📦' },
};

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
interface PlanIterationEntry {
    plan?: RecommendedPlan | Record<string, unknown>;
    status: string;
    rejected_reason?: string;
    timestamp?: string;
    actor?: string;
}
interface RiskCaseRow {
    case_id: string;
    headline: string;
    status: string;
    scores?: { likelihood?: number; impact?: number; urgency?: number; overall_risk?: number; overall?: number; probability?: number };
    hypotheses?: Array<{ title?: string; description?: string }> | { chain?: string[]; likelihood?: number; unknowns?: string[] };
    recommended_plan?: string | RecommendedPlan;
    alternative_plans?: unknown[];
    reasoning_summary?: string[];
    iteration_count?: number;
    plan_iterations?: PlanIterationEntry[];
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
    const [orderVolume, setOrderVolume] = useState<string>('large');
    const [timeline, setTimeline] = useState<string>('tight');
    const [budgetFlexibility, setBudgetFlexibility] = useState<string>('strict');
    const [riskTolerance, setRiskTolerance] = useState<string>('balanced');
    const [isSimulating, setIsSimulating] = useState(false);
    const [executionLog, setExecutionLog] = useState<string[]>([]);
    const [latestCase, setLatestCase] = useState<RiskCaseRow | null>(null);
    const [pendingProposal, setPendingProposal] = useState<ChangeProposalRow | null>(null);
    const [savingCase, setSavingCase] = useState(false);

    const [companyProfile, setCompanyProfile] = useState<{ company_name?: string; risk_appetite?: string; cost_cap_usd?: number }>({});
    const [suppliers, setSuppliers] = useState<any[]>([]);
    const [inventoryBySupplier, setInventoryBySupplier] = useState<Record<string, { days: number; safetyStockDays: number }>>({});
    const [materials, setMaterials] = useState<{ material_id: string; material_name?: string }[]>([]);
    const [regionFlags, setRegionFlags] = useState<{ country: string; level: 'high' | 'medium' | 'low' }[]>([]);
    const [memoryPatterns, setMemoryPatterns] = useState<any[]>([]);

    const [focusSuppliers, setFocusSuppliers] = useState<Set<string>>(new Set());
    const [focusMaterials, setFocusMaterials] = useState<Set<string>>(new Set());
    const [flaggedRegions, setFlaggedRegions] = useState<Set<string>>(new Set());
    const [directives, setDirectives] = useState<Record<string, boolean>>(DEFAULT_DIRECTIVES);

    const [showRejectionPanel, setShowRejectionPanel] = useState(false);
    const [rejectionReason, setRejectionReason] = useState<string>('No reason given');
    const [rejectionMaxCost, setRejectionMaxCost] = useState<string>('');
    const [rejectionPreferredSupplier, setRejectionPreferredSupplier] = useState<string>('');
    const [rejectionExcludedActions, setRejectionExcludedActions] = useState<Set<string>>(new Set());
    const [rejectionFeedbackText, setRejectionFeedbackText] = useState('');
    const [rerunning, setRerunning] = useState(false);
    const [maxIterationsReached, setMaxIterationsReached] = useState(false);

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
                const [prefsRes, suppRes, invRes, matRes, sigRes, patRes] = await Promise.all([
                    supabase.from('memory_preferences').select('*').eq('org_id', DEFAULT_COMPANY_ID).maybeSingle(),
                    supabase.from('suppliers').select('*').order('supplier_id'),
                    supabase.from('inventory').select('supplier_id, days_of_inventory_remaining, safety_stock_days'),
                    supabase.from('materials').select('material_id, material_name'),
                    supabase.from('signal_events').select('country, risk_category, confidence_score').order('created_at', { ascending: false }).limit(50),
                    supabase.from('memory_patterns').select('*').limit(20)
                ]);
                const obj = prefsRes.data?.objectives || {};
                setCompanyProfile({
                    company_name: 'Omni Manufacturing',
                    risk_appetite: obj.risk_appetite || 'medium',
                    cost_cap_usd: obj.cost_cap_usd ?? obj.cost_cap ?? 50000
                });
                const suppList = suppRes.data || [];
                setSuppliers(suppList);
                const invList = invRes.data || [];
                const bySupp: Record<string, { days: number; safetyStockDays: number }> = {};
                invList.forEach((i: any) => {
                    const sid = i.supplier_id;
                    if (!sid) return;
                    const days = Number(i.days_of_inventory_remaining);
                    const safety = Number(i.safety_stock_days) || 0;
                    if (bySupp[sid] == null || days < (bySupp[sid].days || 0)) bySupp[sid] = { days, safetyStockDays: safety };
                });
                setInventoryBySupplier(bySupp);
                setMaterials(matRes.data || []);
                const countries = new Map<string, 'high' | 'medium' | 'low'>();
                (sigRes.data || []).forEach((s: any) => {
                    const c = s.country;
                    if (!c) return;
                    const conf = Number(s.confidence_score) ?? 0.5;
                    const cat = (s.risk_category || '').toLowerCase();
                    const level = conf >= 0.7 || cat.includes('critical') ? 'high' : conf >= 0.4 ? 'medium' : 'low';
                    if (!countries.has(c)) countries.set(c, level);
                });
                setRegionFlags(Array.from(countries.entries()).map(([country, level]) => ({ country, level })));
                setMemoryPatterns(patRes.data || []);

                if (suppList.length) setFocusSuppliers(new Set(suppList.map((s: any) => s.supplier_id)));
                if (matRes.data?.length) setFocusMaterials(new Set((matRes.data as any[]).map(m => m.material_id)));
                const dir = (prefsRes.data?.objectives as any)?.directives;
                if (dir && typeof dir === 'object') setDirectives({ ...DEFAULT_DIRECTIVES, ...dir });
            } catch (_) {
                setSuppliers([]);
                setMaterials([]);
                setRegionFlags([]);
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

    const persistDirectives = useCallback(async (next: Record<string, boolean>) => {
        if (!supabase) return;
        try {
            const { data: prefs } = await supabase.from('memory_preferences').select('objectives').eq('org_id', DEFAULT_COMPANY_ID).maybeSingle();
            const objectives = (prefs?.objectives as Record<string, unknown>) || {};
            await supabase.from('memory_preferences').upsert({
                org_id: DEFAULT_COMPANY_ID,
                objectives: { ...objectives, directives: next },
                last_updated: new Date().toISOString()
            }, { onConflict: 'org_id' });
        } catch (e) {
            console.error('Failed to persist directives', e);
        }
    }, []);

    const setDirective = useCallback((key: string, value: boolean) => {
        setDirectives(prev => {
            const next = { ...prev, [key]: value };
            persistDirectives(next);
            return next;
        });
    }, [persistDirectives]);

    const runCycle = async () => {
        setIsSimulating(true);
        setExecutionLog([]);
        setLatestCase(null);
        setPendingProposal(null);
        setExecutionLog(prev => [...prev, '[System] Starting agent pipeline...']);
        const severityMap = { routine: 50, large: 65, critical: 80, emergency: 100 };
        const urgencyMap = { flexible: 30, standard: 50, tight: 75, critical: 95 };
        const severity = severityMap[orderVolume as keyof typeof severityMap] ?? 65;
        const urgency = urgencyMap[timeline as keyof typeof urgencyMap] ?? 75;
        try {
            await axios.post(`${API_BASE}/api/agent/run`, {
                company_id: DEFAULT_COMPANY_ID,
                trigger: scenarioText.slice(0, 100),
                scenario_text: scenarioText,
                scenario: scenarioText,
                order_volume: orderVolume,
                timeline,
                budget_flexibility: budgetFlexibility,
                risk_tolerance: riskTolerance,
                severity,
                urgency,
                focus_suppliers: focusSuppliers.size ? Array.from(focusSuppliers) : undefined,
                focus_materials: focusMaterials.size ? Array.from(focusMaterials) : undefined,
                flagged_regions: flaggedRegions.size ? Array.from(flaggedRegions) : undefined,
                directives
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
        if (decision === 'reject') {
            setShowRejectionPanel(true);
            return;
        }
        try {
            await axios.post(`${API_BASE}/api/agent/approve`, {
                proposal_id: pendingProposal.proposal_id,
                approved_by: 'Omni Admin',
                decision: 'approve'
            });
            setPendingProposal(null);
        } catch (e) {
            console.error(e);
        }
    };

    const buildConstraintOverrides = (): Record<string, unknown> => {
        const out: Record<string, unknown> = {};
        if (rejectionReason === 'Too expensive' && rejectionMaxCost.trim()) {
            const n = parseInt(rejectionMaxCost.replace(/[^0-9]/g, ''), 10);
            if (!isNaN(n)) out.max_cost_usd = n;
        }
        if (rejectionReason === 'Wrong supplier' && rejectionPreferredSupplier) out.preferred_supplier = rejectionPreferredSupplier;
        if (rejectionReason === 'Wrong action type' && rejectionExcludedActions.size) out.excluded_actions = Array.from(rejectionExcludedActions);
        return out;
    };

    const handleRerunWithFeedback = async () => {
        if (!latestCase?.case_id) return;
        setRerunning(true);
        setMaxIterationsReached(false);
        try {
            const res = await axios.post(`${API_BASE}/api/agent/rerun`, {
                case_id: latestCase.case_id,
                rejection_reason: rejectionReason,
                feedback_text: rejectionFeedbackText.trim() || undefined,
                constraint_overrides: buildConstraintOverrides(),
                actor: 'Omni Admin'
            });
            const data = res.data || {};
            if (data.status === 'error' && String(data.message || '').includes('Maximum iterations')) {
                setMaxIterationsReached(true);
                setShowRejectionPanel(false);
                setPendingProposal(null);
            } else {
                setShowRejectionPanel(false);
                setRejectionFeedbackText('');
                const caseRes = await axios.get(`${API_BASE}/api/agent/cases/${latestCase.case_id}`).catch(() => null);
                if (caseRes?.data) setLatestCase(caseRes.data);
                if (supabase) {
                    const runsRes = await supabase.from('action_runs').select('action_run_id').eq('case_id', latestCase.case_id);
                    const runIds = (runsRes.data || []).map((r: any) => r.action_run_id);
                    if (runIds.length) {
                        const propRes = await supabase.from('change_proposals').select('*').in('action_run_id', runIds).eq('status', 'pending').limit(1);
                        setPendingProposal(propRes.data?.[0] || null);
                    }
                }
                setExecutionLog(prev => [...prev, '[PlanGenerator] Rerunning with user constraints...', '[ExecutionPlanner] Awaiting approval for revised plan']);
            }
        } catch (e: any) {
            const msg = e.response?.data?.message ?? e.message ?? '';
            if (String(msg).includes('Maximum iterations')) {
                setMaxIterationsReached(true);
                setShowRejectionPanel(false);
            }
            setExecutionLog(prev => [...prev, `[System] Rerun error: ${msg}`]);
        } finally {
            setRerunning(false);
        }
    };

    const handleAbandon = async () => {
        if (!latestCase?.case_id) return;
        try {
            await axios.post(`${API_BASE}/api/agent/abandon`, {
                case_id: latestCase.case_id,
                actor: 'Omni Admin',
                reason: rejectionFeedbackText.trim() || undefined
            });
            setLatestCase(null);
            setPendingProposal(null);
            setShowRejectionPanel(false);
            setRejectionFeedbackText('');
            setExecutionLog([]);
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
                {/* Left: Company + Focus Suppliers/Materials/Regions + Memory Patterns */}
                <aside className="lg:col-span-3 border-r border-slate-200 p-6 bg-white overflow-y-auto">
                    <section className="mb-6">
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
                    <section className="mb-6">
                        <h2 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Focus Suppliers</h2>
                        <p className="text-[10px] text-slate-500 mb-3">Agent will prioritize these in its analysis</p>
                        <div className="space-y-3">
                            {suppliers.length === 0 && <p className="text-slate-500 text-sm">No suppliers.</p>}
                            {suppliers.map((s: any) => {
                                const sid = s.supplier_id;
                                const checked = focusSuppliers.has(sid);
                                const inv = inventoryBySupplier[sid];
                                const days = inv?.days ?? null;
                                const safety = inv?.safetyStockDays ?? 0;
                                const belowSafety = days != null && safety > 0 && days < safety;
                                const rawCrit = s.criticality_score;
                                const crit = rawCrit != null && Number(rawCrit) > 100 ? 100 : (rawCrit ?? '—');
                                if (rawCrit != null && Number(rawCrit) > 100) console.warn('Supplier criticality_score > 100 capped for display', sid, rawCrit);
                                return (
                                    <label key={s.id || sid} className={`flex gap-3 p-3 border rounded-lg shadow-sm cursor-pointer ${checked ? 'border-slate-200 bg-slate-50' : 'border-slate-100 bg-slate-50/50 opacity-70'}`}>
                                        <input type="checkbox" checked={checked} onChange={() => setFocusSuppliers(prev => { const n = new Set(prev); if (n.has(sid)) n.delete(sid); else n.add(sid); return n; })} className="mt-1" />
                                        <div className="flex-1 min-w-0">
                                            <div className="flex justify-between items-start mb-1">
                                                <span className="font-mono text-xs font-bold text-slate-800">{sid}</span>
                                                <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full shrink-0 ${s.single_source ? 'bg-amber-100 text-amber-800' : 'bg-slate-200 text-slate-700'}`}>
                                                    {s.single_source ? 'SINGLE_SOURCE' : 'BACKUP'}
                                                </span>
                                            </div>
                                            <p className="text-sm font-medium text-slate-600 flex items-center gap-1.5"><Globe size={14} /> {s.country}</p>
                                            <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[10px] font-mono">
                                                <span>Inventory: {days != null ? `${days}d` : '—'} {belowSafety && <span className="text-red-600 font-semibold">below safety</span>}</span>
                                                <span>Lead time: {s.lead_time_days != null ? `${s.lead_time_days}d` : '—'}</span>
                                            </div>
                                            <div className="mt-1 flex justify-between items-center pt-1 border-t border-slate-200/50">
                                                <span className="text-[10px] text-slate-500 font-semibold">Criticality</span>
                                                <span className="font-mono text-xs font-bold text-rose-600">{crit}</span>
                                            </div>
                                        </div>
                                    </label>
                                );
                            })}
                        </div>
                    </section>
                    <section className="mb-6">
                        <h2 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-3">Focus Materials</h2>
                        <div className="flex flex-wrap gap-2">
                            {materials.length === 0 && <p className="text-slate-500 text-sm">No materials.</p>}
                            {materials.map((m: any) => {
                                const mid = m.material_id;
                                const selected = focusMaterials.has(mid);
                                return (
                                    <button
                                        key={mid}
                                        type="button"
                                        onClick={() => setFocusMaterials(prev => { const n = new Set(prev); if (n.has(mid)) n.delete(mid); else n.add(mid); return n; })}
                                        className={`px-3 py-1.5 rounded-full text-xs font-mono font-semibold transition-colors ${selected ? 'bg-blue-600 text-white' : 'bg-slate-200 text-slate-600'}`}
                                    >
                                        {mid}
                                    </button>
                                );
                            })}
                        </div>
                    </section>
                    <section className="mb-6">
                        <h2 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-3">Region Risk Flags</h2>
                        <div className="flex flex-wrap gap-2">
                            {regionFlags.length === 0 && <p className="text-slate-500 text-sm">No regions from signals.</p>}
                            {regionFlags.map((r) => {
                                const selected = flaggedRegions.has(r.country);
                                const dot = r.level === 'high' ? '🔴' : r.level === 'medium' ? '🟡' : '🟢';
                                return (
                                    <button
                                        key={r.country}
                                        type="button"
                                        onClick={() => setFlaggedRegions(prev => { const n = new Set(prev); if (n.has(r.country)) n.delete(r.country); else n.add(r.country); return n; })}
                                        className={`px-3 py-1.5 rounded-full text-xs font-medium flex items-center gap-1.5 transition-colors ${selected ? 'ring-2 ring-blue-500 bg-blue-50 text-slate-800' : 'bg-slate-100 text-slate-600'}`}
                                    >
                                        <span>{dot}</span> {r.country}
                                    </button>
                                );
                            })}
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
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-xs font-semibold text-slate-500 uppercase mb-1">Order Volume Pressure</label>
                                    <select value={orderVolume} onChange={(e) => setOrderVolume(e.target.value)} className="w-full border border-slate-200 rounded-lg p-2 text-sm font-mono">
                                        {ORDER_VOLUME_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                                    </select>
                                </div>
                                <div>
                                    <label className="block text-xs font-semibold text-slate-500 uppercase mb-1">Delivery Timeline</label>
                                    <select value={timeline} onChange={(e) => setTimeline(e.target.value)} className="w-full border border-slate-200 rounded-lg p-2 text-sm font-mono">
                                        {TIMELINE_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                                    </select>
                                </div>
                                <div>
                                    <label className="block text-xs font-semibold text-slate-500 uppercase mb-1">Budget Flexibility</label>
                                    <select value={budgetFlexibility} onChange={(e) => setBudgetFlexibility(e.target.value)} className="w-full border border-slate-200 rounded-lg p-2 text-sm font-mono">
                                        <option value="strict">Strict — hold cost cap (${((companyProfile.cost_cap_usd ?? 50000) / 1000).toFixed(0)}k)</option>
                                        <option value="flexible">Flexible — up to 2× cap (${((2 * (companyProfile.cost_cap_usd ?? 50000)) / 1000).toFixed(0)}k)</option>
                                        <option value="emergency">Emergency — no cap</option>
                                    </select>
                                </div>
                                <div>
                                    <label className="block text-xs font-semibold text-slate-500 uppercase mb-2">Risk Tolerance</label>
                                    <div className="flex gap-1 p-1 border border-slate-200 rounded-lg bg-slate-50">
                                        {RISK_TOLERANCE_OPTIONS.map(r => (
                                            <button
                                                key={r}
                                                type="button"
                                                onClick={() => setRiskTolerance(r)}
                                                className={`flex-1 py-1.5 rounded text-[10px] font-bold uppercase tracking-wider ${riskTolerance === r ? 'bg-slate-800 text-white' : 'text-slate-600 hover:bg-slate-200'}`}
                                            >
                                                {r}
                                            </button>
                                        ))}
                                    </div>
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
                                {(() => {
                                    const iters = latestCase.plan_iterations || [];
                                    if (iters.length === 0) return null;
                                    return (
                                        <div className="space-y-2">
                                            <h4 className="text-xs font-bold text-slate-500 uppercase mb-2">Iteration history</h4>
                                            {iters.map((entry, idx) => {
                                                const plan = entry.plan && typeof entry.plan === 'object' ? entry.plan as RecommendedPlan : {};
                                                const name = plan.name ?? 'Plan';
                                                const cost = plan.expected_cost_usd;
                                                return (
                                                    <details key={idx} className="border border-slate-200 rounded-lg bg-slate-50 overflow-hidden" open={false}>
                                                        <summary className="px-3 py-2 cursor-pointer font-medium text-sm text-slate-700 list-none flex items-center justify-between gap-2">
                                                            <span>— Iteration {idx + 1} (REJECTED)</span>
                                                        </summary>
                                                        <div className="px-3 pb-3 pt-0 text-sm text-slate-600 border-t border-slate-200">
                                                            <p className="font-medium text-slate-800">{name}{cost != null ? ` — $${Number(cost).toLocaleString()}` : ''}</p>
                                                            <p className="text-xs text-rose-600 mt-1">Rejected by {entry.actor || 'User'} — &quot;{entry.rejected_reason ?? 'No reason given'}&quot;</p>
                                                        </div>
                                                    </details>
                                                );
                                            })}
                                            {latestCase.recommended_plan && (
                                                <details className="border border-amber-200 rounded-lg bg-amber-50/50 overflow-hidden" open>
                                                    <summary className="px-3 py-2 cursor-pointer font-medium text-sm text-slate-700 list-none">
                                                        — Iteration {(iters.length || 0) + 1} (PENDING APPROVAL)
                                                    </summary>
                                                    <div className="px-3 pb-3 pt-0 text-sm border-t border-amber-200">
                                                        {(() => {
                                                            const rp = typeof latestCase.recommended_plan === 'string'
                                                                ? (() => { try { return latestCase.recommended_plan!.startsWith('{') ? JSON.parse(latestCase.recommended_plan as string) : { name: latestCase.recommended_plan }; } catch { return { name: latestCase.recommended_plan }; } })()
                                                                : (latestCase.recommended_plan as RecommendedPlan);
                                                            return (
                                                                <>
                                                                    <p className="font-medium text-slate-800">{rp.name ?? '—'}</p>
                                                                    {rp.actions?.length ? <ul className="list-disc list-inside mt-1 text-slate-600">{rp.actions.map((a: string, i: number) => <li key={i}>{a}</li>)}</ul> : null}
                                                                </>
                                                            );
                                                        })()}
                                                    </div>
                                                </details>
                                            )}
                                        </div>
                                    );
                                })()}
                                {latestCase.recommended_plan && !(latestCase.plan_iterations?.length) && (() => {
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

                        {showRejectionPanel && latestCase && (
                            <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-4">
                                <h3 className="text-sm font-bold text-slate-800 border-b border-slate-200 pb-2">Why the agent recommended this</h3>
                                <ul className="text-sm text-slate-700 list-disc list-inside space-y-1">
                                    {(latestCase.reasoning_summary && latestCase.reasoning_summary.length > 0)
                                        ? latestCase.reasoning_summary.map((line, i) => <li key={i}>{line}</li>)
                                        : <li>No reasoning summary available.</li>}
                                </ul>
                                <h3 className="text-sm font-bold text-slate-800 border-b border-slate-200 pb-2">What would you like to change?</h3>
                                <div className="space-y-2">
                                    {REJECTION_REASONS.map(r => (
                                        <label key={r} className="flex items-center gap-2 cursor-pointer">
                                            <input type="radio" name="rejectionReason" value={r} checked={rejectionReason === r} onChange={() => setRejectionReason(r)} className="rounded-full" />
                                            <span className="text-sm text-slate-700">{r}</span>
                                        </label>
                                    ))}
                                </div>
                                {rejectionReason === 'Too expensive' && (
                                    <div>
                                        <label className="block text-xs font-semibold text-slate-500 uppercase mb-1">Max cost (USD)</label>
                                        <input type="text" value={rejectionMaxCost} onChange={(e) => setRejectionMaxCost(e.target.value)} placeholder="e.g. 20000" className="w-full border border-slate-200 rounded-lg p-2 text-sm font-mono" />
                                    </div>
                                )}
                                {rejectionReason === 'Wrong supplier' && (
                                    <div>
                                        <label className="block text-xs font-semibold text-slate-500 uppercase mb-1">Preferred supplier</label>
                                        <select value={rejectionPreferredSupplier} onChange={(e) => setRejectionPreferredSupplier(e.target.value)} className="w-full border border-slate-200 rounded-lg p-2 text-sm font-mono">
                                            <option value="">— Select —</option>
                                            {suppliers.map((s: any) => <option key={s.supplier_id} value={s.supplier_id}>{s.supplier_id} / {s.country}</option>)}
                                        </select>
                                    </div>
                                )}
                                {rejectionReason === 'Wrong action type' && (
                                    <div>
                                        <label className="block text-xs font-semibold text-slate-500 uppercase mb-2">Exclude these action types</label>
                                        <div className="flex flex-wrap gap-2">
                                            {ACTION_TYPES.map(a => (
                                                <label key={a} className="flex items-center gap-1.5 text-xs cursor-pointer">
                                                    <input type="checkbox" checked={rejectionExcludedActions.has(a)} onChange={() => setRejectionExcludedActions(prev => { const n = new Set(prev); if (n.has(a)) n.delete(a); else n.add(a); return n; })} />
                                                    <span className="font-mono">{a}</span>
                                                </label>
                                            ))}
                                        </div>
                                    </div>
                                )}
                                <div>
                                    <label className="block text-xs font-semibold text-slate-500 uppercase mb-1">Additional instructions for the agent</label>
                                    <textarea value={rejectionFeedbackText} onChange={(e) => setRejectionFeedbackText(e.target.value)} placeholder="e.g. Keep cost under $20,000. Prefer SUPP_021." className="w-full border border-slate-200 rounded-lg p-3 text-sm min-h-[60px]" />
                                </div>
                                <div className="flex gap-3 pt-2">
                                    <button onClick={handleRerunWithFeedback} disabled={rerunning} className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-semibold hover:bg-blue-700 disabled:opacity-50">Rerun with feedback</button>
                                    <button onClick={handleAbandon} className="px-4 py-2 border border-slate-300 text-slate-700 rounded-lg text-sm font-semibold hover:bg-slate-100">Abandon scenario</button>
                                </div>
                            </div>
                        )}

                        {maxIterationsReached && latestCase && (
                            <div className="bg-amber-50 border border-amber-200 rounded-xl p-5">
                                <p className="text-sm font-medium text-slate-800 mb-3">Maximum iterations (3) reached. Save scenario to Risk Cases for manual review.</p>
                                <button onClick={saveAsRiskCase} disabled={savingCase} className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-semibold hover:bg-blue-700 disabled:opacity-50">{savingCase ? 'Saving...' : 'Save to Risk Cases'}</button>
                            </div>
                        )}

                        {pendingProposal && !showRejectionPanel && !maxIterationsReached && (() => {
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
                            <div className="space-y-4">
                                {Object.entries(DIRECTIVE_LABELS).map(([key, { label, desc, icon }]) => (
                                    <div key={key} className="flex items-center justify-between gap-3">
                                        <div className="min-w-0">
                                            <p className="text-xs font-mono font-medium flex items-center gap-1.5">
                                                {icon && <span>{icon}</span>} {label}
                                            </p>
                                            {desc && <p className="text-[10px] text-slate-500 mt-0.5">{desc}</p>}
                                        </div>
                                        <button
                                            type="button"
                                            role="switch"
                                            aria-checked={directives[key] ?? false}
                                            onClick={() => setDirective(key, !(directives[key] ?? false))}
                                            className={`shrink-0 relative w-11 h-6 rounded-full transition-colors ${directives[key] ? 'bg-blue-500' : 'bg-slate-600'}`}
                                        >
                                            <span className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-all ${directives[key] ? 'left-5' : 'left-0.5'}`} />
                                        </button>
                                    </div>
                                ))}
                            </div>
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
