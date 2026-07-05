pub fn derive_session_title(prompt: &str, max_len: usize) -> String {
    let normalized: String = prompt.split_whitespace().collect::<Vec<_>>().join(" ");
    if normalized.chars().count() <= max_len {
        return normalized;
    }
    normalized
        .chars()
        .take(max_len.saturating_sub(1))
        .collect::<String>()
        + "…"
}
