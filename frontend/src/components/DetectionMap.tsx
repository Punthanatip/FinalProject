'use client';

import dynamic from 'next/dynamic';
import { useState, useEffect } from 'react';

// Dynamic import with SSR disabled - Leaflet requires window object
const DetectionMapLeaflet = dynamic(
  () => import('./DetectionMapLeaflet'),
  {
    ssr: false,
    loading: () => (
      <div className="bg-[#1A1A1A] border border-[#2C2C2E] rounded-lg overflow-hidden">
        <div className="bg-[#121212] border-b border-[#2C2C2E] px-4 py-3">
          <h3>Detection Map</h3>
          <p className="text-sm text-gray-400">Loading map...</p>
        </div>
        <div className="h-[400px] flex items-center justify-center bg-[#0A0A0A] text-gray-400">
          Loading map...
        </div>
      </div>
    )
  }
);

export function DetectionMap() {
  const [isMounted, setIsMounted] = useState(false);

  useEffect(() => {
    setIsMounted(true);
  }, []);

  if (!isMounted) {
    return (
      <div className="bg-[#1A1A1A] border border-[#2C2C2E] rounded-lg overflow-hidden">
        <div className="bg-[#121212] border-b border-[#2C2C2E] px-4 py-3">
          <h3>Detection Map</h3>
          <p className="text-sm text-gray-400">Loading map...</p>
        </div>
        <div className="h-[400px] flex items-center justify-center bg-[#0A0A0A] text-gray-400">
          Loading map...
        </div>
      </div>
    );
  }

  return <DetectionMapLeaflet />;
}

export default DetectionMap;