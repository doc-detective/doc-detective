// Warnings on 4.x about what 5.0 changes or removes (ADR 01147). They go to
// stderr, so stdout stays clean for --dry-run JSON and LSP traffic. Keep this
// module free of heavy imports: the bare bins load it too.
import fs from "node:fs";
import path from "node:path";

const UPGRADE_GUIDE_URL = "https://docs.doc-detective.com/docs/ci/upgrade-to-v5";

const REMOVED_BINS = {
  "doc-detective-lsp": "Use `doc-detective lsp --stdio`, which works today.",
};

// Each exact message prints once per process. Spec rows name their file, so a
// later `runTests` call in the same process still warns about a new file, but
// not about the same issue in a file it already warned about.
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

export function warnRemovedBin(bin: keyof typeof REMOVED_BINS): void {
  warnUpgrade([`\`${bin}\` is removed in Doc Detective 5.0. ${REMOVED_BINS[bin]}`]);
}

/**
 * Warnings for a command line. `commands` is yargs' parsed `_`; `rawArgs` is the
 * unparsed argv, because yargs fills in both `-a` and `--agent` and can't tell
 * which one the user typed.
 */
export function commandWarnings(commands: string[], rawArgs: string[]): string[] {
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
  if (commands[0] === "install" && rawArgs.some((arg) => arg === "--silent" || arg.startsWith("--silent="))) {
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
        `\`output\` names a folder ('${raw}'): 4.x treats a path without a file extension as a folder. In Doc Detective 5.0, \`--output\` and \`output\` name the results file, and a folder needs \`--output-dir\`.`,
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
  // `reporters` is declared with `array: true` in buildYargs (src/utils.ts), so
  // both `-r a b` and `-r a -r b` arrive as an array of several values.
  if (Array.isArray(args.reporters) && args.reporters.length > 1) {
    // 4.x reads `-r terminal,html` as one unknown reporter, so that form has to wait.
    messages.push(
      "`--reporters` takes one comma-separated value in Doc Detective 5.0, like `-r terminal,html`, which 4.x doesn't read. Switch when you upgrade, or set `reporters` in your config file, which works on both."
    );
  }
  for (const flag of ["test", "spec"]) {
    const values = args[flag];
    if (Array.isArray(values) && values.length > 1) {
      messages.push(
        `\`--${flag}\` is given more than once, so 4.x ignores it and Doc Detective 5.0 exits with a usage error. Give one comma-separated value, \`--${flag} ${values.join(",")}\`, which works today.`
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
    off: "`0`",
  },
};

function readsAs5(value: string): boolean | undefined {
  const v = value.trim().toLowerCase();
  if (["1", "true", "yes", "on"].includes(v)) return true;
  if (["", "0", "false", "no", "off"].includes(v)) return false;
  return undefined;
}

/** The legacy `DOC_DETECTIVE` env var as an object, or `{}` when it's unset or not JSON. */
export function legacyEnv(env: Record<string, string | undefined>): any {
  try {
    const parsed = JSON.parse(env.DOC_DETECTIVE || "{}");
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

/** The legacy `DOC_DETECTIVE` env var, and boolean env vars 5.0 reads differently. */
export function envWarnings(env: Record<string, string | undefined>, config: { allowUnsafeSteps?: boolean }): string[] {
  const messages: string[] = [];
  const legacy = legacyEnv(env);
  if (legacy.config && typeof legacy.config === "object") {
    messages.push(
      "`DOC_DETECTIVE` is deprecated in Doc Detective 5.0, and its `config` object merges below `DOC_DETECTIVE_CONFIG` and flags instead of above them. Move it to `DOC_DETECTIVE_CONFIG`, which works today."
    );
  }
  // The official images set this value themselves, and their 5.0 builds allow
  // unsafe steps in config, so only other images need to act.
  const officialImage = /^docdetective\/docdetective:/.test(String(legacy.container));
  // Deliberately strict: an explicit `false` has already opted out, so it needs no migration.
  if (legacy.container && !officialImage && config.allowUnsafeSteps === undefined) {
    messages.push(
      "`DOC_DETECTIVE` has a `container` key, which allows unsafe steps today but not in Doc Detective 5.0. To keep running them, set `allowUnsafeSteps: true` in your config, which works today."
    );
  }
  for (const [name, { v4, on = "1", off = "unset it" }] of Object.entries(BOOLEAN_ENV)) {
    const value = env[name];
    // An empty value still counts: DOC_DETECTIVE_AUTOINSTALL reads it as on today.
    if (value === undefined) continue;
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

/** Config values 5.0 validates more strictly. */
export function configWarnings(config: any): string[] {
  const messages: string[] = [];
  // `-r terminal,html` arrives comma-joined, and 5.0 splits it.
  const names = (Array.isArray(config.reporters) ? config.reporters : [])
    .flatMap((name: unknown) => (typeof name === "string" ? name.split(",").map((part) => part.trim()) : []))
    .filter(Boolean);
  for (const name of names) {
    if (!REPORTERS.includes(name)) {
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

// Subtrees that hold the user's own data, where a `timeout` key isn't one of ours.
// Keep this in sync with the schemas' free-form boundaries.
const FREE_FORM = new Set([
  "request",
  "response",
  "headers",
  "body",
  "params",
  "parameters",
  "elementAttribute",
  "variables",
  "outputs",
  "env",
  "driverOptions",
  "openApi",
]);

// Negative `wait`, `*timeout`, `*duration`, and `*delay` numbers in a step,
// which 5.0 rejects anywhere. It walks authored steps: shallow, parsed JSON/YAML
// with no cycles, so the recursion needs no depth limit or cycle guard.
function negatives(value: any, found: Set<string> = new Set()): Set<string> {
  if (value && typeof value === "object") {
    for (const [key, child] of Object.entries(value)) {
      if (FREE_FORM.has(key)) continue;
      if (typeof child === "number" && child < 0 && (key === "wait" || /(timeout|duration|delay)$/i.test(key))) found.add(key);
      negatives(child, found);
    }
  }
  return found;
}

// Rows that name a value. A file gets one warning per row, naming the first value.
type Offenders = Map<string, { values: Set<string>; message: (first: string) => string }>;

function offend(offenders: Offenders, row: string, value: string, message: (first: string) => string): void {
  if (!offenders.has(row)) offenders.set(row, { values: new Set(), message });
  offenders.get(row)!.values.add(value);
}

function stepWarnings(step: any, where: string, offenders: Offenders): string[] {
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
      `A \`click\` step in ${where} is \`${step.click}\`, which 4.x reads as text to click and ${REJECTS}. To click an element whose text is '${step.click}', quote it as \`"click": "${step.click}"\`, which works today. If you don't want a click, remove the step.`
    );
  }
  const objects = (value: any) => [value].flat().filter((s) => s && typeof s === "object");
  if (objects(step.startSurface).concat(objects(step.closeSurface)).some((s) => s.browser === "edge")) {
    messages.push(`A surface in ${where} uses \`browser: "edge"\`, which Doc Detective 5.0 removes. Use another \`browser\`, such as \`chrome\`, which works today.`);
  }
  const starts = objects(step.startSurface);
  for (const surface of starts) {
    // A string device names a device, so only an object can hold these keys.
    const device = surface.device && typeof surface.device === "object" ? surface.device : {};
    const removed = ["orientation", "udid", "provider"].filter((key) => key in device);
    if (removed.length) {
      messages.push(
        `A \`startSurface\` device in ${where} sets ${removed.map((key) => `\`${key}\``).join(", ")}, which Doc Detective 5.0 removes. Remove ${removed.length > 1 ? "them" : "it"}, which works today.`
      );
    }
    if (surface.app != null && surface.workingDirectory === ".") {
      messages.push(`An app in ${where} sets \`workingDirectory: "."\`, which 4.x tolerates and Doc Detective 5.0 fails. Remove it, which works today.`);
    }
  }
  const zeroTimeouts = [
    ...["runShell", "runCode", "goTo", "httpRequest"].filter((action) => step[action]?.timeout === 0),
    ...(starts.some((s) => s.timeout === 0) ? ["startSurface"] : []),
  ];
  for (const action of zeroTimeouts) {
    messages.push(
      `A \`${action}\` step in ${where} sets \`timeout: 0\`, ${EXIT_2} on \`runShell\`, \`runCode\`, \`goTo\`, \`httpRequest\`, and \`startSurface\` processes and apps. Remove \`timeout\` for the default, or set it to 1 or more, which works today. Locator and wait timeouts can still be 0.`
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
      offend(
        offenders,
        `${action} URL`,
        url,
        (first) =>
          `A \`${action}\` URL in ${where} (${first}) doesn't start with \`http://\`, \`https://\`, or \`/\`, and isn't a whole \`$VAR\`, ${EXIT_2}. Put the whole URL in one variable, which works today.`
      );
    }
  }
  for (const action of ["saveCookie", "loadCookie"]) {
    const value = step[action];
    if (typeof value === "string" && value.includes("/") && !value.endsWith(".txt")) {
      offend(
        offenders,
        action,
        value,
        (first) =>
          `A \`${action}\` in ${where} (${first}) has a \`/\` but doesn't end in \`.txt\`, ${EXIT_2}. End a file path in \`.txt\`, which works today.`
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
    const offenders: Offenders = new Map();
    for (const test of spec.tests ?? []) {
      messages.push(...testWarnings(test, where));
      for (const context of test.contexts ?? []) {
        for (const step of context.steps ?? []) messages.push(...stepWarnings(step, where, offenders));
      }
    }
    for (const { values, message } of offenders.values()) {
      const [first] = values;
      messages.push(message(values.size > 1 ? `\`${first}\` and ${values.size - 1} more` : `\`${first}\``));
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
    const fix =
      exitOnFail === true
        ? "Make sure your inputs always find tests."
        : "To allow empty runs, set `--no-exit-on-fail`, which also stops failed tests from failing the run. Otherwise, make sure your inputs always find tests.";
    return [`This run tested nothing. Doc Detective 5.0 will exit 2 instead of 0. ${fix}`];
  }
  if (failed && exitOnFail === undefined) {
    return [
      "This run has failed specs. Doc Detective 5.0 will exit 1 instead of 0. To keep exit 0, set `--no-exit-on-fail`.",
    ];
  }
  return [];
}
