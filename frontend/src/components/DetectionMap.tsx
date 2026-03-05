'use client';

import dynamic from 'next/dynamic';
import { useState, useEffect } from 'react';

interface DetectionMapProps {
  useMock?: boolean;
}

// Dynamic import with SSR disabled - Leaflet requires window object
const DetectionMapLeaflet = dynamic(
  () => import('./DetectionMapLeaflet'),
  {
    ssr: false,
    loading: () => (
      <div className="glass-card overflow-hidden">
        <div className="px-4 py-3" style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
          <h3 className="text-sm" style={{ fontWeight: 600 }}>Detection Map</h3>
          <p className="text-xs text-gray-500 mt-0.5">Loading map...</p>
        </div>
        <div className="h-[400px] flex items-center justify-center text-gray-400 text-sm" style={{ background: '#0A0A0A' }}>
          Loading map...
        </div>
      </div>
    )
  }
);

export function DetectionMap({ useMock = false }: DetectionMapProps) {
  const [isMounted, setIsMounted] = useState(false);

  useEffect(() => {
    setIsMounted(true);
  }, []);

  if (!isMounted) {
    return (
      <div className="glass-card overflow-hidden">
        <div className="px-4 py-3" style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
          <h3 className="text-sm" style={{ fontWeight: 600 }}>Detection Map</h3>
          <p className="text-xs text-gray-500 mt-0.5">Loading map...</p>
        </div>
        <div className="h-[400px] flex items-center justify-center text-gray-400 text-sm" style={{ background: '#0A0A0A' }}>
          Loading map...
        </div>
      </div>
    );
  }

  return <DetectionMapLeaflet useMock={useMock} />;
}

export default DetectionMap;