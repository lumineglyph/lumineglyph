# 02 — Performance, SEO and CSP

## Goal

- Images are served as responsive AVIF/WebP.
- Fonts are self-hosted, and Japanese fonts download only the slices of characters a page actually uses.
- Each page has complete SEO metadata in both languages, plus a sitemap, robots.txt, favicon and 404 page.
- A Content Security Policy that Astro generates, with hashes for every script and style.
- The site meets WCAG 2.2 AA in both themes.

## Why it matters

These are the numbers people can check:
- **Lighthouse scores.**
- **securityheaders.com grade.** Step 05 completes this one.
- **Bilingual search results.** The hreflang tags tell search engines which language each page is in, which matters for a studio that sells bilingual sites.

Self-hosting the fonts also means visitors' browsers never contact Google, which helps privacy and lets the CSP stay strict.

## Steps

### A. Images

- **Work screenshots, slideshow and team photo:** switch from `<Image />` to `<Picture />` with `formats={["avif", "webp"]}`. Give it real `widths` and `sizes` that match the layout:
  - The slideshow is at most 270px wide.
  - Work cards are about 300px on desktop and full width minus the gutters on mobile.
  - The profile photo is 180px on desktop and up to 240px on mobile.
  - Include 2× widths for retina screens.
- `loading="lazy"` on everything below the fold and on every slide except the first.
- **Check the layout.** `.work-img img` and `.slide img` are absolutely positioned. With `<picture>` wrapping the `<img>`, the positioning still works because `<picture>` isn't positioned, but compare with the old site to be sure.
- **Logos:** use real vector SVGs if available. They're smaller and sharp at any size.
  - **Check first** that a file really is vector: `grep -c '<path' file.svg` should be well above 0, and `grep -c '<image' file.svg` should be 0.
  - The current SVGs in `assets/` pass this check, but they're traced from the PNGs, so the black and white versions have slightly different shapes. Pick the cleaner one of each pair and set its fills to `currentColor`. One inline SVG then follows the theme's text color, and the `.on-dark` / `.on-light` image swap goes away. Delete the stray grey (`#D2D3D4`) paths in `logo-symboltype-white.svg` if you use that one, then run `npx svgo`.
  - If no vector source exists, run the PNGs through `<Image />`.
  - Decorative copies (like `.hero-mark`) keep `alt=""`.
- **Favicon:** `public/favicon.svg` from the logo mark, plus a 180×180 `apple-touch-icon.png`. An SVG favicon can include its own `prefers-color-scheme` media query to switch between the white and black marks.

### B. Fonts

> **What was actually built (2026-11-15/16).** The Fonts API gave one 1.1–1.4 MB file per Japanese weight. The Fontsource packages gave slices, but about 70 of them (950 KB) per Japanese page. Subsetting both Japanese fonts at build time still left the Japanese home page at 85 on mobile. Final: body text uses the system font, and only Shippori Mincho is self-hosted for Japanese, subset at build time to the headings (19 KB). See `site/fonts/README.md` and `site/integrations/subset-fonts.mjs`. The text below is the original plan, kept for the record.

Use Astro's built-in Fonts API. It downloads the font files at build time and serves them from your own domain.

```js
// astro.config.mjs (add)
import { defineConfig, fontProviders } from "astro/config";
// ...
fonts: [
  {
    provider: fontProviders.fontsource(),
    name: "Noto Sans JP",
    cssVariable: "--font-sans",
    weights: [400, 500],
    styles: ["normal"],
    subsets: ["latin", "japanese"],      // (verify) subset names for this provider
    fallbacks: ["Hiragino Sans", "Hiragino Kaku Gothic ProN", "Yu Gothic", "Meiryo", "sans-serif"],
  },
  // Shippori Mincho → --font-serif-jp (400, 500)
  // Cormorant Garamond → --font-serif-en (400, 500; normal + italic; latin only)
],
```

Then:
- In `Base.astro`, add `import { Font } from "astro:assets"` and one `<Font cssVariable="…" />` per family.
- Add `preload` only on `--font-serif-en`. It's used for the big "Lumineglyph" hero text, and preloading Japanese slices would waste bandwidth.
- In `global.css`, point `--sans`, `--serif-jp` and `--serif-en` at the new variables.
- Remove the Google Fonts `<link>` tags.

**Japanese font slices.** Japanese fonts are huge. Google and Fontsource split them into about 100 slices by `unicode-range`, so a page downloads only the slices it uses. Check that this still happens after the build:
```sh
ls dist/_astro/fonts | wc -l        # expect many files for the JP families, not 1–2
du -sh dist/_astro/fonts
```
In devtools, Network → Font: a Japanese page should download maybe 10–30 small woff2 files, not several MB.

If Astro's Fonts API produces one large Japanese file, use the Fontsource npm packages directly instead. Add `npm i @fontsource/noto-sans-jp @fontsource/shippori-mincho @fontsource/cormorant-garamond`, then `import "@fontsource/noto-sans-jp/400.css"` and so on in `Base.astro`. Those CSS files already contain the sliced `@font-face` rules.

### C. SEO metadata

In `Base.astro`, driven by props and the i18n copy:

- `<title>` and `<meta name="description">` for each page and language.
- Canonical URL and language alternates:
  ```astro
  <link rel="canonical" href={new URL(Astro.url.pathname, Astro.site)} />
  <link rel="alternate" hreflang="ja" href={new URL(getRelativeLocaleUrl("ja", path), Astro.site)} />
  <link rel="alternate" hreflang="en" href={new URL(getRelativeLocaleUrl("en", path), Astro.site)} />
  <link rel="alternate" hreflang="x-default" href={new URL(getRelativeLocaleUrl("ja", path), Astro.site)} />
  ```
- Social share (Open Graph / Twitter) tags:
  - `og:title`, `og:description`, `og:url`, `og:type=website`
  - `og:image` as an absolute URL to a 1200×630 image
  - `og:locale` (`ja_JP` / `en_US`) and `og:locale:alternate`
  - `twitter:card=summary_large_image`
- `<meta name="theme-color">` for both themes, using `media="(prefers-color-scheme: …)"`.

Sitemap: `npx astro add sitemap`, then:
```js
sitemap({ i18n: { defaultLocale: "ja", locales: { ja: "ja-JP", en: "en" } } })
```

`public/robots.txt`:
```
User-agent: *
Allow: /
Sitemap: https://lumineglyph.com/sitemap-index.xml
```
Preview sites block search engines with a response header instead (step 07), so this file can stay the same everywhere.

`src/pages/404.astro`: a short bilingual "page not found" page with links to `/` and `/en/`. CloudFront serves it in step 05.

### D. Content Security Policy

A CSP tells the browser exactly which scripts and styles may run on the page. Astro (6.0 and later) can generate one as a `<meta>` tag that includes a hash of every script and style it outputs:

```js
// astro.config.mjs (add)  (verify) exact shape against the current config reference
security: {
  csp: {
    directives: [
      "default-src 'self'",
      "img-src 'self' data:",
      "font-src 'self'",
      "object-src 'none'",
      "base-uri 'none'",
      "form-action 'none'",
    ],
    scriptDirective: { resources: ["'self'"] },   // for bundled module scripts and /prefs.js (was /theme.js)
    styleDirective: { resources: ["'self'"] },
  },
},
```

How this fits with step 05:
- A `<meta>` CSP can't set `frame-ancestors`, which blocks other sites from embedding yours. CloudFront adds that as a response header in step 05.
- When a page has both a header CSP and a meta CSP, the browser enforces both. So the header must not include `script-src`, `style-src` or `default-src`; otherwise it would block the scripts the meta tag allows by hash. Step 05 is written that way.
- The CSP doesn't apply in `astro dev`. Test it with `npm run build && npx astro preview`.

### E. Accessibility: WCAG 2.2 AA

WCAG 2.2 level AA is the usual target. It's what Japan's JIS X 8341-3 and the EU accessibility rules point to. Lighthouse catches only part of it, so also check with axe DevTools (browser extension) and the keyboard.

Problems in the current design. Each one changes the design slightly, so **Moena decides the visual details**:

1. **Orange text is too faint in light mode.**
   - `#FF8A45` on the light backgrounds is about **2.1:1**. WCAG needs **4.5:1** for normal text and 3:1 for large text.
   - It affects the eyebrows, the Japanese hero heading, `.work-cat`, `.role`, the step numbers, the skills headings and the focus outline. A focus ring also needs 3:1 against the background.
   - Dark mode is fine at about 7.7:1.
   - **Fix:** add a `--accent-text` token. It stays `#FF8A45` in dark mode and becomes a deeper orange in light mode. For example, `#B54708` is 4.8–5.0:1 on both light backgrounds. Use it for orange *text*, and keep `--accent` for fills, lines and button backgrounds. The dark text on the orange button is already 6:1.
   - Lighthouse's contrast check fails on this, so it has to be fixed before step 03's CI thresholds can pass.
2. **Moving content needs a pause control** (WCAG 2.2.2, Pause, Stop, Hide).
   - The sun/moon orbit and the slideshow both move automatically for more than 5 seconds.
   - Honoring `prefers-reduced-motion` (already done) is good, but doesn't satisfy this rule by itself.
   - **Fix:** a small pause/play button in the left column that stops both. Remember the choice in `localStorage`. Also pause the slideshow while it's hovered or has keyboard focus.
3. **Skip link.** Add a "Skip to content" / 「本文へ移動」 link as the first focusable element. It's visually hidden until focused and points at `<main id="main">`.

Already good; keep them that way:
- landmarks (`header`, `nav`, `main`, `aside`)
- `aria-current` on the nav
- the `lang` attribute on each page
- `prefers-reduced-motion`
- focus rings
- button labels

Also check:
- Every image's alt text exists in both languages.
- Click targets are at least 24×24 CSS px (WCAG 2.5.8).
- The page works at 200% zoom.
- Windows High Contrast mode (`forced-colors: active`): the SVG line art uses `currentColor`, so it should adapt. Check it in devtools → Rendering.

## Checkpoint

**E, accessibility.**
- axe DevTools reports 0 issues on all four pages, in both themes.
- Using only the keyboard, you can reach every control, and the skip link and pause button work.
- Claude recomputes the contrast of the final light-mode accent text, which should be ≥ 4.5:1.

**A/B, weight.** Claude runs a build and reports:
- total `dist/` size
- the image formats used
- the number of font files and their total size
- the JS size

Then you check the Network tab on `/` and confirm no requests go to any other domain.

**C, metadata.**
- `npx astro preview`, then `curl -s localhost:4321/en/ | grep -E 'hreflang|canonical|og:'` shows the right absolute URLs.
- `dist/sitemap-index.xml` lists all four pages with language alternates.

**D, CSP.**
- View source shows `<meta http-equiv="content-security-policy" …>` with `sha256-` hashes.
- The devtools console has **no CSP violations** on `/`, `/en/`, `/works/`, `/en/works/` and `/404.html`, with the slideshow, menu and language switch all working.

**Lighthouse.** In Chrome devtools, check `/` and `/en/` with both the mobile and desktop presets. Targets:

| Category | Target |
|----------|--------|
| Performance | ≥ 95 |
| Accessibility | ≥ 95 (aim for 100) |
| Best Practices | ≥ 95 |
| SEO | 100 |

Write the scores in PROGRESS. CI enforces them from step 03 on.

## Commit

`feat(site): responsive images, self-hosted fonts, SEO metadata, CSP`. Separate commits are fine.

## ADR

Write `docs/adr/002-csp-strategy.md`: meta CSP with hashes generated by Astro, plus a CloudFront header for the directives a meta tag can't set, and why the two must not overlap.
