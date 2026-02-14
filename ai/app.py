"""
AI Detection Service with WebRTC Video Track support
- REST API endpoints for image detection (FastAPI)
- WebRTC endpoint for real-time video streaming with server-side rendering (aiortc)
"""

import json
import asyncio
import logging
from pathlib import Path
from typing import List
from time import perf_counter
from datetime import datetime

import cv2
import numpy as np
import torch
from fastapi import FastAPI, File, UploadFile, HTTPException, Query, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel
from ultralytics import YOLO

# aiortc imports for WebRTC
from aiortc import RTCPeerConnection, RTCSessionDescription, VideoStreamTrack, RTCRtpSender
from aiortc.contrib.media import MediaRelay
from av import VideoFrame

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# ==================== Device & Model Setup ====================

DEVICE = 0 if torch.cuda.is_available() else "cpu"
try:
    torch.backends.cudnn.benchmark = True   
except Exception:
    pass

DEFAULT_MODEL = Path(__file__).parent / "models" / "best.pt"
MODEL_PATH = DEFAULT_MODEL
MODEL_NAME = MODEL_PATH.name
model = None
READY = False

# ==================== Pydantic Models ====================

class Detection(BaseModel):
    cls: str
    conf: float
    bbox_xywh: List[float]
    bbox_xywh_norm: List[float]
    track_id: str | None = None

class DetectionResponse(BaseModel):
    ts: str
    model: str
    fps: float
    img_w: int
    img_h: int
    detections: List[Detection]



# ==================== FastAPI App ====================

app = FastAPI(title="AI Detection Service")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# ==================== WebRTC State ====================

pcs = set()  # Active peer connections
relay = MediaRelay()


# ==================== Annotated Video Track ====================

class AnnotatedVideoTrack(VideoStreamTrack):
    """
    Video track that receives frames, processes with YOLO,
    draws bounding boxes, and returns annotated frames.
    """
    
    kind = "video"
    
    def __init__(self, source_track, data_channel=None, config_holder=None):
        super().__init__()
        self.source = source_track
        self.data_channel = data_channel
        # Use config_holder for real-time threshold updates
        self.config_holder = config_holder or {"conf_threshold": 0.70}
        self._frame_count = 0
        self._start_time = None
    
    @property
    def conf_threshold(self):
        """Get current conf_threshold from config_holder for real-time updates"""
        return self.config_holder.get("conf_threshold", 0.70)
        
    def get_severity_color(self, confidence: float) -> tuple:
        """Get BGR color based on confidence level."""
        if confidence >= 0.90:
            return (0, 59, 255)   # Red (BGR) - Critical
        elif confidence >= 0.75:
            return (0, 204, 255)  # Yellow (BGR) - Warning
        else:
            return (255, 123, 0)  # Blue (BGR) - Normal
    def _process_frame_sync(self, img, conf_threshold):
        """Synchronous YOLO processing - runs in thread pool to avoid blocking."""
        h, w = img.shape[:2]
        detections_list = []
        
        if model is not None and READY:
            try:
                results = model.predict(
                    img, 
                    conf=conf_threshold, 
                    imgsz=640,
                    verbose=False, 
                    device=DEVICE,
                    half=True  # FP16 inference - ~30% faster on GPU
                )
                
                for box in results[0].boxes:
                    x1, y1, x2, y2 = map(int, box.xyxy[0].tolist())
                    cls_id = int(box.cls.item())
                    cls_name = results[0].names.get(cls_id, str(cls_id))
                    conf = float(box.conf.item())
                    
                    color = self.get_severity_color(conf)
                    cv2.rectangle(img, (x1, y1), (x2, y2), color, 2)
                    
                    label = f"{cls_name} {conf:.0%}"
                    (label_w, label_h), baseline = cv2.getTextSize(
                        label, cv2.FONT_HERSHEY_SIMPLEX, 0.6, 2
                    )
                    cv2.rectangle(
                        img, 
                        (x1, y1 - label_h - baseline - 5), 
                        (x1 + label_w + 5, y1), 
                        color, -1
                    )
                    cv2.putText(
                        img, label, (x1 + 2, y1 - 5),
                        cv2.FONT_HERSHEY_SIMPLEX, 0.6, (255, 255, 255), 2
                    )
                    
                    detections_list.append({
                        "cls": cls_name,
                        "conf": conf,
                        "bbox_xywh": [x1, y1, x2 - x1, y2 - y1],
                        "bbox_xywh_norm": [x1/w, y1/h, (x2-x1)/w, (y2-y1)/h],
                    })
            except Exception as e:
                logger.error(f"Detection error: {e}")
        
        return img, detections_list, w, h
    
    async def recv(self):
        """Receive frame, process in thread, annotate, and return."""
        t0 = perf_counter()
        frame = await self.source.recv()
        t1 = perf_counter()
        
        if self._start_time is None:
            self._start_time = perf_counter()
        
        # Convert frame to numpy array (BGR for OpenCV)
        img = frame.to_ndarray(format="bgr24")
        t2 = perf_counter()
        
        # Run YOLO in thread pool to avoid blocking event loop
        img, detections_list, w, h = await asyncio.to_thread(
            self._process_frame_sync, img, self.conf_threshold
        )
        t3 = perf_counter()
        
        # Calculate FPS
        self._frame_count += 1
        elapsed = perf_counter() - self._start_time
        fps = self._frame_count / elapsed if elapsed > 0 else 0
        
        # Draw FPS on frame
        cv2.putText(
            img, f"FPS: {fps:.1f}", (10, 30),
            cv2.FONT_HERSHEY_SIMPLEX, 0.8, (0, 255, 0), 2
        )
        
        # Send detection metadata via DataChannel
        # data_channel is a holder dict {"channel": RTCDataChannel or None}
        if self.data_channel and detections_list:
            channel = self.data_channel.get("channel") if isinstance(self.data_channel, dict) else self.data_channel
            try:
                if channel and channel.readyState == "open":
                    metadata = {
                        "ts": datetime.utcnow().isoformat(timespec="milliseconds") + "Z",
                        "fps": fps,
                        "img_w": w,
                        "img_h": h,
                        "frame_id": self._frame_count,
                        "detections": detections_list
                    }
                    channel.send(json.dumps(metadata))
            except Exception as e:
                logger.warning(f"DataChannel send error: {e}")
        
        # Ensure minimum resolution of 720p for better quality
        MIN_HEIGHT = 720
        if h < MIN_HEIGHT:
            scale = MIN_HEIGHT / h
            new_w = int(w * scale)
            new_h = MIN_HEIGHT
            img = cv2.resize(img, (new_w, new_h), interpolation=cv2.INTER_LINEAR)
            if self._frame_count <= 1:
                logger.info(f"Upscaled frame from {w}x{h} to {new_w}x{new_h}")
        
        # Convert back to VideoFrame with proper pts
        new_frame = VideoFrame.from_ndarray(img, format="bgr24")
        new_frame.pts = frame.pts
        new_frame.time_base = frame.time_base
        t4 = perf_counter()
        
        # Performance timing log every 30 frames
        if self._frame_count % 30 == 0:
            logger.info(
                f"⏱ Frame #{self._frame_count} | "
                f"recv: {(t1-t0)*1000:.1f}ms | "
                f"convert: {(t2-t1)*1000:.1f}ms | "
                f"yolo: {(t3-t2)*1000:.1f}ms | "
                f"post: {(t4-t3)*1000:.1f}ms | "
                f"total: {(t4-t0)*1000:.1f}ms | "
                f"= {1000/(t4-t0):.1f} FPS"
            )
        
        return new_frame

# ==================== Startup/Shutdown Events ====================

@app.on_event("startup")
def load_model_startup():
    global model, READY
    try:
        model = YOLO(MODEL_PATH)
        _ = model.predict(
            np.zeros((64, 64, 3), dtype=np.uint8),
            imgsz=64, conf=0.01, verbose=False, device=DEVICE
        )
        READY = True
        logger.info(f"Model loaded on device={DEVICE}, CUDA={torch.cuda.is_available()}")
        if torch.cuda.is_available():
            logger.info(f"GPU: {torch.cuda.get_device_name(0)}")
    except Exception as e:
        READY = False
        logger.error(f"Failed to load model: {e}")

@app.on_event("shutdown")
async def shutdown_event():
    # Close all peer connections
    coros = [pc.close() for pc in pcs]
    await asyncio.gather(*coros)
    pcs.clear()

# ==================== Health Endpoints ====================

@app.get("/health")
def health():
    return {"ok": True}

@app.get("/ready")
def ready():
    return {"ok": READY, "gpu": torch.cuda.is_available()}

# ==================== REST API Endpoints (Image Mode) ====================

@app.post("/v1/detect", response_model=DetectionResponse)
async def detect(
    file: UploadFile = File(...),
    conf: float = Query(0.70, ge=0.0, le=1.0),
    imgsz: int = Query(832, ge=64, le=2048),
):
    if not READY or model is None:
        raise HTTPException(status_code=503, detail="Model not ready")

    contents = await file.read()
    nparr = np.frombuffer(contents, np.uint8)
    img = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
    if img is None:
        raise HTTPException(status_code=400, detail="Invalid image file")

    t0 = perf_counter()
    try:
        res = model.predict(img, conf=conf, imgsz=imgsz, verbose=False, device=DEVICE)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"inference error: {e}")
    r = res[0]

    detections: List[Detection] = []
    h, w = img.shape[:2]
    if getattr(r, "boxes", None) is not None and len(r.boxes) > 0:
        names = r.names or {}
        for b in r.boxes:
            conf_v = float(b.conf.item())
            cls_id = int(b.cls.item())
            x1, y1, x2, y2 = [float(v) for v in b.xyxy[0].tolist()]
            detections.append(Detection(
                cls=names.get(cls_id, str(cls_id)),
                conf=conf_v,
                bbox_xywh=[x1, y1, x2 - x1, y2 - y1],
                bbox_xywh_norm=[x1 / w, y1 / h, (x2 - x1) / w, (y2 - y1) / h]
            ))

    dt = perf_counter() - t0
    fps = (1.0 / dt) if dt > 0 else 0.0

    return DetectionResponse(
        ts=datetime.utcnow().isoformat(timespec="milliseconds") + "Z",
        model=MODEL_NAME,
        fps=fps,
        img_w=w,
        img_h=h,
        detections=detections
    )


# ==================== WebRTC Endpoint (Video/Live Mode) ====================

@app.post("/webrtc/offer")
async def webrtc_offer(request: Request):
    """
    WebRTC signaling endpoint.
    Receives SDP offer, creates peer connection with annotated video track,
    and returns SDP answer.
    """
    try:
        params = await request.json()
    except:
        raise HTTPException(status_code=400, detail="Invalid JSON")
    
    offer_sdp = params.get("sdp", "")
    offer_type = params.get("type", "offer")
    conf_threshold = float(params.get("conf", 0.25))
    
    if not offer_sdp:
        raise HTTPException(status_code=400, detail="Missing SDP")
    
    offer_desc = RTCSessionDescription(sdp=offer_sdp, type=offer_type)
    
    pc = RTCPeerConnection()
    pcs.add(pc)
    
    # Store data channel reference to use in AnnotatedVideoTrack
    data_channel_holder = {"channel": None}
    
    # Store config that can be updated in real-time
    config_holder = {"conf_threshold": conf_threshold}
    
    # Receive DataChannel created by browser
    @pc.on("datachannel")
    def on_datachannel(channel):
        logger.info(f"Received DataChannel: {channel.label}")
        data_channel_holder["channel"] = channel
        
        @channel.on("open")
        def on_open():
            logger.info(f"DataChannel '{channel.label}' opened")
        
        @channel.on("close")
        def on_close():
            logger.info(f"DataChannel '{channel.label}' closed")
        
        # Handle incoming config updates from browser
        @channel.on("message")
        def on_message(message):
            try:
                data = json.loads(message)
                if "conf" in data:
                    new_conf = float(data["conf"])
                    config_holder["conf_threshold"] = new_conf
                    logger.info(f"Updated conf_threshold to {new_conf}")
            except Exception as e:
                logger.warning(f"Failed to parse config message: {e}")
    
    @pc.on("connectionstatechange")
    async def on_connectionstatechange():
        logger.info(f"Connection state: {pc.connectionState}")
        if pc.connectionState == "failed" or pc.connectionState == "closed":
            await pc.close()
            pcs.discard(pc)
    
    @pc.on("track")
    def on_track(track):
        logger.info(f"Received track: {track.kind}")
        
        if track.kind == "video":
            # Create annotated video track with config_holder for real-time updates
            annotated_track = AnnotatedVideoTrack(
                relay.subscribe(track),
                data_channel=data_channel_holder,
                config_holder=config_holder  # Pass config holder for real-time threshold updates
            )
            sender = pc.addTrack(annotated_track)
            
            # Force H.264 codec on ALL video transceivers (more aggressive)
            try:
                capabilities = RTCRtpSender.getCapabilities("video")
                if capabilities and capabilities.codecs:
                    # Filter to keep ONLY H.264 codecs (exclude VP8/VP9)
                    h264_codecs = [c for c in capabilities.codecs if "h264" in c.mimeType.lower()]
                    if h264_codecs:
                        for transceiver in pc.getTransceivers():
                            if transceiver.kind == "video":
                                transceiver.setCodecPreferences(h264_codecs)
                                logger.info("🚀 Forced H.264 as ONLY codec for video transceiver")
            except Exception as e:
                logger.warning(f"Could not set H.264 preference: {e}")
            
            @track.on("ended")
            async def on_ended():
                logger.info("Track ended")
    
    await pc.setRemoteDescription(offer_desc)
    answer = await pc.createAnswer()
    
    # setCodecPreferences already configured H.264 - just use the answer directly
    await pc.setLocalDescription(answer)
    
    # Wait for ICE gathering to complete
    while pc.iceGatheringState != "complete":
        await asyncio.sleep(0.1)
    
    return JSONResponse({
        "sdp": pc.localDescription.sdp,
        "type": pc.localDescription.type
    })
