# Shared Handoff Fixtures

These fixtures define a fixed input and fixed expected output baseline for handoff parity checks across:

- `frontend/src/features/agent/handoff.fixture.test.ts`
- `backend/src/agent/handoff.rs` unit tests

## Goal

They are meant to answer a narrow but important question:

Can backend handoff generation produce the same core prompt/artifact/continuation text as the legacy frontend helpers for the same normalized input?

This is a deterministic differential-test baseline, not a full end-to-end browser/session replay.

## Fixture Schema

Each JSON file contains:

- `input`: normalized handoff inputs shared by both runtimes
- `expected`: golden outputs that both runtimes must match exactly

Current outputs covered:

- `handoffUserPrompt`
- `verificationChecklist`
- `continuationTitle`
- `fallbackHandoffBody`
- `storedHandoffArtifact`
- `continuationPrompt`

## How To Extend

1. Add a new `*.json` fixture here.
2. Keep volatile fields fixed, especially IDs and timestamps.
3. Prefer representative cases over many near-duplicates:
   - rich unattended handoff
   - minimal fallback handoff
   - verification failure
   - no working set
   - background job present/absent
4. Update both golden strings and input together so the fixture stays self-contained.

## Running Checks

- Frontend: run the Vitest handoff tests.
- Backend: run the Rust handoff unit tests.

If one side fails and the other passes, inspect the exact string diff first. Most regressions here should be treated as behavior drift, not test noise.
