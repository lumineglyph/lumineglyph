# Japanese source fonts

These are the full Japanese character sets of Shippori Mincho (weights 400 and 500), as WOFF2. The site never serves them directly. On every `astro dev` / `astro build`, [`integrations/subset-fonts.mjs`](../integrations/subset-fonts.mjs) subsets each weight to the characters of the Japanese headings set in it, read from `src/i18n/ja.json`. That brings about 1.4 MB per file down to about 7–12 KB. It writes the result to `src/generated/fonts/` (git-ignored).

Latin text uses the `@fontsource/*` latin files, imported in `src/layouts/Base.astro`.

| File | Source |
|------|--------|
| `shippori-mincho-japanese-{400,500}-normal.woff2` | Fontsource `shippori-mincho@5.3.0`, `japanese` subset |

Downloaded from `https://cdn.jsdelivr.net/fontsource/fonts/shippori-mincho@5.3.0/japanese-<weight>-normal.woff2`. The font is under the SIL Open Font License 1.1 (`OFL-shippori-mincho.txt`), which allows redistributing and subsetting it.

## Why body text uses the system font

Japanese fonts have thousands of glyphs, so they're large, and the usual fix of splitting a font into unicode-range slices doesn't help much, because the characters on a page are spread across most of the slices ([Web Almanac 2020](https://almanac.httparchive.org/en/2020/fonts)). On this site:

| Japanese fonts | Lighthouse mobile, `/` |
|----------------|------------------------|
| Fontsource slices of Noto Sans JP and Shippori Mincho | ~70 requests, ~950 KB |
| Build-time subsets of both, all characters on the site (4 × ~50 KB) | 85 |
| System body font, Shippori subset to the headings (2 files, 19 KB) | 98 |

So, like most current Japanese design systems and guides, the site uses the system font for body text and a small self-hosted subset only for fixed brand text such as headings:
- [Web Almanac 2025](https://almanac.httparchive.org/en/2025/fonts): sites that don't serve full CJK fonts "either use system fonts or serve a very limited subset for maybe a logo or heading".
- [ICS MEDIA (2026)](https://ics.media/entry/200317/) recommends a system font stack; its [Noto Sans JP guide](https://ics.media/entry/250718/) says that if display speed matters, `sans-serif` is enough.
- [SmartHR UI](https://github.com/kufu/smarthr-ui/blob/main/packages/smarthr-ui/src/smarthr-ui-preset.ts) uses `system-ui, sans-serif` for body text.
- [Nagashima (2026)](https://note.com/ngsm/n/na9662a22f9e6): self-host and statically subset fixed text such as headings and logos.

This changes little in practice. `--sans` still names "Noto Sans JP" first, and Windows 10/11 have shipped it since the April 2025 update. Android's default Japanese font is Noto Sans CJK JP, the same design. Apple devices show Hiragino Sans instead.

Incremental Font Transfer (a W3C Candidate Recommendation) would let browsers download only the glyphs a page needs from a full font. Revisit this once browsers ship it.
