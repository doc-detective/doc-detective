// Builds the `HintContext` object consumed by hint predicates.
//
// All probing is local: a `.git/config` file read (walking up from `cwd`),
// a directory scan of `.github/workflows`, a `package.json` read, a
// `.gitignore` read, and a fan-out of `AgentAdapter.detect()` /
// `getInstallState()` calls bounded by per-adapter timeouts. No network
// from here; the agent adapters themselves may opportunistically check
// for plugin updates over the network, but those calls are wrapped in
// per-adapter timeouts to bound the worst case.
//
// Every probe is wrapped in try/catch and degrades to a safe default — a
// buggy `.git/config`, an unreadable workflow file, or a hung adapter
// must never take down a test run.

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import YAML from "yaml";

import type { AgentAdapter } from "../agents/types.js";
import { listAdapters } from "../agents/registry.js";
import type { AgentDetection, HintContext } from "./types.js";

// Action keys recognized by the v3 `step` schema. Kept in sync with
// `step_v3.schema.json`'s anyOf branches — extra entries here would
// silently never match real results, so this list must mirror the
// schema. Order doesn't matter; the consumer is `Set.has()`.
const STEP_ACTION_KEYS = [
  "checkLink",
  "click",
  "dragAndDrop",
  "find",
  "goTo",
  "httpRequest",
  "loadCookie",
  "loadVariables",
  "record",
  "runCode",
  "runShell",
  "saveCookie",
  "screenshot",
  "stopRecord",
  "type",
  "wait",
] as const;

const STABLE_FIND_KEYS = [
  "elementText",
  "elementAria",
  "elementTestId",
  "elementId",
  "elementClass",
  "elementAttribute",
];

/**
 * Maximum time we'll wait for each `AgentAdapter.detect()` or
 * `getInstallState()` call before giving up and treating the result as
 * "unknown / not installed". 500ms is generous for a local-only probe but
 * small enough that the worst-case post-run latency stays under a second
 * even when every adapter times out.
 */
const AGENT_PROBE_TIMEOUT_MS = 500;

export interface BuildHintContextOptions {
  config?: any;
  results?: any;
  /** Defaults to `process.cwd()`. Injectable for tests. */
  cwd?: string;
  /** Defaults to `!!process.stdout.isTTY`. Injectable for tests. */
  isTTY?: boolean;
  /** Defaults to `os.platform()`. Injectable for tests. */
  platform?: NodeJS.Platform;
  /** Defaults to `listAdapters()`. Injectable for tests. */
  adapters?: AgentAdapter[];
  /**
   * Override the agent-probe timeout. Tests with stub adapters that
   * resolve synchronously can pass `0` to disable.
   */
  agentProbeTimeoutMs?: number;
}

export async function buildHintContext(
  options: BuildHintContextOptions = {}
): Promise<HintContext> {
  const cwd = options.cwd ?? process.cwd();
  const isTTY =
    typeof options.isTTY === "boolean" ? options.isTTY : !!process.stdout.isTTY;
  const platform = options.platform ?? os.platform();
  const config = options.config ?? {};

  const gitRemoteUrl = readGitOriginUrl(cwd);
  const isGitHubRepo = gitRemoteUrl !== null && /github\.com/i.test(gitRemoteUrl);
  const hasDocDetectiveWorkflow = detectDocDetectiveWorkflow(cwd);

  const walkData = walkResults(options.results);
  const failedCount = countFailures(options.results);
  const { totalSpecs, totalTests, totalSteps } = countTotals(options.results);

  const adapters = options.adapters ?? listAdapters();
  const agentDetections = await detectAgents(
    adapters,
    typeof options.agentProbeTimeoutMs === "number"
      ? options.agentProbeTimeoutMs
      : AGENT_PROBE_TIMEOUT_MS
  );

  const packageJsonPath = findPackageJsonUpward(cwd);
  const hasPackageJson = packageJsonPath !== null;
  const hasDocDetectiveNpmScript =
    hasPackageJson && hasDocDetectiveScriptInPackageJson(packageJsonPath);
  const outputDirGitignored = detectOutputDirGitignored(cwd, config.output);
  const nodeMajor = parseNodeMajor(process.versions.node);
  const hasRstFiles = detectRstFiles(cwd);

  return {
    config,
    results: options.results ?? null,
    isTTY,
    gitRemoteUrl,
    isGitHubRepo,
    hasDocDetectiveWorkflow,
    platform,
    failedCount,
    configPath: typeof config.configPath === "string" ? config.configPath : null,
    totalSpecs,
    totalTests,
    totalSteps,
    usedStepTypes: walkData.usedStepTypes,
    usedBrowserContexts: walkData.usedBrowserContexts,
    producedScreenshots: walkData.producedScreenshots,
    producedRecordings: walkData.producedRecordings,
    usedSelectorOnlyFinds: walkData.usedSelectorOnlyFinds,
    hasRelativeUrls: walkData.hasRelativeUrls,
    hasCurlInRunShell: walkData.hasCurlInRunShell,
    hasNodeOrPythonInRunShell: walkData.hasNodeOrPythonInRunShell,
    agentDetections,
    hasPackageJson,
    hasDocDetectiveNpmScript,
    outputDirGitignored,
    nodeMajor,
    hasRstFiles,
  };
}

// ---------------------------------------------------------------------
// Walk-up helper — used by probes that need to find the nearest file
// or directory looking up from `start` to the filesystem root.
// ---------------------------------------------------------------------

/**
 * Walks up from `start` looking for the first ancestor directory that
 * contains `relativePath` (which may itself span multiple segments,
 * e.g. `.git/config` or `.github/workflows`). Returns the resolved
 * full path of the match, or `null` if none is found before hitting
 * the filesystem root. Bounded to 30 iterations as belt-and-suspenders.
 */
function findUpward(start: string, relativePath: string): string | null {
  try {
    let dir = path.resolve(start);
    for (let i = 0; i < 30; i++) {
      const candidate = path.join(dir, relativePath);
      if (fs.existsSync(candidate)) return candidate;
      const parent = path.dirname(dir);
      if (parent === dir) return null;
      dir = parent;
    }
    return null;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------
// Git origin
// ---------------------------------------------------------------------

/**
 * Walk from `start` upward looking for a `.git/config` file. When found,
 * parse out the URL of `[remote "origin"]`. Returns `null` if no repo or
 * no origin remote was found, or on any I/O / parse error.
 *
 * Stops at the filesystem root. Bounded to 30 iterations to be doubly
 * sure we never loop forever on pathological filesystems.
 */
export function readGitOriginUrl(start: string): string | null {
  try {
    let dir = path.resolve(start);
    for (let i = 0; i < 30; i++) {
      const cfg = path.join(dir, ".git", "config");
      if (fs.existsSync(cfg)) {
        const text = fs.readFileSync(cfg, "utf8");
        return parseOriginUrl(text);
      }
      const parent = path.dirname(dir);
      if (parent === dir) return null;
      dir = parent;
    }
    return null;
  } catch {
    return null;
  }
}

export function parseOriginUrl(text: string): string | null {
  const lines = text.split(/\r?\n/);
  let inOrigin = false;
  for (const raw of lines) {
    const line = raw.replace(/[#;].*$/, "").trim();
    if (line.length === 0) continue;
    const sectionMatch = line.match(/^\[(.+?)\]$/);
    if (sectionMatch) {
      const header = sectionMatch[1].trim();
      inOrigin =
        /^remote\s+"origin"$/.test(header) || header === "remote.origin";
      continue;
    }
    if (!inOrigin) continue;
    const kv = line.match(/^url\s*=\s*(.+?)\s*$/);
    if (kv) return kv[1];
  }
  return null;
}

// ---------------------------------------------------------------------
// GitHub workflow detection
// ---------------------------------------------------------------------

export function detectDocDetectiveWorkflow(cwd: string): boolean {
  try {
    // Walk up to find `.github/workflows` so running doc-detective from
    // a subdirectory still detects a workflow defined at the repo root.
    // Mirrors the walk-up done by `readGitOriginUrl` and `readGitignore`.
    const dir = findUpward(cwd, path.join(".github", "workflows"));
    if (dir === null) return false;
    const entries = fs.readdirSync(dir);
    for (const name of entries) {
      if (!/\.(ya?ml)$/i.test(name)) continue;
      const file = path.join(dir, name);
      let text: string;
      try {
        text = fs.readFileSync(file, "utf8");
      } catch {
        continue;
      }
      let doc: any;
      try {
        doc = YAML.parse(text);
      } catch {
        continue;
      }
      if (workflowReferencesDocDetective(doc)) return true;
    }
    return false;
  } catch {
    return false;
  }
}

function workflowReferencesDocDetective(doc: any): boolean {
  if (!doc || typeof doc !== "object") return false;
  const jobs = doc.jobs;
  if (!jobs || typeof jobs !== "object") return false;
  for (const jobKey of Object.keys(jobs)) {
    const job = jobs[jobKey];
    if (!job || !Array.isArray(job.steps)) continue;
    for (const step of job.steps) {
      if (!step || typeof step !== "object") continue;
      if (typeof step.uses === "string") {
        if (/^doc-detective\//i.test(step.uses)) return true;
      }
      if (typeof step.run === "string") {
        if (/(^|\s|;|&&|\|)doc-detective(\s|$)/.test(step.run)) return true;
      }
    }
  }
  return false;
}

// ---------------------------------------------------------------------
// Failure / total counts
// ---------------------------------------------------------------------

function countFailures(results: any): number {
  if (!results || typeof results !== "object") return 0;
  const summary = results.summary;
  if (!summary || typeof summary !== "object") return 0;
  let total = 0;
  for (const key of ["specs", "tests", "steps"]) {
    const node = summary[key];
    const fail = node && typeof node.fail === "number" ? node.fail : 0;
    total += fail;
  }
  return total;
}

function countTotals(results: any): {
  totalSpecs: number;
  totalTests: number;
  totalSteps: number;
} {
  const empty = { totalSpecs: 0, totalTests: 0, totalSteps: 0 };
  if (!results || typeof results !== "object") return empty;
  const summary = results.summary;
  if (!summary || typeof summary !== "object") return empty;
  return {
    totalSpecs: sumOutcomes(summary.specs),
    totalTests: sumOutcomes(summary.tests),
    totalSteps: sumOutcomes(summary.steps),
  };
}

function sumOutcomes(node: any): number {
  if (!node || typeof node !== "object") return 0;
  let total = 0;
  for (const key of ["pass", "fail", "warning", "skipped"]) {
    const v = node[key];
    if (typeof v === "number") total += v;
  }
  return total;
}

// ---------------------------------------------------------------------
// Single results walk: step types, browsers, screenshot/recording flags,
// selector-only finds, relative URLs, curl/node/python signals.
// ---------------------------------------------------------------------

interface WalkData {
  usedStepTypes: Set<string>;
  usedBrowserContexts: Set<string>;
  producedScreenshots: boolean;
  producedRecordings: boolean;
  usedSelectorOnlyFinds: boolean;
  hasRelativeUrls: boolean;
  hasCurlInRunShell: boolean;
  hasNodeOrPythonInRunShell: boolean;
}

function emptyWalkData(): WalkData {
  return {
    usedStepTypes: new Set(),
    usedBrowserContexts: new Set(),
    producedScreenshots: false,
    producedRecordings: false,
    usedSelectorOnlyFinds: false,
    hasRelativeUrls: false,
    hasCurlInRunShell: false,
    hasNodeOrPythonInRunShell: false,
  };
}

export function walkResults(results: any): WalkData {
  const data = emptyWalkData();
  if (!results || typeof results !== "object") return data;
  const specs = Array.isArray(results.specs) ? results.specs : [];
  try {
    for (const spec of specs) {
      const tests = Array.isArray(spec?.tests) ? spec.tests : [];
      for (const test of tests) {
        const contexts = Array.isArray(test?.contexts) ? test.contexts : [];
        for (const context of contexts) {
          const browserName = context?.browser?.name;
          if (typeof browserName === "string" && browserName.length > 0) {
            data.usedBrowserContexts.add(browserName);
          }
          const steps = Array.isArray(context?.steps) ? context.steps : [];
          for (const step of steps) {
            inspectStep(step, data);
          }
        }
        // Some result shapes embed steps directly under tests rather than
        // contexts (legacy / partial-failure paths). Walk those too.
        const looseSteps = Array.isArray(test?.steps) ? test.steps : [];
        for (const step of looseSteps) inspectStep(step, data);
      }
    }
  } catch {
    // Defensive: malformed result shape — return whatever we collected.
  }
  return data;
}

function inspectStep(step: any, data: WalkData): void {
  if (!step || typeof step !== "object") return;
  for (const key of STEP_ACTION_KEYS) {
    if (step[key] !== undefined) data.usedStepTypes.add(key);
  }

  // Find-step detection (selector vs stable identifier).
  inspectFindShape(step.find, data);
  inspectFindShape(step.click, data);
  inspectFindShape(step.type, data);

  // Screenshot / recording outputs.
  if (step.screenshot !== undefined) {
    if (truthyOrObject(step.screenshot)) data.producedScreenshots = true;
  }
  if (step.record !== undefined) {
    if (truthyOrObject(step.record)) data.producedRecordings = true;
  }

  // URL strings on goTo / checkLink.
  inspectUrl(step.goTo, data);
  inspectUrl(step.checkLink, data);

  // runShell command sniffing.
  const runShell = step.runShell;
  if (runShell && typeof runShell === "object") {
    const cmd = typeof runShell.command === "string" ? runShell.command : "";
    if (cmd) {
      if (/(^|\s|;|&&|\|)curl(\s|$)/.test(cmd)) data.hasCurlInRunShell = true;
      const trimmed = cmd.trimStart();
      if (/^node\s+/.test(trimmed) || /^python3?\s+/.test(trimmed)) {
        data.hasNodeOrPythonInRunShell = true;
      }
    }
  } else if (typeof runShell === "string") {
    if (/(^|\s|;|&&|\|)curl(\s|$)/.test(runShell)) data.hasCurlInRunShell = true;
    const trimmed = runShell.trimStart();
    if (/^node\s+/.test(trimmed) || /^python3?\s+/.test(trimmed)) {
      data.hasNodeOrPythonInRunShell = true;
    }
  }
}

function inspectFindShape(find: any, data: WalkData): void {
  if (!find || typeof find !== "object" || Array.isArray(find)) return;
  if (typeof find.selector === "string" && find.selector.length > 0) {
    const hasStableSibling = STABLE_FIND_KEYS.some(
      (k) => typeof find[k] === "string" && find[k].length > 0
    );
    if (!hasStableSibling) data.usedSelectorOnlyFinds = true;
  }
}

function inspectUrl(field: any, data: WalkData): void {
  if (!field) return;
  let url: string | undefined;
  if (typeof field === "string") {
    url = field;
  } else if (typeof field === "object" && typeof field.url === "string") {
    url = field.url;
  }
  if (!url) return;
  if (!/^(https?:\/\/|file:\/\/|data:)/i.test(url)) {
    data.hasRelativeUrls = true;
  }
}

function truthyOrObject(v: any): boolean {
  return v === true || (v !== null && typeof v === "object");
}

// ---------------------------------------------------------------------
// Agent detection (uses src/agents adapters)
// ---------------------------------------------------------------------

async function detectAgents(
  adapters: AgentAdapter[],
  timeoutMs: number
): Promise<AgentDetection[]> {
  if (!Array.isArray(adapters) || adapters.length === 0) return [];
  const results = await Promise.all(
    adapters.map((adapter) => probeOneAdapter(adapter, timeoutMs))
  );
  return results.filter((r): r is AgentDetection => r !== null);
}

async function probeOneAdapter(
  adapter: AgentAdapter,
  timeoutMs: number
): Promise<AgentDetection | null> {
  try {
    const detection = await withTimeout(
      adapter.detect(),
      timeoutMs,
      undefined as any
    );
    if (!detection) return null;
    if (!detection.present) {
      return {
        adapterId: adapter.id,
        displayName: adapter.displayName,
        present: false,
        hasAdapterInstalled: false,
      };
    }
    // Agent is present; check whether the doc-detective adapter is
    // installed in either scope. Probe both in parallel; treat any
    // timeout/error as "not installed" so we promote the install hint
    // by default (matches the design intent of `installAgents`).
    const scopes = adapter.supportsScopes();
    const stateProbes = scopes.map((scope) =>
      withTimeout(adapter.getInstallState(scope), timeoutMs, {
        installed: false,
      } as any).catch(() => ({ installed: false }))
    );
    const states = await Promise.all(stateProbes);
    const hasAdapterInstalled = states.some((s) => s && (s as any).installed);
    return {
      adapterId: adapter.id,
      displayName: adapter.displayName,
      present: true,
      hasAdapterInstalled,
    };
  } catch {
    return null;
  }
}

function withTimeout<T>(
  p: Promise<T>,
  ms: number,
  fallback: T
): Promise<T> {
  if (!Number.isFinite(ms) || ms <= 0) return p;
  let timer: NodeJS.Timeout | undefined;
  const timeoutPromise = new Promise<T>((resolve) => {
    timer = setTimeout(() => resolve(fallback), ms);
  });
  return Promise.race([p, timeoutPromise]).finally(() => {
    if (timer !== undefined) clearTimeout(timer);
  });
}

// ---------------------------------------------------------------------
// package.json scripts probe
// ---------------------------------------------------------------------

/**
 * Find the nearest `package.json` walking up from `cwd`. Returns the
 * full path or `null`. Walking up matches `readGitOriginUrl` /
 * `readGitignore` so probes stay consistent when doc-detective is run
 * from a subdirectory.
 */
export function findPackageJsonUpward(cwd: string): string | null {
  return findUpward(cwd, "package.json");
}

/**
 * True when ANY `scripts[*]` value in the given `package.json`
 * contains the literal substring `doc-detective`. Pure file read +
 * JSON parse; `null`/absent paths return false.
 */
export function hasDocDetectiveScriptInPackageJson(
  packageJsonPath: string | null
): boolean {
  if (!packageJsonPath) return false;
  try {
    const raw = fs.readFileSync(packageJsonPath, "utf8");
    const pkg = JSON.parse(raw);
    const scripts = pkg?.scripts;
    if (!scripts || typeof scripts !== "object") return false;
    for (const value of Object.values(scripts)) {
      if (typeof value === "string" && value.includes("doc-detective")) {
        return true;
      }
    }
    return false;
  } catch {
    return false;
  }
}

/**
 * Backwards-compatible wrapper kept for tests that exercise the
 * scripts probe in isolation. Walks up from `cwd` and forwards to
 * `hasDocDetectiveScriptInPackageJson`.
 */
export function readNpmScripts(cwd: string): boolean {
  return hasDocDetectiveScriptInPackageJson(findPackageJsonUpward(cwd));
}

// ---------------------------------------------------------------------
// .gitignore probe
// ---------------------------------------------------------------------

export function detectOutputDirGitignored(
  cwd: string,
  outputDir: any
): boolean {
  try {
    if (typeof outputDir !== "string" || outputDir.length === 0) return false;
    if (outputDir === "." || outputDir === "./") return false;
    const found = readGitignore(cwd);
    if (found === null) return false;
    // `setConfig()` resolves `args.output` to an absolute path, so the
    // common case from the CLI is `outputDir` being absolute. The
    // patterns in `.gitignore` are repo-relative, so relativize before
    // matching. If the relativization escapes the repo root (".."),
    // there's no way the .gitignore could cover it — short-circuit
    // false.
    let candidate = outputDir;
    if (path.isAbsolute(outputDir)) {
      candidate = path.relative(found.dir, outputDir);
      if (candidate.startsWith("..")) return false;
    }
    // Normalize Windows path separators to forward slashes so the
    // matcher (which expects gitignore-style patterns) works on
    // Windows-resolved absolute paths too.
    candidate = candidate.replace(/\\/g, "/");
    return gitignoreCovers(found.text, candidate);
  } catch {
    return false;
  }
}

interface GitignoreFile {
  /** Directory containing the `.gitignore` file. */
  dir: string;
  /** Raw text contents of the `.gitignore` file. */
  text: string;
}

function readGitignore(start: string): GitignoreFile | null {
  try {
    let dir = path.resolve(start);
    for (let i = 0; i < 30; i++) {
      const file = path.join(dir, ".gitignore");
      if (fs.existsSync(file)) {
        return { dir, text: fs.readFileSync(file, "utf8") };
      }
      const parent = path.dirname(dir);
      if (parent === dir) return null;
      dir = parent;
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Loose match: split into trimmed non-comment lines, normalize away
 * leading slash and trailing slash, and check if any pattern matches the
 * normalized output dir.
 *
 * Doesn't try to be a full gitignore implementation — patterns like `**`
 * and negation are rare for build-output entries, and a coarse match is
 * good enough to gate the hint.
 */
export function gitignoreCovers(text: string, outputDir: string): boolean {
  const target = stripPathDecoration(outputDir);
  if (target.length === 0) return false;
  const lines = text.split(/\r?\n/);
  for (const raw of lines) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    if (line.startsWith("!")) continue; // negation — out of scope
    const norm = stripPathDecoration(line);
    if (!norm) continue;
    // Strip trailing slash for equality comparison so "build/" matches
    // both "build" and "build/foo" target paths. We deliberately don't
    // try to honor the directory-only semantic of trailing slashes
    // because the goal is "is the output dir mentioned at all".
    const normCanonical = norm.endsWith("/") ? norm.slice(0, -1) : norm;
    if (normCanonical === target) return true;
    if (target.startsWith(normCanonical + "/")) return true;
  }
  return false;
}

function stripPathDecoration(s: string): string {
  let v = s.trim();
  if (v.startsWith("./")) v = v.slice(2);
  if (v.startsWith("/")) v = v.slice(1);
  return v;
}

// ---------------------------------------------------------------------
// Node version
// ---------------------------------------------------------------------

export function parseNodeMajor(versionString: string): number {
  if (typeof versionString !== "string") return 0;
  const m = versionString.match(/^(\d+)/);
  if (!m) return 0;
  const n = Number(m[1]);
  return Number.isFinite(n) ? n : 0;
}

// ---------------------------------------------------------------------
// RST file presence (powers useFileTypesForRst)
//
// `.mdx` and `.adoc` are intentionally NOT scanned here: both are
// already covered by the default `markdown` and `asciidoc` file-type
// templates in `src/core/config.ts` (extensions `mdx`, `adoc`,
// `asciidoc`, `asc`). Suggesting users extend `fileTypes` for those
// would be wrong. `.rst` is the only common documentation extension
// that doesn't have a default template.
// ---------------------------------------------------------------------

/** Single source of truth for the RST extension(s) we scan and refer to. */
export const RST_EXTENSIONS = [".rst"];
const RST_FILE_SCAN_LIMIT = 100;

/**
 * Returns true if any file under `cwd` (recursive, depth-first) ends
 * with a `.rst` suffix. Caps at 100 file inspections to bound the
 * worst case on huge monorepos. Skips dotted entries and
 * `node_modules`. Failures are caught and treated as "not found" so a
 * permission error never breaks the post-run summary.
 */
export function detectRstFiles(cwd: string): boolean {
  let scanned = 0;
  try {
    return scanForExtensions(cwd, RST_EXTENSIONS, () => {
      scanned += 1;
      return scanned >= RST_FILE_SCAN_LIMIT;
    });
  } catch {
    return false;
  }
}

function scanForExtensions(
  dir: string,
  extensions: string[],
  isOverBudget: () => boolean
): boolean {
  if (isOverBudget()) return false;
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return false;
  }
  for (const entry of entries) {
    if (entry.name.startsWith(".") || entry.name === "node_modules") continue;
    const full = path.join(dir, entry.name);
    if (entry.isFile()) {
      const lower = entry.name.toLowerCase();
      if (extensions.some((ext) => lower.endsWith(ext))) return true;
    } else if (entry.isDirectory()) {
      if (scanForExtensions(full, extensions, isOverBudget)) return true;
      if (isOverBudget()) return false;
    }
  }
  return false;
}
