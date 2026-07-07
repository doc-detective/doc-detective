import {
  runConcurrent,
  runResourceAware,
  createResourceRegistry,
  rollUpResults,
  createAppiumPool,
} from "../dist/core/utils.js";
import {
  runSpecs,
  selectWarmUpTargets,
  jobDisplayResources,
} from "../dist/core/tests.js";
import {
  getEnvironment,
  resolveConcurrentRunners,
} from "../dist/core/config.js";

before(async function () {
  const { expect } = await import("chai");
  global.expect = expect;
});

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

describe("runConcurrent", function () {
  it("processes every item exactly once", async function () {
    const seen = [];
    await runConcurrent([1, 2, 3, 4, 5], 2, async (item) => {
      seen.push(item);
    });
    expect(seen.sort()).to.deep.equal([1, 2, 3, 4, 5]);
  });

  it("never exceeds the concurrency limit", async function () {
    let inFlight = 0;
    let highWater = 0;
    await runConcurrent([10, 10, 10, 10, 10, 10], 2, async (ms) => {
      inFlight++;
      highWater = Math.max(highWater, inFlight);
      await sleep(ms);
      inFlight--;
    });
    expect(highWater).to.equal(2);
  });

  it("runs strictly sequentially in input order at limit 1", async function () {
    const completed = [];
    // Decreasing durations would invert completion order if anything ran
    // concurrently.
    await runConcurrent([30, 20, 10], 1, async (ms) => {
      await sleep(ms);
      completed.push(ms);
    });
    expect(completed).to.deep.equal([30, 20, 10]);
  });

  it("does not over-spawn when limit exceeds item count", async function () {
    let inFlight = 0;
    let highWater = 0;
    await runConcurrent([10, 10], 8, async (ms) => {
      inFlight++;
      highWater = Math.max(highWater, inFlight);
      await sleep(ms);
      inFlight--;
    });
    expect(highWater).to.equal(2);
  });

  it("treats a limit below 1 as sequential", async function () {
    const completed = [];
    await runConcurrent([20, 10], 0, async (ms) => {
      await sleep(ms);
      completed.push(ms);
    });
    expect(completed).to.deep.equal([20, 10]);
  });

  it("propagates a rejection from fn", async function () {
    let threw = false;
    try {
      await runConcurrent([1], 2, async () => {
        throw new Error("boom");
      });
    } catch (error) {
      threw = true;
      expect(error.message).to.equal("boom");
    }
    expect(threw).to.equal(true);
  });

  it("rejects while a sibling worker is still in flight", async function () {
    // Item 0 parks on an explicit gate while item 1 throws: the call rejects,
    // and the parked sibling finishes only once the test releases it — an
    // orphaned microtask (promises can't be cancelled). Gated with deferred
    // promises rather than timers so it can't flake under CI load. Callers
    // needing isolation catch inside fn.
    const completed = [];
    let releaseSibling;
    const release = new Promise((resolve) => (releaseSibling = resolve));
    let signalDone;
    const siblingFinished = new Promise((resolve) => (signalDone = resolve));

    let threw = false;
    try {
      await runConcurrent([0, 1], 2, async (item) => {
        if (item === 0) {
          await release; // stay in flight until the test frees it
          completed.push(0);
          signalDone();
          return;
        }
        throw new Error("boom"); // rejects while item 0 is still parked
      });
    } catch (error) {
      threw = true;
      expect(error.message).to.equal("boom");
      // The sibling is still parked, so nothing has completed yet.
      expect(completed).to.deep.equal([]);
    }
    expect(threw).to.equal(true);
    // Release the orphaned sibling and confirm it still runs to completion.
    releaseSibling();
    await siblingFinished;
    expect(completed).to.deep.equal([0]);
  });

  it("resolves immediately for an empty item list", async function () {
    let calls = 0;
    await runConcurrent([], 4, async () => {
      calls++;
    });
    expect(calls).to.equal(0);
  });
});

describe("createResourceRegistry", function () {
  it("grants a free name, blocks a held one, regrants after release", function () {
    const reg = createResourceRegistry();
    expect(reg.tryAcquire(["display"])).to.equal(true);
    expect(reg.tryAcquire(["display"])).to.equal(false);
    reg.release(["display"]);
    expect(reg.tryAcquire(["display"])).to.equal(true);
  });

  it("treats disjoint names as independent", function () {
    const reg = createResourceRegistry();
    expect(reg.tryAcquire(["a"])).to.equal(true);
    expect(reg.tryAcquire(["b"])).to.equal(true);
    expect(reg.tryAcquire(["a"])).to.equal(false);
    expect(reg.tryAcquire(["b"])).to.equal(false);
  });

  it("is all-or-nothing: a partial conflict acquires neither name", function () {
    const reg = createResourceRegistry();
    reg.tryAcquire(["a"]);
    // ["a","b"] conflicts on "a" → must not leave "b" held.
    expect(reg.tryAcquire(["a", "b"])).to.equal(false);
    expect(reg.tryAcquire(["b"])).to.equal(true);
  });

  it("wakes a waitForFree() waiter on release", async function () {
    const reg = createResourceRegistry();
    reg.tryAcquire(["display"]);
    let woke = false;
    const waiting = reg.waitForFree().then(() => (woke = true));
    await Promise.resolve();
    expect(woke).to.equal(false);
    reg.release(["display"]);
    await waiting;
    expect(woke).to.equal(true);
  });
});

describe("runResourceAware", function () {
  // Track concurrent in-flight counts, globally and per exclusive resource.
  function tracker() {
    const t = { total: 0, totalHigh: 0, perResource: {}, perResourceHigh: {} };
    return {
      enter(resources) {
        t.total++;
        t.totalHigh = Math.max(t.totalHigh, t.total);
        for (const r of resources) {
          t.perResource[r] = (t.perResource[r] || 0) + 1;
          t.perResourceHigh[r] = Math.max(
            t.perResourceHigh[r] || 0,
            t.perResource[r]
          );
        }
      },
      exit(resources) {
        t.total--;
        for (const r of resources) t.perResource[r]--;
      },
      stats: t,
    };
  }
  const job = (id, exclusiveResources = [], ms = 10) => ({
    id,
    exclusiveResources,
    ms,
  });

  it("matches runConcurrent when no item has exclusive resources", async function () {
    const reg = createResourceRegistry();
    const seen = [];
    const tk = tracker();
    await runResourceAware(
      [job(1), job(2), job(3), job(4), job(5)],
      2,
      reg,
      async (item) => {
        tk.enter(item.exclusiveResources);
        await sleep(item.ms);
        tk.exit(item.exclusiveResources);
        seen.push(item.id);
      }
    );
    expect(seen.sort()).to.deep.equal([1, 2, 3, 4, 5]);
    expect(tk.stats.totalHigh).to.equal(2);
  });

  it("never runs two jobs holding the same resource at once", async function () {
    const reg = createResourceRegistry();
    const tk = tracker();
    await runResourceAware(
      [
        job("d1", ["display"], 20),
        job("d2", ["display"], 20),
        job("d3", ["display"], 20),
      ],
      3, // limit allows 3, but the mutex must cap display at 1
      reg,
      async (item) => {
        tk.enter(item.exclusiveResources);
        await sleep(item.ms);
        tk.exit(item.exclusiveResources);
      }
    );
    expect(tk.stats.perResourceHigh.display).to.equal(1);
  });

  it("runs disjoint-resource jobs fully in parallel", async function () {
    const reg = createResourceRegistry();
    const tk = tracker();
    await runResourceAware(
      [job("a", ["ra"], 30), job("b", ["rb"], 30), job("c", ["rc"], 30)],
      3,
      reg,
      async (item) => {
        tk.enter(item.exclusiveResources);
        await sleep(item.ms);
        tk.exit(item.exclusiveResources);
      }
    );
    expect(tk.stats.totalHigh).to.equal(3);
  });

  it("serializes display jobs while non-exclusive jobs run in parallel", async function () {
    const reg = createResourceRegistry();
    const tk = tracker();
    const items = [
      job("d1", ["display"], 40),
      job("p1", [], 40),
      job("d2", ["display"], 40),
      job("p2", [], 40),
      job("p3", [], 40),
    ];
    await runResourceAware(items, 4, reg, async (item) => {
      tk.enter(item.exclusiveResources);
      await sleep(item.ms);
      tk.exit(item.exclusiveResources);
    });
    // Display serialized to 1; overall parallelism still exceeded 1.
    expect(tk.stats.perResourceHigh.display).to.equal(1);
    expect(tk.stats.totalHigh).to.be.above(1);
  });

  it("completes multi-resource jobs without hanging", async function () {
    const reg = createResourceRegistry();
    const done = [];
    await runResourceAware(
      [
        job("ab", ["a", "b"], 10),
        job("b", ["b"], 10),
        job("a", ["a"], 10),
        job("plain", [], 10),
      ],
      3,
      reg,
      async (item) => {
        await sleep(item.ms);
        done.push(item.id);
      }
    );
    expect(done.sort()).to.deep.equal(["a", "ab", "b", "plain"]);
  });

  it("runs items in input order at limit 1", async function () {
    const reg = createResourceRegistry();
    const completed = [];
    await runResourceAware(
      [job(30, [], 30), job(20, [], 20), job(10, [], 10)],
      1,
      reg,
      async (item) => {
        await sleep(item.ms);
        completed.push(item.id);
      }
    );
    expect(completed).to.deep.equal([30, 20, 10]);
  });

  it("frees a rejecting job's resource so a later same-resource job still runs", async function () {
    const reg = createResourceRegistry();
    const completed = [];
    // First display job throws; its "display" must be released so the second
    // display job can acquire it. Errors isolated inside fn (as runJob does).
    await runResourceAware(
      [job("d1", ["display"], 5), job("d2", ["display"], 5)],
      2,
      reg,
      async (item) => {
        try {
          if (item.id === "d1") throw new Error("boom");
          await sleep(item.ms);
          completed.push(item.id);
        } catch {
          /* isolated */
        }
      }
    );
    expect(completed).to.deep.equal(["d2"]);
    // Registry left clean.
    expect(reg.tryAcquire(["display"])).to.equal(true);
  });
});

describe("jobDisplayResources", function () {
  // The exclusivity context passed by runSpecs at limit>1. Native app-driver
  // serialization must not depend on there being a recording in the run, so
  // runHasDisplayRecording is false in these cases.
  const ctx = {
    platform: "darwin",
    xvfbAvailable: false,
    runHasDisplayRecording: false,
  };
  const nativeAppJob = (platform) => ({
    context: {
      platform,
      steps: [
        { startSurface: { app: "/System/Applications/Calculator.app" } },
        { find: { elementText: "5", surface: { app: "Calculator" } } },
      ],
    },
  });

  it("tags a non-android native app-driver context with 'native-app-driver'", function () {
    // A macOS Mac2 app context: two of these under concurrency clobber the
    // shared driver server, so each must hold an exclusive resource.
    expect(jobDisplayResources(nativeAppJob("mac"), ctx)).to.deep.equal([
      "native-app-driver",
    ]);
  });

  it("tags a Windows native app-driver context with 'native-app-driver'", function () {
    expect(jobDisplayResources(nativeAppJob("windows"), ctx)).to.deep.equal([
      "native-app-driver",
    ]);
  });

  it("tags an iOS simulator app-driver context with 'native-app-driver'", function () {
    // Two native iOS sims on one host also contend on the shared driver.
    expect(jobDisplayResources(nativeAppJob("ios"), ctx)).to.deep.equal([
      "native-app-driver",
    ]);
  });

  it("keeps android app contexts on 'android-emulator', not 'native-app-driver'", function () {
    // Android is already bounded by the emulator resource; it must not be
    // double-tagged with the new resource.
    expect(jobDisplayResources(nativeAppJob("android"), ctx)).to.deep.equal([
      "android-emulator",
    ]);
  });

  it("takes nothing for a non-app (HTTP/shell) context", function () {
    const shellJob = {
      context: { platform: "darwin", steps: [{ runShell: "echo hi" }] },
    };
    expect(jobDisplayResources(shellJob, ctx)).to.deep.equal([]);
  });

  it("takes nothing for a browser-only driver context (no app)", function () {
    const browserJob = {
      context: {
        platform: "darwin",
        browser: { name: "chrome" },
        steps: [{ goTo: "https://example.com" }],
      },
    };
    expect(jobDisplayResources(browserJob, ctx)).to.deep.equal([]);
  });

  it("takes nothing for a desktop (mac) browser context — desktop browsers parallelize", function () {
    // A plain desktop firefox/chrome context on a native app-driver platform
    // drives no simulator/native driver, so it must STILL run in parallel — the
    // native-app-driver bound is only for contexts that boot the shared native
    // driver (mac/windows require an app driver; ios boots the sim for web too).
    const macBrowserJob = {
      context: {
        platform: "mac",
        browser: { name: "firefox" },
        steps: [{ goTo: "https://example.com" }],
      },
    };
    expect(jobDisplayResources(macBrowserJob, ctx)).to.deep.equal([]);
  });

  it("tags an iOS mobile-web (Safari) context with 'native-app-driver'", function () {
    // A Safari-on-iOS-simulator BROWSER context (isAppDriverRequired == false)
    // still boots the single per-host iOS simulator/WDA, so two of them clobber
    // each other's session the same way native app contexts do. It must take
    // the resource despite having no app step.
    const iosWebJob = {
      context: {
        platform: "ios",
        browser: { name: "safari" },
        steps: [{ goTo: "https://example.com" }],
      },
    };
    expect(jobDisplayResources(iosWebJob, ctx)).to.deep.equal([
      "native-app-driver",
    ]);
  });

  it("takes nothing for a mixed app+web mobile context (gate SKIPs it)", function () {
    // On a mobile platform, mixing native app + browser steps deterministically
    // SKIPs (mobileBrowserGate), so it drives no native app and must not
    // needlessly serialize other native-app jobs.
    const mixedJob = {
      context: {
        platform: "ios",
        steps: [
          { startSurface: { app: "com.example.app" } },
          { goTo: "https://example.com" },
        ],
      },
    };
    expect(jobDisplayResources(mixedJob, ctx)).to.deep.equal([]);
  });

  it("composes 'native-app-driver' with 'display' when a recording is present", function () {
    // A native app context in a run that also has a shared-display recording
    // holds BOTH the app-driver and the display resource.
    expect(
      jobDisplayResources(nativeAppJob("mac"), {
        ...ctx,
        runHasDisplayRecording: true,
      })
    ).to.deep.equal(["native-app-driver", "display"]);
  });
});

describe("runResourceAware native-app-driver serialization", function () {
  function tracker() {
    const t = { perResource: {}, perResourceHigh: {}, total: 0, totalHigh: 0 };
    return {
      enter(resources) {
        t.total++;
        t.totalHigh = Math.max(t.totalHigh, t.total);
        for (const r of resources) {
          t.perResource[r] = (t.perResource[r] || 0) + 1;
          t.perResourceHigh[r] = Math.max(
            t.perResourceHigh[r] || 0,
            t.perResource[r]
          );
        }
      },
      exit(resources) {
        t.total--;
        for (const r of resources) t.perResource[r]--;
      },
      stats: t,
    };
  }

  it("never runs two native-app-driver jobs at once, but overlaps a disjoint job", async function () {
    const reg = createResourceRegistry();
    const tk = tracker();
    const job = (id, exclusiveResources, ms) => ({ id, exclusiveResources, ms });
    const items = [
      job("app1", ["native-app-driver"], 40),
      job("shell1", [], 40),
      job("app2", ["native-app-driver"], 40),
    ];
    await runResourceAware(items, 3, reg, async (item) => {
      tk.enter(item.exclusiveResources);
      await sleep(item.ms);
      tk.exit(item.exclusiveResources);
    });
    // The two native-app jobs never overlap...
    expect(tk.stats.perResourceHigh["native-app-driver"]).to.equal(1);
    // ...but overall parallelism still exceeded 1 (the shell job overlapped).
    expect(tk.stats.totalHigh).to.be.above(1);
  });
});

describe("rollUpResults", function () {
  it("FAIL beats everything", function () {
    expect(
      rollUpResults([
        { result: "PASS" },
        { result: "FAIL" },
        { result: "WARNING" },
        { result: "SKIPPED" },
      ])
    ).to.equal("FAIL");
  });

  it("WARNING beats PASS and SKIPPED", function () {
    expect(
      rollUpResults([
        { result: "PASS" },
        { result: "WARNING" },
        { result: "SKIPPED" },
      ])
    ).to.equal("WARNING");
  });

  it("all SKIPPED rolls up to SKIPPED", function () {
    expect(
      rollUpResults([{ result: "SKIPPED" }, { result: "SKIPPED" }])
    ).to.equal("SKIPPED");
  });

  it("mixed SKIPPED and PASS rolls up to PASS", function () {
    expect(
      rollUpResults([{ result: "SKIPPED" }, { result: "PASS" }])
    ).to.equal("PASS");
  });

  it("all PASS rolls up to PASS", function () {
    expect(rollUpResults([{ result: "PASS" }, { result: "PASS" }])).to.equal(
      "PASS"
    );
  });

  it("empty input rolls up to SKIPPED", function () {
    // Matches the previous inline logic: zero children means
    // length === filter(SKIPPED).length.
    expect(rollUpResults([])).to.equal("SKIPPED");
  });
});

describe("resolveConcurrentRunners", function () {
  it("returns explicit positive integers unchanged", function () {
    expect(resolveConcurrentRunners({ concurrentRunners: 1 })).to.equal(1);
    expect(resolveConcurrentRunners({ concurrentRunners: 4 })).to.equal(4);
  });

  it("maps true to the CPU count capped at 4", function () {
    const n = resolveConcurrentRunners({ concurrentRunners: true });
    expect(n).to.be.a("number");
    expect(n).to.be.at.least(1);
    expect(n).to.be.at.most(4);
  });

  it("falls back to 1 for missing or invalid values", function () {
    // API callers can bypass schema validation; an invalid value must never
    // size the worker/Appium pools to 0 and hang. 1.5 floors to 1.
    for (const bad of [undefined, 0, -2, NaN, 1.5, "nope", null]) {
      expect(
        resolveConcurrentRunners({ concurrentRunners: bad }),
        `value: ${String(bad)}`
      ).to.equal(1);
    }
    expect(resolveConcurrentRunners({})).to.equal(1);
  });
});

describe("selectWarmUpTargets", function () {
  // The serial warm-up pre-pass keys work by combinationKey; this is the
  // selection/normalization/dedup logic it runs before any driver starts.
  const runner = (platform, appNames = []) => ({
    environment: { platform },
    availableApps: appNames.map((name) => ({ name })),
  });
  const job = (context) => ({ context });
  const combos = (jobs, runnerDetails) =>
    selectWarmUpTargets(jobs, runnerDetails).map((t) => t.combo);

  it("defaults a missing platform to the runner's and dedups by combo", function () {
    // Regression guard: a resolved context of `{}` (no runOn) must key as
    // `windows::firefox`, not `undefined::firefox`. The two firefox contexts
    // collapse to a single warm-up target.
    const jobs = [
      job({ browser: { name: "firefox" }, steps: [{ goTo: "x" }] }),
      job({ browser: { name: "firefox" }, steps: [{ find: "y" }] }),
    ];
    expect(combos(jobs, runner("windows"))).to.deep.equal(["windows::firefox"]);
  });

  it("keeps platform and browser distinct in the key", function () {
    const jobs = [
      job({ platform: "windows", browser: { name: "chrome" }, steps: [{ goTo: "x" }] }),
      job({ platform: "windows", browser: { name: "firefox" }, steps: [{ goTo: "x" }] }),
      job({ platform: "mac", browser: { name: "chrome" }, steps: [{ goTo: "x" }] }),
    ];
    expect(combos(jobs, runner("windows"))).to.deep.equal([
      "windows::chrome",
      "windows::firefox",
      "mac::chrome",
    ]);
  });

  it("normalizes webkit to safari in the key", function () {
    const jobs = [
      job({ platform: "mac", browser: { name: "webkit" }, steps: [{ goTo: "x" }] }),
    ];
    expect(combos(jobs, runner("mac"))).to.deep.equal(["mac::safari"]);
  });

  it("excludes non-driver contexts", function () {
    const jobs = [
      job({ browser: { name: "chrome" }, steps: [{ runShell: "echo hi" }] }),
      job({ steps: [{ wait: 10 }] }),
    ];
    expect(combos(jobs, runner("windows", ["chrome"]))).to.deep.equal([]);
  });

  it("resolves a default browser when the context omits one", function () {
    const jobs = [job({ steps: [{ goTo: "x" }] })];
    const targets = selectWarmUpTargets(jobs, runner("linux", ["chrome"]));
    expect(targets.map((t) => t.combo)).to.deep.equal(["linux::chrome"]);
    // The default browser is written back onto the context for the pool.
    expect(targets[0].context.browser.name).to.equal("chrome");
  });

  it("excludes a driver context when no browser can be resolved", function () {
    // Driver required, no browser on the context, none available to default to.
    const jobs = [job({ steps: [{ goTo: "x" }] })];
    expect(combos(jobs, runner("windows", []))).to.deep.equal([]);
  });

  it("excludes app-only contexts from the browser warm-up pre-pass", function () {
    // App surfaces run on their own per-context Appium server, so app-targeted
    // steps must not pull a browser into the warm-up pre-pass — nor get a
    // default browser written onto their context (mirrors the browser pool
    // sizing, which uses isBrowserRequired, not isDriverRequired).
    const jobs = [
      job({
        steps: [
          { startSurface: { app: "charmap" } },
          { find: { elementText: "Select", surface: { app: "charmap" } } },
        ],
      }),
    ];
    const targets = selectWarmUpTargets(jobs, runner("windows", ["chrome"]));
    expect(targets).to.deep.equal([]);
    expect(jobs[0].context.browser).to.equal(undefined);
  });

  it("excludes mobile-platform contexts from the desktop warm-up pre-pass", function () {
    // A mobile-web context (phase A5) runs its browser ON the device through
    // the per-context app Appium server — warming up a desktop engine for it
    // would launch the wrong browser on the wrong machine. It must not appear
    // as a target NOR get a desktop default browser written onto its context
    // (runContext's mobile branch resolves the device browser itself).
    const jobs = [
      job({ platform: "android", steps: [{ goTo: "x" }] }),
      job({
        platform: "ios",
        browser: { name: "safari" },
        steps: [{ goTo: "x" }],
      }),
    ];
    const targets = selectWarmUpTargets(jobs, runner("linux", ["chrome"]));
    expect(targets).to.deep.equal([]);
    expect(jobs[0].context.browser).to.equal(undefined);
  });

  it("still warms up a mixed browser+app context", function () {
    // A context with both browser and app-targeted steps still needs a browser.
    const jobs = [
      job({
        steps: [
          { goTo: "x" },
          { find: { elementText: "Select", surface: { app: "charmap" } } },
        ],
      }),
    ];
    expect(combos(jobs, runner("windows", ["chrome"]))).to.deep.equal([
      "windows::chrome",
    ]);
  });
});

describe("createAppiumPool", function () {
  it("hands out each port until exhausted", async function () {
    const pool = createAppiumPool([4723, 4724]);
    expect(await pool.acquire()).to.equal(4723);
    expect(await pool.acquire()).to.equal(4724);
  });

  it("blocks acquire when exhausted, then resolves on release", async function () {
    const pool = createAppiumPool([4723]);
    const held = await pool.acquire();
    let got;
    const pending = pool.acquire().then((p) => (got = p));
    // Nothing free yet — the second acquire must still be pending.
    await Promise.resolve();
    expect(got).to.equal(undefined);
    pool.release(held);
    await pending;
    expect(got).to.equal(4723);
  });

  it("hands a released port straight to the next waiter, in FIFO order", async function () {
    const pool = createAppiumPool([5]);
    const held = await pool.acquire();
    const order = [];
    const w1 = pool.acquire().then((p) => order.push(["w1", p]));
    const w2 = pool.acquire().then((p) => order.push(["w2", p]));
    pool.release(held); // -> w1
    await w1;
    pool.release(5); // -> w2
    await w2;
    expect(order).to.deep.equal([
      ["w1", 5],
      ["w2", 5],
    ]);
  });
});

// Integration tests against runSpecs with non-driver steps only (wait,
// runShell), so no Appium server or browser is needed. Explicit ids
// everywhere so reports are deep-comparable across runs.
describe("runSpecs concurrency", function () {
  this.timeout(120000);

  // Build a resolvedTests bundle: 2 specs x 2 tests x 2 contexts. Wait
  // durations decrease across the flat job order, so with more than one
  // runner the completion order inverts relative to the input order.
  function buildFixture({ concurrentRunners, failContextIndex = -1 } = {}) {
    let jobIndex = 0;
    const specs = [1, 2].map((s) => ({
      specId: `spec-${s}`,
      tests: [1, 2].map((t) => ({
        testId: `spec-${s}-test-${t}`,
        contexts: [1, 2].map((c) => {
          const i = jobIndex++;
          const steps = [
            { stepId: `s${s}-t${t}-c${c}-wait`, wait: 800 - i * 100 },
            {
              stepId: `s${s}-t${t}-c${c}-shell`,
              runShell: i === failContextIndex ? "exit 1" : `echo job-${i}`,
            },
          ];
          return { contextId: `spec-${s}-test-${t}-context-${c}`, steps };
        }),
      })),
    }));
    return {
      config: {
        logLevel: "silent",
        telemetry: { send: false },
        environment: getEnvironment(),
        concurrentRunners,
      },
      specs,
    };
  }

  it("produces an identical report with 1 and 2 runners", async function () {
    const sequential = await runSpecs({
      resolvedTests: buildFixture({ concurrentRunners: 1 }),
    });
    const concurrent = await runSpecs({
      resolvedTests: buildFixture({ concurrentRunners: 2 }),
    });
    // runId / runDir are intentionally unique per run (timestamped artifact
    // folder); drop them before comparing execution results.
    for (const report of [sequential, concurrent]) {
      delete report.runId;
      delete report.runDir;
    }
    expect(concurrent).to.deep.equal(sequential);
  });

  it("derives deterministic contextIds when contexts omit one", async function () {
    // Contexts without an explicit contextId (programmatic callers that skip
    // the resolver) must get a stable platform-derived ID with collision
    // suffixing — never a random UUID — so two runs produce identical IDs.
    function fixtureWithoutContextIds() {
      const platform = getEnvironment().platform;
      return {
        config: {
          logLevel: "silent",
          telemetry: { send: false },
          environment: getEnvironment(),
          concurrentRunners: 1,
        },
        specs: [
          {
            specId: "spec-x",
            tests: [
              {
                testId: "spec-x-test-1",
                // Two browserless contexts on the same platform → same base,
                // so the second must get a `-2` suffix.
                contexts: [
                  { platform, steps: [{ runShell: "echo a" }] },
                  { platform, steps: [{ runShell: "echo b" }] },
                ],
              },
            ],
          },
        ],
      };
    }
    const platform = getEnvironment().platform;
    const first = await runSpecs({ resolvedTests: fixtureWithoutContextIds() });
    const second = await runSpecs({ resolvedTests: fixtureWithoutContextIds() });
    const ids = (report) =>
      report.specs[0].tests[0].contexts.map((c) => c.contextId);
    expect(ids(first)).to.deep.equal([platform, `${platform}-2`]);
    expect(ids(second)).to.deep.equal(ids(first));
  });

  it("keeps report order identical to input order with 3 runners", async function () {
    const report = await runSpecs({
      resolvedTests: buildFixture({ concurrentRunners: 3 }),
    });
    const contextIds = report.specs.flatMap((spec) =>
      spec.tests.flatMap((test) =>
        test.contexts.map((context) => context.contextId)
      )
    );
    expect(contextIds).to.deep.equal([
      "spec-1-test-1-context-1",
      "spec-1-test-1-context-2",
      "spec-1-test-2-context-1",
      "spec-1-test-2-context-2",
      "spec-2-test-1-context-1",
      "spec-2-test-1-context-2",
      "spec-2-test-2-context-1",
      "spec-2-test-2-context-2",
    ]);
  });

  it("isolates a failing context from its siblings", async function () {
    const report = await runSpecs({
      resolvedTests: buildFixture({ concurrentRunners: 2, failContextIndex: 2 }),
    });
    const contexts = report.specs.flatMap((spec) =>
      spec.tests.flatMap((test) => test.contexts)
    );
    expect(contexts.map((context) => context.result)).to.deep.equal([
      "PASS",
      "PASS",
      "FAIL",
      "PASS",
      "PASS",
      "PASS",
      "PASS",
      "PASS",
    ]);
    expect(report.summary.contexts).to.deep.equal({
      pass: 7,
      fail: 1,
      warning: 0,
      skipped: 0,
    });
    // The failing context belongs to spec-1-test-2; that test and spec FAIL,
    // everything else PASSes.
    expect(report.specs[0].result).to.equal("FAIL");
    expect(report.specs[0].tests[1].result).to.equal("FAIL");
    expect(report.specs[0].tests[0].result).to.equal("PASS");
    expect(report.specs[1].result).to.equal("PASS");
  });

  it("handles a context without steps gracefully", async function () {
    // The resolved shape doesn't guarantee `steps`; a stepless context must
    // roll up SKIPPED instead of crashing in isDriverRequired.
    const resolvedTests = {
      config: {
        logLevel: "silent",
        telemetry: { send: false },
        environment: getEnvironment(),
      },
      specs: [
        {
          specId: "stepless",
          tests: [
            {
              testId: "stepless-test",
              contexts: [{ contextId: "stepless-context" }],
            },
          ],
        },
      ],
    };
    const report = await runSpecs({ resolvedTests });
    expect(report.specs[0].tests[0].contexts[0].result).to.equal("SKIPPED");
    expect(report.summary.contexts).to.deep.equal({
      pass: 0,
      fail: 0,
      warning: 0,
      skipped: 1,
    });
  });

  it("actually runs contexts concurrently", async function () {
    // Two contexts that each wait 1200ms, timed at 1 runner and at 2 runners.
    // Comparing against a sequential baseline measured in the same run keeps
    // the assertion meaningful under heavy CI load, where a fixed wall-clock
    // bound would be brittle.
    const timingFixture = (concurrentRunners) => ({
      config: {
        logLevel: "silent",
        telemetry: { send: false },
        environment: getEnvironment(),
        concurrentRunners,
      },
      specs: [
        {
          specId: "timing",
          tests: [
            {
              testId: "timing-test",
              contexts: [1, 2].map((c) => ({
                contextId: `timing-context-${c}`,
                steps: [{ stepId: `timing-wait-${c}`, wait: 1200 }],
              })),
            },
          ],
        },
      ],
    });

    let start = Date.now();
    const sequentialReport = await runSpecs({
      resolvedTests: timingFixture(1),
    });
    const sequentialMs = Date.now() - start;

    start = Date.now();
    const concurrentReport = await runSpecs({
      resolvedTests: timingFixture(2),
    });
    const concurrentMs = Date.now() - start;

    expect(sequentialReport.summary.contexts.pass).to.equal(2);
    expect(concurrentReport.summary.contexts.pass).to.equal(2);
    // Sequential is >= 2400ms of pure waiting; concurrent overlaps the two
    // waits, so it should beat the baseline by a comfortable margin.
    expect(concurrentMs).to.be.below(sequentialMs - 600);
  });
});
