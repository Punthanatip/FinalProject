import { CheckCircle2, XCircle } from 'lucide-react';

interface StatusPillProps {
  label: string;
  status: 'online' | 'offline';
  endpoint?: string;
}

export function StatusPill({ label, status, endpoint }: StatusPillProps) {
  return (
    <div 
      className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-sm ${
        status === 'online' 
          ? 'bg-[#34C759]/10 text-[#34C759]' 
          : 'bg-[#FF3B30]/10 text-[#FF3B30]'
      }`}
      title={endpoint ? `Endpoint: ${endpoint}` : undefined}
    >
      {status === 'online' ? (
        <CheckCircle2 className="w-4 h-4" />
      ) : (
        <XCircle className="w-4 h-4" />
      )}
      {label}
    </div>
  );
}
