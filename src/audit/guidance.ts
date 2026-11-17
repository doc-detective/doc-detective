/**
 * What `audit` tells a reader to write: per-syntax templates for covering a
 * step, flagging a false positive, and marking a missed procedure (ADR 01207).
 * test/audit-guidance.test.js reads every template back through detection.
 */

import type { FileType } from "../common/src/fileTypes.js";
import { collectStatements, formatOf } from "../common/src/detect/selectors.js";

export interface Templates {
  step: string;
  testStart: string;
  testEnd: string;
  ignoreStart: string;
  ignoreEnd: string;
  ignoreCodeBlock?: string;
  procedure: string;
}

const comment = (open: string, close: string) => (text: string) => `${open} ${text} ${close}`;
const STEP = '{"click": "Save"}';
// A bare `test start` makes detection skip the test in MDX and DITA, so the
// opener names the test.
const TEST = 'test {"testId": "my-test"}';
const templates = (wrap: (text: string) => string, step: string, test: string, ignoreCodeBlock: string): Templates => ({
  step: wrap(step),
  testStart: wrap(test),
  testEnd: wrap("test end"),
  ignoreStart: wrap("test ignore start"),
  ignoreEnd: wrap("test ignore end"),
  ignoreCodeBlock,
  procedure: wrap("procedure"),
});

const html = comment("<!--", "-->");
// DITA uses <data>, which survives every DITA-OT build, and the attribute form
// of a step, which needs no escaped quotes.
const dita = (text: string) => `<data name="doc-detective" value="${text}"/>`;

export const SYNTAXES: Record<string, Templates> = {
  markdown: templates(html, `step ${STEP}`, TEST, "```bash testIgnore"),
  mdx: templates(comment("{/*", "*/}"), `step ${STEP}`, TEST, "```bash testIgnore"),
  asciidoc: templates((text) => `// (${text})`, `step ${STEP}`, TEST, "[source.testIgnore,bash]"),
  html: templates(html, `step ${STEP}`, TEST, '<pre class="testIgnore"><code class="language-bash">'),
  dita: templates(dita, "step click='Save'", "test testId='my-test'", '<codeblock outputclass="language-bash testIgnore">'),
};

const LABELS: Record<string, string> = { markdown: "Markdown", mdx: "MDX", asciidoc: "AsciiDoc", html: "HTML", dita: "DITA" };
export const labelOf = (syntax: string) => LABELS[syntax] ?? syntax;

const KINDS = ["step", "testStart", "testEnd", "ignoreStart", "ignoreEnd", "procedure"] as const;
const TYPE_OF: Record<(typeof KINDS)[number], string> = {
  step: "step",
  testStart: "testStart",
  testEnd: "testEnd",
  ignoreStart: "ignoreStart",
  ignoreEnd: "ignoreEnd",
  procedure: "procedure",
};

/**
 * The file's syntax: a built-in name when its file type reads that syntax's
 * templates, else the file type's name.
 */
export function syntaxFor(fileType: FileType, filePath: string): string {
  const format = formatOf(fileType, filePath);
  const candidate = format === "markdown" && /\.mdx$/i.test(filePath) ? "mdx" : format;
  const t = candidate ? SYNTAXES[candidate] : undefined;
  if (t) {
    const content = KINDS.map((kind) => t[kind]).join("\n\n");
    const types = new Set(collectStatements({ content, fileType, filePath, detectSteps: false, warn: () => {} }).map((s: any) => s.type));
    if (KINDS.every((kind) => types.has(TYPE_OF[kind]))) return candidate!;
  }
  return fileType.name ?? fileType.extensions.join(",");
}

export interface Guidance {
  docs: string;
  coverStep: string;
  flagFalsePositive: string;
  markProcedure: string;
  syntaxes: Record<string, Templates | (Omit<Templates, "ignoreCodeBlock"> & { custom: true; note: string })>;
}

/** The report's `guidance`: shared advice, plus templates for each syntax in the run. */
export function buildGuidance(names: string[]): Guidance {
  const syntaxes: Guidance["syntaxes"] = {};
  for (const syntax of names) {
    if (syntax in syntaxes) continue;
    syntaxes[syntax] = SYNTAXES[syntax] ?? {
      custom: true,
      step: `step ${STEP}`,
      testStart: TEST,
      testEnd: "test end",
      ignoreStart: "test ignore start",
      ignoreEnd: "test ignore end",
      procedure: "procedure",
      note: `Wrap each statement in the comment form that the \`${syntax}\` file type's \`inlineStatements\` define.`,
    };
  }
  return {
    docs: "https://docs.doc-detective.com/docs/test-docs/audit-test-coverage",
    coverStep:
      "Put a step statement inside the item, on the line after the sentence it tests. Or wrap the procedure in a `test` statement and `test end`, with at least one step inside, and its items count as inside a test.",
    flagFalsePositive:
      "Wrap a list that isn't a procedure, or an item you won't test, in `test ignore start` and `test ignore end`. Its items then count as ignored. Tag a code block you won't run with `testIgnore`.",
    markProcedure: "If `audit` misses a procedure and puts it in Possible procedures, put a `procedure` statement directly before the list.",
    syntaxes,
  };
}
