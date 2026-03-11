import { useState, useEffect, useMemo, Fragment, lazy, Suspense } from 'react';
import { supabase } from '../lib/supabase';
import type { ChangeProposal } from '../types';
import { CheckCircle2, Clock, Check, X, ChevronRight, ChevronDown, Lock, FileText, Mail, Save, AlertTriangle, RotateCcw, Loader2, Map } from 'lucide-react';
import { cn } from '../lib/utils';
import { format } from 'date-fns';
import axios from 'axios';

const DeliveryRouteMap = lazy(() => import('../components/DeliveryRouteMap'));

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:8000';

export interface ActionStep {
    step: number;
    name: string;
    status: 'DONE' | 'PENDING' | 'LOCKED';
    timestamp?: string;
    artifact_id?: string;
    description?: string;
}

// Fallback only — action_runs.steps should always come from the backend now
const DEFAULT_STEPS: ActionStep[] = [
    { step: 1, name: 'ExposureAgent', status: 'DONE', description: 'validated exposure' },
    { step: 2, name: 'DraftingAgent', status: 'DONE', description: 'supplier outreach email drafted' },
    { step: 3, name: 'ApprovalAgent', status: 'PENDING', description: 'awaiting human sign-off on email' },
    { step: 4, name: 'CommitAgent', status: 'LOCKED', description: 'send email to supplier' },
    { step: 5, name: 'ApprovalAgent', status: 'LOCKED', description: 'awaiting approval for ERP write' },
    { step: 6, name: 'CommitAgent', status: 'LOCKED', description: 'write to ERP' },
    { step: 7, name: 'VerificationAgent', status: 'LOCKED', description: 'confirm ERP updated' },
    { step: 8, name: 'AuditAgent', status: 'LOCKED', description: 'write audit record' },
];

interface DraftArtifact {
    artifact_id: string;
    type: 'email' | 'erp_diff' | 'slack_message' | 'ticket';
    preview: string;
    structured_payload?: {
        to?: string;
        subject?: string;
        body?: string;
        before?: Record<string, unknown>;
        after?: Record<string, unknown>;
        message?: string;
        [key: string]: unknown;
    };
    status?: string;
}

interface JoinedProposal extends ChangeProposal {
    action_runs?: {
        case_id: string;
        action_run_id: string;
        steps?: ActionStep[] | null;
        risk_cases?: {
            risk_category: string;
            headline: string;
            status?: string;
        };
    };
}

export default function ActionsApproval() {
    const [actions, setActions] = useState<JoinedProposal[]>([]);
    const [loading, setLoading] = useState(true);
    const [expandedId, setExpandedId] = useState<string | null>(null);
    const [draftModal, setDraftModal] = useState<{ artifact: DraftArtifact; proposalId: string; actionRunId: string } | null>(null);
    const [draftEdit, setDraftEdit] = useState<{ to: string; subject: string; body: string } | null>(null);

    // #17 dedup: track which proposals are currently being approved/rejected
    const [processingIds, setProcessingIds] = useState<Set<string>>(new Set());

    // Reject-and-replan modal state
    const [rejectModal, setRejectModal] = useState<{
        proposalId: string;
        actionRunId: string;
    } | null>(null);
    const [rejectReason, setRejectReason] = useState('');
    const [rejectCreateNewPlan, setRejectCreateNewPlan] = useState(true);
    const [rejectLoading, setRejectLoading] = useState(false);
    const [showRouteMap, setShowRouteMap] = useState(false);

    // Filters: default show pending + approved; rejected and completed unselected. Date range optional.
    const [filterStatus, setFilterStatus] = useState<{ pending: boolean; approved: boolean; completed: boolean; rejected: boolean }>({
        pending: true,
        approved: true,
        completed: false,
        rejected: false,
    });
    const [dateFrom, setDateFrom] = useState<string>('');
    const [dateTo, setDateTo] = useState<string>('');

    useEffect(() => {
        fetchActions();
    }, []);

    const fetchActions = async () => {
        try {
            setLoading(true);
            const { data, error } = await supabase
                .from('change_proposals')
                .select('*, action_runs(case_id, action_run_id, steps, risk_cases(risk_category, headline, status))')
                .order('created_at', { ascending: false });

            if (error) throw error;
            setActions((data as JoinedProposal[]) || []);
        } catch (err) {
            console.error(err);
        } finally {
            setLoading(false);
        }
    };

    // When a draft modal opens, initialize editable fields for email drafts
    useEffect(() => {
        if (draftModal && draftModal.artifact.type === 'email') {
            const sp = draftModal.artifact.structured_payload || {};
            setDraftEdit({
                to: (sp.to as string) || '',
                subject: (sp.subject as string) || '',
                body: (sp.body as string) || draftModal.artifact.preview || '',
            });
        } else {
            setDraftEdit(null);
        }
    }, [draftModal]);

    // #17 dedup helper
    const withProcessing = async (proposalId: string, fn: () => Promise<void>) => {
        if (processingIds.has(proposalId)) return;
        setProcessingIds(prev => new Set(prev).add(proposalId));
        try {
            await fn();
        } finally {
            setProcessingIds(prev => { const s = new Set(prev); s.delete(proposalId); return s; });
        }
    };

    // #16: top-level approve — use backend API so audit_log gets written with case_id
    const handleApprove = async (proposalId: string) => {
        await withProcessing(proposalId, async () => {
            await axios.post(`${API_BASE}/api/agent/approve`, {
                proposal_id: proposalId,
                approved_by: 'Omni Admin',
                decision: 'approve',
            });
            fetchActions();
        });
    };

    // #16: top-level reject — open modal asking why before rejecting
    const handleReject = (proposalId: string, actionRunId?: string) => {
        if (!actionRunId) return;
        setRejectReason('');
        setRejectCreateNewPlan(true);
        setRejectModal({ proposalId, actionRunId });
    };

    // Submit the reject-and-replan flow
    const handleRejectSubmit = async () => {
        if (!rejectModal) return;
        setRejectLoading(true);
        try {
            await axios.post(`${API_BASE}/api/agent/reject-and-replan`, {
                proposal_id: rejectModal.proposalId,
                action_run_id: rejectModal.actionRunId,
                rejection_reason: rejectReason || 'No reason given',
                create_new_plan: rejectCreateNewPlan,
                actor: 'Omni Admin',
            });
            setRejectModal(null);
            fetchActions();
        } catch (err) {
            console.error(err);
        } finally {
            setRejectLoading(false);
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

    const filteredActions = useMemo(() => {
        return actions.filter((act) => {
            const steps = getStepsForRun(act);
            const allDone = steps.length > 0 && steps.every((s) => s.status === 'DONE');
            const matchPending = filterStatus.pending && act.status === 'pending';
            const matchApproved = filterStatus.approved && act.status === 'approved' && !allDone;
            const matchCompleted = filterStatus.completed && allDone;
            const matchRejected = filterStatus.rejected && act.status !== 'pending' && act.status !== 'approved';
            if (!matchPending && !matchApproved && !matchCompleted && !matchRejected) return false;
            const created = act.created_at ? new Date(act.created_at) : null;
            if (dateFrom && created) {
                const fromStart = new Date(dateFrom);
                fromStart.setHours(0, 0, 0, 0);
                if (created < fromStart) return false;
            }
            if (dateTo && created) {
                const toEnd = new Date(dateTo);
                toEnd.setHours(23, 59, 59, 999);
                if (created > toEnd) return false;
            }
            return true;
        });
    }, [actions, filterStatus, dateFrom, dateTo]);

    const resolveStepDisplayStatus = (steps: ActionStep[], index: number): 'DONE' | 'PENDING' | 'LOCKED' => {
        const step = steps[index];
        if (!step) return 'LOCKED';
        return step.status;
    };

    const isStepGrayed = (steps: ActionStep[], index: number): boolean => {
        const step = steps[index];
        if (!step || step.status === 'DONE' || step.status === 'PENDING') return false;
        const prevDone = index === 0 || steps[index - 1]?.status === 'DONE';
        return !prevDone;
    };

    /** Latest workflow status for table: description of first PENDING step, or last step if all done. */
    const getCurrentStepSummary = (steps: ActionStep[]): string => {
        if (!steps?.length) return '—';
        const pendingIdx = steps.findIndex((s) => s.status === 'PENDING');
        const step = pendingIdx >= 0 ? steps[pendingIdx] : steps[steps.length - 1];
        const desc = (step?.description ?? '').trim();
        return desc || '—';
    };

    // #7: fetch full draft artifact including type and structured_payload
    const openDraftModal = async (artifactId: string, proposalId: string, actionRunId: string) => {
        const { data } = await supabase
            .from('draft_artifacts')
            .select('artifact_id, type, preview, structured_payload, status')
            .eq('artifact_id', artifactId)
            .single();
        if (data) {
            const artifact = data as DraftArtifact;
            setDraftModal({ artifact, proposalId, actionRunId });
        } else {
            setDraftModal({
                artifact: { artifact_id: artifactId, type: 'email', preview: '[No preview available]' },
                proposalId,
                actionRunId,
            });
        }
    };

    const handleStepApprove = async (actionRunId: string, stepIndex: number) => {
        try {
            await axios.post(`${API_BASE}/api/agent/action_runs/${actionRunId}/advance`, {
                step_index: stepIndex,
                approved_by: 'Omni Admin',
            });
            fetchActions();
        } catch (err) {
            console.error(err);
        }
    };

    const handleStepReject = (proposalId: string, actionRunId: string, _stepIndex: number) => {
        // Open the same reject modal — routes through reject-and-replan endpoint
        setRejectReason('');
        setRejectCreateNewPlan(true);
        setRejectModal({ proposalId, actionRunId });
    };

    // #7: persist current email draft edits (used by Save Draft + Approve)
    const handleDraftSave = async () => {
        if (!draftModal || draftModal.artifact.type !== 'email' || !draftEdit) return;
        const { artifact } = draftModal;
        try {
            const base = artifact.structured_payload || {};
            const updatedPayload = {
                ...base,
                to: draftEdit.to,
                subject: draftEdit.subject,
                body: draftEdit.body,
            };
            const preview = `TO: ${draftEdit.to || '—'}\nSUBJECT: ${draftEdit.subject || '—'}\n\n${draftEdit.body || ''}`;
            await supabase
                .from('draft_artifacts')
                .update({
                    preview,
                    structured_payload: updatedPayload,
                })
                .eq('artifact_id', artifact.artifact_id);
            // keep modal in sync
            setDraftModal(prev =>
                prev
                    ? {
                          ...prev,
                          artifact: { ...prev.artifact, preview, structured_payload: updatedPayload },
                      }
                    : prev
            );
        } catch (err) {
            console.error(err);
        }
    };

    const handleDraftApprove = async () => {
        if (!draftModal) return;
        const { actionRunId, proposalId } = draftModal;
        try {
            // Persist any edits to the draft before advancing
            await handleDraftSave();
            // Step 3 (ApprovalAgent for email) is index 2
            await axios.post(`${API_BASE}/api/agent/action_runs/${actionRunId}/advance`, {
                step_index: 2,
                approved_by: 'Omni Admin',
            });
            // Also mark the overall proposal approved
            await axios.post(`${API_BASE}/api/agent/approve`, {
                proposal_id: proposalId,
                approved_by: 'Omni Admin',
                decision: 'approve',
            });
            setDraftModal(null); // Close modal so user sees approval succeeded
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

    // #7: render typed draft content
    const renderDraftContent = (artifact: DraftArtifact) => {
        const sp = artifact.structured_payload;

        if (artifact.type === 'email' && sp) {
            // Read-only fallback for email drafts when inline editing state is not active
            return (
                <div className="space-y-3">
                    <div className="bg-slate-50 border border-slate-200 rounded-lg p-4 space-y-2 text-sm">
                        <div className="flex gap-2">
                            <span className="font-semibold text-slate-500 w-16 shrink-0">To:</span>
                            <span className="text-slate-800 font-mono">{sp.to || '—'}</span>
                        </div>
                        <div className="flex gap-2">
                            <span className="font-semibold text-slate-500 w-16 shrink-0">Subject:</span>
                            <span className="text-slate-800 font-semibold">{sp.subject || '—'}</span>
                        </div>
                    </div>
                    <pre className="whitespace-pre-wrap text-sm text-slate-700 font-sans bg-slate-50 border border-slate-200 rounded-lg p-4">
                        {sp.body || artifact.preview || '[No body content]'}
                    </pre>
                </div>
            );
        }

        if (artifact.type === 'erp_diff' && sp) {
            const before = sp.before || {};
            const after = sp.after || {};
            const fields = Array.from(new Set([...Object.keys(before), ...Object.keys(after)]));
            return (
                <table className="w-full text-sm border-collapse">
                    <thead>
                        <tr className="bg-slate-50 text-slate-600 uppercase text-xs">
                            <th className="px-3 py-2 text-left font-medium border border-slate-200">Field</th>
                            <th className="px-3 py-2 text-left font-medium border border-slate-200 text-rose-600">Before</th>
                            <th className="px-3 py-2 text-left font-medium border border-slate-200 text-emerald-600">After</th>
                        </tr>
                    </thead>
                    <tbody>
                        {fields.map(f => (
                            <tr key={f} className="border border-slate-100">
                                <td className="px-3 py-2 font-mono text-slate-600">{f}</td>
                                <td className="px-3 py-2 text-rose-700 line-through">{formatValue(before[f])}</td>
                                <td className="px-3 py-2 text-emerald-700 font-semibold">{formatValue(after[f])}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            );
        }

        if (artifact.type === 'slack_message' && sp?.message) {
            return (
                <div className="flex gap-3 items-start">
                    <div className="w-9 h-9 rounded bg-purple-600 flex items-center justify-center text-white font-bold text-sm shrink-0">O</div>
                    <div className="bg-white border border-slate-200 rounded-lg px-4 py-3 text-sm text-slate-700 max-w-lg">
                        {sp.message}
                    </div>
                </div>
            );
        }

        // Fallback: show raw preview
        return (
            <pre className="whitespace-pre-wrap text-sm text-slate-700 font-mono bg-slate-50 p-4 rounded-lg">
                {artifact.preview || '[No preview content]'}
            </pre>
        );
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
                {/* Status + Date filters */}
                <div className="px-6 py-4 border-b border-slate-200 bg-slate-50/50 flex flex-wrap items-center gap-6">
                    <div className="flex items-center gap-4">
                        <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Status</span>
                        <label className="flex items-center gap-2 cursor-pointer">
                            <input
                                type="checkbox"
                                checked={filterStatus.pending}
                                onChange={(e) => setFilterStatus((s) => ({ ...s, pending: e.target.checked }))}
                                className="rounded border-slate-300 text-amber-600 focus:ring-amber-500"
                            />
                            <span className="text-sm text-slate-700">Pending</span>
                        </label>
                        <label className="flex items-center gap-2 cursor-pointer">
                            <input
                                type="checkbox"
                                checked={filterStatus.approved}
                                onChange={(e) => setFilterStatus((s) => ({ ...s, approved: e.target.checked }))}
                                className="rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
                            />
                            <span className="text-sm text-slate-700">Approved</span>
                        </label>
                        <label className="flex items-center gap-2 cursor-pointer">
                            <input
                                type="checkbox"
                                checked={filterStatus.completed}
                                onChange={(e) => setFilterStatus((s) => ({ ...s, completed: e.target.checked }))}
                                className="rounded border-slate-300 text-slate-600 focus:ring-slate-500"
                            />
                            <span className="text-sm text-slate-700">Completed</span>
                        </label>
                        <label className="flex items-center gap-2 cursor-pointer">
                            <input
                                type="checkbox"
                                checked={filterStatus.rejected}
                                onChange={(e) => setFilterStatus((s) => ({ ...s, rejected: e.target.checked }))}
                                className="rounded border-slate-300 text-rose-600 focus:ring-rose-500"
                            />
                            <span className="text-sm text-slate-700">Rejected</span>
                        </label>
                    </div>
                    <div className="flex items-center gap-3">
                        <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Date</span>
                        <input
                            type="date"
                            value={dateFrom}
                            onChange={(e) => setDateFrom(e.target.value)}
                            className="rounded border border-slate-200 px-2 py-1.5 text-sm text-slate-700"
                            title="From date"
                        />
                        <span className="text-slate-400 text-sm">–</span>
                        <input
                            type="date"
                            value={dateTo}
                            onChange={(e) => setDateTo(e.target.value)}
                            className="rounded border border-slate-200 px-2 py-1.5 text-sm text-slate-700"
                            title="To date"
                        />
                        {(dateFrom || dateTo) && (
                            <button
                                type="button"
                                onClick={() => { setDateFrom(''); setDateTo(''); }}
                                className="text-xs text-slate-500 hover:text-slate-700 underline"
                            >
                                Clear dates
                            </button>
                        )}
                    </div>
                </div>

                {loading ? (
                    <div className="p-8 text-center text-slate-500">Loading proposals...</div>
                ) : actions.length === 0 ? (
                    <div className="p-8 text-center text-slate-500">No pending actions required.</div>
                ) : filteredActions.length === 0 ? (
                    <div className="p-8 text-center text-slate-500">No actions match the current filters. Try adjusting status or date.</div>
                ) : (
                    <table className="w-full text-left text-sm">
                        <thead className="bg-slate-50/50 text-slate-500 uppercase tracking-wider text-xs border-b border-slate-200">
                            <tr>
                                <th className="px-4 py-4 font-medium w-10"></th>
                                <th className="px-6 py-4 font-medium">Target Entity / Context</th>
                                <th className="px-6 py-4 font-medium">Proposed Changes</th>
                                <th className="px-6 py-4 font-medium">Status</th>
                                <th className="px-6 py-4 font-medium">Current step</th>
                                <th className="px-6 py-4 font-medium">Date</th>
                                <th className="px-6 py-4 font-medium text-right">Actions</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                            {filteredActions.map((act) => {
                                const riskCase = act.action_runs?.risk_cases;
                                const diffObj = (act.diff as any) || {};
                                const rawName = diffObj.name;
                                const planName = typeof rawName === 'object' && rawName !== null ? (rawName.to || rawName.new || formatValue(rawName)) : formatValue(rawName || act.entity_id);
                                const isExpanded = expandedId === act.proposal_id;
                                const steps = getStepsForRun(act);
                                const actionRunId = act.action_runs?.action_run_id;
                                const isProcessing = processingIds.has(act.proposal_id);

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
                                            <div className="flex flex-col gap-1.5">
                                                {(() => {
                                                    const allDone = steps.length > 0 && steps.every((s) => s.status === 'DONE');
                                                    const displayStatus = allDone ? 'completed' : act.status;
                                                    return (
                                                        <>
                                                            <span className={cn(
                                                                "flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold uppercase tracking-wider w-max",
                                                                displayStatus === 'pending' ? "bg-amber-100 text-amber-700" :
                                                                displayStatus === 'completed' ? "bg-slate-100 text-slate-700" :
                                                                displayStatus === 'approved' ? "bg-emerald-100 text-emerald-700" : "bg-rose-100 text-rose-700"
                                                            )}>
                                                                {displayStatus === 'pending' && <Clock size={12} />}
                                                                {(displayStatus === 'approved' || displayStatus === 'completed') && <CheckCircle2 size={12} />}
                                                                {displayStatus}
                                                            </span>
                                                            {act.status === 'pending' && (() => {
                                                                const waitingStep = steps.find(s => s.status === 'PENDING');
                                                                return waitingStep ? (
                                                                    <span className="text-[11px] text-slate-500 leading-snug max-w-[160px]">
                                                                        Waiting for: {waitingStep.description || waitingStep.name}
                                                                    </span>
                                                                ) : null;
                                                            })()}
                                                        </>
                                                    );
                                                })()}
                                            </div>
                                        </td>
                                        <td className="px-6 py-4 align-top max-w-[200px]">
                                            <span className="text-xs text-slate-700 font-medium">
                                                {getCurrentStepSummary(steps)}
                                            </span>
                                        </td>
                                        <td className="px-6 py-4 text-slate-500 align-top">
                                            {act.created_at ? format(new Date(act.created_at), 'MMM d, HH:mm') : 'Unknown'}
                                        </td>
                                        <td className="px-6 py-4 text-right align-top" onClick={(e) => e.stopPropagation()}>
                                            {act.status === 'pending' && (
                                                <div className="flex justify-end gap-2">
                                                    {/* #17 dedup: disabled while processing */}
                                                    <button
                                                        onClick={(e) => { e.stopPropagation(); handleApprove(act.proposal_id); }}
                                                        disabled={isProcessing}
                                                        className="p-1.5 bg-emerald-100 text-emerald-600 hover:bg-emerald-200 rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                                                        title="Approve"
                                                    >
                                                        <Check size={16} />
                                                    </button>
                                                    <button
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            handleReject(act.proposal_id, actionRunId);
                                                        }}
                                                        disabled={isProcessing}
                                                        className="p-1.5 bg-rose-100 text-rose-600 hover:bg-rose-200 rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                                                        title="Reject"
                                                    >
                                                        <X size={16} />
                                                    </button>
                                                </div>
                                            )}
                                        </td>
                                    </tr>
                                    {isExpanded && (
                                        <tr key={`${act.id}-expand`} className="bg-slate-50/50">
                                            <td colSpan={7} className="px-6 py-4 border-t border-slate-200">
                                                <div className="pl-6 space-y-2">
                                                    {riskCase?.status === 'replanning_after_execution' && (
                                                        <div className="mb-3 p-3 rounded-lg bg-amber-50 border border-amber-200 text-amber-900 text-xs font-medium">
                                                            An earlier communication for this case was already sent. This is a <strong>follow-up mitigation plan</strong> — the email template has been updated accordingly.
                                                        </div>
                                                    )}
                                                    {riskCase?.status === 'replanning' && (
                                                        <div className="mb-3 p-3 rounded-lg bg-blue-50 border border-blue-200 text-blue-900 text-xs font-medium">
                                                            This is a <strong>revised mitigation plan</strong> generated from your rejection feedback. The original plan was not yet executed.
                                                        </div>
                                                    )}
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
                                                                        <button
                                                                            onClick={() => handleStepReject(act.proposal_id, actionRunId!, idx)}
                                                                            className="px-2 py-0.5 bg-rose-100 text-rose-600 hover:bg-rose-200 rounded text-xs font-medium"
                                                                        >
                                                                            Reject
                                                                        </button>
                                                                    </div>
                                                                )}
                                                                {/* #7: View Draft button appears when artifact_id is set */}
                                                                {s.artifact_id && (displayStatus === 'DONE' || displayStatus === 'PENDING') && (
                                                                    <button
                                                                        onClick={(e) => {
                                                                            e.stopPropagation();
                                                                            openDraftModal(s.artifact_id!, act.proposal_id, actionRunId || '');
                                                                        }}
                                                                        className="flex items-center gap-1 px-2 py-0.5 bg-blue-50 hover:bg-blue-100 text-blue-600 rounded text-xs border border-blue-200"
                                                                    >
                                                                        <FileText size={12} /> View Draft
                                                                    </button>
                                                                )}
                                                            </div>
                                                        );
                                                    })}

                                                    {/* Delivery Route Map toggle */}
                                                    <div className="mt-4 pt-3 border-t border-slate-200">
                                                        <button
                                                            onClick={(e) => { e.stopPropagation(); setShowRouteMap(!showRouteMap); }}
                                                            className="flex items-center gap-2 text-xs font-bold text-slate-600 uppercase tracking-wider hover:text-blue-600 transition-colors"
                                                        >
                                                            <Map size={14} />
                                                            {showRouteMap ? 'Hide' : 'Show'} Delivery Routes
                                                            {showRouteMap ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                                                        </button>
                                                        {showRouteMap && (
                                                            <div className="mt-3">
                                                                <Suspense fallback={<div className="text-sm text-slate-400 py-4">Loading map...</div>}>
                                                                    <DeliveryRouteMap compact />
                                                                </Suspense>
                                                            </div>
                                                        )}
                                                    </div>
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

            {/* #7: Draft artifact modal with type-specific rendering */}
            {draftModal && (
                <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={() => setDraftModal(null)}>
                    <div className="bg-white rounded-xl shadow-2xl max-w-2xl w-full max-h-[85vh] overflow-hidden flex flex-col" onClick={(e) => e.stopPropagation()}>
                        <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
                            <div className="flex items-center gap-2">
                                {draftModal.artifact.type === 'email' && <Mail size={18} className="text-blue-600" />}
                                <h3 className="font-bold text-slate-900">
                                    {draftModal.artifact.type === 'email'
                                    ? (draftModal.artifact.structured_payload as any)?.is_follow_up
                                        ? 'Email Draft (Follow-up)'
                                        : 'Email Draft'
                                    : draftModal.artifact.type === 'erp_diff' ? 'ERP Change Diff' :
                                     draftModal.artifact.type === 'slack_message' ? 'Slack Message' : 'Draft Artifact'}
                                </h3>
                                <span
                                    className={cn(
                                        "text-xs px-2 py-0.5 rounded font-semibold uppercase",
                                        (draftModal.artifact.status || '').toLowerCase() === 'approved'
                                            ? "bg-emerald-100 text-emerald-700"
                                            : "bg-amber-100 text-amber-700"
                                    )}
                                >
                                    {draftModal.artifact.status || 'draft'}
                                </span>
                            </div>
                            <button onClick={() => setDraftModal(null)} className="p-1 hover:bg-slate-100 rounded">
                                <X size={20} className="text-slate-500" />
                            </button>
                        </div>

                        <div className="px-6 py-4 overflow-auto flex-1">
                            {draftModal.artifact.type === 'email' && draftEdit ? (
                                <div className="space-y-3">
                                    <div className="bg-slate-50 border border-slate-200 rounded-lg p-4 space-y-2 text-sm">
                                        <div className="flex gap-2 items-center">
                                            <span className="font-semibold text-slate-500 w-16 shrink-0">To:</span>
                                            <input
                                                type="email"
                                                value={draftEdit.to}
                                                onChange={(e) => setDraftEdit(prev => prev ? { ...prev, to: e.target.value } : prev)}
                                                className="flex-1 border border-slate-200 rounded px-2 py-1 text-sm"
                                            />
                                        </div>
                                        <div className="flex gap-2 items-center">
                                            <span className="font-semibold text-slate-500 w-16 shrink-0">Subject:</span>
                                            <input
                                                type="text"
                                                value={draftEdit.subject}
                                                onChange={(e) => setDraftEdit(prev => prev ? { ...prev, subject: e.target.value } : prev)}
                                                className="flex-1 border border-slate-200 rounded px-2 py-1 text-sm"
                                            />
                                        </div>
                                    </div>
                                    <div>
                                        <label className="block text-xs font-semibold text-slate-500 uppercase mb-1">Body</label>
                                        <textarea
                                            value={draftEdit.body}
                                            onChange={(e) => setDraftEdit(prev => prev ? { ...prev, body: e.target.value } : prev)}
                                            className="w-full border border-slate-200 rounded-lg p-3 text-sm text-slate-700 min-h-[200px] font-sans leading-relaxed"
                                        />
                                    </div>
                                </div>
                            ) : (
                                renderDraftContent(draftModal.artifact)
                            )}
                        </div>

                        <div className="px-6 py-4 border-t border-slate-200 flex justify-end gap-3">
                            <button
                                onClick={() => setDraftModal(null)}
                                className="px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
                            >
                                Close
                            </button>
                            {draftModal.artifact.type === 'email' && draftEdit && (
                                <button
                                    onClick={handleDraftSave}
                                    className="px-4 py-2 text-sm font-medium text-blue-600 bg-blue-50 hover:bg-blue-100 rounded-lg transition-colors flex items-center gap-2"
                                >
                                    <Save size={16} /> Save Draft
                                </button>
                            )}
                            <button
                                onClick={handleDraftApprove}
                                className="px-4 py-2 text-sm font-medium text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg transition-colors flex items-center gap-2"
                            >
                                <Check size={16} /> Approve & Proceed
                            </button>

                        </div>
                    </div>
                </div>
            )}

            {/* Reject-and-Replan Modal */}
            {rejectModal && (
                <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={() => !rejectLoading && setRejectModal(null)}>
                    <div className="bg-white rounded-xl shadow-2xl max-w-lg w-full overflow-hidden" onClick={(e) => e.stopPropagation()}>
                        <div className="px-6 py-4 border-b border-slate-200 flex items-center gap-3">
                            <div className="w-10 h-10 rounded-full bg-rose-100 flex items-center justify-center">
                                <AlertTriangle size={20} className="text-rose-600" />
                            </div>
                            <div>
                                <h3 className="font-bold text-slate-900">Reject Proposal</h3>
                                <p className="text-sm text-slate-500">Why are you rejecting this plan?</p>
                            </div>
                        </div>

                        <div className="px-6 py-5 space-y-4">
                            <div>
                                <label className="block text-sm font-semibold text-slate-700 mb-1.5">Rejection Reason</label>
                                <textarea
                                    value={rejectReason}
                                    onChange={(e) => setRejectReason(e.target.value)}
                                    placeholder="e.g. Cost too high, prefer dual-sourcing, timeline unrealistic..."
                                    className="w-full border border-slate-200 rounded-lg p-3 text-sm text-slate-700 min-h-[100px] focus:ring-2 focus:ring-rose-200 focus:border-rose-400 transition-colors"
                                    disabled={rejectLoading}
                                />
                            </div>

                            <div className="bg-slate-50 border border-slate-200 rounded-lg p-4">
                                <label className="flex items-start gap-3 cursor-pointer">
                                    <input
                                        type="checkbox"
                                        checked={rejectCreateNewPlan}
                                        onChange={(e) => setRejectCreateNewPlan(e.target.checked)}
                                        className="rounded border-slate-300 text-emerald-600 focus:ring-emerald-500 mt-0.5"
                                        disabled={rejectLoading}
                                    />
                                    <div>
                                        <span className="text-sm font-semibold text-slate-700 flex items-center gap-1.5">
                                            <RotateCcw size={14} className="text-emerald-600" />
                                            Generate a new plan
                                        </span>
                                        <p className="text-xs text-slate-500 mt-0.5">
                                            Route back to the reasoning/planning layer with your feedback. Previous risk case context is preserved.
                                        </p>
                                    </div>
                                </label>
                            </div>

                            {!rejectCreateNewPlan && (
                                <p className="text-xs text-slate-500 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                                    The case will be closed without generating a new plan.
                                </p>
                            )}
                        </div>

                        <div className="px-6 py-4 border-t border-slate-200 flex justify-end gap-3">
                            <button
                                onClick={() => setRejectModal(null)}
                                disabled={rejectLoading}
                                className="px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100 rounded-lg transition-colors disabled:opacity-50"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={handleRejectSubmit}
                                disabled={rejectLoading}
                                className="px-4 py-2 text-sm font-medium text-white bg-rose-600 hover:bg-rose-700 rounded-lg transition-colors flex items-center gap-2 disabled:opacity-50"
                            >
                                {rejectLoading ? (
                                    <>
                                        <Loader2 size={16} className="animate-spin" />
                                        {rejectCreateNewPlan ? 'Generating new plan...' : 'Rejecting...'}
                                    </>
                                ) : (
                                    <>
                                        {rejectCreateNewPlan ? (
                                            <><RotateCcw size={16} /> Reject & Replan</>
                                        ) : (
                                            <><X size={16} /> Reject & Close</>
                                        )}
                                    </>
                                )}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}