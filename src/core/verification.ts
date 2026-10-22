import crypto from "node:crypto";
import { requireYaml } from "./lazyYaml.js";

// ===========================================================================
// Verification metadata write-back (ADR 01140).
//
// A page opts in by listing a `verified-by` entry with `tool: doc-detective`
// and a `check` naming a test or spec id, either in its front matter or in an
// inline `meta` statement. When that check passes, Doc Detective fills the
// entry's `version` and `passed`, and sets `last-verified` to the oldest
// `passed` across the entries once every entry has one. Other tools' entries
// are never touched, and nothing is written on any other result.
//
// The keys are manni's shared vocabulary (manni:stewardship 1.2.0, proposal
// 0098), and the inline form is manni's `meta` statement (proposal 0099). The
// statement scanner, anchoring and pin below port manni's own rules
// (src/shared/statements.ts and src/meta/core/statements.ts), so a pin written
// here is the pin `manni meta derive` writes. test/verification-fixtures/ holds
// pages pinned by manni, and the tests check this port against them.
// ===========================================================================

export const VERIFIED_TOOL = "doc-detective";
const TOOL = VERIFIED_TOOL;

export interface VerificationOptions {
  /** The pass date to write, a UTC day. */
  today: string;
  /** Doc Detective's own version. */
  version: string;
  /** The roll-up result of a test or spec id, or null when no unit has that id. */
  resolve: (check: string) => string | null;
  /** Called once per check that matches no test or spec. */
  onUnknown?: (check: string) => void;
}

interface Edit {
  start: number;
  end: number;
  text: string;
}

// Apply edits made against one text, in order; edits at one offset keep the
// order they were made in.
// Precondition: edits never overlap. Every caller edits disjoint node ranges or
// inserts at a point; an overlapping edit would drop the text between them.
function applyEdits(text: string, edits: Edit[]): string {
  const sorted = edits.map((e, i) => ({ ...e, i })).sort((a, b) => a.start - b.start || a.i - b.i);
  let out = "";
  let pos = 0;
  for (const e of sorted) {
    out += text.slice(pos, e.start) + e.text;
    pos = e.end;
  }
  return out + text.slice(pos);
}

function isRecord(value: unknown): value is Record<string, any> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

// The oldest of the entries' pass dates, or undefined when any entry has none.
function oldest(values: (string | undefined)[]): string | undefined {
  let best: string | undefined;
  let bestTime = Infinity;
  for (const value of values) {
    if (value === undefined) return undefined;
    const time = Date.parse(value);
    if (Number.isNaN(time)) return undefined;
    if (time < bestTime) {
      best = value;
      bestTime = time;
    }
  }
  return best;
}

// Fill every doc-detective entry whose check passed. Returns whether any did,
// and each entry's pass date afterwards, read through `passedOf`.
function fillEntries<T>(
  entries: T[],
  read: (entry: T) => { tool: unknown; check: unknown; passed: string | undefined } | undefined,
  fill: (entry: T) => void,
  opts: VerificationOptions
): { any: boolean; passed: (string | undefined)[] } {
  let any = false;
  const passed = entries.map((entry) => {
    const e = read(entry);
    if (!e) return undefined;
    if (e.tool !== TOOL || typeof e.check !== "string") return e.passed;
    const result = opts.resolve(e.check);
    if (result === null) opts.onUnknown?.(e.check);
    if (result !== "PASS") return e.passed;
    fill(entry);
    any = true;
    return opts.today;
  });
  return { any, passed };
}

// --------------------------------------------------------------------------
// Front matter
// --------------------------------------------------------------------------

const FRONT_MATTER = /^\uFEFF?---[ \t]*\r?\n([\s\S]*?)^---[ \t]*$/m;

function frontMatter(content: string): { start: number; src: string; end: number } | undefined {
  const fm = FRONT_MATTER.exec(content);
  if (!fm || fm.index !== 0) return undefined;
  const start = fm[0].indexOf("\n") + 1;
  return { start, src: fm[1], end: fm[0].length };
}

// Set `key` on a YAML map as a text edit: replace the value in place (keeping
// its quotes), or add the key at the end of the map, in its style.
function setKey(src: string, map: any, key: string, value: string, eol: string, edits: Edit[]): void {
  const YAML = requireYaml();
  const pair = map.items.find((p: any) => YAML.isScalar(p.key) && p.key.value === key);
  if (pair) {
    const v = pair.value;
    if (!YAML.isScalar(v) || !v.range || String(v.value) === value) return;
    const quote = src[v.range[0]];
    const text = quote === '"' || quote === "'" ? `${quote}${value}${quote}` : value;
    // A key with no value (`passed:`) has a zero-length value range right after
    // its colon, so the value needs a separating space.
    const gap = v.range[0] === v.range[1] && !/\s/.test(src[v.range[0] - 1] ?? "") ? " " : "";
    edits.push({ start: v.range[0], end: v.range[1], text: `${gap}${text}` });
    return;
  }
  if (map.flow) {
    const close = src.lastIndexOf("}", map.range[1] - 1);
    edits.push({ start: close, end: close, text: `${map.items.length > 0 ? ", " : ""}${key}: ${value}` });
    return;
  }
  const { at, indent } = blockEnd(src, map);
  edits.push({ start: at, end: at, text: `${eol}${indent}${key}: ${value}` });
}

// Where a block map or sequence's last line ends (past any trailing comment,
// before its line break), and the indent its items start at.
function blockEnd(src: string, node: any): { at: number; indent: string } {
  const YAML = requireYaml();
  const last = node.items[node.items.length - 1];
  const tail: any = YAML.isPair(last) ? ((last.value as any)?.range ? last.value : last.key) : last;
  let end: number = tail.range[1];
  while (end > 0 && /\s/.test(src[end - 1])) end--;
  const nl = src.indexOf("\n", end);
  const at = nl === -1 ? src.length : src[nl - 1] === "\r" ? nl - 1 : nl;
  const column = node.range[0] - (src.lastIndexOf("\n", node.range[0] - 1) + 1);
  return { at, indent: " ".repeat(column) };
}

// `verification.write: true`: give a passing page with no Doc Detective entry
// a `verified-by` entry naming its spec, for the fill to complete in the same
// run. The entry goes at the end of an existing list, or of the front matter,
// in its style; a page without front matter gets a block. A page that already
// names doc-detective, or whose front matter isn't a YAML map, is unchanged.
export function declarePage(content: string, specId: string): string {
  const check = /^[A-Za-z0-9._/-]+$/.test(specId) ? specId : JSON.stringify(specId);
  const fm = frontMatter(content);
  const eol = (fm ? content.slice(0, fm.end) : content).includes("\r\n") ? "\r\n" : "\n";
  const item = (indent: string) => `${indent}- tool: ${TOOL}${eol}${indent}  check: ${check}`;
  if (!fm) {
    const bom = content.charCodeAt(0) === 0xfeff ? "﻿" : "";
    return `${bom}---${eol}verified-by:${eol}${item("  ")}${eol}---${eol}${content.slice(bom.length)}`;
  }
  const YAML = requireYaml();
  const doc = YAML.parseDocument(fm.src);
  if (doc.errors.length > 0) return content;
  const root: any = doc.contents;
  const edits: Edit[] = [];
  if (root === null) {
    edits.push({ start: 0, end: 0, text: `verified-by:${eol}${item("  ")}${eol}` });
  } else if (!YAML.isMap(root)) {
    return content;
  } else {
    const list: any = root.get("verified-by", true);
    if (list === undefined) {
      if (root.flow) {
        const close = fm.src.lastIndexOf("}", root.range![1] - 1);
        const text = `${root.items.length > 0 ? ", " : ""}verified-by: [{tool: ${TOOL}, check: ${check}}]`;
        edits.push({ start: close, end: close, text });
      } else {
        const { at, indent } = blockEnd(fm.src, root);
        edits.push({ start: at, end: at, text: `${eol}${indent}verified-by:${eol}${item(`${indent}  `)}` });
      }
    } else if (!YAML.isSeq(list)) {
      return content;
    } else if (list.items.some((i: any) => YAML.isMap(i) && i.get("tool") === TOOL)) {
      return content;
    } else if (list.flow) {
      const close = fm.src.lastIndexOf("]", list.range![1] - 1);
      const text = `${list.items.length > 0 ? ", " : ""}{tool: ${TOOL}, check: ${check}}`;
      edits.push({ start: close, end: close, text });
    } else {
      const { at, indent } = blockEnd(fm.src, list);
      edits.push({ start: at, end: at, text: `${eol}${item(indent)}` });
    }
  }
  return content.slice(0, fm.start) + applyEdits(fm.src, edits) + content.slice(fm.start + fm.src.length);
}

function writeFrontMatter(content: string, opts: VerificationOptions): string {
  const fm = frontMatter(content);
  if (!fm || !fm.src.includes("verified-by")) return content;
  const YAML = requireYaml();
  const doc = YAML.parseDocument(fm.src);
  if (doc.errors.length > 0 || !YAML.isMap(doc.contents)) return content;
  const root: any = doc.contents;
  const list = root.get("verified-by", true);
  if (!YAML.isSeq(list)) return content;
  const eol = fm.src.includes("\r\n") ? "\r\n" : "\n";
  const edits: Edit[] = [];
  const { any, passed } = fillEntries(
    list.items,
    (item: any) => {
      if (!YAML.isMap(item)) return undefined;
      const p: any = item.get("passed", true);
      return { tool: item.get("tool"), check: item.get("check"), passed: YAML.isScalar(p) ? String(p.value) : undefined };
    },
    (item: any) => {
      // Keys the entry already has go first. An empty `passed:` that ends the
      // entry shares its offset with the line a new key is appended on, and its
      // value must land before that line.
      const values: [string, string][] = [
        ["version", opts.version],
        ["passed", opts.today],
      ];
      values.sort(([a], [b]) => Number(!item.has(a)) - Number(!item.has(b)));
      for (const [key, value] of values) setKey(fm.src, item, key, value, eol, edits);
    },
    opts
  );
  if (!any) return content;
  const last = oldest(passed);
  if (last !== undefined) setKey(fm.src, root, "last-verified", last, eol, edits);
  if (edits.length === 0) return content;
  return content.slice(0, fm.start) + applyEdits(fm.src, edits) + content.slice(fm.start + fm.src.length);
}

// --------------------------------------------------------------------------
// Inline `meta` statements: a port of manni's scanner, anchoring and pin.
// --------------------------------------------------------------------------

// The citations hashing rule: lines joined with LF, one BOM stripped, CRLF
// folded to LF, no trailing LF, as `sha256-<hex>`.
export function pinOf(lines: readonly string[]): string {
  let text = lines.join("\n");
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
  text = text.replace(/\r\n/g, "\n");
  return `sha256-${crypto.createHash("sha256").update(text, "utf8").digest("hex")}`;
}

interface Form {
  open: string;
  close: string;
}
const HTML_COMMENT: Form = { open: "<!--", close: "-->" };
const JSX_COMMENT: Form = { open: "{/*", close: "*/}" };
const LINK_REFERENCE: Form = { open: "[comment]: # (", close: ")" };
const PI_FORM: Form = { open: "<?manni", close: "?>" };
const FORMS: Record<string, Form[]> = {
  markdown: [HTML_COMMENT, JSX_COMMENT, LINK_REFERENCE],
  html: [HTML_COMMENT],
  asciidoc: [{ open: "// (", close: ")" }],
  dita: [PI_FORM, HTML_COMMENT],
};
// cite's marker forms, which also count as marker-only lines when anchoring.
const CITE_FORMS: Record<string, Form[]> = { ...FORMS, dita: [HTML_COMMENT] };

const isLineForm = (form: Form): boolean => form.close === ")";

function lineEnd(content: string, pos: number): number {
  const nl = content.indexOf("\n", pos);
  return nl === -1 ? content.length : nl;
}
function lineText(content: string, pos: number, end: number): string {
  const text = content.slice(pos, end);
  return text.endsWith("\r") ? text.slice(0, -1) : text;
}
function beforeCr(content: string, end: number): number {
  return end > 0 && content.charCodeAt(end - 1) === 13 ? end - 1 : end;
}
function nextLineStart(content: string, offset: number): number {
  if (offset === 0 || content.charCodeAt(offset - 1) === 10) return offset;
  return lineEnd(content, offset) + 1;
}
function lineAt(content: string, offset: number): number {
  let line = 1;
  const stop = Math.min(offset, content.length);
  for (let at = content.indexOf("\n"); at !== -1 && at < stop; at = content.indexOf("\n", at + 1)) line++;
  return line;
}
function offsetOfLine(content: string, line: number): number {
  let pos = 0;
  for (let n = 1; n < line; n++) {
    const nl = content.indexOf("\n", pos);
    if (nl === -1) return content.length;
    pos = nl + 1;
  }
  return pos;
}
const isCite = (inner: string): boolean => inner === "cite" || (inner.startsWith("cite") && /\s/.test(inner.charAt(4)));
const isMetaKeyword = (inner: string): boolean =>
  inner === "meta" || (inner.startsWith("meta") && /\s/.test(inner.charAt(4)));

function isMarkerLine(line: string, format: string): boolean {
  const text = line.trim();
  const cite = (CITE_FORMS[format] || []).some((form) => {
    if (text.length < form.open.length + form.close.length || !text.startsWith(form.open)) return false;
    const closeAt = text.indexOf(form.close, form.open.length);
    if (closeAt !== text.length - form.close.length) return false;
    return isCite(text.slice(form.open.length, closeAt).trim());
  });
  if (cite) return true;
  return (FORMS[format] || []).some((form) => {
    if (text.length < form.open.length + form.close.length) return false;
    if (!text.startsWith(form.open) || !text.endsWith(form.close)) return false;
    const closeAt = isLineForm(form) ? text.length - form.close.length : text.indexOf(form.close, form.open.length);
    if (closeAt !== text.length - form.close.length) return false;
    return isMetaKeyword(text.slice(form.open.length, closeAt).trim());
  });
}

const ATX_HEADING = /^[ \t]*#{1,6}([ \t]|$)/;
const ASCIIDOC_TITLE = /^={1,6}[ \t]/;
const ADORNMENT = /^[ \t]*([-=~^"'*+#_:<>])(?:[ \t]*\1){2,}[ \t]*$/;
const TAG_LINE = /^[ \t]*<\/?[A-Za-z][^<>]*>[ \t]*$/;

function isBoundLine(line: string, format: string): boolean {
  if (ADORNMENT.test(line)) return true;
  if (format === "markdown") return ATX_HEADING.test(line) || TAG_LINE.test(line);
  if (format === "html") return TAG_LINE.test(line);
  if (format === "asciidoc") return ASCIIDOC_TITLE.test(line);
  return false;
}

const ANY_FENCE = /^(?:[ \t]*(?:`{3,}|~{3,})|-{4,})/;
const FENCE: Record<string, RegExp> = { markdown: /^(`{3,}|~{3,})/, asciidoc: /^(-{4,})/ };

function paragraphAfter(content: string, offset: number, format: string): { end: number; line: number } | undefined {
  let pos = offset;
  const firstEnd = lineEnd(content, pos);
  if (lineText(content, pos, firstEnd).trim() === "") pos = firstEnd + 1;
  while (pos < content.length) {
    const end = lineEnd(content, pos);
    const text = lineText(content, pos, end);
    if (text.trim() === "" || isMarkerLine(text, format)) {
      pos = end + 1;
      continue;
    }
    if (ANY_FENCE.test(text)) return undefined;
    const start = pos;
    let last = end;
    let cursor = isBoundLine(text, format) ? content.length : end + 1;
    while (cursor < content.length) {
      const e = lineEnd(content, cursor);
      const t = lineText(content, cursor, e);
      if (t.trim() === "" || ANY_FENCE.test(t) || isMarkerLine(t, format) || isBoundLine(t, format)) break;
      last = e;
      cursor = e + 1;
    }
    return { end: beforeCr(content, last), line: lineAt(content, start) };
  }
  return undefined;
}

// The fenced block opening on `line`, fences included.
function fenceSpanAt(content: string, line: number, format: string): { start: number; end: number } | undefined {
  const fence = FENCE[format];
  if (!fence) return undefined;
  const pos = offsetOfLine(content, line);
  const opener = fence.exec(lineText(content, pos, lineEnd(content, pos)))?.[1];
  if (opener === undefined) return undefined;
  let cursor = Math.min(lineEnd(content, pos) + 1, content.length);
  while (cursor < content.length) {
    const e = lineEnd(content, cursor);
    if (lineText(content, cursor, e).startsWith(opener)) return { start: line, end: lineAt(content, cursor) };
    cursor = e + 1;
  }
  return undefined;
}

// The lines a statement ending at `after` anchors: the rest of its own line
// when that carries text, else the paragraph or fenced block that follows.
function anchoredLines(content: string, after: number, format: string): { start: number; end: number } | undefined {
  const restEnd = lineEnd(content, after);
  if (content.slice(after, restEnd).trim() !== "") {
    const line = lineAt(content, after);
    return { start: line, end: line };
  }
  const paragraph = paragraphAfter(content, after, format);
  if (paragraph !== undefined) return { start: paragraph.line, end: lineAt(content, paragraph.end) };
  let pos = nextLineStart(content, after);
  while (pos < content.length) {
    const end = lineEnd(content, pos);
    const text = lineText(content, pos, end);
    if (text.trim() !== "" && !isMarkerLine(text, format)) return fenceSpanAt(content, lineAt(content, pos), format);
    pos = end + 1;
  }
  return undefined;
}

// Fenced blocks and backtick spans, where no statement is read.
function codeRegions(text: string, format: string): { start: number; end: number }[] {
  const fence = format === "markdown" ? /^[ \t]*(`{3,}|~{3,})/ : format === "asciidoc" ? /^(-{4,})/ : undefined;
  const spans = format === "markdown" || format === "asciidoc";
  const out: { start: number; end: number }[] = [];
  if (!fence) return out;
  let open: { char: string; length: number; start: number } | undefined;
  let pos = 0;
  while (pos < text.length) {
    const nl = text.indexOf("\n", pos);
    const end = nl === -1 ? text.length : nl;
    const line = lineText(text, pos, end);
    if (open) {
      const trimmed = line.trim();
      let n = 0;
      while (trimmed.charAt(n) === open.char) n++;
      if (n >= open.length && n === trimmed.length) {
        out.push({ start: open.start, end });
        open = undefined;
      }
    } else {
      const opener = fence.exec(line)?.[1];
      if (opener !== undefined) open = { char: opener.charAt(0), length: opener.length, start: pos };
      else if (spans) spanRegions(line, pos, out);
    }
    pos = end + 1;
  }
  if (open) out.push({ start: open.start, end: text.length });
  return out;
}
function spanRegions(line: string, lineStart: number, out: { start: number; end: number }[]): void {
  const run = (i: number): number => {
    let n = 0;
    while (line.charCodeAt(i + n) === 96) n++;
    return n;
  };
  let i = 0;
  while (i < line.length) {
    const n = run(i);
    if (n === 0) {
      i++;
      continue;
    }
    let j = i + n;
    let closer = -1;
    while (j < line.length) {
      const m = run(j);
      if (m === 0) j++;
      else if (m === n) {
        closer = j;
        break;
      } else j += m;
    }
    if (closer === -1) {
      i += n;
      continue;
    }
    out.push({ start: lineStart + i, end: lineStart + closer + n });
    i = closer + n;
  }
}

interface Statement {
  line: number;
  start: number;
  end: number;
  /** Where the pin goes, and where the close delimiter starts. */
  pinAt: number;
  closeAt: number;
  pin?: string;
  payload: string;
  broken: boolean;
}

const PIN_TOKEN = /^sha256-[0-9a-f]{64}$/;

function parseStatements(content: string, from: number, format: string): Statement[] {
  const body = content.slice(from);
  const code = codeRegions(body, format);
  const out: Statement[] = [];
  for (const form of FORMS[format] || []) {
    let cursor = 0;
    for (;;) {
      const at = body.indexOf(form.open, cursor);
      if (at === -1) break;
      const region = code.find((r) => at >= r.start && at < r.end);
      if (region) {
        cursor = region.end;
        continue;
      }
      const innerStart = at + form.open.length;
      const closeAt = isLineForm(form) ? body.lastIndexOf(form.close, lineEnd(body, at)) : body.indexOf(form.close, innerStart);
      if (closeAt === -1 || closeAt < innerStart) {
        cursor = innerStart;
        continue;
      }
      cursor = closeAt + form.close.length;
      const inner = body.slice(innerStart, closeAt);
      if (!isMetaKeyword(inner.trim())) continue;
      const lead = /^\s*meta\s*/.exec(inner)?.[0] ?? "";
      const rest = inner.slice(lead.length);
      const word = /^\S+/.exec(rest)?.[0] ?? "";
      const pinned = PIN_TOKEN.test(word);
      const payload = (pinned ? rest.slice(word.length) : rest).trim();
      out.push({
        line: lineAt(content, from + at),
        start: from + at,
        end: from + cursor,
        pinAt: from + innerStart + lead.length,
        closeAt: from + closeAt,
        pin: pinned ? word : undefined,
        payload,
        broken:
          (isLineForm(form) && payload.includes(")")) ||
          (format === "dita" && form === HTML_COMMENT && payload.includes("--")),
      });
    }
  }
  return out.sort((a, b) => a.start - b.start);
}

// XML and DITA: a statement anchors an element, start tag to end tag: the
// element it is the first child of, else the next element after it. On a
// section (first child of a titled element, or just before its title) it
// anchors the title.
interface XmlNode {
  kind: "element" | "other" | "text";
  name: string;
  start: number;
  end: number;
  children: XmlNode[];
  parent?: XmlNode;
  blank?: boolean;
  statement?: boolean;
}

function startTagEnd(source: string, at: number): { end: number; selfClosing: boolean } | undefined {
  let quote: string | undefined;
  for (let i = at + 1; i < source.length; i++) {
    const ch = source[i];
    if (quote !== undefined) {
      if (ch === quote) quote = undefined;
    } else if (ch === '"' || ch === "'") quote = ch;
    else if (ch === ">") return { end: i + 1, selfClosing: source[i - 1] === "/" };
  }
  return undefined;
}

function scanXml(content: string, statements: Set<number>): XmlNode {
  const root: XmlNode = { kind: "element", name: "#document", start: 0, end: content.length, children: [] };
  let current = root;
  let i = 0;
  const push = (node: XmlNode): void => {
    node.parent = current;
    current.children.push(node);
  };
  const skipTo = (needle: string, from: number): number => {
    const at = content.indexOf(needle, from);
    return at === -1 ? content.length : at + needle.length;
  };
  while (i < content.length) {
    const lt = content.indexOf("<", i);
    if (lt === -1 || lt > i) {
      const end = lt === -1 ? content.length : lt;
      push({ kind: "text", name: "#text", start: i, end, children: [], blank: content.slice(i, end).trim() === "" });
      i = end;
      continue;
    }
    let end: number;
    if (content.startsWith("<!--", i)) end = skipTo("-->", i + 4);
    else if (content.startsWith("<![CDATA[", i)) {
      end = skipTo("]]>", i + 9);
      push({ kind: "text", name: "#cdata", start: i, end, children: [] });
      i = end;
      continue;
    } else if (content.startsWith("<?", i)) end = skipTo("?>", i + 2);
    else if (content.startsWith("<!", i)) {
      const bracket = content.indexOf("[", i);
      const gt = content.indexOf(">", i);
      end = bracket !== -1 && gt !== -1 && bracket < gt ? skipTo(">", skipTo("]", bracket)) : skipTo(">", i);
    } else if (content.startsWith("</", i)) {
      end = skipTo(">", i);
      current.end = end;
      current = current.parent ?? root;
      i = end;
      continue;
    } else {
      const tag = startTagEnd(content, i);
      const name = /^<([^\s/>]+)/.exec(content.slice(i, i + 256))?.[1];
      if (tag === undefined || name === undefined) {
        i += 1;
        continue;
      }
      const node: XmlNode = { kind: "element", name, start: i, end: tag.end, children: [] };
      // DITA's <data name="manni-meta"> carrier is a statement too.
      if (name === "data" && /\bname\s*=\s*(["'])manni-meta\1/.test(content.slice(i, tag.end))) node.statement = true;
      push(node);
      if (!tag.selfClosing) {
        node.end = content.length;
        current = node;
      }
      i = tag.end;
      continue;
    }
    push({ kind: "other", name: "#other", start: i, end, children: [], statement: statements.has(i) });
    i = end;
  }
  return root;
}

function* walk(node: XmlNode): Generator<XmlNode> {
  yield node;
  for (const child of node.children) yield* walk(child);
}

// Where a statement sits in the file: its comment or instruction, or a
// `<data>` carrier start tag to end tag.
interface Span {
  start: number;
  end: number;
}

function xmlAnchors(
  content: string,
  statements: Statement[]
): { anchors: Map<Statement, { start: number; end: number }>; spans: Span[] } {
  const byStart = new Map(statements.map((s) => [s.start, s]));
  const tree = scanXml(content, new Set(byStart.keys()));
  const spans = [...walk(tree)].filter((n) => n.statement === true).map(({ start, end }) => ({ start, end }));
  const ignorable = (n: XmlNode): boolean => n.kind === "other" || n.blank === true || n.statement === true;
  const titleOf = (n: XmlNode): XmlNode | undefined => n.children.find((c) => c.kind === "element" && c.name === "title");
  const linesOf = (n: XmlNode) => ({ start: lineAt(content, n.start), end: lineAt(content, Math.max(n.start, n.end - 1)) });
  const out = new Map<Statement, { start: number; end: number }>();
  for (const node of walk(tree)) {
    const s = node.kind === "other" ? byStart.get(node.start) : undefined;
    if (!s) continue;
    const parent = node.parent ?? tree;
    const index = parent.children.indexOf(node);
    const firstChild = parent !== tree && parent.children.slice(0, index).every(ignorable);
    const next = parent.children.slice(index + 1).find((c) => c.kind === "element" && c.statement !== true);
    const owner = firstChild ? parent : next?.name === "title" ? parent : undefined;
    const title = owner === undefined || owner === tree ? undefined : titleOf(owner);
    if (title) out.set(s, linesOf(title));
    else if (firstChild) out.set(s, linesOf(parent));
    else if (next) out.set(s, linesOf(next));
  }
  return { anchors: out, spans };
}

// The anchored lines as a pin hashes them, by manni's `anchoredText`
// (proposal 0101). Every statement inside the lines is cut out first, the
// anchoring one and any other, so a tool writing into a statement never
// changes a pin over it. `spans` are every statement on the page, in document
// order. A line that held a statement and is blank after the cut is dropped,
// so moving a statement onto or off its own line keeps the pin. A line blank
// before the cut stays.
function anchoredText(content: string, anchor: { start: number; end: number }, spans: readonly Span[]): string[] {
  const from = Math.max(offsetOfLine(content, anchor.start), content.charCodeAt(0) === 0xfeff ? 1 : 0);
  const nl = content.indexOf("\n", offsetOfLine(content, anchor.end));
  const to = nl === -1 ? content.length : nl;
  let text = "";
  const cuts: number[] = [];
  let at = from;
  for (const s of spans) {
    const end = Math.min(s.end, to);
    if (end <= at || s.start >= to) continue;
    text += content.slice(at, Math.max(s.start, at));
    cuts.push(text.length);
    at = end;
  }
  text += content.slice(at, to);
  const parts = text.split("\n");
  const out: string[] = [];
  let offset = 0;
  parts.forEach((part, i) => {
    const cut = cuts.some((c) => c >= offset && c <= offset + part.length);
    offset += part.length + 1;
    // A CR before an LF is folded, as manni's splitLines folds CRLF.
    const line = (i < parts.length - 1 || to < content.length) && part.endsWith("\r") ? part.slice(0, -1) : part;
    if (!(cut && line.trim() === "")) out.push(line);
  });
  return out;
}

function writeStatements(content: string, format: string, opts: VerificationOptions): string {
  if (!FORMS[format]) return content;
  const from = format === "markdown" || format === "asciidoc" ? (frontMatter(content)?.end ?? 0) : 0;
  const statements = parseStatements(content, from, format);
  if (statements.length === 0) return content;
  const { anchors, spans } =
    format === "dita"
      ? xmlAnchors(content, statements)
      : {
          anchors: new Map(statements.map((s) => [s, anchoredLines(content, s.end, format)] as const)),
          spans: statements.map(({ start, end }) => ({ start, end })),
        };
  const edits: Edit[] = [];
  for (const s of statements) {
    const anchor = anchors.get(s);
    if (s.broken || !anchor) continue;
    let data: unknown;
    try {
      data = JSON.parse(s.payload);
    } catch {
      continue;
    }
    if (!isRecord(data) || !Array.isArray(data["verified-by"])) continue;
    const before = JSON.stringify(data);
    const { any, passed } = fillEntries(
      data["verified-by"] as unknown[],
      (e) => (isRecord(e) ? { tool: e.tool, check: e.check, passed: typeof e.passed === "string" ? e.passed : undefined } : undefined),
      (e) => {
        const entry = e as Record<string, unknown>;
        entry.version = opts.version;
        entry.passed = opts.today;
      },
      opts
    );
    if (!any) continue;
    const last = oldest(passed);
    if (last !== undefined) data["last-verified"] = last;
    const pin = pinOf(anchoredText(content, anchor, spans));
    const json = JSON.stringify(data);
    // A same-day re-run fills the same values over an unchanged block: skip
    // it, so the file stays byte-identical.
    if (pin === s.pin && json === before) continue;
    const trailing = /\s*$/.exec(content.slice(s.pinAt, s.closeAt))?.[0] ?? "";
    edits.push({ start: s.pinAt, end: s.closeAt, text: `${pin} ${json}${trailing}` });
  }
  return edits.length === 0 ? content : applyEdits(content, edits);
}

// Fill Doc Detective's `verified-by` entries in a page's front matter and its
// inline `meta` statements. Returns the page unchanged when nothing passed.
export function applyVerification(content: string, format: string, opts: VerificationOptions): string {
  return writeStatements(writeFrontMatter(content, opts), format, opts);
}
