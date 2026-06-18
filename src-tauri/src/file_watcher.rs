use std::path::{Path, PathBuf};
use std::sync::Arc;
use std::time::Duration;

use ignore::gitignore::{Gitignore, GitignoreBuilder};
use notify::{Event, EventKind, RecursiveMode, Watcher};
use tauri::{AppHandle, Emitter};
use tokio::sync::{mpsc, watch};

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

/// Manages a file-system watcher for a workspace directory.
///
/// Drops the underlying watcher and stops the debounce loop on drop.
pub struct WorkspaceWatcher {
    watcher: Option<notify::RecommendedWatcher>,
    cancel_tx: watch::Sender<bool>,
    dir: PathBuf,
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

impl WorkspaceWatcher {
    /// Start watching `workspace_dir` recursively.
    ///
    /// Events are debounced for 500 ms and then classified into
    /// `"workspace:files-changed"` (non‑gitignored file changes) and
    /// `"workspace:git-changed"` (changes under `.git/`).
    pub fn start(app_handle: &AppHandle, workspace_dir: &Path) -> Self {
        let app_handle = app_handle.clone();
        let workspace_dir = workspace_dir.to_path_buf();

        // Channel from notify callback → tokio task
        let (event_tx, event_rx) = mpsc::unbounded_channel::<Event>();

        // Build the watcher
        let mut watcher = notify::RecommendedWatcher::new(
            move |res: Result<Event, notify::Error>| {
                if let Ok(event) = res {
                    // Ignore internal temporary events such as `AnyOther` that
                    // are noise on macOS.
                    if !matches!(event.kind, EventKind::Any) {
                        let _ = event_tx.send(event);
                    }
                }
            },
            notify::Config::default().with_poll_interval(Duration::from_secs(2)),
        )
        .expect("Failed to create file watcher");

        // Start recursive watching
        watcher
            .watch(&workspace_dir, RecursiveMode::Recursive)
            .unwrap_or_else(|e| {
                panic!(
                    "Failed to start watching workspace dir '{}': {e}",
                    workspace_dir.display()
                )
            });

        // Pre‑compile .gitignore rules
        let gitignore = build_gitignore(&workspace_dir);

        // Cancellation channel
        let (cancel_tx, cancel_rx) = watch::channel(false);

        // Spawn the debounce + emit loop using the Tauri-managed runtime
        tauri::async_runtime::spawn(debounce_and_emit(
            app_handle,
            event_rx,
            cancel_rx,
            Arc::new(gitignore),
            workspace_dir.clone(),
        ));

        Self {
            watcher: Some(watcher),
            cancel_tx,
            dir: workspace_dir,
        }
    }

    /// Stop watching immediately.
    pub fn stop(&mut self) {
        // Drop the watcher first – this stops the notify callback from firing.
        if let Some(w) = self.watcher.take() {
            drop(w);
        }
        // Signal the tokio task to exit.
        let _ = self.cancel_tx.send(true);
    }

    /// The directory being watched.
    pub fn dir(&self) -> &Path {
        &self.dir
    }

    /// Replace the watcher with a new one for a different directory.
    pub fn restart(&mut self, app_handle: &AppHandle, new_dir: &Path) {
        self.stop();
        *self = Self::start(app_handle, new_dir);
    }
}

impl Drop for WorkspaceWatcher {
    fn drop(&mut self) {
        self.stop();
    }
}

// ---------------------------------------------------------------------------
// Debounce loop
// ---------------------------------------------------------------------------

async fn debounce_and_emit(
    app_handle: AppHandle,
    mut event_rx: mpsc::UnboundedReceiver<Event>,
    mut cancel_rx: watch::Receiver<bool>,
    gitignore: Arc<Gitignore>,
    workspace_dir: PathBuf,
) {
    const DEBOUNCE_MS: Duration = Duration::from_millis(500);

    let mut pending_events: Vec<Event> = Vec::new();

    loop {
        // ── Wait for the first event ──
        let first = tokio::select! {
            _ = cancel_rx.changed() => {
                process_batch(&app_handle, &pending_events, &gitignore, &workspace_dir);
                return;
            }
            maybe = event_rx.recv() => {
                match maybe {
                    Some(ev) => ev,
                    None => {
                        process_batch(&app_handle, &pending_events, &gitignore, &workspace_dir);
                        return;
                    }
                }
            }
        };
        pending_events.push(first);

        // ── Collect more events until 500 ms of silence ──
        loop {
            tokio::select! {
                _ = cancel_rx.changed() => {
                    process_batch(&app_handle, &pending_events, &gitignore, &workspace_dir);
                    return;
                }
                maybe = event_rx.recv() => {
                    match maybe {
                        Some(ev) => pending_events.push(ev),
                        None => {
                            process_batch(&app_handle, &pending_events, &gitignore, &workspace_dir);
                            return;
                        }
                    }
                }
                _ = tokio::time::sleep(DEBOUNCE_MS) => {
                    // No new events → process the batch
                    process_batch(&app_handle, &pending_events, &gitignore, &workspace_dir);
                    pending_events.clear();
                    break;
                }
            }
        }
    }
}

// ---------------------------------------------------------------------------
// Event classification & emission
// ---------------------------------------------------------------------------

fn process_batch(
    app_handle: &AppHandle,
    events: &[Event],
    gitignore: &Gitignore,
    workspace_dir: &Path,
) {
    if events.is_empty() {
        return;
    }

    let mut files_changed = false;
    let mut git_changed = false;

    for event in events {
        for path in &event.paths {
            let relative = path.strip_prefix(workspace_dir).unwrap_or(path);
            let relative_str = relative.to_string_lossy();

            // ── .git/ changes → git panel refresh ──
            if relative_str == ".git" || relative_str.starts_with(".git/") {
                git_changed = true;
                continue;
            }

            // ── Skip gitignored paths ──
            if gitignore.matched(relative, path.is_dir()).is_ignore() {
                continue;
            }

            // ── Everything else → file tree refresh ──
            files_changed = true;
        }
    }

    // Emit events (order doesn't matter; both may fire for the same batch)
    if files_changed {
        log::debug!("file-watcher: emitting workspace:files-changed ({} events)", events.len());
        let _ = app_handle.emit("workspace:files-changed", ());
    }
    if git_changed {
        log::debug!("file-watcher: emitting workspace:git-changed ({} events)", events.len());
        let _ = app_handle.emit("workspace:git-changed", ());
    }
}

// ---------------------------------------------------------------------------
// .gitignore builder (duplicated from tools/text_file.rs to keep this module
// self‑contained and avoid coupling with the tools module)
// ---------------------------------------------------------------------------

fn build_gitignore(workspace: &Path) -> Gitignore {
    let mut builder = GitignoreBuilder::new(workspace);
    let root_gitignore = workspace.join(".gitignore");
    if root_gitignore.is_file() {
        builder.add(root_gitignore);
    }

    let exclude = workspace.join(".git").join("info").join("exclude");
    if exclude.is_file() {
        builder.add(exclude);
    }

    builder.build().unwrap_or_else(|_| Gitignore::empty())
}
