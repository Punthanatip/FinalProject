export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { cookies } from "next/headers";

export async function GET() {
  const base = process.env.BACKEND_BASE_URL;
  if (!base) {
    return new Response(
      JSON.stringify({ error: "BACKEND_BASE_URL not set" }),
      { status: 500, headers: { "content-type": "application/json" } }
    );
  }

  // อ่าน token จาก HttpOnly cookie
  const cookieStore = await cookies();
  const token = cookieStore.get("fod_session")?.value;

  if (!token) {
    return new Response(
      JSON.stringify({ error: "Not authenticated" }),
      { status: 401, headers: { "content-type": "application/json" } }
    );
  }

  try {
    // ส่ง token ไปให้ Rust verify
    const res = await fetch(`${base.replace(/\/$/, "")}/auth/me`, {
      headers: { Authorization: `Bearer ${token}` },
    });

    const data = await res.json();
    return new Response(JSON.stringify(data), {
      status: res.status,
      headers: { "content-type": "application/json" },
    });
  } catch {
    return new Response(
      JSON.stringify({ error: "Failed to connect to backend" }),
      { status: 502, headers: { "content-type": "application/json" } }
    );
  }
}
