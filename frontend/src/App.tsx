import { Routes, Route } from 'react-router-dom';
import MainLayout from './components/layout/MainLayout';
import DashboardOverview from './pages/Dashboard';
import EventsFeed from './pages/Events';
import RiskCases from './pages/RiskCases';
import CaseDetail from './pages/CaseDetail';
import ActionsApproval from './pages/Actions';
import OmniAgentPanel from './components/OmniAgentPanel';
import LiveSimulation from './pages/LiveSimulation';
import Configuration from './pages/Configuration';
import ActivityLog from './pages/ActivityLog';

function App() {
  return (
    <Routes>
      <Route path="/" element={<MainLayout />}>
        <Route index element={<DashboardOverview />} />
        <Route path="events" element={<EventsFeed />} />
        <Route path="cases" element={<RiskCases />} />
        <Route path="cases/:id" element={<CaseDetail />} />
        <Route path="actions" element={<ActionsApproval />} />
        <Route path="agent" element={<OmniAgentPanel />} />
        <Route path="simulation" element={<LiveSimulation />} />
        <Route path="config" element={<Configuration />} />
        <Route path="logs" element={<ActivityLog />} />
      </Route>
    </Routes>
  );
}

export default App;
