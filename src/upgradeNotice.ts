// Warnings on 4.x about what 5.0 changes or removes (ADR 01147). They go to
// stderr, so stdout stays clean for --dry-run JSON and LSP traffic. Keep this
// module free of heavy imports: the bare bins load it too.
import fs from "node:fs";
import path from "node:path";

const UPGRADE_GUIDE_URL = "https://docs.doc-detective.com/docs/ci/upgrade-to-v5";

const REMOVED_BINS: Record<string, string> = {
  "doc-detective-lsp": "Use `doc-detective lsp --stdio`, which works today.",
  "doc-detective-runner": "5.0 replaces it with a `doc-detective runner` command.",
};

const warned = new Set<string>();

// The Action's legacy path runs v4 on purpose and has its own notice.
function isAction(): boolean {
  try {
    return JSON.parse(process.env.DOC_DETECTIVE_META || "{}").dist_interface === "github-actions";
  } catch {
    return false;
  }
}

export function warnUpgrade(messages: string[], logLevel?: string): void {
  if (logLevel === "silent" || isAction()) return;
  for (const message of messages) {
    if (warned.has(message)) continue;
    warned.add(message);
    console.error(`Warning: ${message} See ${UPGRADE_GUIDE_URL}`);
  }
}

export function warnRemovedBin(bin: string): void {
  warnUpgrade([`\`${bin}\` is removed in Doc Detective 5.0. ${REMOVED_BINS[bin]}`]);
}

/**
 * Warnings for a command line. `commands` is yargs' parsed `_`; `rawArgs` is the
 * unparsed argv, because yargs fills in both `-a` and `--agent` and can't tell
 * which one the user typed.
 */
export function commandWarnings(commands: string[], rawArgs: string[], silent: boolean): string[] {
  const messages: string[] = [];
  const installAgents = commands[0] === "install-agents";
  if (installAgents) {
    messages.push("`install-agents` is removed in Doc Detective 5.0. Use `install agents`, which works today.");
  }
  if (
    (installAgents || (commands[0] === "install" && commands[1] === "agents")) &&
    rawArgs.some((arg) => /^-[^-]*[as]/.test(arg))
  ) {
    messages.push("`-a` and `-s` are removed in Doc Detective 5.0. Use `--agent` and `--scope`, which work today.");
  }
  if (commands[0] === "install" && silent) {
    messages.push("`install --silent` is removed in Doc Detective 5.0. Use `--quiet`, which works today.");
  }
  return messages;
}

/**
 * Whether an `output` setting names a folder. 4.x treats any path without a
 * file extension as a folder and creates it. `raw` is the value as written,
 * since resolving it strips a trailing slash. Unset means the default, which
 * the user didn't choose.
 */
export function namesFolder(raw: unknown, resolved: string): boolean {
  if (typeof raw !== "string" || raw.length === 0) return false;
  if (/[\\/]$/.test(raw) || !path.extname(resolved)) return true;
  try {
    return fs.statSync(resolved).isDirectory();
  } catch {
    return false;
  }
}

export function outputWarnings(raw: unknown, resolved: string): string[] {
  return namesFolder(raw, resolved)
    ? [
        `\`output\` names a folder ('${raw}'). In Doc Detective 5.0, \`--output\` and \`output\` name the results file, and a folder needs \`--output-dir\`.`,
      ]
    : [];
}

export function concurrentRunnersWarnings(value: unknown): string[] {
  return value === ""
    ? [
        "`--concurrent-runners` with no value is removed in Doc Detective 5.0. Use `--concurrent-runners true`, which works today.",
      ]
    : [];
}

/**
 * Warnings for a finished run. `exitOnFail` is the raw config value: undefined
 * means the user didn't choose, and false is already the 5.0 way to keep exit 0.
 */
export function runResultWarnings(exitOnFail: boolean | undefined, failed: boolean, results: any): string[] {
  if (exitOnFail === false) return [];
  const specs = results?.summary?.specs;
  const testedNothing =
    !results || (!!specs && [specs.pass, specs.fail, specs.warning, specs.skipped].every((n) => !n));
  if (testedNothing) {
    return [
      "This run tested nothing. Doc Detective 5.0 will exit 2 instead of 0. To keep exit 0, set `--no-exit-on-fail`.",
    ];
  }
  if (failed && exitOnFail === undefined) {
    return [
      "This run has failed specs. Doc Detective 5.0 will exit 1 instead of 0. To keep exit 0, set `--no-exit-on-fail`.",
    ];
  }
  return [];
}
