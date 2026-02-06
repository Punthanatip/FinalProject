import "../styles/globals.css";
import "../index.css";
import { Header } from "../components/Header";
import { Navigation } from "../components/Navigation";
import Providers from "./providers";

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="min-h-screen bg-[#121212] text-white">
        <Header />
        <Navigation />
        <Providers>
          <main className="pt-32">{children}</main>
        </Providers>
      </body>
    </html>
  );
}