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
