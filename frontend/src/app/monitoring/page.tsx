"use client";

import { useState, useEffect } from "react";
import { useSearchParams } from "next/navigation";
import { RealtimeMonitoring } from "../../components/RealtimeMonitoring";
import { useInputConfig } from "../input-config-context";

export default function Page() {
  const searchParams = useSearchParams();
  const { session } = useInputConfig();

  // URL params take priority; fall back to last saved session in context
  const roomIdParam = searchParams.get("roomId") || session?.roomId || "";
  const source = (searchParams.get("source") ?? session?.source ?? 'live') as 'image' | 'video' | 'live';
  const previewUrl = searchParams.get("previewUrl") || session?.previewUrl || undefined;

  const [active, setActive] = useState(false);
  const [rid, setRid] = useState<string>(roomIdParam);

  // Generate stable roomId if none available
  useEffect(() => {
    if (!roomIdParam) {
      setRid(`room-${Date.now()}`);
    } else {
      setRid(roomIdParam);
    }
  }, [roomIdParam]);

  // Lat/lng/yaw: URL params → session fallback → 0
  const initialLat = parseFloat(searchParams.get('lat') || '') || session?.lat || 0;
  const initialLng = parseFloat(searchParams.get('lng') || '') || session?.lng || 0;
  const initialYaw = parseFloat(searchParams.get('yaw') || '') || session?.yaw || 0;

  return (
    <RealtimeMonitoring
      active={active}
      onStart={() => setActive(true)}
      onStop={() => setActive(false)}
      roomId={rid}
      source={source}
      previewUrl={previewUrl}
      initialLat={initialLat}
      initialLng={initialLng}
      initialYaw={initialYaw}
    />
  );
}