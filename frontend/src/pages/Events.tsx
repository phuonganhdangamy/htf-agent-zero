import { useState, useEffect, useMemo } from 'react';
import { supabase } from '../lib/supabase';
import type { DisruptionEvent } from '../types';
import { Globe, Activity, Search } from 'lucide-react';
import { format } from 'date-fns';

export default function EventsFeed() {
    const [events, setEvents] = useState<DisruptionEvent[]>([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState('');

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
                .limit(200);

            if (error) throw error;
            setEvents(data || []);
        } catch (err) {
            console.error('Error fetching events:', err);
        } finally {
            setLoading(false);
        }
    };

    const searchLower = search.trim().toLowerCase();
    const filteredEvents = useMemo(() => {
        if (!searchLower) return events;
        return events.filter((ev: any) => {
            const eventId = (ev.event_id ?? '').toString().toLowerCase();
            const eventType = (ev.event_type ?? '').toString().toLowerCase();
            const country = (ev.country ?? '').toString().toLowerCase();
            const subtype = (ev.subtype ?? '').toString().toLowerCase();
            const title = (ev.title ?? '').toString().toLowerCase();
            const summary = (ev.summary ?? '').toString().toLowerCase();
            const evidence = Array.isArray(ev.evidence_links)
                ? (ev.evidence_links as any[]).map((e: any) => (typeof e === 'string' ? e : e?.url ?? '')).join(' ').toLowerCase()
                : '';
            return (
                eventId.includes(searchLower) ||
                eventType.includes(searchLower) ||
                country.includes(searchLower) ||
                subtype.includes(searchLower) ||
                title.includes(searchLower) ||
                summary.includes(searchLower) ||
                evidence.includes(searchLower)
            );
        });
    }, [events, searchLower]);

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

            <div className="flex items-center gap-2">
                <div className="relative flex-1 max-w-sm">
                    <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                    <input
                        type="text"
                        placeholder="Search by event ID, type, country, subtype, title..."
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        className="w-full pl-10 pr-4 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-slate-300 focus:border-slate-300"
                    />
                </div>
                {search.trim() && (
                    <span className="text-sm text-slate-500">
                        {filteredEvents.length} of {events.length} events
                    </span>
                )}
            </div>

            <div className="glass-panel overflow-hidden">
                {loading ? (
                    <div className="p-8 text-center text-slate-500">Loading events...</div>
                ) : filteredEvents.length === 0 ? (
                    <div className="p-8 text-center text-slate-500">
                        {events.length === 0 ? 'No recent events found.' : `No events match "${search.trim()}".`}
                    </div>
                ) : (
                    <table className="w-full text-left text-sm whitespace-nowrap">
                        <thead className="bg-slate-50/50 text-slate-500 uppercase tracking-wider text-xs border-b border-slate-200">
                            <tr>
                                <th className="px-6 py-4 font-medium">event_id</th>
                                <th className="px-6 py-4 font-medium">event_type</th>
                                <th className="px-6 py-4 font-medium">country</th>
                                <th className="px-6 py-4 font-medium">subtype</th>
                                <th className="px-6 py-4 font-medium">confidence_score</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                            {filteredEvents.map((ev: any) => (
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
                                </tr>
                            ))}
                        </tbody>
                    </table>
                )}
            </div>
        </div>
    );
}
