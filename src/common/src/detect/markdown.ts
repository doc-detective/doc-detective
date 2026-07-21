/**
 * Markdown backend: parses CommonMark + GFM into semantic nodes via
 * mdast-util-from-markdown. Every node carries exact source offsets.
 *
 * Comment normalization: HTML comments (block and inline) and
 * `[comment]: #` definitions (all quote variants) all surface as `comment`
 * nodes, so one statement grammar replaces the per-wrapper regex variants.
 *
 * Attribute lists: mdast has no native Kramdown/Pandoc IAL support, so a
 * post-pass parses `{: .cls #id key="val"}` / `{.cls}` spans trailing images
 * and links (and brace groups in fence info strings) into `attributes`.
 */

import { fromMarkdown } from "mdast-util-from-markdown";
import { gfm } from "micromark-extension-gfm";
import { gfmFromMarkdown } from "mdast-util-gfm";
import { SemanticNode } from "./types.js";

const COMMENT_RE = /<!--([\s\S]*?)-->/g;
const IAL_RE = /^\s*\{([^}]*)\}/;
// One name branch with an OPTIONAL value tail (not name=value | bare-name
// alternation): overlapping alternatives on the same prefix backtrack
// polynomially on adversarial input (flagged by CodeQL js/polynomial-redos).
const IAL_TOKEN_RE =
  /([.#][^\s{}]+)|([A-Za-z_][\w.:-]*)(?:=(?:"([^"]*)"|'([^']*)'|([^\s{}]+)))?/g;
// Attribute-list spans are short; bounding the lookahead keeps the IAL
// post-pass O(1) per node instead of slicing to end-of-document.
const IAL_MAX_LOOKAHEAD = 300;

/**
 * Parses the inside of a Kramdown/Pandoc attribute list into an attributes
 * record: `.foo` → class (space-joined), `#bar` → id, `key=val` → named
 * attribute, bare word → `true`. Returns null when nothing parses.
 */
export function parseAttributeList(
  inner: string
): Record<string, string | true> | null {
  const body = inner.trim().replace(/^:\s*/, "");
  const attributes: Record<string, string | true> = {};
  let found = false;
  for (const m of body.matchAll(IAL_TOKEN_RE)) {
    found = true;
    if (m[1]) {
      const token = m[1];
      if (token.startsWith(".")) {
        const cls = token.slice(1);
        attributes.class = attributes.class
          ? `${attributes.class} ${cls}`
          : cls;
      } else {
        attributes.id = token.slice(1);
      }
    } else if (m[2]) {
      const value = m[3] ?? m[4] ?? m[5];
      attributes[m[2]] = value === undefined ? true : value;
    }
  }
  return found ? attributes : null;
}

/** Concatenated display text of an inline node's descendants. */
function inlineText(node: any): string {
  if (typeof node.value === "string") return node.value;
  if (Array.isArray(node.children)) {
    return node.children.map(inlineText).join("");
  }
  return "";
}

/** mdast node types that establish an inline (phrasing) context. */
const INLINE_CONTAINERS = new Set(["paragraph", "heading", "tableCell"]);

export function parseMarkdown(content: string): SemanticNode[] {
  const tree = fromMarkdown(content, {
    extensions: [gfm()],
    mdastExtensions: [gfmFromMarkdown()],
  });
  return collectNodes(content, tree);
}

/** Matches an expression whose entire body is one block comment. */
const EXPRESSION_COMMENT_RE = /^\/\*([\s\S]*?)\*\/$/;

/**
 * Shared mdast walker for the markdown and mdx backends. MDX node types
 * (expression comments, JSX elements, ESM statements) only occur in trees
 * parsed with the MDX extensions; plain markdown trees never produce them.
 */
export function collectNodes(content: string, tree: any): SemanticNode[] {
  const nodes: SemanticNode[] = [];
  let nextBlockId = 0;

  const offsetsOf = (node: any): [number, number] => [
    node.position.start.offset,
    node.position.end.offset,
  ];

  /** Emit comment nodes for every `<!-- -->` in an html node's raw source. */
  const emitComments = (node: any, blockId: number) => {
    const [start, end] = offsetsOf(node);
    const raw = content.slice(start, end);
    for (const m of raw.matchAll(COMMENT_RE)) {
      nodes.push({
        kind: "comment",
        startIndex: start + m.index!,
        endIndex: start + m.index! + m[0].length,
        content: m[1].trim(),
        precedingText: "",
        followingText: "",
        blockId,
      });
    }
  };

  /** Emit a comment node for an MDX `{/* … *​/}` expression, if it is one. */
  const emitExpressionComment = (node: any, blockId: number) => {
    // MDX expression nodes always carry a string value.
    const m = EXPRESSION_COMMENT_RE.exec(node.value.trim());
    if (!m) return;
    const [start, end] = offsetsOf(node);
    nodes.push({
      kind: "comment",
      startIndex: start,
      endIndex: end,
      content: m[1].trim(),
      precedingText: "",
      followingText: "",
      blockId,
    });
  };

  /** Emit an element node for a named MDX JSX element. */
  const emitJsxElement = (node: any, blockId: number) => {
    if (!node.name) return; // fragments (<>…</>) have no name
    const [start, end] = offsetsOf(node);
    const attributes: Record<string, string | true> = {};
    let hasAttributes = false;
    // mdast-util-mdx always materializes the attributes array.
    for (const attr of node.attributes) {
      // Spread attributes ({...props}) carry no static name/value.
      if (attr.type !== "mdxJsxAttribute") continue;
      hasAttributes = true;
      if (attr.value == null) {
        attributes[attr.name] = true;
      } else if (typeof attr.value === "string") {
        attributes[attr.name] = attr.value;
      } else {
        // mdxJsxAttributeValueExpression — expose the expression source.
        attributes[attr.name] = String(attr.value.value);
      }
    }
    const semantic: SemanticNode = {
      kind: "element",
      startIndex: start,
      endIndex: end,
      tag: node.name,
      content: inlineText(node),
      precedingText: "",
      followingText: "",
      blockId,
    };
    if (hasAttributes) semantic.attributes = attributes;
    nodes.push(semantic);
  };

  /** Attach a trailing IAL to a node, extending its span to cover it. */
  const attachIal = (semantic: SemanticNode) => {
    const trailing = content.slice(
      semantic.endIndex,
      semantic.endIndex + IAL_MAX_LOOKAHEAD
    );
    const m = IAL_RE.exec(trailing);
    if (!m) return;
    const attributes = parseAttributeList(m[1]);
    if (!attributes) return;
    semantic.attributes = attributes;
    semantic.endIndex += m[0].length;
  };

  /** Walk the phrasing content of one inline container. */
  const walkInline = (node: any, blockId: number, withinInline: boolean) => {
    // Callers guarantee children: inline containers and the phrasing nodes
    // recursed into all carry child arrays.
    for (const child of node.children) {
      const [start, end] = offsetsOf(child);
      switch (child.type) {
        case "link": {
          // Only bracketed links form link nodes. GFM autolink literals and
          // <autolinks> stay invisible, matching authored-hyperlink
          // detection (the legacy regexes only matched [text](url) forms).
          if (content[start] !== "[") break;
          const semantic: SemanticNode = {
            kind: "link",
            startIndex: start,
            endIndex: end,
            text: inlineText(child),
            url: child.url,
            precedingText: "",
            followingText: "",
            blockId,
          };
          if (child.title != null) semantic.title = child.title;
          attachIal(semantic);
          nodes.push(semantic);
          walkInline(child, blockId, true);
          break;
        }
        case "image": {
          const semantic: SemanticNode = {
            kind: "image",
            startIndex: start,
            endIndex: end,
            src: child.url,
            /* c8 ignore next - mdast emits string alt (empty for bare ![]); null exists only in the type */
            alt: child.alt ?? "",
            precedingText: "",
            followingText: "",
            blockId,
          };
          if (child.title != null) semantic.title = child.title;
          attachIal(semantic);
          nodes.push(semantic);
          break;
        }
        case "strong":
        case "emphasis": {
          nodes.push({
            kind: child.type,
            startIndex: start,
            endIndex: end,
            text: inlineText(child),
            precedingText: "",
            followingText: "",
            blockId,
          });
          walkInline(child, blockId, true);
          break;
        }
        case "text": {
          // Text runs nested inside links/emphasis are part of the parent's
          // display text, not standalone prose runs.
          if (!withinInline) {
            nodes.push({
              kind: "text",
              startIndex: start,
              endIndex: end,
              text: content.slice(start, end),
              precedingText: "",
              followingText: "",
              blockId,
            });
          }
          break;
        }
        case "html": {
          emitComments(child, blockId);
          break;
        }
        case "mdxTextExpression": {
          emitExpressionComment(child, blockId);
          break;
        }
        case "mdxJsxTextElement": {
          emitJsxElement(child, blockId);
          // Inner phrasing is the element's content, not standalone prose,
          // but nested links/emphasis still surface.
          walkInline(child, blockId, true);
          break;
        }
        default: {
          // Other phrasing content (delete, footnotes, breaks, inline code):
          // recurse into containers so nested links/emphasis still surface;
          // leaves contribute nothing.
          if (Array.isArray(child.children)) {
            walkInline(child, blockId, withinInline);
          }
          break;
        }
      }
    }
  };

  /** Walk block-level content. */
  const walkBlocks = (node: any) => {
    // Callers guarantee children: the root always has them and recursion is
    // guarded by Array.isArray below.
    for (const child of node.children) {
      if (INLINE_CONTAINERS.has(child.type)) {
        const blockId = ++nextBlockId;
        walkInline(child, blockId, false);
        continue;
      }
      switch (child.type) {
        case "code": {
          const [start, end] = offsetsOf(child);
          const meta = child.meta ?? "";
          const semantic: SemanticNode = {
            kind: "codeBlock",
            startIndex: start,
            endIndex: end,
            language: child.lang ?? "",
            meta,
            content: child.value,
            precedingText: "",
            followingText: "",
            blockId: ++nextBlockId,
          };
          const braces = /\{([^}]*)\}/.exec(meta);
          if (braces) {
            const attributes = parseAttributeList(braces[1]);
            if (attributes) semantic.attributes = attributes;
          }
          nodes.push(semantic);
          break;
        }
        case "html": {
          emitComments(child, ++nextBlockId);
          break;
        }
        case "mdxFlowExpression": {
          emitExpressionComment(child, ++nextBlockId);
          break;
        }
        case "mdxJsxFlowElement": {
          emitJsxElement(child, ++nextBlockId);
          // JSX containers hold block content (paragraphs, lists, …); keep
          // walking so nested markdown constructs surface.
          walkBlocks(child);
          break;
        }
        case "definition": {
          if (child.identifier === "comment") {
            const [start, end] = offsetsOf(child);
            nodes.push({
              kind: "comment",
              startIndex: start,
              endIndex: end,
              content: (child.title ?? "").trim(),
              precedingText: "",
              followingText: "",
              blockId: ++nextBlockId,
            });
          }
          break;
        }
        default: {
          // Containers (blockquote, list, listItem, table, tableRow, …).
          if (Array.isArray(child.children)) {
            walkBlocks(child);
          }
          break;
        }
      }
    }
  };

  walkBlocks(tree);
  // Distinct constructs can't share a start offset (nested constructs start
  // after their parent's marker), so startIndex alone is a total order.
  nodes.sort((a, b) => a.startIndex - b.startIndex);

  // Context pass: for each block, record the raw source between the block's
  // bounds and each inline node so precededBy/followedBy regexes can run.
  // Nodes are sorted, so the first node seen per block sets the block start.
  const blockBounds = new Map<number, [number, number]>();
  for (const n of nodes) {
    const bounds = blockBounds.get(n.blockId);
    if (!bounds) {
      blockBounds.set(n.blockId, [n.startIndex, n.endIndex]);
    } else if (n.endIndex > bounds[1]) {
      bounds[1] = n.endIndex;
    }
  }
  for (const n of nodes) {
    const [blockStart, blockEnd] = blockBounds.get(n.blockId)!;
    n.precedingText = content.slice(blockStart, n.startIndex);
    n.followingText = content.slice(n.endIndex, blockEnd);
  }

  return nodes;
}
