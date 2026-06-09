use regex::Regex;
use serde::Serialize;

use super::network::{
    build_http_client, fetch_public_url, NetworkToolError, FetchedResponse,
};

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BrowsePageResult {
    pub url: String,
    pub final_url: String,
    pub title: Option<String>,
    pub content: String,
    pub truncated: bool,
    pub status_code: u16,
    pub content_type: Option<String>,
}

pub type BrowsePageToolError = NetworkToolError;

#[tauri::command]
pub async fn tool_browse_page(url: String) -> Result<BrowsePageResult, BrowsePageToolError> {
    let trimmed = url.trim();
    if trimmed.is_empty() {
        return Err(NetworkToolError::new("invalid_arguments", "url is required"));
    }

    let client = build_http_client()?;
    let fetched = fetch_public_url(&client, trimmed).await?;
    let title = extract_title(&fetched.body);
    let content = convert_body_to_text(&fetched);

    Ok(BrowsePageResult {
        url: trimmed.to_string(),
        final_url: fetched.final_url,
        title,
        content,
        truncated: fetched.truncated,
        status_code: fetched.status_code,
        content_type: fetched.content_type,
    })
}

fn convert_body_to_text(fetched: &FetchedResponse) -> String {
    let content_type = fetched.content_type.as_deref().unwrap_or("").to_ascii_lowercase();

    if content_type.contains("text/html") || looks_like_html(&fetched.body) {
        return html2text::from_read(fetched.body.as_bytes(), 120);
    }

    fetched.body.trim().to_string()
}

fn looks_like_html(body: &str) -> bool {
    let trimmed = body.trim_start();
    trimmed.starts_with("<!DOCTYPE")
        || trimmed.starts_with("<!doctype")
        || trimmed.starts_with("<html")
        || trimmed.starts_with("<HTML")
}

fn extract_title(html: &str) -> Option<String> {
    let pattern = Regex::new(r"(?is)<title[^>]*>(.*?)</title>").ok()?;
    let captures = pattern.captures(html)?;
    let title = captures
        .get(1)?
        .as_str()
        .trim()
        .replace('\n', " ")
        .split_whitespace()
        .collect::<Vec<_>>()
        .join(" ");

    if title.is_empty() {
        None
    } else {
        Some(title)
    }
}
