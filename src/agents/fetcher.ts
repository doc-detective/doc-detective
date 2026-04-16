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
}

export interface FetchDeps {
  /** HTTP GET. Injected so tests can return in-memory zip buffers. */
  get?: (url: string, config: { responseType: "arraybuffer"; timeout?: number; maxContentLength?: number }) => Promise<{ data: Buffer | ArrayBuffer }>;
  /** Filesystem access (mostly for tests that want to isolate temp dirs). */
  mkdtempSync?: (prefix: string) => string;
}

const REPO_SLUG = "doc-detective/agent-tools";
const MAX_ZIP_BYTES = 50 * 1024 * 1024;

function codeloadUrl(ref: string): string {
  return `https://codeload.github.com/${REPO_SLUG}/zip/refs/heads/${ref}`;
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

    for (const entry of entries) {
      const rel = entry.entryName.startsWith(prefix)
        ? entry.entryName.slice(prefix.length)
        : entry.entryName;
      if (!rel) continue; // skip the wrapper dir itself
      const dest = path.join(tempDir, rel);
      if (entry.isDirectory) {
        fs.mkdirSync(dest, { recursive: true });
      } else {
        fs.mkdirSync(path.dirname(dest), { recursive: true });
        fs.writeFileSync(dest, entry.getData());
      }
    }
    return { tempDir, ref };
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
