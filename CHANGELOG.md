# Changelog

All notable changes to Cantus are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/), and the project adheres to
[Semantic Versioning](https://semver.org/).

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
[1.0.0]: https://github.com/manan45/Cantus/releases/tag/v1.0.0
