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
  regex: ["^([A-Z]+)[ \\t]+(\\S+)(?:[ \\t]+HTTP\\/[\\d.]+)?[ \\t]*(?:\\r?\\n((?:\\S+:[ \\t]+\\S+(?:\\r?\\n|$))+))?(?:\\s+([\\s\\S]+?))?\\s*$"],
  actions: [{ httpRequest: { method: "$1", url: "$2", request: { headers: "$3", body: "$4" } } }],
};
const runCode: MarkupDefinition = {
  name: "runCode",
  codeBlock: { language: ["bash", "python", "py", "javascript", "js"], metaExcludes: "testIgnore" },
  captures: ["language", "content"],
  actions: [{ unsafe: true, runCode: { language: "$1", code: "$2" } }],
};

/** Markdown, AsciiDoc, and HTML share these definitions. Each format takes its own copy. */
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

const xref = (precededBy?: string) => ({ tag: ["xref"], attributes: { href: "^https?://" }, ...(precededBy && { precededBy }) });

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
          precededBy: "(?:[Tt]ype|[Ee]nter|[Ii]nput)\\s+<userinput>([^<]+)<\\/userinput>\\s+(?:in|into)(?:\\s+the)?\\s+$",
        },
        // The control's name comes first, so this sorts before findUiControl's step for the same control.
        captures: ["content", "precededBy.1"],
        actions: [{ type: { keys: "$2", selector: "$1" } }],
      },
      { name: "goToUrl", element: xref(GO_TO_VERBS), captures: ["attributes.href"], actions: ["goTo"] },
      { name: "findUiControl", element: "uicontrol", captures: ["content"], actions: ["find"] },
      { name: "verifyWindowTitle", element: "wintitle", captures: ["content"], actions: ["find"] },
      { name: "checkHyperlink", element: xref(), captures: ["attributes.href"], actions: ["checkLink"] },
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
      return defaultFileTypes.dita;
    }
  }

  // HTML: DOCTYPE html or <html> tag
  if (/<!DOCTYPE\s+html\b/i.test(trimmed) || /<html[\s>]/i.test(trimmed)) {
    return defaultFileTypes.html;
  }

  // AsciiDoc: = Document Title or :attribute: entries, without Markdown # headings
  if (/^= \S/m.test(content) && !/^#{1,6} /m.test(content)) {
    return defaultFileTypes.asciidoc;
  }

  // Default to Markdown
  return defaultFileTypes.markdown;
}
