import { spawn, execFile } from "node:child_process";
import os from "node:os";
import path from "node:path";
import fs from "node:fs";
import crypto from "node:crypto";
import { loadHeavyDep } from "../../runtime/loader.js";
import { sanitizeFilesystemName } from "../utils.js";
import { isMobileTargetPlatform } from "./mobilePlatform.js";

// Fixed virtual-display size for the Linux Xvfb recording path. Used both to
// start Xvfb and as the x11grab `-video_size`, so the capture matches the
// display exactly (and window/viewport crops fit within it).
const XVFB_SCREEN_SIZE = "1920x1080";

export {
  resolveRecordPlan,
  recordSurfaceApp,
  coerceRecordContextBrowser,
  safeContextId,
  browserCaptureTitle,
  browserDownloadDir,
  buildCaptureArgs,
  resolveCropGeometry,
  ffmpegPathEnv,
  parseCaptureFrameSize,
  parseMediaProbeStderr,
  probeVideoMetadata,
  parseBlackdetect,
  detectAllBlack,
  deriveCropScale,
  detectDisplayPointSize,
  jobIsFfmpegRecording,
  computeEffectiveConcurrency,
  stepHasRouting,
  contextHasRouting,
  contextHasAnyFfmpegRecordStep,
  isFfmpegRecordingForScheduling,
  jobExclusiveResources,
  getFfmpegPath,
  detectMacScreenIndex,
  parseMacScreenIndex,
  checkSystemBinary,
  xvfbDisplay,
  startXvfb,
  XVFB_SCREEN_SIZE,
  detectX11ScreenSize,
  isRecordingActive,
  recordStepName,
  stopRecordTargetName,
  selectRecordingToStop,
  detectRecordingNameConflict,
};

// True when the driver has at least one in-progress recording. Recordings now
// live in `driver.state.recordings` (an array of handles); this keeps the many
// "is a recording running?" reads (cursor handling, per-key typing, etc.) a
// one-liner that's robust to a missing/uninitialized state.
function isRecordingActive(driver: any): boolean {
  return (
    Array.isArray(driver?.state?.recordings) &&
    driver.state.recordings.length > 0
  );
}

// Pull the optional `name` off a `record` step value. Only the detailed-object
// form carries a name; boolean/string shorthands are anonymous (undefined).
function recordStepName(record: any): string | undefined {
  if (record && typeof record === "object" && typeof record.name === "string") {
    const trimmed = record.name.trim();
    return trimmed.length > 0 ? trimmed : undefined;
  }
  return undefined;
}

// Pull the optional target name off a `stopRecord` step value. A string is the
// name directly; an object carries `{ name }`. boolean/null are untargeted
// (LIFO) and return undefined.
function stopRecordTargetName(stopRecord: any): string | undefined {
  if (typeof stopRecord === "string") {
    const trimmed = stopRecord.trim();
    return trimmed.length > 0 ? trimmed : undefined;
  }
  if (
    stopRecord &&
    typeof stopRecord === "object" &&
    typeof stopRecord.name === "string"
  ) {
    const trimmed = stopRecord.name.trim();
    return trimmed.length > 0 ? trimmed : undefined;
  }
  return undefined;
}

// Choose which active recording a `stopRecord` step should stop.
// - A targeted stop (`stopRecord: "name"` / `{ name }`) returns the active
//   recording with that name, searched across the whole set (overlap need not
//   be nested). The Phase-1 preflight guarantees names are unique among
//   simultaneously-active recordings, so a first match is unambiguous.
// - An untargeted stop (`true`/`null`) is LIFO: the most-recently-started
//   active recording. By default it skips the synthetic autoRecord recording
//   so a stray user `stopRecord` can't prematurely end the full-context
//   capture; end-of-context cleanup passes `includeSynthetic` to drain
//   everything (including the synthetic one).
// Returns the handle to stop, or undefined when nothing matches.
function selectRecordingToStop(
  recordings: any[],
  stopRecord: any,
  { includeSynthetic = false }: { includeSynthetic?: boolean } = {}
): any {
  if (!Array.isArray(recordings) || recordings.length === 0) return undefined;
  const target = stopRecordTargetName(stopRecord);
  if (target !== undefined) {
    return recordings.find((r) => r && r.name === target);
  }
  for (let i = recordings.length - 1; i >= 0; i--) {
    const r = recordings[i];
    if (includeSynthetic || !r?.synthetic) return r;
  }
  return undefined;
}

// Statically simulate the set of active named recordings across a test's steps
// to catch an ambiguous overlap: a `record` step that (re)uses a `name` while a
// recording with that same name is still active. Sequential reuse (record "a",
// stopRecord "a", record "a") is fine — the name is freed by the stop.
// Anonymous recordings never conflict. Returns the first conflicting name, or
// null when there is no conflict. Pure — used by the Phase-1 preflight to skip
// (and warn about) the offending test before any step runs.
function detectRecordingNameConflict(steps: any[]): string | null {
  if (!Array.isArray(steps)) return null;
  // Stack of active recordings (names; undefined for anonymous), LIFO.
  const active: Array<string | undefined> = [];
  for (const step of steps) {
    if (!step || typeof step !== "object") continue;
    const isStart =
      typeof step.record !== "undefined" && step.record !== false;
    // `stopRecord: false` is a no-op (see stopRecording), so it doesn't free a
    // name in the simulation.
    const isStop =
      typeof step.stopRecord !== "undefined" && step.stopRecord !== false;
    if (isStart) {
      const name = recordStepName(step.record);
      if (name !== undefined && active.includes(name)) return name;
      active.push(name);
    } else if (isStop) {
      const target = stopRecordTargetName(step.stopRecord);
      if (target !== undefined) {
        const idx = active.lastIndexOf(target);
        if (idx !== -1) active.splice(idx, 1);
      } else if (active.length > 0) {
        active.pop();
      }
    }
  }
  return null;
}

// The browser engine drives getDisplayMedia's auto-select via a per-context
// window title and downloads the .webm to a per-context dir. tests.ts (which
// builds Chrome's launch flag + download pref) and startRecording.ts (which
// sets document.title + reads the download) must agree, so both derive these
// from the contextId here. Unique-per-context titles are what make concurrent
// Chrome recordings safe — each browser auto-selects only its own window.
// contextId can be author-supplied (a spec may set it), so it must be
// sanitized before going into a filesystem path or a launch-flag value —
// otherwise a value like "../x" could escape the temp dir.
function safeContextId(contextId: any): string {
  const raw = String(contextId ?? "ctx");
  const base = sanitizeFilesystemName(raw, "ctx");
  // If sanitization didn't change anything, the id is already filesystem-safe
  // and unique. If it did, distinct raw ids (e.g. "a/b" and "a\\b") could
  // collapse to the same value — which would reintroduce the concurrency bug
  // (shared capture title / download dir). Disambiguate with a short stable
  // hash of the raw id so uniqueness survives sanitization.
  if (base === raw) return base;
  const hash = crypto.createHash("sha1").update(raw).digest("hex").slice(0, 8);
  return `${base}-${hash}`;
}
// Browser-engine recordings are isolated by context AND by process. The
// contextId alone isn't enough: ids repeat across runs ("default",
// "windows-chrome"), so two doc-detective processes on one machine — a dev
// running the CLI while the suite runs, or parallel worktree sessions (see
// test/AGENTS.md) — would share both keys below and corrupt each other
// silently: Chrome auto-selects a capture source by window title, and the
// downloaded .webm lands at a title-independent path. Two concurrent runs
// each recording `out.mp4` were observed producing byte-identical videos
// (one transcoded the other's download) and, when a peer's start deletes an
// in-flight download, "Recording download timed out". The pid is unique
// among live processes by construction and stable for the run's lifetime,
// which is exactly the scope these keys need (ADR 01076).
function recordingProcessToken(): string {
  return String(process.pid);
}
function browserCaptureTitle(contextId: string): string {
  return `RECORD_ME_${recordingProcessToken()}_${safeContextId(contextId)}`;
}
function browserDownloadDir(contextId: string): string {
  return path.join(
    os.tmpdir(),
    "doc-detective",
    "recordings",
    `${safeContextId(contextId)}-${recordingProcessToken()}`
  );
}

type RecordPlan = {
  name: "browser" | "ffmpeg" | "device";
  target: string;
  fps: number;
};

// Pull the engine fields out of a `record` step value. `record` may be a
// boolean, a string path, or a detailed object; only the object form can
// carry an `engine`, which itself is either a string shorthand or an object.
function engineFields(record: any): {
  name?: string;
  target?: string;
  fps?: number;
} {
  const engine =
    record && typeof record === "object" ? record.engine : undefined;
  if (typeof engine === "string") return { name: engine };
  if (engine && typeof engine === "object")
    return { name: engine.name, target: engine.target, fps: engine.fps };
  return {};
}

// Pull the app-surface name off a `record` step value, or undefined when the
// step doesn't target an app surface. Only the detailed-object form can carry
// a surface, and only the { app: … } object form names an app surface.
function recordSurfaceApp(record: any): string | undefined {
  const surface =
    record && typeof record === "object" ? record.surface : undefined;
  if (
    surface &&
    typeof surface === "object" &&
    typeof surface.app === "string" &&
    surface.app.trim().length > 0
  ) {
    return surface.app.trim();
  }
  return undefined;
}

// Normalize a record step into a concrete plan. An explicit engine always
// wins; otherwise auto-resolve: mobile-target contexts (android/ios) record
// the device screen through the app driver (the internal "device" plan — never
// user-selectable), a visible Chrome context uses the concurrency-safe browser
// engine, and everything else falls back to ffmpeg. A record that targets an
// app surface is an ffmpeg capture cropped to that app's window by default
// (target "window"); the browser engine can't capture a native window. The
// context handed in here is already coerced (see coerceRecordContextBrowser),
// so this stays a pure read.
function resolveRecordPlan({
  step,
  context,
}: {
  step: any;
  context: any;
}): RecordPlan {
  const { name, target, fps } = engineFields(step?.record);
  const appSurface = recordSurfaceApp(step?.record);
  let engineName = name;
  if (!engineName) {
    if (isMobileTargetPlatform(context?.platform)) {
      engineName = "device";
    } else {
      const b = context?.browser;
      engineName =
        b?.name === "chrome" && b?.headless === false && !appSurface
          ? "browser"
          : "ffmpeg";
    }
  }
  return {
    name: engineName as "browser" | "ffmpeg" | "device",
    target: target || (appSurface ? "window" : "display"),
    fps: fps ?? 30,
  };
}

function hasRecordStepWithoutEngine(context: any): boolean {
  const steps = Array.isArray(context?.steps) ? context.steps : [];
  return steps.some((s: any) => {
    // Falsy record (undefined, or an explicit `record: false`) is not an
    // active recording step.
    if (!s?.record) return false;
    // App-surface records never use the browser engine, so they don't
    // justify coercing a browser into the context.
    if (recordSurfaceApp(s.record)) return false;
    return engineFields(s.record).name === undefined;
  });
}

// When a context has a record step with no explicit engine and the user
// never chose a browser, prefer to make the browser engine viable by
// coercing to headed Chrome (the browser engine can't record headless).
// Returns the browser to assign, or null when no coercion applies.
function coerceRecordContextBrowser({
  context,
  availableApps,
}: {
  context: any;
  availableApps: any[];
}): { name: string; headless: boolean } | null {
  if (context?.browser) return null; // user specified a browser
  // Mobile-target contexts record the device screen through the app driver;
  // a desktop browser would be the wrong engine on the wrong machine.
  if (isMobileTargetPlatform(context?.platform)) return null;
  if (!hasRecordStepWithoutEngine(context)) return null;
  const chromeAvailable =
    Array.isArray(availableApps) &&
    availableApps.some((a: any) => a?.name === "chrome");
  if (!chromeAvailable) return null;
  return { name: "chrome", headless: false };
}

// Build the ffmpeg argument list for a full-display capture on the given
// platform. window/viewport targets are realized later by cropping during
// transcode, so capture is always full-screen here. Input options
// (`-framerate`, `-f`, device) precede `-i`; output options follow it.
function buildCaptureArgs({
  platform,
  fps,
  displayEnv,
  outputPath,
  screenIndex,
  screenSize,
}: {
  platform: string;
  fps: number;
  displayEnv?: string;
  outputPath: string;
  screenIndex?: string;
  screenSize?: string;
}): string[] {
  const rate = String(fps ?? 30);
  let input: string[];
  switch (platform) {
    case "win32":
      input = ["-f", "gdigrab", "-framerate", rate, "-i", "desktop"];
      break;
    case "darwin":
      // Default to screen index 0 (a camera-less host — e.g. CI — lists the
      // screen at 0). startRecording detects the real index when it can.
      input = [
        "-f",
        "avfoundation",
        "-framerate",
        rate,
        "-i",
        `${screenIndex ?? "0"}:none`,
      ];
      break;
    case "linux":
      // x11grab in the bundled ffmpeg defaults to a 640x480 grab when
      // -video_size is omitted, capturing only a corner of the display. Pass
      // the real screen size so the full display (and any window/viewport
      // crop within it) is captured.
      input = [
        "-f",
        "x11grab",
        "-framerate",
        rate,
        ...(screenSize ? ["-video_size", screenSize] : []),
        "-i",
        displayEnv || ":0.0",
      ];
      break;
    default:
      throw new Error(
        `Screen recording isn't supported on platform '${platform}'.`
      );
  }
  return ["-y", ...input, "-pix_fmt", "yuv420p", outputPath];
}

// Resolve the crop rectangle (in physical pixels) for a window/viewport
// target. Returns null for the full-display target (no crop). Best-effort:
// viewport geometry is derived from in-page metrics scaled by devicePixelRatio,
// window geometry from the WebDriver window rect.
async function resolveCropGeometry({
  driver,
  target,
}: {
  driver: any;
  target: string;
}): Promise<{ x: number; y: number; w: number; h: number } | null> {
  if (target === "viewport") {
    const m = await driver.execute(
      /* c8 ignore start - runs inside the browser via driver.execute(): this callback body
       * reads `window.*` metrics, which are serialized and evaluated by the WebDriver session
       * in the browser process, never in the Node process c8 instruments. It IS exercised by the
       * real E2E recording fixtures (viewport-target crop), just not visible to Node's coverage
       * tool (ADR 01017). */
      () => {
        return {
          sx: (window as any).screenX,
          sy: (window as any).screenY,
          iw: (window as any).innerWidth,
          ih: (window as any).innerHeight,
          ow: (window as any).outerWidth,
          oh: (window as any).outerHeight,
          dpr: (window as any).devicePixelRatio || 1,
        };
      }
      /* c8 ignore stop */
    );
    const dpr = m.dpr || 1;
    // screenX/screenY is the window's outer top-left, which sits above the
    // browser chrome (tabs, address bar, infobars). Offset to the content
    // area: by the side border on X, and by the top chrome height on Y
    // (outerHeight - innerHeight, minus one border for the matching bottom
    // edge). Otherwise the crop captures the chrome instead of the page.
    const border = Math.max(0, (m.ow - m.iw) / 2);
    const topChrome = Math.max(0, m.oh - m.ih - border);
    return {
      x: Math.round((m.sx + border) * dpr),
      y: Math.round((m.sy + topChrome) * dpr),
      w: Math.round(m.iw * dpr),
      h: Math.round(m.ih * dpr),
    };
  }
  if (target === "window") {
    const r = await driver.getWindowRect();
    // getWindowRect is in CSS pixels; the crop filter is in physical pixels,
    // so scale by devicePixelRatio (as the viewport branch does). Falls back
    // to 1 if the page can't report it.
    let dpr: number;
    try {
      dpr = (await driver.execute(() => (window as any).devicePixelRatio || 1)) || 1;
    } catch {
      dpr = 1;
    }
    return {
      x: Math.round(r.x * dpr),
      y: Math.round(r.y * dpr),
      w: Math.round(r.width * dpr),
      h: Math.round(r.height * dpr),
    };
  }
  return null;
}

// App-window crop rects now come from appWindows.appWindowRect (ADR 01036),
// which is platform-aware: Windows uses the current root's getWindowRect
// (physical px); macOS uses the window ELEMENT's rect (Mac2's getWindowRect
// is the whole main screen). Both stay unscaled with a pending-scale marker.

// A PATH env entry that puts the bundled @ffmpeg-installer binary's directory
// first, so child processes that shell out to a bare `ffmpeg` (the XCUITest
// driver's startRecordingScreen encoder) find ours — CI runners don't
// reliably ship a system ffmpeg. Matches the existing PATH key
// case-insensitively (Windows uses `Path`).
function ffmpegPathEnv(
  ffmpegPath: string,
  baseEnv: NodeJS.ProcessEnv = process.env
): Record<string, string> {
  const dir = path.dirname(ffmpegPath);
  const pathKey =
    Object.keys(baseEnv).find((k) => k.toUpperCase() === "PATH") ?? "PATH";
  const existing = baseEnv[pathKey];
  return {
    [pathKey]: existing ? `${dir}${path.delimiter}${existing}` : dir,
  };
}

// Pull the capture frame size out of the capture ffmpeg's own stderr: the
// input stream line (e.g. "Stream #0:0: Video: bmp, bgra, 2560x1440, …") is
// printed once, early, by every capture backend (gdigrab / avfoundation /
// x11grab). The first match is the input stream — the output stream line
// prints later. The 3-digit lower bound on each dimension keeps digit runs
// inside fourcc/hex tokens (e.g. "0x59565955") and small numeric fields from
// matching; real display captures are never narrower than 100px. Pure parse;
// callers accumulate stderr and stash the first hit.
function parseCaptureFrameSize(
  stderr: string
): { w: number; h: number } | null {
  const m = /Stream #\d+:\d+.*?Video:.*?\b(\d{3,5})x(\d{3,5})\b/.exec(
    stderr ?? ""
  );
  if (!m) return null;
  return { w: Number(m[1]), h: Number(m[2]) };
}

// The metadata a probe of a produced recording can yield. Every field is
// best-effort — absent when the file (or its stderr dump) doesn't carry it.
type RecordingProbeMetadata = {
  duration?: number;
  width?: number;
  height?: number;
  fps?: number;
};

// Parse recording metadata out of `ffmpeg -i <file>` stderr. Only the input
// Video stream line is trusted for dimensions/fps (the same guard as
// parseCaptureFrameSize, but with a 2-digit lower bound — produced recordings
// can legitimately be tiny, unlike display captures). fps falls back to tbr
// because gif streams report no fps token. Missing or `N/A` fields are simply
// omitted — callers treat every field as best-effort.
function parseMediaProbeStderr(stderr: string): RecordingProbeMetadata {
  const meta: RecordingProbeMetadata = {};
  const text = stderr ?? "";
  const duration = /\bDuration:\s*(\d+):(\d{2}):(\d{2}(?:\.\d+)?)/.exec(text);
  if (duration) {
    meta.duration =
      Number(duration[1]) * 3600 +
      Number(duration[2]) * 60 +
      Number(duration[3]);
  }
  const videoLine = /Stream #\d+:\d+.*?Video:.*/.exec(text)?.[0];
  if (videoLine) {
    const size = /\b(\d{2,5})x(\d{2,5})\b/.exec(videoLine);
    if (size) {
      meta.width = Number(size[1]);
      meta.height = Number(size[2]);
    }
    const fps =
      /([\d.]+)\s+fps\b/.exec(videoLine) ?? /([\d.]+)\s+tbr\b/.exec(videoLine);
    if (fps && Number.isFinite(Number(fps[1]))) {
      meta.fps = Number(fps[1]);
    }
  }
  return meta;
}

// Probe a produced recording's metadata by running `ffmpeg -i <file>` and
// parsing its stderr. ffmpeg exits non-zero without an output file by design,
// so the exit code is ignored — the stderr dump is the product. Returns null
// when no stderr was obtained (missing binary, spawn error); an unparsable
// file yields {}. Callers report whatever fields they can and never fail the
// step over metadata. Deliberately bounded on both axes:
// - autoInstall: false — metadata is never worth a JIT npm install (the
//   device .mp4 path reaches here on hosts that never needed ffmpeg).
// - 5s kill timer — a wedged probe must not stall an already-passed stop
//   (same bound as the detectMacScreenIndex probe).
// The buffer keeps the HEAD of stderr: ffmpeg prints Duration/Stream metadata
// first, and trailing demux warnings must not evict it.
async function probeVideoMetadata({
  cacheDir,
  filePath,
}: {
  cacheDir?: string;
  filePath: string;
}): Promise<RecordingProbeMetadata | null> {
  try {
    const ffmpegPath = await getFfmpegPath({ cacheDir, autoInstall: false });
    const stderr = await new Promise<string | null>((resolve) => {
      let head = "";
      let settled = false;
      let proc: any = null;
      let timer: any;
      const done = (v: string | null) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        try {
          proc?.kill();
        } catch {
          /* ignore */
        }
        resolve(v);
      };
      try {
        proc = spawn(ffmpegPath, ["-hide_banner", "-i", filePath], {
          stdio: ["ignore", "ignore", "pipe"],
        });
        proc.stderr?.on("data", (chunk: Buffer) => {
          if (head.length < 4000) {
            head = (head + chunk.toString()).slice(0, 4000);
          }
        });
        proc.on("error", () => done(null));
        proc.on("close", () => done(head));
        timer = setTimeout(() => done(head.length > 0 ? head : null), 5000);
      } catch {
        done(null);
      }
    });
    if (stderr === null) return null;
    return parseMediaProbeStderr(stderr);
  } catch {
    return null;
  }
}

// Parse ffmpeg blackdetect stderr lines and decide whether the detected
// black intervals cover the clip. blackdetect emits one line per interval:
// "[blackdetect @ 0x...] black_start:0 black_end:2.04 black_duration:2.04".
// Coverage is the sum of reported durations — good enough for the all-black
// failure mode this guards against (ADR 01080).
//
// Two allowances, both measured against real ffmpeg output:
// - An interval ends at the last black FRAME's timestamp, not the clip end,
//   so a fully-black clip under-reports by up to one frame interval (a 0.5s
//   10fps black clip reports black_duration:0.4). `fps` sizes that tolerance;
//   without it the gap can't be told from real content, so we don't guess.
// - 5% slack on top, for encoders that shade the first/last frame.
// Unknown/zero duration can't be judged -> false (not provably black).
function parseBlackdetect(
  stderr: string,
  duration?: number,
  fps?: number
): boolean {
  if (typeof duration !== "number" || !(duration > 0)) return false;
  let covered = 0;
  const re = /black_duration:([\d.]+)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(stderr ?? "")) !== null) {
    const d = Number(m[1]);
    if (Number.isFinite(d)) covered += d;
  }
  const frameInterval =
    typeof fps === "number" && fps > 0 ? 1 / fps : 0;
  return covered >= (duration - frameInterval) * 0.95;
}

// Run a bounded ffmpeg blackdetect pass over a produced recording and report
// whether it is (essentially) all black. Returns null when the analysis
// couldn't run (missing binary, spawn error, timeout) — the caller skips the
// guard rather than guessing. Bounded like probeVideoMetadata: no JIT
// install, and a kill timer sized for a real decode pass (30s — doc
// recordings are short).
async function detectAllBlack({
  cacheDir,
  filePath,
  duration,
  fps,
}: {
  cacheDir?: string;
  filePath: string;
  duration?: number;
  fps?: number;
}): Promise<boolean | null> {
  try {
    const ffmpegPath = await getFfmpegPath({ cacheDir, autoInstall: false });
    const stderr = await new Promise<string | null>((resolve) => {
      let collected = "";
      let settled = false;
      let proc: any = null;
      const done = (v: string | null) => {
        if (settled) return;
        settled = true;
        try {
          proc?.kill();
        } catch {
          /* ignore */
        }
        resolve(v);
      };
      try {
        proc = spawn(
          ffmpegPath,
          [
            "-hide_banner",
            "-i",
            filePath,
            "-vf",
            "blackdetect=d=0.1:pix_th=0.10",
            "-an",
            "-f",
            "null",
            "-",
          ],
          { stdio: ["ignore", "ignore", "pipe"] }
        );
        proc.stderr?.on("data", (chunk: Buffer) => {
          // Keep only the blackdetect lines (bounded) — progress spam from a
          // long decode must not evict them.
          const text = chunk.toString();
          if (text.includes("black_") && collected.length < 65536) {
            collected = (collected + text).slice(0, 65536);
          }
        });
        proc.on("error", () => done(null));
        proc.on("close", (code: number | null) =>
          done(code === 0 ? collected : null)
        );
        setTimeout(() => done(null), 30000);
      } catch {
        done(null);
      }
    });
    if (stderr === null) return null;
    return parseBlackdetect(stderr, duration, fps);
  } catch {
    return null;
  }
}

// The physical-pixels-per-point scale for an app-window crop, derived from
// measurements instead of a DOM probe (native drivers can't answer
// devicePixelRatio — the A2-discovered scaling gap, fixed in A7):
// - darwin: avfoundation captures physical pixels while Mac2's getWindowRect
//   returns points, so the scale is captureFrameSize / displaySizeInPoints.
// - win32: UIA rects (NovaWindows) and gdigrab both use physical desktop
//   pixels, so the scale is 1 by construction.
// - linux: X11 coordinates are pixels; scale 1.
// Clamped to [1, 4] and rounded to two decimals; any missing input falls
// back to 1 (today's behavior — correct on scale-1 displays).
function deriveCropScale({
  platform,
  frameSize,
  displayPointSize,
}: {
  platform: string;
  frameSize: { w: number; h: number } | null | undefined;
  displayPointSize: { w: number; h: number } | null | undefined;
}): number {
  if (platform !== "darwin") return 1;
  if (!frameSize?.w || !displayPointSize?.w) return 1;
  const raw = frameSize.w / displayPointSize.w;
  if (!Number.isFinite(raw) || raw <= 0) return 1;
  const clamped = Math.min(4, Math.max(1, raw));
  return Math.round(clamped * 100) / 100;
}

// The main display's size in points (macOS only — the one platform where
// points and capture pixels diverge). JXA through osascript, same pattern as
// probeMacAccessibility; null on any failure or off-platform. Multi-display
// note: assumes the capture targets the main screen (avfoundation screen
// index and this probe can disagree on exotic setups — documented limitation).
async function detectDisplayPointSize(): Promise<{
  w: number;
  h: number;
} | null> {
  if (process.platform !== "darwin") return null;
  return await new Promise((resolve) => {
    execFile(
      "osascript",
      [
        "-l",
        "JavaScript",
        "-e",
        "ObjC.import('AppKit'); const s = $.NSScreen.mainScreen.frame.size; JSON.stringify({w: s.width, h: s.height});",
      ],
      { timeout: 5000 },
      (error, stdout) => {
        if (error) return resolve(null);
        try {
          const parsed = JSON.parse(String(stdout).trim());
          if (
            typeof parsed?.w === "number" &&
            parsed.w > 0 &&
            typeof parsed?.h === "number" &&
            parsed.h > 0
          ) {
            return resolve({ w: parsed.w, h: parsed.h });
          }
        } catch {
          /* fall through */
        }
        resolve(null);
      }
    );
  });
}

// True when a context will run at least one ffmpeg capture — either an
// explicit ffmpeg-engine recording, or a browser-engine recording that will
// fall back to ffmpeg at runtime because another browser recording is already
// active (only one browser-engine recording can run per context). Simulating
// the record/stopRecord sequence here keeps the concurrency planner in sync
// with startRecording's runtime fallback, so a fallback ffmpeg capture still
// gets the serial/Xvfb safeguards. Pure read — context browsers are already
// coerced before this runs.
function jobIsFfmpegRecording(job: any): boolean {
  const context = job?.context;
  // Mobile-target contexts never capture the host display: auto-resolved
  // recordings run on the device (the "device" plan), and an explicit
  // ffmpeg/browser engine there is SKIPPED by startRecording — so neither
  // occupies the display nor falls back.
  if (isMobileTargetPlatform(context?.platform)) return false;
  const steps = Array.isArray(context?.steps) ? context.steps : [];
  // Names of active browser-engine recordings (LIFO), to detect overlap.
  const activeBrowser: Array<string | undefined> = [];
  for (const s of steps) {
    const isStop =
      typeof s?.stopRecord !== "undefined" && s.stopRecord !== false;
    if (isStop) {
      const target = stopRecordTargetName(s.stopRecord);
      if (target !== undefined) {
        const idx = activeBrowser.lastIndexOf(target);
        if (idx !== -1) activeBrowser.splice(idx, 1);
      } else if (activeBrowser.length > 0) {
        activeBrowser.pop();
      }
      continue;
    }
    if (!s?.record || s.record === false) continue; // not a start
    const plan = resolveRecordPlan({ step: s, context });
    if (plan.name === "ffmpeg") return true;
    // plan.name === "browser": an explicit browser-engine record on a context
    // that can't run one (headless or non-Chrome) is SKIPPED by startRecording,
    // so it neither occupies the single browser slot nor falls back to ffmpeg —
    // don't let it force serial/Xvfb. (Auto-engine on such contexts already
    // resolves to ffmpeg above.)
    const supportsBrowser =
      context?.browser?.name === "chrome" && !context?.browser?.headless;
    if (!supportsBrowser) continue;
    // A second concurrent browser-engine recording falls back to ffmpeg.
    if (activeBrowser.length > 0) return true;
    activeBrowser.push(recordStepName(s.record));
  }
  return false;
}

// Decide the effective worker-pool limit given recording constraints. ffmpeg
// screen capture needs exclusive use of the physical display, so concurrent
// ffmpeg recordings are only safe on Linux with per-runner Xvfb displays;
// elsewhere the run is forced serial. forcedSerial is true only when a
// requested limit > 1 was actually capped (so callers warn precisely once).
function computeEffectiveConcurrency({
  requestedLimit,
  jobs,
  platform,
  xvfbAvailable,
  allowOverlappingCaptures = false,
}: {
  requestedLimit: number;
  jobs: any[];
  platform: string;
  xvfbAvailable: boolean;
  // When true (autoRecord runs), don't force the run serial on a shared
  // display — let ffmpeg captures overlap. Each concurrent context then
  // captures the same screen (duplicate/overlapping video), which the
  // autoRecord caller has opted into. Without it, the safe default below
  // forces serial so explicit-record users never silently get overlapping
  // captures.
  allowOverlappingCaptures?: boolean;
}): {
  limit: number;
  xvfbContexts: any[];
  forcedSerial: boolean;
  overlappingCaptures?: boolean;
} {
  const ffmpegJobs = (jobs || []).filter(jobIsFfmpegRecording);
  if (ffmpegJobs.length === 0) {
    return { limit: requestedLimit, xvfbContexts: [], forcedSerial: false };
  }
  if (platform === "linux" && xvfbAvailable) {
    // Each runner records its own Xvfb display → truly isolated, real parallel.
    return {
      limit: requestedLimit,
      xvfbContexts: ffmpegJobs.map((j) => j.context),
      forcedSerial: false,
    };
  }
  if (allowOverlappingCaptures) {
    // "Parallel anyway": keep the requested limit even though captures share
    // the physical display and will overlap.
    return {
      limit: requestedLimit,
      xvfbContexts: [],
      forcedSerial: false,
      overlappingCaptures: true,
    };
  }
  return { limit: 1, xvfbContexts: [], forcedSerial: requestedLimit > 1 };
}

// True if a step carries step-level routing — `if` (guard), `goToStep` (jump),
// or a non-empty on* handler — any of which can change which steps a context
// actually runs, and in what order.
function stepHasRouting(step: any): boolean {
  if (!step || typeof step !== "object") return false;
  if (typeof step.if !== "undefined") return true;
  if (typeof step.goToStep === "string" && step.goToStep.trim() !== "")
    return true;
  for (const k of ["onPass", "onFail", "onWarning", "onSkip"]) {
    if (Array.isArray(step[k]) && step[k].length > 0) return true;
  }
  return false;
}

// True if any step in the context carries step-level routing, so the executed
// step set/order is not statically known.
function contextHasRouting(context: any): boolean {
  const steps = Array.isArray(context?.steps) ? context.steps : [];
  return steps.some((s: any) => stepHasRouting(s));
}

// Over-approximating ffmpeg detection: flag the context display-exclusive if
// ANY record could run as ffmpeg, ignoring the stopRecord LIFO that routing
// might skip. A record that resolves to ffmpeg counts immediately; two or more
// browser-engine records on a recording-capable context count too, because
// once a separating stopRecord can be skipped they could overlap and the 2nd
// would fall back to ffmpeg. Used only for scheduling — never under-serialize
// the shared display.
function contextHasAnyFfmpegRecordStep(context: any): boolean {
  // Same mobile rule as jobIsFfmpegRecording: device recordings hold no host
  // display, and desktop engines on mobile contexts are runtime SKIPs.
  if (isMobileTargetPlatform(context?.platform)) return false;
  const steps = Array.isArray(context?.steps) ? context.steps : [];
  let browserRecords = 0;
  for (const s of steps) {
    if (!s?.record || s.record === false) continue;
    const plan = resolveRecordPlan({ step: s, context });
    if (plan.name === "ffmpeg") return true;
    const supportsBrowser =
      context?.browser?.name === "chrome" && context?.browser?.headless === false;
    if (supportsBrowser) browserRecords++;
  }
  return browserRecords >= 2;
}

// The ffmpeg-recording decision for SCHEDULING exclusivity. For a context with
// no routing the executed steps are static, so use the precise
// `jobIsFfmpegRecording`. For a routed context the order/skips are dynamic, so
// over-approximate — serializing a routed-might-record context on the display
// is slower but never unsafe. The precise detector still drives the runtime
// ffmpeg fallback / Xvfb wiring elsewhere.
function isFfmpegRecordingForScheduling(job: any): boolean {
  return contextHasRouting(job?.context)
    ? contextHasAnyFfmpegRecordStep(job?.context)
    : jobIsFfmpegRecording(job);
}

// The exclusive resources a job must hold to run safely under concurrency.
// Today the only one is the physical "display" for ffmpeg recording. A
// non-autoRecord ffmpeg recording serializes on `"display"` (the resource
// registry queues recordings, and via jobDisplayResources every other driver
// context while a recording is present) instead of forcing the whole run
// serial. The autoRecord overlap opt-in (`allowOverlappingCaptures`) leaves the
// display free — those captures intentionally overlap.
//
// NOTE: Linux+Xvfb per-context displays are NOT treated as isolation here. In
// practice, concurrent recording contexts still clobber each other's driver
// sessions on the CI runner (`invalid session id`), so recordings serialize on
// every platform; the Xvfb displays are still provisioned so headless contexts
// can record at all.
function jobExclusiveResources(
  job: any,
  {
    allowOverlappingCaptures = false,
  }: {
    platform?: string;
    xvfbAvailable?: boolean;
    allowOverlappingCaptures?: boolean;
  }
): string[] {
  if (!isFfmpegRecordingForScheduling(job)) return [];
  if (allowOverlappingCaptures) return [];
  return ["display"];
}

// Resolve the ffmpeg binary path lazily — @ffmpeg-installer/ffmpeg is a heavy
// runtime dep that should only load when a recording step actually runs. The
// ctx threads a user-overridden cacheDir through, matching the JIT installer.
// autoInstall: false makes a missing install throw instead of JIT-installing —
// for best-effort callers (the metadata probe) that must never spawn npm.
async function getFfmpegPath({
  cacheDir,
  autoInstall = true,
}: { cacheDir?: string; autoInstall?: boolean } = {}): Promise<string> {
  const mod = await loadHeavyDep<any>("@ffmpeg-installer/ffmpeg", {
    ctx: { cacheDir },
    autoInstall,
  });
  // The package's CJS entry exports an object with a .path field; under an
  // ESM dynamic import we may get { default: { path }, path? }. Try both, then
  // guard before handing it to a child process so a malformed install fails
  // with an actionable message instead of a confusing deep node error.
  const candidate = mod && (mod.path ?? mod.default?.path);
  /* c8 ignore start - real subprocess/install-dependent: the installed @ffmpeg-installer/ffmpeg
   * package in this repo's node_modules always exposes a well-formed `.path`, and tryResolveFromShim
   * in loader.ts always wins over any injected cacheDir override, so there is no hermetic way to
   * make loadHeavyDep() return a malformed module here without corrupting a real, shared dependency.
   * Only reachable with a genuinely broken/tampered @ffmpeg-installer/ffmpeg install (ADR 01017). */
  if (typeof candidate !== "string" || candidate.length === 0) {
    throw new Error(
      "ffmpeg binary path is missing or malformed in the installed @ffmpeg-installer/ffmpeg package. Try `doc-detective install runtime --force` to reinstall."
    );
  }
  /* c8 ignore stop */
  return candidate;
}

// Parse the stderr of `ffmpeg -f avfoundation -list_devices true -i ""` for
// the screen-capture device index. Only the video-devices section labels an
// entry "Capture screen N", so this won't match audio devices. Returns the
// index string (e.g. "0") or null if not found.
function parseMacScreenIndex(listing: string): string | null {
  const m = /\[(\d+)\]\s+Capture screen/i.exec(listing || "");
  return m ? m[1] : null;
}

// macOS only: discover the avfoundation device index of the screen. Indices
// shift with attached cameras (a camera-less host such as a CI runner lists
// the screen at 0, not 1), so a hardcoded value frequently opens the wrong
// device and ffmpeg exits immediately. Returns null if it can't be determined.
async function detectMacScreenIndex(
  ffmpegPath: string
): Promise<string | null> {
  return new Promise((resolve) => {
    let out = "";
    let settled = false;
    let proc: any = null;
    const done = (v: string | null) => {
      if (settled) return;
      settled = true;
      try {
        proc?.kill();
        /* c8 ignore start - structurally defensive: proc is either null (spawn threw, so
         * kill() is never reached) or a real ChildProcess whose kill() reliably returns
         * false rather than throwing (no signal permission/platform quirk reproduces a
         * throw hermetically) (ADR 01017). */
      } catch {
        /* ignore */
      }
      /* c8 ignore stop */
      resolve(v);
    };
    try {
      proc = spawn(
        ffmpegPath,
        ["-f", "avfoundation", "-list_devices", "true", "-i", ""],
        { stdio: ["ignore", "ignore", "pipe"] }
      );
      proc.stderr?.on("data", (d: any) => {
        out += d.toString();
      });
      proc.on("error", () => done(null));
      // ffmpeg exits non-zero for a list-only invocation; parse regardless.
      proc.on("close", () => done(parseMacScreenIndex(out)));
      // Bound the probe so a hung ffmpeg can't stall recording startup.
      setTimeout(() => done(null), 5000);
    } catch {
      done(null);
    }
  });
}

// Best-effort detection of an X11 display's screen size via xdpyinfo, e.g.
// "1920x1080". Used to set x11grab's -video_size for a non-Xvfb (real
// desktop) Linux display. Returns null if xdpyinfo is unavailable or the
// output can't be parsed (the caller then omits -video_size).
async function detectX11ScreenSize(display?: string): Promise<string | null> {
  return new Promise((resolve) => {
    let out = "";
    let settled = false;
    let proc: any = null;
    const done = (v: string | null) => {
      if (settled) return;
      settled = true;
      try {
        proc?.kill();
        /* c8 ignore start - structurally defensive: proc is either null (spawn threw, so
         * kill() is never reached) or a real ChildProcess whose kill() reliably returns
         * false rather than throwing (no signal permission/platform quirk reproduces a
         * throw hermetically) (ADR 01017). */
      } catch {
        /* ignore */
      }
      /* c8 ignore stop */
      resolve(v);
    };
    try {
      const env = display ? { ...process.env, DISPLAY: display } : process.env;
      proc = spawn("xdpyinfo", [], { env, stdio: ["ignore", "pipe", "ignore"] });
      /* c8 ignore start - real subprocess-dependent: this data handler only fires when a real
       * xdpyinfo process is installed and writes to stdout. xdpyinfo is an X11 utility not present
       * on this dev machine or most CI runners (no network/browser fixture can substitute for it),
       * so the callback body is exercised only on a Linux host with the real binary (ADR 01017). */
      proc.stdout?.on("data", (d: any) => {
        out += d.toString();
      });
      /* c8 ignore stop */
      proc.on("error", () => done(null));
      proc.on("close", () => {
        const m = /dimensions:\s+(\d+x\d+)\s+pixels/i.exec(out);
        done(m ? m[1] : null);
      });
      // Bound the probe so a hung xdpyinfo can't stall recording startup.
      setTimeout(() => done(null), 5000);
    } catch {
      done(null);
    }
  });
}

// Probe for a system binary on PATH (e.g. Xvfb, which is not an npm package).
// Resolves true if the binary launches, false on ENOENT/spawn error.
async function checkSystemBinary(name: string): Promise<boolean> {
  return new Promise((resolve) => {
    try {
      const proc = spawn(name, ["-help"], { stdio: "ignore" });
      proc.on("error", () => resolve(false));
      proc.on("close", () => resolve(true));
    } catch {
      resolve(false);
    }
  });
}

// X11 display name for the Nth concurrent runner. Offset by 99 to stay clear
// of any real display (:0 = the desktop). Pure so it's unit-testable and the
// server-start and capture paths agree.
function xvfbDisplay(index: number): string {
  return `:${99 + index}`;
}

// Start an Xvfb virtual framebuffer on `display` and resolve once its X socket
// is up. Each concurrent ffmpeg-recording runner gets its own display so the
// browser renders there and x11grab captures only that runner's screen —
// making concurrent recording safe on Linux. Caller owns process teardown.
async function startXvfb(
  display: string,
  opts: { width?: number; height?: number } = {}
): Promise<any> {
  const num = display.replace(/^:/, "").split(".")[0];
  const [defW, defH] = XVFB_SCREEN_SIZE.split("x").map(Number);
  const w = opts.width ?? defW;
  const h = opts.height ?? defH;
  // Capture the spawn time so a stale `/tmp/.X<N>-lock` (left by a dead Xvfb
  // or another server) can't false-ready us — we only accept a lock created
  // at/after our own start.
  const startMs = Date.now();
  const proc: any = spawn(
    "Xvfb",
    [display, "-screen", "0", `${w}x${h}x24`, "-nolisten", "tcp"],
    { stdio: "ignore" }
  );
  let spawnErr: any = null;
  proc.on("error", (e: any) => {
    spawnErr = e;
  });
  // Readiness signal: the X lock file `/tmp/.X<N>-lock`, which Xvfb creates
  // once it owns the display. We don't watch `/tmp/.X11-unix/X<N>` because some
  // environments (e.g. WSLg) back the display with an abstract socket that
  // never appears there. If the display is already in use, Xvfb exits with an
  // error (caught by the exitCode check) rather than acquiring the lock.
  const lock = `/tmp/.X${num}-lock`;
  for (let i = 0; i < 50; i++) {
    if (spawnErr) throw spawnErr;
    if (proc.exitCode !== null)
      throw new Error(`Xvfb exited early on ${display} (code ${proc.exitCode})`);
    try {
      /* c8 ignore next - real subprocess-dependent: this success return only fires once a
       * genuine Xvfb process has created its X lock file. Xvfb is a Linux-only virtual
       * framebuffer binary not present on this dev machine or non-Linux CI runners, and there is
       * no hermetic, offline way to fabricate a real X lock file's readiness signal (ADR 01017). */
      if (fs.statSync(lock).mtimeMs >= startMs) return proc;
    } catch {
      /* lock not present yet */
    }
    await new Promise((r) => setTimeout(r, 100));
  }
  /* c8 ignore start - real subprocess-dependent: this 5s-exhausted cleanup+throw only runs when
   * spawn() neither errors nor creates the lock file for the full timeout window -- i.e. a real
   * Xvfb binary is present but hangs. Reproducing that hermetically would require either a real
   * Xvfb install or an OS-specific long-lived fake binary on PATH (Windows spawn() without
   * shell:true does not resolve .cmd wrappers by name), which is not a safe cross-platform test
   * (ADR 01017). On every machine without Xvfb installed (this dev box, most CI runners), spawn()
   * throws ENOENT asynchronously well before this loop exhausts, so `spawnErr` is thrown instead. */
  try {
    proc.kill();
  } catch {
    /* ignore */
  }
  throw new Error(`Xvfb did not become ready on ${display} within 5s.`);
}
/* c8 ignore stop - trailing closing brace after the unconditional throw above; a V8 phantom
 * statement with nothing left to execute (same pattern as detectTests.ts's documented
 * `c8 ignore start - V8 phantom branch on if-else/switch-case`, ADR 01017). */
