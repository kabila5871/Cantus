---
name: github-visibility
description: Make a GitHub repo discoverable and compelling — the About trifecta (description, topics, website), README as an SEO/conversion surface, social preview, releases, and organic discovery channels. Use when the goal is more stars, search hits, and first-time visitors who stay. Applies edits via the gh CLI where possible and documents the manual steps it can't.
---

# github-visibility — get a repo found and starred

Two audiences: **GitHub/Google search** (gets people to the repo) and **the human who lands** (gets them to star, install, or contribute). Optimize both. Apply what the `gh` CLI can; for the rest, write a crisp checklist the maintainer can do in two minutes.

Before editing, read current state: `gh repo view --json name,description,repositoryTopics,homepageUrl,url`. Refine what's there — don't blow away good existing topics.

## 1. The About trifecta (highest leverage, 90 seconds)

GitHub search weights the **description** and **topics** heavily, and the About box is the first thing a visitor reads.

- **Description**: one sentence, benefit-first, with the 2–3 terms people actually search. ~120 chars is the sweet spot (full text shows in search). Lead with what it *is*, not how it's built.
- **Topics**: up to **20**, lowercase-hyphenated. Mix broad discovery terms with specific tech. Each topic is a browsable page (`github.com/topics/<t>`) and a search facet. Don't stuff junk — relevance compounds, noise dilutes.
- **Website (homepageUrl)**: the landing/docs URL. Empty homepage = a wasted click target. Point it at the Pages site.

Apply in one call:
```bash
gh repo edit OWNER/REPO \
  --description "…benefit-first, keyword-aware, ~120 chars…" \
  --homepage "https://owner.github.io/Repo/" \
  --add-topic topic-a --add-topic topic-b   # --remove-topic to prune
```

Good topic families for an AI/dev-tool: the domain (`ai`, `llm`, `agentic`, `ai-agents`, `developer-tools`, `code-editor`, `ide`), the integration (`claude`, `anthropic`, `claude-code`), the stack (`rust`, `tauri`, `react`, `typescript`), the platform (`macos`, `desktop-app`). Pick the ~15–20 with real search volume for the niche; drop vanity tags.

## 2. Social preview image (the unfurl when the repo link is shared)

A repo with no social preview unfurls as a gray Octocat — low trust, low click-through. Upload a **1280×640** PNG (the project banner works) at **Settings → General → Social preview**. The `gh` CLI **cannot** set this (no API) — always emit it as a manual step with the exact path to the image to upload.

## 3. README — the conversion surface (and a Google-indexed page)

The README is indexed by Google and is where the star decision happens. First screen must answer "what is this, why care, how do I start" without scrolling:

- **H1 + one-line value prop** mirroring the description and target keywords (the H1 becomes the page's search title).
- **Banner/screenshot up top** — a real product shot massively lifts stars. If referenced screenshots are missing files, that's a broken-image bug; flag it and either remove the refs or list the shots to capture.
- **Badges** (CI, license, platform, version) — instant credibility, but keep to one row.
- **What / Why / Install** in the first third. Install in ≤3 copy-paste commands.
- **Descriptive alt text** on every image (indexed + accessible).
- A short anchor **TOC** for long READMEs; keyword-aware `##` headings (people search "how to <verb>").
- A **comparison** ("vs. X") section captures comparison searches and clarifies positioning.

Write for humans first; keyword-aware, never keyword-stuffed.

## 4. Releases, changelog, community signals

- **Tagged releases** with notes get their own indexed pages and a "Releases" sidebar link; ship real release notes, not just a tag.
- **CHANGELOG.md** + **LICENSE** + **CODE_OF_CONDUCT** + **CONTRIBUTING** + issue/PR templates raise GitHub's "community profile" score and trust.
- **Pin** the repo on the owner profile; add it to relevant profile README.
- Enable **Discussions** if you want Q&A surface area.

## 5. Organic discovery channels (propose, don't auto-post)

These need a human and a real account — produce ready-to-send copy, never post on the maintainer's behalf:

- Relevant **awesome-* lists** (e.g. awesome-claude, awesome-tauri, awesome-ai-coding) — open a PR adding the repo with a one-line description.
- A **Show HN** / launch post, relevant subreddits, and dev communities — draft the title + blurb.
- Cross-link from a blog/dev.to post and the project site back to the repo.

## 6. Measure

Check **Insights → Traffic** (views, unique visitors, referrers, popular content) and the stars-over-time trend to learn which channels convert. Iterate topics/description toward what actually drives traffic.

## Output contract for this skill

When run, produce: (a) the exact `gh repo edit` command(s) applied (or to apply), (b) the final description + topic list with a one-line rationale each, (c) the manual social-preview step with the image path, (d) README fixes made or needed (esp. broken images), and (e) drafted discovery-channel copy. Apply (a) and README edits you own; document the rest.

## Anti-patterns (don't)

- Auto-posting to HN/Reddit/awesome-lists on the user's behalf — draft only.
- Topic stuffing or vanity tags that dilute relevance.
- A description that explains the stack before the value ("Tauri app using Rust…" buries the lede).
- Leaving homepage empty or the social preview unset.
- Fabricating stars/metrics or claiming features that don't exist.
