"use client";

import { createContext, useContext, useEffect, useRef, useState } from "react";

type HealthStatus = { api: "online" | "offline"; ai: "online" | "offline"; db: "online" | "offline" };

const Ctx = createContext<{ health: HealthStatus }>({ health: { api: "online", ai: "online", db: "online" } });

export function HealthProvider({ children }: { children: React.ReactNode }) {
  const [health, setHealth] = useState<HealthStatus>({ api: "online", ai: "online", db: "online" });
  const failRef = useRef(0);
  const timerRef = useRef<number | null>(null);
  const pausedRef = useRef(false);
  const lastOkRef = useRef<number>(Date.now());

  useEffect(() => {
    const fetchHealth = async () => {
      try {
        const controller = new AbortController();
        const tid = setTimeout(() => controller.abort(), 3000);
        const res = await fetch("/api/health", { signal: controller.signal });
        clearTimeout(tid);
        if (!res.ok) throw new Error("!ok");
        const data = await res.json();
        const norm = (v: any): "online" | "offline" => (v === "online" || v === "ok" || v === true ? "online" : "offline");
        setHealth({ api: norm(data.api), ai: norm(data.ai), db: norm(data.db) });
        failRef.current = 0;
        lastOkRef.current = Date.now();
      } catch {
        failRef.current += 1;
        if (!pausedRef.current) {
          const stale = Date.now() - lastOkRef.current > 120000;
          if (failRef.current >= 3 && stale) setHealth({ api: "offline", ai: "offline", db: "offline" });
        }
      }
    };
    fetchHealth();
    timerRef.current = window.setInterval(fetchHealth, 30000);
    const onPause = () => {
      pausedRef.current = true;
      if (timerRef.current) clearInterval(timerRef.current);
      timerRef.current = window.setInterval(fetchHealth, 60000);
    };
    const onResume = () => {
      pausedRef.current = false;
      if (timerRef.current) clearInterval(timerRef.current);
      timerRef.current = window.setInterval(fetchHealth, 30000);
    };
    window.addEventListener("health:pause", onPause as EventListener);
    window.addEventListener("health:resume", onResume as EventListener);
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      window.removeEventListener("health:pause", onPause as EventListener);
      window.removeEventListener("health:resume", onResume as EventListener);
    };
  }, []);

  return <Ctx.Provider value={{ health }}>{children}</Ctx.Provider>;
}

export function useHealth() {
  return useContext(Ctx);
}