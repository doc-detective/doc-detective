#!/usr/bin/env node

/**
 * Merge pruned raw V8 coverage from many CI matrix cells into one temp
 * directory that `c8 report` can turn into a single, cross-platform-union
 * coverage summary.
 *
 * Each input directory is one cell's pruned output (see
 * scripts/prune-coverage.cjs): raw `coverage-*.json` files whose kept entries
 * have OS-agnostic `url`s relative to `dist` (e.g. `/core/expressions.js`).
 * This script re-roots every such `url` to the MERGE machine's own absolute
 * `dist` `file://` path, so `c8 report` (run afterwards, on this machine, with
 * `dist` built and sources present) remaps each entry through its sourcemap to
 * the original `src/**` file exactly as the single-OS job did — only now the
 * union across every cell counts, so OS-gated branches are no longer dead.
 *
 * c8 natively aggregates multiple raw entries for the same script, so simply
 * placing every cell's (re-rooted) raw file in one temp directory yields the
 * union; no hand-rolled counter merging is needed.
 *
 * Usage:
 *   node scripts/merge-coverage.cjs <inputDir> [<inputDir> ...] [--out <dir>]
 *     --out  destination temp directory (default: coverage/tmp)
 *
 * Then: npx c8 report --temp-directory <out> ...   (reads .c8rc.json)
 */

const fs = require("fs");
const path = require("path");
const { pathToFileURL } = require("url");

const args = process.argv.slice(2);
const inputDirs = [];
let outDir = path.join("coverage", "tmp");
for (let i = 0; i < args.length; i++) {
  if (args[i] === "--out") {
    outDir = args[++i];
    if (typeof outDir !== "string" || outDir.length === 0) {
      console.error("merge-coverage: --out requires a directory value.");
      process.exit(1);
    }
  } else {
    inputDirs.push(args[i]);
  }
}

if (inputDirs.length === 0) {
  console.error(
    "merge-coverage: no input directories given.\n" +
      "Usage: node scripts/merge-coverage.cjs <inputDir> [<inputDir> ...] [--out <dir>]"
  );
  process.exit(1);
}

// Safety: the output directory is wiped below (rmSync -r -f), so refuse any
// value that isn't a real subdirectory of the cwd — a typo like `--out .` or
// `--out /` must never delete the working tree or filesystem root.
outDir = path.resolve(outDir);
const rel = path.relative(process.cwd(), outDir);
if (rel === "" || rel.startsWith("..") || path.isAbsolute(rel)) {
  console.error(
    `merge-coverage: refusing --out "${outDir}" — it must be a subdirectory of ${process.cwd()}.`
  );
  process.exit(1);
}

// The merge machine's absolute file:// prefix for the repo's dist.
const distPrefix = pathToFileURL(path.resolve("dist")).href;

// Start from a clean output directory so a re-run never mixes stale raw files.
fs.rmSync(outDir, { recursive: true, force: true });
fs.mkdirSync(outDir, { recursive: true });

let cells = 0;
let mergedFiles = 0;
let rerootedEntries = 0;

for (const dir of inputDirs) {
  const resolvedDir = path.resolve(dir);
  if (!fs.existsSync(resolvedDir)) {
    console.warn(`merge-coverage: input directory not found, skipping: ${dir}`);
    continue;
  }
  cells++;

  for (const name of fs.readdirSync(resolvedDir)) {
    if (!name.endsWith(".json")) continue;

    let data;
    try {
      data = JSON.parse(fs.readFileSync(path.join(resolvedDir, name), "utf8"));
    } catch (error) {
      console.warn(
        `merge-coverage: skipping unparseable ${dir}/${name}: ${error.message}`
      );
      continue;
    }
    if (!data || !Array.isArray(data.result)) continue;

    for (const entry of data.result) {
      // Re-root the portable, dist-relative url (e.g. `/core/expressions.js`)
      // to this machine's absolute dist file url. Entries that are already
      // absolute (defensive: an un-pruned file) are left untouched.
      if (typeof entry.url === "string" && entry.url.startsWith("/")) {
        entry.url = distPrefix + entry.url;
        rerootedEntries++;
      }
    }

    // Namespace by a per-cell index AND source directory so raw files never
    // collide — even if two input dirs share a trailing name — but KEEP the
    // `coverage-` prefix, since `c8 report` discovers raw V8 files by globbing
    // `coverage-*.json`.
    const outName = `coverage-${cells}-${path.basename(
      resolvedDir
    )}-${name.replace(/^coverage-/, "")}`;
    fs.writeFileSync(path.join(outDir, outName), JSON.stringify(data));
    mergedFiles++;
  }
}

console.log(
  `merge-coverage: merged ${cells} cell(s) -> ${outDir} ` +
    `(${mergedFiles} raw file(s), ${rerootedEntries} entries re-rooted).`
);

if (mergedFiles === 0) {
  console.error(
    "merge-coverage: no raw coverage files found in any input directory."
  );
  process.exit(1);
}
