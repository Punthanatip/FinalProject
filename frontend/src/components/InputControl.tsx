import { useState, useEffect, useRef } from 'react';
import { Upload, Video, Radio as RadioIcon, PlayCircle } from 'lucide-react';
import { toast } from 'sonner';

interface InputControlProps {
  onStartDetection: (config: any) => void;
}

type SourceType = 'image' | 'video' | 'live';

export function InputControl({ onStartDetection }: InputControlProps) {
  const [sourceType, setSourceType] = useState<SourceType>('image');
  const [file, setFile] = useState<File | null>(null);
  const [roomId, setRoomId] = useState('');
  const [latitude, setLatitude] = useState('13.6900');
  const [longitude, setLongitude] = useState('100.7500');
  const [yaw, setYaw] = useState('92.3');
  const [threshold, setThreshold] = useState(0.70);
  const [isLoading, setIsLoading] = useState(false);
  const [loadingTime, setLoadingTime] = useState(0);
  const [hasCamera, setHasCamera] = useState(false);
  const [liveStream, setLiveStream] = useState<MediaStream | null>(null);
  const liveVideoRef = useRef<HTMLVideoElement>(null);
  const [gpsStatus, setGpsStatus] = useState<'loading' | 'success' | 'denied' | 'unavailable'>('loading');

  // Auto-fill GPS coordinates on mount
  useEffect(() => {
    if (!("geolocation" in navigator)) {
      setGpsStatus('unavailable');
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLatitude(pos.coords.latitude.toFixed(6));
        setLongitude(pos.coords.longitude.toFixed(6));
        setGpsStatus('success');
      },
      (err) => {
        console.warn('GPS error:', err.message);
        setGpsStatus(err.code === 1 ? 'denied' : 'unavailable');
        // Keep default Suvarnabhumi coordinates as fallback
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  }, []);

  useEffect(() => {
    if (sourceType !== 'live') return;
    const existing = (typeof window !== 'undefined') ? (window as any).__liveStream as MediaStream | undefined : undefined;
    if (existing && liveVideoRef.current) {
      try { liveVideoRef.current.srcObject = existing; } catch { }
      setLiveStream(existing);
      setHasCamera(true);
    }
  }, [sourceType]);

  const connectLiveCamera = async () => {
    try {
      const ms = await navigator.mediaDevices.getUserMedia({ video: { width: { ideal: 1280 }, height: { ideal: 720 } } });
      setLiveStream(ms);
      setHasCamera(true);
      if (liveVideoRef.current) {
        try { liveVideoRef.current.srcObject = ms; } catch { }
      }
      try { (window as any).__liveStream = ms; } catch { }
      toast.success('Camera connected');
    } catch {
      setHasCamera(false);
      toast.error('Camera access denied', { description: 'Please allow camera access to use live detection.' });
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const uploadedFile = e.target.files?.[0];
    if (uploadedFile) {
      const validTypes = sourceType === 'image'
        ? ['image/jpeg', 'image/png', 'image/jpg']
        : ['video/mp4', 'video/avi', 'video/mov'];

      if (!validTypes.includes(uploadedFile.type)) {
        toast.error('Invalid file type', {
          description: `Please upload a valid ${sourceType} file.`
        });
        return;
      }
      setFile(uploadedFile);
      toast.success('File ready', {
        description: `${uploadedFile.name} (${(uploadedFile.size / 1024).toFixed(1)} KB)`
      });
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const droppedFile = e.dataTransfer.files[0];
    if (droppedFile) {
      setFile(droppedFile);
      toast.success('File ready', {
        description: `${droppedFile.name} (${(droppedFile.size / 1024).toFixed(1)} KB)`
      });
    }
  };

  const isValid = () => {
    if (sourceType === 'live') {
      return roomId && latitude && longitude && yaw && hasCamera;
    }
    return file && latitude && longitude && yaw;
  };

  const handleStartDetection = async () => {
    if (!isValid()) return;
    // Image: upload once to backend for detection preview; Video/Live: skip upload, process client-side
    if (sourceType === 'image') {
      setIsLoading(true);
      setLoadingTime(0);
      const startTime = Date.now();
      const timer = setInterval(() => {
        setLoadingTime(Date.now() - startTime);
      }, 10);
      try {
        const form = new FormData();
        form.append('source', sourceType);
        if (file) form.append('file', file);
        form.append('latitude', latitude);
        form.append('longitude', longitude);
        form.append('yaw', yaw);
        form.append('threshold', String(threshold));
        form.append('save', 'true');
        const res = await fetch('/api/detect', { method: 'POST', body: form });
        if (!res.ok) throw new Error(await res.text());
        clearInterval(timer);
        const cfgRoomId = `file-${Date.now()}`;
        const config = {
          source: sourceType,
          file,
          roomId: cfgRoomId,
          latitude: parseFloat(latitude),
          longitude: parseFloat(longitude),
          yaw: parseFloat(yaw),
          threshold
        };
        try {
          const json = await res.json();
          sessionStorage.setItem(`det:${cfgRoomId}`, JSON.stringify(json));
        } catch { }
        toast.success('Detection started', {
          description: `Processing ${file?.name} with threshold ${threshold.toFixed(2)}`
        });
        onStartDetection(config);
      } catch (error) {
        clearInterval(timer);
        toast.error('Detection failed', {
          description: error instanceof Error ? error.message : 'Unknown error occurred'
        });
      } finally {
        setIsLoading(false);
      }
    } else {
      // Video or Live: avoid uploading entire file; navigate to monitoring and process frames
      const cfgRoomId = sourceType === 'live' ? roomId : `file-${Date.now()}`;
      const config = {
        source: sourceType,
        file,
        roomId: cfgRoomId,
        latitude: parseFloat(latitude),
        longitude: parseFloat(longitude),
        yaw: parseFloat(yaw),
        threshold
      };
      toast.success('Starting real-time detection', {
        description: sourceType === 'live' ? 'Live camera' : (file ? `Video: ${file.name}` : 'Video')
      });
      onStartDetection(config);
    }
  };

  return (
    <div className="px-8 py-6 max-w-7xl mx-auto">
      <div className="bg-[#1A1A1A] border border-[#2C2C2E] rounded-lg p-8">
        <h2 className="text-xl mb-6">Configure Detection Source</h2>

        {/* Source Tabs */}
        <div className="flex gap-2 mb-6 border-b border-[#2C2C2E]">
          <button
            onClick={() => setSourceType('image')}
            className={`flex items-center gap-2 px-4 py-2 border-b-2 transition-colors ${sourceType === 'image'
              ? 'border-[#007BFF] text-white'
              : 'border-transparent text-gray-400 hover:text-white'
              }`}
            title="Upload single image for detection"
          >
            <Upload className="w-4 h-4" />
            Image
          </button>
          <button
            onClick={() => setSourceType('video')}
            className={`flex items-center gap-2 px-4 py-2 border-b-2 transition-colors ${sourceType === 'video'
              ? 'border-[#007BFF] text-white'
              : 'border-transparent text-gray-400 hover:text-white'
              }`}
            title="Upload video file for frame-by-frame detection"
          >
            <Video className="w-4 h-4" />
            Video
          </button>
          <button
            onClick={() => setSourceType('live')}
            className={`flex items-center gap-2 px-4 py-2 border-b-2 transition-colors ${sourceType === 'live'
              ? 'border-[#007BFF] text-white'
              : 'border-transparent text-gray-400 hover:text-white'
              }`}
            title="Connect to live camera feed via WebSocket"
          >
            <RadioIcon className="w-4 h-4" />
            Live Camera
          </button>
        </div>

        {/* File Upload or Camera Selection */}
        {sourceType !== 'live' ? (
          <div className="mb-6">
            <label className="block text-sm text-gray-400 mb-2">
              Upload {sourceType === 'image' ? 'Image' : 'Video'}
            </label>
            <div
              onDragOver={handleDragOver}
              onDrop={handleDrop}
              className="border-2 border-dashed border-[#2C2C2E] rounded-lg p-8 text-center hover:border-[#007BFF] transition-colors cursor-pointer"
              onClick={() => document.getElementById('file-input')?.click()}
            >
              <Upload className="w-12 h-12 mx-auto mb-3 text-gray-500" />
              {file ? (
                <div>
                  <p className="text-white">{file.name}</p>
                  <p className="text-sm text-gray-400">{(file.size / 1024).toFixed(1)} KB • Ready</p>
                </div>
              ) : (
                <div>
                  <p className="text-gray-400">Drag and drop or click to upload</p>
                  <p className="text-sm text-gray-500 mt-1">
                    {sourceType === 'image' ? 'JPEG, PNG' : 'MP4, AVI, MOV'}
                  </p>
                </div>
              )}
            </div>
            <input
              id="file-input"
              type="file"
              className="hidden"
              accept={sourceType === 'image' ? 'image/*' : 'video/*'}
              onChange={handleFileUpload}
            />
          </div>
        ) : (
          <div className="space-y-4 mb-6">
            <div>
              <label className="block text-sm text-gray-400 mb-2" title="Connect your live camera">
                Live Camera
              </label>
              <div className="flex items-center gap-3">
                <button
                  onClick={connectLiveCamera}
                  className="flex items-center gap-2 px-4 py-2 bg-[#007BFF] hover:bg-[#0066DD] rounded-lg text-white"
                  title="Connect camera"
                >
                  Connect
                </button>
                <span className={`text-sm ${hasCamera ? 'text-[#34C759]' : 'text-gray-500'}`}>{hasCamera ? 'Camera Ready' : 'No camera'}</span>
              </div>
              <div className="mt-3 bg-black border border-[#2C2C2E] rounded-lg overflow-hidden w-full max-w-xl h-48 flex items-center justify-center">
                {hasCamera ? (
                  <video ref={liveVideoRef} autoPlay playsInline muted className="w-full h-full object-contain" />
                ) : (
                  <span className="text-gray-500">Connect camera to preview</span>
                )}
              </div>
            </div>
            <div>
              <label className="block text-sm text-gray-400 mb-2" title="Field: room_id | WS Endpoint: /ws/:room_id">
                Room ID (WebSocket)
              </label>
              <input
                type="text"
                value={roomId}
                onChange={(e) => setRoomId(e.target.value)}
                placeholder="e.g., runway-01L-monitoring"
                className="w-full bg-[#121212] border border-[#2C2C2E] rounded-lg px-4 py-2 text-white placeholder-gray-600 focus:outline-none focus:border-[#007BFF]"
              />
            </div>
          </div>
        )}

        {/* Metadata Inputs */}
        <div className="mb-4 flex items-center gap-2">
          <span className="text-sm text-gray-400">GPS Status:</span>
          {gpsStatus === 'loading' && (
            <span className="text-yellow-400 text-sm flex items-center gap-1">
              <div className="w-2 h-2 bg-yellow-400 rounded-full animate-pulse" />
              Detecting location...
            </span>
          )}
          {gpsStatus === 'success' && (
            <span className="text-[#34C759] text-sm flex items-center gap-1">
              <div className="w-2 h-2 bg-[#34C759] rounded-full" />
              Live GPS
            </span>
          )}
          {gpsStatus === 'denied' && (
            <span className="text-orange-400 text-sm flex items-center gap-1">
              <div className="w-2 h-2 bg-orange-400 rounded-full" />
              GPS denied (using default)
            </span>
          )}
          {gpsStatus === 'unavailable' && (
            <span className="text-gray-500 text-sm flex items-center gap-1">
              <div className="w-2 h-2 bg-gray-500 rounded-full" />
              GPS unavailable (using default)
            </span>
          )}
        </div>
        <div className="grid grid-cols-3 gap-4 mb-6">
          <div>
            <label className="block text-sm text-gray-400 mb-2" title="Field: lat | Required for geolocation">
              Latitude
            </label>
            <input
              type="number"
              step="0.0001"
              value={latitude}
              onChange={(e) => setLatitude(e.target.value)}
              className="w-full bg-[#121212] border border-[#2C2C2E] rounded-lg px-4 py-2 text-white focus:outline-none focus:border-[#007BFF]"
            />
          </div>
          <div>
            <label className="block text-sm text-gray-400 mb-2" title="Field: lon | Required for geolocation">
              Longitude
            </label>
            <input
              type="number"
              step="0.0001"
              value={longitude}
              onChange={(e) => setLongitude(e.target.value)}
              className="w-full bg-[#121212] border border-[#2C2C2E] rounded-lg px-4 py-2 text-white focus:outline-none focus:border-[#007BFF]"
            />
          </div>
          <div>
            <label className="block text-sm text-gray-400 mb-2" title="Field: yaw | Camera orientation in degrees">
              Yaw (°)
            </label>
            <input
              type="number"
              step="0.1"
              value={yaw}
              onChange={(e) => setYaw(e.target.value)}
              className="w-full bg-[#121212] border border-[#2C2C2E] rounded-lg px-4 py-2 text-white focus:outline-none focus:border-[#007BFF]"
            />
          </div>
        </div>

        {/* Start Button */}
        <button
          onClick={handleStartDetection}
          disabled={!isValid() || isLoading}
          className="w-full bg-[#007BFF] hover:bg-[#0066DD] disabled:bg-[#2C2C2E] disabled:text-gray-600 text-white py-3 rounded-lg flex items-center justify-center gap-2 transition-colors"
          title="POST /api/detect with multipart form data"
        >
          {isLoading ? (
            <>
              <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
              Processing... {loadingTime}ms
            </>
          ) : (
            <>
              <PlayCircle className="w-5 h-5" />
              START DETECTION
            </>
          )}
        </button>
      </div>

      <style>{`
        .slider::-webkit-slider-thumb {
          appearance: none;
          width: 20px;
          height: 20px;
          border-radius: 50%;
          background: #007BFF;
          cursor: pointer;
        }
        .slider::-moz-range-thumb {
          width: 20px;
          height: 20px;
          border-radius: 50%;
          background: #007BFF;
          cursor: pointer;
          border: none;
        }
      `}</style>
    </div>
  );
}