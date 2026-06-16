import { spawn } from "node:child_process";
import os from "node:os";
import path from "node:path";
import fs from "node:fs";
import crypto from "node:crypto";
import { loadHeavyDep } from "../../runtime/loader.js";
import { sanitizeFilesystemName } from "../utils.js";

export {
  resolveRecordPlan,
  coerceRecordContextBrowser,
  safeContextId,
  browserCaptureTitle,
  browserDownloadDir,
  buildCaptureArgs,
  resolveCropGeometry,
  jobIsFfmpegRecording,
  computeEffectiveConcurrency,
  getFfmpegPath,
  detectMacScreenIndex,
  parseMacScreenIndex,
  checkSystemBinary,
  xvfbDisplay,
  startXvfb,
  XVFB_SCREEN_SIZE,
  detectX11ScreenSize,
};

// Fixed virtual-display size for the Linux Xvfb recording path. Used both to
// start Xvfb and as the x11grab `-video_size`, so the capture matches the
// display exactly (and window/viewport crops fit within it).
const XVFB_SCREEN_SIZE = "1920x1080";

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
function browserCaptureTitle(contextId: string): string {
  return `RECORD_ME_${safeContextId(contextId)}`;
}
function browserDownloadDir(contextId: string): string {
  return path.join(
    os.tmpdir(),
    "doc-detective",
    "recordings",
    safeContextId(contextId)
  );
}

type RecordPlan = { name: "browser" | "ffmpeg"; target: string; fps: number };

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

// Normalize a record step into a concrete plan. An explicit engine always
// wins; otherwise auto-resolve: a visible Chrome context uses the
// concurrency-safe browser engine, everything else falls back to ffmpeg. The
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
  let engineName = name;
  if (!engineName) {
    const b = context?.browser;
    engineName =
      b?.name === "chrome" && b?.headless === false ? "browser" : "ffmpeg";
  }
  return {
    name: engineName as "browser" | "ffmpeg",
    target: target || "display",
    fps: fps ?? 30,
  };
}

function hasRecordStepWithoutEngine(context: any): boolean {
  const steps = Array.isArray(context?.steps) ? context.steps : [];
  return steps.some((s: any) => {
    // Falsy record (undefined, or an explicit `record: false`) is not an
    // active recording step.
    if (!s?.record) return false;
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
    const m = await driver.execute(() => {
      return {
        x: (window as any).screenX,
        y: (window as any).screenY,
        w: (window as any).innerWidth,
        h: (window as any).innerHeight,
        dpr: (window as any).devicePixelRatio || 1,
      };
    });
    const dpr = m.dpr || 1;
    return {
      x: Math.round(m.x * dpr),
      y: Math.round(m.y * dpr),
      w: Math.round(m.w * dpr),
      h: Math.round(m.h * dpr),
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

function jobIsFfmpegRecording(job: any): boolean {
  const steps = Array.isArray(job?.context?.steps) ? job.context.steps : [];
  return steps.some((s: any) => {
    if (!s?.record) return false; // skip undefined / `record: false`
    return resolveRecordPlan({ step: s, context: job.context }).name === "ffmpeg";
  });
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
}: {
  requestedLimit: number;
  jobs: any[];
  platform: string;
  xvfbAvailable: boolean;
}): { limit: number; xvfbContexts: any[]; forcedSerial: boolean } {
  const ffmpegJobs = (jobs || []).filter(jobIsFfmpegRecording);
  if (ffmpegJobs.length === 0) {
    return { limit: requestedLimit, xvfbContexts: [], forcedSerial: false };
  }
  if (platform === "linux" && xvfbAvailable) {
    return {
      limit: requestedLimit,
      xvfbContexts: ffmpegJobs.map((j) => j.context),
      forcedSerial: false,
    };
  }
  return { limit: 1, xvfbContexts: [], forcedSerial: requestedLimit > 1 };
}

// Resolve the ffmpeg binary path lazily — @ffmpeg-installer/ffmpeg is a heavy
// runtime dep that should only load when a recording step actually runs. The
// ctx threads a user-overridden cacheDir through, matching the JIT installer.
async function getFfmpegPath(ctx: { cacheDir?: string } = {}): Promise<string> {
  const mod = await loadHeavyDep<any>("@ffmpeg-installer/ffmpeg", { ctx });
  // The package's CJS entry exports an object with a .path field; under an
  // ESM dynamic import we may get { default: { path }, path? }. Try both, then
  // guard before handing it to a child process so a malformed install fails
  // with an actionable message instead of a confusing deep node error.
  const candidate = mod && (mod.path ?? mod.default?.path);
  if (typeof candidate !== "string" || candidate.length === 0) {
    throw new Error(
      "ffmpeg binary path is missing or malformed in the installed @ffmpeg-installer/ffmpeg package. Try `doc-detective install runtime --force` to reinstall."
    );
  }
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
    try {
      const proc = spawn(
        ffmpegPath,
        ["-f", "avfoundation", "-list_devices", "true", "-i", ""],
        { stdio: ["ignore", "ignore", "pipe"] }
      );
      proc.stderr?.on("data", (d) => {
        out += d.toString();
      });
      proc.on("error", () => resolve(null));
      // ffmpeg exits non-zero for a list-only invocation; parse regardless.
      proc.on("close", () => resolve(parseMacScreenIndex(out)));
    } catch {
      resolve(null);
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
    try {
      const env = display ? { ...process.env, DISPLAY: display } : process.env;
      const proc = spawn("xdpyinfo", [], { env, stdio: ["ignore", "pipe", "ignore"] });
      proc.stdout?.on("data", (d) => {
        out += d.toString();
      });
      proc.on("error", () => resolve(null));
      proc.on("close", () => {
        const m = /dimensions:\s+(\d+x\d+)\s+pixels/i.exec(out);
        resolve(m ? m[1] : null);
      });
    } catch {
      resolve(null);
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
      if (fs.statSync(lock).mtimeMs >= startMs) return proc;
    } catch {
      /* lock not present yet */
    }
    await new Promise((r) => setTimeout(r, 100));
  }
  try {
    proc.kill();
  } catch {
    /* ignore */
  }
  throw new Error(`Xvfb did not become ready on ${display} within 5s.`);
}
