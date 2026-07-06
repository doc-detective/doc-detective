// Tests for docs/.scripts/buildSchemaReferencesV4.js (a CJS script — loaded via
// createRequire). The generator writes MDX-parsed pages, so any `{`/`}` it emits
// outside code spans is parsed by Fern as a JSX expression and fails the docs
// build with "Could not parse expression with acorn".
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);

// Requiring the generator must be side-effect free (it only runs main() when
// executed directly) so its helpers can be unit-tested here.
const generator = require("../docs/.scripts/buildSchemaReferencesV4.js");

const schemasDir = path.resolve(
  __dirname,
  "../docs/fern/pages/reference/schemas"
);

// Strip the parts of a generated page where braces are legitimate: YAML
// frontmatter, the generated-file MDX comment, fenced code blocks, and inline
// code spans. Whatever remains is plain MDX text, where an unescaped `{` or `}`
// starts a JSX expression and breaks Fern's MDX parser (acorn).
function stripSafeRegions(content) {
  return content
    .replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n/, "")
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, "")
    .replace(/^```[\s\S]*?^```/gm, "")
    .replace(/``[^\n]*?``/g, "")
    .replace(/`[^`\n]*`/g, "");
}

describe("docs schema reference generator (MDX safety)", function () {
  describe("escapeMdxTextExpressions", function () {
    it("escapes braces outside inline code so MDX doesn't parse them as expressions", function () {
      assert.equal(
        generator.escapeMdxTextExpressions(
          'App surfaces use the object form ({ "app": … }).'
        ),
        'App surfaces use the object form (\\{ "app": … \\}).'
      );
    });

    it("leaves braces inside inline code spans untouched", function () {
      assert.equal(
        generator.escapeMdxTextExpressions(
          'Target it with `stopRecord: { name: "<name>" }` instead.'
        ),
        'Target it with `stopRecord: { name: "<name>" }` instead.'
      );
    });

    it("handles text with both code spans and plain braces", function () {
      assert.equal(
        generator.escapeMdxTextExpressions("a {b} `c {d}` e {f}"),
        "a \\{b\\} `c {d}` e \\{f\\}"
      );
    });

    it("returns brace-free text unchanged", function () {
      assert.equal(
        generator.escapeMdxTextExpressions("No braces here."),
        "No braces here."
      );
    });
  });

  describe("generated schema pages", function () {
    it("contain no unescaped braces outside code spans, fences, or MDX comments", function () {
      const offenders = [];
      for (const file of fs.readdirSync(schemasDir)) {
        if (!file.endsWith(".md")) continue;
        const content = fs.readFileSync(path.join(schemasDir, file), "utf8");
        const text = stripSafeRegions(content);
        // An unescaped `{` or `}` in MDX text is parsed as a JSX expression.
        if (/(?<!\\)[{}]/.test(text)) offenders.push(file);
      }
      assert.deepEqual(
        offenders,
        [],
        `Generated pages with MDX-breaking braces: ${offenders.join(", ")}. ` +
          "Fix escaping in docs/.scripts/buildSchemaReferencesV4.js and run " +
          "`npm run docs:build-schema-refs`."
      );
    });
  });
});
