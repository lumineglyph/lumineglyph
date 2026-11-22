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
