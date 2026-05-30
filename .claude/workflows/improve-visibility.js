export const meta = {
  name: 'improve-visibility',
  description:
    'Improve the Cantus site, docs, and GitHub discoverability end-to-end: research the SEO + GitHub + docs landscape, audit current assets against it, then implement upgrades across the landing page (react-frontend agent), README, the supporting Markdown docs (docs-content-upgrade skill), and GitHub repo metadata in parallel over disjoint files — and review the result with the cantus-reviewer agent for correctness, broken links, and scope.',
  whenToUse:
    'When the goal is more organic visibility for the repo + landing page AND cleaner, accurate docs. Optional args: { siteUrl, repo, applyGitHub }.',
  phases: [
    { title: 'Research', detail: 'SEO + GitHub + docs briefs, grounded in web research (parallel)' },
    { title: 'Audit', detail: 'Score current site / README / docs / repo metadata against the briefs' },
    { title: 'Implement', detail: 'Site SEO+design (react-frontend), README, supporting docs, GitHub metadata — disjoint files, parallel' },
    { title: 'Review', detail: 'cantus-reviewer: validate meta/JSON-LD, links, broken images, claim-accuracy, no scope creep' },
  ],
}

const siteUrl = (args?.siteUrl ?? 'https://manan45.github.io/Cantus/').replace(/\/?$/, '/')
const repo = args?.repo ?? 'manan45/Cantus'
const applyGitHub = args?.applyGitHub ?? true

const PROJECT = `Cantus — a Claude-first desktop coding environment (Tauri 2 + Rust + React/TypeScript). One native macOS (Apple Silicon) app puts a Monaco editor, an integrated xterm.js terminal running the Claude Code CLI in a backend-spawned PTY, libgit2 git with per-hunk AND per-line staging, resumable Claude sessions, a capability-aware task runner that assembles and runs .claude workflows, and a local SQLite+FTS5 learned-memory store side by side. Local-first and private — source never leaves the machine except as Claude's own model API calls. Repo: github.com/${repo}. Landing page deployed via GitHub Pages from /site at ${siteUrl}.`

const TRUTH = 'Do NOT fabricate features, metrics, screenshots, ratings, or versions. Cantus only has what README.md / site/index.html / CHANGELOG.md already truthfully claim — verify against those and package.json before asserting anything. Preserve the existing dark + coral / JetBrains-Mono voice and visual language; enhance, never replace.'

const RESEARCH_METHOD =
  'Follow the deep-research methodology: fan out a few targeted searches (load WebSearch / WebFetch via ToolSearch if available), corroborate across sources, and ground every recommendation. If web tools are unavailable, rely on current best-practice knowledge and say so explicitly.'

// ── schemas ──────────────────────────────────────────────────────────────────
const SEO_BRIEF_SCHEMA = {
  type: 'object',
  required: ['targetKeywords', 'title', 'metaDescription', 'structuredDataTypes', 'recommendations', 'competitorInsights'],
  properties: {
    targetKeywords: { type: 'array', items: { type: 'string' }, description: 'Real search terms this niche uses, highest-intent first' },
    title: { type: 'string', description: 'Recommended <title>, ~50-60 chars, keyword-first' },
    metaDescription: { type: 'string', description: '~150-160 char meta description, benefit-led' },
    structuredDataTypes: { type: 'array', items: { type: 'string' }, description: 'schema.org types worth adding (e.g. SoftwareApplication, WebSite)' },
    recommendations: { type: 'array', items: { type: 'string' }, description: 'Concrete on-page actions, prioritized' },
    competitorInsights: { type: 'string', description: 'How comparable AI-dev-tool sites win search/social, and the gaps to exploit' },
  },
}

const GH_BRIEF_SCHEMA = {
  type: 'object',
  required: ['recommendedDescription', 'recommendedTopics', 'socialPreview', 'readmeTips', 'discoveryChannels'],
  properties: {
    recommendedDescription: { type: 'string', description: 'About-box description, benefit-first, ~120 chars' },
    recommendedTopics: { type: 'array', items: { type: 'string' }, description: 'Up to 20 lowercase-hyphenated topics, relevance-ranked' },
    socialPreview: { type: 'string', description: 'Exact manual step + image path for the 1280x640 social preview' },
    readmeTips: { type: 'array', items: { type: 'string' }, description: 'README conversion/SEO fixes for this repo' },
    discoveryChannels: { type: 'array', items: { type: 'string' }, description: 'Specific awesome-lists / communities to submit to, with drafted one-liners' },
  },
}

const DOCS_BRIEF_SCHEMA = {
  type: 'object',
  required: ['inaccuracies', 'structureFixes', 'supportingDocFixes', 'priorities'],
  properties: {
    inaccuracies: { type: 'array', items: { type: 'string' }, description: 'Claims/commands/versions in the docs that the code or package.json does not back up' },
    structureFixes: { type: 'array', items: { type: 'string' }, description: 'Scannability / heading / IA improvements for the Markdown docs' },
    supportingDocFixes: { type: 'array', items: { type: 'string' }, description: 'Concrete fixes for CONTRIBUTING / SECURITY / CHANGELOG / CODE_OF_CONDUCT' },
    priorities: { type: 'array', items: { type: 'string' } },
  },
}

const AUDIT_SCHEMA = {
  type: 'object',
  required: ['gaps', 'brokenLinks', 'topPriorities'],
  properties: {
    gaps: {
      type: 'array',
      items: {
        type: 'object',
        required: ['area', 'current', 'target', 'priority'],
        properties: {
          area: { type: 'string', enum: ['site-head', 'site-content', 'crawl-files', 'readme', 'supporting-docs', 'repo-metadata'] },
          current: { type: 'string' },
          target: { type: 'string' },
          priority: { type: 'string', enum: ['high', 'medium', 'low'] },
        },
      },
    },
    brokenLinks: { type: 'array', items: { type: 'string' }, description: 'Referenced files/URLs that do not exist on disk (e.g. missing screenshots)' },
    topPriorities: { type: 'array', items: { type: 'string' } },
  },
}

const REVIEW_SCHEMA = {
  type: 'object',
  required: ['verdict', 'blockers', 'findings', 'manualSteps'],
  properties: {
    verdict: { type: 'string', enum: ['safe-to-land', 'has-blockers'] },
    blockers: { type: 'array', items: { type: 'string' } },
    findings: {
      type: 'array',
      items: {
        type: 'object',
        required: ['severity', 'location', 'problem', 'fix'],
        properties: {
          severity: { type: 'string', enum: ['blocker', 'should-fix', 'nit'] },
          location: { type: 'string' },
          problem: { type: 'string' },
          fix: { type: 'string' },
        },
      },
    },
    manualSteps: { type: 'array', items: { type: 'string' }, description: 'Things a human must finish (social preview upload, screenshot capture, channel submissions)' },
  },
}

// ── 1. RESEARCH ──────────────────────────────────────────────────────────────
phase('Research')
const [seoBrief, ghBrief, docsBrief] = await parallel([
  () =>
    agent(
      `${PROJECT}\n\nRead .claude/skills/seo-optimize/SKILL.md first, then build the on-page SEO brief for the landing page at ${siteUrl}.\n${RESEARCH_METHOD}\n` +
        `Identify the real search terms developers use to find a tool like this (e.g. "Claude Code GUI", "Claude Code IDE", "AI coding desktop app", "terminal AI agent IDE", "Tauri AI editor"), the strongest keyword-first <title> and meta description, which schema.org structured-data types fit a free developer app, and how comparable AI-dev-tool landing pages win search + social unfurls. Be specific and concrete. ${TRUTH}`,
      { label: 'research:seo', phase: 'Research', schema: SEO_BRIEF_SCHEMA },
    ),
  () =>
    agent(
      `${PROJECT}\n\nRead .claude/skills/github-visibility/SKILL.md first, then build the GitHub discoverability brief.\n${RESEARCH_METHOD}\n` +
        `Read current metadata: run \`gh repo view ${repo} --json description,repositoryTopics,homepageUrl\`. Refine it — keep good topics, don't blow them away. The homepage is currently EMPTY; it must be set to ${siteUrl}. Recommend a benefit-first description (~120 chars), up to 20 relevance-ranked topics, the social-preview manual step, README conversion/SEO fixes, and specific discovery channels (awesome-claude / awesome-tauri / awesome-ai-coding lists, relevant communities) with drafted one-line blurbs. ${TRUTH}`,
      { label: 'research:github', phase: 'Research', schema: GH_BRIEF_SCHEMA },
    ),
  () =>
    agent(
      `${PROJECT}\n\nRead .claude/skills/docs-content-upgrade/SKILL.md first, then audit the repo's Markdown docs for the truth/scannability/discoverability pass.\n` +
        `Read README.md, CONTRIBUTING.md, CODE_OF_CONDUCT.md, SECURITY.md, CHANGELOG.md, and package.json. Flag any documented command/script/version/feature that package.json or the source does not back up (the "truth pass"). Identify structure/scannability fixes and concrete improvements for the supporting docs. Note: README references branding/screenshots/{workspace,terminal,diff-view,orchestrator}.png which do NOT exist on disk — call that out as an inaccuracy. ${TRUTH}`,
      { label: 'research:docs', phase: 'Research', schema: DOCS_BRIEF_SCHEMA },
    ),
])

// ── 2. AUDIT ─────────────────────────────────────────────────────────────────
phase('Audit')
const audit = await agent(
  `${PROJECT}\n\nAudit the CURRENT assets against the research briefs below and return a prioritized gap list.\n` +
    `Read: site/index.html, README.md, the supporting docs (CONTRIBUTING/SECURITY/CHANGELOG/CODE_OF_CONDUCT), and run \`gh repo view ${repo} --json description,repositoryTopics,homepageUrl\`. Check the filesystem for every image/link referenced by README.md and site/index.html — flag any that do not exist on disk (e.g. branding/screenshots/*.png) as brokenLinks.\n\n` +
    `SEO brief:\n${JSON.stringify(seoBrief, null, 2)}\n\nGitHub brief:\n${JSON.stringify(ghBrief, null, 2)}\n\nDocs brief:\n${JSON.stringify(docsBrief, null, 2)}`,
  { label: 'audit', phase: 'Audit', schema: AUDIT_SCHEMA },
)

// ── 3. IMPLEMENT (disjoint file ownership → safe parallel) ────────────────────
//   site   → site/index.html + site/{robots.txt,sitemap.xml,site.webmanifest}
//   readme → README.md
//   docs   → CONTRIBUTING/CODE_OF_CONDUCT/SECURITY/CHANGELOG (NOT README)
//   github → remote metadata via gh + .github/DISCOVERABILITY.md
phase('Implement')
const SHARED = `SEO brief:\n${JSON.stringify(seoBrief, null, 2)}\n\nGitHub brief:\n${JSON.stringify(ghBrief, null, 2)}\n\nDocs brief:\n${JSON.stringify(docsBrief, null, 2)}\n\nAudit:\n${JSON.stringify(audit, null, 2)}`

const built = await parallel([
  () =>
    agent(
      `You own ONLY the landing page and its crawl files (site/index.html, site/robots.txt, site/sitemap.xml, site/site.webmanifest). Touch nothing else. ${PROJECT}\n\n` +
        `Read .claude/skills/seo-optimize/SKILL.md, then upgrade site/index.html and add the crawl files.\n` +
        `Canonical base URL: ${siteUrl} — every og:/twitter: image+url and JSON-LD url MUST be absolute against this base (assets live at ${siteUrl}assets/...).\n` +
        `Do all of: (1) complete <head> SEO — title, meta description, canonical, robots, theme-color, color-scheme, full Open Graph WITH og:image:width/height/alt and og:url, Twitter summary_large_image, and JSON-LD for ${JSON.stringify(seoBrief.structuredDataTypes)} kept consistent with the visible page; ` +
        `(2) raise on-page content & design quality (hero, feature copy, semantic landmarks <header>/<nav>/<main>/<section>/<footer>, alt text, a11y, image width/height + loading=lazy/decoding=async on below-the-fold images) honoring the existing dark+coral / JetBrains-Mono aesthetic; ` +
        `(3) create site/robots.txt and site/sitemap.xml (absolute <loc> under ${siteUrl}) and a site/site.webmanifest wired from <head>. Only reference images that exist in site/assets/ (cantus-banner.png, cantus-icon.svg, cantus-mark.svg).\n\n${SHARED}\n\n${TRUTH}`,
      { label: 'impl:site', phase: 'Implement', agentType: 'react-frontend' },
    ),
  () =>
    agent(
      `You own ONLY README.md. Touch nothing else. ${PROJECT}\n\nRead .claude/skills/github-visibility/SKILL.md, then SEO- and conversion-optimize README.md per the briefs.\n` +
        `Make the first screen answer what/why/install fast; keyword-aware H1 + lead line mirroring the repo description; descriptive alt text on every image; tighten headings for search; add a short positioning/comparison angle if it fits naturally.\n` +
        `CRITICAL: README references branding/screenshots/workspace.png, terminal.png, diff-view.png, orchestrator.png which DO NOT EXIST on disk (only branding/cantus-banner.png exists). Do not ship broken images: keep the real banner, and either remove the missing-screenshot blocks or replace them with a clearly-marked, non-broken text description — and list exactly which screenshots to capture later. ${TRUTH}`,
      { label: 'impl:readme', phase: 'Implement' },
    ),
  () =>
    agent(
      `You own ONLY the supporting Markdown docs: CONTRIBUTING.md, CODE_OF_CONDUCT.md, SECURITY.md, CHANGELOG.md. Do NOT touch README.md or site/. ${PROJECT}\n\n` +
        `Read .claude/skills/docs-content-upgrade/SKILL.md, then apply the truth + scannability + supporting-doc fixes from the docs brief. Verify every command against package.json before keeping it. Ensure CHANGELOG.md follows Keep-a-Changelog (newest first, Added/Changed/Fixed, release links), CONTRIBUTING.md states the real setup + quality-check commands (npm install, npm run tauri dev, npm run check), SECURITY.md has a working disclosure channel and accurate supported versions, and CODE_OF_CONDUCT.md has a real contact. Keep the project's existing voice. ${TRUTH}`,
      { label: 'impl:docs', phase: 'Implement' },
    ),
  () =>
    agent(
      `You own ONLY GitHub repo metadata and .github/DISCOVERABILITY.md (create it). Do not edit site/, README.md, or other docs. ${PROJECT}\n\nRead .claude/skills/github-visibility/SKILL.md.\n` +
        (applyGitHub
          ? `gh is authenticated for ${repo} with repo scope. APPLY the metadata now in ONE command: \`gh repo edit ${repo} --description "..." --homepage "${siteUrl}" --add-topic ... [--remove-topic ...]\`. ` +
            `The homepage is currently EMPTY — setting it to ${siteUrl} is a required win. Use the brief's description and topics; refine the existing topic set (ai, ai-agents, anthropic, claude, code-editor, desktop-app, developer-tools, ide, llm, macos, monaco-editor, react, rust, tauri, typescript) rather than discarding good ones; cap at 20; add high-value ones like claude-code if missing; prune only true noise. Verify with \`gh repo view ${repo} --json description,repositoryTopics,homepageUrl\` afterward.\n`
          : `gh apply is disabled — instead emit the exact \`gh repo edit\` command to run.\n`) +
        `Then write .github/DISCOVERABILITY.md documenting: the final description + each topic with a one-line rationale, the social-preview manual step (1280x640, exact path to the banner to upload — gh cannot set this), README/site/docs fixes status, and the drafted discovery-channel submissions (awesome-lists, communities) ready for a human to send. Do NOT post anything externally. ${TRUTH}`,
      { label: 'impl:github', phase: 'Implement' },
    ),
]).then((r) => r.filter(Boolean))

// ── 4. REVIEW ────────────────────────────────────────────────────────────────
phase('Review')
const review = await agent(
  `Review the working-tree changes from this visibility pass for correctness — do NOT rewrite, just verify and report.\n` +
    `Check: site/index.html has exactly one <title> and one <h1>; every og:/twitter: image+url and JSON-LD url is ABSOLUTE under ${siteUrl} and the referenced image files exist in site/assets/; JSON-LD is well-formed and consistent with the visible copy; site/robots.txt + site/sitemap.xml exist with absolute URLs and site.webmanifest is linked from <head>; README.md has NO remaining broken image references (the four branding/screenshots/*.png were missing); supporting docs (CONTRIBUTING/SECURITY/CHANGELOG/CODE_OF_CONDUCT) are accurate against package.json and internally consistent; the gh metadata change applied with homepage set (\`gh repo view ${repo} --json description,repositoryTopics,homepageUrl\`) and topics <=20; .github/DISCOVERABILITY.md exists; nothing fabricates features/metrics/versions; scope stayed within site + docs + repo metadata.\n` +
    `Return blockers, findings, and the manualSteps a human still must do.`,
  { label: 'review', phase: 'Review', schema: REVIEW_SCHEMA, agentType: 'cantus-reviewer' },
)

return { siteUrl, repo, seoBrief, ghBrief, docsBrief, audit, implemented: built.length, review }
