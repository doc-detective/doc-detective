// Unit tests for ensureChromeAvailable — the lazy-provisioning guard that
// getRunner uses so a runner self-installs the browser runtime on a miss
// (instead of throwing) even when DOC_DETECTIVE_AUTOINSTALL=0 disabled the
// eager postinstall. Deps are injected so these stay pure: no real installs,
// no network, no spawn.
import assert from "node:assert";

let ensureChromeAvailable;

describe("ensureChromeAvailable", function () {
  // Scoped to this suite (not a root-level hook) so it can't run for unrelated
  // suites loaded in the same mocha invocation.
  before(async function () {
    ({ ensureChromeAvailable } = await import("../dist/core/tests.js"));
  });

  it("returns detected apps without provisioning when chrome is already present", async function () {
    let provisionCalls = 0;
    let invalidateCalls = 0;
    const apps = [{ name: "chrome", path: "/chrome" }];
    const result = await ensureChromeAvailable(
      {},
      {
        detect: async () => apps,
        provision: async () => {
          provisionCalls++;
        },
        invalidate: () => {
          invalidateCalls++;
        },
      }
    );
    assert.deepEqual(result, apps);
    assert.equal(provisionCalls, 0, "should not provision when chrome present");
    assert.equal(invalidateCalls, 0, "should not invalidate cache when chrome present");
  });

  it("provisions, invalidates the cache, and re-detects when chrome is initially missing", async function () {
    let provisionCalls = 0;
    let invalidateCalls = 0;
    let detectCalls = 0;
    const result = await ensureChromeAvailable(
      {},
      {
        detect: async () => {
          detectCalls++;
          return detectCalls === 1 ? [] : [{ name: "chrome", path: "/chrome" }];
        },
        provision: async () => {
          provisionCalls++;
        },
        invalidate: () => {
          invalidateCalls++;
        },
      }
    );
    assert.equal(provisionCalls, 1, "should provision exactly once");
    assert.equal(invalidateCalls, 1, "should invalidate the app cache after provisioning");
    assert.equal(detectCalls, 2, "should re-detect after provisioning");
    assert.ok(
      result.find((a) => a.name === "chrome"),
      "should return apps including chrome after provisioning"
    );
  });

  it("throws the standard error if chrome is still unavailable after provisioning", async function () {
    let provisionCalls = 0;
    await assert.rejects(
      ensureChromeAvailable(
        {},
        {
          detect: async () => [],
          provision: async () => {
            provisionCalls++;
          },
          invalidate: () => {},
        }
      ),
      /Chrome browser is not available/
    );
    assert.equal(provisionCalls, 1, "should attempt provisioning once before throwing");
  });

  it("still re-detects (and throws cleanly) when provisioning itself fails", async function () {
    // Offline / install error: provision rejects. The guard should swallow it,
    // re-detect, and surface the standard "not available" error rather than the
    // raw install failure.
    let detectCalls = 0;
    const logs = [];
    await assert.rejects(
      ensureChromeAvailable(
        {},
        {
          detect: async () => {
            detectCalls++;
            return [];
          },
          provision: async () => {
            throw new Error("network down");
          },
          invalidate: () => {},
          log: (_config, level, msg) => logs.push({ level, msg }),
        }
      ),
      /Chrome browser is not available/
    );
    assert.equal(detectCalls, 2, "should still re-detect after a failed provision");
    assert.ok(
      logs.some((l) => /network down/.test(l.msg)),
      "should log the provisioning failure"
    );
  });
});
