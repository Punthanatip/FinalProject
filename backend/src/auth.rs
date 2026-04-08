//! Authentication module for FOD Detection Backend
//! Handles login, JWT creation/verification, and user setup

use axum::{
    extract::State,
    http::{HeaderMap, StatusCode},
    response::IntoResponse,
    Json,
};
use jsonwebtoken::{decode, encode, DecodingKey, EncodingKey, Header, Validation};
use serde::{Deserialize, Serialize};
use serde_json::json;
use sqlx::PgPool;
use std::env;
use time::{Duration, OffsetDateTime};
use uuid::Uuid;

use crate::{db::internal, AppState};

// ==================== JWT Claims ====================

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct Claims {
    pub sub: String,      // user UUID
    pub username: String,
    pub role: String,
    pub exp: i64,         // unix timestamp
}

// ==================== Request/Response Types ====================

#[derive(Deserialize)]
pub struct LoginRequest {
    pub username: String,
    pub password: String,
}

// ==================== JWT Helpers ====================

fn jwt_secret() -> String {
    env::var("JWT_SECRET")
        .unwrap_or_else(|_| "change_this_secret_in_production_32chars!".to_string())
}

pub fn create_token(user_id: &str, username: &str, role: &str) -> Result<String, String> {
    let exp = (OffsetDateTime::now_utc() + Duration::hours(8)).unix_timestamp();
    let claims = Claims {
        sub: user_id.to_string(),
        username: username.to_string(),
        role: role.to_string(),
        exp,
    };
    encode(
        &Header::default(),
        &claims,
        &EncodingKey::from_secret(jwt_secret().as_bytes()),
    )
    .map_err(|e| e.to_string())
}

pub fn verify_token(token: &str) -> Result<Claims, String> {
    decode::<Claims>(
        token,
        &DecodingKey::from_secret(jwt_secret().as_bytes()),
        &Validation::default(),
    )
    .map(|d| d.claims)
    .map_err(|e| e.to_string())
}

fn extract_bearer(headers: &HeaderMap) -> Option<String> {
    let auth = headers.get("authorization")?.to_str().ok()?;
    auth.strip_prefix("Bearer ").map(|s| s.to_string())
}

// ==================== Auth Models ====================

#[allow(dead_code)]
struct UserRow {
    id: Uuid,
    username: String,
    password_hash: String,
    role: String,
}

// ==================== Handlers ====================

/// POST /auth/login — รับ username/password คืน JWT
pub async fn login_handler(
    State(st): State<AppState>,
    Json(payload): Json<LoginRequest>,
) -> Result<impl IntoResponse, (StatusCode, String)> {
    // Query user by username (runtime query — ไม่ต้องการ DATABASE_URL ตอน compile)
    let row = sqlx::query_as::<_, (Uuid, String, String, String)>(
        "SELECT id, username, password_hash, role FROM users WHERE username = $1",
    )
    .bind(&payload.username)
    .fetch_optional(&st.db)
    .await
    .map_err(internal)?
    .ok_or((StatusCode::UNAUTHORIZED, "Invalid credentials".to_string()))?;

    let (user_id, username, password_hash, role) = row;

    // Verify bcrypt hash
    let valid = bcrypt::verify(&payload.password, &password_hash)
        .map_err(|_| (StatusCode::INTERNAL_SERVER_ERROR, "Hash error".to_string()))?;
    if !valid {
        return Err((StatusCode::UNAUTHORIZED, "Invalid credentials".to_string()));
    }

    // สร้าง JWT
    let token = create_token(&user_id.to_string(), &username, &role)
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e))?;

    Ok(Json(json!({
        "token": token,
        "username": username,
        "role": role,
    })))
}

/// GET /auth/me — ตรวจ JWT ที่แนบมากับ Authorization header คืน user info
pub async fn me_handler(
    headers: HeaderMap,
) -> Result<impl IntoResponse, (StatusCode, String)> {
    let token = extract_bearer(&headers)
        .ok_or((StatusCode::UNAUTHORIZED, "No token provided".to_string()))?;

    let claims = verify_token(&token)
        .map_err(|_| (StatusCode::UNAUTHORIZED, "Invalid or expired token".to_string()))?;

    Ok(Json(json!({
        "sub":      claims.sub,
        "username": claims.username,
        "role":     claims.role,
        "exp":      claims.exp,
    })))
}

/// POST /auth/logout — Stateless JWT ไม่มี server-side session
/// Frontend จะลบ cookie เอง แต่ endpoint นี้ return ok เพื่อ complete the flow
pub async fn logout_handler() -> impl IntoResponse {
    Json(json!({ "ok": true, "message": "Logged out" }))
}

/// POST /auth/register — สมัครสมาชิกแบบเปิด ทุกคน register ได้เลย
pub async fn register_handler(
    State(st): State<AppState>,
    Json(payload): Json<LoginRequest>,
) -> Result<impl IntoResponse, (StatusCode, String)> {
    if payload.username.is_empty() || payload.password.len() < 6 {
        return Err((
            StatusCode::BAD_REQUEST,
            "Username required and password must be at least 6 characters".to_string(),
        ));
    }

    // ตรวจว่า username ซ้ำหรือไม่
    let existing: Option<i64> = sqlx::query_scalar(
        "SELECT COUNT(*)::BIGINT FROM users WHERE username = $1",
    )
    .bind(&payload.username)
    .fetch_one(&st.db)
    .await
    .map_err(internal)?;

    if existing.unwrap_or(0) > 0 {
        return Err((
            StatusCode::CONFLICT,
            "Username already taken".to_string(),
        ));
    }

    // Hash password ด้วย bcrypt (cost=10)
    let password_hash = bcrypt::hash(&payload.password, 10)
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

    let user_id: uuid::Uuid = sqlx::query_scalar(
        "INSERT INTO users (username, password_hash, role) VALUES ($1, $2, 'user') RETURNING id",
    )
    .bind(&payload.username)
    .bind(&password_hash)
    .fetch_one(&st.db)
    .await
    .map_err(internal)?;

    // สร้าง JWT แล้ว login อัตโนมัติ
    let token = create_token(&user_id.to_string(), &payload.username, "user")
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e))?;

    Ok(Json(json!({
        "token": token,
        "username": payload.username,
        "role": "user",
    })))
}
