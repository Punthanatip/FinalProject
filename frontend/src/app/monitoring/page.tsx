"use client";

import { useState, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { RealtimeMonitoring } from "../../components/RealtimeMonitoring";

export default function Page() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const roomIdParam = searchParams.get("roomId") || "";
  const source = (searchParams.get("source") as 'image' | 'video' | 'live' | null) || 'live';
  const previewUrl = searchParams.get("previewUrl") || undefined;
  const [active, setActive] = useState(false);
  const [rid, setRid] = useState<string>(roomIdParam || "");

  // Generate a stable roomId on the client after hydration to avoid SSR mismatch
  useEffect(() => {
    if (!roomIdParam) {
      setRid(`room-${Date.now()}`);
    }
  }, [roomIdParam]);

  return (
    <RealtimeMonitoring
      active={active}
      onStart={() => setActive(true)}
      onStop={() => setActive(false)}
      roomId={rid}
      source={source}
      previewUrl={previewUrl}
    />
  );
}