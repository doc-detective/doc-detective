/**
 * Default file type definitions for Doc Detective.
 * These are pure data definitions with no Node.js dependencies,
 * shared by both core and vscode extension.
 */

export interface MarkupDefinition {
  name?: string;
  /** Regex mode: patterns matched against raw file text. */
  regex?: string[];
  /** Selector mode: exactly one kind key (the kind IS the key). */
  comment?: Record<string, any>;
  codeBlock?: string | Record<string, any>;
  link?: Record<string, any>;
  image?: Record<string, any>;
  strong?: Record<string, any>;
  emphasis?: Record<string, any>;
  text?: Record<string, any>;
  element?: string | Record<string, any>;
  /** Selector mode: node field paths mapped in order to $1..$n. */
  captures?: string[];
  actions?: (string | Record<string, any>)[];
  batchMatches?: boolean;
}

export interface FileType {
  name?: string;
  extensions: string[];
  inlineStatements?: {
    /**
     * Statement containers for structurally parsed file types: "comment"
     * or a bare selector node (optionally with a `value` field path).
     */
    in?: Array<string | Record<string, any>>;
    testStart?: string[];
    testEnd?: string[];
    ignoreStart?: string[];
    ignoreEnd?: string[];
    step?: string[];
  };
  markup?: MarkupDefinition[];
  runShell?: Record<string, any>;
}

const defaultFileTypesBase: Record<string, FileType> = {
    asciidoc_1_0: {
        name: "asciidoc",
        extensions: ["adoc", "asciidoc", "asc"],
        inlineStatements: {
            testStart: ["\\/\\/\\s+\\(\\s*test\\s+([\\s\\S]*?)\\s*\\)"],
            testEnd: ["\\/\\/\\s+\\(\\s*test end\\s*\\)"],
            ignoreStart: ["\\/\\/\\s+\\(\\s*test ignore start\\s*\\)"],
            ignoreEnd: ["\\/\\/\\s+\\(\\s*test ignore end\\s*\\)"],
            step: ["\\/\\/\\s+\\(\\s*step\\s+([\\s\\S]*?)\\s*\\)"],
        },
        markup: [],
    },
    dita_1_0: {
        name: "dita",
        extensions: ["dita", "ditamap", "xml"],
        inlineStatements: {
            // Structure-aware: XML comments and <data name="doc-detective">
            // elements are statement containers; the parser handles quote
            // variants, attribute order, and entity decoding. The
            // <?doc-detective …?> processing-instruction channel stays
            // regex-only (rarely used; slated for deprecation).
            in: [
                "comment",
                {
                    element: {
                        tag: "data",
                        attributes: { name: "doc-detective" },
                    },
                    value: "attributes.value",
                },
            ],
            testStart: ["<\\?doc-detective\\s+test([\\s\\S]*?)\\?>"],
            testEnd: ["<\\?doc-detective\\s+test\\s+end\\s*\\?>"],
            ignoreStart: ["<\\?doc-detective\\s+test\\s+ignore\\s+start\\s*\\?>"],
            ignoreEnd: ["<\\?doc-detective\\s+test\\s+ignore\\s+end\\s*\\?>"],
            step: ["<\\?doc-detective\\s+step\\s+([\\s\\S]*?)\\s*\\?>"],
        },
        markup: [
            {
                name: "clickUiControl",
                element: {
                    tag: "uicontrol",
                    precededBy:
                        "(?:[Cc]lick|[Tt]ap|[Ss]elect|[Pp]ress|[Cc]hoose)\\s+(?:the\\s+)?$",
                },
                captures: ["content"],
                actions: ["click"],
            },
            {
                name: "typeIntoUiControl",
                element: {
                    tag: "userinput",
                    precededBy: "\\b(?:[Tt]ype|[Ee]nter|[Ii]nput)\\s+$",
                    followedBy: {
                        text: "^\\s+(?:in|into)(?:\\s+the)?\\s+$",
                        then: { element: { tag: "uicontrol" } },
                    },
                },
                captures: ["content", "then.content"],
                actions: [
                    {
                        type: {
                            keys: "$1",
                            selector: "$2",
                        },
                    },
                ],
            },
            {
                name: "navigateToXref",
                element: {
                    tag: "xref",
                    attributes: { href: "^https?:\\/\\/" },
                    precededBy:
                        "(?:[Nn]avigate\\s+to|[Oo]pen|[Gg]o\\s+to|[Vv]isit|[Bb]rowse\\s+to)\\s+$",
                },
                captures: ["attributes.href"],
                actions: ["goTo"],
            },
            {
                name: "findUiControl",
                element: "uicontrol",
                captures: ["content"],
                actions: ["find"],
            },
            {
                name: "verifyWindowTitle",
                element: "wintitle",
                captures: ["content"],
                actions: ["find"],
            },
            {
                name: "checkExternalXref",
                element: {
                    tag: "xref",
                    attributes: { scope: "external", href: "^https?:\\/\\/" },
                },
                captures: ["attributes.href"],
                actions: ["checkLink"],
            },
            {
                name: "checkHyperlink",
                element: {
                    tag: "xref",
                    attributes: { href: "^https?:\\/\\/" },
                },
                captures: ["attributes.href"],
                actions: ["checkLink"],
            },
            {
                name: "checkLinkElement",
                element: {
                    tag: "link",
                    attributes: { href: "^https?:\\/\\/" },
                },
                captures: ["attributes.href"],
                actions: ["checkLink"],
            },
            {
                name: "clickOnscreenText",
                strong: {
                    precededBy:
                        "\\b(?:[Cc]lick|[Tt]ap|[Ll]eft-click|[Cc]hoose|[Ss]elect|[Cc]heck)\\b\\s+$",
                },
                captures: ["text"],
                actions: ["click"],
            },
            {
                name: "findOnscreenText",
                strong: {},
                captures: ["text"],
                actions: ["find"],
            },
            {
                name: "goToUrl",
                element: {
                    tag: "xref",
                    attributes: { href: "^https?:\\/\\/" },
                    precededBy:
                        "\\b(?:[Gg]o\\s+to|[Oo]pen|[Nn]avigate\\s+to|[Vv]isit|[Aa]ccess|[Pp]roceed\\s+to|[Ll]aunch)\\b\\s+$",
                },
                captures: ["attributes.href"],
                actions: ["goTo"],
            },
            {
                name: "typeText",
                text: {
                    matches: '\\b(?:[Pp]ress|[Ee]nter|[Tt]ype)\\b\\s+"([^"]+)"',
                },
                captures: ["match.1"],
                actions: ["type"],
            },
        ],
    },
    html_1_0: {
        name: "html",
        extensions: ["html", "htm", "xhtml"],
        inlineStatements: {
            // Structure-aware: parse5 comment nodes feed the shared
            // statement grammar; comments inside <pre>/script/style can't
            // false-positive.
            in: ["comment"],
        },
        markup: [],
    },
    markdown_1_0: {
        name: "markdown",
        extensions: ["md", "markdown", "mdown", "mkd", "mkdn"],
        inlineStatements: {
            // Structure-aware: HTML comments and every [comment]: # quote
            // variant normalize to comment nodes, parsed by one statement
            // grammar. MDX expression comments ({/* … */}) belong to the
            // dedicated mdx fileType below.
            in: ["comment"],
        },
        markup: [
            {
                name: "checkHyperlink",
                link: { url: "^https?:\\/\\/" },
                captures: ["url"],
                actions: ["checkLink"],
            },
            {
                name: "clickOnscreenText",
                strong: {
                    precededBy:
                        "\\b(?:[Cc]lick|[Tt]ap|[Ll]eft-click|[Cc]hoose|[Ss]elect|[Cc]heck)\\b\\s+$",
                },
                captures: ["text"],
                actions: ["click"],
            },
            {
                name: "findOnscreenText",
                strong: {},
                captures: ["text"],
                actions: ["find"],
            },
            {
                name: "goToUrl",
                link: {
                    url: "^https?:\\/\\/",
                    precededBy:
                        "\\b(?:[Gg]o\\s+to|[Oo]pen|[Nn]avigate\\s+to|[Vv]isit|[Aa]ccess|[Pp]roceed\\s+to|[Ll]aunch)\\b\\s+$",
                },
                captures: ["url"],
                actions: ["goTo"],
            },
            {
                name: "screenshotImage",
                image: { attributes: { class: "screenshot" } },
                captures: ["src"],
                actions: ["screenshot"],
            },
            {
                name: "typeText",
                text: {
                    matches: '\\b(?:[Pp]ress|[Ee]nter|[Tt]ype)\\b\\s+"([^"]+)"',
                },
                captures: ["match.1"],
                actions: ["type"],
            },
            {
                name: "httpRequestFormat",
                codeBlock: {
                    language: ["http", ""],
                    contentMatches:
                        "^([A-Z]+)[ \\t]+(\\S+)(?:[ \\t]+HTTP\\/[\\d.]+)?[ \\t]*\\r?\\n?((?:\\S+:[ \\t]+\\S+(?:\\r?\\n|$))*)(?:\\s+([\\s\\S]+?))?\\s*$",
                },
                captures: ["match.1", "match.2", "match.3", "match.4"],
                actions: [
                    {
                        httpRequest: {
                            method: "$1",
                            url: "$2",
                            request: {
                                headers: "$3",
                                body: "$4",
                            },
                        },
                    },
                ],
            },
            {
                name: "runCode",
                codeBlock: {
                    language: ["bash", "python", "py", "javascript", "js"],
                    metaExcludes: "testIgnore",
                },
                captures: ["language", "content"],
                actions: [
                    {
                        unsafe: true,
                        runCode: {
                            language: "$1",
                            code: "$2",
                        },
                    },
                ],
            },
        ],
    },
};

// MDX splits from markdown: the mdx backend parses {/* … */} expression
// comments as comment nodes and exposes JSX components as element nodes,
// while `<!-- -->` is a syntax error in MDX. The selector markup is shared
// with markdown (read-only; consumers deep-copy before mutating).
defaultFileTypesBase.mdx_1_0 = {
    name: "mdx",
    extensions: ["mdx"],
    inlineStatements: {
        in: ["comment"],
    },
    markup: defaultFileTypesBase.markdown_1_0.markup,
};

/**
 * Default file type definitions, including keyword aliases.
 * Keys include both versioned names (e.g. "markdown_1_0") and
 * short aliases (e.g. "markdown").
 */
export const defaultFileTypes: Record<string, FileType> = {
    ...defaultFileTypesBase,
    markdown: defaultFileTypesBase.markdown_1_0,
    mdx: defaultFileTypesBase.mdx_1_0,
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
