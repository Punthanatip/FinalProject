# ฐานข้อมูล FOD Detection — PostgreSQL

## ภาพรวม

ระบบ FOD Detection ใช้ PostgreSQL 16 เป็นฐานข้อมูลหลักสำหรับเก็บข้อมูล detection events ทั้งหมด รันอยู่ใน Docker container และเชื่อมต่อกับ Rust Backend ผ่าน SQLx library

---

## วิธีสร้างฐานข้อมูล

ฐานข้อมูลสร้างและเริ่มต้นอัตโนมัติผ่าน Docker Compose เมื่อรันคำสั่ง docker compose up PostgreSQL container จะสร้าง database ชื่อ fod_db และรันไฟล์ SQL ใน folder db/init ตามลำดับโดยอัตโนมัติ ไฟล์แรก 01-extensions.sql เปิดใช้งาน extensions ที่จำเป็น ไฟล์ที่สอง 02-schema.sql สร้างตารางและข้อมูลเริ่มต้น

เมื่อ Rust Backend เริ่มทำงาน SQLx จะรัน database migrations อัตโนมัติอีกครั้งเพื่อให้แน่ใจว่า schema เป็นเวอร์ชันล่าสุด ผ่านคำสั่ง sqlx::migrate!().run(&db)

---

## โครงสร้างตาราง

### ตาราง fod_classes

ตารางนี้เก็บประเภทของวัตถุ FOD ที่ระบบรู้จัก สร้างขึ้นเพื่อให้ตาราง events อ้างอิงชื่อประเภทผ่าน foreign key แทนที่จะเก็บ string ซ้ำทุก row ช่วยประหยัดพื้นที่และสามารถ query groupby ได้ง่าย

ฟิลด์ในตารางประกอบด้วย id เป็น serial integer ที่เพิ่มอัตโนมัติ, name เป็น varchar ที่ต้อง unique ไม่ซ้ำกัน ใช้เป็น key ค้นหา, description เป็น text อธิบายประเภทวัตถุ และ created_at เป็น timestamp ที่มีค่า default เป็นเวลาปัจจุบัน

ระบบมีข้อมูลเริ่มต้น 12 ประเภทที่ insert อัตโนมัติตอนสร้าง database ได้แก่ Bolt (น็อตหัวสกรู), Nut (น็อตหกเหลี่ยม), Screw (สกรู), Wire (เศษสายไฟ), Scrap Metal (เศษโลหะ), Stone (หิน/กรวด), Paper (กระดาษ), Plastic (พลาสติก), Glass (เศษแก้ว), Cloth (ผ้า), Tire Pieces (ชิ้นยาง) และ Other (อื่นๆ) ถ้า YOLO detect วัตถุที่ไม่มีใน 12 ประเภทนี้ระบบจะสร้าง class ใหม่อัตโนมัติผ่านฟังก์ชัน get_or_create_class()

### ตาราง events

ตารางหลักที่เก็บทุก detection event ที่เกิดขึ้นในระบบ ทั้งจาก WebRTC mode ที่ browser ส่งมาโดยตรงและจาก Image mode ที่ Rust Backend บันทึกให้

ฟิลด์ในตารางประกอบด้วย id เป็น UUID สร้างอัตโนมัติด้วย gen_random_uuid() ทำให้ ID ไม่ซ้ำกันทั่วโลก, ts เป็น timestamp with timezone บันทึกเวลาที่พบวัตถุ, class_id เป็น integer ที่ foreign key อ้างอิง fod_classes.id, object_count เป็นจำนวนวัตถุที่พบในครั้งนั้น default 1, confidence เป็น real number ระหว่าง 0 ถึง 1 บอกความมั่นใจของ YOLO, latitude และ longitude เป็น real number เก็บพิกัด GPS ที่พบวัตถุ, source เป็น string บอกแหล่งที่มา เช่น monitoring หรือ upload, source_ref เป็น reference ID เช่น room ID หรือชื่อไฟล์, bbox เป็น JSONB เก็บ bounding box coordinates ในรูปแบบ JSON และ meta เป็น JSONB เก็บ metadata เพิ่มเติมเช่น yaw angle, model name, track_id

---

## Indexes สำหรับ Performance

ฐานข้อมูลมี 3 indexes หลัก ได้แก่ idx_events_ts_desc บน timestamp เรียงจากใหม่ไปเก่า ใช้เมื่อ query events ล่าสุด ซึ่งเป็น query ที่เกิดบ่อยที่สุด, idx_events_class_id บน class_id ใช้เมื่อ filter events ตามประเภท FOD และ idx_events_source_ref บน source_ref ใช้เช็ค duplicate detection ด้วย track_id ใน meta field

---

## การทำงานร่วมกับ Rust Backend

Rust Backend เชื่อมต่อ PostgreSQL ผ่าน SQLx library ซึ่งเป็น async database library ที่ตรวจสอบ SQL query ตอน compile time ทำให้ query ผิดจะ error ตั้งแต่ build ไม่ใช่ตอน runtime

ฟังก์ชันหลักที่ Rust ใช้กับ database มีดังนี้

get_or_create_class() รับ class name เช่น Bolt แล้วหา class_id ถ้าไม่มีก็ INSERT ใหม่อัตโนมัติโดยใช้ ON CONFLICT DO UPDATE ทำให้ไม่ error ถ้า class มีอยู่แล้ว

insert_event() บันทึก detection event พร้อมข้อมูลครบหมดลงตาราง events รับ timestamp ที่กำหนดมาและ return UUID ของ event ที่สร้าง

insert_event_now() เหมือน insert_event() แต่ใช้ NOW() เป็น timestamp ปัจจุบันแทน ใช้ตอนที่ Rust backend บันทึก detection จาก proxy/detect

check_duplicate_track() ตรวจสอบว่ามี detection ของ track_id เดิมในเวลา 10 วินาทีล่าสุดหรือไม่ ป้องกันบันทึกวัตถุชิ้นเดิมซ้ำขณะที่กล้องวิ่งผ่าน

get_recent() ดึง events ล่าสุด JOIN กับ fod_classes เพื่อให้ได้ class_name มาพร้อมกัน ส่งให้ Frontend แสดงใน dashboard

get_summary() ดึงสถิติสรุปจาก 24 ชั่วโมงล่าสุด ได้แก่จำนวน detections รวม ค่าเฉลี่ย confidence และ FOD type ที่พบมากที่สุด

---

## ความสัมพันธ์ระหว่างตาราง

ตาราง events และ fod_classes มีความสัมพันธ์แบบ many-to-one คือหนึ่ง class ของ FOD มีได้หลาย events แต่แต่ละ event มีได้แค่หนึ่ง class ความสัมพันธ์นี้ enforce ด้วย foreign key constraint ทำให้ไม่สามารถบันทึก event ที่มี class_id ซึ่งไม่มีอยู่ใน fod_classes ได้

---

## ตัวอย่างข้อมูลใน Database

เมื่อระบบตรวจพบ Bolt บนรันเวย์ ข้อมูลที่บันทึกลง events จะมีลักษณะดังนี้ id เป็น UUID เช่น a3b8d1b6-0b3b-4b1a-9c1a-1a2b3c4d5e6f, ts เป็นเวลา detection เช่น 2026-03-16 12:00:00+07, class_id เป็น 1 ซึ่งตรงกับ Bolt ใน fod_classes, object_count เป็น 1, confidence เป็น 0.93, latitude เป็น 13.6900, longitude เป็น 100.7500, source เป็น monitoring, source_ref เป็น room-abc123, bbox เป็น JSON เช่น [0.45, 0.60, 0.12, 0.08] และ meta เป็น JSON เช่น {"yaw": 92.3, "model": "best.pt", "track_id": "obj-7"}
