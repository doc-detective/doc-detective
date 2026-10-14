/**
 * Pure text helpers shared by detection and the runner: stable content hashes
 * and line-number lookups. Kept apart from detectTests.ts (which re-exports
 * them) so the runner can use them without loading the yaml parser at startup.
 * Browser-safe: no Node built-ins.
 */

// Keys excluded when hashing a test/step definition for an ID: IDs are what
// the hash computes (or other generated IDs), and `location` shifts whenever
// unrelated content above moves in the file — including either would defeat
// run-over-run stability.
const HASH_EXCLUDED_KEYS = new Set([
  "location",
  "testId",
  "stepId",
  "contextId",
]);

/**
 * Deterministic 8-hex-char content hash (FNV-1a, 32-bit). Used to derive
 * stable fallback IDs from a test's or step's authored definition so the same
 * content produces the same ID on every run — that's what makes run-over-run
 * result comparison possible. Pure JS (no node:crypto) so it stays
 * browser-compatible.
 */
export function contentHash(value: any): string {
  // JSON.stringify returns undefined for unserializable inputs (undefined,
  // functions, symbols) and throws for circular references or BigInt. Fall
  // back to "" in both cases so ID generation degrades to a stable hash
  // instead of crashing.
  let input: string;
  if (typeof value === "string") {
    input = value;
  } else {
    try {
      input =
        JSON.stringify(value, (key, v) =>
          HASH_EXCLUDED_KEYS.has(key) ? undefined : v
        ) ?? "";
    } catch {
      input = "";
    }
  }
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

/**
 * Precomputes an array of line-start character offsets for the given content.
 * Each entry is the index of the first character on that line (0-indexed offsets, 1-indexed lines).
 */
export function getLineStarts(content: string): number[] {
  const starts: number[] = [0];
  for (let i = 0; i < content.length; i++) {
    if (content[i] === '\n') starts.push(i + 1);
  }
  return starts;
}

/**
 * Returns the 1-indexed line number for a given character index.
 * Uses binary search over precomputed line starts, or scans linearly if none provided.
 */
export function getLineNumber(content: string, index: number, lineStarts?: number[]): number {
  if (lineStarts) {
    let lo = 0, hi = lineStarts.length - 1;
    while (lo <= hi) {
      const mid = (lo + hi) >>> 1;
      if (lineStarts[mid] <= index) lo = mid + 1;
      else hi = mid - 1;
    }
    return lo; // 1-indexed: lo is the count of starts <= index
  }
  let line = 1;
  for (let i = 0; i < index; i++) {
    if (content[i] === '\n') line++;
  }
  return line;
}
