import { useEffect, useState } from 'react';
import { BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import { toIsoTimestamp, getChartColor } from '@/lib/utils';

interface DetectionChartProps {
  type: 'timeline' | 'distribution';
  title: string;
}

interface TimelineDataPoint {
  hour: string;
  detections: number;
}

interface DistributionDataPoint {
  class: string;
  count: number;
}

export function DetectionChart({ type, title }: DetectionChartProps) {
  const [data, setData] = useState<TimelineDataPoint[] | DistributionDataPoint[]>([]);
  const [isLoading, setIsLoading] = useState(true);


  useEffect(() => {
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
          const timelineData: TimelineDataPoint[] = hours.map(h => ({ hour: h, detections: buckets[h] || 0 }));
          setData(timelineData);
        } else {
          const dist: Record<string, number> = {};
          rows.forEach((r) => {
            const cls = r.class_name || 'Unknown';
            dist[cls] = (dist[cls] || 0) + (r.object_count || 1);
          });
          const distributionData: DistributionDataPoint[] = Object.entries(dist)
            .map(([cls, count]) => ({ class: cls, count }))
            .sort((a, b) => b.count - a.count)
            .slice(0, 10);
          setData(distributionData);
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
  }, [type]);



  return (
    <div className="bg-[#1A1A1A] border border-[#2C2C2E] rounded-lg overflow-hidden">
      <div className="bg-[#121212] border-b border-[#2C2C2E] px-4 py-3">
        <h3 className="text-sm">{title}</h3>
      </div>

      <div className="p-4">
        {isLoading ? (
          <div className="h-[200px] flex items-center justify-center text-gray-400">
            Loading...
          </div>
        ) : data.length === 0 ? (
          <div className="h-[200px] flex items-center justify-center text-gray-400">
            No data available
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={200}>
            {type === 'timeline' ? (
              <LineChart data={data as TimelineDataPoint[]}>
                <CartesianGrid strokeDasharray="3 3" stroke="#2C2C2E" />
                <XAxis
                  dataKey="hour"
                  stroke="#8E8E93"
                  style={{ fontSize: '12px' }}
                  interval={3}
                />
                <YAxis
                  stroke="#8E8E93"
                  style={{ fontSize: '12px' }}
                  allowDecimals={false}
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: '#1A1A1A',
                    border: '1px solid #2C2C2E',
                    borderRadius: '8px',
                    color: '#FFFFFF'
                  }}
                  formatter={(value: number) => [value, 'Detections']}
                />
                <Line
                  type="monotone"
                  dataKey="detections"
                  stroke="#007BFF"
                  strokeWidth={2}
                  dot={{ fill: '#007BFF', r: 3 }}
                  activeDot={{ r: 5 }}
                />
              </LineChart>
            ) : (
              <BarChart data={data as DistributionDataPoint[]}>
                <CartesianGrid strokeDasharray="3 3" stroke="#2C2C2E" />
                <XAxis
                  dataKey="class"
                  stroke="#8E8E93"
                  style={{ fontSize: '10px' }}
                  angle={-45}
                  textAnchor="end"
                  height={70}
                  interval={0}
                />
                <YAxis
                  stroke="#8E8E93"
                  style={{ fontSize: '12px' }}
                  allowDecimals={false}
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: '#1A1A1A',
                    border: '1px solid #2C2C2E',
                    borderRadius: '8px',
                    color: '#FFFFFF'
                  }}
                  formatter={(value: number) => [value, 'Count']}
                />
                <Bar dataKey="count" radius={[4, 4, 0, 0]}>
                  {(data as DistributionDataPoint[]).map((_, index) => (
                    <Cell key={`cell-${index}`} fill={getChartColor(index)} />
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
