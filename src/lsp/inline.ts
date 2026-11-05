import {
  Diagnostic,
  DiagnosticSeverity,
  type Range,
} from "vscode-languageserver";
import type { TextDocument } from "vscode-languageserver-textdocument";
import { validate } from "../common/src/validate.js";
import { parseObject } from "../common/src/detectTests.js";
import { collectStatements } from "../common/src/detect/selectors.js";
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

/** Reads a collected statement's payload, and finds its span inside the statement. */
function toInlineStatement(text: string, statement: any): InlineStatement {
  // The runner parses the first value, else the whole match.
  const raw: string = statement[1] || statement[0];
  const payload = parseObject({ stringifiedObject: raw });
  const at = text.indexOf(raw, statement._startIndex);
  const range: OffsetRange =
    at >= 0 && at + raw.length <= statement._endIndex
      ? { start: at, end: at + raw.length }
      : /* c8 ignore next - a payload read from an attribute value can be decoded, so it isn't in the source */
        { start: statement._startIndex, end: statement._endIndex };
  return { payload, parsed: payload !== null && typeof payload === "object", range };
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
  // An unknown key sits beside the action, so the prefix filter below would miss it.
  const unknownKey = (result.errorObjects || []).find(
    (e) => e.keyword === "additionalProperties" && !e.instancePath,
  );
  if (unknownKey) return [error(range, schemaMessage(unknownKey))];
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
  const statements = collectStatements({
    content: text,
    fileType,
    filePath: basenameFromUri(doc.uri),
    detectSteps: false,
    warn: () => {},
  });

  // Walk statements in order, as parseContent does: an ignore block hides
  // steps, and ends at `test ignore end` or `test end`.
  const diagnostics: Diagnostic[] = [];
  let ignore = false;
  for (const statement of statements) {
    switch (statement.type) {
      case "ignoreStart":
        ignore = true;
        break;
      case "ignoreEnd":
      case "testEnd":
        ignore = false;
        break;
      case "testStart":
        diagnostics.push(...diagnoseTestOpen(doc, toInlineStatement(text, statement)));
        break;
      case "step":
        if (!ignore) diagnostics.push(...diagnoseStep(doc, toInlineStatement(text, statement)));
        break;
    }
  }
  return diagnostics;
}
