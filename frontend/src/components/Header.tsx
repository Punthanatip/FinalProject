"use client";
import { StatusPill } from './StatusPill';
import { Plane, LogOut, User } from 'lucide-react';
import Link from 'next/link';
import { useHealth } from "../app/health-context";
import { useAuth } from "../app/auth-context";

export function Header() {
  const { health } = useHealth();
  const { user, logout } = useAuth();

  return (
    <header className="fixed top-0 left-0 right-0 z-50 bg-[#1A1A1A] border-b border-[#2C2C2E]">
      <div className="px-8 py-4">
        <div className="flex items-center justify-between">
          <Link href="/" className="flex items-center gap-3 hover:opacity-80 transition-opacity">
            <div className="flex items-center justify-center w-10 h-10 bg-[#007BFF] rounded-lg">
              <Plane className="w-6 h-6" />
            </div>
            <div>
              <h1 className="text-white">Airport Runway FOD Detection System</h1>
              <p className="text-sm text-gray-400">Mission-Critical Detection &amp; Monitoring</p>
            </div>
          </Link>

          <div className="flex items-center gap-3">
            <StatusPill label="API" status={health.api} endpoint="/health" />
            <StatusPill label="AI" status={health.ai} endpoint="/health" />
            <StatusPill label="DB" status={health.db} endpoint="/health" />

            {/* User info + Logout */}
            {user && (
              <div className="flex items-center gap-2 ml-2 pl-3 border-l border-white/10">
                <div className="flex items-center gap-1.5 text-sm text-gray-400">
                  <User className="w-3.5 h-3.5" />
                  <span className="text-gray-300 font-medium">{user.username}</span>
                </div>
                <button
                  onClick={logout}
                  title="ออกจากระบบ"
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm text-gray-400 hover:text-white hover:bg-white/10 transition-all duration-150"
                >
                  <LogOut className="w-3.5 h-3.5" />
                  <span>ออกจากระบบ</span>
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </header>
  );
}
