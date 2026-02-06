# FOD_other

ระบบตรวจจับ Foreign Object Debris (FOD) ประกอบด้วย 2 บริการหลัก:
- AI (FastAPI + Ultralytics YOLO) สำหรับทำ inference จากภาพ
- Backend (Rust + Axum + SQLx) สำหรับ proxy ไป AI, บันทึกผลลงฐานข้อมูล PostgreSQL, และสรุปข้อมูลสำหรับ Dashboard

## โครงสร้างโปรเจค
- `ai/` บริการ AI ตรวจจับภาพ
  - `app.py` FastAPI โหลดโมเดลและให้บริการ `POST /v1/detect`
  - `models/best.pt` โมเดล YOLO (คัดลอกเข้า container ที่ `/models/best.pt`)
  - `requirements.txt`, `Dockerfile`
- `backend/` บริการ API กลางและฐานข้อมูล
  - `src/main.rs` รวมเส้นทาง API หลัก
  - `src/webrtc_signaling.rs` WebSocket signaling แบบห้อง
  - `migrations/001_create_fod_schema.sql` สร้างตาราง `fod_classes`, `events` และเปิด `pgcrypto`
  - `Cargo.toml`, `Dockerfile`

## ข้อกำหนดระบบ
- PostgreSQL พร้อมเปิดใช้ extension `pgcrypto` (migration จะเปิดให้โดยอัตโนมัติ)
- Python 3.11 (สำหรับ AI) และ Rust 1.73+ (สำหรับ Backend) หากรันแบบ local
- Docker (ทางเลือกสำหรับการรันแบบ container)

## ตัวแปรแวดล้อม (Backend)
- `DATABASE_URL` URL ของ Postgres เช่น `postgres://user:pass@host:5432/dbname`
- `AI_BASE_URL` ค่าเริ่มต้น `http://ai:8001` (เปลี่ยนได้เป็น `http://localhost:8001` เวลา dev)
- `PORT` พอร์ตของ Backend (ค่าเริ่มต้น `8000`)
- `RUST_LOG` ระดับ log เช่น `info`

## บริการ AI
- โหลดโมเดลจาก `MODEL_PATH=/models/best.pt`
- Endpoint:
  - `GET /health` ตรวจสุขภาพ
  - `GET /ready` ตรวจสถานะพร้อมใช้งานและ GPU
  - `POST /v1/detect` รับรูปภาพและคืนผลตรวจจับ

### รูปแบบผลลัพธ์ AI
```
{
  "ts": "2025-01-01T12:00:00.000Z",
  "model": "best.pt",
  "fps": 22.5,
  "img_w": 1280,
  "img_h": 720,
  "detections": [
    {
      "cls": "Bolt",
      "conf": 0.91,
      "bbox_xywh": [x, y, w, h],
      "bbox_xywh_norm": [nx, ny, nw, nh]
    }
  ]
}
```
- `bbox_xywh` เป็นค่าพิกเซล (x,y,w,h)
- `bbox_xywh_norm` เป็นค่าปกติ [0–1] อ้างอิง `img_w`, `img_h`

## บริการ Backend
- Endpoint หลัก:
  - `GET /health` ตรวจสุขภาพ Backend
  - `GET /health/ai` ตรวจสุขภาพ AI ผ่าน Backend
  - `GET /health/ai-ready` ตรวจความพร้อม AI ผ่าน Backend
  - `GET /health/db` ตรวจการเชื่อมต่อ DB
  - `POST /infer` proxy ไป AI (รองรับบันทึก DB เมื่อส่ง `?save=true`)
  - `POST /proxy/detect` proxy ไป AI และบันทึก DB (รับค่า query สำหรับตำแหน่ง/ที่มา)
  - `POST /events/ingest` บันทึก event โดยตรง
  - `GET /dashboard/summary` สรุป 24 ชั่วโมงล่าสุด: จำนวนทั้งหมด, ค่าเฉลี่ยความเชื่อมั่น, FOD ที่พบมากสุด
  - `GET /ws/:room_id` WebSocket signaling (broadcast ในห้อง)

### พารามิเตอร์ที่ใช้บันทึกผลตรวจจับ
- ส่งผ่าน query ใน `POST /infer` หรือ `POST /proxy/detect`
- `save=true` เปิดการบันทึก (เฉพาะ `/infer`)
- `latitude`, `longitude` พิกัด
- `source` ที่มา เช่น `monitoring`
- `source_ref` แหล่งอ้างอิง เช่น `gate_camera_01`

## การตั้งค่า Database และ Migration
- ตัว migration จะ:
  - เปิด `pgcrypto`
  - สร้างตาราง `fod_classes` และ `events`
  - ใส่ค่าเริ่มต้นของประเภท FOD หลายรายการ
- การเรียก `sqlx::migrate!()` จะรัน migration อัตโนมัติเมื่อ Backend เริ่มทำงาน

## ตัวอย่างการเรียกใช้งาน

### ตรวจ AI โดยตรง
```
curl -X POST -F "file=@sample.jpg" "http://localhost:8001/v1/detect?conf=0.25&imgsz=832"
```

### ตรวจผ่าน Backend และบันทึกลง DB (infer)
```
curl -X POST -F "file=@sample.jpg" \
  "http://localhost:8000/infer?save=true&latitude=13.7563&longitude=100.5018&source=monitoring&source_ref=gate_camera_01"
```

### ตรวจผ่าน Backend และบันทึกลง DB (proxy/detect)
```
curl -X POST -F "file=@sample.jpg" \
  "http://localhost:8000/proxy/detect?latitude=13.7563&longitude=100.5018&source=monitoring&source_ref=gate_camera_01"
```

### บันทึกเหตุการณ์โดยตรง
```
curl -X POST http://localhost:8000/events/ingest \
  -H "Content-Type: application/json" \
  -d '{
    "ts": "2025-01-01T12:00:00Z",
    "object_class": "Bolt",
    "object_count": 1,
    "confidence": 0.95,
    "latitude": 13.7563,
    "longitude": 100.5018,
    "source": "monitoring",
    "source_ref": "gate_camera_01",
    "bbox": {"x": 100, "y": 200, "w": 50, "h": 40},
    "meta": {"model": "best.pt"}
  }'
```

### ขอข้อมูลสรุป Dashboard
```
curl http://localhost:8000/dashboard/summary
```

## การตรวจสอบการเชื่อมต่อ
- Backend ↔ AI: `GET /health/ai`, `GET /health/ai-ready` ต้องตอบ 200
- Backend ↔ DB: `GET /health/db` ต้องได้ `{ "ok": true, "db": 1 }`
- การบันทึก: หลังเรียก `POST /infer?save=true` หรือ `POST /proxy/detect` ให้เรียก `GET /dashboard/summary` เพื่อตรวจว่าค่า `total_24h` เพิ่มขึ้น

## วิธีรัน

### รันแบบ Local (Windows PowerShell)
- เตรียม PostgreSQL และตั้งค่า `DATABASE_URL`
  - ตัวอย่างใช้ Docker: 
    - `docker run --name fod-pg -e POSTGRES_PASSWORD=pass -e POSTGRES_DB=fod -p 5432:5432 -d postgres:16`
    - `DATABASE_URL=postgres://postgres:pass@localhost:5432/fod`
- รัน AI
  - `cd ai`
  - สร้าง venv: `python -m venv .venv`
  - เปิด venv: `.\.venv\Scripts\Activate.ps1`
  - ติดตั้ง deps: `pip install -r requirements.txt`
  - รันเซิร์ฟเวอร์: `uvicorn app:app --host 0.0.0.0 --port 8001`
- รัน Backend
  - `cd backend`
  - ตั้งค่าแวดล้อมใน PowerShell:
    - `$env:DATABASE_URL = "postgres://postgres:pass@localhost:5432/fod"`
    - `$env:AI_BASE_URL  = "http://localhost:8001"`
    - `$env:RUST_LOG     = "info"`
  - รัน: `cargo run`

### รันด้วย Docker (ไม่มี docker-compose)
- สร้างเครือข่าย: `docker network create fod-net`
- รัน PostgreSQL:
  - `docker run --name fod-pg --network fod-net -e POSTGRES_PASSWORD=pass -e POSTGRES_DB=fod -p 5432:5432 -d postgres:16`
- Build และรัน AI:
  - `docker build -t fod-ai ./ai`
  - `docker run --name ai --network fod-net -p 8001:8001 fod-ai`
- Build และรัน Backend:
  - `docker build -t fod-backend ./backend`
  - `docker run --name backend --network fod-net -p 8000:8000 \`
    `-e DATABASE_URL=postgres://postgres:pass@fod-pg:5432/fod \`
    `-e AI_BASE_URL=http://ai:8001 fod-backend`

### ทดสอบหลังรัน
- `curl http://localhost:8000/health/db`
- `curl http://localhost:8000/health/ai-ready`
- `curl -X POST -F "file=@sample.jpg" "http://localhost:8000/proxy/detect?latitude=13.7563&longitude=100.5018&source=monitoring&source_ref=gate_camera_01"`
- `curl http://localhost:8000/dashboard/summary`

## การวาดกรอบ/label ใน Monitoring
- ใช้ `bbox_xywh_norm` ร่วมกับ `img_w`, `img_h` เพื่อคำนวณพิกเซลอย่างแม่นยำ
- ควรปรับขนาดข้อความ label ตามความกว้างกรอบ และป้องกันการล้นขอบด้วยการ clamp ตำแหน่ง x/y ให้อยู่ในภาพ

## CORS
- Backend อนุญาตต้นทาง `http://localhost:3000` สำหรับ dev
- AI เปิด CORS กว้างเพื่อสะดวกต่อการทดสอบ (ปรับให้แคบลงได้ภายหลัง)

## Troubleshooting
- AI ไม่โหลดโมเดล: ตรวจว่าไฟล์ `models/best.pt` มีอยู่และถูกคัดลอกเข้า `/models` ใน container
- DB error เรื่อง `gen_random_uuid()`: ตรวจว่า Postgres เปิด `pgcrypto` (migration จะเปิดให้ แต่ต้องมีสิทธิ์)
- Dashboard ไม่แสดงค่า: ตรวจว่าการเรียกใช้ตรวจจับผ่าน Backend มีการบันทึก (`/infer?save=true` หรือ `/proxy/detect`) และเวลาของเหตุการณ์อยู่ในช่วง 24 ชม. ล่าสุด

## หมายเหตุ
- โค้ดถูกปรับให้ query ของ `sqlx` เป็น runtime เพื่อง่ายต่อการ build และรันในสภาพแวดล้อมต่างๆ โดยไม่ต้องเชื่อม DB ระหว่าง build
### รันด้วย docker-compose
- สร้างและรันทั้งหมดด้วยคำสั่งเดียว:
```
docker compose up -d
```
- ตรวจสุขภาพบริการ:
```
curl http://localhost:8000/health/db
curl http://localhost:8000/health/ai-ready
```
- ทดสอบตรวจจับและสรุป:
```
curl -X POST -F "file=@sample.jpg" "http://localhost:8000/proxy/detect?latitude=13.7563&longitude=100.5018&source=monitoring&source_ref=gate_camera_01"
curl http://localhost:8000/dashboard/summary
```
- หยุดระบบ:
```
docker compose down
```

#### ใช้ GPU NVIDIA กับ docker-compose
- ติดตั้ง `nvidia-container-toolkit` บนเครื่องโฮสต์ แล้วรีสตาร์ท Docker
- ใน compose ได้เปิดใช้ GPU สำหรับบริการ AI แล้ว (`gpus: all` และตัวแปร `NVIDIA_VISIBLE_DEVICES`)
- ตรวจว่า AI เห็น GPU:
  - `curl http://localhost:8001/ready` ต้องขึ้น `{ "ok": true, "gpu": true }`
  - หรือเข้า container AI แล้วรัน `nvidia-smi`