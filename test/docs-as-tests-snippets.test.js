// Fern 4.15 renders a stray `title=` header on <Code src> blocks, so the
// docs-as-tests examples are inlined into a generated `_variants.mdx` per
// example as titled fenced blocks inside mode and format tabs.

import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { renderVariants } = require("../docs/.scripts/buildDocsAsTestsSnippets.js");

describe("docs-as-tests snippets", function () {
  it("puts each mode in a tab and each format in a nested tab, in a fixed order", function () {
    const out = renderVariants([
      { name: "standalone.spec.yaml", content: "tests: []\n" },
      { name: "prose.dita", content: "<task/>\n" },
      { name: "prose.md", content: "# Hi\n" },
      { name: "standalone.spec.json", content: "{}\n" },
    ]);
    const titles = [...out.matchAll(/<Tab title="([^"]+)">/g)].map((m) => m[1]);
    assert.deepEqual(titles, ["Prose", "Markdown", "DITA", "Standalone", "JSON", "YAML"]);
    assert.match(out, /```markdown title="prose\.md"\n# Hi\n```/);
    assert.match(out, /```xml title="prose\.dita"/);
  });

  it("uses a fence longer than any backtick run in the file", function () {
    const out = renderVariants([{ name: "prose.md", content: "```bash\nls\n```\n" }]);
    assert.match(out, /````markdown title="prose\.md"\n```bash\nls\n```\n````/);
  });

  it("leaves out modes and formats that the example doesn't have", function () {
    const out = renderVariants([{ name: "inline.rst", content: "x\n" }]);
    assert.doesNotMatch(out, /Prose|Detected|Standalone|Markdown/);
    assert.match(out, /<Tab title="Inline">[\s\S]*<Tab title="reStructuredText">/);
  });
});
