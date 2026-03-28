# ภาพรวมโปรเจค FOD Detection System

## โปรเจคนี้คืออะไร

ระบบ FOD Detection (Foreign Object Debris Detection) คือระบบตรวจจับวัตถุแปลกปลอมบนรันเวย์สนามบินแบบ real-time วัตถุประสงค์คือเพิ่มความปลอดภัยในการบิน เนื่องจากเศษวัตถุบนรันเวย์เช่น น็อต สกรู เศษโลหะ หิน สายไฟ อาจสร้างความเสียหายร้ายแรงต่อเครื่องยนต์เครื่องบินได้ ระบบใช้กล้องที่ติดตั้งบนรถตรวจสอบที่วิ่งไปตามรันเวย์ AI model ชื่อ YOLO ทำการตรวจจับวัตถุแบบ real-time บน GPU และแสดงผลผ่านหน้าเว็บให้เจ้าหน้าที่เห็นได้ทันที

---

## สถาปัตยกรรมระบบ

ระบบโดยรวมแบ่งเป็น 4 ส่วนใหญ่ที่ทำงานร่วมกัน

**Frontend** คือส่วนหน้าเว็บที่ผู้ใช้โต้ตอบด้วย พัฒนาด้วย Next.js framework ซึ่งใช้ React สำหรับ UI และ TypeScript เป็นภาษาหลัก ทำงานที่ port 3000 Frontend มีหน้า Input ให้ผู้ใช้เลือกโหมดและกรอกพิกัด GPS หน้า Monitoring แสดงวิดีโอ real-time พร้อม detection overlay และหน้า Dashboard แสดงสถิติและแผนที่

**AI Server** คือหัวใจของระบบ พัฒนาด้วย Python ใช้ FastAPI framework และ aiortc library สำหรับ WebRTC ทำงานที่ port 8001 โหลด YOLO model ที่ train มาเฉพาะสำหรับ FOD detection (ไฟล์ best.pt) รัน inference บน GPU ด้วย CUDA และ PyTorch

**Backend** พัฒนาด้วยภาษา Rust ใช้ Axum web framework ทำงานที่ port 8000 ทำหน้าที่เป็น API gateway เชื่อมระหว่าง Frontend กับ AI Server และ Database ไม่ได้รัน AI โดยตรง

**Database** ใช้ PostgreSQL 16 รันใน Docker container ทำงานที่ port 5432 เก็บข้อมูล detection events ทั้งหมด

---

## สาม Detection Mode

**Live Camera Mode** ใช้กล้อง webcam ของอุปกรณ์ browser เปิดกล้องผ่าน WebRTC API ส่ง video stream แบบ real-time ไปยัง AI Server ที่รัน YOLO ประมวลผลทุกเฟรม วาด bounding box บนเฟรมแล้วส่งกลับมาแสดง เหมาะสำหรับการตรวจสอบ live บนรถที่มี laptop และกล้อง USB

**Video File Mode** ใช้ไฟล์วิดีโอที่อัพโหลด ใช้ WebRTC pipeline เดียวกับ Live mode แต่แทนที่กล้องด้วย HTML5 video element ที่เล่นไฟล์วิดีโอแล้วดึง stream มาผ่าน captureStream() API เหมาะสำหรับวิเคราะห์วิดีโอที่บันทึกไว้แล้ว

**Image Mode** ใช้ภาพนิ่งที่อัพโหลด ส่งผ่าน REST API ธรรมดาไม่ใช้ WebRTC AI Server รัน YOLO ครั้งเดียวส่ง JSON detections กลับ browser วาด bounding box ฝั่ง client เหมาะสำหรับวิเคราะห์ภาพเดี่ยว

---

## การทำงานของ YOLO AI

เมื่อ AI Server ได้รับ video frame จาก WebRTC จะแปลงเป็น numpy array ด้วย OpenCV แล้วส่งเข้า model.predict() บน GPU การประมวลผลรันใน asyncio thread pool เพื่อไม่ block event loop ของ aiortc

YOLO return รายการวัตถุที่พบแต่ละรายการมี class name (เช่น Hammer, Bolt, Screw), confidence score (0.0 ถึง 1.0) และ bounding box coordinates AI Server วาด bounding box บนเฟรมด้วย OpenCV โดยสีขึ้นกับ confidence level สีแดงสำหรับ critical (มากกว่า 90%), สีเหลืองสำหรับ warning (มากกว่า 75%), สีน้ำเงินสำหรับ normal (ต่ำกว่า 75%) และแสดง label เป็น class name พร้อม confidence percentage

YOLO ใช้ FP16 precision (half=True) บน GPU ทำให้เร็วขึ้นประมาณ 30 เปอร์เซ็นต์เทียบกับ FP32 ใช้ image size 640 pixels ซึ่งเป็น balance ระหว่างความเร็วและความแม่นยำ ถ้าภาพเล็กกว่า 720 pixels จะ upscale ก่อนด้วย INTER_LANCZOS4 interpolation เพื่อคุณภาพ

---

## WebRTC — เทคโนโลยีส่งวิดีโอ Real-time

WebRTC (Web Real-Time Communication) คือ standard ของ browser สำหรับส่งวิดีโอ เสียง และข้อมูลแบบ real-time ระหว่าง peers โดยตรง in ระบบนี้ browser เป็น peer หนึ่งและ AI Server (aiortc) เป็นอีก peer หนึ่ง

กระบวนการ WebRTC เริ่มด้วย signaling คือการ exchange SDP (Session Description Protocol) ที่อธิบายว่าจะส่งวิดีโออะไรและยังไง browser ส่ง SDP offer และ AI Server ส่ง SDP answer กลับ จากนั้น WebRTC ทำ ICE (Interactive Connectivity Establishment) เพื่อหาเส้นทาง network ที่เหมาะสมที่สุด เมื่อ connect สำเร็จวิดีโอจะไหลผ่าน UDP protocol ซึ่งเร็วกว่า TCP เพราะไม่ต้อง wait ให้ packet หายไปถูก resend

วิดีโอ encode ด้วย VP8 codec ซึ่งเป็น default ของ WebRTC บน browser ระบบตั้ง bitrate ไว้ที่ 12 Mbps ทั้งสองทิศทาง (browser ไป AI Server และ AI Server กลับ browser) ผ่านการ patch SDP และ RTCRtpSender.setParameters()

DataChannel ในระบบชื่อ "detections" ใช้ส่ง JSON text data คู่กับ video stream AI Server ส่ง detection metadata ทุกเฟรมที่มีผลลัพธ์ และ browser ส่ง config updates (เช่นการปรับ threshold) กลับไป

---

## ระบบ GPS และ Geolocation

ระบบบันทึกพิกัดทางภูมิศาสตร์ (latitude, longitude) และ yaw angle (ทิศทางที่กล้องหัน) ไปพร้อมกับทุก detection event เพื่อให้ทราบว่าพบวัตถุที่ตำแหน่งไหนบนรันเวย์

ตอนเปิดหน้า Input ระบบ auto-fill พิกัดจาก GPS ของอุปกรณ์ผ่าน navigator.geolocation.getCurrentPosition() ถ้าผู้ใช้ไม่อนุญาต GPS จะใช้พิกัด default ของสนามบินสุวรรณภูมิ ผู้ใช้ยังสามารถแก้ไขพิกัดและ yaw ด้วยตัวเองได้

ใน Live mode ระบบใช้ navigator.geolocation.watchPosition() เพื่ออัพเดทพิกัด real-time ตามที่รถเคลื่อนที่ ค่าพิกัดล่าสุดจะถูกใช้เมื่อบันทึก detection event ลงฐานข้อมูล ทำให้ map ใน Dashboard แสดงตำแหน่งที่พบวัตถุได้ถูกต้อง

---

## ฐานข้อมูล PostgreSQL

มีสองตารางหลัก

**fod_classes** เก็บประเภทวัตถุ FOD ที่ระบบรู้จัก มี primary key id (serial), name (unique, เช่น Bolt/Nut/Screw), description และ created_at ระบบมี default 12 class ที่สร้างตอนเริ่มต้น และสร้างใหม่อัตโนมัติถ้า YOLO detect class ที่ไม่มีในระบบ

**events** เก็บทุก detection event มี id (UUID), ts (timestamp ที่พบ), class_id (foreign key ไปยัง fod_classes), object_count, confidence (0.0-1.0), latitude, longitude (พิกัด GPS), source (เช่น "monitoring"), source_ref (reference ID), bbox (bounding box เป็น JSONB), meta (metadata เพิ่มเติม JSONB) มี indexes ที่ ts, class_id และ source_ref เพื่อ query performance

ระบบทำ deduplication ไม่บันทึก event ซ้ำถ้าพบวัตถุ class เดิมในเวลา 10 วินาทีที่แหล่งเดิม

---

## Dashboard และการแสดงผลสถิติ

Dashboard ดึงข้อมูลจาก database ผ่าน Rust Backend แสดง KPI Cards บอกจำนวน detections ใน 24 ชั่วโมงล่าสุด ค่าเฉลี่ย confidence และ FOD type ที่พบมากที่สุด มีกราฟ timeline ด้วย Recharts แสดง detection trend, pie chart แสดงสัดส่วน FOD แต่ละประเภท, Leaflet map แสดง marker บนแผนที่โลกตามพิกัด GPS และ heatmap แสดงความหนาแน่น และตาราง detection history แสดงรายละเอียดทุก event

---

## การออกแบบที่สำคัญและเหตุผล

ระบบเลือกให้ AI Server วาด bounding box บน server-side แทนที่จะส่งแค่ JSON bbox กลับไปให้ browser วาดเอง เพราะกล้องบนรถเคลื่อนที่ทำให้วัตถุในเฟรมเปลี่ยนตำแหน่งตลอด ถ้า browser วาดเอง bbox อาจไม่ตรงกับตำแหน่งวัตถุในเฟรมปัจจุบันเนื่องจาก latency

ระบบเลือกใช้ VP8 codec แทน H.264 เพราะ aiortc รองรับ VP8 ได้ดีกว่าและ encode เร็วบน software โดยไม่ต้องการ GPU encoder

WebRTC signaling ไม่ผ่าน Rust Backend เพราะ WebRTC video stream เป็น UDP ไม่ใช่ HTTP Rust ไม่สามารถ relay UDP stream ได้ จึง proxy แค่ HTTP signaling ผ่าน Next.js และให้ video stream เชื่อมตรงระหว่าง browser กับ AI Server

Rust Backend เลือกภาษา Rust สำหรับ API layer เพราะ performance สูงมาก memory safe โดยไม่มี garbage collector เหมาะสำหรับ concurrent HTTP requests จำนวนมาก

วิดีโอ encode 2 รอบในสาย WebRTC (browser encode ก่อนส่ง, AI encode ก่อนส่งกลับ) ทำให้คุณภาพลดลงเล็กน้อย แต่เป็น trade-off ที่ยอมรับได้เพราะสามารถใช้ webcam ของ laptop ธรรมดาโดยไม่ต้องมี IP Camera หรือ RTSP server

---

## เทคโนโลยีที่ใช้ทั้งหมด

Frontend ใช้ Next.js, TypeScript, React, Recharts สำหรับ chart, Leaflet.js และ leaflet.heat สำหรับแผนที่, Radix UI components, Tailwind CSS สำหรับ styling, Sonner สำหรับ toast notifications

AI Server ใช้ Python 3.10+, FastAPI, aiortc (WebRTC สำหรับ Python), PyTorch (CUDA FP16), Ultralytics YOLO, OpenCV (cv2), numpy, av (สำหรับ VideoFrame)

Backend ใช้ Rust, Axum web framework, SQLx (type-safe async ORM), tokio (async runtime), reqwest (HTTP client), serde (JSON serialization), uuid, time

Database ใช้ PostgreSQL 16 บน Docker, docker-compose สำหรับ container management

---

## ปัญหาที่ระบบนี้แก้ไข

FOD (Foreign Object Debris) บนรันเวย์เป็นหนึ่งในสาเหตุหลักของอุบัติเหตุทางการบิน เศษวัตถุเล็กน้อยอย่างน็อตหรือสกรูที่ถูกดูดเข้าเครื่องยนต์ไอพ่นสามารถทำให้เครื่องยนต์เสียหายหนักและเป็นอันตรายถึงชีวิตได้ ปัจจุบันการตรวจสอบรันเวย์ส่วนใหญ่ยังพึ่งการตรวจสอบด้วยสายตาของเจ้าหน้าที่ ซึ่งช้า ไม่ครอบคลุม และขึ้นกับความสามารถของคน

ระบบนี้แก้ปัญหาด้วยการใช้กล้องและ AI ตรวจสอบรันเวย์แบบ real-time ขณะที่รถตรวจสอบวิ่งไปตามรันเวย์ ระบบตรวจจับวัตถุได้เร็วกว่าสายตามนุษย์ บันทึกพิกัด GPS ของทุก detection ทำให้เจ้าหน้าที่รู้ตำแหน่งที่แน่นอน และมี dashboard แสดงสถิติในแต่ละวันให้ผู้บริหารติดตามได้

---

## วัตถุที่ระบบสามารถตรวจจับได้

YOLO model ที่ใช้ (best.pt) ถูก train มาเพื่อตรวจจับ FOD ที่พบบ่อยบนรันเวย์โดยเฉพาะ ระบบรองรับ FOD 12 ประเภทที่ default ได้แก่ Bolt (น็อตหัวสกรู), Nut (น็อตหกเหลี่ยม), Screw (สกรู), Wire (เศษสายไฟ), Scrap Metal (เศษโลหะ), Stone (หิน/กรวด), Paper (กระดาษ/กล่อง), Plastic (พลาสติก), Glass (เศษแก้ว), Cloth (ผ้า/วัสดุผ้า), Tire Pieces (ชิ้นส่วนยาง) และ Other (วัตถุแปลกปลอมอื่นๆ) ระบบยังสร้าง class ใหม่อัตโนมัติถ้า YOLO detect วัตถุที่ไม่อยู่ในรายการ

แต่ละ detection มีค่า confidence score ที่บอกว่า YOLO มั่นใจแค่ไหน สีของ bounding box บนวิดีโอสะท้อนระดับความเชื่อมั่น สีแดงหมายถึงแน่ใจมากกว่า 90 เปอร์เซ็นต์ สีเหลืองหมายถึงแน่ใจ 75 ถึง 90 เปอร์เซ็นต์ และสีน้ำเงินหมายถึงต่ำกว่า 75 เปอร์เซ็นต์ ผู้ใช้สามารถปรับ threshold ได้ real-time ผ่าน slider ใน monitoring page โดยไม่ต้อง restart ระบบ

---

## ข้อจำกัดของระบบและงานที่จะพัฒนาต่อ

ข้อจำกัดที่มีอยู่ในปัจจุบันคือคุณภาพวิดีโอลดลงเล็กน้อยจากการ encode VP8 สองรอบในสาย WebRTC ระบบยังไม่รองรับ IP Camera หรือ RTSP stream โดยตรงต้องผ่าน browser การบันทึก detection ใช้ deduplication แบบง่ายคือ 10 วินาทีต่อ class ซึ่งอาจพลาด event ถ้ารถวิ่งผ่านวัตถุเดิมสองรอบ นอกจากนี้ระบบต้องมี internet connection สำหรับ WebRTC ICE ในกรณีที่ browser กับ AI Server ไม่ได้อยู่ใน network เดียวกัน

งานที่จะพัฒนาต่อได้แก่ การ train YOLO model เพิ่มเติมด้วย dataset ของรันเวย์จริงเพื่อความแม่นยำสูงขึ้น การเพิ่ม object tracking เพื่อติดตามวัตถุเดิมข้ามหลายเฟรมและลด false detection การรองรับ IP Camera ผ่าน RTSP โดยตรงบน AI Server การ export รายงาน PDF สำหรับเจ้าหน้าที่ และการเพิ่ม alert system แจ้งเตือนผ่าน SMS หรือ email เมื่อพบ FOD ที่มี confidence สูง

