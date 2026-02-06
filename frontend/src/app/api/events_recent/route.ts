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
  const url = new URL(request.url);
  const limit = url.searchParams.get("limit") || "200";
  const headers: Record<string, string> = {};
  if (process.env.BACKEND_API_KEY) headers["Authorization"] = `Bearer ${process.env.BACKEND_API_KEY}`;
  const { signal, cancel } = withTimeout(15000);
  try {
    const root = base.replace(/\/$/, '');
    const res = await fetch(`${root}/events/recent?limit=${encodeURIComponent(limit)}`, { headers, signal });
    if (res.status === 404) {
      const now = new Date();
      const from = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();
      const to = now.toISOString();
      const qRes = await fetch(`${root}/events/query?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`, { headers, signal });
      const qBody = await qRes.text();
      cancel();
      return new Response(qBody, { status: qRes.status, headers: { "content-type": qRes.headers.get("content-type") || "application/json" } });
    }
    const body = await res.text();
    cancel();
    return new Response(body, { status: res.status, headers: { "content-type": res.headers.get("content-type") || "application/json" } });
  } catch (e) {
    cancel();
    return new Response(JSON.stringify([]), { status: 200, headers: { "content-type": "application/json" } });
  }
}