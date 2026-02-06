'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { MapContainer, TileLayer, Marker, Popup } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

interface Detection {
    id: string;
    class: string;
    confidence: number;
    lat: number;
    lon: number;
    ts: string;
    camera_id: string;
}

// Custom marker icons based on severity
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

function DetectionMapLeaflet() {
    const [detections, setDetections] = useState<Detection[]>([]);
    const [isLoading, setIsLoading] = useState(true);

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
    }, [toIso]);

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

    if (isLoading) {
        return (
            <div className="bg-[#1A1A1A] border border-[#2C2C2E] rounded-lg overflow-hidden">
                <div className="bg-[#121212] border-b border-[#2C2C2E] px-4 py-3">
                    <h3>Detection Map</h3>
                    <p className="text-sm text-gray-400">Loading...</p>
                </div>
                <div className="h-[400px] flex items-center justify-center bg-[#0A0A0A] text-gray-400">
                    Loading map...
                </div>
            </div>
        );
    }

    return (
        <div className="bg-[#1A1A1A] border border-[#2C2C2E] rounded-lg overflow-hidden">
            <div className="bg-[#121212] border-b border-[#2C2C2E] px-4 py-3">
                <h3>Detection Map</h3>
                <p className="text-sm text-gray-400">
                    {detections.length} FOD detections on map
                </p>
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

                    {detections.map((det) => (
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
                <div className="absolute bottom-4 left-4 bg-[#1A1A1A]/95 border border-[#2C2C2E] rounded-lg p-3 text-xs z-[1000]">
                    <div className="space-y-1">
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
                    </div>
                </div>
            </div>
        </div>
    );
}

export default DetectionMapLeaflet;
