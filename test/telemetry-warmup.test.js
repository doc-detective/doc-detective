// Telemetry connection warm-up (ADR 01132).
//
// Hermetic: globalThis.fetch is stubbed, so nothing reaches PostHog. posthog-node
// resolves the global `fetch` at call time, so the stub sees its batch POST too.

import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import zlib from "node:zlib";
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
  afterEach(function () {
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
      const warmups = fetchStub.getCalls().filter((c) => c.args[1]?.method === "OPTIONS");
      assert.equal(warmups.length, 0);
    });

    it("makes no PostHog request at all with telemetry.send false", async function () {
      await run({ send: false });
      const posthogCalls = fetchStub
        .getCalls()
        .filter((c) => String(c.args[0]).startsWith(POSTHOG_HOST));
      assert.equal(posthogCalls.length, 0);
    });
  });
});
