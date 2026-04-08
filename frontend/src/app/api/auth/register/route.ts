export const runtime = "nodejs";

export async function POST(request: Request) {
  const base = process.env.BACKEND_BASE_URL;
  if (!base) {
    return new Response(
      JSON.stringify({ error: "BACKEND_BASE_URL not set" }),
      { status: 500, headers: { "content-type": "application/json" } }
    );
  }

  try {
    const body = await request.json();
    const res = await fetch(`${base.replace(/\/$/, "")}/auth/register`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });

    const data = await res.json();

    if (!res.ok) {
      return new Response(JSON.stringify(data), {
        status: res.status,
        headers: { "content-type": "application/json" },
      });
    }

    // สมัครแล้ว login อัตโนมัติ — set HttpOnly cookie ทันที
    const { token, username, role } = data;
    const cookieMaxAge = 60 * 60 * 8; // 8 ชั่วโมง

    return new Response(
      JSON.stringify({ ok: true, username, role }),
      {
        status: 200,
        headers: {
          "content-type": "application/json",
          "set-cookie": `fod_session=${token}; HttpOnly; Path=/; SameSite=Strict; Max-Age=${cookieMaxAge}`,
        },
      }
    );
  } catch {
    return new Response(
      JSON.stringify({ error: "Failed to connect to backend" }),
      { status: 502, headers: { "content-type": "application/json" } }
    );
  }
}
