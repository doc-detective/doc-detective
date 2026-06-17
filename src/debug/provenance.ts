// Config provenance collector for the diagnostic dump.
//
// Answers "where did the effective config come from?" — the resolved config
// file path, whether DOC_DETECTIVE_CONFIG / DOC_DETECTIVE_API were applied,
// and which CLI flags overrode the validated config. This mirrors the
// documented precedence chain (file → env → AJV → CLI) in setConfig
// (src/utils.ts) WITHOUT threading new state out of setConfig: everything
// here is derived from inputs the debug command already has, which keeps
// setConfig untouched and this logic pure / unit-testable.

export interface CliOverride {
  // The CLI flag spelling (without leading dashes) as declared in
  // buildYargs — e.g. "dry-run", "cache-dir", "logLevel".
  flag: string;
  // The config key it overrides after validation.
  configKey: string;
}

export interface Provenance {
  configPath: string | null;
  // DOC_DETECTIVE_CONFIG is merged over file config (and overrides it).
  docDetectiveConfigApplied: boolean;
  // DOC_DETECTIVE_API short-circuits to the orchestration API path.
  docDetectiveApiApplied: boolean;
  cliOverrides: CliOverride[];
}

// Replicates setConfig's reporters guard: `if (args.reporters != null)` then
// only overrides when the normalized list is non-empty.
function reportersPresent(reporters: unknown): boolean {
  if (reporters == null) return false;
  const list = Array.isArray(reporters) ? reporters : [reporters];
  return list.length > 0;
}

// Replicates setConfig's --test / --spec guard: comma-split, trim, drop
// empties, override only when at least one entry survives. A value like ","
// or "  " trims to nothing and does NOT override, so it must not be reported.
function commaListPresent(value: unknown): boolean {
  if (typeof value !== "string" || value.length === 0) return false;
  return (
    value
      .split(",")
      .map((s) => s.trim())
      .filter((s) => s.length > 0).length > 0
  );
}

// The CLI overrides setConfig() applies. `flag` is the declared yargs option
// name (what the user types); `argKey` is the camelCased property yargs
// exposes on argv; `configKey` is where it lands after validation. The
// `present` guard mirrors the exact check in the corresponding setConfig
// override block so this report can't claim an override setConfig skipped.
//
// NOTE: this list must be kept in sync with the override blocks in setConfig()
// (src/utils.ts). `test/debug.test.js` pins the full set, but it only asserts
// that the recognized flags fire correctly — it does NOT cross-reference
// setConfig, so a new override added there without an entry here will silently
// omit from provenance. Adding a setConfig override means adding it here AND
// updating that pinned-list assertion. (CLAUDE.md's TDD-per-flag steps include
// this.)
const OVERRIDE_SPECS: Array<{
  flag: string;
  argKey: string;
  configKey: string;
  present: (args: any) => boolean;
}> = [
  { flag: "input", argKey: "input", configKey: "input", present: (a) => Boolean(a.input) },
  { flag: "output", argKey: "output", configKey: "output", present: (a) => Boolean(a.output) },
  { flag: "logLevel", argKey: "logLevel", configKey: "logLevel", present: (a) => Boolean(a.logLevel) },
  {
    flag: "allow-unsafe",
    argKey: "allowUnsafe",
    configKey: "allowUnsafeSteps",
    present: (a) => typeof a.allowUnsafe === "boolean",
  },
  { flag: "dry-run", argKey: "dryRun", configKey: "dryRun", present: (a) => typeof a.dryRun === "boolean" },
  { flag: "reporters", argKey: "reporters", configKey: "reporters", present: (a) => reportersPresent(a.reporters) },
  { flag: "test", argKey: "test", configKey: "testFilter", present: (a) => commaListPresent(a.test) },
  { flag: "spec", argKey: "spec", configKey: "specFilter", present: (a) => commaListPresent(a.spec) },
  {
    flag: "hints",
    argKey: "hints",
    configKey: "hints.enabled",
    present: (a) => typeof a.hints === "boolean",
  },
  {
    flag: "auto-update",
    argKey: "autoUpdate",
    configKey: "autoUpdate",
    present: (a) => typeof a.autoUpdate === "boolean",
  },
  {
    flag: "auto-screenshot",
    argKey: "autoScreenshot",
    configKey: "autoScreenshot",
    present: (a) => typeof a.autoScreenshot === "boolean",
  },
  {
    flag: "cache-dir",
    argKey: "cacheDir",
    configKey: "cacheDir",
    present: (a) => typeof a.cacheDir === "string" && a.cacheDir.length > 0,
  },
  {
    flag: "concurrent-runners",
    argKey: "concurrentRunners",
    configKey: "concurrentRunners",
    present: (a) => typeof a.concurrentRunners === "string",
  },
];

export function collectCliOverrides(args: any): CliOverride[] {
  if (!args || typeof args !== "object") return [];
  const out: CliOverride[] = [];
  for (const spec of OVERRIDE_SPECS) {
    let present = false;
    try {
      present = spec.present(args);
    } catch {
      present = false;
    }
    if (present) out.push({ flag: spec.flag, configKey: spec.configKey });
  }
  return out;
}

export function collectProvenance(opts: {
  configPath?: string | null;
  args?: any;
  env?: NodeJS.ProcessEnv;
}): Provenance {
  const env = opts.env ?? process.env;
  // Empty-string env vars do NOT apply: getConfigFromEnv() /
  // getResolvedTestsFromEnv() both gate on `if (!process.env.*)`, so an empty
  // value is treated as unset. Match that with a non-empty (truthy) check.
  return {
    configPath: opts.configPath ?? null,
    docDetectiveConfigApplied: Boolean(env.DOC_DETECTIVE_CONFIG),
    docDetectiveApiApplied: Boolean(env.DOC_DETECTIVE_API),
    cliOverrides: collectCliOverrides(opts.args),
  };
}
