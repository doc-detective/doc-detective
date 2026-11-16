/**
 * Scans reStructuredText into selector nodes, line by line, like the AsciiDoc
 * scanner. It covers the selector kinds and the blocks that hide text from
 * them, not the whole language. Blocks end where indentation does.
 *
 * - `.. text` and `..` with an indented block are comments. Targets (`.. _x:`),
 *   footnotes and citations (`.. [x]`), and substitutions (`.. |x|`) aren't,
 *   and hold no nodes.
 * - `.. code-block::`, `.. code::`, and `.. sourcecode::` are code blocks. The
 *   argument is the language, and the option lines are the meta. A paragraph
 *   ending in `::` makes the indented block after it a literal code block.
 * - `.. image::` and `.. figure::` are images. `:alt:` is the alt text, and
 *   other options, such as `:class:`, are attributes.
 * - `` `text <url>`_ `` and bare `https://...` are links, `**x**` is strong,
 *   and `*x*` is emphasis. Inline literals, interpreted text, and roles are code.
 * - `.. raw::` bodies and title adornments hold no nodes. Other directives'
 *   option lines are skipped, and their bodies are prose.
 */

import type { Kind, Node } from "./selectors.js";
import { splitLines, type Line } from "./asciidoc.js";

// Each tail is one `(.*)` behind a lookahead, trimmed in code: a tail that splits whitespace
// between `[ \t]+`, a lazy group, and `[ \t]*$` backtracks quadratically on long runs of tabs.
const EXPLICIT = /^([ \t]*)\.\.(?=[ \t]|$)(.*)$/;
const DIRECTIVE = /^(\w[\w:.+-]*?)::(?=[ \t]|$)(.*)$/;
const OPTION = /^[ \t]*:([^:\s][^:]*):(?=[ \t]|$)(.*)$/;
const ADORNMENT = /^([!-/:-@[-`{-~])\1{2,}[ \t]*$/;
const CODE_DIRECTIVES = new Set(["code-block", "code", "sourcecode"]);
const INLINE: Array<[Kind | "code", RegExp]> = [
  ["code", /``[^\n]+?``/g],
  // The text keeps its trailing space, trimmed in code, so no two parts compete for whitespace.
  ["link", /`([^`<\n]*)<([^`>\n]+)>`__?(?!\w)/g],
  // Interpreted text, with or without a role, and named references. Single backticks only,
  // so it can't start or end inside an inline literal's ``.
  ["code", /(?::[\w:.+-]+:)?(?<!`)`(?!`)[^`\n]+(?<!`)`(?!`)(?::[\w:.+-]+:)?_{0,2}/g],
  ["link", /https?:\/\/[^\s<>`]*[^\s<>`.,;:!?'")\]]/g],
  // Inline markup hugs its text and sits outside words, so list markers and 2*3*4 stay text.
  ["strong", /(?<![\w*])\*\*(?=\S)([^\n]*?\S)\*\*(?![\w*])/g],
  ["emphasis", /(?<![\w*])\*(?=[^\s*])([^*\n]*?[^\s*])\*(?![\w*])/g],
];

const indentOf = (text: string) => text.length - text.trimStart().length;
const isBlank = (text: string) => text.trim() === "";

export function parseRst(content: string): Node[] {
  const nodes: Node[] = [];
  const lines = splitLines(content);
  // The start of the paragraph the current line belongs to.
  let paragraph: number | null = null;
  // The indent of a paragraph that ended in `::`, so the more-indented block after it is literal.
  let literal: number | null = null;

  /** The last non-blank line of the block indented past `indent` after line `i`, or `i`. */
  const blockEnd = (i: number, indent: number) => {
    let j = i;
    for (let k = i + 1; k < lines.length && (isBlank(lines[k].text) || indentOf(lines[k].text) > indent); k++) {
      if (!isBlank(lines[k].text)) j = k;
    }
    return j;
  };
  /** Lines `from` to `to`, without their common indent or leading blank lines. */
  const dedent = (from: number, to: number) => {
    const texts = lines.slice(from, to + 1).map((l) => l.text);
    const indent = Math.min(...texts.filter((t) => !isBlank(t)).map(indentOf));
    return texts.map((t) => t.slice(indent)).join("\n").replace(/^\n+/, "");
  };

  for (let i = 0; i < lines.length; i++) {
    const { start, text } = lines[i];
    const literalIndent = literal;
    if (isBlank(text)) {
      paragraph = null;
      continue;
    }
    literal = null;

    if (literalIndent !== null && indentOf(text) > literalIndent) {
      const j = blockEnd(i, literalIndent);
      nodes.push({ kind: "codeBlock", startIndex: start, endIndex: lines[j].end, language: "", meta: "", content: dedent(i, j), before: "" });
      i = j;
      continue;
    }

    const explicit = paragraph === null ? EXPLICIT.exec(text) : null;
    if (explicit) {
      const indent = explicit[1].length;
      const rest = explicit[2].trim();
      const j = blockEnd(i, indent);
      const directive = DIRECTIVE.exec(rest);
      if (!directive) {
        // An empty `..` followed by a blank line is an empty comment, and the block after it is a quote.
        const empty = rest === "" && (i + 1 >= lines.length || isBlank(lines[i + 1].text));
        if (!empty && !/^[_[|]/.test(rest)) {
          const body = j > i ? dedent(i + 1, j) : "";
          const comment = [rest, body].filter(Boolean).join("\n").trim();
          if (comment) nodes.push({ kind: "comment", startIndex: start + indent, endIndex: lines[j].end, content: comment, before: "" });
        }
        if (!empty) i = j;
        continue;
      }

      const name = directive[1].toLowerCase();
      const argument = directive[2].trim();
      let k = i + 1;
      const options: Record<string, string | true> = {};
      for (; k <= j && OPTION.test(lines[k].text); k++) {
        const [, key, value] = OPTION.exec(lines[k].text)!;
        options[key] = value.trim() || true;
      }
      const base = { startIndex: start + indent, before: "" };

      if (CODE_DIRECTIVES.has(name)) {
        const meta = lines.slice(i + 1, k).map((l) => l.text.trim()).join(" ");
        nodes.push({ ...base, kind: "codeBlock", endIndex: lines[j].end, language: argument.split(/\s+/)[0], meta, content: k <= j ? dedent(k, j) : "" });
        i = j;
      } else if (name === "raw") {
        i = j;
      } else {
        if (name === "image" || name === "figure") {
          const { alt, ...attributes } = options;
          nodes.push({
            ...base,
            kind: "image",
            endIndex: lines[k - 1].end,
            src: argument,
            alt: typeof alt === "string" ? alt : "",
            ...(Object.keys(attributes).length && { attributes }),
          });
        }
        // The rest of the body, such as a figure's caption or a note's text, is prose.
        i = k - 1;
      }
      continue;
    }

    if (ADORNMENT.test(text)) {
      paragraph = null;
      continue;
    }

    paragraph ??= start;
    scanInline(content, lines[i], paragraph, nodes);
    if (text.trimEnd().endsWith("::")) literal = indentOf(text);
  }
  return nodes.sort((a, b) => a.startIndex - b.startIndex);
}

/** Adds a prose line's inline nodes, and the text between them. */
function scanInline(content: string, line: Line, paragraph: number, nodes: Node[]) {
  const found: Array<{ kind: Kind | "code"; start: number; end: number; m: RegExpMatchArray }> = [];
  for (const [kind, re] of INLINE) {
    for (const m of line.text.matchAll(re)) found.push({ kind, start: line.start + m.index!, end: line.start + m.index! + m[0].length, m });
  }
  // The earliest construct wins an overlap. The sort is stable, so on a tie the earlier pattern wins.
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
      // An embedded URI has groups. A bare one is the whole match.
      const url = m[2]?.trim() ?? m[0];
      nodes.push({ ...base, kind, url, text: m[2] === undefined ? url : m[1].trim() || url });
    } else if (kind !== "code") {
      nodes.push({ ...base, kind, text: m[1] });
    }
  }
  text(line.end);
}
