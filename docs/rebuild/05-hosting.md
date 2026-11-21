# 05 — Hosting: S3, CloudFront, security headers

## Goal

`https://lumineglyph.com` serves the site from a private S3 bucket through CloudFront, with:
- clean URLs (`/en/` loads `/en/index.html`)
- `www` redirecting to the bare domain
- strict security headers
- a real 404 page
- long-lived caching for files with a content hash in their name

The first deploy is a manual one from your machine. Step 06 automates it.

## Why it matters

This is the core of the AWS portfolio piece. These are the details interviewers ask about:
- a private bucket that only CloudFront can read
- an edge function
- security headers set at the CDN
- a caching strategy

## How this step works

Same as step 04:
- You write the files and run every `terraform apply` and upload.
- Claude runs `terraform plan` and checks it before each apply.
- `AWS_PROFILE=lumineglyph` must be **exported** in every terminal you use (`printenv AWS_PROFILE` should print it).

The order makes sure the site goes live complete:
1. **A:** the bucket.
2. **B and C:** the edge function, tested on its own, and the headers policy.
3. **D:** upload the site to the still-private bucket.
4. **E:** the CloudFront distribution and DNS. The domain only starts answering here, with the files already in place.

**What it costs:** pennies. CloudFront's always-free tier covers 1 TB and 10 million requests a month, plus 2 million function runs. S3 storage for about 2 MB, with versions, is a fraction of a cent.

## What Claude already checked (2026-11-20)

- **Provider schema.** Every Terraform argument name below was checked against the AWS provider installed in `infra/main` (v6.73.0), using `terraform providers schema -json`. CloudFront resources are global and take no `region`.
- **The 404 page** builds to `dist/404.html` at the root (Astro, `build.format: "directory"`), not `/404/index.html` as an earlier version of this file guessed.
- **TLS:** CloudFront's newest TLS 1.2 security policy is `TLSv1.2_2025`. It drops the CHACHA20 ciphers for TLS 1.2 and the SHA-224 signatures. TLS 1.3 is always on. `TLSv1.3_2025` would lock out older devices that only do TLS 1.2, so it isn't used.
- **`aws cloudfront test-function`** takes `--name`, `--if-match <ETag>`, `--stage DEVELOPMENT|LIVE` and `--event-object fileb://…`. The result is in `TestResult.FunctionOutput`, as a JSON string.
- **Content types.** `aws s3 sync` picks each file's `Content-Type` from its extension, using `/etc/mime.types` on your machine. Every extension the build produces maps correctly: html, css, js, woff2, avif, webp, jpg, png, svg, ico, xml, txt. The checkpoint confirms it on the live site.

## Before you start

**1. Branch.** `main` is protected, so the ADR-003 draft and the PROGRESS update go on this branch too:
```sh
cd ~/code/ged/lumineglyph
git switch main && git pull
git switch -c rebuild/05-hosting
git status            # docs/adr/003-aws-hosting.md (new) and docs/rebuild/PROGRESS.md (modified)
```
Reword ADR-003 whenever suits you, then:
```sh
git add docs/adr/003-aws-hosting.md docs/rebuild/PROGRESS.md docs/rebuild/05-hosting.md
git commit -m "docs: ADR-003 AWS hosting; step 05 instructions"
```

**2. Log in:**
```sh
aws sso login --profile lumineglyph
export AWS_PROFILE=lumineglyph
aws sts get-caller-identity --query Account --output text   # 421803180949
```

**3. Pick the site bucket's name**, the same way as the state bucket:
```sh
echo "lumineglyph-site-$(openssl rand -hex 3)"
```
Note it (for example `lumineglyph-site-d4e5f6`). It goes in A.1 and in PROGRESS. It isn't secret.

### A. Site bucket

**1. Create `infra/main/site.tf`.** Replace `lumineglyph-site-d4e5f6` with your name:
```hcl
# The bucket that holds the built site. Private: only the CloudFront distribution can read it
# (bucket policy in cdn.tf). There's no S3 static website hosting, because website endpoints can't be private.
resource "aws_s3_bucket" "site" {
  bucket = "lumineglyph-site-d4e5f6"
}

# Overwritten or deleted files can be recovered for 30 days.
resource "aws_s3_bucket_versioning" "site" {
  bucket = aws_s3_bucket.site.id
  versioning_configuration {
    status = "Enabled"
  }
}

resource "aws_s3_bucket_lifecycle_configuration" "site" {
  bucket = aws_s3_bucket.site.id

  rule {
    id     = "expire-old-versions"
    status = "Enabled"
    filter {}

    noncurrent_version_expiration {
      noncurrent_days = 30
    }
    abort_incomplete_multipart_upload {
      days_after_initiation = 7
    }
  }

  depends_on = [aws_s3_bucket_versioning.site]
}

resource "aws_s3_bucket_server_side_encryption_configuration" "site" {
  bucket = aws_s3_bucket.site.id
  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256" # SSE-S3; CloudFront's access control (OAC) can read it without extra KMS permissions
    }
  }
}

resource "aws_s3_bucket_public_access_block" "site" {
  bucket                  = aws_s3_bucket.site.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_ownership_controls" "site" {
  bucket = aws_s3_bucket.site.id
  rule {
    object_ownership = "BucketOwnerEnforced"
  }
}

output "site_bucket" {
  value = aws_s3_bucket.site.bucket
}
```

**2. Plan:**
```sh
cd infra/main
terraform fmt
terraform validate
terraform plan -out=main.tfplan
```
- [ ] Tell Claude, and wait for the go-ahead. Claude checks for **6 to add**: the bucket, versioning, lifecycle, encryption, public access block and ownership controls.

```sh
terraform apply main.tfplan
rm main.tfplan
cd ../..
```

**3. Commit:**
```sh
git add infra/main/site.tf
git commit -m "feat(infra): site bucket"
```

### B. Viewer-request function

S3 doesn't know that `/en/` means `/en/index.html`. CloudFront's `default_root_object` only helps for `/`. A CloudFront Function runs on every request at the edge, before the cache. It rewrites clean URLs and redirects `www`.

**1. Create `infra/main/functions/site-viewer-request.js`:**
```js
// CloudFront Function (runtime cloudfront-js-2.0) on viewer requests to the site distribution.
// - www.lumineglyph.com/... → 301 to lumineglyph.com/...
// - /path/ → /path/index.html (Astro builds each page as a folder with an index.html)
// - /path  → 301 to /path/ (matches trailingSlash: "always" in astro.config.mjs)
// Files with an extension (/_astro/x.js, /favicon.svg) pass through unchanged.
// Redirects drop the query string; the site doesn't use one.
function handler(event) {
  var request = event.request;
  var host = request.headers.host.value;

  if (host.indexOf("www.") === 0) {
    return redirect("https://" + host.slice(4) + request.uri);
  }

  var uri = request.uri;
  if (uri.endsWith("/")) {
    request.uri = uri + "index.html";
  } else if (uri.split("/").pop().indexOf(".") === -1) {
    return redirect(uri + "/");
  }
  return request;
}

function redirect(location) {
  return {
    statusCode: 301,
    statusDescription: "Moved Permanently",
    headers: { location: { value: location } },
  };
}
```

**2. Create `infra/main/functions.tf`:**
```hcl
resource "aws_cloudfront_function" "site_viewer_request" {
  name    = "lumineglyph-site-viewer-request"
  comment = "Clean URLs and www redirect for the site (infra/main/functions/site-viewer-request.js)"
  runtime = "cloudfront-js-2.0"
  publish = true # publish to LIVE so the distribution can use it
  code    = file("${path.module}/functions/site-viewer-request.js")
}
```

**3. Create five test events** in `infra/main/functions/test-events/`. They're committed, so the function can be retested after any change. Each is one request as CloudFront would pass it to the function.

`root.json`:
```json
{"version":"1.0","context":{"eventType":"viewer-request"},"viewer":{"ip":"198.51.100.1"},"request":{"method":"GET","uri":"/","querystring":{},"headers":{"host":{"value":"lumineglyph.com"}},"cookies":{}}}
```
`en-slash.json`:
```json
{"version":"1.0","context":{"eventType":"viewer-request"},"viewer":{"ip":"198.51.100.1"},"request":{"method":"GET","uri":"/en/","querystring":{},"headers":{"host":{"value":"lumineglyph.com"}},"cookies":{}}}
```
`en-no-slash.json`:
```json
{"version":"1.0","context":{"eventType":"viewer-request"},"viewer":{"ip":"198.51.100.1"},"request":{"method":"GET","uri":"/en","querystring":{},"headers":{"host":{"value":"lumineglyph.com"}},"cookies":{}}}
```
`asset.json`:
```json
{"version":"1.0","context":{"eventType":"viewer-request"},"viewer":{"ip":"198.51.100.1"},"request":{"method":"GET","uri":"/_astro/x.js","querystring":{},"headers":{"host":{"value":"lumineglyph.com"}},"cookies":{}}}
```
`www.json`:
```json
{"version":"1.0","context":{"eventType":"viewer-request"},"viewer":{"ip":"198.51.100.1"},"request":{"method":"GET","uri":"/works/","querystring":{},"headers":{"host":{"value":"www.lumineglyph.com"}},"cookies":{}}}
```

### C. Security headers

**1. Create `infra/main/headers.tf`:**
```hcl
# Security headers added to every response from the site distribution.
# The page CSP (scripts, styles, fonts, images) is a <meta> tag that Astro generates with hashes.
# This header CSP only adds directives a meta tag can't carry, such as frame-ancestors.
# It must NOT contain default-src, script-src or style-src: the browser enforces both policies,
# and these would block the inline scripts the meta tag allows. See docs/adr/002-csp-strategy.md.
resource "aws_cloudfront_response_headers_policy" "site" {
  name    = "lumineglyph-site"
  comment = "Security headers for lumineglyph.com"

  security_headers_config {
    strict_transport_security {
      access_control_max_age_sec = 63072000 # 2 years
      include_subdomains         = true
      preload                    = false # preload is hard to undo; add it later only on purpose
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
  }
}
```

**2. Plan B and C together:**
```sh
cd infra/main
terraform fmt
terraform validate
terraform plan -out=main.tfplan
```
- [ ] Tell Claude, and wait for the go-ahead. Claude checks for **2 to add**: the function and the headers policy.

```sh
terraform apply main.tfplan
rm main.tfplan
```

**3. Test the function** against the five events. Still in `infra/main`:
```sh
ETAG=$(aws cloudfront describe-function --name lumineglyph-site-viewer-request --stage DEVELOPMENT --query ETag --output text)
for f in functions/test-events/*.json; do
  printf '%-40s ' "$f"
  aws cloudfront test-function --name lumineglyph-site-viewer-request --if-match "$ETAG" --stage DEVELOPMENT \
    --event-object "fileb://$f" --query 'TestResult.FunctionOutput' --output text \
    | jq -c '{uri: .request.uri, status: .response.statusCode, location: .response.headers.location.value}'
done
cd ../..
```
- [ ] The results match:

| Event | `uri` | `status` | `location` |
|---|---|---|---|
| `asset.json` | `/_astro/x.js` | null | null |
| `en-no-slash.json` | null | 301 | `/en/` |
| `en-slash.json` | `/en/index.html` | null | null |
| `root.json` | `/index.html` | null | null |
| `www.json` | null | 301 | `https://lumineglyph.com/works/` |

If a line shows an error instead, run that one test again without `--query`/`jq` and show Claude the `FunctionErrorMessage`.

**4. Commit:**
```sh
git add infra/main/functions.tf infra/main/functions/ infra/main/headers.tf
git commit -m "feat(infra): viewer-request function and security headers policy"
```

### D. Caching strategy and first upload

Two kinds of files, uploaded with different `Cache-Control` headers:

| Files | Cache-Control | Why |
|-------|---------------|-----|
| `/_astro/*` (JS, CSS, images, fonts) | `public, max-age=31536000, immutable` | Each filename includes a hash of its content, so a changed file gets a new name. Browsers and CloudFront can keep these for a year. |
| Everything else (HTML, robots.txt, sitemaps, favicons, `prefs.js`) | `public, max-age=0, s-maxage=31536000, must-revalidate` | Browsers check back every time (a quick `304 Not Modified` when nothing changed). CloudFront keeps a copy until a deploy invalidates it. |

**1. Build:**
```sh
cd site
npm ci
npm run build
cd ..
ls site/dist/index.html site/dist/404.html site/dist/en/index.html
```

**2. Upload** to the bucket. It's still private and nothing serves it yet:
```sh
BUCKET=$(terraform -chdir=infra/main output -raw site_bucket)
echo "$BUCKET"

aws s3 sync site/dist/_astro "s3://$BUCKET/_astro" \
  --cache-control "public, max-age=31536000, immutable"

aws s3 sync site/dist "s3://$BUCKET" --delete --exclude "_astro/*" \
  --cache-control "public, max-age=0, s-maxage=31536000, must-revalidate"
```

**Order matters.** Upload the hashed assets first, then the HTML that references them. That way a visitor never gets HTML pointing at files that aren't there yet.

`--exclude "_astro/*"` also protects old hashed files from `--delete`. Someone with an older cached page still gets its CSS and JS. Old files are tiny; prune them later if you like.

- [ ] Check what landed:
```sh
aws s3 ls "s3://$BUCKET/" --recursive --summarize | tail -2     # Total Objects: about 80
aws s3api head-object --bucket "$BUCKET" --key index.html --query '[ContentType,CacheControl]'
```
`index.html` should be `text/html` with the `max-age=0, s-maxage=…` value.

Nothing to commit here: the upload changes the bucket, not the repo.

### E. Distribution and DNS

**1. Create `infra/main/cdn.tf`:**
```hcl
# CloudFront reads the private bucket through Origin Access Control (OAC): requests are signed with SigV4,
# and the bucket policy below only accepts them from this distribution.
resource "aws_cloudfront_origin_access_control" "site" {
  name                              = "lumineglyph-site"
  description                       = "CloudFront access to the site bucket"
  origin_access_control_origin_type = "s3"
  signing_behavior                  = "always"
  signing_protocol                  = "sigv4"
}

# AWS-managed cache policy: honours the Cache-Control headers set at upload, gzip and brotli on,
# and no cookies, headers or query strings in the cache key.
data "aws_cloudfront_cache_policy" "caching_optimized" {
  name = "Managed-CachingOptimized"
}

resource "aws_cloudfront_distribution" "site" {
  enabled             = true
  comment             = "lumineglyph.com"
  aliases             = [var.domain, "www.${var.domain}"]
  default_root_object = "index.html"
  http_version        = "http2and3"
  is_ipv6_enabled     = true
  price_class         = "PriceClass_200" # PriceClass_100 has no edge locations in Asia; visitors are in Japan

  origin {
    origin_id                = "site-s3"
    domain_name              = aws_s3_bucket.site.bucket_regional_domain_name
    origin_access_control_id = aws_cloudfront_origin_access_control.site.id
  }

  default_cache_behavior {
    target_origin_id           = "site-s3"
    viewer_protocol_policy     = "redirect-to-https"
    allowed_methods            = ["GET", "HEAD"]
    cached_methods             = ["GET", "HEAD"]
    compress                   = true
    cache_policy_id            = data.aws_cloudfront_cache_policy.caching_optimized.id
    response_headers_policy_id = aws_cloudfront_response_headers_policy.site.id

    function_association {
      event_type   = "viewer-request"
      function_arn = aws_cloudfront_function.site_viewer_request.arn
    }
  }

  # The bucket policy only allows s3:GetObject, not s3:ListBucket, so S3 answers 403 (not 404) for a
  # missing file. Show the site's 404 page with a real 404 status instead.
  # Error pages are fetched straight from the origin, without the viewer-request function,
  # so the path must be the real object key.
  custom_error_response {
    error_code            = 403
    response_code         = 404
    response_page_path    = "/404.html"
    error_caching_min_ttl = 60
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

# Only this distribution may read the bucket, and only over HTTPS.
data "aws_iam_policy_document" "site_bucket" {
  statement {
    sid       = "AllowCloudFrontRead"
    effect    = "Allow"
    actions   = ["s3:GetObject"]
    resources = ["${aws_s3_bucket.site.arn}/*"]

    principals {
      type        = "Service"
      identifiers = ["cloudfront.amazonaws.com"]
    }

    condition {
      test     = "StringEquals"
      variable = "AWS:SourceArn"
      values   = [aws_cloudfront_distribution.site.arn]
    }
  }

  statement {
    sid       = "DenyInsecureTransport"
    effect    = "Deny"
    actions   = ["s3:*"]
    resources = [aws_s3_bucket.site.arn, "${aws_s3_bucket.site.arn}/*"]

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

resource "aws_s3_bucket_policy" "site" {
  bucket = aws_s3_bucket.site.id
  policy = data.aws_iam_policy_document.site_bucket.json

  depends_on = [aws_s3_bucket_public_access_block.site]
}

# lumineglyph.com and www.lumineglyph.com → the distribution, over IPv4 (A) and IPv6 (AAAA).
locals {
  site_hostnames = toset([var.domain, "www.${var.domain}"])
}

resource "aws_route53_record" "site_a" {
  for_each = local.site_hostnames

  zone_id = aws_route53_zone.main.zone_id
  name    = each.value
  type    = "A"

  alias {
    name                   = aws_cloudfront_distribution.site.domain_name
    zone_id                = aws_cloudfront_distribution.site.hosted_zone_id
    evaluate_target_health = false
  }
}

resource "aws_route53_record" "site_aaaa" {
  for_each = local.site_hostnames

  zone_id = aws_route53_zone.main.zone_id
  name    = each.value
  type    = "AAAA"

  alias {
    name                   = aws_cloudfront_distribution.site.domain_name
    zone_id                = aws_cloudfront_distribution.site.hosted_zone_id
    evaluate_target_health = false
  }
}

output "site_distribution_id" {
  value = aws_cloudfront_distribution.site.id
}

output "site_distribution_domain" {
  value = aws_cloudfront_distribution.site.domain_name
}
```

**2. Plan:**
```sh
cd infra/main
terraform fmt
terraform validate
terraform plan -out=main.tfplan
```
- [ ] Tell Claude, and wait for the go-ahead. Claude checks for **7 to add**:
  - the access control (OAC)
  - the distribution
  - the bucket policy
  - four DNS records (A and AAAA for the apex and `www`)

  Nothing should change or be destroyed.

```sh
terraform apply main.tfplan
rm main.tfplan
terraform plan                      # expect: No changes
cd ../..
```
The apply waits at `aws_cloudfront_distribution.site: Still creating...` while CloudFront deploys to its edge locations, usually 5–10 minutes.

**3. First look:**
```sh
curl -sI https://lumineglyph.com/ | head -20
```
- [ ] `HTTP/2 200`, plus `strict-transport-security`, `content-security-policy` and the other headers from C. Then open `https://lumineglyph.com` in a browser.

If you get a certificate or connection error in the first minutes, wait a little: new DNS records and the distribution can take a few minutes to reach everywhere.

**4. Commit:**
```sh
git add infra/main/cdn.tf
git commit -m "feat(infra): CloudFront distribution, bucket policy and DNS"
```

### F. Push, PR, checks

```sh
git push -u origin rebuild/05-hosting
gh pr create --fill
gh pr checks --watch
```
Tell Claude. Claude runs the checkpoint below and updates PROGRESS. Meanwhile, do your own checks (listed after Claude's). Then merge:
```sh
gh pr merge --merge --delete-branch
git switch main && git pull
```

## Checkpoint

Claude runs these, all read-only:
```sh
curl -sI https://lumineglyph.com/             # 200, every header from C, HSTS
curl -sI https://lumineglyph.com/en           # 301 → /en/
curl -sI https://www.lumineglyph.com/works/   # 301 → https://lumineglyph.com/works/
curl -s -o /dev/null -w '%{http_code}' https://lumineglyph.com/nope/   # 404, and the body is the 404 page
curl -sI https://lumineglyph.com/_astro/<a real file>   # cache-control immutable; x-cache "Hit from cloudfront" on the 2nd request
curl -sI http://lumineglyph.com/              # 301 → https
curl -sI https://<bucket>.s3.ap-northeast-1.amazonaws.com/index.html   # 403: the bucket isn't public
```
Also:
- `Content-Type` is right for each file type: html, css, js, woff2, avif, webp, svg.
- Responses are compressed (`content-encoding: br` or `gzip`) when asked.
- `terraform plan`: no changes.
- The bucket policy has only the two statements, and the distribution uses `TLSv1.2_2025`.

**You check:**
- **The browser console on every page** (`/`, `/en/`, `/works/`, `/en/works/`, a 404): no CSP violations and no failed requests.
- **https://securityheaders.com:** aim for A or A+.
- **https://developer.mozilla.org/en-US/observatory:** record the grade in PROGRESS.
- **A quick look in both themes on your phone**, over mobile data rather than Wi-Fi if you can.

PROGRESS gets the bucket name, the distribution ID and the two grades.

## Commit

A.3, C.4 and E.4, plus the docs commit from "Before you start", merged through the PR in F.

## Notes for Claude

- Never run `apply` or upload to the bucket. Run `plan` and read-only `aws`/`curl` checks freely.
- If a page breaks only in production, compare the meta CSP with the header CSP first. The header must not include `default-src`, `script-src` or `style-src`.
- The custom error page fetch doesn't go through the viewer-request function, so `response_page_path` must be the real object key (`/404.html`).
- The 403→404 mapping also hides a real permissions problem: if *every* page is a 404, check the bucket policy's `AWS:SourceArn` and the OAC before anything else.
- A changed function file shows in `plan` as an in-place update to `aws_cloudfront_function.site_viewer_request`. Rerun the C.3 tests after applying.
- Step 06 turns D.2 into the pipeline's deploy job and adds `aws cloudfront create-invalidation --paths "/*"` after the HTML sync. The first deploy needs no invalidation, because nothing was cached yet.
- Verified 2026-11-20 against provider v6.73.0 (schema), the CloudFront docs (TLS policies, test-function) and the site build (`dist/404.html`).
