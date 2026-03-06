import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import axios from 'axios';
import type { ChangeProposal } from '../types';
import { ArrowLeft, CheckCircle, XCircle, Clock, FileText } from 'lucide-react';

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:8000';

export default function CaseDetail() {
    const { id } = useParams();
    const [riskCase, setRiskCase] = useState<any>(null);
    const [proposals, setProposals] = useState<ChangeProposal[]>([]);
    const [loading, setLoading] = useState(true);

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
                    </div>
                </div>

                <div className="mt-8 grid grid-cols-1 md:grid-cols-2 gap-8">
                    <div>
                        <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wider mb-4 border-b pb-2">Business Exposure</h3>
                        {riskCase.exposure ? (
                            <pre className="text-xs bg-slate-50 p-4 rounded-lg border border-slate-100 overflow-x-auto">
                                {JSON.stringify(riskCase.exposure, null, 2)}
                            </pre>
                        ) : (
                            <p className="text-sm text-slate-500 italic">No specific exposure data logged.</p>
                        )}
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
                            <div key={prop.id} className="border border-slate-200 rounded-lg p-4 flex flex-col md:flex-row md:items-center justify-between gap-4">
                                <div>
                                    <div className="font-semibold text-slate-800">System: {prop.system} | Entity: {prop.entity_type} ({prop.entity_id})</div>
                                    <div className="text-sm text-slate-500 mt-1 font-mono">
                                        Diff: {JSON.stringify(prop.diff)}
                                    </div>
                                </div>
                                <div className="flex items-center gap-2 shrink-0">
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
