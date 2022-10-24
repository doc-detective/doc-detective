const fs = require("fs");
const path = require("path");

exports.sanitizePath = sanitizePath;
exports.sanitizeUri = sanitizeUri;

function sanitizeUri(uri) {
  uri = uri.trim();
  // If no protocol, add "https://"
  if (!uri.includes("://")) uri = "https://" + uri;
  return uri;
}

// Resolve path and make sure it exists
function sanitizePath(filepath) {
  filepath = path.resolve(filepath);
  exists = fs.existsSync(filepath);
  if (exists) {
    return filepath;
  } else {
    return null;
  }
}
