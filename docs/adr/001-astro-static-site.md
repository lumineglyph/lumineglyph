# ADR-001: Rebuild the site as a static Astro project

- **Status:** Accepted
- **Date:** 2026-11-13 (decided); 2026-11-15 (implemented in step 01)

## Context

The Lumineglyph site was originally a static site in HTML, CSS, and vanilla JS with no build step. User-facing strings were written in Japanese into the HTML; English was loaded via JS after the page loaded via the query ?lang=en. Additionally, the "works" and "contact" sections were renedered broswer-side via JS objects.

There were 3 issues with that approach:
- SEO was Japanese-only (problematic for a site focused on bilingual services).
- Missing translations or screenshots rendered as blank or placeholders in the live site (i.e. not caught in a build step).
- Content was mixed with code, meaning anyone updating the site had to dig through HTML rather than a dedicated / simplified content file.

Constraints: it is a small site with no interactive elements for the most part, fixed design, and a plan to host it on S3 + CloudFront. The designer will need to edit content through PRs.

## Decisions

- Rebuild the site using Astro. Make a full static build using i18n routing with Japanese at `/` and English at `/en/`.
- Put all content in JSON files plus the related screenshot, validated by a schema. E.g. the page copy is in `ja.json` and `en.json` and has the same shape. A type check fails the build if either file is missing a key that the other one has.
- The original markup and CSS are mostly unchanged in the port to Astro. Keep the CSS global rather than scoped to ensure the specific look stays the same.
- Browser-side JS is reduced to the minimum required at runtime (slideshow, nav highlight, mobile menu, theme switch).

### Options considered

1. Keep vanilla HTML/CSS/JS. This means the English pages would have to be duplicated by hand or by a script with nothing to validate content.
2. Next.js or Nuxt (static export). The main developer has worked with both extensively; however, it would be overkill to ship React or Vue runtime to the browser when the page is so simple with almost no interactivity. Static export would be secondary for both anyway.
3. **Astro**. HTML output with no JS unless required. `astro` files are HTML-first, allowing the existing markup to be ported over seamlessly for the mostp art. Built-in i18n routing, image optimization, schema validation of content, font self-hosting, and CSP hash generation (used later).

### Why static

Rare content changes; the content that does change goes through a PR. The embedded contact form is external (Google Forms), so no server needed. No server = cheap, fully cacheable hosting on S3 + CloudFront, smaller attack surface.

### Why JSON for content

- Simple editing via GitHub's web editor
- `$schema` provides autocomplete and error highlighting in VSCode.
- Checked at build: URLs must be valid, every work needs both languages, and images must exist.
- Line breaks are written as `\n` and turned into `<br>` by a component, so there is no raw HTML content injection.

Markdown with front matter or a headless CMS is overkill for short strings. A CMS adds another service to manage and possibly pay for.

## Consequences

**Positive**
- English has its own URL and page that search engines can index.
- Content mistakes fail at build instead of surviving to production.
- Minimal JS: 2.7 KB on the home page.
- Modularity - small components instead of one big page with the copy in one place per language.

**Negative / trade-offs**
- **Introduction of build step and dependency maintenance** (Node 24, npm dependencies). Dependabot (step 03) keeps the dependencies current.
- **Every deploy needs a build.** CI builds once and deploys that same artifact (step 06).
- **More complex editing workflow.** Editors need a preview build, which the per-PR preview sites provide (step 07).
- **Switching JP/EN now loads a new page.** It lands on the same section, but not at the exact scroll position the old in-place switch kept.
- **The copy type check catches missing keys, not empty strings.** That's deliberate: some English nav subtitles are intentionally empty.
- **Astro 7 is recent,** so future major upgrades may need migration work.
