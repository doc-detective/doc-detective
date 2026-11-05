/**
 * Scans AsciiDoc into selector nodes, line by line. It covers the selector
 * kinds and the blocks that hide text from them, not the whole language:
 *
 * - `//` lines and `////` blocks are comments.
 * - `----` listings and `....` literal blocks are code blocks. A `[source]`
 *   line above sets the language, and its later options are the meta.
 * - `image::` lines and inline `image:` macros are images. A role, from
 *   `role=` or a `[.role]` line above, sets `class`.
 * - `https://...[text]` and `link:...[text]` are links, `*x*` and `**x**`
 *   are strong, and `_x_` and `__x__` are emphasis. Backtick spans are code.
 * - `++++` passthrough blocks, attribute entries, and indented literal
 *   paragraphs hold no nodes.
 */

import type { Kind, Node } from "./selectors.js";

const BLOCK_COMMENT = /^\/{4,}\s*$/;
const LINE_COMMENT = /^\/\/(?!\/)\s?(.*)$/;
const LISTING = /^(?:-{4,}|\.{4,})\s*$/;
const PASSTHROUGH = /^\+{4,}\s*$/;
const BLOCK_ATTRIBUTES = /^\[([^\]]*)\]\s*$/;
const ATTRIBUTE_ENTRY = /^:!?\w[^:]*!?:(?:\s|$)/;
const IMAGE_BLOCK = /^image::([^\s[\]]+)\[([^\]]*)\]\s*$/;
const INLINE: Array<[Kind | "code", RegExp]> = [
  ["code", /`[^`\n]+`/g],
  ["link", /link:([^\s[\]]+)\[([^\]]*)\]|(https?:\/\/[^\s[\]]+)\[([^\]]*)\]/g],
  ["image", /image:(?!:)([^\s[\]]+)\[([^\]]*)\]/g],
  ["strong", /\*\*([^\n]+?)\*\*/g],
  // Constrained marks hug text and sit outside words, so list markers and snake_case stay text.
  ["strong", /(?<![\w*])\*(?=[^\s*])([^*\n]*?[^\s*])\*(?![\w*])/g],
  ["emphasis", /__([^\n]+?)__/g],
  ["emphasis", /(?<![\w_])_(?=[^\s_])([^_\n]*?[^\s_])_(?![\w_])/g],
];

interface Line {
  start: number;
  /** The end of the line's text, before any `\r\n`. */
  end: number;
  text: string;
}

function splitLines(content: string): Line[] {
  const lines: Line[] = [];
  let start = 0;
  for (const raw of content.split("\n")) {
    const text = raw.endsWith("\r") ? raw.slice(0, -1) : raw;
    lines.push({ start, end: start + text.length, text });
    start += raw.length + 1;
  }
  return lines;
}

/** Splits an attribute list on commas outside quotes. */
function splitAttributes(list: string): string[] {
  return [...list.matchAll(/\s*("[^"]*"|'[^']*'|[^,]*)\s*(?:,|$)/g)].map((m) => m[1]).slice(0, -1);
}

const unquote = (value: string) => value.replace(/^(["'])([\s\S]*)\1$/, "$2");

interface Attributes {
  positional: string[];
  named: Record<string, string>;
  roles: string[];
}

/**
 * Reads `[a, b, key=value]`. On a block attribute line, the first positional
 * also takes `.role` and `#id` shorthands, as in `[.screenshot]`.
 */
function parseAttributes(list: string, shorthand = false): Attributes {
  const result: Attributes = { positional: [], named: {}, roles: [] };
  for (const part of splitAttributes(list)) {
    const named = /^([\w-]+)\s*=\s*([\s\S]*)$/.exec(part);
    if (named) {
      result.named[named[1]] = unquote(named[2]);
      continue;
    }
    if (!shorthand || result.positional.length) {
      result.positional.push(unquote(part));
      continue;
    }
    const shorthands = part.split(/(?=[.#])/);
    const head = /^[.#]/.test(shorthands[0]) ? "" : shorthands.shift()!;
    for (const s of shorthands) {
      if (s.startsWith(".")) result.roles.push(s.slice(1));
      else result.named.id = s.slice(1);
    }
    result.positional.push(head);
  }
  if (result.named.role) result.roles.push(...result.named.role.split(/\s+/));
  return result;
}

/** An image's alt text and attributes, merging a block attribute line above. */
function imageFields(list: string, block: Attributes | null): Pick<Node, "alt" | "attributes"> {
  const { positional, named, roles } = parseAttributes(list);
  const classes = [...(block?.roles ?? []), ...roles].filter(Boolean);
  const attributes: Record<string, string> = { ...block?.named, ...named };
  if (classes.length) attributes.class = classes.join(" ");
  return { alt: positional[0] ?? "", ...(Object.keys(attributes).length && { attributes }) };
}

export function parseAsciidoc(content: string): Node[] {
  const nodes: Node[] = [];
  const lines = splitLines(content);
  // Block attributes from a `[...]` line apply to the next block.
  let pending: Attributes | null = null;
  // The start of the paragraph the current line belongs to.
  let paragraph: number | null = null;

  /** Returns the index of the line that closes a block opened at `i`, or the last line. */
  const closing = (i: number, test: (text: string) => boolean) => {
    let j = i + 1;
    while (j < lines.length && !test(lines[j].text)) j++;
    return Math.min(j, lines.length - 1);
  };
  const inner = (from: number, to: number) => lines.slice(from, to).map((l) => l.text).join("\n");

  for (let i = 0; i < lines.length; i++) {
    const { start, end, text } = lines[i];
    const attributes = pending;
    pending = null;

    if (BLOCK_COMMENT.test(text)) {
      const j = closing(i, (t) => BLOCK_COMMENT.test(t));
      nodes.push({ kind: "comment", startIndex: start, endIndex: lines[j].end, content: inner(i + 1, j > i && BLOCK_COMMENT.test(lines[j].text) ? j : j + 1).trim(), before: "" });
      i = j;
      paragraph = null;
      continue;
    }
    if (LISTING.test(text)) {
      const fence = text.trim();
      const j = closing(i, (t) => t.trim() === fence);
      const closed = j > i && lines[j].text.trim() === fence;
      const source = attributes?.positional[0]?.startsWith("source");
      nodes.push({
        kind: "codeBlock",
        startIndex: start,
        endIndex: lines[j].end,
        language: source ? attributes!.positional[1] ?? "" : "",
        meta: source ? attributes!.positional.slice(2).join(",") : "",
        content: inner(i + 1, closed ? j : j + 1),
        before: "",
      });
      i = j;
      paragraph = null;
      continue;
    }
    if (PASSTHROUGH.test(text)) {
      i = closing(i, (t) => PASSTHROUGH.test(t));
      paragraph = null;
      continue;
    }
    if (paragraph === null && BLOCK_ATTRIBUTES.test(text)) {
      pending = parseAttributes(BLOCK_ATTRIBUTES.exec(text)![1], true);
      continue;
    }
    const comment = LINE_COMMENT.exec(text);
    if (comment) {
      nodes.push({ kind: "comment", startIndex: start, endIndex: end, content: comment[1].trim(), before: "" });
      continue;
    }
    if (text.trim() === "") {
      paragraph = null;
      continue;
    }
    if (paragraph === null && ATTRIBUTE_ENTRY.test(text)) continue;
    const image = IMAGE_BLOCK.exec(text);
    if (image && paragraph === null) {
      nodes.push({ kind: "image", startIndex: start, endIndex: end, src: image[1], ...imageFields(image[2], attributes), before: "" });
      continue;
    }
    if (paragraph === null && /^\s/.test(text)) {
      // An indented literal paragraph runs to the next blank line.
      while (i + 1 < lines.length && lines[i + 1].text.trim() !== "") i++;
      continue;
    }
    paragraph ??= start;
    scanInline(content, lines[i], paragraph, nodes);
    // A section title is a block of its own, so a header's attribute entries can follow it.
    if (/^=+\s/.test(text)) paragraph = null;
  }
  return nodes.sort((a, b) => a.startIndex - b.startIndex);
}

/** Adds a prose line's inline nodes, and the text between them. */
function scanInline(content: string, line: Line, paragraph: number, nodes: Node[]) {
  const found: Array<{ kind: Kind | "code"; start: number; end: number; m: RegExpMatchArray }> = [];
  for (const [kind, re] of INLINE) {
    for (const m of line.text.matchAll(re)) found.push({ kind, start: line.start + m.index!, end: line.start + m.index! + m[0].length, m });
  }
  // The earliest construct wins an overlap. No two patterns start on the same character.
  found.sort((a, b) => a.start - b.start);
  let cursor = line.start;
  const text = (to: number) => {
    if (content.slice(cursor, to).trim()) {
      nodes.push({ kind: "text", startIndex: cursor, endIndex: to, text: content.slice(cursor, to), before: content.slice(paragraph, cursor) });
    }
  };
  for (const { kind, start, end, m } of found) {
    if (start < cursor) continue;
    text(start);
    cursor = end;
    const base = { startIndex: start, endIndex: end, before: content.slice(paragraph, start) };
    if (kind === "link") {
      const url = m[1] ?? m[3];
      nodes.push({ ...base, kind, url, text: (m[2] ?? m[4]) || url });
    } else if (kind === "image") {
      nodes.push({ ...base, kind, src: m[1], ...imageFields(m[2], null) });
    } else if (kind !== "code") {
      nodes.push({ ...base, kind, text: m[1] });
    }
  }
  text(line.end);
}
