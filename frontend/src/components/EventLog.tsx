import { useState, useRef, useEffect } from 'react';
import { Search, ChevronDown, ChevronUp, MapPin, Camera } from 'lucide-react';
import { getSeverityColor, getSeverityLevel, formatTime } from '@/lib/utils';

interface Detection {
  id: string;
  ts: string;
  class: string;
  confidence: number;
  bbox: { x1: number; y1: number; x2: number; y2: number };
  lat: number;
  lon: number;
  yaw: number;
  source: { type: string; camera_id?: string };
  thumb_url: string;
}

interface EventLogProps {
  detections: Detection[];
  threshold: number;
  wsConnected: boolean;
}

type FilterType = 'all' | 'critical' | 'warning';

export function EventLog({ detections, threshold, wsConnected }: EventLogProps) {
  const [filter, setFilter] = useState<FilterType>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const logRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Auto-scroll to top when new detection arrives
    if (logRef.current) {
      logRef.current.scrollTop = 0;
    }
  }, [detections.length]);


  const filteredDetections = detections.filter(det => {
    // Filter by severity
    if (filter === 'critical' && getSeverityLevel(det.confidence) !== 'critical') return false;
    if (filter === 'warning' && getSeverityLevel(det.confidence) !== 'warning') return false;

    // Filter by search query
    if (searchQuery && !det.class.toLowerCase().includes(searchQuery.toLowerCase())) return false;

    // Filter by threshold
    if (det.confidence < threshold) return false;

    return true;
  });

  const formatTime = (iso: string) => {
    const date = new Date(iso);
    return date.toLocaleTimeString('en-US', { hour12: false });
  };

  return (
    <div className="bg-[#1A1A1A] border border-[#2C2C2E] rounded-lg overflow-hidden flex flex-col h-[calc(100vh-200px)]">
      {/* Header */}
      <div className="bg-[#121212] border-b border-[#2C2C2E] px-4 py-3">
        <h3 className="mb-3">Event Log</h3>

        {/* Search */}
        <div className="relative mb-3">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
          <input
            type="text"
            placeholder="Search FOD type..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-[#1A1A1A] border border-[#2C2C2E] rounded-lg pl-10 pr-4 py-2 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-[#007BFF]"
          />
        </div>

        {/* Filters */}
        <div className="flex gap-2">
          <button
            onClick={() => setFilter('all')}
            className={`flex-1 px-3 py-1.5 rounded text-sm transition-colors ${filter === 'all'
                ? 'bg-[#007BFF] text-white'
                : 'bg-[#2C2C2E] text-gray-400 hover:bg-[#3C3C3E]'
              }`}
          >
            All
          </button>
          <button
            onClick={() => setFilter('critical')}
            className={`flex-1 px-3 py-1.5 rounded text-sm transition-colors ${filter === 'critical'
                ? 'bg-[#FF3B30] text-white'
                : 'bg-[#2C2C2E] text-gray-400 hover:bg-[#3C3C3E]'
              }`}
          >
            Critical
          </button>
          <button
            onClick={() => setFilter('warning')}
            className={`flex-1 px-3 py-1.5 rounded text-sm transition-colors ${filter === 'warning'
                ? 'bg-[#FFCC00] text-black'
                : 'bg-[#2C2C2E] text-gray-400 hover:bg-[#3C3C3E]'
              }`}
          >
            Warning
          </button>
        </div>
      </div>

      {/* Events List */}
      <div ref={logRef} className="flex-1 overflow-y-auto">
        {filteredDetections.length === 0 ? (
          <div className="p-8 text-center text-gray-500">
            <p>No detections yet</p>
            <p className="text-sm mt-1">Try adjusting threshold ≥ 0.70</p>
          </div>
        ) : (
          <div className="divide-y divide-[#2C2C2E]">
            {filteredDetections.map((detection) => (
              <EventRow
                key={detection.id}
                detection={detection}
                expanded={expandedId === detection.id}
                onToggle={() => setExpandedId(expandedId === detection.id ? null : detection.id)}
              />
            ))}
          </div>
        )}
      </div>

      {/* Footer Stats */}
      <div className="bg-[#121212] border-t border-[#2C2C2E] px-4 py-2 flex items-center justify-between text-sm">
        <span className="text-gray-400">
          {filteredDetections.length} event{filteredDetections.length !== 1 ? 's' : ''}
        </span>
        <span className={wsConnected ? 'text-[#34C759]' : 'text-[#FFCC00]'}>
          {wsConnected ? `WS Connected` : 'WS Reconnecting...'}
        </span>
      </div>
    </div>
  );
}

function EventRow({ detection, expanded, onToggle }: { detection: Detection; expanded: boolean; onToggle: () => void }) {
  const color = getSeverityColor(detection.confidence);

  return (
    <div className="relative">
      {/* Severity stripe */}
      <div
        className="absolute left-0 top-0 bottom-0 w-1"
        style={{ backgroundColor: color }}
      />

      {/* Main row */}
      <button
        onClick={onToggle}
        className="w-full px-4 pl-5 py-3 hover:bg-[#2C2C2E]/30 transition-colors text-left"
      >
        <div className="flex items-center justify-between">
          <div className="flex-1">
            <div className="flex items-center gap-2">
              <span className="text-white">{detection.class}</span>
              <span className="text-gray-400">•</span>
              <span style={{ color }} className="tabular-nums">
                {Math.round(detection.confidence * 100)}%
              </span>
              <span className="text-gray-400">•</span>
              <span className="text-gray-500 text-sm">{formatTime(detection.ts)}</span>
            </div>
          </div>
          {expanded ? (
            <ChevronUp className="w-4 h-4 text-gray-500" />
          ) : (
            <ChevronDown className="w-4 h-4 text-gray-500" />
          )}
        </div>
      </button>

      {/* Expanded details */}
      {expanded && (
        <div className="px-4 pl-5 pb-3 space-y-2 text-sm">
          <div className="flex items-center gap-2 text-gray-400">
            <MapPin className="w-3 h-3" />
            <span>
              {detection.lat.toFixed(4)}, {detection.lon.toFixed(4)}
            </span>
            <span className="text-gray-600">•</span>
            <span>Yaw: {detection.yaw.toFixed(1)}°</span>
          </div>
          {detection.source.camera_id && (
            <div className="flex items-center gap-2 text-gray-400">
              <Camera className="w-3 h-3" />
              <span>{detection.source.camera_id}</span>
            </div>
          )}
          <div className="bg-[#121212] rounded p-2 text-xs text-gray-500">
            ID: {detection.id}
          </div>
        </div>
      )}
    </div>
  );
}
