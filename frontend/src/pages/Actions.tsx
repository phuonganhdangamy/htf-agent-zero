import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import type { ChangeProposal } from '../types';
import { CheckCircle2, Clock, Check, X, ChevronRight } from 'lucide-react';
import { cn } from '../lib/utils';
import { format } from 'date-fns';

interface JoinedProposal extends ChangeProposal {
    action_runs?: {
        case_id: string;
        risk_cases?: {
            risk_category: string;
            headline: string;
        }
    }
}

export default function ActionsApproval() {
    const [actions, setActions] = useState<JoinedProposal[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        fetchActions();
    }, []);

    const fetchActions = async () => {
        try {
            setLoading(true);
            const { data, error } = await supabase
                .from('change_proposals')
                .select('*, action_runs(case_id, risk_cases(risk_category, headline))')
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

                                return (
                                    <tr key={act.id} className="hover:bg-slate-50/50 transition-colors">
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
                                        <td className="px-6 py-4 text-right align-top">
                                            {act.status === 'pending' && (
                                                <div className="flex justify-end gap-2">
                                                    <button onClick={() => handleApprove(act.proposal_id)} className="p-1.5 bg-emerald-100 text-emerald-600 hover:bg-emerald-200 rounded transition-colors" title="Approve">
                                                        <Check size={16} />
                                                    </button>
                                                    <button className="p-1.5 bg-rose-100 text-rose-600 hover:bg-rose-200 rounded transition-colors" title="Reject">
                                                        <X size={16} />
                                                    </button>
                                                </div>
                                            )}
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                )}
            </div>
        </div>
    );
}

