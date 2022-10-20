exports.sanitizeUri = sanitizeUri;

function sanitizeUri(uri) {
  uri = uri.trim();
  // If no protocol, add "https://"
  if (!uri.includes("://")) uri = "https://" + uri;
  return uri;
}
