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

/**
 * Enumerated intentional divergences, per fixture file. Each entry is a
 * transform applied to BOTH runs' outputs before comparison, documenting
 * exactly what the selector engine fixes. Fixtures not listed must match
 * byte-for-byte.
 */
const INTENTIONAL_DIVERGENCES = {
  // (populated as the migration lands; keep this list short and explained)
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
