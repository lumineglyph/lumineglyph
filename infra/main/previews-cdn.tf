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
  #checkov:skip=CKV_AWS_305:The viewer-request function maps every path, "/" included, to a pr-<N>/…/index.html key.
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
