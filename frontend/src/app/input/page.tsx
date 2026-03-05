"use client";

import { useRouter } from "next/navigation";
import { InputControl } from "../../components/InputControl";

export default function Page() {
  const router = useRouter();

  const handleStartDetection = (config: any) => {
    const roomId = config.roomId || `room-${Date.now()}`;
    const source = config.source || 'live';
    let previewUrl = '';
    if ((source === 'image' || source === 'video') && config.file) {
      try {
        previewUrl = URL.createObjectURL(config.file);
      } catch { }
    }
    const params = new URLSearchParams({ roomId, source });
    if (previewUrl) params.set('previewUrl', previewUrl);
    if (config.latitude != null) params.set('lat', String(config.latitude));
    if (config.longitude != null) params.set('lng', String(config.longitude));
    if (config.yaw != null) params.set('yaw', String(config.yaw));
    router.push(`/monitoring?${params.toString()}`);
  };

  return <InputControl onStartDetection={handleStartDetection} />;
}