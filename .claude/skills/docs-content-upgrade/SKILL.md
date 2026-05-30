---
name: docs-content-upgrade
description: Raise the quality, accuracy, and discoverability of a repo's Markdown docs — README first-screen, CONTRIBUTING, SECURITY, CHANGELOG, and the docs information architecture. Use when docs are stale, inconsistent, hard to scan, or claim things the code doesn't. Complements seo-optimize (HTML on-page SEO) and github-visibility (repo metadata); this skill owns the prose.
---

# docs-content-upgrade — make the docs clear, correct, and findable

Three jobs, in priority order: (1) **correct** — docs must not claim features, commands, or versions that don't exist; (2) **scannable** — a reader finds the answer in seconds; (3) **discoverable** — headings and wording match what people actually search. Work the checklist; each item ships independently. Never invent capabilities to make the docs look better — verify every claim against the code, `package.json`, and the actual CLI before you write it.

## 1. Truth pass (do this first — it gates everything else)

- Cross-check every claim against reality: read `package.json`/`Cargo.toml` for the real scripts, versions, and deps; grep the source for features the docs assert; run `--help` where a command is documented. Fix or cut anything unverifiable.
- Install/run commands must be copy-paste-correct on a clean machine. Match the actual script names (`npm run tauri dev`, not an aspirational `npm start`).
- Version/roadmap claims must match `CHANGELOG.md` and shipped tags. "Shipped in v1.1" is a promise — verify the tag exists.
- **Broken image/link refs are bugs.** A `![](path)` to a file not on disk renders as a broken icon and reads as neglect. Either supply the asset, remove the ref, or replace it with a clearly-marked text description — never ship the broken image. List exactly which assets to capture later.

## 2. README first screen — the 10-second test

The first screenful (before any scroll) must answer **what is this · why care · how do I start**:

- One H1 + a single bold value-prop line mirroring the repo description and the terms people search.
- A real banner or product shot up top (a genuine screenshot lifts trust and stars more than any prose).
- One row of badges (CI, license, platform, version) — credibility at a glance, not a wall.
- Install in ≤3 copy-paste commands inside the first third of the page.
- Descriptive `alt` text on every image (indexed by search, read by screen readers).

## 3. Structure & scannability

- Keyword-aware `##` headings — people search "how to <verb>"; a heading that mirrors the query is a search anchor and a jump target.
- For long docs, a short anchor TOC near the top.
- Prefer tables, short lists, and fenced code over dense paragraphs; one idea per paragraph.
- A "vs. X" / positioning section captures comparison searches and sharpens the pitch.
- Consistent voice and terminology — pick one name per concept and use it everywhere (don't alternate "task runner" / "orchestrator" / "agent runner" for the same thing).

## 4. The supporting docs (community-profile + trust signals)

GitHub scores a repo's "community profile" on these, and each is a trust signal to a human deciding whether to depend on you:

- **CONTRIBUTING.md** — how to set up, the quality bar (lint/test commands), branch/PR conventions, where to ask. Make a first PR feel achievable.
- **CODE_OF_CONDUCT.md** — a standard one (Contributor Covenant) is fine; just make sure the contact is real.
- **SECURITY.md** — supported versions and a private disclosure channel that actually works.
- **CHANGELOG.md** — Keep-a-Changelog format, newest first, grouped Added/Changed/Fixed, links to releases. This is an indexed page and the honest record of momentum.
- Issue/PR templates — lower the friction and raise the signal of incoming reports.

## 5. Information architecture (when docs outgrow the README)

- Keep the README as the front door; move deep material (architecture, full config, design notes) into linked files so the README stays a fast on-ramp. Don't bloat the README — link to depth.
- Cross-link related docs both ways; a reader should never hit a dead end.
- Internal-design / planning files (PRDs, implementation plans) are fine to keep but shouldn't compete with user-facing docs for attention — link them from a "Design notes" aside, not the install section.

## Validate before declaring done

- Every command in the docs runs clean on a fresh checkout; every documented script exists in `package.json`/`Cargo.toml`.
- No broken image or link references anywhere (grep for `](` targets and confirm each exists or is external).
- README first screen passes the what/why/how 10-second test.
- One H1 per doc; headings don't skip levels.
- Terminology and version claims are consistent across README, CHANGELOG, and the site.

## Anti-patterns (don't)

- Documenting aspirational features as if they ship — it erodes trust fast and invites bad issues.
- Shipping broken image references (the #1 "this repo is abandoned" tell).
- A README that explains the architecture before it says what the thing *is* or how to run it.
- Walls of prose where a table or list would do; inconsistent names for the same concept.
- Rewriting docs into a generic, voiceless template — preserve the project's existing tone and accurate specifics.
