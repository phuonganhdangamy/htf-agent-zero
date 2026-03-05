import { Bell, Search, Sun } from 'lucide-react';

export default function Topbar() {
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

                    <button className="relative text-slate-400 hover:text-slate-600 transition-colors">
                        <Bell size={20} />
                        <span className="absolute -top-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-red-500 text-[9px] font-bold text-white">
                            3
                        </span>
                    </button>

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
