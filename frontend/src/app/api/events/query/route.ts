export const runtime = "nodejs";

function withTimeout(ms: number) {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), ms);
  return { signal: controller.signal, cancel: () => clearTimeout(id) };
}

export async function GET(request: Request) {
  const base = process.env.BACKEND_BASE_URL;
  if (!base) {
    return new Response(JSON.stringify({ error: "BACKEND_BASE_URL not set" }), { status: 500, headers: { "content-type": "application/json" } });
  }
  const incoming = new URL(request.url);
  const qs = incoming.searchParams.toString();
  const headers: Record<string, string> = {};
  if (process.env.BACKEND_API_KEY) headers["Authorization"] = `Bearer ${process.env.BACKEND_API_KEY}`;
  const { signal, cancel } = withTimeout(5000);
  try {
    const res = await fetch(`${base.replace(/\/$/, '')}/events/query${qs ? `?${qs}` : ''}`, { headers, signal });
    const body = await res.text();
    cancel();
    return new Response(body, { status: res.status, headers: { "content-type": res.headers.get("content-type") || "application/json" } });
  } catch (e) {
    cancel();
    return new Response(JSON.stringify({ error: "fetch failed" }), { status: 502, headers: { "content-type": "application/json" } });
  }
}