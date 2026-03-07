/**
 * Default file type definitions for Doc Detective.
 * These are pure data definitions with no Node.js dependencies,
 * shared by both core and vscode extension.
 */

import type { FileType } from "./detectTests.js";

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
      testStart: [
        "<\\?doc-detective\\s+test([\\s\\S]*?)\\?>",
        "<!--\\s*test([\\s\\S]+?)-->",
      ],
      testEnd: [
        "<\\?doc-detective\\s+test\\s+end\\s*\\?>",
        "<!--\\s*test end([\\s\\S]+?)-->",
      ],
      ignoreStart: [
        "<\\?doc-detective\\s+test\\s+ignore\\s+start\\s*\\?>",
        "<!--\\s*test ignore\\s+start\\s*-->",
      ],
      ignoreEnd: [
        "<\\?doc-detective\\s+test\\s+ignore\\s+end\\s*\\?>",
        "<!--\\s*test ignore\\s+end\\s*-->",
      ],
      step: [
        "<\\?doc-detective\\s+step\\s+([\\s\\S]*?)\\s*\\?>",
        "<!--\\s*step([\\s\\S]+?)-->",
        '<data\\s+name="step"\\s*>([\\s\\S]*?)<\\/data>',
      ],
    },
    markup: [
      {
        name: "clickUiControl",
        regex: [
          "(?:[Cc]lick|[Tt]ap|[Ss]elect|[Pp]ress|[Cc]hoose)\\s+(?:the\\s+)?<uicontrol>([^<]+)<\\/uicontrol>",
        ],
        actions: ["click"],
      },
      {
        name: "typeIntoUiControl",
        regex: [
          "(?:[Tt]ype|[Ee]nter|[Ii]nput)\\s+<userinput>([^<]+)<\\/userinput>\\s+(?:in|into)(?:\\s+the)?\\s+<uicontrol>([^<]+)<\\/uicontrol>",
        ],
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
        regex: [
          '(?:[Nn]avigate\\s+to|[Oo]pen|[Gg]o\\s+to|[Vv]isit|[Bb]rowse\\s+to)\\s+<xref\\s+[^>]*href="(https?:\\/\\/[^"]+)"[^>]*>',
        ],
        actions: ["goTo"],
      },
      {
        name: "findUiControl",
        regex: ["<uicontrol>([^<]+)<\\/uicontrol>"],
        actions: ["find"],
      },
      {
        name: "verifyWindowTitle",
        regex: ["<wintitle>([^<]+)<\\/wintitle>"],
        actions: ["find"],
      },
      {
        name: "checkExternalXref",
        regex: [
          '<xref\\s+[^>]*scope="external"[^>]*href="(https?:\\/\\/[^"]+)"[^>]*>',
          '<xref\\s+[^>]*href="(https?:\\/\\/[^"]+)"[^>]*scope="external"[^>]*>',
        ],
        actions: ["checkLink"],
      },
      {
        name: "checkHyperlink",
        regex: ['<xref\\s+href="(https?:\\/\\/[^"]+)"[^>]*>'],
        actions: ["checkLink"],
      },
      {
        name: "checkLinkElement",
        regex: ['<link\\s+href="(https?:\\/\\/[^"]+)"[^>]*>'],
        actions: ["checkLink"],
      },
      {
        name: "clickOnscreenText",
        regex: [
          "\\b(?:[Cc]lick|[Tt]ap|[Ll]eft-click|[Cc]hoose|[Ss]elect|[Cc]heck)\\b\\s+<b>((?:(?!<\\/b>).)+)<\\/b>",
        ],
        actions: ["click"],
      },
      {
        name: "findOnscreenText",
        regex: ["<b>((?:(?!<\\/b>).)+)<\\/b>"],
        actions: ["find"],
      },
      {
        name: "goToUrl",
        regex: [
          '\\b(?:[Gg]o\\s+to|[Oo]pen|[Nn]avigate\\s+to|[Vv]isit|[Aa]ccess|[Pp]roceed\\s+to|[Ll]aunch)\\b\\s+<xref\\s+href="(https?:\\/\\/[^"]+)"[^>]*>',
        ],
        actions: ["goTo"],
      },
      {
        name: "typeText",
        regex: ['\\b(?:[Pp]ress|[Ee]nter|[Tt]ype)\\b\\s+"([^"]+)"'],
        actions: ["type"],
      },
    ],
  },
  html_1_0: {
    name: "html",
    extensions: ["html", "htm"],
    inlineStatements: {
      testStart: ["<!--\\s*test\\s+?([\\s\\S]*?)\\s*-->"],
      testEnd: ["<!--\\s*test end\\s*([\\s\\S]*?)\\s*-->"],
      ignoreStart: ["<!--\\s*test ignore start\\s*-->"],
      ignoreEnd: ["<!--\\s*test ignore end\\s*-->"],
      step: ["<!--\\s*step\\s+?([\\s\\S]*?)\\s*-->"],
    },
    markup: [],
  },
  markdown_1_0: {
    name: "markdown",
    extensions: ["md", "markdown", "mdx"],
    inlineStatements: {
      testStart: [
        "{\\/\\*\\s*test\\s+?([\\s\\S]*?)\\s*\\*\\/}",
        "<!--\\s*test\\s*([\\s\\S]*?)\\s*-->",
        "\\[comment\\]:\\s+#\\s+\\(test\\s*(.*?)\\s*\\)",
        "\\[comment\\]:\\s+#\\s+\\(test start\\s*(.*?)\\s*\\)",
        "\\[comment\\]:\\s+#\\s+'test\\s*(.*?)\\s*'",
        "\\[comment\\]:\\s+#\\s+'test start\\s*(.*?)\\s*'",
        '\\[comment\\]:\\s+#\\s+"test\\s*((?:[^"\\\\]|\\\\.)*)\\s*"',
        '\\[comment\\]:\\s+#\\s+"test start\\s*((?:[^"\\\\]|\\\\.)*)\\s*"',
      ],
      testEnd: [
        "{\\/\\*\\s*test end\\s*\\*\\/}",
        "<!--\\s*test end\\s*([\\s\\S]*?)\\s*-->",
        "\\[comment\\]:\\s+#\\s+\\(test end\\)",
        "\\[comment\\]:\\s+#\\s+'test end'",
        '\\[comment\\]:\\s+#\\s+"test end"',
      ],
      ignoreStart: [
        "{\\/\\*\\s*test ignore start\\s*\\*\\/}",
        "<!--\\s*test ignore start\\s*-->",
        "\\[comment\\]:\\s+#\\s+\\(test ignore start\\)",
        "\\[comment\\]:\\s+#\\s+'test ignore start'",
        '\\[comment\\]:\\s+#\\s+"test ignore start"',
      ],
      ignoreEnd: [
        "{\\/\\*\\s*test ignore end\\s*\\*\\/}",
        "<!--\\s*test ignore end\\s*-->",
        "\\[comment\\]:\\s+#\\s+\\(test ignore end\\)",
        "\\[comment\\]:\\s+#\\s+'test ignore end'",
        '\\[comment\\]:\\s+#\\s+"test ignore end"',
      ],
      step: [
        "{\\/\\*\\s*step\\s+?([\\s\\S]*?)\\s*\\*\\/}",
        "<!--\\s*step\\s*([\\s\\S]*?)\\s*-->",
        "\\[comment\\]:\\s+#\\s+\\(step\\s*(.*?)\\s*\\)",
        "\\[comment\\]:\\s+#\\s+'step\\s*(.*?)\\s*'",
        '\\[comment\\]:\\s+#\\s+"step\\s*((?:[^"\\\\]|\\\\.)*)\\s*"',
      ],
    },
    markup: [
      {
        name: "checkHyperlink",
        regex: [
          '(?<!\\!)\\[[^\\]]+\\]\\(\\s*(https?:\\/\\/[^\\s)]+)(?:\\s+"[^"]*")?\\s*\\)',
        ],
        actions: ["checkLink"],
      },
      {
        name: "clickOnscreenText",
        regex: [
          "\\b(?:[Cc]lick|[Tt]ap|[Ll]eft-click|[Cc]hoose|[Ss]elect|[Cc]heck)\\b\\s+\\*\\*((?:(?!\\*\\*).)+)\\*\\*",
        ],
        actions: ["click"],
      },
      {
        name: "findOnscreenText",
        regex: ["\\*\\*((?:(?!\\*\\*).)+)\\*\\*"],
        actions: ["find"],
      },
      {
        name: "goToUrl",
        regex: [
          '\\b(?:[Gg]o\\s+to|[Oo]pen|[Nn]avigate\\s+to|[Vv]isit|[Aa]ccess|[Pp]roceed\\s+to|[Ll]aunch)\\b\\s+\\[[^\\]]+\\]\\(\\s*(https?:\\/\\/[^\\s)]+)(?:\\s+"[^"]*")?\\s*\\)',
        ],
        actions: ["goTo"],
      },
      {
        name: "screenshotImage",
        regex: [
          '!\\[[^\\]]*\\]\\(\\s*([^\\s)]+)(?:\\s+"[^"]*")?\\s*\\)\\s*\\{(?=[^}]*\\.screenshot)[^}]*\\}',
        ],
        actions: ["screenshot"],
      },
      {
        name: "typeText",
        regex: ['\\b(?:press|enter|type)\\b\\s+"([^"]+)"'],
        actions: ["type"],
      },
      {
        name: "httpRequestFormat",
        regex: [
          "```(?:http)?\\r?\\n([A-Z]+)\\s+([^\\s]+)(?:\\s+HTTP\\/[\\d.]+)?\\r?\\n((?:[^\\s]+:\\s+[^\\s]+\\r?\\n)*)?(?:\\s+([\\s\\S]*?)\\r?\\n+)?```",
        ],
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
        regex: [
          "```(bash|python|py|javascript|js)(?![^\\r\\n]*testIgnore)[^\\r\\n]*\\r?\\n([\\s\\S]*?)\\r?\\n```",
        ],
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
