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

const STEP_ACTION_KEYS = [
  "goTo",
  "click",
  "find",
  "screenshot",
  "runShell",
  "runCode",
  "checkLink",
  "httpRequest",
  "type",
  "wait",
  "loadCookie",
  "saveCookie",
  "dragAndDrop",
  "record",
  "stopRecord",
  "loadVariables",
  "setVariables",
  "openApi",
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
  /** Defaults to `process.env`. Injectable for tests. */
  env?: NodeJS.ProcessEnv;
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

  const hasDocDetectiveNpmScript = readNpmScripts(cwd);
  const outputDirGitignored = detectOutputDirGitignored(cwd, config.output);
  const nodeMajor = parseNodeMajor(process.versions.node);

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
    hasDocDetectiveNpmScript,
    outputDirGitignored,
    nodeMajor,
  };
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
    const dir = path.join(cwd, ".github", "workflows");
    if (!fs.existsSync(dir)) return false;
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
    // by default (matches the design intent of `install-agents`).
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
  let timer: NodeJS.Timeout;
  const timeoutPromise = new Promise<T>((resolve) => {
    timer = setTimeout(() => resolve(fallback), ms);
  });
  return Promise.race([p, timeoutPromise]).finally(() => clearTimeout(timer!));
}

// ---------------------------------------------------------------------
// package.json scripts probe
// ---------------------------------------------------------------------

export function readNpmScripts(cwd: string): boolean {
  try {
    const file = path.join(cwd, "package.json");
    if (!fs.existsSync(file)) return false;
    const raw = fs.readFileSync(file, "utf8");
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
    const text = readGitignoreText(cwd);
    if (text === null) return false;
    return gitignoreCovers(text, outputDir);
  } catch {
    return false;
  }
}

function readGitignoreText(start: string): string | null {
  try {
    let dir = path.resolve(start);
    for (let i = 0; i < 30; i++) {
      const file = path.join(dir, ".gitignore");
      if (fs.existsSync(file)) return fs.readFileSync(file, "utf8");
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
