import {
  CompletionItem,
  CompletionItemKind,
  InsertTextFormat,
  MarkupKind,
  TextEdit,
} from "vscode-languageserver";
import type { Position } from "vscode-languageserver";
import type { TextDocument } from "vscode-languageserver-textdocument";
import { getLocation, type Node } from "jsonc-parser";
import { classifyDocument, isJsonUri } from "./gate.js";
import { getRegistry, ActionInfo, ActionField, PrimitiveKind } from "./registry.js";

type JsonPath = Array<string | number>;

/**
 * Cursor is at a step-object key position: `…/steps/<index>/<partialKey>`.
 * Offers action-key completions.
 */
export function isStepKeyContext(path: JsonPath): boolean {
  const n = path.length;
  return (
    n >= 3 &&
    typeof path[n - 1] === "string" &&
    typeof path[n - 2] === "number" &&
    path[n - 3] === "steps"
  );
}

/**
 * Cursor is at a key position inside an action object:
 * `…/steps/<index>/<actionKey>/<partialKey>`. Returns the action key, or null.
 */
export function actionFieldContext(path: JsonPath): string | null {
  const n = path.length;
  if (
    n >= 4 &&
    typeof path[n - 1] === "string" &&
    typeof path[n - 2] === "string" &&
    typeof path[n - 3] === "number" &&
    path[n - 4] === "steps"
  ) {
    return path[n - 2] as string;
  }
  return null;
}

/**
 * The value placeholder inserted after an action key. Quotes the tab-stop only
 * for string scalars — a numeric (`wait`) or boolean (`stopRecord`) action gets
 * a bare placeholder so the starter isn't schema-invalid; object-only actions
 * get a brace body.
 */
function valueSnippet(primitiveKind: PrimitiveKind): string {
  if (primitiveKind === "string") return '"$1"';
  if (primitiveKind === "number" || primitiveKind === "boolean") return "$1";
  return "{\n\t$1\n}";
}

/** A Markdown documentation payload, or undefined when there's no text. */
export function markdownDoc(
  text: string | undefined,
): { kind: MarkupKind; value: string } | undefined {
  return text ? { kind: MarkupKind.Markdown, value: text } : undefined;
}

/** Build a snippet TextEdit that replaces the partial key node, if present. */
function keyTextEdit(
  doc: TextDocument,
  previousNode: Node | undefined,
  insertText: string,
): { textEdit?: TextEdit; insertText?: string } {
  // When the cursor is on a partial key, jsonc reports the enclosing node whose
  // span covers the key (and any `:value` already typed). We're gated on
  // isAtPropertyKey, so replacing that whole span with the snippet avoids
  // doubled quotes and leftover `:` fragments.
  if (previousNode) {
    const start = doc.positionAt(previousNode.offset);
    const end = doc.positionAt(previousNode.offset + previousNode.length);
    return { textEdit: TextEdit.replace({ start, end }, insertText) };
  }
  // Truly empty object (`{}`): no key token to replace — insert at the cursor.
  return { insertText };
}

function actionItem(
  action: ActionInfo,
  doc: TextDocument,
  previousNode: Node | undefined,
): CompletionItem {
  const insert = `"${action.key}": ${valueSnippet(action.primitiveKind)}`;
  const edit = keyTextEdit(doc, previousNode, insert);
  return {
    label: action.key,
    kind: CompletionItemKind.Property,
    detail: action.title,
    documentation: markdownDoc(action.description),
    insertTextFormat: InsertTextFormat.Snippet,
    ...edit,
  };
}

function fieldItem(
  field: ActionField,
  doc: TextDocument,
  previousNode: Node | undefined,
): CompletionItem {
  const insert = `"${field.name}": $1`;
  const edit = keyTextEdit(doc, previousNode, insert);
  return {
    label: field.name,
    kind: CompletionItemKind.Field,
    documentation: markdownDoc(field.description),
    insertTextFormat: InsertTextFormat.Snippet,
    ...edit,
  };
}

/**
 * Compute completions at a position. Phase 2: action-key completion inside a
 * `steps` element, and field-name completion inside a known action's object.
 * Spec documents only, JSON only, key positions only.
 */
export function computeCompletions(
  doc: TextDocument,
  position: Position,
): CompletionItem[] {
  const text = doc.getText();
  if (classifyDocument({ uri: doc.uri, text }) !== "spec") return [];
  if (!isJsonUri(doc.uri)) return [];

  const offset = doc.offsetAt(position);
  const location = getLocation(text, offset);
  if (!location.isAtPropertyKey) return [];

  const registry = getRegistry();
  const previousNode = location.previousNode;

  if (isStepKeyContext(location.path)) {
    return registry.actions.map((a) => actionItem(a, doc, previousNode));
  }

  const actionKey = actionFieldContext(location.path);
  if (actionKey) {
    const action = registry.byKey.get(actionKey);
    if (action) {
      return action.fields.map((f) => fieldItem(f, doc, previousNode));
    }
  }

  return [];
}
