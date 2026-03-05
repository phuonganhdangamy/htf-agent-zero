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
                                <th className="px-6 py-4 font-medium">Event</th>
                                <th className="px-6 py-4 font-medium">Type</th>
                                <th className="px-6 py-4 font-medium">Location</th>
                                <th className="px-6 py-4 font-medium">Severity</th>
                                <th className="px-6 py-4 font-medium">Ingested</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                            {events.map((ev) => (
                                <tr key={ev.id} className="hover:bg-slate-50/50 transition-colors">
                                    <td className="px-6 py-4">
                                        <div className="font-medium text-slate-900 truncate max-w-xs" title={ev.headline || ev.subtype || ev.event_id}>
                                            {ev.headline || ev.subtype || ev.event_id}
                                        </div>
                                        <div className="text-xs text-slate-500 font-mono mt-0.5">{ev.event_id}</div>
                                    </td>
                                    <td className="px-6 py-4">
                                        <span className="bg-slate-100 text-slate-700 px-2 py-1 rounded text-xs font-medium">
                                            {ev.event_type || 'Unknown'}
                                        </span>
                                    </td>
                                    <td className="px-6 py-4">
                                        <div className="flex items-center gap-1.5 text-slate-600">
                                            <Globe size={14} className="opacity-70" />
                                            {ev.country || 'Global'}
                                        </div>
                                    </td>
                                    <td className="px-6 py-4">
                                        <div className="flex items-center gap-2">
                                            <ShieldAlert size={16} className={cn(
                                                ev.severity_score && ev.severity_score > 0.7 ? "text-rose-500" :
                                                    ev.severity_score && ev.severity_score > 0.4 ? "text-amber-500" : "text-blue-500"
                                            )} />
                                            <span className="font-medium">
                                                {ev.severity_score ? `${Math.round(ev.severity_score * 100)}%` : 'N/A'}
                                            </span>
                                        </div>
                                    </td>
                                    <td className="px-6 py-4 text-slate-500">
                                        {ev.created_at ? format(new Date(ev.created_at), 'MMM d, HH:mm') : 'Unknown'}
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
