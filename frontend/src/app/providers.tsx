"use client";

import { ThemeProvider } from "next-themes";
import { Toaster } from "../components/ui/sonner";
import { HealthProvider } from "./health-context";
import { InputConfigProvider } from "./input-config-context";
import { AuthProvider } from "./auth-context";

export default function Providers({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider attribute="class">
      <AuthProvider>
        <HealthProvider>
          <InputConfigProvider>
            {children}
            <Toaster position="top-right" />
          </InputConfigProvider>
        </HealthProvider>
      </AuthProvider>
    </ThemeProvider>
  );
}