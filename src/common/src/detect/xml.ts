/**
 * DITA/XML backend: parses documents with @rgrove/parse-xml (conformant,
 * pure JS, exact offsets via includeOffsets, comments preserved).
 *
 * Kind mapping: `<!-- -->` → comment, `<b>` → strong, `<i>` → emphasis,
 * `<codeblock>` → codeBlock (language from a `language-*` outputclass),
 * `<image>` → image (src from href), text/CDATA → text runs (raw slices),
 * and every other element → an `element` node with decoded attributes and
 * inner text. Entity decoding is the parser's job — attribute values and
 * element content arrive decoded, replacing the legacy decode-order hacks.
 *
 * Malformed XML throws; parseContent degrades that file to regex-only
 * detection (the legacy `<?doc-detective?>` PI statements keep working).
 */

import { parseXml } from "@rgrove/parse-xml";
import { SemanticNode } from "./types.js";

/** Semantic-mapped tags; these don't double as `element` nodes. */
const EMPHASIS_TAGS: Record<string, "strong" | "emphasis"> = {
  b: "strong",
  i: "emphasis",
};

export function parseDitaXml(content: string): SemanticNode[] {
  try {
    return collectXmlNodes(content, 0, null);
  } catch (err) {
    // Fragment tolerance: statement-only snippets (a lone comment, a bare
    // <data> element) have no root element, which conformant XML parsing
    // rejects. Retry under a synthetic root; offsets shift back afterward.
    // Genuinely malformed XML still throws here and degrades upstream.
    const prefix = "<dd-root>";
    return collectXmlNodes(prefix + content + "</dd-root>", prefix.length, "dd-root");
  }
}

function collectXmlNodes(
  content: string,
  offsetShift: number,
  syntheticRootTag: string | null
): SemanticNode[] {
  const doc = parseXml(content, {
    includeOffsets: true,
    preserveComments: true,
  });
  const nodes: SemanticNode[] = [];
  let nextBlockId = 0;

  const walk = (node: any, blockId: number) => {
    for (const child of node.children) {
      switch (child.type) {
        case "comment": {
          nodes.push({
            kind: "comment",
            startIndex: child.start,
            endIndex: child.end,
            // parse-xml comment content is always a string.
            content: String(child.content).trim(),
            precedingText: "",
            followingText: "",
            blockId,
          });
          break;
        }
        case "text":
        case "cdata": {
          const raw = content.slice(child.start, child.end);
          if (raw.trim()) {
            nodes.push({
              kind: "text",
              startIndex: child.start,
              endIndex: child.end,
              text: raw,
              precedingText: "",
              followingText: "",
              blockId,
            });
          }
          break;
        }
        case "element": {
          const tag = child.name;
          if (tag === syntheticRootTag) {
            walk(child, blockId);
            break;
          }
          if (EMPHASIS_TAGS[tag]) {
            nodes.push({
              kind: EMPHASIS_TAGS[tag],
              startIndex: child.start,
              endIndex: child.end,
              text: child.text,
              precedingText: "",
              followingText: "",
              blockId,
            });
            break;
          }
          if (tag === "codeblock") {
            const outputclass = child.attributes.outputclass ?? "";
            nodes.push({
              kind: "codeBlock",
              startIndex: child.start,
              endIndex: child.end,
              language:
                /(?:^|\s)language-([\w-]+)/.exec(outputclass)?.[1] ?? "",
              meta: "",
              content: child.text,
              precedingText: "",
              followingText: "",
              blockId: ++nextBlockId,
            });
            break;
          }
          if (tag === "image") {
            const semantic: SemanticNode = {
              kind: "image",
              startIndex: child.start,
              endIndex: child.end,
              src: child.attributes.href ?? "",
              alt: child.attributes.alt ?? "",
              precedingText: "",
              followingText: "",
              blockId,
            };
            if (Object.keys(child.attributes).length > 0) {
              semantic.attributes = { ...child.attributes };
            }
            nodes.push(semantic);
            break;
          }
          const semantic: SemanticNode = {
            kind: "element",
            startIndex: child.start,
            endIndex: child.end,
            tag,
            content: child.text,
            precedingText: "",
            followingText: "",
            blockId,
          };
          if (Object.keys(child.attributes).length > 0) {
            semantic.attributes = { ...child.attributes };
          }
          nodes.push(semantic);
          // Each element opens a fresh inline context for its children, so
          // siblings inside one <cmd>/<p> share context for precededBy and
          // then-chaining.
          walk(child, ++nextBlockId);
          break;
        }
        /* c8 ignore next 2 - document children are only elements, text, cdata, and comments */
        default:
          break;
      }
    }
  };

  walk(doc, ++nextBlockId);
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

  if (offsetShift > 0) {
    for (const n of nodes) {
      n.startIndex -= offsetShift;
      n.endIndex -= offsetShift;
    }
  }

  return nodes;
}
