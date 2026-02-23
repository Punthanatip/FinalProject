import { useState, useEffect, useCallback, useMemo } from 'react';
import { ArrowUpDown, Download, ChevronLeft, ChevronRight } from 'lucide-react';

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
  useMock?: boolean;
}

type SortField = 'timestamp' | 'fodType' | 'confidence';
type SortDirection = 'asc' | 'desc';

const PAGE_SIZE = 15;

// Mock data generator
function generateMockDetections(): Detection[] {
  const types = ['Metal debris', 'Plastic bag', 'Rubber fragment', 'Stone', 'Wire', 'Bolt', 'Fabric', 'Glass'];
  const cameras = ['CAM-01 (RW09L)', 'CAM-02 (RW09R)', 'CAM-03 (RW27L)', 'CAM-04 (TWY-A)'];
  return Array.from({ length: 87 }, (_, i) => {
    const date = new Date();
    date.setMinutes(date.getMinutes() - Math.floor(Math.random() * 1440));
    return {
      id: `det-${String(i + 1).padStart(4, '0')}`,
      timestamp: date.toISOString(),
      fodType: types[Math.floor(Math.random() * types.length)],
      lat: 13.6900 + (Math.random() * 0.01 - 0.005),
      lon: 100.7501 + (Math.random() * 0.01 - 0.005),
      confidence: 0.55 + Math.random() * 0.45,
      camera: cameras[Math.floor(Math.random() * cameras.length)],
    };
  });
}

export function DetectionTable({ timeZone, selectedClasses, useMock }: DetectionTableProps) {
  const [detections, setDetections] = useState<Detection[]>([]);
  const [sortField, setSortField] = useState<SortField>('timestamp');
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');
  const [isLoading, setIsLoading] = useState(true);
  const [page, setPage] = useState(0);

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
    if (useMock) {
      setDetections(generateMockDetections());
      setIsLoading(false);
      return;
    }

    const fetchRecent = async () => {
      setIsLoading(true);
      try {
        const res = await fetch('/api/events/recent?limit=500');
        if (!res.ok) throw new Error('failed');
        const rows = await res.json();
        const mapped: Detection[] = rows.map((r: {
          id: string; ts: unknown; class_name: string;
          latitude: number; longitude: number; confidence: number;
          source_ref?: string; source?: string;
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
  }, [toIso, useMock]);

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection('desc');
    }
    setPage(0);
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

  const getSeverityLabel = (confidence: number) => {
    if (confidence >= 0.90) return { label: 'Critical', cls: 'severity-pill--critical' };
    if (confidence >= 0.75) return { label: 'Warning', cls: 'severity-pill--warning' };
    return { label: 'Normal', cls: 'severity-pill--normal' };
  };

  // Filter and sort
  const filteredData = useMemo(() => {
    return detections.filter(det => {
      if (selectedClasses.includes('all')) return true;
      return selectedClasses.includes(det.fodType);
    }).sort((a, b) => {
      let aVal: string | number = a[sortField];
      let bVal: string | number = b[sortField];
      if (sortField === 'timestamp') {
        aVal = new Date(aVal).getTime();
        bVal = new Date(bVal).getTime();
      }
      return sortDirection === 'asc' ? (aVal > bVal ? 1 : -1) : (aVal < bVal ? 1 : -1);
    });
  }, [detections, selectedClasses, sortField, sortDirection]);

  const totalPages = Math.ceil(filteredData.length / PAGE_SIZE);
  const pageData = filteredData.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  const handleExportCSV = () => {
    if (filteredData.length === 0) { alert('No data to export'); return; }
    const headers = ['Timestamp', 'FOD Type', 'Latitude', 'Longitude', 'Confidence (%)', 'Camera'];
    const rows = filteredData.map(det => [
      formatTimestamp(det.timestamp), det.fodType,
      det.lat.toFixed(6), det.lon.toFixed(6),
      (det.confidence * 100).toFixed(1), det.camera
    ]);
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
    <div className="glass-card overflow-hidden">
      {/* Header */}
      <div className="px-5 py-4 flex items-center justify-between" style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
        <div>
          <h3 style={{ fontWeight: 600 }}>Detection Records</h3>
          <p className="text-xs text-gray-500 mt-0.5">
            {isLoading ? 'Loading...' : `${filteredData.length} records found`}
          </p>
        </div>
        <button
          onClick={handleExportCSV}
          disabled={filteredData.length === 0}
          className="flex items-center gap-2 px-4 py-2 rounded-lg text-white text-xs transition-all"
          style={{
            background: filteredData.length > 0 ? 'linear-gradient(135deg, #007BFF, #0056CC)' : '#2C2C2E',
            fontWeight: 500,
            opacity: filteredData.length === 0 ? 0.5 : 1,
            cursor: filteredData.length === 0 ? 'not-allowed' : 'pointer',
            boxShadow: filteredData.length > 0 ? '0 4px 12px rgba(0,123,255,0.25)' : 'none',
          }}
        >
          <Download className="w-3.5 h-3.5" />
          Export CSV
        </button>
      </div>

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
              {[
                { key: 'timestamp' as SortField, label: 'Timestamp', sortable: true },
                { key: 'fodType' as SortField, label: 'FOD Type', sortable: true },
                { key: null, label: 'Location', sortable: false },
                { key: 'confidence' as SortField, label: 'Confidence', sortable: true },
                { key: null, label: 'Camera', sortable: false },
              ].map((col, i) => (
                <th key={i} className="px-5 py-3 text-left">
                  {col.sortable && col.key ? (
                    <button
                      onClick={() => handleSort(col.key!)}
                      className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-white transition-colors"
                      style={{ fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', fontSize: '0.65rem' }}
                    >
                      {col.label}
                      <ArrowUpDown className={`w-3 h-3 ${sortField === col.key ? 'text-[#007BFF]' : ''}`} />
                    </button>
                  ) : (
                    <span
                      className="text-xs text-gray-500"
                      style={{ fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', fontSize: '0.65rem' }}
                    >
                      {col.label}
                    </span>
                  )}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr>
                <td colSpan={5} className="px-5 py-12 text-center text-gray-500 text-sm">
                  Loading...
                </td>
              </tr>
            ) : pageData.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-5 py-12 text-center text-gray-500 text-sm">
                  No detection records found
                </td>
              </tr>
            ) : (
              pageData.map((detection) => {
                const severity = getSeverityLabel(detection.confidence);
                return (
                  <tr
                    key={detection.id}
                    className="table-row-hover"
                    style={{ borderBottom: '1px solid rgba(255,255,255,0.03)' }}
                  >
                    <td className="px-5 py-3 text-xs text-gray-400 tabular-nums">
                      {formatTimestamp(detection.timestamp)}
                    </td>
                    <td className="px-5 py-3">
                      <span
                        className="text-xs px-2.5 py-1 rounded-md text-white"
                        style={{
                          background: 'rgba(255,255,255,0.06)',
                          fontWeight: 500,
                          fontSize: '0.7rem',
                        }}
                      >
                        {detection.fodType}
                      </span>
                    </td>
                    <td className="px-5 py-3 text-xs text-gray-500 tabular-nums">
                      {detection.lat.toFixed(4)}, {detection.lon.toFixed(4)}
                    </td>
                    <td className="px-5 py-3">
                      <span className={`severity-pill ${severity.cls}`}>
                        {(detection.confidence * 100).toFixed(0)}% · {severity.label}
                      </span>
                    </td>
                    <td className="px-5 py-3 text-xs text-gray-500">
                      {detection.camera}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div
          className="px-5 py-3 flex items-center justify-between"
          style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }}
        >
          <span className="text-xs text-gray-500">
            Page {page + 1} of {totalPages} · {filteredData.length} total records
          </span>
          <div className="flex items-center gap-1">
            <button
              onClick={() => setPage(p => Math.max(0, p - 1))}
              disabled={page === 0}
              className="p-1.5 rounded-md hover:bg-[#2C2C2E] transition-colors disabled:opacity-30"
            >
              <ChevronLeft className="w-4 h-4 text-gray-400" />
            </button>
            {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
              let pageNum: number;
              if (totalPages <= 5) {
                pageNum = i;
              } else if (page < 3) {
                pageNum = i;
              } else if (page > totalPages - 4) {
                pageNum = totalPages - 5 + i;
              } else {
                pageNum = page - 2 + i;
              }
              return (
                <button
                  key={pageNum}
                  onClick={() => setPage(pageNum)}
                  className="w-7 h-7 rounded-md text-xs transition-all"
                  style={{
                    background: page === pageNum ? '#007BFF' : 'transparent',
                    color: page === pageNum ? '#fff' : '#8E8E93',
                    fontWeight: page === pageNum ? 600 : 400,
                    fontSize: '0.7rem',
                  }}
                >
                  {pageNum + 1}
                </button>
              );
            })}
            <button
              onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))}
              disabled={page >= totalPages - 1}
              className="p-1.5 rounded-md hover:bg-[#2C2C2E] transition-colors disabled:opacity-30"
            >
              <ChevronRight className="w-4 h-4 text-gray-400" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}