"use client";
import { StatusPill } from './StatusPill';
import { Plane } from 'lucide-react';
import { useEffect, useState, useRef } from 'react';
import { useHealth } from "../app/health-context";

interface HealthStatus {
  api: 'online' | 'offline';
  ai: 'online' | 'offline';
  db: 'online' | 'offline';
}

export function Header() {
  const { health } = useHealth();

  return (
    <header className="fixed top-0 left-0 right-0 z-50 bg-[#1A1A1A] border-b border-[#2C2C2E]">
      <div className="px-8 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex items-center justify-center w-10 h-10 bg-[#007BFF] rounded-lg">
              <Plane className="w-6 h-6" />
            </div>
            <div>
              <h1 className="text-white">Airport Runway FOD Detection System</h1>
              <p className="text-sm text-gray-400">Mission-Critical Detection & Monitoring</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <StatusPill label="API" status={health.api} endpoint="/health" />
            <StatusPill label="AI" status={health.ai} endpoint="/health" />
            <StatusPill label="DB" status={health.db} endpoint="/health" />
          </div>
        </div>
      </div>
    </header>
  );
}
