// Public entry point for the `--debug` / `DOC_DETECTIVE_DEBUG` dump.
//
// `printDebug` collects environment information, formats it into
// paste-friendly sections, prints to stdout, and returns. Callers
// (currently src/cli.ts) handle the `process.exit(0)` separately so
// that tests can assert on the rendered output without forking.
//
// The dump runs even when config validation failed — the caller passes
// the original error as `configError`, and the renderer surfaces it
// under a CONFIG INVALID banner. The point of the flag is debugging, so
// "your config is broken" is the most useful thing we can show.

import fs from "node:fs";
import { getVersionData } from "../utils.js";
import { getAvailableApps } from "../core/config.js";
import { collectSystemInfo } from "./system.js";
import { probeAllTools, probeAppiumDrivers } from "./tools.js";
import {
  findReferencedEnvVars,
  detectContainer,
  enumerateInputFiles,
  resolveDocExtensions,
} from "./envvars.js";
import { redactValue, redactObject } from "./redact.js";
import {
  renderSection,
  renderKeyValues,
  renderDocument,
  type Section,
} from "./render.js";

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
  print?: (line: string) => void;
}

export async function printDebug(opts: PrintDebugOptions): Promise<void> {
  const print = opts.print ?? ((line: string) => console.log(line));
  const sections: Section[] = [];

  sections.push(renderSystemSection());
  sections.push(renderDocDetectiveSection());
  sections.push(await renderToolsSection());
  sections.push(await renderBrowsersSection(opts.config));

  const containerInfo = detectContainer();
  sections.push(renderContainerSection(containerInfo));

  sections.push(renderReferencedEnvVarsSection(opts));

  sections.push(renderConfigSection(opts));

  print(renderDocument(sections));
}

function renderSystemSection(): Section {
  const info = collectSystemInfo();
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

function renderDocDetectiveSection(): Section {
  let versionData: any;
  try {
    versionData = getVersionData();
  } catch (err: any) {
    return renderSection("Doc Detective", [
      `  <failed to collect version data: ${err?.message || err}>`,
    ]);
  }
  const main = versionData?.main || {};
  const ddVersion = main["doc-detective"]?.version || "<unknown>";
  const ctx = versionData?.context || {};
  const deps = versionData?.dependencies || {};

  const rows: Array<[string, unknown]> = [
    ["doc-detective", ddVersion],
    ["executionMethod", ctx.executionMethod],
    ["nodeVersion", ctx.nodeVersion],
    ["platform", ctx.platform],
    ["timestamp", ctx.timestamp],
  ];

  // Surface every detected doc-detective-* package and warn on version drift.
  const lockstepWarnings: string[] = [];
  for (const depName of Object.keys(deps)) {
    const dep = deps[depName];
    rows.push([depName, dep?.version || dep || "<unknown>"]);
    if (
      depName === "doc-detective-common" &&
      typeof dep?.version === "string" &&
      typeof ddVersion === "string" &&
      ddVersion !== "<unknown>" &&
      dep.version !== ddVersion
    ) {
      lockstepWarnings.push(
        `  ! WARNING: doc-detective (${ddVersion}) and doc-detective-common (${dep.version}) versions differ — they ship in lockstep, mismatch usually means a stale install.`
      );
    }
  }

  const lines = renderKeyValues(rows);
  if (lockstepWarnings.length > 0) {
    lines.push("");
    lines.push(...lockstepWarnings);
  }
  return renderSection("Doc Detective", lines);
}

async function renderToolsSection(): Promise<Section> {
  const results = await probeAllTools();
  const rows: Array<[string, unknown]> = results.map((r) => {
    const value = r.notes ? `${r.version}  (${r.notes})` : r.version;
    return [r.name, value];
  });
  const lines = renderKeyValues(rows);

  // Appium drivers — separate block since the output is multi-line.
  let driversText = "<not probed>";
  try {
    driversText = await probeAppiumDrivers();
  } catch (err: any) {
    driversText = `<probe error: ${err?.message || err}>`;
  }
  lines.push("");
  lines.push("  appium drivers:");
  for (const dl of driversText.split("\n")) {
    lines.push(`    ${dl}`);
  }
  return renderSection("Tools", lines);
}

// Hard cap on browser-detection latency. `getAvailableApps` internally
// runs `npx appium driver list` with no timeout (~74s observed on cold
// caches without local Appium). Diagnostics must not block that long.
const BROWSER_DETECTION_TIMEOUT_MS = 5000;

async function renderBrowsersSection(config: any): Promise<Section> {
  try {
    // getAvailableApps mutates cwd and reads process.env for APPIUM_HOME;
    // it expects a config with an `environment.platform` field. Synthesize
    // a minimal one if validation never completed.
    const safeConfig = config && config.environment
      ? config
      : { ...(config || {}), environment: { platform: detectPlatform() } };

    const timeoutSentinel: unique symbol = Symbol("browser-timeout") as any;
    const apps = await Promise.race<any>([
      getAvailableApps({ config: safeConfig }),
      new Promise((resolve) =>
        setTimeout(() => resolve(timeoutSentinel), BROWSER_DETECTION_TIMEOUT_MS)
      ),
    ]);

    if (apps === timeoutSentinel) {
      return renderSection("Browsers", [
        `  <browser detection timed out after ${BROWSER_DETECTION_TIMEOUT_MS}ms — most often means Appium isn't installed locally, since detection shells out to \`npx appium driver list\`>`,
      ]);
    }

    if (!Array.isArray(apps) || apps.length === 0) {
      return renderSection("Browsers", [
        "  <no supported browsers detected — Chrome, Firefox, or Safari with a matching Appium driver is required>",
      ]);
    }
    const lines: string[] = [];
    for (const app of apps) {
      lines.push(`  ${app.name} ${app.version || ""}`.trimEnd());
      if (app.path) lines.push(`    path:    ${app.path}`);
      if (app.driver) lines.push(`    driver:  ${app.driver}`);
    }
    return renderSection("Browsers", lines);
  } catch (err: any) {
    return renderSection("Browsers", [
      `  <browser detection failed: ${err?.message || err}>`,
    ]);
  }
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

function renderContainerSection(info: ReturnType<typeof detectContainer>): Section {
  const lines: string[] = [];
  lines.push(...renderKeyValues([["container", info.inContainer]]));
  if (info.signals.length > 0) {
    lines.push("  signals:");
    for (const s of info.signals) lines.push(`    - ${s}`);
  }
  return renderSection("Container state", lines);
}

function renderReferencedEnvVarsSection(opts: PrintDebugOptions): Section {
  // Full env dump is OPT-IN via `--include-env`. Earlier revisions
  // auto-dumped when running in a container, but that meant common
  // PaaS-injected secrets (DATABASE_URL with embedded password, Sentry
  // DSN, webhook URLs) ended up in pasted bug reports unless every
  // user knew about the redaction regex. Now the user must explicitly
  // ask for the bulk dump; the default is the referenced-only listing
  // regardless of container state.
  if (opts.includeEnv) {
    const names = Object.keys(process.env).sort();
    const lines: string[] = [];
    lines.push(
      `  --include-env was set — listing all ${names.length} env vars (redacted by name and by value shape).`
    );
    lines.push(
      `  REVIEW BEFORE PASTING. Redaction catches common patterns but is best-effort; values with novel names or shapes may slip through.`
    );
    lines.push("");
    for (const name of names) {
      lines.push(`  ${name} = ${redactValue(name, process.env[name])}`);
    }
    return renderSection("Environment variables (full)", lines);
  }

  // Default path: collect names referenced by config + inputs only.
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

  // 3. Input files raw text. Walk config.input (already a string|array
  //    of absolute paths after setConfig). Cap the walk to 200 files so
  //    a misconfigured input pointed at "/" can't hang the dump.
  //    Scope to the extensions doc-detective actually parses (per
  //    config.fileTypes) — otherwise the `$VAR` grep matches shell/code/
  //    CI syntax in unrelated source files and floods the section with
  //    junk like `$0`, `$1`, and stray single letters.
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
  const lines: string[] = [];
  lines.push(
    `  Scanned ${files.length} documentation file(s) plus config + DOC_DETECTIVE_CONFIG for $VAR references.`
  );
  lines.push("");
  if (sorted.length === 0) {
    lines.push("  <no $VAR references found>");
  } else {
    for (const name of sorted) {
      lines.push(`  ${name} = ${redactValue(name, process.env[name])}`);
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

function renderConfigSection(opts: PrintDebugOptions): Section {
  const lines: string[] = [];
  if (opts.configError) {
    lines.push("  === CONFIG INVALID ===");
    lines.push(`  ${opts.configError.message}`);
    lines.push("");
    lines.push("  Best-effort raw config (validation failed):");
  } else {
    lines.push(`  configPath: ${opts.configPath || "<none>"}`);
    lines.push("");
    lines.push("  Effective config (post-validation):");
  }
  let json: string;
  try {
    // Walk the config object and redact secret-looking key values and
    // credential-shaped strings BEFORE stringifying. Without this, the
    // Config section bypasses the env-var redaction layer — values
    // like `integrations.heretto[].apiToken`,
    // `integrations.docDetectiveApi.apiKey`, inline webhook URLs, and
    // anything supplied via DOC_DETECTIVE_CONFIG would land in the
    // pasted bug report verbatim.
    const safeConfig = redactObject(opts.config ?? {});
    json = JSON.stringify(safeConfig, null, 2);
  } catch (err: any) {
    json = `<could not stringify config: ${err?.message || err}>`;
  }
  for (const l of json.split("\n")) lines.push(`  ${l}`);
  return renderSection("Config", lines);
}
