import { Outlet } from 'react-router-dom';
import Sidebar from './Sidebar';
import Topbar from './Topbar';

export default function MainLayout() {
    return (
        <div className="min-h-screen bg-slate-50 flex">
            <Sidebar />
            <div className="flex-1 ml-64 flex flex-col min-h-screen">
                <Topbar />
                <main className="flex-1 p-8 overflow-x-hidden">
                    <Outlet />
                </main>
            </div>
        </div>
    );
}
