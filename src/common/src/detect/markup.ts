/**
 * Parses HTML and DITA into selector nodes with htmlparser2, which keeps
 * exact offsets, decodes entities, tolerates broken markup, and never throws.
 *
 * Tags map to kinds per dialect. Every other tag is an `element`, except
 * code tags, which hold no prose and no statements. Prose is text outside
 * code, links, and formatting. A node's `before` runs from the start of its
 * nearest block-level ancestor, so `precededBy` sees inline tags as source.
 */

import { Parser } from "htmlparser2";
import type { Kind, Node } from "./selectors.js";

export type Dialect = "html" | "dita";

interface DialectSpec {
  xmlMode: boolean;
  kinds: Record<string, Kind>;
  /** Tags whose content is code: no prose, no statements, and no element node. */
  code: Set<string>;
  /** Tags that don't start a block. */
  inline: Set<string>;
  /** The attribute that holds classes. */
  classAttribute: string;
}

const words = (list: string) => new Set(list.split(" "));

const DIALECTS: Record<Dialect, DialectSpec> = {
  html: {
    xmlMode: false,
    kinds: { a: "link", img: "image", strong: "strong", b: "strong", em: "emphasis", i: "emphasis", pre: "codeBlock" },
    code: words("pre code script style textarea"),
    inline: words(
      "a abbr b bdi bdo br button cite code data dfn em i img input kbd label mark q s samp select small span strong sub sup time u var wbr"
    ),
    classAttribute: "class",
  },
  dita: {
    xmlMode: true,
    kinds: { b: "strong", i: "emphasis", codeblock: "codeBlock", image: "image" },
    code: words("codeblock codeph pre screen msgblock"),
    inline: words(
      "b i u sup sub tt line-through overline ph codeph uicontrol wintitle menucascade userinput systemoutput filepath cmdname varname apiname parmname option keyword term xref q image tm data abbreviated-form text synph kwd var msgph msgnum cite"
    ),
    classAttribute: "outputclass",
  },
};

const FORMATTING = new Set<Kind>(["link", "strong", "emphasis"]);
const collapse = (text: string) => text.replace(/\s+/g, " ").trim();

interface Frame {
  tag: string;
  attributes: Record<string, string>;
  kind?: Kind;
  code: boolean;
  inline: boolean;
  start: number;
  contentStart: number;
  before: string;
  text: string;
  language?: string;
}

/**
 * Parses `content.slice(from, to)` as HTML or DITA. Offsets are into
 * `content`. Text outside any block-level tag is measured from `blockStart`.
 */
export function parseMarkup(content: string, dialect: Dialect, from = 0, to = content.length, blockStart = from): Node[] {
  const spec = DIALECTS[dialect];
  const nodes: Node[] = [];
  const stack: Frame[] = [];
  let run: [number, number] | null = null;
  let lastEnd = from;

  const blockOf = () => {
    for (let i = stack.length - 1; i >= 0; i--) if (!stack[i].inline) return stack[i].contentStart;
    return blockStart;
  };
  const before = (start: number) => content.slice(blockOf(), start);
  const inCode = () => stack.some((f) => f.code);
  const span = (): [number, number] => [from + parser.startIndex, from + parser.endIndex + 1];

  const flush = () => {
    if (run && content.slice(run[0], run[1]).trim()) {
      nodes.push({ kind: "text", startIndex: run[0], endIndex: run[1], text: content.slice(run[0], run[1]), before: before(run[0]) });
    }
    run = null;
  };

  const languageOf = (attributes: Record<string, string>) => /(?:^|\s)language-(\S+)/.exec(attributes[spec.classAttribute] ?? "")?.[1];

  const parser = new Parser(
    {
      onopentag(tag, attributes) {
        flush();
        const [start, end] = span();
        const parent = stack[stack.length - 1];
        // HTML puts a code block's language on its <code>.
        if (parent?.kind === "codeBlock") parent.language ??= languageOf(attributes);
        stack.push({
          tag,
          attributes,
          kind: spec.kinds[tag],
          code: spec.code.has(tag),
          inline: spec.inline.has(tag),
          start,
          contentStart: end,
          before: before(start),
          text: "",
        });
        lastEnd = end;
      },
      ontext(text) {
        const [start, end] = span();
        for (const frame of stack) frame.text += text;
        lastEnd = end;
        if (stack.some((f) => f.code || FORMATTING.has(f.kind!))) return;
        // Entities arrive as separate events, so join runs that touch.
        if (run?.[1] === start) run[1] = end;
        else {
          flush();
          run = [start, end];
        }
      },
      onclosetag(_tag, isImplied) {
        flush();
        const frame = stack.pop()!;
        // An implied close ends where the element's content does: at its own
        // open tag for a void or self-closing element.
        const end = isImplied ? Math.max(frame.contentStart, lastEnd) : span()[1];
        lastEnd = Math.max(lastEnd, end);
        // Tags inside code are part of the code.
        const node = inCode() ? null : toNode(frame, end, spec);
        if (node) nodes.push(node);
      },
      oncomment(data) {
        if (inCode()) return;
        flush();
        const [start, end] = span();
        nodes.push({ kind: "comment", startIndex: start, endIndex: end, content: data.trim(), before: before(start) });
        lastEnd = end;
      },
      onprocessinginstruction(name, data) {
        // DITA's <?doc-detective ...?> holds a statement, like a comment.
        if (name !== "?doc-detective" || inCode()) return;
        flush();
        const [start, end] = span();
        nodes.push({ kind: "comment", startIndex: start, endIndex: end, content: data.slice(name.length).trim(), before: before(start) });
        lastEnd = end;
      },
    },
    { xmlMode: spec.xmlMode, decodeEntities: true }
  );
  parser.end(content.slice(from, to));
  flush();
  return nodes.sort((a, b) => a.startIndex - b.startIndex);
}

function toNode(frame: Frame, endIndex: number, spec: DialectSpec): Node | null {
  const base = { startIndex: frame.start, endIndex, before: frame.before };
  const attributes: Record<string, string> = { ...frame.attributes };
  if (spec.classAttribute !== "class" && attributes[spec.classAttribute] !== undefined) attributes.class ??= attributes[spec.classAttribute];
  switch (frame.kind) {
    case "link":
      if (attributes.href === undefined) break;
      return { ...base, kind: "link", url: attributes.href, text: collapse(frame.text), ...(attributes.title !== undefined && { title: attributes.title }), attributes };
    case "image": {
      const src = attributes.src ?? attributes.href ?? "";
      // DITA puts alt text in an <alt> child.
      const alt = attributes.alt ?? collapse(frame.text);
      return { ...base, kind: "image", src, alt, ...(attributes.title !== undefined && { title: attributes.title }), attributes };
    }
    case "strong":
    case "emphasis":
      return { ...base, kind: frame.kind, text: collapse(frame.text) };
    case "codeBlock": {
      const language = /(?:^|\s)language-(\S+)/.exec(attributes.class ?? "")?.[1] ?? frame.language ?? "";
      // HTML drops a newline right after <pre>.
      return { ...base, kind: "codeBlock", language, meta: "", content: frame.text.replace(/^\r?\n/, "") };
    }
  }
  if (frame.code) return null;
  return { ...base, kind: "element", tag: frame.tag, content: collapse(frame.text), attributes };
}
