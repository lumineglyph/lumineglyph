# ADR-004: A preview site per pull request, on its own subdomain, bucket and role

- **Status:** Accepted
- **Date:** 2026-11-13 (decided); 2026-11-22 (built in step 07)

## Context

Moena, the site's designer and director, edits copy and adds works through pull requests in GitHub's web editor (`CONTRIBUTING.md`). She needs to see a change on a real site, on her phone too, before it goes live. She shouldn't need a local setup, and shouldn't wait for the engineer.

Production deploys are already automatic (step 06): a merge to `main` builds once and deploys that artifact through GitHub OIDC to a role that only `main` can use. Hosting platforms like Netlify or Cloudflare Pages include previews per pull request; on S3 + CloudFront (ADR-003) they have to be built.

Requirements:
- A preview for every pull request opened from this repo, with its link on the pull request.
- Updated on every push, and deleted when the pull request closes.
- Nothing a preview deploy does can affect the live site.
- Never indexed by search engines.
- About the same cost as now (a few cents).

## Decision

1. **A subdomain per pull request:** `https://pr-<N>.preview.lumineglyph.com/`. A wildcard DNS record and the existing certificate's `*.preview` name cover every number. A CloudFront Function maps the host to a folder: `pr-12.preview…/en/` → `/pr-12/en/index.html`. Any other host gets a 404.
2. **A separate private bucket, distribution and IAM role** for previews. The preview role can list, upload and delete in the previews bucket only. It has no access to the site bucket and no CloudFront permissions.
3. **CloudFront caching off** (`Managed-CachingDisabled`) on the previews distribution. A push shows at once and nothing needs invalidating. Pages are uploaded with `Cache-Control: no-cache`, so browsers check for a newer version every time.
4. **`X-Robots-Tag: noindex, nofollow`** on every preview response, through a copy of the site's security headers policy with that header added.
5. **The pipeline's `deploy-preview` job** downloads the artifact the `build` job checked, uploads it to `pr-<N>/`, and edits one comment on the pull request with the link, in English and Japanese. **`preview-cleanup.yml`** deletes the folder when the pull request closes. Both use a GitHub `preview` environment, whose OIDC `sub` is the only one the preview role trusts.
6. **A 30-day expiry rule** on the previews bucket, in case the cleanup ever misses a closed pull request.

### Options considered

- **A path per pull request** (`lumineglyph.com/previews/pr-12/`): one distribution and no wildcard DNS, but Astro's root-relative URLs (`/_astro/…`) would break unless every preview were built with a different `base`. That means a second build that isn't the tested artifact.
- **A preview folder in the site bucket, behind the site distribution:** less infrastructure, but the preview role would then need write access to the bucket that serves the live site.
- **Caching on, with an invalidation after each preview deploy:** faster pages and compression, but the role would need CloudFront permissions, and every push would wait for the invalidation. Previews get a handful of visitors.
- **Netlify or Cloudflare Pages for previews only:** previews for free, but a second platform with its own build would preview something other than what AWS serves. Rejected for the same reasons as in ADR-003.

### Who can deploy a preview

The `preview` environment has **no branch rule**, unlike `production` (`main` only). Pull request runs use refs such as `refs/pull/12/merge`, not named branches, so a branch rule would only get in the way. Access is limited elsewhere:
- Only people with write access to the repo (the two owners) can push branches.
- GitHub gives pull requests from forks no OIDC token, and runs from outside contributors need an owner's approval.
- Even when used, the preview role can only write to the previews bucket.

**Fork and Dependabot pull requests get no preview.** Both jobs skip them explicitly rather than fail: forks because they get no OIDC token, and Dependabot because GitHub's docs disagree on whether its runs do. The `build` check still runs on all of them. Dependency updates don't change content, so they don't need a visual preview.

## Consequences

**Positive**
- Moena can make and check a change without the engineer: edit in the browser, open the link, merge.
- A preview deploy can't change the live site; IAM enforces it, not just a convention.
- A preview is the same artifact `build` checked, so what Moena approves is what goes live after the merge (built again from `main`).
- Search engines are told not to index previews. (The links themselves aren't secret: the repo is public, so its pull request comments are too. A preview only ever shows what the pull request already shows.)
- The cost stays within CloudFront's always-free tier and a few cents of S3.

**Negative / trade-offs**
- A second distribution, bucket, function, headers policy and role to maintain. The two headers policies must be kept identical apart from `X-Robots-Tag`.
- Previews aren't compressed: CloudFront only compresses what it caches.
- Previews are served under the site's own domain. A cookie set for `lumineglyph.com` would reach them, and a preview could set one for the whole domain. The site sets no cookies today. If it ever does, they should be host-only (no `Domain` attribute), or previews should move to a separate domain.
- An open pull request with no push for 30 days loses its preview to the expiry rule. Any new push, or re-running its pipeline, brings it back.
- The 404 page served for missing preview pages is a single copy at the bucket root, refreshed by each preview deploy, rather than each pull request's own version.
