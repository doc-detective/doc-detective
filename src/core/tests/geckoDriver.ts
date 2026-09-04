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
export const GECKODRIVER_EXECUTABLE_ARGS = [
  "--allow-insecure",
  "*:custom_geckodriver_executable",
];
