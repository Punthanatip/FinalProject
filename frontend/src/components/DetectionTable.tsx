import { useState, useEffect, useCallback } from 'react';
import { ArrowUpDown, Download } from 'lucide-react';

interface Detection {
  id: string;
  timestamp: string;
  fodType: string;
  lat: number;
  lon: number;
  confidence: number;
  camera: string;
}

interface DetectionTableProps {
  timeZone: 'UTC' | 'Local';
  selectedClasses: string[];
}

type SortField = 'timestamp' | 'fodType' | 'confidence';
type SortDirection = 'asc' | 'desc';

export function DetectionTable({ timeZone, selectedClasses }: DetectionTableProps) {
  const [detections, setDetections] = useState<Detection[]>([]);
  const [sortField, setSortField] = useState<SortField>('timestamp');
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');
  const [isLoading, setIsLoading] = useState(true);

  const toIso = useCallback((ts: unknown): string => {
    if (typeof ts === 'string') return ts;
    if (Array.isArray(ts)) {
      const year: number = Number(ts[0]) || new Date().getUTCFullYear();
      const ordinal: number = Number(ts[1]) || 1;
      const hour: number = Number(ts[2] ?? ts[3] ?? 0);
      const minute: number = Number(ts[3] ?? ts[4] ?? 0);
      const second: number = Number(ts[4] ?? ts[5] ?? 0);
      const nanos: number = Number(ts[5] ?? ts[6] ?? 0);
      const mdays = [31, (year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0)) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
      let m = 0, d = ordinal;
      while (m < 12 && d > mdays[m]) { d -= mdays[m]; m++; }
      const ms = Math.floor(nanos / 1e6);
      return new Date(Date.UTC(year, m, d, hour, minute, second, ms)).toISOString();
    }
    return new Date().toISOString();
  }, []);

  useEffect(() => {
    const fetchRecent = async () => {
      setIsLoading(true);
      try {
        const res = await fetch('/api/events/recent?limit=500');
        if (!res.ok) throw new Error('failed');
        const rows = await res.json();
        const mapped: Detection[] = rows.map((r: {
          id: string;
          ts: unknown;
          class_name: string;
          latitude: number;
          longitude: number;
          confidence: number;
          source_ref?: string;
          source?: string;
        }) => ({
          id: r.id,
          timestamp: toIso(r.ts),
          fodType: r.class_name || 'Unknown',
          lat: r.latitude || 0,
          lon: r.longitude || 0,
          confidence: r.confidence || 0,
          camera: r.source_ref || r.source || 'Unknown'
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

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection('desc');
    }
  };

  const formatTimestamp = useCallback((iso: string) => {
    const date = new Date(iso);
    if (isNaN(date.getTime())) return 'Invalid Date';

    if (timeZone === 'UTC') {
      return new Intl.DateTimeFormat('en-GB', {
        year: 'numeric', month: '2-digit', day: '2-digit',
        hour: '2-digit', minute: '2-digit', second: '2-digit',
        hour12: false, timeZone: 'UTC'
      }).format(date) + ' UTC';
    }
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    return new Intl.DateTimeFormat('en-GB', {
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit',
      hour12: false, timeZone: tz
    }).format(date);
  }, [timeZone]);

  const getSeverityColor = (confidence: number) => {
    if (confidence >= 0.90) return '#FF3B30';
    if (confidence >= 0.75) return '#FFCC00';
    return '#007BFF';
  };

  // Filter and sort data
  const filteredData = detections.filter(det => {
    if (selectedClasses.includes('all')) return true;
    return selectedClasses.includes(det.fodType);
  }).sort((a, b) => {
    let aVal: string | number = a[sortField];
    let bVal: string | number = b[sortField];

    if (sortField === 'timestamp') {
      aVal = new Date(aVal).getTime();
      bVal = new Date(bVal).getTime();
    }

    if (sortDirection === 'asc') {
      return aVal > bVal ? 1 : -1;
    }
    return aVal < bVal ? 1 : -1;
  });

  const handleExportCSV = () => {
    if (filteredData.length === 0) {
      alert('No data to export');
      return;
    }

    const headers = ['Timestamp', 'FOD Type', 'Latitude', 'Longitude', 'Confidence (%)', 'Camera'];
    const rows = filteredData.map(det => [
      formatTimestamp(det.timestamp),
      det.fodType,
      det.lat.toFixed(6),
      det.lon.toFixed(6),
      (det.confidence * 100).toFixed(1),
      det.camera
    ]);

    // Add BOM for UTF-8 compatibility
    const BOM = '\uFEFF';
    const csv = BOM + [headers, ...rows].map(row =>
      row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(',')
    ).join('\r\n');

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `fod-detections-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="bg-[#1A1A1A] border border-[#2C2C2E] rounded-lg overflow-hidden">
      <div className="bg-[#121212] border-b border-[#2C2C2E] px-4 py-3 flex items-center justify-between">
        <div>
          <h3>Detection Records</h3>
          <p className="text-sm text-gray-400">
            {isLoading ? 'Loading...' : `${filteredData.length} records`}
          </p>
        </div>
        <button
          onClick={handleExportCSV}
          disabled={filteredData.length === 0}
          className="flex items-center gap-2 px-4 py-2 bg-[#007BFF] hover:bg-[#0066DD] disabled:bg-[#2C2C2E] disabled:cursor-not-allowed rounded-lg text-white text-sm transition-colors"
        >
          <Download className="w-4 h-4" />
          Export CSV
        </button>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full">
          <thead className="bg-[#121212] border-b border-[#2C2C2E]">
            <tr>
              <th className="px-4 py-3 text-left">
                <button
                  onClick={() => handleSort('timestamp')}
                  className="flex items-center gap-2 text-sm text-gray-400 hover:text-white transition-colors"
                >
                  Timestamp
                  <ArrowUpDown className={`w-3 h-3 ${sortField === 'timestamp' ? 'text-[#007BFF]' : ''}`} />
                </button>
              </th>
              <th className="px-4 py-3 text-left">
                <button
                  onClick={() => handleSort('fodType')}
                  className="flex items-center gap-2 text-sm text-gray-400 hover:text-white transition-colors"
                >
                  FOD Type
                  <ArrowUpDown className={`w-3 h-3 ${sortField === 'fodType' ? 'text-[#007BFF]' : ''}`} />
                </button>
              </th>
              <th className="px-4 py-3 text-left text-sm text-gray-400">
                Latitude
              </th>
              <th className="px-4 py-3 text-left text-sm text-gray-400">
                Longitude
              </th>
              <th className="px-4 py-3 text-left">
                <button
                  onClick={() => handleSort('confidence')}
                  className="flex items-center gap-2 text-sm text-gray-400 hover:text-white transition-colors"
                >
                  Confidence
                  <ArrowUpDown className={`w-3 h-3 ${sortField === 'confidence' ? 'text-[#007BFF]' : ''}`} />
                </button>
              </th>
              <th className="px-4 py-3 text-left text-sm text-gray-400">
                Camera
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#2C2C2E]">
            {isLoading ? (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-gray-400">
                  Loading...
                </td>
              </tr>
            ) : filteredData.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-gray-400">
                  No detection records found
                </td>
              </tr>
            ) : (
              filteredData.slice(0, 100).map((detection) => (
                <tr
                  key={detection.id}
                  className="hover:bg-[#2C2C2E]/30 transition-colors"
                >
                  <td className="px-4 py-3 text-sm text-gray-300 tabular-nums">
                    {formatTimestamp(detection.timestamp)}
                  </td>
                  <td className="px-4 py-3 text-sm text-white">
                    {detection.fodType}
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-300 tabular-nums">
                    {detection.lat.toFixed(6)}
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-300 tabular-nums">
                    {detection.lon.toFixed(6)}
                  </td>
                  <td className="px-4 py-3 text-sm tabular-nums">
                    <span style={{ color: getSeverityColor(detection.confidence) }}>
                      {(detection.confidence * 100).toFixed(0)}%
                    </span>
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-300">
                    {detection.camera}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {filteredData.length > 100 && (
        <div className="bg-[#121212] border-t border-[#2C2C2E] px-4 py-2 text-center text-sm text-gray-400">
          Showing first 100 of {filteredData.length} records
        </div>
      )}
    </div>
  );
}