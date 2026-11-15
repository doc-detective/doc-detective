/**
 * `doc-detective audit`: detects tests the way a run does, then reports which
 * procedure steps, code blocks, links, and images have a step. Nothing runs
 * (ADR 01207).
 */

import fs from "node:fs";
import path from "node:path";
import { loadProjectEnv, readStdinInputs, setConfig, discoverConfigPath, log } from "../utils.js";
import { setConfig as setRunConfig } from "../core/config.js";
import { detectTests } from "../core/detectTests.js";
import { maskDeep, maskString } from "../core/masking.js";
import { canonicalUrl, computeCoverage, type CoverageIndex, type FileCoverage, type Item, type State } from "./coverage.js";

const SPEC_EXTENSIONS = new Set(["json", "yaml", "yml"]);

const extensionOf = (file: string) => path.extname(file).slice(1).toLowerCase();
const urlOf = (value: any): string | undefined => (typeof value === "string" ? value : value?.url);

/** What any spec in the inputs can credit: authored step IDs, link targets, and screenshot files. */
export function buildIndex(specs: any[], origin?: string): CoverageIndex {
  const index: CoverageIndex = { stepIds: new Map(), linkTargets: new Map(), screenshotFiles: new Map() };
  // Steps, not keys, so a match goes through the same state rules as a located step.
  const put = (map: Map<string, any[]>, key: string, step: any) => {
    const steps = map.get(key);
    if (steps) steps.push(step);
    else map.set(key, [step]);
  };
  for (const spec of specs) {
    for (const test of spec.tests ?? []) {
      const source = test.contentPath ?? spec.contentPath;
      for (const step of test.steps ?? []) {
        if (typeof step.stepId === "string") put(index.stepIds, step.stepId, step);
        for (const action of ["goTo", "checkLink"]) {
          const url = urlOf(step[action]);
          const target = url && canonicalUrl(url, step[action]?.origin ?? origin);
          if (target) put(index.linkTargets, target, step);
        }
        const shot = typeof step.screenshot === "string" ? step.screenshot : step.screenshot?.path;
        if (typeof shot === "string" && !canonicalUrl(shot) && source) {
          put(index.screenshotFiles, path.resolve(path.dirname(source), shot), step);
        }
      }
    }
  }
  return index;
}

type Counts = Record<State, number> & { total: number };
const counts = (): Counts => ({ total: 0, hasStep: 0, ignored: 0, skipped: 0, untested: 0 });
const add = (into: Counts, item: Item) => {
  into.total++;
  into[item.state]++;
};

export interface AuditReport {
  summary: {
    procedureSteps: Counts & { navigationOnly: number };
    possibleProcedureSteps: Counts & { navigationOnly: number };
    lists: { explicit: number; tagged: number; possible: number };
    codeBlocks: { byLanguage: Record<string, Counts>; notRunnable: number };
    links: { total: number; testable: number; hasStep: number };
    images: { total: number; hasStep: number };
    pages: { total: number; measured: number; hasAuthoredStep: number };
  };
  files: Array<{ path: string; fileType?: string; measured: boolean; items: Item[] }>;
}

/** Totals across files. */
export function summarize(files: Array<{ path: string; fileType?: string } & FileCoverage>): AuditReport {
  const procedureSteps = { ...counts(), navigationOnly: 0 };
  const possibleProcedureSteps = { ...counts(), navigationOnly: 0 };
  const lists = { explicit: 0, tagged: 0, possible: 0 };
  const byLanguage: Record<string, Counts> = {};
  let notRunnable = 0;
  const links = { total: 0, testable: 0, hasStep: 0 };
  const images = { total: 0, hasStep: 0 };
  const pages = { total: files.length, measured: 0, hasAuthoredStep: 0 };
  for (const file of files) {
    if (file.measured) pages.measured++;
    if (file.hasAuthoredStep) pages.hasAuthoredStep++;
    for (const key of ["explicit", "tagged", "possible"] as const) lists[key] += file.lists[key];
    notRunnable += file.notRunnable;
    links.total += file.linksTotal;
    for (const item of file.items) {
      if (item.kind === "procedureStep") {
        const into = item.source === "possible" ? possibleProcedureSteps : procedureSteps;
        add(into, item);
        if (item.navigationOnly) into.navigationOnly++;
      } else if (item.kind === "codeBlock") {
        add((byLanguage[item.language ?? ""] ??= counts()), item);
      } else if (item.kind === "link") {
        links.testable++;
        if (item.state === "hasStep") links.hasStep++;
      } else {
        images.total++;
        if (item.state === "hasStep") images.hasStep++;
      }
    }
  }
  return {
    summary: { procedureSteps, possibleProcedureSteps, lists, codeBlocks: { byLanguage, notRunnable }, links, images, pages },
    files: files.map(({ path: file, fileType, measured, items }) => ({ path: file, fileType, measured, items })),
  };
}

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** The text report: one summary line per kind, then the untested procedure steps. */
export function renderText(report: AuditReport, { quiet = false } = {}): string {
  const { procedureSteps: p, possibleProcedureSteps: maybe, lists, codeBlocks, links, images, pages } = report.summary;
  const row = (label: string, text: string) => `${label.padEnd(21)}${text}`;
  const lines = [
    row("Procedure steps", `${p.hasStep} of ${p.total} have a step` + (p.navigationOnly ? ` (${p.navigationOnly} only by navigation or a link check)` : "")),
  ];
  if (quiet) return `${lines[0]}\n`;
  lines.push(row("", `${p.untested} untested, ${p.ignored} ignored, ${p.skipped} skipped as unsafe`));
  lines.push(row("Possible procedures", `${plural(maybe.total, "item")} in ${plural(lists.possible, "list")}, ${maybe.hasStep} have a step`));
  const languages = Object.entries(codeBlocks.byLanguage)
    .sort(([, a], [, b]) => b.total - a.total)
    .map(([language, c]) => `${language} ${c.total} (${c.hasStep} have a step)`);
  lines.push(row("Code blocks", `${languages.length ? languages.join(", ") : "0 runnable"}; ${codeBlocks.notRunnable} not runnable`));
  lines.push(row("Links", `${links.testable} of ${links.total} testable, ${links.hasStep} have a step`));
  lines.push(row("Images", `${images.total}, ${images.hasStep} have a screenshot step`));
  lines.push(row("Pages", `${pages.hasAuthoredStep} of ${pages.total} have an authored step`));
  const unmeasured = pages.total - pages.measured;
  if (unmeasured) lines.push(row("Not measured", plural(unmeasured, "file")));

  const untested = report.files
    .map((file) => ({ file, items: file.items.filter((i) => i.kind === "procedureStep" && i.source !== "possible" && i.state === "untested") }))
    .filter(({ items }) => items.length);
  if (untested.length) {
    lines.push("", "Untested procedure steps:");
    for (const { file, items } of untested) {
      lines.push(`  ${file.path}`);
      for (const item of items) lines.push(`    ${String(item.line).padStart(4)}  ${item.text}`);
    }
  }
  return `${lines.join("\n")}\n`;
}

export async function runAudit(args: Record<string, any>): Promise<void> {
  await loadProjectEnv(args);
  await readStdinInputs(args);
  const cliConfig = await setConfig({ configPath: discoverConfigPath(args), args });
  const config = await setRunConfig({ config: cliConfig, detectApps: false });
  const specs: any[] = await detectTests({ config });
  const qualified: string[] = config._qualifiedFiles ?? [];
  const index = buildIndex(specs, config.origin);
  const stepsByFile = new Map<string, any[]>();
  for (const spec of specs) {
    for (const test of spec.tests ?? []) {
      const file = path.resolve(test.contentPath ?? spec.contentPath ?? "");
      if (!stepsByFile.has(file)) stepsByFile.set(file, []);
      stepsByFile.get(file)!.push(...(test.steps ?? []));
    }
  }

  const files = [];
  for (const file of qualified.map((f) => path.resolve(f))) {
    if (SPEC_EXTENSIONS.has(extensionOf(file))) continue;
    const fileType = config.fileTypes.find((ft: any) => ft.extensions.includes(extensionOf(file)));
    if (!fileType) continue;
    let content: string;
    try {
      content = fs.readFileSync(file, "utf8");
    } catch {
      // The file changed after detection read it.
      log(`Couldn't read \`${file}\`. It's left out of the report.`, "warning", config);
      continue;
    }
    const coverage = computeCoverage({
      content,
      fileType,
      filePath: file,
      steps: stepsByFile.get(file) ?? [],
      index,
      origin: config.origin,
      allowUnsafe: config.allowUnsafeSteps === true,
    });
    files.push({ path: file, fileType: fileType.name, ...coverage });
  }

  // Spec files and unreadable files don't count, so check after reading.
  if (files.length === 0) {
    const inputs = [config.input].flat().map((input: string) => `\`${input}\``).join(", ");
    log(`Couldn't find any files to audit in ${inputs}. Pass a file or folder with \`--input\`.`, "error", config);
    process.exitCode = 2;
    return;
  }

  // Docs can hold `.env` values, so mask the output like every other. Text
  // renders from the real states first, then masks.
  const report = summarize(files);
  // `--json` is the result itself, so it prints at any log level, as in ADR 01146.
  // `--json` and `-q` pick the output shape and have no config key, so they're
  // read from `args`, as `debug` does.
  if (args.json) process.stdout.write(`${JSON.stringify(maskDeep(report), null, 2)}\n`);
  else if (config.logLevel !== "silent") process.stdout.write(maskString(renderText(report, { quiet: Boolean(args.quiet) })));
}
