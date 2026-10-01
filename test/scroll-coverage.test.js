import assert from "node:assert/strict";
import { scroll } from "../dist/core/tests/scroll.js";

// Hermetic unit coverage for src/core/tests/scroll.ts. scroll(action, page,
// config) has three branches: skip when no recording is in progress, PASS when
// the wheel scroll resolves, and FAIL when it rejects. A plain fake `page` with
// a `mouse.wheel` stub covers all three — no browser/driver needed.

describe("scroll action (unit)", function () {
  it("skips with PASS when no recordings are in progress", async function () {
    const page = {
      mouse: {
        wheel: async () => {
          throw new Error("should not be called when skipping");
        },
      },
    };
    const { result } = await scroll(
      { x: 10, y: 20 },
      page,
      { videoDetails: {}, debugRecording: {} }
    );
    assert.equal(result.status, "PASS");
    assert.match(result.description, /No recordings are in progress/);
  });

  it("PASSes and forwards deltas to mouse.wheel when a recording is active", async function () {
    let received;
    const page = {
      mouse: {
        wheel: async (args) => {
          received = args;
        },
      },
    };
    const { result } = await scroll(
      { x: 5, y: -7 },
      page,
      { videoDetails: { ffmpeg: { pid: 1 } }, debugRecording: {} }
    );
    assert.equal(result.status, "PASS");
    assert.match(result.description, /Scroll complete/);
    // The action's x/y are forwarded as deltaX/deltaY.
    assert.deepEqual(received, { deltaX: 5, deltaY: -7 });
  });

  it("runs when only a debug recording is active", async function () {
    const page = { mouse: { wheel: async () => {} } };
    const { result } = await scroll(
      { x: 1, y: 1 },
      page,
      { videoDetails: {}, debugRecording: { path: "/tmp/x" } }
    );
    assert.equal(result.status, "PASS");
    assert.match(result.description, /Scroll complete/);
  });

  it("FAILs when the wheel scroll throws", async function () {
    const page = {
      mouse: {
        wheel: async () => {
          throw new Error("wheel unavailable");
        },
      },
    };
    const { result } = await scroll(
      { x: 3, y: 4 },
      page,
      { videoDetails: { ffmpeg: {} }, debugRecording: {} }
    );
    assert.equal(result.status, "FAIL");
    assert.match(result.description, /Couldn't scroll/);
  });
});
