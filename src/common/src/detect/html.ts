/**
 * HTML backend: parses documents with parse5 (WHATWG-conformant, exact
 * source offsets on every located node, comment nodes preserved).
 *
 * Kind mapping: `<a href>` → link, `<img>` → image, `<strong>/<b>` → strong,
 * `<em>/<i>` → emphasis, `<pre><code class="language-x">` → codeBlock,
 * `<!-- -->` → comment, text → text runs (raw source slices). Every other
 * located tag surfaces as an `element` node with its raw attribute names
 * (bare/empty attributes normalize to `true`). script/style/template/
 * textarea subtrees are skipped, and comments inside `<pre>` don't surface —
 * code samples can't produce statement false positives.
 */

import { parse } from "parse5";
import { SemanticNode } from "./types.js";

const BLOCK_TAGS = new Set([
  "body", "p", "h1", "h2", "h3", "h4", "h5", "h6", "li", "dd", "dt",
  "td", "th", "caption", "figcaption", "summary", "blockquote", "div",
  "section", "article", "aside", "header", "footer", "main", "nav",
  "figure", "details",
]);

const SKIP_TAGS = new Set(["script", "style", "template", "textarea"]);

/** Semantic-mapped inline tags; these don't double as `element` nodes. */
const EMPHASIS_TAGS: Record<string, "strong" | "emphasis"> = {
  strong: "strong",
  b: "strong",
  em: "emphasis",
  i: "emphasis",
};

/** Concatenated, entity-decoded text of a node's descendants. */
function textOf(node: any): string {
  let out = "";
  for (const child of node.childNodes) {
    if (child.nodeName === "#text") out += child.value;
    // Comments (and other leaf nodes) have no childNodes and no text.
    else if (Array.isArray(child.childNodes)) out += textOf(child);
  }
  return out;
}

/** Raw attribute map; empty-valued (bare) attributes normalize to `true`. */
function attrsOf(el: any): Record<string, string | true> | undefined {
  if (!el.attrs || el.attrs.length === 0) return undefined;
  const attributes: Record<string, string | true> = {};
  for (const attr of el.attrs) {
    attributes[attr.name] = attr.value === "" ? true : attr.value;
  }
  return attributes;
}

function attrValue(el: any, name: string): string {
  const attr = el.attrs.find((a: any) => a.name === name);
  return attr ? attr.value : "";
}

export function parseHtml(content: string): SemanticNode[] {
  const doc = parse(content, { sourceCodeLocationInfo: true });
  const nodes: SemanticNode[] = [];
  let nextBlockId = 0;

  const walk = (node: any, blockId: number) => {
    // parse5 always materializes childNodes on documents and elements.
    for (const child of node.childNodes) {
      const nodeName = child.nodeName;
      if (nodeName === "#comment") {
        const loc = child.sourceCodeLocation;
        /* c8 ignore next - parse5 locates every authored comment */
        if (!loc) continue;
        nodes.push({
          kind: "comment",
          startIndex: loc.startOffset,
          endIndex: loc.endOffset,
          content: String(child.data).trim(),
          precedingText: "",
          followingText: "",
          blockId,
        });
        continue;
      }
      if (nodeName === "#text") {
        const loc = child.sourceCodeLocation;
        /* c8 ignore next - parse5 locates every authored text node */
        if (!loc) continue;
        const raw = content.slice(loc.startOffset, loc.endOffset);
        if (raw.trim()) {
          nodes.push({
            kind: "text",
            startIndex: loc.startOffset,
            endIndex: loc.endOffset,
            text: raw,
            precedingText: "",
            followingText: "",
            blockId,
          });
        }
        continue;
      }
      if (!child.tagName) {
        // Doctype and other non-element nodes carry no children to walk.
        continue;
      }
      const tag = child.tagName.toLowerCase();
      if (SKIP_TAGS.has(tag)) continue;
      const loc = child.sourceCodeLocation;
      if (tag === "pre") {
        const code = child.childNodes.find(
          (c: any) => c.tagName === "code"
        );
        if (code && loc) {
          const cls = attrValue(code, "class");
          const lang = /(?:^|\s)language-([\w-]+)/.exec(cls)?.[1] ?? "";
          nodes.push({
            kind: "codeBlock",
            startIndex: loc.startOffset,
            endIndex: loc.endOffset,
            language: lang,
            meta: "",
            content: textOf(code),
            precedingText: "",
            followingText: "",
            blockId: ++nextBlockId,
          });
        }
        // Don't walk into pre: sample markup inside code can't produce
        // comments, links, or text runs.
        continue;
      }

      const ownBlockId = BLOCK_TAGS.has(tag) ? ++nextBlockId : blockId;
      if (loc) {
        const attributes = attrsOf(child);
        if (tag === "a") {
          const semantic: SemanticNode = {
            kind: "link",
            startIndex: loc.startOffset,
            endIndex: loc.endOffset,
            url: attrValue(child, "href"),
            text: textOf(child),
            precedingText: "",
            followingText: "",
            blockId,
          };
          if (attributes) semantic.attributes = attributes;
          nodes.push(semantic);
          continue;
        }
        if (tag === "img") {
          const semantic: SemanticNode = {
            kind: "image",
            startIndex: loc.startOffset,
            endIndex: loc.endOffset,
            src: attrValue(child, "src"),
            alt: attrValue(child, "alt"),
            precedingText: "",
            followingText: "",
            blockId,
          };
          if (attributes) semantic.attributes = attributes;
          nodes.push(semantic);
          continue;
        }
        if (EMPHASIS_TAGS[tag]) {
          nodes.push({
            kind: EMPHASIS_TAGS[tag],
            startIndex: loc.startOffset,
            endIndex: loc.endOffset,
            text: textOf(child),
            precedingText: "",
            followingText: "",
            blockId,
          });
          continue;
        }
        const semantic: SemanticNode = {
          kind: "element",
          startIndex: loc.startOffset,
          endIndex: loc.endOffset,
          tag,
          content: textOf(child),
          precedingText: "",
          followingText: "",
          blockId: ownBlockId,
        };
        if (attributes) semantic.attributes = attributes;
        nodes.push(semantic);
      }
      walk(child, ownBlockId);
    }
  };

  walk(doc, ++nextBlockId);
  nodes.sort((a, b) => a.startIndex - b.startIndex);

  // Context pass, same contract as the markdown backend.
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
