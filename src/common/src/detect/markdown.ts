/**
 * Parses Markdown and MDX into selector nodes, with exact source offsets.
 * CommonMark only: no GFM, which detection doesn't need and which doubles
 * parse time.
 *
 * Every comment form becomes a `comment` node: `<!-- -->`, `[comment]: #`,
 * and `{/* *\/}`. Plain Markdown has no `{/* *\/}` syntax, and a
 * `[comment]: #` whose text holds parentheses isn't a valid definition, so
 * paragraphs are also scanned for both. Docusaurus treats `.md` as MDX, so
 * those pages use them.
 */

import { fromMarkdown } from "mdast-util-from-markdown";
import { mdxjs } from "micromark-extension-mdxjs";
import { mdxFromMarkdown } from "mdast-util-mdx";
import type { Node } from "./selectors.js";

const HTML_COMMENT = /<!--([\s\S]*?)-->/g;
const EXPRESSION_COMMENT = /^\s*\/\*([\s\S]*?)\*\/\s*$/;
// MDX parses JSX expression comments itself, so it scans only for link-reference comments.
const JSX_COMMENT = /\{\/\*([\s\S]*?)\*\/\}/g;
const REFERENCE_COMMENT = /^[ \t]*\[comment\]:[ \t]*(?:#|<>)?[ \t]*(?:\(([^\n]*)\)|"([^\n]*)"|'([^\n]*)')[ \t]*$/gm;
// One name branch with an optional value. Alternatives that share a prefix
// backtrack polynomially on adversarial input.
const ATTRIBUTE_TOKEN = /([.#][^\s{}]+)|([A-Za-z_][\w.:-]*)(?:=(?:"([^"]*)"|'([^']*)'|([^\s{}]+)))?/g;

/**
 * Reads a Kramdown or Pandoc attribute list, such as `: .a #b key="c"`.
 * Classes join into `class`, `#x` sets `id`, and a bare name is `true`.
 */
export function parseAttributeList(inner: string): Record<string, string | true> | null {
  const attributes: Record<string, string | true> = {};
  let found = false;
  for (const m of inner.trim().replace(/^:\s*/, "").matchAll(ATTRIBUTE_TOKEN)) {
    found = true;
    if (m[1]?.startsWith(".")) {
      attributes.class = attributes.class ? `${attributes.class} ${m[1].slice(1)}` : m[1].slice(1);
    } else if (m[1]) {
      attributes.id = m[1].slice(1);
    } else {
      attributes[m[2]] = m[3] ?? m[4] ?? m[5] ?? true;
    }
  }
  return found ? attributes : null;
}

/** The rendered text of an inline node. */
function inlineText(node: any): string {
  if (typeof node.value === "string") return node.value;
  return (node.children ?? []).map(inlineText).join("");
}

/** Parses Markdown, or MDX when `mdx` is true. Invalid MDX throws. */
export function parseMarkdown(content: string, mdx = false): Node[] {
  const tree = mdx
    ? fromMarkdown(content, { extensions: [mdxjs()], mdastExtensions: [mdxFromMarkdown()] })
    : fromMarkdown(content);
  const nodes: Node[] = [];
  // The parser positions every node it emits. No fallback, because a guessed
  // offset would misplace a statement silently instead of failing.
  const startOf = (n: any): number => n.position.start.offset;
  const endOf = (n: any): number => n.position.end.offset;

  // Spans inside the current block that belong to a comment or an attribute list.
  let taken: Array<[number, number]> = [];
  let blockStart = 0;
  const isTaken = (start: number, end: number) => taken.some(([s, e]) => start < e && end > s);

  const add = (node: Omit<Node, "before">) => {
    nodes.push({ ...node, before: content.slice(blockStart, node.startIndex) } as Node);
  };
  const addComment = (startIndex: number, endIndex: number, body: string) => {
    add({ kind: "comment", startIndex, endIndex, content: body.trim() });
  };

  /** Adds prose, leaving out taken spans and joining runs that touch. */
  const addText = (start: number, end: number) => {
    const pieces: Array<[number, number]> = [[start, end]];
    for (const [s, e] of taken) {
      for (let i = pieces.length - 1; i >= 0; i--) {
        const [a, b] = pieces[i];
        if (s >= b || e <= a) continue;
        pieces.splice(i, 1, ...([[a, s], [e, b]] as Array<[number, number]>).filter(([x, y]) => y > x));
      }
    }
    for (const [a, b] of pieces) {
      const last = nodes[nodes.length - 1];
      if (last?.kind === "text" && last.endIndex === a && last.startIndex >= blockStart) {
        last.endIndex = b;
        last.text = content.slice(last.startIndex, b);
      } else {
        add({ kind: "text", startIndex: a, endIndex: b, text: content.slice(a, b) });
      }
    }
  };

  /** Extends a link or image over a trailing attribute list. */
  const withAttributes = (node: Omit<Node, "before">) => {
    // Sticky, so it matches only at the node's end. One per call, so no lastIndex is shared.
    const attributeList = /\{([^}]*)\}/y;
    attributeList.lastIndex = node.endIndex;
    const m = attributeList.exec(content);
    const attributes = m && parseAttributeList(m[1]);
    if (attributes) {
      taken.push([node.endIndex, node.endIndex + m![0].length]);
      node.attributes = attributes;
      node.endIndex += m![0].length;
    }
    return node;
  };

  const addElement = (n: any) => {
    if (!n.name) return; // a fragment
    const element: Omit<Node, "before"> = { kind: "element", startIndex: startOf(n), endIndex: endOf(n), tag: n.name, content: inlineText(n) };
    for (const attribute of n.attributes) {
      if (attribute.type !== "mdxJsxAttribute") continue; // a spread
      const value = attribute.value;
      element.attributes ??= {};
      element.attributes[attribute.name] = value == null ? true : typeof value === "string" ? value : String(value.value);
    }
    add(element);
  };

  const addExpressionComment = (n: any) => {
    const m = EXPRESSION_COMMENT.exec(n.value);
    if (m) addComment(startOf(n), endOf(n), m[1]);
  };

  const addHtmlComments = (n: any) => {
    for (const m of content.slice(startOf(n), endOf(n)).matchAll(HTML_COMMENT)) {
      addComment(startOf(n) + m.index!, startOf(n) + m.index! + m[0].length, m[1]);
    }
  };

  /** Walks phrasing content. `inside` is true within a link, formatting, or a component. */
  const walkInline = (parent: any, inside: boolean) => {
    for (const n of parent.children) {
      const start = startOf(n);
      const end = endOf(n);
      // Text isn't skipped here, because addText splits it around taken spans.
      if (isTaken(start, end) && n.type !== "text") continue;
      switch (n.type) {
        case "text":
          if (!inside) addText(start, end);
          break;
        case "link":
          // Autolinks stay prose, so `Enter "a@b.co"` reads whole.
          if (content[start] !== "[") {
            if (!inside) addText(start, end);
            break;
          }
          add(withAttributes({ kind: "link", startIndex: start, endIndex: end, text: inlineText(n), url: n.url, ...(n.title != null && { title: n.title }) }));
          walkInline(n, true);
          break;
        case "image":
          add(withAttributes({ kind: "image", startIndex: start, endIndex: end, src: n.url, alt: n.alt, ...(n.title != null && { title: n.title }) }));
          break;
        case "strong":
        case "emphasis":
          add({ kind: n.type, startIndex: start, endIndex: end, text: inlineText(n) });
          walkInline(n, true);
          break;
        case "html":
          addHtmlComments(n);
          break;
        case "mdxTextExpression":
          addExpressionComment(n);
          break;
        case "mdxJsxTextElement":
          addElement(n);
          walkInline(n, true);
          break;
        case "linkReference":
        case "imageReference":
          if (!inside) addText(start, end);
          break;
        // Inline code and breaks hold no prose.
      }
    }
  };

  const walkBlocks = (parent: any) => {
    for (const n of parent.children) {
      blockStart = startOf(n);
      taken = [];
      switch (n.type) {
        case "paragraph":
        case "heading": {
          const source = content.slice(startOf(n), endOf(n));
          // In .mdx, {/* */} is already an expression node, so only .md scans for it.
          for (const pattern of mdx ? [REFERENCE_COMMENT] : [JSX_COMMENT, REFERENCE_COMMENT]) {
            for (const m of source.matchAll(pattern)) {
              const at = startOf(n) + m.index!;
              taken.push([at, at + m[0].length]);
              addComment(at, at + m[0].length, (m[1] ?? m[2] ?? m[3])!);
            }
          }
          walkInline(n, false);
          break;
        }
        case "code":
          // Indented code has no fence, like AsciiDoc's literal paragraphs.
          if (content[startOf(n)] !== "`" && content[startOf(n)] !== "~") break;
          add({
            kind: "codeBlock",
            startIndex: startOf(n),
            endIndex: endOf(n),
            language: n.lang ?? "",
            meta: n.meta ?? "",
            content: n.value,
            ...withBraces(n.meta),
          });
          break;
        case "html":
          addHtmlComments(n);
          break;
        case "definition":
          if (n.identifier === "comment") addComment(startOf(n), endOf(n), n.title ?? "");
          break;
        case "mdxFlowExpression":
          addExpressionComment(n);
          break;
        case "mdxJsxFlowElement":
          addElement(n);
          walkBlocks(n);
          break;
        default:
          // Lists, list items, and blockquotes hold blocks.
          if (n.children) walkBlocks(n);
      }
    }
  };

  walkBlocks(tree);
  return nodes.sort((a, b) => a.startIndex - b.startIndex);
}

/** Attributes from a brace group in a fence's meta, such as ```` ```bash {.a} ````. */
function withBraces(meta: string | null | undefined): { attributes?: Record<string, string | true> } {
  const braces = /\{([^}]*)\}/.exec(meta ?? "");
  const attributes = braces && parseAttributeList(braces[1]);
  return attributes ? { attributes } : {};
}
