use rusqlite::{params, Connection, OptionalExtension};
use serde::{de::DeserializeOwned, Serialize};
use std::path::Path;
use std::sync::{Arc, Mutex};

pub struct IndexEntry {
    pub name: String,
    pub value: String,
}

pub struct Database {
    conn: Arc<Mutex<Connection>>,
}

impl Database {
    pub fn new(coder_dir: &Path) -> Result<Self, String> {
        let db_path = coder_dir.join("coder.db");
        let conn = Connection::open(&db_path).map_err(|e| e.to_string())?;
        let db = Self {
            conn: Arc::new(Mutex::new(conn)),
        };
        db.run_migrations()?;
        Ok(db)
    }

    fn run_migrations(&self) -> Result<(), String> {
        let conn = self.conn.lock().map_err(|e| e.to_string())?;
        conn.execute_batch(
            "
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
            ",
        )
        .map_err(|e| e.to_string())?;

        // Compatibility: add updated_at column if it doesn't exist (e.g. when
        // upgrading from the old Tauri version that created the table without it).
        conn.execute_batch(
            "ALTER TABLE entities ADD COLUMN updated_at INTEGER NOT NULL DEFAULT (unixepoch());",
        )
        .ok();

        Ok(())
    }

    pub fn get<T: DeserializeOwned>(&self, store: &str, key: &str) -> Result<Option<T>, String> {
        let conn = self.conn.lock().map_err(|e| e.to_string())?;
        let result: Option<String> = conn
            .query_row(
                "SELECT value FROM entities WHERE store = ?1 AND id = ?2",
                params![store, key],
                |row| row.get(0),
            )
            .optional()
            .map_err(|e| e.to_string())?;
        match result {
            Some(json) => Ok(Some(serde_json::from_str(&json).map_err(|e| e.to_string())?)),
            None => Ok(None),
        }
    }

    pub fn put<T: Serialize>(
        &self,
        store: &str,
        key: &str,
        value: &T,
        indexes: &[IndexEntry],
    ) -> Result<(), String> {
        let json = serde_json::to_string(value).map_err(|e| e.to_string())?;
        let conn = self.conn.lock().map_err(|e| e.to_string())?;
        conn.execute(
            "INSERT OR REPLACE INTO entities (store, id, value) VALUES (?1, ?2, ?3)",
            params![store, key, json],
        )
        .map_err(|e| e.to_string())?;
        conn.execute(
            "DELETE FROM idx WHERE store = ?1 AND id = ?2",
            params![store, key],
        )
        .map_err(|e| e.to_string())?;
        for idx in indexes {
            conn.execute(
                "INSERT OR REPLACE INTO idx (store, index_name, index_value, id) VALUES (?1, ?2, ?3, ?4)",
                params![store, idx.name, idx.value, key],
            )
            .map_err(|e| e.to_string())?;
        }
        Ok(())
    }

    pub fn delete(&self, store: &str, key: &str) -> Result<(), String> {
        let conn = self.conn.lock().map_err(|e| e.to_string())?;
        conn.execute(
            "DELETE FROM entities WHERE store = ?1 AND id = ?2",
            params![store, key],
        )
        .map_err(|e| e.to_string())?;
        conn.execute(
            "DELETE FROM idx WHERE store = ?1 AND id = ?2",
            params![store, key],
        )
        .map_err(|e| e.to_string())?;
        Ok(())
    }

    pub fn get_all<T: DeserializeOwned>(&self, store: &str) -> Result<Vec<T>, String> {
        let conn = self.conn.lock().map_err(|e| e.to_string())?;
        let mut stmt = conn
            .prepare("SELECT value FROM entities WHERE store = ?1 ORDER BY rowid")
            .map_err(|e| e.to_string())?;
        let rows = stmt
            .query_map(params![store], |row| row.get::<_, String>(0))
            .map_err(|e| e.to_string())?;
        let mut result = Vec::new();
        for row in rows {
            let json = row.map_err(|e| e.to_string())?;
            result.push(serde_json::from_str(&json).map_err(|e| e.to_string())?);
        }
        Ok(result)
    }

    pub fn get_all_from_index<T: DeserializeOwned>(
        &self,
        store: &str,
        index_name: &str,
        index_value: Option<&str>,
    ) -> Result<Vec<T>, String> {
        let conn = self.conn.lock().map_err(|e| e.to_string())?;
        let (sql, param_values) = match index_value {
            Some(val) => (
                "SELECT e.value FROM entities e JOIN idx i ON e.id = i.id AND e.store = i.store WHERE e.store = ?1 AND i.index_name = ?2 AND i.index_value = ?3 ORDER BY e.rowid".to_string(),
                vec![store.to_string(), index_name.to_string(), val.to_string()],
            ),
            None => (
                "SELECT e.value FROM entities e JOIN idx i ON e.id = i.id AND e.store = i.store WHERE e.store = ?1 AND i.index_name = ?2 ORDER BY e.rowid".to_string(),
                vec![store.to_string(), index_name.to_string()],
            ),
        };

        let mut stmt = conn.prepare(&sql).map_err(|e| e.to_string())?;
        let params_refs: Vec<&dyn rusqlite::types::ToSql> =
            param_values.iter().map(|s| s as &dyn rusqlite::types::ToSql).collect();
        let rows = stmt
            .query_map(params_refs.as_slice(), |row| row.get::<_, String>(0))
            .map_err(|e| e.to_string())?;

        let mut result = Vec::new();
        for row in rows {
            let json = row.map_err(|e| e.to_string())?;
            result.push(serde_json::from_str(&json).map_err(|e| e.to_string())?);
        }
        Ok(result)
    }

    pub fn count(&self, store: &str) -> Result<i64, String> {
        let conn = self.conn.lock().map_err(|e| e.to_string())?;
        conn.query_row(
            "SELECT COUNT(*) FROM entities WHERE store = ?1",
            params![store],
            |row| row.get(0),
        )
        .map_err(|e| e.to_string())
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

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;
    use std::time::{SystemTime, UNIX_EPOCH};

    fn temp_db() -> (Database, std::path::PathBuf) {
        let stamp = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .expect("clock")
            .as_nanos();
        let dir = std::env::temp_dir().join(format!("coder-db-test-{stamp}"));
        std::fs::create_dir_all(&dir).expect("create temp dir");
        (Database::new(&dir).expect("open db"), dir)
    }

    #[test]
    fn put_replaces_stale_index_values_for_same_id() {
        let (db, dir) = temp_db();

        db.put(
            "sessions",
            "session-1",
            &json!({ "id": "session-1", "updatedAt": 100 }),
            &[IndexEntry {
                name: "by-updatedAt".to_string(),
                value: "100".to_string(),
            }],
        )
        .expect("initial put");

        db.put(
            "sessions",
            "session-1",
            &json!({ "id": "session-1", "updatedAt": 200 }),
            &[IndexEntry {
                name: "by-updatedAt".to_string(),
                value: "200".to_string(),
            }],
        )
        .expect("updated put");

        let all = db
            .get_all_from_index::<serde_json::Value>("sessions", "by-updatedAt", None)
            .expect("query index");
        assert_eq!(all.len(), 1);
        assert_eq!(all[0]["updatedAt"], 200);

        let old = db
            .get_all_from_index::<serde_json::Value>("sessions", "by-updatedAt", Some("100"))
            .expect("query stale index value");
        assert!(old.is_empty());

        let _ = std::fs::remove_dir_all(dir);
    }

    #[test]
    fn get_all_from_index_scopes_rows_to_store() {
        let (db, dir) = temp_db();

        db.put(
            "sessions",
            "shared-id",
            &json!({ "id": "shared-id", "kind": "chat" }),
            &[IndexEntry {
                name: "by-updatedAt".to_string(),
                value: "100".to_string(),
            }],
        )
        .expect("put session");

        db.put(
            "messages",
            "shared-id",
            &json!({ "id": "shared-id", "content": "hello" }),
            &[IndexEntry {
                name: "by-sessionId".to_string(),
                value: "session-1".to_string(),
            }],
        )
        .expect("put message");

        let sessions = db
            .get_all_from_index::<serde_json::Value>("sessions", "by-updatedAt", None)
            .expect("query sessions");
        assert_eq!(sessions.len(), 1);
        assert_eq!(sessions[0]["kind"], "chat");

        let messages = db
            .get_all_from_index::<serde_json::Value>("messages", "by-sessionId", Some("session-1"))
            .expect("query messages");
        assert_eq!(messages.len(), 1);
        assert_eq!(messages[0]["content"], "hello");

        let _ = std::fs::remove_dir_all(dir);
    }
}
