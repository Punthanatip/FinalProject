import { useEffect, useState } from 'react';
import {
  BarChart, Bar, AreaChart, Area, XAxis, YAxis,
  CartesianGrid, Tooltip, ResponsiveContainer, Cell,
} from 'recharts';
import { toIsoTimestamp, getChartColor } from '@/lib/utils';

interface DetectionChartProps {
  type: 'timeline' | 'distribution';
  title: string;
  useMock?: boolean;
}

interface TimelineDataPoint {
  hour: string;
  detections: number;
}

interface DistributionDataPoint {
  class: string;
  count: number;
}

// Mock data generators
function generateMockTimeline(): TimelineDataPoint[] {
  return Array.from({ length: 24 }, (_, i) => ({
    hour: `${i.toString().padStart(2, '0')}:00`,
    detections: Math.floor(Math.random() * 18) + (i >= 6 && i <= 18 ? 5 : 1),
  }));
}

function generateMockDistribution(): DistributionDataPoint[] {
  const types = [
    'Metal debris', 'Plastic bag', 'Rubber', 'Stone', 'Wire',
    'Bolt', 'Fabric', 'Glass', 'Wood', 'Tire piece',
  ];
  return types
    .map(cls => ({ class: cls, count: Math.floor(Math.random() * 40) + 3 }))
    .sort((a, b) => b.count - a.count);
}

// Custom tooltip
function CustomTooltip({ active, payload, label }: {
  active?: boolean;
  payload?: Array<{ value: number }>;
  label?: string;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div
      style={{
        background: 'rgba(18,18,18,0.95)',
        backdropFilter: 'blur(12px)',
        border: '1px solid rgba(255,255,255,0.1)',
        borderRadius: '10px',
        padding: '10px 14px',
        boxShadow: '0 8px 24px rgba(0,0,0,0.4)',
      }}
    >
      <p style={{ color: '#8E8E93', fontSize: '11px', marginBottom: '4px' }}>{label}</p>
      <p style={{ color: '#fff', fontSize: '16px', fontWeight: 700 }}>
        {payload[0].value}
        <span style={{ color: '#8E8E93', fontSize: '11px', marginLeft: '4px', fontWeight: 400 }}>
          detections
        </span>
      </p>
    </div>
  );
}

export function DetectionChart({ type, title, useMock }: DetectionChartProps) {
  const [data, setData] = useState<TimelineDataPoint[] | DistributionDataPoint[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (useMock) {
      setData(type === 'timeline' ? generateMockTimeline() : generateMockDistribution());
      setIsLoading(false);
      return;
    }

    const fetchRecent = async () => {
      setIsLoading(true);
      try {
        const res = await fetch('/api/events/recent?limit=500');
        if (!res.ok) throw new Error('failed');
        const rows: Array<{
          ts: unknown;
          class_name?: string;
          object_count?: number;
        }> = await res.json();

        if (type === 'timeline') {
          const buckets: Record<string, number> = {};
          rows.forEach((r) => {
            const ts = toIsoTimestamp(r.ts);
            const d = new Date(ts);
            const h = d.getHours();
            const key = `${h.toString().padStart(2, '0')}:00`;
            buckets[key] = (buckets[key] || 0) + (r.object_count || 1);
          });
          const hours = Array.from({ length: 24 }, (_, i) => `${i.toString().padStart(2, '0')}:00`);
          setData(hours.map(h => ({ hour: h, detections: buckets[h] || 0 })));
        } else {
          const dist: Record<string, number> = {};
          rows.forEach((r) => {
            const cls = r.class_name || 'Unknown';
            dist[cls] = (dist[cls] || 0) + (r.object_count || 1);
          });
          setData(
            Object.entries(dist)
              .map(([cls, count]) => ({ class: cls, count }))
              .sort((a, b) => b.count - a.count)
              .slice(0, 10)
          );
        }
      } catch {
        setData([]);
      } finally {
        setIsLoading(false);
      }
    };
    fetchRecent();
    const interval = setInterval(fetchRecent, 30000);
    return () => clearInterval(interval);
  }, [type, useMock]);

  return (
    <div className="glass-card overflow-hidden">
      <div className="px-4 py-3 flex items-center gap-2" style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
        <div
          className="w-2 h-2 rounded-full"
          style={{ background: type === 'timeline' ? '#007BFF' : '#FF9500' }}
        />
        <h3 className="text-sm" style={{ fontWeight: 600 }}>{title}</h3>
      </div>

      <div className="p-4">
        {isLoading ? (
          <div className="h-[200px] flex items-center justify-center text-gray-400 text-sm">
            Loading...
          </div>
        ) : data.length === 0 ? (
          <div className="h-[200px] flex items-center justify-center text-gray-400 text-sm">
            No data available
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={200}>
            {type === 'timeline' ? (
              <AreaChart data={data as TimelineDataPoint[]}>
                <defs>
                  <linearGradient id="areaGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#007BFF" stopOpacity={0.3} />
                    <stop offset="100%" stopColor="#007BFF" stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" />
                <XAxis
                  dataKey="hour"
                  stroke="#4A4A4A"
                  style={{ fontSize: '10px' }}
                  interval={3}
                  tick={{ fill: '#6B6B6B' }}
                />
                <YAxis
                  stroke="#4A4A4A"
                  style={{ fontSize: '10px' }}
                  allowDecimals={false}
                  tick={{ fill: '#6B6B6B' }}
                />
                <Tooltip content={<CustomTooltip />} />
                <Area
                  type="monotone"
                  dataKey="detections"
                  stroke="#007BFF"
                  strokeWidth={2}
                  fill="url(#areaGradient)"
                  dot={false}
                  activeDot={{
                    r: 5,
                    fill: '#007BFF',
                    stroke: '#fff',
                    strokeWidth: 2,
                  }}
                />
              </AreaChart>
            ) : (
              <BarChart data={data as DistributionDataPoint[]}>
                <defs>
                  {(data as DistributionDataPoint[]).map((_, index) => (
                    <linearGradient key={`barGrad-${index}`} id={`barGrad-${index}`} x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={getChartColor(index)} stopOpacity={0.9} />
                      <stop offset="100%" stopColor={getChartColor(index)} stopOpacity={0.5} />
                    </linearGradient>
                  ))}
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" />
                <XAxis
                  dataKey="class"
                  stroke="#4A4A4A"
                  style={{ fontSize: '9px' }}
                  angle={-45}
                  textAnchor="end"
                  height={70}
                  interval={0}
                  tick={{ fill: '#6B6B6B' }}
                />
                <YAxis
                  stroke="#4A4A4A"
                  style={{ fontSize: '10px' }}
                  allowDecimals={false}
                  tick={{ fill: '#6B6B6B' }}
                />
                <Tooltip content={<CustomTooltip />} />
                <Bar dataKey="count" radius={[6, 6, 0, 0]}>
                  {(data as DistributionDataPoint[]).map((_, index) => (
                    <Cell key={`cell-${index}`} fill={`url(#barGrad-${index})`} />
                  ))}
                </Bar>
              </BarChart>
            )}
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
}
