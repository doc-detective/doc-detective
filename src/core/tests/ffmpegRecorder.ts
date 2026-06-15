import { spawn } from "node:child_process";
import os from "node:os";
import path from "node:path";
import fs from "node:fs";
import { loadHeavyDep } from "../../runtime/loader.js";

export {
  resolveRecordPlan,
  coerceRecordContextBrowser,
  browserCaptureTitle,
  browserDownloadDir,
  buildCaptureArgs,
  resolveCropGeometry,
  computeEffectiveConcurrency,
  getFfmpegPath,
  checkSystemBinary,
  xvfbDisplay,
  startXvfb,
};

// The browser engine drives getDisplayMedia's auto-select via a per-context
// window title and downloads the .webm to a per-context dir. tests.ts (which
// builds Chrome's launch flag + download pref) and startRecording.ts (which
// sets document.title + reads the download) must agree, so both derive these
// from the contextId here. Unique-per-context titles are what make concurrent
// Chrome recordings safe — each browser auto-selects only its own window.
function browserCaptureTitle(contextId: string): string {
  return `RECORD_ME_${contextId}`;
}
function browserDownloadDir(contextId: string): string {
  return path.join(os.tmpdir(), "doc-detective", "recordings", String(contextId));
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
    fps: fps || 30,
  };
}

function hasRecordStepWithoutEngine(context: any): boolean {
  const steps = Array.isArray(context?.steps) ? context.steps : [];
  return steps.some((s: any) => {
    if (typeof s?.record === "undefined") return false;
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
}: {
  platform: string;
  fps: number;
  displayEnv?: string;
  outputPath: string;
  screenIndex?: string;
}): string[] {
  const rate = String(fps || 30);
  let input: string[];
  switch (platform) {
    case "win32":
      input = ["-f", "gdigrab", "-framerate", rate, "-i", "desktop"];
      break;
    case "darwin":
      input = [
        "-f",
        "avfoundation",
        "-framerate",
        rate,
        "-i",
        `${screenIndex ?? "1"}:none`,
      ];
      break;
    case "linux":
      input = ["-f", "x11grab", "-framerate", rate, "-i", displayEnv || ":0.0"];
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
    if (typeof s?.record === "undefined") return false;
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
  const w = opts.width ?? 1920;
  const h = opts.height ?? 1080;
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
  // never appears there.
  const lock = `/tmp/.X${num}-lock`;
  for (let i = 0; i < 50; i++) {
    if (spawnErr) throw spawnErr;
    if (proc.exitCode !== null)
      throw new Error(`Xvfb exited early on ${display} (code ${proc.exitCode})`);
    if (fs.existsSync(lock)) return proc;
    await new Promise((r) => setTimeout(r, 100));
  }
  try {
    proc.kill();
  } catch {
    /* ignore */
  }
  throw new Error(`Xvfb did not become ready on ${display} within 5s.`);
}
