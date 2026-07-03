# Coder Server Mode 架构重构计划

> 目标：彻底移除 Tauri，将 Coder 重构为一个自包含的 HTTP 服务端 + 浏览器前端的架构。所有平台统一通过 `npm i -g @alanwchat/coder && coder` 启动，在浏览器中交互。

---

## 目录

1. [架构概览](#1-架构概览)
2. [阶段一：Rust HTTP Server 核心](#2-阶段一rust-http-server-核心)
3. [阶段二：前端网络层替换](#3-阶段二前端网络层替换)
4. [阶段三：数据库迁移到 Rust 侧](#4-阶段三数据库迁移到-rust-侧)
5. [阶段四：SSE 流式响应](#5-阶段四sse-流式响应)
6. [阶段五：PTY WebSocket](#6-阶段五pty-websocket)
7. [阶段六：项目结构清理](#7-阶段六项目结构清理)
8. [阶段七：构建与发布](#8-阶段七构建与发布)
9. [风险与注意事项](#9-风险与注意事项)

---

## 1. 架构概览

### 1.1 最终架构

```
用户终端:
  $ coder [--port <PORT>] [--workspace <DIR>]
  → 服务已启动, 请访问 http://127.0.0.1:<PORT>

同一 Rust 二进制 (全平台):
┌──────────────────────────────────────────────────┐
│  axum HTTP Server (127.0.0.1:PORT)                │
│  ├── /api/*               → Tool 端点             │
│  ├── /sse/events/{taskId} → 流式事件推送          │
│  ├── /ws/pty              → 交互式终端 WebSocket   │
│  ├── /db/*                → SQLite CRUD API        │
│  ├── /settings            → KV 配置 API            │
│  └── / (static)           → React SPA (rust-embed) │
│                                                    │
│  SQLite  (~/.coder/coder.db)                       │
│  ShellRegistry / PtyRegistry                       │
│  Agent loop / Tool handlers (不变)                  │
└──────────────────────────────────────────────────┘

浏览器 (Chrome / Safari / Edge / Firefox):
  └── React SPA
      ├── fetch("http://127.0.0.1:<PORT>/api/*")
      ├── EventSource("http://127.0.0.1:<PORT>/sse/*")
      └── WebSocket("ws://127.0.0.1:<PORT>/ws/pty")
```

### 1.2 核心设计决策

| 决策 | 内容 |
|------|------|
| **端口** | 随机端口（每次启动绑定一个可用端口） |
| **地址** | `127.0.0.1` 绑定，仅本机可访问 |
| **工作目录** | CWD（在哪运行 coder，哪就是 workspace）|
| **多实例** | 允许，不同终端窗口可启动多个实例，端口不同 |
| **分发** | npm 发布，包内含一个 JS 入口 + 多平台原生二进制 |
| **前端静态** | `rust-embed` 在编译时将 `frontend/dist/` 打包进 Rust 二进制 |
| **数据库** | Rust 侧 `rusqlite`，前端通过 HTTP API 访问 |
| **配置存储** | Rust 侧 JSON 文件 (`~/.coder/settings.json`) |
| **Tauri** | 彻底移除，所有 `@tauri-apps/*` 依赖全部删除 |

### 1.3 用户工作流

```bash
# 安装
npm install -g @alanwchat/coder

# 在项目目录中启动
cd /path/to/my-project
coder
# 输出: Coder 服务已启动: http://127.0.0.1:51743
# (自动打开浏览器)

# 多开
cd /path/to/another-project
coder --port 51744
# 另一个独立的 Coder 实例

# 无浏览器环境
coder --no-open
# 输出 URL，用户自己 curl 或 SSH 转发
```

### 1.4 新项目目录结构

```
coder/
├── backend/                  ← Rust 后端 (原 src-tauri/)
│   ├── Cargo.toml
│   ├── Cargo.lock
│   └── src/
│       ├── main.rs
│       ├── lib.rs
│       ├── http/
│       │   ├── mod.rs
│       │   ├── routes_tool.rs
│       │   ├── routes_db.rs
│       │   ├── routes_settings.rs
│       │   ├── routes_sse.rs
│       │   ├── routes_ws.rs
│       │   └── static.rs
│       ├── db/
│       │   ├── mod.rs
│       │   ├── migrations.rs
│       │   ├── sessions.rs
│       │   ├── messages.rs
│       │   ├── skills.rs
│       │   ├── automations.rs
│       │   ├── remote_targets.rs
│       │   └── agent_todos.rs
│       ├── agent/             ← 从原 src-tauri/ 迁移，微调
│       │   ├── mod.rs
│       │   ├── registry.rs
│       │   ├── openai.rs
│       │   ├── types.rs
│       │   └── stream_log.rs
│       ├── tools/             ← 从原 src-tauri/ 迁移，完全不变
│       │   ├── mod.rs
│       │   ├── shell.rs
│       │   ├── shell_registry.rs
│       │   ├── read_file.rs
│       │   ├── write_file.rs
│       │   ├── edit_file.rs
│       │   ├── replace_file.rs
│       │   ├── replace_lines.rs
│       │   ├── glob.rs
│       │   ├── grep.rs
│       │   ├── list_dir.rs
│       │   ├── browse_page.rs
│       │   ├── web_search.rs
│       │   ├── network.rs
│       │   ├── page_cache.rs
│       │   ├── workspace_tree.rs
│       │   ├── workspace_path.rs
│       │   ├── file_ops.rs
│       │   ├── file_modify.rs
│       │   ├── text_file.rs
│       │   ├── read_editor_file.rs
│       │   ├── search.rs
│       │   ├── search_workspace.rs
│       │   ├── pty_terminal.rs
│       │   ├── plan.rs
│       │   ├── git.rs
│       │   ├── mail.rs
│       │   ├── env.rs
│       │   ├── runtime.rs
│       │   ├── remote_connection.rs
│       │   └── project_instructions.rs
│       └── shell_env.rs
│
├── frontend/                 ← React 前端 (原 src/ + 根配置文件)
│   ├── src/
│   │   ├── app/
│   │   ├── components/
│   │   ├── features/
│   │   ├── hooks/
│   │   ├── lib/
│   │   ├── assets/
│   │   ├── App.css
│   │   ├── App.tsx
│   │   ├── index.css
│   │   ├── main.tsx
│   │   └── vite-env.d.ts
│   ├── public/
│   │   └── app-icon.png
│   ├── index.html
│   ├── vite.config.ts
│   ├── package.json
│   ├── tsconfig.json
│   ├── tsconfig.node.json
│   ├── components.json
│   └── .gitignore
│
├── .plan/
├── .github/
│   └── workflows/
│       └── release.yml
├── AGENTS.md
├── README.md
├── README.zh-CN.md
└── .gitignore
```

---

## 2. 阶段一：Rust HTTP Server 核心

### 2.1 Cargo.toml 变更 (backend/Cargo.toml)

```toml
[package]
name = "coder"
version = "0.1.0"
description = "Coder — AI-powered coding assistant"
edition = "2021"

[dependencies]
# 移除 (Tauri 全家桶)
- tauri
- tauri-plugin-opener
- tauri-plugin-dialog
- tauri-plugin-fs
- tauri-plugin-sql
- tauri-build (build-dependencies)

# 新增
axum = { version = "0.8", features = ["macros"] }
tower-http = { version = "0.6", features = ["cors"] }
tokio = { version = "1", features = ["full"] }
rust-embed = "8"
mime_guess = "2"
tower = "0.5"
ctrlc = "3"
open = "5"
rusqlite = { version = "0.32", features = ["bundled"] }
async-stream = "0.3"

# 保留 (已有)
serde = { version = "1", features = ["derive"] }
serde_json = "1"
log = "0.4"
reqwest = { version = "0.12", default-features = false, features = ["json", "rustls-tls", "stream"] }
tokio-util = { version = "0.7", features = ["rt"] }
futures = "0.3"
portable-pty = "0.8"
encoding_rs = "0.8"
ignore = "0.4"
globset = "0.4"
regex = "1"
sha2 = "0.10"
similar = "2"
html2text = "0.6"
url = "2"
lettre = { version = "0.11", default-features = false, features = ["tokio1-rustls-tls", "builder", "smtp-transport", "hostname"] }
ssh2 = "0.9"
uuid = { version = "1", features = ["v4"] }

[lib]
name = "coder_lib"
crate-type = ["staticlib", "cdylib", "rlib"]
```

### 2.2 Rust 后端模块结构

```
backend/src/
├── main.rs                 ← 重写：CLI 参数解析 + 启动 HTTP server
├── lib.rs                  ← 重写：共享状态 (AppState) + 初始化 + Router 组装
├── http/                   ← 新增：HTTP 端点层
│   ├── mod.rs
│   ├── routes_tool.rs      ← /api/* 工具端点
│   ├── routes_db.rs        ← /db/* 数据库 CRUD
│   ├── routes_settings.rs  ← /settings/* 配置 KV
│   ├── routes_sse.rs       ← /sse/* 流式事件
│   ├── routes_ws.rs        ← /ws/* WebSocket
│   └── static.rs           ← 前端静态文件 Serve (rust-embed)
├── db/                     ← 新增：SQLite 实现
│   ├── mod.rs
│   ├── migrations.rs
│   ├── sessions.rs
│   ├── messages.rs
│   ├── skills.rs
│   ├── automations.rs
│   ├── remote_targets.rs
│   └── agent_todos.rs
├── agent/                  ← 从原 src-tauri/src/agent/ 迁移，微调
│   ├── mod.rs              ← 移除 tauri::command 和 Channel
│   ├── registry.rs         ← Channel → SseBroadcaster
│   ├── openai.rs           ← 不变
│   ├── types.rs            ← 不变
│   └── stream_log.rs       ← 不变
├── tools/                  ← 从原 src-tauri/src/tools/ 迁移，完全不变
│   ├── mod.rs
│   ├── shell.rs
│   ├── shell_registry.rs
│   ├── read_file.rs
│   ├── write_file.rs
│   ├── ...
└── shell_env.rs            ← 从原 src-tauri/src/shell_env.rs 迁移，不变
```

### 2.3 核心状态结构 (backend/src/lib.rs)

```rust
// 全局共享状态
pub struct AppState {
    pub workspace_dir: PathBuf,                    // 启动时的 CWD
    pub db: Arc<Mutex<Database>>,                  // SQLite
    pub agent_registry: Arc<Mutex<AgentRegistry>>,
    pub shell_registry: Arc<Mutex<ShellRegistry>>,
    pub pty_registry: Arc<Mutex<PtyRegistry>>,
    pub page_cache: Arc<PageCache>,
    pub remote_pool: Arc<RemoteConnectionPool>,
    pub sse_broadcaster: Arc<SseBroadcaster>,      // 新增：SSE 事件广播
}

// SseBroadcaster: 管理所有活跃任务的 SSE 客户端
pub struct SseBroadcaster {
    clients: Arc<Mutex<HashMap<String, broadcast::Sender<AgentEvent>>>>,
}

impl SseBroadcaster {
    pub fn new() -> Self {
        Self { clients: Arc::new(Mutex::new(HashMap::new())) }
    }

    /// 为指定任务创建广播通道
    pub fn register_task(&self, task_id: &str) -> broadcast::Sender<AgentEvent> {
        let (tx, _rx) = broadcast::channel(1024);
        self.clients.lock().unwrap().insert(task_id.to_string(), tx.clone());
        tx
    }

    /// 移除任务
    pub fn unregister_task(&self, task_id: &str) {
        self.clients.lock().unwrap().remove(task_id);
    }

    /// 向指定任务的所有 SSE 客户端发送事件
    pub fn emit(&self, task_id: &str, event: AgentEvent) {
        if let Some(tx) = self.clients.lock().unwrap().get(task_id) {
            let _ = tx.send(event);
        }
    }
}

// 初始化所有共享状态
pub fn initialize_app_state(workspace_dir: &Path) -> Arc<AppState> {
    let coder_dir = get_coder_data_dir();  // ~/.coder/
    std::fs::create_dir_all(&coder_dir).expect("Failed to create ~/.coder/");
    
    // 预加载 shell 环境
    shell_env::preload_shell_environment();
    
    let db = Database::new(&coder_dir).expect("Failed to initialize database");
    let remote_pool = RemoteConnectionPool::new();
    remote_pool.start_idle_reaper();
    
    Arc::new(AppState {
        workspace_dir: workspace_dir.to_path_buf(),
        db: Arc::new(Mutex::new(db)),
        agent_registry: Arc::new(Mutex::new(AgentRegistry::new().expect("Failed to init agent registry"))),
        shell_registry: Arc::new(Mutex::new(ShellRegistry::new())),
        pty_registry: Arc::new(Mutex::new(PtyRegistry::new())),
        page_cache: Arc::new(PageCache::new()),
        remote_pool: Arc::new(remote_pool),
        sse_broadcaster: Arc::new(SseBroadcaster::new()),
    })
}
```

### 2.4 main.rs 逻辑 (backend/src/main.rs)

```rust
use std::net::SocketAddr;
use std::sync::Arc;

use clap::Parser;        // 建议：用 clap 解析 CLI 参数，或手动解析

#[derive(Parser)]
struct Cli {
    /// 指定端口，默认随机分配
    #[arg(short, long)]
    port: Option<u16>,
    
    /// 指定工作目录，默认 CWD
    #[arg(short, long)]
    workspace: Option<String>,
    
    /// 不自动打开浏览器
    #[arg(long)]
    no_open: bool,
}

#[tokio::main]
async fn main() {
    let cli = Cli::parse();
    
    // 1. 确定端口
    let port = cli.port.unwrap_or(0);
    let addr = SocketAddr::from(([127, 0, 0, 1], port));
    let listener = tokio::net::TcpListener::bind(addr)
        .await
        .expect("Failed to bind address");
    let actual_port = listener.local_addr().unwrap().port();
    
    // 2. 确定工作目录
    let workspace_dir = cli.workspace
        .map(PathBuf::from)
        .unwrap_or_else(|| std::env::current_dir().expect("Failed to get CWD"));
    
    // 3. 初始化所有共享状态
    let state = coder_lib::initialize_app_state(&workspace_dir);
    
    // 4. 构建 axum Router
    let app = coder_lib::build_router(state);
    
    // 5. 注册信号处理 (Ctrl+C 优雅退出)
    let (shutdown_tx, shutdown_rx) = tokio::sync::oneshot::channel::<()>();
    ctrlc::set_handler(move || {
        coder_lib::cleanup_background_shells();
        let _ = shutdown_tx.send(());
    }).expect("Failed to set Ctrl+C handler");
    
    // 6. 打印 URL + 可选自动打开浏览器
    println!("\n  Coder 服务已启动: http://127.0.0.1:{}\n", actual_port);
    if !cli.no_open {
        let _ = open::that(format!("http://127.0.0.1:{}", actual_port));
    }
    
    // 7. 阻塞等待
    axum::serve(listener, app)
        .with_graceful_shutdown(async { shutdown_rx.await.ok(); })
        .await
        .unwrap();
}
```

### 2.5 axum Router 配置 (backend/src/http/mod.rs)

```rust
use axum::{Router, routing::{get, post}};
use tower_http::cors::{CorsLayer, Any};
use std::sync::Arc;

use crate::{AppState, http::{
    routes_tool::*,
    routes_db::*,
    routes_settings::*,
    routes_sse::*,
    routes_ws::*,
    static_files::*,
}};

pub fn build_router(state: Arc<AppState>) -> Router {
    let cors = CorsLayer::new()
        .allow_origin(Any)
        .allow_methods(Any)
        .allow_headers(Any);
    
    Router::new()
        // Tool 端点
        .route("/api/list_dir", post(handle_list_dir))
        .route("/api/read_file", post(handle_read_file))
        .route("/api/write_file", post(handle_write_file))
        .route("/api/edit_file", post(handle_edit_file))
        .route("/api/replace_lines", post(handle_replace_lines))
        .route("/api/replace_file", post(handle_replace_file))
        .route("/api/glob", post(handle_glob))
        .route("/api/grep", post(handle_grep))
        .route("/api/shell", post(handle_shell))
        .route("/api/remote_shell", post(handle_remote_shell))
        .route("/api/await_shell", post(handle_await_shell))
        .route("/api/list_shells", post(handle_list_shells))
        .route("/api/kill_shell", post(handle_kill_shell))
        .route("/api/read_shell_logs", post(handle_read_shell_logs))
        .route("/api/web_search", post(handle_web_search))
        .route("/api/browse_page", post(handle_browse_page))
        .route("/api/get_workspace_tree", post(handle_workspace_tree))
        .route("/api/search_workspace_paths", post(handle_search_workspace_paths))
        .route("/api/normalize_external_path", post(handle_normalize_external_path))
        .route("/api/resolve_absolute_path", post(handle_resolve_absolute_path))
        .route("/api/read_local_image_bytes", post(handle_read_local_image_bytes))
        .route("/api/resolve_env_var", post(handle_resolve_env_var))
        .route("/api/runtime_environment", post(handle_runtime_environment))
        .route("/api/test_remote_connection", post(handle_test_remote_connection))
        .route("/api/git_current_branch", post(handle_git_current_branch))
        .route("/api/send_email", post(handle_send_email))
        .route("/api/server_info", get(handle_server_info))
        // Agent 流式
        .route("/agent/start", post(handle_agent_start))
        .route("/agent/cancel", post(handle_agent_cancel))
        .route("/agent/status", post(handle_agent_status))
        .route("/agent/generate_title", post(handle_generate_session_title))
        .route("/agent/refine_prompt", post(handle_refine_prompt))
        .route("/sse/events/{task_id}", get(handle_sse_events))
        // 数据库
        .route("/db/get", post(handle_db_get))
        .route("/db/get_all", post(handle_db_get_all))
        .route("/db/put", post(handle_db_put))
        .route("/db/delete", post(handle_db_delete))
        .route("/db/get_all_from_index", post(handle_db_get_all_from_index))
        .route("/db/count", post(handle_db_count))
        .route("/db/clear", post(handle_db_clear))
        // 配置
        .route("/settings/get", get(handle_settings_get))
        .route("/settings/set", post(handle_settings_set))
        .route("/settings/delete", post(handle_settings_delete))
        // PTY WebSocket
        .route("/ws/pty", get(handle_pty_ws))
        // 静态文件 (React SPA) — 放最后作为 fallback
        .fallback(handle_static_files)
        .layer(cors)
        .with_state(state)
}
```

### 2.6 SSE 端点 (backend/src/http/routes_sse.rs)

```rust
use axum::{
    extract::{Path, State},
    response::sse::{Event, Sse, KeepAlive},
};
use futures::stream::Stream;
use std::convert::Infallible;
use std::sync::Arc;

use crate::AppState;

pub async fn handle_sse_events(
    Path(task_id): Path<String>,
    State(state): State<Arc<AppState>>,
) -> Sse<impl Stream<Item = Result<Event, Infallible>>> {
    let rx = {
        let broadcasters = state.sse_broadcaster.clients.lock().unwrap();
        broadcasters.get(&task_id)
            .map(|tx| tx.subscribe())
    };

    let stream = async_stream::stream! {
        let mut rx = match rx {
            Some(rx) => rx,
            None => {
                yield Ok(Event::default().data(r#"{"type":"error","message":"Task not found"}"#));
                return;
            }
        };
        loop {
            match rx.recv().await {
                Ok(event) => {
                    let data = serde_json::to_string(&event).unwrap();
                    yield Ok(Event::default().data(data));
                    // 任务结束后自动断开
                    if matches!(event, AgentEvent::Status { status: AgentStatus::Completed | AgentStatus::Cancelled | AgentStatus::Failed, .. }) {
                        break;
                    }
                }
                Err(_) => break,
            }
        }
    };

    Sse::new(stream).keep_alive(KeepAlive::new().interval(std::time::Duration::from_secs(15)))
}
```

### 2.7 前端静态文件 (backend/src/http/static.rs)

```rust
use axum::{response::{Response, IntoResponse}, body::Full, http::{Uri, StatusCode, HeaderValue}};
use rust_embed::RustEmbed;

#[derive(RustEmbed)]
#[folder = "../frontend/dist/"]    // React 构建产物
struct Assets;

pub async fn handle_static_files(uri: Uri) -> impl IntoResponse {
    let path = uri.path().trim_start_matches('/');
    
    // 根路径或空路径 → index.html
    if path.is_empty() || path == "/" {
        return serve_embedded("index.html");
    }
    
    // 尝试匹配具体文件
    match Assets::get(path) {
        Some(content) => serve_with_mime(path, content),
        None => {
            // SPA fallback: 返回 index.html 让前端路由处理
            match Assets::get("index.html") {
                Some(index) => serve_with_mime("index.html", index),
                None => Response::builder()
                    .status(StatusCode::NOT_FOUND)
                    .body(Full::from("Not found"))
                    .unwrap(),
            }
        }
    }
}

fn serve_with_mime(path: &str, content: rust_embed::EmbeddedFile) -> Response<Full<bytes::Bytes>> {
    let mime = mime_guess::from_path(path).first_or_unknown();
    Response::builder()
        .header("content-type", HeaderValue::from_str(mime.as_ref()).unwrap())
        .body(Full::from(content.data))
        .unwrap()
}
```

### 2.8 端口分配

```rust
// 端口由 tokio::net::TcpListener::bind(([127, 0, 0, 1], 0)) 自动分配
// 如果用户传了 --port，尝试绑定指定端口；被占用则报错退出
// 如果不传 --port，系统分配随机端口，打印到终端
```

---

## 3. 阶段二：前端网络层替换

### 3.1 创建统一的 API 客户端

**目标**：移除所有 `@tauri-apps/*` 依赖，用 `fetch()` 实现一套统一的 API 调用层。

```typescript
// frontend/src/lib/api/client.ts
// 统一 API 客户端

const API_BASE = window.location.origin;

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
  ) {
    super(message);
  }
}

export async function apiPost<T>(
  path: string,
  body?: unknown,
  signal?: AbortSignal,
): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: body !== undefined ? JSON.stringify(body) : undefined,
    signal,
  });
  
  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new ApiError(
      response.status,
      error.code || "unknown_error",
      error.message || response.statusText,
    );
  }
  
  return response.json();
}

export async function apiGet<T>(
  path: string,
  signal?: AbortSignal,
): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, {
    method: "GET",
    signal,
  });
  
  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new ApiError(
      response.status,
      error.code || "unknown_error",
      error.message || response.statusText,
    );
  }
  
  return response.json();
}
```

### 3.2 SSE 客户端

```typescript
// frontend/src/lib/api/sse.ts
export interface AgentEvent {
  type: string;
  taskId: string;
  // ... 其他字段
}

export function connectAgentSse(
  taskId: string,
  onEvent: (event: AgentEvent) => void,
  onDone: () => void,
  onError: (error: string) => void,
): () => void {
  const baseUrl = window.location.origin;
  const eventSource = new EventSource(`${baseUrl}/sse/events/${taskId}`);
  
  eventSource.onmessage = (event) => {
    const data = JSON.parse(event.data);
    onEvent(data);
    
    if (data.type === "done" || data.type === "error" || data.type === "status") {
      const terminal = ["completed", "cancelled", "failed"];
      if (terminal.includes(data.status)) {
        eventSource.close();
        onDone();
      }
    }
  };
  
  eventSource.onerror = () => {
    eventSource.close();
    onError("SSE connection error");
    onDone();
  };
  
  return () => {
    eventSource.close();
  };
}
```

### 3.3 工具 handler 替换模式

每个 tool handler 的替换遵循相同模式：

```typescript
// 修改前 (Tauri IPC)
import { invoke, isTauri } from "@tauri-apps/api/core";
if (!isTauri()) return toolFailure(...);
const data = await invoke<ShellData>("tool_shell", { ... });

// 修改后 (HTTP API)
import { apiPost } from "@/lib/api/client";
const data = await apiPost<ShellData>("/api/shell", { ... });
```

### 3.4 所有需要修改的 frontend 文件

#### 工具 Handler (frontend/src/features/agent/tools/)

| 文件 | 修改内容 |
|------|---------|
| `shell.ts` | invoke → apiPost, 移除 isTauri 检查 |
| `await-shell.ts` | 同上 |
| `list-shells.ts` | 同上 |
| `kill-shell.ts` | 同上 |
| `read-shell-logs.ts` | 同上 |
| `remote-shell.ts` | 同上 |
| `list-dir.ts` | 同上 |
| `read-file.ts` | 同上 |
| `write-file.ts` | 同上 |
| `edit-file.ts` | 同上 |
| `replace-file.ts` | 同上 |
| `replace-lines.ts` | 同上 |
| `glob.ts` | 同上 |
| `grep.ts` | 同上 |
| `web-search.ts` | 同上 |
| `browse-page.ts` | 同上 |
| `get-workspace-tree.ts` | 同上 |
| `send-email.ts` | 同上 |
| `spawn-subagent.ts` | 同上 |
| `plan.ts` | 同上 |
| `create-skill.ts` | 同上 |
| `update-skill.ts` | 同上 |
| `list-skills.ts` | 同上 |
| `read-skill.ts` | 同上 |
| `todo-read.ts` | 同上 |
| `todo-write.ts` | 同上 |

#### Agent 流程 (frontend/src/features/agent/)

| 文件 | 修改内容 |
|------|---------|
| `runner.ts` | 移除 Tauri Channel，改为 HTTP + SSE |
| `environment/resolve-environment.ts` | invoke → apiPost |

#### 其他引用 @tauri-apps/* 的模块

| 文件 | 操作 |
|------|------|
| `frontend/src/app/app-shell.tsx` | 移除 `isTauri()`、`useAppWindow`、`useWindowMaximized` |
| `frontend/src/lib/storage/init.ts` | 重写：初始化 HttpStoreBackend |
| `frontend/src/lib/storage/tauri-fs-kv.ts` | **删除** |
| `frontend/src/lib/storage/tauri-sqlite.ts` | **删除** |
| `frontend/src/lib/db/client.ts` | 保留 StoreBackend 抽象，换用 HttpStoreBackend |
| `frontend/src/lib/tauri/*` | **整个目录删除** |
| `frontend/src/features/workspace/pick-workspace-dir.ts` | 删除或重写为输入路径 UI |
| `frontend/src/features/workspace/workspace-provider.tsx` | 移除 invoke、改为读 API |
| `frontend/src/features/workspace/storage.ts` | 移除 Tauri KV |
| `frontend/src/features/terminal/components/interactive-terminal.tsx` | `listen` → WebSocket |
| `frontend/src/features/terminal/shell-processes-context.tsx` | 移除 Tauri 相关 |
| `frontend/src/features/chat/components/app-sidebar.tsx` | 移除 `save()` |
| `frontend/src/features/chat/lib/composer-image-attachments.ts` | 移除 Tauri 相关 |
| `frontend/src/features/chat/lib/process-native-file-drop-items.ts` | 移除 Tauri 相关 |
| `frontend/src/features/chat/hooks/use-tauri-native-file-drop-target.ts` | **整个删除** |
| `frontend/src/lib/dnd/tauri-native-file-drop.ts` | **整个删除** |
| `frontend/src/features/lab/refine-prompt.ts` | invoke → apiPost |
| `frontend/src/features/lab/use-deepseek-balance.ts` | 移除 Tauri 相关 |
| `frontend/src/features/plan/plan-service.ts` | invoke → apiPost |
| `frontend/src/features/settings/components/email-settings-panel.tsx` | 移除 Tauri dialog |
| `frontend/src/features/settings/components/remote-targets-settings-panel.tsx` | 移除 Tauri 相关 |
| `frontend/src/features/workspace/git.ts` | invoke → apiPost |
| `frontend/src/features/workspace/use-validated-workspace-dir.ts` | 移除 Tauri 相关 |

### 3.5 runner.ts 重写

```typescript
// frontend/src/features/agent/runner.ts
import { apiPost } from "@/lib/api/client";
import { connectAgentSse } from "@/lib/api/sse";
import type { AgentEvent, AgentStartInput } from "./types";

function mapTauriEvent(event: any): AgentEvent {
  // 映射逻辑不变，只是来源从 Channel 变为 SSE
  return event;
}

export async function startAgent(
  input: AgentStartInput,
  onEvent: (event: AgentEvent) => void,
): Promise<void> {
  // 1. 启动 agent (HTTP)
  await apiPost("/agent/start", {
    taskId: input.taskId,
    baseUrl: input.baseUrl,
    apiKey: input.apiKey || null,
    apiKeySource: input.apiKeySource,
    apiKeyEnvVar: input.apiKeyEnvVar,
    model: input.model,
    messages: input.messages,
    tools: input.tools ?? null,
    requestExtensions: input.requestExtensions ?? null,
  });
  
  // 2. 连接 SSE 接收流式事件
  return new Promise((resolve, reject) => {
    const disconnect = connectAgentSse(
      input.taskId,
      (event) => { onEvent(mapTauriEvent(event)); },
      () => { disconnect(); resolve(); },
      (error) => { disconnect(); reject(new Error(error)); },
    );
  });
}

export async function cancelAgent(taskId: string): Promise<void> {
  try { await apiPost("/agent/cancel", { taskId }); } catch { /* ignored */ }
}
```

---

## 4. 阶段三：数据库迁移到 Rust 侧

### 4.1 Rust 侧 SQLite 实现 (backend/src/db/mod.rs)

```rust
use rusqlite::{Connection, params, OptionalExtension};
use serde::{Serialize, de::DeserializeOwned};
use std::path::Path;
use std::sync::{Arc, Mutex};

pub struct Database {
    conn: Arc<Mutex<Connection>>,
}

impl Database {
    pub fn new(coder_dir: &Path) -> Result<Self, String> {
        let db_path = coder_dir.join("coder.db");
        let conn = Connection::open(&db_path).map_err(|e| e.to_string())?;
        let db = Self { conn: Arc::new(Mutex::new(conn)) };
        db.run_migrations()?;
        Ok(db)
    }

    fn run_migrations(&self) -> Result<(), String> {
        let conn = self.conn.lock().map_err(|e| e.to_string())?;
        conn.execute_batch("
            CREATE TABLE IF NOT EXISTS entities (
                store TEXT NOT NULL COLLATE NOCASE,
                id TEXT NOT NULL COLLATE NOCASE,
                value TEXT NOT NULL,
                updated_at INTEGER NOT NULL DEFAULT (unixepoch()),
                PRIMARY KEY (store, id)
            );
            CREATE TABLE IF NOT EXISTS idx (
                store TEXT NOT NULL COLLATE NOCASE,
                index_name TEXT NOT NULL COLLATE NOCASE,
                index_value TEXT NOT NULL,
                id TEXT NOT NULL COLLATE NOCASE,
                PRIMARY KEY (store, index_name, index_value, id)
            );
            CREATE INDEX IF NOT EXISTS idx_idx_lookup
                ON idx(store, index_name, index_value);
        ").map_err(|e| e.to_string())
    }

    pub fn get<T: DeserializeOwned>(&self, store: &str, key: &str) -> Result<Option<T>, String> {
        let conn = self.conn.lock().map_err(|e| e.to_string())?;
        let result: Option<String> = conn.query_row(
            "SELECT value FROM entities WHERE store = ?1 AND id = ?2",
            params![store, key],
            |row| row.get(0),
        ).optional().map_err(|e| e.to_string())?;
        match result {
            Some(json) => Ok(Some(serde_json::from_str(&json).map_err(|e| e.to_string())?)),
            None => Ok(None),
        }
    }

    pub fn put<T: Serialize>(&self, store: &str, key: &str, value: &T, indexes: &[IndexEntry]) -> Result<(), String> {
        let json = serde_json::to_string(value).map_err(|e| e.to_string())?;
        let conn = self.conn.lock().map_err(|e| e.to_string())?;
        conn.execute(
            "INSERT OR REPLACE INTO entities (store, id, value, updated_at) VALUES (?1, ?2, ?3, unixepoch())",
            params![store, key, json],
        ).map_err(|e| e.to_string())?;
        // 更新索引
        for idx in indexes {
            conn.execute(
                "INSERT OR REPLACE INTO idx (store, index_name, index_value, id) VALUES (?1, ?2, ?3, ?4)",
                params![store, idx.name, idx.value, key],
            ).map_err(|e| e.to_string())?;
        }
        Ok(())
    }

    pub fn delete(&self, store: &str, key: &str) -> Result<(), String> {
        let conn = self.conn.lock().map_err(|e| e.to_string())?;
        conn.execute("DELETE FROM entities WHERE store = ?1 AND id = ?2", params![store, key])
            .map_err(|e| e.to_string())?;
        conn.execute("DELETE FROM idx WHERE store = ?1 AND id = ?2", params![store, key])
            .map_err(|e| e.to_string())?;
        Ok(())
    }

    pub fn get_all<T: DeserializeOwned>(&self, store: &str) -> Result<Vec<T>, String> {
        let conn = self.conn.lock().map_err(|e| e.to_string())?;
        let mut stmt = conn.prepare("SELECT value FROM entities WHERE store = ?1 ORDER BY rowid")
            .map_err(|e| e.to_string())?;
        let rows = stmt.query_map(params![store], |row| row.get::<_, String>(0))
            .map_err(|e| e.to_string())?;
        let mut result = Vec::new();
        for row in rows {
            let json = row.map_err(|e| e.to_string())?;
            result.push(serde_json::from_str(&json).map_err(|e| e.to_string())?);
        }
        Ok(result)
    }

    pub fn get_all_from_index<T: DeserializeOwned>(
        &self, store: &str, index_name: &str, index_value: Option<&str>,
    ) -> Result<Vec<T>, String> {
        let conn = self.conn.lock().map_err(|e| e.to_string())?;
        let (sql, params): (String, Vec<Box<dyn rusqlite::types::ToSql>>) = match index_value {
            Some(val) => (
                "SELECT e.value FROM entities e JOIN idx i ON e.id = i.id WHERE e.store = ?1 AND i.index_name = ?2 AND i.index_value = ?3 ORDER BY e.rowid".into(),
                vec![Box::new(store), Box::new(index_name), Box::new(val)],
            ),
            None => (
                "SELECT e.value FROM entities e JOIN idx i ON e.id = i.id WHERE e.store = ?1 AND i.index_name = ?2 ORDER BY e.rowid".into(),
                vec![Box::new(store), Box::new(index_name)],
            ),
        };
        // 执行查询 ...
        // (实际实现中需要注意类型擦除)
        Ok(vec![])
    }

    pub fn count(&self, store: &str) -> Result<i64, String> {
        let conn = self.conn.lock().map_err(|e| e.to_string())?;
        conn.query_row(
            "SELECT COUNT(*) FROM entities WHERE store = ?1", params![store],
            |row| row.get(0),
        ).map_err(|e| e.to_string())
    }

    pub fn clear(&self, store: &str) -> Result<(), String> {
        let conn = self.conn.lock().map_err(|e| e.to_string())?;
        conn.execute("DELETE FROM entities WHERE store = ?1", params![store])
            .map_err(|e| e.to_string())?;
        conn.execute("DELETE FROM idx WHERE store = ?1", params![store])
            .map_err(|e| e.to_string())?;
        Ok(())
    }
}

pub struct IndexEntry {
    pub name: String,
    pub value: String,
}
```

### 4.2 HTTP DB 端点 (backend/src/http/routes_db.rs)

```rust
use axum::{Json, extract::State, http::StatusCode};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::sync::Arc;

use crate::AppState;
use crate::db::IndexEntry;

// 请求/响应类型

#[derive(Deserialize)]
pub struct DbGetParams { store: String, id: String }

#[derive(Deserialize)]
pub struct DbPutParams { store: String, id: String, value: Value, indexes: Option<Vec<IndexEntry>> }

#[derive(Deserialize)]
pub struct DbDeleteParams { store: String, id: String }

#[derive(Deserialize)]
pub struct DbGetAllParams { store: String }

#[derive(Deserialize)]
pub struct DbGetAllFromIndexParams { store: String, index_name: String, index_value: Option<String> }

#[derive(Deserialize)]
pub struct DbCountParams { store: String }

#[derive(Deserialize)]
pub struct DbClearParams { store: String }

// Handler 实现

pub async fn handle_db_get(
    State(state): State<Arc<AppState>>,
    Json(params): Json<DbGetParams>,
) -> Result<Json<Value>, (StatusCode, String)> {
    let db = state.db.lock().map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;
    let value = db.get::<Value>(&params.store, &params.id)
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e))?;
    Ok(Json(value.unwrap_or(Value::Null)))
}

pub async fn handle_db_put(
    State(state): State<Arc<AppState>>,
    Json(params): Json<DbPutParams>,
) -> Result<(), (StatusCode, String)> {
    let db = state.db.lock().map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;
    db.put(&params.store, &params.id, &params.value, &params.indexes.unwrap_or_default())
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e))
}

pub async fn handle_db_delete(
    State(state): State<Arc<AppState>>,
    Json(params): Json<DbDeleteParams>,
) -> Result<(), (StatusCode, String)> {
    let db = state.db.lock().map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;
    db.delete(&params.store, &params.id)
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e))
}

pub async fn handle_db_get_all(
    State(state): State<Arc<AppState>>,
    Json(params): Json<DbGetAllParams>,
) -> Result<Json<Vec<Value>>, (StatusCode, String)> {
    let db = state.db.lock().map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;
    let values = db.get_all::<Value>(&params.store)
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e))?;
    Ok(Json(values))
}

// ... 其他 handlers 类似
```

### 4.3 前端 HttpStoreBackend (frontend/src/lib/storage/http-backend.ts)

```typescript
import type { StoreBackend } from "./types";
import { apiPost, apiGet } from "@/lib/api/client";

export class HttpStoreBackend implements StoreBackend {
  async get<T>(storeName: string, key: string): Promise<T | undefined> {
    const result = await apiPost<{ value: T | null }>("/db/get", {
      store: storeName,
      id: key,
    });
    return result.value ?? undefined;
  }

  async getAll<T>(storeName: string): Promise<T[]> {
    return apiPost<T[]>("/db/get_all", { store: storeName });
  }

  async put<T>(storeName: string, value: T & { id: string }): Promise<void> {
    const indexes = buildIndexes(storeName, value);
    return apiPost("/db/put", {
      store: storeName,
      id: value.id,
      value,
      indexes,
    });
  }

  async delete(storeName: string, key: string): Promise<void> {
    return apiPost("/db/delete", { store: storeName, id: key });
  }

  async getAllFromIndex<T>(
    storeName: string,
    indexName: string,
    value?: unknown,
  ): Promise<T[]> {
    return apiPost<T[]>("/db/get_all_from_index", {
      store: storeName,
      index_name: indexName,
      index_value: value ?? null,
    });
  }

  async count(storeName: string): Promise<number> {
    const result = await apiPost<{ count: number }>("/db/count", { store: storeName });
    return result.count;
  }

  async clear(storeName: string): Promise<void> {
    return apiPost("/db/clear", { store: storeName });
  }
}

// 从现有的 INDEX_DEFS 映射构建索引条目
function buildIndexes(store: string, value: Record<string, unknown>): Array<{ name: string; value: string }> {
  const INDEX_DEFS: Record<string, Record<string, string>> = {
    sessions: { "by-updatedAt": "$.updatedAt" },
    messages: { "by-sessionId": "$.sessionId", "by-sessionId-createdAt": "$.sessionId" },
    userSkills: { "by-slug": "$.slug" },
    automations: { "by-updatedAt": "$.updatedAt" },
    agentTodos: { "by-sessionId": "$.sessionId", "by-sessionId-order": "$.sessionId" },
  };
  
  const defs = INDEX_DEFS[store];
  if (!defs) return [];
  
  return Object.entries(defs).map(([name, jsonPath]) => {
    const key = jsonPath.replace("$.", "");
    return { name, value: String(value[key] ?? "") };
  });
}
```

### 4.4 配置 (Settings) 存储

```typescript
// frontend/src/lib/storage/http-kv.ts
import { apiGet, apiPost } from "@/lib/api/client";
import type { SyncKVStore } from "./types";

export class HttpKvStore implements SyncKVStore {
  getItem(key: string): string | null {
    // 同步无法用 fetch，但可以通过初始化时预加载全部配置到内存
    throw new Error("Use getSettings() async API instead");
  }
  setItem(key: string, value: string): void {
    throw new Error("Use setSettings() async API instead");
  }
  removeItem(key: string): void {
    throw new Error("Use deleteSettings() async API instead");
  }
}

// 用 async API 替代
export async function getSettings(): Promise<Record<string, string>> {
  return apiGet("/settings/get");
}

export async function setSetting(key: string, value: string): Promise<void> {
  return apiPost("/settings/set", { key, value });
}

export async function deleteSetting(key: string): Promise<void> {
  return apiPost("/settings/delete", { key });
}
```

```rust
// backend/src/http/routes_settings.rs
use axum::{Json, extract::State, http::StatusCode};
use serde::{Deserialize, Serialize};
use serde_json::{Value, json};
use std::sync::Arc;
use std::path::PathBuf;

use crate::AppState;

const SETTINGS_FILE: &str = "settings.json";

fn settings_path(coder_dir: &PathBuf) -> PathBuf {
    coder_dir.join(SETTINGS_FILE)
}

fn load_settings(path: &PathBuf) -> Result<Value, String> {
    if path.exists() {
        let content = std::fs::read_to_string(path).map_err(|e| e.to_string())?;
        serde_json::from_str(&content).map_err(|e| e.to_string())
    } else {
        Ok(json!({}))
    }
}

fn save_settings(path: &PathBuf, settings: &Value) -> Result<(), String> {
    let content = serde_json::to_string_pretty(settings).map_err(|e| e.to_string())?;
    std::fs::write(path, content).map_err(|e| e.to_string())
}

pub async fn handle_settings_get(
    State(state): State<Arc<AppState>>,
) -> Result<Json<Value>, (StatusCode, String)> {
    let coder_dir = get_coder_data_dir();
    let settings = load_settings(&settings_path(&coder_dir))
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e))?;
    Ok(Json(settings))
}

#[derive(Deserialize)]
pub struct SetSettingParams { key: String, value: String }

pub async fn handle_settings_set(
    State(state): State<Arc<AppState>>,
    Json(params): Json<SetSettingParams>,
) -> Result<(), (StatusCode, String)> {
    let coder_dir = get_coder_data_dir();
    let path = settings_path(&coder_dir);
    let mut settings = load_settings(&path).unwrap_or(json!({}));
    settings[&params.key] = json!(params.value);
    save_settings(&path, &settings).map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e))
}

#[derive(Deserialize)]
pub struct DeleteSettingParams { key: String }

pub async fn handle_settings_delete(
    State(state): State<Arc<AppState>>,
    Json(params): Json<DeleteSettingParams>,
) -> Result<(), (StatusCode, String)> {
    let coder_dir = get_coder_data_dir();
    let path = settings_path(&coder_dir);
    let mut settings = load_settings(&path).unwrap_or(json!({}));
    settings.as_object_mut().map(|obj| obj.remove(&params.key));
    save_settings(&path, &settings).map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e))
}

fn get_coder_data_dir() -> PathBuf {
    let home = std::env::var("HOME")
        .or_else(|_| std::env::var("USERPROFILE"))
        .unwrap_or_else(|_| ".".to_string());
    PathBuf::from(home).join(".coder")
}
```

### 4.5 Workspace 逻辑简化

```typescript
// frontend/src/features/workspace/workspace-provider.tsx
// 极大简化：workspace 由服务端决定 (CWD)，前端不再管理

import { apiGet } from "@/lib/api/client";
import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

interface WorkspaceInfo {
  workspaceDir: string | null;
  loading: boolean;
}

const WorkspaceContext = createContext<WorkspaceInfo>({ workspaceDir: null, loading: true });

export function WorkspaceProvider({ children }: { children: ReactNode }) {
  const [info, setInfo] = useState<WorkspaceInfo>({ workspaceDir: null, loading: true });
  
  useEffect(() => {
    apiGet<{ workspace_dir: string }>("/api/server_info")
      .then((data) => setInfo({ workspaceDir: data.workspace_dir, loading: false }))
      .catch(() => setInfo({ workspaceDir: null, loading: false }));
  }, []);
  
  return (
    <WorkspaceContext.Provider value={info}>
      {children}
    </WorkspaceContext.Provider>
  );
}

export function useWorkspace() {
  return useContext(WorkspaceContext);
}
```

---

## 5. 阶段四：SSE 流式响应

### 5.1 AgentRegistry 修改 (backend/src/agent/registry.rs)

```rust
// 当前: 接收 tauri::ipc::Channel
pub fn start(&mut self, params: AgentStartParams, channel: Channel<AgentEvent>, ...)

// 改为: 通过 SseBroadcaster 发送事件
pub fn start(
    &mut self,
    params: AgentStartParams,
    broadcaster: Arc<SseBroadcaster>,
    ...
) -> Result<(), String> {
    // ... 参数校验 ...
    
    // 注册任务
    let _tx = broadcaster.register_task(&params.task_id);
    let task_broadcaster = broadcaster.clone();
    let emit_task_id = params.task_id.clone();
    
    // 发送初始状态
    broadcaster.emit(&params.task_id, AgentEvent::Status {
        task_id: emit_task_id.clone(),
        status: AgentStatus::Running,
    });
    
    // 启动异步任务 (tokio::spawn)
    tokio::spawn(async move {
        let result = stream_chat_completion(
            &client, url, &api_key, &model, &messages,
            tools.as_deref(), request_extensions.as_ref(),
            child_cancel.clone(),
            |event| {
                debug_emit_log(&event);
                task_broadcaster.emit(&emit_task_id, event);
            },
            &task_id,
        ).await;
        
        // 发送最终状态
        let final_status = if child_cancel.is_cancelled() {
            AgentStatus::Cancelled
        } else { /* ... */ };
        task_broadcaster.emit(&task_id, AgentEvent::Status {
            task_id: task_id.clone(),
            status: final_status,
        });
        
        // 清理
        task_broadcaster.unregister_task(&task_id);
    });
    
    Ok(())
}
```

### 5.2 Agent HTTP 端点 (backend/src/http/routes_tool.rs)

```rust
use axum::{Json, extract::State, http::StatusCode};
use serde::Deserialize;
use std::sync::Arc;

use crate::AppState;
use crate::agent::{AgentStartParams, AgentEvent, AgentStatusResponse};

#[derive(Deserialize)]
pub struct AgentStartPayload {
    task_id: String,
    base_url: String,
    api_key: Option<String>,
    api_key_source: String,
    api_key_env_var: String,
    model: String,
    messages: Vec<serde_json::Value>,
    tools: Option<Vec<serde_json::Value>>,
    request_extensions: Option<serde_json::Value>,
}

pub async fn handle_agent_start(
    State(state): State<Arc<AppState>>,
    Json(payload): Json<AgentStartPayload>,
) -> Result<Json<serde_json::Value>, (StatusCode, String)> {
    let params = AgentStartParams {
        task_id: payload.task_id,
        base_url: payload.base_url,
        api_key: payload.api_key,
        api_key_source: payload.api_key_source,
        api_key_env_var: payload.api_key_env_var,
        model: payload.model,
        messages: payload.messages,
        tools: payload.tools,
        request_extensions: payload.request_extensions,
    };
    
    let mut registry = state.agent_registry.lock()
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;
    
    registry.start(params, state.sse_broadcaster.clone())
        .map_err(|e| (StatusCode::BAD_REQUEST, e))?;
    
    Ok(Json(serde_json::json!({ "ok": true })))
}

pub async fn handle_agent_cancel(
    State(state): State<Arc<AppState>>,
    Json(payload): Json<serde_json::Value>,
) -> Result<Json<serde_json::Value>, (StatusCode, String)> {
    let task_id = payload.get("taskId")
        .and_then(|v| v.as_str())
        .ok_or_else(|| (StatusCode::BAD_REQUEST, "taskId required".to_string()))?;
    
    let mut registry = state.agent_registry.lock()
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;
    registry.cancel(task_id)
        .map_err(|e| (StatusCode::NOT_FOUND, e))?;
    
    Ok(Json(serde_json::json!({ "ok": true })))
}

pub async fn handle_agent_status(
    State(state): State<Arc<AppState>>,
    Json(payload): Json<serde_json::Value>,
) -> Result<Json<Option<AgentStatusResponse>>, (StatusCode, String)> {
    let task_id = payload.get("taskId")
        .and_then(|v| v.as_str())
        .ok_or_else(|| (StatusCode::BAD_REQUEST, "taskId required".to_string()))?;
    
    let registry = state.agent_registry.lock()
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;
    let status = registry.get_status(task_id);
    Ok(Json(status))
}
```

---

## 6. 阶段五：PTY WebSocket

### 6.1 Rust WebSocket Handler (backend/src/http/routes_ws.rs)

```rust
use axum::{
    extract::{
        ws::{Message, WebSocket, WebSocketUpgrade},
        State,
    },
    response::IntoResponse,
};
use futures::{SinkExt, StreamExt};
use std::sync::Arc;
use portable_pty::{PtySize, native_pty_system};

use crate::AppState;

pub async fn handle_pty_ws(
    ws: WebSocketUpgrade,
    State(state): State<Arc<AppState>>,
) -> impl IntoResponse {
    ws.on_upgrade(move |socket| handle_pty_socket(socket, state))
}

async fn handle_pty_socket(mut socket: WebSocket, state: Arc<AppState>) {
    let pty_system = native_pty_system();
    let pair = match pty_system.openpty(PtySize {
        rows: 24,
        cols: 80,
        pixel_width: 0,
        pixel_height: 0,
    }) {
        Ok(pair) => pair,
        Err(e) => {
            let _ = socket.send(Message::Text(format!("PTY error: {e}"))).await;
            return;
        }
    };

    let pty_id = uuid::Uuid::new_v4().to_string();
    {
        let mut registry = state.pty_registry.lock().unwrap();
        registry.insert(&pty_id, /* ... */);
    }

    let mut reader = pair.reader();
    let mut writer = pair.writer();

    // Fork child process
    let cmd = std::process::Command::new(
        std::env::var("SHELL").unwrap_or_else(|_| "/bin/sh".to_string()),
    )
    .current_dir(&state.workspace_dir);
    
    let mut child = pair.slave.spawn_command(cmd).unwrap();

    // PTY → WebSocket
    let (mut ws_sender, mut ws_receiver) = socket.split();
    let send_task = tokio::spawn(async move {
        let mut buf = [0u8; 4096];
        loop {
            match reader.read(&mut buf) {
                Ok(0) => break,
                Ok(n) => {
                    if ws_sender.send(Message::Binary(buf[..n].to_vec())).await.is_err() {
                        break;
                    }
                }
                Err(_) => break,
            }
        }
    });

    // WebSocket → PTY
    while let Some(Ok(msg)) = ws_receiver.next().await {
        match msg {
            Message::Text(text) => {
                // 解析控制消息: resize, 原始输入等
                if let Ok(cmd) = serde_json::from_str::<PtyControl>(&text) {
                    match cmd {
                        PtyControl::Resize { cols, rows } => {
                            pair.resize(PtySize { rows, cols, pixel_width: 0, pixel_height: 0 }).ok();
                        }
                        PtyControl::Input(data) => {
                            writer.write_all(data.as_bytes()).ok();
                        }
                    }
                } else {
                    writer.write_all(text.as_bytes()).ok();
                }
            }
            Message::Binary(data) => {
                writer.write_all(&data).ok();
            }
            Message::Close(_) => break,
            _ => {}
        }
    }

    send_task.abort();
    let _ = child.wait();
    
    let mut registry = state.pty_registry.lock().unwrap();
    registry.remove(&pty_id);
}

#[derive(serde::Deserialize)]
enum PtyControl {
    Resize { cols: u16, rows: u16 },
    Input(String),
}
```

### 6.2 前端 PTY 连接 (frontend/src/features/terminal/interactive-terminal.tsx)

```typescript
import { Terminal } from "@xterm/xterm";
import { AttachAddon } from "@xterm/addon-attach";
import { FitAddon } from "@xterm/addon-fit";

// 核心改动: 用 WebSocket 替代 Tauri event 系统
useEffect(() => {
  if (!containerRef.current) return;

  const terminal = new Terminal(getXtermTheme(resolved));
  const fitAddon = new FitAddon();
  terminal.loadAddon(fitAddon);
  
  // WebSocket 连接
  const wsUrl = `${window.location.origin.replace(/^http/, "ws")}/ws/pty`;
  const ws = new WebSocket(wsUrl);
  const attachAddon = new AttachAddon(ws);
  terminal.loadAddon(attachAddon);
  
  terminal.open(containerRef.current);
  fitAddon.fit();
  
  return () => {
    terminal.dispose();
    ws.close();
  };
}, [cwd, resolved]);
```

### 6.3 xterm addon 依赖

```json
// frontend/package.json 新增
{
  "dependencies": {
    "@xterm/addon-attach": "^0.11.0"
  }
}
```

---

## 7. 阶段六：项目结构清理

### 7.1 目录迁移操作

```
# 迁移 Rust 后端
mv src-tauri backend

# 迁移前端代码
mv src frontend/
mv index.html frontend/
mv vite.config.ts frontend/
mv tsconfig.json frontend/
mv tsconfig.node.json frontend/
mv components.json frontend/
mv public/ frontend/

# 删除 Tauri 残余
rm -rf src-tauri/icons
rm -rf src-tauri/capabilities
rm -rf src-tauri/gen
rm -f src-tauri/build.rs
rm -f src-tauri/tauri.conf.json
rm -f src-tauri/.taurignore

# 删除 CLI
rm -rf cli

# 删除前端 Tauri 相关代码
rm -rf frontend/src/lib/tauri/
rm -f frontend/src/lib/dnd/tauri-native-file-drop.ts
rm -f frontend/src/lib/storage/tauri-fs-kv.ts
rm -f frontend/src/lib/storage/tauri-sqlite.ts
rm -f frontend/src/features/workspace/pick-workspace-dir.ts
rm -f frontend/src/features/chat/hooks/use-tauri-native-file-drop-target.ts

# 创建新目录
mkdir -p backend/src/http
mkdir -p backend/src/db

# 更新 backend/src/main.rs 指向新路径
# 更新 backend/Cargo.toml 移除 Tauri 依赖
```

### 7.2 根目录 .gitignore 更新

```gitignore
# Rust
backend/target/

# Frontend
frontend/node_modules/
frontend/dist/

# OS
.DS_Store
Thumbs.db

# Coder data
.coder/

# IDE
.vscode/
.idea/
```

### 7.3 frontend/package.json 精简

```json
{
  "name": "coder-frontend",
  "private": true,
  "version": "0.1.0",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc && vite build",
    "test": "vitest run",
    "test:watch": "vitest",
    "preview": "vite preview"
  },
  "dependencies": {
    // 删除:
    - "@tauri-apps/api"
    - "@tauri-apps/plugin-dialog"
    - "@tauri-apps/plugin-fs"
    - "@tauri-apps/plugin-opener"
    - "@tauri-apps/plugin-sql"

    // 新增:
    + "@xterm/addon-attach": "^0.11.0"

    // 保留:
    "@base-ui/react": "...",
    "@xterm/addon-fit": "...",
    "@xterm/xterm": "...",
    "react": "...",
    "react-dom": "...",
    // ... 其余不变
  },
  "devDependencies": {
    // 删除:
    - "@tauri-apps/cli"

    // 保留:
    "@vitejs/plugin-react": "...",
    "typescript": "...",
    "vite": "...",
    "vitest": "...",
    // ...
  }
}
```

### 7.4 vite.config.ts 精简

```typescript
// frontend/vite.config.ts
import path from "path";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  build: {
    outDir: "dist",
  },
  server: {
    port: 1420,
  },
});
```

---

## 8. 阶段七：构建与发布

### 8.1 构建命令

```bash
# 1. 构建前端
cd frontend
pnpm install
pnpm build    # → frontend/dist/

# 2. 构建 Rust 二进制 (embed frontend/dist/)
cd ../backend
cargo build --release
# → backend/target/release/coder (Linux/macOS)
# → backend/target/release/coder.exe (Windows)
```

### 8.2 npm 包结构

```
@alanwchat/coder/
├── package.json
├── bin.js                    ← Node.js 入口脚本
├── README.md
└── platform/
    ├── coder-linux-x64.gz
    ├── coder-linux-arm64.gz
    ├── coder-darwin-arm64.gz
    ├── coder-darwin-x64.gz
    └── coder-windows-x64.zip
```

### 8.3 bin.js (入口脚本)

```javascript
#!/usr/bin/env node
const { spawn } = require("child_process");
const fs = require("fs");
const path = require("path");
const https = require("https");
const zlib = require("zlib");

const PLATFORM_MAP = {
  "linux-x64":     { file: "coder-linux-x64.gz",     decompress: true },
  "linux-arm64":   { file: "coder-linux-arm64.gz",   decompress: true },
  "darwin-arm64":  { file: "coder-darwin-arm64.gz",  decompress: true },
  "darwin-x64":    { file: "coder-darwin-x64.gz",    decompress: true },
  "win32-x64":     { file: "coder-windows-x64.zip",  decompress: false },
};

function getPlatformKey() {
  return `${process.platform}-${process.arch}`;
}

function getBinaryPath() {
  const key = getPlatformKey();
  const entry = PLATFORM_MAP[key];
  if (!entry) {
    console.error(`Unsupported platform: ${key}`);
    process.exit(1);
  }

  const pkgDir = path.join(__dirname, "platform");
  const binaryName = entry.file.replace(/\.(gz|zip)$/, "");
  const binaryPath = path.join(pkgDir, binaryName);

  if (!fs.existsSync(binaryPath)) {
    console.log(`Downloading Coder binary for ${key}...`);
    downloadBinary(entry.file, binaryPath);
  }

  return binaryPath;
}

function downloadBinary(name, destPath) {
  const url = `https://github.com/leyen-me/coder/releases/latest/download/${name}`;
  // 实际下载 + 解压逻辑参考 esbuild install.js
  // （省去具体实现，生产代码约 80 行）
}

// 启动
const binaryPath = getBinaryPath();
const proc = spawn(binaryPath, process.argv.slice(2), {
  stdio: "inherit",
  env: { ...process.env },
});
proc.on("exit", (code) => process.exit(code ?? 1));
```

### 8.4 release.yml

```yaml
name: Build and release

on:
  push:
    branches: [main]
  workflow_dispatch:

permissions:
  contents: write

concurrency:
  group: release-${{ github.ref }}
  cancel-in-progress: false

jobs:
  prepare-tag:
    runs-on: ubuntu-latest
    outputs:
      tag_name: ${{ steps.tag.outputs.TAG }}
      version: ${{ steps.tag.outputs.VERSION }}
      changelog: ${{ steps.changelog.outputs.CHANGELOG }}
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0
      - name: Generate tag
        id: tag
        run: |
          VERSION="0.1.${{ github.run_number }}"
          echo "TAG=v$VERSION" >> "$GITHUB_OUTPUT"
          echo "VERSION=$VERSION" >> "$GITHUB_OUTPUT"
      - name: Generate changelog
        id: changelog
        run: |
          LAST_TAG=$(git tag --list 'v0.0.*' --sort=-creatordate | head -1 || true)
          RANGE="${LAST_TAG:+$LAST_TAG..}HEAD"
          CHANGELOG=$(git log --oneline --no-decorate $RANGE 2>/dev/null || echo "")
          EOF=$(dd if=/dev/urandom bs=15 count=1 status=none | base64)
          { echo "CHANGELOG<<$EOF"; echo "$CHANGELOG"; echo "$EOF"; } >> "$GITHUB_OUTPUT"

  build-linux-x64:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
        with:
          version: 9
      - uses: actions/setup-node@v4
        with:
          node-version: lts/*
          cache: pnpm
          cache-dependency-path: frontend/pnpm-lock.yaml
      - uses: dtolnay/rust-toolchain@stable
      - uses: swatinem/rust-cache@v2
        with:
          workspaces: backend
      - name: Build frontend
        run: |
          cd frontend
          pnpm install --frozen-lockfile
          pnpm build
      - name: Build Rust binary
        run: |
          cd backend
          cargo build --release
      - name: Compress
        run: gzip -c backend/target/release/coder > coder-linux-x64.gz
      - uses: actions/upload-artifact@v4
        with:
          name: coder-linux-x64
          path: coder-linux-x64.gz

  build-darwin-arm64:
    runs-on: macos-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
        with:
          version: 9
      - uses: actions/setup-node@v4
        with:
          node-version: lts/*
          cache: pnpm
          cache-dependency-path: frontend/pnpm-lock.yaml
      - uses: dtolnay/rust-toolchain@stable
      - uses: swatinem/rust-cache@v2
        with:
          workspaces: backend
      - name: Build frontend
        run: |
          cd frontend
          pnpm install --frozen-lockfile
          pnpm build
      - name: Build Rust binary
        run: |
          cd backend
          cargo build --release
      - name: Compress
        run: gzip -c backend/target/release/coder > coder-darwin-arm64.gz
      - uses: actions/upload-artifact@v4
        with:
          name: coder-darwin-arm64
          path: coder-darwin-arm64.gz

  build-windows-x64:
    runs-on: windows-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
        with:
          version: 9
      - uses: actions/setup-node@v4
        with:
          node-version: lts/*
          cache: pnpm
          cache-dependency-path: frontend/pnpm-lock.yaml
      - uses: dtolnay/rust-toolchain@stable
      - uses: swatinem/rust-cache@v2
        with:
          workspaces: backend
      - name: Build frontend
        run: |
          cd frontend
          pnpm install --frozen-lockfile
          pnpm build
      - name: Build Rust binary
        run: |
          cd backend
          cargo build --release
      - name: Compress
        shell: pwsh
        run: Compress-Archive -Path backend/target/release/coder.exe -DestinationPath coder-windows-x64.zip
      - uses: actions/upload-artifact@v4
        with:
          name: coder-windows-x64
          path: coder-windows-x64.zip

  publish-npm:
    needs:
      - prepare-tag
      - build-linux-x64
      - build-darwin-arm64
      - build-windows-x64
    runs-on: ubuntu-latest
    permissions:
      id-token: write
      contents: read
    steps:
      - uses: actions/checkout@v4
      - uses: actions/download-artifact@v4
      - name: Prepare npm package
        run: |
          mkdir -p npm-package/platform
          cp coder-linux-x64/coder-linux-x64.gz npm-package/platform/
          cp coder-darwin-arm64/coder-darwin-arm64.gz npm-package/platform/
          cp coder-windows-x64/coder-windows-x64.zip npm-package/platform/
          cp packaging/bin.js npm-package/bin.js
          cp packaging/package.json npm-package/
          cp README.md npm-package/
      - name: Set version
        working-directory: npm-package
        run: npm version --no-git-tag-version "${{ needs.prepare-tag.outputs.version }}"
      - name: Publish
        working-directory: npm-package
        env:
          NODE_AUTH_TOKEN: ${{ secrets.NPM_TOKEN }}
        run: npm publish --provenance --access public

  publish-github-release:
    needs:
      - prepare-tag
      - build-linux-x64
      - build-darwin-arm64
      - build-windows-x64
    runs-on: ubuntu-latest
    permissions:
      contents: write
    steps:
      - uses: actions/download-artifact@v4
      - name: Create Release
        uses: softprops/action-gh-release@v2
        with:
          tag_name: ${{ needs.prepare-tag.outputs.tag_name }}
          name: ${{ needs.prepare-tag.outputs.tag_name }}
          body: ${{ needs.prepare-tag.outputs.changelog }}
          files: |
            coder-linux-x64/coder-linux-x64.gz
            coder-darwin-arm64/coder-darwin-arm64.gz
            coder-windows-x64/coder-windows-x64.zip
          draft: false
          prerelease: false
```

---

## 9. 风险与注意事项

### 9.1 风险矩阵

| 风险 | 等级 | 缓解措施 |
|------|------|---------|
| **AgentRegistry 中 tauri::async_runtime::spawn 改为 tokio::spawn** | 高 | 直接替换，tokio 的 spawn 语义相同 |
| **Tauri Channel 替换为 SSE 广播，流式体验差异** | 高 | broadcast::channel 有 1024 容量上限，大模型长回复可能填满。需要设置合理的缓冲区大小 + 背压监控 |
| **数据库迁移过程中历史会话丢失** | 中 | 旧数据在 IndexedDB 中，首次启动不自动迁移。可增加 `/db/import` 端点允许用户在 UI 上触发迁移 |
| **PTY WebSocket 实现的复杂度** | 中 | 可推迟到核心功能上线后再实现。第一阶段先确保 `tool_shell`（非交互式）可用 |
| **前端大量文件需要修改 (35+)** | 中 | 批量替换，工具 handler 的模式高度一致，可写 codemod 脚本 |
| **开发时跨域问题** | 低 | `vite dev` 端口 (1420) 与后端端口不同。需要在 Vite 配置 proxy 或后端加 CORS |
| **npm 包多平台二进制管理** | 低 | 参考 esbuild/sharp 的成熟方案 |
| **无桌面环境时 open::that 失败** | 低 | `--no-open` 参数保底，打印 URL 让用户手动访问 |
| **配置文件 settings.json 并发写入** | 低 | 当前 Tauri 也是文件操作，且配置基本在单用户场景下使用，无并发问题 |

### 9.2 实施顺序与依赖关系

```
                     ┌───────────────────┐
                     │ 迁移目录结构        │
                     │ (仓库初始步骤)      │
                     └────────┬──────────┘
                              │
              ┌───────────────┼───────────────┐
              ▼               ▼               ▼
     ┌─────────────────┐  ┌──────────┐  ┌────────────┐
     │ 后端: axum core  │  │ 后端: db │  │ 前端: 移除 │
     │ + SSE           │  │ (SQLite) │  │ Tauri 依赖 │
     │ + 静态文件       │  │          │  │ + 统一 API │
     └────────┬────────┘  └─────┬────┘  └──────┬─────┘
              │                 │               │
              ▼                 ▼               │
     ┌────────────────────────────┐             │
     │ 后端: 所有工具端点          │             │
     │ (30+ handlers 逐一迁移)     │             │
     └────────────────────────────┘             │
                              │                 │
                              ▼                 ▼
                    ┌──────────────────────────────┐
                    │ 前端: 全部替换为 apiPost      │
                    │ 30+ files, 验证完整流式可用    │
                    └──────────────┬───────────────┘
                                   │
                    ┌──────────────┴───────────────┐
                    │ PTY WebSocket (可选推迟)      │
                    │ release.yml 构建发布           │
                    └──────────────────────────────┘
```

### 9.3 测试策略

1. **Rust 侧单元测试**：所有 SQLite 操作、工具 handler 参数校验、路由响应
2. **HTTP API 集成测试**：在测试中启动 axum server，用 `reqwest` 调各端点
3. **前端组件测试**：vitest 保持不变，只需将 mock 从 mock invoke 改为 mock fetch
4. **端到端手动测试清单**：
   - [ ] `cd /tmp/test-project && cargo run` 启动成功
   - [ ] 浏览器打开 URL，页面正常渲染
   - [ ] 发送一条消息，Agent 完整回复（SSE 流式）
   - [ ] Agent 调用 shell 执行命令并返回结果
   - [ ] Agent 读文件、写文件、编辑文件
   - [ ] Ctrl+C 优雅退出，后台 shell 被清理
   - [ ] 同时运行两个实例（不同目录、不同端口）
   - [ ] 修改设置 → 刷新页面 → 设置持久化
   - [ ] 交互式终端 (PTY) 正常打开和操作
   - [ ] 多平台: macOS, Windows, Linux

### 9.4 工作量估算

```
后端新增文件:       ~8 个   (http/*.rs, db/*.rs)
后端修改文件:       ~5 个   (agent/*.rs, lib.rs, main.rs, Cargo.toml)
后端删除文件:       ~6 个   (build.rs, window_chrome.rs, tauri 配置文件)
后端迁移保留文件:   ~35 个  (tools/*.rs 不动, agent/*.rs 微调)

前端新增文件:       ~5 个   (api/client.ts, api/sse.ts, storage/http-backend.ts 等)
前端修改文件:       ~35 个  (所有工具 handler + runner + 组件)
前端删除文件:       ~12 个  (tauri/*, tauri-fs-kv.ts, tauri-sqlite.ts 等)

CLI 删除:          ~15 个文件 (整个 cli/ 目录)

CI/CD:             ~3 个文件 (release.yml 重写, .gitignore 更新)

总计估计:          ~120 个文件操作
估算人天:          15-20 天 (单人全职, 含测试和调试)
```

### 9.5 回滚方案

如果在实施过程中发现重大阻塞问题，可以：

1. **临时保留 Tauri 路径**：前端保留 `isTauri()` 判断，新 API 路径和旧 invoke 路径共存。所有 `@tauri-apps/*` 代码先保留不动，API 层加一个适配器
2. **分阶段推进**：不一定要一次完成所有迁移。可以先只迁移文件工具（不依赖系统的功能），再迁移 shell/agent 等
3. **PTY 最后做**：交互式终端依赖 WebSocket，如果遇到阻塞可以先提 PR 但标记为 WIP

但根据当前评估，没有不可逾越的技术障碍。所有已有 Rust 逻辑都可以直接在 HTTP server 中复用。
