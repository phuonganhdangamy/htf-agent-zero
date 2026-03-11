import React, { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import axios from 'axios';
import type { ChangeProposal } from '../types';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, CheckCircle, XCircle, Clock, FileText } from 'lucide-react';

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:8000';

function formatExposureValue(val: any): string {
    if (val === null || val === undefined) return '—';
    if (val === '') return '—';
    if (typeof val === 'object') return Array.isArray(val) ? val.join(', ') : JSON.stringify(val);
    return String(val);
}

function renderExposure(exposure: any): React.ReactNode {
    if (!exposure || typeof exposure !== 'object') {
        return <p className="text-sm text-slate-500 italic">No specific exposure data logged.</p>;
    }
    const entries: { label: string; value: React.ReactNode }[] = [];
    if (exposure.suppliers != null && Array.isArray(exposure.suppliers) && exposure.suppliers.length > 0) {
        entries.push({ label: 'Suppliers at risk', value: exposure.suppliers.join(', ') });
    }
    if (exposure.skus != null && Array.isArray(exposure.skus) && exposure.skus.length > 0) {
        entries.push({ label: 'Materials / SKUs at risk', value: exposure.skus.join(', ') });
    }
    if (exposure.inventory_days_cover != null) {
        entries.push({ label: 'Inventory days cover', value: `${exposure.inventory_days_cover} days` });
    }
    if (exposure.pos_at_risk != null && Array.isArray(exposure.pos_at_risk) && exposure.pos_at_risk.length > 0) {
        entries.push({
            label: 'Purchase orders at risk',
            value: exposure.pos_at_risk.map((po: any) => (typeof po === 'object' && po?.po_id ? po.po_id : po)).join(', '),
        });
    }
    if (exposure.affected_assets != null && Array.isArray(exposure.affected_assets) && exposure.affected_assets.length > 0) {
        entries.push({ label: 'Affected assets', value: exposure.affected_assets.join(', ') });
    }
    // Fallback: show remaining keys as label-value
    Object.entries(exposure).forEach(([key]) => {
        if (['suppliers', 'skus', 'inventory_days_cover', 'pos_at_risk', 'affected_assets'].includes(key)) return;
        const v = (exposure as any)[key];
        if (v !== null && v !== undefined) {
            entries.push({
                label: key.replace(/_/g, ' ').replace(/\b\w/g, (s) => s.toUpperCase()),
                value: formatExposureValue(v),
            });
        }
    });
    if (entries.length === 0) {
        return <p className="text-sm text-slate-500 italic">No specific exposure data logged.</p>;
    }
    return (
        <div className="space-y-2 text-sm">
            {entries.map(({ label, value }) => (
                <div key={label} className="flex gap-2">
                    <span className="font-medium text-slate-500 shrink-0">{label}:</span>
                    <span className="text-slate-800 break-words">{value}</span>
                </div>
            ))}
        </div>
    );
}

function formatDiffValue(val: any): string {
    if (val === null || val === undefined) return '[None]';
    if (val === '') return '[Empty]';
    if (typeof val === 'object') return JSON.stringify(val);
    return String(val);
}

function renderProposalDiff(diff: any): React.ReactNode {
    if (!diff || typeof diff !== 'object') return <span className="text-slate-500 italic">{formatDiffValue(diff)}</span>;
    const lines: React.ReactNode[] = [];
    if (Array.isArray(diff.actions) && diff.actions.length > 0) {
        lines.push(
            <div key="actions" className="space-y-1">
                <span className="text-xs font-semibold text-slate-500 uppercase">Proposed actions</span>
                <ul className="list-disc list-inside text-slate-700 space-y-0.5">
                    {diff.actions.map((action: string, idx: number) => (
                        <li key={idx}>{action}</li>
                    ))}
                </ul>
            </div>
        );
    }
    Object.entries(diff).forEach(([key, value]) => {
        if (key === 'actions' || key === 'plan_id') return;
        if (key === 'name') {
            const nameVal = typeof value === 'object' && value !== null ? (value as any).to ?? (value as any).new ?? formatDiffValue(value) : formatDiffValue(value);
            lines.push(
                <div key={key} className="flex flex-wrap gap-x-2 items-baseline text-sm">
                    <span className="font-medium text-slate-500 shrink-0">Plan:</span>
                    <span className="text-slate-800">{nameVal}</span>
                </div>
            );
            return;
        }
        if (value && typeof value === 'object') {
            const oldVal = 'old' in value ? (value as any).old : ('from' in value ? (value as any).from : undefined);
            const newVal = 'new' in value ? (value as any).new : ('to' in value ? (value as any).to : undefined);
            if (oldVal !== undefined || newVal !== undefined) {
                const label = key.replace(/_/g, ' ').replace(/\b\w/g, (s) => s.toUpperCase());
                const isUnchanged = oldVal === newVal;
                lines.push(
                    <div key={key} className="flex flex-wrap gap-x-2 items-baseline text-sm">
                        <span className="font-medium text-slate-500 shrink-0">{label}:</span>
                        {isUnchanged ? (
                            <span className="text-slate-600">{formatDiffValue(oldVal ?? newVal)}</span>
                        ) : (
                            <span className="text-slate-700">
                                <span className="line-through text-slate-400">{formatDiffValue(oldVal)}</span>
                                <span className="mx-1">→</span>
                                <span className="font-medium text-emerald-700">{formatDiffValue(newVal)}</span>
                            </span>
                        )}
                    </div>
                );
                return;
            }
        }
        lines.push(
            <div key={key} className="flex flex-wrap gap-x-2 items-baseline text-sm">
                <span className="font-medium text-slate-500 shrink-0">{key.replace(/_/g, ' ')}:</span>
                <span className="text-slate-800 break-words">{formatDiffValue(value)}</span>
            </div>
        );
    });
    return lines.length > 0 ? <div className="space-y-2">{lines}</div> : <span className="text-slate-500 italic">No details</span>;
}

export default function CaseDetail() {
    const { id } = useParams();
    const navigate = useNavigate();
    const [riskCase, setRiskCase] = useState<any>(null);
    const [proposals, setProposals] = useState<ChangeProposal[]>([]);
    const [loading, setLoading] = useState(true);
    const [closing, setClosing] = useState(false);

    useEffect(() => {
        if (id) {
            fetchCaseDetails(id);
        }
    }, [id]);

    const fetchCaseDetails = async (caseIdOrUuid: string) => {
        try {
            setLoading(true);
            let caseData: any = null;

            if (supabase) {
                const byCaseId = await supabase.from('risk_cases').select('*').eq('case_id', caseIdOrUuid).maybeSingle();
                if (byCaseId.data) {
                    caseData = byCaseId.data;
                } else {
                    const byId = await supabase.from('risk_cases').select('*').eq('id', caseIdOrUuid).maybeSingle();
                    if (byId.data) caseData = byId.data;
                }
            }

            if (!caseData) {
                try {
                    const { data } = await axios.get(`${API_BASE}/api/agent/cases/${caseIdOrUuid}`);
                    caseData = data;
                } catch (_) {
                    /* 404 or network – keep caseData null */
                }
            }

            setRiskCase(caseData);

            if (!caseData) {
                setProposals([]);
                return;
            }

            const caseId = caseData.case_id;
            let runIds: string[] = [];
            if (supabase) {
                const runsRes = await supabase.from('action_runs').select('action_run_id').eq('case_id', caseId);
                runIds = (runsRes.data || []).map((r: any) => r.action_run_id).filter(Boolean);
            }
            if (runIds.length === 0 || !supabase) {
                setProposals([]);
                return;
            }
            const proposalsRes = await supabase
                .from('change_proposals')
                .select('*')
                .in('action_run_id', runIds)
                .in('status', ['pending', 'approved', 'rejected']);
            setProposals(proposalsRes.data || []);
        } catch (err) {
            console.error(err);
        } finally {
            setLoading(false);
        }
    };

    const handleApprove = async (proposalId: string) => {
        try {
            await supabase.from('change_proposals').update({ status: 'approved', approved_by: 'Omni Admin' }).eq('proposal_id', proposalId);
            fetchCaseDetails(id!);
        } catch (err) {
            console.error(err);
        }
    };

    const handleCloseCase = async () => {
        if (!riskCase?.case_id || closing) return;
        setClosing(true);
        try {
            await axios.post(`${API_BASE}/api/agent/abandon`, {
                case_id: riskCase.case_id,
                actor: 'Omni Admin',
                reason: 'Closed from Case Detail',
            });
            navigate('/cases');
        } catch (err) {
            console.error('Failed to close case:', err);
            setClosing(false);
        }
    };

    if (loading) return <div className="p-8 text-center">Loading case details...</div>;
    if (!riskCase) return <div className="p-8 text-center text-rose-500">Case not found.</div>;

    return (
        <div className="max-w-5xl mx-auto space-y-6">
            <Link to="/cases" className="inline-flex items-center gap-2 text-sm text-slate-500 hover:text-slate-800 transition-colors">
                <ArrowLeft size={16} /> Back to Risk Cases
            </Link>

            <div className="glass-panel p-6">
                <div className="flex items-start justify-between">
                    <div>
                        <h1 className="text-2xl font-bold text-slate-900">{riskCase.headline}</h1>
                        <p className="text-slate-500 mt-1">Case ID: {riskCase.case_id} • Category: {riskCase.risk_category}</p>
                    </div>
                    <div className="flex items-center gap-2">
                        {(() => {
                            const s = riskCase.scores || {};
                            const score = typeof s.overall_risk === 'number' ? s.overall_risk : typeof s.overall === 'number' ? s.overall : null;
                            return score != null ? (
                                <span className="px-3 py-1 rounded-full text-sm font-bold bg-slate-100 text-slate-800">
                                    Overall score: {score}
                                </span>
                            ) : null;
                        })()}
                        <span className="px-3 py-1 bg-amber-100 text-amber-800 rounded-full text-sm font-semibold capitalize">
                            {riskCase.status}
                        </span>
                        {typeof riskCase.iteration_count === 'number' && riskCase.iteration_count > 0 && (
                            <span className="px-3 py-1 bg-purple-100 text-purple-700 rounded-full text-xs font-semibold">
                                Replanning requested · iteration {riskCase.iteration_count}
                            </span>
                        )}
                        {riskCase.status === 'replanning_after_execution' && (
                            <span className="px-3 py-1 bg-amber-100 text-amber-800 rounded-full text-xs font-semibold">
                                Revision after execution
                            </span>
                        )}
                        {riskCase.status === 'open' && (
                                <button
                                    type="button"
                                    onClick={handleCloseCase}
                                    disabled={closing}
                                    className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors disabled:opacity-50"
                                    title="Close this case (sets status to abandoned)"
                                >
                                    <XCircle size={16} /> {closing ? 'Closing…' : 'Close case'}
                                </button>
                            )}
                    </div>
                </div>

                {riskCase.status === 'replanning_after_execution' && (
                    <div className="mt-4 p-4 rounded-lg bg-amber-50 border border-amber-200 text-amber-900 text-sm font-medium">
                        An earlier communication for this case was already sent. The current plan is a follow-up revision, not a replacement.
                    </div>
                )}

                <div className="mt-8 grid grid-cols-1 md:grid-cols-2 gap-8">
                    <div>
                        <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wider mb-4 border-b pb-2">Business Exposure</h3>
                        <div className="bg-slate-50 p-4 rounded-lg border border-slate-100">
                            {renderExposure(riskCase.exposure)}
                        </div>
                    </div>

                    <div>
                        <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wider mb-4 border-b pb-2">Proposed Mitigation Plans</h3>
                        {riskCase.alternative_plans ? (
                            <div className="space-y-4">
                                {riskCase.alternative_plans.map((plan: any, idx: number) => (
                                    <div key={idx} className="bg-slate-50 border border-slate-200 rounded-lg p-4">
                                        <div className="flex justify-between items-center mb-2">
                                            <span className="font-semibold text-slate-800">{plan.plan_type}</span>
                                            <span className="text-xs bg-emerald-100 text-emerald-700 px-2 py-1 rounded font-bold">
                                                Score: {plan.feasibility_score?.toFixed(2)}
                                            </span>
                                        </div>
                                        <ul className="text-sm text-slate-600 list-disc list-inside space-y-1">
                                            {plan.steps?.map((step: string, sIdx: number) => <li key={sIdx}>{step}</li>)}
                                        </ul>
                                    </div>
                                ))}
                            </div>
                        ) : (
                            <p className="text-sm text-slate-500 italic">Omni Agent is currently generating mitigation plans...</p>
                        )}
                    </div>
                </div>
            </div>

            <div className="glass-panel p-6 mt-6">
                <h3 className="text-lg font-bold text-slate-900 mb-4 flex items-center gap-2">
                    <FileText size={20} className="text-blue-500" />
                    Pending Change Proposals
                </h3>

                {proposals.length === 0 ? (
                    <p className="text-sm text-slate-500">No pending ERP changes require approval for this case.</p>
                ) : (
                    <div className="space-y-4">
                        {proposals.map((prop) => (
                            <div key={prop.id} className="border border-slate-200 rounded-lg p-4 flex flex-col md:flex-row md:items-start justify-between gap-4 overflow-hidden">
                                <div className="min-w-0 flex-1 overflow-hidden">
                                    <div className="font-semibold text-slate-800 mb-2">
                                        {prop.system} · {prop.entity_type} ({prop.entity_id})
                                    </div>
                                    <div className="text-sm text-slate-600 break-words max-w-full">
                                        {renderProposalDiff(prop.diff)}
                                    </div>
                                </div>
                                <div className="flex items-center gap-2 shrink-0 flex-shrink-0">
                                    {prop.status === 'pending' ? (
                                        <>
                                            <button onClick={() => handleApprove(prop.proposal_id)} className="bg-emerald-500 hover:bg-emerald-600 text-white px-3 py-1.5 rounded-md text-sm font-medium transition-colors flex items-center gap-1.5">
                                                <CheckCircle size={16} /> Approve
                                            </button>
                                            <button className="bg-rose-100 hover:bg-rose-200 text-rose-700 px-3 py-1.5 rounded-md text-sm font-medium transition-colors flex items-center gap-1.5">
                                                <XCircle size={16} /> Reject
                                            </button>
                                        </>
                                    ) : (
                                        <span className="flex items-center gap-1.5 text-slate-500 text-sm font-medium">
                                            <Clock size={16} /> {prop.status}
                                        </span>
                                    )}
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}
