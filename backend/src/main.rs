//! FOD Detection Backend - REST API Server
//! Handles requests from frontend and proxies to AI service

mod db;

use axum::{
    extract::{Multipart, State, Query},
    http::{HeaderValue, Method, StatusCode},
    response::IntoResponse,
    routing::{get, post},
    Json, Router,
};
use reqwest::Client;
use serde::Deserialize;
use serde_json::Value;
use serde_json::json;
use sqlx::PgPool;
use std::{env, net::SocketAddr};
use tower_http::{cors::CorsLayer, trace::TraceLayer};
use tracing::info;
use tracing_subscriber::{fmt, EnvFilter};

use db::{internal, DashboardSummary, RecentEvent};

// ==================== App State ====================

#[derive(Clone)]
struct AppState {
    http: Client,
    ai_base: String,
    db: PgPool,
}

// ==================== Request Types ====================

#[derive(Deserialize)]
struct SaveParams {
    save: Option<bool>,
    latitude: Option<f32>,
    longitude: Option<f32>,
    source: Option<String>,
    source_ref: Option<String>,
    yaw: Option<f32>,
    conf: Option<f32>,
    imgsz: Option<i32>,
}

#[derive(Deserialize)]
struct IngestEventRequest {
    ts: String,
    object_class: String,
    object_count: i32,
    confidence: f32,
    latitude: f32,
    longitude: f32,
    source: String,
    source_ref: String,
    bbox: Option<serde_json::Value>,
    meta: Option<serde_json::Value>,
}

// ==================== Main ====================

#[tokio::main]
async fn main() {
    let filter = EnvFilter::try_from_default_env().unwrap_or_else(|_| EnvFilter::new("info"));
    fmt().with_env_filter(filter).init();

    let database_url = env::var("DATABASE_URL").expect("DATABASE_URL must be set");
    let ai_base = env::var("AI_BASE_URL").unwrap_or_else(|_| "http://ai:8001".to_string());
    info!(%ai_base, "AI base url");

    let db = PgPool::connect(&database_url).await.expect("Failed to connect to database");
    sqlx::migrate!().run(&db).await.expect("Failed to run migrations");

    let state = AppState { http: Client::new(), ai_base, db };

    let cors = CorsLayer::new()
        .allow_origin("http://localhost:3000".parse::<HeaderValue>().unwrap())
        .allow_methods([Method::GET, Method::POST, Method::OPTIONS])
        .allow_headers(tower_http::cors::Any);

    let app = Router::new()
        .route("/health", get(health))
        .route("/health/ai", get(ai_health))
        .route("/health/ai-ready", get(ai_ready))
        .route("/health/db", get(db_health))
        .route("/infer", post(infer))
        .route("/proxy/detect", post(proxy_detect))
        .route("/dashboard/summary", get(dashboard_summary))
        .route("/events/recent", get(recent_events))
        .route("/events/query", get(query_events))
        .route("/events/ingest", post(ingest_event))
        .with_state(state)
        .layer(TraceLayer::new_for_http())
        .layer(cors);

    let port: u16 = env::var("PORT").ok().and_then(|s| s.parse().ok()).unwrap_or(8000);
    let addr = SocketAddr::from(([0, 0, 0, 0], port));
    let listener = tokio::net::TcpListener::bind(addr).await.expect("Failed to bind");
    info!(%addr, "backend listening");
    axum::serve(listener, app).await.unwrap();
}

// ==================== Health Endpoints ====================

async fn health() -> Json<Value> { Json(json!({"ok": true})) }

async fn db_health(State(st): State<AppState>) -> Result<impl IntoResponse, (StatusCode, String)> {
    let v = db::check_health(&st.db).await?;
    Ok(Json(json!({"ok": true, "db": v})))
}

async fn ai_health(State(st): State<AppState>) -> Result<impl IntoResponse, (StatusCode, String)> {
    let url = format!("{}/health", st.ai_base.trim_end_matches('/'));
    let resp = st.http.get(&url).send().await.map_err(internal)?;
    let v: Value = resp.json().await.map_err(internal)?;
    Ok(Json(v))
}

async fn ai_ready(State(st): State<AppState>) -> Result<impl IntoResponse, (StatusCode, String)> {
    let url = format!("{}/ready", st.ai_base.trim_end_matches('/'));
    let resp = st.http.get(&url).send().await.map_err(internal)?;
    let v: Value = resp.json().await.map_err(internal)?;
    Ok(Json(v))
}

// ==================== AI Proxy Helpers ====================

async fn extract_file(mp: &mut Multipart, default: &str) -> Result<(bytes::Bytes, String), (StatusCode, String)> {
    while let Some(field) = mp.next_field().await.map_err(internal)? {
        if field.name() == Some("file") {
            let filename = field.file_name().map(|s| s.to_string()).unwrap_or_else(|| default.to_string());
            let bytes = field.bytes().await.map_err(internal)?;
            return Ok((bytes, filename));
        }
    }
    Err((StatusCode::BAD_REQUEST, "No file field".to_string()))
}

fn build_ai_url(base: &str, endpoint: &str, conf: Option<f32>, imgsz: Option<i32>) -> String {
    let mut url = format!("{}/{}", base.trim_end_matches('/'), endpoint);
    let mut params = vec![];
    if let Some(c) = conf { params.push(format!("conf={}", c)); }
    if let Some(s) = imgsz { params.push(format!("imgsz={}", s)); }
    if !params.is_empty() { url.push_str(&format!("?{}", params.join("&"))); }
    url
}

async fn send_to_ai(client: &Client, url: &str, bytes: bytes::Bytes, filename: String) -> Result<Value, (StatusCode, String)> {
    let part = reqwest::multipart::Part::bytes(bytes.to_vec()).file_name(filename).mime_str("image/jpeg").unwrap();
    let form = reqwest::multipart::Form::new().part("file", part);
    let resp = client.post(url).multipart(form).send().await.map_err(internal)?;
    let status = resp.status();
    let result: Value = resp.json().await.map_err(internal)?;
    if !status.is_success() {
        return Err((StatusCode::from_u16(status.as_u16()).unwrap_or(StatusCode::INTERNAL_SERVER_ERROR), format!("ai error: {}", result)));
    }
    Ok(result)
}

// ==================== AI Inference Endpoints ====================

async fn infer(
    State(state): State<AppState>,
    Query(params): Query<SaveParams>,
    mut mp: Multipart,
) -> Result<impl IntoResponse, (StatusCode, String)> {
    let (bytes, filename) = extract_file(&mut mp, "upload.jpg").await?;
    let url = build_ai_url(&state.ai_base, "v1/detect", params.conf, params.imgsz);
    let result = send_to_ai(&state.http, &url, bytes, filename).await?;
    maybe_save(&state, &result, &params).await?;
    Ok(Json(result))
}

async fn proxy_detect(
    State(state): State<AppState>,
    Query(params): Query<SaveParams>,
    mut mp: Multipart,
) -> Result<impl IntoResponse, (StatusCode, String)> {
    let (bytes, filename) = extract_file(&mut mp, "upload.jpg").await?;
    let url = build_ai_url(&state.ai_base, "v1/detect", params.conf, params.imgsz);
    let result = send_to_ai(&state.http, &url, bytes, filename).await?;
    maybe_save(&state, &result, &params).await?;
    Ok(Json(result))
}

async fn maybe_save(state: &AppState, result: &Value, params: &SaveParams) -> Result<(), (StatusCode, String)> {
    if !params.save.unwrap_or(false) { return Ok(()); }
    
    let lat = params.latitude.unwrap_or(0.0);
    let lon = params.longitude.unwrap_or(0.0);
    let source = params.source.clone().unwrap_or_else(|| "monitoring".to_string());
    let source_ref = params.source_ref.clone().unwrap_or_else(|| "live_feed".to_string());
    
    if let Some(detections) = result.get("detections").and_then(|v| v.as_array()) {
        for det in detections {
            if let (Some(cls), Some(conf)) = (det.get("cls").and_then(|v| v.as_str()), det.get("conf").and_then(|v| v.as_f64())) {
                // Check for duplicate by track_id
                if let Some(tid) = det.get("track_id").and_then(|v| v.as_str()) {
                    if db::check_duplicate_track(&state.db, &source_ref, tid).await?.is_some() { continue; }
                }
                
                let class_id = db::get_or_create_class(&state.db, cls).await?;
                let bbox = det.get("bbox_xywh_norm").cloned().or_else(|| det.get("bbox_xywh").cloned());
                
                let mut meta = serde_json::Map::new();
                if let Some(m) = result.get("model").cloned() { meta.insert("model".to_string(), m); }
                if let Some(w) = result.get("img_w").cloned() { meta.insert("img_w".to_string(), w); }
                if let Some(h) = result.get("img_h").cloned() { meta.insert("img_h".to_string(), h); }
                if let Some(y) = params.yaw { meta.insert("yaw".to_string(), json!(y)); }
                if let Some(tid) = det.get("track_id").and_then(|v| v.as_str()) { meta.insert("track_id".to_string(), json!(tid)); }
                
                db::insert_event_now(&state.db, class_id, conf as f32, lat, lon, &source, &source_ref, bbox, Value::Object(meta)).await?;
            }
        }
    }
    Ok(())
}

// ==================== Event Endpoints ====================

async fn ingest_event(
    State(state): State<AppState>,
    Json(payload): Json<IngestEventRequest>,
) -> Result<impl IntoResponse, (StatusCode, String)> {
    let class_id = db::get_or_create_class(&state.db, &payload.object_class).await?;
    let ts = time::OffsetDateTime::parse(&payload.ts, &time::format_description::well_known::Rfc3339)
        .map_err(|_| (StatusCode::BAD_REQUEST, "Invalid timestamp".to_string()))?;
    
    let event_id = db::insert_event(
        &state.db, ts, class_id, payload.object_count, payload.confidence,
        payload.latitude, payload.longitude, &payload.source, &payload.source_ref,
        payload.bbox, payload.meta,
    ).await?;
    
    Ok(Json(json!({"id": event_id, "status": "success"})))
}

async fn dashboard_summary(State(state): State<AppState>) -> Result<impl IntoResponse, (StatusCode, String)> {
    let summary: DashboardSummary = db::get_summary(&state.db).await?;
    Ok(Json(summary))
}

async fn recent_events(
    State(state): State<AppState>,
    Query(q): Query<std::collections::HashMap<String, String>>,
) -> Result<impl IntoResponse, (StatusCode, String)> {
    let limit = q.get("limit").and_then(|s| s.parse::<i64>().ok()).filter(|&n| n > 0 && n <= 500).unwrap_or(100);
    let rows: Vec<RecentEvent> = db::get_recent(&state.db, limit).await?;
    Ok(Json(rows))
}

async fn query_events(
    State(state): State<AppState>,
    Query(q): Query<std::collections::HashMap<String, String>>,
) -> Result<impl IntoResponse, (StatusCode, String)> {
    let limit = q.get("limit").and_then(|s| s.parse::<i64>().ok()).filter(|&n| n > 0 && n <= 500).unwrap_or(100);
    let class_name = q.get("class");
    let rows: Vec<RecentEvent> = db::query_events(&state.db, class_name.map(|s| s.as_str()), limit).await?;
    Ok(Json(rows))
}