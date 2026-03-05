# API Review — ทุก Endpoint ในทุก Service

## ภาพรวม

โปรเจคมี 3 services ที่มี API endpoints รวม 23 endpoints:

- AI Server (Python FastAPI) port 8001: 4 HTTP endpoints + 1 WebRTC DataChannel
- Rust Backend (Axum) port 8000: 9 endpoints
- Frontend API Routes (Next.js) port 3000: 10 routes ทำหน้าที่ proxy

Request flow ทั่วไปคือ: Browser เรียก Next.js API Route (/api/...) แล้ว Next.js proxy ต่อไปหา Rust Backend หรือ AI Server เพื่อหลีกเลี่ยง CORS

## Service 1: AI Server (Python FastAPI) — Port 8001

ไฟล์: ai/app.py
Framework: FastAPI + aiortc
หน้าที่หลัก: รัน YOLO model detect วัตถุ + จัดการ WebRTC video stream

### GET /health

Method: GET
Path: /health
หน้าที่: เช็คว่า AI server ทำงานอยู่
Parameters: ไม่มี
Response: {"ok": true}
เรียกจาก: Rust Backend (/health/ai)

### GET /ready

Method: GET
Path: /ready
หน้าที่: เช็คว่า YOLO model โหลดเสร็จแล้วและ GPU พร้อมใช้งาน
Parameters: ไม่มี
Response: {"ok": true, "gpu": true}
เรียกจาก: Rust Backend (/health/ai-ready), Docker healthcheck

### POST /v1/detect

Method: POST
Path: /v1/detect
หน้าที่: รับภาพ แล้วรัน YOLO detect ส่ง detection results กลับเป็น JSON
Content-Type: multipart/form-data
เรียกจาก: Rust Backend (/infer, /proxy/detect)

Query Parameters:
- conf (float, default 0.70): confidence threshold ค่า 0.0 ถึง 1.0
- imgsz (int, default 832): ขนาดภาพที่ YOLO ใช้ ค่า 64 ถึง 2048

Request Body:
- file: ไฟล์ภาพ (required)

Response ตัวอย่าง:
```json
{
  "ts": "2026-02-17T00:05:00.123Z",
  "model": "best.pt",
  "fps": 45.2,
  "img_w": 1280,
  "img_h": 720,
  "detections": [
    {
      "cls": "Hammer",
      "conf": 0.93,
      "bbox_xywh": [320, 180, 200, 300],
      "bbox_xywh_norm": [0.25, 0.25, 0.156, 0.416],
      "track_id": null
    }
  ]
}
```

### POST /webrtc/offer

Method: POST
Path: /webrtc/offer
หน้าที่: WebRTC signaling — รับ SDP offer จาก browser สร้าง WebRTC connection (RTCPeerConnection + AnnotatedVideoTrack) แล้วส่ง SDP answer กลับ
Content-Type: application/json
เรียกจาก: Next.js API route (/api/webrtc/offer)

Request Body ตัวอย่าง:
```json
{
  "sdp": "<SDP offer string>",
  "type": "offer",
  "conf": 0.70
}
```

Response ตัวอย่าง:
```json
{
  "sdp": "<SDP answer string>",
  "type": "answer"
}
```

Side effects: สร้าง RTCPeerConnection และ AnnotatedVideoTrack เริ่ม receive video → YOLO detect → ส่ง annotated video กลับ เปิด DataChannel สำหรับส่ง detection metadata

### WebRTC DataChannel "detections" (Non-HTTP)

Protocol: WebRTC DataChannel
หน้าที่: ส่ง detection metadata real-time ทุกเฟรมที่มี detection
ทิศทาง: AI Server ส่งไป Browser (bi-directional)

ข้อมูลที่ AI Server ส่งไป Browser ทุกเฟรมที่มี detection:
```json
{
  "ts": "2026-02-17T00:05:00.123Z",
  "fps": 30.0,
  "img_w": 1280,
  "img_h": 720,
  "frame_id": 150,
  "detections": [
    {
      "cls": "Hammer",
      "conf": 0.93,
      "bbox_xywh": [320, 180, 200, 300],
      "bbox_xywh_norm": [0.25, 0.25, 0.156, 0.416]
    }
  ]
}
```

ข้อมูลที่ Browser ส่งไป AI Server เพื่ออัพเดท config แบบ real-time:
```json
{
  "conf": 0.80
}
```

## Service 2: Rust Backend (Axum) — Port 8000

ไฟล์: backend/src/main.rs + backend/src/db.rs
Framework: Axum + SQLx + Tokio
หน้าที่หลัก: API gateway เชื่อม frontend กับ AI Server และ Database

### GET /health

Method: GET
Path: /health
หน้าที่: เช็คว่า Backend ทำงานอยู่
Response: {"ok": true}

### GET /health/ai

Method: GET
Path: /health/ai
หน้าที่: Proxy เรียก AI Server GET /health เพื่อเช็คว่า AI ทำงานอยู่
Response: {"ok": true} (ส่งต่อจาก AI Server)

### GET /health/ai-ready

Method: GET
Path: /health/ai-ready
หน้าที่: Proxy เรียก AI Server GET /ready เพื่อเช็คว่า YOLO model โหลดเสร็จและ GPU พร้อม
Response: {"ok": true, "gpu": true} (ส่งต่อจาก AI Server)

### GET /health/db

Method: GET
Path: /health/db
หน้าที่: เช็คว่า PostgreSQL เชื่อมต่อได้ โดยรัน SELECT 1
Response: {"ok": true, "db": 1}

### POST /infer

Method: POST
Path: /infer
หน้าที่: รับภาพจาก frontend ส่งต่อไป AI Server POST /v1/detect แล้วบันทึกผลลง DB ถ้า save=true
Content-Type: multipart/form-data

Query Parameters:
- save (bool, default false): บันทึกผลลง DB หรือไม่
- conf (float): confidence threshold
- imgsz (int): image size
- latitude (float, default 0.0): พิกัด GPS latitude
- longitude (float, default 0.0): พิกัด GPS longitude
- source (string, default "monitoring"): แหล่งที่มา
- source_ref (string, default "live_feed"): reference ID
- yaw (float): ทิศทางที่หัน (องศา)

Logic การบันทึก DB (เมื่อ save=true):
1. วน loop ทุก detection ใน response
2. ถ้ามี track_id ให้เช็ค duplicate ใน 10 วินาทีล่าสุด ถ้าซ้ำข้าม
3. get_or_create_class() สร้าง FOD class ถ้ายังไม่มี
4. INSERT INTO events บันทึก event ลง DB

### POST /proxy/detect

Method: POST
Path: /proxy/detect
หน้าที่: เหมือน /infer ทุกอย่าง เป็นอีก path หนึ่งที่ชี้ไปที่ logic เดียวกัน
Content-Type: multipart/form-data
Parameters: เหมือน /infer

### POST /events/ingest

Method: POST
Path: /events/ingest
หน้าที่: รับ detection event จาก frontend (WebRTC mode) แล้วบันทึกลง DB โดยตรง
Content-Type: application/json
เรียกจาก: Next.js API route (/api/events/ingest)

Request Body ตัวอย่าง:
```json
{
  "ts": "2026-02-17T00:05:00.123Z",
  "object_class": "Hammer",
  "object_count": 1,
  "confidence": 0.93,
  "latitude": 13.7563,
  "longitude": 100.5018,
  "source": "monitoring",
  "source_ref": "live_feed",
  "bbox": [320, 180, 200, 300],
  "meta": {"img_w": 1280, "img_h": 720, "frame_id": 150}
}
```

Response: {"id": "uuid-xxx", "status": "success"}

DB Logic:
1. get_or_create_class("Hammer") ถ้าไม่มีใน fod_classes จะ INSERT สร้างใหม่
2. parse timestamp จาก RFC3339 format
3. INSERT INTO events(...) บันทึก event พร้อม UUID, timestamp, GPS, bbox, metadata

### GET /events/recent

Method: GET
Path: /events/recent
หน้าที่: ดึง detection events ล่าสุด เรียงตาม timestamp DESC
เรียกจาก: Next.js API route (/api/events/recent)

Query Parameters:
- limit (int, default 100, max 500): จำนวน rows ที่ต้องการ

Response ตัวอย่าง:
```json
[
  {
    "id": "uuid-xxx",
    "ts": "2026-02-17T00:05:00Z",
    "class_name": "Hammer",
    "object_count": 1,
    "confidence": 0.93,
    "latitude": 13.7563,
    "longitude": 100.5018,
    "source": "monitoring",
    "source_ref": "live_feed"
  }
]
```

SQL ที่ใช้: SELECT e.*, fc.name as class_name FROM events e JOIN fod_classes fc ON e.class_id = fc.id ORDER BY e.ts DESC LIMIT $1

### GET /events/query

Method: GET
Path: /events/query
หน้าที่: query events ตาม class name (filter ได้)
เรียกจาก: Next.js API route (/api/events/query)

Query Parameters:
- class (string, optional): กรองตามชื่อ class เช่น "Hammer"
- limit (int, default 100, max 500): จำนวน rows

Response: เหมือน /events/recent

### GET /dashboard/summary

Method: GET
Path: /dashboard/summary
หน้าที่: ดึงสรุปสถิติ 24 ชั่วโมงล่าสุด สำหรับ Dashboard KPI cards
เรียกจาก: Next.js API route (/api/dashboard/summary)

Response ตัวอย่าง:
```json
{
  "total_24h": 42,
  "avg_conf": 0.87,
  "top_fod": "Hammer"
}
```

SQL ที่ใช้:
- total_24h: SELECT COALESCE(SUM(object_count), 0) FROM events WHERE ts >= NOW() - INTERVAL '24 hours'
- avg_conf: SELECT AVG(confidence) FROM events WHERE ts >= NOW() - INTERVAL '24 hours'
- top_fod: SELECT fc.name FROM events e JOIN fod_classes fc ... GROUP BY fc.name ORDER BY COUNT(*) DESC LIMIT 1

## Service 3: Frontend API Routes (Next.js) — Port 3000

โฟลเดอร์: frontend/src/app/api/
Framework: Next.js App Router
หน้าที่หลัก: ทำหน้าที่เป็น Proxy ส่ง request จาก browser ไปหา Backend หรือ AI Server เพื่อหลีกเลี่ยงปัญหา CORS (Cross-Origin Resource Sharing)

หมายเหตุ: Frontend API Routes ทั้งหมดไม่มี business logic เลย ทำแค่ proxy request ต่อไปให้ Backend หรือ AI Server เท่านั้น

### POST /api/detect

ไฟล์: frontend/src/app/api/detect/route.ts
Proxy ไป: Rust Backend POST /proxy/detect
หน้าที่: ส่งภาพไป detect (Image Mode)
เรียกจาก: RealtimeMonitoring.tsx (Image Mode)
รายละเอียด: อ่าน query params (conf, save) + form data (file, source, roomId, latitude, longitude, yaw) แล้วสร้าง request ใหม่ส่งไป Backend

### POST /api/webrtc/offer

ไฟล์: frontend/src/app/api/webrtc/offer/route.ts
Proxy ไป: AI Server POST /webrtc/offer (ไม่ผ่าน Rust Backend)
หน้าที่: WebRTC signaling — ส่ง SDP offer/answer
เรียกจาก: RealtimeMonitoring.tsx (Live/Video Mode)
หมายเหตุ: Route นี้ proxy ไป AI Server โดยตรง ไม่ผ่าน Rust Backend เพราะ WebRTC signaling ต้องคุยกับ aiortc server ตรงๆ

### POST /api/events/ingest

ไฟล์: frontend/src/app/api/events/ingest/route.ts
Proxy ไป: Rust Backend POST /events/ingest
หน้าที่: บันทึก detection event ลง DB
เรียกจาก: RealtimeMonitoring.tsx (ทุก 10 วินาที/class)

### GET /api/events/recent

ไฟล์: frontend/src/app/api/events/recent/route.ts
Proxy ไป: Rust Backend GET /events/recent
หน้าที่: ดึง events ล่าสุด
Fallback: ถ้า Backend return 404 จะลอง GET /events/query แทน
Timeout: 15 วินาที
เรียกจาก: Dashboard.tsx, DetectionTable.tsx, DetectionChart.tsx

### GET /api/events_recent (duplicate)

ไฟล์: frontend/src/app/api/events_recent/route.ts
Proxy ไป: Rust Backend GET /events/recent
หน้าที่: เหมือน /api/events/recent ทุกอย่าง
หมายเหตุ: Route นี้ซ้ำกับ /api/events/recent น่าจะเป็น legacy route ที่เหลืออยู่ สามารถลบได้

### GET /api/events/query

ไฟล์: frontend/src/app/api/events/query/route.ts
Proxy ไป: Rust Backend GET /events/query
หน้าที่: query events ตาม filter (class, time range)
Timeout: 5 วินาที
เรียกจาก: DetectionTable.tsx

### GET /api/dashboard/summary

ไฟล์: frontend/src/app/api/dashboard/summary/route.ts
Proxy ไป: Rust Backend GET /dashboard/summary
หน้าที่: ดึงสรุป 24 ชม. สำหรับ KPI cards
Timeout: 15 วินาที
Fallback: ถ้า error จะ return {total_24h: 0, avg_conf: 0, top_fod: null}
เรียกจาก: Dashboard.tsx (ทุก 30 วินาที)

### GET /api/health

ไฟล์: frontend/src/app/api/health/route.ts
Proxy ไป: Rust Backend /health + /health/ai + /health/ai-ready + /health/db พร้อมกัน (Promise.all)
หน้าที่: เช็คสถานะทุก service รวมเป็น response เดียว
เรียกจาก: health-context.tsx (ทุก 30 วินาที)

Response ตัวอย่าง:
```json
{
  "api": "online",
  "ai": "online",
  "db": "online"
}
```

### GET /api/events

ไฟล์: frontend/src/app/api/events/route.ts
Proxy: ไม่ proxy — return static JSON
หน้าที่: แสดง list ของ available event endpoints เป็นข้อมูลอ้างอิง

Response:
```json
{
  "ok": true,
  "endpoints": [
    "/api/events/recent?limit=...",
    "/api/events/query?from=ISO&to=ISO&source_ref=..."
  ]
}
```

### GET /api/ping

ไฟล์: frontend/src/app/api/ping/route.ts
Proxy: ไม่ proxy
หน้าที่: Simple ping — เช็คว่า Next.js server ทำงานอยู่

Response: {"ok": true, "ts": 1739750400000}

## สรุปจำนวน Endpoints ทั้งระบบ

AI Server (Python): 4 HTTP endpoints + 1 DataChannel — ทำ YOLO detect + WebRTC
Rust Backend: 9 endpoints — API gateway + Database CRUD
Next.js API Routes: 10 routes — Proxy หลีกเลี่ยง CORS
รวมทั้งหมด: 23 endpoints

## สรุป Request Flow

Browser Component เรียก Next.js API Route (/api/...) ซึ่งเป็น Proxy layer จากนั้น:
- สำหรับ REST API: Next.js proxy ไป Rust Backend แล้ว Rust Backend proxy ไป AI Server /v1/detect หรืออ่าน/เขียน PostgreSQL DB
- สำหรับ WebRTC: Next.js proxy ไป AI Server /webrtc/offer โดยตรง (ไม่ผ่าน Rust Backend)

หมายเหตุ: /api/events_recent เป็น route ที่ซ้ำกับ /api/events/recent สามารถลบออกได้เพื่อลดความสับสน
