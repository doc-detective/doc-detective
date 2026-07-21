/**
 * Inline-statement extraction from semantic nodes, and conversion of
 * selector/statement matches into the match-shaped objects the parseContent
 * state machine consumes (numeric keys + type/sortIndex/_startIndex/
 * _endIndex/_line, mirroring RegExpMatchArray-based statements).
 */

import { SemanticNode } from "./types.js";
import {
  getSelectorDefinition,
  matchSelector,
  resolveCaptures,
  resolveFieldPath,
} from "./selectors.js";

export type StatementType =
  | "testStart"
  | "testEnd"
  | "ignoreStart"
  | "ignoreEnd"
  | "step";

/**
 * The normalized statement grammar. One grammar for every container —
 * wrapper syntax (comment markers, quote variants) is already gone by the
 * time text reaches here. Payload handling mirrors the legacy regexes:
 * keyword-adjacent text becomes a payload that downstream parseObject
 * accepts or drops.
 */
export function parseStatementText(
  text: string | undefined
): { type: StatementType; payload: string } | null {
  const s = String(text ?? "").trim();
  let m: RegExpExecArray | null;
  if (/^test ignore start$/.test(s)) return { type: "ignoreStart", payload: "" };
  if (/^test ignore end$/.test(s)) return { type: "ignoreEnd", payload: "" };
  if ((m = /^test end\s*([\s\S]*)$/.exec(s))) {
    return { type: "testEnd", payload: m[1].trim() };
  }
  if ((m = /^test(?:\s+start\b)?\s*([\s\S]*)$/.exec(s))) {
    return { type: "testStart", payload: m[1].trim() };
  }
  if ((m = /^step\s*([\s\S]*)$/.exec(s))) {
    return { type: "step", payload: m[1].trim() };
  }
  return null;
}

/**
 * Legacy sortIndex convention: statements with a first capture sort at
 * start + capture length; others at their start.
 */
function sortIndexFor(startIndex: number, firstCapture: string): number {
  return firstCapture ? startIndex + firstCapture.length : startIndex;
}

export interface StatementBuildInput {
  nodes: SemanticNode[];
  content: string;
  getLine: (index: number) => number;
}

/**
 * Extracts inline statements from declared statement containers
 * (`inlineStatements.in`).
 */
export function selectorContainerStatements({
  containers,
  nodes,
  content,
  getLine,
}: StatementBuildInput & { containers: any[] }): any[] {
  const statements: any[] = [];
  const ctx = { content, nodes };
  for (const entry of containers) {
    let kind, options: Record<string, any>, valuePath: string | undefined;
    if (entry === "comment") {
      kind = "comment" as const;
      options = {};
    } else {
      const def = getSelectorDefinition(entry);
      if (!def) continue;
      kind = def.kind;
      options = def.options;
      valuePath = typeof entry.value === "string" ? entry.value : undefined;
    }
    for (const node of nodes) {
      for (const match of matchSelector(node, kind, options, ctx)) {
        const text = valuePath
          ? resolveFieldPath(valuePath, match)
          : node.content ?? node.text ?? "";
        const parsed = parseStatementText(text);
        if (!parsed) continue;
        statements.push({
          0: content.slice(match.startIndex, match.endIndex),
          1: parsed.payload,
          type: parsed.type,
          sortIndex: sortIndexFor(match.startIndex, parsed.payload),
          _startIndex: match.startIndex,
          _endIndex: match.endIndex,
          _line: getLine(match.startIndex),
        });
      }
    }
  }
  return statements;
}

/**
 * Runs selector-mode markup definitions against the semantic nodes and
 * emits detectedStep statements (regex-mode definitions are handled by the
 * legacy matcher and skipped here).
 */
export function selectorMarkupStatements({
  markup,
  nodes,
  content,
  getLine,
}: StatementBuildInput & { markup: any[] }): any[] {
  const statements: any[] = [];
  const ctx = { content, nodes };
  for (const def of markup) {
    const selector = getSelectorDefinition(def);
    if (!selector) continue;
    const matches: Array<{ match: any; captures: Array<string | undefined> }> = [];
    for (const node of nodes) {
      for (const match of matchSelector(node, selector.kind, selector.options, ctx)) {
        matches.push({
          match,
          captures: resolveCaptures(def.captures, selector.kind, match),
        });
      }
    }
    if (matches.length === 0) continue;
    if (def.batchMatches) {
      const startIndex = Math.min(...matches.map((m) => m.match.startIndex));
      const endIndex = Math.max(...matches.map((m) => m.match.endIndex));
      statements.push({
        1: matches
          .map(
            (m) =>
              m.captures[0] ||
              content.slice(m.match.startIndex, m.match.endIndex)
          )
          .join("\n"),
        type: "detectedStep",
        markup: def,
        sortIndex: startIndex,
        _startIndex: startIndex,
        _endIndex: endIndex,
        _line: getLine(startIndex),
      });
      continue;
    }
    for (const { match, captures } of matches) {
      const statement: any = {
        0: content.slice(match.startIndex, match.endIndex),
        type: "detectedStep",
        markup: def,
        _startIndex: match.startIndex,
        _endIndex: match.endIndex,
        _line: getLine(match.startIndex),
      };
      captures.forEach((value, i) => {
        statement[i + 1] = value;
      });
      statement.sortIndex = sortIndexFor(match.startIndex, statement[1] ?? "");
      statements.push(statement);
    }
  }
  return statements;
}
