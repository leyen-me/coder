use std::collections::HashMap;
use std::sync::Mutex;
use std::time::Instant;

/// Maximum number of pages held in cache at once.
const MAX_CACHED_PAGES: usize = 20;

/// How long a cached page is considered fresh (5 minutes).
const CACHE_TTL_SECS: u64 = 300;

/// A fully converted page stored as lines so re-slicing is free.
pub struct CachedPage {
    /// One line per entry (the HTML→Markdown converted output).
    pub lines: Vec<String>,
    /// Page <title> if found.
    pub title: Option<String>,
    /// Final URL after possible redirects.
    pub final_url: String,
    /// When this entry was inserted.
    pub cached_at: Instant,
}

pub struct PageCache {
    inner: Mutex<Inner>,
}

struct Inner {
    map: HashMap<String, CachedPage>,
    /// Insertion/access ordering for simple LRU eviction.
    order: Vec<String>,
}

impl PageCache {
    pub fn new() -> Self {
        Self {
            inner: Mutex::new(Inner {
                map: HashMap::new(),
                order: Vec::new(),
            }),
        }
    }

    /// Look up a cached page by its URL key.
    /// Returns `None` if the entry is missing or expired.
    pub fn get(&self, key: &str) -> Option<CachedPage> {
        let mut inner = self.inner.lock().ok()?;
        let entry = inner.map.get(key)?;

        if entry.cached_at.elapsed().as_secs() > CACHE_TTL_SECS {
            // Expired – remove it.
            inner.map.remove(key);
            inner.order.retain(|k| k != key);
            return None;
        }

        // Bump to front (most-recently used).
        if let Some(pos) = inner.order.iter().position(|k| k == key) {
            inner.order.remove(pos);
        }
        inner.order.push(key.to_string());

        inner.map.get(key).map(|e| CachedPage {
            lines: e.lines.clone(),
            title: e.title.clone(),
            final_url: e.final_url.clone(),
            cached_at: e.cached_at,
        })
    }

    /// Insert a page into the cache, evicting the least-recently used entry
    /// if the cache is full.
    pub fn insert(&self, key: String, page: CachedPage) {
        let mut inner = match self.inner.lock() {
            Ok(guard) => guard,
            Err(_) => return,
        };

        // If the key already exists, remove it first so the insert replaces it.
        if inner.map.contains_key(&key) {
            inner.order.retain(|k| *k != key);
        }

        // Evict least-recently used when at capacity.
        while inner.map.len() >= MAX_CACHED_PAGES {
            if let Some(lru_key) = inner.order.first().cloned() {
                inner.map.remove(&lru_key);
                inner.order.remove(0);
            } else {
                break;
            }
        }

        inner.order.push(key.clone());
        inner.map.insert(key, page);
    }

    /// Clear all cached entries.
    #[cfg(test)]
    pub fn clear(&self) {
        if let Ok(mut inner) = self.inner.lock() {
            inner.map.clear();
            inner.order.clear();
        }
    }

    /// Return the number of cached entries (useful for testing).
    #[cfg(test)]
    pub fn len(&self) -> usize {
        self.inner.lock().ok().map_or(0, |inner| inner.map.len())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn sample_page() -> CachedPage {
        CachedPage {
            lines: vec!["line 1".into(), "line 2".into(), "line 3".into()],
            title: Some("Test".into()),
            final_url: "https://example.com".into(),
            cached_at: Instant::now(),
        }
    }

    #[test]
    fn stores_and_retrieves() {
        let cache = PageCache::new();
        cache.insert("https://example.com".into(), sample_page());
        let got = cache.get("https://example.com");
        assert!(got.is_some());
        assert_eq!(got.unwrap().lines.len(), 3);
    }

    #[test]
    fn returns_none_for_missing_key() {
        let cache = PageCache::new();
        assert!(cache.get("https://missing.com").is_none());
    }

    #[test]
    fn evicts_least_recently_used() {
        let cache = PageCache::new();
        // Fill to capacity.
        for i in 0..MAX_CACHED_PAGES {
            let key = format!("https://page-{i}.com");
            cache.insert(key, sample_page());
        }
        assert_eq!(cache.len(), MAX_CACHED_PAGES);

        // Access the first page to make it recently used.
        let first_key = "https://page-0.com";
        assert!(cache.get(first_key).is_some());

        // Insert one more – should evict the LRU (page-1, since page-0 was just touched).
        cache.insert("https://new.com".into(), sample_page());
        assert_eq!(cache.len(), MAX_CACHED_PAGES);

        // page-0 should still be present (was recently accessed).
        assert!(cache.get(first_key).is_some());
    }

    #[test]
    fn expires_after_ttl() {
        let cache = PageCache::new();
        cache.insert(
            "https://example.com".into(),
            CachedPage {
                lines: vec!["stale".into()],
                title: None,
                final_url: "https://example.com".into(),
                // Force expiry by backdating.
                cached_at: Instant::now() - std::time::Duration::from_secs(CACHE_TTL_SECS + 1),
            },
        );
        assert!(cache.get("https://example.com").is_none());
        assert_eq!(cache.len(), 0); // Evicted.
    }
}
