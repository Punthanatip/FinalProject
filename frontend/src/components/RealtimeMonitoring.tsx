/**
 * RealtimeMonitoring - WebRTC Video Track version (aiortc)
 * 
 * Uses aiortc server to receive annotated video stream with bounding boxes
 * drawn on the server side for perfect sync.
 * 
 * For video/live modes: bounding boxes are rendered on server
 * For image mode: uses standard API detection
 */

import { useState, useEffect, useRef } from 'react';
import { StopCircle, Wifi, WifiOff } from 'lucide-react';
import { EventLog } from './EventLog';
import { BoundingBox } from './BoundingBox';

interface Detection {
  id: string;
  ts: string;
  class: string;
  confidence: number;
  bbox: { x1: number; y1: number; x2: number; y2: number };
  lat: number;
  lon: number;
  yaw: number;
  source: { type: string; camera_id?: string };
  thumb_url: string;
  track_id?: string;
  img_w?: number;
  img_h?: number;
  fps?: number;
}

interface RealtimeMonitoringProps {
  active: boolean;
  onStop: () => void;
  onStart?: () => void;
  roomId: string;
  source?: 'image' | 'video' | 'live';
  previewUrl?: string;
}

// AI WebRTC server URL (same as FastAPI - port 8001)
const AI_WEBRTC_URL = process.env.NEXT_PUBLIC_AI_WEBRTC_URL || 'http://localhost:8001';

export function RealtimeMonitoring({
  active,
  onStop,
  onStart,
  roomId,
  source = 'live',
  previewUrl
}: RealtimeMonitoringProps) {
  const [detections, setDetections] = useState<Detection[]>([]);
  const [wsConnected, setWsConnected] = useState(false);
  const [threshold, setThreshold] = useState(0.70);
  const [recording, setRecording] = useState(false);
  const [rtcFps, setRtcFps] = useState<number | null>(null);

  // Video refs - one for local camera, one for remote annotated stream
  const localVideoRef = useRef<HTMLVideoElement>(null);
  const remoteVideoRef = useRef<HTMLVideoElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const imageRef = useRef<HTMLImageElement>(null);

  // Image dimensions for bounding box scaling (image mode only)
  const [imageDims, setImageDims] = useState<{ w: number; h: number }>({ w: 0, h: 0 });

  const pcRef = useRef<RTCPeerConnection | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const dataChannelRef = useRef<RTCDataChannel | null>(null);  // For sending config updates
  const trackSavedRef = useRef<Map<string, number>>(new Map());
  const trackLastSeenRef = useRef<Map<string, number>>(new Map());

  // Live GPS coordinates for tracking vehicle position
  const [liveCoords, setLiveCoords] = useState<{ lat: number; lng: number }>({ lat: 0, lng: 0 });
  const [gpsActive, setGpsActive] = useState(false);
  const liveCoordsRef = useRef(liveCoords);  // Ref to avoid stale closure in callbacks

  // Keep ref in sync with state
  useEffect(() => {
    liveCoordsRef.current = liveCoords;
  }, [liveCoords]);

  // Start GPS tracking when monitoring is active
  useEffect(() => {
    if (!active || source === 'image') return;
    if (!("geolocation" in navigator)) {
      console.warn('Geolocation not available');
      return;
    }

    const watchId = navigator.geolocation.watchPosition(
      (pos) => {
        setLiveCoords({
          lat: pos.coords.latitude,
          lng: pos.coords.longitude
        });
        setGpsActive(true);
      },
      (err) => {
        console.warn('GPS watch error:', err.message);
        setGpsActive(false);
      },
      { enableHighAccuracy: true, maximumAge: 1000 }
    );

    return () => {
      navigator.geolocation.clearWatch(watchId);
      setGpsActive(false);
    };
  }, [active, source]);

  // Cleanup stale detections
  useEffect(() => {
    if (!active || source === 'image') return;

    const cleanupInterval = setInterval(() => {
      const now = Date.now();
      const staleThreshold = 500;

      setDetections(prev => {
        const activeDetections = prev.filter(d => {
          if (!d.track_id) return true;
          const lastSeen = trackLastSeenRef.current.get(d.track_id) || 0;
          return (now - lastSeen) < staleThreshold;
        });
        return activeDetections;
      });
    }, 200);

    return () => clearInterval(cleanupInterval);
  }, [active, source]);

  // Image mode detection using REST API
  useEffect(() => {
    if (!active || source !== 'image' || !previewUrl) return;

    const detectImage = async () => {
      try {
        console.log('[image] Starting image detection...');
        setWsConnected(true);
        setRecording(true);

        // Fetch image and send to detect API
        const imgResponse = await fetch(previewUrl);
        const blob = await imgResponse.blob();

        const formData = new FormData();
        formData.append('file', blob, 'image.jpg');

        const response = await fetch(`/api/detect?conf=${threshold}&save=false`, {
          method: 'POST',
          body: formData
        });

        if (!response.ok) {
          throw new Error(`Detection failed: ${response.status}`);
        }

        const result = await response.json();
        console.log('[image] Detection result:', result);

        // Process detections
        if (result.detections && result.detections.length > 0) {
          const iw = result.img_w || 1280;
          const ih = result.img_h || 720;

          const newDetections: Detection[] = result.detections.map((d: any, idx: number) => ({
            id: `img-${idx}`,
            ts: result.ts || new Date().toISOString(),
            class: d.cls || 'object',
            confidence: d.conf || 0.8,
            bbox: {
              x1: d.bbox_xywh[0],
              y1: d.bbox_xywh[1],
              x2: d.bbox_xywh[0] + d.bbox_xywh[2],
              y2: d.bbox_xywh[1] + d.bbox_xywh[3]
            },
            lat: 0,
            lon: 0,
            yaw: 0,
            source: { type: 'image' },
            thumb_url: '',
            img_w: iw,
            img_h: ih,
            fps: result.fps
          }));

          setDetections(newDetections);
          if (result.fps) setRtcFps(result.fps);
        }

      } catch (error) {
        console.error('[image] Detection error:', error);
      }
    };

    detectImage();

    return () => {
      setWsConnected(false);
      setRecording(false);
    };
  }, [active, source, previewUrl, threshold]);

  // Main WebRTC connection to aiortc server (for video/live modes)
  useEffect(() => {
    if (!active || source === 'image') return;

    let pc: RTCPeerConnection | null = null;
    let localStream: MediaStream | null = null;

    const startWebRTC = async () => {
      try {
        console.log('[aiortc] Starting WebRTC connection...');

        // Get local camera/video stream
        if (source === 'live') {
          localStream = await navigator.mediaDevices.getUserMedia({
            video: { width: { ideal: 1280 }, height: { ideal: 720 } }
          });
          localStreamRef.current = localStream;

          // Show local preview (optional - hidden by default)
          if (localVideoRef.current) {
            localVideoRef.current.srcObject = localStream;
          }
        } else if (source === 'video' && previewUrl) {
          // For video mode, we need to capture from a video element
          // Create a hidden video element to load the source
          const videoEl = document.createElement('video');
          videoEl.src = previewUrl;
          videoEl.crossOrigin = 'anonymous';
          videoEl.muted = true;
          videoEl.loop = true;
          videoEl.playsInline = true;

          await new Promise<void>((resolve, reject) => {
            videoEl.onloadedmetadata = () => resolve();
            videoEl.onerror = () => reject(new Error('Video load failed'));
            setTimeout(() => reject(new Error('Video load timeout')), 10000);
          });

          await videoEl.play();

          // Capture stream from video element
          const capturedStream = (videoEl as any).captureStream?.() || (videoEl as any).mozCaptureStream?.();
          if (capturedStream) {
            localStream = capturedStream;
            localStreamRef.current = localStream;

            // Store video element reference for cleanup
            (localStreamRef as any).videoEl = videoEl;
          } else {
            throw new Error('captureStream not supported');
          }
        }

        // Create peer connection
        const iceServers: RTCIceServer[] = [
          { urls: 'stun:stun.l.google.com:19302' }
        ];

        pc = new RTCPeerConnection({ iceServers });
        pcRef.current = pc;

        // Force H.264 codec for both sending and receiving (match AI server)
        const setH264Preference = () => {
          try {
            const transceivers = pc!.getTransceivers();
            transceivers.forEach(transceiver => {
              if (transceiver.sender.track?.kind === 'video' || transceiver.receiver.track?.kind === 'video') {
                const codecs = RTCRtpSender.getCapabilities?.('video')?.codecs || [];
                const h264Codecs = codecs.filter(c => c.mimeType.toLowerCase().includes('h264'));
                if (h264Codecs.length > 0) {
                  transceiver.setCodecPreferences(h264Codecs);
                  console.log('[aiortc] Set H.264 codec preference');
                }
              }
            });
          } catch (e) {
            console.warn('[aiortc] Could not set H.264 preference:', e);
          }
        };

        // Create DataChannel for receiving detection metadata (browser creates it)
        const detectionsChannel = pc.createDataChannel("detections", { ordered: false });
        detectionsChannel.onopen = () => {
          console.log('[aiortc] DataChannel opened');
          dataChannelRef.current = detectionsChannel;  // Store ref for sending config updates
        };
        detectionsChannel.onclose = () => {
          console.log('[aiortc] DataChannel closed');
          dataChannelRef.current = null;
        };
        detectionsChannel.onmessage = (ev) => {
          try {
            const msg = JSON.parse(ev.data);
            console.log('[aiortc] DataChannel message:', msg);

            // Update FPS
            if (typeof msg?.fps === 'number') {
              setRtcFps(msg.fps);
            }

            // Process detections for EventLog
            if (msg && msg.detections && msg.detections.length > 0) {
              const iw = Number(msg.img_w) || 1280;
              const ih = Number(msg.img_h) || 720;

              msg.detections.forEach((d: any, idx: number) => {
                const trackKey = `frame-${msg.frame_id || Date.now()}-${idx}`;
                const classKey = d.cls || 'object';

                const det: Detection = {
                  id: `class-${classKey}`,
                  ts: msg.ts || new Date().toISOString(),
                  class: d.cls || 'object',
                  confidence: typeof d.conf === 'number' ? d.conf : 0.8,
                  bbox: {
                    x1: d.bbox_xywh[0],
                    y1: d.bbox_xywh[1],
                    x2: d.bbox_xywh[0] + d.bbox_xywh[2],
                    y2: d.bbox_xywh[1] + d.bbox_xywh[3]
                  },
                  lat: 0,
                  lon: 0,
                  yaw: 0,
                  source: { type: source },
                  thumb_url: '',
                  track_id: trackKey,
                  img_w: iw,
                  img_h: ih,
                  fps: msg.fps
                };

                trackLastSeenRef.current.set(trackKey, Date.now());

                // Update EventLog detections
                setDetections(prev => {
                  const existingIndex = prev.findIndex(p => p.class === classKey);
                  if (existingIndex >= 0) {
                    const updated = [...prev];
                    updated[existingIndex] = { ...det, id: prev[existingIndex].id };
                    return updated;
                  }
                  return [det, ...prev].slice(0, 200);
                });

                // DB save with deduplication
                const lastSaved = trackSavedRef.current.get(classKey) || 0;
                const now = Date.now();
                if (now - lastSaved > 10000) {
                  trackSavedRef.current.set(classKey, now);
                  const payload = {
                    ts: det.ts,
                    object_class: det.class,
                    object_count: 1,
                    confidence: det.confidence,
                    latitude: liveCoordsRef.current.lat,
                    longitude: liveCoordsRef.current.lng,
                    source: 'monitoring',
                    source_ref: roomId || 'live_feed',
                    bbox: d.bbox_xywh,
                    meta: { img_w: iw, img_h: ih, frame_id: msg.frame_id }
                  };
                  fetch('/api/events/ingest', {
                    method: 'POST',
                    headers: { 'content-type': 'application/json' },
                    body: JSON.stringify(payload)
                  }).catch(() => { });
                }
              });
            }
          } catch (e) {
            console.warn('[aiortc] DataChannel parse error:', e);
          }
        };

        // Add local tracks to send to server with quality settings
        if (localStream) {
          localStream.getTracks().forEach(track => {
            const sender = pc!.addTrack(track, localStream!);

            // For video track, set encoding parameters to maintain quality
            if (track.kind === 'video') {
              const params = sender.getParameters();
              if (params.encodings && params.encodings.length > 0) {
                // Set higher bitrate and resolution
                params.encodings[0].maxBitrate = 5000000; // 5 Mbps (increased for better quality)
                params.encodings[0].scaleResolutionDownBy = 1.0; // Don't scale down
                sender.setParameters(params).catch(e => console.warn('setParameters error:', e));
              }
            }
          });

          // Apply H.264 preference after tracks are added
          setH264Preference();
        }

        // Handle connection state changes
        pc.onconnectionstatechange = () => {
          console.log('[aiortc] Connection state:', pc?.connectionState);
          if (pc?.connectionState === 'connected') {
            setWsConnected(true);
            setRecording(true);
          } else if (pc?.connectionState === 'failed' || pc?.connectionState === 'disconnected') {
            setWsConnected(false);
            setRecording(false);
          }
        };

        // Handle incoming video track (annotated stream from server)
        pc.ontrack = (event) => {
          console.log('[aiortc] Received track:', event.track.kind);

          if (event.track.kind === 'video' && remoteVideoRef.current) {
            // This is the annotated video stream from AI
            remoteVideoRef.current.srcObject = new MediaStream([event.track]);
          }
        };

        // Handle incoming DataChannel (detection metadata)
        pc.ondatachannel = (event) => {
          const dc = event.channel;
          console.log('[aiortc] DataChannel received:', dc.label);

          dc.onmessage = (ev) => {
            try {
              const msg = JSON.parse(ev.data);

              // Update FPS
              if (typeof msg?.fps === 'number') {
                setRtcFps(msg.fps);
              }

              // Process detections for EventLog
              if (msg && msg.detections && msg.detections.length > 0) {
                const iw = Number(msg.img_w) || 1280;
                const ih = Number(msg.img_h) || 720;

                msg.detections.forEach((d: any, idx: number) => {
                  const trackKey = `frame-${msg.frame_id || Date.now()}-${idx}`;
                  const classKey = d.cls || 'object';

                  const det: Detection = {
                    id: `class-${classKey}`,
                    ts: msg.ts || new Date().toISOString(),
                    class: d.cls || 'object',
                    confidence: typeof d.conf === 'number' ? d.conf : 0.8,
                    bbox: {
                      x1: d.bbox_xywh[0],
                      y1: d.bbox_xywh[1],
                      x2: d.bbox_xywh[0] + d.bbox_xywh[2],
                      y2: d.bbox_xywh[1] + d.bbox_xywh[3]
                    },
                    lat: 0,
                    lon: 0,
                    yaw: 0,
                    source: { type: source },
                    thumb_url: '',
                    track_id: trackKey,
                    img_w: iw,
                    img_h: ih,
                    fps: msg.fps
                  };

                  trackLastSeenRef.current.set(trackKey, Date.now());

                  // Update EventLog detections
                  setDetections(prev => {
                    const existingIndex = prev.findIndex(p => p.class === classKey);
                    if (existingIndex >= 0) {
                      const updated = [...prev];
                      updated[existingIndex] = { ...det, id: prev[existingIndex].id };
                      return updated;
                    }
                    return [det, ...prev].slice(0, 200);
                  });

                  // DB save with deduplication
                  const lastSaved = trackSavedRef.current.get(classKey) || 0;
                  const now = Date.now();
                  if (now - lastSaved > 10000) {
                    trackSavedRef.current.set(classKey, now);
                    const payload = {
                      ts: det.ts,
                      object_class: det.class,
                      object_count: 1,
                      confidence: det.confidence,
                      latitude: liveCoordsRef.current.lat,
                      longitude: liveCoordsRef.current.lng,
                      source: 'monitoring',
                      source_ref: roomId || 'live_feed',
                      bbox: d.bbox_xywh,
                      meta: { img_w: iw, img_h: ih, frame_id: msg.frame_id }
                    };
                    fetch('/api/events/ingest', {
                      method: 'POST',
                      headers: { 'content-type': 'application/json' },
                      body: JSON.stringify(payload)
                    }).catch(() => { });
                  }
                });
              }
            } catch (e) {
              console.warn('[aiortc] DataChannel parse error:', e);
            }
          };
        };

        // Wait for ICE gathering to complete
        await new Promise<void>((resolve) => {
          if (pc!.iceGatheringState === 'complete') {
            resolve();
          } else {
            const checkState = () => {
              if (pc!.iceGatheringState === 'complete') {
                pc!.removeEventListener('icegatheringstatechange', checkState);
                resolve();
              }
            };
            pc!.addEventListener('icegatheringstatechange', checkState);

            // Timeout after 3 seconds
            setTimeout(resolve, 3000);
          }
        });

        // Create and send offer
        const offer = await pc.createOffer({
          offerToReceiveVideo: true,  // We want to receive annotated video
          offerToReceiveAudio: false
        });
        await pc.setLocalDescription(offer);

        console.log('[aiortc] Sending offer to server...');

        // Send offer via Next.js API proxy (to avoid CORS)
        const response = await fetch('/api/webrtc/offer', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            sdp: pc.localDescription?.sdp,
            type: pc.localDescription?.type,
            conf: threshold  // Send threshold to server
          })
        });

        if (!response.ok) {
          throw new Error(`Server returned ${response.status}`);
        }

        const answer = await response.json();
        console.log('[aiortc] Received answer from server');

        await pc.setRemoteDescription({
          type: answer.type,
          sdp: answer.sdp
        });

        console.log('[aiortc] WebRTC connection established');

      } catch (error) {
        console.error('[aiortc] Connection error:', error);
        setWsConnected(false);
        setRecording(false);
      }
    };

    startWebRTC();

    // Cleanup
    return () => {
      if (pc) {
        pc.close();
        pcRef.current = null;
      }
      if (localStream) {
        localStream.getTracks().forEach(t => t.stop());
        localStreamRef.current = null;
      }
    };
    // Note: threshold removed from deps - now sent via DataChannel in handleThresholdChange
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, source, roomId]);

  const handleStop = () => {
    setWsConnected(false);
    setRecording(false);

    if (pcRef.current) {
      pcRef.current.close();
      pcRef.current = null;
    }

    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach(t => t.stop());
      localStreamRef.current = null;
    }

    onStop();
  };

  const handleThresholdChange = (value: number) => {
    setThreshold(value);

    // Send threshold update to server via DataChannel (real-time for video/live mode)
    if (dataChannelRef.current && dataChannelRef.current.readyState === 'open') {
      try {
        dataChannelRef.current.send(JSON.stringify({ conf: value }));
        console.log('[aiortc] Sent threshold update:', value);
      } catch (e) {
        console.warn('[aiortc] Failed to send threshold:', e);
      }
    }
  };

  return (
    <div className="px-8 py-6 max-w-[1920px] mx-auto">
      {!wsConnected && active && source !== 'image' && (
        <div className="bg-[#FFCC00]/10 border border-[#FFCC00] rounded-lg p-4 mb-4 flex items-center gap-3">
          <WifiOff className="w-5 h-5 text-[#FFCC00]" />
          <div className="flex-1">
            <p className="text-[#FFCC00]">Connecting to AI Server...</p>
            <p className="text-sm text-[#FFCC00]/70">Establishing WebRTC connection with aiortc</p>
          </div>
        </div>
      )}

      <div className="flex gap-6">
        {/* Main Video Stage - 70% */}
        <div className="flex-[7]">
          <div className="bg-[#1A1A1A] border border-[#2C2C2E] rounded-lg overflow-hidden">
            {/* Controls Bar */}
            <div className="bg-[#121212] border-b border-[#2C2C2E] px-4 py-3 flex items-center justify-between">
              <div className="flex items-center gap-4">
                {!active && (
                  <button
                    onClick={onStart}
                    className="flex items-center gap-2 px-4 py-1.5 bg-[#007BFF] hover:bg-[#0066DD] rounded-lg text-white transition-colors"
                    title="Start detection"
                  >
                    START
                  </button>
                )}
                <button
                  onClick={handleStop}
                  className="flex items-center gap-2 px-4 py-1.5 bg-[#FF3B30] hover:bg-[#FF3B30]/80 rounded-lg text-white transition-colors disabled:opacity-50"
                  disabled={!active}
                  title="Stop detection"
                >
                  <StopCircle className="w-4 h-4" />
                  STOP
                </button>

                <div className="flex items-center gap-2">
                  {recording && (
                    <div className="flex items-center gap-2 text-[#FF3B30]">
                      <div className="w-2 h-2 bg-[#FF3B30] rounded-full animate-pulse" />
                      REC
                    </div>
                  )}
                  <div className={`flex items-center gap-2 text-sm ${active && wsConnected ? 'text-[#34C759]' : 'text-gray-500'}`}>
                    {active && wsConnected ? <Wifi className="w-4 h-4" /> : <WifiOff className="w-4 h-4" />}
                    {active ? (wsConnected ? 'Connected' : 'Connecting...') : 'Idle'}
                  </div>
                  <div className="text-sm text-gray-400">
                    Room: {roomId}
                  </div>
                  {source !== 'image' && (
                    <div className={`flex items-center gap-1 text-sm ${gpsActive ? 'text-[#34C759]' : 'text-gray-500'}`}>
                      <div className={`w-2 h-2 rounded-full ${gpsActive ? 'bg-[#34C759]' : 'bg-gray-500'}`} />
                      {gpsActive ? `📍 ${liveCoords.lat.toFixed(4)}, ${liveCoords.lng.toFixed(4)}` : 'GPS inactive'}
                    </div>
                  )}
                </div>
              </div>

              <div className="flex items-center gap-3">
                <span className="text-sm text-gray-400">Threshold</span>
                <input
                  type="range"
                  min="0.50"
                  max="0.99"
                  step="0.01"
                  value={threshold}
                  onChange={(e) => handleThresholdChange(parseFloat(e.target.value))}
                  className="w-32 h-2 bg-[#2C2C2E] rounded-lg appearance-none cursor-pointer slider"
                  title="Adjust detection threshold"
                />
                <div className="w-16 bg-[#1A1A1A] border border-[#2C2C2E] rounded px-2 py-1 text-center text-sm tabular-nums">
                  {threshold.toFixed(2)}
                </div>
              </div>
            </div>

            {/* Video Display */}
            <div
              ref={containerRef}
              data-monitoring-container
              className="relative bg-black flex items-center justify-center w-full overflow-hidden"
              style={{ height: '80vh', minHeight: 360 }}
            >
              {/* Hidden local video (camera input) */}
              <video
                ref={localVideoRef}
                autoPlay
                playsInline
                muted
                className="hidden"
              />

              {/* Remote annotated video (from aiortc server) - for video/live modes */}
              {(source === 'live' || source === 'video') ? (
                <video
                  ref={remoteVideoRef}
                  autoPlay
                  playsInline
                  muted
                  className="absolute inset-0 w-full h-full object-contain"
                />
              ) : source === 'image' && previewUrl ? (
                <>
                  <img
                    ref={imageRef}
                    src={previewUrl}
                    alt="source"
                    className="max-w-full max-h-full object-contain"
                    onLoad={(e) => {
                      const img = e.target as HTMLImageElement;
                      setImageDims({ w: img.naturalWidth, h: img.naturalHeight });
                    }}
                  />
                  {/* Bounding boxes for image mode */}
                  {detections.map((det) => (
                    <BoundingBox
                      key={det.id}
                      detection={det}
                      mediaWidth={imageDims.w || det.img_w || 1280}
                      mediaHeight={imageDims.h || det.img_h || 720}
                    />
                  ))}
                </>
              ) : (
                <div className="text-gray-500">No source</div>
              )}

              {/* FPS display */}
              {rtcFps !== null && (
                <div className="absolute top-4 right-4 bg-black/60 text-white px-3 py-1 rounded">
                  FPS: {rtcFps.toFixed(2)}
                </div>
              )}

            </div>
          </div>
        </div>

        {/* Event Log - 30% */}
        <div className="flex-[3]">
          <EventLog
            detections={detections}
            threshold={threshold}
            wsConnected={wsConnected}
          />
        </div>
      </div>

      <style>{`
        .slider::-webkit-slider-thumb {
          appearance: none;
          width: 16px;
          height: 16px;
          border-radius: 50%;
          background: #007BFF;
          cursor: pointer;
        }
        .slider::-moz-range-thumb {
          width: 16px;
          height: 16px;
          border-radius: 50%;
          background: #007BFF;
          cursor: pointer;
          border: none;
        }
      `}</style>
    </div>
  );
}
