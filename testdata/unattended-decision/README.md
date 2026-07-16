# Shared Unattended Decision Fixtures

These fixtures freeze the legacy frontend unattended-decision behavior before frontend cleanup.

They are consumed by:

- `frontend` fixture tests as the oracle side
- `backend` fixture tests as the migrated implementation side

## Covered behavior

- unattended / long-task decision trigger policy
- final-answer decision request shape
- proxy decision system prompt
- proxy decision user prompt payload
- proxy decision response normalization
- proxy continuation fallback and explicit continuation content

## Intent

The goal is not a full end-to-end streaming replay.

The goal is to preserve the decision behavior that matters most before deleting frontend legacy implementation, so backend drift becomes immediately visible in tests.

## How To Extend

Add another `*.json` fixture when you need to lock a new edge case, for example:

- malformed fenced JSON handling
- blank / missing reason normalization
- `standard + unattended` policy cases
- future decision outcomes if the product intentionally expands beyond `continue` / `complete`
