"use client";

import { usePathname } from "next/navigation";
import { Header } from "../components/Header";
import { Navigation } from "../components/Navigation";

// แสดง Header+Navigation เฉพาะหน้าที่ไม่ใช่ /login
export default function ConditionalShell({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const isPublicPage = pathname === "/login";

  if (isPublicPage) {
    // หน้า login ไม่มี header/nav
    return <main className="min-h-screen bg-[#121212]">{children}</main>;
  }

  return (
    <>
      <Header />
      <Navigation />
      <main className="pt-32">{children}</main>
    </>
  );
}
