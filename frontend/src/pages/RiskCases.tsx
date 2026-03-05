import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import type { RiskCase } from '../types';
import { Link } from 'react-router-dom';
import { ArrowRight, Box, AlertTriangle, Activity } from 'lucide-react';
import { cn } from '../lib/utils';
import { format } from 'date-fns';

export default function RiskCases() {
    const [cases, setCases] = useState<RiskCase[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        fetchCases();

        // Subscribe to realtime changes
        const casesSub = supabase
            .channel('risk_cases_changes')
            .on('postgres_changes', { event: '*', schema: 'public', table: 'risk_cases' }, (payload) => {
                console.log('Realtime case update:', payload);
                fetchCases();
            })
            .subscribe();

        return () => {
            supabase.removeChannel(casesSub);
        };
    }, []);

    const fetchCases = async () => {
        try {
            setLoading(true);
            const { data, error } = await supabase
                .from('risk_cases')
                .select('*')
                .order('created_at', { ascending: false });

            if (error) throw error;
            setCases(data || []);
        } catch (err) {
            console.error('Error fetching cases:', err);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="max-w-6xl mx-auto space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold text-slate-900">Risk Cases</h1>
                    <p className="text-sm text-slate-500 mt-1">Prioritized disruption cases requiring attention</p>
                </div>
                <button onClick={fetchCases} className="flex items-center gap-2 px-4 py-2 bg-white border border-slate-200 rounded-lg text-sm font-medium hover:bg-slate-50">
                    <Activity size={16} /> Refresh
                </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {loading ? (
                    <div className="col-span-full p-8 text-center text-slate-500 glass-panel">Loading risk cases...</div>
                ) : cases.length === 0 ? (
                    <div className="col-span-full p-8 text-center text-slate-500 glass-panel">No active risk cases.</div>
                ) : (
                    cases.map((c) => (
                        <div key={c.id} className="glass-panel hover:shadow-md transition-shadow flex flex-col h-full bg-white">
                            <div className="p-5 flex flex-col flex-1">
                                <div className="flex justify-between items-start mb-3">
                                    <span className={cn(
                                        "px-2.5 py-1 text-[11px] font-bold uppercase tracking-wider rounded-md",
                                        c.status === 'open' ? "bg-rose-100 text-rose-700" :
                                            c.status === 'monitoring' ? "bg-amber-100 text-amber-700" : "bg-slate-100 text-slate-600"
                                    )}>
                                        {c.status}
                                    </span>
                                    <span className="text-xs text-slate-400">
                                        {c.created_at ? format(new Date(c.created_at), 'MMM d, yy') : ''}
                                    </span>
                                </div>

                                <h3 className="text-lg font-bold text-slate-900 leading-tight mb-2">
                                    {c.headline || c.case_id}
                                </h3>

                                <p className="text-sm text-slate-500 mb-4 line-clamp-2 mt-auto">
                                    {c.risk_category || 'Supply Chain Disruption'}
                                </p>

                                <div className="bg-slate-50 rounded-lg p-3 grid grid-cols-2 gap-3 mb-4 mt-auto border border-slate-100">
                                    <div>
                                        <div className="text-[10px] font-semibold text-slate-500 uppercase">Est. Risk</div>
                                        <div className="font-bold flex items-center gap-1.5 text-rose-600 mt-0.5">
                                            <AlertTriangle size={14} />
                                            {c.expected_loss_prevented ? `$${(c.expected_loss_prevented / 1000).toFixed(1)}k` : 'High'}
                                        </div>
                                    </div>
                                    <div>
                                        <div className="text-[10px] font-semibold text-slate-500 uppercase">Category</div>
                                        <div className="font-bold flex items-center gap-1.5 text-slate-700 mt-0.5">
                                            <Box size={14} className="text-blue-500" />
                                            {c.risk_category || 'Logistics'}
                                        </div>
                                    </div>
                                </div>
                            </div>

                            <Link
                                to={`/cases/${c.case_id}`}
                                className="py-3 px-5 border-t border-slate-100 bg-slate-50/50 hover:bg-slate-100 text-sm font-semibold text-blue-600 flex items-center justify-between transition-colors group"
                            >
                                View full details & plans
                                <ArrowRight size={16} className="transform group-hover:translate-x-1 transition-transform" />
                            </Link>
                        </div>
                    ))
                )}
            </div>
        </div>
    );
}
