/**
 * Detection parity harness (permanent).
 *
 * Runs every markdown fixture through detection twice: once with the frozen
 * legacy regex-based markdown fileType below, once with the current built-in
 * (selector-based after the migration). The detected specs must be
 * identical — identical steps keep contentHash-derived test IDs stable for
 * users — except for divergences that are explicitly enumerated and asserted
 * here (structural fixes the selector engine makes on purpose).
 *
 * The legacy definition is a frozen copy of the pre-migration markdown_1_0
 * table. Do not update it to match new behavior — it IS the compatibility
 * baseline.
 */

import { expect } from "chai";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { detectTests } from "../dist/detectTests.js";
import { defaultFileTypes } from "../dist/fileTypes.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const fixturesDir = path.join(__dirname, "fixtures");

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

/**
 * Enumerated intentional divergences, per fixture file. Each entry is a
 * transform applied to BOTH runs' outputs before comparison, documenting
 * exactly what the selector engine fixes. Fixtures not listed must match
 * byte-for-byte.
 */
/**
 * Divergence class: element-selector spans. Legacy xref/uicontrol regexes
 * often matched only the opening tag, so location.endIndex stopped at its
 * `>`; element selectors record the full element through its closing tag.
 * IDs are unaffected (location is excluded from content hashes) — only the
 * endIndex metadata widens, so it is dropped from comparison while line and
 * startIndex stay guarded.
 */
function dropStepEndIndex(tests) {
  for (const test of tests) {
    for (const step of test.steps) {
      if (step.location) delete step.location.endIndex;
    }
  }
  return tests;
}

const INTENTIONAL_DIVERGENCES = {
  // (populated as the migration lands; keep this list short and explained)
  "dita-detect.dita": dropStepEndIndex,
  "dita-links.dita": dropStepEndIndex,
  "dita-mixed.dita": dropStepEndIndex,
};

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Generated stepIds are random UUIDs (v2→v3 step upgrades mint one per run),
 * so any two detection runs differ on them — including legacy vs legacy.
 * Strip UUID-shaped stepIds on both sides; authored stepIds still compare.
 */
function stripRandomStepIds(value) {
  if (Array.isArray(value)) {
    value.forEach(stripRandomStepIds);
  } else if (value && typeof value === "object") {
    if (typeof value.stepId === "string" && UUID_RE.test(value.stepId)) {
      delete value.stepId;
    }
    Object.values(value).forEach(stripRandomStepIds);
  }
  return value;
}

const markdownFixtures = fs
  .readdirSync(fixturesDir)
  .filter((f) => f.endsWith(".md"))
  .sort();

describe("detection parity: legacy regex vs current markdown built-in", function () {
  for (const fixture of markdownFixtures) {
    it(`produces identical specs for ${fixture}`, async function () {
      const content = fs.readFileSync(path.join(fixturesDir, fixture), "utf8");
      const filePath = `fixtures/${fixture}`;
      const legacy = await detectTests({
        content,
        filePath,
        fileType: LEGACY_MARKDOWN,
      });
      const current = await detectTests({
        content,
        filePath,
        fileType: defaultFileTypes.markdown,
      });
      stripRandomStepIds(legacy);
      stripRandomStepIds(current);
      const transform = INTENTIONAL_DIVERGENCES[fixture];
      const a = transform ? transform(legacy, "legacy") : legacy;
      const b = transform ? transform(current, "current") : current;
      expect(b).to.deep.equal(a);
    });
  }

  it("covers the fixture corpus", function () {
    // If markdown fixtures disappear, the harness silently stops guarding —
    // fail loudly instead.
    expect(markdownFixtures.length).to.be.greaterThan(3);
  });
});

const ditaFixtures = fs
  .readdirSync(fixturesDir)
  .filter((f) => f.endsWith(".dita"))
  .sort();

describe("detection parity: legacy regex vs current dita built-in", function () {
  for (const fixture of ditaFixtures) {
    it(`produces identical specs for ${fixture}`, async function () {
      const content = fs.readFileSync(path.join(fixturesDir, fixture), "utf8");
      const filePath = `fixtures/${fixture}`;
      const legacy = await detectTests({
        content,
        filePath,
        fileType: LEGACY_DITA,
      });
      const current = await detectTests({
        content,
        filePath,
        fileType: defaultFileTypes.dita,
      });
      stripRandomStepIds(legacy);
      stripRandomStepIds(current);
      const transform = INTENTIONAL_DIVERGENCES[fixture];
      const a = transform ? transform(legacy, "legacy") : legacy;
      const b = transform ? transform(current, "current") : current;
      expect(b).to.deep.equal(a);
    });
  }

  it("covers the dita fixture corpus", function () {
    expect(ditaFixtures.length).to.be.greaterThan(3);
  });
});
