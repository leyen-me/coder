use regex::Regex;
use serde::Serialize;

use super::network::{
    build_http_client, fetch_public_url, validate_public_url, NetworkToolError, FetchedResponse,
};
use super::page_cache::{CachedPage, PageCache};

/// Default lines per page when start_line/max_lines are not specified.
const DEFAULT_MAX_LINES: u32 = 500;

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BrowsePageResult {
    pub url: String,
    pub final_url: String,
    pub title: Option<String>,
    pub content: String,
    pub truncated: bool,
    pub total_lines: u32,
    pub start_line: u32,
    pub end_line: u32,
    pub status_code: u16,
    pub content_type: Option<String>,
}

pub type BrowsePageToolError = NetworkToolError;

pub async fn tool_browse_page(
    page_cache: &PageCache,
    url: String,
    start_line: Option<u32>,
    max_lines: Option<u32>,
    allow_private_network: Option<bool>,
) -> Result<BrowsePageResult, BrowsePageToolError> {
    let trimmed = url.trim();
    if trimmed.is_empty() {
        return Err(NetworkToolError::new("invalid_arguments", "url is required"));
    }

    let start = start_line.unwrap_or(1).max(1);
    let max = max_lines.unwrap_or(DEFAULT_MAX_LINES).max(1);
    let allow_private_network = allow_private_network.unwrap_or(true);

    let owned_url = trimmed.to_string();

    // Try cache first (keyed by original request URL).
    if let Some(cached) = page_cache.get(&owned_url) {
        validate_public_url(trimmed, allow_private_network)?;
        if cached.final_url != owned_url {
            validate_public_url(&cached.final_url, allow_private_network)?;
        }

        let total_lines = cached.lines.len() as u32;
        let end = (start as usize + max as usize - 1).min(total_lines as usize);
        let truncated = end < total_lines as usize;

        let slice: Vec<&str> = if (start as usize) <= total_lines as usize {
            cached.lines[(start as usize - 1)..end]
                .iter()
                .map(String::as_str)
                .collect()
        } else {
            Vec::new()
        };

        return Ok(BrowsePageResult {
            url: owned_url,
            final_url: cached.final_url,
            title: cached.title,
            content: slice.join("\n"),
            truncated,
            total_lines,
            start_line: start,
            end_line: page_end_line(start, end, total_lines),
            status_code: 0, // Cache hit – status not stored.
            content_type: None,
        });
    }

    // Cache miss – fetch the page.
    let client = build_http_client()?;
    let fetched = fetch_public_url(&client, trimmed, allow_private_network).await?;
    let title = extract_title(&fetched.body);
    let raw_text = convert_body_to_text(&fetched);

    // Normalize line endings and split into lines.
    let all_lines: Vec<String> = raw_text
        .lines()
        .map(|line| line.to_string())
        .collect();
    let total_lines = all_lines.len() as u32;

    // Store in cache for future pagination requests.
    page_cache.insert(
        owned_url.clone(),
        CachedPage {
            lines: all_lines.clone(),
            title: title.clone(),
            final_url: fetched.final_url.clone(),
            cached_at: std::time::Instant::now(),
        },
    );

    // Slice the requested portion.
    let end = (start as usize + max as usize - 1).min(total_lines as usize);
    let truncated = end < total_lines as usize;

    let slice: Vec<&str> = if (start as usize) <= total_lines as usize {
        all_lines[(start as usize - 1)..end]
            .iter()
            .map(String::as_str)
            .collect()
    } else {
        Vec::new()
    };

    Ok(BrowsePageResult {
        url: owned_url,
        final_url: fetched.final_url,
        title,
        content: slice.join("\n"),
        truncated,
        total_lines,
        start_line: start,
        end_line: page_end_line(start, end, total_lines),
        status_code: fetched.status_code,
        content_type: fetched.content_type,
    })
}

fn page_end_line(start: u32, slice_end: usize, total_lines: u32) -> u32 {
    if (start as usize) > total_lines as usize {
        start
    } else {
        slice_end as u32
    }
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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn extract_title_basic() {
        let html = "<html><head><title>Hello World</title></head></html>";
        assert_eq!(extract_title(html), Some("Hello World".into()));
    }

    #[test]
    fn extract_title_multiline() {
        let html = "<html><head><title>\n  Hello \n World  \n</title></head></html>";
        assert_eq!(extract_title(html), Some("Hello World".into()));
    }

    #[test]
    fn extract_title_none_when_missing() {
        let html = "<html><head></head></html>";
        assert_eq!(extract_title(html), None);
    }

    #[test]
    fn extract_title_case_insensitive() {
        let html = "<HTML><HEAD><TITLE>UPPER</TITLE></HEAD></HTML>";
        assert_eq!(extract_title(html), Some("UPPER".into()));
    }

    #[test]
    fn looks_like_html_doctype() {
        assert!(looks_like_html("<!DOCTYPE html>"));
        assert!(looks_like_html("<!doctype html>"));
    }

    #[test]
    fn looks_like_html_tag() {
        assert!(looks_like_html("<html>"));
        assert!(looks_like_html("<HTML lang=\"en\">"));
    }

    #[test]
    fn looks_like_html_not_html() {
        assert!(!looks_like_html("Hello, world!"));
        assert!(!looks_like_html("{ \"json\": true }"));
    }

    #[test]
    fn page_end_line_when_start_past_total_is_start() {
        assert_eq!(page_end_line(50, 10, 10), 50);
    }

    #[test]
    fn page_end_line_when_in_range_uses_slice_end() {
        assert_eq!(page_end_line(1, 5, 10), 5);
    }
}
