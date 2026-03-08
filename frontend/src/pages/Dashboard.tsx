import { useState, useEffect, useCallback, lazy, Suspense } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ShieldAlert,
  CircleDollarSign,
  Package,
  Truck,
  Activity,
  CheckSquare,
  RefreshCw,
  Scan,
  Loader2,
  ChevronRight,
} from 'lucide-react';
import axios from 'axios';
import { supabase } from '../lib/supabase';
import { cn } from '../lib/utils';

const DisruptionMap = lazy(() => import('../components/DisruptionMap'));

const API_BASE = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000';
const DEFAULT_COMPANY_ID = 'ORG_DEMO';

type MapFilter = 'all' | 'Conflict' | 'Weather' | 'Economic';

interface KPIData {
  activeRiskCases: number | null;
  revenueAtRisk: number | null;
  minInventoryCover: number | null;
  suppliersAtRisk: number | null;
  recentSignals: number | null;
  pendingApprovals: number | null;
}

export default function DashboardOverview() {
  const navigate = useNavigate();
  const [kpis, setKpis] = useState<KPIData>({
    activeRiskCases: null,
    revenueAtRisk: null,
    minInventoryCover: null,
    suppliersAtRisk: null,
    recentSignals: null,
    pendingApprovals: null,
  });
  const [loading, setLoading] = useState(true);
  const [scanning, setScanning] = useState(false);
  const [scanResult, setScanResult] = useState<string | null>(null);
  const [mapFilter, setMapFilter] = useState<MapFilter>('all');

  const fetchKPIs = useCallback(async () => {
    if (!supabase) return;
    setLoading(true);
    try {
      const [casesRes, inventoryRes, suppliersRes, signalsRes, approvalsRes] = await Promise.all([
        supabase.from('risk_cases').select('case_id,expected_loss_prevented').eq('status', 'open'),
        supabase.from('inventory').select('days_of_inventory_remaining'),
        supabase.from('suppliers').select('supplier_id').gte('criticality_score', 70),
        supabase.from('signal_events').select('event_id').gte('created_at', new Date(Date.now() - 86400000).toISOString()),
        supabase.from('change_proposals').select('proposal_id').eq('status', 'pending'),
      ]);

      const openCases = casesRes.data || [];
      // Sum of recommended_plan.expected_loss_prevented_usd across open risk cases.
      // This is agent-estimated "value of mitigation" from the Scenario Simulator LLM, not real revenue/financials.
      const revenueAtRisk = openCases.reduce((sum, c) => sum + (Number(c.expected_loss_prevented) || 0), 0);

      const inventoryRows = inventoryRes.data || [];
      const minCover = inventoryRows.length
        ? Math.min(...inventoryRows.map((r) => Number(r.days_of_inventory_remaining) || 999))
        : null;

      setKpis({
        activeRiskCases: openCases.length,
        revenueAtRisk,
        minInventoryCover: minCover === 999 ? 0 : minCover,
        suppliersAtRisk: (suppliersRes.data || []).length,
        recentSignals: (signalsRes.data || []).length,
        pendingApprovals: (approvalsRes.data || []).length,
      });
    } catch (e) {
      console.error('[dashboard] KPI fetch error', e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchKPIs();
    if (!supabase) return;
    // Real-time: refresh KPIs when risk_cases or change_proposals change
    const ch = supabase.channel('dashboard_kpi_watch')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'risk_cases' }, fetchKPIs)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'change_proposals' }, fetchKPIs)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'signal_events' }, fetchKPIs)
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [fetchKPIs]);

  const handleScan = async () => {
    setScanning(true);
    setScanResult(null);
    try {
      const res = await axios.post(`${API_BASE}/api/monitoring/scan`, null, {
        params: { company_id: DEFAULT_COMPANY_ID },
      });
      const { new_events_saved, escalations_triggered } = res.data;
      setScanResult(
        `Scan complete — ${new_events_saved} new event${new_events_saved !== 1 ? 's' : ''} saved${escalations_triggered > 0 ? `, ${escalations_triggered} auto-escalated` : ''}`
      );
      fetchKPIs();
    } catch (e) {
      setScanResult('Scan failed — check backend logs');
    } finally {
      setScanning(false);
    }
  };

  const formatValue = (v: number | null, fmt: 'int' | 'usd' | 'days' = 'int') => {
    if (v === null) return '—';
    if (fmt === 'usd') {
      if (v >= 1_000_000) return `$${(v / 1_000_000).toFixed(1)}M`;
      if (v >= 1_000) return `$${(v / 1_000).toFixed(0)}K`;
      return `$${v}`;
    }
    if (fmt === 'days') return `${v.toFixed(1)}d`;
    return v.toLocaleString();
  };

  const kpiCards: Array<{
    label: string;
    value: string;
    icon: React.ComponentType<{ size?: number; className?: string }>;
    urgent: boolean;
    sub: string;
    path?: string;
  }> = [
    {
      label: 'Active Risk Cases',
      value: formatValue(kpis.activeRiskCases),
      icon: ShieldAlert,
      urgent: (kpis.activeRiskCases ?? 0) > 0,
      sub: 'open cases',
      path: '/cases',
    },
    {
      label: 'Expected loss prevented',
      value: formatValue(kpis.revenueAtRisk, 'usd'),
      icon: CircleDollarSign,
      urgent: (kpis.revenueAtRisk ?? 0) > 100_000,
      sub: 'agent-estimated, open cases',
    },
    {
      label: 'Min Inventory Cover',
      value: formatValue(kpis.minInventoryCover, 'days'),
      icon: Package,
      urgent: (kpis.minInventoryCover ?? 999) < 7,
      sub: 'days of cover',
    },
    {
      label: 'Suppliers at Risk',
      value: formatValue(kpis.suppliersAtRisk),
      icon: Truck,
      urgent: (kpis.suppliersAtRisk ?? 0) > 2,
      sub: 'criticality ≥ 70',
    },
    {
      label: 'Disruption Signals',
      value: formatValue(kpis.recentSignals),
      icon: Activity,
      urgent: (kpis.recentSignals ?? 0) > 5,
      sub: 'last 24 hours',
      path: '/events',
    },
    {
      label: 'Pending Approvals',
      value: formatValue(kpis.pendingApprovals),
      icon: CheckSquare,
      urgent: (kpis.pendingApprovals ?? 0) > 0,
      sub: 'awaiting action',
      path: '/actions',
    },
  ];

  const filterPills: { label: string; value: MapFilter }[] = [
    { label: 'All Events', value: 'all' },
    { label: 'Conflict', value: 'Conflict' },
    { label: 'Weather', value: 'Weather' },
    { label: 'Economic', value: 'Economic' },
  ];

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-3xl font-bold text-slate-900 tracking-tight">Dashboard Overview</h1>
          <p className="text-slate-500 mt-1">Real-time supply chain operations monitoring</p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={fetchKPIs}
            disabled={loading}
            className="glass-panel px-3 py-2 text-slate-600 hover:bg-slate-50 transition-colors flex items-center gap-2 text-sm"
          >
            <RefreshCw size={16} className={loading ? 'animate-spin' : ''} /> Refresh
          </button>
          <button
            onClick={handleScan}
            disabled={scanning}
            className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-colors shadow-sm bg-emerald-600 hover:bg-emerald-700 text-white disabled:opacity-60"
          >
            {scanning ? <Loader2 size={16} className="animate-spin" /> : <Scan size={16} />}
            {scanning ? 'Scanning…' : 'Scan for Disruptions'}
          </button>
        </div>
      </div>

      {/* Scan result banner */}
      {scanResult && (
        <div className={cn(
          'text-sm px-4 py-2 rounded-lg border font-medium',
          scanResult.includes('failed')
            ? 'bg-rose-50 border-rose-200 text-rose-700'
            : 'bg-emerald-50 border-emerald-200 text-emerald-800'
        )}>
          {scanResult}
        </div>
      )}

      {/* KPI Grid */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        {kpiCards.map((kpi, idx) => {
          const isClickable = !!kpi.path;
          const Wrapper = isClickable ? 'button' : 'div';
          return (
            <Wrapper
              key={idx}
              type={isClickable ? 'button' : undefined}
              onClick={isClickable ? () => navigate(kpi.path!) : undefined}
              className={cn(
                'glass-panel p-4 relative overflow-hidden group text-left w-full',
                kpi.urgent && 'border-rose-200 bg-rose-50/30',
                isClickable && 'cursor-pointer hover:ring-2 hover:ring-slate-300 transition-shadow'
              )}
            >
              <div className="flex justify-between items-start mb-3">
                <div className={cn(
                  'p-2 rounded-lg',
                  kpi.urgent ? 'bg-rose-100 text-rose-600' : 'bg-blue-50 text-blue-600'
                )}>
                  <kpi.icon size={18} />
                </div>
                {isClickable && (
                  <ChevronRight size={16} className="text-slate-400 group-hover:text-slate-600 shrink-0 mt-0.5" />
                )}
              </div>
              <div>
                <h3 className={cn(
                  'text-2xl font-bold',
                  loading ? 'text-slate-300 animate-pulse' : 'text-slate-900'
                )}>
                  {kpi.value}
                </h3>
                <p className="text-xs font-semibold text-slate-700 mt-1">{kpi.label}</p>
                <p className="text-xs text-slate-400">{kpi.sub}</p>
              </div>
              <div className="absolute -right-3 -bottom-3 opacity-5 pointer-events-none group-hover:scale-110 transition-transform duration-500">
                <kpi.icon size={80} />
              </div>
            </Wrapper>
          );
        })}
      </div>

      {/* Map Panel */}
      <div className="glass-panel p-5 mt-2">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold text-slate-900">Live Disruption & Supplier Map</h2>
          <div className="flex items-center gap-2">
            {filterPills.map((p) => (
              <button
                key={p.value}
                onClick={() => setMapFilter(p.value)}
                className={cn(
                  'px-3 py-1.5 text-xs font-medium rounded-full border transition-colors',
                  mapFilter === p.value
                    ? 'bg-slate-900 text-white border-slate-900'
                    : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
                )}
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>

        {/* Legend */}
        <div className="flex items-center gap-4 mb-3 text-xs text-slate-500">
          <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-full bg-red-500 inline-block" /> Conflict</span>
          <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-full bg-orange-500 inline-block" /> Natural Disaster</span>
          <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-full bg-yellow-500 inline-block" /> Supply Disruption</span>
          <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-full bg-violet-500 inline-block" /> Economic</span>
          <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-full bg-blue-500 inline-block" /> Supplier</span>
        </div>

        <div className="rounded-lg overflow-hidden border border-slate-200" style={{ height: '460px' }}>
          <Suspense fallback={
            <div className="w-full h-full flex items-center justify-center bg-slate-100 text-slate-500 text-sm">
              Loading map…
            </div>
          }>
            <DisruptionMap filter={mapFilter} />
          </Suspense>
        </div>
      </div>
    </div>
  );
}
