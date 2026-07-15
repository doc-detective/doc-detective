import { MarkupKind, type Hover, type Position } from "vscode-languageserver";
import type { TextDocument } from "vscode-languageserver-textdocument";
import { findNodeAtOffset, parseTree, type Node } from "jsonc-parser";
import { classifyDocument, basenameFromUri } from "./gate.js";
import { getRegistry } from "./registry.js";

/**
 * Is `keyNode` the key of a property that is a direct child of a `steps`
 * array element? Walks: string(key) → property → object(step) → array →
 * property("steps"). Returns true only for an action key on a step.
 */
function isStepPropertyKey(keyNode: Node): boolean {
  const property = keyNode.parent;
  if (
    !property ||
    property.type !== "property" ||
    property.children?.[0] !== keyNode
  ) {
    return false;
  }
  const stepObject = property.parent;
  const array = stepObject?.parent;
  const arrayProperty = array?.parent;
  return (
    array?.type === "array" &&
    arrayProperty?.type === "property" &&
    arrayProperty.children?.[0]?.value === "steps"
  );
}

/**
 * Hover over an action key (a step's `"goTo"`, `"find"`, …) surfaces that
 * action's description straight from the schema — one source of truth, no
 * hand-written copies. Spec + JSON only.
 */
export function computeHover(doc: TextDocument, position: Position): Hover | null {
  const text = doc.getText();
  if (classifyDocument({ uri: doc.uri, text }) !== "spec") return null;
  if (!basenameFromUri(doc.uri).endsWith(".json")) return null;

  const root = parseTree(text);
  if (!root) return null;

  const offset = doc.offsetAt(position);
  const node = findNodeAtOffset(root, offset);
  if (!node || node.type !== "string" || !isStepPropertyKey(node)) return null;

  const action = getRegistry().byKey.get(node.value as string);
  if (!action) return null;

  const parts = [`**${action.title}**`];
  if (action.description) parts.push("", action.description);

  return {
    contents: { kind: MarkupKind.Markdown, value: parts.join("\n") },
    range: {
      start: doc.positionAt(node.offset),
      end: doc.positionAt(node.offset + node.length),
    },
  };
}
