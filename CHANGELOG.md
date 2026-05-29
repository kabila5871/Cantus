# Changelog

All notable changes to Cantus are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/), and the project adheres to
[Semantic Versioning](https://semver.org/).

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

[1.0.0]: https://github.com/manan45/Cantus/releases/tag/v1.0.0
