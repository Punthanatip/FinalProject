export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return new Response(JSON.stringify({ ok: true, ts: Date.now() }), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}