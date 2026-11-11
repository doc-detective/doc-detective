import fs from "node:fs";
import path from "node:path";

export { reportOutputDir };

// Extensions a built-in reporter writes as a report FILE. Mirrors the list in
// `runFolderBaseDir` (src/utils.ts) and `getRunOutputDir` (src/core/utils.ts).
const REPORT_FILE_EXTENSIONS = /\.(json|html?|xml|md)$/i;

// Resolve the directory a fixed-filename reporter writes into, given the run's
// single global `output`.
//
// Same rule as `runFolderBaseDir`: a known report extension always means "this
// is a file" — so `--output results.json --reporters json junit` writes
// junit.xml *beside* results.json instead of mkdir'ing a directory on top of
// the path jsonReporter is concurrently writing. Anything else is resolved by
// what is actually on disk, so a dotted directory name (`reports.v1`) is
// treated as the directory it is rather than as a file.
function reportOutputDir(outputPath: any): string {
  const resolved = path.resolve(String(outputPath ?? ".") || ".");
  if (REPORT_FILE_EXTENSIONS.test(resolved)) return path.dirname(resolved);
  try {
    return fs.statSync(resolved).isDirectory() ? resolved : path.dirname(resolved);
  } catch {
    // Not created yet — treat as a directory, matching getRunOutputDir.
    return resolved;
  }
}
