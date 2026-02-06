export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return new Response(JSON.stringify({
    ok: true,
    endpoints: [
      "/api/events/recent?limit=...",
      "/api/events/query?from=ISO&to=ISO&source_ref=...",
    ],
  }), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}