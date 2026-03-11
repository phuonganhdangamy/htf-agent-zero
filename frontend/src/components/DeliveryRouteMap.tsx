import { useEffect, useState } from 'react';
import { MapContainer, TileLayer, CircleMarker, Popup, Polyline, useMap } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import { supabase } from '../lib/supabase';

interface RoutePoint {
    name: string;
    lat: number;
    lon: number;
    type: 'supplier' | 'facility' | 'port';
    details?: string;
}

interface DeliveryRoute {
    from: RoutePoint;
    to: RoutePoint;
    shipMode: string;
    status: string;
    eta?: string;
    poId?: string;
}

// Known coordinates for common supply chain locations
const KNOWN_COORDS: Record<string, [number, number]> = {
    'Taiwan': [25.0330, 121.5654],
    'Kaohsiung': [22.6273, 120.3014],
    'South Korea': [37.5665, 126.9780],
    'Seoul': [37.5665, 126.9780],
    'Japan': [35.6762, 139.6503],
    'Tokyo': [35.6762, 139.6503],
    'Germany': [50.1109, 8.6821],
    'Frankfurt': [50.1109, 8.6821],
    'Malaysia': [3.1390, 101.6869],
    'Penang': [5.4164, 100.3327],
    'Vietnam': [10.8231, 106.6297],
    'China': [31.2304, 121.4737],
    'Shanghai': [31.2304, 121.4737],
    'Singapore': [1.3521, 103.8198],
    'USA': [40.7128, -74.0060],
    'United States': [40.7128, -74.0060],
    'Mexico': [19.4326, -99.1332],
    'India': [19.0760, 72.8777],
    'Thailand': [13.7563, 100.5018],
    'Indonesia': [6.2088, 106.8456],
};

function getCoords(country: string, lat?: number | null, lon?: number | null): [number, number] | null {
    if (lat != null && lon != null) return [lat, lon];
    for (const [key, coords] of Object.entries(KNOWN_COORDS)) {
        if (country.toLowerCase().includes(key.toLowerCase()) || key.toLowerCase().includes(country.toLowerCase())) {
            return coords;
        }
    }
    return null;
}

const SHIP_MODE_COLORS: Record<string, string> = {
    'ocean': '#3b82f6',
    'sea': '#3b82f6',
    'air': '#f97316',
    'rail': '#8b5cf6',
    'truck': '#10b981',
    'land': '#10b981',
};

function routeColor(shipMode: string): string {
    const lower = (shipMode || '').toLowerCase();
    for (const [key, color] of Object.entries(SHIP_MODE_COLORS)) {
        if (lower.includes(key)) return color;
    }
    return '#64748b';
}

function MapResizer() {
    const map = useMap();
    useEffect(() => {
        setTimeout(() => map.invalidateSize(), 100);
    }, [map]);
    return null;
}

interface Props {
    caseId?: string;
    compact?: boolean;
}

export default function DeliveryRouteMap({ caseId, compact = false }: Props) {
    const [routes, setRoutes] = useState<DeliveryRoute[]>([]);

    useEffect(() => {
        loadRoutes();
    }, [caseId]);

    const loadRoutes = async () => {
        if (!supabase) return;

        // Load suppliers and facilities
        const [suppRes, facRes, poRes] = await Promise.all([
            supabase.from('suppliers').select('supplier_id, supplier_name, country, lat, lon'),
            supabase.from('facilities').select('facility_id, country, facility_type, lat, lon'),
            supabase.from('purchase_orders').select('po_id, supplier_id, eta, ship_mode, status').eq('status', 'open'),
        ]);

        const suppliers = suppRes.data || [];
        const facilities = facRes.data || [];
        const purchaseOrders = poRes.data || [];

        // Build a supplier lookup
        const supplierMap = new Map(suppliers.map(s => [s.supplier_id, s]));

        // Build routes from open POs: supplier → nearest facility
        const deliveryRoutes: DeliveryRoute[] = [];
        const primaryFacility = facilities.find(f => f.facility_type === 'assembly') || facilities[0];

        for (const po of purchaseOrders) {
            const supplier = supplierMap.get(po.supplier_id);
            if (!supplier) continue;

            const fromCoords = getCoords(supplier.country, supplier.lat, supplier.lon);
            const toCoords = primaryFacility
                ? getCoords(primaryFacility.country, primaryFacility.lat, primaryFacility.lon)
                : null;

            if (!fromCoords || !toCoords) continue;

            deliveryRoutes.push({
                from: {
                    name: supplier.supplier_name,
                    lat: fromCoords[0],
                    lon: fromCoords[1],
                    type: 'supplier',
                    details: `${supplier.country}`,
                },
                to: {
                    name: primaryFacility?.facility_id || 'Assembly',
                    lat: toCoords[0],
                    lon: toCoords[1],
                    type: 'facility',
                    details: primaryFacility?.country || '',
                },
                shipMode: po.ship_mode || 'ocean',
                status: po.status || 'open',
                eta: po.eta,
                poId: po.po_id,
            });
        }

        setRoutes(deliveryRoutes);
    };

    if (routes.length === 0) {
        return (
            <div className="text-center text-slate-400 text-sm py-8">
                No delivery routes to display
            </div>
        );
    }

    // Collect all unique points
    const allPoints: RoutePoint[] = [];
    const seen = new Set<string>();
    for (const route of routes) {
        const fromKey = `${route.from.lat},${route.from.lon}`;
        const toKey = `${route.to.lat},${route.to.lon}`;
        if (!seen.has(fromKey)) { allPoints.push(route.from); seen.add(fromKey); }
        if (!seen.has(toKey)) { allPoints.push(route.to); seen.add(toKey); }
    }

    return (
        <div className={compact ? 'h-[280px]' : 'h-[400px]'}>
            <MapContainer
                center={[25, 80]}
                zoom={compact ? 2 : 3}
                style={{ height: '100%', width: '100%', borderRadius: '8px' }}
                scrollWheelZoom={false}
            >
                <MapResizer />
                <TileLayer
                    attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a>'
                    url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                />

                {/* Route lines */}
                {routes.map((route, idx) => (
                    <Polyline
                        key={`route-${idx}`}
                        positions={[[route.from.lat, route.from.lon], [route.to.lat, route.to.lon]]}
                        pathOptions={{
                            color: routeColor(route.shipMode),
                            weight: 2.5,
                            opacity: 0.7,
                            dashArray: route.shipMode?.toLowerCase().includes('air') ? '8 4' : undefined,
                        }}
                    />
                ))}

                {/* Point markers */}
                {allPoints.map((point, idx) => (
                    <CircleMarker
                        key={`point-${idx}`}
                        center={[point.lat, point.lon]}
                        radius={point.type === 'facility' ? 8 : 6}
                        pathOptions={{
                            color: point.type === 'facility' ? '#10b981' : '#3b82f6',
                            fillColor: point.type === 'facility' ? '#10b981' : '#3b82f6',
                            fillOpacity: 0.8,
                            weight: 2,
                        }}
                    >
                        <Popup>
                            <div className="text-xs space-y-0.5">
                                <p className="font-semibold">{point.name}</p>
                                <p className="text-slate-500">{point.details}</p>
                                <p className="text-slate-400 uppercase text-[10px]">{point.type}</p>
                            </div>
                        </Popup>
                    </CircleMarker>
                ))}

                {/* Route info popups at midpoints */}
                {routes.map((route, idx) => {
                    const midLat = (route.from.lat + route.to.lat) / 2;
                    const midLon = (route.from.lon + route.to.lon) / 2;
                    return (
                        <CircleMarker
                            key={`mid-${idx}`}
                            center={[midLat, midLon]}
                            radius={3}
                            pathOptions={{ color: routeColor(route.shipMode), fillColor: routeColor(route.shipMode), fillOpacity: 0.6, weight: 1 }}
                        >
                            <Popup>
                                <div className="text-xs space-y-0.5">
                                    <p className="font-semibold">{route.poId}</p>
                                    <p>{route.from.name} → {route.to.name}</p>
                                    <p>Mode: <span className="font-medium capitalize">{route.shipMode}</span></p>
                                    {route.eta && <p>ETA: <span className="font-medium">{route.eta}</span></p>}
                                </div>
                            </Popup>
                        </CircleMarker>
                    );
                })}
            </MapContainer>

            {/* Legend */}
            <div className="flex flex-wrap gap-4 mt-2 px-1">
                <div className="flex items-center gap-1.5 text-[11px] text-slate-500">
                    <div className="w-6 h-0.5 bg-blue-500" /> Ocean
                </div>
                <div className="flex items-center gap-1.5 text-[11px] text-slate-500">
                    <div className="w-6 h-0.5 bg-orange-500 border-dashed border-t border-orange-500" style={{ borderStyle: 'dashed' }} /> Air
                </div>
                <div className="flex items-center gap-1.5 text-[11px] text-slate-500">
                    <div className="w-3 h-3 rounded-full bg-blue-500 opacity-80" /> Supplier
                </div>
                <div className="flex items-center gap-1.5 text-[11px] text-slate-500">
                    <div className="w-3 h-3 rounded-full bg-emerald-500 opacity-80" /> Facility
                </div>
            </div>
        </div>
    );
}
