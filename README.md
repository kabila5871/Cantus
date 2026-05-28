<p align="center">
  <img src="branding/cantus-banner.png" alt="Cantus — a Claude-first coding environment" width="720">
</p>

<p align="center">
  <a href="https://github.com/manan45/Cantus/actions/workflows/ci.yml"><img src="https://github.com/manan45/Cantus/actions/workflows/ci.yml/badge.svg" alt="CI"></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-MIT-blue.svg" alt="License: MIT"></a>
  <img src="https://img.shields.io/badge/platform-macOS%20(Apple%20Silicon)-black?logo=apple" alt="Platform: macOS">
  <img src="https://img.shields.io/badge/built%20with-Tauri%202-24C8DB?logo=tauri&logoColor=white" alt="Built with Tauri">
  <img src="https://img.shields.io/badge/Claude-first-D97757" alt="Claude-first">
</p>

<p align="center">
  <b>A lightweight desktop coding environment where Claude is a first-class citizen — not a bolted-on sidebar.</b>
</p>

---

## What is Cantus?

Cantus composes mature, battle-tested components — [Monaco](https://microsoft.github.io/monaco-editor/) for editing, [xterm.js](https://xtermjs.org/) for the terminal, [libgit2](https://libgit2.org/) for version control, and the [Claude Agent SDK](https://docs.claude.com/en/api/agent-sdk/overview) for AI — into **one coherent app** where the agent is natively aware of what you're editing.

Built on [Tauri](https://tauri.app/), it ships as a single ~10 MB signed binary with zero external setup. Everything stays on your machine: the only thing that leaves is the agent's own model API calls.

> **One thesis:** editing, an integrated terminal, git, and a context-aware Claude agent sharing one UI and one state beats running Cursor and Claude Code side by side.

## Why

Today's tooling forces a compromise:

- **GUI IDEs** treat AI as a panel grafted onto an editor — the agent can't natively see what's open, selected, or recently edited.
- **Terminal agents** are deeply capable but live in a separate process with no shared UI, no debugger, and a painful setup burden.
- **Stitching them together** makes *you* the integration layer: editor here, agent there, git in a third window.

Cantus closes the gap by making the agent context-aware by default and sharing state across every pane.

## Features (MVP)

- 🎛️ **Four-pane layout** — file tree, Monaco editor, terminal, and Claude chat, in one resizable window.
- 🧠 **Context-aware agent** — Claude sees the open file, your selection, and recent edits without copy-paste.
- ✍️ **Edits as accept/reject diffs** — the agent proposes changes inline in Monaco; you accept or reject.
- 🖥️ **Real terminal** — a true shell via a backend-spawned PTY.
- 🌿 **Built-in git** — status, stage, commit, and an inline diff view (via libgit2, no shelling out).
- 💾 **Resumable sessions** — chat and agent history persist locally in SQLite; resume with a summary re-seed.
- 🔒 **Local-first & private** — your source never leaves the machine except as the agent's model calls.
- ⌨️ **Keyboard-driven** — command palette and a baseline keybinding set.

## Tech stack

| Layer | Choice |
|---|---|
| App framework | Tauri 2 (Rust core + web frontend) |
| Frontend | TypeScript + React + Vite |
| Editor | Monaco |
| Terminal | xterm.js + PTY |
| Version control | libgit2 via the `git2` crate |
| AI | Claude Agent SDK (TypeScript) |
| Local store | SQLite |

## Getting started

### Prerequisites

- macOS on Apple Silicon
- [Rust](https://rustup.rs/) (stable, 1.85+) and [Node.js](https://nodejs.org/) 20+
- Xcode Command Line Tools: `xcode-select --install`

### Run in development

```bash
git clone https://github.com/manan45/Cantus.git
cd Cantus
npm install
npm run tauri dev
```

### Build a release binary

```bash
npm run tauri build
```

### Quality checks

```bash
npm run check   # tsc --noEmit + cargo clippy (warnings as errors)
```

## Project structure

```
src/            React + TypeScript frontend (the four panes, shared state, IPC bindings)
src-tauri/      Rust backend (typed IPC commands, git, PTY, SQLite, agent subprocess)
branding/       Logo, icon, and banner source
.github/        CI, release, and the Claude Code GitHub Action
```

The frontend and backend talk **only** through typed Tauri IPC commands and events; the backend is authoritative for filesystem, process, and store state.

## Roadmap

- **Phase 1 — MVP** *(in progress)* — the four-pane shell, context-aware agent, git basics, persistence.
- **Phase 2 — Depth** — Debug Adapter Protocol (debugging), a skills manager, and subagents.
- **Phase 3 — Orchestration** — an agent-teams dashboard, saved workflows, multi-project, and cross-platform (Linux, then Windows).

## Contributing

Contributions are welcome — see [CONTRIBUTING.md](CONTRIBUTING.md). By participating you agree to the [Code of Conduct](CODE_OF_CONDUCT.md). Found a security issue? See [SECURITY.md](SECURITY.md).

## License

[MIT](LICENSE) © Manan Wadhwa

<p align="center"><sub>Cantus — Latin for <i>song</i>. Built to make you and Claude compose in concert.</sub></p>
