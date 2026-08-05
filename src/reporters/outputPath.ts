import fs from "node:fs";
import path from "node:path";

import { hasReportFileExtension } from "../reportExtensions.js";

export { resolveReportOutput, writeFileAtomic };

interface ResolveReportOutputArgs {
  outputPath: any;
  // Extensions this reporter writes itself (e.g. `[".xml"]`).
  ownExtensions: string[];
  // The filename this reporter uses when it isn't handed an explicit one.
  fixedName: string;
}

interface ResolvedReportOutput {
  outputDir: string;
  outputFile: string;
}

// Resolve where a fixed-filename reporter writes, given the run's single
// global `output`.
//
// Unlike the `json`/`html` reporters — which treat "not my extension" as "a
// directory" and would mkdir a folder named `results.json` — this classifies
// ANY known report extension as a file. `--output results.json --reporters
// json junit` is the natural CI invocation, and the two reporters must not
// fight over the same path.
//
//   output ends with our own extension   -> write exactly there
//   output ends with another report ext  -> write `fixedName` beside it
//   anything else                        -> `output` is a directory, write
//                                           `fixedName` inside it
function resolveReportOutput({
  outputPath,
  ownExtensions,
  fixedName,
}: ResolveReportOutputArgs): ResolvedReportOutput {
  // Coerce defensively: a programmatic caller could hand us a non-string
  // output. Mirrors the String() coercion in runFolderReporter.
  const resolved = path.resolve(String(outputPath ?? ".") || ".");
  const lower = resolved.toLowerCase();

  if (ownExtensions.some((ext) => lower.endsWith(ext.toLowerCase()))) {
    return { outputDir: path.dirname(resolved), outputFile: resolved };
  }

  const outputDir = hasReportFileExtension(resolved)
    ? path.dirname(resolved)
    : resolved;
  return { outputDir, outputFile: path.resolve(outputDir, fixedName) };
}

// Write via a sibling temp file + rename.
//
// These reporters overwrite a stable filename every run (so a CI artifact
// glob keeps finding the current results), which gives up the implicit
// crash-safety of the `-0`/`-1` suffixing the json/html reporters use: a run
// killed mid-write would otherwise leave a truncated file that GitLab's JUnit
// parser rejects. Rename is atomic within a filesystem on all three OSes, and
// Node's renameSync replaces an existing destination on Windows too.
function writeFileAtomic(outputFile: string, contents: string): void {
  // PID-qualified so two reporters (or two concurrent runs) can never collide
  // on the temp name. Same directory, so the rename never crosses devices.
  const tempFile = `${outputFile}.${process.pid}.tmp`;
  try {
    fs.writeFileSync(tempFile, contents);
    fs.renameSync(tempFile, outputFile);
  } catch (err) {
    // Best effort: don't leave the temp file behind on a failed write.
    try {
      fs.rmSync(tempFile, { force: true });
    } catch {
      // Ignore — the original error is the one worth reporting.
    }
    throw err;
  }
}
