import { validate } from "../../common/src/validate.js";
import { findElement } from "./findElement.js";
import { log, fetchFile, getOrInitRunTimestamp } from "../utils.js";
import path from "node:path";
import fs from "node:fs";
import { PNG } from "pngjs";
import sharp from "sharp";

// pixelmatch v7+ is ESM-only, so we need dynamic import
let pixelmatch: any;
async function getPixelmatch() {
  if (!pixelmatch) {
    pixelmatch = (await import("pixelmatch")).default;
  }
  return pixelmatch;
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

async function saveScreenshot({ config, step, driver }: { config: any; step: any; driver: any }) {
  let result: any = {
    status: "PASS",
    description: "Saved screenshot.",
    outputs: {
      changed: false, // Indicates if screenshot was changed/replaced
    },
  };
  let element: any;

  // Validate step payload
  const isValidStep = validate({ schemaKey: "step_v3", object: step });
  if (!isValidStep.valid) {
    result.status = "FAIL";
    result.description = `Invalid step definition: ${isValidStep.errors}`;
    return result;
  }
  // Accept coerced and defaulted values
  step = isValidStep.object;

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

  if (isUrlPath) {
    const fetched: any = await fetchFile(originalUrlPath!, { binary: true });
    if (fetched.result !== "success") {
      result.status = "FAIL";
      result.description = `Couldn't fetch remote reference image (${originalUrlPath}): ${fetched.message}`;
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
    const safeBase =
      !rawBase || rawBase === "." || rawBase === ".." || rawBase.includes("\0")
        ? `${step.stepId}.png`
        : rawBase;

    dir = path.join(
      process.cwd(),
      "doc-detective-runs",
      getOrInitRunTimestamp(config)
    );
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    filePath = path.join(dir, `${step.stepId}_${safeBase}`);

    // Defense in depth: the resolved capture path must stay inside `dir`.
    const resolvedDir = path.resolve(dir);
    const resolvedFile = path.resolve(filePath);
    if (!resolvedFile.startsWith(resolvedDir + path.sep)) {
      result.status = "FAIL";
      result.description = `Refusing to write screenshot outside run folder: ${resolvedFile}`;
      return result;
    }

    // Overwrite semantics can't apply to a URL. Force comparison-only.
    if (step.screenshot.overwrite !== "false") {
      log(
        config,
        "debug",
        `Screenshot path is a URL (${originalUrlPath}); overwrite is ignored, running comparison only.`
      );
    }
    step.screenshot.overwrite = "aboveVariation";
  } else {
    // Set path directory
    dir = path.dirname(step.screenshot.path);
    // If `dir` doesn't exist, create it
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    // Check if file already exists
    if (fs.existsSync(filePath)) {
      if (step.screenshot.overwrite == "false") {
        // File already exists
        result.status = "SKIPPED";
        result.description = `File already exists: ${filePath}`;
        return result;
      } else {
        // Set temp file path
        existFilePath = filePath;
        filePath = path.join(dir, `${step.stepId}_${Date.now()}.png`);
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
    if (findResult.status === "FAIL") {
      return findResult;
    }
    element = findResult.outputs?.rawElement;
    if (!element) {
      result.status = "FAIL";
      result.description = `Couldn't find element to crop.`;
      return result;
    }
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

    // Check if element can fit in viewport
    if (
      rect.width + padding.right + padding.left > viewport.width ||
      rect.height + padding.top + padding.bottom > viewport.height
    ) {
      result.status = "FAIL";
      result.description = `Element can't fit in viewport.`;
      return result;
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

  try {
    // If recording is true, hide cursor
    if (config.recording) {
      await driver.execute(() => {
        (document.querySelector("dd-mouse-pointer") as any).style.display = "none";
      });
    }
    // Save screenshot
    await driver.saveScreenshot(filePath);
    // If recording is true, show cursor
    if (config.recording) {
      await driver.execute(() => {
        (document.querySelector("dd-mouse-pointer") as any).style.display = "block";
      });
    }
  } catch (error) {
    // Couldn't save screenshot
    result.status = "FAIL";
    result.description = `Couldn't save screenshot. ${error}`;
    // Clean up temp file if it exists
    if (existFilePath && filePath !== existFilePath && fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
    return result;
  }

  // If crop is set, found bounds of element and crop image
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

    // Clamp values to stay within image bounds
    const imgMeta = await sharp(filePath).metadata();
    const clamped = clampCropRect(rect, imgMeta.width!, imgMeta.height!);
    rect.x = clamped.x;
    rect.y = clamped.y;
    rect.width = clamped.width;
    rect.height = clamped.height;

    log(config, "debug", { padded_rect: rect });

    // Create a new PNG object with the dimensions of the cropped area
    const croppedPath = path.join(dir, `cropped_${step.stepId || Date.now()}.png`);
    try {
      await sharp(filePath)
        .extract({
          left: rect.x,
          top: rect.y,
          width: rect.width,
          height: rect.height,
        })
        .toFile(croppedPath);

      // Replace the original file with the cropped file
      fs.renameSync(croppedPath, filePath);
    } catch (error) {
      result.status = "FAIL";
      result.description = `Couldn't crop image. ${error}`;
      if (existFilePath && filePath !== existFilePath && fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
      return result;
    }
  }

  // If file already exists
  // If overwrite is true, replace old file with new file
  // If overwrite is aboveVariation, compare files and replace if variance is greater than threshold
  if (existFilePath) {
    if (step.screenshot.overwrite == "true") {
      // Replace old file with new file
      result.description += ` Overwrote existing file.`;
      fs.renameSync(filePath, existFilePath);
      result.outputs.screenshotPath = existFilePath;
      result.outputs.changed = true;
      // Preserve sourceIntegration metadata
      if (step.screenshot.sourceIntegration) {
        result.outputs.sourceIntegration = step.screenshot.sourceIntegration;
      }
      return result;
    }
    let fractionalDiff;

    // Perform numerical pixel diff with pixelmatch
    if (step.screenshot.maxVariation != null) {
      let img1: any;
      let img2: any;
      try {
        img1 = PNG.sync.read(fs.readFileSync(existFilePath));
        img2 = PNG.sync.read(fs.readFileSync(filePath));
      } catch (error) {
        result.status = "FAIL";
        result.description = isUrlPath
          ? `Couldn't decode PNG for comparison. The URL reference (${originalUrlPath}) may not be a valid PNG. ${error}`
          : `Couldn't decode PNG for comparison. ${error}`;
        if (
          !isUrlPath &&
          existFilePath &&
          filePath !== existFilePath &&
          fs.existsSync(filePath)
        ) {
          fs.unlinkSync(filePath);
        }
        return result;
      }

      // Compare aspect ratio of images
      if (!aspectRatiosMatch(img1, img2)) {
        result.status = "FAIL";
        result.description = `Couldn't compare images. Images have different aspect ratios.`;
        if (
          !isUrlPath &&
          existFilePath &&
          filePath !== existFilePath &&
          fs.existsSync(filePath)
        ) {
          fs.unlinkSync(filePath);
        }
        return result;
      }

      // Resize images to same size
      if (img1.width !== img2.width || img1.height !== img2.height) {
        const width = Math.min(img1.width, img2.width);
        const height = Math.min(img1.height, img2.height);

        const img1ResizedBuffer = await sharp(img1.data, {
          raw: { width: img1.width, height: img1.height, channels: 4 },
        })
          .resize(width, height)
          .png()
          .toBuffer();
        const img2ResizedBuffer = await sharp(img2.data, {
          raw: { width: img2.width, height: img2.height, channels: 4 },
        })
          .resize(width, height)
          .png()
          .toBuffer();

        // Convert resized buffers to PNG objects
        const resizedImg1 = PNG.sync.read(img1ResizedBuffer);
        const resizedImg2 = PNG.sync.read(img2ResizedBuffer);
        img1.data = resizedImg1.data;
        img2.data = resizedImg2.data;
        img1.width = width;
        img1.height = height;
      }

      const { width, height } = img1;
      const pixelmatchFn = await getPixelmatch();
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

      if (fractionalDiff > step.screenshot.maxVariation) {
        if (step.screenshot.overwrite == "aboveVariation" && !isUrlPath) {
          // Replace old file with new file
          fs.renameSync(filePath, existFilePath);
        }
        result.status = "WARNING";
        result.description += ` The difference between the existing screenshot and new screenshot (${fractionalDiff.toFixed(
          2
        )}) is greater than the max accepted variation (${
          step.screenshot.maxVariation
        }).`;
        result.outputs.changed = true;
        result.outputs.screenshotPath = isUrlPath ? filePath : existFilePath;
        if (isUrlPath) {
          result.outputs.referenceUrl = originalUrlPath;
        }
        // Preserve sourceIntegration metadata for upload processing
        if (step.screenshot.sourceIntegration) {
          result.outputs.sourceIntegration = step.screenshot.sourceIntegration;
        }
        return result;
      } else {
        result.description += ` Screenshots are within maximum accepted variation: ${fractionalDiff.toFixed(
          2
        )}.`;
        result.outputs.screenshotPath = isUrlPath ? filePath : existFilePath;
        if (isUrlPath) {
          result.outputs.referenceUrl = originalUrlPath;
        }
        // Preserve sourceIntegration metadata
        if (step.screenshot.sourceIntegration) {
          result.outputs.sourceIntegration = step.screenshot.sourceIntegration;
        }
        if (step.screenshot.overwrite != "true" && !isUrlPath) {
          fs.unlinkSync(filePath);
        }
      }
    }
  }

  // Set output path for new screenshots
  if (!result.outputs.screenshotPath) {
    result.outputs.screenshotPath = filePath;
    // Mark new screenshots as changed so they can be uploaded
    result.outputs.changed = true;
    // Preserve sourceIntegration metadata
    if (step.screenshot.sourceIntegration) {
      result.outputs.sourceIntegration = step.screenshot.sourceIntegration;
    }
  }

  // PASS
  return result;
}
