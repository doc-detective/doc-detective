// Interpretation layer for the diagnostic dump.
//
// Pure functions over the already-collected DebugData (no I/O, no probing —
// the data sections did that). Each rule turns a data condition into a
// human-readable Finding with, where possible, the exact fix command. This
// is what makes the dump self-service for support: instead of "Chrome NOT
// AVAILABLE", the user sees "→ run `doc-detective install runtime`".
//
// Modeled on the hints philosophy in src/hints/: small, pure, concrete.
// `import type` keeps this a compile-time-only dependency on index.ts, so
// there's no runtime import cycle.

import type { DebugData } from "./index.js";

export interface Finding {
  severity: "error" | "warning" | "info";
  title: string;
  detail: string;
  fix?: string;
}

type Rule = (data: DebugData) => Finding | null;

function findDriver(data: DebugData, pkg: string) {
  return (data.appium?.drivers || []).find((d) => d.name === pkg);
}

function findBrowser(data: DebugData, name: string) {
  return (data.browsers?.browsers || []).find((b) => b.name === name);
}

// Chrome can't run and its Appium driver is missing or unregistered → the
// runtime install is incomplete.
const chromeUnavailable: Rule = (data) => {
  const chrome = findBrowser(data, "chrome");
  if (!chrome || !chrome.supported || chrome.available) return null;
  const driver = findDriver(data, "appium-chromium-driver");
  // Only fire when the driver is actually the likely cause — suppress when
  // it's confirmed resolvable AND registered.
  if (driver && driver.npmResolvable && driver.registered === true) return null;
  return {
    severity: "error",
    title: "Chrome is not available",
    detail:
      "Chrome shows NOT AVAILABLE and its Appium driver (appium-chromium-driver) is missing or not registered, so browser tests can't run.",
    fix: "doc-detective install runtime",
  };
};

// Recorded install is older than the declared constraint, or the
// doc-detective / doc-detective-common versions disagree → stale install.
const staleInstall: Rule = (data) => {
  const outdated = (data.install?.rows || []).filter((r) => r.outdated);
  const lockstep = Boolean(data.docDetective?.lockstepWarning);
  if (outdated.length === 0 && !lockstep) return null;
  const reasons: string[] = [];
  if (outdated.length > 0) {
    reasons.push(
      `outdated: ${outdated.map((r) => r.assetId).join(", ")}`
    );
  }
  if (lockstep) reasons.push("doc-detective / doc-detective-common version mismatch");
  return {
    severity: "warning",
    title: "Install looks stale",
    detail: `${reasons.join("; ")}. A stale or mismatched install is a common source of hard-to-explain failures.`,
    fix: "doc-detective install runtime",
  };
};

// cacheDir not writable → lazy installs and recordings have nowhere to go.
const cacheNotWritable: Rule = (data) => {
  const entry = (data.cache?.entries || []).find((e) => e.label === "cacheDir");
  if (!entry || entry.writable !== false) return null;
  return {
    severity: "error",
    title: "Cache directory is not writable",
    detail: `cacheDir (${entry.path}) is not writable, so doc-detective can't lazy-install browsers or runtime packages there.`,
    fix: "set DOC_DETECTIVE_CACHE_DIR to a writable path",
  };
};

// A proxy is configured and something the installer needs is missing — flag
// the proxy as a likely lazy-install blocker (we don't probe reachability;
// that's the opt-in --check-network work).
const proxyMaybeBlocking: Rule = (data) => {
  const hasProxy = (data.network?.variables || []).some((v) =>
    /^(https?_proxy|all_proxy)$/i.test(v.name)
  );
  if (!hasProxy) return null;
  const missingNpm = (data.install?.rows || []).some(
    (r) => r.kind === "npm" && !r.installed
  );
  if (!missingNpm) return null;
  return {
    severity: "info",
    title: "Proxy configured with missing runtime packages",
    detail:
      "A proxy is set and some runtime npm packages are not installed. If lazy installs fail, the proxy/registry is the likely cause — verify it's reachable and that proxy-agent is installed for @puppeteer/browsers downloads.",
  };
};

// Driver resolves from npm but Appium doesn't list it → APPIUM_HOME mismatch.
// `registered === false` is the only firing case: `null` (manifest unread)
// means registration is unknown, not a finding — a missing manifest must not
// false-flag every resolvable driver.
const driverNotRegistered: Rule = (data) => {
  const stranded = (data.appium?.drivers || []).filter(
    (d) => d.npmResolvable && d.registered === false
  );
  if (stranded.length === 0) return null;
  return {
    severity: "warning",
    title: "Appium driver installed but not registered",
    detail: `${stranded
      .map((d) => d.name)
      .join(", ")} resolve from npm but Appium doesn't list them under the active APPIUM_HOME — usually an APPIUM_HOME pointing at the wrong node_modules.`,
    fix: "doc-detective install runtime",
  };
};

const RULES: Rule[] = [
  chromeUnavailable,
  staleInstall,
  cacheNotWritable,
  proxyMaybeBlocking,
  driverNotRegistered,
];

export function computeFindings(data: DebugData): Finding[] {
  const findings: Finding[] = [];
  for (const rule of RULES) {
    try {
      const finding = rule(data);
      if (finding) findings.push(finding);
    } catch {
      // A rule must never crash the dump; skip on error.
    }
  }
  return findings;
}
