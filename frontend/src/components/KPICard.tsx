import { type ReactNode } from 'react';

interface KPICardProps {
  title: string;
  value: string;
  icon: ReactNode;
  iconColor?: 'blue' | 'amber' | 'green' | 'red' | 'purple';
  subtitle?: string;
  className?: string;
}

export function KPICard({
  title,
  value,
  icon,
  iconColor = 'blue',
  subtitle,
  className = '',
}: KPICardProps) {
  return (
    <div
      className={`glass-card kpi-glow p-5 cursor-default ${className}`}
    >
      <div className="flex items-start gap-4">
        <div className={`icon-container icon-container--${iconColor}`}>
          {icon}
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="text-xs text-gray-400 mb-1" style={{ fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
            {title}
          </h3>
          <div
            className="text-2xl tabular-nums text-white"
            style={{ fontWeight: 700, lineHeight: 1.1 }}
          >
            {value}
          </div>
          {subtitle && (
            <p className="text-xs text-gray-500 mt-1.5" style={{ fontSize: '0.7rem' }}>{subtitle}</p>
          )}
        </div>
      </div>
    </div>
  );
}
