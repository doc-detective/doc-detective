/**
 * Parses Gherkin (`.feature`) into selector nodes, line by line. Every Scenario, and every
 * Examples row of an Outline, becomes a `test <JSON>` comment, its steps, and a `test end`
 * comment, so the inline-statement handling in parseContent opens and closes each test. Each of
 * those nodes has a `sortIndex` inside the scenario's anchor, so Background steps replay inside
 * every test while keeping their real source spans (ADR 01233).
 *
 * - A step is an `element` node with tag `step`. Its content is the text after the keyword.
 * - `#` comments are comment nodes. A `# test {...}` above a Scenario merges into its test, and
 *   `# test end` is dropped, since the scenario ends the test.
 * - Tags and emulation steps (`a 800x600 viewport`, `dark mode`, ...) set the test's `runOn`.
 */

import type { Node } from "./selectors.js";
import { splitLines } from "./asciidoc.js";

// ponytail: English keywords only, and a `# language:` header isn't read. Upgrade: a keyword table per language.
const KEYWORD = /^(Feature|Rule|Background|Scenario Outline|Scenario Template|Scenario|Example|Examples|Scenarios):(.*)$/;
const STEP = /^(Given|When|Then|And|But|\*)\s+(\S.*)$/;
const FENCE = /^("""|```)\s*(\S*)$/;
const BROWSERS = ["chrome", "firefox", "safari", "webkit"];
const PLATFORMS = ["windows", "mac", "linux", "android", "ios"];

interface Row {
  cells: string[];
  start: number;
  end: number;
  line: number;
}
interface Step extends Row {
  keyword: string;
  text: string;
  table: Row[];
  docString?: string;
  mediaType?: string;
}
type Item = Step | Node;
interface Block {
  keyword: string;
  name: string;
  start: number;
  end: number;
  line: number;
  tags: string[];
  items: Item[];
  test?: Record<string, any>;
  /** An Outline's Examples blocks. Undefined for other blocks. */
  examples?: Array<{ tags: string[]; header?: string[]; rows: Row[] }>;
}

const isStep = (item: Item): item is Step => "keyword" in item;
const splitRow = (text: string) =>
  text
    .split(/(?<!\\)\|/)
    .slice(1, -1)
    .map((cell) => cell.trim().replace(/\\\|/g, "|"));
const parseJson = (text: string) => {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
};

/** Sets context emulation from an emulation step. Returns false when the step isn't one. */
function emulate(text: string, emulation: Record<string, any>): boolean {
  let m: RegExpExecArray | null;
  if ((m = /^an? (\d+)x(\d+) viewport$/.exec(text))) emulation.viewport = { width: Number(m[1]), height: Number(m[2]) };
  else if ((m = /^(dark|light) mode$/.exec(text))) emulation.colorScheme = m[1];
  else if ((m = /^the (locale|timezone) is "([^"]+)"$/.exec(text))) emulation[m[1]] = m[2];
  else return false;
  return true;
}

/** Rewrites steps whose action needs a value a template can't compute. */
const rewrite = (text: string) =>
  text
    .replace(/^I wait (\d+(?:\.\d+)?) seconds?$/, (_, n) => `I wait ${Math.round(Number(n) * 1000)} milliseconds`)
    .replace(/^I press "([^"]+)"$/, (_, key: string) => `I press "${key.toUpperCase().replace(/[\s-]+/g, "_")}"`);

export function parseGherkin(content: string, filePath = "", warn: (message: string) => void = () => {}): Node[] {
  const nodes: Node[] = [];
  const lines = splitLines(content);
  let tags: string[] = [];
  let featureTags: string[] = [];
  let ruleTags: string[] = [];
  let featureBackground: Item[] = [];
  let ruleBackground: Item[] = [];
  let inRule = false;
  let userTest: Record<string, any> | undefined;
  let block: Block | null = null;

  const lastStep = (b: Block) => b.items.filter(isStep).at(-1);

  /** Emits one test: its start comment, the Background and scenario items, and its end comment. */
  const emitTest = (b: Block, tagList: string[], anchor: Row, sub: (s: string) => string, suffix = "") => {
    const test: Record<string, any> = { testId: b.name + suffix, description: sub(b.name) };
    const user = b.test ?? {};
    const browsers = new Set<string>();
    const platforms = new Set<string>();
    let headless = false;
    for (const tag of tagList) {
      if (BROWSERS.includes(tag)) browsers.add(tag);
      else if (PLATFORMS.includes(tag)) platforms.add(tag);
      else if (tag === "headless") headless = true;
      else if (tag === "record") test.autoRecord = true;
      else if (tag === "skip" || tag === "wip") test.if = "false";
      else if (tag.startsWith("id:")) test.testId = tag.slice(3) + suffix;
    }

    const emulation: Record<string, any> = {};
    const list: Node[] = [];
    let request: Node | undefined;
    const push = (step: Step, row: Row, text: string, docString?: string) => {
      const attributes: Record<string, string> = { keyword: step.keyword };
      if (docString !== undefined) Object.assign(attributes, { docString, mediaType: step.mediaType });
      const node: Node = { kind: "element", tag: "step", startIndex: row.start, endIndex: row.end, content: text, attributes, before: "" };
      if (user.detectSteps !== false) {
        node.unmatched = `Couldn't map step \`${step.keyword} ${text}\` in \`${filePath}:${row.line}\` to an action. Add a \`step\` statement or a \`markup\` entry.`;
      }
      request = text.startsWith("I send ") ? node : undefined;
      list.push(node);
    };
    for (const item of [...featureBackground, ...ruleBackground, ...b.items]) {
      if (!isStep(item)) {
        list.push({ ...item });
        continue;
      }
      const text = sub(item.text);
      if (emulate(text, emulation)) continue;
      const status = /^the response status (?:should be|is) (\d+)$/.exec(text);
      if (status && request) {
        request.content += ` and the response status should be ${status[1]}`;
        continue;
      }
      const table = /^I (fill in|should see):$/.exec(text);
      if (table && item.table.length) {
        for (const row of item.table) {
          const [first, second] = row.cells.map(sub);
          push(item, row, table[1] === "fill in" ? `I type "${second}" into "${first}"` : `I should see "${first}"`);
        }
        continue;
      }
      push(item, item, rewrite(text), item.docString === undefined ? undefined : sub(item.docString));
    }

    const context: Record<string, any> = {};
    if (platforms.size) context.platforms = [...platforms];
    // Emulation lives on a browser object, which needs a name. Chrome supports every field.
    if (headless || Object.keys(emulation).length) {
      context.browsers = [...(browsers.size ? browsers : ["chrome"])].map((name) => ({ name, ...(headless && { headless }), ...emulation }));
    } else if (browsers.size) context.browsers = [...browsers];
    if (Object.keys(context).length) test.runOn = [context];
    Object.assign(test, user);

    const span = { startIndex: anchor.start, endIndex: anchor.end, before: "" };
    list.unshift({ kind: "comment", ...span, content: `test ${JSON.stringify(test)}` });
    list.push({ kind: "comment", ...span, content: "test end" });
    list.forEach((node, i) => nodes.push(Object.assign(node, { sortIndex: anchor.start + (i + 1) / (list.length + 2) })));
  };

  const close = () => {
    const b = block;
    block = null;
    if (!b) return;
    if (b.keyword === "Background") {
      if (inRule) ruleBackground = b.items;
      else featureBackground = b.items;
      return;
    }
    const inherited = [...featureTags, ...ruleTags, ...b.tags];
    if (!b.examples) return emitTest(b, inherited, { cells: [], ...b }, (s) => s);
    if (!b.examples.length) {
      warn(`Couldn't expand \`${b.keyword}: ${b.name}\` in \`${filePath}:${b.line}\`: it has no \`Examples\`.`);
      return;
    }
    let n = 0;
    for (const examples of b.examples) {
      for (const row of examples.rows) {
        const values = new Map(examples.header!.map((name, k) => [name, row.cells[k]]));
        const sub = (s: string) => s.replace(/<([^<>]+)>/g, (m, name) => values.get(name) ?? m);
        emitTest(b, [...inherited, ...examples.tags], row, sub, ` [row ${++n}]`);
      }
    }
  };

  for (let i = 0; i < lines.length; i++) {
    const { start, end, text: raw } = lines[i];
    const text = raw.trim();
    const at = start + raw.length - raw.trimStart().length;
    const line = i + 1;
    if (text.startsWith("#")) {
      const body = text.slice(1).trim();
      if (body === "test end") continue;
      const json = /^test(?:\s+start)?\s*(\{.*\})$/.exec(body);
      const merged = json ? parseJson(json[1]) : undefined;
      if (merged) {
        userTest = merged;
        continue;
      }
      (block ? block.items : nodes).push({ kind: "comment", startIndex: at, endIndex: end, content: body, before: "" });
      continue;
    }
    if (text.startsWith("@")) {
      for (const token of text.split(/\s+/)) {
        if (token.startsWith("#")) break;
        tags.push(token.slice(1));
      }
      continue;
    }

    const keyword = KEYWORD.exec(text);
    if (keyword) {
      const [, word, name] = keyword;
      if (word === "Examples" || word === "Scenarios") {
        block?.examples?.push({ tags, rows: [] });
      } else {
        close();
        if (word === "Feature") featureTags = tags;
        else if (word === "Rule") {
          ruleTags = tags;
          ruleBackground = [];
          inRule = true;
        } else {
          const scenario = word !== "Background";
          block = { keyword: word, name: name.trim(), start: at, end, line, tags, items: [], ...(scenario && { test: userTest }) };
          if (word.includes(" ")) block.examples = [];
          if (scenario) userTest = undefined;
        }
      }
      tags = [];
      continue;
    }
    if (!block) continue;

    const step = STEP.exec(text);
    if (step) {
      block.items.push({ keyword: step[1], text: step[2], cells: [], start: at, end, line, table: [] });
      continue;
    }
    if (text.startsWith("|")) {
      const row = { cells: splitRow(text), start: at, end, line };
      const examples = block.examples?.at(-1);
      if (!examples) lastStep(block)?.table.push(row);
      else if (examples.header) examples.rows.push(row);
      else examples.header = row.cells;
      continue;
    }
    const fence = FENCE.exec(text);
    if (fence) {
      const indent = new RegExp(`^[ \\t]{0,${at - start}}`);
      const body: string[] = [];
      for (i++; i < lines.length && lines[i].text.trim() !== fence[1]; i++) body.push(lines[i].text.replace(indent, ""));
      const target = lastStep(block);
      if (target) Object.assign(target, { docString: body.join("\n"), mediaType: fence[2] });
    }
    // Anything else is a description.
  }
  close();
  return nodes;
}
