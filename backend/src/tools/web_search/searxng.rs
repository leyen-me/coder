use reqwest::StatusCode;
use serde::Deserialize;

use super::{WebSearchResult, WebSearchResultItem, WebSearchToolError};
use crate::tools::network::{build_http_client, validate_public_url, NetworkToolError};

#[derive(Debug, Deserialize)]
struct SearxngSearchResponse {
    #[serde(default)]
    results: Vec<SearxngSearchResult>,
}

#[derive(Debug, Deserialize)]
struct SearxngSearchResult {
    title: String,
    url: String,
    #[serde(default)]
    content: String,
    #[serde(default)]
    score: Option<f64>,
}

pub async fn search_searxng(
    query: &str,
    base_url: &str,
    allow_private_network: bool,
    max_results: u8,
) -> Result<WebSearchResult, WebSearchToolError> {
    let validated_base = validate_public_url(base_url, allow_private_network)?;
    let search_url = validated_base
        .join("search")
        .map_err(|error| NetworkToolError::new("invalid_url", error.to_string()))?;

    let client = build_http_client()?;
    let response = client
        .get(search_url)
        .query(&[("q", query), ("format", "json")])
        .send()
        .await
        .map_err(|error| NetworkToolError::new("provider_error", error.to_string()))?;

    let status = response.status();
    let body = response
        .text()
        .await
        .map_err(|error| NetworkToolError::new("provider_error", error.to_string()))?;

    if status == StatusCode::FORBIDDEN {
        return Err(NetworkToolError::new(
            "provider_error",
            "SearXNG instance rejected the request. JSON search may be disabled on this instance.",
        ));
    }

    if !status.is_success() {
        return Err(NetworkToolError::new(
            "provider_error",
            format!("SearXNG returned HTTP {}: {}", status.as_u16(), body),
        ));
    }

    let parsed: SearxngSearchResponse = serde_json::from_str(&body).map_err(|error| {
        NetworkToolError::new(
            "provider_error",
            format!("Failed to parse SearXNG response: {error}"),
        )
    })?;

    let results = parsed
        .results
        .into_iter()
        .take(max_results as usize)
        .map(|item| WebSearchResultItem {
            title: item.title,
            url: item.url,
            snippet: item.content,
            score: item.score,
        })
        .collect();

    Ok(WebSearchResult {
        query: query.to_string(),
        results,
        answer: None,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn rejects_invalid_searxng_base_url() {
        let error = validate_public_url("not-a-url", false).unwrap_err();
        assert_eq!(error.code, "invalid_url");
    }

    #[test]
    fn rejects_localhost_searxng_when_private_network_disabled() {
        let error = validate_public_url("http://localhost:8080", false).unwrap_err();
        assert_eq!(error.code, "blocked_url");
    }
}
