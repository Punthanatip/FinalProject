export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const base = process.env.BACKEND_BASE_URL;
  if (!base) {
    return new Response(
      JSON.stringify({ api: "offline", ai: "offline", db: "offline", error: "BACKEND_BASE_URL not set" }),
      { status: 500, headers: { "content-type": "application/json" } }
    );
  }
  try {
    const headers: Record<string, string> = {};
    if (process.env.BACKEND_API_KEY) headers["Authorization"] = `Bearer ${process.env.BACKEND_API_KEY}`;
    const root = base.replace(/\/$/, '');
    const [apiRes, aiRes, aiReadyRes, dbRes] = await Promise.all([
      fetch(`${root}/health`, { headers }).catch(() => null),
      fetch(`${root}/health/ai`, { headers }).catch(() => null),
      fetch(`${root}/health/ai-ready`, { headers }).catch(() => null),
      fetch(`${root}/health/db`, { headers }).catch(() => null),
    ]);
    const safeJson = async (r: Response | null) => {
      if (!r) return null;
      try { return await r.json(); } catch { return null; }
    };
    const safeTextHasOk = async (r: Response | null) => {
      if (!r) return false;
      try {
        const t = await r.text();
        return /ok|true/i.test(t);
      } catch { return false; }
    };
    const apiOk = !!(apiRes && apiRes.ok);
    const aiJson = await safeJson(aiRes);
    const aiReadyJson = await safeJson(aiReadyRes);
    const dbJson = await safeJson(dbRes);
    const aiOk = !!(aiRes && aiRes.ok && (aiReadyJson ? (aiReadyJson.ok === true) : await safeTextHasOk(aiReadyRes)));
    const dbOk = !!(dbRes && dbRes.ok && (dbJson ? (dbJson.ok === true) : await safeTextHasOk(dbRes)));
    return new Response(JSON.stringify({
      api: apiOk ? 'online' : 'offline',
      ai: aiOk ? 'online' : 'offline',
      db: dbOk ? 'online' : 'offline',
    }), { status: 200, headers: { 'content-type': 'application/json' } });
  } catch (e) {
    return new Response(JSON.stringify({ api: "offline", ai: "offline", db: "offline" }), {
      status: 502,
      headers: { "content-type": "application/json" },
    });
  }
}