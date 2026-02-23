'use client';

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import 'leaflet.heat';

interface Detection {
    id: string;
    class: string;
    confidence: number;
    lat: number;
    lon: number;
    ts: string;
    camera_id: string;
}

interface DetectionMapLeafletProps {
    useMock?: boolean;
}

// ─── Mock Data ───────────────────────────────────────────────────────
function generateMockDetections(): Detection[] {
    const types = ['Metal debris', 'Plastic bag', 'Rubber fragment', 'Stone', 'Wire', 'Bolt', 'Fabric', 'Glass'];
    const cameras = ['CAM-01 (RW09L)', 'CAM-02 (RW09R)', 'CAM-03 (RW27L)', 'CAM-04 (TWY-A)'];
    // Cluster detections along runway areas for realistic heatmap
    const hotspots = [
        { lat: 13.6915, lon: 100.7480, spread: 0.002 },  // Runway 09L threshold
        { lat: 13.6895, lon: 100.7510, spread: 0.003 },  // Mid-runway
        { lat: 13.6880, lon: 100.7535, spread: 0.002 },  // Runway 09R area
        { lat: 13.6905, lon: 100.7495, spread: 0.0015 }, // Taxiway A intersection
        { lat: 13.6920, lon: 100.7460, spread: 0.001 },  // Apron area
    ];

    return Array.from({ length: 120 }, (_, i) => {
        const spot = hotspots[Math.floor(Math.random() * hotspots.length)];
        const date = new Date();
        date.setMinutes(date.getMinutes() - Math.floor(Math.random() * 1440));
        return {
            id: `mock-${i}`,
            class: types[Math.floor(Math.random() * types.length)],
            confidence: 0.55 + Math.random() * 0.45,
            lat: spot.lat + (Math.random() - 0.5) * spot.spread,
            lon: spot.lon + (Math.random() - 0.5) * spot.spread,
            ts: date.toISOString(),
            camera_id: cameras[Math.floor(Math.random() * cameras.length)],
        };
    });
}

// ─── Custom marker icons ─────────────────────────────────────────────
const createIcon = (color: string) => {
    return L.divIcon({
        className: 'custom-marker',
        html: `
      <svg width="24" height="36" viewBox="0 0 24 36" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M12 0C5.4 0 0 5.4 0 12C0 21 12 36 12 36C12 36 24 21 24 12C24 5.4 18.6 0 12 0Z" fill="${color}"/>
        <circle cx="12" cy="12" r="6" fill="white"/>
      </svg>
    `,
        iconSize: [24, 36],
        iconAnchor: [12, 36],
        popupAnchor: [0, -36],
    });
};

const criticalIcon = createIcon('#FF3B30');
const warningIcon = createIcon('#FFCC00');
const normalIcon = createIcon('#007BFF');

// ─── Heatmap Layer Component ─────────────────────────────────────────
function HeatmapLayer({ points }: { points: [number, number, number][] }) {
    const map = useMap();
    const heatLayerRef = useRef<L.Layer | null>(null);

    useEffect(() => {
        if (heatLayerRef.current) {
            map.removeLayer(heatLayerRef.current);
        }

        if (points.length === 0) return;

        // leaflet.heat adds L.heatLayer as a side-effect plugin
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const layer = (L as any).heatLayer(points, {
            radius: 30,
            blur: 20,
            maxZoom: 17,
            max: 1.0,
            minOpacity: 0.3,
            gradient: {
                0.0: '#007BFF',
                0.3: '#00C6FF',
                0.5: '#34C759',
                0.7: '#FFCC00',
                0.85: '#FF9500',
                1.0: '#FF3B30',
            },
        });

        layer.addTo(map);
        heatLayerRef.current = layer;

        return () => {
            if (heatLayerRef.current) {
                map.removeLayer(heatLayerRef.current);
            }
        };
    }, [map, points]);

    return null;
}

// ─── Main Component ──────────────────────────────────────────────────
function DetectionMapLeaflet({ useMock = false }: DetectionMapLeafletProps) {
    const [detections, setDetections] = useState<Detection[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [showHeatmap, setShowHeatmap] = useState(true);
    const [showMarkers, setShowMarkers] = useState(true);

    const toIso = useCallback((ts: unknown): string => {
        if (typeof ts === 'string') return ts;
        if (Array.isArray(ts)) {
            const year = ts[0];
            const ordinal = ts[1];
            const hour = ts[3] || 0;
            const minute = ts[4] || 0;
            const nanos = ts[5] || 0;
            const mdays = [31, (year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0)) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
            let m = 0, d = ordinal;
            while (m < 12 && d > mdays[m]) { d -= mdays[m]; m++; }
            const ms = Math.floor(nanos / 1e6);
            return new Date(Date.UTC(year, m, d, hour, minute, Math.floor(ms / 1000), ms % 1000)).toISOString();
        }
        return new Date().toISOString();
    }, []);

    useEffect(() => {
        if (useMock) {
            setDetections(generateMockDetections());
            setIsLoading(false);
            return;
        }

        const fetchRecent = async () => {
            try {
                const res = await fetch('/api/events/recent?limit=200');
                if (!res.ok) throw new Error('failed');
                const rows = await res.json();
                const mapped: Detection[] = rows.map((r: {
                    id: string;
                    class_name: string;
                    confidence: number;
                    latitude: number;
                    longitude: number;
                    ts: unknown;
                    source_ref?: string;
                    source?: string;
                }) => ({
                    id: r.id,
                    class: r.class_name,
                    confidence: r.confidence,
                    lat: r.latitude,
                    lon: r.longitude,
                    ts: toIso(r.ts),
                    camera_id: r.source_ref || r.source || ''
                }));
                setDetections(mapped);
            } catch {
                setDetections([]);
            } finally {
                setIsLoading(false);
            }
        };
        fetchRecent();
        const interval = setInterval(fetchRecent, 30000);
        return () => clearInterval(interval);
    }, [toIso, useMock]);

    const getIcon = useCallback((confidence: number) => {
        if (confidence >= 0.90) return criticalIcon;
        if (confidence >= 0.75) return warningIcon;
        return normalIcon;
    }, []);

    const formatTime = useCallback((iso: string) => {
        const date = new Date(iso);
        return date.toLocaleString('en-US', {
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });
    }, []);

    // Default center: Suvarnabhumi Airport
    const defaultCenter = useMemo((): [number, number] => [13.6900, 100.7501], []);

    // Heatmap data: [lat, lon, intensity]
    const heatmapPoints = useMemo((): [number, number, number][] => {
        return detections.map(det => [det.lat, det.lon, det.confidence] as [number, number, number]);
    }, [detections]);

    if (isLoading) {
        return (
            <div className="glass-card overflow-hidden">
                <div className="px-4 py-3" style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                    <h3 className="text-sm" style={{ fontWeight: 600 }}>Detection Map</h3>
                    <p className="text-xs text-gray-500 mt-0.5">Loading...</p>
                </div>
                <div className="h-[400px] flex items-center justify-center text-gray-400 text-sm" style={{ background: '#0A0A0A' }}>
                    Loading map...
                </div>
            </div>
        );
    }

    return (
        <div className="glass-card overflow-hidden">
            <div className="px-4 py-3 flex items-center justify-between" style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                <div>
                    <h3 className="text-sm" style={{ fontWeight: 600 }}>Detection Map</h3>
                    <p className="text-xs text-gray-500 mt-0.5">
                        {detections.length} FOD detections on map
                    </p>
                </div>
                {/* Layer toggles */}
                <div className="flex items-center gap-2">
                    <button
                        onClick={() => setShowHeatmap(!showHeatmap)}
                        className="px-3 py-1.5 rounded-md text-xs transition-all"
                        style={{
                            background: showHeatmap ? 'rgba(255,59,48,0.15)' : 'rgba(255,255,255,0.04)',
                            border: `1px solid ${showHeatmap ? 'rgba(255,59,48,0.3)' : 'rgba(255,255,255,0.08)'}`,
                            color: showHeatmap ? '#FF6B6B' : '#8E8E93',
                            fontWeight: 500,
                            fontSize: '0.7rem',
                        }}
                    >
                        🔥 Heatmap
                    </button>
                    <button
                        onClick={() => setShowMarkers(!showMarkers)}
                        className="px-3 py-1.5 rounded-md text-xs transition-all"
                        style={{
                            background: showMarkers ? 'rgba(0,123,255,0.15)' : 'rgba(255,255,255,0.04)',
                            border: `1px solid ${showMarkers ? 'rgba(0,123,255,0.3)' : 'rgba(255,255,255,0.08)'}`,
                            color: showMarkers ? '#60a5fa' : '#8E8E93',
                            fontWeight: 500,
                            fontSize: '0.7rem',
                        }}
                    >
                        📍 Markers
                    </button>
                </div>
            </div>

            <div className="relative" style={{ height: '400px' }}>
                <MapContainer
                    center={defaultCenter}
                    zoom={15}
                    style={{ height: '100%', width: '100%' }}
                    className="z-0"
                >
                    <TileLayer
                        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                    />

                    {/* Heatmap Layer */}
                    {showHeatmap && <HeatmapLayer points={heatmapPoints} />}

                    {/* Markers */}
                    {showMarkers && detections.map((det) => (
                        <Marker
                            key={det.id}
                            position={[det.lat, det.lon]}
                            icon={getIcon(det.confidence)}
                        >
                            <Popup>
                                <div className="min-w-[200px]">
                                    <h4 className="font-bold text-lg mb-2">{det.class}</h4>
                                    <div className="space-y-1 text-sm">
                                        <div>
                                            <span className="text-gray-500">Confidence: </span>
                                            <span style={{
                                                color: det.confidence >= 0.9 ? '#FF3B30' : det.confidence >= 0.75 ? '#CC9900' : '#0066DD',
                                                fontWeight: 'bold'
                                            }}>
                                                {(det.confidence * 100).toFixed(0)}%
                                            </span>
                                        </div>
                                        <div>
                                            <span className="text-gray-500">Time: </span>
                                            {formatTime(det.ts)}
                                        </div>
                                        <div>
                                            <span className="text-gray-500">Location: </span>
                                            {det.lat.toFixed(6)}, {det.lon.toFixed(6)}
                                        </div>
                                        <div>
                                            <span className="text-gray-500">Camera: </span>
                                            {det.camera_id}
                                        </div>
                                    </div>
                                </div>
                            </Popup>
                        </Marker>
                    ))}
                </MapContainer>

                {/* Legend */}
                <div className="absolute bottom-4 left-4 rounded-lg p-3 text-xs z-[1000]"
                    style={{ background: 'rgba(18,18,18,0.92)', border: '1px solid rgba(255,255,255,0.08)', backdropFilter: 'blur(8px)' }}>
                    <div className="space-y-1.5">
                        <div className="text-gray-400 mb-2" style={{ fontWeight: 600, fontSize: '0.65rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                            Severity
                        </div>
                        <div className="flex items-center gap-2">
                            <div className="w-3 h-3 rounded-full bg-[#FF3B30]" />
                            <span className="text-gray-300">Critical (≥90%)</span>
                        </div>
                        <div className="flex items-center gap-2">
                            <div className="w-3 h-3 rounded-full bg-[#FFCC00]" />
                            <span className="text-gray-300">Warning (75-89%)</span>
                        </div>
                        <div className="flex items-center gap-2">
                            <div className="w-3 h-3 rounded-full bg-[#007BFF]" />
                            <span className="text-gray-300">Normal (&lt;75%)</span>
                        </div>
                        {showHeatmap && (
                            <>
                                <div className="border-t border-[rgba(255,255,255,0.06)] my-2" />
                                <div className="text-gray-400 mb-1" style={{ fontWeight: 600, fontSize: '0.65rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                                    Density
                                </div>
                                <div className="h-2 rounded-full" style={{
                                    width: '100%',
                                    background: 'linear-gradient(90deg, #007BFF, #00C6FF, #34C759, #FFCC00, #FF9500, #FF3B30)',
                                }} />
                                <div className="flex justify-between text-gray-500" style={{ fontSize: '0.6rem' }}>
                                    <span>Low</span>
                                    <span>High</span>
                                </div>
                            </>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}

export default DetectionMapLeaflet;
