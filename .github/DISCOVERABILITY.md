# Cantus — Discoverability

How Cantus is made findable on GitHub and the web, and the manual steps a human still
needs to take. This file is the single source of truth for the repo's *metadata* surface
(the About box, social preview, and organic-discovery outreach). It does **not** govern the
README, the `site/` landing page, or the docs — those have their own owners.

Everything below is verified against `README.md`, `site/index.html`, `CHANGELOG.md`, and
`package.json`. No features, metrics, versions, ratings, or screenshots are claimed here
that those sources don't already truthfully state.

---

## 1. The About trifecta (applied)

Applied via the `gh` CLI in one command:

```bash
gh repo edit manan45/Cantus \
  --description "A Claude-first desktop IDE for macOS: the Claude Code CLI in a real terminal beside a Monaco editor and built-in git — local-first." \
  --homepage "https://manan45.github.io/Cantus/" \
  --add-topic ... --remove-topic xterm-js
```

Verify at any time with:

```bash
gh repo view manan45/Cantus --json description,repositoryTopics,homepageUrl
```

### Description

> A Claude-first desktop IDE for macOS: the Claude Code CLI in a real terminal beside a Monaco editor and built-in git — local-first.

Benefit-first and keyword-aware: leads with *what it is* ("Claude-first desktop IDE for
macOS"), then the concrete payload people search for ("Claude Code CLI", "terminal",
"Monaco editor", "git"), and closes on the differentiator ("local-first"). Mirrors the
README H1/value-prop and the site `<title>`/`og:title` so search and social stay consistent.

### Website (homepageUrl)

`https://manan45.github.io/Cantus/` — the GitHub Pages landing page deployed from `/site`.
**This was previously empty; setting it is the headline win of this pass** — the About box's
website link is now a live click target instead of a wasted one.

### Topics (20 — the cap)

Each topic is both a GitHub search facet and a browsable `github.com/topics/<t>` page.
Mix of broad-discovery, integration, stack, and platform terms; no vanity tags.

| Topic | Rationale |
|---|---|
| `ai` | Broadest discovery facet for the category; high browse volume. |
| `ai-agents` | Cantus is built around an agentic CLI (Claude Code) doing real work. |
| `anthropic` | The model vendor; people browse by maker. |
| `claude` | The specific assistant integrated; primary brand search term. |
| `claude-code` | The exact product wrapped — the `claude` CLI running in the terminal. Highest-intent term for this niche. |
| `code-editor` | Cantus is a code editor (Monaco); core category. |
| `ide` | Positioned as "a real IDE around the `claude` CLI" — the README's one thesis. |
| `developer-tools` | Broad, high-traffic umbrella for the tool's audience. |
| `agentic` | Captures the agentic-workflow / task-runner angle searchers use. |
| `ai-coding` | Fast-growing search term for AI-assisted coding tools. |
| `llm` | Generic but high-volume discovery facet for the space. |
| `tauri` | The app framework; `github.com/topics/tauri` is an active browse page and the README badges Tauri 2. |
| `rust` | The backend language; large, active topic community. |
| `react` | The frontend framework; large topic community. |
| `typescript` | The frontend language; large topic community. |
| `monaco-editor` | The editor component; specific, high-intent for people wanting a Monaco-based app. |
| `macos` | The supported platform; platform browsers filter here. |
| `apple-silicon` | The exact target (Apple Silicon only today); precise audience match. |
| `desktop-app` | Distinguishes from web IDEs; native-desktop browsers filter here. |
| `git` | Built-in libgit2 git (status, branch, per-hunk **and** per-line stage/commit/discard) is a first-class feature; strong browsable topic page. |

**Change this pass:** removed `xterm-js` (very low browse volume; the terminal story is
already carried by `claude-code` + `developer-tools`) and added `git`, which is both a real
core feature and a far stronger discovery facet. Net topic count stays at the 20 cap.

Topics deliberately **not** added: language/tooling tags for subsystems that don't drive
search (e.g. `sqlite`, `libgit2`, `vite`, `pty`) — relevance compounds, noise dilutes.

---

## 2. Social preview image — MANUAL (gh cannot set this)

A repo with no social preview unfurls as a gray Octocat when its link is shared (X, Slack,
Discord, iMessage), which kills click-through. GitHub exposes **no API** for this, so the
`gh` CLI cannot set it — it must be uploaded by hand.

**Steps:**

1. Go to **Settings → General → Social preview** for `manan45/Cantus`.
2. Upload a **1280×640 PNG**.
3. Save.

**Asset to use:** the project banner already exists at
`/Users/manan/Cantus/branding/cantus-banner.png` — but it is currently **1200×320**
(verified with `sips`), which is the *wrong aspect ratio* for the 1280×640 social-preview
slot and will letterbox/crop poorly. Before uploading, produce a correctly-sized export:

- **Source of truth:** `/Users/manan/Cantus/branding/cantus-banner.svg` (the editable
  vector — wordmark "Cantus", tagline "A Claude-first coding environment", and the
  concentric-rings coral mark on a rounded tile).
- **Recommended export:** render that SVG to a **1280×640** PNG, centered with padding, so
  the mark + wordmark sit in the safe area. Keep the project's visual language — coral
  accent (`#D97757` / the banner's `#B8512B`–`#E89070` ramp) and the rounded icon tile — and
  do **not** redraw or rebrand. A dark-background variant (to match the app's deep-dark UI
  and the site's dark + coral / JetBrains-Mono identity) reads better as a shared card than
  the current cream `#FAF6EF` field; if you make one, change only the background and text
  colors, never the mark.

  Example one-liner once a 1280×640 PNG exists at that path:
  ```bash
  # produces branding/cantus-social.png at 1280x640 from the SVG (requires rsvg-convert or similar)
  rsvg-convert -w 1280 -h 640 branding/cantus-banner.svg -o branding/cantus-social.png
  ```
  Then upload `branding/cantus-social.png` in the Settings step above.

> Note: the README banner (`branding/cantus-banner.png`, 1200×320) and the site OG image
> (`site/assets/cantus-banner.png`, also 1200×320, referenced by `og:image` in
> `site/index.html`) are intentionally the wide-strip format and are correct for *those*
> surfaces. The 1280×640 export is only for the GitHub social-preview slot.

---

## 3. README / site / docs — status (not owned by this pass)

This pass owns **only** repo metadata and this file. The following are observations handed
off to the README/site/docs owners; **no edits were made to them here.**

- **README first screen — good.** H1 banner, one-line value prop, a one-row badge cluster
  (CI, MIT license, macOS/Apple-Silicon platform, Tauri 2, Claude-first), and a What/Why/
  Download/Features flow in the first third. Mirrors the new description and topics.
- **README screenshots — RESOLVED.** `README.md` now embeds five real captures from
  `branding/screenshots/` — `workspace.png`, `task-runner.png`, `sessions.png`,
  `agents.png`, and `welcome.png` — each with a caption, so the Screenshots section renders
  the product instead of broken refs. This was the single highest-leverage README fix for
  conversion.
- **Site OG/social — present.** `site/index.html` sets `og:title`, `og:description`,
  `og:image` (→ `assets/cantus-banner.png`), and `og:type`. Handed to the seo-optimize/site
  owner: consider adding `twitter:card`/`twitter:image` and a `1280×640` `og:image` for a
  larger unfurl — out of scope for this metadata pass.
- **Community profile — strong.** `LICENSE` (MIT), `CONTRIBUTING.md`, `CODE_OF_CONDUCT.md`,
  `SECURITY.md`, issue templates (`bug_report.yml`, `feature_request.yml`, `config.yml`),
  a PR template, `FUNDING.yml`, and Dependabot are all present. Issues and **Discussions**
  are enabled. Tagged releases exist (`v1.0.0`, `v1.0.1`, `v1.1.0`) with notes mirrored in
  `CHANGELOG.md`. No action needed.

---

## 4. Organic discovery channels — DRAFTED, do not send

Ready-to-send copy for a human with a real account to submit. **Nothing here has been or
should be auto-posted.** Each is a PR or post the maintainer opens themselves. All copy is
verified against the README/site/CHANGELOG — no invented features, metrics, or versions.

### 4a. Awesome-list PRs (open as a normal PR on each list's repo)

Confirm the list's contribution format and category before opening; adapt the line to match
its existing entries.

- **awesome-claude / awesome-claude-code** (lists of Claude / Claude Code tooling)
  > `[Cantus](https://github.com/manan45/Cantus)` — A Claude-first desktop IDE for macOS that runs the Claude Code CLI in a real integrated terminal beside a Monaco editor and built-in libgit2 git. Local-first; source never leaves the machine except as Claude's own model API calls.

- **awesome-tauri** (curated Tauri apps — category: *Applications / Development*)
  > `[Cantus](https://github.com/manan45/Cantus)` — A native macOS (Apple Silicon) coding environment built on Tauri 2: Monaco editor, an xterm.js terminal running the Claude Code CLI, and per-hunk/per-line git via libgit2, in one window.

- **awesome-ai-coding / awesome-ai-tools** (AI-assisted coding tools)
  > `[Cantus](https://github.com/manan45/Cantus)` — Desktop IDE that gives the Claude Code CLI a real workspace — editor, terminal, and git in one local-first app for macOS.

### 4b. Launch / community posts (draft titles + blurbs)

- **Show HN**
  - Title: `Show HN: Cantus – a Claude-first desktop IDE for macOS (Tauri + Rust + React)`
  - Blurb:
    > Cantus puts the Claude Code CLI in a real integrated terminal right beside a Monaco
    > editor, a file tree, and built-in git (libgit2, with per-hunk and per-line staging) —
    > one native macOS app instead of alt-tabbing between your editor and a lone terminal.
    > Local-first: the only thing that leaves your machine is Claude's own model API calls.
    > Built with Tauri 2 (Rust core + React/TypeScript). macOS on Apple Silicon for now;
    > MIT-licensed; builds are currently unsigned. Repo + .dmg in the releases.

- **r/ClaudeAI / r/macapps / r/rust** (adapt tone per sub; lead with the build for r/rust)
  - Title: `Cantus: a desktop IDE built around the Claude Code CLI (open source, macOS)`
  - Blurb:
    > I wanted the `claude` CLI to have a real IDE around it — editor, terminal, git, file
    > tree in one window — so I built Cantus. Tauri 2 + Rust backend, React/TypeScript
    > frontend, Monaco + xterm.js + libgit2. Local-first and MIT-licensed. Feedback welcome.

- **Cross-links:** link the repo from the GitHub Pages site (`/site`) and the maintainer's
  profile README; **pin** the repo on the `manan45` profile. (Pinning and profile edits are
  manual, owner-only steps.)

> Honest-positioning guardrails for whoever sends these: macOS / Apple Silicon **only**
> today (Linux and Windows are roadmap per CHANGELOG). Release builds are **unsigned** until
> Apple signing secrets are configured — say so. Do not cite stars, downloads, or ratings.

---

## 5. Measure & iterate

After outreach, watch **Insights → Traffic** (views, unique visitors, referrers, popular
content) and the stars-over-time trend to learn which channels convert, then iterate the
description/topics toward the terms that actually drive traffic.
