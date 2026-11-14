# 07 — A preview site for every pull request, and Moena's editing guide

## Goal

Every same-repo pull request is deployed to `https://pr-<N>.preview.lumineglyph.com/`, and the link appears on the PR. The preview is removed when the PR closes. Search engines are told not to index previews. Moena can edit copy or add a work entirely in the browser, check the preview and merge.

## Why it matters

- **This is "making other people's work easier" in practice.** Someone who doesn't write code can make changes safely, and you never touch the deploy.
- **A preview environment per PR** on your own AWS setup is a step beyond the usual tutorial.

## Design

| Choice | Why |
|--------|-----|
| **Subdomain per PR**, not a path like `/previews/pr-12/` | Astro outputs root-relative URLs (`/_astro/...`). On a subdomain the site works without building with a different `base` path. |
| **Separate bucket and distribution** | The preview role can't touch the production bucket at all. |
| **Caching disabled** on the preview distribution | No invalidations needed, and previews get little traffic. |
| **`X-Robots-Tag: noindex`** header on all preview responses | Keeps previews out of search results. |
| **Bucket lifecycle rule** that expires objects after 30 days | Backup in case the cleanup job ever fails. |

## Steps

### A. Infrastructure (`previews.tf`)

**Bucket:** a second private bucket with OAC, configured like the site bucket but without versioning, plus the 30-day expiration rule.

**Viewer-request function.** It maps the subdomain to a folder in the bucket:

```js
// infra/main/functions/preview-viewer-request.js
function handler(event) {
  var request = event.request;
  var sub = request.headers.host.value.split(".")[0];   // "pr-12"
  if (!/^pr-\d+$/.test(sub)) {
    return { statusCode: 404, statusDescription: "Not Found" };
  }
  var uri = request.uri;
  if (uri.endsWith("/")) {
    uri += "index.html";
  } else if (uri.split("/").pop().indexOf(".") === -1) {
    return {
      statusCode: 301,
      statusDescription: "Moved Permanently",
      headers: { location: { value: uri + "/" } },
    };
  }
  request.uri = "/" + sub + uri;
  return request;
}
```

**Response headers policy:** the same as production, plus a custom header `X-Robots-Tag: noindex, nofollow`.

**Distribution:**
- `aliases = ["*.preview.${var.domain}"]`, using the same certificate, which already covers the wildcard.
- Managed cache policy `Managed-CachingDisabled`.
- The new function, and the preview headers policy.
- `PriceClass_200`.

**DNS:** wildcard `A`/`AAAA` alias records for `*.preview.lumineglyph.com` pointing at the preview distribution.

**Role `deploy_preview`:**
- Trust: `sub` equals the **preview** environment subject. Check the format the same way as in step 06.
- Permissions: `s3:ListBucket` on the previews bucket, `s3:PutObject` and `s3:DeleteObject` on `<previews ARN>/*`. Nothing else.

### B. GitHub environment `preview`

- Deployment branches: no restriction. PR runs use `refs/pull/N/merge`.
- Variables:
  - `AWS_REGION`
  - `AWS_DEPLOY_ROLE_ARN`: the preview role
  - `PREVIEW_BUCKET`

### C. Preview job (in `pipeline.yml`)

```yaml
  deploy-preview:
    # Fork PRs never get OIDC tokens; skip them explicitly rather than failing.
    if: github.event_name == 'pull_request' && github.event.pull_request.head.repo.full_name == github.repository
    needs: build
    runs-on: ubuntu-latest
    timeout-minutes: 10
    environment:
      name: preview
      url: https://pr-${{ github.event.number }}.preview.lumineglyph.com/
    permissions:
      contents: read
      id-token: write
      pull-requests: write     # to comment the link
    concurrency:
      group: preview-${{ github.event.number }}
      cancel-in-progress: true
    steps:
      - uses: actions/download-artifact@<sha> # v8.0.2
        with: { name: site-dist, path: dist }
      - uses: aws-actions/configure-aws-credentials@<sha> # v6.3.0
        with:
          role-to-assume: ${{ vars.AWS_DEPLOY_ROLE_ARN }}
          aws-region: ${{ vars.AWS_REGION }}
      - run: aws s3 sync dist "s3://${{ vars.PREVIEW_BUCKET }}/pr-${{ github.event.number }}" --delete
      - name: Comment preview link
        env:
          GH_TOKEN: ${{ github.token }}
          URL: https://pr-${{ github.event.number }}.preview.lumineglyph.com/
        run: >
          gh pr comment ${{ github.event.number }} --repo "${{ github.repository }}"
          --edit-last --create-if-none
          --body "Preview / プレビュー: $URL"
```

Because the job uses `environment.url`, GitHub also shows a **View deployment** button on the PR.

### D. Cleanup workflow

`.github/workflows/preview-cleanup.yml` runs on `pull_request: types: [closed]`. It has:
- the same fork guard
- `environment: preview`
- `id-token: write`
- one step: `aws s3 rm "s3://$PREVIEW_BUCKET/pr-$N/" --recursive`

### E. CONTRIBUTING.md, in Japanese and English

Write this for Moena, not for engineers. Short, with screenshots if you like. Cover:

1. **Change text:** edit `site/src/i18n/ja.json` or `en.json` on github.com using the pencil icon.
   - Both files must keep the same keys.
   - `\n` makes a line break.
   - Don't touch the left side of `"key": "value"`.
2. **Add a work:**
   - Upload a 16:9 screenshot of about 1600×900 to `site/src/content/works/`.
   - Copy an existing `.json` there, rename it, and edit it.
   - `order` sets the position.
3. **Change contact links:** `site/src/data/site.json`. An empty `""` shows "Coming soon".
4. **Save:** choose "Create a new branch and start a pull request".
5. Wait about 2 minutes. Open the **Preview / プレビュー** link in the PR. Check both languages, and on a phone.
6. **If the checks are red:** open "Details". The error usually names the file and the key. Or ask Matthew.
7. **Publish:** "Merge pull request". The site updates in about 2 minutes.

Claude can draft the Japanese. Have Moena review it, since it's her guide.

## Checkpoint

- Open a test PR. The preview job comments a link, the page loads, and `curl -sI <preview URL>` shows `x-robots-tag: noindex, nofollow` along with the usual security headers.
- `https://pr-999999.preview.lumineglyph.com/` (a PR that doesn't exist) returns 404 or 403, not some other content.
- Close the PR. `aws s3 ls s3://<previews>/pr-<N>/` comes back empty.
- **Real test:** Moena makes a small real edit end to end using only CONTRIBUTING.md. Note anything that confused her and fix the guide.

PROGRESS gets the previews bucket, distribution ID and role ARN.

## Commit

`feat(infra): per-PR preview environment`, `ci: deploy and clean up PR previews`, `docs: CONTRIBUTING guide (ja/en)`.

## ADR

Write `docs/adr/004-pr-previews.md`: why a subdomain per PR, why separate buckets, why caching is disabled, and the fork-PR limitation.
