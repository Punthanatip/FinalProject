# Data Journey — เส้นทางของข้อมูลตั้งแต่ต้นจนจบ

## เทคโนโลยีทั้งหมดที่ใช้ในโปรเจค

### Next.js
คือ Web framework ที่สร้างอยู่บน React ในโปรเจคนี้ใช้ทำหน้าเว็บทั้งหมด (หน้า Input, Monitoring, Dashboard) และยังมี API Routes ที่ทำหน้าที่เป็น proxy ส่ง request จาก browser ไปหา Backend หรือ AI Server

### TypeScript
คือ JavaScript ที่มี type system เพิ่มเข้ามา ช่วยให้เขียนโค้ด frontend ปลอดภัยกว่า JavaScript ธรรมดา ตรวจจับ bug ได้ตั้งแต่ตอนเขียนโค้ด

### WebRTC (Web Real-Time Communication)
คือ protocol มาตรฐานของ browser สำหรับส่งวิดีโอ เสียง และข้อมูลแบบ real-time โดยไม่ต้องผ่าน server ตัวกลาง (peer-to-peer) ในโปรเจคนี้ใช้ส่งวิดีโอจากกล้องใน browser ไป AI Server และรับวิดีโอที่วาด bounding box แล้วกลับมา

### aiortc
คือ WebRTC library สำหรับ Python ทำให้ Python server สามารถรับ-ส่งวิดีโอ real-time กับ browser ได้ เหมือนที่ Zoom หรือ Google Meet ทำ ในโปรเจคนี้ aiortc ทำหน้าที่รับ video frame จาก browser, ส่งให้ YOLO process, แล้วส่งวิดีโอที่วาด bbox แล้วกลับไป

### VP8
คือ Video codec ของ Google ออกแบบมาสำหรับ WebRTC ทำหน้าที่บีบอัดวิดีโอก่อนส่งผ่าน network ในโปรเจคนี้ใช้ VP8 เป็น default codec เพราะ encode เร็วในแบบ software mode (ไม่ต้องใช้ GPU encode)

### DataChannel
คือ ช่องทางส่งข้อมูล (text/binary) ที่มาคู่กับ WebRTC ใช้ส่ง detection metadata (JSON) จาก AI Server กลับไปหา browser แบบ real-time ควบคู่กับ video stream และยังใช้รับการอัพเดท confidence threshold จาก browser ด้วย

### FastAPI
คือ Python web framework ที่เร็วและทันสมัย ในโปรเจคนี้ใช้สร้าง REST API endpoints บน AI Server (เช่น POST /v1/detect, POST /webrtc/offer) รองรับ async/await ทำให้ไม่ block event loop

### YOLO (You Only Look Once)
คือ AI object detection model ที่ตรวจจับวัตถุในภาพได้แบบ real-time ในโปรเจคนี้ใช้ YOLO model ที่ train มาเฉพาะสำหรับ FOD detection (ไฟล์ best.pt) สามารถ detect วัตถุเช่น ค้อน สกรู น็อต เศษโลหะ พร้อมบอกตำแหน่ง bounding box และค่า confidence

### PyTorch
คือ Deep learning framework จาก Meta ใช้รัน YOLO model ใน Python รองรับ CUDA สำหรับประมวลผลบน GPU

### CUDA
คือ platform สำหรับ GPU computing ของ NVIDIA ให้ PyTorch สามารถรัน YOLO inference บน GPU (RTX 5060 Ti) แทนที่จะใช้ CPU ทำให้เร็วขึ้นหลายเท่า

### OpenCV (cv2)
คือ library สำหรับประมวลผลภาพ ในโปรเจคนี้ใช้ทำ: วาด bounding box (cv2.rectangle), วาด text label (cv2.putText), resize ภาพ (cv2.resize), และแปลง format ภาพ

### Rust + Axum
Rust คือภาษาโปรแกรมที่เร็วและปลอดภัย Axum คือ web framework ของ Rust ในโปรเจคนี้ใช้เขียน Backend API server ที่ทำหน้าที่เป็น API gateway เชื่อม frontend กับ AI Server และ Database

### SQLx
คือ Rust database library ที่ type-safe และ async ใช้เชื่อมต่อ Rust Backend กับ PostgreSQL ทำ query แบบ compile-time verified

### PostgreSQL
คือ relational database ที่แข็งแกร่งและเชื่อถือได้ ในโปรเจคนี้ใช้เก็บ detection events (เวลา ประเภทวัตถุ ค่า confidence ตำแหน่ง GPS bounding box) และ FOD classes (ประเภทวัตถุทั้งหมด)

### Docker
คือ container platform ในโปรเจคนี้ใช้รัน PostgreSQL ใน Docker container ผ่าน docker-compose.dev.yml

### Leaflet
คือ JavaScript library สำหรับแผนที่ interactive ในโปรเจคนี้ใช้แสดงตำแหน่ง GPS ของ detection บนแผนที่โลก ในหน้า Dashboard

## Live Mode — Data Journey แบบละเอียดทุกขั้นตอน

### ขั้นที่ 1: User กด Start

User เปิดเว็บที่ http://localhost:3000 เลือก Live Camera แล้วกดปุ่ม START DETECTION

เทคโนโลยีที่ใช้: Next.js (React) render หน้าเว็บ
Component ที่เกี่ยวข้อง: InputControl.tsx
ข้อมูลที่ส่ง: source=live, threshold=0.70 ส่งไปให้ RealtimeMonitoring component

### ขั้นที่ 2: เปิดกล้อง

Browser เรียก navigator.mediaDevices.getUserMedia() ขอสิทธิ์เปิดกล้อง webcam ได้ MediaStream ที่มี resolution 1280x720 pixels และ frame rate 30fps

เทคโนโลยีที่ใช้: WebRTC API (built-in ใน browser)
ข้อมูลที่ได้: MediaStream คือ stream ข้อมูลวิดีโอ raw จากกล้อง

### ขั้นที่ 3: สร้าง WebRTC Connection

ขั้นตอนย่อย:
1. Browser สร้าง RTCPeerConnection (ใช้ STUN server ของ Google สำหรับ NAT traversal)
2. Browser สร้าง DataChannel ชื่อ "detections" สำหรับรับ detection JSON
3. Browser เพิ่ม video track จากกล้องเข้า connection (addTrack) พร้อมตั้ง maxBitrate=5Mbps
4. Browser สร้าง SDP Offer (Session Description Protocol ที่บอกว่าจะส่งวิดีโอยังไง)
5. Browser ส่ง HTTP POST ไปที่ /api/webrtc/offer พร้อม SDP Offer + confidence threshold
6. Next.js API Route proxy request ไปที่ AI Server POST /webrtc/offer โดยตรง
7. AI Server สร้าง RTCPeerConnection ฝั่ง server ด้วย aiortc
8. AI Server สร้าง AnnotatedVideoTrack เพื่อ process video
9. AI Server สร้าง SDP Answer แล้วส่งกลับ
10. Browser ได้ SDP Answer → setRemoteDescription → WebRTC connected

เทคโนโลยีที่ใช้: RTCPeerConnection สร้างท่อเชื่อม browser กับ server, SDP บอกทั้ง 2 ฝั่งว่าจะส่งวิดีโอแบบไหน, ICE/STUN หา network path ผ่าน NAT/firewall, DataChannel ช่องส่ง JSON data คู่กับวิดีโอ, FastAPI รับ HTTP request, aiortc สร้าง WebRTC connection ฝั่ง Python

### ขั้นที่ 4: ส่งวิดีโอจากกล้องไป AI Server

ทุกๆ 33ms (30fps) กล้องถ่ายเฟรม 1280x720 pixels จากนั้น Browser encode ด้วย VP8 codec บีบอัดเหลือประมาณ 100-200 KB ต่อเฟรม แล้วส่งผ่าน WebRTC (ใช้ UDP protocol) ไป AI server ฝั่ง AI Server aiortc รับแล้ว decode VP8 ได้ภาพ raw กลับมา

เทคโนโลยีที่ใช้: VP8 codec บีบอัดวิดีโอ, WebRTC ส่งวิดีโอ real-time, UDP protocol ที่ไม่ต้องรอ ACK ทำให้ latency ต่ำ

### ขั้นที่ 5: AI ประมวลผลเฟรม (หัวใจของระบบ)

ในทุกเฟรม method recv() ของ AnnotatedVideoTrack จะถูกเรียก ทำขั้นตอนดังนี้:

ขั้น 5.1: รับ VideoFrame จาก aiortc
ขั้น 5.2: แปลงเป็น numpy array ด้วย frame.to_ndarray(format="bgr24") ให้อยู่ใน format BGR ของ OpenCV
ขั้น 5.3: รัน model.predict() ด้วย YOLO บน GPU ใช้ FP16 precision (half=True) ที่ imgsz=640 ได้ผลลัพธ์คือ bounding boxes, class names, confidence scores
ขั้น 5.4: วาด bounding box ด้วย cv2.rectangle() สีตาม severity (แดงถ้า confidence >= 90%, เหลืองถ้า >= 75%, น้ำเงินถ้าน้อยกว่า) และวาดชื่อ class + confidence ด้วย cv2.putText() เช่น "Hammer 93%"
ขั้น 5.5: วาด FPS counter มุมบนซ้ายด้วย cv2.putText()
ขั้น 5.6: ถ้าภาพเล็กกว่า 720p จะ upscale ด้วย cv2.resize()
ขั้น 5.7: แปลงกลับเป็น VideoFrame ด้วย VideoFrame.from_ndarray() แล้วส่งกลับ

การรัน YOLO ใช้ asyncio.to_thread() เพื่อรันใน thread pool แยก ไม่ block event loop ของ aiortc

ข้อมูลที่ได้จาก YOLO ในแต่ละ detection ประกอบด้วย: cls (ชื่อ class เช่น Hammer), conf (confidence เช่น 0.93), bbox_xywh (ตำแหน่ง pixel เช่น [320, 180, 200, 300]), bbox_xywh_norm (ตำแหน่ง normalized 0-1)

### ขั้นที่ 6: ส่งวิดีโอที่วาดแล้วกลับ Browser

ภาพที่วาด bounding box เสร็จแล้วจะถูก aiortc encode เป็น VP8 แล้วส่งกลับ browser ผ่าน WebRTC browser จะแสดงบน video element โดยตรง

### ขั้นที่ 7: ส่ง Detection Metadata ผ่าน DataChannel

พร้อมกับส่งวิดีโอ AI Server ยังส่ง JSON metadata ผ่าน DataChannel ทุกเฟรมที่มี detection ข้อมูลประกอบด้วย: ts (timestamp), fps (frame rate), img_w/img_h (ขนาดภาพ), frame_id (ลำดับเฟรม), detections (array ของ detection แต่ละตัว)

ในทางกลับกัน browser สามารถส่ง JSON กลับมาเพื่ออัพเดท confidence threshold แบบ real-time ได้ เช่น {"conf": 0.80} โดยไม่ต้อง reconnect WebRTC

### ขั้นที่ 8: Browser แสดงผล

Browser ทำ 3 อย่างพร้อมกัน:

8.1 แสดงวิดีโอ: WebRTC video track แสดงบน HTML5 video element ภาพที่เห็นมี bounding box และ label วาดไว้แล้วจาก server

8.2 อัพเดท EventLog: DataChannel message ถูก parse เป็น JSON แล้ว setState ให้ EventLog component re-render แสดง list ของ detection พร้อมสี severity (แดง เหลือง น้ำเงิน)

8.3 อัพเดท FPS: ค่า fps จาก JSON แสดงมุมบนขวาของวิดีโอ เช่น "FPS: 30.01"

### ขั้นที่ 9: บันทึกลง Database

Browser ไม่ได้ส่ง detection ไปบันทึกทุกเฟรม (จะท่วม DB) แต่ใช้ deduplication logic คือ ถ้า class เดียวกัน ส่งไปไม่ถึง 10 วินาทีที่แล้ว จะไม่ส่งซ้ำ

เมื่อถึงเวลาบันทึก:
1. Browser ส่ง POST /api/events/ingest พร้อม JSON (ts, object_class, confidence, latitude, longitude, bbox, meta)
2. Next.js API Route proxy ไป Rust Backend POST /events/ingest
3. Rust Backend เรียก get_or_create_class() ถ้า class ยังไม่มีใน fod_classes จะ INSERT ใหม่
4. Rust Backend เรียก INSERT INTO events(...) บันทึก event ลง PostgreSQL
5. ส่ง response กลับ {id: uuid, status: success}

### ขั้นที่ 10: Dashboard ดึงข้อมูลแสดงผล

Dashboard component fetch ข้อมูลจาก API เป็นระยะ:

- GET /api/dashboard/summary ทุก 30 วินาที → ได้ total_24h, avg_conf, top_fod → แสดงใน KPI Cards
- GET /api/events/recent → ได้ list ของ events → แสดงในกราฟ timeline, กราฟ distribution, แผนที่ Leaflet, และตาราง detection history

## Image Mode — Data Journey

Image Mode ใช้ REST API ธรรมดา ไม่ใช้ WebRTC:

1. User อัพโหลดภาพ
2. Browser ส่ง POST /api/detect (multipart/form-data)
3. Next.js proxy ไป Rust Backend POST /proxy/detect
4. Rust Backend proxy ไป AI Server POST /v1/detect
5. AI Server รัน YOLO predict บน GPU ส่ง JSON กลับ
6. Browser รับผล แล้ววาด bounding box บนภาพด้วย BoundingBox component (วาดฝั่ง browser ไม่ใช่ฝั่ง server)
7. แสดงผลใน EventLog

## สรุปเส้นทางข้อมูลทั้งหมด

กล้อง/วิดีโอ/ภาพ → Browser (Next.js + TypeScript) → WebRTC (VP8 encode) หรือ HTTP POST → AI Server (Python + FastAPI + aiortc) → YOLO (PyTorch + CUDA) → OpenCV วาด bbox → WebRTC (VP8 encode) กลับ browser + DataChannel (JSON) → Browser แสดงผลวิดีโอ + EventLog + FPS → Rust Backend (Axum + SQLx) → PostgreSQL (Docker) → Dashboard (KPI + กราฟ + แผนที่ + ตาราง)
