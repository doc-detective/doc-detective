// One grammar for every DOC_DETECTIVE_* boolean (ADR 01165). A leaf module, so
// the runtime modules can read it without importing the CLI or the runner.

/**
 * Process-wide state. Each warning prints once per process, not once per run:
 * a JS API caller that calls `runTests()` again sees it only the first time.
 * Each core `setConfig()` drops warnings queued but never sent, so a run that
 * failed before it had a sink doesn't pass them to the next.
 */
const warned = new Set<string>();
let pending: string[] = [];
let sink: ((message: string) => void) | null = null;

// Environment warnings come up before the log level is known, so they wait
// here until setConfig hands over a sink that respects it.
export function warnOnce(key: string, message: string) {
  if (warned.has(key)) return;
  warned.add(key);
  if (sink) sink(message);
  else pending.push(message);
}

// Route environment warnings through `log()` at the configured level, starting
// with any that came up before the config existed.
export function setEnvWarningSink(next: (message: string) => void) {
  sink = next;
  const queued = pending;
  pending = [];
  queued.forEach((message) => next(message));
}

// Drop warnings queued but never sent. Keeps what was warned, so none repeats.
export function clearPendingEnvWarnings() {
  pending = [];
}

// For tests: forget what was warned, queued, and where warnings go.
export function resetEnvFlagWarnings() {
  warned.clear();
  pending = [];
  sink = null;
}

/**
 * On: 1, true, yes, or on. Off: unset, empty, 0, false, no, or off. Trimmed and
 * case-insensitive. Anything else warns once and counts as off.
 *
 * scripts/postinstall.js keeps a copy that differs on purpose: it returns
 * `undefined` for unset or unknown, so each caller keeps its own default, where
 * this one returns `false`. Don't swap them: postinstall's `=== false` checks,
 * such as `isRuntimeInstallOptedOut`, would treat unset as opted out.
 */
export function envFlag(name: string, env: NodeJS.ProcessEnv = process.env): boolean {
  const value = (env[name] ?? "").trim().toLowerCase();
  if (["1", "true", "yes", "on"].includes(value)) return true;
  if (["", "0", "false", "no", "off"].includes(value)) return false;
  warnOnce(name, `Ignoring ${name}=${JSON.stringify(env[name])}. Use 1, true, yes, or on, or 0, false, no, or off.`);
  return false;
}

// Renamed variables. The old name still works for the major.
const ALIASES = [{ oldName: "DOC_DETECTIVE_RUNTIME_DEBUG", newName: "DOC_DETECTIVE_DEBUG" }];

// Once per run, from config setup: setting both names is a usage error, and
// an old name that's on says what to rename it to.
export function checkEnvAliases(env: NodeJS.ProcessEnv = process.env) {
  for (const { oldName, newName } of ALIASES) {
    // Both set and either on: which one meant it is unclear. Both off is harmless.
    const on = [newName, oldName].filter((name) => envFlag(name, env));
    if (env[oldName]?.trim() && env[newName]?.trim() && on.length) {
      throw new Error(
        `set \`${newName}\` or \`${oldName}\`, not both. ${on.length > 1 ? "Both are on." : `\`${on[0]}\` is on.`}`
      );
    }
    if (envFlag(oldName, env)) warnOnce(oldName, `\`${oldName}\` is deprecated. Rename it to \`${newName}\`.`);
  }
}

// Set only on the process a self-update re-execs. Internal: no flag or config
// overrides it, so an updated child never checks, updates, and re-execs again.
// Here, not in runtime/selfUpdate.ts, so the CLI checks it without loading axios.
export const REEXEC_MARKER = "DOC_DETECTIVE_SELF_UPDATED";

// Whether a run checks the registry for a newer version: config allows it
// (flags, DOC_DETECTIVE_SKIP_AUTO_UPDATE, and files all land in autoUpdate),
// it isn't CI, and this process isn't a self-update's re-exec.
export function updateCheckAllowed(config: { autoUpdate?: boolean }, env: NodeJS.ProcessEnv = process.env): boolean {
  return config.autoUpdate !== false && !env.CI && !env[REEXEC_MARKER];
}

// Whether the environment asks for debug output. DOC_DETECTIVE_DEBUG is the narrow
// switch, for Doc Detective alone, and DOC_DETECTIVE_RUNTIME_DEBUG its old name.
// DEBUG is the broad one that many packages read: 1, true, *, or a
// comma-separated pattern matching doc-detective turns this on, while a value
// like `express:*` is someone else's and leaves it off.
export function isDebugRequested(env: NodeJS.ProcessEnv = process.env): boolean {
  if (envFlag("DOC_DETECTIVE_DEBUG", env) || envFlag("DOC_DETECTIVE_RUNTIME_DEBUG", env)) return true;
  return String(env.DEBUG ?? "")
    .split(",")
    .map((pattern) => pattern.trim())
    .some((pattern) => /^(1|true|\*|doc-detective(:?\*)?)$/i.test(pattern));
}
