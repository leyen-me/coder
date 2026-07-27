use std::sync::Arc;

use crate::agent;
use crate::db::session_store::list_sessions_by_parent;
use crate::tools::shell_kill_by_task;
use crate::AppState;

/// Cancel the active task on a session (if any) and recursively cancel all
/// child sessions (SubAgent sessions whose `parent_session_id == session_id`).
///
/// Shared by:
/// - Automation cancel (`routes_scheduled_jobs`): no children, recursion is a no-op
/// - SubAgent cascading cancel: parent stop → cancel all spawned children
/// - User-initiated stop of any session that may have children
///
/// This is the unified cancel entry point mandated by the Q8 "merge into one"
/// design: Automation and SubAgent no longer maintain independent cancel paths.
pub async fn cancel_session_and_children(
    state: &Arc<AppState>,
    session_id: &str,
) -> Result<(), String> {
    // 1. Cancel the active task on this session (if any).
    cancel_active_task(state, session_id).await;

    // 2. Find all direct child sessions and cancel them recursively.
    let children = {
        let db = state
            .db
            .lock()
            .map_err(|_| "Database lock poisoned".to_string())?;
        list_sessions_by_parent(&db, session_id)?
    };

    for child in children {
        // Recurse: a child may have its own children. Q6 forbids nesting by
        // removing spawn_subagent from the child's tool whitelist, so in
        // practice this is one level deep — but the recursion stays correct
        // if the policy ever changes.
        Box::pin(cancel_session_and_children(state, &child.id)).await?;
    }

    Ok(())
}

/// Cancel the active task on a single session: ask_question + agent_cancel + shell_kill.
///
/// Mirrors the logic in `routes_tool::cancel_active_session_task` but lives in
/// the shared module so both Automation and SubAgent can reuse it.
async fn cancel_active_task(state: &Arc<AppState>, session_id: &str) {
    let Ok(status) = agent::agent_get_session_status(&state.agent_registry, session_id.to_string())
    else {
        return;
    };
    let Some(status) = status else {
        return;
    };
    let _ = state
        .ask_question_registry
        .cancel(&status.task_id, "Cancelled");
    let _ = agent::agent_cancel(&state.agent_registry, status.task_id.clone());
    let _ = shell_kill_by_task(&state.shell_registry, status.task_id);
}
