pub mod agent;
mod shell_env;
pub mod tools;
pub mod http;
pub mod db;

use std::path::PathBuf;
use std::sync::{Arc, Mutex};

use agent::registry::AgentRegistry;
use db::Database;
use tools::{PageCache, RemoteConnectionPool, ShellRegistry};

/// Global shared state for all HTTP handlers.
pub struct AppState {
    pub workspace_dir: PathBuf,
    pub db: Arc<Mutex<Database>>,
    pub agent_registry: Arc<Mutex<AgentRegistry>>,
    pub shell_registry: Arc<Mutex<ShellRegistry>>,
    pub page_cache: Arc<PageCache>,
    pub remote_pool: RemoteConnectionPool,
    pub sse_broadcaster: Arc<SseBroadcaster>,
}

/// SSE event for agent streaming.
#[derive(Clone, serde::Serialize, serde::Deserialize, Debug)]
#[serde(tag = "type")]
pub enum AgentSseEvent {
    #[serde(rename = "agent_event")]
    AgentEvent(agent::AgentEvent),
    #[serde(rename = "shell_output")]
    ShellOutput {
        shell_id: String,
        stream: String,
        data: String,
    },
    #[serde(rename = "shell_finished")]
    ShellFinished {
        shell_id: String,
        output: tools::shell::ShellOutput,
    },
}

/// Manages all active SSE clients grouped by topic (task_id or shell_id).
pub struct SseBroadcaster {
    topics: Arc<Mutex<std::collections::HashMap<String, tokio::sync::broadcast::Sender<String>>>>,
}

impl SseBroadcaster {
    pub fn new() -> Self {
        Self {
            topics: Arc::new(Mutex::new(std::collections::HashMap::new())),
        }
    }

    /// Create or get a broadcast channel for a topic.
    /// Returns a receiver for subscribing.
    pub fn subscribe(&self, topic: &str) -> tokio::sync::broadcast::Receiver<String> {
        let mut topics = self.topics.lock().unwrap();
        let tx = topics
            .entry(topic.to_string())
            .or_insert_with(|| {
                let (tx, _) = tokio::sync::broadcast::channel(4096);
                tx
            })
            .clone();
        tx.subscribe()
    }

    /// Emit a message to all subscribers of a topic.
    pub fn emit(&self, topic: &str, message: &str) {
        if let Some(tx) = self.topics.lock().unwrap().get(topic) {
            let _ = tx.send(message.to_string());
        }
    }

    /// Clean up a topic. The channel is dropped when all senders are gone.
    pub fn unregister(&self, topic: &str) {
        self.topics.lock().unwrap().remove(topic);
    }

    /// Serialize an AgentSseEvent and emit it.
    pub fn emit_event(&self, topic: &str, event: &AgentSseEvent) {
        if let Ok(json) = serde_json::to_string(event) {
            self.emit(topic, &json);
        }
    }

    /// Emit an AgentEvent directly, wrapped with type="agent_event" for the frontend.
    pub fn emit_agent_event(&self, topic: &str, event: &agent::AgentEvent) {
        if let Ok(mut val) = serde_json::to_value(event) {
            if let Some(obj) = val.as_object_mut() {
                // Lowercase the status value to match frontend expectations
                if let Some(status) = obj.get_mut("status") {
                    if let Some(s) = status.as_str() {
                        *status = serde_json::Value::String(s.to_ascii_lowercase());
                    }
                }
                // The frontend's runner.ts strips the outer "type":"agent_event"
                // and passes the remaining fields to onEvent. The inner event
                // already has the correct "type" from serde's tag.
            }
            if let Ok(json) = serde_json::to_string(&val) {
                self.emit(topic, &json);
            }
        }
    }
}

pub fn get_coder_data_dir() -> PathBuf {
    let home = std::env::var("HOME")
        .or_else(|_| std::env::var("USERPROFILE"))
        .unwrap_or_else(|_| ".".to_string());
    PathBuf::from(home).join(".coder")
}

/// Initialize all shared state for the application.
pub fn initialize_app_state(workspace_dir: &PathBuf) -> Arc<AppState> {
    let coder_dir = get_coder_data_dir();
    std::fs::create_dir_all(&coder_dir).expect("Failed to create ~/.coder/");

    // Preload shell environment
    shell_env::preload_shell_environment();

    let db = Database::new(&coder_dir).expect("Failed to initialize database");
    let remote_pool = RemoteConnectionPool::new();
    remote_pool.start_idle_reaper();

    Arc::new(AppState {
        workspace_dir: workspace_dir.clone(),
        db: Arc::new(Mutex::new(db)),
        agent_registry: Arc::new(Mutex::new(
            AgentRegistry::new().expect("Failed to init agent registry"),
        )),
        shell_registry: Arc::new(Mutex::new(ShellRegistry::new())),
        page_cache: Arc::new(PageCache::new()),
        remote_pool,
        sse_broadcaster: Arc::new(SseBroadcaster::new()),
    })
}

/// Clean up background shells on exit.
pub fn cleanup_background_shells(state: &AppState) {
    if let Ok(mut registry) = state.shell_registry.lock() {
        let killed = registry.kill_all_active();
        if killed > 0 {
            log::info!("Killed {} background shell process(es) on exit", killed);
        }
    }
}
