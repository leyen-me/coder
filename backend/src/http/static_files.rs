use axum::{
    body::Body,
    http::{HeaderValue, StatusCode, Uri},
    response::{IntoResponse, Response},
};
use rust_embed::RustEmbed;

#[derive(RustEmbed)]
#[folder = "../frontend/dist"]
struct Assets;

pub async fn handle_static_files(uri: Uri) -> Response {
    let path = uri.path().trim_start_matches('/');

    // Root path → index.html
    if path.is_empty() || path == "/" {
        return serve_embedded("index.html");
    }

    // Try matching a specific file
    if let Some(content) = Assets::get(path) {
        return serve_with_mime(path, content);
    }

    // SPA fallback: return index.html for client-side routing
    if let Some(index) = Assets::get("index.html") {
        return serve_with_mime("index.html", index);
    }

    Response::builder()
        .status(StatusCode::NOT_FOUND)
        .body(Body::from("Not found"))
        .unwrap()
}

fn serve_embedded(path: &str) -> Response {
    match Assets::get(path) {
        Some(content) => serve_with_mime(path, content),
        None => Response::builder()
            .status(StatusCode::NOT_FOUND)
            .body(Body::from("Not found"))
            .unwrap(),
    }
}

fn serve_with_mime(path: &str, content: rust_embed::EmbeddedFile) -> Response {
    let mime = mime_guess::from_path(path).first_or_octet_stream();
    Response::builder()
        .header(
            "content-type",
            HeaderValue::from_str(mime.as_ref()).unwrap(),
        )
        .body(Body::from(content.data))
        .unwrap()
}
