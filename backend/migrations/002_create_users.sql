-- Migration 002: Create users table for authentication
-- pgcrypto (gen_random_uuid) is already enabled in migration 001

CREATE TABLE IF NOT EXISTS users (
    id            UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    username      VARCHAR(100) NOT NULL UNIQUE,
    password_hash VARCHAR(255) NOT NULL,
    role          VARCHAR(50)  NOT NULL DEFAULT 'viewer',
    created_at    TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_users_username ON users (username);

-- NOTE: ไม่ seed admin ที่นี่ เพราะ password_hash ต้องสร้างจาก bcrypt
-- ให้เรียก POST /auth/setup {"username":"admin","password":"..."} ครั้งแรก
-- endpoint นี้จะทำงานได้เฉพาะตอนที่ยังไม่มี user อยู่ในระบบเท่านั้น
