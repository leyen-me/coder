use reqwest::StatusCode;
use serde::{Deserialize, Serialize};

use super::network::{build_http_client, resolve_api_key, NetworkToolError};

const TAVILY_SEARCH_URL: &str = "https://api.tavily.com/search";
const DEFAULT_MAX_RESULTS: u8 = 5;
const MAX_MAX_RESULTS: u8 = 10;

#[derive(Debug, Serialize)]
struct TavilySearchRequest {
    query: String,
    max_results: u8,
    search_depth: &'static str,
}

#[derive(Debug, Deserialize)]
struct TavilySearchResponse {
    #[serde(default)]
    answer: Option<String>,
    #[serde(default)]
    results: Vec<TavilySearchResult>,
}

#[derive(Debug, Deserialize)]
struct TavilySearchResult {
    title: String,
    url: String,
    content: String,
    #[serde(default)]
    score: Option<f64>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WebSearchResultItem {
    pub title: String,
    pub url: String,
    pub snippet: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub score: Option<f64>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WebSearchResult {
    pub query: String,
    pub results: Vec<WebSearchResultItem>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub answer: Option<String>,
}

pub type WebSearchToolError = NetworkToolError;

pub async fn tool_web_search(
    search_term: String,
    api_key_source: String,
    api_key: Option<String>,
    api_key_env_var: Option<String>,
    max_results: Option<u8>,
) -> Result<WebSearchResult, WebSearchToolError> {
    let query = search_term.trim();
    if query.is_empty() {
        return Err(NetworkToolError::new(
            "invalid_arguments",
            "search_term is required",
        ));
    }

    let api_key = resolve_api_key(
        api_key_source.as_str(),
        api_key.as_deref(),
        api_key_env_var.as_deref().unwrap_or("TAVILY_API_KEY"),
    )?;

    let max_results = max_results
        .unwrap_or(DEFAULT_MAX_RESULTS)
        .clamp(1, MAX_MAX_RESULTS);

    let client = build_http_client()?;
    let request = TavilySearchRequest {
        query: query.to_string(),
        max_results,
        search_depth: "basic",
    };

    let response = client
        .post(TAVILY_SEARCH_URL)
        .header("Authorization", format!("Bearer {api_key}"))
        .json(&request)
        .send()
        .await
        .map_err(|error| NetworkToolError::new("provider_error", error.to_string()))?;

    let status = response.status();
    let body = response
        .text()
        .await
        .map_err(|error| NetworkToolError::new("provider_error", error.to_string()))?;

    if status == StatusCode::UNAUTHORIZED || status == StatusCode::FORBIDDEN {
        return Err(NetworkToolError::new(
            "invalid_api_key",
            "Tavily API key is invalid or unauthorized",
        ));
    }

    if status == StatusCode::TOO_MANY_REQUESTS {
        return Err(NetworkToolError::new(
            "rate_limited",
            "Tavily API rate limit exceeded. Try again later.",
        ));
    }

    if !status.is_success() {
        return Err(NetworkToolError::new(
            "provider_error",
            format!("Tavily API returned HTTP {}: {}", status.as_u16(), body),
        ));
    }

    let parsed: TavilySearchResponse = serde_json::from_str(&body).map_err(|error| {
        NetworkToolError::new(
            "provider_error",
            format!("Failed to parse Tavily response: {error}"),
        )
    })?;

    let results = parsed
        .results
        .into_iter()
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
        answer: parsed.answer,
    })
}
