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
