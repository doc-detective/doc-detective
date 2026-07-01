#!/usr/bin/env node

/**
 * Prune + portablize raw V8 coverage for cross-platform merge.
 *
 * Each CI matrix cell runs the suite with NODE_V8_COVERAGE pointed at a temp
 * directory, so Node writes raw V8 coverage there — one `coverage-*.json` per
 * process, each holding a `result[]` of `{ scriptId, url, functions }` for
 * EVERY script the process touched (node internals, node_modules, the repo's
 * own `dist/**`, …). That is large and its `url`s are absolute, OS-specific
 * `file://` paths, so it cannot be merged across machines as-is.
 *
 * This script rewrites each raw file in place to:
 *   1. keep ONLY entries under the repo's own `dist/` (dropping node internals,
 *      node_modules, and `dist/common/**` which has its own ratchet), and
 *   2. replace each kept `url` with an OS-agnostic path RELATIVE to `dist`
 *      (e.g. `/core/expressions.js`), so the merge job can re-root it to its own
 *      absolute `dist` path regardless of which OS produced it.
 *
 * The result is small and portable. `scripts/merge-coverage.cjs` consumes it.
 *
 * Usage:
 *   node scripts/prune-coverage.cjs [rawDir]      # default: coverage/tmp
 */

const fs = require("fs");
const path = require("path");
const { pathToFileURL } = require("url");

const rawDir = path.resolve(process.argv[2] || path.join("coverage", "tmp"));
// Absolute file:// prefix of the repo's dist, e.g. file:///home/.../dist
const distPrefix = pathToFileURL(path.resolve("dist")).href;

if (!fs.existsSync(rawDir)) {
  console.error(`prune-coverage: raw coverage directory not found: ${rawDir}`);
  console.error(
    "Run the suite with NODE_V8_COVERAGE pointed at this directory first."
  );
  process.exit(1);
}

/**
 * True for a raw V8 entry that belongs to the repo's own dist output (and not
 * the separately-ratcheted dist/common subtree).
 * @param {string|undefined} url - The entry's `file://` url.
 * @returns {boolean}
 */
function isRepoDist(url) {
  return (
    typeof url === "string" &&
    url.startsWith(distPrefix + "/") &&
    !url.startsWith(distPrefix + "/common/")
  );
}

let files = 0;
let keptEntries = 0;
let removedFiles = 0;

for (const name of fs.readdirSync(rawDir)) {
  if (!name.endsWith(".json")) continue;
  const filePath = path.join(rawDir, name);

  let data;
  try {
    data = JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch (error) {
    // A partially-written raw file is not fatal — skip it and keep going.
    console.warn(`prune-coverage: skipping unparseable ${name}: ${error.message}`);
    continue;
  }

  if (!data || !Array.isArray(data.result)) continue;

  const kept = [];
  for (const entry of data.result) {
    if (!isRepoDist(entry.url)) continue;
    // Store the path relative to dist (leading slash), OS-agnostic.
    entry.url = entry.url.slice(distPrefix.length);
    kept.push(entry);
  }

  if (kept.length === 0) {
    // Nothing from our dist here — drop the file so upload stays small.
    fs.unlinkSync(filePath);
    removedFiles++;
    continue;
  }

  data.result = kept;
  fs.writeFileSync(filePath, JSON.stringify(data));
  files++;
  keptEntries += kept.length;
}

console.log(
  `prune-coverage: pruned ${rawDir} -> ${files} file(s) kept ` +
    `(${keptEntries} dist entries), ${removedFiles} empty file(s) removed.`
);
