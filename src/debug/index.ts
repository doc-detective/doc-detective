// Public entry point for the diagnostic dump, reachable via the
// `doc-detective debug` subcommand or `DOC_DETECTIVE_DEBUG=true`.
//
// `printDebug` collects environment information into a single structured
// object (`collectDebugData`), then renders it two ways from that one
// source of truth: a paste-friendly plaintext document printed to stdout
// (and optionally saved to `<outDir>/debug-<timestamp>.txt`) and a
// machine-readable `debug-<timestamp>.json`. Rendering from shared data
// means the two outputs can never disagree. Callers (currently src/cli.ts)
// handle `process.exit(0)` separately so tests can assert on output
// without forking.
//
// The dump runs even when config validation failed — the caller passes
// the original error as `configError`, and the renderer surfaces it under
// a CONFIG INVALID banner. The point of the flag is debugging, so "your
// config is broken" is the most useful thing we can show.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { getVersionData } from "../utils.js";
import { getBrowserDiagnostics } from "../core/config.js";
import { collectSystemInfo, type SystemInfo } from "./system.js";
import { probeAllTools, type ToolResult } from "./tools.js";
import {
  findReferencedEnvVars,
  detectContainer,
  enumerateInputFiles,
  resolveDocExtensions,
  type ContainerInfo,
} from "./envvars.js";
import { redactValue, redactObject } from "./redact.js";
import {
  renderSection,
  renderKeyValues,
  renderDocument,
  type Section,
} from "./render.js";
import { type StatusRow } from "../runtime/installer.js";
import { collectInstallStatus, type InstallData } from "./install.js";
import { collectCacheStatus, type CacheStatus } from "./cache.js";
import { collectNetworkConfig, type NetworkConfig } from "./network.js";
import { collectProvenance, type Provenance } from "./provenance.js";
import {
  collectAppiumDiagnostics,
  type AppiumDiagnostics,
} from "./appium.js";
import { computeFindings, type Finding } from "./findings.js";

export interface PrintDebugOptions {
  config: any;
  configPath?: string | null;
  configError?: Error | null;
  /**
   * When `true`, dump every `process.env` entry (redacted by name and
   * by value-shape). When falsy (the default), only env vars actually
   * referenced via `$VAR` in config / input files are listed.
   *
   * Wired from the `--include-env` flag on the `debug` subcommand.
   * Intentionally separate from container detection so users in
   * containers (the common case for env-leak risk) do NOT get an
   * implicit full env dump unless they explicitly ask for it.
   */
  includeEnv?: boolean;
  /**
   * When set, the dump is written into this directory as two timestamped
   * files — `debug-<timestamp>.txt` and `debug-<timestamp>.json` — using
   * the same timestamp printed at the top of the dump. Parent directories
   * are created. Production callers pass `defaultDebugDir()`; unit tests
   * omit it so calling `printDebug` never writes a file as a side effect.
   */
  outDir?: string;
  /**
   * The raw parsed CLI args (yargs argv). Used only by the Config provenance
   * section to report which flags overrode the validated config. Optional so
   * unit tests can call `printDebug` without synthesizing argv.
   */
  args?: any;
  print?: (line: string) => void;
}

// Where the dump is saved by default: `<cwd>/.doc-detective/`. A function
// (not a constant) because it reads the live cwd at call time.
export function defaultDebugDir(): string {
  return path.join(process.cwd(), ".doc-detective");
}

// Turn the dump's ISO timestamp into a filesystem-safe token (the `:` and
// `.` in an ISO string are illegal/awkward in filenames, notably on
// Windows). Same instant, just `-`-separated: 2026-06-13T13-40-11-123Z.
function timestampForFilename(iso: string): string {
  return iso.replace(/[:.]/g, "-");
}

// ---------------------------------------------------------------------------
// Structured data — the single source both renderers read from.
// ---------------------------------------------------------------------------

interface BrowserComponent {
  label: string;
  installed: boolean;
  detail?: string;
}
interface BrowserDiagnostic {
  name: string;
  supported: boolean;
  available: boolean;
  components: BrowserComponent[];
  note?: string;
}
interface BrowsersData {
  timedOut?: boolean;
  error?: string;
  detectionFailed?: boolean;
  browsers?: BrowserDiagnostic[];
}

interface DocDetectiveData {
  version: string;
  executionMethod?: string;
  // Directory the running doc-detective package resolves from — answers
  // "which install is npm/npx actually executing?".
  loadedFrom: string;
  // The script node was invoked with (the bin entry / npx cache path).
  entryPoint: string;
  nodeVersion?: string;
  platform?: string;
  timestamp?: string;
  dependencies: Record<string, string>;
  lockstepWarning?: string;
  error?: string;
}

interface EnvData {
  mode: "referenced" | "full";
  scannedFileCount?: number;
  variables: Array<{ name: string; value: string }>;
}

interface ConfigData {
  configPath: string | null;
  configError?: string;
  redacted: unknown;
}

export interface DebugData {
  generatedAt: string;
  system: SystemInfo;
  docDetective: DocDetectiveData;
  tools: ToolResult[];
  browsers: BrowsersData;
  install: InstallData;
  appium: AppiumDiagnostics;
  cache: CacheStatus;
  container: ContainerInfo;
  network: NetworkConfig;
  environment: EnvData;
  provenance: Provenance;
  config: ConfigData;
  findings: Finding[];
}

// Secondary cap on browser-detection latency. Detection reads
// doc-detective's installed.json record (fast); the only subprocess is the
// macOS Safari probe, which already bounds and kills itself
// (`probeSafariVersion`). This race is belt-and-suspenders for any
// unforeseen slow path — it returns `{ timedOut: true }` rather than
// cancelling the work, so the self-bounding probe is what actually
// guarantees the cap.
const BROWSER_DETECTION_TIMEOUT_MS = 5000;

async function collectDebugData(opts: PrintDebugOptions): Promise<DebugData> {
  const system = collectSystemInfo();
  const data: DebugData = {
    generatedAt: system.wallclockIso,
    system,
    docDetective: collectDocDetective(),
    tools: await probeAllTools(opts.config?.cacheDir),
    browsers: await collectBrowsers(opts.config),
    install: collectInstallStatus(opts.config),
    appium: collectAppiumStatus(opts.config),
    cache: collectCacheStatus(opts.config),
    container: detectContainer(),
    network: collectNetworkConfig(),
    environment: collectEnvVars(opts),
    provenance: collectProvenance({
      configPath: opts.configPath ?? null,
      args: opts.args,
    }),
    config: {
      configPath: opts.configPath ?? null,
      configError: opts.configError?.message,
      redacted: safeRedactConfig(opts.config),
    },
    // Computed last: the Findings layer interprets the data sections above.
    findings: [],
  };
  data.findings = computeFindings(data);
  return data;
}

// collectAppiumDiagnostics reads extensions.yaml (no subprocess) and guards
// each step, but wrap the whole call so an unforeseen throw can't abort the
// dump.
function collectAppiumStatus(config: any): AppiumDiagnostics {
  try {
    return collectAppiumDiagnostics(config);
  } catch (err: any) {
    return {
      appiumHome: null,
      appiumInstalled: false,
      extensionsManifestPath: null,
      extensionsManifestPresent: false,
      manifestError: err?.message || String(err),
      registeredDrivers: [],
      drivers: [],
    };
  }
}

function collectDocDetective(): DocDetectiveData {
  const { loadedFrom, entryPoint } = resolveLoadedFrom();
  let versionData: any;
  try {
    versionData = getVersionData();
  } catch (err: any) {
    return {
      version: "<unknown>",
      loadedFrom,
      entryPoint,
      dependencies: {},
      error: `failed to collect version data: ${err?.message || err}`,
    };
  }
  const main = versionData?.main || {};
  const ddVersion = main["doc-detective"]?.version || "<unknown>";
  const ctx = versionData?.context || {};
  const deps = versionData?.dependencies || {};

  const dependencies: Record<string, string> = {};
  let lockstepWarning: string | undefined;
  for (const depName of Object.keys(deps)) {
    const dep = deps[depName];
    const version = dep?.version || dep || "<unknown>";
    dependencies[depName] = String(version);
    if (
      depName === "doc-detective-common" &&
      typeof dep?.version === "string" &&
      typeof ddVersion === "string" &&
      ddVersion !== "<unknown>" &&
      dep.version !== ddVersion
    ) {
      lockstepWarning = `doc-detective (${ddVersion}) and doc-detective-common (${dep.version}) versions differ — they ship in lockstep, mismatch usually means a stale install.`;
    }
  }

  return {
    version: ddVersion,
    executionMethod: ctx.executionMethod,
    loadedFrom,
    entryPoint,
    nodeVersion: ctx.nodeVersion,
    platform: ctx.platform,
    timestamp: ctx.timestamp,
    dependencies,
    lockstepWarning,
  };
}

// Resolve where the running doc-detective is loaded from. `loadedFrom` is
// the package root (the first ancestor of this module with a package.json),
// which differs between a project-local `node_modules` install, a global
// install, and an `npx` cache dir. `entryPoint` is the script node ran.
function resolveLoadedFrom(): { loadedFrom: string; entryPoint: string } {
  const entryPoint = process.argv[1] || "<unknown>";
  let loadedFrom = "<unknown>";
  try {
    let dir = path.dirname(fileURLToPath(import.meta.url));
    for (let i = 0; i < 8; i++) {
      if (fs.existsSync(path.join(dir, "package.json"))) {
        loadedFrom = dir;
        break;
      }
      const parent = path.dirname(dir);
      if (parent === dir) break;
      dir = parent;
    }
  } catch {
    // Best-effort — diagnostics must never crash.
  }
  return { loadedFrom, entryPoint };
}

async function collectBrowsers(config: any): Promise<BrowsersData> {
  try {
    // getBrowserDiagnostics mutates cwd and reads process.env for
    // APPIUM_HOME; it expects a config with an `environment.platform`
    // field. Synthesize a minimal one if validation never completed.
    const safeConfig =
      config && config.environment
        ? config
        : { ...(config || {}), environment: { platform: detectPlatform() } };

    const timeoutSentinel = Symbol("browser-timeout");
    // `.unref()` so the pending timer never keeps the process alive after
    // the real probe resolves (otherwise `doc-detective debug` would idle
    // until the timer fires), and clear it once the race settles.
    let timer: ReturnType<typeof setTimeout> | undefined;
    const result = await Promise.race<any>([
      getBrowserDiagnostics({ config: safeConfig }),
      new Promise((resolve) => {
        timer = setTimeout(() => resolve(timeoutSentinel), BROWSER_DETECTION_TIMEOUT_MS);
        timer.unref?.();
      }),
    ]).finally(() => {
      if (timer) clearTimeout(timer);
    });
    if (result === timeoutSentinel) return { timedOut: true };
    return {
      detectionFailed: result.detectionFailed,
      browsers: result.browsers,
    };
  } catch (err: any) {
    return { error: err?.message || String(err) };
  }
}

function collectEnvVars(opts: PrintDebugOptions): EnvData {
  // Full env dump is OPT-IN via `--include-env`. Earlier revisions
  // auto-dumped when running in a container, but that meant common
  // PaaS-injected secrets (DATABASE_URL with embedded password, Sentry
  // DSN, webhook URLs) ended up in pasted bug reports unless every user
  // knew about the redaction regex. Now the user must explicitly ask for
  // the bulk dump; the default is the referenced-only listing.
  if (opts.includeEnv) {
    const names = Object.keys(process.env).sort();
    return {
      mode: "full",
      variables: names.map((name) => ({
        name,
        value: redactValue(name, process.env[name]),
      })),
    };
  }

  const referenced = new Set<string>();

  // 1. DOC_DETECTIVE_CONFIG raw string.
  const rawEnvConfig = process.env.DOC_DETECTIVE_CONFIG;
  if (typeof rawEnvConfig === "string") {
    for (const n of findReferencedEnvVars(rawEnvConfig)) referenced.add(n);
  }

  // 2. Config file raw source (before substitution).
  if (opts.configPath && typeof opts.configPath === "string") {
    try {
      const raw = fs.readFileSync(opts.configPath, "utf8");
      for (const n of findReferencedEnvVars(raw)) referenced.add(n);
    } catch {
      // Best-effort — if the config file is unreadable, just skip.
    }
  }

  // 3. Input files raw text. Walk config.input (already a string|array of
  //    absolute paths after setConfig). Cap the walk to 200 files so a
  //    misconfigured input pointed at "/" can't hang the dump. Scope to
  //    the extensions doc-detective actually parses (per config.fileTypes)
  //    — otherwise the `$VAR` grep matches shell/code/CI syntax in
  //    unrelated source files and floods the section with junk like `$0`.
  const inputs = normalizeInputs(opts.config?.input);
  const allowedExtensions = resolveDocExtensions(opts.config?.fileTypes);
  const files = enumerateInputFiles(inputs, 200, allowedExtensions);
  for (const file of files) {
    try {
      const raw = fs.readFileSync(file, "utf8");
      for (const n of findReferencedEnvVars(raw)) referenced.add(n);
    } catch {
      // Skip unreadable / binary files.
    }
  }

  const sorted = Array.from(referenced).sort();
  return {
    mode: "referenced",
    scannedFileCount: files.length,
    variables: sorted.map((name) => ({
      name,
      value: redactValue(name, process.env[name]),
    })),
  };
}

function safeRedactConfig(config: unknown): unknown {
  try {
    // Redact secret-looking key values and credential-shaped strings.
    // Without this the config bypasses the env-var redaction layer —
    // integrations.heretto[].apiToken, docDetectiveApi.apiKey, inline
    // webhook URLs, and anything from DOC_DETECTIVE_CONFIG would leak.
    return redactObject(config ?? {});
  } catch (err: any) {
    return `<could not process config: ${err?.message || err}>`;
  }
}

export async function printDebug(opts: PrintDebugOptions): Promise<void> {
  const print = opts.print ?? ((line: string) => console.log(line));
  const data = await collectDebugData(opts);

  const document = renderText(data, opts);
  print(document);

  // Persist copies for easy attachment to bug reports, named with the same
  // timestamp printed at the top of the dump so each run is distinct and
  // the file matches its contents. Best-effort: a write failure (read-only
  // fs, permissions) must never crash the dump.
  if (opts.outDir) {
    const stamp = timestampForFilename(data.generatedAt);
    writeFileSafe(
      path.join(opts.outDir, `debug-${stamp}.txt`),
      document + "\n",
      print,
      "Diagnostic dump saved to"
    );
    let json: string;
    try {
      json = JSON.stringify(data, null, 2);
    } catch (err: any) {
      json = JSON.stringify({
        error: `failed to serialize debug data: ${err?.message || err}`,
      });
    }
    writeFileSafe(
      path.join(opts.outDir, `debug-${stamp}.json`),
      json + "\n",
      print,
      "Diagnostic JSON saved to"
    );
  }
}

function writeFileSafe(
  file: string,
  contents: string,
  print: (line: string) => void,
  successPrefix: string
): void {
  try {
    // The dump can contain environment/config data, so keep it private to
    // the user: owner-only dir (0700) and file (0600). chmod the dir too in
    // case it already existed with looser perms. (No-ops on Windows, which
    // doesn't use POSIX modes.)
    const dir = path.dirname(file);
    fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
    try {
      fs.chmodSync(dir, 0o700);
    } catch {
      // Best-effort — not all platforms/filesystems honor chmod.
    }
    fs.writeFileSync(file, contents, { encoding: "utf8", mode: 0o600 });
    print(`\n${successPrefix} ${file}`);
  } catch (err: any) {
    print(`\n<failed to save ${file}: ${err?.message || err}>`);
  }
}

// ---------------------------------------------------------------------------
// Plaintext rendering — consumes the structured data above.
// ---------------------------------------------------------------------------

function renderText(data: DebugData, opts: PrintDebugOptions): string {
  const sections: Section[] = [
    // Findings first — it's the summary a support engineer reads before
    // scrolling into the raw data sections below.
    renderFindingsSection(data.findings),
    renderSystemSection(data.system),
    renderDocDetectiveSection(data.docDetective),
    renderToolsSection(data.tools),
    renderBrowsersSection(data.browsers),
    renderInstallSection(data.install),
    renderAppiumSection(data.appium),
    renderCacheSection(data.cache),
    renderContainerSection(data.container),
    renderNetworkSection(data.network),
    renderEnvSection(data.environment),
    renderProvenanceSection(data.provenance),
    renderConfigSection(data.config, opts.configError ?? null),
  ];
  return renderDocument(sections, data.generatedAt);
}

function renderFindingsSection(findings: Finding[]): Section {
  if (findings.length === 0) {
    return renderSection("Findings / next steps", ["  No problems detected."]);
  }
  const lines: string[] = [];
  for (const f of findings) {
    lines.push(`  [${f.severity.toUpperCase()}] ${f.title}`);
    lines.push(`    ${f.detail}`);
    if (f.fix) lines.push(`    fix: ${f.fix}`);
    lines.push("");
  }
  if (lines[lines.length - 1] === "") lines.pop();
  return renderSection("Findings / next steps", lines);
}

// Bytes → a compact human figure (MiB / GiB) for the cache free-space rows.
function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return "<unknown>";
  const units = ["B", "KiB", "MiB", "GiB", "TiB"];
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  const rounded = unit === 0 ? value : Math.round(value * 10) / 10;
  return `${rounded} ${units[unit]}`;
}

function formatInstallRow(r: StatusRow): string {
  const state = r.installed ? "installed" : "missing  ";
  const version = r.installedVersion || "—";
  const parts = [`${r.assetId.padEnd(24)} ${state}  ${version}`];
  if (r.expectedVersion) parts.push(`expected ${r.expectedVersion}`);
  if (r.latestKnownVersion) parts.push(`latest ${r.latestKnownVersion}`);
  if (r.outdated) parts.push("OUTDATED");
  return parts.join("  ");
}

function renderInstallSection(install: InstallData): Section {
  if (install.error) {
    return renderSection("Install status", [
      `  <install status failed: ${install.error}>`,
    ]);
  }
  const rows = install.rows || [];
  const npm = rows.filter((r) => r.kind === "npm");
  const browsers = rows.filter((r) => r.kind === "browser");
  const lines: string[] = [];
  lines.push(`  record: ${install.recordPath || "<unknown>"}`);
  lines.push("");
  lines.push("  npm packages:");
  if (npm.length === 0) lines.push("    <none>");
  for (const r of npm) lines.push(`    ${formatInstallRow(r)}`);
  lines.push("");
  lines.push("  browsers:");
  if (browsers.length === 0) lines.push("    <none>");
  for (const r of browsers) lines.push(`    ${formatInstallRow(r)}`);
  return renderSection("Install status", lines);
}

function renderAppiumSection(a: AppiumDiagnostics): Section {
  const lines: string[] = [];
  lines.push(`  APPIUM_HOME:      ${a.appiumHome ?? "<unset>"}`);
  lines.push(`  appium installed: ${a.appiumInstalled}`);
  const manifest = a.extensionsManifestPresent ? "present" : "absent";
  const manifestPath = a.extensionsManifestPath
    ? `  (${a.extensionsManifestPath})`
    : "";
  lines.push(`  extensions.yaml:  ${manifest}${manifestPath}`);
  if (a.manifestError) {
    lines.push(`  ! could not read extensions.yaml: ${a.manifestError}`);
  }
  lines.push("");
  lines.push("  drivers:");
  if (a.drivers.length === 0) lines.push("    <none>");
  // registered === null means the manifest wasn't read — registration is
  // unknown, not confirmed-absent. That covers two distinct cases: the
  // manifest is absent, or it's present but unreadable/unparsable.
  const unknownReason = a.manifestError ? "manifest unreadable" : "no manifest";
  for (const d of a.drivers) {
    const classification =
      d.registered === true
        ? "registered"
        : !d.npmResolvable
        ? "missing"
        : d.registered === false
        ? "resolvable but not registered"
        : `resolvable (registration unknown — ${unknownReason})`;
    lines.push(`    ${d.name.padEnd(24)} ${classification}`);
  }
  return renderSection("Appium registration", lines);
}

function renderCacheSection(cache: CacheStatus): Section {
  const lines: string[] = [];
  if (cache.error) lines.push(`  ! cache probe error: ${cache.error}`);
  for (const e of cache.entries) {
    lines.push(`  ${e.label}:`);
    lines.push(`    path:     ${e.path ?? "<unset>"}`);
    lines.push(`    exists:   ${e.exists}`);
    if (e.writable !== null) lines.push(`    writable: ${e.writable}`);
    if (e.freeBytes !== null) {
      lines.push(`    free:     ${formatBytes(e.freeBytes)}`);
    }
  }
  return renderSection("Cache & runtime", lines);
}

function renderNetworkSection(net: NetworkConfig): Section {
  const lines: string[] = [];
  if (net.variables.length === 0) {
    lines.push("  <no proxy / npm network env vars set>");
  } else {
    for (const { name, value } of net.variables) {
      lines.push(`  ${name} = ${value}`);
    }
  }
  return renderSection("Proxy / npm network", lines);
}

function renderProvenanceSection(p: Provenance): Section {
  const lines: string[] = [];
  lines.push(`  config file:          ${p.configPath || "<none>"}`);
  lines.push(
    `  DOC_DETECTIVE_CONFIG: ${
      p.docDetectiveConfigApplied ? "applied (overrides file)" : "not set"
    }`
  );
  lines.push(
    `  DOC_DETECTIVE_API:    ${p.docDetectiveApiApplied ? "applied" : "not set"}`
  );
  lines.push("");
  if (p.cliOverrides.length === 0) {
    lines.push("  CLI overrides: <none>");
  } else {
    lines.push("  CLI overrides (override file + env):");
    for (const o of p.cliOverrides) {
      lines.push(`    --${o.flag} → config.${o.configKey}`);
    }
  }
  return renderSection("Config provenance", lines);
}

function renderSystemSection(info: SystemInfo): Section {
  return renderSection(
    "System",
    renderKeyValues([
      ["platform", `${info.platform} (${info.arch})`],
      ["release", info.release],
      ["os version", info.osVersion],
      ["cpus", `${info.cpuCount} × ${info.cpuModel} @ ${info.cpuSpeedMhz}MHz`],
      ["memory", `${info.freeMemoryMb}MB free / ${info.totalMemoryMb}MB total`],
      ["uptime", `${info.uptimeSeconds}s`],
      ["hostname", info.hostname],
      ["wallclock", `${info.wallclockIso} (${info.timezone})`],
      ["pid", info.pid],
      ["ppid", info.ppid],
      ["cwd", info.cwd],
      ["argv", info.argv],
      ["execPath", info.execPath],
      ["isTTY", info.isTTY],
      ["CI", info.ci],
    ])
  );
}

function renderDocDetectiveSection(dd: DocDetectiveData): Section {
  if (dd.error) {
    return renderSection("Doc Detective", [`  <${dd.error}>`]);
  }
  const rows: Array<[string, unknown]> = [
    ["doc-detective", dd.version],
    ["executionMethod", dd.executionMethod],
    ["loadedFrom", dd.loadedFrom],
    ["entryPoint", dd.entryPoint],
    ["nodeVersion", dd.nodeVersion],
    ["platform", dd.platform],
    ["timestamp", dd.timestamp],
  ];
  for (const [depName, version] of Object.entries(dd.dependencies)) {
    rows.push([depName, version]);
  }
  const lines = renderKeyValues(rows);
  if (dd.lockstepWarning) {
    lines.push("");
    lines.push(`  ! WARNING: ${dd.lockstepWarning}`);
  }
  return renderSection("Doc Detective", lines);
}

function renderToolsSection(results: ToolResult[]): Section {
  const rows: Array<[string, unknown]> = results.map((r) => {
    const value = r.notes ? `${r.version}  (${r.notes})` : r.version;
    return [r.name, value];
  });
  // Browser/Appium drivers are reported per-browser in the Browsers section.
  return renderSection("Tools", renderKeyValues(rows));
}

function renderBrowsersSection(data: BrowsersData): Section {
  if (data.timedOut) {
    return renderSection("Browsers", [
      `  <browser detection timed out after ${BROWSER_DETECTION_TIMEOUT_MS}ms>`,
    ]);
  }
  if (data.error) {
    return renderSection("Browsers", [
      `  <browser detection failed: ${data.error}>`,
    ]);
  }
  const lines: string[] = [];
  if (data.detectionFailed) {
    lines.push(
      "  ! browser detection hit an error; component status may be incomplete."
    );
    lines.push("");
  }
  // Always enumerate every supported browser with a clear AVAILABLE /
  // NOT AVAILABLE / NOT SUPPORTED status, then break down each component
  // (browser binary, webdriver, Appium driver) so the user can see
  // exactly which piece is missing.
  for (const browser of data.browsers || []) {
    const status = !browser.supported
      ? "NOT SUPPORTED"
      : browser.available
      ? "AVAILABLE"
      : "NOT AVAILABLE";
    const note = browser.note ? `  (${browser.note})` : "";
    lines.push(`  ${browser.name.padEnd(8)} ${status}${note}`);
    for (const c of browser.components) {
      const mark = c.installed ? "installed" : "not installed";
      const detail = c.detail ? `  ${c.detail}` : "";
      lines.push(`    ${`${c.label}:`.padEnd(25)} ${mark}${detail}`);
    }
  }
  return renderSection("Browsers", lines);
}

function detectPlatform(): "linux" | "mac" | "windows" {
  switch (process.platform) {
    case "win32":
      return "windows";
    case "darwin":
      return "mac";
    default:
      return "linux";
  }
}

function renderContainerSection(info: ContainerInfo): Section {
  const lines: string[] = [];
  lines.push(...renderKeyValues([["container", info.inContainer]]));
  if (info.signals.length > 0) {
    lines.push("  signals:");
    for (const s of info.signals) lines.push(`    - ${s}`);
  }
  return renderSection("Container state", lines);
}

function renderEnvSection(env: EnvData): Section {
  if (env.mode === "full") {
    const lines: string[] = [];
    lines.push(
      `  --include-env was set — listing all ${env.variables.length} env vars (redacted by name and by value shape).`
    );
    lines.push(
      `  REVIEW BEFORE PASTING. Redaction catches common patterns but is best-effort; values with novel names or shapes may slip through.`
    );
    lines.push("");
    for (const { name, value } of env.variables) {
      lines.push(`  ${name} = ${value}`);
    }
    return renderSection("Environment variables (full)", lines);
  }

  const lines: string[] = [];
  lines.push(
    `  Scanned ${env.scannedFileCount ?? 0} documentation file(s) plus config + DOC_DETECTIVE_CONFIG for $VAR references.`
  );
  lines.push("");
  if (env.variables.length === 0) {
    lines.push("  <no $VAR references found>");
  } else {
    for (const { name, value } of env.variables) {
      lines.push(`  ${name} = ${value}`);
    }
  }
  return renderSection("Referenced environment variables", lines);
}

function normalizeInputs(input: unknown): string[] {
  if (typeof input === "string") return [input];
  if (Array.isArray(input)) {
    return input.filter((v): v is string => typeof v === "string" && v.length > 0);
  }
  return [];
}

function renderConfigSection(cfg: ConfigData, configError: Error | null): Section {
  const lines: string[] = [];
  if (configError) {
    lines.push("  === CONFIG INVALID ===");
    lines.push(`  ${configError.message}`);
    lines.push("");
    lines.push("  Best-effort raw config (validation failed):");
  } else {
    lines.push(`  configPath: ${cfg.configPath || "<none>"}`);
    lines.push("");
    lines.push("  Effective config (post-validation):");
  }
  let json: string;
  try {
    json = JSON.stringify(cfg.redacted, null, 2);
  } catch (err: any) {
    json = `<could not stringify config: ${err?.message || err}>`;
  }
  for (const l of json.split("\n")) lines.push(`  ${l}`);
  return renderSection("Config", lines);
}
