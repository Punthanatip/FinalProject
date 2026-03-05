# FOD Detection System — สรุปการทำงานทั้งโปรเจค

## โปรเจคนี้คืออะไร?

ระบบ FOD Detection (Foreign Object Debris) คือระบบตรวจจับวัตถุแปลกปลอม เช่น ค้อน สกรู น็อต เศษโลหะ แบบ real-time ผ่านกล้อง วิดีโอ หรือภาพนิ่ง โดยใช้ AI model ชื่อ YOLO ประมวลผลบน GPU แล้วแสดงผลบน web browser

ระบบประกอบด้วย 4 ส่วนหลัก ทำงานร่วมกันดังนี้:

1. Frontend (Next.js) — หน้าเว็บที่ user ใช้งาน
2. AI Server (Python + FastAPI + YOLO) — ประมวลผล AI detect วัตถุ
3. Backend (Rust + Axum) — API gateway เชื่อมทุกส่วน + จัดการ database
4. Database (PostgreSQL) — เก็บข้อมูล detection events

## สถาปัตยกรรมภาพรวม

ระบบมี 4 ส่วนเชื่อมต่อกันแบบนี้:

- Browser (port 3000) สื่อสารกับ Rust Backend (port 8000) ผ่าน REST API โดยมี Next.js API Routes เป็น proxy
- Browser สื่อสารกับ AI Server (port 8001) ผ่าน WebRTC โดยตรง สำหรับส่งวิดีโอ real-time
- Rust Backend เชื่อมต่อกับ AI Server ผ่าน HTTP สำหรับ image detection
- Rust Backend เชื่อมต่อกับ PostgreSQL สำหรับอ่าน/เขียนข้อมูล

## ส่วนที่ 1: Frontend — Next.js (TypeScript)

Frontend เป็นหน้าเว็บที่ user ใช้งาน สร้างด้วย Next.js framework ใช้ TypeScript เป็นภาษาหลัก อยู่ในโฟลเดอร์ frontend/src

มี 3 หน้าหลัก:

### หน้า Input (InputControl.tsx)
ให้ user เลือกแหล่งวิดีโอ 3 แบบ ได้แก่ Live Camera (เปิดกล้อง webcam), Video File (อัพโหลดไฟล์วิดีโอ), หรือ Image (อัพโหลดภาพนิ่ง) แล้วกดปุ่ม START DETECTION เพื่อเริ่มตรวจจับ

### หน้า Monitoring (RealtimeMonitoring.tsx)
เป็นหน้าหลักสำหรับแสดงวิดีโอ real-time ที่มี bounding box วาดรอบวัตถุที่ detect ได้ มี Event Log แสดงรายการ detection ด้านขวา มี FPS counter มุมบนขวา มีตัวปรับ confidence threshold แบบ slider และมีปุ่ม STOP สำหรับหยุดการตรวจจับ

### หน้า Dashboard (Dashboard.tsx)
แสดงข้อมูลสรุปจาก database ประกอบด้วย KPI Cards (จำนวน detect 24 ชม., avg confidence, FOD type ที่พบบ่อยที่สุด), กราฟ timeline แสดง detection ต่อชั่วโมง, กราฟ distribution แสดงสัดส่วน FOD แต่ละประเภท, แผนที่ Leaflet แสดงตำแหน่ง GPS ของ detection, และตาราง detection history

### Next.js API Routes
Frontend มี API Routes ที่ทำหน้าที่เป็น proxy ส่งต่อ request จาก browser ไปหา Backend หรือ AI Server เพื่อหลีกเลี่ยงปัญหา CORS ได้แก่ /api/detect (ส่งภาพไป detect), /api/webrtc/offer (WebRTC signaling), /api/events/ingest (บันทึก event), /api/events/recent (ดึง event ล่าสุด), /api/dashboard/summary (ดึงสรุป 24 ชม.), /api/health (เช็คสถานะทุก service)

## ส่วนที่ 2: AI Server — FastAPI + YOLO + aiortc (Python)

AI Server อยู่ในไฟล์ ai/app.py เป็นหัวใจหลักของระบบ ทำ 2 งาน:

### งานที่ 1: REST API สำหรับ Image Mode
เมื่อ user อัพโหลดภาพ ระบบจะรับภาพผ่าน endpoint POST /v1/detect แล้วส่งเข้า YOLO model ที่รันบน GPU ได้ผลลัพธ์เป็น JSON ประกอบด้วยชื่อวัตถุ (เช่น Hammer), ค่า confidence (เช่น 0.93), และตำแหน่ง bounding box

### งานที่ 2: WebRTC สำหรับ Video/Live Mode
สำหรับโหมด real-time ระบบใช้ aiortc ซึ่งเป็น WebRTC library สำหรับ Python ขั้นตอนคือ:

1. Browser ส่ง SDP Offer มาที่ POST /webrtc/offer
2. AI Server สร้าง RTCPeerConnection และ AnnotatedVideoTrack
3. ส่ง SDP Answer กลับ → WebRTC connected
4. Browser ส่ง video frame ทุกๆ 33ms (30fps) ผ่าน WebRTC
5. AI Server รับเฟรม แปลงเป็น numpy array ด้วย OpenCV
6. ส่งเข้า YOLO predict บน GPU ด้วย FP16 precision (half=True) ที่ imgsz=640
7. วาด bounding box และ label บนเฟรมด้วย OpenCV (cv2.rectangle, cv2.putText)
8. สีของ bbox ขึ้นกับ confidence: แดง (>=90%), เหลือง (>=75%), น้ำเงิน (<75%)
9. วาด FPS counter มุมบนซ้าย
10. ส่งเฟรมที่วาดแล้วกลับ browser ผ่าน WebRTC
11. ส่ง detection metadata (JSON) ผ่าน DataChannel ไปให้ browser

Class สำคัญคือ AnnotatedVideoTrack ที่สืบทอดจาก VideoStreamTrack ของ aiortc โดย method recv() จะถูกเรียกทุกเฟรม ทำหน้าที่รับเฟรม → process YOLO → วาด bbox → ส่งกลับ

Video codec ที่ใช้คือ VP8 ซึ่งเป็น default ของ WebRTC encode/decode แบบ software บน CPU

## ส่วนที่ 3: Backend — Rust + Axum

Backend อยู่ในไฟล์ backend/src/main.rs และ backend/src/db.rs เขียนด้วยภาษา Rust ใช้ Axum framework รัน port 8000

ทำหน้าที่เป็นตัวกลาง (API gateway) ระหว่าง Frontend กับ AI Server และ Database:

- POST /infer และ POST /proxy/detect: รับภาพจาก frontend ส่งต่อไป AI Server (/v1/detect) แล้วบันทึกผลลง DB ถ้า save=true
- POST /events/ingest: รับ detection event จาก frontend (WebRTC mode) แล้วบันทึกลง DB โดย get_or_create_class() จะสร้าง FOD class ใหม่อัตโนมัติถ้ายังไม่มี
- GET /events/recent: ดึง events ล่าสุดเรียงตาม timestamp DESC
- GET /events/query: query events ตาม class name
- GET /dashboard/summary: ดึงสรุป 24 ชม. (total detections, avg confidence, top FOD type)
- GET /health, /health/ai, /health/ai-ready, /health/db: health check ทุก service

ใช้ SQLx library สำหรับเชื่อมต่อ PostgreSQL แบบ type-safe และ async

## ส่วนที่ 4: Database — PostgreSQL 16 (Docker)

Database รัน PostgreSQL 16 ใน Docker container Schema อยู่ในไฟล์ db/init/02-schema.sql

มี 2 ตาราง:

### ตาราง fod_classes
เก็บประเภทวัตถุ FOD มีฟิลด์ id (serial primary key), name (ชื่อ class เช่น Bolt, Nut, Hammer ไม่ซ้ำกัน), description (คำอธิบาย), created_at (timestamp) มี default classes 12 ประเภท เช่น Bolt, Nut, Screw, Wire, Scrap Metal, Stone, Paper, Plastic, Glass, Cloth, Tire Pieces, Other

### ตาราง events
เก็บ detection events มีฟิลด์ id (UUID primary key), ts (timestamp ที่ detect), class_id (foreign key ไป fod_classes), object_count (จำนวนวัตถุ), confidence (ค่าความมั่นใจ 0-1), latitude/longitude (พิกัด GPS), source (แหล่งที่มา เช่น monitoring), source_ref (reference เช่น live_feed), bbox (bounding box เป็น JSONB), meta (metadata เพิ่มเติมเป็น JSONB)

มี indexes สำหรับ performance: idx_events_ts_desc, idx_events_class_id, idx_events_source_ref

## Flow การทำงาน: Live Mode (กล้อง real-time)

1. User เลือก Live Camera แล้วกด Start
2. Browser เปิดกล้อง getUserMedia 1280x720 30fps
3. Browser สร้าง RTCPeerConnection + DataChannel
4. Browser ส่ง SDP Offer ไป AI Server ผ่าน POST /api/webrtc/offer
5. AI Server สร้าง PeerConnection + AnnotatedVideoTrack แล้วส่ง SDP Answer กลับ
6. WebRTC connected — เริ่มส่งวิดีโอ
7. ทุกเฟรม (30fps): Browser ส่ง video frame → AI Server รับ → YOLO detect บน GPU → วาด bbox → ส่ง annotated frame กลับ + ส่ง detection JSON ผ่าน DataChannel
8. Browser แสดงวิดีโอที่มี bbox + อัพเดท EventLog + แสดง FPS
9. ทุก 10 วินาที/class: Browser ส่ง POST /api/events/ingest ไปบันทึกลง DB
10. Dashboard ดึงข้อมูลจาก DB แสดง KPI กราฟ แผนที่ ตาราง

## Flow การทำงาน: Image Mode (ภาพนิ่ง)

1. User อัพโหลดภาพ
2. Browser ส่ง POST /api/detect (multipart/form-data)
3. Next.js proxy ไป Rust Backend POST /proxy/detect
4. Rust Backend proxy ไป AI Server POST /v1/detect
5. AI Server รัน YOLO predict บน GPU → ส่ง JSON กลับ
6. Browser วาด bounding box บนภาพด้วย BoundingBox component
7. แสดงผลใน EventLog

## Flow การทำงาน: Video Mode (ไฟล์วิดีโอ)

เหมือน Live Mode ทุกอย่าง แต่แทนที่จะเปิดกล้อง จะสร้าง video element โหลดไฟล์วิดีโอ แล้วใช้ captureStream() ดึง stream จากวิดีโอ ส่งเข้า WebRTC pipeline เหมือน Live Mode

## Tech Stack

- Frontend: Next.js + TypeScript (port 3000)
- Backend: Rust + Axum + SQLx (port 8000)
- AI: Python + FastAPI + YOLO + aiortc (port 8001)
- Database: PostgreSQL 16 (port 5432, Docker)
- Infrastructure: Docker Compose
- Video Codec: VP8 (WebRTC default)
- AI Model: YOLOv8 custom trained (best.pt, FP16 on GPU)
- Map: Leaflet.js
