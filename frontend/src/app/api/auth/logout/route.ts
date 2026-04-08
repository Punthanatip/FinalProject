export const runtime = "nodejs";

export async function POST() {
  // ลบ cookie โดย set Max-Age=0 (expire ทันที)
  return new Response(
    JSON.stringify({ ok: true, message: "Logged out" }),
    {
      status: 200,
      headers: {
        "content-type": "application/json",
        "set-cookie": "fod_session=; HttpOnly; Path=/; SameSite=Strict; Max-Age=0",
      },
    }
  );
}
