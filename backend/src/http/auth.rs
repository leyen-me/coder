//! Authentication via password (environment variable `CODER_PASSWORD`).
//!
//! When `CODER_PASSWORD` is set, all `/api/*` requests (except login and status)
//! must carry a cookie whose value is a SHA-256 hex digest of the password.
//! The login endpoint validates the password and sets the cookie on success.

use axum::{
    extract::Request,
    http::{header, StatusCode},
    middleware::Next,
    response::{IntoResponse, Json, Response},
    routing::{get, post},
    Router,
};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};

/// Cookie name for the auth token.
const COOKIE_NAME: &str = "coder_token";

// ── Helpers ────────────────────────────────────────────────────────────

/// Hash the password into a token (hex-encoded SHA-256).
fn hash_password(password: &str) -> String {
    let mut hasher = Sha256::new();
    hasher.update(password.as_bytes());
    hex::encode(hasher.finalize())
}

/// Read `CODER_PASSWORD` from the environment and return the expected token, if set.
fn expected_token() -> Option<String> {
    std::env::var("CODER_PASSWORD")
        .ok()
        .filter(|p| !p.is_empty())
        .map(|p| hash_password(&p))
}

/// Extract the token from the `Cookie` header.
fn extract_token_from_cookie(headers: &axum::http::HeaderMap) -> Option<String> {
    let cookie_header = headers.get(header::COOKIE)?.to_str().ok()?;
    for pair in cookie_header.split(';') {
        let pair = pair.trim();
        if let Some(value) = pair.strip_prefix(&format!("{COOKIE_NAME}=")) {
            return Some(value.to_string());
        }
    }
    None
}

/// Build a `Set-Cookie` header value for the token.
fn set_cookie_header(value: &str) -> String {
    // 10 years — effectively permanent.
    format!(
        "{COOKIE_NAME}={value}; HttpOnly; SameSite=Lax; Path=/; Max-Age=315360000"
    )
}

/// Build a `Set-Cookie` header that clears the token (logout).
fn clear_cookie_header() -> String {
    format!(
        "{COOKIE_NAME}=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0"
    )
}

/// Constant-time string comparison.
fn ct_eq(a: &str, b: &str) -> bool {
    a.len() == b.len()
        && a.as_bytes()
            .iter()
            .zip(b.as_bytes().iter())
            .fold(0u8, |acc, (x, y)| acc | (x ^ y))
            == 0
}

// ── Request / Response types ────────────────────────────────────────────

#[derive(Deserialize)]
pub struct LoginRequest {
    pub password: String,
}

#[derive(Serialize)]
pub struct AuthStatusResponse {
    pub authenticated: bool,
}

// ── Routes ──────────────────────────────────────────────────────────────

/// POST /api/auth/login — validate password, set cookie on success.
async fn handle_login(Json(body): Json<LoginRequest>) -> Response {
    let expected = match expected_token() {
        Some(t) => t,
        None => {
            return (
                StatusCode::FORBIDDEN,
                "Password authentication is not configured",
            )
                .into_response();
        }
    };

    if !ct_eq(&expected, &hash_password(&body.password)) {
        return (StatusCode::UNAUTHORIZED, "Invalid password").into_response();
    }

    // Set cookie and return 200; the frontend handles navigation.
    (
        [(header::SET_COOKIE, set_cookie_header(&expected))],
        Json(serde_json::json!({ "ok": true })),
    )
        .into_response()
}

/// GET /api/auth/status — returns whether the request is authenticated.
async fn handle_status(req: Request) -> Json<AuthStatusResponse> {
    let expected = expected_token();
    let authenticated = match expected {
        Some(token) => extract_token_from_cookie(req.headers())
            .map(|cookie_token| ct_eq(&cookie_token, &token))
            .unwrap_or(false),
        None => true,
    };
    Json(AuthStatusResponse { authenticated })
}

/// POST /api/auth/logout — clear the auth cookie.
async fn handle_logout() -> Response {
    (
        [(header::SET_COOKIE, clear_cookie_header())],
        Json(serde_json::json!({ "ok": true })),
    )
        .into_response()
}

// ── Middleware ───────────────────────────────────────────────────────────

/// Middleware that checks auth for all `/api/*` requests.
async fn auth_middleware(
    req: Request,
    next: Next,
) -> Result<Response, StatusCode> {
    let expected = match expected_token() {
        Some(t) => t,
        None => {
            // No password configured — skip auth entirely.
            return Ok(next.run(req).await);
        }
    };

    let path = req.uri().path();

    // Always allow auth endpoints themselves (login, status, logout).
    if path == "/api/auth/login" || path == "/api/auth/status" || path == "/api/auth/logout" {
        return Ok(next.run(req).await);
    }

    // Protect all other /api/* paths.
    if path.starts_with("/api/") {
        let token = extract_token_from_cookie(req.headers())
            .ok_or(StatusCode::UNAUTHORIZED)?;

        if !ct_eq(&token, &expected) {
            return Err(StatusCode::UNAUTHORIZED);
        }
    }

    Ok(next.run(req).await)
}

// ── Public API ──────────────────────────────────────────────────────────

/// Check whether CODER_PASSWORD is set in the environment.
pub fn is_password_configured() -> bool {
    expected_token().is_some()
}

/// Wrap a `Router` with the auth middleware and auth routes.
///
/// Call this from `build_router()` after building the main API router.
/// If `CODER_PASSWORD` is not set, the router is returned unchanged.
pub fn apply<R>(router: Router<R>) -> Router<R>
where
    R: Clone + Send + Sync + 'static,
{
    router
        .route("/api/auth/login", post(handle_login))
        .route("/api/auth/status", get(handle_status))
        .route("/api/auth/logout", post(handle_logout))
        .layer(axum::middleware::from_fn(auth_middleware))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_hash_password() {
        let h = hash_password("hello");
        assert_eq!(h.len(), 64);
    }

    #[test]
    fn test_ct_eq() {
        assert!(ct_eq("abc", "abc"));
        assert!(!ct_eq("abc", "ab"));
        assert!(!ct_eq("abc", "abd"));
        assert!(ct_eq("", ""));
    }

    #[test]
    fn test_expected_token_not_set() {
        std::env::remove_var("CODER_PASSWORD");
        assert!(!is_password_configured());
    }
}
