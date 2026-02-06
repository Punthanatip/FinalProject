export const runtime = "nodejs";

export async function POST(request: Request) {
  const base = process.env.BACKEND_BASE_URL;
  if (!base) {
    return new Response(JSON.stringify({ error: "BACKEND_BASE_URL not set" }), { status: 500, headers: { "content-type": "application/json" } });
  }

  // Read query params
  const requestUrl = new URL(request.url);
  const confFromQuery = requestUrl.searchParams.get('conf');
  const saveFromQuery = requestUrl.searchParams.get('save');

  const inForm = await request.formData();
  const file = inForm.get('file') as File | null;
  const source = (inForm.get('source') as string | null) || undefined;
  const roomId = (inForm.get('roomId') as string | null) || undefined;
  const latitude = (inForm.get('latitude') as string | null) || undefined;
  const longitude = (inForm.get('longitude') as string | null) || undefined;
  const yaw = (inForm.get('yaw') as string | null) || undefined;
  const threshold = confFromQuery || (inForm.get('threshold') as string | null) || undefined;
  const saveIncoming = saveFromQuery || (inForm.get('save') as string | null) || undefined;

  const outForm = new FormData();
  if (file) outForm.append('file', file);

  const params = new URLSearchParams();
  if (threshold) params.set('conf', threshold);
  params.set('imgsz', '832');
  params.set('save', saveIncoming === 'true' ? 'true' : 'false');
  if (latitude) params.set('latitude', latitude);
  if (longitude) params.set('longitude', longitude);
  if (yaw) params.set('yaw', yaw);
  if (source) params.set('source', source);
  const sourceRef = roomId || (file ? (file.name || 'upload') : undefined);
  if (sourceRef) params.set('source_ref', sourceRef);

  const headers: Record<string, string> = {};
  if (process.env.BACKEND_API_KEY) headers["Authorization"] = `Bearer ${process.env.BACKEND_API_KEY}`;
  const isStream = source === 'video' || source === 'live';
  const backendUrl = `${base.replace(/\/$/, '')}/${isStream ? 'proxy/track' : 'proxy/detect'}?${params.toString()}`;
  const res = await fetch(backendUrl, { method: "POST", body: outForm, headers });
  const contentType = res.headers.get("content-type") || "application/json";
  const body = await res.text();
  return new Response(body, { status: res.status, headers: { "content-type": contentType } });
}