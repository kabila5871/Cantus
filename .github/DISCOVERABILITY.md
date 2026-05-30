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
  --description "Cantus is a Claude-first, local-first desktop coding environment for macOS (Apple Silicon). A native Tauri 2 app pairs a Monaco editor, an integrated terminal running the Claude Code CLI in a backend PTY, per-hunk and per-line git staging, resumable Claude sessions, a .claude workflow task runner, and a local SQLite-backed learned-memory store." \
  --homepage "https://manan45.github.io/Cantus/" \
  --add-topic ai --add-topic ai-agents --add-topic anthropic --add-topic claude --add-topic claude-code \
  --add-topic code-editor --add-topic ide --add-topic developer-tools --add-topic agentic --add-topic ai-coding \
  --add-topic llm --add-topic tauri --add-topic rust --add-topic react --add-topic typescript \
  --add-topic monaco-editor --add-topic macos --add-topic apple-silicon --add-topic desktop-app --add-topic git
```

The command is idempotent — `--add-topic` for a topic already present is a no-op, so re-running
it simply re-asserts the full intended set. `xterm-js` was pruned in an earlier pass and is not
re-added.

Verify at any time with:

```bash
gh repo view manan45/Cantus --json description,repositoryTopics,homepageUrl
```

### Description

> Cantus is a Claude-first, local-first desktop coding environment for macOS (Apple Silicon). A native Tauri 2 app pairs a Monaco editor, an integrated terminal running the Claude Code CLI in a backend PTY, per-hunk and per-line git staging, resumable Claude sessions, a .claude workflow task runner, and a local SQLite-backed learned-memory store.

Benefit-first and keyword-aware: leads with *what it is* ("Claude-first, local-first desktop
coding environment for macOS"), then enumerates the concrete payload people search for ("Claude
Code CLI", "terminal", "Monaco editor", "git staging", "resumable Claude sessions", "task
runner", "SQLite") — every term is a feature `README.md` and `CHANGELOG.md` already truthfully
claim. Longer than the ~120-char sweet spot, but GitHub renders the full text on the repo page
and in search results, and each extra clause is a real search hook rather than filler. Mirrors
the README's What-is-Cantus paragraph; the shorter site `<title>`/`og:title`
("Cantus — Claude Code GUI & IDE for macOS") carries the punchier social-unfurl variant.

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

> Note: these are distinct surfaces, each correctly sized for its slot — do not conflate them.
> The README banner (`branding/cantus-banner.png`, 1200×320) is the wide-strip header format.
> The site OG card is its own asset (`site/assets/cantus-og.png`, **1200×630**, referenced by
> `og:image`/`twitter:image` in `site/index.html`) and is already correct for social unfurls.
> The **1280×640** export described above is needed *only* for the GitHub social-preview slot,
> which is still unset and gh cannot reach.

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
- **Site OG/social — strong (verified).** `site/index.html` sets `<title>`, `og:title`,
  `og:description`, `og:type`, and a dedicated `og:image` (→ `assets/cantus-og.png`, verified
  **1200×630** with `sips` — the standard large-card ratio) with `og:image:width`/`:height`/
  `:alt`. Full Twitter card tags are also present (`twitter:card=summary_large_image`,
  `twitter:title`, `twitter:description`, `twitter:image`, `twitter:image:alt`). This is
  already in good shape; nothing handed off here. (The separate **1280×640 GitHub
  social-preview** export in §2 below is a different surface and still owner-only/manual.)
- **Community profile — strong.** `LICENSE` (MIT), `CONTRIBUTING.md`, `CODE_OF_CONDUCT.md`,
  `SECURITY.md`, issue templates (`bug_report.yml`, `feature_request.yml`, `config.yml`),
  a PR template, `FUNDING.yml`, and Dependabot are all present. Issues and **Discussions**
  are enabled. Four tagged releases exist — `v1.0.0`, `v1.0.1`, `v1.1.0`, `v1.2.0` — with
  notes mirrored in `CHANGELOG.md` (`package.json` is at `1.2.0`). **`v1.2.0` is the
  published Latest release; `v1.1.0` is currently a Draft** — the one community-signal action
  outstanding is publishing that draft so its notes get an indexed Releases page and the
  release timeline reads cleanly. (Owner-only; out of this file's metadata scope, noted for
  the releases owner.)

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

### 4c. Existing threads to answer (verified)

Real, currently-live threads where people are asking for exactly this. Reply in your own
voice; each draft already discloses authorship and the honest caveats. **Only Hacker News
threads could be located *and* fetch-verified** — Reddit was unreachable from the research
environment (crawler blocked), so no Reddit links are listed rather than risk a fabricated
one. Search r/ClaudeAI, r/ClaudeCode, r/macapps manually from a browser; the same drafts
adapt well.

> Two landscape facts that shape the pitch: (1) Anthropic now ships an official **Claude Code
> Desktop** GUI (~April 2026), so the plain "does a GUI exist?" question is fading — lead with
> **IDE-shaped, open-source, drives-the-real-CLI**, which is Cantus's lane. (2) **opcode**
> (formerly Claudia, ~21k★, Tauri 2) is the usual open-source answer people give, but is widely
> noted as unmaintained since Aug 2025 — a fair, factual contrast point.

#### "GUI vs CLI" debate on the image-paste post — Hacker News, ~2026-05-25
- **URL:** comment https://news.ycombinator.com/item?id=48304466 on story https://news.ycombinator.com/item?id=48267432
- **Status:** open · 67 comments · subthread active and replyable
- **They asked:** benjamincburns: *"it'd be nice if it also had an elegant multi-page GUI so I could more easily drill into the actions it's performing and make better use of my large screen… I'd much rather use a GUI to do things that are actually visual/spatial in nature."*
- **Angle:** Two people in one thread describing the exact gap; no tool recommended yet.
- **Draft reply:**
  > Strongly agree with the "TUI for piping, GUI for the visual/spatial stuff" split — that's basically the line I kept hitting. Reviewing a multi-file diff or staging individual hunks is genuinely worse in a scrollback buffer than in a real editor pane, even though I love the CLI for everything else.
  >
  > I ended up building Cantus around that idea: it runs the actual `claude` CLI in an embedded PTY next to a Monaco editor, file tree, and libgit2-backed per-hunk/per-line staging, so the agent stays the real CLI but the review/spatial work happens in a GUI. Disclosure: I'm the author. It's MIT and free, with honest caveats — macOS Apple-Silicon only right now, the build is unsigned (right-click→Open on first launch), and it's early v1.x. https://github.com/manan45/Cantus

#### "Open-source GUI wrapper over the TUI" — Hacker News, ~2026-05-13
- **URL:** comment https://news.ycombinator.com/item?id=48130121 on story https://news.ycombinator.com/item?id=48126281
- **Status:** open · ~50 comments · replyable
- **They asked:** 2001zhaozhao: *"I might write an open-source Claude Code GUI wrapper to wrap over the TUI… runs Claude Code via the actual CLI… read the outputs directly from the terminal like a user would… build a worktree manager or whatever above this agent GUI layer."*
- **Angle:** They're describing, almost spec-for-spec, the design Cantus took — share concrete notes.
- **Draft reply:**
  > This is close to the exact design I landed on, so a few notes from having built it: running the real `claude` CLI in a PTY (rather than the `-p`/JSON path) does keep you on the interactive side of the line, and it works well. The two tradeoffs you flagged are real — I reconstruct file edits from git rather than scraping the TUI for them, which sidesteps the accept-edits display problem, and I keep a real terminal pane for interactive prompts so things like AskUserQuestion just work. A worktree/task layer on top is very doable from there.
  >
  > Disclosure: I'm the author of one of these — Cantus, MIT-licensed: https://github.com/manan45/Cantus. Caveats so you can calibrate: macOS Apple-Silicon only today, unsigned build, early v1.x. Happy to compare notes if you build yours.

#### "Intercept the CC TUI and render a native GUI" — Hacker News (Show HN: Zot), ~2026-05-29
- **URL:** comment https://news.ycombinator.com/item?id=48330532 on story https://news.ycombinator.com/item?id=48319524
- **Status:** open · ~80 comments · brand-new, replyable
- **They asked:** unshavedyak: *"if you could intercept UI/input from CC TUI and render that in a native GUI without it being a TUI. That would be 'interactive Claude Code' but you'd get a programmatic interface."*
- **Angle:** Direct curiosity about feasibility; Cantus is a working existence proof. Gently address the "would be banned" worry.
- **Draft reply:**
  > For what it's worth, this is buildable and doesn't have to be in TOS gray-area territory: the trick is to drive the actual interactive `claude` CLI in a PTY rather than hitting the API or the `-p` automation path, so from Anthropic's side it's still an interactive user session — you're just putting a native UI around it. You don't get a clean structured stream for free, so you reconstruct things like file edits from git, but it holds together.
  >
  > I built exactly this (Cantus — CLI in a PTY beside a Monaco editor + git hunk staging); disclosure: I'm the author. MIT, free, but fair warning: macOS Apple-Silicon only, unsigned build, early v1.x. Repo if you want to see how the pieces fit: https://github.com/manan45/Cantus

#### "Top N Claude Code agent managers — GUI / terminal / web?" — Hacker News (Show HN: Baton), ~2026-04-01
- **URL:** comment https://news.ycombinator.com/item?id=47602407 on story https://news.ycombinator.com/item?id=47599771
- **Status:** ⚠️ likely past HN's ~2-week reply window (created Apr 1) — **check for a live Reply link before posting; otherwise treat as reference only.**
- **They asked:** KronisLV: *"What's the top 5 (or any N) that come to mind: A) GUI based B) terminal based C) web based? … something with a bit of a community around it?"* (already lists Conductor/Cmux as Mac-only; wants headless-CC orchestration).
- **Angle:** Explicit "recommend me options" ask. Be honest that Cantus is single-working-copy GUI-first, not a multi-instance orchestrator.
- **Draft reply (only if the Reply link is still live):**
  > Since you're cataloguing the GUI-based ones: Cantus is another Mac one to add. It's deliberately IDE-shaped rather than a session dashboard — the real `claude` CLI runs in an embedded PTY next to a Monaco editor, file tree, and libgit2 per-hunk staging, with resumable sessions. Disclosure: I'm the author; MIT/free.
  >
  > Honest fit check for your criteria: macOS Apple-Silicon only (unsigned, early v1.x), and it's GUI-first for a single working copy — not yet a many-headless-instance orchestrator like you're describing, so if parallel fan-out is the main need it may not be the one. Repo: https://github.com/manan45/Cantus

**Where to find fresh asks:** HN comment threads on any Claude Code / coding-agent *Show HN* or pricing-change story (all four above came from those) and HN's monthly "Ask HN: What are you working on?". For Reddit, watch r/ClaudeAI, r/ClaudeCode, r/macapps and verify each thread in a browser before replying.

> Honest-positioning guardrails for whoever sends these: macOS / Apple Silicon **only**
> today (Linux and Windows are roadmap per CHANGELOG). Release builds are **unsigned** until
> Apple signing secrets are configured — say so. Do not cite stars, downloads, or ratings.

---

## 5. Measure & iterate

After outreach, watch **Insights → Traffic** (views, unique visitors, referrers, popular
content) and the stars-over-time trend to learn which channels convert, then iterate the
description/topics toward the terms that actually drive traffic.
