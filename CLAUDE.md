# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Overview

Static marketing site for Lumineglyph, a bilingual (Japanese/English) web design and development studio. It is plain HTML, CSS and vanilla JS. There is no build step, package manager, linter or test suite. Code comments and most user-facing copy are in Japanese, so keep new comments in Japanese to match.

To preview, open `index.html` directly in a browser, or serve the folder (e.g. `python3 -m http.server`) and visit `http://localhost:8000/`.

## Rebuild in progress

Matthew is rebuilding the site using Astro, AWS and Terraform, following the tutorial in [docs/rebuild/](docs/rebuild/README.md). Before helping with anything related to the rebuild, read `docs/rebuild/README.md` (especially its "For Claude" section) and `docs/rebuild/PROGRESS.md`. In short: act as a tutor and reviewer, don't write the code for him unless he asks, and never apply, push or buy anything without his explicit go-ahead. New code comments in the rebuild are in English. Until step 01 finishes, the sections below still describe the files at the repo root.

## Live files vs. snapshots

- **Live:** `index.html` (top page), `works.html` (full works list), `style.css` (shared styles), `works.js` (shared works data and helpers), `assets/`.
- **Snapshots:** `index_v1.html` … `index_v7.html` and `index-light_v1.html` are earlier design iterations. Each one inlines its own `<style>` and does not use `style.css` or `works.js`. Don't edit them, and don't carry changes over to them, unless the user asks.

## Architecture

**Shared works data (`works.js`).** `WORKS` is the only source for portfolio entries. Each entry has `url`, `image`, and `title`/`category`/`desc` stored as `{ja, en}` objects. Both pages load this file before their own inline script and use `workCardHTML()` / `workImgHTML()` to render cards. The top page shows the first `TOP_WORKS` (4) entries and fills the remaining slots with empty frames. The left-column slideshow cycles through all entries in random order every 6s. If an image fails to load, its `<img>` is removed and a placeholder labeled with the site name shows instead. Work screenshots go in `assets/works/` at 16:9, about 1600×900.

**i18n.** Japanese is the default and is written directly into the HTML. Switching language replaces text at runtime:
- `index.html`: the inline `I18N = {ja, en}` dictionary. Elements are marked with `data-i18n="key"`, plus `data-i18n-alt` for alt text. A value containing `<br>` is set through `innerHTML`; any other value is set through `textContent`. When adding copy, add the key to both `ja` and `en`. Switching language keeps the reader at the same relative position in the section they are viewing.
- `works.html`: its own smaller `T` dictionary, with elements marked `data-t`.
- The language travels between pages as `?lang=en`. `pageLink()` in `works.js` builds these cross-page links and keeps `?lang` and `?theme`. `initialLang()` reads the language back from the URL.

**Theming.** Dark is the default. All colors are CSS variables on `:root` in `style.css`. Light mode turns on through `prefers-color-scheme: light` unless the page has `data-theme="dark"`. Adding `?theme=dark|light` to the URL forces a theme for comparison; a small inline script in each page's `<head>` sets `data-theme` from it. Logos come in white and black versions (`.on-dark` / `.on-light`), and the `--show-dark` / `--show-light` variables toggle which one is visible.

**Layout (`index.html`).** On desktop it uses three columns. A fixed left column holds the logo, an animated sun and moon orbit, and the works slideshow. The center column scrolls through the sections `#top`, `#about`, `#services`, `#works`, `#team`, `#process` and `#contact`, each marked with `data-nav`. The right column holds the nav. At 1199px and below, a mobile header and slide-out menu (`.m-header`, `#m-menu`) replace the side columns. The current-section highlight comes from scroll position (`currentSection()`), not IntersectionObserver. The sun, moon and orbit line art are inline SVG `<symbol>`s at the top of `<body>`, reused with `<use href="#g-…">`.

**Contact links.** `CONTACT_LINKS` sits at the top of the inline script in `index.html`. An empty value renders as a non-link item marked 準備中 / "Coming soon".
