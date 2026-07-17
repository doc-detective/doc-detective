import { validate } from "../../common/src/validate.js";
import { findElement } from "./findElement.js";
import { switchToSurface } from "./browserSurface.js";
import { resolveAppSurfaceRef, ensureAppForeground } from "./appSurface.js";
import { resolveAppWindow, appWindowScreenshot } from "./appWindows.js";
import {
  log,
  fetchFile,
  getOrInitRunTimestamp,
  redactUrlForOutput,
  sanitizeFilesystemName,
} from "../utils.js";
import path from "node:path";
import fs from "node:fs";
import { loadHeavyDep } from "../../runtime/loader.js";
import { isRecordingActive } from "./ffmpegRecorder.js";
import {
  buildConditionContext,
  evaluateImplicitAssertions,
} from "../routing.js";
import type { ImplicitAssertionSpec } from "../routing.js";

// pngjs, sharp, and pixelmatch are all heavy runtime deps. Lazy-load each
// the first time a screenshot step needs it. Use `typeof import('…')`
// directly here so we never have a top-level type-only import whose
// `typeof` would refer to a non-runtime identifier (a TS-only construct
// that Copilot flagged as fragile). The sharp namespace isn't shaped as
// a default-export module, so the resolved value is typed as `any` and
// the runtime handles both CJS (`mod`) and ESM-wrapped (`mod.default`)
// import shapes — same coercion the pixelmatch path uses.
type PngModule = typeof import("pngjs");

let _pngjs: PngModule | null = null;
let _sharp: any = null;
let _pixelmatch: any = null;

// Each getter accepts an optional ctx so a user-overridden cacheDir is
// honored on the first call. Subsequent calls return the memoized module
// regardless of ctx — the cache dir should be stable within a run, and
// the JIT pre-flight in runTests() guarantees the install already
// matched config.cacheDir before any step executes.
async function getPng(ctx: { cacheDir?: string } = {}): Promise<PngModule["PNG"]> {
  if (!_pngjs) _pngjs = await loadHeavyDep<PngModule>("pngjs", { ctx });
  return _pngjs.PNG;
}

async function getSharp(ctx: { cacheDir?: string } = {}): Promise<any> {
  if (!_sharp) {
    const mod = await loadHeavyDep<any>("sharp", { ctx });
    _sharp = mod && (mod.default ?? mod);
  }
  return _sharp;
}

async function getPixelmatch(ctx: { cacheDir?: string } = {}) {
  if (!_pixelmatch) {
    const mod = await loadHeavyDep<any>("pixelmatch", { ctx });
    _pixelmatch = mod.default ?? mod;
  }
  return _pixelmatch;
}

export { saveScreenshot, clampCropRect, aspectRatiosMatch };

type Rect = { x: number; y: number; width: number; height: number };

// Shift the rect into image bounds without shrinking. When the rect fits
// inside the image, output dimensions depend only on the requested rect,
// not on where it sits — so two crops of the same element with the same
// padding stay dimensionally stable even if the element's viewport
// position drifts by a few pixels between calls.
function clampCropRect(rect: Rect, imgW: number, imgH: number): Rect {
  let { x, y, width, height } = rect;
  if (width > imgW) {
    x = 0;
    width = imgW;
  } else {
    if (x < 0) x = 0;
    if (x + width > imgW) x = imgW - width;
  }
  if (height > imgH) {
    y = 0;
    height = imgH;
  } else {
    if (y < 0) y = 0;
    if (y + height > imgH) y = imgH - height;
  }
  return { x, y, width, height };
}

function aspectRatiosMatch(
  a: { width: number; height: number },
  b: { width: number; height: number },
): boolean {
  const ra = a.width / a.height;
  const rb = b.width / b.height;
  return Math.abs(ra - rb) / Math.max(ra, rb) <= 0.05;
}

// `internal` is a core-only seam (not a schema field): recording checkpoints
// run comparisons against persistent baselines that must never be written
// mid-span — baseline writes belong to stopRecord (ADR 01075). In compareOnly
// mode the fresh capture always persists to `capturePath` (staging) instead,
// and a missing reference reports `outputs.baselineMissing` rather than
// seeding the file.
async function saveScreenshot({
  config,
  step,
  driver,
  appSession,
  internal,
}: {
  config: any;
  step: any;
  driver: any;
  appSession?: any;
  internal?: { compareOnly: true; capturePath: string };
}) {
  let result: any = {
    status: "PASS",
    description: "Saved screenshot.",
    outputs: {
      changed: false, // Indicates if screenshot was changed/replaced
    },
  };
  let element: any;

  // ---------------------------------------------------------------------------
  // Unified assertion model (mirrors runShell.ts / httpRequest.ts / findElement.ts).
  //
  // Each implicit VERIFICATION check is a `$$` runtime EXPRESSION evaluated by
  // the shared engine (`evaluateImplicitAssertions`). We do NOT compute
  // PASS/FAIL/WARNING inline. Instead we (1) compute the derived input the
  // expression references and EXPOSE it as an output, (2) push an APPLICABLE
  // spec onto `specs` IN ORDER, then (3) hand the ordered list to the shared
  // engine, which performs the in-order evaluation, the FAIL short-circuit
  // (later applicable checks become SKIPPED), and the
  // FAIL > WARNING > SKIPPED > PASS roll-up.
  //
  // Applicable verification specs, IN ORDER:
  //   (1) crop element found      `$$outputs.cropElementFound == true`  (fail)    — only when `crop` is set
  //   (2) element fits viewport   `$$outputs.fitsViewport == true`      (fail)    — only when `crop` is set
  //   (3) aspect ratios match     `$$outputs.aspectRatioMatch == true`  (fail)    — only when comparing against an existing/URL reference
  //   (4) variation <= max        `$$outputs.variation <= <max>`        (warning) — only when comparing against an existing/URL reference
  //
  // EXECUTION errors (NOT assertions) still return FAIL with NO assertion
  // records, preserving the prior early returns + messages exactly:
  //   - can't load sharp/PNG/pixelmatch; invalid step; can't fetch the URL
  //     reference; path escapes the run folder; the underlying findElement call
  //     itself errors; can't capture; can't decode PNG; can't crop/extract.
  // SKIPPED is preserved when the file exists and overwrite is "false".
  //
  // ALL existing outputs (`screenshotPath`, `changed`, `referenceUrl`,
  // `sourceIntegration`, `element`) and every file write/overwrite/rename side
  // effect (including the URL-reference read-only path) are preserved exactly.
  // `evaluateApplicable()` is the single helper that runs the engine over the
  // specs gathered so far and stamps `result.assertions` + `result.status`; it
  // is called at every terminal point.
  const specs: ImplicitAssertionSpec[] = [];
  const evaluateApplicable = async () => {
    const ctx = buildConditionContext({ outputs: result.outputs });
    const { assertions, status } = await evaluateImplicitAssertions(specs, ctx);
    result.assertions = assertions;
    result.status = status;
    return result;
  };
  // Lazy-load heavy deps once per saveScreenshot invocation; ensureRuntime
  // already materialized them ahead of step execution. The ctx threads
  // through so a user-overridden cacheDir resolves from the same location
  // the JIT pre-flight installer used.
  //
  // Surface lazy-load failures as a step-level FAIL rather than letting
  // them escape and abort the whole run. A broken runtime cache (the
  // user wiped <cacheDir>/runtime by hand, or npm failed mid-install)
  // should produce a clean failed screenshot report, not a fatal.
  const loadCtx = { cacheDir: config?.cacheDir };
  let sharp: any;
  let PNG: any;
  try {
    sharp = await getSharp(loadCtx);
    PNG = await getPng(loadCtx);
  } catch (error: any) {
    result.status = "FAIL";
    result.description = `Couldn't load screenshot runtime dependencies. ${error?.message ?? error}`;
    return result;
  }

  // Validate step payload
  const isValidStep = validate({ schemaKey: "step_v3", object: step });
  if (!isValidStep.valid) {
    result.status = "FAIL";
    result.description = `Invalid step definition: ${isValidStep.errors}`;
    return result;
  }
  // Accept coerced and defaulted values
  step = isValidStep.object;

  // Multi-surface Phase 3/4 + native app surfaces (phase A1): focus the
  // session + window/tab to capture (a cross-session browser reference
  // resolves to that session's driver), or capture through the app session's
  // driver. The path/overwrite/URL-reference/pixel-comparison machinery below
  // is file-based and driver-agnostic, so app captures get it all for free;
  // only the capture call itself swaps drivers. Crop stays browser-only.
  let captureDriver = driver;
  let isAppCapture = false;
  let appEntry: any = null;
  let appWindowTarget: any = null;
  if (
    typeof step.screenshot === "object" &&
    step.screenshot !== null &&
    step.screenshot.surface !== undefined
  ) {
    const appRef = resolveAppSurfaceRef(step.screenshot.surface, appSession);
    if (appRef) {
      if (appRef.error) {
        result.status = "FAIL";
        result.description = appRef.error;
        return result;
      }
      // Window selectors (ADR 01036): resolve to a real window. Selector-less
      // app captures use the sticky/default window — on macOS that's the
      // window ELEMENT (Mac2's driver screenshot is the whole display).
      if (appRef.window !== undefined) {
        const resolvedWindow = await resolveAppWindow({
          entry: appRef.entry!,
          selector: appRef.window,
          timeoutMs: 5000,
        });
        if (!resolvedWindow.ok) {
          result.status = "FAIL";
          result.description = resolvedWindow.message;
          return result;
        }
        appWindowTarget = resolvedWindow.target;
      }
      if (step.screenshot.crop) {
        result.status = "FAIL";
        result.description =
          "crop isn't supported on app captures yet; it relies on browser viewport APIs. Capture the window and crop downstream, or omit crop.";
        return result;
      }
      const switchedApp = await ensureAppForeground(appRef.entry!, appSession);
      if (switchedApp.error) {
        result.status = "FAIL";
        result.description = switchedApp.error;
        return result;
      }
      captureDriver = appRef.entry!.driver;
      appEntry = appRef.entry!;
      isAppCapture = true;
    } else {
      const switched = await switchToSurface(driver, step.screenshot.surface);
      if (!switched.ok) {
        result.status = "FAIL";
        result.description = switched.message;
        return result;
      }
      driver = switched.driver ?? driver;
      captureDriver = driver;
    }
  }

  // In an app-only context (no browser driver), a screenshot step that omits
  // `surface` has nothing to capture — fail with the fix named instead of a
  // TypeError on the missing driver. Checked BEFORE the path/crop handling
  // below, which dereferences `driver` for crop geometry.
  if (!captureDriver) {
    result.status = "FAIL";
    result.description =
      'No browser session is running in this context to capture. Target an app surface explicitly (e.g. "surface": { "app": "…" }).';
    return result;
  }

  // Convert boolean to string
  if (typeof step.screenshot === "boolean") {
    step.screenshot = { path: `${step.stepId}.png` };
  }
  // Convert string to object
  if (typeof step.screenshot === "string") {
    step.screenshot = { path: step.screenshot };
  }
  // Compute path if unset
  if (typeof step.screenshot.path === "undefined") {
    step.screenshot.path = `${step.stepId}.png`;
    // If `directory` is set, prepend it to the path
    if (step.screenshot.directory) {
      step.screenshot.path = path.resolve(
        step.screenshot.directory,
        step.screenshot.path
      );
    }
  }
  // Set default values
  step.screenshot = {
    ...step.screenshot,
    maxVariation: step.screenshot.maxVariation ?? 0.05,
    overwrite: step.screenshot.overwrite ?? "aboveVariation",
  };
  // Set default values for crop
  if (typeof step.screenshot.crop === "object") {
    step.screenshot.crop = {
      ...step.screenshot.crop,
      selector: step.screenshot.crop.selector || "",
      elementText: step.screenshot.crop.elementText || "",
      padding: step.screenshot.crop.padding || 0,
    };
  }

  let filePath = step.screenshot.path;
  let existFilePath;
  let dir: string;

  // Detect URL paths. A URL `path` is treated as a read-only reference:
  // we download it to a temp file for comparison, and write the new capture
  // to a local run-specific folder (URLs can't be written back to).
  const isUrlPath = /^https?:\/\//i.test(filePath);
  const originalUrlPath = isUrlPath ? filePath : undefined;
  // Safe form for logs/descriptions/outputs: strips query + fragment so
  // presigned-URL signatures/tokens don't leak into the report.
  const redactedUrl = isUrlPath ? redactUrlForOutput(filePath) : undefined;

  if (isUrlPath) {
    const fetched: any = await fetchFile(originalUrlPath!, { binary: true });
    if (fetched.result !== "success") {
      result.status = "FAIL";
      result.description = `Couldn't fetch remote reference image (${redactedUrl}): ${fetched.message}`;
      return result;
    }
    existFilePath = fetched.path;

    // URL-derived names can contain path separators (`/`, `\`) or `..`
    // segments. `path.basename` on a slash-normalized string strips directory
    // components; we also sanitize any residual traversal and prepend stepId
    // so two URL screenshots with the same basename don't clobber each other.
    let urlPathname: string;
    try {
      urlPathname = new URL(originalUrlPath!).pathname;
    } catch {
      urlPathname = originalUrlPath!;
    }
    const rawBase = path.basename(
      urlPathname.split("?")[0].split("#")[0].replace(/\\/g, "/")
    );
    // Also strip characters that are invalid in filenames on Windows
    // (`< > : " | ? *` and control chars). Without this, a URL segment like
    // `img:v2.png` would build a path the Windows file system refuses to
    // create. Shared helper so the rule stays consistent with fetchFile.
    const safeBase = sanitizeFilesystemName(rawBase, `${step.stepId}.png`);

    dir = path.join(
      process.cwd(),
      "doc-detective-runs",
      getOrInitRunTimestamp(config)
    );
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    // Append a per-capture suffix so URL refs that share a basename (or a
    // future code path that reuses `stepId`) can't clobber each other.
    const captureId = `${step.stepId || "screenshot"}_${Date.now()}`;
    filePath = path.join(dir, `${captureId}_${safeBase}`);

    // Defense in depth: the resolved capture path must stay inside `dir`.
    const resolvedDir = path.resolve(dir);
    const resolvedFile = path.resolve(filePath);
    if (!resolvedFile.startsWith(resolvedDir + path.sep)) {
      result.status = "FAIL";
      result.description = `Refusing to write screenshot outside run folder: ${resolvedFile}`;
      return result;
    }

    // Overwrite semantics can't apply to a URL. The comparison block below
    // gates every mutating branch on `!isUrlPath`, so we log the user's
    // original value and leave `step.screenshot.overwrite` untouched — the
    // reported step object continues to reflect what they actually specified.
    if (step.screenshot.overwrite !== "false") {
      log(
        config,
        "debug",
        `Screenshot path is a URL (${redactedUrl}); overwrite is ignored, running comparison only.`
      );
    }
  } else {
    // Set path directory
    dir = path.dirname(step.screenshot.path);
    // If `dir` doesn't exist, create it. Compare-only callers never write
    // the target path, so creating its directory mid-span would litter an
    // empty baseline folder that seeding (stopRecord) owns.
    if (!internal?.compareOnly && !fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    // Check if file already exists
    if (fs.existsSync(filePath)) {
      if (step.screenshot.overwrite == "false") {
        // File already exists
        result.status = "SKIPPED";
        result.description = `File already exists: ${filePath}`;
        // No verification specs were gathered (we short-circuit before capture
        // and comparison), but keep the `assertions` shape consistent with every
        // other return path — an empty array rather than undefined. The SKIPPED
        // status itself is unchanged.
        result.assertions = [];
        return result;
      } else {
        // Compare against (and possibly overwrite) the existing file in place.
        // No temp capture file is created — the capture stays in memory until
        // the single final write, so `filePath` remains the real target.
        existFilePath = filePath;
      }
    }
  }

  if (step.screenshot.crop) {
    let findStep;
    if (typeof step.screenshot.crop === "string") {
      findStep = {
        find: step.screenshot.crop,
      };
    } else {
      findStep = {
        find: {
          selector: step.screenshot.crop?.selector,
          elementText: step.screenshot.crop?.elementText,
          elementId: step.screenshot.crop?.elementId,
          elementTestId: step.screenshot.crop?.elementTestId,
          elementClass: step.screenshot.crop?.elementClass,
          elementAttribute: step.screenshot.crop?.elementAttribute,
          elementAria: step.screenshot.crop?.elementAria,
          timeout: step.screenshot.crop?.timeout,
        },
      };
    }
    const findResult = await findElement({
      config,
      step: findStep,
      driver,
    });
    // (1) Crop element existence is a VERIFICATION ASSERTION. findElement FAILs
    // when no element matches, so `findResult.status === "FAIL"` (or a missing
    // rawElement) means the crop target wasn't found: expose
    // `outputs.cropElementFound = false`, push the spec, and evaluate -> FAIL.
    // This preserves the prior `Couldn't find element to crop.` FAIL status
    // (capture never runs). When the element IS found, the spec PASSes and we
    // continue to capture.
    element = findResult.outputs?.rawElement;
    if (findResult.status === "FAIL" || !element) {
      result.outputs.cropElementFound = false;
      specs.push({
        statement: `$$outputs.cropElementFound == true`,
        severity: "fail",
      });
      result.description = `Couldn't find element to crop.`;
      return await evaluateApplicable();
    }
    result.outputs.cropElementFound = true;
    specs.push({
      statement: `$$outputs.cropElementFound == true`,
      severity: "fail",
    });
    if (element) result.outputs.element = findResult.outputs.element;
    // Determine if element bounding box + padding is within viewport
    const rect = {
      ...(await element.getLocation()),
      ...(await element.getSize()),
    };
    const viewport = await driver.execute(() => {
      return {
        width: window.innerWidth,
        height: window.innerHeight,
      };
    });

    // Calculate padding
    let padding = { top: 0, right: 0, bottom: 0, left: 0 };
    if (typeof step.screenshot.crop.padding === "number") {
      padding.top = step.screenshot.crop.padding;
      padding.right = step.screenshot.crop.padding;
      padding.bottom = step.screenshot.crop.padding;
      padding.left = step.screenshot.crop.padding;
    } else if (typeof step.screenshot.crop.padding === "object") {
      padding = step.screenshot.crop.padding;
    }

    // (2) Element fits the viewport is a VERIFICATION ASSERTION. Compute the
    // boolean with the existing logic, expose it as `outputs.fitsViewport`, and
    // push the spec. When it's false we evaluate immediately and return (capture
    // never runs), preserving the prior `Element can't fit in viewport.` FAIL.
    const fitsViewport =
      rect.width + padding.right + padding.left <= viewport.width &&
      rect.height + padding.top + padding.bottom <= viewport.height;
    result.outputs.fitsViewport = fitsViewport;
    specs.push({
      statement: `$$outputs.fitsViewport == true`,
      severity: "fail",
    });
    if (!fitsViewport) {
      result.description = `Element can't fit in viewport.`;
      return await evaluateApplicable();
    }

    // Scroll element into view at top-left with padding
    await driver.execute(
      (el: any, pad: any) => {
        el.scrollIntoView({
          block: "start",
          inline: "start",
          behavior: "instant",
        });
        window.scrollBy(-pad.left, -pad.top);
      },
      element,
      padding
    );

    // Wait for scroll to complete
    await driver.pause(100);
  }

  // Hide the synthetic cursor during capture so it isn't baked into the image,
  // then always restore it in `finally` — otherwise a capture failure mid-way
  // would leave the pointer hidden for every later step in a recording.
  // App captures skip this: the synthetic cursor lives in the browser DOM,
  // which isn't in a native window's pixels (and `driver` may not even exist
  // in an app-only context).
  const recordingActive = !isAppCapture && isRecordingActive(driver);
  // Capture straight into an in-memory PNG buffer instead of round-tripping
  // through disk. Browser captures use WebDriver's `takeScreenshot()` (base64
  // PNG) — the exact command `saveScreenshot(path)` runs internally before it
  // writes the file, so the decoded bytes are IDENTICAL to what the old
  // `saveScreenshot(filePath)` would have persisted (byte-equivalence for the
  // no-crop path). App captures keep the file-based window-strategy capture
  // (its driver API is file-based here): we stage it in a short-lived scratch
  // file, read it back, and delete it so the rest of the pipeline is uniformly
  // buffer-based. Nothing is written to `filePath`/`existFilePath` yet — the
  // final PNG lands on disk exactly once, at the end.
  let captureBuffer: Buffer;
  let appScratchPath: string | undefined;
  try {
    if (recordingActive) {
      await driver.execute(() => {
        const pointer = document.querySelector("dd-mouse-pointer") as any;
        if (pointer) pointer.style.display = "none";
      });
    }
    // Capture: app captures go through the window strategy (window element on
    // macOS, current-root driver capture on Windows) into a scratch file we
    // immediately read into the buffer flow; browser captures use the session
    // driver's in-memory `takeScreenshot()`.
    if (isAppCapture) {
      appScratchPath = path.join(
        dir,
        `.appcapture_${step.stepId || "screenshot"}_${Date.now()}.png`
      );
      await appWindowScreenshot(appEntry, appWindowTarget, appScratchPath);
      captureBuffer = fs.readFileSync(appScratchPath);
    } else {
      const base64 = await captureDriver.takeScreenshot();
      captureBuffer = Buffer.from(base64, "base64");
    }
  } catch (error) {
    // Couldn't capture screenshot
    result.status = "FAIL";
    result.description = `Couldn't save screenshot. ${error}`;
    return result;
  } finally {
    // Best-effort scratch cleanup (app captures only); a throw here must not
    // mask the result.
    if (appScratchPath && fs.existsSync(appScratchPath)) {
      try {
        fs.unlinkSync(appScratchPath);
      } catch {
        /* scratch cleanup is non-essential */
      }
    }
    if (recordingActive) {
      // Best-effort: a throw here (e.g. an unstable session) must not override a
      // successful screenshot result or mask the caught error above — exceptions
      // in `finally` take precedence over returns.
      try {
        await driver.execute(() => {
          const pointer = document.querySelector("dd-mouse-pointer") as any;
          if (pointer) pointer.style.display = "block";
        });
      } catch {
        /* cursor restore is non-essential */
      }
    }
  }

  // If crop is set, compute element bounds and crop the captured buffer in
  // memory (no temp file, no re-read, no rename). `finalBuffer` carries the
  // bytes we ultimately write.
  let finalBuffer: Buffer = captureBuffer;
  if (step.screenshot.crop) {
    let padding = { top: 0, right: 0, bottom: 0, left: 0 };
    if (typeof step.screenshot.crop.padding === "number") {
      padding.top = step.screenshot.crop.padding;
      padding.right = step.screenshot.crop.padding;
      padding.bottom = step.screenshot.crop.padding;
      padding.left = step.screenshot.crop.padding;
    } else if (typeof step.screenshot.crop.padding === "object") {
      padding = step.screenshot.crop.padding;
    }

    // Get pixel density
    const pixelDensity = await driver.execute(() => window.devicePixelRatio);

    // Get the bounding rectangle of the element relative to the viewport after scroll
    const rect = await driver.execute((el: any) => {
      const bounds = el.getBoundingClientRect();
      return {
        x: bounds.left,
        y: bounds.top,
        width: bounds.width,
        height: bounds.height,
      };
    }, element);
    log(config, "debug", { rect });

    // Calculate the padding based on the provided padding values
    rect.x -= padding.left;
    rect.y -= padding.top;
    rect.width += padding.left + padding.right;
    rect.height += padding.top + padding.bottom;

    // Scale the values based on the pixel density
    rect.x *= pixelDensity;
    rect.y *= pixelDensity;
    rect.width *= pixelDensity;
    rect.height *= pixelDensity;

    // Round the values to integers
    rect.x = Math.round(rect.x);
    rect.y = Math.round(rect.y);
    rect.width = Math.round(rect.width);
    rect.height = Math.round(rect.height);

    // Clamp values to stay within image bounds (metadata read from the buffer)
    const imgMeta = await sharp(captureBuffer).metadata();
    const clamped = clampCropRect(rect, imgMeta.width!, imgMeta.height!);
    rect.x = clamped.x;
    rect.y = clamped.y;
    rect.width = clamped.width;
    rect.height = clamped.height;

    log(config, "debug", { padded_rect: rect });

    // Extract the cropped region straight to a PNG buffer. This matches the
    // prior sharp(...).extract(...).toFile("….png") encoding (PNG output),
    // just without the temp file + rename.
    try {
      finalBuffer = await sharp(captureBuffer)
        .extract({
          left: rect.x,
          top: rect.y,
          width: rect.width,
          height: rect.height,
        })
        .png()
        .toBuffer();
    } catch (error) {
      result.status = "FAIL";
      result.description = `Couldn't crop image. ${error}`;
      return result;
    }
  }

  // Record the saved image's actual pixel dimensions — the size the page really
  // rendered (or was cropped to), which can differ from the requested viewport
  // when the browser/OS floors it. Surfacing it here makes the report and any
  // caption reflect ground truth rather than the requested size. Best-effort:
  // never fail the step over a metadata read.
  try {
    const savedMeta = await sharp(finalBuffer).metadata();
    if (savedMeta.width && savedMeta.height) {
      result.outputs.width = savedMeta.width;
      result.outputs.height = savedMeta.height;
    }
  } catch {
    /* dimensions are best-effort metadata */
  }

  // Write the final (captured or cropped) PNG buffer to disk exactly once. On
  // failure, stamp a step-level FAIL (mirrors the prior capture-write failure)
  // and signal the caller to return.
  const writeFinalPng = (destination: string): boolean => {
    try {
      fs.writeFileSync(destination, finalBuffer);
      return true;
    } catch (error) {
      result.status = "FAIL";
      result.description = `Couldn't save screenshot. ${error}`;
      return false;
    }
  };

  // URL references always keep the local capture in the run folder for
  // inspection — even on a comparison FAIL — matching the prior behavior where
  // the capture was written before comparison and never deleted on the URL
  // path. Persist it now, before the read-only comparison against the fetched
  // reference. This is the single write of the final PNG on the URL path.
  if (isUrlPath) {
    if (!writeFinalPng(filePath)) return result;
  }

  // Compare-only callers (recording checkpoints) always persist the fresh
  // capture to their staging path — whether a baseline exists or not, and
  // whatever the comparison says. The baseline decision happens later, at
  // stopRecord. This is the single write in compareOnly mode.
  if (internal?.compareOnly) {
    if (!writeFinalPng(internal.capturePath)) return result;
  }

  // If a reference already exists (local target or fetched URL temp):
  // - overwrite "true": replace it with the new capture.
  // - overwrite "aboveVariation": compare, replace only if variance exceeds
  //   the threshold.
  if (existFilePath) {
    // URL paths never take the "overwrite=true" fast path: existFilePath is a
    // temp download, not a user-owned reference, and the local capture is
    // kept in the run folder for inspection.
    if (step.screenshot.overwrite == "true" && !isUrlPath) {
      // Replace old file with the new capture (single write to the target).
      if (!writeFinalPng(existFilePath)) return result;
      result.description += ` Overwrote existing file.`;
      result.outputs.screenshotPath = existFilePath;
      result.outputs.changed = true;
      // Preserve sourceIntegration metadata
      if (step.screenshot.sourceIntegration) {
        result.outputs.sourceIntegration = step.screenshot.sourceIntegration;
      }
      // No comparison was performed (unconditional overwrite), so no comparison
      // assertion is applicable; evaluate whatever specs were gathered (only the
      // crop specs, which already PASSed) -> PASS, matching the prior behavior.
      return await evaluateApplicable();
    }
    let fractionalDiff;

    // Perform numerical pixel diff with pixelmatch
    if (step.screenshot.maxVariation != null) {
      let img1: any;
      let img2: any;
      try {
        // Decode the existing reference from disk and the freshly captured
        // (optionally cropped) buffer directly — no read-back of a file we
        // just wrote.
        img1 = PNG.sync.read(fs.readFileSync(existFilePath));
        img2 = PNG.sync.read(finalBuffer);
      } catch (error) {
        result.status = "FAIL";
        result.description = isUrlPath
          ? `Couldn't decode PNG for comparison. The URL reference (${redactedUrl}) may not be a valid PNG. ${error}`
          : `Couldn't decode PNG for comparison. ${error}`;
        return result;
      }

      // (3) Aspect ratios match is a VERIFICATION ASSERTION. Compute the boolean
      // with the existing helper, expose it as `outputs.aspectRatioMatch`, and
      // push the spec. On mismatch we evaluate immediately and return (the
      // variation spec is never pushed — the diff can't be computed across
      // mismatched ratios), preserving the prior FAIL status exactly.
      const aspectRatioMatch = aspectRatiosMatch(img1, img2);
      result.outputs.aspectRatioMatch = aspectRatioMatch;
      specs.push({
        statement: `$$outputs.aspectRatioMatch == true`,
        severity: "fail",
      });
      if (!aspectRatioMatch) {
        result.description = `Couldn't compare images. Images have different aspect ratios.`;
        return await evaluateApplicable();
      }

      // Resize images to a common size. Stay in sharp's raw pipeline (RGBA in →
      // RGBA out) instead of round-tripping PNG→buffer→PNG: PNG is lossless, so
      // the resized pixels are identical to the prior encode/decode path, and
      // pixelmatch consumes raw RGBA directly.
      if (img1.width !== img2.width || img1.height !== img2.height) {
        const width = Math.min(img1.width, img2.width);
        const height = Math.min(img1.height, img2.height);

        const img1ResizedBuffer = await sharp(img1.data, {
          raw: { width: img1.width, height: img1.height, channels: 4 },
        })
          .resize(width, height)
          .raw()
          .toBuffer();
        const img2ResizedBuffer = await sharp(img2.data, {
          raw: { width: img2.width, height: img2.height, channels: 4 },
        })
          .resize(width, height)
          .raw()
          .toBuffer();

        img1.data = img1ResizedBuffer;
        img2.data = img2ResizedBuffer;
        img1.width = width;
        img1.height = height;
      }

      const { width, height } = img1;
      let pixelmatchFn: any;
      try {
        pixelmatchFn = await getPixelmatch(loadCtx);
      } catch (error: any) {
        // Treat a broken pixelmatch install as a step-level failure rather
        // than letting it abort the run. Mirrors the earlier sharp/PNG
        // guard at saveScreenshot entry.
        result.status = "FAIL";
        result.description = `Couldn't load screenshot comparison dependency (pixelmatch). ${error?.message ?? error}`;
        return result;
      }
      const numDiffPixels = pixelmatchFn(
        img1.data,
        img2.data,
        null,
        width,
        height,
        { threshold: 0.0005 }
      );
      fractionalDiff = numDiffPixels / (width * height);

      log(config, "debug", {
        totalPixels: width * height,
        numDiffPixels,
        fractionalDiff,
      });

      // (4) Pixel-diff variation <= maxVariation is a VERIFICATION ASSERTION at
      // WARNING severity. Expose the computed fractional diff as
      // `outputs.variation` and push the spec; the shared engine records WARNING
      // (not FAIL) when it evaluates false, matching the prior `WARNING` status.
      // The file-write side effects below are preserved exactly.
      result.outputs.variation = fractionalDiff;
      specs.push({
        statement: `$$outputs.variation <= ${step.screenshot.maxVariation}`,
        severity: "warning",
      });

      if (fractionalDiff > step.screenshot.maxVariation) {
        if (
          step.screenshot.overwrite == "aboveVariation" &&
          !isUrlPath &&
          !internal?.compareOnly
        ) {
          // Replace old file with the new capture (single write to the target).
          if (!writeFinalPng(existFilePath)) return result;
        }
        result.description += ` The difference between the existing screenshot and new screenshot (${fractionalDiff.toFixed(
          2
        )}) is greater than the max accepted variation (${
          step.screenshot.maxVariation
        }).`;
        if (isUrlPath) {
          // URL references are read-only: we can't write back to the remote.
          // Leave `outputs.changed` at its default (false) so upload pipelines
          // like collectChangedFiles()/Heretto don't treat this as something
          // to push, and omit sourceIntegration for the same reason. The
          // drift signal lives in `result.status === "WARNING"` + the local
          // capture path (already written above) + referenceUrl.
          result.outputs.screenshotPath = filePath;
          result.outputs.referenceUrl = redactedUrl;
        } else if (internal?.compareOnly) {
          // Compare-only: the baseline stayed untouched and nothing user-owned
          // changed — keep `outputs.changed` false. The drift signal is the
          // WARNING + outputs.variation; the staged capture carries the pixels.
          result.outputs.screenshotPath = internal.capturePath;
        } else {
          result.outputs.changed = true;
          result.outputs.screenshotPath = existFilePath;
          if (step.screenshot.sourceIntegration) {
            result.outputs.sourceIntegration = step.screenshot.sourceIntegration;
          }
        }
        // The WARNING-severity variation spec evaluates false here -> WARNING
        // (no short-circuit), matching the prior `result.status = "WARNING"`.
        return await evaluateApplicable();
      } else {
        result.description += ` Screenshots are within maximum accepted variation: ${fractionalDiff.toFixed(
          2
        )}.`;
        if (isUrlPath) {
          result.outputs.screenshotPath = filePath;
          result.outputs.referenceUrl = redactedUrl;
        } else {
          // Within variation: keep the existing reference unchanged. The new
          // capture stayed in memory, so there is no temp file to delete.
          result.outputs.screenshotPath = existFilePath;
          if (step.screenshot.sourceIntegration) {
            result.outputs.sourceIntegration = step.screenshot.sourceIntegration;
          }
        }
      }
    }
  }

  // New screenshot with no reference kept: write the final PNG once and record
  // it. (URL paths already wrote and set screenshotPath above, so they never
  // reach this branch.)
  if (!result.outputs.screenshotPath) {
    if (internal?.compareOnly) {
      // No baseline yet: report it instead of seeding the file — first-run
      // baseline writes belong to stopRecord (ADR 01075). The capture is
      // already staged at internal.capturePath; `changed` stays false so
      // upload pipelines ignore compare-only captures.
      result.outputs.screenshotPath = internal.capturePath;
      result.outputs.baselineMissing = true;
    } else {
      if (!writeFinalPng(filePath)) return result;
      result.outputs.screenshotPath = filePath;
      // Mark new screenshots as changed so they can be uploaded
      result.outputs.changed = true;
      // Preserve sourceIntegration metadata
      if (step.screenshot.sourceIntegration) {
        result.outputs.sourceIntegration = step.screenshot.sourceIntegration;
      }
    }
  }

  // Evaluate the applicable verification specs gathered above (crop existence /
  // viewport / aspect-ratio / within-variation as applicable) through the shared
  // engine and stamp `result.assertions` + `result.status`. A brand-new capture
  // with no reference to compare pushes no comparison specs; with no crop either
  // the spec list is empty -> PASS (capture succeeded). Within-variation falls
  // through here with a PASSing variation spec -> PASS.
  return await evaluateApplicable();
}
