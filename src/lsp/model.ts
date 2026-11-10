import { getNodeValue, printParseErrorCode } from "jsonc-parser";
import { isJsonUri, isYamlUri } from "./gate.js";
import {
  parseJsonTree,
  rangeForInstancePath,
  findActionKeyedSteps,
  OffsetRange,
  ActionKeyedStep,
} from "./json/positions.js";
import {
  parseYamlTree,
  yamlSyntaxErrors,
  rangeForInstancePathYaml,
  findActionKeyedStepsYaml,
} from "./yaml/positions.js";

/** A syntax error reduced to an offset span + message, format-agnostic. */
export interface SyntaxErrorSpan {
  range: OffsetRange;
  message: string;
}

/**
 * A format-agnostic view of a parsed spec/config buffer. JSON and YAML each
 * provide one; the diagnostics (and, later, inline) pipeline works against this
 * interface so the schema/action logic is written once.
 */
export interface SpecModel {
  /** The plain JS value (undefined for empty/unparseable buffers). */
  value: any;
  /** Syntax-error spans + messages (empty when the buffer parses cleanly). */
  syntaxErrors: SyntaxErrorSpan[];
  /** Source span for an AJV instancePath, or null if unlocatable. */
  rangeForPath(instancePath: string): OffsetRange | null;
  /** Steps written in the legacy `action`-keyed form. */
  actionKeyedSteps(): ActionKeyedStep[];
}

function buildJsonModel(text: string): SpecModel {
  const { root, errors } = parseJsonTree(text);
  return {
    value: root ? getNodeValue(root) : undefined,
    syntaxErrors: errors.map((e) => ({
      range: { start: e.offset, end: e.offset + e.length },
      message: `JSON syntax: ${printParseErrorCode(e.error)}`,
    })),
    rangeForPath: (path) => (root ? rangeForInstancePath(root, path) : null),
    actionKeyedSteps: () => (root ? findActionKeyedSteps(root) : []),
  };
}

function buildYamlModel(text: string): SpecModel {
  const { doc, value, valueError } = parseYamlTree(text);
  const syntaxErrors: SyntaxErrorSpan[] = yamlSyntaxErrors(doc).map((e) => ({
    range: e.range,
    message: `YAML syntax: ${e.message}`,
  }));
  // A `toJS()` failure (e.g. an alias bomb) has no single node to blame; anchor
  // it at the document start so the author still sees the problem.
  if (valueError) {
    syntaxErrors.push({
      range: { start: 0, end: Math.min(text.length, 1) },
      message: `YAML error: ${valueError}`,
    });
  }
  return {
    value,
    syntaxErrors,
    rangeForPath: (path) => rangeForInstancePathYaml(doc, path),
    actionKeyedSteps: () => findActionKeyedStepsYaml(doc),
  };
}

/**
 * Build the right model for a buffer by extension, or null for an unsupported
 * one. Callers gate on the classifier separately (spec vs config).
 */
export function buildModel(uri: string, text: string): SpecModel | null {
  if (isJsonUri(uri)) return buildJsonModel(text);
  if (isYamlUri(uri)) return buildYamlModel(text);
  return null;
}
