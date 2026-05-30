# Changelog

All notable changes to Cantus are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/), and the project adheres to
[Semantic Versioning](https://semver.org/).

## [1.2.0] — 2026-05-30

### Added

- **IDE monitor** — a status-bar widget showing system + Cantus CPU/memory, the live count and footprint of running `claude` processes, and token usage (today + total) parsed from the project's transcripts.
- **Delete** for skills, agents, workflows, and sessions, from their browsers.
- **Resume a task's run** — each task remembers the `claude` session of its last run; reopen a closed task and reattach to it via `claude --resume`, with best-effort recovery of pre-existing tasks by matching the goal to a transcript.

### Changed

- **Task runner is now a single page** — describe a task, get an automatic gap-check summary (reuse / build) over a live skills+agents registry, then build a `.claude` workflow and let Claude run it. The terminal fills the stage on run (runner panel one click away); compact icon controls; the capability panel is a collapsible right rail that highlights the skills/agents in use.
- Learned-memory facts are now **distilled from the run's transcript** (one durable, reconciled lesson) rather than a structural row.

### Fixed

- **`claude` resolution in the bundled app** — headless calls and PTY-spawned `claude` now resolve via the login-shell PATH, so the task runner and chat work in an installed `.app` (a GUI launch's minimal PATH previously hid nvm/npm installs).

## [1.1.0] — 2026-05-30

### Added

- **Capability-aware task runner** — a single-page Task runner: describe a task, get an overall summary of which skills & agents apply (reuse / compose / build) against a live registry, then assemble a `.claude` workflow and let Claude run it — orchestrating itself.
- **Capability memory** — per-skill/agent usage and success counts in SQLite, layered on the filesystem registry and shown as chips on the task runner.
- **Learned memory** — a local SQLite + FTS5 store of distilled, codebase-specific lessons. The gap-check relevance-retrieves the right ones into each run's plan, and a distill step extracts and reconciles one durable quirk from each completed run's transcript. A new **Memory** tab inspects and curates it.
- **Multiple project windows** — open a project in a new window, with per-window project state.
- **Quick-open (⌘P) and project-wide search** from the command bar.
- **Drag files into the terminal** — drop any file onto the Claude (or shell) terminal to insert its path into the prompt, the way a native terminal does.

### Changed

- **Claude is now terminal-only.** Removed the in-app Claude agent (the SDK-driven chat and inline accept/reject edit proposals) in favor of running the `claude` CLI directly in the integrated terminal. This also drops the bundled ~120 MB Node sidecar, so the app is a small native binary again.

### Removed

- The in-app **agent** subsystem: `agent_*` IPC commands, the agent chat pane, propose-edit diffs, and the Node sidecar / `agent-host` / `bundle-node.sh` machinery.
- The **LSP** subsystem (language-server integration) and its `monaco-languageclient` / `vscode-*` dependencies.

### Fixed

- Terminal renders full-width from the first frame; distinct green/red diff colors; per-hunk Stage/Discard toolbar pinned to the editor's right edge; overscroll no longer reveals a white gap below the app.

## [1.0.1] — 2026-05-29

### Fixed

- **Task runner planning in the bundled app** — the planner shelled out to a system `claude` via `Command::new`, which failed in a GUI-launched `.app` (the bundle inherits a minimal PATH that excludes nvm/npm installs). It now points at the bundled `claude` binary, with no PATH dependency.
- Dropped the `--json-schema` flag and switched to a strict raw-JSON prompt plus bracket-slicing parse, so the planner tolerates stray prose or code fences instead of rejecting them.
- Surfaced the real error message in the task runner UI instead of a generic "Planning failed".

## [1.0.0] — 2026-05-29

First public release. The four-pane, Claude-first coding environment is feature-complete for daily use on macOS (Apple Silicon).

### Added

- **Four-pane workspace** — file tree, Monaco editor, integrated terminal, and a Claude agent pane in one resizable window.
- **Context-aware agent** — Claude sees the open file, the current selection, and recent edits without copy-paste; proposes edits as inline accept/reject diffs in Monaco.
- **Claude in the terminal** — the agent runs in a real backend-spawned PTY (`xterm.js`), full-width and resumable per session.
- **VS Code-style diff viewer** — split and inline modes with collapsed unchanged regions, plus per-hunk and per-line **stage / unstage / discard** controls backed by libgit2 patches.
- **Built-in git** — status, branch switcher, create-branch, stage, commit, and discard — all via `libgit2`, no shelling out.
- **Resumable sessions** — chat and agent history persist locally in SQLite and re-seed with a summary on resume.
- **Local-first & private** — source never leaves the machine except as the agent's own model API calls.
- **Theme** — a deep dark palette with glassmorphism chrome, JetBrains Mono throughout, and distinct green/red diff colors.

### Notes

- macOS (Apple Silicon) only for this release; Linux and Windows are on the roadmap.
- Release binaries are **unsigned** until Apple signing secrets are configured — see the download notes in the README for how to open an unsigned build.

[1.1.0]: https://github.com/manan45/Cantus/releases/tag/v1.1.0
[1.0.1]: https://github.com/manan45/Cantus/releases/tag/v1.0.1
[1.0.0]: https://github.com/manan45/Cantus/releases/tag/v1.0.0
