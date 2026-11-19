/**
 * Computes one file's static coverage for `audit`: which procedure steps,
 * code blocks, links, and images have a step (ADR 01213). Steps come from
 * the runner's own detection, so this adds no second engine.
 */

import path from "node:path";
import type { FileType } from "../common/src/fileTypes.js";
import { collectStatements, formatOf, parseFile, type Node } from "../common/src/detect/selectors.js";
import { getLineNumber, getLineStarts } from "../common/src/textUtils.js";
import { stepActions } from "../common/src/stepActions.js";
import { findProcedures, type Source } from "./procedures.js";

/** Steps that check nothing, so they never cover an item. */
const NON_CHECKING = new Set(["wait", "loadVariables", "saveCookie", "loadCookie", "record", "stopRecord", "closeSurface"]);
const NAVIGATION = new Set(["goTo", "checkLink"]);
export const RUNNABLE_LANGUAGES = new Set(["bash", "sh", "shell", "console", "zsh", "powershell", "pwsh", "python", "py", "javascript", "js", "http"]);

export type State = "hasStep" | "ignored" | "skipped" | "untested";

export interface Item {
  kind: "procedureStep" | "codeBlock" | "link" | "image";
  line: number;
  state: State;
  source?: Source;
  navigationOnly?: true;
  text?: string;
  language?: string;
  url?: string;
  src?: string;
}

/** What every spec in the audited inputs can credit, across files. */
export interface CoverageIndex {
  /** Authored `stepId` values. The runner derives the rest at run time. */
  stepIds: Set<string>;
  /** `goTo` and `checkLink` targets, through `canonicalUrl`. */
  linkTargets: Set<string>;
  /** Absolute paths that `screenshot` steps write. */
  screenshotFiles: Set<string>;
}

export interface FileCoverage {
  measured: boolean;
  items: Item[];
  lists: { explicit: number; tagged: number; possible: number };
  notRunnable: number;
  linksTotal: number;
  hasAuthoredStep: boolean;
}

export interface CoverageInput {
  content: string;
  fileType: FileType;
  filePath: string;
  /** Steps of the tests detected in this file, with their `location`. */
  steps: any[];
  index: CoverageIndex;
  origin?: string;
  allowUnsafe?: boolean;
}

/**
 * An http(s) URL without its fragment or trailing slash, resolved against
 * `origin`. Null when it isn't an http(s) URL.
 */
export function canonicalUrl(url: string, origin?: string): string | null {
  let parsed: URL;
  try {
    parsed = new URL(url, origin);
  } catch {
    return null;
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return null;
  parsed.hash = "";
  return parsed.href.replace(/\/$/, "");
}

/** The step's action key, such as `goTo`. */
export const actionOf = (step: any): string | undefined => stepActions.find((action) => action in step);

const classesOf = (node: Node): string[] => String(node.attributes?.class ?? "").split(/\s+/).filter(Boolean);

export function computeCoverage({ content, fileType, filePath, steps, index, origin, allowUnsafe = false }: CoverageInput): FileCoverage {
  const lineStarts = getLineStarts(content);
  const lineOf = (offset: number) => getLineNumber(content, offset, lineStarts);
  const format = formatOf(fileType, filePath);

  // Inline statements only. Detected steps arrive in `steps`.
  const statements = collectStatements({ content, fileType, filePath, detectSteps: false, warn: () => {} });
  const ignored: Array<[number, number]> = [];
  let open: number | null = null;
  for (const s of statements) {
    if (s.type === "ignoreStart") open ??= s._startIndex;
    if ((s.type === "ignoreEnd" || s.type === "testEnd") && open !== null) {
      ignored.push([open, s._endIndex]);
      open = null;
    }
  }
  if (open !== null) ignored.push([open, content.length]);
  const isIgnored = (start: number, end: number) => ignored.some(([a, b]) => start < b && a < end);
  const authored = statements.filter((s) => s.type === "step" && !isIgnored(s._startIndex, s._endIndex));
  const markers = statements.filter((s) => s.type === "procedure").map((s) => s._endIndex);

  const located = steps.filter((step) => typeof step.location?.startIndex === "number");
  const stepsIn = (start: number, end: number) =>
    located.filter((step) => step.location.startIndex >= start && step.location.startIndex < end);

  /** The state of an item that `own` steps belong to. */
  const stateOf = (own: any[], start: number, end: number, forceIgnored = false): Pick<Item, "state" | "navigationOnly"> => {
    const counting = own.filter((step) => !NON_CHECKING.has(actionOf(step) ?? ""));
    const runs = counting.filter((step) => allowUnsafe || !step.unsafe);
    if (runs.length) return runs.every((step) => NAVIGATION.has(actionOf(step) ?? "")) ? { state: "hasStep", navigationOnly: true } : { state: "hasStep" };
    if (forceIgnored || isIgnored(start, end)) return { state: "ignored" };
    return { state: counting.length ? "skipped" : "untested" };
  };

  const items: Item[] = [];
  const lists = findProcedures(content, format, { mdx: /\.mdx$/i.test(filePath), markers });
  const tally = { explicit: 0, tagged: 0, possible: 0 };
  for (const list of lists ?? []) {
    tally[list.source === "tagger" ? "tagged" : list.source]++;
    for (const item of list.items) {
      const { state, navigationOnly } = stateOf(stepsIn(item.startIndex, item.endIndex), item.startIndex, item.endIndex);
      items.push({ kind: "procedureStep", source: list.source, line: lineOf(item.startIndex), text: item.text, state, ...(navigationOnly && { navigationOnly }) });
    }
  }
  const inList = (start: number) => (lists ?? []).some((list) => start >= list.startIndex && start < list.endIndex);

  let notRunnable = 0;
  let linksTotal = 0;
  for (const node of parseFile(content, fileType, filePath, () => {})) {
    const { startIndex: start, endIndex: end } = node;
    if (node.kind === "codeBlock") {
      const classes = classesOf(node);
      const language = (node.language ?? "").toLowerCase();
      // An authored step right after the block, with only whitespace between.
      const following = authored.find((s) => s._startIndex >= end && content.slice(end, s._startIndex).trim() === "");
      const own = [...stepsIn(start, end), ...(following ? located.filter((step) => step.location.startIndex === following._startIndex) : [])];
      const id = node.attributes?.id;
      const byId = typeof id === "string" && index.stepIds.has(id);
      const testIgnore = /\btestIgnore\b/.test(node.meta ?? "") || classes.includes("testIgnore");
      const result: Pick<Item, "state" | "navigationOnly"> = byId ? { state: "hasStep" } : stateOf(own, start, end, testIgnore);
      if (classes.includes("procedure") && !inList(start)) {
        items.push({ kind: "procedureStep", source: "explicit", line: lineOf(start), text: itemText(node), state: result.state });
      }
      if (RUNNABLE_LANGUAGES.has(language)) items.push({ kind: "codeBlock", language, line: lineOf(start), state: result.state });
      else notRunnable++;
    } else if (node.kind === "link" && node.url) {
      linksTotal++;
      const target = canonicalUrl(node.url, origin);
      if (!target) continue;
      const own = stepsIn(start, end).filter((step) => NAVIGATION.has(actionOf(step) ?? ""));
      const state = index.linkTargets.has(target) ? "hasStep" : stateOf(own, start, end).state;
      items.push({ kind: "link", url: node.url, line: lineOf(start), state });
    } else if (node.kind === "image" && node.src) {
      const own = stepsIn(start, end).filter((step) => actionOf(step) === "screenshot");
      const file = canonicalUrl(node.src) ? null : path.resolve(path.dirname(filePath), node.src);
      const state = file && index.screenshotFiles.has(file) ? "hasStep" : stateOf(own, start, end).state;
      items.push({ kind: "image", src: node.src, line: lineOf(start), state });
    }
  }

  items.sort((a, b) => a.line - b.line);
  return { measured: lists !== null, items, lists: tally, notRunnable, linksTotal, hasAuthoredStep: authored.length > 0 };
}

/** A code block's first line, as its item text. */
function itemText(node: Node): string {
  return (node.content ?? "").split(/\r?\n/).map((line) => line.trim()).find(Boolean) ?? "";
}
