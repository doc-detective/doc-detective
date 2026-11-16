/**
 * Include resolution for detection (ADR 01212).
 *
 * Replaces each include directive in a documentation source with the included
 * file's content, so detection sees the page the way a reader does. The result
 * keeps a map from every expanded offset back to the file and offset it came
 * from, so locations still point at the text's real home.
 */

import fs from "node:fs";
import path from "node:path";
import { getLineNumber, getLineStarts, safeRegExp } from "../common/src/textUtils.js";
import { parseRst } from "../common/src/detect/rst.js";
import { log, redactUrlForOutput } from "./utils.js";

export { expandIncludes, remapLocations };

// Asciidoctor's `max-include-depth` default.
export const MAX_INCLUDE_DEPTH = 64;

// A run of text and where it starts in its own file.
type Piece = { text: string; file: string; srcStart: number };
type Selection = { ranges: Array<[number, number]> } | { missing: string };
type Base = "fileThenRoot" | "rootThenFile" | "mdx" | "rst";
type Directive = {
  start: number;
  end: number;
  target: string;
  base: Base;
  select?: (text: string) => Selection;
  optional?: boolean;
  // Set when the directive is deliberately left alone; logged at debug.
  skip?: string;
  // An AsciiDoc attribute entry, applied when expansion reaches it.
  attribute?: [string, string];
  // Substitute AsciiDoc `{attr}` references in the target when reached.
  attributes?: boolean;
};
type Report = (level: string, message: string) => void;
type Location = { startIndex: number; endIndex: number };
type Mapped = { file: string; startIndex: number; endIndex: number; line: number };

const isUrl = (target: string) => /^[a-z][a-z0-9+.-]*:\/\//i.test(target);
const familyOf = (fileType: any, family: string) => fileType?.name === family || fileType?.extends === family;

// Each line's [start, end) span, the end past its line break.
function lineSpans(text: string): Array<[number, number]> {
  const spans: Array<[number, number]> = [];
  const re = /[^\n]*\n|[^\n]+$/g;
  for (const m of text.matchAll(re)) spans.push([m.index!, m.index! + m[0].length]);
  return spans;
}

// Lines 1-based and inclusive; a missing end runs to the last line. A
// selection with no lines is missing, named by `label`.
function selectLines(text: string, ranges: Array<[number, number | undefined]>, label: string): Selection {
  const spans = lineSpans(text);
  const out: Array<[number, number]> = [];
  for (const [from, to] of ranges) {
    const last = to === undefined || to < 0 ? spans.length : Math.min(to, spans.length);
    for (let n = Math.max(from, 1); n <= last; n++) out.push(spans[n - 1]);
  }
  return out.length ? { ranges: out } : { missing: label };
}

// Lines inside the wanted named regions, without the marker lines. With no
// names, every line but the markers.
function selectRegions(text: string, start: RegExp, end: RegExp, wanted?: string[]): Selection {
  const open = new Set<string>();
  const seen = new Set<string>();
  const out: Array<[number, number]> = [];
  for (const [s, e] of lineSpans(text)) {
    const line = text.slice(s, e);
    const opened = line.match(start)?.[1];
    const closed = line.match(end)?.[1];
    if (opened) {
      open.add(opened);
      seen.add(opened);
    }
    if (closed) open.delete(closed);
    if (opened || closed) continue;
    if (!wanted || wanted.some((name) => open.has(name))) out.push([s, e]);
  }
  const missing = wanted?.find((name) => !seen.has(name));
  return missing ? { missing } : { ranges: out };
}

const ASCIIDOC_TAG: [RegExp, RegExp] = [/\btag::([\w-]+)\[\]/, /\bend::([\w-]+)\[\]/];
const MDBOOK_ANCHOR: [RegExp, RegExp] = [/ANCHOR:\s*([\w-]+)/, /ANCHOR_END:\s*([\w-]+)/];
const MKDOCS_SECTION: [RegExp, RegExp] = [/--8<--\s*\[start:([\w-]+)\]/, /--8<--\s*\[end:([\w-]+)\]/];

// `path:3:9`, `path:3:`, `path::9`, `path:3`, or `path:name`, as mdBook and
// MkDocs snippets write them. Markers are dropped from whole-file includes too.
function splitSelector(spec: string, markers: [RegExp, RegExp]): { target: string; select: (text: string) => Selection } {
  const m = spec.match(/^(.+?):(\d*)(?::(\d*))?$/) ?? spec.match(/^(.+?):([A-Za-z_][\w-]*)$/);
  if (!m || /^[A-Za-z]$/.test(m[1])) return { target: spec, select: (text) => selectRegions(text, ...markers) };
  const [, target, a, b] = m;
  if (!/^\d*$/.test(a)) return { target, select: (text) => selectRegions(text, ...markers, [a]) };
  const from = a ? Number(a) : 1;
  const to = b === undefined ? (a ? from : undefined) : b ? Number(b) : undefined;
  return { target, select: (text) => selectLines(text, [[from, to]], spec.slice(target.length + 1)) };
}

// Ranges of fenced code blocks, where MDX elements are examples, not content.
function fenceRanges(text: string): Array<[number, number]> {
  const ranges: Array<[number, number]> = [];
  let open: { start: number; fence: string } | undefined;
  for (const [s, e] of lineSpans(text)) {
    const [, fence, rest] = text.slice(s, e).match(/^\s*(`{3,}|~{3,})(.*)/) ?? [];
    if (!fence) continue;
    if (!open) open = { start: s, fence };
    // A closing fence has nothing after it but spaces and tabs (CommonMark).
    else if (fence[0] === open.fence[0] && fence.length >= open.fence.length && /^[ \t]*\r?\n?$/.test(rest)) {
      ranges.push([open.start, e]);
      open = undefined;
    }
  }
  if (open) ranges.push([open.start, text.length]);
  return ranges;
}

function asciidocDirectives(text: string): Directive[] {
  const found: Directive[] = [];
  // Attribute entries apply to the includes after them, in reading order, so
  // expansion applies both as it reaches them.
  const re = /^(?::([\w][\w-]*):[ \t]*(.*?)[ \t]*|include::([^\[\r\n]+)\[([^\]\r\n]*)\][ \t]*)(?=\r?$)/gm;
  for (const m of text.matchAll(re)) {
    if (m[1]) {
      found.push({ start: m.index!, end: m.index!, target: "", base: "fileThenRoot", attribute: [m[1], m[2]] });
      continue;
    }
    const target = m[3];
    const attrs = Object.fromEntries(
      [...m[4].matchAll(/([\w-]+)=("([^"]*)"|[^,]*)/g)].map((a) => [a[1], a[3] ?? a[2]])
    ) as Record<string, string>;
    let select: Directive["select"];
    if (attrs.lines) {
      const ranges = attrs.lines.split(/[;,]/).filter(Boolean).map((r): [number, number | undefined] => {
        const [from, to] = r.split("..");
        // `N..` runs to the last line, like `N..-1`.
        return [Number(from), to === undefined ? Number(from) : to === "" ? undefined : Number(to)];
      });
      select = (t) => selectLines(t, ranges, `lines=${attrs.lines}`);
    } else if (attrs.tag || attrs.tags) {
      const names = (attrs.tag ?? attrs.tags).split(/[;,]/).filter(Boolean);
      select = (t) => selectRegions(t, ...ASCIIDOC_TAG, names);
    }
    const optional = /(^|,)\s*(opts="?[^"]*optional|optional-option)/.test(m[4]);
    found.push({ start: m.index!, end: m.index! + m[0].length, target, base: "fileThenRoot", select, optional, attributes: true });
  }
  return found;
}

function markdownDirectives(text: string, fileText: string): Directive[] {
  const found: Directive[] = [];
  for (const m of text.matchAll(/(?<!\\)\{\{#include\s+([^}\s]+)\s*\}\}/g)) {
    found.push({ start: m.index!, end: m.index! + m[0].length, base: "fileThenRoot", ...splitSelector(m[1], MDBOOK_ANCHOR) });
  }
  for (const m of text.matchAll(/^[ \t]*-{1,}8<-{1,}[ \t]+(["'])([^"'\r\n]+)\1[ \t]*(?=\r?$)/gm)) {
    const start = m.index! + m[0].length - m[0].trimStart().length;
    found.push({ start, end: m.index! + m[0].length, base: "rootThenFile", ...splitSelector(m[2], MKDOCS_SECTION) });
  }
  // Components render nowhere inside code or comments.
  const skipped = [
    ...fenceRanges(text),
    ...[...text.matchAll(/`[^`\r\n]+`|\{\/\*[\s\S]*?\*\/\}|<!--[\s\S]*?-->/g)].map((m) => [m.index!, m.index! + m[0].length]),
  ];
  const inFence = (i: number) => skipped.some(([s, e]) => i >= s && i < e);
  for (const m of text.matchAll(/<Markdown\s+src=["']([^"']+)["']\s*\/>/g)) {
    if (!inFence(m.index!)) found.push({ start: m.index!, end: m.index! + m[0].length, target: m[1], base: "fileThenRoot" });
  }
  // MDX imports map a component name to a file; `<Name />` is where it renders.
  const imports = new Map<string, string>();
  const importRe = /^import\s+(?:(\w+)|\{([^}]*)\}|\*\s+as\s+(\w+))\s+from\s+["']([^"']+\.mdx?)["'];?/gm;
  const fileFences = fenceRanges(fileText);
  for (const m of fileText.matchAll(importRe)) {
    if (fileFences.some(([s, e]) => m.index! >= s && m.index! < e)) continue;
    if (m[1]) imports.set(m[1], m[4]);
    if (m[3]) imports.set(`${m[3]}.Content`, m[4]);
    for (const named of (m[2] ?? "").split(",")) {
      const [name, alias] = named.trim().split(/\s+as\s+/);
      if (name === "Content") imports.set(alias ?? name, m[4]);
    }
  }
  if (imports.size) {
    for (const m of text.matchAll(/<([A-Za-z_][\w]*(?:\.Content)?)\s*\/>/g)) {
      const target = imports.get(m[1]);
      if (target && !inFence(m.index!)) found.push({ start: m.index!, end: m.index! + m[0].length, target, base: "mdx" });
    }
  }
  return found;
}

function rstDirectives(text: string): Directive[] {
  const found: Directive[] = [];
  // An include shown in a code block, literal block, or comment is an example.
  const skipped = parseRst(text)
    .filter((n) => n.kind === "codeBlock" || n.kind === "comment")
    .map((n) => [n.startIndex, n.endIndex]);
  const re = /^([ \t]*)\.\.[ \t]+include::[ \t]+(\S.*?)[ \t]*(?=\r?$)((?:\r?\n\1[ \t]+:[\w-]+:.*?(?=\r?$))*)/gm;
  for (const m of text.matchAll(re)) {
    if (skipped.some(([s, e]) => m.index! >= s && m.index! < e)) continue;
    const options: Record<string, string> = {};
    for (const o of m[3].matchAll(/:([\w-]+):[ \t]*(.*?)[ \t]*(?=\r?$)/gm)) options[o[1]] = o[2];
    const start = m.index! + m[1].length;
    const directive: Directive = { start, end: m.index! + m[0].length, target: m[2], base: "rst" };
    if (m[2].startsWith("<")) directive.skip = "it names a docutils standard include";
    else if ("literal" in options || "code" in options) directive.skip = "it includes the file as literal text";
    directive.select = (t) => {
      const spans = lineSpans(t);
      const at = (n: string | undefined, fallback: number) => {
        if (n === undefined) return fallback;
        const i = Math.max(Number(n) < 0 ? spans.length + Number(n) : Number(n), 0);
        return i >= spans.length ? t.length : spans[i][0];
      };
      // Line options that leave nothing warn, named as written.
      const lineOptions = ["start-line", "end-line"].filter((k) => k in options);
      const bad = lineOptions.find((k) => !Number.isInteger(Number(options[k])));
      if (bad) return { missing: `:${bad}: ${options[bad]}` };
      let s = at(options["start-line"], 0);
      let e = at(options["end-line"], t.length);
      if (lineOptions.length && e <= s) return { missing: lineOptions.map((k) => `:${k}: ${options[k]}`).join(" ") };
      if (options["start-after"] !== undefined) {
        const i = t.indexOf(options["start-after"], s);
        if (i < 0 || i >= e) return { missing: options["start-after"] };
        s = i + options["start-after"].length;
      }
      if (options["end-before"] !== undefined) {
        const i = t.indexOf(options["end-before"], s);
        if (i < 0 || i > e) return { missing: options["end-before"] };
        e = i;
      }
      return { ranges: [[s, e]] };
    };
    found.push(directive);
  }
  return found;
}

function customDirectives(text: string, fileType: any): Directive[] {
  const found: Directive[] = [];
  for (const pattern of fileType?.includeStatements ?? []) {
    // Patterns come from the user's own fileType config, like `inlineStatements`.
    const re = safeRegExp(pattern, "gm");
    if (!re) continue;
    for (const m of text.matchAll(re)) {
      if (m[1]) found.push({ start: m.index!, end: m.index! + m[0].length, target: m[1], base: "fileThenRoot" });
    }
  }
  return found;
}

function findAncestor(dir: string, names: string[]): string | undefined {
  for (let d = dir; ; d = path.dirname(d)) {
    if (names.some((name) => fs.existsSync(path.join(d, name)))) return d;
    if (path.dirname(d) === d) return undefined;
  }
}

// Where a target may live, in the order to try. Empty means don't follow it.
function candidatesFor(target: string, base: Base, file: string, root: string): string[] {
  const dir = path.dirname(file);
  if (base === "mdx") {
    if (target.startsWith("@site/")) {
      const site = findAncestor(dir, ["docusaurus.config.js", "docusaurus.config.ts", "docusaurus.config.mjs", "docusaurus.config.cjs"]);
      return site ? [path.join(site, target.slice("@site/".length))] : [];
    }
    if (target.startsWith("/")) {
      const docs = findAncestor(dir, ["docs.json", "mint.json"]);
      return docs ? [path.join(docs, target)] : [];
    }
    return target.startsWith(".") ? [path.resolve(dir, target)] : [];
  }
  if (base === "rst" && target.startsWith("/")) {
    const source = findAncestor(dir, ["conf.py"]);
    if (source) return [path.join(source, target)];
  }
  if (path.isAbsolute(target)) return [target];
  const fromFile = path.resolve(dir, target);
  const fromRoot = path.resolve(root, target);
  return base === "rootThenFile" ? [fromRoot, fromFile] : [fromFile, fromRoot];
}

const isFile = (candidate: string) => {
  try {
    return fs.statSync(candidate).isFile();
  } catch {
    return false;
  }
};
const inside = (child: string, parent: string) => {
  const rel = path.relative(parent, child);
  return rel === "" || (!rel.startsWith("..") && !path.isAbsolute(rel));
};
export const realpath = (file: string) => {
  try {
    return fs.realpathSync(file);
  } catch {
    return path.resolve(file);
  }
};
const trimFinalBreak = (pieces: Piece[]) => {
  const last = pieces[pieces.length - 1];
  if (last) last.text = last.text.replace(/\r?\n$/, "");
  return pieces.filter((p) => p.text.length > 0);
};

/**
 * Expands the includes in one file's content.
 *
 * @returns the expanded content, the real paths of every included file, and
 * `mapLocation`, which turns an expanded `{startIndex, endIndex}` into the
 * file, offsets, and line that hold it.
 */
function expandIncludes({
  content,
  filePath,
  fileType,
  config,
  root = process.cwd(),
  report = (level, message) => log(config, level, message),
}: {
  content: string;
  filePath: string;
  fileType: any;
  config: any;
  root?: string;
  report?: Report;
}) {
  const rootReal = realpath(root);
  const rootFile = path.resolve(filePath);
  const texts = new Map<string, string>([[rootFile, content]]);
  const included = new Set<string>();
  const attributes = new Map<string, string>();
  const fileTypeFor = (file: string, parent: any) =>
    config.fileTypes?.find((ft: any) => ft.extensions?.includes(path.extname(file).slice(1))) ?? parent;

  // `null` keeps the directive as text; `[]` replaces it with nothing.
  const resolve = (d: Directive, file: string, offset: number, chain: string[], ft: any): Piece[] | null => {
    const from = `${file}:${getLineNumber(texts.get(file)!, offset)}`;
    if (d.skip) {
      report("debug", `Skipped: include \`${d.target}\` from ${from}, because ${d.skip}.`);
      return null;
    }
    if (isUrl(d.target)) {
      report("warning", `Skipped: include \`${redactUrlForOutput(d.target)}\` from ${from}. Detection reads only local files.`);
      return null;
    }
    const candidates = candidatesFor(d.target, d.base, file, rootReal);
    if (!candidates.length) {
      report("debug", `Skipped: include \`${d.target}\` from ${from}, because it isn't a file path.`);
      return null;
    }
    const found = candidates.find(isFile);
    const missing = `Couldn't include \`${d.target}\` from ${from} because ${found ?? candidates[0]} doesn't exist or can't be read.`;
    if (!found) {
      report(d.optional ? "debug" : "warning", missing);
      return null;
    }
    const real = realpath(found);
    if (!inside(real, rootReal)) {
      report("warning", `Couldn't include \`${d.target}\` from ${from} because ${found} is outside the working directory ${rootReal}. Run Doc Detective from a directory that contains both files.`);
      return null;
    }
    if (chain.includes(real)) {
      report("warning", `Couldn't include \`${d.target}\` from ${from} because it includes itself: ${[...chain, real].join(" → ")}.`);
      return null;
    }
    if (chain.length > MAX_INCLUDE_DEPTH) {
      report("warning", `Couldn't include \`${d.target}\` from ${from} because includes nest more than ${MAX_INCLUDE_DEPTH} levels deep.`);
      return null;
    }
    let text = texts.get(real);
    if (text === undefined) {
      try {
        text = fs.readFileSync(real, "utf8");
      } catch {
        report("warning", missing);
        return null;
      }
      texts.set(real, text);
    }
    included.add(real);
    const selection = d.select ? d.select(text) : { ranges: [[0, text.length]] as Array<[number, number]> };
    if ("missing" in selection) {
      report("warning", `Couldn't find \`${selection.missing}\` in ${real}, included from ${from}.`);
      return [];
    }
    report("debug", `Included ${real} from ${from}.`);
    // Adjacent ranges join, so a comment spanning selected lines stays whole.
    const ranges: Array<[number, number]> = [];
    for (const [s, e] of selection.ranges.filter(([s, e]) => e > s)) {
      const last = ranges[ranges.length - 1];
      if (last && last[1] === s) last[1] = e;
      else ranges.push([s, e]);
    }
    const pieces = ranges.map(([s, e]) => ({ text: text!.slice(s, e), file: real, srcStart: s }));
    const expanded = trimFinalBreak(expand(pieces, fileTypeFor(real, ft), [...chain, real]));
    return path.extname(file) === ".mdx" ? expanded.map(asMdx) : expanded;
  };

  // `ft` is the file type of the pieces; nested files pass their own.
  const expand = (pieces: Piece[], ft: any, chain: string[]): Piece[] => {
    const file = pieces[0]?.file ?? rootFile;
    // The whole file, so MDX imports outside a selected range still apply.
    // Every file is read into `texts` before its pieces expand.
    const fileText = texts.get(file)!;
    const out: Piece[] = [];
    for (const piece of pieces) {
      const directives = [
        ...(familyOf(ft, "asciidoc") ? asciidocDirectives(piece.text) : []),
        ...(familyOf(ft, "markdown") ? markdownDirectives(piece.text, fileText) : []),
        ...(familyOf(ft, "rst") ? rstDirectives(piece.text) : []),
        ...customDirectives(piece.text, ft),
      ]
        .sort((a, b) => a.start - b.start)
        .filter((d, i, all) => i === 0 || d.start >= all[i - 1].end);
      let pos = 0;
      for (const d of directives) {
        if (d.attribute) {
          attributes.set(...d.attribute);
          continue;
        }
        // Directives are built fresh for each expansion, so this mutation is safe.
        if (d.attributes) d.target = d.target.replace(/\{([\w-]+)\}/g, (all, name) => attributes.get(name) ?? all);
        const offset = piece.srcStart + d.start;
        const resolved = resolve(d, piece.file, offset, chain, ft);
        if (resolved === null) continue;
        if (d.start > pos) out.push({ text: piece.text.slice(pos, d.start), file: piece.file, srcStart: piece.srcStart + pos });
        // A directive indented on its own line indents every included line.
        const lineStart = piece.text.lastIndexOf("\n", d.start - 1) + 1;
        const indent = piece.text.slice(lineStart, d.start);
        out.push(...(/^[ \t]+$/.test(indent) ? indentPieces(resolved, indent, file, offset) : resolved));
        pos = d.end;
      }
      if (pos < piece.text.length) out.push({ text: piece.text.slice(pos), file: piece.file, srcStart: piece.srcStart + pos });
    }
    return out;
  };

  const chain = [realpath(rootFile)];
  const pieces = expand([{ text: content, file: rootFile, srcStart: 0 }], fileType, chain);

  const starts: number[] = [];
  let total = 0;
  for (const p of pieces) {
    starts.push(total);
    total += p.text.length;
  }
  const lineStarts = new Map<string, number[]>();
  const pieceAt = (i: number) => {
    let lo = 0;
    let hi = pieces.length - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (starts[mid] <= i) lo = mid;
      else hi = mid - 1;
    }
    return lo;
  };
  const mapLocation = ({ startIndex, endIndex }: Location): Mapped => {
    if (!pieces.length) return { file: rootFile, startIndex, endIndex, line: 1 };
    const a = pieceAt(startIndex);
    const piece = pieces[a];
    const start = piece.srcStart + (startIndex - starts[a]);
    const b = pieceAt(Math.max(endIndex - 1, startIndex));
    // A span that crosses into another file ends where it started.
    const end = pieces[b].file === piece.file ? pieces[b].srcStart + (endIndex - starts[b]) : start;
    const text = texts.get(piece.file)!;
    if (!lineStarts.has(piece.file)) lineStarts.set(piece.file, getLineStarts(text));
    return { file: piece.file, startIndex: start, endIndex: end, line: getLineNumber(text, start, lineStarts.get(piece.file)) };
  };

  return { content: pieces.map((p) => p.text).join(""), included, mapLocation };
}

// An MDX page can't hold an HTML comment, so a non-MDX file's comments become
// MDX comments outside code fences. `<!--` becomes `{/* ` (a space pads it to
// four characters) and `-->` becomes `*/}`, so every offset still maps back.
function asMdx(piece: Piece): Piece {
  if (path.extname(piece.file) === ".mdx") return piece;
  const fences = fenceRanges(piece.text);
  const text = piece.text.replace(/<!--([\s\S]*?)-->/g, (all, body, offset) =>
    fences.some(([s, e]) => offset >= s && offset < e) ? all : `{/* ${body}*/}`
  );
  return { ...piece, text };
}

// Indents every line after the first. The indent maps to the directive.
function indentPieces(pieces: Piece[], indent: string, file: string, offset: number): Piece[] {
  const out: Piece[] = [];
  for (const piece of pieces) {
    let pos = 0;
    for (const m of piece.text.matchAll(/\n/g)) {
      const cut = m.index! + 1;
      out.push({ text: piece.text.slice(pos, cut), file: piece.file, srcStart: piece.srcStart + pos });
      out.push({ text: indent, file, srcStart: offset });
      pos = cut;
    }
    if (pos < piece.text.length) out.push({ text: piece.text.slice(pos), file: piece.file, srcStart: piece.srcStart + pos });
  }
  return out;
}

/**
 * Points every test and step `location` at the file that holds its text,
 * adding `location.file` when that isn't the spec's own file.
 */
function remapLocations(tests: any[], expansion: ReturnType<typeof expandIncludes>, contentPath: string) {
  const own = path.resolve(contentPath);
  const remap = (holder: any) => {
    if (!holder?.location) return;
    const { file, startIndex, endIndex, line } = expansion.mapLocation(holder.location);
    holder.location = { line, startIndex, endIndex, ...(file === own ? {} : { file }) };
  };
  for (const test of tests) {
    remap(test);
    for (const step of test.steps ?? []) remap(step);
  }
}
