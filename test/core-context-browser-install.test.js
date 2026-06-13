// Unit tests for ensureContextBrowserInstalled — the runner's on-demand,
// per-context browser/driver install used when a context's browser isn't yet
// available. Deps are injected so these stay pure: no real installs, no
// network, no spawn. Memoization is keyed on an installAttempts Map the caller
// owns for the lifetime of a run.
import assert from "node:assert/strict";

let ensureContextBrowserInstalled;

describe("ensureContextBrowserInstalled", function () {
  before(async function () {
    ({ ensureContextBrowserInstalled } = await import("../dist/core/tests.js"));
  });

  it("installs each required asset for a missing browser and returns 'installed'", async function () {
    const installed = [];
    const result = await ensureContextBrowserInstalled({
      browserName: "firefox",
      config: {},
      installAttempts: new Map(),
      deps: {
        ensureBrowser: async (asset) => {
          installed.push(asset);
        },
      },
    });
    assert.equal(result, "installed");
    assert.deepEqual(installed, ["firefox", "geckodriver"]);
  });

  it("returns 'failed' and logs when an install throws", async function () {
    const logs = [];
    const result = await ensureContextBrowserInstalled({
      browserName: "chrome",
      config: {},
      installAttempts: new Map(),
      deps: {
        ensureBrowser: async () => {
          throw new Error("network down");
        },
        log: (_config, level, msg) => logs.push({ level, msg }),
      },
    });
    assert.equal(result, "failed");
    assert.ok(
      logs.some((l) => /network down/.test(l.msg)),
      "should log the install failure"
    );
  });

  it("returns 'notInstallable' for safari without calling ensureBrowser", async function () {
    let calls = 0;
    const result = await ensureContextBrowserInstalled({
      browserName: "safari",
      config: {},
      installAttempts: new Map(),
      deps: {
        ensureBrowser: async () => {
          calls++;
        },
      },
    });
    assert.equal(result, "notInstallable");
    assert.equal(calls, 0, "safari has no installable assets");
  });

  it("memoizes the outcome: a second call does not re-invoke ensureBrowser", async function () {
    const installAttempts = new Map();
    let calls = 0;
    const deps = {
      ensureBrowser: async () => {
        calls++;
      },
    };
    const first = await ensureContextBrowserInstalled({
      browserName: "firefox",
      config: {},
      installAttempts,
      deps,
    });
    const second = await ensureContextBrowserInstalled({
      browserName: "firefox",
      config: {},
      installAttempts,
      deps,
    });
    assert.equal(first, "installed");
    assert.equal(second, "installed");
    assert.equal(calls, 2, "two assets installed once; not re-invoked on the cached call");
  });

  it("memoizes a failure: a second call returns 'failed' without retrying", async function () {
    const installAttempts = new Map();
    let calls = 0;
    const deps = {
      ensureBrowser: async () => {
        calls++;
        throw new Error("boom");
      },
    };
    const first = await ensureContextBrowserInstalled({
      browserName: "chrome",
      config: {},
      installAttempts,
      deps,
    });
    const second = await ensureContextBrowserInstalled({
      browserName: "chrome",
      config: {},
      installAttempts,
      deps,
    });
    assert.equal(first, "failed");
    assert.equal(second, "failed");
    assert.equal(calls, 1, "failed install is not retried on the cached call");
  });
});
