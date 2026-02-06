export const runtime = "nodejs";

export async function GET(request: Request) {
  const base = process.env.BACKEND_BASE_URL;
  if (!base) {
    return new Response(JSON.stringify({ error: "BACKEND_BASE_URL not set" }), { status: 500, headers: { "content-type": "application/json" } });
  }
  const url = new URL(request.url);
  const range = url.searchParams.get("range") || "24h";
  const headers: Record<string, string> = {};
  if (process.env.BACKEND_API_KEY) headers["Authorization"] = `Bearer ${process.env.BACKEND_API_KEY}`;
  const controller = new AbortController();
  const tid = setTimeout(() => controller.abort(), 15000);
  try {
    const res = await fetch(`${base.replace(/\/$/, '')}/dashboard/summary?range=${encodeURIComponent(range)}`, { headers, signal: controller.signal });
    const body = await res.text();
    clearTimeout(tid);
    return new Response(body, { status: res.status, headers: { "content-type": res.headers.get("content-type") || "application/json" } });
  } catch (e) {
    clearTimeout(tid);
    return new Response(JSON.stringify({ total_24h: 0, avg_conf: 0, top_fod: null, error: "fetch failed" }), { status: 200, headers: { "content-type": "application/json" } });
  }
}