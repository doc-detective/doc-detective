// Stable capture, capture-only `style`, and the fonts wait (ADR 01221). Runs
// the real saveScreenshot pipeline against a fake driver that records every
// call, so the order of injection, capture, and removal is visible.

import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import { saveScreenshot, captureUntilStable } from "../dist/core/tests/saveScreenshot.js";

const require = createRequire(import.meta.url);

let sharp;
try {
  const mod = require("sharp");
  sharp = mod && (mod.default ?? mod);
} catch {
  sharp = null;
}

async function solidPng(shade) {
  return sharp({ create: { width: 40, height: 30, channels: 3, background: { r: shade, g: shade, b: shade } } })
    .png()
    .toBuffer();
}

// Serves `frames` in order (the last one repeats) and logs each call as
// `execute:<source>` or `takeScreenshot`.
function fakeDriver(frames, { throwOnCapture = false, throwOnAddStyle = false } = {}) {
  const calls = [];
  let index = 0;
  return {
    calls,
    async takeScreenshot() {
      calls.push({ kind: "takeScreenshot" });
      if (throwOnCapture) throw new Error("session gone");
      const frame = frames[Math.min(index, frames.length - 1)];
      index += 1;
      return frame.toString("base64");
    },
    async execute(fn, ...args) {
      calls.push({ kind: "execute", source: String(fn), args });
      // The page script ran (the style is on the page), then the command failed.
      if (throwOnAddStyle && String(fn).includes("addCaptureStyle")) throw new Error("socket hang up");
      return undefined;
    },
  };
}

describe("screenshot stable, style, and fonts wait", function () {
  this.timeout(20000);

  let dir;
  beforeEach(function () {
    if (!sharp) this.skip();
    dir = fs.mkdtempSync(path.join(os.tmpdir(), "dd-stable-"));
  });
  afterEach(function () {
    if (dir) fs.rmSync(dir, { recursive: true, force: true });
  });

  function run(screenshot, driver) {
    return saveScreenshot({
      config: {},
      step: { stepId: "s1", screenshot: { path: path.join(dir, "shot.png"), ...screenshot } },
      driver,
    });
  }

  it("`stable` captures until two captures in a row match", async function () {
    const driver = fakeDriver([await solidPng(0), await solidPng(100), await solidPng(200), await solidPng(200)]);
    const result = await run({ stable: true }, driver);
    assert.equal(result.status, "PASS", result.description);
    assert.equal(result.outputs.stable, true);
    assert.equal(driver.calls.filter((c) => c.kind === "takeScreenshot").length, 4);
    const saved = await sharp(path.join(dir, "shot.png")).raw().toBuffer();
    assert.equal(saved[0], 200);
  });

  it("without `stable`, captures once and adds no output", async function () {
    const driver = fakeDriver([await solidPng(0), await solidPng(100)]);
    const result = await run({}, driver);
    assert.equal(result.status, "PASS", result.description);
    assert.equal(result.outputs.stable, undefined);
    assert.equal(driver.calls.filter((c) => c.kind === "takeScreenshot").length, 1);
  });

  it("`stable` that never settles warns and keeps the last capture", async function () {
    this.timeout(15000);
    let shade = 0;
    const frames = [];
    for (let i = 0; i < 80; i++) frames.push(await solidPng((shade += 3) % 256));
    const driver = fakeDriver(frames);
    const result = await run({ stable: true }, driver);
    assert.equal(result.status, "WARNING", result.description);
    assert.equal(result.outputs.stable, false);
    assert.match(result.description, /Page kept changing for 5 seconds, so the screenshot may not be stable\./);
    const warning = result.assertions.find((a) => a.statement === "$$outputs.stable == true");
    assert.equal(warning?.result, "WARNING");
  });

  it("injects `style` before the capture and removes it after", async function () {
    const css = ".banner { visibility: hidden !important; }";
    const driver = fakeDriver([await solidPng(0)]);
    const result = await run({ style: css }, driver);
    assert.equal(result.status, "PASS", result.description);
    const add = driver.calls.findIndex((c) => c.kind === "execute" && c.source.includes("addCaptureStyle"));
    const shot = driver.calls.findIndex((c) => c.kind === "takeScreenshot");
    const remove = driver.calls.findIndex((c) => c.kind === "execute" && c.source.includes("removeCaptureStyle"));
    assert.ok(add >= 0 && add < shot, "style added before the capture");
    assert.deepEqual(driver.calls[add].args, [css]);
    assert.ok(remove > shot, "style removed after the capture");
  });

  it("removes `style` when the capture throws", async function () {
    const driver = fakeDriver([await solidPng(0)], { throwOnCapture: true });
    const result = await run({ style: "body { color: red; }" }, driver);
    assert.equal(result.status, "FAIL");
    assert.ok(driver.calls.some((c) => c.kind === "execute" && c.source.includes("removeCaptureStyle")));
  });

  it("removes `style` when adding it throws after the page script ran", async function () {
    const driver = fakeDriver([await solidPng(0)], { throwOnAddStyle: true });
    const result = await run({ style: "body { color: red; }" }, driver);
    assert.equal(result.status, "FAIL");
    assert.match(result.description, /Couldn't add the `style` CSS to the page/);
    assert.ok(driver.calls.some((c) => c.kind === "execute" && c.source.includes("removeCaptureStyle")));
    assert.equal(driver.calls.filter((c) => c.kind === "takeScreenshot").length, 0);
  });

  it("waits for `document.fonts.ready` before every browser capture", async function () {
    const driver = fakeDriver([await solidPng(0)]);
    await run({}, driver);
    const fonts = driver.calls.findIndex((c) => c.kind === "execute" && c.source.includes("waitForFonts") && c.source.includes("fonts"));
    const shot = driver.calls.findIndex((c) => c.kind === "takeScreenshot");
    assert.ok(fonts >= 0 && fonts < shot, "fonts wait runs before the capture");
  });
});

describe("captureUntilStable", function () {
  // A fake clock: sleeping advances time, so the 5-second ceiling runs instantly.
  function fakeClock() {
    let t = 0;
    return { now: () => t, sleep: async (ms) => void (t += ms) };
  }

  it("stops at the first repeat", async function () {
    const frames = [Buffer.from("a"), Buffer.from("b"), Buffer.from("b")];
    let i = 0;
    const out = await captureUntilStable(async () => frames[i++], true, fakeClock());
    assert.deepEqual(out, { buffer: Buffer.from("b"), stable: true });
    assert.equal(i, 3);
  });

  it("gives up after 5 seconds with the last capture", async function () {
    let i = 0;
    const out = await captureUntilStable(async () => Buffer.from(String(i++)), true, fakeClock());
    assert.equal(out.stable, false);
    assert.equal(out.buffer.toString(), String(i - 1));
    assert.equal(i, 51); // one capture, then one every 100 ms for 5 s
  });

  it("captures once when not asked to settle", async function () {
    let i = 0;
    const out = await captureUntilStable(async () => Buffer.from(String(i++)), false, fakeClock());
    assert.deepEqual(out, { buffer: Buffer.from("0"), stable: true });
  });
});
