// @ts-check
import { defineConfig } from "astro/config";
import sitemap from "@astrojs/sitemap";
import subsetFonts from "./integrations/subset-fonts.mjs";

export default defineConfig({
  site: "https://lumineglyph.com",
  trailingSlash: "always", // matches build.format "directory" and the CloudFront function in step 05
  build: { format: "directory" },

  i18n: {
    locales: ["ja", "en"],
    defaultLocale: "ja",
    routing: { prefixDefaultLocale: false }, // ja at /, en at /en/
  },

  integrations: [
    // Cuts the Japanese fonts in fonts/ down to the characters used in src/ (see fonts/README.md).
    subsetFonts(),
    // Lists every page with its other-language version as an hreflang alternate.
    sitemap({ i18n: { defaultLocale: "ja", locales: { ja: "ja", en: "en" } } }),
  ],

  vite: {
    plugins: [
      {
        // Fontsource lists a .woff fallback after every .woff2. Every browser this site supports
        // reads woff2, so drop the .woff entries rather than ship files no browser downloads.
        name: "fontsource-woff2-only",
        enforce: "pre", // before Vite's CSS plugin resolves the url()s
        transform(code, id) {
          if (!/@fontsource\/.+\.css$/.test(id)) return;
          return code.replace(/,\s*url\([^)]+\.woff\) format\('woff'\)/g, "");
        },
      },
    ],
    build: {
      // Never inline font files as data: URIs: it would bloat the CSS and need font-src data: in the CSP.
      assetsInlineLimit: (file) => (/\.(woff2?)$/.test(file) ? false : undefined),
    },
  },

  // Content Security Policy as a <meta> tag. Astro adds a sha256 hash for every script and
  // style it outputs, so nothing else can run. Directives a <meta> CSP can't carry
  // (frame-ancestors and friends) come from a CloudFront response header in step 05; that
  // header must not set script-src, style-src or default-src, or it would block these hashes.
  // See docs/adr/002-csp-strategy.md. The CSP isn't applied in `astro dev`; test with build + preview.
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
      scriptDirective: { resources: ["'self'"] }, // bundled module scripts and /prefs.js
      styleDirective: { resources: ["'self'"] }, // the bundled stylesheet
    },
  },
});
