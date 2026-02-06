export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const base = process.env.BACKEND_BASE_URL;
  if (!base) {
    return new Response(JSON.stringify({ error: "BACKEND_BASE_URL not set" }), { status: 500, headers: { "content-type": "application/json" } });
  }
  const body = await request.text();
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (process.env.BACKEND_API_KEY) headers["Authorization"] = `Bearer ${process.env.BACKEND_API_KEY}`;
  try {
    const res = await fetch(`${base.replace(/\/$/, '')}/events/ingest`, { method: "POST", body, headers });
    const text = await res.text();
    return new Response(text, { status: res.status, headers: { "content-type": res.headers.get("content-type") || "application/json" } });
  } catch (e) {
    return new Response(JSON.stringify({ error: "ingest_failed" }), { status: 502, headers: { "content-type": "application/json" } });
  }
}