// End-to-end coverage for the runner's cross-browser fallback and diagnostic
// skip, driven through the real runTests() pipeline. Uses Safari/WebKit as the
// requested engine because it has no installable driver — so these cases never
// trigger a heavy browser/driver download and stay deterministic in CI:
//   * On non-mac platforms Safari is unavailable, so:
//       - browserFallback "off"  → no fallback → diagnostic SKIPPED.
//       - browserFallback "auto" → fall back to another *available* browser
//         (when one exists) and, because Safari was explicitly pinned, report
//         WARNING; otherwise SKIPPED.
// On mac (Safari available) the requested engine just runs, so the fallback
// assertions don't apply and the test is skipped.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { runTests } from "../dist/core/index.js";
import { getAvailableApps, getEnvironment } from "../dist/core/config.js";

before(async function () {
  const { expect } = await import("chai");
  global.expect = expect;
});

const PLATFORM = { win32: "windows", darwin: "mac", linux: "linux" }[
  os.platform()
];

// Pin to Safari/WebKit on the current (non-mac) platform with a single
// browser-driven step, written to a temp spec file. An optional context-level
// `browserFallback` is authored onto the runOn entry to exercise precedence.
function writeSafariSpec(tmpDir, contextFallback) {
  const runOnEntry = { platforms: [PLATFORM], browsers: ["safari"] };
  if (contextFallback) runOnEntry.browserFallback = contextFallback;
  const spec = {
    tests: [
      {
        runOn: [runOnEntry],
        steps: [{ goTo: "https://example.com" }],
      },
    ],
  };
  const file = path.join(tmpDir, "safari-pinned.spec.json");
  fs.writeFileSync(file, JSON.stringify(spec, null, 2));
  return file;
}

function firstContext(result) {
  return result?.specs?.[0]?.tests?.[0]?.contexts?.[0];
}

describe("browser fallback (end-to-end via runTests)", function () {
  this.timeout(120000);
  let tmpDir;

  beforeEach(function () {
    if (PLATFORM === "mac") this.skip(); // Safari is available on mac.
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "dd-fallback-"));
  });
  afterEach(function () {
    if (tmpDir) fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("browserFallback 'off' skips a pinned-but-unavailable browser with a diagnostic naming it", async function () {
    const input = writeSafariSpec(tmpDir);
    const result = await runTests({
      input,
      browserFallback: "off",
      logLevel: "silent",
    });
    const ctx = firstContext(result);
    expect(ctx, "expected a context report").to.be.ok;
    expect(ctx.result).to.equal("SKIPPED");
    // Names the requested engine and points at the partial-download cause.
    expect(ctx.resultDescription).to.match(/safari|webkit/i);
    expect(ctx.resultDescription).to.match(/partial|driver/i);
  });

  it("context-level browserFallback 'off' overrides a config that would otherwise fall back", async function () {
    // Config leaves browserFallback unset (defaults to "auto"); the runOn entry
    // pins it to "off". The context-level value must win — so even when another
    // browser is available, the pinned-but-unavailable Safari context is
    // skipped with a diagnostic rather than substituting another engine.
    const input = writeSafariSpec(tmpDir, "off");
    const result = await runTests({ input, logLevel: "silent" });
    const ctx = firstContext(result);
    expect(ctx, "expected a context report").to.be.ok;
    expect(ctx.result).to.equal("SKIPPED");
    expect(ctx.resultDescription).to.match(/safari|webkit/i);
    expect(ctx.fallback, "context-off must not have fallen back").to.be.undefined;
  });

  it("browserFallback 'auto' falls back to an available browser (WARNING, since Safari was pinned) or skips when none is available", async function () {
    const environment = getEnvironment();
    const available = await getAvailableApps({ config: { environment } });
    const hasOther = available.some(
      (a) => a.name === "chrome" || a.name === "firefox"
    );

    const input = writeSafariSpec(tmpDir);
    const result = await runTests({
      input,
      browserFallback: "auto",
      logLevel: "silent",
    });
    const ctx = firstContext(result);
    expect(ctx, "expected a context report").to.be.ok;

    if (hasOther) {
      // Fell back to a different engine; pinned → degraded WARNING (unless the
      // fallback engine's own session also failed, which still must not be a
      // silent PASS on Safari).
      expect(["WARNING", "PASS", "SKIPPED"]).to.include(ctx.result);
      if (ctx.result !== "SKIPPED") {
        // Ran on a fallback engine — annotated and never reported as Safari.
        expect(ctx.resultDescription || "").to.match(/unavailable; ran on/i);
        expect(ctx.fallback?.used).to.be.a("string");
        expect(["chrome", "firefox"]).to.include(ctx.fallback.used);
        // A pinned-engine substitution must not read as a clean PASS.
        expect(ctx.result).to.equal("WARNING");
      }
    } else {
      // Nothing to fall back to → diagnostic skip.
      expect(ctx.result).to.equal("SKIPPED");
      expect(ctx.resultDescription).to.match(/safari|webkit/i);
    }
  });
});
