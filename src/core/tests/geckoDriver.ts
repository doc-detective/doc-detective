// Appium server args that let the Gecko driver accept an explicit geckodriver
// binary path via the `appium:geckodriverExecutable` capability.
//
// Why this is needed at all: `appium-geckodriver` resolves its binary from that
// capability or, failing that, `fs.which('geckodriver')` — nothing else. Doc
// Detective installs geckodriver into its own browsers cache under a
// version-suffixed filename (`geckodriver-<version>`), which is neither on PATH
// nor named `geckodriver`, so without the capability the managed install can
// never be used and Firefox only works where some *other* geckodriver happens
// to be on PATH.
//
// Appium classifies the capability as an insecure feature, so the server must
// opt in by name at startup. Two things about the spelling below are load-
// bearing:
//
//   * `--allow-insecure <feature>`, never `--relaxed-security`. The latter
//     enables every insecure feature of every driver at once; this grants one
//     named feature.
//   * The scope is the wildcard `*`, not `gecko`, even though appium-
//     geckodriver's own docs say `gecko:custom_geckodriver_executable`. The
//     driver-scoped form cannot work: `isFeatureEnabled` compares the scope
//     against `this.opts.automationName` (@appium/base-driver
//     basedriver/core.js), but the only caller — geckodriver's
//     `validateDesiredCaps` — runs from `BaseDriver.createSession` BEFORE
//     `this.opts` is assigned, so the automation name is still undefined and
//     `gecko:` never matches. Verified against the real image: `gecko:` yields
//     "requires the 'custom_geckodriver_executable' insecure feature to be
//     enabled"; `*:` creates the session.
//
// What `*` widens is the DRIVER scope, not the feature: the feature name is
// still `custom_geckodriver_executable`, and appium-geckodriver is the only
// package that defines or consults it (confirmed against the drivers the image
// installs: safari, xcuitest, gecko, chromium). So the effective grant is
// exactly what `gecko:` was meant to express.
//
// This is deliberately NOT scoped to "runs that requested Firefox". The desktop
// pool's servers are shared across contexts, and cross-browser fallback (see
// buildFallbackCandidates) can land a chrome-authored context on Firefox, so a
// run that started without the flag could still need it mid-run. Passing it on
// every desktop pool server keeps the capability and the server permission
// consistent by construction; the alternative trades a silent PATH fallback for
// a hard SessionNotCreatedError. The servers are run-owned and bound to
// 127.0.0.1, and every session request on them originates from Doc Detective
// itself, so the residual surface is a driver that accepts a filesystem path
// this process already chose.
// No upstream issue is filed for the ordering bug described above (searched
// appium/appium and appium/appium-geckodriver). If one lands and is fixed,
// the driver-scoped `gecko:` form becomes usable and should replace the
// wildcard here — re-check by flipping the scope and running the Firefox
// fixture, which fails loudly if the capability stops being accepted.
export const GECKODRIVER_EXECUTABLE_ARGS = [
  "--allow-insecure",
  "*:custom_geckodriver_executable",
];

// Capabilities an authored `driverOptions` may never set.
//
// `driverOptions` is a deliberate escape hatch on a startSurface browser
// descriptor (schema: "merged into the session's capabilities after the ones
// Doc Detective computes"), and that is fine for ordinary knobs. It is not fine
// for `appium:geckodriverExecutable`: that capability is only accepted at all
// because GECKODRIVER_EXECUTABLE_ARGS opts the server in to an insecure
// feature. Before that opt-in existed, Appium rejected an authored value
// outright. Honouring one now would convert the opt-in into "a spec can name
// any local executable and Appium will spawn it" — and specs are read from
// documentation, which is not necessarily trusted input.
//
// So the computed value wins and the authored one is dropped. Only
// insecure-feature-gated capabilities belong here; ordinary overrides keep
// working, which is what the escape hatch is for.
//
// Names are stored unprefixed because the same capability has two legal
// spellings, and BOTH have to be refused:
//
//   * `appium:geckodriverExecutable` at the top level of the capabilities, and
//   * `geckodriverExecutable` inside an `appium:options` group.
//
// The group is the dangerous one: Appium gives a value inside `appium:options`
// precedence over the same capability at the root, so filtering only top-level
// keys would let `{"appium:options": {"geckodriverExecutable": "..."}}` walk
// straight past this guard and override the managed path anyway.
const PROTECTED_CAPABILITY_NAMES: readonly string[] = ["geckodriverExecutable"];

/** The W3C-prefixed spellings, for callers that want the public list. */
export const PROTECTED_CAPABILITIES: readonly string[] =
  PROTECTED_CAPABILITY_NAMES.map((name) => `appium:${name}`);

// Appium's capability-grouping key. Values inside it outrank root-level ones.
const APPIUM_OPTIONS_KEY = "appium:options";

function isProtectedCapability(key: string): boolean {
  const bare = key.startsWith("appium:") ? key.slice("appium:".length) : key;
  return PROTECTED_CAPABILITY_NAMES.includes(bare);
}

/**
 * Merge an authored `driverOptions` object into computed capabilities,
 * skipping any capability in {@link PROTECTED_CAPABILITIES} — in either
 * spelling, at the top level or nested inside an `appium:options` group.
 * Mutates and returns `caps`. `warn` (optional) is called once per refused key.
 *
 * A protected key is dropped, never substituted: if nothing computed a value
 * the capability stays absent rather than taking the authored one. An
 * `appium:options` group is copied before sanitizing, so the spec's own object
 * is never mutated (it is reused across a session retry).
 */
export function applyDriverOptions(
  caps: Record<string, any>,
  driverOptions: Record<string, any> | undefined,
  warn?: (message: string) => void
): Record<string, any> {
  const refuse = (key: string) =>
    warn?.(
      `Ignoring authored driverOptions '${key}': Doc Detective pins this capability to the driver it manages and it can't be overridden.`
    );
  for (const [key, value] of Object.entries(driverOptions ?? {})) {
    if (isProtectedCapability(key)) {
      refuse(key);
      continue;
    }
    if (
      key === APPIUM_OPTIONS_KEY &&
      value &&
      typeof value === "object" &&
      !Array.isArray(value)
    ) {
      const sanitized: Record<string, any> = {};
      for (const [nestedKey, nestedValue] of Object.entries(value)) {
        if (isProtectedCapability(nestedKey)) {
          refuse(`${APPIUM_OPTIONS_KEY}.${nestedKey}`);
          continue;
        }
        sanitized[nestedKey] = nestedValue;
      }
      caps[key] = sanitized;
      continue;
    }
    caps[key] = value;
  }
  return caps;
}
