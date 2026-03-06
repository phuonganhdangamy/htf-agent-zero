import { useState, useEffect, Fragment } from 'react';
import { supabase } from '../lib/supabase';
import type { ChangeProposal } from '../types';
import { CheckCircle2, Clock, Check, X, ChevronRight, ChevronDown, Lock, FileText } from 'lucide-react';
import { cn } from '../lib/utils';
import { format } from 'date-fns';
import axios from 'axios';

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:8000';

export interface ActionStep {
    step: number;
    name: string;
    status: 'DONE' | 'PENDING' | 'LOCKED';
    timestamp?: string;
    artifact_id?: string;
    description?: string;
}

const DEFAULT_STEPS: ActionStep[] = [
    { step: 1, name: 'ExposureAgent', status: 'DONE', description: 'validated — SUPP_044 exposed, 4.2d cover' },
    { step: 2, name: 'DraftingAgent', status: 'DONE', description: 'supplier outreach email drafted' },
    { step: 3, name: 'ApprovalAgent', status: 'PENDING', description: 'awaiting human sign-off on email' },
    { step: 4, name: 'CommitAgent', status: 'LOCKED', description: 'send email to SUPP_044' },
    { step: 5, name: 'ChangeProposalAgent', status: 'LOCKED', description: 'propose PO_8821 ETA change ocean→air' },
    { step: 6, name: 'ApprovalAgent', status: 'LOCKED', description: 'awaiting approval for ERP write' },
    { step: 7, name: 'CommitAgent', status: 'LOCKED', description: 'write to ERP' },
    { step: 8, name: 'VerificationAgent', status: 'LOCKED', description: 'confirm ERP updated' },
    { step: 9, name: 'AuditAgent', status: 'LOCKED', description: 'write audit record' },
];

interface JoinedProposal extends ChangeProposal {
    action_runs?: {
        case_id: string;
        action_run_id: string;
        steps?: ActionStep[] | null;
        risk_cases?: {
            risk_category: string;
            headline: string;
        };
    };
}

export default function ActionsApproval() {
    const [actions, setActions] = useState<JoinedProposal[]>([]);
    const [loading, setLoading] = useState(true);
    const [expandedId, setExpandedId] = useState<string | null>(null);
    const [draftModal, setDraftModal] = useState<{ artifactId: string; preview: string } | null>(null);

    useEffect(() => {
        fetchActions();
    }, []);

    const fetchActions = async () => {
        try {
            setLoading(true);
            const { data, error } = await supabase
                .from('change_proposals')
                .select('*, action_runs(case_id, action_run_id, steps, risk_cases(risk_category, headline))')
                .order('created_at', { ascending: false });

            if (error) throw error;
            setActions((data as JoinedProposal[]) || []);
        } catch (err) {
            console.error(err);
        } finally {
            setLoading(false);
        }
    };

    const handleApprove = async (proposalId: string) => {
        try {
            await supabase.from('change_proposals').update({ status: 'approved', approved_by: 'Omni Admin' }).eq('proposal_id', proposalId);
            fetchActions();
        } catch (err) {
            console.error(err);
        }
    };

    const handleReject = async (proposalId: string) => {
        try {
            await supabase.from('change_proposals').update({ status: 'rejected', approved_by: 'Omni Admin' }).eq('proposal_id', proposalId);
            fetchActions();
        } catch (err) {
            console.error(err);
        }
    };

    const getStepsForRun = (act: JoinedProposal): ActionStep[] => {
        const raw = act.action_runs?.steps;
        if (Array.isArray(raw) && raw.length > 0) {
            return raw.map((s: any) => ({
                step: s.step ?? 0,
                name: s.name ?? '',
                status: (s.status === 'DONE' || s.status === 'PENDING' || s.status === 'LOCKED' ? s.status : 'LOCKED') as ActionStep['status'],
                timestamp: s.timestamp,
                artifact_id: s.artifact_id,
                description: s.description ?? '',
            })).sort((a, b) => a.step - b.step);
        }
        return DEFAULT_STEPS;
    };

    const resolveStepDisplayStatus = (steps: ActionStep[], index: number): 'DONE' | 'PENDING' | 'LOCKED' => {
        const step = steps[index];
        if (!step) return 'LOCKED';
        if (step.status === 'DONE') return 'DONE';
        if (step.status === 'PENDING') return 'PENDING';
        const prevDone = index === 0 || steps[index - 1]?.status === 'DONE';
        return prevDone ? 'LOCKED' : 'LOCKED';
    };

    const isStepGrayed = (steps: ActionStep[], index: number): boolean => {
        const step = steps[index];
        if (!step || step.status === 'DONE' || step.status === 'PENDING') return false;
        const prevDone = index === 0 || steps[index - 1]?.status === 'DONE';
        return !prevDone;
    };

    const openDraftModal = async (artifactId: string) => {
        const { data } = await supabase.from('draft_artifacts').select('preview').eq('artifact_id', artifactId).single();
        setDraftModal(data ? { artifactId, preview: data.preview ?? '' } : { artifactId, preview: '[No preview]' });
    };

    const handleStepApprove = async (actionRunId: string, stepIndex: number) => {
        try {
            await axios.patch(`${API_BASE}/api/agent/action_runs/${actionRunId}/steps`, {
                step_index: stepIndex,
                status: 'DONE',
            });
            fetchActions();
        } catch (err) {
            console.error(err);
        }
    };

    const handleStepReject = async (actionRunId: string, stepIndex: number) => {
        try {
            await axios.patch(`${API_BASE}/api/agent/action_runs/${actionRunId}/steps`, {
                step_index: stepIndex,
                status: 'LOCKED',
            });
            fetchActions();
        } catch (err) {
            console.error(err);
        }
    };

    const formatValue = (val: any): string => {
        if (val === null || val === undefined) return '[None]';
        if (val === '') return '[Empty]';
        if (typeof val === 'object') return JSON.stringify(val);
        return String(val);
    };

    const renderDiff = (diff: any) => {
        if (!diff || typeof diff !== 'object') return formatValue(diff);

        const lines: React.ReactNode[] = [];

        // Handle explicit "actions" list if present
        if (Array.isArray(diff.actions)) {
            diff.actions.forEach((action: string, idx: number) => {
                lines.push(
                    <div key={`action-${idx}`} className="flex gap-2 items-start py-0.5">
                        <span className="font-bold text-slate-400 min-w-[1.5rem]">{idx + 1}.</span>
                        <span className="text-slate-700">{action}</span>
                    </div>
                );
            });
        }

        // Handle key-value changes (Update from X to Y)
        Object.entries(diff).forEach(([key, value]) => {
            if (key === 'actions' || key === 'plan_id' || key === 'name') return;

            if (value && typeof value === 'object') {
                const oldValue = 'old' in value ? value.old : ('from' in value ? value.from : undefined);
                const newValue = 'new' in value ? value.new : ('to' in value ? value.to : undefined);

                if (oldValue !== undefined || newValue !== undefined) {
                    const isUnchanged = oldValue === newValue;
                    lines.push(
                        <div key={key} className="flex gap-2 items-center py-0.5 text-xs">
                            <ChevronRight size={12} className="text-slate-400" />
                            <span className="font-semibold text-slate-600 capitalize">{key.replace(/_/g, ' ')}:</span>
                            {isUnchanged ? (
                                <span className="text-slate-500 italic">Keep at {formatValue(oldValue ?? newValue)}</span>
                            ) : (
                                <span className="text-slate-700">
                                    from <span className="line-through text-slate-400">{formatValue(oldValue)}</span> to <span className="font-bold text-emerald-600">{formatValue(newValue)}</span>
                                </span>
                            )}
                        </div>
                    );
                    return;
                }
            }

            if (typeof value !== 'object') {
                lines.push(
                    <div key={key} className="flex gap-2 items-center py-0.5 text-xs">
                        <ChevronRight size={12} className="text-slate-400" />
                        <span className="font-semibold text-slate-600 capitalize">{key.replace(/_/g, ' ')}:</span>
                        <span className="text-slate-700">{formatValue(value)}</span>
                    </div>
                );
            }
        });

        return lines.length > 0 ? <div className="space-y-1">{lines}</div> : <span className="text-slate-400 italic">No details available</span>;
    };

    return (
        <div className="max-w-6xl mx-auto space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold text-slate-900">Actions & Approvals</h1>
                    <p className="text-sm text-slate-500 mt-1">Pending ERP modifications proposed by Omni Agent</p>
                </div>
            </div>

            <div className="glass-panel overflow-hidden">
                {loading ? (
                    <div className="p-8 text-center text-slate-500">Loading proposals...</div>
                ) : actions.length === 0 ? (
                    <div className="p-8 text-center text-slate-500">No pending actions required.</div>
                ) : (
                    <table className="w-full text-left text-sm">
                        <thead className="bg-slate-50/50 text-slate-500 uppercase tracking-wider text-xs border-b border-slate-200">
                            <tr>
                                <th className="px-4 py-4 font-medium w-10"></th>
                                <th className="px-6 py-4 font-medium">Target Entity / Context</th>
                                <th className="px-6 py-4 font-medium">Proposed Changes</th>
                                <th className="px-6 py-4 font-medium">Status</th>
                                <th className="px-6 py-4 font-medium">Date</th>
                                <th className="px-6 py-4 font-medium text-right">Actions</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                            {actions.map((act) => {
                                const riskCase = act.action_runs?.risk_cases;
                                const diffObj = (act.diff as any) || {};
                                const rawName = diffObj.name;
                                const planName = typeof rawName === 'object' && rawName !== null ? (rawName.to || rawName.new || formatValue(rawName)) : formatValue(rawName || act.entity_id);
                                const isExpanded = expandedId === act.proposal_id;
                                const steps = getStepsForRun(act);
                                const actionRunId = act.action_runs?.action_run_id;

                                return (
                                    <Fragment key={act.id}>
                                    <tr
                                        className={cn("hover:bg-slate-50/50 transition-colors cursor-pointer", isExpanded && "bg-slate-50/80")}
                                        onClick={() => setExpandedId(isExpanded ? null : act.proposal_id)}
                                        role="button"
                                        tabIndex={0}
                                        onKeyDown={(e) => e.key === 'Enter' && setExpandedId(isExpanded ? null : act.proposal_id)}
                                    >
                                        <td className="px-4 py-4 align-top w-10">
                                            <span className="inline-flex cursor-pointer">{isExpanded ? <ChevronDown size={18} className="text-slate-500" /> : <ChevronRight size={18} className="text-slate-400" />}</span>
                                        </td>
                                        <td className="px-6 py-4 align-top">
                                            <div className="flex flex-col gap-1">
                                                <div className="font-bold text-slate-900 flex items-center gap-1.5">
                                                    <span className="px-1.5 py-0.5 bg-slate-100 text-[10px] rounded text-slate-600 uppercase tracking-tighter">{act.entity_type}</span>
                                                    {riskCase?.risk_category || 'General'}
                                                </div>
                                                <div className="text-xs font-semibold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded w-fit">
                                                    Plan: {planName}
                                                </div>
                                                <div className="text-[11px] text-slate-500 max-w-[200px] leading-relaxed mt-1">
                                                    {riskCase?.headline || `System: ${act.system}`}
                                                </div>
                                            </div>
                                        </td>
                                        <td className="px-6 py-4 align-top">
                                            <div className="max-w-md">
                                                {renderDiff(act.diff)}
                                            </div>
                                        </td>
                                        <td className="px-6 py-4 align-top">
                                            <span className={cn(
                                                "flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold uppercase tracking-wider w-max",
                                                act.status === 'pending' ? "bg-amber-100 text-amber-700" :
                                                    act.status === 'approved' ? "bg-emerald-100 text-emerald-700" : "bg-rose-100 text-rose-700"
                                            )}>
                                                {act.status === 'pending' && <Clock size={12} />}
                                                {act.status === 'approved' && <CheckCircle2 size={12} />}
                                                {act.status}
                                            </span>
                                        </td>
                                        <td className="px-6 py-4 text-slate-500 align-top">
                                            {act.created_at ? format(new Date(act.created_at), 'MMM d, HH:mm') : 'Unknown'}
                                        </td>
                                        <td className="px-6 py-4 text-right align-top" onClick={(e) => e.stopPropagation()}>
                                            {act.status === 'pending' && (
                                                <div className="flex justify-end gap-2">
                                                    <button onClick={(e) => { e.stopPropagation(); handleApprove(act.proposal_id); }} className="p-1.5 bg-emerald-100 text-emerald-600 hover:bg-emerald-200 rounded transition-colors" title="Approve">
                                                        <Check size={16} />
                                                    </button>
                                                    <button onClick={(e) => { e.stopPropagation(); handleReject(act.proposal_id); }} className="p-1.5 bg-rose-100 text-rose-600 hover:bg-rose-200 rounded transition-colors" title="Reject">
                                                        <X size={16} />
                                                    </button>
                                                </div>
                                            )}
                                        </td>
                                    </tr>
                                    {isExpanded && (
                                        <tr key={`${act.id}-expand`} className="bg-slate-50/50">
                                            <td colSpan={6} className="px-6 py-4 border-t border-slate-200">
                                                <div className="pl-6 space-y-2">
                                                    <h4 className="text-xs font-bold text-slate-600 uppercase tracking-wider mb-3">Step-by-step breakdown</h4>
                                                    {steps.map((s, idx) => {
                                                        const displayStatus = resolveStepDisplayStatus(steps, idx);
                                                        const isLocked = displayStatus === 'LOCKED';
                                                        const isGrayed = isStepGrayed(steps, idx);
                                                        return (
                                                            <div
                                                                key={s.step}
                                                                className={cn(
                                                                    "flex flex-wrap items-center gap-2 py-2 px-3 rounded-lg text-sm",
                                                                    (isLocked || isGrayed) && "opacity-60 bg-slate-100/50"
                                                                )}
                                                            >
                                                                <span className="font-mono text-slate-500 min-w-[4rem]">Step {s.step}</span>
                                                                <span className={cn(
                                                                    "px-2 py-0.5 rounded text-[10px] font-bold uppercase",
                                                                    displayStatus === 'DONE' && "bg-emerald-100 text-emerald-700",
                                                                    displayStatus === 'PENDING' && "bg-amber-100 text-amber-700",
                                                                    displayStatus === 'LOCKED' && "bg-slate-200 text-slate-500"
                                                                )}>
                                                                    {displayStatus === 'LOCKED' && <Lock size={10} className="inline mr-0.5" />}
                                                                    {displayStatus}
                                                                </span>
                                                                <span className="font-semibold text-slate-700">{s.name}</span>
                                                                <span className="text-slate-600">— {s.description}</span>
                                                                {displayStatus === 'DONE' && s.timestamp && (
                                                                    <span className="text-[11px] text-slate-400">{format(new Date(s.timestamp), 'MMM d, HH:mm')}</span>
                                                                )}
                                                                {displayStatus === 'DONE' && <CheckCircle2 size={14} className="text-emerald-600" />}
                                                                {displayStatus === 'PENDING' && actionRunId && (
                                                                    <div className="flex gap-1 ml-auto" onClick={(e) => e.stopPropagation()}>
                                                                        <button onClick={() => handleStepApprove(actionRunId, idx)} className="px-2 py-0.5 bg-emerald-100 text-emerald-600 hover:bg-emerald-200 rounded text-xs font-medium">Approve</button>
                                                                        <button onClick={() => handleStepReject(actionRunId, idx)} className="px-2 py-0.5 bg-rose-100 text-rose-600 hover:bg-rose-200 rounded text-xs font-medium">Reject</button>
                                                                    </div>
                                                                )}
                                                                {s.artifact_id && (displayStatus === 'DONE' || displayStatus === 'PENDING') && (
                                                                    <button
                                                                        onClick={(e) => { e.stopPropagation(); openDraftModal(s.artifact_id!); }}
                                                                        className="flex items-center gap-1 px-2 py-0.5 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded text-xs"
                                                                    >
                                                                        <FileText size={12} /> View Draft
                                                                    </button>
                                                                )}
                                                            </div>
                                                        );
                                                    })}
                                                </div>
                                            </td>
                                        </tr>
                                    )}
                                    </Fragment>
                                );
                            })}
                        </tbody>
                    </table>
                )}
            </div>

            {draftModal && (
                <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={() => setDraftModal(null)}>
                    <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-[80vh] overflow-hidden flex flex-col" onClick={(e) => e.stopPropagation()}>
                        <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
                            <h3 className="font-bold text-slate-900">View Draft</h3>
                            <button onClick={() => setDraftModal(null)} className="p-1 hover:bg-slate-100 rounded">
                                <X size={20} className="text-slate-500" />
                            </button>
                        </div>
                        <div className="px-6 py-4 overflow-auto flex-1 whitespace-pre-wrap text-sm text-slate-700 font-mono bg-slate-50">
                            {draftModal.preview || '[No preview content]'}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

