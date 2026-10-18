/**
 * MDX backend: parses MDX (CommonMark + GFM + MDX syntax) into semantic
 * nodes using the shared mdast walker.
 *
 * MDX differences from markdown that matter for detection:
 * - `{/* … *​/}` expression comments surface as `comment` nodes. HTML
 *   comments (`<!-- -->`) are a syntax error in MDX; they're lifted out
 *   before the parse and surface as `comment` nodes too. Any other syntax
 *   error still throws, and detection degrades to regex-only for that file.
 * - JSX components (flow and inline) surface as `element` nodes with their
 *   static attributes; markdown content nested inside them still surfaces.
 * - `import`/`export` (ESM) statements are ignored.
 */

import { fromMarkdown } from "mdast-util-from-markdown";
import { gfm } from "micromark-extension-gfm";
import { gfmFromMarkdown } from "mdast-util-gfm";
import { mdxjs } from "micromark-extension-mdxjs";
import { mdxFromMarkdown } from "mdast-util-mdx";
import { SemanticNode } from "./types.js";
import { collectNodes } from "./markdown.js";

/**
 * Kramdown/Pandoc attribute-list spans ({: .cls}, {.cls #id key=val}). These
 * are never valid JS expressions ("{: …}" and "{.letter…}" both fail acorn),
 * so in raw MDX they could only ever be syntax errors — blanking them before
 * the parse (length-preserving, so every offset survives) rescues IAL
 * authoring in .mdx without hiding any legitimate expression.
 */
const IAL_SPAN_RE = /\{(?::[^{}\n]*|\.[A-Za-z][^{}\n]*)\}/g;

/**
 * Source spans of fenced and inline code (indented code is off, as in MDX).
 * IAL-shaped text there is literal — `"{:.2f}"`, ```` ```bash {.testIgnore} ````
 * — and blanking it would change captured code or drop the fence meta.
 */
function codeSpans(content: string): Array<[number, number]> {
  const spans: Array<[number, number]> = [];
  const visit = (node: any) => {
    if (node.type === "code" || node.type === "inlineCode") {
      spans.push([node.position.start.offset, node.position.end.offset]);
    } else if (Array.isArray(node.children)) {
      node.children.forEach(visit);
    }
  };
  visit(
    fromMarkdown(content, {
      extensions: [{ disable: { null: ["codeIndented"] } }],
    })
  );
  return spans;
}

/**
 * HTML comments are a syntax error in MDX, but MDX 1 accepted them and docs
 * migrated from markdown carry them; failing the whole file over one would
 * drop every statement in it.
 */
const HTML_COMMENT_RE = /<!--([\s\S]*?)-->/g;

export function parseMdx(content: string): SemanticNode[] {
  let spans: Array<[number, number]> | undefined;
  const inCode = (offset: number) => {
    spans ??= codeSpans(content);
    return spans.some(([start, end]) => offset >= start && offset < end);
  };
  const htmlComments: SemanticNode[] = [];
  // Blank IAL spans and HTML comments outside code (length-preserving, so
  // every offset survives), then parse what's left as MDX.
  const sanitized = content
    .replace(IAL_SPAN_RE, (m, offset: number) =>
      inCode(offset) ? m : " ".repeat(m.length)
    )
    .replace(HTML_COMMENT_RE, (m, inner: string, offset: number) => {
      if (inCode(offset)) return m;
      htmlComments.push({
        kind: "comment",
        startIndex: offset,
        endIndex: offset + m.length,
        content: inner.trim(),
        precedingText: "",
        followingText: "",
        blockId: -1 - htmlComments.length,
      });
      return m.replace(/[^\n]/g, " ");
    });
  const tree = fromMarkdown(sanitized, {
    extensions: [gfm(), mdxjs()],
    mdastExtensions: [gfmFromMarkdown(), mdxFromMarkdown()],
  });
  // Walk with the ORIGINAL content: node offsets are identical, and the IAL
  // post-pass reads the raw source, so blanked attribute lists still attach.
  return [...collectNodes(content, tree), ...htmlComments].sort(
    (a, b) => a.startIndex - b.startIndex
  );
}
