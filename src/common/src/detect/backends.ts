/**
 * Backend selection is automatic — there is no `parser` config field. A
 * built-in extension→backend map resolves the backend per file; files with
 * no mapped extension fall back to the resolved fileType's name (content
 * sniffing picks the fileType upstream). No backend → regex-only detection.
 */

import { BackendParse } from "./types.js";
import { parseMarkdown } from "./markdown.js";
import { parseMdx } from "./mdx.js";
import { parseHtml } from "./html.js";
import { parseDitaXml } from "./xml.js";
import { parseAsciidoc } from "./asciidoc.js";

const backendByExtension: Record<string, BackendParse> = {
  md: parseMarkdown,
  markdown: parseMarkdown,
  mdown: parseMarkdown,
  mkd: parseMarkdown,
  mkdn: parseMarkdown,
  mdx: parseMdx,
  html: parseHtml,
  htm: parseHtml,
  xhtml: parseHtml,
  dita: parseDitaXml,
  ditamap: parseDitaXml,
  xml: parseDitaXml,
  adoc: parseAsciidoc,
  asciidoc: parseAsciidoc,
  asc: parseAsciidoc,
};

const backendByFileTypeName: Record<string, BackendParse> = {
  markdown: parseMarkdown,
  mdx: parseMdx,
  html: parseHtml,
  dita: parseDitaXml,
  asciidoc: parseAsciidoc,
};

export function resolveBackend(
  extension: string,
  fileType?: { name?: string }
): BackendParse | null {
  const ext = (extension || "").toLowerCase();
  const byExt = backendByExtension[ext];
  if (byExt) return byExt;
  if (fileType?.name) {
    return backendByFileTypeName[fileType.name] ?? null;
  }
  return null;
}
