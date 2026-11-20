# Rebuild progress

Claude keeps this file up to date as checkpoints pass. If it disagrees with the repo, the repo wins; fix this file.

- **Last updated:** 2026-11-19
- **Current step:** 05 — Hosting (in progress on `rebuild/05-hosting`; A applied 2026-11-20. Next: A.3 commit, then B). Step 04 merged (PR #4, `d14efc7`). ADR-003 reworded by Matthew and committed in `8126c75`. The stuck `.github/dependabot.yml` check on the merge (also on `74ba8e7`) is Dependabot's own and not required; ignore it. **Step 04 G (move the domain into `lumineglyph`) from 2026-12-03 22:12 JST.**

## Steps

| # | Step | Status | Notes |
|---|------|--------|-------|
| 00 | Prep | Done (2026-11-14) | Org and transfer done; SSO login; no IAM users; root MFA on with no root keys; 2FA required in the org. Commits use the GitHub no-reply email. Registrar: Route 53 |
| 01 | Astro port | Done (2026-11-15, PR #1) | Astro 7.4.12, @astrojs/check 0.9.12, TypeScript 6.0.3, Node 24. B: Claude moved the copy into JSON at Matthew's request. C: Claude wrote it at Matthew's request. `astro check` 0 errors; the en pages have `lang="en"`; no `style=`/`onerror=`; a missing work image fails the build (`ImageNotFound`). JS: home 2.7 KB (1.2 KB gzipped), works 0.7 KB, plus `theme.js` 0.5 KB (renamed `prefs.js` in step 02). Screenshot diff vs the old site: identical apart from the expected differences. 36 headless-Chrome behaviour checks pass; the only console error is the missing favicon (step 02). D: Matthew's side-by-side check matched (only "View More" is gone, as intended); old root files and snapshots removed |
| 02 | Performance, SEO, CSP, accessibility | Done (2026-11-16, PR #2) | Matthew handed this step to Claude. Images: AVIF + WebP `<picture>`. Fonts: 8 woff2, 180 KB in total, all self-hosted; body text uses the system font; Japanese headings use Shippori Mincho subset at build time (400: 63 characters, 12 KB; 500: 32 characters, 7 KB). Headless Chrome confirms every Japanese heading glyph comes from the subsets. JS unchanged plus `motion.ts`. CSP meta with hashes on all 5 pages; an injected inline script is blocked. axe-core: 0 violations on all 5 pages in both themes. 58 headless-Chrome checks pass. Lighthouse 12.2.1 (gzip server; preview has no compression), all four categories: mobile `/` 98/100/100/100 (85 before the font change), `/en/`, `/works/` and `/en/works/` 100/100/100/100; desktop `/` and `/en/` 100/100/100/100 |
| 03 | CI | Done (2026-11-18, PR #1 in the new repo) | H: the broken link failed CI at "Check internal links" (both home pages), the PR couldn't be merged, and the revert went green. I: merged with the noreply address; the push to `main` ran green; Dependabot's first checks of npm and GitHub Actions succeeded. Its first PR (TypeScript 7, #2) failed `npm ci`, because `@astrojs/check` 0.9.12 only allows TypeScript 5/6. Major TypeScript updates are now ignored in `dependabot.yml` until it supports 7. G: the ruleset (see Decisions). F, checked by Claude: run 44202945869 is green, and every step did real work. astro check: 0 errors. html-validate passed. lychee: 397 links, 0 errors. Lighthouse: 12 runs, all four pages 100/100/100/100, TBT 0; the Japanese home page's layout takes 199 ms in CI. The `site-dist` artifact was uploaded (1.7 MB). All four actions are pinned to full SHAs with version comments, top-level `permissions` is `contents: read`, and zizmor reports no findings. | A, checked by Claude through the API: the history was rewritten into new repo `1460696603`; every commit uses a noreply address; the old commit SHAs aren't reachable from the new repo, and `lumineglyph-archive` (private, archived) returns 404 when logged out. The repo is public. Enabled: Dependabot alerts and security updates, secret scanning with push protection, private vulnerability reporting. Actions: only GitHub-owned actions plus `lycheeverse/lychee-action@*`, SHA pinning required, workflow token read-only and can't approve PRs, approval needed for all external contributors' PR runs |
| 04 | AWS foundation | Done (2026-11-19, PR #4) except G (from 2026-12-03) and ADR-003 | **Merged** as `d14efc7`. The email fix was folded into the original commit (now `c9f662c`) before merging; the address is in no commit on `main`. On the merge, Dependabot's first Terraform check succeeded. **Checkpoint (Claude, 2026-11-19, PR #4, `build` green):** `plan` reports no changes in both stacks. State bucket: versioning on, all four public-access blocks, HTTPS-only policy, AES256, `BucketOwnerEnforced`. Domain (management account until G): auto-renew on, `clientTransferProhibited`, privacy on for all four contacts, name servers match `terraform output name_servers`. The management account has no hosted zones. `dig NS` returns the Terraform zone's four servers. Certificate `ISSUED` for all three names. Budget: ACTUAL 80% and FORECASTED 100%. `git ls-files infra` has no state, tfvars or plan files. **D (rewritten 2026-11-19):** zone `Z00567272MES5QFM0F0BM` created by Terraform in `lumineglyph`. The domain was registered in the management account 2026-11-19 22:12 JST; name servers updated 22:18; the auto-created zone `Z08090113NH0413IPY2LC` deleted within 12 hours. Registrant email verified; expires 2027-11-19. The transfer lock was off after registration, so D.6b turned it on (Route 53 and the Verisign registry both show it). **E:** certificate `29ea34ed-…` in us-east-1, RSA-2048, all three validations `SUCCESS` through three CNAMEs; valid until 2027-06-05 (~200 days, the current CA/Browser Forum limit); renewal `INELIGIBLE` until step 05 attaches it to CloudFront. **Found during the checkpoint:** Claude had put the member account's real email address in the step file's section 0 example (commit `5d34496`, pushed to the public branch); replaced with a placeholder. Before you start, checked 2026-11-18 in the management account: `lumineglyph.com` available at $16 to register and $16 to renew; no hosted zones or domains; one budget there, `org-monthly-total` ($20/month, 4 alerts). Section 0, checked 2026-11-18: `lumineglyph` member account `421803180949` created 15:22 JST (`JoinedMethod` `CREATED`, `ACTIVE`). Root user credentials "Not present" (Matthew, IAM console). `lumineglyph` profile → SSO `AdministratorAccess` in the new account. New account: no hosted zones, domains, domain operations or budgets; no SCPs on the root or the account. The availability check from the new account returned `DONT_KNOW` 4 times; from the management account it's `AVAILABLE`, and the `.com` servers return NXDOMAIN. That's probably because Route 53 Domains hasn't finished activating in the new account. A (checked by Claude): 7 resources; state migrated to `bootstrap/terraform.tfstate` (12,984 bytes, same as the local backup); the bucket passes all five checkpoint checks; commit `b4d67cb`. B: budget `lumineglyph-monthly` with ACTUAL > 80% and FORECASTED > 100% of $5; `main/terraform.tfstate` in the bucket; commit `726d243`. C: commit `a88db6e`. `plan` reports no changes in both stacks; `git ls-files infra` lists no state or tfvars. **D blocked:** at 19:05 JST, 3 h 44 min after the account was created, Route 53 Domains in the new account answered `DONT_KNOW` for every name (`lumineglyph.com`, `google.com`, a random name), and `get-domain-suggestions` returned nothing. The management account still says `AVAILABLE`. So the account's domain service isn't working yet; the name is fine. Permissions ruled out (Claude, 2026-11-18): the permission set has only `AdministratorAccess`, no inline policy or boundary; SCPs aren't enabled on the organization root, and there are no RCPs; IAM's simulator allows all `route53domains` and `route53` actions for D, E and step 08, plus `support:CreateCase`. Matthew opened a free Account and billing support case (Domains → Registration Issue); no reply after about 20 hours. 2026-11-19: Matthew added a card to the member account's payment preferences, with no effect. `workloads-dev` (a member account created 2026-10-24, no card of its own) returns `AVAILABLE`, so member accounts can use Route 53 Domains. At 16:09 JST, 24 h 47 min after the account was created, `lumineglyph` still returned `DONT_KNOW` for every name. Cause unknown; it seems tied to how new the account is. AWS docs: a domain can't move between AWS accounts in its first 14 days, and the receiving account has 3 days to accept |
| 05 | Hosting | In progress (A done 2026-11-20) | Docs commit `8126c75` (ADR-003 + step file). **A (checked by Claude, 2026-11-20):** plan 6 to add, existing resources no-op; applied. Bucket `lumineglyph-site-732887` in `ap-northeast-1`: versioning on, lifecycle `expire-old-versions` (noncurrent 30 days, abort multipart 7 days), AES256, all four public-access blocks, `BucketOwnerEnforced`, default tags; no bucket policy yet (comes in E); empty. `plan` reports no changes after apply. |
| 06 | Deploy pipeline | Not started | |
| 07 | Previews | Not started | |
| 08 | Hardening | Not started | |
| 09 | Portfolio | Not started | |

Status values: Not started / In progress (checkpoint X) / Done (date).

## Values

Fill these in as they're created. Nothing here may be secret, because the repo will be public.

| Name | Value |
|------|-------|
| GitHub repo (owner/name) | `lumineglyph/lumineglyph` (org on the Free plan, owned by a business; owners: Ged-Miner, moena-miner) |
| GitHub owner ID / repo ID | `356493958` / `1460696603` (new repo from step 03 A.2; the old repo, now `lumineglyph-archive`, was `1454809896`) |
| OIDC `sub` format in use | (check in step 06; the repo is no longer a transferred one after step 03 A.2, so don't assume the ID-based format) |
| AWS account | `421803180949` (`lumineglyph`, member account in organization `o-ec0jf99uep`; created 2026-11-18, no root credentials) |
| AWS management account | `658606186432` ("Ged Miner"); used only for Organization and billing work |
| AWS CLI profile names | `lumineglyph` → the member account; `ged-management` → the management account. Both use IAM Identity Center, the `AdministratorAccess` permission set and the SSO session `lumineglyph` |
| AWS main region | `ap-northeast-1` (profile default) |
| Domain | `lumineglyph.com` (planned, not yet bought) |
| Registrar | Route 53 (`.com` costs $16/yr to register and $16/yr to renew, checked 2026-11-14) |
| Route 53 hosted zone ID | `Z00567272MES5QFM0F0BM` (public, in `lumineglyph`; name servers `ns-34.awsdns-04.com`, `ns-709.awsdns-24.net`, `ns-1144.awsdns-15.org`, `ns-1842.awsdns-38.co.uk`) |
| Domain registered | 2026-11-19 22:12 JST, in the management account (`REGISTER_DOMAIN` `b8f09456-…` SUCCESSFUL). G can start from **2026-12-03 22:12 JST** |
| Terraform state bucket | `lumineglyph-tfstate-647cc5` (`ap-northeast-1`, in `421803180949`; keys `bootstrap/terraform.tfstate`, `main/terraform.tfstate`) |
| Site bucket | `lumineglyph-site-732887` (`ap-northeast-1`, in `421803180949`) |
| ACM certificate (us-east-1) | `arn:aws:acm:us-east-1:421803180949:certificate/29ea34ed-bf54-4b81-a799-52871db2668d` (apex, `www`, `*.preview`) |
| Site bucket | |
| Site CloudFront distribution ID | |
| Previews bucket | |
| Previews CloudFront distribution ID | |
| Production deploy role ARN | |
| Preview deploy role ARN | |

## Decisions

Use one line per decision, with the date, and link the ADR if there is one.

- 2026-11-13: Astro (static output) for the site, not Next.js or vanilla JS. ADR-001 to be written in step 01.
- 2026-11-13: CSP as a meta tag with hashes generated by Astro, plus a CloudFront header for `frame-ancestors` and similar directives. ADR-002 to be written in step 02.
- 2026-11-13: Host on S3 + CloudFront, managed with Terraform. Not Netlify or Cloudflare Pages, because the AWS setup is part of the portfolio. ADR-003 to be written in step 04.
- 2026-11-13: A preview site per PR on its own subdomain, from a separate bucket. ADR-004 to be written in step 07.
- 2026-11-13: Moena edits content as JSON through GitHub's web editor, with a preview site for each pull request.
- 2026-11-13: New code comments are in English.
- 2026-11-14: Move the repo to a `lumineglyph` GitHub org and make it public (Moena agreed).
- 2026-11-14: Register the domain with Route 53 rather than Namecheap, so the registration settings live in Terraform (step 04). The cost is the same $16/yr at renewal.
- 2026-11-14: The `lumineglyph` org is owned by a business, on the Free plan, with 2FA required. Both Matthew and Moena are owners.
- 2026-11-14: Delete the old design drafts (`index_v*.html`, `index-light_v1.html`) at the end of step 01. Git history keeps them.
- 2026-11-14: Accessibility target is WCAG 2.2 AA in both themes.
- 2026-11-14: Replace the `?theme=` override with a System / Light / Dark switch saved in localStorage (step 01 C). Recommended by Claude; Matthew asked for the industry-standard approach. Moena designs how it looks.
- 2026-11-15: Matthew runs every git and gh command that changes anything (commits, branches, pushes, PRs, merges). Claude leaves changes uncommitted and says when a step is ready.
- 2026-11-16: Japanese body text uses the system font. Shippori Mincho stays as a web font for the Japanese headings, subset at build time per weight to the heading text. This is what current guides and design systems do (sources in `site/fonts/README.md`). It took Lighthouse mobile on `/` from 85 to 98 without lowering the 95 target. Matthew chose it over (a) a lower threshold for `/` and (b) subsetting every face per weight.
- 2026-11-18: `main` ruleset (ID `27506455`): a PR is required (0 approvals), the `build` check from GitHub Actions is required, deletion and force pushes are blocked, and nobody can bypass it.
- 2026-11-18: Lumineglyph gets its own AWS member account, `lumineglyph`, instead of using the Organization's management account. Reasons: the budget then counts only Lumineglyph, the GitHub deploy role stays away from the Organization's controls, and SCPs can apply. Profiles: `lumineglyph` for the member account, `ged-management` for the management account. Recommended by Claude.
- 2026-11-19: Buy `lumineglyph.com` in the management account and move it to `lumineglyph` after the 14-day lock (step 04 G). The `lumineglyph` account's Route 53 Domains still answered `DONT_KNOW` after 25 hours, and support hadn't replied. Matthew chose this over waiting. The hosted zone lives in `lumineglyph` from the start, created by Terraform rather than imported.
- 2026-11-17: Rewrote the history so every commit uses a noreply address, with Matthew's commits under "Ged Miner", and moved it to a fresh repo (step 03 A.2). A force push couldn't have cleaned GitHub's read-only PR refs. The old repo is `lumineglyph-archive` (private). Email privacy is on for both GitHub accounts.

## Deviations from the tutorial

Log anything done differently from the step files, and why.

- 2026-11-15, whole tutorial: Matthew found the step files too vague to follow. Before he starts a step, Claude turns it into exact numbered instructions (files, code, commands, checks). Step 01 D has been rewritten that way, and so has all of step 03 (2026-11-16).
- 2026-11-16, 03 (planned, changes from the original step file):
  - Lighthouse CI audits the four pages explicitly, 3 runs each, with performance judged on the median run. The default would judge the best run.
  - Accessibility, best practices and SEO must be 100, since they already are and don't vary between runs. Performance stays at 95.
  - The dev dependencies are pinned to the newest releases at least 7 days old (`html-validate@11.21.0`, `@lhci/cli@0.16.0`), to match Dependabot's cooldown.
  - The repo settings only allow GitHub's own actions plus `lycheeverse/lychee-action`, and require SHA pinning.
  - The runner is `ubuntu-24.04` rather than `ubuntu-latest`.
  - A.2 adds a history rewrite (author emails to noreply, Matthew's name to "Ged Miner") pushed to a fresh repo, because a force push can't clean GitHub's read-only `refs/pull/*`. Commit hashes change: `9233aa2` → `a1be813`.
- 2026-11-20, 05 (rewritten as exact steps, changes from the original step file):
  - The bucket is filled *before* the distribution and DNS exist, so the site goes live complete.
  - The 404 page path is `/404.html` (what Astro actually builds), not `/404/index.html`.
  - TLS policy `TLSv1.2_2025` instead of `TLSv1.2_2021`.
  - The function's test events are committed under `infra/main/functions/test-events/`; Claude checked the expected results by running the function in Node.
  - Error responses are cached for 60 s.
- 2026-11-19, 04 D and G: D no longer imports the hosted zone created with the domain. Terraform creates the zone in `lumineglyph` (D.1), the domain is bought in the management account (D.2), its name servers are set by hand with `update-domain-nameservers` (D.4), and the management account's auto-created zone is deleted within 12 hours (D.5). The `aws_route53domains_registered_domain` resource moves to G, after the transfer between accounts.
- 2026-11-18, 04: added section 0 (a dedicated member account), because step 5 found the profile was logging into the management account. Step 00 had allowed a single account.
- 2026-11-15, 01 C and 02: Claude writes them at Matthew's request, because he's behind schedule and wants to spend his time on the DevOps steps (03–08). He reviews the code and does the 01 D parity check himself.
- 01 C, theme switch: three icon buttons (half circle / sun / moon) with visually hidden labels, a working placeholder for Moena to restyle. On mobile it sits at the bottom of the slide-out menu, not in the header: at 390px the header is already full. `aria-pressed` shows the saved choice, not the resulting theme, so it doesn't need an OS-change listener. Added: other open tabs update when the choice changes.
- 01 C: `assets/` was copied into `site/src/assets/`, not moved, so the old site keeps working until the D cleanup. Removed the Astro template's favicons; step 02 A adds the real one.
- 01 C: the "Coming soon" contact rows lost `aria-disabled` (not valid on a plain `div`; the visible text already says it). The work images lost their hidden `.ph-label` fallback text, since a missing image now fails the build. The first slide is marked active at build time so something shows without JS; the script then jumps to a random slide without a fade.
- 01 C: the JP/EN links get the current section's `#hash` on every scroll update, not only on click, so middle-click and "copy link" keep it too.
- 02 B, fonts: Astro's Fonts API with the Fontsource provider produced one 1.1–1.4 MB file per Japanese weight instead of slices (the case the step file warned about). The Fontsource npm packages did give slices, but the Japanese home page then made ~70 font requests (~950 KB) and the CSS was 408 KB from the slice rules. Build-time subsetting of both fonts to every character in `src/` (4 files of ~50 KB) still left `/` at 85 on mobile. Final approach (2026-11-16): body text uses the system font (Noto Sans JP is no longer a web font), and `site/integrations/subset-fonts.mjs` subsets Shippori Mincho per weight to the Japanese heading text, read from `ja.json` by key (source fonts in `site/fonts/`, committed, OFL). Latin comes from the `@fontsource/*` latin files, and a small Vite plugin drops their unused `.woff` fallbacks.
- 02: `public/theme.js` was renamed `public/prefs.js`; it also applies the saved pause choice before the first paint.
- 02 A, logos: inline SVG through Astro's SVG import, one file per logo, using the black traces (the white symboltype had the grey specks). The color comes from a `--logo` token: `#FFFFFF` dark, `#000000` light, the same as the PNGs. The `.on-dark`/`.on-light` pairs and their variables were removed. Favicon: the logo mark as SVG with a dark-mode media query, a 16/32px `.ico`, and a 180px `apple-touch-icon` (white mark on `#121212`).
- 02 C: no `og:image` yet (waiting on Moena), so `twitter:card` is `summary` for now. The sitemap uses `hreflang="ja"` (not `ja-JP`) to match the page `<head>`.
- 02 E: besides the three planned fixes: the light-mode muted grey went from 66% to 70% opacity (4.48:1 → 5.04:1); the disabled contact rows use `--muted` instead of `opacity:.55` (3.4:1 → 4.6:1); landmark and group `aria-label`s are translated (they were English on Japanese pages); the slideshow has `role="group"`; work cards on the works page are `h2` so heading levels don't skip. The pause button sits at the top right of the left column and also pauses the slideshow on hover.
- 2026-11-17/18, 03 B.5 and F.3: a site change that was made and then reverted.
  - Local Lighthouse scored the Japanese home page 92–96 (layout of the Japanese text was slow on this machine). Claude added `content-visibility: auto` to the sections (commit `80745c9`).
  - In CI that caused a false accessibility failure on `/en/`: a contrast reading against a section that hadn't been laid out yet.
  - CI's numbers showed the original problem was local only (runner CPU ~2.5× faster, layout 133 ms vs ~1,100 ms, TBT 0).
  - The change was reverted, and the site is back to step 02's code.
  - 03-ci.md B.5 now treats local Lighthouse as an optional preview only; CI is the reference.

## Waiting on Moena / open questions

- [x] Move the repo to a GitHub org: yes
- [x] Make the repo public: yes (do it in step 03 A, after the history check)
- [ ] **Vector logos.**
  - The first SVGs (PNG wrapped in SVG) were replaced on 2026-11-14 with real path-based SVGs made by Matthew. They pass the vector check, are about a third of the PNG size, and look the same as the PNGs at display size.
  - They're traced from the PNGs, not exported from original artwork. Evidence: black and white versions have different geometry, `logo-symboltype-white.svg` has 2 stray grey (`#D2D3D4`) speck paths, and zoomed in the sun rays have wobbly tips and small specks.
  - Done in step 02 A: one traced (black) version per logo, `currentColor`, SVGO. Still ask Moena whether an original vector file exists; if so, swap it into `site/src/assets/logo-*.svg`.
- [ ] Matthew's profile photo, 4:5, about 800×1000 (step 01/02)
- [ ] Social share (OG) image, 1200×630 (step 02)
- [ ] Design for the theme switch: a working icon version is in place (step 01 C). Moena can restyle it, and should decide whether she wants it in the mobile header rather than the menu.
- [ ] Review the new Japanese copy for the theme switch: 表示テーマ / OSの設定に合わせる / ライト / ダーク (`site/src/i18n/ja.json`, `theme`)
- [ ] **Light-mode orange text contrast.** It was 2.1:1 and needs 4.5:1. Step 02 E uses `#B54708` (4.8–5.0:1) as `--accent-text` in light mode. Moena confirms or picks another orange that passes. Also tell her the light muted grey went from 66% to 70% opacity to pass.
- [ ] Design for the pause/play button (WCAG 2.2.2): a working version is at the top right of the left column (step 02 E). Moena can restyle it.
- [ ] Review the new Japanese copy from step 02: 本文へ移動, アニメーションを一時停止, the landmark labels (言語 / ナビゲーション / セクション / メニュー) and the 404 text (`site/src/i18n/ja.json`, `a11y` and `notFound`)
- [x] Japanese mobile performance: system font for body text, Shippori subset to the headings (see Decisions, 2026-11-16). Mobile `/` is now 98.
- [ ] **Tell Moena about the body font.** Noto Sans JP is no longer downloaded as a web font. Windows 10/11 and Android still show Noto (it's built in), but **Apple devices show Hiragino Sans** for body text, including the Latin in English body text. Headings are unchanged everywhere. If she adds a new element in the Japanese mincho style, its copy key goes in `FACES` in `site/integrations/subset-fonts.mjs`.
- [x] Old design drafts: delete
- [ ] **Domain email.** Leaning toward free forwarding (`hello@` → both Gmail inboxes) to start, with paid sending or mailboxes later if needed. Decide before step 08. See step 08 A.
