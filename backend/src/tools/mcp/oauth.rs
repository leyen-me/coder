use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::Mutex;
use std::time::{Duration, SystemTime, UNIX_EPOCH};

use base64::{engine::general_purpose::URL_SAFE_NO_PAD, Engine as _};
use reqwest::Client;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use url::Url;

use super::types::McpServerConfig;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct McpOAuthCredentials {
    pub server_id: String,
    pub client_id: String,
    pub access_token: String,
    #[serde(default)]
    pub refresh_token: Option<String>,
    #[serde(default)]
    pub expires_at: Option<i64>,
    #[serde(default = "default_token_type")]
    pub token_type: String,
    #[serde(default)]
    pub server_url: String,
    #[serde(default)]
    pub authorization_server_url: String,
    #[serde(default)]
    pub resource_url: String,
}

fn default_token_type() -> String {
    "Bearer".to_string()
}

#[derive(Debug, Clone)]
struct PendingOAuth {
    server_id: String,
    code_verifier: String,
    client_id: String,
    token_endpoint: String,
    resource_url: String,
    created_at: SystemTime,
}

#[derive(Debug, Clone, Deserialize)]
struct ProtectedResourceMetadata {
    #[serde(default)]
    resource: Option<String>,
    #[serde(default)]
    authorization_servers: Vec<String>,
    #[serde(default)]
    scopes_supported: Vec<String>,
}

#[derive(Debug, Clone, Deserialize)]
struct AuthorizationServerMetadata {
    #[serde(default)]
    #[allow(dead_code)]
    issuer: Option<String>,
    authorization_endpoint: String,
    token_endpoint: String,
    #[serde(default)]
    registration_endpoint: Option<String>,
    #[serde(default)]
    scopes_supported: Vec<String>,
}

#[derive(Debug, Deserialize)]
struct DynamicClientRegistrationResponse {
    client_id: String,
}

#[derive(Debug, Deserialize)]
struct TokenResponse {
    access_token: String,
    #[serde(default)]
    refresh_token: Option<String>,
    #[serde(default)]
    expires_in: Option<i64>,
    #[serde(default)]
    token_type: Option<String>,
}

#[derive(Debug, Clone)]
struct OAuthDiscovery {
    authorization_server_url: String,
    metadata: AuthorizationServerMetadata,
    resource_url: String,
    scopes_supported: Vec<String>,
}

pub struct McpOAuthStore {
    dir: PathBuf,
    http: Client,
    pending: Mutex<HashMap<String, PendingOAuth>>,
    completed: Mutex<HashMap<String, McpOAuthStatus>>,
}

#[derive(Debug, Clone)]
pub struct McpOAuthStatus {
    pub authenticated: bool,
    pub expires_at: Option<i64>,
    pub message: Option<String>,
}

impl McpOAuthStore {
    pub fn new() -> Self {
        let dir = crate::get_coder_data_dir().join("mcp-oauth");
        let _ = std::fs::create_dir_all(&dir);
        Self {
            dir,
            http: Client::new(),
            pending: Mutex::new(HashMap::new()),
            completed: Mutex::new(HashMap::new()),
        }
    }

    pub fn status(&self, server_id: &str) -> McpOAuthStatus {
        if let Ok(completed) = self.completed.lock() {
            if let Some(status) = completed.get(server_id) {
                return status.clone();
            }
        }

        match self.load_credentials(server_id) {
            Some(credentials) => McpOAuthStatus {
                authenticated: !credentials.access_token.is_empty(),
                expires_at: credentials.expires_at,
                message: None,
            },
            None => McpOAuthStatus {
                authenticated: false,
                expires_at: None,
                message: None,
            },
        }
    }

    pub fn revoke(&self, server_id: &str) {
        let path = self.credentials_path(server_id);
        let _ = std::fs::remove_file(path);
        if let Ok(mut completed) = self.completed.lock() {
            completed.insert(
                server_id.to_string(),
                McpOAuthStatus {
                    authenticated: false,
                    expires_at: None,
                    message: Some("Authorization revoked".to_string()),
                },
            );
        }
    }

    pub async fn start_authorization(
        &self,
        config: McpServerConfig,
        redirect_uri: &str,
    ) -> Result<(String, String), String> {
        let discovery = self.discover_oauth(&config).await?;
        let client_id = self
            .ensure_client_id(&config, &discovery, redirect_uri)
            .await?;

        let code_verifier = generate_code_verifier();
        let code_challenge = generate_code_challenge(&code_verifier);
        let state = uuid::Uuid::new_v4().to_string();

        let mut authorize_url =
            Url::parse(&discovery.metadata.authorization_endpoint).map_err(|e| e.to_string())?;
        {
            let mut query = authorize_url.query_pairs_mut();
            query.append_pair("response_type", "code");
            query.append_pair("client_id", &client_id);
            query.append_pair("redirect_uri", redirect_uri);
            query.append_pair("state", &state);
            query.append_pair("code_challenge", &code_challenge);
            query.append_pair("code_challenge_method", "S256");

            if !discovery.resource_url.is_empty() {
                query.append_pair("resource", &discovery.resource_url);
            }

            let scopes = if discovery.scopes_supported.is_empty() {
                discovery.metadata.scopes_supported.clone()
            } else {
                discovery.scopes_supported.clone()
            };
            if !scopes.is_empty() {
                query.append_pair("scope", &scopes.join(" "));
            }
        }

        if let Ok(mut pending) = self.pending.lock() {
            pending.insert(
                state.clone(),
                PendingOAuth {
                    server_id: config.id.clone(),
                    code_verifier,
                    client_id,
                    token_endpoint: discovery.metadata.token_endpoint.clone(),
                    resource_url: discovery.resource_url.clone(),
                    created_at: SystemTime::now(),
                },
            );
        }

        Ok((authorize_url.to_string(), state))
    }

    pub async fn complete_authorization(
        &self,
        state: &str,
        code: &str,
        redirect_uri: &str,
    ) -> Result<String, String> {
        let pending = {
            let mut guard = self
                .pending
                .lock()
                .map_err(|_| "OAuth state lock poisoned".to_string())?;
            guard.remove(state).ok_or_else(|| {
                "OAuth state expired or invalid. Please start authorization again.".to_string()
            })?
        };

        if pending.created_at.elapsed().unwrap_or(Duration::MAX) > Duration::from_secs(600) {
            return Err("OAuth state expired. Please start authorization again.".to_string());
        }

        let mut form = vec![
            ("grant_type", "authorization_code".to_string()),
            ("code", code.to_string()),
            ("redirect_uri", redirect_uri.to_string()),
            ("client_id", pending.client_id.clone()),
            ("code_verifier", pending.code_verifier.clone()),
        ];
        if !pending.resource_url.is_empty() {
            form.push(("resource", pending.resource_url.clone()));
        }

        let token_response = self
            .http
            .post(&pending.token_endpoint)
            .form(&form)
            .send()
            .await
            .map_err(|e| format!("OAuth token exchange failed: {e}"))?;

        if !token_response.status().is_success() {
            let body = token_response.text().await.unwrap_or_default();
            return Err(format!("OAuth token exchange failed: {body}"));
        }

        let token: TokenResponse = token_response
            .json()
            .await
            .map_err(|e| format!("Invalid OAuth token response: {e}"))?;

        let expires_at = token.expires_in.map(current_epoch_seconds_add);

        let mut credentials = self.load_credentials(&pending.server_id).unwrap_or_else(|| {
            McpOAuthCredentials {
                server_id: pending.server_id.clone(),
                client_id: pending.client_id.clone(),
                access_token: String::new(),
                refresh_token: None,
                expires_at: None,
                token_type: default_token_type(),
                server_url: String::new(),
                authorization_server_url: String::new(),
                resource_url: pending.resource_url.clone(),
            }
        });
        credentials.access_token = token.access_token;
        credentials.refresh_token = token.refresh_token.or(credentials.refresh_token);
        credentials.expires_at = expires_at;
        credentials.token_type = token.token_type.unwrap_or_else(default_token_type);
        credentials.resource_url = pending.resource_url;

        self.save_credentials(&credentials)?;
        if let Ok(mut completed) = self.completed.lock() {
            completed.insert(
                pending.server_id.clone(),
                McpOAuthStatus {
                    authenticated: true,
                    expires_at,
                    message: Some("Authorization completed".to_string()),
                },
            );
        }

        Ok(pending.server_id)
    }

    pub async fn get_valid_access_token(&self, server_id: &str) -> Result<Option<String>, String> {
        let Some(mut credentials) = self.load_credentials(server_id) else {
            return Ok(None);
        };

        let now = current_epoch_seconds();
        let needs_refresh = credentials
            .expires_at
            .map(|expires_at| expires_at <= now + 30)
            .unwrap_or(false);

        if needs_refresh {
            if let Some(refresh_token) = credentials.refresh_token.clone() {
                if !credentials.authorization_server_url.is_empty() {
                    if let Ok(metadata) = self
                        .fetch_authorization_server_metadata(&credentials.authorization_server_url)
                        .await
                    {
                        if let Ok(refreshed) = self
                            .refresh_access_token(
                                &metadata.token_endpoint,
                                &credentials.client_id,
                                &refresh_token,
                                &credentials.resource_url,
                            )
                            .await
                        {
                            credentials.access_token = refreshed.access_token;
                            credentials.refresh_token = refreshed
                                .refresh_token
                                .or(credentials.refresh_token);
                            credentials.expires_at = refreshed.expires_at;
                            self.save_credentials(&credentials)?;
                        }
                    }
                }
            }
        }

        if credentials.access_token.is_empty() {
            Ok(None)
        } else {
            Ok(Some(credentials.access_token))
        }
    }

    async fn refresh_access_token(
        &self,
        token_endpoint: &str,
        client_id: &str,
        refresh_token: &str,
        resource_url: &str,
    ) -> Result<McpOAuthCredentials, String> {
        let mut form = vec![
            ("grant_type", "refresh_token".to_string()),
            ("refresh_token", refresh_token.to_string()),
            ("client_id", client_id.to_string()),
        ];
        if !resource_url.is_empty() {
            form.push(("resource", resource_url.to_string()));
        }

        let response = self
            .http
            .post(token_endpoint)
            .form(&form)
            .send()
            .await
            .map_err(|e| format!("OAuth token refresh failed: {e}"))?;

        if !response.status().is_success() {
            let body = response.text().await.unwrap_or_default();
            return Err(format!("OAuth token refresh failed: {body}"));
        }

        let token: TokenResponse = response
            .json()
            .await
            .map_err(|e| format!("Invalid OAuth refresh response: {e}"))?;

        Ok(McpOAuthCredentials {
            server_id: String::new(),
            client_id: client_id.to_string(),
            access_token: token.access_token,
            refresh_token: token.refresh_token,
            expires_at: token.expires_in.map(current_epoch_seconds_add),
            token_type: token.token_type.unwrap_or_else(default_token_type),
            server_url: String::new(),
            authorization_server_url: String::new(),
            resource_url: resource_url.to_string(),
        })
    }

    async fn discover_oauth(&self, config: &McpServerConfig) -> Result<OAuthDiscovery, String> {
        let mcp_base = authorization_base_url(&config.url)?;
        let prm = self.fetch_protected_resource_metadata(&mcp_base).await?;

        let authorization_server_url = prm
            .authorization_servers
            .first()
            .cloned()
            .ok_or_else(|| {
                "MCP protected resource metadata does not list any authorization servers".to_string()
            })?;

        let metadata = self
            .fetch_authorization_server_metadata(&authorization_server_url)
            .await?;

        let resource_url = prm
            .resource
            .unwrap_or_else(|| config.url.trim().to_string());

        Ok(OAuthDiscovery {
            authorization_server_url,
            metadata,
            resource_url,
            scopes_supported: prm.scopes_supported,
        })
    }

    async fn fetch_protected_resource_metadata(
        &self,
        mcp_base_url: &str,
    ) -> Result<ProtectedResourceMetadata, String> {
        let metadata_url = format!("{mcp_base_url}/.well-known/oauth-protected-resource");
        let response = self
            .http
            .get(&metadata_url)
            .header("MCP-Protocol-Version", super::protocol::MCP_PROTOCOL_VERSION)
            .send()
            .await
            .map_err(|e| format!("Protected resource metadata discovery failed: {e}"))?;

        if !response.status().is_success() {
            let status = response.status();
            let body = response.text().await.unwrap_or_default();
            return Err(format!(
                "Protected resource metadata discovery failed with status {status}: {body}"
            ));
        }

        response
            .json()
            .await
            .map_err(|e| format!("Invalid protected resource metadata document: {e}"))
    }

    async fn fetch_authorization_server_metadata(
        &self,
        authorization_server_url: &str,
    ) -> Result<AuthorizationServerMetadata, String> {
        let base_url = authorization_base_url(authorization_server_url)?;
        let metadata_url = format!("{base_url}/.well-known/oauth-authorization-server");
        let response = self
            .http
            .get(&metadata_url)
            .header("MCP-Protocol-Version", super::protocol::MCP_PROTOCOL_VERSION)
            .send()
            .await
            .map_err(|e| format!("OAuth metadata discovery failed: {e}"))?;

        if response.status().is_success() {
            return response
                .json()
                .await
                .map_err(|e| format!("Invalid OAuth metadata document: {e}"));
        }

        Err(format!(
            "OAuth metadata discovery failed with status {} for {}",
            response.status(),
            metadata_url
        ))
    }

    async fn ensure_client_id(
        &self,
        config: &McpServerConfig,
        discovery: &OAuthDiscovery,
        redirect_uri: &str,
    ) -> Result<String, String> {
        if let Some(credentials) = self.load_credentials(&config.id) {
            if !credentials.client_id.is_empty() {
                return Ok(credentials.client_id);
            }
        }

        let registration_endpoint = discovery
            .metadata
            .registration_endpoint
            .as_ref()
            .ok_or_else(|| {
                "OAuth dynamic client registration is not supported by this authorization server"
                    .to_string()
            })?;

        let payload = serde_json::json!({
            "client_name": "Coder",
            "redirect_uris": [redirect_uri],
            "grant_types": ["authorization_code", "refresh_token"],
            "response_types": ["code"],
            "token_endpoint_auth_method": "none"
        });

        let response = self
            .http
            .post(registration_endpoint)
            .json(&payload)
            .send()
            .await
            .map_err(|e| format!("OAuth client registration failed: {e}"))?;

        if !response.status().is_success() {
            let body = response.text().await.unwrap_or_default();
            return Err(format!("OAuth client registration failed: {body}"));
        }

        let registration: DynamicClientRegistrationResponse = response
            .json()
            .await
            .map_err(|e| format!("Invalid OAuth registration response: {e}"))?;

        let mut credentials = self
            .load_credentials(&config.id)
            .unwrap_or_else(|| McpOAuthCredentials {
                server_id: config.id.clone(),
                client_id: registration.client_id.clone(),
                access_token: String::new(),
                refresh_token: None,
                expires_at: None,
                token_type: default_token_type(),
                server_url: config.url.clone(),
                authorization_server_url: discovery.authorization_server_url.clone(),
                resource_url: discovery.resource_url.clone(),
            });
        credentials.client_id = registration.client_id.clone();
        credentials.server_url = config.url.clone();
        credentials.authorization_server_url = discovery.authorization_server_url.clone();
        credentials.resource_url = discovery.resource_url.clone();
        self.save_credentials(&credentials)?;

        Ok(registration.client_id)
    }

    fn credentials_path(&self, server_id: &str) -> PathBuf {
        self.dir.join(format!("{server_id}.json"))
    }

    fn load_credentials(&self, server_id: &str) -> Option<McpOAuthCredentials> {
        let path = self.credentials_path(server_id);
        let raw = std::fs::read_to_string(path).ok()?;
        serde_json::from_str(&raw).ok()
    }

    fn save_credentials(&self, credentials: &McpOAuthCredentials) -> Result<(), String> {
        let path = self.credentials_path(&credentials.server_id);
        let raw = serde_json::to_string_pretty(credentials)
            .map_err(|e| format!("Failed to serialize OAuth credentials: {e}"))?;
        std::fs::write(path, raw).map_err(|e| format!("Failed to save OAuth credentials: {e}"))
    }
}

impl Default for McpOAuthStore {
    fn default() -> Self {
        Self::new()
    }
}

fn authorization_base_url(server_url: &str) -> Result<String, String> {
    let parsed = Url::parse(server_url.trim())
        .map_err(|e| format!("Invalid MCP server URL: {e}"))?;
    let scheme = parsed.scheme();
    let host = parsed
        .host_str()
        .ok_or_else(|| "MCP server URL missing host".to_string())?;
    if let Some(port) = parsed.port() {
        Ok(format!("{scheme}://{host}:{port}"))
    } else {
        Ok(format!("{scheme}://{host}"))
    }
}

fn generate_code_verifier() -> String {
    let first = URL_SAFE_NO_PAD.encode(uuid::Uuid::new_v4().as_bytes());
    let second = URL_SAFE_NO_PAD.encode(uuid::Uuid::new_v4().as_bytes());
    format!("{first}{second}")
}

fn generate_code_challenge(verifier: &str) -> String {
    let digest = Sha256::digest(verifier.as_bytes());
    URL_SAFE_NO_PAD.encode(digest)
}

fn current_epoch_seconds() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs() as i64
}

fn current_epoch_seconds_add(seconds: i64) -> i64 {
    current_epoch_seconds() + seconds
}
