resource "aws_cloudfront_function" "site_viewer_request" {
  name    = "lumineglyph-site-viewer-request"
  comment = "Clean URLs and www redirect for the site (infra/main/functions/site-viewer-request.js)"
  runtime = "cloudfront-js-2.0"
  publish = true # publish to LIVE so the distribution can use it
  code    = file("${path.module}/functions/site-viewer-request.js")
}
