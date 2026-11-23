// Accessibility check of the built site (dist/) in both themes, at desktop and phone widths.
// Lighthouse in CI only sees the light theme, because the runner has no dark-mode setting.
// Here Playwright sets prefers-color-scheme for each run, and axe-core fails on any WCAG 2.2 A/AA violation.
// Uses the Chrome already installed on the machine (GitHub's Ubuntu runners have it), so nothing to download.
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import { chromium } from "playwright-core";
import { AxeBuilder } from "@axe-core/playwright";

const DIST = new URL("../dist/", import.meta.url).pathname;
const PAGES = ["/", "/en/", "/works/", "/en/works/", "/404.html"];
const THEMES = ["light", "dark"];
const VIEWPORTS = { desktop: { width: 1280, height: 800 }, phone: { width: 390, height: 844 } };
const TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];
const TYPES = {
  ".html": "text/html", ".css": "text/css", ".js": "text/javascript", ".svg": "image/svg+xml",
  ".woff2": "font/woff2", ".avif": "image/avif", ".webp": "image/webp", ".jpg": "image/jpeg",
  ".png": "image/png", ".ico": "image/x-icon", ".xml": "application/xml", ".txt": "text/plain",
};

// A minimal static server for dist/: "/en/" serves "/en/index.html", like CloudFront does.
const server = createServer(async (req, res) => {
  let path = normalize(decodeURIComponent(new URL(req.url, "http://x").pathname));
  if (path.endsWith("/")) path += "index.html";
  try {
    const body = await readFile(join(DIST, path));
    res.writeHead(200, { "content-type": TYPES[extname(path)] ?? "application/octet-stream" });
    res.end(body);
  } catch {
    res.writeHead(404).end();
  }
});
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const base = `http://127.0.0.1:${server.address().port}`;

const browser = await chromium.launch({ channel: "chrome" });
let failures = 0;
for (const [name, viewport] of Object.entries(VIEWPORTS)) {
  for (const colorScheme of THEMES) {
    const context = await browser.newContext({ viewport, colorScheme, reducedMotion: "reduce" });
    const page = await context.newPage();
    for (const path of PAGES) {
      await page.goto(base + path, { waitUntil: "load" });
      const { violations } = await new AxeBuilder({ page }).withTags(TAGS).analyze();
      const label = `${path} ${colorScheme} ${name}`;
      if (violations.length === 0) {
        console.log(`ok    ${label}`);
        continue;
      }
      failures += violations.length;
      console.log(`FAIL  ${label}`);
      for (const v of violations) {
        console.log(`      ${v.id} (${v.impact}): ${v.help}`);
        for (const node of v.nodes.slice(0, 3)) console.log(`        ${node.target.join(" ")}`);
      }
    }
    await context.close();
  }
}
await browser.close();
server.close();

if (failures > 0) {
  console.error(`\n${failures} accessibility violation(s).`);
  process.exit(1);
}
console.log("\nNo accessibility violations.");
