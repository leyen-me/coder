use crate::shell_env;
use serde::Deserialize;

#[derive(Deserialize)]
pub struct ResolveEnvVarArgs {
    pub name: String,
}

/// Resolve an environment variable from the process environment or login shell.
pub fn resolve_env_var(args: ResolveEnvVarArgs) -> Result<Option<String>, String> {
    Ok(shell_env::get_env_var(&args.name))
}
