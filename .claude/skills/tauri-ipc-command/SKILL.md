---
name: tauri-ipc-command
description: Step-by-step recipe for adding or changing a Tauri IPC command in Cantus end-to-end — Rust handler, typed error, registration, and the matching typed TypeScript binding. Use whenever the frontend needs a new privileged operation from the backend, or an existing command's signature changes.
---

# Adding a Tauri IPC command end-to-end

IPC is the *only* contract between Cantus's frontend and backend (see `cantus-architecture`). A command is not "done" until **both** sides agree and errors are typed. Follow every step.

## 1. Define the typed error (backend)

Don't leak `anyhow`/`Box<dyn Error>` across IPC. Use a serializable enum the frontend can match on.

```rust
#[derive(Debug, thiserror::Error, serde::Serialize)]
#[serde(tag = "kind", content = "message")]
pub enum CommandError {
    #[error("git error: {0}")]
    Git(String),
    #[error("io error: {0}")]
    Io(String),
    #[error("not found: {0}")]
    NotFound(String),
}
// Map source errors into it explicitly — e.g. impl From<git2::Error> for CommandError.
```

## 2. Write the handler (backend, thin)

Validate → do privileged work → return a serializable result or typed error. Async; never block the IPC thread. Take `tauri::State` for shared handles (DB pool, PTY registry, agent process).

```rust
#[tauri::command]
pub async fn git_stage(
    state: tauri::State<'_, AppState>,
    project_id: i64,
    paths: Vec<String>,
) -> Result<GitStatus, CommandError> {
    // validate, then git2 work, then return the *new authoritative state*
}
```

Return the new state (here `GitStatus`) so the frontend mirror updates from the source of truth rather than guessing.

## 3. Register it (backend)

Add to the `invoke_handler` in `src-tauri/src/lib.rs` (or `main.rs`):

```rust
.invoke_handler(tauri::generate_handler![
    /* ...existing... */
    git_stage,
])
```

## 4. Add the typed frontend binding (frontend)

Bindings live in **one** typed module (e.g. `src/ipc.ts`) — never scatter raw `invoke` calls through components. Mirror the Rust types in TypeScript and watch serde field-name casing.

```ts
import { invoke } from "@tauri-apps/api/core";

export interface GitStatus { /* mirrors the Rust struct */ }

export function gitStage(projectId: number, paths: string[]): Promise<GitStatus> {
  return invoke("git_stage", { projectId, paths }); // arg names must match the Rust params
}
```

Wrap calls in try/catch at the call site and surface the typed `CommandError` to the user.

## 5. For streaming results, use an event, not a return value

PTY bytes, agent tokens, and progressive git output stream **backend → frontend** via Tauri events. The command kicks off the work and returns; the frontend subscribes:

```ts
import { listen } from "@tauri-apps/api/event";
const un = await listen<PtyChunk>("pty://output", (e) => term.write(e.payload.bytes));
// remember to call un() on cleanup
```

## 6. Checklist before calling it done

- [ ] Error enum is serializable and the frontend handles each variant it cares about.
- [ ] Arg names/casing match between `invoke(...)` and the Rust params.
- [ ] Command registered in `generate_handler!`.
- [ ] Binding added to the single typed IPC module; no stray `invoke`.
- [ ] Returns the new authoritative state (or emits an event) so the frontend mirror can't drift.
- [ ] `cargo clippy` and `tsc --noEmit` clean.
