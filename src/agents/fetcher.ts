import path from "node:path";
import os from "node:os";
import fs from "node:fs";
import axios from "axios";
import AdmZip from "adm-zip";

export interface FetchResult {
  /** Absolute path to the extracted tree. The caller is responsible for deleting it. */
  tempDir: string;
  /** Git ref that was fetched. */
  ref: string;
  /**
   * True if the caller owns the tempDir and should delete it after use. False
   * when a test (or other caller) points at a pre-existing directory they'll
   * clean up themselves. Defaults to true when the real fetcher ran.
   */
  owned: boolean;
}

export interface FetchDeps {
  /** HTTP GET. Injected so tests can return in-memory zip buffers. */
  get?: (url: string, config: { responseType: "arraybuffer"; timeout?: number; maxContentLength?: number }) => Promise<{ data: Buffer | ArrayBuffer }>;
  /** Filesystem access (mostly for tests that want to isolate temp dirs). */
  mkdtempSync?: (prefix: string) => string;
}

const REPO_SLUG = "doc-detective/agent-tools";
const MAX_ZIP_BYTES = 50 * 1024 * 1024;

/**
 * Build the codeload archive URL for a given ref. GitHub's codeload endpoint
 * accepts `<ref>` directly (branches, tags, and full commit SHAs all resolve),
 * so we don't hard-code `refs/heads/…` and we support tags like `v1.3.0`.
 */
function codeloadUrl(ref: string): string {
  return `https://codeload.github.com/${REPO_SLUG}/zip/${ref}`;
}

/**
 * Download and extract the agent-tools repo at the given ref, stripping the
 * top-level `agent-tools-<ref>/` wrapper dir that GitHub adds to codeload zips.
 */
export async function fetchAgentToolsZip(
  ref: string = "main",
  deps: FetchDeps = {}
): Promise<FetchResult> {
  const get = deps.get ?? ((url, config) => axios.get(url, config));
  const mkdtempSync =
    deps.mkdtempSync ?? ((prefix: string) => fs.mkdtempSync(prefix));

  const tempDir = mkdtempSync(path.join(os.tmpdir(), "doc-detective-agent-tools-"));
  try {
    const response = await get(codeloadUrl(ref), {
      responseType: "arraybuffer",
      timeout: 30000,
      maxContentLength: MAX_ZIP_BYTES,
    });
    const buf = Buffer.isBuffer(response.data)
      ? response.data
      : Buffer.from(response.data);

    const zip = new AdmZip(buf);
    const entries = zip.getEntries();
    // Detect the GitHub wrapper directory (e.g. "agent-tools-main/"). It's the
    // common prefix of every entry in a codeload zip.
    const prefix = commonTopLevelPrefix(entries.map((e) => e.entryName));

    const resolvedBase = path.resolve(tempDir);
    for (const entry of entries) {
      const rel = entry.entryName.startsWith(prefix)
        ? entry.entryName.slice(prefix.length)
        : entry.entryName;
      if (!rel) continue; // skip the wrapper dir itself

      // Belt-and-suspenders zip-slip guards. The first checks the *entry name*
      // before any path computation, satisfying CodeQL's taint tracker that
      // `rel` is sanitized before it reaches `path.resolve`. The second
      // verifies (via `path.relative`) that the fully-resolved destination
      // stays inside the extraction root — this catches anything the first
      // guard misses (e.g., symlink-like canonicalization edge cases).
      if (
        path.isAbsolute(rel) ||
        rel.split(/[\\/]/).some((seg) => seg === "..") ||
        /^[a-zA-Z]:[\\/]/.test(rel)
      ) {
        throw new Error(
          `Refusing to extract zip entry with traversal path: ${entry.entryName}`
        );
      }
      const resolvedDest = path.resolve(resolvedBase, rel);
      const relativeFromBase = path.relative(resolvedBase, resolvedDest);
      if (
        relativeFromBase.startsWith("..") ||
        path.isAbsolute(relativeFromBase)
      ) {
        throw new Error(
          `Refusing to extract zip entry outside extraction root: ${entry.entryName}`
        );
      }

      if (entry.isDirectory) {
        fs.mkdirSync(resolvedDest, { recursive: true });
      } else {
        fs.mkdirSync(path.dirname(resolvedDest), { recursive: true });
        fs.writeFileSync(resolvedDest, entry.getData());
        // Preserve the unix permission bits the zip carries. GitHub codeload
        // zips store file modes in the high 16 bits of the external-attributes
        // field (adm-zip exposes this as `entry.attr`). Without this, shell
        // scripts committed as 0755 in the source repo land on disk with
        // default permissions and refuse to execute at runtime.
        const unixMode = (entry.attr >>> 16) & 0o777;
        if (unixMode !== 0) {
          try { fs.chmodSync(resolvedDest, unixMode); } catch {}
        }
      }
    }
    return { tempDir, ref, owned: true };
  } catch (err) {
    // Best-effort cleanup; propagate the original error.
    try { fs.rmSync(tempDir, { recursive: true, force: true }); } catch {}
    const reason = err instanceof Error ? err.message : String(err);
    throw new Error(
      `Failed to download agent-tools@${ref} from GitHub: ${reason}`
    );
  }
}

/**
 * Return the common top-level directory prefix across all entry names. Returns
 * "" if the entries have no shared root (treat as already-stripped).
 */
function commonTopLevelPrefix(names: string[]): string {
  if (names.length === 0) return "";
  const first = names[0];
  const slash = first.indexOf("/");
  if (slash === -1) return "";
  const candidate = first.slice(0, slash + 1);
  for (const n of names) {
    if (!n.startsWith(candidate)) return "";
  }
  return candidate;
}
