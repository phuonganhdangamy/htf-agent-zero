import { useState, useEffect, useCallback, Fragment } from 'react';
import { supabase } from '../lib/supabase';
import type { RiskCase } from '../types';
import { Activity, ChevronDown, ChevronRight } from 'lucide-react';
import { cn } from '../lib/utils';
import { format } from 'date-fns';
import axios from 'axios';

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:8000';

interface RiskCaseRow extends RiskCase {
  scores?: { overall_risk?: number; likelihood?: number; impact?: number; [k: string]: unknown };
  hypotheses?: Array<{ title?: string; description?: string }>;
  recommended_plan?: string;
  alternative_plans?: unknown[];
  execution_steps?: unknown[];
}

export default function RiskCases() {
  const [cases, setCases] = useState<RiskCaseRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [auditByCase, setAuditByCase] = useState<Record<string, any[]>>({});

  const fetchCases = useCallback(async () => {
    setLoading(true);
    try {
      if (supabase) {
        const { data, error } = await supabase
          .from('risk_cases')
          .select('*')
          .order('created_at', { ascending: false });
        if (error) throw error;
        setCases(data || []);
      } else {
        const { data } = await axios.get(`${API_BASE}/api/agent/cases`, {
          params: { limit: 100, order: 'created_at.desc' }
        });
        setCases(Array.isArray(data) ? data : []);
      }
    } catch (err) {
      console.error('Error fetching cases:', err);
      setCases([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchCases();
    const ch = supabase?.channel('risk_cases_changes')
      ?.on('postgres_changes', { event: '*', schema: 'public', table: 'risk_cases' }, () => fetchCases())
      .subscribe();
    return () => { ch && supabase?.removeChannel(ch); };
  }, [fetchCases]);

  useEffect(() => {
    if (!expandedId) return;
    (async () => {
      if (supabase) {
        const { data, error } = await supabase
          .from('audit_log')
          .select('*')
          .eq('case_id', expandedId)
          .order('created_at', { ascending: false });
        if (!error) setAuditByCase(prev => ({ ...prev, [expandedId]: data || [] }));
      } else {
        try {
          const { data } = await axios.get(`${API_BASE}/api/agent/audit/${expandedId}`);
          setAuditByCase(prev => ({ ...prev, [expandedId]: Array.isArray(data) ? data : [] }));
        } catch (_) {
          setAuditByCase(prev => ({ ...prev, [expandedId]: [] }));
        }
      }
    })();
  }, [expandedId]);

  const overallScore = (c: RiskCaseRow) => {
    const s = c.scores;
    if (typeof s?.overall_risk === 'number') return s.overall_risk;
    if (typeof s?.probability === 'number' && typeof s?.impact === 'number') return Math.round((s.probability + s.impact) / 2);
    return null;
  };

  const scoreColor = (n: number) =>
    n >= 70 ? 'bg-rose-100 text-rose-800' : n >= 40 ? 'bg-amber-100 text-amber-800' : 'bg-slate-100 text-slate-700';

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Risk Cases</h1>
          <p className="text-sm text-slate-500 mt-1">Prioritized disruption cases. Click a row to expand.</p>
        </div>
        <button onClick={fetchCases} className="flex items-center gap-2 px-4 py-2 bg-white border border-slate-200 rounded-lg text-sm font-medium hover:bg-slate-50">
          <Activity size={16} /> Refresh
        </button>
      </div>

      <div className="glass-panel overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-slate-500">Loading risk_cases...</div>
        ) : cases.length === 0 ? (
          <div className="p-8 text-center text-slate-500">
            No rows in risk_cases table.
            {!supabase && <span className="block mt-2 text-xs text-amber-600">Using backend API. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY for direct Supabase.</span>}
          </div>
        ) : (
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50/50 text-slate-500 uppercase tracking-wider text-xs border-b border-slate-200">
              <tr>
                <th className="w-8 px-4 py-3"></th>
                <th className="px-4 py-3 font-medium">case_id</th>
                <th className="px-4 py-3 font-medium">headline</th>
                <th className="px-4 py-3 font-medium">risk_category</th>
                <th className="px-4 py-3 font-medium">status</th>
                <th className="px-4 py-3 font-medium">overall score</th>
                <th className="px-4 py-3 font-medium">created_at</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {cases.map((c) => {
                const open = expandedId === c.case_id;
                const score = overallScore(c);
                return (
                  <Fragment key={c.case_id}>
                    <tr
                      key={c.id}
                      className="hover:bg-slate-50/50 cursor-pointer"
                      onClick={() => setExpandedId(open ? null : c.case_id)}
                    >
                      <td className="px-4 py-3">{open ? <ChevronDown size={18} /> : <ChevronRight size={18} />}</td>
                      <td className="px-4 py-3 font-mono text-xs">{c.case_id}</td>
                      <td className="px-4 py-3 font-medium text-slate-900 max-w-xs truncate">{c.headline || c.case_id}</td>
                      <td className="px-4 py-3">
                        <span className="px-2 py-0.5 rounded bg-slate-100 text-slate-700 text-xs font-medium">
                          {c.risk_category || '—'}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span className={cn(
                          "px-2 py-0.5 rounded text-xs font-bold uppercase",
                          c.status === 'open' ? "bg-rose-100 text-rose-700" :
                            c.status === 'monitoring' ? "bg-amber-100 text-amber-700" : "bg-slate-100 text-slate-600"
                        )}>
                          {c.status}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        {score != null ? (
                          <span className={cn("px-2 py-0.5 rounded font-mono font-bold text-xs", scoreColor(score))}>{score}</span>
                        ) : '—'}
                      </td>
                      <td className="px-4 py-3 text-slate-500">
                        {c.created_at ? format(new Date(c.created_at), 'yyyy-MM-dd HH:mm') : '—'}
                      </td>
                    </tr>
                    {open && (
                      <tr className="bg-slate-50/50">
                        <td colSpan={7} className="px-6 py-4 border-t border-slate-200">
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 text-sm">
                            <div>
                              <h4 className="text-xs font-bold text-slate-500 uppercase mb-2">Scores breakdown</h4>
                              <pre className="bg-white p-3 rounded border border-slate-200 text-xs overflow-x-auto">
                                {JSON.stringify(c.scores || {}, null, 2)}
                              </pre>
                            </div>
                            <div>
                              <h4 className="text-xs font-bold text-slate-500 uppercase mb-2">Hypotheses chain</h4>
                              <ul className="list-disc list-inside space-y-1 text-slate-700">
                                {(c.hypotheses || []).map((h: any, i: number) => (
                                  <li key={i}>{h.title || ''} {h.description ? `— ${h.description}` : ''}</li>
                                ))}
                                {(!c.hypotheses || c.hypotheses.length === 0) && <li className="text-slate-500">—</li>}
                              </ul>
                            </div>
                            <div className="md:col-span-2">
                              <h4 className="text-xs font-bold text-slate-500 uppercase mb-2">Recommended plan</h4>
                              <p className="text-slate-700">{c.recommended_plan || '—'}</p>
                              {c.alternative_plans && c.alternative_plans.length > 0 && (
                                <>
                                  <h4 className="text-xs font-bold text-slate-500 uppercase mb-2 mt-3">Alternative plans</h4>
                                  <pre className="bg-white p-3 rounded border border-slate-200 text-xs overflow-x-auto">
                                    {JSON.stringify(c.alternative_plans, null, 2)}
                                  </pre>
                                </>
                              )}
                            </div>
                            <div className="md:col-span-2">
                              <h4 className="text-xs font-bold text-slate-500 uppercase mb-2">Execution steps</h4>
                              <pre className="bg-white p-3 rounded border border-slate-200 text-xs overflow-x-auto">
                                {JSON.stringify(c.execution_steps || [], null, 2)}
                              </pre>
                            </div>
                            <div className="md:col-span-2">
                              <h4 className="text-xs font-bold text-slate-500 uppercase mb-2">Audit trail</h4>
                              {(!auditByCase[c.case_id] || auditByCase[c.case_id].length === 0) && <p className="text-slate-500">No audit_log entries for this case.</p>}
                              {auditByCase[c.case_id]?.length > 0 && (
                                <ul className="space-y-1 text-xs">
                                  {auditByCase[c.case_id].map((a: any) => (
                                    <li key={a.id} className="flex gap-2">
                                      <span className="text-slate-500">{a.created_at ? format(new Date(a.created_at), 'yyyy-MM-dd HH:mm:ss') : ''}</span>
                                      <span className="font-medium">{a.event_type}</span>
                                      <span className="text-slate-600">{a.actor || ''}</span>
                                      <span className="text-slate-500 truncate">{JSON.stringify(a.payload)}</span>
                                    </li>
                                  ))}
                                </ul>
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
    </div>
  );
}
