export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  // Use AI server URL for WebRTC (aiortc)
  const aiBase = process.env.AI_BASE_URL || "http://localhost:8001";

  try {
    const body = await req.json();

    const res = await fetch(`${aiBase.replace(/\/$/, '')}/webrtc/offer`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body)
    });

    if (!res.ok) {
      const text = await res.text();
      return new Response(JSON.stringify({ error: text }), {
        status: res.status,
        headers: { "content-type": "application/json" }
      });
    }

    const data = await res.json();
    return new Response(JSON.stringify(data), {
      status: 200,
      headers: { "content-type": "application/json" }
    });
  } catch (e) {
    console.error("[webrtc/offer] error:", e);
    return new Response(JSON.stringify({ error: "offer_failed" }), {
      status: 502,
      headers: { "content-type": "application/json" }
    });
  }
}