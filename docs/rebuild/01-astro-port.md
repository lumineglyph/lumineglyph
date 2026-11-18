# 01 — Port the site to Astro

## Goal

An Astro project in `site/` that builds a fully static site. It produces four real pages:

| URL | Page |
|-----|------|
| `/` | Japanese home |
| `/en/` | English home |
| `/works/` | Japanese works list |
| `/en/works/` | English works list |

All content lives in JSON files that are checked at build time. Visually and behaviorally it matches the current site. At the end, the old root-level files are removed.

## Why it matters

- **English becomes visible to search engines.** Today English only exists after JavaScript runs, so search engines see a Japanese-only site.
- **Content mistakes fail the build instead of shipping.** A missing translation or a missing image stops the build, rather than showing up broken on the live site.
- **Much less JavaScript in the browser.** Rendering and translation move to build time. What's left in the browser is the slideshow, nav highlighting and the mobile menu.
- **Portfolio value.** Shows you picked the right-sized tool and know the trade-offs.

## Intended behavior changes

Everything else should match the current site exactly.

| Today | After |
|-------|-------|
| The JP/EN switch rewrites text in place and keeps the exact scroll position | The JP/EN switch is a link to the other language's page. JS adds the current section's `#hash`, so the reader lands at the same section. |
| `?lang=en` in the URL | `/en/` paths. The site was never deployed, so no old links need redirecting. |
| A missing work image shows a placeholder at runtime (`onerror`) | A missing image fails the build. The `onerror` attribute goes away, which the CSP in step 02 needs. |
| "View More" always shows | "View More" shows only when there are more works than fit on the top page (`TOP_WORKS`). |
| `?theme=` URL override, a tool for comparing designs | Removed. A visible System / Light / Dark switch replaces it, and the choice is remembered (see "Theme switch" in C). |
| Old design drafts `index_v*.html` at the root | Deleted. Git history keeps them. |

## Steps

### A. Scaffold

1. From the repo root, create the project. These flags were checked against create-astro 5.3.2 on 2026-11-14:
   ```sh
   npm create astro@latest site -- --template minimal --install --no-git --no-ai
   ```
   - `--no-git`: the repo already has git.
   - `--no-ai`: skips the AI agent files the template would add. The root `CLAUDE.md` already covers this repo.
   - There's no TypeScript question any more. Check that `site/tsconfig.json` extends `astro/tsconfigs/strict`.
2. Pin Node and set up type checking:
   ```sh
   cd site
   echo 24 > .nvmrc
   npm i -D @astrojs/check typescript@^6
   ```
   `@astrojs/check` 0.9 supports TypeScript 5 and 6 but not 7. TypeScript 7 is the new Go-based compiler.
3. Add these scripts to `package.json`:
   - `"check": "astro check"`
   - `"verify": "astro check && astro build"`
4. Replace the template's `astro.config.mjs` with the version below. Later steps add more settings to this same file (fonts, CSP and the sitemap in step 02).
   ```js
   // @ts-check
   import { defineConfig } from "astro/config";

   export default defineConfig({
     site: "https://lumineglyph.com",
     trailingSlash: "always",          // matches build.format "directory" and the CloudFront function in step 05
     build: { format: "directory" },
     i18n: {
       locales: ["ja", "en"],
       defaultLocale: "ja",
       routing: { prefixDefaultLocale: false },  // ja at /, en at /en/
     },
   });
   ```
5. Make sure `.astro/`, `dist/` and `node_modules/` are ignored. The template's `.gitignore` should already cover them.

### B. Content model

This is where Moena will edit, so lay it out to be easy to read.

```
site/src/content/works/mommienglish.json     one file per work
site/src/content/works/mommienglish.jpg      its screenshot, 16:9, about 1600×900
site/src/i18n/ja.json                        all Japanese page copy, nested by section
site/src/i18n/en.json                        all English page copy, same shape
site/src/i18n/index.ts                       loads both, checks they match
site/src/data/site.json                      contact links and other settings
```

**Works collection.** Put this in `site/src/content.config.ts`:

```ts
import { defineCollection } from "astro:content";
import { glob } from "astro/loaders";
import { z } from "astro/zod";

const localized = z.object({ ja: z.string().min(1), en: z.string().min(1) });

const works = defineCollection({
  loader: glob({ base: "./src/content/works", pattern: "*.json" }),
  schema: ({ image }) =>
    z.object({
      order: z.number().int(),   // collection order isn't guaranteed, so sort by this
      url: z.url(),
      image: image(),            // build fails if the file is missing
      title: localized,
      category: localized,
      desc: localized,
    }),
});

export const collections = { works };
```

Notes:
- `image()` resolves paths relative to the JSON file, like `"./mommienglish.jpg"` (checked on Astro 7.4.12). A missing file only fails the build once a page actually renders the image, not when the collection syncs.
- The order of `getCollection("works")` isn't guaranteed. Always `.sort((a, b) => a.data.order - b.data.order)`.

A work file:

```json
{
  "$schema": "../../../.astro/collections/works.schema.json",
  "order": 1,
  "url": "https://mommienglish.com/",
  "image": "./mommienglish.jpg",
  "title": { "ja": "MommiEnglish", "en": "MommiEnglish" },
  "category": { "ja": "ホームページ制作", "en": "Website" },
  "desc": { "ja": "…", "en": "…" }
}
```

Astro generates a JSON Schema for each collection in `site/.astro/collections/`. The `$schema` line gives anyone editing in VS Code autocomplete and red squiggles for mistakes.

**Page copy.** Move the `I18N` dictionary from `index.html` and the `T` dictionary from `works.html` into `ja.json` and `en.json`. Also move `WORK_TEXT` from `works.js` into the same files.

- **Nest the keys by section**: `hero.title`, `about.points[0].title`, `nav.top`, and so on. The current flat keys like `about1T` are hard for an editor to find.
- **Use `\n` for line breaks**, not `<br>`. A small component turns them into `<br>`. That way no content is ever injected as raw HTML, and you never need `set:html`.

`site/src/i18n/index.ts`:

```ts
import ja from "./ja.json";
import en from "./en.json";

// Type-level check: `astro check` fails if either file lacks a key the other has.
en satisfies typeof ja;
ja satisfies typeof en;

export const copy = { ja, en };
export type Lang = keyof typeof copy;
```

`site/src/components/Lines.astro`:

```astro
---
interface Props { text: string }
const lines = Astro.props.text.split("\n");
---
{lines.map((line, i) => <>{i > 0 && <br />}{line}</>)}
```

**Site settings.** `site/src/data/site.json` holds `contact: { inquiry, linkedin, coconala }`, the same as `CONTACT_LINKS` today. An empty string still means "Coming soon". Also put `topWorks: 4` here.

### C. Layout, pages and components

Suggested structure (split it however you like):

```
src/layouts/Base.astro          <html lang>, <head> (title, description, fonts), theme script, SVG sprite, global CSS
src/components/Sprite.astro     the hidden <svg> with the <symbol>s (g-sun, g-moon, …)
src/components/MobileHeader.astro, MobileMenu.astro, LeftColumn.astro, RightNav.astro
src/components/LangSwitch.astro
src/components/sections/{Hero,About,Services,Works,Team,Process,Contact}.astro
src/components/WorkCard.astro
src/components/Home.astro       takes a `lang` prop and composes everything
src/pages/index.astro           <Home lang="ja" />
src/pages/en/index.astro        <Home lang="en" />
src/pages/works.astro           and src/pages/en/works.astro
```

**Language links.** Use the helpers from `astro:i18n`:

```astro
---
import { getRelativeLocaleUrl } from "astro:i18n";
interface Props { lang: "ja" | "en"; path: string }  // path: "" for home, "works/" for works
const { lang, path } = Astro.props;
---
<div class="lang" role="group" aria-label="Language">
  <a href={getRelativeLocaleUrl("ja", path)} hreflang="ja" lang="ja" aria-current={lang === "ja" ? "page" : undefined}>JP</a>
  <span class="sep" aria-hidden="true">/</span>
  <a href={getRelativeLocaleUrl("en", path)} hreflang="en" lang="en" aria-current={lang === "en" ? "page" : undefined}>EN</a>
</div>
```

The current CSS styles `.lang button[aria-pressed="true"]`. Update those selectors to `.lang a[aria-current="page"]`, and make sure the link looks exactly like the old button.

**CSS.**
- Copy `style.css` to `src/styles/global.css` unchanged and import it in `Base.astro`.
- Move the `<style>` block from `works.html` to `src/styles/works.css` and import it in the works pages.
- Keep the CSS global rather than Astro's scoped styles. It's already organized by class, and scoping would change specificity and risk visual differences.

**Remove inline `style="…"` attributes** now. Step 02's CSP blocks them. There are two:
- the sprite `<svg style="position:absolute">`: use a class instead
- `style="stroke-width:1.7px"` inside the `g-sun-fill` symbol: use a class or a `stroke-width` attribute

**Theme switch** (decided 2026-11-14; it replaces `?theme=`). This is the usual pattern:

- **Default: follow the operating system** (`prefers-color-scheme`). The CSS already does this.
- **A visible three-way switch, System / Light / Dark,** next to JP/EN in the right column and the mobile header. Moena designs how it looks. The existing CSS already handles all three states:
  - no attribute → follow the OS
  - `data-theme="light"` → force light
  - `data-theme="dark"` → force dark
- **Remember the choice** in `localStorage` under the key `theme`, with the value `"light"` or `"dark"`. No key means System. Wrap every storage access in `try/catch`, since storage can be blocked.
- **No flash of the wrong theme.** `public/theme.js` reads the saved choice and sets `data-theme` before the page first renders. Load it in `<head>` as `<script is:inline src="/theme.js"></script>`. It must be a blocking classic script, and `is:inline` stops Astro from bundling it.
- **Accessible markup:** the same shape as the language switch.
  - A `role="group"` with a translated `aria-label` (`表示テーマ` / `Theme`).
  - Three `<button type="button" aria-pressed="…">`. Each has visible text, or an icon plus visually hidden text in both languages.
  - Buttons give keyboard and screen-reader support for free.
- **Without JavaScript,** the switch can't work. Render it with `hidden`, and have the script that wires it up remove `hidden`. A control that does nothing is worse than no control.
- The wiring goes in `src/scripts/theme-switch.ts` (bundled):
  - on click: set or remove `data-theme`, update `aria-pressed`, save the choice
  - when the choice is System: listen for OS theme changes so `aria-pressed` stays correct

**Client scripts.** Put each in `src/scripts/*.ts` and pull it in from the component that needs it with `<script>import "../scripts/x.ts";</script>`. Astro bundles these as modules.
- `slideshow.ts`: the slides are rendered at build time, so this only shuffles and rotates `.slide.is-active` every 6s. Keep the `document.hidden` check and the "don't repeat the same slide across a reshuffle" logic.
- `nav.ts`: `currentSection()`, the scroll/resize highlight, and on click of a `.lang a`, `link.hash = currentSection().id`.
- `menu.ts`: the mobile menu. Keep the Escape key handling, focus return and the 1199px breakpoint reset.

**Images.** Move `assets/` into `site/src/assets/`. Use Astro's `<Image />` for now; step 02 switches to `<Picture />` with AVIF/WebP.

### D. Check it matches the current site

Claude already compared full-page screenshots of the old and new sites (1440px and 390px, both themes, ja and en). It also tested the theme switch, nav highlight, language hash, mobile menu and works counts in headless Chrome, and all passed. This part is your own look with real eyes and hands, so follow it exactly.

**Expected differences.** Everything else should be identical:
- three small icons (System / Light / Dark) next to JP/EN, in the works page header, and at the bottom of the mobile menu
- no "View More" button under the works grid, so everything below it sits about 106px higher
- JP/EN links go to `/en/…` URLs instead of adding `?lang=en`

**1. Start both sites.** Use two terminals, both starting from the repo root.

Terminal 1, the old site. The root copy can't show the work screenshots any more, because part B moved them, so use the first commit:
```sh
git worktree add ../lumineglyph-legacy a1be813
cd ../lumineglyph-legacy && python3 -m http.server 8000
```
Terminal 2, the new site:
```sh
cd site && npm run build && npx astro preview
```
Leave both running. If a port is already in use, find the process with `ss -ltnp | grep -E '8000|4321'` and stop it.

**2. Open two browser windows side by side.** Open Chrome devtools in both (F12), then device mode (Ctrl+Shift+M). Set the size in the toolbar at the top to **1440 × 900**.

**3. Compare these four page pairs** (old on the left, new on the right). For each pair, scroll slowly from top to bottom.

| Old (port 8000) | New (port 4321) |
|---|---|
| `localhost:8000/` | `localhost:4321/` |
| `localhost:8000/?lang=en` | `localhost:4321/en/` |
| `localhost:8000/works.html` | `localhost:4321/works/` |
| `localhost:8000/works.html?lang=en` | `localhost:4321/en/works/` |

- [ ] 1440 × 900: all four pairs match, apart from the expected differences
- [ ] Change the size to **390 × 844** and do the four pairs again

**4. Themes.** Do this in the new site at 1440 × 900.
- [ ] Click the sun icon: the page turns light. On the old site, `localhost:8000/?theme=light` should look the same.
- [ ] Press F5 to reload. The page is still light, and there's no dark flash first.
- [ ] Click "JP"/"EN" and the works page links. The page stays light everywhere.
- [ ] Click the moon icon: dark. Compare with `localhost:8000/?theme=dark`.
- [ ] Click the half-circle icon (System). In devtools, open ⋮ → More tools → Rendering, then switch "Emulate CSS media feature prefers-color-scheme" between light and dark. The page follows it.

**5. Desktop behaviour** (new site, 1440 × 900, `localhost:4321/`):
- [ ] The sun and moon circle the slideshow. Wait 6s: the screenshot cross-fades to the other work.
- [ ] Scroll down: the right-hand nav's highlight (orange sun, line) moves to each section as you reach it.
- [ ] Scroll to **Team** and click **EN**. You land on `/en/#team` at the Team section. Click **JP** and you're back at Team on `/#team`.

**6. Mobile behaviour** (new site, 390 × 844, `localhost:4321/`):
- [ ] Tap the round ☰ button: the menu opens and the page behind it can't scroll. The theme icons are at the bottom.
- [ ] Press Escape: the menu closes, and the ☰ button has the orange focus ring.
- [ ] Open the menu again, then change the size to 1440 wide. The menu is gone. Change back to 390: it's still closed.
- [ ] Open the menu and tap "Team": the menu closes and the page scrolls to Team.

**7. Content.**
- [ ] Works: 2 works with screenshots plus 2 empty dashed frames, and no "View More".
- [ ] `/works/` and `/en/works/` say "2 Works".
- [ ] Contact: "お問い合わせフォーム" opens the Google Form in a new tab. LinkedIn and ココナラ show 準備中 (and "Coming soon" on `/en/`) and aren't links.

**8. Reduced motion.** In devtools Rendering, set "Emulate CSS media feature prefers-reduced-motion" to **reduce** and reload.
- [ ] The sun stays at the upper left and the moon at the lower right, not moving.
- [ ] The slideshow still changes every 6s, but without the fade. The old site does the same.

**9. Keyboard.** Close device mode, click the address bar, then press Tab repeatedly.
- [ ] The focus order matches the old site, plus the three theme buttons right after JP/EN. Every focused item has an orange outline.
- [ ] In the Elements panel, the nav link for the section on screen has `aria-current="true"`.

**10. When everything is ticked, clean up.** Stop both servers (Ctrl+C), then from the repo root:
```sh
git worktree remove ../lumineglyph-legacy
git rm -r index.html works.html style.css works.js assets index_v*.html index-light_v1.html
git commit -m "chore: remove legacy static site"
```
Moena agreed to deleting the snapshots on 2026-11-14, and git history keeps everything. `site/src/assets/` already has copies of every file in `assets/`.

If anything doesn't match, note the page, the size, the theme and what's different, and tell Claude.

## Checkpoint

**A, scaffold.** `cd site && npm run check && npm run build` has 0 errors, and `dist/index.html` exists. `dist/en/index.html` only appears once C adds the English pages.

**B, content model.** Claude checks that the build-time validation actually works by temporarily breaking things, then restoring them:
- delete a key from `en.json` → `npm run check` fails
- point a work's `image` at a file that doesn't exist → `npm run build` fails. This test only works once C has a page rendering the works, so run it again at checkpoint C.
- set `url` to `"not a url"` → build fails

**C, built HTML.**
- `grep -L 'lang="en"' dist/en/**/*.html` prints nothing.
- No `onerror=` and no `style="` in `dist/**/*.html`.
- The JS is small. Claude reports the total size. Astro inlines small scripts as `<script type="module">` in each page instead of writing `dist/_astro/*.js`, so measure the inline scripts.

**D, parity.** You go through the checklist above. Claude reviews the components for leftovers from the old JS-rendering approach.

## Commit

Use a PR from `rebuild/01-astro-port` with focused commits, for example:
- `feat(site): scaffold Astro project`
- `feat(site): works collection and i18n copy files`
- `feat(site): port home and works pages`
- `chore: remove legacy static site`

## ADR

Write `docs/adr/001-astro-static-site.md` (Context / Decision / Consequences, under a page). Cover:
- why Astro rather than Next.js, Nuxt or keeping vanilla JS
- why a static build
- why the copy is in JSON
- the trade-off: a build step instead of none

## Notes for Claude

- Astro 7 is likely newer than your training data. When an API surprises you, fetch the current docs page before suggesting a fix.
- `en satisfies typeof ja` only catches missing keys, not empty strings. That's intentional: some English nav subtitles are deliberately `""`.
- Watch for leftovers from the runtime-i18n approach (`data-i18n` attributes, `innerHTML`), and for scoped `<style>` blocks that would change specificity.
