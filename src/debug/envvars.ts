// Env-var enumeration for the debug dump.
//
// Two collection paths:
//   1. `findReferencedEnvVars` walks raw text (config file source,
//      DOC_DETECTIVE_CONFIG env value, input file contents) for
//      `$VAR` style references — the same shape `replaceEnvs` in
//      `src/core/utils.ts` substitutes at runtime.
//   2. `detectContainer` returns a small struct describing whether
//      Doc Detective is running inside a container (IN_CONTAINER
//      canary, /.dockerenv probe, or /proc/1/cgroup substring).
//
// Both helpers are pure / cheap and safe to call in any order. File
// I/O lives in the orchestrator, not here.

import fs from "node:fs";
import path from "node:path";

// Env-var references, scoped to POSIX-valid variable names: a leading
// letter or underscore followed by letters / digits / underscores.
//
// `replaceEnvs` (in src/core/utils.ts) uses the looser `\$[a-zA-Z0-9_]+`
// shape, but that's harmless there — it only ever resolves names that
// actually exist in `process.env`, and env var names can't start with a
// digit. The debug dump GREPS raw source, so the loose shape matched
// shell positionals (`$0`, `$1`), regex backreferences (`$2`), and
// numeric tokens (`$86`) that can never be env vars — pure noise in a
// pasted report. Anchoring on a non-digit first char drops all of it
// without hiding anything `replaceEnvs` would ever substitute.
const ENV_REF_REGEX = /\$[a-zA-Z_][a-zA-Z0-9_]*/g;

export function findReferencedEnvVars(value: unknown): Set<string> {
  const found = new Set<string>();
  collect(value, found, new WeakSet());
  return found;
}

function collect(value: unknown, out: Set<string>, seen: WeakSet<object>): void {
  if (value == null) return;
  if (typeof value === "string") {
    const matches = value.match(ENV_REF_REGEX);
    if (matches) {
      for (const m of matches) out.add(m.slice(1));
    }
    return;
  }
  if (typeof value !== "object") return;
  if (seen.has(value as object)) return;
  seen.add(value as object);
  if (Array.isArray(value)) {
    for (const item of value) collect(item, out, seen);
    return;
  }
  for (const k of Object.keys(value as Record<string, unknown>)) {
    if (k === "__proto__" || k === "constructor" || k === "prototype") continue;
    collect((value as Record<string, unknown>)[k], out, seen);
  }
}

export interface ContainerInfo {
  inContainer: boolean;
  signals: string[];
}

export function detectContainer(): ContainerInfo {
  const signals: string[] = [];

  if (process.env.IN_CONTAINER === "true") {
    signals.push("IN_CONTAINER=true");
  }

  // /.dockerenv exists in Docker containers on Linux. Safe to stat on
  // Windows too — it just returns false.
  try {
    if (fs.existsSync("/.dockerenv")) signals.push("/.dockerenv exists");
  } catch {
    // Stat errors are non-fatal — diagnostics should never crash.
  }

  // /proc/1/cgroup substring check (Linux only). Skip on win32 / darwin
  // where /proc doesn't exist.
  if (process.platform === "linux") {
    try {
      const cgroup = fs.readFileSync("/proc/1/cgroup", "utf8");
      if (/docker|containerd|kubepods/.test(cgroup)) {
        signals.push("/proc/1/cgroup matches container runtime");
      }
    } catch {
      // Non-fatal — /proc/1/cgroup may not be readable.
    }
  }

  return { inContainer: signals.length > 0, signals };
}

// Default file-type → extension map, mirroring core's `defaultFileTypes`
// (src/core/config.ts). Used to scope the referenced-env-var scan to the
// files doc-detective actually parses, instead of every file in the tree
// (where the `$VAR` grep matched shell/code/CI syntax — see the dump's
// noise before this was added).
const DOC_EXTENSIONS_BY_TYPE: Record<string, string[]> = {
  markdown: ["md", "markdown", "mdx"],
  asciidoc: ["adoc", "asciidoc", "asc"],
  html: ["html", "htm"],
  dita: ["dita", "ditamap", "xml"],
};

// Resolve `config.fileTypes` into the set of lowercase extensions (no
// leading dot) that doc-detective would treat as input. Handles both the
// post-setConfig string-name form (`["markdown", "dita"]`) and richer
// object entries that carry their own `extensions` / `name` / `extends`.
// Falls back to the union of all known doc extensions when fileTypes is
// absent or yields nothing, so the scan still targets something sensible.
export function resolveDocExtensions(fileTypes: unknown): Set<string> {
  const exts = new Set<string>();
  const add = (e: unknown) => {
    if (typeof e === "string" && e.length > 0) {
      exts.add(e.replace(/^\./, "").toLowerCase());
    }
  };
  if (Array.isArray(fileTypes)) {
    for (const ft of fileTypes) {
      if (typeof ft === "string") {
        for (const e of DOC_EXTENSIONS_BY_TYPE[ft] || []) add(e);
      } else if (ft && typeof ft === "object") {
        const obj = ft as Record<string, unknown>;
        // The schema allows `extensions` as a string OR an array.
        if (typeof obj.extensions === "string") {
          add(obj.extensions);
        } else if (Array.isArray(obj.extensions)) {
          for (const e of obj.extensions) add(e);
        }
        for (const key of ["name", "extends"]) {
          const named = obj[key];
          if (typeof named === "string") {
            for (const e of DOC_EXTENSIONS_BY_TYPE[named] || []) add(e);
          }
        }
      }
    }
  }
  if (exts.size === 0) {
    for (const list of Object.values(DOC_EXTENSIONS_BY_TYPE)) {
      for (const e of list) add(e);
    }
  }
  return exts;
}

// Walk a list of input paths (files or directories) and return a list of
// readable file paths up to `cap` entries. Bounded so the debug dump can
// never hang on a giant tree. Skips node_modules and .git.
//
// When `allowedExtensions` is provided and non-empty, only files whose
// extension is in the set are returned — directories are always traversed.
// An explicitly-passed input file is returned regardless of extension
// (the user pointed at it directly); the filter only prunes files
// discovered by walking a directory.
export function enumerateInputFiles(
  inputs: string[],
  cap: number = 200,
  allowedExtensions?: Set<string>
): string[] {
  const filter =
    allowedExtensions && allowedExtensions.size > 0 ? allowedExtensions : null;
  const matches = (p: string): boolean => {
    if (!filter) return true;
    const ext = path.extname(p).replace(/^\./, "").toLowerCase();
    return filter.has(ext);
  };

  const out: string[] = [];
  const stack: string[] = [];
  const explicit = new Set<string>();
  // Canonical paths of directories already walked. Guards against cyclic
  // symlinked directory graphs (e.g. `a/link -> ..`) that would otherwise
  // keep the stack non-empty forever — a real hang risk, especially when
  // the extension filter means no files ever pass to bound the walk.
  const visitedDirs = new Set<string>();
  for (const i of inputs) {
    if (typeof i === "string" && i.length > 0) {
      stack.push(i);
      explicit.add(i);
    }
  }
  while (stack.length > 0 && out.length < cap) {
    const p = stack.shift() as string;
    let stat;
    try {
      stat = fs.statSync(p);
    } catch {
      continue;
    }
    if (stat.isFile()) {
      // Honor an explicitly-passed file path even if its extension isn't
      // a recognized doc type; only filter files found by walking dirs.
      if (explicit.has(p) || matches(p)) out.push(p);
      continue;
    }
    if (stat.isDirectory()) {
      let realDir: string;
      try {
        realDir = fs.realpathSync(p);
      } catch {
        realDir = p;
      }
      if (visitedDirs.has(realDir)) continue;
      visitedDirs.add(realDir);
      let entries: string[];
      try {
        entries = fs.readdirSync(p);
      } catch {
        continue;
      }
      for (const e of entries) {
        if (e === "node_modules" || e === ".git") continue;
        stack.push(path.join(p, e));
      }
    }
  }
  return out;
}
