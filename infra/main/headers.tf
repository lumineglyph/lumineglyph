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
