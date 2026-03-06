import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { Link } from 'react-router-dom';
import { format } from 'date-fns';
import { Activity } from 'lucide-react';

interface AuditEntry {
  id: string;
  created_at: string;
  event_type: string;
  case_id: string | null;
  actor: string | null;
  payload: Record<string, unknown> | null;
}

function oneLineSummary(payload: Record<string, unknown> | null): string {
  if (!payload) return '—';
  const str = JSON.stringify(payload);
  return str.length > 80 ? str.slice(0, 77) + '...' : str;
}

export default function ActivityLog() {
  const [entries, setEntries] = useState<AuditEntry[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchLog = useCallback(async () => {
    if (!supabase) return;
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('audit_log')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      setEntries(data || []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchLog();
    const interval = setInterval(fetchLog, 30000);
    return () => clearInterval(interval);
  }, [fetchLog]);

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Activity Log</h1>
          <p className="text-sm text-slate-500 mt-1">Audit trail from audit_log. Auto-refreshes every 30s.</p>
        </div>
        <button onClick={fetchLog} className="flex items-center gap-2 px-4 py-2 bg-white border border-slate-200 rounded-lg text-sm font-medium hover:bg-slate-50">
          <Activity size={16} /> Refresh
        </button>
      </div>

      <div className="glass-panel overflow-hidden">
        {loading && entries.length === 0 ? (
          <div className="p-8 text-center text-slate-500">Loading audit_log...</div>
        ) : !supabase ? (
          <div className="p-8 text-center text-amber-600">Supabase not configured.</div>
        ) : entries.length === 0 ? (
          <div className="p-8 text-center text-slate-500">No entries in audit_log table.</div>
        ) : (
          <table className="w-full text-left text-sm whitespace-nowrap">
            <thead className="bg-slate-50/50 text-slate-500 uppercase tracking-wider text-xs border-b border-slate-200">
              <tr>
                <th className="px-6 py-4 font-medium">Timestamp</th>
                <th className="px-6 py-4 font-medium">event_type</th>
                <th className="px-6 py-4 font-medium">case_id</th>
                <th className="px-6 py-4 font-medium">actor</th>
                <th className="px-6 py-4 font-medium">Summary</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {entries.map((row) => (
                <tr key={row.id} className="hover:bg-slate-50/50">
                  <td className="px-6 py-4 text-slate-600">
                    {row.created_at ? format(new Date(row.created_at), 'yyyy-MM-dd HH:mm:ss') : '—'}
                  </td>
                  <td className="px-6 py-4">
                    <span className="bg-slate-100 text-slate-700 px-2 py-1 rounded text-xs font-medium">
                      {row.event_type || '—'}
                    </span>
                  </td>
                  <td className="px-6 py-4">
                    {row.case_id ? (
                      <Link to={`/cases/${row.case_id}`} className="text-blue-600 hover:underline font-mono text-xs">
                        {row.case_id}
                      </Link>
                    ) : (
                      '—'
                    )}
                  </td>
                  <td className="px-6 py-4 text-slate-600">{row.actor || '—'}</td>
                  <td className="px-6 py-4 text-slate-600 max-w-xs truncate" title={JSON.stringify(row.payload)}>
                    {oneLineSummary(row.payload)}
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
