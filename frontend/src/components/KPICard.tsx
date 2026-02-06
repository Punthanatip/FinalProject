interface KPICardProps {
  title: string;
  value: string;
}

export function KPICard({ title, value }: KPICardProps) {
  return (
    <div className="bg-[#1A1A1A] border border-[#2C2C2E] rounded-lg p-6">
      <h3 className="text-sm text-gray-400 mb-2">{title}</h3>
      <div className="text-3xl tabular-nums text-white">
        {value}
      </div>
    </div>
  );
}
