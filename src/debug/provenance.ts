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
  // The CLI flag the user passed (without leading dashes).
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

// The CLI overrides setConfig() applies, paired with the config key each
// lands on. The `present` guard mirrors the exact truthiness check in the
// corresponding setConfig override block so this report can't claim an
// override that setConfig would have skipped. Keep in sync with the
// override section of setConfig in src/utils.ts.
const OVERRIDE_SPECS: Array<{
  flag: string;
  configKey: string;
  present: (args: any) => boolean;
}> = [
  { flag: "input", configKey: "input", present: (a) => Boolean(a.input) },
  { flag: "output", configKey: "output", present: (a) => Boolean(a.output) },
  { flag: "logLevel", configKey: "logLevel", present: (a) => Boolean(a.logLevel) },
  {
    flag: "allowUnsafe",
    configKey: "allowUnsafeSteps",
    present: (a) => typeof a.allowUnsafe === "boolean",
  },
  { flag: "dryRun", configKey: "dryRun", present: (a) => typeof a.dryRun === "boolean" },
  { flag: "reporters", configKey: "reporters", present: (a) => a.reporters != null },
  {
    flag: "test",
    configKey: "testFilter",
    present: (a) => typeof a.test === "string" && a.test.length > 0,
  },
  {
    flag: "spec",
    configKey: "specFilter",
    present: (a) => typeof a.spec === "string" && a.spec.length > 0,
  },
  {
    flag: "hints",
    configKey: "hints.enabled",
    present: (a) => typeof a.hints === "boolean",
  },
  {
    flag: "autoUpdate",
    configKey: "autoUpdate",
    present: (a) => typeof a.autoUpdate === "boolean",
  },
  {
    flag: "autoScreenshot",
    configKey: "autoScreenshot",
    present: (a) => typeof a.autoScreenshot === "boolean",
  },
  {
    flag: "cacheDir",
    configKey: "cacheDir",
    present: (a) => typeof a.cacheDir === "string" && a.cacheDir.length > 0,
  },
  {
    flag: "concurrentRunners",
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
  return {
    configPath: opts.configPath ?? null,
    docDetectiveConfigApplied: typeof env.DOC_DETECTIVE_CONFIG === "string",
    docDetectiveApiApplied: typeof env.DOC_DETECTIVE_API === "string",
    cliOverrides: collectCliOverrides(opts.args),
  };
}
