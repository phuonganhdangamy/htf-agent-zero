import {
    PackageSearch,
    Truck,
    CircleDollarSign,
    Users,
    CalendarClock,
    Fuel,
    Clock4,
    AlertTriangle,
    RefreshCw,
    Download,
    Plus,
    Filter
} from 'lucide-react';
import { cn } from '../lib/utils';

export default function DashboardOverview() {
    const kpis = [
        { label: 'Active Orders', value: '1,248', icon: PackageSearch, trend: '+12%', positive: true },
        { label: 'Active Trips', value: '432', icon: Truck, trend: '+5%', positive: true },
        { label: 'Monthly Revenue', value: '$8.4M', icon: CircleDollarSign, trend: '+2.4%', positive: true },
        { label: 'Users', value: '84', icon: Users, trend: '0%', positive: true },
        { label: 'Pending Bookings', value: '156', icon: CalendarClock, trend: '-2%', positive: false },
        { label: 'Fuel Efficiency', value: '6.8 mpg', icon: Fuel, trend: '+1.2%', positive: true },
        { label: 'On-Time Arrival Rate', value: '94.2%', icon: Clock4, trend: '-1.5%', positive: false },
        { label: 'Maintenance Alerts', value: '12', icon: AlertTriangle, trend: '+4', positive: false, urgent: true },
    ];

    return (
        <div className="max-w-7xl mx-auto space-y-6">
            <div className="flex items-end justify-between">
                <div>
                    <h1 className="text-3xl font-bold text-slate-900 tracking-tight">Dashboard Overview</h1>
                    <p className="text-slate-500 mt-1">Real-time supply chain operations monitoring</p>
                </div>

                <div className="flex items-center gap-3">
                    <button className="glass-panel px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50 transition-colors">
                        Last 7 days
                    </button>
                    <button className="glass-panel px-3 py-2 text-slate-600 hover:bg-slate-50 transition-colors flex items-center gap-2">
                        <Filter size={16} /> Filters
                    </button>
                    <button className="glass-panel px-3 py-2 text-slate-600 hover:bg-slate-50 transition-colors flex items-center gap-2">
                        <RefreshCw size={16} /> Refresh
                    </button>
                    <button className="glass-panel px-3 py-2 text-slate-600 hover:bg-slate-50 transition-colors flex items-center gap-2">
                        <Download size={16} /> Export
                    </button>
                    <button className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-xl text-sm font-medium transition-colors shadow-sm flex items-center gap-2">
                        <Plus size={16} /> Create Item
                    </button>
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                {kpis.map((kpi, idx) => (
                    <div key={idx} className={cn(
                        "glass-panel p-5 relative overflow-hidden group",
                        kpi.urgent && "border-rose-200 bg-rose-50/30"
                    )}>
                        <div className="flex justify-between items-start mb-4">
                            <div className={cn(
                                "p-2 rounded-lg",
                                kpi.urgent ? "bg-rose-100 text-rose-600" : "bg-blue-50 text-blue-600"
                            )}>
                                <kpi.icon size={20} />
                            </div>
                            <span className={cn(
                                "text-xs font-semibold px-2 py-1 rounded-full",
                                kpi.positive ? "bg-emerald-100 text-emerald-700" : "bg-rose-100 text-rose-700"
                            )}>
                                {kpi.trend}
                            </span>
                        </div>
                        <div>
                            <h3 className="text-3xl font-bold text-slate-900">{kpi.value}</h3>
                            <p className="text-sm font-medium text-slate-500 mt-1">{kpi.label}</p>
                        </div>
                        <div className="absolute -right-4 -bottom-4 opacity-5 pointer-events-none group-hover:scale-110 transition-transform duration-500">
                            <kpi.icon size={100} />
                        </div>
                    </div>
                ))}
            </div>

            <div className="glass-panel p-5 mt-6 min-h-[500px] flex flex-col">
                <div className="flex items-center justify-between mb-4">
                    <h2 className="text-lg font-bold text-slate-900">Live Fleet Tracking & Disruption Mapping</h2>
                    <div className="flex items-center gap-2">
                        {['All Orders', 'Active Only', 'Road', 'Air', 'Sea'].map((pill, i) => (
                            <button key={i} className={cn(
                                "px-3 py-1.5 text-xs font-medium rounded-full border transition-colors",
                                i === 0 ? "bg-slate-900 text-white border-slate-900" : "bg-white text-slate-600 border-slate-200 hover:bg-slate-50"
                            )}>
                                {pill}
                            </button>
                        ))}
                    </div>
                </div>

                <div className="flex-1 bg-slate-100 rounded-lg border border-slate-200 relative overflow-hidden flex items-center justify-center">
                    {/* Placeholder for Map since we avoid API keys unless needed */}
                    <div className="text-center p-8 max-w-sm">
                        <div className="w-16 h-16 bg-blue-100 text-blue-500 rounded-full flex items-center justify-center mx-auto mb-4 animate-pulse">
                            <Truck size={32} />
                        </div>
                        <h3 className="font-semibold text-slate-700 mb-2">Map Interface Initializing</h3>
                        <p className="text-sm text-slate-500">Live map component showing routes, suppliers, and geospatial event clusters.</p>
                    </div>
                </div>
            </div>
        </div>
    );
}
