//! Database layer for FOD Detection Backend
//! Contains all database models, queries, and helper functions

use axum::http::StatusCode;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use sqlx::{FromRow, PgPool};
use time::OffsetDateTime;
use tracing::error;
use uuid::Uuid;

// ==================== Database Models ====================

/// Event record from database
#[allow(dead_code)]
#[derive(FromRow, Serialize, Deserialize, Debug)]
pub struct Event {
    pub id: Uuid,
    pub ts: OffsetDateTime,
    pub class_id: i32,
    pub object_count: i32,
    pub confidence: f32,
    pub latitude: f32,
    pub longitude: f32,
    pub source: String,
    pub source_ref: String,
    pub bbox: Option<serde_json::Value>,
    pub meta: Option<serde_json::Value>,
    pub created_at: Option<OffsetDateTime>,
}

/// FOD Class record
#[allow(dead_code)]
#[derive(FromRow, Serialize, Deserialize, Debug)]
pub struct FodClass {
    pub id: i32,
    pub name: String,
    pub description: Option<String>,
    pub created_at: Option<OffsetDateTime>,
}

/// Recent event with joined class name
#[derive(Serialize, FromRow)]
pub struct RecentEvent {
    pub id: Uuid,
    pub ts: OffsetDateTime,
    pub class_name: String,
    pub object_count: i32,
    pub confidence: f32,
    pub latitude: f32,
    pub longitude: f32,
    pub source: String,
    pub source_ref: String,
}

/// Dashboard summary response
#[derive(Serialize)]
pub struct DashboardSummary {
    pub total_24h: i64,
    pub avg_conf: Option<f64>,
    pub top_fod: Option<String>,
}

// ==================== Helper Functions ====================

/// Convert any error to internal server error
pub fn internal<E: std::fmt::Display>(e: E) -> (StatusCode, String) {
    error!(error=%e, "internal error");
    (StatusCode::INTERNAL_SERVER_ERROR, e.to_string())
}

// ==================== Database Queries ====================

/// Check database health
pub async fn check_health(db: &PgPool) -> Result<i32, (StatusCode, String)> {
    sqlx::query_scalar("SELECT 1::INT")
        .fetch_one(db)
        .await
        .map_err(internal)
}

/// Get or create FOD class by name, returns class ID
pub async fn get_or_create_class(db: &PgPool, name: &str) -> Result<i32, (StatusCode, String)> {
    sqlx::query_scalar(
        "INSERT INTO fod_classes (name, description) VALUES ($1, $2) ON CONFLICT (name) DO UPDATE SET name = EXCLUDED.name RETURNING id",
    )
    .bind(name)
    .bind(format!("Auto-created class for: {}", name))
    .fetch_one(db)
    .await
    .map_err(internal)
}

/// Insert a new event, returns event ID
pub async fn insert_event(
    db: &PgPool,
    ts: OffsetDateTime,
    class_id: i32,
    object_count: i32,
    confidence: f32,
    latitude: f32,
    longitude: f32,
    source: &str,
    source_ref: &str,
    bbox: Option<Value>,
    meta: Option<Value>,
) -> Result<Uuid, (StatusCode, String)> {
    sqlx::query_scalar(
        r#"
        INSERT INTO events (ts, class_id, object_count, confidence, latitude, longitude, source, source_ref, bbox, meta)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
        RETURNING id
        "#
    )
    .bind(ts)
    .bind(class_id)
    .bind(object_count)
    .bind(confidence)
    .bind(latitude)
    .bind(longitude)
    .bind(source)
    .bind(source_ref)
    .bind(bbox)
    .bind(meta)
    .fetch_one(db)
    .await
    .map_err(internal)
}

/// Insert event with current timestamp
pub async fn insert_event_now(
    db: &PgPool,
    class_id: i32,
    confidence: f32,
    latitude: f32,
    longitude: f32,
    source: &str,
    source_ref: &str,
    bbox: Option<Value>,
    meta: Value,
) -> Result<Uuid, (StatusCode, String)> {
    sqlx::query_scalar(
        r#"
        INSERT INTO events (ts, class_id, object_count, confidence, latitude, longitude, source, source_ref, bbox, meta)
        VALUES (NOW(), $1, 1, $2, $3, $4, $5, $6, $7, $8)
        RETURNING id
        "#
    )
    .bind(class_id)
    .bind(confidence)
    .bind(latitude)
    .bind(longitude)
    .bind(source)
    .bind(source_ref)
    .bind(bbox)
    .bind(meta)
    .fetch_one(db)
    .await
    .map_err(internal)
}

/// Check if event with track_id exists in last 10 seconds (for deduplication)
pub async fn check_duplicate_track(
    db: &PgPool,
    source_ref: &str,
    track_id: &str,
) -> Result<Option<Uuid>, (StatusCode, String)> {
    sqlx::query_scalar(
        r#"SELECT id FROM events WHERE ts > NOW() - INTERVAL '10 seconds' AND source_ref = $1 AND meta->>'track_id' = $2 LIMIT 1"#
    )
    .bind(source_ref)
    .bind(track_id)
    .fetch_optional(db)
    .await
    .map_err(internal)
}

/// Get dashboard summary (24h stats)
pub async fn get_summary(db: &PgPool) -> Result<DashboardSummary, (StatusCode, String)> {
    let total_24h: i64 = sqlx::query_scalar(
        r#"SELECT COALESCE(SUM(object_count), 0)::BIGINT FROM events WHERE ts >= NOW() - INTERVAL '24 hours'"#
    )
    .fetch_one(db)
    .await
    .map_err(internal)?;

    let avg_conf: Option<f64> = sqlx::query_scalar(
        r#"SELECT AVG(confidence) FROM events WHERE ts >= NOW() - INTERVAL '24 hours'"#
    )
    .fetch_one(db)
    .await
    .map_err(internal)?;

    let top_fod: Option<String> = sqlx::query_scalar(
        r#"
        SELECT fc.name FROM events e
        JOIN fod_classes fc ON e.class_id = fc.id
        WHERE e.ts >= NOW() - INTERVAL '24 hours'
        GROUP BY fc.name ORDER BY COUNT(*) DESC LIMIT 1
        "#
    )
    .fetch_optional(db)
    .await
    .map_err(internal)?;

    Ok(DashboardSummary { total_24h, avg_conf, top_fod })
}

/// Get recent events with optional limit
pub async fn get_recent(db: &PgPool, limit: i64) -> Result<Vec<RecentEvent>, (StatusCode, String)> {
    sqlx::query_as::<_, RecentEvent>(
        r#"
        SELECT e.id, e.ts, fc.name as class_name, e.object_count, e.confidence,
               e.latitude, e.longitude, e.source, e.source_ref
        FROM events e
        JOIN fod_classes fc ON e.class_id = fc.id
        ORDER BY e.ts DESC
        LIMIT $1
        "#
    )
    .bind(limit)
    .fetch_all(db)
    .await
    .map_err(internal)
}

/// Get events with optional filters
pub async fn query_events(
    db: &PgPool,
    class_name: Option<&str>,
    limit: i64,
) -> Result<Vec<RecentEvent>, (StatusCode, String)> {
    if let Some(name) = class_name {
        sqlx::query_as::<_, RecentEvent>(
            r#"
            SELECT e.id, e.ts, fc.name as class_name, e.object_count, e.confidence,
                   e.latitude, e.longitude, e.source, e.source_ref
            FROM events e
            JOIN fod_classes fc ON e.class_id = fc.id
            WHERE fc.name = $1
            ORDER BY e.ts DESC
            LIMIT $2
            "#
        )
        .bind(name)
        .bind(limit)
        .fetch_all(db)
        .await
        .map_err(internal)
    } else {
        get_recent(db, limit).await
    }
}
