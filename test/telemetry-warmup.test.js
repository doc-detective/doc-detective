// Telemetry connection warm-up (ADR 01132).
//
// Hermetic: globalThis.fetch is stubbed, so nothing reaches PostHog. posthog-node
// resolves the global `fetch` at call time, so the stub sees its batch POST too.

import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import zlib from "node:zlib";
import { spawnSync } from "node:child_process";
import { pathToFileURL } from "node:url";
import sinon from "sinon";
import {
  POSTHOG_HOST,
  prewarmTelemetry,
  abortTelemetryWarmup,
  telemetryFetch,
  setTelemetryLoader,
} from "../dist/core/telemLite.js";
import { runTests, awaitTelemetryFlush } from "../dist/core/index.js";

const okResponse = () => new Response("{}", { status: 200 });

describe("telemetry warm-up", function () {
  let fetchStub;
  beforeEach(function () {
    fetchStub = sinon.stub(globalThis, "fetch").callsFake(async () => okResponse());
  });
  // Drain a flush a test left in flight (a dry run's telemetry POST lands after
  // runTests returns, by design) while this test's fetch stub is still in
  // place, so it can neither leak into the next test's stub nor reach the
  // network once the real fetch is restored.
  afterEach(async function () {
    await awaitTelemetryFlush();
    abortTelemetryWarmup();
    sinon.restore();
  });

  it("makes no request when telemetry.send is false", function () {
    prewarmTelemetry({ telemetry: { send: false } });
    assert.equal(fetchStub.called, false);
  });

  it("opens a connection to the PostHog host with OPTIONS (HEAD gets the connection closed)", function () {
    prewarmTelemetry({});
    assert.equal(fetchStub.calledOnce, true);
    const [url, init] = fetchStub.firstCall.args;
    assert.equal(url, POSTHOG_HOST);
    assert.equal(init.method, "OPTIONS");
    assert.equal(init.redirect, "manual");
  });

  it("abortTelemetryWarmup cancels an in-flight warm-up", function () {
    prewarmTelemetry({});
    const { signal } = fetchStub.firstCall.args[1];
    assert.equal(signal.aborted, false);
    abortTelemetryWarmup();
    assert.equal(signal.aborted, true);
  });

  // A send issued while the warm-up is still in flight would otherwise open a
  // second connection (HTTP/1.1, one request per socket) and pay the full
  // handshake anyway.
  it("telemetryFetch holds a send until the in-flight warm-up settles, then reuses it", async function () {
    let releaseWarmup;
    fetchStub.callsFake((url, init) =>
      init?.method === "OPTIONS"
        ? new Promise((resolve) => (releaseWarmup = () => resolve(okResponse())))
        : Promise.resolve(okResponse())
    );
    prewarmTelemetry({});
    const send = telemetryFetch(`${POSTHOG_HOST}/batch/`, { method: "POST", body: "{}" });
    await new Promise((r) => setImmediate(r));
    assert.equal(fetchStub.callCount, 1, "send went out before the warm-up settled");
    releaseWarmup();
    const res = await send;
    assert.equal(res.status, 200);
    assert.equal(fetchStub.callCount, 2);
    assert.equal(fetchStub.secondCall.args[0], `${POSTHOG_HOST}/batch/`);
  });

  it("telemetryFetch doesn't wait on a failed warm-up", async function () {
    fetchStub.callsFake(async (url, init) => {
      if (init?.method === "OPTIONS") throw new Error("offline");
      return okResponse();
    });
    prewarmTelemetry({});
    const res = await telemetryFetch(`${POSTHOG_HOST}/batch/`, { method: "POST" });
    assert.equal(res.status, 200);
  });

  // Back-to-back or concurrent runTests calls share this module's state: a new
  // warm-up must cancel the previous one, and a send must never wait on the
  // orphaned one.
  it("a second warm-up aborts the first, and a send waits only on the latest", async function () {
    const pending = [];
    fetchStub.callsFake((url, init) =>
      init?.method === "OPTIONS"
        ? new Promise((resolve, reject) => {
            pending.push(() => resolve(okResponse()));
            init.signal.addEventListener("abort", () => reject(new Error("aborted")));
          })
        : Promise.resolve(okResponse())
    );
    prewarmTelemetry({});
    const first = fetchStub.firstCall.args[1].signal;
    prewarmTelemetry({});
    const second = fetchStub.secondCall.args[1].signal;
    assert.equal(first.aborted, true);
    assert.equal(second.aborted, false);
    const send = telemetryFetch(`${POSTHOG_HOST}/batch/`, { method: "POST" });
    await new Promise((r) => setImmediate(r));
    assert.equal(fetchStub.callCount, 2, "send went out before the latest warm-up settled");
    pending[1]();
    assert.equal((await send).status, 200);
  });

  // A new warm-up that starts while a send is already waiting replaces the old
  // one; the send must follow it to the newest socket, not go out cold the
  // moment the replaced warm-up is aborted.
  it("a send waiting on a warm-up follows a newer warm-up that starts mid-wait", async function () {
    const pending = [];
    fetchStub.callsFake((url, init) =>
      init?.method === "OPTIONS"
        ? new Promise((resolve, reject) => {
            pending.push(() => resolve(okResponse()));
            init.signal.addEventListener("abort", () => reject(new Error("aborted")));
          })
        : Promise.resolve(okResponse())
    );
    prewarmTelemetry({});
    const send = telemetryFetch(`${POSTHOG_HOST}/batch/`, { method: "POST" });
    prewarmTelemetry({}); // aborts the first; the send must now wait on this one
    for (let i = 0; i < 5; i++) await new Promise((r) => setImmediate(r));
    assert.equal(fetchStub.callCount, 2, "send went out before the newer warm-up settled");
    pending[1]();
    assert.equal((await send).status, 200);
    assert.equal(fetchStub.callCount, 3);
  });

  // A warm-up whose request ignores the abort (never settles) must not stall a
  // later send once it has been cancelled.
  it("after abortTelemetryWarmup, a send doesn't wait on the cancelled warm-up", async function () {
    fetchStub.callsFake((url, init) =>
      init?.method === "OPTIONS" ? new Promise(() => {}) : Promise.resolve(okResponse())
    );
    prewarmTelemetry({});
    abortTelemetryWarmup();
    const send = telemetryFetch(`${POSTHOG_HOST}/batch/`, { method: "POST" });
    await new Promise((r) => setImmediate(r));
    assert.equal(fetchStub.callCount, 2, "send is still waiting on the aborted warm-up");
    assert.equal((await send).status, 200);
  });

  it("swallows a failed warm-up (telemetry never fails a run)", async function () {
    fetchStub.callsFake(async () => {
      throw new Error("offline");
    });
    prewarmTelemetry({});
    await new Promise((r) => setImmediate(r)); // no unhandled rejection
  });

  describe("in a run", function () {
    this.timeout(60000);
    let tmp;
    before(function () {
      tmp = fs.mkdtempSync(path.join(os.tmpdir(), "dd-telem-warmup-"));
    });
    after(function () {
      fs.rmSync(tmp, { recursive: true, force: true });
    });

    function decodeBody(init) {
      const raw = Buffer.from(init.body);
      const gz = /gzip/i.test(JSON.stringify(init.headers ?? {}));
      return JSON.parse((gz ? zlib.gunzipSync(raw) : raw).toString("utf8"));
    }

    async function run(telemetry) {
      const spec = path.join(tmp, "shell.spec.json");
      fs.writeFileSync(spec, JSON.stringify({ tests: [{ steps: [{ runShell: "echo hi" }] }] }));
      const results = await runTests({
        input: [spec],
        output: path.join(tmp, "out"),
        logLevel: "silent",
        telemetry,
      });
      await awaitTelemetryFlush();
      return results;
    }

    it("warms the PostHog connection before the run and still delivers the runTests event", async function () {
      const results = await run({ send: true, userId: "warmup-test" });
      assert.equal(results.summary.steps.pass, 1);
      const posthogCalls = fetchStub
        .getCalls()
        .filter((c) => String(c.args[0]).startsWith(POSTHOG_HOST));
      assert.ok(posthogCalls.length >= 2, `expected warm-up + batch, got ${posthogCalls.length}`);
      assert.equal(posthogCalls[0].args[1].method, "OPTIONS");
      const batch = posthogCalls.find((c) => String(c.args[0]).includes("/batch"));
      assert.ok(batch, "no batch request");
      const body = decodeBody(batch.args[1]);
      const events = body.batch ?? [];
      assert.ok(
        events.some((e) => e.event === "runTests" && e.distinct_id === "warmup-test"),
        `runTests event missing: ${JSON.stringify(events).slice(0, 300)}`
      );
    });

    // Telemetry must never fail a run: a telem.js that can't load (broken
    // install) must not throw from runTests or awaitTelemetryFlush after the
    // tests already ran, nor leave an unhandled rejection behind.
    it("still returns results when the telemetry module fails to load", async function () {
      const unhandled = [];
      const onUnhandled = (reason) => unhandled.push(reason);
      process.on("unhandledRejection", onUnhandled);
      setTelemetryLoader(() => Promise.reject(new Error("telem.js failed to load")));
      try {
        const results = await run({ send: true });
        assert.equal(results.summary.steps.pass, 1);
        await awaitTelemetryFlush(); // must not throw
        await new Promise((r) => setImmediate(r));
        assert.deepEqual(unhandled, []);
      } finally {
        setTelemetryLoader();
        process.off("unhandledRejection", onUnhandled);
      }
    });

    // A dry run returns early, and programmatic callers may never call
    // awaitTelemetryFlush, so it must not leave a warm-up in flight.
    it("a dry run starts no warm-up", async function () {
      const spec = path.join(tmp, "shell.spec.json");
      fs.writeFileSync(spec, JSON.stringify({ tests: [{ steps: [{ runShell: "echo hi" }] }] }));
      const log = sinon.stub(console, "log"); // dry run prints the resolved tests
      try {
        await runTests({
          input: [spec],
          output: path.join(tmp, "out"),
          dryRun: true,
          telemetry: { send: true },
        });
      } finally {
        log.restore();
      }
      await awaitTelemetryFlush(); // the dry run's own event POST
      const warmups = fetchStub.getCalls().filter((c) => c.args[1]?.method === "OPTIONS");
      assert.equal(warmups.length, 0);
    });

    // A run that finds no tests returns null without sending anything, and a
    // programmatic caller may never call awaitTelemetryFlush, so runTests
    // itself must cancel the warm-up it started.
    it("a run that finds no tests leaves no warm-up in flight", async function () {
      const empty = path.join(tmp, "empty");
      fs.mkdirSync(empty, { recursive: true });
      fs.writeFileSync(path.join(empty, "notes.txt"), "nothing to test here");
      const result = await runTests({
        input: [empty],
        output: path.join(tmp, "out"),
        logLevel: "silent",
        telemetry: { send: true },
      });
      assert.equal(result, null);
      const warmups = fetchStub.getCalls().filter((c) => c.args[1]?.method === "OPTIONS");
      assert.equal(warmups.length, 1, "expected the run to start a warm-up");
      assert.equal(warmups[0].args[1].signal.aborted, true, "warm-up left in flight");
    });

    it("makes no PostHog request at all with telemetry.send false", async function () {
      const before = fetchStub.callCount; // count only this run's requests
      await run({ send: false });
      const posthogCalls = fetchStub
        .getCalls()
        .slice(before)
        .filter((c) => String(c.args[0]).startsWith(POSTHOG_HOST));
      assert.equal(posthogCalls.length, 0);
    });

    // The opt-out must hold for the EFFECTIVE config, not just what the caller
    // passed: core setConfig still applies the DOC_DETECTIVE env override, and
    // nothing may contact PostHog before that is known.
    it("makes no PostHog request when DOC_DETECTIVE opts out, even if the caller didn't", async function () {
      const saved = process.env.DOC_DETECTIVE;
      process.env.DOC_DETECTIVE = JSON.stringify({ config: { telemetry: { send: false } } });
      try {
        const before = fetchStub.callCount;
        const results = await run(undefined);
        assert.equal(results.summary.steps.pass, 1);
        const posthogCalls = fetchStub
          .getCalls()
          .slice(before)
          .filter((c) => String(c.args[0]).startsWith(POSTHOG_HOST));
        assert.deepEqual(posthogCalls.map((c) => c.args[1]?.method), []);
      } finally {
        if (saved === undefined) delete process.env.DOC_DETECTIVE;
        else process.env.DOC_DETECTIVE = saved;
      }
    });
  });

  // Same guarantee end to end through the CLI, for both opt-out routes. A
  // preload wraps fetch to record (and fake) every request, so nothing reaches
  // the network either way.
  describe("CLI opt-out", function () {
    this.timeout(60000);
    let tmp;
    let hook;
    let spec;
    const bin = path.resolve("bin/doc-detective.js");
    before(function () {
      tmp = fs.mkdtempSync(path.join(os.tmpdir(), "dd-telem-optout-"));
      hook = path.join(tmp, "hook.mjs");
      fs.writeFileSync(
        hook,
        `const urls = [];
globalThis.fetch = async (url, init) => { urls.push((init?.method || "GET") + " " + url); return new Response("{}", { status: 200 }); };
process.on("exit", () => process.stderr.write("FETCHES:" + JSON.stringify(urls) + "\\n"));
`
      );
      spec = path.join(tmp, "shell.spec.json");
      fs.writeFileSync(spec, JSON.stringify({ tests: [{ steps: [{ runShell: "echo hi" }] }] }));
    });
    after(function () {
      fs.rmSync(tmp, { recursive: true, force: true });
    });

    function cliFetches(configObj, env = {}) {
      const config = path.join(tmp, "config.json");
      fs.writeFileSync(config, JSON.stringify(configObj));
      const res = spawnSync(
        process.execPath,
        ["--import", pathToFileURL(hook).href, bin, "--input", spec, "--config", config, "--output", path.join(tmp, "out"), "--logLevel", "silent"],
        { cwd: tmp, encoding: "utf8", env: { ...process.env, CI: "1", ...env } }
      );
      const line = res.stderr.split(/\r?\n/).find((l) => l.startsWith("FETCHES:"));
      assert.ok(line, `no fetch report; exit ${res.status}\n${res.stderr}`);
      return JSON.parse(line.slice(8)).filter((u) => u.includes(POSTHOG_HOST));
    }

    it("a config file with telemetry.send false makes no PostHog request", function () {
      assert.deepEqual(cliFetches({ telemetry: { send: false } }), []);
    });

    it("a DOC_DETECTIVE env opt-out makes no PostHog request", function () {
      assert.deepEqual(
        cliFetches({}, { DOC_DETECTIVE: JSON.stringify({ config: { telemetry: { send: false } } }) }),
        []
      );
    });

    it("with telemetry on, the CLI warms up and then sends", function () {
      const calls = cliFetches({ telemetry: { send: true } });
      assert.equal(calls[0], `OPTIONS ${POSTHOG_HOST}`);
      assert.ok(calls.some((c) => c.startsWith(`POST ${POSTHOG_HOST}/batch`)), JSON.stringify(calls));
    });
  });
});
