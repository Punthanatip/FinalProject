'use client';

import { useState, useEffect } from 'react';
import { KPICard } from './KPICard';
import { DetectionMap } from './DetectionMap';
import { DetectionChart } from './DetectionChart';
import { DetectionTable } from './DetectionTable';
import {
  ShieldAlert, TrendingUp, Target, Clock,
  BarChart3, Globe, Filter, ChevronDown,
} from 'lucide-react';

// ─── Mock / preview mode flag ──────────────────────────────────────────
// Set to true to run dashboard with mock data (no backend needed)
const USE_MOCK = false;

interface DashboardSummary {
  total_24h: number;
  avg_conf: number;
  top_fod: string;
  last_detection: string;
}

const MOCK_SUMMARY: DashboardSummary = {
  total_24h: 147,
  avg_conf: 0.873,
  top_fod: 'Metal debris',
  last_detection: '3 min ago',
};

const MOCK_CLASSES = ['all', 'Metal debris', 'Plastic bag', 'Rubber fragment', 'Stone', 'Wire', 'Bolt', 'Fabric'];

export function Dashboard() {
  const [summary, setSummary] = useState<DashboardSummary>({
    total_24h: 0,
    avg_conf: 0,
    top_fod: 'N/A',
    last_detection: '-',
  });
  const [timeZone, setTimeZone] = useState<'UTC' | 'Local'>('Local');
  const [selectedClasses, setSelectedClasses] = useState<string[]>(['all']);
  const [fodClasses, setFodClasses] = useState<string[]>(['all']);
  const [filterOpen, setFilterOpen] = useState(false);

  useEffect(() => {
    if (USE_MOCK) {
      setSummary(MOCK_SUMMARY);
      setFodClasses(MOCK_CLASSES);
      return;
    }

    const fetchSummary = async () => {
      try {
        const res = await fetch('/api/dashboard/summary');
        if (!res.ok) throw new Error(await res.text());
        const data = await res.json();

        // Fetch most recent event for "last detection" time
        let lastDetStr = '-';
        try {
          const evtRes = await fetch('/api/events/recent?limit=1');
          if (evtRes.ok) {
            const events = await evtRes.json();
            if (events.length > 0) {
              const ts = events[0].ts;
              let eventDate: Date | null = null;
              if (typeof ts === 'string') {
                eventDate = new Date(ts);
              } else if (Array.isArray(ts) && ts.length >= 6) {
                const year = Number(ts[0]);
                const ordinal = Number(ts[1]) || 1;
                const hour = Number(ts[2]) || 0;
                const minute = Number(ts[3]) || 0;
                const second = Number(ts[4]) || 0;
                const nanos = Number(ts[5]) || 0;
                const mdays = [31, (year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0)) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
                let m = 0, d = ordinal;
                while (m < 12 && d > mdays[m]) { d -= mdays[m]; m++; }
                const ms = Math.floor(nanos / 1e6);
                eventDate = new Date(Date.UTC(year, m, d, hour, minute, second, ms));
              }
              if (eventDate && !isNaN(eventDate.getTime())) {
                const diffMs = Date.now() - eventDate.getTime();
                const diffMin = Math.floor(diffMs / 60000);
                if (diffMin < 1) lastDetStr = 'Just now';
                else if (diffMin < 60) lastDetStr = `${diffMin} min ago`;
                else if (diffMin < 1440) lastDetStr = `${Math.floor(diffMin / 60)}h ago`;
                else lastDetStr = `${Math.floor(diffMin / 1440)}d ago`;
              }
            }
          }
        } catch { /* ignore */ }

        setSummary({
          total_24h: data.total_24h ?? 0,
          avg_conf: data.avg_conf ?? 0,
          top_fod: data.top_fod ?? 'N/A',
          last_detection: lastDetStr,
        });
      } catch {
        setSummary({ total_24h: 0, avg_conf: 0, top_fod: 'N/A', last_detection: '-' });
      }
    };
    fetchSummary();
    const interval = setInterval(fetchSummary, 30000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (USE_MOCK) return;

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

  const toggleClass = (cls: string) => {
    if (cls === 'all') {
      setSelectedClasses(['all']);
      return;
    }
    const next = selectedClasses.includes(cls)
      ? selectedClasses.filter(c => c !== cls)
      : [...selectedClasses.filter(c => c !== 'all'), cls];
    setSelectedClasses(next.length === 0 ? ['all'] : next);
  };

  return (
    <div className="px-8 py-6 max-w-[1920px] mx-auto">
      {/* ─── Welcome Banner ─── */}
      <div className="banner-gradient rounded-lg p-6 mb-6 fade-in-up" style={{ border: '1px solid rgba(255,255,255,0.06)', position: 'relative', zIndex: 20 }}>
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-xl" style={{ fontWeight: 700, color: '#fff' }}>
              Analytics & History
            </h2>
            <p className="text-sm text-gray-400 mt-1">
              Real-time FOD detection analytics overview
            </p>
          </div>

          {/* Quick Controls */}
          <div className="flex items-center gap-3">
            {/* Time Zone Toggle */}
            <div className="flex rounded-lg overflow-hidden" style={{ border: '1px solid rgba(255,255,255,0.08)' }}>
              <button
                onClick={() => setTimeZone('UTC')}
                className={`px-4 py-2 text-xs transition-all ${timeZone === 'UTC'
                  ? 'bg-[#007BFF] text-white'
                  : 'bg-[#1a1a2e] text-gray-400 hover:text-white'
                  }`}
                style={{ fontWeight: 500 }}
              >
                UTC
              </button>
              <button
                onClick={() => setTimeZone('Local')}
                className={`px-4 py-2 text-xs transition-all ${timeZone === 'Local'
                  ? 'bg-[#007BFF] text-white'
                  : 'bg-[#1a1a2e] text-gray-400 hover:text-white'
                  }`}
                style={{ fontWeight: 500 }}
              >
                Local
              </button>
            </div>

            {/* Filter Dropdown */}
            <div className="relative">
              <button
                onClick={() => setFilterOpen(!filterOpen)}
                className="flex items-center gap-2 px-4 py-2 rounded-lg text-xs text-gray-300 hover:text-white transition-colors"
                style={{
                  background: 'rgba(255,255,255,0.04)',
                  border: '1px solid rgba(255,255,255,0.08)',
                  fontWeight: 500,
                }}
              >
                <Filter className="w-3 h-3" />
                {selectedClasses.includes('all') ? 'All Classes' : `${selectedClasses.length} selected`}
                <ChevronDown className={`w-3 h-3 transition-transform ${filterOpen ? 'rotate-180' : ''}`} />
              </button>
              {filterOpen && (
                <div
                  className="absolute right-0 mt-2 py-2 rounded-lg z-50"
                  style={{
                    background: '#1A1A1A',
                    border: '1px solid rgba(255,255,255,0.1)',
                    boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
                    minWidth: '180px',
                  }}
                >
                  {fodClasses.map(cls => (
                    <button
                      key={cls}
                      onClick={() => toggleClass(cls)}
                      className="w-full text-left px-4 py-1.5 text-xs hover:bg-[#2C2C2E] transition-colors flex items-center gap-2"
                      style={{ color: selectedClasses.includes(cls) || selectedClasses.includes('all') ? '#fff' : '#8E8E93' }}
                    >
                      <span
                        className="w-3 h-3 rounded flex items-center justify-center text-xs"
                        style={{
                          border: '1px solid',
                          borderColor: selectedClasses.includes(cls) || (cls === 'all' && selectedClasses.includes('all')) ? '#007BFF' : '#3C3C3E',
                          background: selectedClasses.includes(cls) || (cls === 'all' && selectedClasses.includes('all')) ? '#007BFF' : 'transparent',
                          fontSize: '8px',
                          lineHeight: 1,
                        }}
                      >
                        {(selectedClasses.includes(cls) || (cls === 'all' && selectedClasses.includes('all'))) && '✓'}
                      </span>
                      {cls === 'all' ? 'All Classes' : cls}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* ─── KPI Cards ─── */}
      <div className="grid grid-cols-2 gap-4 mb-6" style={{ gridTemplateColumns: 'repeat(4, 1fr)' }}>
        <KPICard
          className="fade-in-up fade-in-up-1"
          title="Total Detections (24h)"
          value={summary.total_24h.toString()}
          icon={<ShieldAlert className="w-5 h-5 text-white" />}
          iconColor="blue"
          subtitle="+12 from yesterday"
        />
        <KPICard
          className="fade-in-up fade-in-up-2"
          title="Avg Confidence"
          value={`${(summary.avg_conf * 100).toFixed(1)}%`}
          icon={<TrendingUp className="w-5 h-5 text-white" />}
          iconColor="green"
          subtitle="Above 85% threshold"
        />
        <KPICard
          className="fade-in-up fade-in-up-3"
          title="Top FOD Type"
          value={summary.top_fod}
          icon={<Target className="w-5 h-5 text-white" />}
          iconColor="amber"
          subtitle="32% of all detections"
        />
        <KPICard
          className="fade-in-up fade-in-up-4"
          title="Last Detection"
          value={summary.last_detection}
          icon={<Clock className="w-5 h-5 text-white" />}
          iconColor="purple"
          subtitle="Most recent event"
        />
      </div>

      {/* ─── Map & Charts ─── */}
      <div className="section-header fade-in-up">
        <Globe className="w-4 h-4 text-gray-500" />
        <span className="text-sm text-gray-400" style={{ fontWeight: 500 }}>Map & Trend Analysis</span>
      </div>
      <div className="grid grid-cols-2 gap-6 mb-8">
        <div className="fade-in-up">
          <DetectionMap useMock={USE_MOCK} />
        </div>
        <div className="space-y-6 fade-in-up">
          <DetectionChart
            type="timeline"
            title="Detections per Hour"
            useMock={USE_MOCK}
          />
          <DetectionChart
            type="distribution"
            title="FOD Class Distribution (Top 10)"
            useMock={USE_MOCK}
          />
        </div>
      </div>

      {/* ─── Data Table ─── */}
      <div className="section-header fade-in-up">
        <BarChart3 className="w-4 h-4 text-gray-500" />
        <span className="text-sm text-gray-400" style={{ fontWeight: 500 }}>Detection Records</span>
      </div>
      <div className="fade-in-up">
        <DetectionTable
          timeZone={timeZone}
          selectedClasses={selectedClasses}
          useMock={USE_MOCK}
        />
      </div>
    </div>
  );
}