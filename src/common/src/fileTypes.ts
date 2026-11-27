/**
 * Default file type definitions for Doc Detective.
 * These are pure data definitions with no Node.js dependencies,
 * shared by both core and vscode extension.
 */

/** Options for one selector kind. See `config_v3`'s `selector*` components. */
export type SelectorOptions = Record<string, any>;

/** The selector kind keys a markup definition or statement container can have. */
export interface SelectorKinds {
  comment?: SelectorOptions;
  codeBlock?: string | SelectorOptions;
  link?: SelectorOptions;
  image?: SelectorOptions;
  strong?: SelectorOptions;
  emphasis?: SelectorOptions;
  text?: SelectorOptions;
  element?: string | SelectorOptions;
}

export interface FileType {
  name?: string;
  extends?: string;
  extensions: string[];
  inlineStatements?: {
    in?: Array<"comment" | (SelectorKinds & { value?: string; regex?: string | string[] })>;
    testStart?: string[];
    testEnd?: string[];
    ignoreStart?: string[];
    ignoreEnd?: string[];
    step?: string[];
  };
  markup?: Array<
    SelectorKinds & {
      name?: string;
      regex?: string[];
      captures?: string[];
      actions?: (string | Record<string, any>)[];
      batchMatches?: boolean;
    }
  >;
  runShell?: Record<string, any>;
}

/** One entry of a fileType's `markup`. */
export type MarkupDefinition = NonNullable<FileType["markup"]>[number];

// Shared by every built-in, so each detects the same intents (ADR 01158).
const GO_TO_VERBS = "\\b(?:[Gg]o\\s+to|[Oo]pen|[Nn]avigate\\s+to|[Vv]isit|[Aa]ccess|[Pp]roceed\\s+to|[Ll]aunch|[Bb]rowse\\s+to)\\b\\s+$";
const CLICK_VERBS = "\\b(?:[Cc]lick|[Tt]ap|[Ll]eft-click|[Cc]hoose|[Ss]elect|[Cc]heck)\\b\\s+$";

const clickOnscreenText: MarkupDefinition = { name: "clickOnscreenText", strong: { precededBy: CLICK_VERBS }, captures: ["text"], actions: ["click"] };
const findOnscreenText: MarkupDefinition = { name: "findOnscreenText", strong: {}, captures: ["text"], actions: ["find"] };
// `text: {}` keeps matching to prose, and the regex runs on each prose run. With no `captures` key,
// $1 is the regex's first group, the quoted text, and the bare "type" action takes $1.
const typeText: MarkupDefinition = { name: "typeText", text: {}, regex: ['\\b(?:[Pp]ress|[Ee]nter|[Tt]ype)\\b\\s+"([^"]+)"'], actions: ["type"] };
const screenshotImage: MarkupDefinition = {
  name: "screenshotImage",
  image: { attributes: { class: "(^|\\s)screenshot" } },
  captures: ["src"],
  actions: ["screenshot"],
};
const httpRequestFormat: MarkupDefinition = {
  name: "httpRequestFormat",
  codeBlock: { language: ["http", ""] },
  regex: ["^([A-Z]+)[ \\t]+(\\S+)(?:[ \\t]+HTTP\\/[\\d.]+)?[ \\t]*(?:\\r?\\n((?:\\S+:[ \\t]+[^\\r\\n]+(?:\\r?\\n|$))+))?(?:\\s+([\\s\\S]+?))?\\s*$"],
  actions: [{ httpRequest: { method: "$1", url: "$2", request: { headers: "$3", body: "$4" } } }],
};
const runCode: MarkupDefinition = {
  name: "runCode",
  codeBlock: { language: ["bash", "python", "py", "javascript", "js"], metaExcludes: "testIgnore" },
  captures: ["language", "content"],
  actions: [{ unsafe: true, runCode: { language: "$1", code: "$2" } }],
};

/** Markdown, AsciiDoc, HTML, and reStructuredText share these definitions. Each format takes its own copy. */
const sharedMarkup: MarkupDefinition[] = [
  { name: "goToUrl", link: { url: "^https?://", precededBy: GO_TO_VERBS }, captures: ["url"], actions: ["goTo"] },
  { name: "checkHyperlink", link: { url: "^https?://" }, captures: ["url"], actions: ["checkLink"] },
  clickOnscreenText,
  findOnscreenText,
  screenshotImage,
  typeText,
  httpRequestFormat,
  runCode,
];

const METHODS = "GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS";
// The parser folds a following `the response status should be <n>` into the request step's text.
const STATUS = "(?: and the response status should be (\\d+))?";
const gherkinStep = (name: string, regex: string, actions: MarkupDefinition["actions"], captures?: string[]): MarkupDefinition => ({
  name,
  element: { tag: ["step"] },
  regex: [regex],
  ...(captures && { captures }),
  actions,
});

/**
 * The Gherkin step vocabulary. Each regex runs on a step's text, without its keyword. Exported so
 * every surface that reads Gherkin uses the same phrases.
 */
export const gherkinMarkup: MarkupDefinition[] = [
  gherkinStep("goTo", '^I (?:go to|open) "([^"]+)"$', ["goTo"]),
  gherkinStep("click", '^I click "([^"]+)"$', ["click"]),
  gherkinStep("find", '^I (?:should )?see "([^"]+)"$', ["find"]),
  // find has no absence check, so the page's text is checked in the browser.
  gherkinStep("findAbsent", '^I should not see "([^"]+)"$', [
    { runBrowserScript: { script: "return !document.body.innerText.includes(arguments[0])", args: ["$1"], output: "true" } },
  ]),
  gherkinStep("type", '^I type "([^"]+)"$', ["type"]),
  gherkinStep("typeInto", '^I type "([^"]+)" into "([^"]+)"$', [{ type: { keys: "$1", selector: "$2" } }]),
  // The parser uppercases the key, so `"Page Down"` arrives as `"PAGE_DOWN"`.
  gherkinStep("press", '^I press "([^"]+)"$', [{ type: "$$1$" }]),
  gherkinStep("hover", '^I hover over "([^"]+)"$', [{ find: { elementText: "$1", moveTo: true } }]),
  gherkinStep("scrollTo", '^I scroll to "([^"]+)"$', [{ find: { elementText: "$1", moveTo: true } }]),
  gherkinStep("drag", '^I drag "([^"]+)" to "([^"]+)"$', [{ dragAndDrop: { source: "$1", target: "$2" } }]),
  gherkinStep("swipe", "^I swipe (up|down|left|right)$", [{ swipe: "$1" }]),
  gherkinStep("checkLink", '^the link "([^"]+)" works$', ["checkLink"]),
  gherkinStep("screenshot", '^I take a screenshot "([^"]+)"$', ["screenshot"]),
  gherkinStep("screenshotElement", '^I take a screenshot of "([^"]+)" as "([^"]+)"$', [{ screenshot: { path: "$2", crop: "$1" } }]),
  gherkinStep("startRecording", '^I start recording "([^"]+)"$', ["record"]),
  gherkinStep("stopRecording", "^I stop recording$", [{ stopRecord: true }]),
  gherkinStep("saveSession", '^I save the session as "([^"]+)"$', [{ saveState: "$1" }]),
  gherkinStep("restoreSession", '^I restore the session "([^"]+)"$', [{ loadState: "$1" }]),
  gherkinStep("runShell", '^I run (?:the command |the script )?"([^"]+)"$', ["runShell"]),
  gherkinStep("runCode", "^I run:$", [{ unsafe: true, runCode: { language: "$1", code: "$2" } }], ["attributes.mediaType", "attributes.docString"]),
  // The parser turns `I wait <n> seconds` into milliseconds.
  gherkinStep("wait", "^I wait (\\d+(?:\\.\\d+)?) milliseconds?$", [{ wait: "$1" }]),
  gherkinStep("loadVariables", '^the variables in "([^"]+)"$', ["loadVariables"]),
  gherkinStep("httpRequest", `^I send an? (${METHODS}) request to "([^"]+)"${STATUS}$`, [
    { httpRequest: { method: "$1", url: "$2", statusCodes: "$3" } },
  ]),
  gherkinStep(
    "httpRequestWithBody",
    `^I send an? (${METHODS}) request to "([^"]+)" with:${STATUS}$`,
    [{ httpRequest: { method: "$1", url: "$2", statusCodes: "$3", request: { body: "$4" } } }],
    ["match.1", "match.2", "match.3", "attributes.docString"]
  ),
  gherkinStep("mockRequestFile", `^the API "(?:(${METHODS}) )?([^"]+)" returns "([^"]+)"$`, [
    { mockRequest: { method: "$1", url: "$2", response: { bodyPath: "$3" } } },
  ]),
  gherkinStep(
    "mockRequestBody",
    `^the API "(?:(${METHODS}) )?([^"]+)" returns:$`,
    [{ mockRequest: { method: "$1", url: "$2", response: { body: "$3" } } }],
    ["match.1", "match.2", "attributes.docString"]
  ),
];

const xrefSelector =(precededBy?: string) => ({ tag: ["xref"], attributes: { href: "^https?://" }, ...(precededBy && { precededBy }) });

const defaultFileTypesBase: Record<string, FileType> = {
  asciidoc_1_0: {
    name: "asciidoc",
    extensions: ["adoc", "asciidoc", "asc"],
    // AsciiDoc statements sit in parentheses: `// (step {...})`.
    inlineStatements: { in: [{ comment: {}, regex: "^\\(\\s*([\\s\\S]*?)\\s*\\)$" }] },
    markup: structuredClone(sharedMarkup),
  },
  dita_1_0: {
    name: "dita",
    extensions: ["dita", "ditamap", "xml"],
    inlineStatements: {
      in: ["comment", { element: { tag: ["data"], attributes: { name: "^doc-detective$" } }, value: "attributes.value" }],
    },
    markup: structuredClone([
      {
        name: "clickUiControl",
        element: { tag: ["uicontrol"], precededBy: "(?:[Cc]lick|[Tt]ap|[Ss]elect|[Pp]ress|[Cc]hoose)\\s+(?:the\\s+)?$" },
        captures: ["content"],
        actions: ["click"],
      },
      {
        name: "typeIntoUiControl",
        element: {
          tag: ["uicontrol"],
          // precededBy reads raw source, so the <userinput> tags are in the text it matches.
          precededBy: "(?:[Tt]ype|[Ee]nter|[Ii]nput)\\s+<userinput>([^<]+)<\\/userinput>\\s+(?:in|into)(?:\\s+the)?\\s+$",
        },
        // `content` is the control's name, and `precededBy.1` is precededBy's first group, the <userinput> text.
        // The name comes first, so this sorts before findUiControl's step for the same control.
        captures: ["content", "precededBy.1"],
        actions: [{ type: { keys: "$2", selector: "$1" } }],
      },
      { name: "goToUrl", element: xrefSelector(GO_TO_VERBS), captures: ["attributes.href"], actions: ["goTo"] },
      { name: "findUiControl", element: "uicontrol", captures: ["content"], actions: ["find"] },
      { name: "verifyWindowTitle", element: "wintitle", captures: ["content"], actions: ["find"] },
      { name: "checkHyperlink", element: xrefSelector(), captures: ["attributes.href"], actions: ["checkLink"] },
      {
        name: "checkLinkElement",
        element: { tag: ["link"], attributes: { href: "^https?://" } },
        captures: ["attributes.href"],
        actions: ["checkLink"],
      },
      clickOnscreenText,
      findOnscreenText,
      typeText,
      screenshotImage,
      httpRequestFormat,
      runCode,
    ]),
  },
  html_1_0: {
    name: "html",
    extensions: ["html", "htm"],
    inlineStatements: { in: ["comment"] },
    markup: structuredClone(sharedMarkup),
  },
  markdown_1_0: {
    name: "markdown",
    extensions: ["md", "markdown", "mdx"],
    inlineStatements: { in: ["comment"] },
    markup: structuredClone(sharedMarkup),
  },
  rst_1_0: {
    name: "rst",
    // Not `.rest`: the REST Client editor extension uses it for HTTP request files.
    extensions: ["rst"],
    inlineStatements: { in: ["comment"] },
    markup: structuredClone(sharedMarkup),
  },
  gherkin_1_0: {
    name: "gherkin",
    extensions: ["feature"],
    inlineStatements: { in: ["comment"] },
    markup: structuredClone(gherkinMarkup),
  },
};

/**
 * Default file type definitions, including keyword aliases.
 * Keys include both versioned names (e.g. "markdown_1_0") and
 * short aliases (e.g. "markdown").
 */
export const defaultFileTypes: Record<string, FileType> = {
    ...defaultFileTypesBase,
    markdown: defaultFileTypesBase.markdown_1_0,
    asciidoc: defaultFileTypesBase.asciidoc_1_0,
    html: defaultFileTypesBase.html_1_0,
    dita: defaultFileTypesBase.dita_1_0,
    rst: defaultFileTypesBase.rst_1_0,
    gherkin: defaultFileTypesBase.gherkin_1_0,
};

/**
 * Infers a file type from content when no file type or extension is available.
 * Checks for DITA XML, HTML, and AsciiDoc markers before defaulting to Markdown.
 */
export function detectFileTypeFromContent(content: string): FileType {
  const trimmed = content.trimStart();

  // DITA: XML declaration or DOCTYPE with DITA-specific root elements
  if (trimmed.startsWith("<?xml") || trimmed.startsWith("<!DOCTYPE")) {
    if (/<!DOCTYPE\s+(?:topic|map|concept|task|reference|dita|bookmap)\b|<(?:dita|topic|map|concept|task|reference|bookmap)[\s>]/i.test(content)) {
      return structuredClone(defaultFileTypes.dita);
    }
  }

  // HTML: DOCTYPE html or <html> tag
  if (/<!DOCTYPE\s+html\b/i.test(trimmed) || /<html[\s>]/i.test(trimmed)) {
    return structuredClone(defaultFileTypes.html);
  }

  // AsciiDoc: = Document Title or :attribute: entries, without Markdown # headings
  if (/^= \S/m.test(content) && !/^#{1,6} /m.test(content)) {
    return structuredClone(defaultFileTypes.asciidoc);
  }

  // Default to Markdown
  return structuredClone(defaultFileTypes.markdown);
}
