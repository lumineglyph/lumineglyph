# 09 — Portfolio polish

## Goal

The repo explains itself to a reviewer in five minutes. CLAUDE.md describes the new structure. The site links to the repo.

## Why it matters

Without the write-up, nobody sees the work. A reviewer will read a README and one or two ADRs; they won't read Terraform files.

## Steps

### A. Root README.md

Aim for one screen of essentials, then details:

1. **What it is**, in one line, plus the live URL.
2. **Architecture diagram.** Start from the mermaid diagram in [README.md](README.md) and update it to match what you actually built. GitHub renders mermaid.
3. **Highlights**, as a short list with numbers:
   - Lighthouse scores
   - securityheaders.com and Mozilla Observatory grades
   - DNSSEC (DNSViz screenshot or link)
   - "no long-lived credentials"
   - "build once, deploy the same artifact"
   - "per-PR previews"
   - monthly cost (about $2 plus the domain)
4. **Repo layout**, matching the tree in [README.md](README.md).
5. **Run locally:** `cd site && npm ci && npm run dev`.
6. **Editing content:** link to CONTRIBUTING.md.
7. **Runbooks:**
   - deploy
   - rollback (step 06 D)
   - DNSSEC undo order (step 08 C)
   - rotating nothing: there are no keys to rotate, and that's the point
8. **Decisions:** links to `docs/adr/`.

### B. ADRs

Check that ADRs 001–004 exist and say what you actually did. Each should take about a minute to read. Add more only where you made a real decision, for example "Previews via subdomain".

### C. Update CLAUDE.md

Rewrite CLAUDE.md for the new structure:
- `site/`, `infra/` and the workflows
- content files and how they're validated
- local commands
- the "never apply or push without asking" rules (they still apply after the tutorial)
- comments in English

Remove the sections that describe the old `index.html`/`works.js` setup and the snapshots. Remove the "rebuild in progress" pointer, or keep a single line pointing to `docs/rebuild/` as history.

### D. Make it visible

- Pin the repo on your GitHub profile. Your public contributions should already show if the repo is in an org you belong to.
- On the site's Team card, add a "GitHub" link for you, with copy in both `ja.json` and `en.json`. Moena's design decides where it goes.
- If you have a CV or LinkedIn, describe this project in one sentence that leads with the outcome. For example: "Bilingual studio site: Astro on S3/CloudFront via Terraform, OIDC deploys, per-PR previews, A+ security headers, Lighthouse 100."

## Stretch goals

Only if they interest you; none of them are needed.

- **Terraform in CI:**
  - `terraform plan` on PRs that touch `infra/**`, posted as a PR comment, using a read-only plan role (`ReadOnlyAccess` plus state bucket read).
  - `apply` on `main` behind an `infra` environment with you as required reviewer.
  - This is the most portfolio-relevant stretch.
- **GitHub settings as code** with the `integrations/github` provider (step 06's stretch).
- **Visual regression tests:** Playwright screenshots of the four pages × 2 themes × 2 widths, compared on PRs. This protects Moena's design from accidental CSS changes.
- **Uptime check:** a Route 53 health check plus an alarm (about $0.50–1/month), or a free external monitor.
- **CloudFront access logs** to S3 with a short retention period, if you want traffic numbers without client-side analytics.

## Checkpoint

Claude reads the README and ADRs as a stranger would and gives honest feedback: what's unclear, what's overclaimed, what's missing. Then mark the rebuild done in PROGRESS.
