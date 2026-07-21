/**
 * AsciiDoc backend: a purpose-built line-aware scanner (not asciidoctor.js,
 * which is Opal-heavy and discards comments before parsing; a tree-sitter
 * grammar is the designated future upgrade).
 *
 * Scope is exactly the standard selector vocabulary and nothing more:
 * `//` line comments and `////` block comments → comment, `[source,lang]` +
 * `----`/`....` listings → codeBlock, `image::src[alt, key=val]` → image,
 * `url[text]` → link, `*bold*` → strong, `_italic_` → emphasis, and prose
 * segments between inline constructs → text. No tables, includes,
 * conditionals, or nested-block semantics. Comment-looking lines inside
 * listings stay listing content — no statement false positives.
 */

import { SemanticNode } from "./types.js";

const LINE_COMMENT_RE = /^\/\/(?!\/)\s?(.*)$/;
const BLOCK_COMMENT_DELIM_RE = /^\/{4,}\s*$/;
const LISTING_DELIM_RE = /^(-{4,}|\.{4,})\s*$/;
const SOURCE_ATTR_RE = /^\[source(?:\s*,\s*([\w-]+))?[^\]]*\]\s*$/;
const IMAGE_MACRO_RE = /^image::([^[\s]+)\[([^\]]*)\]\s*$/;

const INLINE_LINK_RE = /(https?:\/\/[^\s[\]]+)\[([^\]]*)\]/g;
const INLINE_STRONG_RE = /\*([^*\n]+)\*/g;
const INLINE_EMPHASIS_RE = /_([^_\n]+)_/g;

interface Line {
  start: number;
  end: number; // end of the line's text, excluding the newline and any \r
  text: string;
}

function splitLines(content: string): Line[] {
  const lines: Line[] = [];
  let pos = 0;
  for (const raw of content.split("\n")) {
    const text = raw.endsWith("\r") ? raw.slice(0, -1) : raw;
    lines.push({ start: pos, end: pos + text.length, text });
    pos += raw.length + 1;
  }
  return lines;
}

/** Parses `[alt, key=val, …]` image attrlists: first positional → alt. */
function parseAttrList(list: string): {
  alt: string;
  attributes?: Record<string, string | true>;
} {
  let alt = "";
  let sawPositional = false;
  const attributes: Record<string, string | true> = {};
  let named = false;
  for (const rawPart of list.split(",")) {
    const part = rawPart.trim();
    if (part === "") continue;
    const eq = part.indexOf("=");
    if (eq > 0) {
      named = true;
      attributes[part.slice(0, eq).trim()] = part
        .slice(eq + 1)
        .trim()
        .replace(/^["']|["']$/g, "");
    } else if (!sawPositional) {
      sawPositional = true;
      alt = part;
    }
  }
  return named ? { alt, attributes } : { alt };
}

export function parseAsciidoc(content: string): SemanticNode[] {
  const nodes: SemanticNode[] = [];
  const lines = splitLines(content);
  let nextBlockId = 0;
  let paragraphId: number | null = null;

  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    const text = line.text;

    // Block comment: //// … ////
    if (BLOCK_COMMENT_DELIM_RE.test(text)) {
      paragraphId = null;
      const startLine = i;
      let j = i + 1;
      while (j < lines.length && !BLOCK_COMMENT_DELIM_RE.test(lines[j].text)) {
        j++;
      }
      const inner = lines
        .slice(startLine + 1, Math.min(j, lines.length))
        .map((l) => l.text)
        .join("\n");
      const endLine = j < lines.length ? lines[j] : lines[lines.length - 1];
      nodes.push({
        kind: "comment",
        startIndex: line.start,
        endIndex: endLine.end,
        content: inner.trim(),
        precedingText: "",
        followingText: "",
        blockId: ++nextBlockId,
      });
      i = j + 1;
      continue;
    }

    // Listing/literal block: optional [source,lang] line, then ----/....
    const sourceAttr = SOURCE_ATTR_RE.exec(text);
    const delim = LISTING_DELIM_RE.exec(text);
    if (delim || (sourceAttr && i + 1 < lines.length && LISTING_DELIM_RE.test(lines[i + 1].text))) {
      paragraphId = null;
      const blockStart = line.start;
      const language = sourceAttr?.[1] ?? "";
      const fenceLineIndex = sourceAttr ? i + 1 : i;
      const fence = lines[fenceLineIndex].text.trim();
      let j = fenceLineIndex + 1;
      while (j < lines.length && lines[j].text.trim() !== fence) {
        j++;
      }
      const inner = lines
        .slice(fenceLineIndex + 1, Math.min(j, lines.length))
        .map((l) => l.text)
        .join("\n");
      const endLine = j < lines.length ? lines[j] : lines[lines.length - 1];
      nodes.push({
        kind: "codeBlock",
        startIndex: blockStart,
        endIndex: endLine.end,
        language,
        meta: "",
        content: inner,
        precedingText: "",
        followingText: "",
        blockId: ++nextBlockId,
      });
      i = j + 1;
      continue;
    }
    if (sourceAttr) {
      // A [source] line with no following listing is inert metadata.
      paragraphId = null;
      i++;
      continue;
    }

    // Line comment: // …
    const comment = LINE_COMMENT_RE.exec(text);
    if (comment) {
      nodes.push({
        kind: "comment",
        startIndex: line.start,
        endIndex: line.end,
        content: comment[1].trim(),
        precedingText: "",
        followingText: "",
        blockId: ++nextBlockId,
      });
      i++;
      continue;
    }

    // Image block macro: image::src[attrs]
    const image = IMAGE_MACRO_RE.exec(text);
    if (image) {
      paragraphId = null;
      const { alt, attributes } = parseAttrList(image[2]);
      const semantic: SemanticNode = {
        kind: "image",
        startIndex: line.start,
        endIndex: line.end,
        src: image[1],
        alt,
        precedingText: "",
        followingText: "",
        blockId: ++nextBlockId,
      };
      if (attributes) semantic.attributes = attributes;
      nodes.push(semantic);
      i++;
      continue;
    }

    // Blank line: paragraph break.
    if (text.trim() === "") {
      paragraphId = null;
      i++;
      continue;
    }

    // Prose line: scan inline constructs, emit text segments between them.
    if (paragraphId === null) paragraphId = ++nextBlockId;
    const inline: Array<{
      start: number;
      end: number;
      node: SemanticNode;
    }> = [];
    for (const m of text.matchAll(INLINE_LINK_RE)) {
      inline.push({
        start: m.index!,
        end: m.index! + m[0].length,
        node: {
          kind: "link",
          startIndex: line.start + m.index!,
          endIndex: line.start + m.index! + m[0].length,
          url: m[1],
          text: m[2],
          precedingText: "",
          followingText: "",
          blockId: paragraphId,
        },
      });
    }
    for (const m of text.matchAll(INLINE_STRONG_RE)) {
      inline.push({
        start: m.index!,
        end: m.index! + m[0].length,
        node: {
          kind: "strong",
          startIndex: line.start + m.index!,
          endIndex: line.start + m.index! + m[0].length,
          text: m[1],
          precedingText: "",
          followingText: "",
          blockId: paragraphId,
        },
      });
    }
    for (const m of text.matchAll(INLINE_EMPHASIS_RE)) {
      inline.push({
        start: m.index!,
        end: m.index! + m[0].length,
        node: {
          kind: "emphasis",
          startIndex: line.start + m.index!,
          endIndex: line.start + m.index! + m[0].length,
          text: m[1],
          precedingText: "",
          followingText: "",
          blockId: paragraphId,
        },
      });
    }
    // Two constructs can't share a start (links start with a scheme, strong
    // with *, emphasis with _), so start alone is a total order.
    inline.sort((a, b) => a.start - b.start);
    let cursor = 0;
    let lastEnd = 0;
    for (const item of inline) {
      if (item.start < lastEnd) continue; // overlap: first (longest) wins
      if (item.start > cursor) {
        const segment = text.slice(cursor, item.start);
        if (segment.trim()) {
          nodes.push({
            kind: "text",
            startIndex: line.start + cursor,
            endIndex: line.start + item.start,
            text: segment,
            precedingText: "",
            followingText: "",
            blockId: paragraphId,
          });
        }
      }
      nodes.push(item.node);
      cursor = item.end;
      lastEnd = item.end;
    }
    if (cursor < text.length) {
      const segment = text.slice(cursor);
      if (segment.trim()) {
        nodes.push({
          kind: "text",
          startIndex: line.start + cursor,
          endIndex: line.end,
          text: segment,
          precedingText: "",
          followingText: "",
          blockId: paragraphId,
        });
      }
    }
    i++;
  }

  nodes.sort((a, b) => a.startIndex - b.startIndex);

  // Context pass, same contract as the other backends.
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
