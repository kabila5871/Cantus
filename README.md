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

<p align="center">
  <img src="branding/screenshots/workspace.png" alt="The Cantus four-pane workspace — file tree, Monaco editor, integrated terminal, and the Claude agent chat in one window" width="900">
</p>

---

## What is Cantus?

Cantus composes mature, battle-tested components — [Monaco](https://microsoft.github.io/monaco-editor/) for editing, [xterm.js](https://xtermjs.org/) for the terminal, and [libgit2](https://libgit2.org/) for version control — into **one coherent app**, with the [Claude Code](https://docs.claude.com/en/docs/claude-code/overview) CLI running natively in an integrated terminal right beside your editor, git, and file tree.

Built on [Tauri](https://tauri.app/), it ships as a small native binary with zero external setup. Everything stays on your machine: the only thing that leaves is Claude's own model API calls.

> **One thesis:** the `claude` CLI you already use deserves a real IDE around it — editor, terminal, git, and file tree in one window — instead of alt-tabbing between your editor and a lone terminal.

## Why

Today's tooling forces a compromise:

- **Terminal agents** like Claude Code are deeply capable, but live in a bare terminal with no editor, no git UI, and no file tree beside them.
- **GUI IDEs** bolt AI on as a panel, and you give up the terminal-native agent you actually like.
- **Stitching them together** makes *you* the integration layer: editor here, Claude in a terminal there, git in a third window.

Cantus closes the gap by giving Claude Code a real workspace — editor, terminal, and git sharing one UI and one project.

## Download

Grab the latest `.dmg` from the [**Releases page**](https://github.com/manan45/Cantus/releases/latest) (macOS, Apple Silicon).

> Builds are currently **unsigned**, so Gatekeeper will warn on first launch. Either right-click the app → **Open**, or clear the quarantine flag:
> ```bash
> xattr -dr com.apple.quarantine /Applications/Cantus.app
> ```

## Features

- 🎛️ **Four-pane workspace** — file tree, Monaco editor, terminal, and Claude, in one resizable window.
- 🖥️ **Claude in a real terminal** — the `claude` CLI runs in a backend-spawned PTY, full-width and resumable.
- 📎 **Drag files into Claude** — drop any file onto the terminal to drop its path straight into the prompt.
- 🔍 **VS Code-style diff** — split/inline views with collapsed unchanged regions and per-hunk **and** per-line stage / discard.
- 🌿 **Built-in git** — status, branch switcher, stage, commit, and discard — via libgit2, no shelling out.
- 💾 **Resumable sessions** — your Claude sessions for the project, listed and resumable from the chat pane.
- 🎛️ **Capability-aware task runner** — describe a task; Claude summarizes which skills & agents apply (reuse / compose / build), assembles a `.claude` workflow, and runs it — orchestrating itself.
- 🧠 **Learned memory** — a local SQLite + FTS5 store distills the quirks each run teaches and relevance-retrieves the right ones into the next run's plan. No cloud, no vector service.
- 🔒 **Local-first & private** — your source never leaves the machine except as Claude's own model calls.
- 🎨 **Crafted UI** — deep dark palette, glassmorphism chrome, and JetBrains Mono throughout.

## Screenshots

<table>
  <tr>
    <td width="50%">
      <img src="branding/screenshots/terminal.png" alt="Claude running in a backend-spawned PTY terminal"><br>
      <sub><b>Claude in a real terminal</b> — the <code>claude</code> CLI in a full-width, resumable PTY.</sub>
    </td>
    <td width="50%">
      <img src="branding/screenshots/diff-view.png" alt="VS Code-style split diff with per-line staging"><br>
      <sub><b>VS Code-style diff</b> — split / inline views with per-hunk and per-line stage / discard.</sub>
    </td>
  </tr>
  <tr>
    <td width="50%">
      <img src="branding/screenshots/orchestrator.png" alt="The capability-aware task runner with its skills/agents panel and learned-memory layer"><br>
      <sub><b>Task runner</b> — summarize capability coverage, build a <code>.claude</code> workflow, and let Claude run it; a learned-memory layer makes the next run smarter.</sub>
    </td>
    <td width="50%"></td>
  </tr>
</table>

## Tech stack

| Layer | Choice |
|---|---|
| App framework | Tauri 2 (Rust core + web frontend) |
| Frontend | TypeScript + React + Vite |
| Editor | Monaco |
| Terminal | xterm.js + PTY |
| Version control | libgit2 via the `git2` crate |
| AI | the `claude` CLI, in the integrated terminal |
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
src-tauri/      Rust backend (typed IPC commands, git, PTY, SQLite)
branding/       Logo, icon, and banner source
.github/        CI, release, and the Claude Code GitHub Action
```

The frontend and backend talk **only** through typed Tauri IPC commands and events; the backend is authoritative for filesystem, process, and store state.

## Roadmap

- **Phase 1 — MVP** *(shipped in v1.0)* — the four-pane shell, Claude in the terminal, git with hunk/line staging, persistence.
- **Phase 2 — Depth** *(shipped in v1.1)* — tabbed terminals, a Skills / Agents / Workflows / Sessions browser, and quick-open + project search.
- **Phase 3 — Orchestration** *(landing in v1.1)* — a capability-aware task runner that builds and runs `.claude` workflows, plus a local learned-memory layer. Next: multi-project and cross-platform (Linux, then Windows).

## Contributing

Contributions are welcome — see [CONTRIBUTING.md](CONTRIBUTING.md). By participating you agree to the [Code of Conduct](CODE_OF_CONDUCT.md). Found a security issue? See [SECURITY.md](SECURITY.md).

## License

[MIT](LICENSE) © Manan Wadhwa

<p align="center"><sub>Cantus — Latin for <i>song</i>. Built to make you and Claude compose in concert.</sub></p>
