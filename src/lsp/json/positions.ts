import {
  parseTree,
  findNodeAtLocation,
  getNodePath,
  Node,
  ParseError,
} from "jsonc-parser";

/** A character-offset span into the source text (end-exclusive). */
export interface OffsetRange {
  start: number;
  end: number;
}

/** Result of parsing: the CST root (if any) plus lenient syntax errors. */
export interface JsonParse {
  root: Node | undefined;
  errors: ParseError[];
}

/**
 * Parse JSON(-with-comments) into a position-preserving CST. jsonc-parser is
 * tolerant of the half-typed, comma-trailing states an editor streams, and
 * collects syntax errors rather than throwing.
 */
export function parseJsonTree(text: string): JsonParse {
  const errors: ParseError[] = [];
  const root = parseTree(text, errors, {
    allowTrailingComma: true,
    disallowComments: false,
  });
  return { root, errors };
}

/**
 * Turn an AJV `instancePath` (`/tests/0/steps/1/goTo`) into path segments,
 * decoding the JSON-Pointer escapes (`~1`→`/`, `~0`→`~`) and numeric indices.
 */
export function instancePathToSegments(instancePath: string): Array<string | number> {
  if (!instancePath) return [];
  return instancePath
    .split("/")
    .slice(1)
    .map((seg) => {
      const unescaped = seg.replace(/~1/g, "/").replace(/~0/g, "~");
      return /^\d+$/.test(unescaped) ? Number(unescaped) : unescaped;
    });
}

/**
 * Resolve the source span for an AJV `instancePath`. When the exact node is
 * absent (e.g. a `required` error names an object whose child doesn't exist),
 * walks up to the nearest present ancestor so the diagnostic still anchors
 * somewhere sensible instead of vanishing. Returns `null` only when even the
 * root can't be located (unparseable input).
 */
export function rangeForInstancePath(
  root: Node,
  instancePath: string,
): OffsetRange | null {
  const segments = instancePathToSegments(instancePath);
  for (let end = segments.length; end >= 0; end--) {
    const node =
      end === 0 ? root : findNodeAtLocation(root, segments.slice(0, end));
    if (node) {
      return { start: node.offset, end: node.offset + node.length };
    }
  }
  /* c8 ignore next 2 - root is always locatable when this is called with a real tree */
  return null;
}

/** A step whose author used the `action`-as-value antipattern. */
export interface ActionKeyedStep {
  /** Span of the offending `"action"` key, for the squiggle. */
  keyRange: OffsetRange;
  /** JSON-Pointer to the step object, used to suppress its `anyOf` noise. */
  pointer: string;
}

function visit(node: Node, cb: (node: Node) => void): void {
  cb(node);
  if (node.children) {
    for (const child of node.children) visit(child, cb);
  }
}

/**
 * Build a JSON-Pointer from path segments, escaping `~`→`~0` and `/`→`~1` per
 * RFC 6901. Shared by the JSON and YAML action-keyed detectors.
 */
export function pointerFromPath(segments: Array<string | number>): string {
  /* c8 ignore next - defensive: callers pass a nested node's path, never the empty root path */
  if (segments.length === 0) return "";
  return (
    "/" +
    segments
      .map((s) => String(s).replace(/~/g, "~0").replace(/\//g, "~1"))
      .join("/")
  );
}

/**
 * Find every step written as an object carrying an `action` property inside a
 * `steps` array — the classic Doc Detective mistake (action name as a *value*
 * under `action`, instead of the compact action-as-key form). Returns the
 * `"action"` key span (to squiggle) and the step's JSON-Pointer (to suppress
 * the otherwise-overwhelming `anyOf` schema failures for that same step).
 */
export function findActionKeyedSteps(root: Node): ActionKeyedStep[] {
  const found: ActionKeyedStep[] = [];
  visit(root, (node) => {
    if (
      node.type !== "property" ||
      !node.children ||
      node.children[0]?.value !== "steps"
    ) {
      return;
    }
    const arr = node.children[1];
    if (arr?.type !== "array" || !arr.children) return;
    for (const el of arr.children) {
      if (el.type !== "object" || !el.children) continue;
      const actionProp = el.children.find(
        (p) => p.type === "property" && p.children?.[0]?.value === "action",
      );
      if (actionProp && actionProp.children) {
        const keyNode = actionProp.children[0];
        found.push({
          keyRange: { start: keyNode.offset, end: keyNode.offset + keyNode.length },
          pointer: pointerFromPath(getNodePath(el)),
        });
      }
    }
  });
  return found;
}
