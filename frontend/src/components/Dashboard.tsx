import { useState, useEffect } from 'react';
import { KPICard } from './KPICard';
import { DetectionMap } from './DetectionMap';
import { DetectionChart } from './DetectionChart';
import { DetectionTable } from './DetectionTable';

interface DashboardSummary {
  total_24h: number;
  avg_conf: number;
  top_fod: string;
}

export function Dashboard() {
  const [summary, setSummary] = useState<DashboardSummary>({
    total_24h: 0,
    avg_conf: 0,
    top_fod: 'N/A'
  });
  const [timeZone, setTimeZone] = useState<'UTC' | 'Local'>('Local');
  const [selectedClasses, setSelectedClasses] = useState<string[]>(['all']);
  const [fodClasses, setFodClasses] = useState<string[]>(['all']);

  useEffect(() => {
    const fetchSummary = async () => {
      try {
        const res = await fetch('/api/dashboard/summary');
        if (!res.ok) throw new Error(await res.text());
        const data = await res.json();
        setSummary({
          total_24h: data.total_24h ?? 0,
          avg_conf: data.avg_conf ?? 0,
          top_fod: data.top_fod ?? 'N/A',
        });
      } catch {
        setSummary({ total_24h: 0, avg_conf: 0, top_fod: 'N/A' });
      }
    };
    fetchSummary();
    const interval = setInterval(fetchSummary, 30000);
    return () => clearInterval(interval);
  }, []);

  // Fetch FOD classes from recent events
  useEffect(() => {
    const fetchClasses = async () => {
      try {
        const res = await fetch('/api/events/recent?limit=500');
        if (!res.ok) return;
        const rows = await res.json();
        const classes = new Set<string>();
        rows.forEach((r: { class_name?: string }) => {
          if (r.class_name) classes.add(r.class_name);
        });
        setFodClasses(['all', ...Array.from(classes).sort()]);
      } catch {
        // keep default
      }
    };
    fetchClasses();
  }, []);

  return (
    <div className="px-8 py-6 max-w-[1920px] mx-auto">
      {/* Header */}
      <div className="bg-[#1A1A1A] border border-[#2C2C2E] rounded-lg p-6 mb-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl">Analytics & History</h2>
        </div>

        <div className="grid grid-cols-2 gap-4">
          {/* Time Zone */}
          <div>
            <label className="block text-sm text-gray-400 mb-2">
              Time Zone
            </label>
            <div className="flex gap-2">
              <button
                onClick={() => setTimeZone('UTC')}
                className={`flex-1 px-3 py-2 rounded-lg text-sm transition-colors ${timeZone === 'UTC'
                    ? 'bg-[#007BFF] text-white'
                    : 'bg-[#2C2C2E] text-gray-400 hover:bg-[#3C3C3E]'
                  }`}
              >
                UTC
              </button>
              <button
                onClick={() => setTimeZone('Local')}
                className={`flex-1 px-3 py-2 rounded-lg text-sm transition-colors ${timeZone === 'Local'
                    ? 'bg-[#007BFF] text-white'
                    : 'bg-[#2C2C2E] text-gray-400 hover:bg-[#3C3C3E]'
                  }`}
              >
                Local
              </button>
            </div>
          </div>

          {/* Class Filter */}
          <div>
            <label className="block text-sm text-gray-400 mb-2">
              FOD Classes
            </label>
            <select
              multiple
              value={selectedClasses}
              onChange={(e) => {
                const values = Array.from(e.target.selectedOptions, option => option.value);
                setSelectedClasses(values.includes('all') ? ['all'] : values);
              }}
              className="w-full bg-[#121212] border border-[#2C2C2E] rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-[#007BFF]"
              size={3}
            >
              {fodClasses.map(cls => (
                <option key={cls} value={cls}>{cls === 'all' ? 'All Classes' : cls}</option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-3 gap-6 mb-6">
        <KPICard
          title="Total Detections (24h)"
          value={summary.total_24h.toString()}
        />
        <KPICard
          title="Avg Confidence (24h)"
          value={`${(summary.avg_conf * 100).toFixed(1)}%`}
        />
        <KPICard
          title="Top FOD Type"
          value={summary.top_fod}
        />
      </div>

      {/* Map and Charts */}
      <div className="grid grid-cols-2 gap-6 mb-6">
        <DetectionMap />
        <div className="space-y-6">
          <DetectionChart
            type="timeline"
            title="Detections per Hour"
          />
          <DetectionChart
            type="distribution"
            title="FOD Class Distribution (Top 10)"
          />
        </div>
      </div>

      {/* Data Table */}
      <DetectionTable
        timeZone={timeZone}
        selectedClasses={selectedClasses}
      />
    </div>
  );
}