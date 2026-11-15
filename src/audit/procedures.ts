/**
 * Finds the lists in a file that `audit` treats as procedures, from each
 * format's parse tree, never from a raw text scan (ADR 01207).
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
  /** Start and end of each item's own text, plus where the item starts. */
  items: Array<{ startIndex: number; textStart: number; textEnd: number }>;
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
  else return null;

  return raw.map((list) => {
    const items = list.items.map((item, i) => ({
      startIndex: item.startIndex,
      endIndex: list.items[i + 1]?.startIndex ?? list.endIndex,
      text: itemText(content, item.textStart, item.textEnd),
    }));
    const marked = markers.some((end) => end <= list.startIndex && content.slice(end, list.startIndex).trim() === "");
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
    const first = n.children?.find((c: any) => c.type !== "mdxJsxAttribute") ?? n;
    return { startIndex: start(n), textStart: start(first), textEnd: end(first) };
  };

  const lists: RawList[] = [];
  const walk = (node: any) => {
    for (const child of node.children ?? []) {
      if (child.type === "list" && child.ordered) {
        lists.push({ explicit: false, startIndex: start(child), endIndex: end(child), items: child.children.map(textOf) });
      } else if (child.type === "mdxJsxFlowElement" && child.name === "Steps") {
        const steps = child.children.filter((c: any) => c.type === "mdxJsxFlowElement" && c.name === "Step");
        lists.push({ explicit: true, startIndex: start(child), endIndex: end(child), items: steps.map(textOf) });
      } else {
        walk(child);
      }
    }
  };
  walk(tree);
  return lists;
}
