"use client";

import { ThemeProvider } from "next-themes";
import { Toaster } from "../components/ui/sonner";
import { HealthProvider } from "./health-context";

export default function Providers({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider attribute="class">
      <HealthProvider>
        {children}
        <Toaster position="top-right" />
      </HealthProvider>
    </ThemeProvider>
  );
}