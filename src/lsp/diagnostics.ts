import {
  Diagnostic,
  DiagnosticSeverity,
  Range,
} from "vscode-languageserver";
import type { TextDocument } from "vscode-languageserver-textdocument";
import { parse as parseJsoncValue, printParseErrorCode } from "jsonc-parser";
import { validate } from "../common/src/validate.js";
import { classifyDocument, basenameFromUri, DocClass } from "./gate.js";
import {
  parseJsonTree,
  rangeForInstancePath,
  findActionKeyedSteps,
  OffsetRange,
} from "./json/positions.js";

/** Diagnostic `source` label shown in the editor gutter/problems panel. */
export const DIAGNOSTIC_SOURCE = "doc-detective";

/**
 * The flagship message: the single most common Doc Detective authoring mistake
 * gets one clear diagnostic instead of the wall of `anyOf` failures the raw
 * schema produces. Mirrors the plugin's write-blocking hook.
 */
export const ACTION_KEYED_MESSAGE =
  'The action name is the key: write `{"goTo": …}`, not an object with an "action" property. ' +
  'Each step is `{"<action>": <value>}`.';

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

/** Phase 1 handles JSON only; YAML specs are classified but validated later. */
function isJsonDocument(uri: string): boolean {
  return basenameFromUri(uri).endsWith(".json");
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
 * no network. Returns `[]` for anything the detection gate doesn't recognize,
 * for non-JSON in Phase 1, and for empty/unparseable buffers (beyond the JSON
 * syntax errors themselves).
 */
export function computeDiagnostics(doc: TextDocument): Diagnostic[] {
  const text = doc.getText();
  const cls = classifyDocument({ uri: doc.uri, text });
  if (!cls) return [];
  if (!isJsonDocument(doc.uri)) return [];

  const { root, errors: syntaxErrors } = parseJsonTree(text);

  // Surface JSON syntax errors ourselves: because the plugin maps specs to a
  // dedicated language id, the editor's built-in JSON service may not run.
  const diagnostics: Diagnostic[] = syntaxErrors.map((e) => ({
    severity: DiagnosticSeverity.Error,
    range: offsetRangeToLspRange(doc, { start: e.offset, end: e.offset + e.length }),
    message: `JSON syntax: ${printParseErrorCode(e.error)}`,
    source: DIAGNOSTIC_SOURCE,
  }));

  if (!root) return diagnostics;

  const value = parseJsoncValue(text, [], { allowTrailingComma: true });
  if (!value || typeof value !== "object") return diagnostics;

  // Flag action-keyed steps up front and collect their pointers so we can
  // suppress the schema's raw anyOf noise for those same steps.
  const actionKeyed = findActionKeyedSteps(root);
  const suppressedPointers = actionKeyed.map((a) => a.pointer);

  const result = validate({
    schemaKey: SCHEMA_FOR_CLASS[cls],
    object: value,
    addDefaults: false,
    structuredErrors: true,
  });

  if (!result.valid && result.errorObjects) {
    for (const error of result.errorObjects) {
      const instancePath = error.instancePath || "";
      if (isSuppressedByActionKeyed(instancePath, error.keyword, suppressedPointers)) {
        continue;
      }
      const offsetRange = rangeForInstancePath(root, instancePath);
      /* c8 ignore next - rangeForInstancePath always resolves to at least the root for a parsed tree */
      if (!offsetRange) continue;
      diagnostics.push({
        severity: DiagnosticSeverity.Error,
        range: offsetRangeToLspRange(doc, offsetRange),
        message: schemaMessage(error),
        source: DIAGNOSTIC_SOURCE,
      });
    }
  }

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
