# API ทั้งหมดที่ใช้สื่อสารในโปรเจค FOD Detection

## ภาพรวม

โปรเจค FOD Detection มีการสื่อสารระหว่างส่วนต่างๆ ของระบบผ่าน 4 ช่องทางหลัก ได้แก่ HTTP REST API, WebRTC protocol, WebRTC DataChannel และ PostgreSQL database protocol ระบบแบ่งออกเป็น 3 service หลักที่ expose API คือ AI Server (Python FastAPI) ที่ port 8001, Rust Backend (Axum) ที่ port 8000 และ Next.js API Routes ที่ port 3000

---

## AI Server API (Python FastAPI — port 8001)

AI Server เป็นส่วนที่รัน YOLO model และจัดการ WebRTC connection มี API ดังนี้

**GET /health** ใช้สำหรับตรวจสอบว่า AI Server ยังทำงานอยู่หรือไม่ ส่ง response กลับเป็น JSON ที่มีแค่ {"ok": true} เรียกใช้งานโดย Rust Backend เพื่อรายงานสถานะระบบให้ Frontend ทราบ

**GET /ready** ใช้ตรวจสอบว่า YOLO model โหลดเสร็จแล้วและ GPU พร้อมทำงานหรือไม่ ส่ง response กลับเป็น {"ok": true, "gpu": true} โดย gpu จะเป็น true ถ้าพบ CUDA GPU ในระบบ เรียกใช้งานโดย Rust Backend เพื่อแจ้ง Frontend ว่าระบบพร้อมรับงานแล้ว

**POST /v1/detect** เป็น REST endpoint สำหรับ Image Mode รับไฟล์ภาพผ่าน multipart/form-data พร้อม query parameters ได้แก่ conf (confidence threshold ค่าระหว่าง 0 ถึง 1 default 0.70) และ imgsz (ขนาดที่ YOLO ใช้ประมวลผล default 832) AI Server รัน YOLO model บน GPU แล้วส่ง JSON response กลับที่มีข้อมูล timestamp, model name, fps, ขนาดภาพ และรายการ detections แต่ละรายการมี class name, confidence score, bounding box coordinates ทั้งแบบ pixel และแบบ normalized (0 ถึง 1)

**POST /webrtc/offer** เป็น WebRTC signaling endpoint รับ SDP offer จาก browser ผ่าน JSON ที่มีฟิลด์ sdp (SDP offer string), type ("offer") และ conf (confidence threshold) AI Server สร้าง RTCPeerConnection ด้วย aiortc library, สร้าง AnnotatedVideoTrack ที่จะรับ video frame ประมวลผลด้วย YOLO และส่งกลับ จากนั้น patch SDP answer เพื่อเพิ่ม video bitrate เป็น 12 Mbps แล้วส่ง SDP answer กลับมาเป็น JSON ที่มีฟิลด์ sdp และ type การ exchange SDP นี้เรียกว่า WebRTC signaling และเกิดขึ้นครั้งเดียวตอน connect

**WebRTC DataChannel "detections"** เป็นช่องทางส่งข้อมูล JSON แบบ real-time คู่กับ video stream AI Server ส่ง detection metadata ไปยัง browser ทุกเฟรมที่มีการ detect วัตถุ ข้อมูลที่ส่งประกอบด้วย timestamp, FPS, ขนาดภาพ, frame ID และรายการ detections ในทางกลับกัน browser สามารถส่ง JSON กลับมาเพื่ออัพเดท confidence threshold แบบ real-time โดยไม่ต้อง reconnect WebRTC ใหม่ เช่น {"conf": 0.80}

---

## Rust Backend API (Axum — port 8000)

Rust Backend ทำหน้าที่ API gateway ไม่ได้รัน AI โดยตรง รู้แค่ที่อยู่ของ AI Server จาก environment variable AI_BASE_URL

**GET /health** ตรวจสอบว่า Rust Backend ทำงานอยู่ ส่งกลับ {"ok": true}

**GET /health/ai** Rust Backend เรียก AI Server GET /health แล้วส่งผลกลับไปให้ Frontend ทำให้ Frontend รู้ว่า AI Server ทำงานอยู่หรือไม่โดยไม่ต้องเรียก AI Server โดยตรง

**GET /health/ai-ready** Rust Backend เรียก AI Server GET /ready แล้วส่งผลกลับ ใช้บอกว่า YOLO model โหลดเสร็จพร้อมรับงานหรือยัง

**GET /health/db** ทดสอบ database connection ด้วย SELECT 1 ส่งกลับ {"ok": true, "db": 1} ถ้า database เชื่อมต่อได้

**POST /proxy/detect** endpoint หลักสำหรับ Image Mode รับไฟล์ภาพ (multipart/form-data) พร้อม query parameters ได้แก่ save (boolean บอกว่าจะบันทึกลง DB หรือไม่), conf, imgsz, latitude, longitude, yaw (ทิศทาง), source และ source_ref Rust ส่งภาพต่อไปยัง AI Server POST /v1/detect ได้ผล detection กลับมาแล้วถ้า save เป็น true จะบันทึกทุก detection ลงฐานข้อมูลโดยมีการตรวจสอบ duplicate ก่อน

**POST /events/ingest** รับ detection event จาก Browser (WebRTC mode) เป็น JSON ที่มีข้อมูล timestamp, object_class, object_count, confidence, latitude, longitude, source, source_ref, bbox และ meta บันทึกลงฐานข้อมูลโดยใช้ get_or_create_class() สร้าง FOD class ใหม่อัตโนมัติถ้ายังไม่มีในระบบ ส่ง response กลับเป็น {"id": "uuid", "status": "success"}

**GET /events/recent** ดึง detection events ล่าสุดจากฐานข้อมูลเรียงตาม timestamp จากใหม่ไปเก่า รับ query parameter limit (default 100 สูงสุด 500) ส่งกลับรายการที่มีข้อมูล id, timestamp, class_name, object_count, confidence, latitude, longitude, source, source_ref

**GET /events/query** ดึง detection events พร้อม filter ตาม class name รับ query parameters class (ชื่อ FOD class เช่น Hammer) และ limit ถ้าไม่ระบุ class จะดึงทั้งหมดเหมือน /events/recent

**GET /dashboard/summary** ดึงสถิติสรุปจาก 24 ชั่วโมงล่าสุด ส่งกลับ total_24h (จำนวน detections รวม), avg_conf (ค่าเฉลี่ย confidence) และ top_fod (FOD type ที่พบมากที่สุด)

---

## Next.js API Routes (port 3000)

Next.js API Routes ทั้งหมดทำหน้าที่เป็น proxy เท่านั้น ไม่มี business logic เพื่อแก้ปัญหา CORS ที่ browser ไม่สามารถเรียก Rust Backend หรือ AI Server โดยตรงได้

**POST /api/detect** รับ form data จาก browser (ไฟล์ภาพ, พิกัด GPS, yaw, threshold, save flag) แล้ว proxy ต่อไปยัง Rust Backend POST /proxy/detect ส่ง response กลับตามที่ได้รับ

**POST /api/webrtc/offer** รับ SDP offer JSON จาก browser แล้ว proxy ตรงไปยัง AI Server POST /webrtc/offer ไม่ผ่าน Rust Backend เพราะ WebRTC signaling ต้องคุยกับ aiortc โดยตรง ส่ง SDP answer กลับไปยัง browser

**POST /api/events/ingest** รับ detection event JSON จาก browser แล้ว proxy ไปยัง Rust Backend POST /events/ingest ใช้สำหรับบันทึก detection ที่เกิดขึ้นใน WebRTC mode

**GET /api/events/recent** proxy ไปยัง Rust Backend GET /events/recent ใช้โดย Dashboard component เพื่อแสดง detection history

**GET /api/events/query** proxy ไปยัง Rust Backend GET /events/query ใช้สำหรับ filter events ตาม FOD class

**GET /api/dashboard/summary** proxy ไปยัง Rust Backend GET /dashboard/summary ใช้โดย Dashboard component แสดง KPI cards อัพเดททุก 30 วินาที

**GET /api/health** เรียก Rust Backend health endpoints ทั้งหมดพร้อมกัน (/health, /health/ai, /health/ai-ready, /health/db) แล้วรวมผลเป็น response เดียว ส่งกลับ {"api": "online", "ai": "online", "db": "online"} หรือ "offline" แล้วแต่สถานการณ์ ใช้โดย health context ที่ตรวจสอบทุก 30 วินาที

**GET /api/ping** ไม่ proxy ไปที่ไหน แค่ตอบ {"ok": true, "ts": timestamp} เพื่อทดสอบว่า Next.js server ทำงานอยู่

---

## Protocols ที่ใช้สื่อสาร

ระบบใช้ HTTP/HTTPS สำหรับ REST API calls ทั้งหมดระหว่าง browser กับ Next.js, ระหว่าง Next.js กับ Rust Backend และระหว่าง Rust Backend กับ AI Server สำหรับ WebRTC signaling

ระบบใช้ UDP ผ่าน WebRTC protocol สำหรับส่ง video stream แบบ real-time โดยตรงระหว่าง browser กับ AI Server วิดีโอ encode ด้วย VP8 codec ในทิศทาง browser ไปยัง AI Server และ VP8 encode ใหม่ในทิศทาง AI Server กลับไปยัง browser

ระบบใช้ WebRTC DataChannel (บน SCTP protocol) สำหรับส่ง JSON text data คู่กับ video stream ทั้งสองทิศทาง

ระบบใช้ PostgreSQL wire protocol สำหรับ Rust Backend สื่อสารกับ PostgreSQL database ผ่าน SQLx library
