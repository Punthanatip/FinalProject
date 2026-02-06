"use client";

import { Upload, Radio, BarChart3 } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

export function Navigation() {
  const pathname = usePathname();

  const linkClass = (active: boolean) =>
    `flex items-center gap-2 px-6 py-3 border-b-2 transition-colors ${
      active ? 'border-[#007BFF] text-white' : 'border-transparent text-gray-400 hover:text-white'
    }`;

  return (
    <nav className="fixed top-[73px] left-0 right-0 z-40 bg-[#1A1A1A] border-b border-[#2C2C2E]">
      <div className="px-8">
        <div className="flex gap-1">
          <Link href="/input" className={linkClass(pathname === '/input')}> 
            <Upload className="w-4 h-4" />
            Input & Control
          </Link>
          <Link href="/monitoring" className={linkClass(pathname === '/monitoring')}>
            <Radio className="w-4 h-4" />
            Real-time Monitoring
          </Link>
          <Link href="/dashboard" className={linkClass(pathname === '/dashboard')}>
            <BarChart3 className="w-4 h-4" />
            Dashboard
          </Link>
        </div>
      </div>
    </nav>
  );
}
