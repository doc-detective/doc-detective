/**
 * What `audit` tells a reader to write: per-syntax templates for covering a
 * step, flagging a false positive, and marking a missed procedure (ADR 01213).
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

// Template keys, which are also the statement types they produce.
// `ignoreCodeBlock` is a code-block attribute, not a statement, so
// test/audit-guidance.test.js checks it end to end instead.
const KINDS = ["step", "testStart", "testEnd", "ignoreStart", "ignoreEnd", "procedure"] as const;

/**
 * The file's syntax: a built-in name when its file type reads that syntax's
 * templates, else the file type's name, marked custom. `keySyntaxes` turns
 * these into the run's unique keys.
 */
export function syntaxFor(fileType: FileType, filePath: string): Syntax {
  const format = formatOf(fileType, filePath);
  const candidate = format === "markdown" && /\.mdx$/i.test(filePath) ? "mdx" : format;
  // The check depends only on the file type and format, so it runs once per pair.
  let byFormat = checked.get(fileType);
  if (!byFormat) checked.set(fileType, (byFormat = new Map()));
  let syntax = byFormat.get(candidate);
  if (!syntax) byFormat.set(candidate, (syntax = check(fileType, filePath, candidate)));
  return syntax;
}

const checked = new WeakMap<FileType, Map<string | undefined, Syntax>>();

function check(fileType: FileType, filePath: string, candidate: string | undefined): Syntax {
  const t = candidate ? SYNTAXES[candidate] : undefined;
  if (t) {
    const content = KINDS.map((kind) => t[kind]).join("\n\n");
    const types = new Set(collectStatements({ content, fileType, filePath, detectSteps: false, warn: () => {} }).map((s) => s.type));
    if (KINDS.every((kind) => types.has(kind))) return { syntax: candidate!, custom: false };
  }
  const name = fileType.name ?? fileType.extensions.join(",");
  return { syntax: name, custom: true, fileType: name };
}

/**
 * Gives each distinct syntax in the run its own key. Built-in syntaxes and
 * custom names that aren't a built-in's keep their names. A custom name that
 * is a built-in's gets `<name>-custom`, numbered from `-2` when that's taken.
 */
export function keySyntaxes(files: Syntax[]): Syntax[] {
  const used = new Set(files.filter((f) => !f.custom || !Object.hasOwn(SYNTAXES, f.syntax)).map((f) => f.syntax));
  const renamed = new Map<string, string>();
  return files.map((file) => {
    if (!file.custom || !Object.hasOwn(SYNTAXES, file.syntax)) return file;
    let key = renamed.get(file.syntax);
    if (!key) {
      key = `${file.syntax}-custom`;
      for (let n = 2; used.has(key); n++) key = `${file.syntax}-custom-${n}`;
      used.add(key);
      renamed.set(file.syntax, key);
    }
    return { ...file, syntax: key };
  });
}

export interface Syntax {
  syntax: string;
  custom: boolean;
  /** A custom syntax's file type name, for its note. */
  fileType?: string;
}

export interface Guidance {
  docs: string;
  coverStep: string;
  flagFalsePositive: string;
  markProcedure: string;
  syntaxes: Record<string, Templates | (Omit<Templates, "ignoreCodeBlock"> & { custom: true; note: string })>;
}

/** The report's `guidance`: shared advice, plus templates for each syntax in the run. */
export function buildGuidance(files: Syntax[]): Guidance {
  // A Map, so a file type named `constructor` or `__proto__` is a key like any other.
  const syntaxes = new Map<string, Guidance["syntaxes"][string]>();
  for (const { syntax, custom, fileType = syntax } of files) {
    if (syntaxes.has(syntax)) continue;
    syntaxes.set(syntax, (!custom && SYNTAXES[syntax]) || {
      custom: true,
      step: `step ${STEP}`,
      testStart: TEST,
      testEnd: "test end",
      ignoreStart: "test ignore start",
      ignoreEnd: "test ignore end",
      procedure: "procedure",
      note: `Wrap each statement in the comment form that the \`${fileType}\` file type's \`inlineStatements\` define.`,
    });
  }
  return {
    docs: "https://docs.doc-detective.com/docs/test-docs/audit-test-coverage",
    coverStep:
      "Put a step statement inside the item, on the line after the sentence it tests. Or wrap the procedure in a `test` statement and `test end`, with at least one step inside, and its items count as inside a test.",
    flagFalsePositive:
      "Wrap a list that isn't a procedure, or an item you won't test, in `test ignore start` and `test ignore end`. Its items then count as ignored. Tag a code block you won't run with `testIgnore`.",
    markProcedure: "If `audit` misses a procedure and puts it in Possible procedures, put a `procedure` statement directly before the list.",
    syntaxes: Object.fromEntries(syntaxes),
  };
}
