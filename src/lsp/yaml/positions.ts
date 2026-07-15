import YAML from "yaml";
import type { OffsetRange, ActionKeyedStep } from "../json/positions.js";
import { instancePathToSegments } from "../json/positions.js";

/** Result of parsing YAML: the document (for node lookups) plus its value. */
export interface YamlParse {
  doc: YAML.Document.Parsed;
  value: any;
}

/** Parse YAML into a position-preserving document plus its plain JS value. */
export function parseYamlTree(text: string): YamlParse {
  const doc = YAML.parseDocument(text, { keepSourceTokens: true });
  return { doc, value: doc.toJS() };
}

/** A YAML syntax error reduced to an offset span and message. */
export interface YamlSyntaxError {
  range: OffsetRange;
  message: string;
}

/** Collect YAML syntax errors as offset spans (empty when the doc is clean). */
export function yamlSyntaxErrors(doc: YAML.Document.Parsed): YamlSyntaxError[] {
  return doc.errors.map((error) => {
    const [start, end] = error.pos;
    return { range: { start, end }, message: error.message };
  });
}

/** Node range → OffsetRange, using [start, valueEnd] for a tight span. */
function nodeRange(node: any): OffsetRange | null {
  const range = node?.range;
  if (!Array.isArray(range)) return null;
  return { start: range[0], end: range[1] };
}

/**
 * Resolve the source span for an AJV `instancePath` in a YAML document. Walks
 * up to the nearest present ancestor (like the JSON resolver) so a
 * `required`-style error still anchors somewhere. Returns null only when even
 * the document contents can't be located.
 */
export function rangeForInstancePathYaml(
  doc: YAML.Document.Parsed,
  instancePath: string,
): OffsetRange | null {
  const segments = instancePathToSegments(instancePath);
  for (let end = segments.length; end >= 0; end--) {
    const node =
      end === 0 ? doc.contents : doc.getIn(segments.slice(0, end), true);
    const range = nodeRange(node);
    if (range) return range;
  }
  // Reached only for an empty document (no contents node has a range).
  return null;
}

function pointerFromSegments(segments: Array<string | number>): string {
  return (
    "/" +
    segments
      .map((s) => String(s).replace(/~/g, "~0").replace(/\//g, "~1"))
      .join("/")
  );
}

/**
 * Find every step written as a map carrying an `action` key inside a `steps`
 * sequence — the YAML twin of the JSON detector. Returns the offending `action`
 * key span and the step's JSON-Pointer.
 */
export function findActionKeyedStepsYaml(
  doc: YAML.Document.Parsed,
): ActionKeyedStep[] {
  const found: ActionKeyedStep[] = [];

  const visit = (node: any, path: Array<string | number>): void => {
    if (YAML.isMap(node)) {
      for (const pair of node.items as any[]) {
        const key = pair.key?.value;
        if (key === "steps" && YAML.isSeq(pair.value)) {
          collectSteps(pair.value, [...path, "steps"]);
        }
        if (pair.value) visit(pair.value, [...path, key]);
      }
    } else if (YAML.isSeq(node)) {
      node.items.forEach((item: any, index: number) =>
        visit(item, [...path, index]),
      );
    }
  };

  const collectSteps = (seq: any, seqPath: Array<string | number>): void => {
    seq.items.forEach((item: any, index: number) => {
      if (!YAML.isMap(item)) return;
      const actionPair = item.items.find((p: any) => p.key?.value === "action");
      if (actionPair) {
        const range = nodeRange(actionPair.key);
        if (range) {
          found.push({
            keyRange: range,
            pointer: pointerFromSegments([...seqPath, index]),
          });
        }
      }
    });
  };

  if (doc.contents) visit(doc.contents, []);
  return found;
}
