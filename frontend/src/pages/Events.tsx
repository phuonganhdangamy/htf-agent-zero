import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import type { DisruptionEvent } from '../types';
import { ShieldAlert, Globe, Activity } from 'lucide-react';
import { cn } from '../lib/utils';
import { format } from 'date-fns';

export default function EventsFeed() {
    const [events, setEvents] = useState<DisruptionEvent[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        fetchEvents();
    }, []);

    const fetchEvents = async () => {
        try {
            setLoading(true);
            const { data, error } = await supabase
                .from('signal_events')
                .select('*')
                .order('created_at', { ascending: false })
                .limit(50);

            if (error) throw error;
            setEvents(data || []);
        } catch (err) {
            console.error('Error fetching events:', err);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="max-w-5xl mx-auto space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold text-slate-900">Events Feed</h1>
                    <p className="text-sm text-slate-500 mt-1">Raw disruption signals ingested from external sources</p>
                </div>
                <button onClick={fetchEvents} className="btn-secondary flex items-center gap-2 px-4 py-2 bg-white border border-slate-200 rounded-lg text-sm font-medium hover:bg-slate-50">
                    <Activity size={16} /> Refresh Feed
                </button>
            </div>

            <div className="glass-panel overflow-hidden">
                {loading ? (
                    <div className="p-8 text-center text-slate-500">Loading events...</div>
                ) : events.length === 0 ? (
                    <div className="p-8 text-center text-slate-500">No recent events found.</div>
                ) : (
                    <table className="w-full text-left text-sm whitespace-nowrap">
                        <thead className="bg-slate-50/50 text-slate-500 uppercase tracking-wider text-xs border-b border-slate-200">
                            <tr>
                                <th className="px-6 py-4 font-medium">event_id</th>
                                <th className="px-6 py-4 font-medium">event_type</th>
                                <th className="px-6 py-4 font-medium">country</th>
                                <th className="px-6 py-4 font-medium">subtype</th>
                                <th className="px-6 py-4 font-medium">confidence_score</th>
                                <th className="px-6 py-4 font-medium">start_date</th>
                                <th className="px-6 py-4 font-medium">evidence</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                            {events.map((ev: any) => {
                                const evidenceLinks = Array.isArray(ev.evidence_links) ? ev.evidence_links : (ev.evidence_links ? [ev.evidence_links] : []);
                                const oneLink = typeof evidenceLinks[0] === 'string' ? evidenceLinks[0] : (evidenceLinks[0]?.url || evidenceLinks[0]);
                                return (
                                    <tr key={ev.id} className="hover:bg-slate-50/50 transition-colors">
                                        <td className="px-6 py-4 font-mono text-xs">{ev.event_id || '—'}</td>
                                        <td className="px-6 py-4">
                                            <span className="bg-slate-100 text-slate-700 px-2 py-1 rounded text-xs font-medium">
                                                {ev.event_type || '—'}
                                            </span>
                                        </td>
                                        <td className="px-6 py-4">
                                            <div className="flex items-center gap-1.5 text-slate-600">
                                                <Globe size={14} className="opacity-70" />
                                                {ev.country || '—'}
                                            </div>
                                        </td>
                                        <td className="px-6 py-4 text-slate-600">{ev.subtype || '—'}</td>
                                        <td className="px-6 py-4 font-mono text-xs">{ev.confidence_score != null ? Number(ev.confidence_score).toFixed(2) : '—'}</td>
                                        <td className="px-6 py-4 text-slate-600">
                                            {ev.start_date ? format(new Date(ev.start_date), 'yyyy-MM-dd') : '—'}
                                        </td>
                                        <td className="px-6 py-4">
                                            {oneLink ? (
                                                <a href={oneLink} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline text-xs truncate max-w-[120px] inline-block">
                                                    {oneLink}
                                                </a>
                                            ) : '—'}
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
