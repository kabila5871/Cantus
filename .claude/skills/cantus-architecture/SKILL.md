---
name: cantus-architecture
description: The architecture, conventions, data model, and scope boundaries for the Cantus IDE. Consult before any non-trivial change to the backend, frontend, agent seam, IPC contract, or data store. Use to answer "where does this go", "what's in scope", "what's the convention here", or "how do the layers talk".
---

# Cantus architecture (read before non-trivial work)

Cantus is a **Claude-first, Tauri-based desktop coding environment**. One thesis: *Claude is a first-class citizen, not a bolted-on sidebar.* It composes mature components — Monaco, xterm.js, libgit2, SQLite, the Claude Agent SDK — into one coherent app where the agent is natively aware of what you're editing. Source of truth is `prd.md` at the repo root; this skill is the build-time digest. macOS Apple Silicon first.

## Layer split

```
┌─────────────────────────── Frontend (OS webview, TypeScript + React) ───────────────────────────┐
│  Four panes: file tree │ Monaco editor │ xterm.js terminal │ Claude agent chat                    │
│  Coordination layer: shared app-state store · command palette · keybindings · theme              │
│  Owns: all UI. Mirrors backend state. Captures live editor context for the agent.                │
└───────────────────────────────────────────── IPC (typed Tauri commands + events) ────────────────┘
┌─────────────────────────── Backend (Rust core, `src-tauri/`) ────────────────────────────────────┐
│  Privileged ops only: git (git2/libgit2) · PTY · SQLite · scoped FS read/watch · agent subprocess │
│  Authoritative for filesystem / process / data-store state.                                       │
└───────────────────────────────────────────────────────────────────────────────────────────────────┘
                                              │ stdio
                              ┌───────────────▼───────────────┐
                              │  Claude Agent SDK (subprocess) │  inherits agent loop, tools,
                              │  Python or TypeScript SDK      │  subagents, skills, MCP, hooks
                              └────────────────────────────────┘
```

## Component map (what wraps what)

| Capability | Component | Layer |
|---|---|---|
| Code editor | Monaco (MIT) | Frontend |
| Terminal | xterm.js + backend-spawned PTY | Frontend + Backend |
| Version control | libgit2 via the `git2` crate | Backend |
| AI agent | Claude Agent SDK (subprocess) | Backend ⇄ both |
| Local store | SQLite | Backend |
| Coordination | command palette, shared state, keybindings, theme | Frontend |

## The five rules (these override convenience)

1. **IPC is the only contract.** Frontend ⇄ backend talk exclusively through typed Tauri commands (request/response) and events (backend→frontend streams: PTY bytes, agent tokens, git updates). No hidden side channels. Keep frontend bindings in one typed module; keep Rust handlers thin (validate → privileged work → typed result/error).
2. **Backend is authoritative; frontend mirrors.** Anything touching the filesystem, a process, or the store lives in Rust and is the source of truth. The frontend reflects it via command results and events — never keeps a copy that can silently drift.
3. **Errors are typed values across IPC.** No `anyhow`/`Box<dyn Error>` leaking over the bridge. Define explicit serializable error enums; the frontend must render a useful message.
4. **Keep the Rust surface minimal (anti-scope-creep, PRD §11).** If logic can safely live in TypeScript, it does. The backend is process spawning, file I/O, git, SQLite, and the agent subprocess — not business logic.
5. **Local-first / private.** The *only* thing leaving the machine is the agent's own model API calls. No other outbound network. Agent file access is scoped to the open project dir.

## Clean-code doctrine (applies to every change)

Cantus is greenfield — write it lean and keep it lean. Every agent follows this; `clean-code` enforces it as a pass, `cantus-reviewer` flags violations. A `PostToolUse` hook (`.claude/hooks/format.sh`) auto-formats edits, so don't hand-format.

1. **Better architecture.** Right layer, smallest correct design, no needless indirection. Names carry meaning so code needs little explaining.
2. **Less code.** Fewer lines for the same behavior. Delete duplication; prefer idiomatic/std constructs over hand-rolled ones; don't extract a helper used once.
3. **Fewer comments.** Only comments that explain *why* something non-obvious is done. No restating code, no history narration, no section banners.
4. **Targeted diff.** Touch only what the task needs. No drive-by reformatting of untouched lines, no unrelated edits.
5. **No legacy fallbacks.** No backwards-compat shims, no old-path/new-path branches, no dead flags, no `if version <` guards. There is nothing to be compatible with — pick the one correct path.
6. **No unwanted code.** No dead code, unused params/imports, commented-out blocks, or speculative "might need later" abstractions. YAGNI.

## How context reaches the agent (no RAG — PRD §7)

- **Live editor context:** frontend always knows open file + selection + recent edits; ships it as *structured, minimal* context per request. Don't dump the whole project.
- **Agent-driven file access:** the SDK reads/greps/navigates with its own tools; grant scoped access and let it pull what it needs.
- **SDK-managed working context:** rely on the SDK's in-session compaction + Claude's large window. **Do not build embeddings/vector store/RAG** — deliberately deferred (§7.4). Revisit only with measured evidence of failure.
- **Cross-session memory:** SQLite persists chat + agent events; on resume, re-seed with a *summary* of prior sessions + recent history, not the full transcript.

## Data model (SQLite, source of truth, never leaves device)

- `projects(id, root_path, created_at)`
- `files(id, project_id, path, content_hash, updated_at)` — hashes for change detection, **not** the agent's read path
- `messages(id, project_id, session_id, role, content, created_at)`
- `agent_events(id, project_id, agent_id, task_id, kind, content, created_at)`
- `session_summaries(id, project_id, session_id, summary, created_at)`

## Scope boundary — Phase 1 MVP only

**In:** Tauri shell (macOS ARM, single signed binary, zero setup) · four-pane layout · open any local folder · Monaco editing + syntax highlighting + ≥1 language server (Python first) · terminal via backend PTY · basic git (status/stage/commit + inline diff) · one agent that reads/edits open files with accept/reject diffs and selection-awareness · SQLite persistence with summary re-seed · command palette + baseline keybindings.

**Out (do not build in Phase 1):** debugging/DAP, multiple agents, skills-manager UI, workflow management, multi-project, vector retrieval, Windows/Linux. These are Phase 2/3.

## Stack

Tauri · Rust (backend) · TypeScript + React (frontend) · Monaco · xterm.js + PTY · `git2` · Claude Agent SDK · SQLite · (Phase 2: DAP/debugpy).

## Who owns what (delegate to the right agent)

- `rust-tauri-backend` — `src-tauri/`: IPC handlers, git2, PTY, SQLite, FS.
- `react-frontend` — `src/`: panes, Monaco/xterm.js, shared state, palette, IPC bindings.
- `agent-sdk-bridge` — the agent seam: subprocess lifecycle, streaming, context injection, edit→diff, session memory.
- `cantus-reviewer` — review before landing.

When a change spans the IPC boundary, define the command/event signature explicitly and make sure both the backend handler and the frontend binding are accounted for.
