import { useEffect, useState } from 'react';
import { MapContainer, TileLayer, CircleMarker, Popup, useMap } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import { supabase } from '../lib/supabase';

interface SignalEvent {
  event_id: string;
  title: string;
  summary: string;
  event_type: string;
  risk_category: string;
  country: string;
  confidence_score: number;
  lat: number | null;
  lon: number | null;
}

interface SupplierPin {
  supplier_id: string;
  supplier_name: string;
  country: string;
  criticality_score: number;
  single_source: boolean;
  lat: number | null;
  lon: number | null;
}

const RISK_COLORS: Record<string, string> = {
  'Geopolitical Conflict': '#ef4444',
  'Natural Disaster': '#f97316',
  'Supply Chain Disruption': '#eab308',
  'Economic Event': '#8b5cf6',
};

function eventColor(event: SignalEvent): string {
  return RISK_COLORS[event.risk_category] || '#64748b';
}

function supplierColor(criticality: number): string {
  if (criticality >= 80) return '#ef4444';
  if (criticality >= 60) return '#f97316';
  return '#3b82f6';
}

// Forces map to invalidate size after mount (fixes grey tile issue)
function MapResizer() {
  const map = useMap();
  useEffect(() => {
    setTimeout(() => map.invalidateSize(), 100);
  }, [map]);
  return null;
}

interface Props {
  filter: 'all' | 'Conflict' | 'Weather' | 'Economic';
}

export default function DisruptionMap({ filter }: Props) {
  const [events, setEvents] = useState<SignalEvent[]>([]);
  const [suppliers, setSuppliers] = useState<SupplierPin[]>([]);

  const fetchData = async () => {
    if (!supabase) return;
    const [evRes, suppRes] = await Promise.all([
      supabase.from('signal_events').select('event_id,title,summary,event_type,risk_category,country,confidence_score,lat,lon').order('created_at', { ascending: false }).limit(100),
      supabase.from('suppliers').select('supplier_id,supplier_name,country,criticality_score,single_source,lat,lon'),
    ]);
    setEvents((evRes.data || []).filter((e) => e.lat != null && e.lon != null));
    setSuppliers((suppRes.data || []).filter((s) => s.lat != null && s.lon != null));
  };

  useEffect(() => {
    fetchData();
    if (!supabase) return;
    const ch = supabase.channel('map_signal_events')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'signal_events' }, fetchData)
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, []);

  const visibleEvents = events.filter((e) => {
    if (filter === 'all') return true;
    if (filter === 'Conflict') return e.risk_category === 'Geopolitical Conflict';
    if (filter === 'Weather') return e.risk_category === 'Natural Disaster';
    if (filter === 'Economic') return e.risk_category === 'Economic Event' || e.risk_category === 'Supply Chain Disruption';
    return true;
  });

  return (
    <MapContainer
      center={[20, 10]}
      zoom={2}
      style={{ height: '100%', width: '100%', minHeight: '420px', borderRadius: '8px' }}
      scrollWheelZoom={false}
    >
      <MapResizer />
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />

      {/* Supplier pins */}
      {suppliers.map((s) => (
        <CircleMarker
          key={s.supplier_id}
          center={[s.lat!, s.lon!]}
          radius={7}
          pathOptions={{ color: supplierColor(s.criticality_score), fillColor: supplierColor(s.criticality_score), fillOpacity: 0.7, weight: 1.5 }}
        >
          <Popup>
            <div className="text-xs space-y-1">
              <p className="font-semibold">{s.supplier_name}</p>
              <p className="text-slate-500">{s.country}</p>
              <p>Criticality: <span className="font-medium">{s.criticality_score}/100</span></p>
              {s.single_source && <p className="text-rose-600 font-semibold">⚠ Single-source supplier</p>}
            </div>
          </Popup>
        </CircleMarker>
      ))}

      {/* Event pins */}
      {visibleEvents.map((e) => (
        <CircleMarker
          key={e.event_id}
          center={[e.lat!, e.lon!]}
          radius={9}
          pathOptions={{ color: eventColor(e), fillColor: eventColor(e), fillOpacity: 0.85, weight: 2 }}
        >
          <Popup>
            <div className="text-xs space-y-1 max-w-[200px]">
              <p className="font-semibold leading-tight">{e.title}</p>
              <p className="text-slate-500">{e.country} · {e.event_type}</p>
              <p className="text-slate-600 leading-snug">{e.summary?.slice(0, 120)}{(e.summary?.length ?? 0) > 120 ? '…' : ''}</p>
              <p>Confidence: <span className="font-medium">{(e.confidence_score * 100).toFixed(0)}%</span></p>
            </div>
          </Popup>
        </CircleMarker>
      ))}
    </MapContainer>
  );
}
