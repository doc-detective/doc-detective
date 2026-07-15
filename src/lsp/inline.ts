import {
  Diagnostic,
  DiagnosticSeverity,
  type Range,
} from "vscode-languageserver";
import type { TextDocument } from "vscode-languageserver-textdocument";
import { validate } from "../common/src/validate.js";
import { parseObject } from "../common/src/detectTests.js";
import { defaultFileTypes, type FileType } from "../common/src/fileTypes.js";
import { basenameFromUri } from "./gate.js";
import { getRegistry } from "./registry.js";
import { pointerFromPath, type OffsetRange } from "./json/positions.js";
import {
  DIAGNOSTIC_SOURCE,
  ACTION_KEYED_MESSAGE,
  V2_DEPRECATION_MESSAGE,
  schemaMessage,
} from "./messages.js";

/**
 * The fileTypes whose inline test statements we understand, keyed for lookup by
 * extension. Derived from the runner's own `defaultFileTypes` so the detection
 * patterns can never drift from what the runner parses.
 */
const MARKUP_FILE_TYPES: FileType[] = [
  defaultFileTypes.markdown,
  defaultFileTypes.asciidoc,
  defaultFileTypes.html,
  defaultFileTypes.dita,
].filter(Boolean) as FileType[];

/** Find the fileType whose extensions match this URI, or null. */
export function fileTypeForUri(uri: string): FileType | null {
  const name = basenameFromUri(uri);
  for (const fileType of MARKUP_FILE_TYPES) {
    /* c8 ignore next - every default fileType has extensions; `|| []` guards custom ones */
    for (const ext of fileType.extensions || []) {
      if (name.endsWith(`.${ext.toLowerCase()}`)) return fileType;
    }
  }
  return null;
}

/** A raw inline statement: its parsed payload and the payload's source span. */
interface InlineStatement {
  payload: any;
  /** Whether parseObject could turn the captured text into an object. */
  parsed: boolean;
  range: OffsetRange;
}

/** Compile a pattern with the global + hasIndices flags, or null if invalid. */
/* c8 ignore start - the runner's own patterns always compile; the catch guards malformed custom fileType patterns */
function compilePattern(pattern: string): RegExp | null {
  try {
    return new RegExp(pattern, "gd");
  } catch {
    return null;
  }
}
/* c8 ignore stop */

/** Offset spans of `ignoreStart`…`ignoreEnd` regions, to skip statements in. */
function ignoreRanges(text: string, fileType: FileType): OffsetRange[] {
  const starts = collectMatchOffsets(text, fileType.inlineStatements?.ignoreStart);
  const ends = collectMatchOffsets(text, fileType.inlineStatements?.ignoreEnd);
  const ranges: OffsetRange[] = [];
  for (const start of starts) {
    // Pair each ignoreStart with the next ignoreEnd after it; if none, ignore to
    // end of document.
    const end = ends.find((e) => e >= start);
    ranges.push({ start, end: end ?? text.length });
  }
  return ranges;
}

function collectMatchOffsets(text: string, patterns?: string[]): number[] {
  const offsets: number[] = [];
  for (const pattern of patterns || []) {
    const re = compilePattern(pattern);
    /* c8 ignore next - compilePattern only returns null for an invalid custom pattern */
    if (!re) continue;
    let m: RegExpExecArray | null;
    while ((m = re.exec(text))) offsets.push(m.index);
  }
  return offsets.sort((a, b) => a - b);
}

/** Extract statements of one kind (testStart / step) with payloads + spans. */
function extractStatements(
  text: string,
  patterns: string[] | undefined,
  ignore: OffsetRange[],
): InlineStatement[] {
  const out: InlineStatement[] = [];
  for (const pattern of patterns || []) {
    const re = compilePattern(pattern);
    /* c8 ignore next - compilePattern only returns null for an invalid custom pattern */
    if (!re) continue;
    let m: RegExpExecArray | null;
    while ((m = re.exec(text))) {
      if (ignore.some((r) => m!.index >= r.start && m!.index < r.end)) continue;
      const group = (m as any).indices?.[1] as [number, number] | undefined;
      const range: OffsetRange = group
        ? { start: group[0], end: group[1] }
        : /* c8 ignore next - hasIndices is always present under the 'd' flag */
          { start: m.index, end: m.index + m[0].length };
      /* c8 ignore next - capture group 1 is always present in the statement patterns */
      const raw = m[1] ?? "";
      const payload = parseObject({ stringifiedObject: raw });
      out.push({ payload, parsed: payload !== null && typeof payload === "object", range });
    }
  }
  return out;
}

/** Drop the "must have steps or contexts" errors so an open statement (which
 * legitimately carries neither — later statements supply the steps) isn't
 * falsely flagged. Everything else in the open statement is still validated. */
function isStepsOrContextsRequirement(error: {
  instancePath?: string;
  keyword?: string;
  params?: Record<string, any>;
}): boolean {
  if (error.instancePath) return false; // only the top-level requirement
  if (error.keyword === "anyOf") return true;
  if (
    error.keyword === "required" &&
    ["steps", "contexts"].includes(error.params?.missingProperty)
  ) {
    return true;
  }
  return false;
}

function toLspRange(doc: TextDocument, range: OffsetRange): Range {
  return { start: doc.positionAt(range.start), end: doc.positionAt(range.end) };
}

/** Validate a `step` fragment and produce its diagnostics. */
function diagnoseStep(doc: TextDocument, stmt: InlineStatement): Diagnostic[] {
  if (!stmt.parsed) return [];
  const payload = stmt.payload;
  const range = toLspRange(doc, stmt.range);
  const isActionKeyed = "action" in payload;

  const result = validate({
    schemaKey: "step_v3",
    object: payload,
    addDefaults: false,
    structuredErrors: true,
  });

  if (result.valid) {
    // A valid v2 (action-keyed) step: deprecation warning, mirroring specs.
    if (isActionKeyed) return [warn(range, V2_DEPRECATION_MESSAGE, "legacy-v2-step")];
    return [];
  }
  if (isActionKeyed) {
    return [error(range, ACTION_KEYED_MESSAGE, "action-keyed-step")];
  }

  // A single invalid step matches no `anyOf` branch, so AJV reports a failure
  // for EVERY action — dozens of "must have required property …". Collapse that
  // wall: if the author clearly intended one action (a top-level key that is a
  // known action), show only that action's own value errors; otherwise a single
  // "not a recognized step" message.
  const registry = getRegistry();
  const actionKey = Object.keys(payload).find((k) => registry.byKey.has(k));
  if (!actionKey) {
    return [
      error(range, 'Not a recognized Doc Detective step (expected `{"<action>": …}`).'),
    ];
  }
  const prefix = pointerFromPath([actionKey]);
  /* c8 ignore next - errorObjects is always set here (structuredErrors: true) */
  const relevant = (result.errorObjects || []).filter((e) =>
    (e.instancePath || "").startsWith(prefix),
  );
  // One concise diagnostic per step — the action's value can fail several
  // internal branches (e.g. goTo accepts a URL string OR an object), and
  // surfacing all of them is noise. Show the first, most specific message.
  if (relevant.length === 0) {
    return [error(range, `Invalid "${actionKey}" step.`)];
  }
  return [error(range, `${actionKey}: ${schemaMessage(relevant[0])}`)];
}

/** Validate a `test` open fragment (relaxed: steps/contexts not required). */
function diagnoseTestOpen(doc: TextDocument, stmt: InlineStatement): Diagnostic[] {
  if (!stmt.parsed) return [];
  const result = validate({
    schemaKey: "test_v3",
    object: stmt.payload,
    addDefaults: false,
    structuredErrors: true,
  });
  if (result.valid) return [];
  const range = toLspRange(doc, stmt.range);
  /* c8 ignore next - errorObjects is always set here (structuredErrors: true) */
  return (result.errorObjects || [])
    .filter((e) => !isStepsOrContextsRequirement(e))
    .map((e) => error(range, schemaMessage(e)));
}

function error(range: Range, message: string, code?: string): Diagnostic {
  return { severity: DiagnosticSeverity.Error, range, message, source: DIAGNOSTIC_SOURCE, code };
}
function warn(range: Range, message: string, code?: string): Diagnostic {
  return { severity: DiagnosticSeverity.Warning, range, message, source: DIAGNOSTIC_SOURCE, code };
}

/**
 * Compute diagnostics for inline Doc Detective test statements embedded in a
 * markup document (markdown/asciidoc/html/dita, or a config fileType). Only the
 * `test` open and `step` statement regions the runner recognizes get language
 * features — the rest of the prose is left alone.
 */
export function computeInlineDiagnostics(
  doc: TextDocument,
  fileType: FileType,
): Diagnostic[] {
  const text = doc.getText();
  const ignore = ignoreRanges(text, fileType);
  const statements = fileType.inlineStatements || {};

  const diagnostics: Diagnostic[] = [];
  for (const stmt of extractStatements(text, statements.testStart, ignore)) {
    diagnostics.push(...diagnoseTestOpen(doc, stmt));
  }
  for (const stmt of extractStatements(text, statements.step, ignore)) {
    diagnostics.push(...diagnoseStep(doc, stmt));
  }
  return diagnostics;
}
