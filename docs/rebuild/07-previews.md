# 07 — A preview site for every pull request, and Moena's editing guide

## Goal

Every pull request opened from a branch of this repo is deployed to `https://pr-<N>.preview.lumineglyph.com/`, and a link appears on the PR in English and Japanese. The preview is deleted when the PR closes. Search engines are told never to index previews. Moena can edit copy or add a work entirely in the browser, check the preview, and merge.

## Why it matters

- **Making other people's work easier, in practice.** Someone who doesn't write code can make changes safely and see them before they go live, and you never touch the deploy.
- **A preview environment per PR** on your own AWS setup, with its own least-privilege role, is a step beyond the usual tutorial.

## Design

| Choice | Why |
|--------|-----|
| **A subdomain per PR**, not a path like `/previews/pr-12/` | Astro builds root-relative URLs (`/_astro/...`). On its own subdomain a preview works as built, with no special `base` path. |
| **A separate bucket, distribution and role** | The preview role can't touch the live site's bucket at all. Anyone who can open a PR can deploy a preview, so it gets the smaller set of keys. |
| **CloudFront caching off** for previews | A new push shows at once, with no cache to clear, so the role needs no CloudFront permissions. Previews get a handful of visitors. |
| **`X-Robots-Tag: noindex, nofollow`** on every preview response | Keeps previews out of search results. |
| **30-day expiry** on the previews bucket | A backup in case the cleanup job ever misses a closed PR. |
| **No previews for fork or Dependabot PRs** | GitHub gives fork PRs no OIDC token, and its docs disagree on whether Dependabot PRs get one. Both are skipped rather than failing. The `build` check still runs on them. |

How a preview request is served:

| Step | Example |
|---|---|
| Visitor opens | `https://pr-12.preview.lumineglyph.com/en/` |
| DNS `*.preview` → the previews distribution | wildcard A/AAAA records |
| The viewer-request function maps host + path to a bucket key | `/pr-12/en/index.html` |
| CloudFront reads it from the private bucket (OAC), adds the headers | security headers + `X-Robots-Tag` |

## How this step works

Same as steps 05 and 06:
- You write the files and run every command that changes something: `terraform apply`, `gh api -X PUT`, `gh variable set`, git.
- Claude runs `terraform plan` and checks it before each apply.
- `AWS_PROFILE=lumineglyph` must be **exported** in every terminal you use (`printenv AWS_PROFILE` should print it).

The order:
1. **A–D, Terraform**, in four small applies:
   - **A:** the bucket
   - **B:** the edge function (tested on its own) and the headers policy
   - **C:** the distribution and DNS
   - **D:** the deploy role
2. **E:** the GitHub `preview` environment and its variables.
3. **F:** the preview job in `pipeline.yml` and the new `preview-cleanup.yml`.
4. **G–H:** `CONTRIBUTING.md` (Moena's guide) and ADR-004. Claude drafts both at your request; you review.
5. **I:** push and open the PR. The step's own PR is the first preview. A second push checks that the link comment is updated, not repeated.
6. **J:** merge. Closing the PR runs the cleanup, and the merge deploys production as usual.
7. **K:** Moena's real test, using only `CONTRIBUTING.md`.

**What it costs:** almost nothing. The second distribution shares CloudFront's always-free tier (1 TB, 10 million requests and 2 million function runs a month). Previews are a few MB each and are deleted when the PR closes.

## What Claude already checked (2026-11-21)

- **Certificate.** `cert.tf` already lists `*.preview.lumineglyph.com`, and the certificate covering it is `ISSUED`. The only record under `preview` in the zone is that certificate's validation CNAME (`_e68c…preview.lumineglyph.com`). The wildcard records in C don't affect it, because a more specific name always wins over a wildcard.
- **`Managed-CachingDisabled`** (ID `4135ea2d-6df8-44a3-9df3-4b5a84be39ad`): TTL 0/0/0, gzip and brotli off. CloudFront only compresses what it caches, so previews aren't compressed. That's fine at this traffic.
- **The function** (B) was run in Node against all seven test events; the expected results in B.4 are its real output.
- **Terraform.** All the code in A–D, added to a scratch copy of `infra/main` with your installed AWS provider (6.73.0): `terraform fmt` clean, `terraform validate` succeeds. Your `infra/main` wasn't touched.
- **Workflows.** Both workflows in F: zizmor 1.32.0 reports no findings, both offline and online and even at its strictest setting (`--persona=pedantic`). Both parse as YAML. They pin the same action commits as step 06.
- **`gh pr comment`** has `--edit-last --create-if-none` (gh 2.100), so the job keeps one comment per PR and edits it on every push.
- **Dependabot and OIDC.** GitHub's docs disagree on whether Dependabot PR runs can get an OIDC token: the workflow-syntax page says they run like forks, and the Dependabot troubleshooting page says permissions can be raised. So `deploy-preview` and the cleanup skip PRs opened by `dependabot[bot]`, instead of failing on them.
- **`deployment: false`** (GitHub, March 2026) lets a job use an environment's role and variables without recording a deployment. The cleanup job uses it, so a closed PR doesn't show a fresh "deployed to preview" entry. GitHub doesn't document whether the OIDC token's `sub` still includes the environment in that case. J checks it, and has a one-line fallback if it doesn't.

**Not checked in advance:** the preview `sub`, `repo:lumineglyph@356493958/lumineglyph@1460696603:environment:preview`. It's the format step 06 C confirmed for `production`, with the environment name changed, so no throwaway PR this time. The first preview deploy (I) proves it: if it were wrong, that job would fail at "Sign in to AWS", and nothing else would be affected.

## Before you start

**1. Branch.** The new step file and the PROGRESS update go on it:
```sh
cd ~/code/ged/lumineglyph
git switch main && git pull
git switch -c rebuild/07-previews
git status            # docs/rebuild/07-previews.md and docs/rebuild/PROGRESS.md (modified)
git add docs/rebuild/07-previews.md docs/rebuild/PROGRESS.md
git commit -m "docs(rebuild): step 07 instructions"
```

**2. Log in:**
```sh
aws sso login --profile lumineglyph
export AWS_PROFILE=lumineglyph
aws sts get-caller-identity --query Account --output text   # 421803180949
terraform -chdir=infra/main plan                            # expect: No changes
```

**3. Pick the previews bucket's name**, the same way as the site bucket:
```sh
echo "lumineglyph-previews-$(openssl rand -hex 3)"
```
Note it (for example `lumineglyph-previews-d4e5f6`). It goes in A.1 and in PROGRESS. It isn't secret.

### A. Previews bucket

**1. Create `infra/main/previews.tf`.** Replace `lumineglyph-previews-d4e5f6` with your name:
```hcl
# PR preview sites. https://pr-<N>.preview.lumineglyph.com/ serves the folder pr-<N>/ of a private bucket.
# A separate bucket and distribution from the live site, so the preview deploy role can't touch it (ADR-004).
resource "aws_s3_bucket" "previews" {
  bucket = "lumineglyph-previews-d4e5f6"
}

# No versioning: previews are throwaway. Files older than 30 days are deleted, in case the cleanup
# workflow ever misses a closed PR. Every preview deploy uploads all its files again, so an open PR
# keeps its preview as long as it gets a push at least every 30 days.
resource "aws_s3_bucket_lifecycle_configuration" "previews" {
  bucket = aws_s3_bucket.previews.id

  rule {
    id     = "expire-previews"
    status = "Enabled"
    filter {}

    expiration {
      days = 30
    }
    abort_incomplete_multipart_upload {
      days_after_initiation = 7
    }
  }
}

resource "aws_s3_bucket_server_side_encryption_configuration" "previews" {
  bucket = aws_s3_bucket.previews.id
  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
  }
}

resource "aws_s3_bucket_public_access_block" "previews" {
  bucket                  = aws_s3_bucket.previews.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_ownership_controls" "previews" {
  bucket = aws_s3_bucket.previews.id
  rule {
    object_ownership = "BucketOwnerEnforced"
  }
}

output "previews_bucket" {
  value = aws_s3_bucket.previews.bucket
}
```

**2. Plan:**
```sh
cd infra/main
terraform fmt
terraform validate
terraform plan -out=main.tfplan
```
- [ ] Tell Claude, and wait for the go-ahead. Claude checks for **5 to add**: the bucket, lifecycle, encryption, public access block and ownership controls. Nothing should change or be destroyed.

```sh
terraform apply main.tfplan
rm main.tfplan
cd ../..
```

**3. Commit:**
```sh
git add infra/main/previews.tf
git commit -m "feat(infra): previews bucket"
```

### B. Preview function and headers policy

**1. Create `infra/main/functions/preview-viewer-request.js`:**
```js
// CloudFront Function (runtime cloudfront-js-2.0) on viewer requests to the previews distribution.
// pr-12.preview.lumineglyph.com/en/ → /pr-12/en/index.html in the previews bucket.
// - Any other host (another subdomain, or the distribution's own *.cloudfront.net name) → 404.
// - /path → 301 to /path/ (matches trailingSlash: "always"), like the site function.
// - Files with an extension (/_astro/x.css) are served from the PR's folder unchanged.
function handler(event) {
  var request = event.request;
  var host = request.headers.host.value.toLowerCase();
  var match = host.match(/^(pr-[1-9][0-9]*)\.preview\.lumineglyph\.com$/);
  if (!match) {
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
  request.uri = "/" + match[1] + uri;
  return request;
}
```

**2. Add the function to the end of `infra/main/functions.tf`**, after the site function:
```hcl

resource "aws_cloudfront_function" "preview_viewer_request" {
  name    = "lumineglyph-preview-viewer-request"
  comment = "Maps pr-<N>.preview hosts to bucket folders (infra/main/functions/preview-viewer-request.js)"
  runtime = "cloudfront-js-2.0"
  publish = true
  code    = file("${path.module}/functions/preview-viewer-request.js")
}
```

**3. Add the headers policy to the end of `infra/main/headers.tf`**, after the site policy. It's the site's policy with a different name and one extra header, `X-Robots-Tag`:
```hcl

# The same security headers as the live site (keep the two in step), plus X-Robots-Tag so search
# engines never index a preview.
resource "aws_cloudfront_response_headers_policy" "previews" {
  name    = "lumineglyph-previews"
  comment = "Security headers and noindex for *.preview.lumineglyph.com"

  security_headers_config {
    strict_transport_security {
      access_control_max_age_sec = 63072000
      include_subdomains         = true
      preload                    = false
      override                   = true
    }
    content_type_options {
      override = true
    }
    frame_options {
      frame_option = "DENY"
      override     = true
    }
    referrer_policy {
      referrer_policy = "strict-origin-when-cross-origin"
      override        = true
    }
    content_security_policy {
      content_security_policy = "frame-ancestors 'none'; base-uri 'none'; form-action 'none'; object-src 'none'; upgrade-insecure-requests"
      override                = true
    }
  }

  custom_headers_config {
    items {
      header   = "Permissions-Policy"
      value    = "camera=(), microphone=(), geolocation=(), payment=(), usb=()"
      override = true
    }
    items {
      header   = "Cross-Origin-Opener-Policy"
      value    = "same-origin"
      override = true
    }
    items {
      header   = "X-Robots-Tag"
      value    = "noindex, nofollow"
      override = true
    }
  }
}
```

**4. Create seven test events** in a new folder, `infra/main/functions/test-events/preview/`. It's a subfolder, so the site function's test loop from step 05 C.3 (`test-events/*.json`) doesn't pick them up. Each file is one line.

`root.json`:
```json
{"version":"1.0","context":{"eventType":"viewer-request"},"viewer":{"ip":"198.51.100.1"},"request":{"method":"GET","uri":"/","querystring":{},"headers":{"host":{"value":"pr-12.preview.lumineglyph.com"}},"cookies":{}}}
```
`en-slash.json`:
```json
{"version":"1.0","context":{"eventType":"viewer-request"},"viewer":{"ip":"198.51.100.1"},"request":{"method":"GET","uri":"/en/","querystring":{},"headers":{"host":{"value":"pr-12.preview.lumineglyph.com"}},"cookies":{}}}
```
`en-no-slash.json`:
```json
{"version":"1.0","context":{"eventType":"viewer-request"},"viewer":{"ip":"198.51.100.1"},"request":{"method":"GET","uri":"/en","querystring":{},"headers":{"host":{"value":"pr-12.preview.lumineglyph.com"}},"cookies":{}}}
```
`asset.json`:
```json
{"version":"1.0","context":{"eventType":"viewer-request"},"viewer":{"ip":"198.51.100.1"},"request":{"method":"GET","uri":"/_astro/x.css","querystring":{},"headers":{"host":{"value":"pr-12.preview.lumineglyph.com"}},"cookies":{}}}
```
`other-host.json`:
```json
{"version":"1.0","context":{"eventType":"viewer-request"},"viewer":{"ip":"198.51.100.1"},"request":{"method":"GET","uri":"/en/","querystring":{},"headers":{"host":{"value":"foo.preview.lumineglyph.com"}},"cookies":{}}}
```
`cloudfront-host.json`:
```json
{"version":"1.0","context":{"eventType":"viewer-request"},"viewer":{"ip":"198.51.100.1"},"request":{"method":"GET","uri":"/","querystring":{},"headers":{"host":{"value":"d111111abcdef8.cloudfront.net"}},"cookies":{}}}
```
`pr-zero.json`:
```json
{"version":"1.0","context":{"eventType":"viewer-request"},"viewer":{"ip":"198.51.100.1"},"request":{"method":"GET","uri":"/","querystring":{},"headers":{"host":{"value":"pr-0.preview.lumineglyph.com"}},"cookies":{}}}
```

**5. Plan:**
```sh
cd infra/main
terraform fmt
terraform validate
terraform plan -out=main.tfplan
```
- [ ] Tell Claude, and wait for the go-ahead. Claude checks for **2 to add**: the function and the headers policy. The site's function and policy must show no changes.

```sh
terraform apply main.tfplan
rm main.tfplan
```

**6. Test the function** against the seven events. Still in `infra/main`:
```sh
ETAG=$(aws cloudfront describe-function --name lumineglyph-preview-viewer-request --stage DEVELOPMENT --query ETag --output text)
for f in functions/test-events/preview/*.json; do
  printf '%-50s ' "$f"
  aws cloudfront test-function --name lumineglyph-preview-viewer-request --if-match "$ETAG" --stage DEVELOPMENT \
    --event-object "fileb://$f" --query 'TestResult.FunctionOutput' --output text \
    | jq -c '{uri: .request.uri, status: .response.statusCode, location: .response.headers.location.value}'
done
cd ../..
```
- [ ] The results match:

| Event | `uri` | `status` | `location` |
|---|---|---|---|
| `asset.json` | `/pr-12/_astro/x.css` | null | null |
| `cloudfront-host.json` | null | 404 | null |
| `en-no-slash.json` | null | 301 | `/en/` |
| `en-slash.json` | `/pr-12/en/index.html` | null | null |
| `other-host.json` | null | 404 | null |
| `pr-zero.json` | null | 404 | null |
| `root.json` | `/pr-12/index.html` | null | null |

If a line shows an error instead, run that one test again without `--query`/`jq` and show Claude the `FunctionErrorMessage`.

**7. Commit:**
```sh
git add infra/main/functions/preview-viewer-request.js infra/main/functions/test-events/preview/ \
  infra/main/functions.tf infra/main/headers.tf
git commit -m "feat(infra): preview viewer-request function and headers policy"
```

### C. Previews distribution and DNS

**1. Create `infra/main/previews-cdn.tf`.** It's the same pattern as `cdn.tf`, with three differences:
- a wildcard alias
- the caching-disabled policy
- a 404 page at the bucket root

```hcl
# Same pattern as cdn.tf: CloudFront reads the private previews bucket through its own OAC.
resource "aws_cloudfront_origin_access_control" "previews" {
  name                              = "lumineglyph-previews"
  description                       = "CloudFront access to the previews bucket"
  origin_access_control_origin_type = "s3"
  signing_behavior                  = "always"
  signing_protocol                  = "sigv4"
}

# AWS-managed: TTL 0, nothing cached. A new push shows up at once, with no invalidation needed.
# CloudFront only compresses what it caches, so previews aren't compressed; fine for a few visitors.
data "aws_cloudfront_cache_policy" "caching_disabled" {
  name = "Managed-CachingDisabled"
}

resource "aws_cloudfront_distribution" "previews" {
  enabled         = true
  comment         = "PR previews (*.preview.${var.domain})"
  aliases         = ["*.preview.${var.domain}"] # covered by the certificate's *.preview SAN (cert.tf)
  http_version    = "http2and3"
  is_ipv6_enabled = true
  price_class     = "PriceClass_200"

  origin {
    origin_id                = "previews-s3"
    domain_name              = aws_s3_bucket.previews.bucket_regional_domain_name
    origin_access_control_id = aws_cloudfront_origin_access_control.previews.id
  }

  default_cache_behavior {
    target_origin_id           = "previews-s3"
    viewer_protocol_policy     = "redirect-to-https"
    allowed_methods            = ["GET", "HEAD"]
    cached_methods             = ["GET", "HEAD"]
    cache_policy_id            = data.aws_cloudfront_cache_policy.caching_disabled.id
    response_headers_policy_id = aws_cloudfront_response_headers_policy.previews.id

    function_association {
      event_type   = "viewer-request"
      function_arn = aws_cloudfront_function.preview_viewer_request.arn
    }
  }

  # A missing file is a 403 from S3 (no s3:ListBucket for CloudFront). Show the 404 page instead.
  # The error page path is one fixed object for the whole distribution, and the function doesn't run
  # for it, so the deploy job keeps a copy at the bucket root (/404.html, not /pr-<N>/404.html).
  custom_error_response {
    error_code            = 403
    response_code         = 404
    response_page_path    = "/404.html"
    error_caching_min_ttl = 0
  }

  restrictions {
    geo_restriction {
      restriction_type = "none"
    }
  }

  viewer_certificate {
    acm_certificate_arn      = aws_acm_certificate_validation.site.certificate_arn
    ssl_support_method       = "sni-only"
    minimum_protocol_version = "TLSv1.2_2025"
  }
}

# Only the previews distribution may read the bucket, and only over HTTPS.
data "aws_iam_policy_document" "previews_bucket" {
  statement {
    sid       = "AllowCloudFrontRead"
    effect    = "Allow"
    actions   = ["s3:GetObject"]
    resources = ["${aws_s3_bucket.previews.arn}/*"]

    principals {
      type        = "Service"
      identifiers = ["cloudfront.amazonaws.com"]
    }

    condition {
      test     = "StringEquals"
      variable = "AWS:SourceArn"
      values   = [aws_cloudfront_distribution.previews.arn]
    }
  }

  statement {
    sid       = "DenyInsecureTransport"
    effect    = "Deny"
    actions   = ["s3:*"]
    resources = [aws_s3_bucket.previews.arn, "${aws_s3_bucket.previews.arn}/*"]

    principals {
      type        = "*"
      identifiers = ["*"]
    }

    condition {
      test     = "Bool"
      variable = "aws:SecureTransport"
      values   = ["false"]
    }
  }
}

resource "aws_s3_bucket_policy" "previews" {
  bucket = aws_s3_bucket.previews.id
  policy = data.aws_iam_policy_document.previews_bucket.json

  depends_on = [aws_s3_bucket_public_access_block.previews]
}

# *.preview.lumineglyph.com → the previews distribution, over IPv4 (A) and IPv6 (AAAA).
# The certificate's validation record (_….preview.lumineglyph.com) is more specific, so the wildcard doesn't affect it.
resource "aws_route53_record" "previews" {
  for_each = toset(["A", "AAAA"])

  zone_id = aws_route53_zone.main.zone_id
  name    = "*.preview.${var.domain}"
  type    = each.value

  alias {
    name                   = aws_cloudfront_distribution.previews.domain_name
    zone_id                = aws_cloudfront_distribution.previews.hosted_zone_id
    evaluate_target_health = false
  }
}

output "previews_distribution_id" {
  value = aws_cloudfront_distribution.previews.id
}
```

**2. Plan:**
```sh
cd infra/main
terraform fmt
terraform validate
terraform plan -out=main.tfplan
```
- [ ] Tell Claude, and wait for the go-ahead. Claude checks for **5 to add**:
  - the access control (OAC)
  - the distribution
  - the bucket policy
  - two DNS records (`*.preview` A and AAAA)

  Nothing should change or be destroyed. The live site's distribution must not appear.

```sh
terraform apply main.tfplan
rm main.tfplan
terraform plan                      # expect: No changes
cd ../..
```
The apply waits at `aws_cloudfront_distribution.previews: Still creating...` for 5–10 minutes, as in step 05.

**3. First look.** There are no previews yet, so every preview address should answer 404 (or 403 until the first deploy uploads the 404 page). Either way, the headers must be there:
```sh
curl -sI https://pr-1.preview.lumineglyph.com/ | grep -iE '^(HTTP|x-robots-tag|strict-transport-security|content-security-policy)'
curl -s -o /dev/null -w '%{http_code}\n' https://foo.preview.lumineglyph.com/
```
- [ ] The first: `HTTP/2 404` (or 403), `x-robots-tag: noindex, nofollow`, HSTS and CSP. The second: `404`.

If you get a certificate or connection error in the first minutes, wait a little: new DNS records take a few minutes to reach everywhere.

**4. Commit:**
```sh
git add infra/main/previews-cdn.tf
git commit -m "feat(infra): previews distribution, bucket policy and DNS"
```

### D. Preview deploy role

The OIDC provider from step 06 is shared. This adds a second role, trusted only for the `preview` environment.

**1. In `infra/main/github-oidc.tf`, replace the whole `locals { … }` block** with this one. It adds `github_sub_preview` and updates the comment. The production value doesn't change, so the production role won't change either:
```hcl
locals {
  # The token's `sub` claim for jobs in each GitHub environment, checked in step 06 C (production) and
  # step 07 I (preview). GitHub's immutable format includes the owner and repo IDs, so a deleted and
  # re-created repo with the same name can't produce it. Only `main` may use production (step 06 C.5).
  github_sub_production = "repo:lumineglyph@356493958/lumineglyph@1460696603:environment:production"
  github_sub_preview    = "repo:lumineglyph@356493958/lumineglyph@1460696603:environment:preview"
}
```

**2. Add this to the end of `infra/main/github-oidc.tf`**, after the `deploy_production_role_arn` output:
```hcl

# Preview deploys (step 07): any same-repo pull request, through the `preview` environment.
# Same trust pattern as production, but the role can only write to the previews bucket.
data "aws_iam_policy_document" "deploy_preview_trust" {
  statement {
    sid     = "GitHubPreviewEnvironment"
    effect  = "Allow"
    actions = ["sts:AssumeRoleWithWebIdentity"]

    principals {
      type        = "Federated"
      identifiers = [aws_iam_openid_connect_provider.github.arn]
    }

    condition {
      test     = "StringEquals"
      variable = "token.actions.githubusercontent.com:aud"
      values   = ["sts.amazonaws.com"]
    }

    condition {
      test     = "StringEquals"
      variable = "token.actions.githubusercontent.com:sub"
      values   = [local.github_sub_preview]
    }
  }
}

resource "aws_iam_role" "deploy_preview" {
  name                 = "lumineglyph-deploy-preview"
  description          = "GitHub Actions deploys and cleanup of PR previews (preview environment only)"
  assume_role_policy   = data.aws_iam_policy_document.deploy_preview_trust.json
  max_session_duration = 3600 # the lowest maximum AWS allows; the jobs ask for 15 minutes
}

# Sync files into the previews bucket and delete them on cleanup. Nothing on the site bucket,
# and no CloudFront permissions: the previews distribution doesn't cache, so there's nothing to clear.
data "aws_iam_policy_document" "deploy_preview" {
  statement {
    sid       = "ListPreviewsBucket"
    actions   = ["s3:ListBucket"]
    resources = [aws_s3_bucket.previews.arn]
  }

  statement {
    sid       = "WritePreviewObjects"
    actions   = ["s3:PutObject", "s3:DeleteObject"]
    resources = ["${aws_s3_bucket.previews.arn}/*"]
  }
}

resource "aws_iam_role_policy" "deploy_preview" {
  name   = "deploy-previews"
  role   = aws_iam_role.deploy_preview.id
  policy = data.aws_iam_policy_document.deploy_preview.json
}

output "deploy_preview_role_arn" {
  value = aws_iam_role.deploy_preview.arn
}
```

| Action | Resource | Used by |
|---|---|---|
| `s3:ListBucket` | the previews bucket | `aws s3 sync` and `aws s3 rm --recursive` list the PR's folder |
| `s3:PutObject` | objects in the previews bucket | uploading a preview, and the shared `/404.html` |
| `s3:DeleteObject` | objects in the previews bucket | `--delete` on later pushes, and the cleanup on close |

**3. Plan:**
```sh
cd infra/main
terraform fmt
terraform validate
terraform plan -out=main.tfplan
```
- [ ] Tell Claude, and wait for the go-ahead. Claude checks for **2 to add**: the role and its policy. Nothing should change, in particular not `aws_iam_role.deploy_production`.

```sh
terraform apply main.tfplan
rm main.tfplan
terraform plan                      # expect: No changes
terraform output deploy_preview_role_arn
cd ../..
```
- [ ] Tell Claude. Claude runs the IAM policy simulator on the new role: the three actions are allowed on the previews bucket, and everything on the site bucket, CloudFront and IAM is denied.

**4. Commit:**
```sh
git add infra/main/github-oidc.tf
git commit -m "feat(infra): preview deploy role"
```

### E. GitHub `preview` environment

**1. Create it:**
```sh
gh api -X PUT repos/lumineglyph/lumineglyph/environments/preview
gh api repos/lumineglyph/lumineglyph/environments/preview \
  --jq '{name, deployment_branch_policy, protection_rules}'
```
- [ ] `"name":"preview"`, `"deployment_branch_policy":null`, `"protection_rules":[]`.

**No branch rule, on purpose.** Pull request runs use refs like `refs/pull/12/merge`, never a named branch. Who can use `preview` is limited elsewhere:
- Only people with write access (you and Moena) can push branches to this repo.
- Fork PRs get no OIDC token at all, and PRs from outside contributors need your approval before they run.
- Even when used, the preview role can only write to the previews bucket.

ADR-004 records this.

**2. Variables.** From the repo root:
```sh
R=lumineglyph/lumineglyph
gh variable set AWS_REGION --env preview --repo "$R" --body ap-northeast-1
gh variable set AWS_DEPLOY_ROLE_ARN --env preview --repo "$R" \
  --body "$(terraform -chdir=infra/main output -raw deploy_preview_role_arn)"
gh variable set PREVIEW_BUCKET --env preview --repo "$R" \
  --body "$(terraform -chdir=infra/main output -raw previews_bucket)"

gh variable list --env preview --repo "$R"
```
- [ ] Three variables: `AWS_DEPLOY_ROLE_ARN` (the **preview** role, `…:role/lumineglyph-deploy-preview`), `AWS_REGION`, `PREVIEW_BUCKET`. Tell Claude; the list shortens long values, so Claude reads them in full.

`AWS_DEPLOY_ROLE_ARN` has the same name in both environments, with a different value in each. A job only sees its own environment's value.

### F. The preview job and the cleanup workflow

**1. Add the `deploy-preview` job to the end of `.github/workflows/pipeline.yml`**, after the last line of `deploy-production`. Leave one blank line before it. Its first line, `  deploy-preview:`, starts with two spaces, the same as `  deploy-production:`:
```yaml

  # Deploys each pull request to https://pr-<N>.preview.lumineglyph.com/ and comments the link on it.
  # Skipped for PRs from forks (GitHub gives them no OIDC token) and from Dependabot (see ADR-004).
  deploy-preview:
    name: deploy-preview
    if: >-
      github.event_name == 'pull_request'
      && github.event.pull_request.head.repo.full_name == github.repository
      && github.event.pull_request.user.login != 'dependabot[bot]'
    needs: build
    runs-on: ubuntu-24.04
    timeout-minutes: 10
    # Only this environment's token can assume the preview role, which can write to the previews
    # bucket and nothing else (infra/main/github-oidc.tf).
    environment:
      name: preview
      url: https://pr-${{ github.event.pull_request.number }}.preview.lumineglyph.com/
    permissions:
      id-token: write # request the OIDC token that AWS swaps for credentials
      pull-requests: write # comment the preview link on the PR
    # A newer push to the same PR, or closing it (preview-cleanup.yml), stops a deploy in progress.
    concurrency:
      group: preview-${{ github.event.pull_request.number }}
      cancel-in-progress: true
    env:
      PREVIEW_BUCKET: ${{ vars.PREVIEW_BUCKET }}
      PR_NUMBER: ${{ github.event.pull_request.number }}
    steps:
      - name: Download the built site
        uses: actions/download-artifact@9000827ccba6bdab643e8b6fd33ac0654aef8333 # v8.0.2
        with:
          name: site-dist
          path: dist

      - name: Check the artifact
        run: |
          test -f dist/index.html
          test -f dist/en/index.html
          test -f dist/404.html
          test -d dist/_astro
          echo "$(find dist -type f | wc -l) files"

      - name: Sign in to AWS
        uses: aws-actions/configure-aws-credentials@e1253824e5c10ff9df46874f81ed3ec929e19cfd # v6.3.0
        with:
          role-to-assume: ${{ vars.AWS_DEPLOY_ROLE_ARN }}
          aws-region: ${{ vars.AWS_REGION }}
          role-duration-seconds: 900 # 15 minutes, the shortest AWS allows
          role-session-name: preview-${{ github.event.pull_request.number }}-${{ github.run_id }}

      # Same order as production: hashed files first, then the pages. Pages get no-cache, so the
      # browser checks for a newer version every time; the preview CDN doesn't cache at all.
      - name: Upload hashed assets
        run: >-
          aws s3 sync dist/_astro "s3://$PREVIEW_BUCKET/pr-$PR_NUMBER/_astro"
          --no-progress
          --cache-control "public, max-age=31536000, immutable"

      - name: Upload pages
        run: >-
          aws s3 sync dist "s3://$PREVIEW_BUCKET/pr-$PR_NUMBER"
          --no-progress
          --delete
          --exclude "_astro/*"
          --cache-control "no-cache"

      # CloudFront's error page is one fixed path for the whole distribution, so a copy of the
      # 404 page lives at the bucket root. Every preview deploy refreshes it.
      - name: Upload the shared 404 page
        run: >-
          aws s3 cp dist/404.html "s3://$PREVIEW_BUCKET/404.html"
          --no-progress
          --cache-control "no-cache"

      # One comment per PR, edited on every push, in both languages for Moena.
      - name: Comment the preview link
        env:
          GH_TOKEN: ${{ github.token }}
          HEAD_SHA: ${{ github.event.pull_request.head.sha }}
        run: |
          URL="https://pr-$PR_NUMBER.preview.lumineglyph.com/"
          BODY=$(printf '**Preview / プレビュー:** %s\n\nCommit / コミット: %s' "$URL" "${HEAD_SHA:0:7}")
          gh pr comment "$PR_NUMBER" --repo "$GITHUB_REPOSITORY" --edit-last --create-if-none --body "$BODY"
```

How it differs from `deploy-production`:
- **It runs only on pull requests from this repo,** and not Dependabot's. On pushes to `main` it's skipped, just as `deploy-production` is skipped on PRs.
- **`pull-requests: write`** is added, for the comment. The repo's default token stays read-only.
- **No cache clearing.** The previews distribution doesn't cache.
- **Pages are `no-cache`,** not `s-maxage`, so a browser always checks for the newest push.
- **`cancel-in-progress: true`.** For a preview only the newest push matters, and the cleanup can stop a deploy halfway.

**2. Create `.github/workflows/preview-cleanup.yml`:**
```yaml
name: Preview cleanup

# When a pull request closes (merged or not), delete its preview from the previews bucket.
# The bucket's 30-day expiry rule (infra/main/previews.tf) catches anything this misses.
on:
  pull_request:
    types: [closed]

permissions: {}

jobs:
  remove-preview:
    name: remove-preview
    # The same PRs deploy-preview runs for (pipeline.yml).
    if: >-
      github.event.pull_request.head.repo.full_name == github.repository
      && github.event.pull_request.user.login != 'dependabot[bot]'
    runs-on: ubuntu-24.04
    timeout-minutes: 5
    environment:
      name: preview
      deployment: false # use the environment's role and variables without recording a deployment
    permissions:
      id-token: write # request the OIDC token that AWS swaps for credentials
    # Shares the PR's group with deploy-preview, so closing a PR stops a preview deploy in progress.
    concurrency:
      group: preview-${{ github.event.pull_request.number }}
      cancel-in-progress: true
    env:
      PREVIEW_BUCKET: ${{ vars.PREVIEW_BUCKET }}
      PR_NUMBER: ${{ github.event.pull_request.number }}
    steps:
      - name: Sign in to AWS
        uses: aws-actions/configure-aws-credentials@e1253824e5c10ff9df46874f81ed3ec929e19cfd # v6.3.0
        with:
          role-to-assume: ${{ vars.AWS_DEPLOY_ROLE_ARN }}
          aws-region: ${{ vars.AWS_REGION }}
          role-duration-seconds: 900
          role-session-name: preview-cleanup-${{ github.event.pull_request.number }}

      - name: Delete the preview
        run: aws s3 rm "s3://$PREVIEW_BUCKET/pr-$PR_NUMBER/" --recursive --only-show-errors
```

Notes:
- **`permissions: {}`** at the top turns every permission off for the whole workflow. The job then asks only for `id-token: write`.
- **The shared `/404.html`** at the bucket root isn't deleted. It's refreshed by every preview deploy, and expires after 30 days without one.
- **No checkout and no artifact:** deleting a folder needs neither.

**3. Check both workflows:**
```sh
uvx zizmor .github/workflows/
GH_TOKEN=$(gh auth token) uvx zizmor .github/workflows/
```
- [ ] Both end with `No findings to report. Good job!` Tell Claude **before committing**; Claude diffs your files against this step.

**4. Commit:**
```sh
git add .github/workflows/pipeline.yml .github/workflows/preview-cleanup.yml
git commit -m "ci: deploy and clean up PR previews"
```

### G. CONTRIBUTING.md: Moena's guide

A guide for Moena, in Japanese and English, at the repo root. It's writing, not DevOps, so **ask Claude to draft it** ("draft CONTRIBUTING.md for step 07 G"). Then you review it, and Moena reviews the Japanese.

The draft must cover, in plain words with no engineering terms, each as numbered clicks on github.com:
1. **Change text:** open `site/src/i18n/ja.json` or `en.json` and click the pencil icon.
   - Both files have the same keys.
   - Only change the right-hand side of `"key": "value"`, inside the quotes.
   - `\n` is a line break.
   - Keep the commas and quotes.
2. **Add a work:**
   - A 16:9 screenshot of about 1600×900 (`.jpg`), plus a `.json` file copied from an existing work in `site/src/content/works/`, with the `image` name changed to match the screenshot.
   - `order` sets the position (lowest first), and the home page shows the first 4 (`topWorks` in `site/src/data/site.json`).
   - How to put both files in one pull request.
3. **Change contact links:** `site/src/data/site.json`. An empty `""` shows "Coming soon" (準備中).
4. **Save:** "Commit changes…" → "Create a **new branch** for this commit and start a pull request" → "Propose changes" → "Create pull request". Never commit to `main`; the repo refuses it anyway.
5. **Check:**
   - Wait about 5 minutes.
   - The PR gets a comment **Preview / プレビュー** with a link. Open it and check both languages, on a phone too.
   - Further edits on the same branch update the same link.
6. **If a check is red:**
   - Open "Details". `build` names the file and usually the line.
   - The usual causes are a missing comma or quote in a `.json` file, or an image name that doesn't match.
   - Or ask Matthew.
7. **Publish:** "Merge pull request" → "Confirm merge". The live site updates in about 5 minutes, and the preview is deleted.

Claude checks every path, key and button label in the draft against the repo and GitHub as they are now.

**Commit**, once you've reviewed it (Moena can review the Japanese later, in K):
```sh
git add CONTRIBUTING.md
git commit -m "docs: CONTRIBUTING guide (ja/en)"
```

### H. ADR-004

Same as ADR-003: **ask Claude to draft `docs/adr/004-pr-previews.md`** ("draft ADR-004 for step 07 H"), then reword it however you like. It covers:
- why a subdomain per PR and not a path
- why a separate bucket, distribution and role
- why caching is off
- why the `preview` environment has no branch rule
- the fork and Dependabot limitation
- the 30-day expiry
- one accepted risk: previews run under the site's own domain, so a cookie set for `lumineglyph.com` would reach them. The site sets no cookies today.

```sh
git add docs/adr/004-pr-previews.md
git commit -m "docs: ADR-004 PR previews"
```

### I. Push and PR: the first preview

**1. Push and open the PR.** This PR is the first preview: its own run uses the workflow it adds.
```sh
git push -u origin rebuild/07-previews
gh pr create --fill
gh pr checks --watch
```
- [ ] `build` passes and `deploy-preview` passes. `deploy-production` is skipped.

**2. Look at it:**
```sh
PR=$(gh pr view --json number --jq .number); echo "$PR"
gh pr view "$PR" --comments | tail -8
curl -sI "https://pr-$PR.preview.lumineglyph.com/" | grep -iE '^(HTTP|x-robots-tag|cache-control)'
```
- [ ] The PR has a comment `Preview / プレビュー: https://pr-<N>.preview.lumineglyph.com/` with the commit.
- [ ] `HTTP/2 200`, `x-robots-tag: noindex, nofollow`, `cache-control: no-cache`.
- [ ] Open the link in a browser: the site, in both languages. The PR page also has a **View deployment** button.

Tell Claude, with the PR number. Claude runs the preview checks in the checkpoint.

**3. A second push updates the same comment.** Claude will have updated PROGRESS by now. Commit and push that:
```sh
git add docs/rebuild/PROGRESS.md
git commit -m "docs(rebuild): step 07 progress"
git push
gh pr checks --watch
gh pr view "$PR" --comments | grep -c 'Preview / プレビュー'
```
- [ ] Still **1** comment, now showing the new commit.

### J. Merge: cleanup and production

**1. Merge:**
```sh
gh pr merge --merge --delete-branch
git switch main && git pull
```
Two runs start: `Preview cleanup` (from the PR closing) and `Pipeline` on `main` (build, then `deploy-production`).

**2. Watch both:**
```sh
sleep 10
gh run list --limit 4
CLEANUP_ID=$(gh run list --workflow preview-cleanup.yml --limit 1 --json databaseId --jq '.[0].databaseId')
gh run watch "$CLEANUP_ID" --exit-status
MAIN_ID=$(gh run list --workflow pipeline.yml --branch main --event push --limit 1 --json databaseId --jq '.[0].databaseId')
gh run watch "$MAIN_ID" --exit-status
```
- [ ] Both green.

**3. The preview is gone:**
```sh
aws s3 ls "s3://$(terraform -chdir=infra/main output -raw previews_bucket)/pr-$PR/" | wc -l   # 0
curl -s -o /dev/null -w '%{http_code}\n' "https://pr-$PR.preview.lumineglyph.com/"            # 404
```

**If `remove-preview` failed at "Sign in to AWS"** with `Not authorized to perform sts:AssumeRoleWithWebIdentity`, the token's `sub` didn't include the environment, because of `deployment: false`. Then:
1. Delete the `deployment: false` line, and its `name:` line too, so the job just says `environment: preview`. Do it on a new branch with a PR, as usual.
2. Delete the leftover preview by hand: `aws s3 rm "s3://<previews bucket>/pr-$PR/" --recursive`.

Tell Claude first either way.

Tell Claude the two run IDs. Claude runs the rest of the checkpoint.

### K. Moena's real test

The real check is Moena editing something real, end to end, with only `CONTRIBUTING.md` and no help.
1. She picks a small real change, for example one of the pending Japanese copy reviews in PROGRESS, or a contact link.
2. She follows the guide: edit, new branch and PR, preview link, check, merge.
3. Afterwards, note anything that confused her, and fix the guide in a follow-up PR.

She should also review the Japanese in `CONTRIBUTING.md` itself.

## Checkpoint

**Claude checks the preview (I):**
- The run: `build` and `deploy-preview` green; the log shows the artifact check, both syncs, the 404 copy and the comment.
- **The preview `sub`:** CloudTrail's `AssumeRoleWithWebIdentity` event has user `repo:lumineglyph@356493958/lumineglyph@1460696603:environment:preview`, role `lumineglyph-deploy-preview` and session `preview-<N>-<run ID>`.
- `/`, `/en/`, `/works/`, `/en/works/` on the preview: 200, the same security headers as production, plus `x-robots-tag: noindex, nofollow`.
- In the bucket: `pr-<N>/` holds the 81 files, with the right content types; `_astro/` is `immutable` and the pages are `no-cache`. `404.html` is at the root.
- `/en` → 301 `/en/`; `/nope/` → 404 with the site's 404 page; `https://pr-999999.preview.lumineglyph.com/` → 404; `https://foo.preview.lumineglyph.com/` → 404; the previews distribution's own `*.cloudfront.net` name → 404.
- The direct S3 URL of a preview file → 403.
- I.3: one comment, edited, showing the second commit.

**Claude checks the cleanup and production (J):**
- `remove-preview` green; no new deployment was recorded for it; `pr-<N>/` empty.
- `deploy-production` green; the live site unchanged and still without `x-robots-tag`.
- `terraform plan`: no changes.

**Claude reviews:**
- The preview role's policy has exactly the three actions in D's table, on the previews bucket only. The simulator denies the site bucket, CloudFront and IAM.
- The trust policy uses `StringEquals` on `aud` and `sub`, with the `preview` environment.
- `id-token: write` appears only in `deploy-production`, `deploy-preview` and `remove-preview`. `pull-requests: write` appears only in `deploy-preview`.
- zizmor: no findings.

**You check:**
- The preview looks right in a browser, on a phone too.
- K: Moena's real edit worked, and the guide is fixed where it confused her.

PROGRESS gets the previews bucket, the distribution ID, the preview role ARN and the confirmed preview `sub`.

## Commit

- Before you start: `docs(rebuild): step 07 instructions`
- A.3: `feat(infra): previews bucket`
- B.7: `feat(infra): preview viewer-request function and headers policy`
- C.4: `feat(infra): previews distribution, bucket policy and DNS`
- D.4: `feat(infra): preview deploy role`
- F.4: `ci: deploy and clean up PR previews`
- G: `docs: CONTRIBUTING guide (ja/en)`
- H: `docs: ADR-004 PR previews`
- I.3: `docs(rebuild): step 07 progress`

All merged through the PR in I–J. After the checkpoint, Claude's final PROGRESS update goes through a small PR (`docs(rebuild): complete step 07`), as in step 06. That PR gets a preview too, which is one more test.

## Notes for Claude

- Never run `apply`, `gh api -X PUT`, `gh variable set`, merges or any git write. Run `plan`, read-only `aws`, `gh api` GETs, `curl` and zizmor freely.
- **Every preview is a 404:** check that the function maps the host to the right folder (`aws cloudfront test-function` with the I PR's number), and that `pr-<N>/index.html` exists in the bucket. Then check the bucket policy's `AWS:SourceArn` and the OAC, as in step 05.
- **A preview page loads but is unstyled:** the hashed files are missing from `pr-<N>/_astro/`. Check the "Upload hashed assets" step's log.
- **`deploy-preview` fails at "Sign in to AWS":** compare CloudTrail's user (the token's `sub`) with `local.github_sub_preview`. Check that `AWS_DEPLOY_ROLE_ARN` on the `preview` environment is the **preview** role.
- **"Comment the preview link" fails** with `Resource not accessible by integration`: the job lost `pull-requests: write`. If `--edit-last` can't find the bot's own comment and posts a new one each push, report it; don't add more permissions to fix it.
- **The site function's test loop** from step 05 C.3 uses `test-events/*.json`, so it doesn't pick up `test-events/preview/`. Keep it that way.
- If a Dependabot PR ever needs a preview, someone can push an empty commit to its branch. The PR's author stays `dependabot[bot]`, though, so it's still skipped. Leave it skipped unless Matthew asks; the `build` check covers dependency updates.
- Verified 2026-11-21: the certificate's SANs, the zone's `preview` records, `Managed-CachingDisabled` (ID and settings), the function in Node (7 events), `terraform validate` on the full A–D code with provider 6.73.0, zizmor 1.32.0 (offline, online, pedantic) on both workflows, gh 2.100's `pr comment` flags, GitHub's `deployment: false` docs, and GitHub's conflicting Dependabot docs.
