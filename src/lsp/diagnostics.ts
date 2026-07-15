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

/** Diagnostic `source` label shown in the editor gutter/problems panel. */
export const DIAGNOSTIC_SOURCE = "doc-detective";

/**
 * The flagship message: the single most common Doc Detective authoring mistake
 * gets one clear diagnostic instead of the wall of `anyOf` failures the raw
 * schema produces. Mirrors the plugin's write-blocking hook. Fires only on
 * an INVALID document — a valid legacy v2 spec gets the softer deprecation
 * warning below instead.
 */
export const ACTION_KEYED_MESSAGE =
  'The action name is the key: write `{"goTo": …}`, not an object with an "action" property. ' +
  'Each step is `{"<action>": <value>}`.';

/**
 * The version-mixing nudge: a document that is *valid* but uses the legacy v2
 * `action`-keyed step form gets a non-blocking warning steering it to the
 * compact v3 form.
 */
export const V2_DEPRECATION_MESSAGE =
  'Legacy v2 step form. Prefer the compact v3 form — the action name is the key, e.g. `{"goTo": …}`.';

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

export function schemaMessage(error: {
  message?: string;
  keyword?: string;
  params?: Record<string, any>;
}): string {
  const base = error.message || "does not match the schema";
  const params = error.params || {};
  if (error.keyword === "additionalProperties" && params.additionalProperty) {
    return `${base}: "${params.additionalProperty}"`;
  }
  if (error.keyword === "required" && params.missingProperty) {
    return `${base}`;
  }
  return base;
}

/**
 * Compute all diagnostics for a document. Pure over (uri, text): no filesystem,
 * no network. Handles JSON and YAML specs/configs. Returns `[]` for anything the
 * detection gate doesn't recognize and for empty/unparseable buffers (beyond
 * the syntax errors themselves).
 */
export function computeDiagnostics(doc: TextDocument): Diagnostic[] {
  const text = doc.getText();
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
