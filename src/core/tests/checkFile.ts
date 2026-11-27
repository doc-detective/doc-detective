import fs from "node:fs";
import path from "node:path";
import { validate } from "../../common/src/validate.js";
import { invalidStepMessage, matchesExpectedOutput } from "../utils.js";
import { isMobileTargetPlatform } from "./mobilePlatform.js";

export { checkFile };

const POLL_MS = 250;
const IN_PROGRESS = [".crdownload", ".part"];

type Candidate = { file: string; size: number; mtimeMs: number };

/**
 * Wait for a finished file and optionally check its text (ADR 01231). `path`
 * globs the file system and returns the newest finished match. `download`
 * globs file names in the context's download folder and returns the oldest
 * finished match no earlier `checkFile` in the context returned.
 */
async function checkFile({
  config,
  step,
  driver,
  context = {},
  downloadsDir,
}: {
  config: any;
  step: any;
  driver?: any;
  context?: any;
  downloadsDir?: () => string;
}) {
  const result: any = { status: "PASS", description: "Found a finished file.", outputs: {} };

  const isValidStep = validate({ schemaKey: "step_v3", object: step });
  if (!isValidStep.valid) {
    result.status = "FAIL";
    result.description = invalidStepMessage(step);
    return result;
  }
  const { path: pattern, download, content, timeout } = isValidStep.object.checkFile;

  let list: () => string[];
  let pick: (finished: Candidate[]) => Candidate;
  let missing: string;
  if (download !== undefined) {
    const engine = String(driver?.state?.engine ?? context?.browser?.name ?? "").toLowerCase();
    if (driver && (engine === "safari" || engine === "webkit")) {
      result.status = "SKIPPED";
      result.description = "Skipped: `safari` can't save downloads to a known folder.";
      return result;
    }
    if (
      !driver ||
      !downloadsDir ||
      isMobileTargetPlatform(context?.platform) ||
      (engine !== "chrome" && engine !== "firefox")
    ) {
      result.status = "SKIPPED";
      result.description = "Skipped: `download` needs a desktop Chrome or Firefox context.";
      return result;
    }
    const dir = downloadsDir();
    // The download folder is per context, so its queue lives on the context,
    // beside the runner's other private `__` fields (`__display`). It's the
    // list of files earlier checks returned.
    if (!Array.isArray(context.__checkedDownloads)) context.__checkedDownloads = [];
    const returned: string[] = context.__checkedDownloads;
    list = () => {
      let names: string[] = [];
      try {
        names = fs.readdirSync(dir);
      } catch {
        // Nothing downloaded yet.
      }
      return names
        .filter((name) => path.matchesGlob(name, download))
        .map((name) => path.join(dir, name))
        .filter((file) => !returned.includes(file));
    };
    pick = (finished) => finished.reduce((a, b) => (b.mtimeMs < a.mtimeMs ? b : a));
    missing = `Couldn't find a finished download matching \`${download}\` within ${timeout} ms.`;
  } else {
    // Detection resolved a relative path against the spec; a step from
    // getRunner() has none, so resolve against the working directory.
    const glob = path.resolve(pattern);
    // Glob patterns separate folders with `/`; a `\` can read as an escape.
    list = () => fs.globSync(glob.split(path.sep).join("/")).map((file) => path.resolve(file));
    pick = (finished) => finished.reduce((a, b) => (b.mtimeMs > a.mtimeMs ? b : a));
    missing = `Couldn't find a finished file matching \`${glob}\` within ${timeout} ms.`;
  }

  // A file is finished once it isn't an in-progress download (a
  // `.crdownload` or `.part` file, or Firefox's placeholder next to its
  // `.part`) and its size matches the previous poll's.
  const deadline = Date.now() + timeout;
  // Starts empty on purpose: a file is finished only once its size matches
  // the PRIOR poll, so even an old file waits one POLL_MS. Don't add a fast
  // path for existing files; it would break the stability guarantee.
  let previous = new Map<string, number>();
  let found: Candidate | undefined;
  for (;;) {
    const current = new Map<string, number>();
    const finished: Candidate[] = [];
    for (const file of list()) {
      if (IN_PROGRESS.some((suffix) => file.endsWith(suffix))) continue;
      if (IN_PROGRESS.some((suffix) => fs.existsSync(file + suffix))) continue;
      let stat: fs.Stats;
      try {
        stat = fs.statSync(file);
      } catch {
        continue;
      }
      if (!stat.isFile()) continue;
      current.set(file, stat.size);
      if (previous.get(file) === stat.size) {
        finished.push({ file, size: stat.size, mtimeMs: stat.mtimeMs });
      }
    }
    if (finished.length > 0) {
      found = pick(finished);
      break;
    }
    if (Date.now() >= deadline) break;
    previous = current;
    await new Promise((resolve) => setTimeout(resolve, POLL_MS));
  }

  if (!found) {
    result.status = "FAIL";
    result.description = missing;
    return result;
  }
  if (download !== undefined) context.__checkedDownloads.push(found.file);

  // Named like `screenshotPath` and `recordingPath`: a bare `$$path` would
  // collide with the `PATH` environment variable.
  result.outputs = {
    filePath: found.file,
    fileName: path.basename(found.file),
    fileSize: found.size,
  };
  if (content !== undefined) {
    let text: string;
    try {
      text = fs.readFileSync(found.file, "utf8");
    } catch {
      result.status = "FAIL";
      result.description = `Couldn't read \`${found.file}\`.`;
      return result;
    }
    if (!matchesExpectedOutput(text, content)) {
      result.status = "FAIL";
      result.description = `Couldn't find \`${content}\` in \`${found.file}\`.`;
      return result;
    }
  }
  result.description = `Found \`${found.file}\`.`;
  return result;
}
