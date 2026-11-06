/**
 * Collects a file's statements for parseContent: inline statements and
 * detected steps. Regex definitions match the file's raw text. Selector
 * definitions match the nodes a format parser produces. Both produce the same
 * match shape (numbered values plus type, span, and sortIndex), so the state
 * machine in parseContent treats them alike.
 */

import { safeRegExp, getLineStarts, getLineNumber } from "../textUtils.js";
import type { FileType } from "../fileTypes.js";
import { parseMarkdown } from "./markdown.js";

export type Kind =
  | "comment"
  | "codeBlock"
  | "link"
  | "image"
  | "strong"
  | "emphasis"
  | "text"
  | "element";

export const KINDS: Kind[] = ["comment", "codeBlock", "link", "image", "strong", "emphasis", "text", "element"];

/**
 * A parsed node, with exact source offsets. A parser must set `content`,
 * `text`, or `alt` on every node, because that's the node's main text.
 */
export interface Node {
  kind: Kind;
  startIndex: number;
  endIndex: number;
  content?: string;
  text?: string;
  language?: string;
  meta?: string;
  url?: string;
  title?: string;
  src?: string;
  alt?: string;
  tag?: string;
  /** `true` marks an attribute with no value. */
  attributes?: Record<string, string | true>;
  /** Raw source from the start of the enclosing block to the node. */
  before: string;
}

const STATEMENT_TYPES = ["testStart", "testEnd", "ignoreStart", "ignoreEnd", "step"] as const;
type StatementType = (typeof STATEMENT_TYPES)[number];

/**
 * Reads statement text from a container. Keywords must end at a word
 * boundary, so prose such as "testing notes: x" isn't a statement.
 */
export function parseStatementText(text: string | undefined): { type: StatementType; payload: string } | null {
  const s = (text ?? "").trim();
  if (s === "test ignore start") return { type: "ignoreStart", payload: "" };
  if (s === "test ignore end") return { type: "ignoreEnd", payload: "" };
  const m = /^(test end|test(?:\s+start)?|step)\b\s*([\s\S]*)$/.exec(s);
  if (!m) return null;
  const type = m[1] === "test end" ? "testEnd" : m[1] === "step" ? "step" : "testStart";
  return { type, payload: m[2].trim() };
}

interface Selector {
  kind: Kind;
  options: Record<string, any>;
}

/** The selector kind of a definition, with shorthand strings expanded. */
function selectorOf(def: any): Selector | null {
  for (const kind of KINDS) {
    const raw = def?.[kind];
    if (raw === undefined) continue;
    // The schema allows a string only for codeBlock, a language, and element, a tag.
    if (typeof raw === "string") return { kind, options: kind === "codeBlock" ? { language: [raw] } : { tag: [raw] } };
    return { kind, options: raw };
  }
  return null;
}

/** True when a fileType needs its file parsed. */
export function usesSelectors(fileType: FileType, detectSteps = true): boolean {
  return Boolean(fileType.inlineStatements?.in) || (detectSteps && (fileType.markup ?? []).some(selectorOf));
}

/** A node's main text. A node a parser left without one matches no `regex` or `excludes`. */
export const mainText = (node: Node): string => node.content ?? node.text ?? node.alt ?? "";
const matches = (pattern: string, subject: string): boolean => safeRegExp(pattern, "")?.test(subject) ?? false;
const patternsOf = (regex: string | string[]): string[] => [regex].flat();

interface Match {
  node: Node;
  startIndex: number;
  endIndex: number;
  /** Groups of the definition's `regex`, when it has one. */
  groups: RegExpMatchArray | null;
  /** Groups of `precededBy`, when the selector has one. */
  preceded: RegExpExecArray | null;
}

/**
 * Checks a node against a selector's options. The schema decides which
 * options each kind allows, and parsers set every field their kind has.
 */
function matchNode(node: Node, { kind, options: o }: Selector): Match | null {
  if (node.kind !== kind) return null;
  if (o.excludes && matches(o.excludes, mainText(node))) return null;
  if (o.language && !o.language.includes(node.language)) return null;
  if (o.metaExcludes && matches(o.metaExcludes, node.meta!)) return null;
  if (o.tag && !o.tag.includes(node.tag)) return null;
  if (o.url && !matches(o.url, node.url!)) return null;
  if (o.src && !matches(o.src, node.src!)) return null;
  for (const [name, want] of Object.entries(o.attributes ?? {})) {
    const value = node.attributes?.[name];
    if (value === undefined || (want !== true && !matches(want as string, String(value)))) return null;
  }
  let preceded: RegExpExecArray | null = null;
  if (o.precededBy) {
    preceded = safeRegExp(o.precededBy, "")?.exec(node.before) ?? null;
    if (!preceded) return null;
  }
  return { node, startIndex: node.startIndex, endIndex: node.endIndex, groups: null, preceded };
}

/**
 * A capture field's value. A `regex` or `precededBy` group that didn't take
 * part is undefined, so the action drops the field, as in regex definitions.
 * A node field or attribute the node doesn't have is "", so the field stays.
 */
export function resolveField(path: string, match: Match): string | undefined {
  const group = /^(match|precededBy)\.(\d+)$/.exec(path);
  if (group) return (group[1] === "match" ? match.groups : match.preceded)?.[Number(group[2])];
  if (path.startsWith("attributes.")) {
    const value = match.node.attributes?.[path.slice("attributes.".length)];
    return value === undefined ? "" : String(value);
  }
  const value = (match.node as any)[path];
  return typeof value === "string" ? value : "";
}

/** The matches of one selector definition. With `regex`, each occurrence in a node's main text is a match. */
function selectMatches(def: any, selector: Selector, nodes: Node[]): Match[] {
  const found: Match[] = [];
  for (const node of nodes) {
    const match = matchNode(node, selector);
    if (!match) continue;
    if (def.regex === undefined) {
      found.push(match);
      continue;
    }
    for (const pattern of patternsOf(def.regex)) {
      const re = safeRegExp(pattern, "g");
      if (!re) continue;
      for (const m of mainText(node).matchAll(re)) {
        // A text run holds raw source, so its occurrences have their own spans.
        const at = node.startIndex + m.index!;
        const span = node.kind === "text" ? { startIndex: at, endIndex: at + m[0].length } : {};
        found.push({ ...match, ...span, groups: m });
      }
    }
  }
  return found;
}

const FORMAT_BY_EXTENSION: Record<string, string> = { md: "markdown", markdown: "markdown", mdx: "markdown" };

/** Parses a file into nodes. The extension picks the parser, else the fileType's `extends` or `name`. */
function parseFile(content: string, fileType: FileType, filePath: string, warn: (message: string) => void): Node[] {
  const ext = /\.([^./\\]+)$/.exec(filePath)?.[1].toLowerCase() ?? "";
  const format = FORMAT_BY_EXTENSION[ext] ?? (fileType as any).extends ?? fileType.name;
  if (format !== "markdown") {
    const name = fileType.name ? `"${fileType.name}"` : "A fileType";
    warn(`${filePath}: ${name} uses selectors, but no parser handles .${ext}. Set "extends" to a built-in, or use regex definitions.`);
    return [];
  }
  if (ext === "mdx") {
    try {
      return parseMarkdown(content, true);
    } catch (error: any) {
      const reason = String(error.message).split("\n")[0];
      warn(`${filePath}: couldn't parse as MDX (${reason}). Parsed as Markdown, so content inside JSX components isn't detected.`);
    }
  }
  return parseMarkdown(content);
}

export interface CollectStatementsInput {
  content: string;
  fileType: FileType;
  filePath?: string;
  detectSteps?: boolean;
  warn: (message: string) => void;
}

/**
 * A statement or detected step, shaped like a regex match: `0` is the matched
 * source, and `1` and up are `$1` and up.
 */
export interface Statement {
  [value: number]: string | undefined;
  0: string;
  type: StatementType | "detectedStep";
  /** A detected step's markup definition. */
  markup?: any;
  _startIndex: number;
  _endIndex: number;
  _line: number;
  sortIndex: number;
}

/** Returns a file's statements in document order. */
export function collectStatements({
  content,
  fileType,
  filePath = "",
  detectSteps = true,
  warn,
}: CollectStatementsInput): Statement[] {
  const lineStarts = getLineStarts(content);
  const statements: any[] = [];
  // Statements sort at their start plus the length of their first value, as
  // regex statements always have. A capture can come from outside the node,
  // such as a `precededBy` group, so the sort point stays inside the match.
  const add = (statement: any, startIndex: number, endIndex: number) => {
    statement._startIndex = startIndex;
    statement._endIndex = endIndex;
    statement._line = getLineNumber(content, startIndex, lineStarts);
    statement.sortIndex = statement[1] ? Math.min(startIndex + statement[1].length, endIndex) : startIndex;
    statements.push(statement);
  };

  const inline: Record<string, any> = fileType.inlineStatements ?? {};
  for (const type of STATEMENT_TYPES) {
    for (const pattern of patternsOf(inline[type] ?? [])) {
      const re = safeRegExp(pattern, "g");
      if (!re) continue;
      for (const m of content.matchAll(re)) add(Object.assign(m, { type }), m.index!, m.index! + m[0].length);
    }
  }

  const markup: any[] = detectSteps ? fileType.markup ?? [] : [];
  const nodes = usesSelectors(fileType, detectSteps) ? parseFile(content, fileType, filePath, warn) : [];

  for (const entry of inline.in ?? []) {
    const container = entry === "comment" ? { comment: {} } : entry;
    const selector = selectorOf(container)!;
    for (const node of nodes) {
      const match = matchNode(node, selector);
      if (!match) continue;
      let text = container.value ? resolveField(container.value, match) ?? "" : mainText(node);
      if (container.regex) {
        const m = patternsOf(container.regex).map((p) => safeRegExp(p, "")?.exec(text)).find(Boolean);
        if (!m) continue;
        text = m[1] ?? m[0];
      }
      const parsed = parseStatementText(text);
      if (!parsed) continue;
      add({ 0: content.slice(node.startIndex, node.endIndex), 1: parsed.payload, type: parsed.type }, node.startIndex, node.endIndex);
    }
  }

  for (const def of markup) {
    const selector = selectorOf(def);
    // `batchMatches` combines a selector definition's matches, or each pattern's matches in a regex definition.
    const batches: any[][] = [];
    if (selector) {
      batches.push(
        selectMatches(def, selector, nodes).map((match) => {
          const values = def.captures
            ? def.captures.map((path: string) => resolveField(path, match))
            : match.groups
              ? [...match.groups].slice(1)
              : [mainText(match.node)];
          const source = match.groups?.[0] ?? content.slice(match.startIndex, match.endIndex);
          return Object.assign([source, ...values], { index: match.startIndex, end: match.endIndex });
        })
      );
    } else {
      for (const pattern of patternsOf(def.regex ?? [])) {
        const re = safeRegExp(pattern, "g");
        if (re) batches.push([...content.matchAll(re)].map((m) => Object.assign(m, { end: m.index! + m[0].length })));
      }
    }
    for (const found of batches) addMatches(def, found);
  }

  function addMatches(def: any, found: any[]) {
    if (found.length === 0) return;
    if (def.batchMatches) {
      // reduce, because spreading a very large batch into Math.min overflows the stack.
      const startIndex = found.reduce((min, m) => Math.min(min, m.index), Infinity);
      const endIndex = found.reduce((max, m) => Math.max(max, m.end), 0);
      const statement: any = { 1: found.map((m) => m[1] || m[0]).join("\n"), type: "detectedStep", markup: def };
      add(statement, startIndex, endIndex);
      // A batch sorts at its start, whatever its first value.
      statement.sortIndex = startIndex;
      return;
    }
    for (const m of found) add(Object.assign(m, { type: "detectedStep", markup: def }), m.index, m.end);
  }

  // A regex and a container can find the same statement. Keep one.
  const seen = new Set<string>();
  const unique = statements.filter((s) => {
    if (s.type === "detectedStep") return true;
    const key = `${s.type} ${s._startIndex} ${s._endIndex}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  return unique.sort((a, b) => a.sortIndex - b.sortIndex);
}
