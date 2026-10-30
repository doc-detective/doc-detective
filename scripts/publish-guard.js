#!/usr/bin/env node
// What a failed publish means for the release (ADR 01145).
//
// publish-staged-release.js runs in semantic-release's prepare step, before
// the release is tagged. When nothing reached npm, failing prepare leaves no
// tag, and a rerun retries the same version. But npm never accepts a version
// twice: once either package holds it, a retry could only reuse that package.
// A version that's partly on npm is spent. Let semantic-release tag it, so the
// next release moves past it, and fail the release from the publish step.
//
// As a CLI (the publishCmd), exits non-zero when prepare deferred a failure.

import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

export const DEFERRED_MARKER = '.tmp/publish-deferred';

// Returns prepare's exit code: 1 stops the release untagged, 0 lets it tag a
// spent version after recording why the release must still fail.
export function onPublishFailure({ version, message, packages, isPublished, marker = DEFERRED_MARKER }) {
  if (!packages.some((pkg) => isPublished(pkg, version))) return 1;
  fs.mkdirSync(path.dirname(marker), { recursive: true });
  fs.writeFileSync(marker, `${version} is partly on npm, so it can't be retried: ${message}\n`);
  return 0;
}

export function checkDeferred(marker = DEFERRED_MARKER) {
  if (!fs.existsSync(marker)) return 0;
  console.error(fs.readFileSync(marker, 'utf8').trim());
  return 1;
}

// Reusing an already-published version is only safe when npm built it from
// the commit being released. `expected` is GITHUB_SHA; a maintainer
// publishing by hand has none, so there's nothing to compare. A missing
// `published` (failed or empty lookup) is no proof, so it refuses too.
export function assertSameGitHead(pkg, version, published, expected) {
  if (expected && published !== expected) {
    throw new Error(`[${pkg}] ${version} was published from ${published || 'an unknown commit'}, not ${expected}; refusing to reuse it`);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exit(checkDeferred());
}
