/**
 * Built-in definition freeze (permanent).
 *
 * The built-in markdown, html, asciidoc, and dita fileTypes stay on the
 * legacy regex definitions below, byte for byte (ADR 01139): selector mode is
 * opt-in, so upgrading never changes what an existing config detects. Do not
 * update these copies to match new behavior. They ARE the compatibility
 * baseline. compat.test.js pins the detection engine against the same
 * baseline with recorded legacy output.
 */

import { expect } from "chai";
import { defaultFileTypes } from "../dist/fileTypes.js";
// Frozen pre-migration markdown_1_0 (regex mode).
const LEGACY_MARKDOWN = {
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
      regex: ['\\b(?:[Pp]ress|[Ee]nter|[Tt]ype)\\b\\s+"([^"]+)"'],
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
};

// Frozen pre-migration dita_1_0 (regex mode).
const LEGACY_DITA = {
  name: "dita",
  extensions: ["dita", "ditamap", "xml"],
  inlineStatements: {
    testStart: [
      "<\\?doc-detective\\s+test([\\s\\S]*?)\\?>",
      "<!--\\s*test([\\s\\S]+?)-->",
      "<data\\s+[^>]*?name=[\"']doc-detective[\"'][^>]*?value='test\\s+([^']+?)'[^>]*?(?:\\/\\s*>|>\\s*<\\/data>)",
      '<data\\s+[^>]*?name=["\']doc-detective["\'][^>]*?value="test\\s+([^"]+?)"[^>]*?(?:\\/\\s*>|>\\s*<\\/data>)',
      "<data\\s+[^>]*?value='test\\s+([^']+?)'[^>]*?name=[\"']doc-detective[\"'][^>]*?(?:\\/\\s*>|>\\s*<\\/data>)",
      '<data\\s+[^>]*?value="test\\s+([^"]+?)"[^>]*?name=["\']doc-detective["\'][^>]*?(?:\\/\\s*>|>\\s*<\\/data>)',
    ],
    testEnd: [
      "<\\?doc-detective\\s+test\\s+end\\s*\\?>",
      "<!--\\s*test end([\\s\\S]+?)-->",
      "<data\\s+[^>]*?name=[\"']doc-detective[\"'][^>]*?value=[\"']test end[\"'][^>]*?(?:\\/\\s*>|>\\s*<\\/data>)",
      "<data\\s+[^>]*?value=[\"']test end[\"'][^>]*?name=[\"']doc-detective[\"'][^>]*?(?:\\/\\s*>|>\\s*<\\/data>)",
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
      "<data\\s+[^>]*?name=[\"']doc-detective[\"'][^>]*?value='step\\s+([^']+?)'[^>]*?(?:\\/\\s*>|>\\s*<\\/data>)",
      '<data\\s+[^>]*?name=["\']doc-detective["\'][^>]*?value="step\\s+([^"]+?)"[^>]*?(?:\\/\\s*>|>\\s*<\\/data>)',
      "<data\\s+[^>]*?value='step\\s+([^']+?)'[^>]*?name=[\"']doc-detective[\"'][^>]*?(?:\\/\\s*>|>\\s*<\\/data>)",
      '<data\\s+[^>]*?value="step\\s+([^"]+?)"[^>]*?name=["\']doc-detective["\'][^>]*?(?:\\/\\s*>|>\\s*<\\/data>)',
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
};

// Frozen pre-migration html_1_0 (regex mode).
const LEGACY_HTML = {
  name: "html",
  extensions: [
    "html",
    "htm"
  ],
  inlineStatements: {
    testStart: [
      "<!--\\s*test\\s+?([\\s\\S]*?)\\s*-->"
    ],
    testEnd: [
      "<!--\\s*test end\\s*([\\s\\S]*?)\\s*-->"
    ],
    ignoreStart: [
      "<!--\\s*test ignore start\\s*-->"
    ],
    ignoreEnd: [
      "<!--\\s*test ignore end\\s*-->"
    ],
    step: [
      "<!--\\s*step\\s+?([\\s\\S]*?)\\s*-->"
    ]
  },
  markup: []
};

// Frozen pre-migration asciidoc_1_0 (regex mode).
const LEGACY_ASCIIDOC = {
  name: "asciidoc",
  extensions: [
    "adoc",
    "asciidoc",
    "asc"
  ],
  inlineStatements: {
    testStart: [
      "\\/\\/\\s+\\(\\s*test\\s+([\\s\\S]*?)\\s*\\)"
    ],
    testEnd: [
      "\\/\\/\\s+\\(\\s*test end\\s*\\)"
    ],
    ignoreStart: [
      "\\/\\/\\s+\\(\\s*test ignore start\\s*\\)"
    ],
    ignoreEnd: [
      "\\/\\/\\s+\\(\\s*test ignore end\\s*\\)"
    ],
    step: [
      "\\/\\/\\s+\\(\\s*step\\s+([\\s\\S]*?)\\s*\\)"
    ]
  },
  markup: []
};

describe("built-in fileTypes keep the legacy definitions", function () {
  const frozen = {
    markdown: LEGACY_MARKDOWN,
    html: LEGACY_HTML,
    asciidoc: LEGACY_ASCIIDOC,
    dita: LEGACY_DITA,
  };
  for (const [name, legacy] of Object.entries(frozen)) {
    it(`${name} equals the frozen legacy table`, function () {
      expect(defaultFileTypes[name]).to.deep.equal(legacy);
      expect(defaultFileTypes[`${name}_1_0`]).to.equal(defaultFileTypes[name]);
    });
  }
});
