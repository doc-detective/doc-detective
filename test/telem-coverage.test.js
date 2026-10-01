// Coverage-closing tests for src/core/telem.ts (compiled dist/core/telem.js).
//
// Hermetic and OFFLINE. telem.ts constructs a real PostHog client and calls
// capture()/shutdown() at the end of sendTelemetry. We stub PostHog.prototype's
// capture + shutdown (prototype methods resolve at call time, so the instance
// telem.ts constructs uses our stubs) — no event is ever enqueued or flushed,
// so no network request is made. telemetryNotice is a pure log call.

import assert from "node:assert/strict";
import os from "node:os";
import sinon from "sinon";
import { PostHog } from "posthog-node";
import {
  telemetryNotice,
  sendTelemetry,
  awaitTelemetryFlush,
} from "../dist/core/telem.js";

const config = { logLevel: "silent" };

describe("telem coverage: telemetryNotice", function () {
  it("emits the disabled notice when telemetry.send === false", function () {
    // Pure log call — just exercise the disabled branch without throwing.
    telemetryNotice({ ...config, telemetry: { send: false } });
  });
  it("emits the enabled notice otherwise", function () {
    telemetryNotice({ ...config });
  });
});

describe("telem coverage: sendTelemetry", function () {
  let captureStub;
  let shutdownStub;
  beforeEach(function () {
    captureStub = sinon.stub(PostHog.prototype, "capture").callsFake(() => {});
    shutdownStub = sinon
      .stub(PostHog.prototype, "shutdown")
      .callsFake(async () => {});
  });
  afterEach(async function () {
    // Drain any flush this test kicked off before restoring the stubs.
    await awaitTelemetryFlush();
    sinon.restore();
    delete process.env.DOC_DETECTIVE_META;
  });

  it("returns early without a client when telemetry.send === false", function () {
    sendTelemetry({ ...config, telemetry: { send: false } }, "runTests", {});
    assert.equal(captureStub.called, false);
  });

  it("assembles + flattens a runTests summary and captures the event", function () {
    const results = {
      summary: {
        specs: { pass: 1, fail: 0 }, // 2-level -> specs_pass / specs_fail
        tests: { pass: { total: 2 }, fail: { total: 0 } }, // 3-level -> tests_pass_total
        contexts: 5, // primitive -> contexts
      },
    };
    sendTelemetry({ ...config, telemetry: { userId: "u1" } }, "runTests", results);
    assert.equal(captureStub.calledOnce, true);
    const event = captureStub.firstCall.args[0];
    assert.equal(event.event, "runTests");
    assert.equal(event.distinctId, "u1");
    assert.equal(event.properties.specs_pass, 1);
    assert.equal(event.properties.specs_fail, 0);
    assert.equal(event.properties.tests_pass_total, 2);
    assert.equal(event.properties.contexts, 5);
    // Assembled distribution defaults.
    assert.equal(event.properties.distribution, "doc-detective");
    assert.ok(event.properties.core_version);
  });

  it("honors DOC_DETECTIVE_META and falls back to an anonymous id for a non-runTests command", function () {
    process.env.DOC_DETECTIVE_META = JSON.stringify({
      distribution: "custom",
      dist_interface: "cli",
    });
    sendTelemetry({ ...config }, "someCommand", {});
    assert.equal(captureStub.calledOnce, true);
    const event = captureStub.firstCall.args[0];
    assert.equal(event.event, "someCommand");
    assert.equal(event.distinctId, "anonymous");
    assert.equal(event.properties.distribution, "custom");
    assert.equal(event.properties.dist_interface, "cli");
  });

  it("falls back to the raw os.platform() name for an unmapped platform", function () {
    // platformMap only maps win32/darwin/linux; an unmapped platform hits the
    // `|| os.platform()` fallback. os is a default import, so stubbing the
    // shared module object's property intercepts telem's call.
    sinon.stub(os, "platform").returns("freebsd");
    sendTelemetry({ ...config }, "someCommand", {});
    const event = captureStub.firstCall.args[0];
    assert.equal(event.properties.core_platform, "freebsd");
  });

  // Phase 1.6: the flush is kicked off inside sendTelemetry (bounded, not
  // awaited there) and joined later via awaitTelemetryFlush, so the PostHog
  // round-trip overlaps reporter/hint I/O instead of hanging off the tail.
  it("kicks off a BOUNDED shutdown flush (2000ms), not an unbounded one", function () {
    sendTelemetry({ ...config }, "someCommand", {});
    assert.equal(shutdownStub.calledOnce, true);
    assert.equal(shutdownStub.firstCall.args[0], 2000);
  });

  it("awaitTelemetryFlush joins the in-flight flush kicked off by sendTelemetry", async function () {
    let flushResolved = false;
    shutdownStub.callsFake(
      () =>
        new Promise((resolve) =>
          setImmediate(() => {
            flushResolved = true;
            resolve();
          })
        )
    );
    sendTelemetry({ ...config }, "someCommand", {});
    // Flush hasn't completed synchronously — awaitTelemetryFlush must wait.
    assert.equal(flushResolved, false);
    await awaitTelemetryFlush();
    assert.equal(flushResolved, true);
  });

  it("awaitTelemetryFlush is a no-op when telemetry is disabled (no flush pending)", async function () {
    await awaitTelemetryFlush(); // drain anything prior
    sendTelemetry({ ...config, telemetry: { send: false } }, "runTests", {});
    assert.equal(shutdownStub.called, false);
    await awaitTelemetryFlush(); // resolves immediately, does not throw
  });

  it("awaitTelemetryFlush swallows a shutdown rejection (telemetry never fails a run)", async function () {
    shutdownStub.callsFake(async () => {
      throw new Error("network down");
    });
    sendTelemetry({ ...config }, "someCommand", {});
    await awaitTelemetryFlush(); // must not throw
  });
});
