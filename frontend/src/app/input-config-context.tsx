"use client";

import { createContext, useContext, useState } from "react";

export type InputConfig = {
  source: "live" | "image" | "video" | "webrtc";
  roomId: string;
  file: File | null;
  conf: number;
  imgsz: number;
};

const defaultConfig: InputConfig = {
  source: "live",
  roomId: "",
  file: null,
  conf: 0.25,
  imgsz: 832,
};

type InputConfigContextType = {
  config: InputConfig;
  setConfig: (config: Partial<InputConfig>) => void;
};

const InputConfigContext = createContext<InputConfigContextType>({
  config: defaultConfig,
  setConfig: () => {},
});

export function InputConfigProvider({ children }: { children: React.ReactNode }) {
  const [config, setConfigState] = useState<InputConfig>(defaultConfig);

  const setConfig = (partial: Partial<InputConfig>) => {
    setConfigState((prev) => ({ ...prev, ...partial }));
  };

  return (
    <InputConfigContext.Provider value={{ config, setConfig }}>
      {children}
    </InputConfigContext.Provider>
  );
}

export function useInputConfig() {
  return useContext(InputConfigContext);
}
