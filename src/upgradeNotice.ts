// Warnings on 4.x about what 5.0 changes or removes (ADR 01147). They go to
// stderr, so stdout stays clean for --dry-run JSON and LSP traffic. Keep this
// module free of heavy imports: the bare bins load it too.
import fs from "node:fs";
import path from "node:path";

const UPGRADE_GUIDE_URL = "https://docs.doc-detective.com/docs/ci/upgrade-to-v5";

const REMOVED_BINS: Record<string, string> = {
  "doc-detective-lsp": "Use `doc-detective lsp --stdio`, which works today.",
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

/** `-r` with several values, and repeated `-t` or `-s`, from yargs' parsed args. */
export function flagWarnings(args: Record<string, unknown>): string[] {
  const messages: string[] = [];
  if (Array.isArray(args.reporters) && args.reporters.length > 1) {
    messages.push(
      "`--reporters` takes one comma-separated value in Doc Detective 5.0, like `-r terminal,html`. Set `reporters` in your config file, which works today."
    );
  }
  for (const flag of ["test", "spec"]) {
    if (Array.isArray(args[flag])) {
      messages.push(
        `\`--${flag}\` is given more than once, so 4.x ignores it and Doc Detective 5.0 exits with a usage error. Give one comma-separated value, like \`--${flag} a,b\`, which works today.`
      );
    }
  }
  return messages;
}

// How 4.x reads each boolean env var. 5.0 reads them all as on for
// 1/true/yes/on and off for 0/false/no/off. `on` and `off` are the settings
// that mean the same on both.
const BOOLEAN_ENV: Record<string, { v4: (v: string) => boolean; on?: string; off?: string }> = {
  DOC_DETECTIVE_DEBUG: { v4: (v) => /^(1|true|yes)$/i.test(v.trim()) },
  DOC_DETECTIVE_SKIP_AUTO_UPDATE: { v4: Boolean },
  DOC_DETECTIVE_SKIP_AGENT_PROMPT: { v4: Boolean },
  DOC_DETECTIVE_RUNTIME_DEBUG: { v4: (v) => v === "1" },
  DOC_DETECTIVE_NO_ANDROID_AUTOINSTALL: { v4: (v) => v === "1" },
  DOC_DETECTIVE_REUSE_APPIUM: { v4: (v) => v === "true" || v === "1" },
  DOC_DETECTIVE_ALLOW_LOCAL_URLS: { v4: (v) => v === "true", on: "true" },
  DOC_DETECTIVE_AUTOINSTALL: {
    v4: (v) => !["0", "false", "no", "off"].includes(v.trim().toLowerCase()),
    off: "to `0`",
  },
};

function readsAs5(value: string): boolean | undefined {
  const v = value.trim().toLowerCase();
  if (["1", "true", "yes", "on"].includes(v)) return true;
  if (["0", "false", "no", "off"].includes(v)) return false;
  return undefined;
}

/** The legacy `DOC_DETECTIVE` env var, and boolean env vars 5.0 reads differently. */
export function envWarnings(env: Record<string, string | undefined>, config: { allowUnsafeSteps?: boolean }): string[] {
  const messages: string[] = [];
  let legacy: any;
  try {
    legacy = JSON.parse(env.DOC_DETECTIVE || "{}");
  } catch {
    legacy = {};
  }
  if (legacy?.config && typeof legacy.config === "object") {
    messages.push(
      "`DOC_DETECTIVE` is deprecated in Doc Detective 5.0, and its `config` object merges below `DOC_DETECTIVE_CONFIG` and flags instead of above them. Move it to `DOC_DETECTIVE_CONFIG`, which works today."
    );
  }
  if (legacy?.container && config.allowUnsafeSteps === undefined) {
    messages.push(
      "`DOC_DETECTIVE` has a `container` key, which allows unsafe steps today but not in Doc Detective 5.0. To keep running them, set `allowUnsafeSteps: true` in your config, which works today."
    );
  }
  for (const [name, { v4, on = "1", off = "unset it" }] of Object.entries(BOOLEAN_ENV)) {
    const value = env[name];
    if (!value) continue;
    const today = v4(value);
    const next = readsAs5(value);
    if (next === today) continue;
    const reads =
      next === undefined
        ? "Doc Detective 5.0 doesn't accept"
        : `turns it ${today ? "on" : "off"} today and ${next ? "on" : "off"} in Doc Detective 5.0`;
    messages.push(`\`${name}\` is '${value}', which ${reads}. Set it to \`${on}\` for on, or ${off} for off, which works today.`);
  }
  return messages;
}

/** Browsers loading from a legacy `browser-snapshots` folder, which 5.0 ignores. */
export function browsersDirWarnings(dir: string): string[] {
  return path.basename(dir) === "browser-snapshots"
    ? [
        `Doc Detective uses browsers from '${dir}'. Doc Detective 5.0 ignores \`browser-snapshots\` folders and installs browsers into \`<cacheDir>/browsers\`. To switch now, delete the folder or set \`cacheDir\`.`,
      ]
    : [];
}

const REPORTERS = ["terminal", "json", "html", "runFolder", "junit", "markdown"];

/** Config keys 5.0 renames or validates more strictly. */
export function configWarnings(config: any): string[] {
  const messages: string[] = [];
  if (config.beforeAny !== undefined) {
    messages.push(
      "`beforeAny` is renamed `beforeAll` in Doc Detective 5.0, which still reads `beforeAny` with a warning. Rename it to `beforeAll` when you upgrade."
    );
  }
  for (const name of Array.isArray(config.reporters) ? config.reporters : []) {
    if (typeof name === "string" && !REPORTERS.includes(name)) {
      messages.push(
        `\`reporters\` has '${name}'. Doc Detective 5.0 exits 2 unless each name is exactly \`terminal\`, \`json\`, \`html\`, \`runFolder\`, \`junit\`, or \`markdown\`, which work today.`
      );
    }
  }
  return messages;
}

const ROUTING = ["onPass", "onFail", "onWarning", "onSkip"];
const LOCATORS = ["selector", "elementText", "elementId", "elementTestId", "elementClass", "elementAttribute", "elementAria"];
const REJECTS = "Doc Detective 5.0 rejects with exit 2";
const EXIT_2 = `which ${REJECTS}`;

function routes(owner: any): any[] {
  return ROUTING.flatMap((key) => (Array.isArray(owner[key]) ? owner[key] : []));
}

function testWarnings(test: any, where: string): string[] {
  return routes(test).flatMap((route) => [
    ...(route.stop === "run"
      ? [`A test in ${where} has \`stop: "run"\` in its routing, ${EXIT_2}. Use \`stop: "spec"\`, which is what 4.x does.`]
      : []),
    ...["retry", "goToStep"]
      .filter((key) => key in route)
      .map((key) => `A test in ${where} has \`${key}\` in its routing, which 4.x ignores and ${REJECTS}. Remove it, or move it to a step.`),
  ]);
}

// Keys 5.0 checks for a negative number anywhere in a step.
function negatives(value: any, found: Set<string> = new Set()): Set<string> {
  if (value && typeof value === "object") {
    for (const [key, child] of Object.entries(value)) {
      if (typeof child === "number" && child < 0 && (key === "wait" || /(timeout|duration|delay)$/i.test(key))) found.add(key);
      negatives(child, found);
    }
  }
  return found;
}

function stepWarnings(step: any, where: string): string[] {
  const messages: string[] = [];
  for (const route of routes(step)) {
    if (route.stop === "spec" || route.stop === "run") {
      messages.push(
        `A step in ${where} has \`stop: "${route.stop}"\` in its routing, ${EXIT_2}. Use \`stop: "test"\` on the step and \`stop: "spec"\` on the test, which works today.`
      );
    }
    if ("goToTest" in route) {
      messages.push(`A step in ${where} has \`goToTest\` in its routing, which 4.x ignores and ${REJECTS}. Move it to the test's routing, which works today.`);
    }
  }
  if (typeof step.click === "boolean") {
    messages.push(
      `A \`click\` step in ${where} is \`${step.click}\`, which 4.x reads as text to click and ${REJECTS}. To click an element whose text is '${step.click}', quote it as \`"click": "${step.click}"\`, which works today.`
    );
  }
  const objects = (value: any) => [value].flat().filter((s) => s && typeof s === "object");
  if (objects(step.startSurface).concat(objects(step.closeSurface)).some((s) => s.browser === "edge")) {
    messages.push(`A surface in ${where} uses \`browser: "edge"\`, which Doc Detective 5.0 removes. Use another \`browser\`, such as \`chrome\`, which works today.`);
  }
  const starts = objects(step.startSurface);
  for (const surface of starts) {
    const removed = ["orientation", "udid", "provider"].filter((key) => surface.device && key in surface.device);
    if (removed.length) {
      messages.push(
        `A \`startSurface\` device in ${where} sets ${removed.map((key) => `\`${key}\``).join(", ")}, which Doc Detective 5.0 removes. Remove ${removed.length > 1 ? "them" : "it"}, which works today.`
      );
    }
    if ("app" in surface && surface.workingDirectory === ".") {
      messages.push(`An app in ${where} sets \`workingDirectory: "."\`, which 4.x tolerates and Doc Detective 5.0 fails. Remove it, which works today.`);
    }
  }
  const zeroTimeouts = [
    ...["runShell", "runCode", "goTo", "httpRequest"].filter((action) => step[action]?.timeout === 0),
    ...(starts.some((s) => s.timeout === 0) ? ["startSurface"] : []),
  ];
  for (const action of zeroTimeouts) {
    messages.push(
      `A \`${action}\` step in ${where} sets \`timeout: 0\`, ${EXIT_2}. Remove \`timeout\` for the default, or set it to 1 or more, which works today.`
    );
  }
  for (const key of negatives(step)) {
    messages.push(`A step in ${where} has a negative \`${key}\`, ${EXIT_2}. Use a positive value, which works today.`);
  }
  if (step.screenshot === false) {
    messages.push(
      `A \`screenshot: false\` step in ${where} takes a screenshot today, and Doc Detective 5.0 skips it. To keep the screenshot, use \`screenshot: true\`, which works today.`
    );
  }
  const find = step.find && typeof step.find === "object" ? step.find : {};
  const click = find.click;
  if (
    (typeof click === "string" && !["left", "right", "middle"].includes(click)) ||
    (click && typeof click === "object" && Object.keys(click).some((key) => key !== "button" && key !== "duration"))
  ) {
    messages.push(
      `A \`find.click\` in ${where} isn't \`true\`, \`false\`, a button, or \`{button, duration}\`, ${EXIT_2}. Use \`click: true\` to click the found element, or a separate \`click\` step, which works today.`
    );
  }
  if (find.type && typeof find.type === "object" && LOCATORS.some((key) => key in find.type)) {
    messages.push(`A \`find.type\` in ${where} sets its own locator, ${EXIT_2}. Move it to a separate \`type\` step, which works today.`);
  }
  for (const action of ["goTo", "httpRequest"]) {
    const url = typeof step[action] === "string" ? step[action] : step[action]?.url;
    if (typeof url === "string" && !/^(https?:\/\/|\/)/.test(url) && !/^\$[A-Za-z0-9_]+$/.test(url)) {
      messages.push(
        `A \`${action}\` URL in ${where} ('${url}') doesn't start with \`http://\`, \`https://\`, or \`/\`, and isn't a whole \`$VAR\`, ${EXIT_2}. Put the whole URL in one variable, which works today.`
      );
    }
  }
  for (const action of ["saveCookie", "loadCookie"]) {
    const value = step[action];
    if (typeof value === "string" && value.includes("/") && !value.endsWith(".txt")) {
      messages.push(
        `A \`${action}\` in ${where} ('${value}') has a \`/\` but doesn't end in \`.txt\`, ${EXIT_2}. End a file path in \`.txt\`, which works today.`
      );
    }
  }
  return messages;
}

/** Spec content 5.0 rejects or reads differently, from resolved tests. */
export function specWarnings(resolvedTests: any): string[] {
  const messages: string[] = [];
  for (const spec of resolvedTests?.specs ?? []) {
    const file = spec.contentPath;
    const where =
      typeof file === "string" ? `'${path.isAbsolute(file) ? path.relative(process.cwd(), file) : file}'` : "a spec";
    for (const test of spec.tests ?? []) {
      messages.push(...testWarnings(test, where));
      for (const context of test.contexts ?? []) {
        for (const step of context.steps ?? []) messages.push(...stepWarnings(step, where));
      }
    }
  }
  return [...new Set(messages)];
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
