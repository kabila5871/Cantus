# Contributing to Cantus

Thanks for your interest in Cantus! This is a young, focused project, so the bar for changes is "does it move the thesis forward and keep the codebase lean" — give Claude Code a real IDE around it, without bloat.

## Ground rules

Cantus follows a deliberate **clean-code doctrine** (see `.claude/skills/cantus-architecture/SKILL.md`):

- **Better architecture, less code.** Prefer the smallest correct design.
- **Fewer comments.** Only explain *why* something non-obvious is done.
- **Targeted diffs.** Touch only what the change needs.
- **No legacy fallbacks** and **no dead/speculative code** — this is a greenfield app.

Two architectural rules override convenience:

1. **IPC is the only contract.** Frontend ↔ backend talk exclusively through typed Tauri commands and events.
2. **The backend is authoritative** for filesystem, process, and data-store state; the frontend mirrors it.

## Development setup

```bash
npm install
npm run tauri dev      # run the app
npm run check          # tsc --noEmit + cargo clippy (warnings as errors)
```

A `PostToolUse` format hook keeps edits formatted; please also run `cargo fmt` before committing. CI additionally runs `cargo test --manifest-path src-tauri/Cargo.toml` — run it locally to match.

## Workflow

1. Fork and create a feature branch (`feat/...`, `fix/...`).
2. Keep changes focused; one logical change per PR.
3. Ensure `npm run check` and `npm run build` pass.
4. Open a PR using the template. Describe the change and how you verified it.
5. CI must be green before merge.

## Scope

The four-pane shell, Claude in the terminal, libgit2 git with hunk/line staging, resumable sessions, the capability-aware task runner, and the local SQLite + FTS5 learned memory have all shipped (see [CHANGELOG.md](CHANGELOG.md)). Next on the roadmap is multi-project and cross-platform support (Linux, then Windows) — see the README roadmap.

Please open an issue to discuss anything large or out of scope before building it. In particular, the learned-memory store is deliberately local FTS5, not a cloud or vector service; keep it that way unless there's an issue agreeing otherwise.

## Reporting bugs / requesting features

Use the issue templates. Include your macOS version, repro steps, and expected vs. actual behavior.
