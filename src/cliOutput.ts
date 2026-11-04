import { styleText } from "node:util";
import fs from "node:fs";
import path from "node:path";
import { isSecretValue } from "./debug/redact.js";
import type { EventEmitter } from "node:events";

const CODES = {
  red: "\x1b[31m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  cyan: "\x1b[36m",
  reset: "\x1b[0m",
  bold: "\x1b[1m",
  italic: "\x1b[3m",
  dim: "\x1b[2m",
};

// Node decides this: piping, NO_COLOR, FORCE_COLOR, and TERM=dumb all count.
export function colorEnabled(stream: NodeJS.WriteStream): boolean {
  return styleText("red", "x", { stream }) !== "x";
}

// Escape codes for a stream, or empty strings where color is off.
export function palette(stream: NodeJS.WriteStream): typeof CODES {
  if (colorEnabled(stream)) return CODES;
  return Object.fromEntries(Object.keys(CODES).map((key) => [key, ""])) as typeof CODES;
}

// Apply --no-color and --color before anything prints. Both work through the
// environment, which styleText reads on each call. NO_COLOR alone loses to
// FORCE_COLOR, so turning color off clears it.
export function applyColorFlags(argv: string[], env: NodeJS.ProcessEnv = process.env) {
  if (argv.includes("--no-color") || env.DOC_DETECTIVE_NO_COLOR) {
    env.NO_COLOR = "1";
    delete env.FORCE_COLOR;
  } else if (argv.includes("--color")) {
    env.FORCE_COLOR = "1";
  }
}

// A path as a person wants to read it: relative to where they ran the command.
export function displayPath(file: string): string {
  return path.relative(process.cwd(), file) || ".";
}

// The spinner currently on screen, if any, so log lines can print above it.
let activeSpinner: { clear: () => unknown } | null = null;

export function clearSpinner() {
  activeSpinner?.clear();
}

// Write one diagnostic line to stderr. stdout is reserved for results.
export function diag(line: string) {
  clearSpinner();
  console.error(line);
}

// A spinner on stderr for an interactive shell. Returns a stop function. Loaded
// here rather than at startup, since most runs aren't on a TTY.
export async function startSpinner(text: string, stream: NodeJS.WriteStream = process.stderr) {
  if (!stream.isTTY || process.env.TERM === "dumb") return { stop: () => {}, update: () => {} };
  const { default: ora } = await import("ora");
  const spinner = ora({ text, stream, discardStdin: false }).start();
  activeSpinner = spinner;
  return {
    update: (next: string) => {
      spinner.text = next;
    },
    stop: () => {
      spinner.stop();
      activeSpinner = null;
    },
  };
}

interface ContextDone {
  specId?: string;
  testId?: string;
  result?: string;
  platform?: string;
  browser?: string;
}

const HEARTBEAT_MS = 10_000;

// Show a run's progress on stderr: a spinner in an interactive shell, and plain
// lines elsewhere, so CI logs stay readable and concurrent runners can't
// interleave. Returns a stop function.
export async function showRunProgress(
  events: EventEmitter,
  { stream = process.stderr, heartbeatMs = HEARTBEAT_MS }: { stream?: NodeJS.WriteStream; heartbeatMs?: number } = {}
) {
  const started = Date.now();
  const elapsed = () => `${Math.round((Date.now() - started) / 1000)}s`;
  let done = 0;
  const spinner = await startSpinner("Running tests", stream);
  const onContext = ({ specId, testId, result, platform, browser }: ContextDone) => {
    done += 1;
    const where = [platform, browser].filter(Boolean).join("/");
    diag(`${result ?? "DONE"} ${specId}/${testId}${where ? ` (${where})` : ""}`);
    spinner.update(`Running tests: ${done} finished (${elapsed()})`);
  };
  events.on("context", onContext);
  const heartbeat = stream.isTTY
    ? null
    : setInterval(() => diag(`Still running (${elapsed()}, ${done} finished)`), heartbeatMs);
  heartbeat?.unref();
  return () => {
    events.off("context", onContext);
    if (heartbeat) clearInterval(heartbeat);
    spinner.stop();
  };
}

// Mask credentials in text bound for a file someone might attach to an issue.
function scrubSecrets(text: string): string {
  return text
    .replace(/:\/\/[^/\s:@]+:[^@\s]+@/g, "://***:***@")
    .replace(/\S+/g, (word) => (isSecretValue(word) ? "***redacted***" : word));
}

// For a bug, not a mistake in a command: write the details somewhere they can be
// attached, and make reporting it easy.
export function reportCrash(
  error: any,
  {
    dir = process.cwd(),
    print = (line: string) => console.error(line),
    version = "unknown",
  }: { dir?: string; print?: (line: string) => void; version?: string } = {}
) {
  const message = error?.message ?? String(error);
  print(`Unexpected error: ${message}`);
  try {
    const file = path.join(dir, ".doc-detective", `crash-${Date.now()}.log`);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(
      file,
      scrubSecrets(
        `doc-detective ${version}\nnode ${process.version} on ${process.platform}\n\n${error?.stack ?? message}\n`
      )
    );
    print(`Details: ${displayPath(file)}`);
  } catch {
    // The report below matters more than the log file.
  }
  const body = `Version: ${version}\nNode: ${process.version}\nPlatform: ${process.platform}\n\nPaste the crash log and the output of \`doc-detective debug\` here.`;
  const issue = `https://github.com/doc-detective/doc-detective/issues/new?title=${encodeURIComponent(
    `Crash: ${scrubSecrets(message).slice(0, 80)}`
  )}&body=${encodeURIComponent(body)}`;
  print(`This is a bug in Doc Detective. Report it: ${issue}`);
}

// The last line of a run: what happened, in one line.
export function verdictLine(results: any, stream: NodeJS.WriteStream = process.stdout): string {
  const colors = palette(stream);
  const tests = results?.summary?.tests;
  const total = tests ? tests.pass + tests.fail + tests.warning + tests.skipped : 0;
  const noun = total === 1 ? "test" : "tests";
  if (total === 0) return `${colors.yellow}No tests ran.${colors.reset}`;
  if (tests.fail > 0) {
    return `${colors.red}${tests.fail} of ${total} ${noun} failed.${colors.reset}`;
  }
  if (tests.pass === 0 && tests.warning === 0) {
    return `${colors.yellow}All ${total} ${noun} skipped.${colors.reset}`;
  }
  const extras = [
    tests.warning > 0 ? `${tests.warning} with warnings` : "",
    tests.skipped > 0 ? `${tests.skipped} skipped` : "",
  ].filter(Boolean);
  const suffix = extras.length > 0 ? ` (${extras.join(", ")})` : "";
  return `${colors.green}${tests.pass + tests.warning} of ${total} ${noun} passed${suffix}.${colors.reset}`;
}
