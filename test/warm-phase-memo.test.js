// The warm-phase mirror contract (docs/design/warm-phase.md, phase B1):
// warmBrowserInstall must leave installAttempts / runnerDetails.availableApps
// in EXACTLY the state the first same-browser consuming context would have
// produced serially — install + first-attempt re-detect, memoized thereafter —
// so later gates (warmUpContexts, runContext) collapse to cache hits and
// never misread the memo against a stale app list.
import assert from "node:assert/strict";
import {
  warmBrowserInstall,
  ensureContextBrowserInstalled,
} from "../dist/core/tests.js";

function makeSpies({ ensureBrowserError, detected = [] } = {}) {
  const calls = { ensureBrowser: [], clearAppCache: 0, getAvailableApps: 0 };
  return {
    calls,
    deps: {
      ensureBrowser: async (asset) => {
        calls.ensureBrowser.push(asset);
        if (ensureBrowserError) throw new Error(ensureBrowserError);
      },
      clearAppCache: () => {
        calls.clearAppCache++;
      },
      getAvailableApps: async () => {
        calls.getAvailableApps++;
        return detected;
      },
    },
  };
}

function run({ browserName = "chrome", availableApps = [], installAttempts, spies }) {
  const runnerDetails = { environment: { platform: "windows" }, availableApps };
  return {
    runnerDetails,
    result: warmBrowserInstall({
      browserName,
      config: {},
      runnerDetails,
      installAttempts,
      deps: spies.deps,
    }),
  };
}

describe("warm phase: warmBrowserInstall memo-sharing / mirror contract", function () {
  it("skips without touching the memo when the browser is already available", async function () {
    const spies = makeSpies();
    const installAttempts = new Map();
    const { result } = run({
      availableApps: [{ name: "chrome" }],
      installAttempts,
      spies,
    });
    const outcome = await result;
    assert.equal(outcome.outcome, "skipped");
    assert.equal(installAttempts.size, 0);
    assert.deepEqual(spies.calls.ensureBrowser, []);
    assert.equal(spies.calls.getAvailableApps, 0);
  });

  it("treats webkit as the safari engine for the availability check", async function () {
    const spies = makeSpies();
    const installAttempts = new Map();
    const { result } = run({
      browserName: "webkit",
      availableApps: [{ name: "safari" }],
      installAttempts,
      spies,
    });
    assert.equal((await result).outcome, "skipped");
    assert.deepEqual(spies.calls.ensureBrowser, []);
  });

  it("installs + re-detects on the first attempt, exactly like the serial first consumer", async function () {
    const detected = [{ name: "chrome" }];
    const spies = makeSpies({ detected });
    const installAttempts = new Map();
    const { runnerDetails, result } = run({ installAttempts, spies });
    const outcome = await result;
    assert.equal(outcome.outcome, "warmed");
    assert.equal(installAttempts.get("chrome"), "installed");
    assert.ok(spies.calls.ensureBrowser.length > 0, "must install the browser assets");
    assert.equal(spies.calls.clearAppCache, 1);
    assert.equal(spies.calls.getAvailableApps, 1);
    assert.equal(runnerDetails.availableApps, detected, "re-detected app list replaces the snapshot");

    // Parity: a fresh direct ensureContextBrowserInstalled + first-attempt
    // re-detect (runContext's serial path) produces the identical memo state.
    const directSpies = makeSpies({ detected });
    const directAttempts = new Map();
    const directOutcome = await ensureContextBrowserInstalled({
      browserName: "chrome",
      config: {},
      installAttempts: directAttempts,
      deps: { ensureBrowser: directSpies.deps.ensureBrowser },
      repair: true,
    });
    assert.equal(directOutcome, "installed");
    assert.deepEqual([...installAttempts.entries()], [...directAttempts.entries()]);
    assert.deepEqual(spies.calls.ensureBrowser, directSpies.calls.ensureBrowser);
  });

  it("memo-hits on the second call: no new install or re-detect work", async function () {
    const spies = makeSpies({ detected: [] }); // installed but undetected
    const installAttempts = new Map();
    await run({ installAttempts, spies }).result;
    const installCalls = spies.calls.ensureBrowser.length;
    const outcome = await run({ installAttempts, spies }).result;
    assert.equal(outcome.outcome, "warmed");
    assert.equal(spies.calls.ensureBrowser.length, installCalls, "memo hit must not reinstall");
    assert.equal(spies.calls.getAvailableApps, 1, "re-detect only follows a FIRST attempt");
  });

  it("records a failed install and still re-detects, mirroring the serial path", async function () {
    const spies = makeSpies({ ensureBrowserError: "download 503" });
    const installAttempts = new Map();
    const { result } = run({ installAttempts, spies });
    const outcome = await result;
    assert.equal(outcome.outcome, "failed");
    assert.match(outcome.note, /chrome/);
    assert.equal(installAttempts.get("chrome"), "failed");
    assert.equal(spies.calls.clearAppCache, 1);
    assert.equal(spies.calls.getAvailableApps, 1);
  });

  it("reports engines with no installable assets as skipped", async function () {
    const spies = makeSpies();
    const installAttempts = new Map();
    const { result } = run({ browserName: "safari", installAttempts, spies });
    const outcome = await result;
    assert.equal(outcome.outcome, "skipped");
    assert.equal(installAttempts.get("safari"), "notInstallable");
    assert.deepEqual(spies.calls.ensureBrowser, []);
  });
});
