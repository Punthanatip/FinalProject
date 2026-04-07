"use client";

import { ThemeProvider } from "next-themes";
import { Toaster } from "../components/ui/sonner";
import { HealthProvider } from "./health-context";
import { InputConfigProvider } from "./input-config-context";

export default function Providers({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider attribute="class">
      <HealthProvider>
        <InputConfigProvider>
          {children}
          <Toaster position="top-right" />
        </InputConfigProvider>
      </HealthProvider>
    </ThemeProvider>
  );
}