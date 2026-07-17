import { strict as assert } from "node:assert";
import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  parseBlackdetect,
  createMatchingLineCollector,
  detectAllBlack,
  getFfmpegPath,
} from "../dist/core/tests/ffmpegRecorder.js";
import { stopRecording } from "../dist/core/tests/stopRecording.js";

// ---------------------------------------------------------------------------
// ADR 01080: structural recording assertions (record.verify).
// ---------------------------------------------------------------------------

// Generate a tiny real mp4 with the bundled ffmpeg (lavfi color source), same
// pattern as test/app-recording.test.js — real video data, no checked-in
// binary fixture.
async function generateColorMp4(targetPath, color) {
  const ffmpegPath = await getFfmpegPath({});
  await new Promise((resolve, reject) => {
    const child = spawn(ffmpegPath, [
      "-y",
      "-f",
      "lavfi",
      "-i",
      `color=c=${color}:s=64x64:d=0.5:r=10`,
      "-pix_fmt",
      "yuv420p",
      targetPath,
    ]);
    child.on("close", (code) =>
      code === 0
        ? resolve()
        : reject(new Error(`sample mp4 generation failed (${code})`))
    );
    child.on("error", reject);
  });
}

describe("parseBlackdetect", function () {
  it("reports allBlack when detected intervals cover the full duration", function () {
    const stderr =
      "[blackdetect @ 0x1] black_start:0 black_end:2.04 black_duration:2.04\n";
    assert.equal(parseBlackdetect(stderr, 2.0), true);
  });

  // Real ffmpeg signature: blackdetect's last interval ends at the last black
  // FRAME's timestamp, not the clip end, so a fully-black clip under-reports
  // coverage by up to one frame interval (measured: a 0.5s 10fps black clip
  // reports black_duration:0.4). The fps-derived tolerance absorbs exactly
  // that gap.
  it("tolerates the one-frame under-report of a fully black clip", function () {
    const stderr =
      "[blackdetect @ 0x1] black_start:0 black_end:0.4 black_duration:0.4\n";
    assert.equal(parseBlackdetect(stderr, 0.5, 10), true);
    // Without an fps to size the tolerance, the same input stays undecided
    // (not provably black) rather than guessing.
    assert.equal(parseBlackdetect(stderr, 0.5), false);
  });

  it("still rejects a half-black clip when fps tolerance applies", function () {
    const stderr =
      "[blackdetect @ 0x1] black_start:0 black_end:5 black_duration:5\n";
    assert.equal(parseBlackdetect(stderr, 10, 30), false);
  });

  it("reports not-black for partial coverage", function () {
    const stderr =
      "[blackdetect @ 0x1] black_start:0 black_end:0.5 black_duration:0.5\n";
    assert.equal(parseBlackdetect(stderr, 2.0), false);
  });

  it("sums multiple intervals", function () {
    const stderr = [
      "[blackdetect @ 0x1] black_start:0 black_end:1 black_duration:1",
      "[blackdetect @ 0x1] black_start:1 black_end:2 black_duration:1",
    ].join("\n");
    assert.equal(parseBlackdetect(stderr, 2.0), true);
  });

  it("reports not-black for no intervals, garbage input, or unknown duration", function () {
    assert.equal(parseBlackdetect("", 2.0), false);
    assert.equal(parseBlackdetect("frame=  10 fps=0.0", 2.0), false);
    assert.equal(
      parseBlackdetect("[blackdetect @ 0x1] black_start:0 black_end:2", 0),
      false
    );
    assert.equal(
      parseBlackdetect(
        "[blackdetect @ 0x1] black_start:0 black_end:2 black_duration:2",
        undefined
      ),
      false
    );
  });
});

// The blackdetect filter runs over a CHUNKED stderr stream. Chunk boundaries
// fall wherever the pipe flushes, so these pin that a `black_` line survives
// being torn in half — the failure that would let an all-black video pass.
describe("createMatchingLineCollector", function () {
  const BLACK_LINE =
    "[blackdetect @ 0x1] black_start:0 black_end:0.4 black_duration:0.4";

  it("keeps a matching line delivered in one chunk", function () {
    const c = createMatchingLineCollector("black_");
    c.push(`${BLACK_LINE}\n`);
    assert.match(c.flush(), /black_duration:0\.4/);
  });

  it("keeps a matching line split across chunk boundaries", function () {
    const c = createMatchingLineCollector("black_");
    // Tear it mid-token, so neither chunk contains "black_" on its own.
    const cut = BLACK_LINE.indexOf("black_start") + 3;
    c.push(BLACK_LINE.slice(0, cut));
    c.push(`${BLACK_LINE.slice(cut)}\n`);
    assert.match(c.flush(), /black_duration:0\.4/);
  });

  it("keeps a matching line split one character at a time", function () {
    const c = createMatchingLineCollector("black_");
    for (const ch of `${BLACK_LINE}\n`) c.push(ch);
    assert.match(c.flush(), /black_duration:0\.4/);
  });

  it("flushes a final line that has no trailing newline", function () {
    const c = createMatchingLineCollector("black_");
    c.push(BLACK_LINE);
    assert.match(c.flush(), /black_duration:0\.4/);
  });

  it("drops non-matching lines and handles CRLF", function () {
    const c = createMatchingLineCollector("black_");
    c.push("frame= 100 fps=25 q=28.0 size=1kB\r\n");
    c.push(`${BLACK_LINE}\r\n`);
    c.push("frame= 200 fps=25 q=28.0 size=2kB\r\n");
    const out = c.flush();
    assert.match(out, /black_duration:0\.4/);
    assert.ok(!/frame=/.test(out), `progress spam leaked: ${out}`);
  });

  it("stays bounded under progress spam, keeping earlier matches", function () {
    const c = createMatchingLineCollector("black_", 200);
    c.push(`${BLACK_LINE}\n`);
    for (let i = 0; i < 500; i++) c.push(`black_noise_${i}\n`);
    const out = c.flush();
    assert.ok(out.length <= 200, `unbounded: ${out.length}`);
    assert.match(out, /black_duration:0\.4/);
  });

  // The end-to-end shape of the bug: a chunk-split interval must still be
  // parsed as full coverage, not dropped into a false "not black".
  it("feeds parseBlackdetect a torn line without losing the interval", function () {
    const c = createMatchingLineCollector("black_");
    const cut = BLACK_LINE.indexOf("duration") + 2;
    c.push(BLACK_LINE.slice(0, cut));
    c.push(`${BLACK_LINE.slice(cut)}\n`);
    assert.equal(parseBlackdetect(c.flush(), 0.5, 10), true);
  });
});

describe("detectAllBlack (real ffmpeg)", function () {
  this.timeout(60000);
  let tmpDir;
  beforeEach(function () {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "dd-black-"));
  });
  afterEach(function () {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("detects a fully black clip", async function () {
    const p = path.join(tmpDir, "black.mp4");
    await generateColorMp4(p, "black");
    assert.equal(
      await detectAllBlack({
        cacheDir: undefined,
        filePath: p,
        duration: 0.5,
        fps: 10,
      }),
      true
    );
  });

  it("passes a colored clip", async function () {
    const p = path.join(tmpDir, "red.mp4");
    await generateColorMp4(p, "red");
    assert.equal(
      await detectAllBlack({
        cacheDir: undefined,
        filePath: p,
        duration: 0.5,
        fps: 10,
      }),
      false
    );
  });
});

describe("stopRecording: record.verify structural guards", function () {
  this.timeout(60000);
  let tmpDir;
  const config = {};

  beforeEach(function () {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "dd-verify-"));
  });
  afterEach(function () {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  async function stopWithVerify({ color = "red", verify }) {
    const samplePath = path.join(tmpDir, `sample-${color}.mp4`);
    await generateColorMp4(samplePath, color);
    const b64 = fs.readFileSync(samplePath).toString("base64");
    const target = path.join(tmpDir, "out.mp4");
    const handle = {
      type: "appium",
      driver: { stopRecordingScreen: async () => b64 },
      targetPath: target,
      verify,
    };
    const host = { state: { recordings: [handle] } };
    return stopRecording({
      config,
      step: { stepId: "x", stopRecord: true },
      driver: host,
    });
  }

  // A promote failure downgrades the step to WARNING ("we kept the old video").
  // A violated structural guard is a FAIL the author explicitly asked for, and
  // FAIL outranks WARNING in every other roll-up — so the downgrade must not
  // swallow it. This combination only became reachable when aboveVariation
  // (ADR 01078) and verify (ADR 01080) landed together.
  it("keeps a verify FAIL when a failed promote leaves the old recording", async function () {
    const target = path.join(tmpDir, "out.mp4");
    // The committed recording is all black — it violates notBlack, and it's
    // what the probe measures once the promote fails and it's retained.
    await generateColorMp4(target, "black");
    // Force the promote to fail: a non-empty directory at the backup name
    // defeats both the non-recursive rmSync and the rename onto it.
    const backupDir = `${target}.promote-backup`;
    fs.mkdirSync(backupDir, { recursive: true });
    fs.writeFileSync(path.join(backupDir, "occupied"), "x");

    const fresh = path.join(tmpDir, "fresh.mp4");
    await generateColorMp4(fresh, "red");
    const b64 = fs.readFileSync(fresh).toString("base64");

    const baselineDir = path.join(tmpDir, "out.mp4.checkpoints");
    fs.mkdirSync(baselineDir, { recursive: true });
    const baselinePath = path.join(baselineDir, "01-a.png");
    fs.writeFileSync(baselinePath, "committed-baseline");

    const handle = {
      type: "appium",
      driver: { stopRecordingScreen: async () => b64 },
      targetPath: target,
      overwrite: "aboveVariation",
      verify: { notBlack: true },
      checkpoints: {
        maxVariation: 0.05,
        baselineDir,
        stagingDir: path.join(tmpDir, "staging"),
        // Drift, so the verdict is CHANGED and a promote is attempted.
        entries: [
          {
            fileName: "01-a.png",
            stagingPath: path.join(tmpDir, "staging", "01-a.png"),
            baselinePath,
            variation: 0.9,
          },
        ],
      },
    };
    fs.mkdirSync(path.join(tmpDir, "staging"), { recursive: true });
    const host = { state: { recordings: [handle] } };

    const result = await stopRecording({
      config,
      step: { stepId: "x", stopRecord: true },
      driver: host,
    });

    assert.equal(
      result.status,
      "FAIL",
      `a violated guard must survive the promote-failure downgrade, got ${result.status}: ${result.description}`
    );
    // The stale-target note is additive information, not a verdict — it should
    // still reach the author.
    assert.match(result.description, /couldn't replace|stale/i);
  });

  it("passes when every guard holds", async function () {
    const result = await stopWithVerify({
      verify: {
        minDuration: 0.1,
        maxDuration: 5,
        resolution: { width: 64, height: 64 },
        notBlack: true,
      },
    });
    assert.equal(result.status, "PASS");
    assert.equal(result.outputs.allBlack, false);
    assert.equal(result.outputs.resolutionMatch, true);
    assert.ok(
      (result.assertions || []).length >= 3,
      "verify guards recorded as assertion records"
    );
  });

  it("FAILs when the clip is shorter than minDuration", async function () {
    const result = await stopWithVerify({ verify: { minDuration: 10 } });
    assert.equal(result.status, "FAIL");
  });

  it("FAILs when the clip is longer than maxDuration", async function () {
    const result = await stopWithVerify({ verify: { maxDuration: 0.1 } });
    assert.equal(result.status, "FAIL");
  });

  it("FAILs on a resolution mismatch (object form)", async function () {
    const result = await stopWithVerify({
      verify: { resolution: { width: 640, height: 480 } },
    });
    assert.equal(result.status, "FAIL");
    assert.equal(result.outputs.resolutionMatch, false);
  });

  it("tolerates even-dimension rounding (±2 px)", async function () {
    const result = await stopWithVerify({
      verify: { resolution: { width: 65, height: 63 } },
    });
    assert.equal(result.status, "PASS");
    assert.equal(result.outputs.resolutionMatch, true);
  });

  it("FAILs an all-black clip when notBlack is set", async function () {
    const result = await stopWithVerify({
      color: "black",
      verify: { notBlack: true },
    });
    assert.equal(result.status, "FAIL");
    assert.equal(result.outputs.allBlack, true);
  });

  it("skips resolution:true with no capture expectation (device engine) without failing", async function () {
    const result = await stopWithVerify({ verify: { resolution: true } });
    assert.equal(result.status, "PASS");
    assert.equal(result.outputs.resolutionMatch, undefined);
  });

  // An unprobeable file (not real video) can't satisfy a demanded guard.
  // Duration guards fail closed — the author asked for a floor and we can't
  // show one. Blackness is a fraction OF the duration, so with no duration
  // there's no evidence either way: skip rather than assert not-black.
  async function stopUnprobeable(verify) {
    const target = path.join(tmpDir, "junk.mp4");
    const handle = {
      type: "appium",
      driver: {
        stopRecordingScreen: async () =>
          Buffer.from("not-a-video").toString("base64"),
      },
      targetPath: target,
      verify,
    };
    const host = { state: { recordings: [handle] } };
    return stopRecording({
      config,
      step: { stepId: "x", stopRecord: true },
      driver: host,
    });
  }

  it("FAILs a duration guard when the file can't be probed (fail closed)", async function () {
    const result = await stopUnprobeable({ minDuration: 1 });
    assert.equal(result.status, "FAIL");
    assert.equal(result.outputs.duration, undefined);
  });

  it("skips notBlack when the duration is unknown rather than passing it", async function () {
    const result = await stopUnprobeable({ notBlack: true });
    assert.equal(result.status, "PASS");
    assert.equal(
      result.outputs.allBlack,
      undefined,
      "notBlack must not report a verdict it had no evidence for"
    );
  });

  it("a verify FAIL outranks checkpoint drift's WARNING in the roll-up", async function () {
    const samplePath = path.join(tmpDir, "sample-red.mp4");
    await generateColorMp4(samplePath, "red");
    const b64 = fs.readFileSync(samplePath).toString("base64");
    const target = path.join(tmpDir, "out.mp4");
    const stagingDir = path.join(tmpDir, "staging");
    const baselineDir = path.join(tmpDir, "out.mp4.checkpoints");
    fs.mkdirSync(stagingDir, { recursive: true });
    fs.mkdirSync(baselineDir, { recursive: true });
    const stagingPath = path.join(stagingDir, "01-a.png");
    const baselinePath = path.join(baselineDir, "01-a.png");
    fs.writeFileSync(stagingPath, "new");
    fs.writeFileSync(baselinePath, "old");
    const handle = {
      type: "appium",
      driver: { stopRecordingScreen: async () => b64 },
      targetPath: target,
      verify: { minDuration: 10 },
      checkpoints: {
        maxVariation: 0.05,
        baselineDir,
        stagingDir,
        entries: [
          { fileName: "01-a.png", stagingPath, baselinePath, variation: 0.4 },
        ],
      },
    };
    const host = { state: { recordings: [handle] } };
    const result = await stopRecording({
      config,
      step: { stepId: "x", stopRecord: true },
      driver: host,
    });
    assert.equal(result.status, "FAIL");
  });
});
