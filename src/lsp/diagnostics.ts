import {
  Diagnostic,
  DiagnosticSeverity,
  Range,
} from "vscode-languageserver";
import type { TextDocument } from "vscode-languageserver-textdocument";
import { validate } from "../common/src/validate.js";
import { classifyDocument, DocClass } from "./gate.js";
import type { OffsetRange } from "./json/positions.js";
import { buildModel } from "./model.js";
import { fileTypeForUri, computeInlineDiagnostics } from "./inline.js";
import {
  DIAGNOSTIC_SOURCE,
  ACTION_KEYED_MESSAGE,
  V2_DEPRECATION_MESSAGE,
  schemaMessage,
} from "./messages.js";

// Re-exported so existing importers (and tests) keep a single entry point.
export {
  DIAGNOSTIC_SOURCE,
  ACTION_KEYED_MESSAGE,
  V2_DEPRECATION_MESSAGE,
  schemaMessage,
};

const SCHEMA_FOR_CLASS: Record<Exclude<DocClass, null>, string> = {
  spec: "spec_v3",
  config: "config_v3",
};

function offsetRangeToLspRange(doc: TextDocument, range: OffsetRange): Range {
  return {
    start: doc.positionAt(range.start),
    end: doc.positionAt(range.end),
  };
}

/**
 * Is `instancePath` inside (or equal to) the step at `pointer`? Used to drop
 * the raw `anyOf` schema errors for a step we've already explained with the
 * friendly action-keyed diagnostic.
 */
function isUnderPointer(instancePath: string, pointer: string): boolean {
  return instancePath === pointer || instancePath.startsWith(pointer + "/");
}

/** Is `pointer` inside (or equal to) `instancePath`? (The inverse relation.) */
function pointerIsUnder(pointer: string, instancePath: string): boolean {
  return pointer === instancePath || pointer.startsWith(instancePath + "/");
}

/**
 * Should this schema error be dropped because an action-keyed step already
 * explains it? Two cases: (1) the error sits at/under the offending step, or
 * (2) it's a vague container `anyOf`/`oneOf` failure on an *ancestor* of that
 * step — the propagation of the same problem up to the test/spec level, which
 * says only "must match a schema in anyOf" and is useless next to the precise
 * action-keyed diagnostic.
 */
export function isSuppressedByActionKeyed(
  instancePath: string,
  keyword: string | undefined,
  suppressedPointers: string[],
): boolean {
  return suppressedPointers.some((pointer) => {
    if (isUnderPointer(instancePath, pointer)) return true;
    if (
      (keyword === "anyOf" || keyword === "oneOf") &&
      pointerIsUnder(pointer, instancePath)
    ) {
      return true;
    }
    return false;
  });
}


/**
 * Compute all diagnostics for a document. Pure over (uri, text): no filesystem,
 * no network. Handles JSON and YAML specs/configs. Returns `[]` for anything the
 * detection gate doesn't recognize and for empty/unparseable buffers (beyond
 * the syntax errors themselves).
 */
export function computeDiagnostics(doc: TextDocument): Diagnostic[] {
  const text = doc.getText();

  // Markup files (markdown/asciidoc/html/dita) carry tests inline, not as a
  // whole-file spec — route them to the inline pipeline. Naturally silent on
  // files without any Doc Detective statements.
  const markupFileType = fileTypeForUri(doc.uri);
  if (markupFileType) return computeInlineDiagnostics(doc, markupFileType);

  const cls = classifyDocument({ uri: doc.uri, text });
  if (!cls) return [];

  const model = buildModel(doc.uri, text);
  /* c8 ignore next - classify only returns non-null for .json/.yaml/.yml, which buildModel handles */
  if (!model) return [];

  // Surface syntax errors ourselves: because the plugin maps specs to a
  // dedicated language id, the editor's built-in JSON/YAML service may not run.
  const diagnostics: Diagnostic[] = model.syntaxErrors.map((e) => ({
    severity: DiagnosticSeverity.Error,
    range: offsetRangeToLspRange(doc, e.range),
    message: e.message,
    source: DIAGNOSTIC_SOURCE,
  }));

  // A syntactically broken buffer can't be meaningfully schema-checked — the
  // partial value produces misleading "must be object" noise. Show the syntax
  // errors; schema diagnostics reappear once the document parses cleanly.
  if (diagnostics.length > 0) return diagnostics;

  const value = model.value;
  if (!value || typeof value !== "object") return diagnostics;

  // Flag action-keyed steps up front and collect their pointers so we can
  // suppress the schema's raw anyOf noise for those same steps.
  const actionKeyed = model.actionKeyedSteps();
  const suppressedPointers = actionKeyed.map((a) => a.pointer);

  const result = validate({
    schemaKey: SCHEMA_FOR_CLASS[cls],
    object: value,
    addDefaults: false,
    structuredErrors: true,
  });

  // A valid document: no errors. A legacy v2 spec whose steps are `action`-keyed
  // transforms to a valid spec_v3 — don't error on it, but nudge toward v3 with
  // a non-blocking deprecation warning.
  if (result.valid) {
    for (const step of actionKeyed) {
      diagnostics.push({
        severity: DiagnosticSeverity.Warning,
        range: offsetRangeToLspRange(doc, step.keyRange),
        message: V2_DEPRECATION_MESSAGE,
        source: DIAGNOSTIC_SOURCE,
        code: "legacy-v2-step",
      });
    }
    return diagnostics;
  }

  if (result.errorObjects) {
    for (const error of result.errorObjects) {
      const instancePath = error.instancePath || "";
      if (isSuppressedByActionKeyed(instancePath, error.keyword, suppressedPointers)) {
        continue;
      }
      const offsetRange = model.rangeForPath(instancePath);
      /* c8 ignore next - rangeForPath always resolves to at least the root for a parsed tree */
      if (!offsetRange) continue;
      diagnostics.push({
        severity: DiagnosticSeverity.Error,
        range: offsetRangeToLspRange(doc, offsetRange),
        message: schemaMessage(error),
        source: DIAGNOSTIC_SOURCE,
      });
    }
  }

  // Invalid document: the offending action-keyed steps get the flagship error.
  for (const step of actionKeyed) {
    diagnostics.push({
      severity: DiagnosticSeverity.Error,
      range: offsetRangeToLspRange(doc, step.keyRange),
      message: ACTION_KEYED_MESSAGE,
      source: DIAGNOSTIC_SOURCE,
      code: "action-keyed-step",
    });
  }

  return diagnostics;
}
