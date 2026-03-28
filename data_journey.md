# การไหลของข้อมูลในโปรเจค FOD Detection

## ภาพรวมการไหลของข้อมูล

โปรเจค FOD Detection มีการไหลของข้อมูล 3 รูปแบบหลักขึ้นอยู่กับโหมดการทำงาน ได้แก่ Live Camera Mode, Video File Mode และ Image Mode แต่ละโหมดมีเส้นทางข้อมูลที่แตกต่างกัน

---

## Live Camera Mode — การไหลของข้อมูลแบบ Real-time

เมื่อผู้ใช้กด Start Detection ในโหมด Live Camera สิ่งแรกที่เกิดขึ้นคือ InputControl component ใน Next.js อ่านพิกัด GPS จาก navigator.geolocation API ของ browser แล้ว navigate ไปยังหน้า /monitoring พร้อมส่งพิกัด latitude, longitude, yaw และ threshold ผ่าน URL parameters เช่น /monitoring?lat=13.76&lng=100.46&yaw=92.3&conf=0.70

หน้า monitoring อ่าน URL parameters แล้วส่งเป็น props ชื่อ initialLat, initialLng, initialYaw ไปยัง RealtimeMonitoring component ซึ่งเริ่มกระบวนการ WebRTC

RealtimeMonitoring component เรียก navigator.mediaDevices.getUserMedia() ขอเปิดกล้อง webcam ด้วยความละเอียด 1280x720 pixels และ 30 frames per second browser ขอ permission จากผู้ใช้ก่อน เมื่อได้ MediaStream มาแล้วจะสร้าง RTCPeerConnection และ DataChannel ชื่อ "detections" จากนั้นเพิ่ม video track จากกล้องเข้า connection พร้อมตั้ง maxBitrate เป็น 12 Mbps สร้าง SDP Offer ที่อธิบายรายละเอียดของ video session แล้วส่ง POST request ไปที่ /api/webrtc/offer พร้อม SDP offer JSON

Next.js API Route รับ request แล้ว proxy ตรงไปยัง AI Server POST /webrtc/offer ฝั่ง AI Server (Python aiortc) รับ SDP offer สร้าง RTCPeerConnection สร้าง AnnotatedVideoTrack ที่จะทำหน้าที่ประมวลผลวิดีโอ patch SDP answer เพิ่ม bitrate 12 Mbps แล้วส่ง SDP answer กลับมา browser รับ SDP answer ตั้งเป็น remote description WebRTC connection จึง establish สำเร็จ

หลังจากนั้นวิดีโอจากกล้องจะไหลแบบ real-time ทุกเฟรม (30fps) browser encode frame ด้วย VP8 codec แล้วส่งเป็น UDP packets ไปยัง AI Server ฝั่ง AI Server ใน AnnotatedVideoTrack.recv() รับ VideoFrame แปลงเป็น numpy array BGR ด้วย OpenCV ส่งเข้า YOLO model.predict() บน GPU ด้วย FP16 precision ที่ image size 640 วาด bounding box รอบวัตถุที่พบด้วย OpenCV (สีแดงถ้า confidence มากกว่า 90% สีเหลืองถ้ามากกว่า 75% สีน้ำเงินถ้าต่ำกว่า) encode เฟรมที่วาดเสร็จด้วย VP8 ส่งกลับ browser ผ่าน WebRTC browser แสดงเฟรมบน video element

พร้อมกันนั้น AI Server ส่ง JSON metadata ทุกเฟรมที่มี detection ผ่าน DataChannel ได้แก่ timestamp, FPS ปัจจุบัน, ขนาดภาพ, frame ID และรายการ detection แต่ละรายการ browser รับ message event จาก DataChannel parse JSON แล้วอัพเดท EventLog component และ FPS counter

สำหรับการบันทึกข้อมูลลงฐานข้อมูล browser ใช้ deduplication logic โดยไม่บันทึกถ้า class เดียวกันถูก detect ไปไม่ถึง 10 วินาที เมื่อถึงเวลาบันทึก browser ส่ง POST /api/events/ingest พร้อม JSON ที่มี timestamp, object_class, confidence, latitude (จาก GPS watchPosition real-time), longitude, source, source_ref, bbox และ meta Next.js proxy ไปยัง Rust Backend POST /events/ingest Rust ใช้ get_or_create_class() หา class_id จาก fod_classes table แล้ว INSERT INTO events ส่ง response กลับเป็น event ID

Dashboard component fetch ข้อมูลจาก API เป็นระยะ GET /api/dashboard/summary ทุก 30 วินาที ได้ total_24h, avg_conf, top_fod มาแสดงใน KPI Cards และ GET /api/events/recent ได้รายการ events ทั้งหมดมาแสดงใน timeline chart, distribution chart, Leaflet map และ detection table

---

## Video File Mode — การไหลของข้อมูล

Video File Mode ทำงานเหมือน Live Camera Mode ทุกประการในส่วนของ WebRTC pipeline แต่ต่างกันตรงแหล่งวิดีโอ แทนที่จะเปิดกล้อง RealtimeMonitoring component สร้าง HTML5 video element และโหลดไฟล์วิดีโอที่ผู้ใช้อัพโหลด ใช้ captureStream() API ของ browser ดึง MediaStream จาก video element แล้วส่งเข้า WebRTC pipeline เหมือนกัน วิดีโอจะ loop ซ้ำไปเรื่อยๆ ผ่าน YOLO และส่ง annotated stream กลับมาแสดงในอีก video element ต่างหาก GPS coordinates ใช้ค่าที่กรอกในหน้า Input โดยตรงไม่มีการอัพเดท real-time เพราะวิดีโอเป็นไฟล์ที่บันทึกไว้แล้ว

---

## Image Mode — การไหลของข้อมูล

Image Mode ใช้ REST API ธรรมดาไม่มี WebRTC ผู้ใช้อัพโหลดภาพนิ่งพร้อมกรอกพิกัด GPS, yaw และ confidence threshold RealtimeMonitoring component ส่ง POST /api/detect ผ่าน form data ที่มีไฟล์ภาพ, latitude, longitude, yaw, conf และ save flag

Next.js API Route รับแล้ว proxy ไปยัง Rust Backend POST /proxy/detect พร้อม query parameters ทั้งหมด Rust Backend ส่งภาพต่อไปยัง AI Server POST /v1/detect พร้อม conf และ imgsz AI Server รัน YOLO predict บน GPU ส่ง JSON detections กลับมา Rust Backend รับ JSON ถ้า save เป็น true จะบันทึกทุก detection ลงฐานข้อมูล ส่ง JSON response กลับไปยัง Next.js ต่อไปยัง browser

Browser รับ JSON แล้วแสดง BoundingBox component วาด bounding box บนภาพต้นฉบับใน canvas ฝั่ง client แสดงผลใน EventLog

---

## การไหลของพิกัด GPS

พิกัด GPS ไหลจาก InputControl component ผ่าน URL parameters (/monitoring?lat=...&lng=...&yaw=...) ไปยัง RealtimeMonitoring component ที่รับเป็น initialLat, initialLng, initialYaw props สำหรับ Image mode ใช้ค่า initial เหล่านี้ตรงๆ ไม่เปลี่ยน สำหรับ Live mode มีการเรียก GPS watchPosition() เพิ่มเติมเพื่ออัพเดทพิกัด real-time ตามตำแหน่งจริงของรถที่เคลื่อนที่ ค่าพิกัดปัจจุบันเก็บใน liveCoordinatesRef และส่งไปกับทุก event ที่บันทึกลง database

---

## การไหลของข้อมูลจาก Database ไปยัง Dashboard

Rust Backend ดึงข้อมูลจาก PostgreSQL ด้วย SQLx โดย /events/recent ใช้ SELECT JOIN ระหว่าง events และ fod_classes เพื่อได้ class_name มาพร้อมกัน /dashboard/summary ใช้ 3 queries แยกกันคือ SUM(object_count) จาก 24 ชั่วโมงล่าสุด, AVG(confidence) จาก 24 ชั่วโมงล่าสุด และ top FOD class โดย COUNT และ GROUP BY Dashboard component แสดงข้อมูลบน Recharts charts, Leaflet map ที่แสดง marker ตามพิกัด GPS ของแต่ละ event และ heatmap ที่แสดงความหนาแน่นของ detection ในแต่ละพื้นที่
