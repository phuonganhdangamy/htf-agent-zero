import { useState, useEffect, useCallback, Fragment } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import type { RiskCase } from '../types';
import { Activity, ChevronDown, ChevronRight, ExternalLink, XCircle } from 'lucide-react';
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
  const [closingCaseId, setClosingCaseId] = useState<string | null>(null);

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
    if (s && typeof s === 'object' && typeof (s as any).overall_risk === 'number') return (s as any).overall_risk;
    if (s && typeof s === 'object' && typeof (s as any).overall === 'number') return (s as any).overall;
    if (s && typeof s === 'object' && typeof (s as any).probability === 'number' && typeof (s as any).impact === 'number') return Math.round(((s as any).probability + (s as any).impact) / 2);
    if (s && typeof s === 'object' && typeof (s as any).likelihood === 'number' && typeof (s as any).impact === 'number') return Math.round(((s as any).likelihood + (s as any).impact) / 2);
    return null;
  };

  const scoreColor = (n: number) =>
    n >= 70 ? 'bg-rose-100 text-rose-800' : n >= 40 ? 'bg-amber-100 text-amber-800' : 'bg-slate-100 text-slate-700';

  /** Normalize hypotheses for display: support array of { title, description } or legacy { chain: string[] }. */
  const handleCloseCase = async (caseId: string) => {
    if (closingCaseId) return;
    setClosingCaseId(caseId);
    try {
      await axios.post(`${API_BASE}/api/agent/abandon`, {
        case_id: caseId,
        actor: 'Omni Admin',
        reason: 'Closed from Risk Cases',
      });
      setExpandedId((id) => (id === caseId ? null : id));
      fetchCases();
    } catch (err) {
      console.error('Failed to close case:', err);
    } finally {
      setClosingCaseId(null);
    }
  };

  const getHypothesesList = (c: RiskCaseRow): Array<{ title: string; description: string }> => {
    const h = c.hypotheses;
    if (Array.isArray(h)) return h.map((x: any) => ({ title: x?.title ?? '', description: x?.description ?? '' }));
    if (h && typeof h === 'object' && Array.isArray((h as any).chain)) {
      return (h as any).chain.map((step: string, i: number) => ({ title: `Step ${i + 1}`, description: String(step) }));
    }
    return [];
  };

  /** Parse recommended_plan (may be JSON string or object). */
  const getRecommendedPlan = (c: RiskCaseRow): { name?: string; actions?: string[]; expected_cost_usd?: number; expected_loss_prevented_usd?: number; expected_delay_days?: number; service_level?: number } | null => {
    const r = c.recommended_plan;
    if (r == null) return null;
    if (typeof r === 'object') return r as any;
    if (typeof r === 'string') {
      try { return JSON.parse(r) as any; } catch { return { name: r }; }
    }
    return null;
  };

  /** Human-friendly score label. */
  const scoreLabel = (key: string) => {
    const labels: Record<string, string> = {
      likelihood: 'Likelihood',
      impact: 'Impact',
      urgency: 'Urgency',
      overall: 'Overall',
      overall_risk: 'Overall risk',
      confidence: 'Confidence',
      probability: 'Probability',
    };
    return labels[key] ?? key.replace(/_/g, ' ').replace(/\b\w/g, (s) => s.toUpperCase());
  };

  /** Execution steps as array of strings. */
  const getExecutionStepsList = (c: RiskCaseRow): string[] => {
    const s = c.execution_steps;
    if (Array.isArray(s)) return s.map((x: any) => typeof x === 'string' ? x : String(x ?? ''));
    if (s && typeof s === 'object') return [];
    return [];
  };

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
              {cases.map((c, idx) => {
                const caseId = c.case_id ?? (c as any).id ?? `case-${idx}`;
                const open = expandedId === caseId;
                const score = overallScore(c);
                return (
                  <Fragment key={caseId}>
                    <tr
                      className="hover:bg-slate-50/50 cursor-pointer"
                      onClick={() => setExpandedId(open ? null : caseId)}
                    >
                      <td className="px-4 py-3">{open ? <ChevronDown size={18} /> : <ChevronRight size={18} />}</td>
                      <td className="px-4 py-3 font-mono text-xs">
                        {c.case_id && (
                          <Link to={`/cases/${c.case_id}`} className="text-blue-600 hover:underline inline-flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                            {c.case_id} <ExternalLink size={12} />
                          </Link>
                        )}
                        {!c.case_id && <span>{caseId}</span>}
                      </td>
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
                            c.status === 'monitoring' ? "bg-amber-100 text-amber-700" :
                            c.status === 'closed' ? "bg-slate-100 text-slate-600" : "bg-slate-100 text-slate-600"
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
                              <div className="flex flex-wrap gap-2">
                                {c.scores && typeof c.scores === 'object' && Object.entries(c.scores).map(([key, val]) => {
                                  if (val === null || val === undefined || typeof val === 'object') return null;
                                  const n = typeof val === 'number' ? Math.round(val) : val;
                                  return (
                                    <span key={key} className={cn("inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium bg-slate-100 text-slate-800", typeof n === 'number' && n >= 70 && 'bg-rose-100 text-rose-800', typeof n === 'number' && n >= 40 && n < 70 && 'bg-amber-100 text-amber-800')}>
                                      <span className="text-slate-500">{scoreLabel(key)}:</span>
                                      <span className="font-semibold">{String(n)}</span>
                                    </span>
                                  );
                                })}
                                {(!c.scores || typeof c.scores !== 'object' || Object.keys(c.scores).length === 0) && (
                                  <span className="text-slate-500 text-xs">No scores</span>
                                )}
                              </div>
                            </div>
                            <div>
                              <h4 className="text-xs font-bold text-slate-500 uppercase mb-2">Hypotheses chain</h4>
                              <ul className="list-disc list-inside space-y-1 text-slate-700">
                                {getHypothesesList(c).map((h, i) => (
                                  <li key={i}>{h.title ? `${h.title} — ` : ''}{h.description || '—'}</li>
                                ))}
                                {getHypothesesList(c).length === 0 && <li className="text-slate-500">—</li>}
                              </ul>
                            </div>
                            <div className="md:col-span-2">
                              <h4 className="text-xs font-bold text-slate-500 uppercase mb-2">Recommended plan</h4>
                              {(() => {
                                const plan = getRecommendedPlan(c);
                                if (!plan) return <p className="text-slate-500 text-sm">—</p>;
                                const name = plan.name || plan.plan_id || 'Recommended plan';
                                const actions = Array.isArray(plan.actions) ? plan.actions : [];
                                return (
                                  <div className="bg-white border border-slate-200 rounded-lg p-4 space-y-3 text-sm">
                                    <div className="font-semibold text-slate-900">{name}</div>
                                    {actions.length > 0 && (
                                      <ul className="list-disc list-inside space-y-1 text-slate-700">
                                        {actions.map((a: string, i: number) => (
                                          <li key={i}>{a}</li>
                                        ))}
                                      </ul>
                                    )}
                                    <div className="flex flex-wrap gap-3 text-slate-600">
                                      {plan.expected_cost_usd != null && <span>Expected cost: <span className="font-medium text-slate-800">${Number(plan.expected_cost_usd).toLocaleString()}</span></span>}
                                      {plan.expected_loss_prevented_usd != null && <span>Loss prevented: <span className="font-medium text-slate-800">${Number(plan.expected_loss_prevented_usd).toLocaleString()}</span></span>}
                                      {plan.expected_delay_days != null && <span>Delay: <span className="font-medium text-slate-800">{plan.expected_delay_days} days</span></span>}
                                      {plan.service_level != null && <span>Service level: <span className="font-medium text-slate-800">{(Number(plan.service_level) * 100).toFixed(0)}%</span></span>}
                                    </div>
                                  </div>
                                );
                              })()}
                              {Array.isArray(c.alternative_plans) && c.alternative_plans.length > 0 && (
                                <>
                                  <h4 className="text-xs font-bold text-slate-500 uppercase mb-2 mt-4">Alternative plans</h4>
                                  <div className="space-y-3">
                                    {c.alternative_plans.map((alt: any, idx: number) => {
                                      const ap = typeof alt === 'object' ? alt : {};
                                      const aname = ap.name || ap.plan_id || `Option ${idx + 1}`;
                                      const aactions = Array.isArray(ap.actions) ? ap.actions : [];
                                      return (
                                        <div key={idx} className="bg-slate-50 border border-slate-200 rounded-lg p-3 text-sm">
                                          <div className="font-medium text-slate-800 mb-1">{aname}</div>
                                          {aactions.length > 0 && (
                                            <ul className="list-disc list-inside text-slate-600 text-xs space-y-0.5 mb-2">
                                              {aactions.map((a: string, i: number) => <li key={i}>{a}</li>)}
                                            </ul>
                                          )}
                                          <div className="flex flex-wrap gap-2 text-xs text-slate-500">
                                            {ap.expected_cost_usd != null && <span>Cost: ${Number(ap.expected_cost_usd).toLocaleString()}</span>}
                                            {ap.expected_loss_prevented_usd != null && <span>Loss prevented: ${Number(ap.expected_loss_prevented_usd).toLocaleString()}</span>}
                                          </div>
                                        </div>
                                      );
                                    })}
                                  </div>
                                </>
                              )}
                            </div>
                            <div className="md:col-span-2">
                              <h4 className="text-xs font-bold text-slate-500 uppercase mb-2">Execution steps</h4>
                              {getExecutionStepsList(c).length > 0 ? (
                                <ol className="list-decimal list-inside space-y-1.5 text-sm text-slate-700 bg-white border border-slate-200 rounded-lg p-4">
                                  {getExecutionStepsList(c).map((step, i) => (
                                    <li key={i}>{step}</li>
                                  ))}
                                </ol>
                              ) : (
                                <p className="text-slate-500 text-sm">No execution steps recorded.</p>
                              )}
                            </div>
                            <div className="md:col-span-2">
                              <h4 className="text-xs font-bold text-slate-500 uppercase mb-2">Audit trail</h4>
                              {(!auditByCase[caseId] || auditByCase[caseId].length === 0) && <p className="text-slate-500">No audit_log entries for this case.</p>}
                              {auditByCase[caseId]?.length > 0 && (
                                <ul className="space-y-1 text-xs">
                                  {auditByCase[caseId].map((a: any, ai: number) => (
                                    <li key={a?.id ?? `audit-${ai}`} className="flex gap-2">
                                      <span className="text-slate-500">{a.created_at ? format(new Date(a.created_at), 'yyyy-MM-dd HH:mm:ss') : ''}</span>
                                      <span className="font-medium">{a.event_type}</span>
                                      <span className="text-slate-600">{a.actor || ''}</span>
                                      <span className="text-slate-500 truncate">{JSON.stringify(a.payload)}</span>
                                    </li>
                                  ))}
                                </ul>
                              )}
                            </div>
                            {c.status === 'open' && (
                              <div className="md:col-span-2 pt-2 border-t border-slate-200">
                                <button
                                  type="button"
                                  onClick={(e) => { e.stopPropagation(); handleCloseCase(caseId); }}
                                  disabled={closingCaseId === caseId}
                                  className="flex items-center gap-2 px-3 py-1.5 text-sm font-medium text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors disabled:opacity-50"
                                  title="Close this case (sets status to abandoned; it will no longer count as open)"
                                >
                                  <XCircle size={16} /> {closingCaseId === caseId ? 'Closing…' : 'Close case'}
                                </button>
                                <p className="text-xs text-slate-500 mt-1">Closing sets status to abandoned. The case will no longer appear in dashboard open-case counts.</p>
                              </div>
                            )}
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
