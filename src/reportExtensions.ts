// The extensions a built-in reporter can write as a report FILE.
//
// This is the single discriminator behind "is `output` a file or a
// directory?", and three call sites depend on agreeing about it:
//
//   - `runFolderBaseDir` (src/utils.ts) — where the `.doc-detective/` archive
//     root sits.
//   - `getRunOutputDir` (src/core/utils.ts) — the stamped `runDir`. A
//     divergence from the above rejects the stamp and breaks runId/runDir
//     correlation with autoScreenshot.
//   - `resolveReportOutput` (src/reporters/outputPath.ts) — where a
//     fixed-filename reporter writes. A reporter that treated another
//     reporter's file path as a directory would mkdir over it.
//
// Keep this module dependency-free: it is imported by `src/core/utils.ts`,
// so anything it pulls in lands on the hot path of every run.

export const REPORT_FILE_EXTENSIONS = [
  ".json",
  ".html",
  ".htm",
  ".xml",
  ".md",
] as const;

// Case-insensitive, matching the historical `runFolderBaseDir` behavior —
// Windows and macOS paths routinely arrive with mixed case.
export function hasReportFileExtension(value: string): boolean {
  const lower = String(value ?? "").toLowerCase();
  return REPORT_FILE_EXTENSIONS.some((ext) => lower.endsWith(ext));
}
