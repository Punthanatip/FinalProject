import "../styles/globals.css";
import "../index.css";
import Providers from "./providers";
import ConditionalShell from "./ConditionalShell";

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="min-h-screen bg-[#121212] text-white">
        <Providers>
          <ConditionalShell>{children}</ConditionalShell>
        </Providers>
      </body>
    </html>
  );
}