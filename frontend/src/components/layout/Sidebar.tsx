import { NavLink } from 'react-router-dom';
import {
    Building2,
    Tags,
    Users,
    Activity,
    ScrollText,
    Settings,
    Bot,
    BarChart3,
    LayoutDashboard,
    ShieldAlert,
    CheckSquare,
    Cpu,
    Heart,
    Brain,
    Newspaper
} from 'lucide-react';
import { cn } from '../../lib/utils';

export default function Sidebar() {
    const navItems = [
        { title: 'Dashboard', icon: LayoutDashboard, path: '/' },
        { title: 'Events Feed', icon: Activity, path: '/events' },
        { title: 'Risk Cases', icon: ShieldAlert, path: '/cases' },
        { title: 'Actions', icon: CheckSquare, path: '/actions' },
        { title: 'Agent Pipeline', icon: Cpu, path: '/pipeline' },
        { title: 'Supplier Health', icon: Heart, path: '/supplier-health' },
        { title: 'Memory & Learning', icon: Brain, path: '/memory' },
        { title: 'Activity Logs', icon: ScrollText, path: '/logs' },
        { title: 'Configuration', icon: Settings, path: '/config' },
    ];

    return (
        <div className="w-64 bg-slate-900 text-slate-300 flex flex-col h-screen fixed left-0 top-0 border-r border-slate-800">
            <div className="p-6 font-semibold text-white tracking-wider text-xl flex items-center gap-2">
                <Bot className="text-blue-500" />
                OMNI
            </div>

            <div className="flex flex-col flex-1 pb-4 overflow-y-auto">
                <nav className="flex-1 px-4 space-y-1">
                    {navItems.map((item) => (
                        <NavLink
                            key={item.title}
                            to={item.path}
                            className={({ isActive }) => cn(
                                "flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors",
                                isActive
                                    ? "bg-slate-800 text-white"
                                    : "hover:bg-slate-800/50 hover:text-white"
                            )}
                        >
                            <item.icon size={18} className={cn("opacity-70")} />
                            <span className="flex-1">{item.title}</span>
                            {item.badge && (
                                <span className="bg-blue-600 text-white text-[10px] font-bold px-2 py-0.5 rounded-full">
                                    {item.badge}
                                </span>
                            )}
                        </NavLink>
                    ))}
                </nav>

                <div className="px-4 mt-8">
                    <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3 px-3">
                        Quick Actions
                    </div>
                    <div className="space-y-1">
                        <NavLink to="/simulation" className="flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium hover:bg-slate-800/50 hover:text-white text-emerald-400 group">
                            <Activity size={18} className="group-hover:text-emerald-300" />
                            Live Simulation
                        </NavLink>
                        <NavLink to="/agent" className="flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium hover:bg-slate-800/50 hover:text-white text-blue-400 group">
                            <Bot size={18} className="group-hover:text-blue-300" />
                            Launch Omni Agent
                        </NavLink>
                        <button className="flex w-full items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium hover:bg-slate-800/50 hover:text-white">
                            <BarChart3 size={18} className="opacity-70" />
                            View Analytics
                        </button>
                    </div>
                </div>

                <div className="px-4 mt-auto pt-6">
                    <div className="bg-slate-800/50 rounded-xl p-4 border border-slate-700/50">
                        <div className="flex items-center justify-between mb-2">
                            <span className="text-sm font-medium text-white">System Status</span>
                            <span className="flex h-2 w-2">
                                <span className="animate-ping absolute inline-flex h-2 w-2 rounded-full bg-emerald-400 opacity-75"></span>
                                <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                            </span>
                        </div>
                        <p className="text-xs text-slate-400">All agent services operational. Realtime sync active.</p>
                    </div>
                </div>
            </div>
        </div>
    );
}
