# 05 — Hosting: S3, CloudFront, security headers

## Goal

`https://lumineglyph.com` serves the site from a private S3 bucket through CloudFront, with:
- clean URLs (`/en/` loads `/en/index.html`)
- `www` redirecting to the bare domain
- strict security headers
- a real 404 page
- long-lived caching for files with a content hash in their name

The first deploy is a manual one from your machine.

## Why it matters

This is the core of the AWS portfolio piece. A private bucket that only CloudFront can read, edge functions, security headers set at the CDN, and a caching strategy are the details interviewers ask about.

## Steps

### A. Site bucket (`site.tf`)

Settings:
- Name: something like `lumineglyph-site-<suffix>`, in `ap-northeast-1`.
- Block Public Access all on, `BucketOwnerEnforced`, SSE-S3.
- **Versioning on.** It's cheap and lets you recover deleted or overwritten files.
- A lifecycle rule that expires noncurrent versions after 30 days.

**No static website hosting.** S3's website endpoint can't be private. CloudFront reads the bucket through its REST API, signed by Origin Access Control (OAC):

```hcl
resource "aws_cloudfront_origin_access_control" "site" {
  name                              = "lumineglyph-site"
  origin_access_control_origin_type = "s3"
  signing_behavior                  = "always"
  signing_protocol                  = "sigv4"
}

data "aws_iam_policy_document" "site_bucket" {
  statement {
    sid       = "AllowCloudFrontRead"
    actions   = ["s3:GetObject"]
    resources = ["${aws_s3_bucket.site.arn}/*"]
    principals {
      type        = "Service"
      identifiers = ["cloudfront.amazonaws.com"]
    }
    condition {
      test     = "StringEquals"
      variable = "AWS:SourceArn"
      values   = [aws_cloudfront_distribution.site.arn]   # only this distribution
    }
  }
  # + the DenyInsecureTransport statement from step 04
}
```

### B. Viewer-request function

S3's REST API has no idea that `/en/` means `/en/index.html`, and CloudFront's `default_root_object` only works for `/`. A CloudFront Function, using the `cloudfront-js-2.0` runtime, handles this along with the `www` redirect:

```js
// infra/main/functions/site-viewer-request.js
function handler(event) {
  var request = event.request;
  var host = request.headers.host.value;

  // www → apex
  if (host.indexOf("www.") === 0) {
    return redirect("https://" + host.slice(4) + request.uri);
  }

  var uri = request.uri;
  if (uri.endsWith("/")) {
    request.uri = uri + "index.html";
  } else if (uri.split("/").pop().indexOf(".") === -1) {
    // "/en" → "/en/" (matches trailingSlash: "always")
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

Load it with `aws_cloudfront_function`:
```hcl
runtime = "cloudfront-js-2.0"
publish = true
code    = file("${path.module}/functions/site-viewer-request.js")
```

Test it before attaching it to the distribution:
```sh
aws cloudfront test-function --name … --if-match <ETag> --stage DEVELOPMENT --event-object fileb://test-event.json
```
Try four cases: `/en/`, `/en`, `/_astro/x.js`, and `www`. **(verify)** the exact command shape in the AWS docs.

### C. Security headers (`aws_cloudfront_response_headers_policy`)

```hcl
resource "aws_cloudfront_response_headers_policy" "site" {
  name = "lumineglyph-site"

  security_headers_config {
    strict_transport_security {
      access_control_max_age_sec = 63072000   # 2 years
      include_subdomains         = true
      preload                    = false      # preload is hard to undo; add it later only on purpose
      override                   = true
    }
    content_type_options { override = true }
    frame_options {
      frame_option = "DENY"
      override     = true
    }
    referrer_policy {
      referrer_policy = "strict-origin-when-cross-origin"
      override        = true
    }
    content_security_policy {
      # Only directives a <meta> CSP can't set (or that don't overlap with it).
      # Do NOT add default-src/script-src/style-src here; see step 02, ADR-002.
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

### D. Distribution

Key settings for `aws_cloudfront_distribution.site`. Write the full resource yourself, using the provider docs:

**Domains and certificate:**
- `aliases = [var.domain, "www.${var.domain}"]`
- `viewer_certificate`: use the ACM certificate from `aws_acm_certificate_validation.site.certificate_arn`, with `ssl_support_method = "sni-only"` and `minimum_protocol_version = "TLSv1.2_2021"`.

**Origin and caching:**
- One S3 origin using the bucket's `bucket_regional_domain_name` and `origin_access_control_id`.
- `default_cache_behavior`:
  - `viewer_protocol_policy = "redirect-to-https"`
  - `compress = true`
  - `cache_policy_id` from `data "aws_cloudfront_cache_policy"` with `name = "Managed-CachingOptimized"`
  - `response_headers_policy_id` set to the policy from C
  - a `function_association` (`event_type = "viewer-request"`) for the function from B

**Delivery:**
- `price_class = "PriceClass_200"`. PriceClass_100 has no Asian edge locations, and your visitors are in Japan.
- `http_version = "http2and3"`, `is_ipv6_enabled = true`, `default_root_object = "index.html"`.

**404 page.** With only `s3:GetObject` allowed, S3 returns **403** for a missing file, not 404. Add a `custom_error_response` mapping:
```hcl
error_code            = 403
response_code         = 404
response_page_path    = "/404/index.html"   # (verify) where Astro emitted 404 in dist/
```

**DNS.** In Route 53, create `A` and `AAAA` alias records for the apex and `www`, pointing at the distribution.

### E. Caching strategy

Two kinds of files, uploaded with different `Cache-Control` headers:

| Files | Cache-Control | Why |
|-------|---------------|-----|
| `/_astro/*` (JS, CSS, images, fonts) | `public, max-age=31536000, immutable` | Each filename includes a hash of its content, so a changed file gets a new name. These can be cached forever. |
| Everything else (HTML, robots.txt, favicon) | `public, max-age=0, s-maxage=31536000, must-revalidate` | Browsers recheck every time. CloudFront keeps the file until a deploy invalidates its cache. |

### F. First manual deploy

```sh
aws sso login --profile lumineglyph
cd site && npm run build

BUCKET=…; DIST_ID=…
aws s3 sync dist/_astro "s3://$BUCKET/_astro" \
  --cache-control "public, max-age=31536000, immutable"
aws s3 sync dist "s3://$BUCKET" --delete --exclude "_astro/*" \
  --cache-control "public, max-age=0, s-maxage=31536000, must-revalidate"
aws cloudfront create-invalidation --distribution-id "$DIST_ID" --paths "/*"
```

**Order matters.** Upload the hashed assets first, then the HTML that references them. A visitor never gets HTML pointing at files that aren't there yet.

Old `_astro/` files aren't deleted, so someone with a cached old page still works. They're tiny; prune them later if you like.

Step 06 turns this into the pipeline's deploy job.

## Checkpoint

Claude runs:
```sh
curl -sI https://lumineglyph.com/            # 200, all security headers present, HSTS
curl -sI https://lumineglyph.com/en          # 301 → /en/
curl -sI https://www.lumineglyph.com/works/  # 301 → https://lumineglyph.com/works/
curl -sI https://lumineglyph.com/nope/       # 404 with the 404 page body
curl -sI https://lumineglyph.com/_astro/<some file>   # cache-control immutable, x-cache Hit on 2nd request
curl -sI http://lumineglyph.com/             # 301 → https
aws s3api get-object --bucket <bucket> --key index.html /dev/null   # with your creds: works
curl -sI https://<bucket>.s3.ap-northeast-1.amazonaws.com/index.html  # 403: bucket not public
```

Then you check:
- the browser console on every page: no CSP violations
- https://securityheaders.com: aim for A or A+
- https://developer.mozilla.org/en-US/observatory: record the grade in PROGRESS

PROGRESS gets the bucket name and distribution ID.

## Commit

`feat(infra): S3 + CloudFront hosting with security headers`

## Notes for Claude

- If a page breaks only in production, compare the meta CSP with the header CSP first. The header must not include script, style or default directives.
- The custom error page fetch doesn't go through the viewer-request function, so `response_page_path` must point at the real object key.
