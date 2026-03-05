import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import type { ChangeProposal } from '../types';
import { CheckCircle2, Clock, Check, X } from 'lucide-react';
import { cn } from '../lib/utils';
import { format } from 'date-fns';

export default function ActionsApproval() {
    const [actions, setActions] = useState<ChangeProposal[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        fetchActions();
    }, []);

    const fetchActions = async () => {
        try {
            setLoading(true);
            const { data, error } = await supabase
                .from('change_proposals')
                .select('*')
                .order('created_at', { ascending: false });

            if (error) throw error;
            setActions(data || []);
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
                    <table className="w-full text-left text-sm whitespace-nowrap">
                        <thead className="bg-slate-50/50 text-slate-500 uppercase tracking-wider text-xs border-b border-slate-200">
                            <tr>
                                <th className="px-6 py-4 font-medium">Target Entity</th>
                                <th className="px-6 py-4 font-medium">Proposed Change</th>
                                <th className="px-6 py-4 font-medium">Status</th>
                                <th className="px-6 py-4 font-medium">Date</th>
                                <th className="px-6 py-4 font-medium text-right">Actions</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                            {actions.map((act) => (
                                <tr key={act.id} className="hover:bg-slate-50/50 transition-colors">
                                    <td className="px-6 py-4">
                                        <div className="font-semibold text-slate-900">{act.entity_type}</div>
                                        <div className="text-xs text-slate-500 mt-0.5">{act.entity_id}</div>
                                    </td>
                                    <td className="px-6 py-4">
                                        <pre className="text-xs bg-slate-100 p-2 rounded max-w-xs overflow-hidden text-ellipsis">
                                            {JSON.stringify(act.diff)}
                                        </pre>
                                    </td>
                                    <td className="px-6 py-4">
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
                                    <td className="px-6 py-4 text-slate-500">
                                        {act.created_at ? format(new Date(act.created_at), 'MMM d, HH:mm') : 'Unknown'}
                                    </td>
                                    <td className="px-6 py-4 text-right">
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
                            ))}
                        </tbody>
                    </table>
                )}
            </div>
        </div>
    );
}
