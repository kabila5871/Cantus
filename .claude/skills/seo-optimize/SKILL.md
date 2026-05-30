---
name: seo-optimize
description: Make a static marketing/landing page rank and share well — complete on-page SEO for an HTML site (title/meta, Open Graph + Twitter cards, JSON-LD structured data, sitemap.xml, robots.txt, canonical URLs, semantic HTML/a11y, performance). Use when improving discoverability or social unfurls of a website, docs site, or GitHub Pages landing page.
---

# seo-optimize — on-page SEO for a static site

Goal: a page that (1) is indexed correctly, (2) ranks for the right queries, and (3) unfurls into a rich card on Slack/X/LinkedIn/iMessage. Work the checklist top-to-bottom; each item is independently shippable.

Always work against the **canonical absolute URL** of the deployed site. Open Graph and JSON-LD `url`/`image` fields MUST be absolute (`https://host/path/img.png`), never relative — relative URLs break social unfurls. If the site is GitHub Pages for `user/Repo` with no custom domain, the base is `https://<user>.github.io/<Repo>/`.

## 1. `<head>` essentials

```html
<title>Primary Keyword — Short Value Prop</title>            <!-- ~50–60 chars, keyword first -->
<meta name="description" content="…150–160 chars, one benefit-led sentence with the primary keyword, reads like a human wrote it." />
<link rel="canonical" href="https://host/path/" />
<meta name="robots" content="index, follow" />
<meta name="theme-color" content="#1b1d23" />
<meta name="color-scheme" content="dark light" />
<meta name="keywords" content="…" />   <!-- low value for Google, but harmless; keep ≤10, no stuffing -->
```

Rules: exactly one `<title>` and one `<h1>`, and they should differ (title = SERP, h1 = on-page). Title and description must be unique per page. Don't keyword-stuff — Google penalizes it and humans bounce.

## 2. Open Graph + Twitter (the share card)

```html
<meta property="og:type" content="website" />
<meta property="og:site_name" content="Cantus" />
<meta property="og:title" content="…" />
<meta property="og:description" content="…" />
<meta property="og:url" content="https://host/path/" />
<meta property="og:image" content="https://host/path/assets/banner.png" />   <!-- ABSOLUTE -->
<meta property="og:image:width" content="1200" />
<meta property="og:image:height" content="630" />
<meta property="og:image:alt" content="Describe the image for screen readers" />
<meta name="twitter:card" content="summary_large_image" />
<meta name="twitter:title" content="…" />
<meta name="twitter:description" content="…" />
<meta name="twitter:image" content="https://host/path/assets/banner.png" />
```

The share image should be **1200×630** (1.91:1). If only a non-1.91:1 banner exists, still wire it and note the ideal size as a TODO — a wired card beats no card. Declaring `og:image:width/height` lets platforms render the card before fetching the image.

## 3. JSON-LD structured data

Add one `<script type="application/ld+json">` per relevant schema.org type. For a developer tool / app landing page, `SoftwareApplication` is the highest-value type; add `WebSite` so search engines understand the site entity.

```html
<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@type": "SoftwareApplication",
  "name": "Cantus",
  "applicationCategory": "DeveloperApplication",
  "operatingSystem": "macOS",
  "url": "https://host/path/",
  "description": "…",
  "offers": { "@type": "Offer", "price": "0", "priceCurrency": "USD" },
  "author": { "@type": "Person", "name": "…" }
}
</script>
```

Keep JSON-LD values in sync with the visible page (Google flags mismatches). Only claim `aggregateRating`/`review` if real data backs it — fabricated ratings get manual actions.

## 4. Crawl files (siblings of the HTML, served at site root)

`robots.txt`:
```
User-agent: *
Allow: /
Sitemap: https://host/path/sitemap.xml
```

`sitemap.xml` — list every indexable URL with absolute `<loc>`:
```xml
<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemap.org/schemas/sitemap/0.9">
  <url><loc>https://host/path/</loc><changefreq>weekly</changefreq><priority>1.0</priority></url>
</urlset>
```
For a GitHub Pages **project** site (served under `/Repo/`), `robots.txt`/`sitemap.xml` placed in the site folder resolve under that subpath — reference them with the full subpath, and point Search Console at the subpath property.

## 5. Semantic HTML & accessibility (SEO and a11y are the same work)

- Real landmarks: `<header> <nav> <main> <section> <footer>`, not `<div>` soup.
- One `<h1>`; don't skip heading levels.
- Every `<img>` has descriptive `alt` (decorative → `alt=""`). Alt text is read by crawlers and screen readers.
- Links have meaningful text ("Download for macOS", not "click here").
- Sufficient color contrast; visible focus states.

## 6. Performance (Core Web Vitals feed ranking)

- Set explicit `width`/`height` (or `aspect-ratio`) on images to prevent layout shift (CLS).
- `loading="lazy"` and `decoding="async"` on below-the-fold images.
- `<link rel="preconnect">` to font/asset origins; self-host or `font-display: swap` for fonts.
- Inline critical CSS for a one-file landing page (already common); avoid render-blocking JS.
- Compress/resize images; prefer SVG for logos/icons.

## 7. Favicon + manifest set

`<link rel="icon" type="image/svg+xml" href="…">` plus a PNG fallback and `apple-touch-icon`. A `site.webmanifest` with `name`, `short_name`, `theme_color`, `background_color`, and icon entries enables install/add-to-home and is a small ranking/PWA signal.

## Validate before declaring done

- Structured data: schema.org validator / Google Rich Results Test (logic-check the JSON shape if offline).
- Share card: confirm every `og:`/`twitter:` image+url is **absolute** and the image file exists on disk.
- Links: no broken internal links; canonical matches the real deployed URL.
- One `<title>`, one `<h1>`, unique meta description.

## Anti-patterns (don't)

- Relative `og:image` / `og:url` — the #1 reason cards don't render.
- Keyword stuffing in `<title>`, `meta description`, or `keywords`.
- JSON-LD that contradicts the visible page, or fabricated ratings/reviews.
- Multiple `<h1>`s, `<div>`-only structure, missing `alt`.
- Blocking crawlers in `robots.txt` by accident (`Disallow: /`).
