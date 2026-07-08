mod searxng;
mod tavily;

use serde::Serialize;

use super::network::NetworkToolError;

pub use searxng::search_searxng;
pub use tavily::search_tavily;

const DEFAULT_MAX_RESULTS: u8 = 5;
const MAX_MAX_RESULTS: u8 = 10;

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
    provider: Option<String>,
    api_key_source: Option<String>,
    api_key: Option<String>,
    api_key_env_var: Option<String>,
    searxng_base_url: Option<String>,
    allow_private_network: Option<bool>,
    max_results: Option<u8>,
) -> Result<WebSearchResult, WebSearchToolError> {
    let query = search_term.trim();
    if query.is_empty() {
        return Err(NetworkToolError::new(
            "invalid_arguments",
            "search_term is required",
        ));
    }

    let max_results = max_results
        .unwrap_or(DEFAULT_MAX_RESULTS)
        .clamp(1, MAX_MAX_RESULTS);
    let allow_private_network = allow_private_network.unwrap_or(false);

    match provider.as_deref().unwrap_or("tavily") {
        "searxng" => {
            let base_url = searxng_base_url
                .as_deref()
                .map(str::trim)
                .filter(|value| !value.is_empty())
                .ok_or_else(|| {
                    NetworkToolError::new(
                        "missing_config",
                        "SearXNG base URL is required. Configure it in Settings > Web tools.",
                    )
                })?;
            search_searxng(query, base_url, allow_private_network, max_results).await
        }
        _ => {
            search_tavily(
                query,
                api_key_source.unwrap_or_else(|| "manual".to_string()),
                api_key,
                api_key_env_var,
                max_results,
            )
            .await
        }
    }
}
