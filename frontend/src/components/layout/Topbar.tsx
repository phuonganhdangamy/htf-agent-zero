import { useState, useEffect, useRef } from 'react';
import { Bell, Search, Sun, AlertTriangle, Info, CheckCircle2, X } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { format } from 'date-fns';
import axios from 'axios';

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:8000';

interface Alert {
    id: string;
    case_id: string | null;
    severity: 'critical' | 'high' | 'elevated' | 'info';
    message: string;
    read: boolean;
    created_at: string;
}

const severityIcon = (s: string) => {
    if (s === 'critical' || s === 'high') return <AlertTriangle size={14} className="text-rose-500 shrink-0 mt-0.5" />;
    if (s === 'elevated') return <AlertTriangle size={14} className="text-amber-500 shrink-0 mt-0.5" />;
    return <Info size={14} className="text-blue-500 shrink-0 mt-0.5" />;
};

export default function Topbar() {
    const [alerts, setAlerts] = useState<Alert[]>([]);
    const [showDropdown, setShowDropdown] = useState(false);
    const dropdownRef = useRef<HTMLDivElement>(null);

    const unreadCount = alerts.filter(a => !a.read).length;

    const fetchAlerts = async () => {
        try {
            const { data } = await axios.get(`${API_BASE}/api/monitoring/alerts`, { params: { limit: 20 } });
            setAlerts(Array.isArray(data) ? data : []);
        } catch {
            // silently ignore if backend not running
        }
    };

    useEffect(() => {
        fetchAlerts();

        const ch = supabase?.channel('alerts_realtime')
            ?.on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'alerts' }, () => fetchAlerts())
            .subscribe();

        const interval = setInterval(fetchAlerts, 60000);
        return () => {
            ch && supabase?.removeChannel(ch);
            clearInterval(interval);
        };
    }, []);

    useEffect(() => {
        const handler = (e: MouseEvent) => {
            if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
                setShowDropdown(false);
            }
        };
        document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, []);

    const markAllRead = async () => {
        try {
            await axios.patch(`${API_BASE}/api/monitoring/alerts/read-all`);
            setAlerts(prev => prev.map(a => ({ ...a, read: true })));
        } catch { /* ignore */ }
    };

    const markRead = async (id: string) => {
        try {
            await axios.patch(`${API_BASE}/api/monitoring/alerts/${id}/read`);
            setAlerts(prev => prev.map(a => a.id === id ? { ...a, read: true } : a));
        } catch { /* ignore */ }
    };

    return (
        <header className="h-16 bg-white border-b border-slate-200 flex items-center justify-between px-8 sticky top-0 z-10 w-full">
            <div className="flex items-center max-w-md w-full relative">
                <Search className="absolute left-3 text-slate-400" size={18} />
                <input
                    type="text"
                    placeholder="Search activities, orders, or suppliers..."
                    className="w-full bg-slate-100 rounded-lg pl-10 pr-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:bg-white transition-all border border-transparent focus:border-blue-500"
                />
            </div>

            <div className="flex items-center gap-6">
                <div className="text-sm font-medium text-slate-600 border-r border-slate-200 pr-6">
                    {new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', timeZoneName: 'short' })}
                </div>

                <div className="flex items-center gap-4">
                    <button className="text-slate-400 hover:text-slate-600 transition-colors">
                        <Sun size={20} />
                    </button>

                    <div ref={dropdownRef} className="relative">
                        <button
                            className="relative text-slate-400 hover:text-slate-600 transition-colors"
                            onClick={() => setShowDropdown(v => !v)}
                        >
                            <Bell size={20} />
                            {unreadCount > 0 && (
                                <span className="absolute -top-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-red-500 text-[9px] font-bold text-white">
                                    {unreadCount > 9 ? '9+' : unreadCount}
                                </span>
                            )}
                        </button>

                        {showDropdown && (
                            <div className="absolute right-0 top-full mt-2 w-96 bg-white rounded-xl shadow-2xl border border-slate-200 z-50 overflow-hidden">
                                <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between">
                                    <span className="font-semibold text-slate-800 text-sm">Alerts & Notifications</span>
                                    <div className="flex items-center gap-2">
                                        {unreadCount > 0 && (
                                            <button onClick={markAllRead} className="text-xs text-blue-600 hover:underline">
                                                Mark all read
                                            </button>
                                        )}
                                        <button onClick={() => setShowDropdown(false)}>
                                            <X size={16} className="text-slate-400 hover:text-slate-600" />
                                        </button>
                                    </div>
                                </div>

                                <div className="max-h-80 overflow-y-auto">
                                    {alerts.length === 0 ? (
                                        <div className="px-4 py-6 text-center text-slate-400 text-sm">
                                            <CheckCircle2 size={24} className="mx-auto mb-2 text-emerald-500" />
                                            All clear — no active alerts
                                        </div>
                                    ) : (
                                        alerts.map(alert => (
                                            <div
                                                key={alert.id}
                                                className={`px-4 py-3 border-b border-slate-50 hover:bg-slate-50 cursor-pointer transition-colors ${!alert.read ? 'bg-blue-50/30' : ''}`}
                                                onClick={() => !alert.read && markRead(alert.id)}
                                            >
                                                <div className="flex gap-2 items-start">
                                                    {severityIcon(alert.severity)}
                                                    <div className="flex-1 min-w-0">
                                                        <div className="flex items-center gap-1.5 flex-wrap">
                                                            <span className={`text-[10px] font-bold uppercase px-1.5 py-0.5 rounded shrink-0 ${
                                                                alert.severity === 'critical' ? 'bg-rose-100 text-rose-700' :
                                                                alert.severity === 'high' ? 'bg-orange-100 text-orange-700' :
                                                                alert.severity === 'elevated' ? 'bg-amber-100 text-amber-700' :
                                                                'bg-blue-100 text-blue-700'
                                                            }`}>{alert.severity}</span>
                                                            {!alert.read && <span className="w-1.5 h-1.5 rounded-full bg-blue-500 shrink-0" />}
                                                            <span className="text-xs text-slate-700 leading-snug">{alert.message}</span>
                                                        </div>
                                                        <p className="text-[10px] text-slate-400 mt-0.5">
                                                            {alert.created_at ? format(new Date(alert.created_at), 'MMM d, HH:mm') : ''}
                                                        </p>
                                                    </div>
                                                </div>
                                            </div>
                                        ))
                                    )}
                                </div>
                            </div>
                        )}
                    </div>

                    <button className="flex items-center gap-2 pl-2 cursor-pointer hover:opacity-80 transition-opacity">
                        <div className="w-8 h-8 bg-blue-100 text-blue-600 rounded-full flex items-center justify-center font-bold">
                            AD
                        </div>
                        <div className="flex flex-col text-left">
                            <span className="text-sm font-semibold text-slate-700 leading-tight">Administrator</span>
                            <span className="text-xs text-slate-500">Supply Chain VP</span>
                        </div>
                    </button>
                </div>
            </div>
        </header>
    );
}
