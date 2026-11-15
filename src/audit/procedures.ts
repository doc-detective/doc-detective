/**
 * Finds the lists in a file that `audit` treats as procedures, from each
 * format's parse tree, never from a raw text scan (ADR 01206).
 *
 * Tiers, first match wins:
 * 1. explicit: DITA `<steps>`, MDX `<Steps>`, or a list right after a
 *    `procedure` statement.
 * 2. tagger: an ordered list whose first item reads as an instruction.
 * 3. possible: any other ordered list.
 *
 * Only top-level items count. A nested list belongs to its parent item.
 */

import { fromMarkdown } from "mdast-util-from-markdown";
import { mdxjs } from "micromark-extension-mdxjs";
import { mdxFromMarkdown } from "mdast-util-mdx";
import { Parser } from "htmlparser2";
import { isInstruction } from "./tagger.js";

export type Source = "explicit" | "tagger" | "possible";

export interface ProcedureItem {
  /** From the item's start to the next item's start, or the list's end. */
  startIndex: number;
  endIndex: number;
  /** The first line of the item's text. */
  text: string;
}

export interface ProcedureList {
  source: Source;
  startIndex: number;
  endIndex: number;
  items: ProcedureItem[];
}

/** A list before the tier is decided. */
interface RawList {
  explicit: boolean;
  startIndex: number;
  endIndex: number;
  /** Where each item starts, and its own text as a source span or as read text. */
  items: Array<{ startIndex: number; textStart: number; textEnd: number; text?: string }>;
}

const COMMENTS = /<!--[\s\S]*?-->|\{\/\*[\s\S]*?\*\/\}/g;

/** The first line of an item's text, without comments or a list marker. */
function itemText(content: string, start: number, end: number): string {
  return (
    content
      .slice(start, end)
      .replace(COMMENTS, "")
      .split(/\r?\n/)
      .map((line) => line.trim())
      .find(Boolean) ?? ""
  );
}

/**
 * Returns the file's procedure lists, or null when no list finder handles
 * the format, so the file is reported as not measured.
 *
 * `markers` holds the end offsets of `procedure` statements.
 */
export function findProcedures(content: string, format: string | undefined, { mdx = false, markers = [] as number[] } = {}): ProcedureList[] | null {
  let raw: RawList[];
  if (format === "markdown") raw = markdownLists(content, mdx);
  else if (format === "html" || format === "dita") raw = markupLists(content, format);
  else if (format === "asciidoc") raw = asciidocLists(content);
  else return null;

  return raw.map((list) => {
    const items = list.items.map((item, i) => ({
      startIndex: item.startIndex,
      endIndex: list.items[i + 1]?.startIndex ?? list.endIndex,
      text: item.text ?? itemText(content, item.textStart, item.textEnd),
    }));
    // A DITA processing instruction's span stops before its closing `>`.
    const marked = markers.some((end) => end <= list.startIndex && content.slice(end, list.startIndex).replace(/^>/, "").trim() === "");
    const source: Source =
      list.explicit || marked ? "explicit" : items.length && isInstruction(items[0].text) ? "tagger" : "possible";
    return { source, startIndex: list.startIndex, endIndex: list.endIndex, items };
  });
}

function markdownLists(content: string, mdx: boolean): RawList[] {
  let tree: any;
  try {
    tree = mdx
      ? fromMarkdown(content, { extensions: [mdxjs()], mdastExtensions: [mdxFromMarkdown()] })
      : fromMarkdown(content);
  } catch {
    // Invalid MDX: detection already warned and read it as Markdown.
    tree = fromMarkdown(content);
  }
  const start = (n: any): number => n.position.start.offset;
  const end = (n: any): number => n.position.end.offset;
  // The item's text: its first child, or the item itself when it has none.
  const textOf = (n: any) => {
    const first = n.children?.[0] ?? n;
    return { startIndex: start(n), textStart: start(first), textEnd: end(first) };
  };
  // A Step's text: its `title`, else its first child.
  const stepOf = (n: any) => {
    const title = n.attributes?.find((a: any) => a.name === "title" && typeof a.value === "string")?.value;
    return { ...textOf(n), ...(title && { text: title.trim() }) };
  };

  const lists: RawList[] = [];
  const walk = (node: any) => {
    for (const child of node.children ?? []) {
      if (child.type === "list" && child.ordered) {
        lists.push({ explicit: false, startIndex: start(child), endIndex: end(child), items: child.children.map(textOf) });
      } else if (child.type === "mdxJsxFlowElement" && child.name === "Steps") {
        const steps = child.children.filter((c: any) => c.type === "mdxJsxFlowElement" && c.name === "Step");
        lists.push({ explicit: true, startIndex: start(child), endIndex: end(child), items: steps.map(stepOf) });
      } else {
        walk(child);
      }
    }
  };
  walk(tree);
  return lists;
}

// Inline tags rewritten to Markdown marks, so the tagger reads them the same way.
const CODE_TAGS = new Set(["code", "codeph", "kbd", "samp", "filepath", "cmdname", "userinput"]);
const LABEL_TAGS = new Set(["b", "strong", "uicontrol", "wintitle"]);
const LIST_TAGS = new Set(["ol", "ul", "steps", "steps-unordered", "substeps", "dl"]);
const SKIP_TAGS = new Set(["pre", "codeblock", "script", "style", "screen"]);
// The item's text is its first block, such as a `<p>` or DITA `<cmd>`.
const BLOCK_TAGS = new Set(["p", "div", "cmd", "info", "stepxmp", "stepresult", "note", "table"]);

/**
 * HTML `<ol>` and DITA `<ol>` or `<steps>`, with `<li>` or `<step>` items.
 * DITA `<steps>` is explicit. A list inside another list's item belongs to
 * that item.
 */
function markupLists(content: string, dialect: "html" | "dita"): RawList[] {
  const lists: RawList[] = [];
  let list: { raw: RawList; depth: number } | null = null;
  let item: { depth: number; text: string; done: boolean } | null = null;
  let skip = 0;
  let depth = 0;
  const parser = new Parser(
    {
      onopentag(tag) {
        depth++;
        if (SKIP_TAGS.has(tag)) skip++;
        if (!list) {
          if (tag === "ol" || (dialect === "dita" && tag === "steps")) {
            list = { raw: { explicit: tag === "steps", startIndex: parser.startIndex, endIndex: parser.endIndex + 1, items: [] }, depth };
          }
          return;
        }
        if (depth === list.depth + 1 && (tag === "li" || tag === "step")) {
          item = { depth, text: "", done: false };
          list.raw.items.push({ startIndex: parser.startIndex, textStart: 0, textEnd: 0 });
        } else if (item && !item.done) {
          // A nested list, or a block after text, ends the item's own text.
          if (LIST_TAGS.has(tag) || (BLOCK_TAGS.has(tag) && item.text.trim())) item.done = true;
          else if (CODE_TAGS.has(tag)) item.text += "`";
          else if (LABEL_TAGS.has(tag)) item.text += "**";
        }
      },
      ontext(text) {
        if (item && !item.done && !skip) item.text += text;
      },
      onclosetag(tag) {
        if (SKIP_TAGS.has(tag)) skip--;
        if (list && item && !item.done) {
          if (CODE_TAGS.has(tag)) item.text += "`";
          else if (LABEL_TAGS.has(tag)) item.text += "**";
          else if (BLOCK_TAGS.has(tag) && item.text.trim()) item.done = true;
        }
        if (item && depth === item.depth) {
          list!.raw.items[list!.raw.items.length - 1].text = item.text.replace(/\s+/g, " ").trim();
          item = null;
        }
        if (list && depth === list.depth) {
          list.raw.endIndex = parser.endIndex + 1;
          lists.push(list.raw);
          list = null;
        }
        depth--;
      },
    },
    { xmlMode: dialect === "dita", decodeEntities: true }
  );
  parser.end(content);
  return lists;
}

const ADOC_ITEM = /^[ \t]*(\.+|\d+\.)[ \t]+(\S.*)$/;
const ADOC_DELIMITER = /^(?:-{4,}|\.{4,}|\/{4,}|\+{4,}|={4,}|\*{4,}|_{4,})\s*$/;

/**
 * AsciiDoc ordered lists: `. item` and `1. item` lines. Deeper markers belong
 * to the item above. A block attached with `+` stays in its item, and lines
 * inside delimited blocks are never items.
 */
function asciidocLists(content: string): RawList[] {
  const lists: RawList[] = [];
  let list: (RawList & { marker: string; lastEnd: number; blank: boolean; attached: boolean }) | null = null;
  const close = () => {
    if (list) lists.push({ explicit: false, startIndex: list.startIndex, endIndex: list.lastEnd, items: list.items });
    list = null;
  };
  let start = 0;
  const lines = content.split("\n").map((raw) => {
    const text = raw.replace(/\r$/, "");
    const line = { start, end: start + text.length, text };
    start += raw.length + 1;
    return line;
  });
  for (let i = 0; i < lines.length; i++) {
    const { start: lineStart, end, text } = lines[i];
    if (ADOC_DELIMITER.test(text)) {
      const fence = text.trim();
      let j = i + 1;
      while (j < lines.length && lines[j].text.trim() !== fence) j++;
      j = Math.min(j, lines.length - 1);
      i = j;
      // A comment block keeps the list open, and belongs to the item above it.
      if (fence.startsWith("/")) {
        if (list && !list.blank) list.lastEnd = lines[j].end;
        continue;
      }
      if (list?.attached) list.lastEnd = lines[j].end;
      else close();
      if (list) list.attached = false;
      continue;
    }
    if (/^\/\/(?!\/)/.test(text)) {
      // A line comment belongs to the item above it.
      if (list && !list.blank) list.lastEnd = end;
      continue;
    }
    const item = ADOC_ITEM.exec(text);
    if (item) {
      const marker = /^\d/.test(item[1]) ? "1." : item[1];
      // Only more dots nest. Another marker style starts a new list.
      const nested = list && marker.startsWith(".") && list.marker.startsWith(".") && marker.length > list.marker.length;
      if (list && marker !== list.marker && !nested) close();
      if (!list) list = { explicit: false, startIndex: lineStart, endIndex: end, items: [], marker, lastEnd: end, blank: false, attached: false };
      if (marker === list.marker) list.items.push({ startIndex: lineStart, textStart: lineStart, textEnd: end, text: item[2].trim() });
      list.lastEnd = end;
      list.blank = false;
      list.attached = false;
      continue;
    }
    if (!list) continue;
    if (text.trim() === "") {
      list.blank = true;
      continue;
    }
    if (text.trim() === "+") {
      list.attached = true;
      continue;
    }
    // Text right after an item, or attached with `+`, continues it.
    if (!list.blank || list.attached) {
      list.lastEnd = end;
      // A block attribute line or title, as in `[source,bash]`, keeps the attachment for the block below.
      list.attached &&= /^\[.*\]$|^\.[^.\s]/.test(text.trim());
      continue;
    }
    close();
  }
  close();
  return lists;
}
