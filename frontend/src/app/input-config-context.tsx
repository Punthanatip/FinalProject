"use client";

import { createContext, useContext, useState, ReactNode } from "react";

// ─── Input form config (persists across navigation) ─────────────────────────
interface InputConfig {
  sourceType: 'image' | 'video' | 'live';
  latitude: string;
  longitude: string;
  yaw: string;
  threshold: number;
  roomId: string;
}

// ─── Last monitoring session (so /monitoring can restore state on nav-back) ──
export interface MonitoringSession {
  roomId: string;
  source: 'image' | 'video' | 'live';
  lat: number;
  lng: number;
  yaw: number;
  previewUrl?: string;
}

interface AppContextType {
  config: InputConfig;
  setConfig: (cfg: Partial<InputConfig>) => void;
  session: MonitoringSession | null;
  setSession: (s: MonitoringSession | null) => void;
}

const defaultConfig: InputConfig = {
  sourceType: 'image',
  latitude: '13.6900',
  longitude: '100.7500',
  yaw: '92.3',
  threshold: 0.70,
  roomId: '',
};

const AppContext = createContext<AppContextType>({
  config: defaultConfig,
  setConfig: () => {},
  session: null,
  setSession: () => {},
});

export function InputConfigProvider({ children }: { children: ReactNode }) {
  const [config, setConfigState] = useState<InputConfig>(defaultConfig);
  const [session, setSession] = useState<MonitoringSession | null>(null);

  const setConfig = (partial: Partial<InputConfig>) =>
    setConfigState(prev => ({ ...prev, ...partial }));

  return (
    <AppContext.Provider value={{ config, setConfig, session, setSession }}>
      {children}
    </AppContext.Provider>
  );
}

export function useInputConfig() {
  return useContext(AppContext);
}
