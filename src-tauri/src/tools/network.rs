use std::net::{IpAddr, Ipv4Addr, Ipv6Addr, ToSocketAddrs};
use std::time::Duration;

use reqwest::redirect::Policy;
use reqwest::{Client, StatusCode, Url};
use serde::Serialize;

pub const MAX_RESPONSE_BYTES: usize = 512 * 1024;
pub const HTTP_TIMEOUT_SECS: u64 = 30;
pub const MAX_REDIRECTS: usize = 5;
const USER_AGENT: &str = "Coder/0.1 (+https://github.com/coder)";

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NetworkToolError {
    pub code: String,
    pub message: String,
}

impl NetworkToolError {
    pub fn new(code: &str, message: impl Into<String>) -> Self {
        Self {
            code: code.to_string(),
            message: message.into(),
        }
    }
}

#[derive(Debug, Clone)]
pub struct FetchedResponse {
    pub final_url: String,
    pub status_code: u16,
    pub content_type: Option<String>,
    pub body: String,
    pub truncated: bool,
}

pub fn build_http_client() -> Result<Client, NetworkToolError> {
    Client::builder()
        .user_agent(USER_AGENT)
        .timeout(Duration::from_secs(HTTP_TIMEOUT_SECS))
        .redirect(Policy::limited(MAX_REDIRECTS))
        .build()
        .map_err(|error| NetworkToolError::new("client_error", error.to_string()))
}

pub fn validate_public_url(url_str: &str) -> Result<Url, NetworkToolError> {
    let trimmed = url_str.trim();
    if trimmed.is_empty() {
        return Err(NetworkToolError::new("invalid_url", "URL is required"));
    }

    let parsed = Url::parse(trimmed)
        .map_err(|error| NetworkToolError::new("invalid_url", format!("Invalid URL: {error}")))?;

    let scheme = parsed.scheme();
    if scheme != "http" && scheme != "https" {
        return Err(NetworkToolError::new(
            "blocked_url",
            format!("Only http and https URLs are allowed, got: {scheme}"),
        ));
    }

    let host = parsed
        .host_str()
        .ok_or_else(|| NetworkToolError::new("invalid_url", "URL must include a host"))?;

    if is_blocked_hostname(host) {
        return Err(NetworkToolError::new(
            "blocked_url",
            format!("Access to host is not allowed: {host}"),
        ));
    }

    if let Some(ip) = parse_literal_ip(host) {
        if is_private_or_local_ip(ip) {
            return Err(NetworkToolError::new(
                "blocked_url",
                format!("Access to private or local addresses is not allowed: {host}"),
            ));
        }
        return Ok(parsed);
    }

    let port = parsed.port().unwrap_or_else(|| default_port_for_scheme(scheme));
    validate_resolved_host(host, port)?;

    Ok(parsed)
}

pub async fn fetch_public_url(client: &Client, url_str: &str) -> Result<FetchedResponse, NetworkToolError> {
    let validated = validate_public_url(url_str)?;
    let response = client
        .get(validated.clone())
        .send()
        .await
        .map_err(|error| NetworkToolError::new("fetch_failed", error.to_string()))?;

    let status_code = response.status();
    let final_url = response
        .url()
        .as_str()
        .to_string();
    validate_public_url(&final_url)?;

    let content_type = response
        .headers()
        .get(reqwest::header::CONTENT_TYPE)
        .and_then(|value| value.to_str().ok())
        .map(str::to_string);

    let bytes = response
        .bytes()
        .await
        .map_err(|error| NetworkToolError::new("fetch_failed", error.to_string()))?;

    let truncated = bytes.len() > MAX_RESPONSE_BYTES;
    let body_bytes = if truncated {
        &bytes[..MAX_RESPONSE_BYTES]
    } else {
        &bytes
    };

    let body = String::from_utf8_lossy(body_bytes).into_owned();

    if status_code == StatusCode::UNAUTHORIZED || status_code == StatusCode::FORBIDDEN {
        return Err(NetworkToolError::new(
            "fetch_failed",
            format!("HTTP {} for {final_url}", status_code.as_u16()),
        ));
    }

    Ok(FetchedResponse {
        final_url,
        status_code: status_code.as_u16(),
        content_type,
        body,
        truncated,
    })
}

pub fn resolve_api_key(
    source: &str,
    manual_key: Option<&str>,
    env_var: &str,
) -> Result<String, NetworkToolError> {
    match source {
        "env" => std::env::var(env_var.trim()).map_err(|_| {
            NetworkToolError::new(
                "missing_api_key",
                format!("Environment variable not set: {}", env_var.trim()),
            )
        }),
        _ => manual_key
            .map(str::trim)
            .filter(|value| !value.is_empty())
            .map(str::to_string)
            .ok_or_else(|| {
                NetworkToolError::new(
                    "missing_api_key",
                    "Tavily API key is required. Configure it in Settings > Web tools.",
                )
            }),
    }
}

fn default_port_for_scheme(scheme: &str) -> u16 {
    if scheme == "https" {
        443
    } else {
        80
    }
}

fn format_lookup_target(host: &str, port: u16) -> String {
    if parse_literal_ip(host).is_some_and(|ip| matches!(ip, IpAddr::V6(_))) {
        format!("[{host}]:{port}")
    } else {
        format!("{host}:{port}")
    }
}

fn validate_resolved_host(host: &str, port: u16) -> Result<(), NetworkToolError> {
    let lookup_target = format_lookup_target(host, port);
    let addresses: Vec<_> = lookup_target
        .to_socket_addrs()
        .map_err(|error| {
            NetworkToolError::new(
                "invalid_url",
                format!("Failed to resolve host {host}: {error}"),
            )
        })?
        .map(|addr| addr.ip())
        .collect();

    if addresses.is_empty() {
        return Err(NetworkToolError::new(
            "invalid_url",
            format!("Could not resolve host: {host}"),
        ));
    }

    for ip in addresses {
        if is_private_or_local_ip(ip) {
            return Err(NetworkToolError::new(
                "blocked_url",
                format!("Resolved address for {host} is not allowed: {ip}"),
            ));
        }
    }

    Ok(())
}

fn is_blocked_hostname(host: &str) -> bool {
    let normalized = host.trim_end_matches('.').to_ascii_lowercase();

    if normalized == "localhost" || normalized.ends_with(".localhost") {
        return true;
    }

    if normalized == "metadata.google.internal" {
        return true;
    }

    normalized == "169.254.169.254"
}

fn parse_literal_ip(host: &str) -> Option<IpAddr> {
    let trimmed = host.trim();
    if trimmed.starts_with('[') && trimmed.ends_with(']') {
        return trimmed[1..trimmed.len() - 1].parse().ok();
    }

    trimmed.parse().ok()
}

fn is_private_or_local_ip(ip: IpAddr) -> bool {
    match ip {
        IpAddr::V4(v4) => is_private_or_local_ipv4(v4),
        IpAddr::V6(v6) => is_private_or_local_ipv6(v6),
    }
}

fn is_private_or_local_ipv4(ip: Ipv4Addr) -> bool {
    ip.is_private()
        || ip.is_loopback()
        || ip.is_link_local()
        || ip.is_unspecified()
        || ip.is_broadcast()
        || ip.octets()[0] == 0
}

fn is_private_or_local_ipv6(ip: Ipv6Addr) -> bool {
    ip.is_loopback()
        || ip.is_unspecified()
        || ip.is_multicast()
        || (ip.segments()[0] & 0xfe00) == 0xfc00
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn rejects_localhost_urls() {
        let error = validate_public_url("http://localhost/test").unwrap_err();
        assert_eq!(error.code, "blocked_url");
    }

    #[test]
    fn rejects_private_ipv4_urls() {
        let error = validate_public_url("http://192.168.1.1/test").unwrap_err();
        assert_eq!(error.code, "blocked_url");
    }

    #[test]
    fn rejects_loopback_ipv4_urls() {
        let error = validate_public_url("http://127.0.0.1/test").unwrap_err();
        assert_eq!(error.code, "blocked_url");
    }

    #[test]
    fn rejects_file_scheme() {
        let error = validate_public_url("file:///etc/passwd").unwrap_err();
        assert_eq!(error.code, "blocked_url");
    }

    #[test]
    fn accepts_public_https_urls() {
        let url = validate_public_url("https://93.184.216.34/docs").expect("valid url");
        assert_eq!(url.host_str(), Some("93.184.216.34"));
    }

    #[test]
    fn formats_ipv6_lookup_target_with_brackets() {
        assert_eq!(
            format_lookup_target("2001:db8::1", 443),
            "[2001:db8::1]:443"
        );
    }

    #[test]
    fn formats_hostname_lookup_target_with_port() {
        assert_eq!(format_lookup_target("releases.rs", 443), "releases.rs:443");
    }

    #[test]
    fn truncates_response_bytes() {
        let input = "a".repeat(MAX_RESPONSE_BYTES + 10);
        let truncated = input.len() > MAX_RESPONSE_BYTES;
        let body = if truncated {
            input[..MAX_RESPONSE_BYTES].to_string()
        } else {
            input
        };
        assert!(truncated);
        assert_eq!(body.len(), MAX_RESPONSE_BYTES);
    }
}
