use std::collections::VecDeque;

const MAX_BUFFERED_EVENTS: usize = 500;

#[derive(Debug, Default)]
pub struct EventLog {
    events: VecDeque<(u64, String)>,
    next_seq: u64,
}

impl EventLog {
    pub fn new() -> Self {
        Self::default()
    }

    pub fn push(&mut self, event_json: &str) -> u64 {
        let seq = self.next_seq.saturating_add(1);
        self.next_seq = seq;
        let payload = inject_seq(event_json, seq);
        self.events.push_back((seq, payload));
        while self.events.len() > MAX_BUFFERED_EVENTS {
            self.events.pop_front();
        }
        seq
    }

    pub fn replay_from(&self, from_seq: u64) -> Vec<String> {
        self.events
            .iter()
            .filter(|(seq, _)| *seq > from_seq)
            .map(|(_, json)| json.clone())
            .collect()
    }

    pub fn latest_seq(&self) -> u64 {
        self.next_seq
    }
}

fn inject_seq(event_json: &str, seq: u64) -> String {
    match serde_json::from_str::<serde_json::Value>(event_json) {
        Ok(serde_json::Value::Object(mut object)) => {
            object.insert("seq".to_string(), serde_json::Value::from(seq));
            serde_json::Value::Object(object).to_string()
        }
        _ => event_json.to_string(),
    }
}

#[cfg(test)]
mod tests {
    use super::EventLog;

    #[test]
    fn replays_only_newer_events() {
        let mut log = EventLog::new();
        let seq1 = log.push(r#"{"type":"status","taskId":"t1"}"#);
        let seq2 = log.push(r#"{"type":"done","taskId":"t1"}"#);
        assert_eq!(seq1, 1);
        assert_eq!(seq2, 2);

        let replay = log.replay_from(1);
        assert_eq!(replay.len(), 1);
        assert!(replay[0].contains(r#""seq":2"#));
    }
}
