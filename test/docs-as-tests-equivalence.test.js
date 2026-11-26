// The docs-as-tests reference shows one procedure as prose, detected,
// inline, and standalone tests in several formats. Its promise is that the
// variants say the same thing, so the checker compares their resolved steps.

import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { findMismatches } = require("../docs/.scripts/checkDocsAsTests.js");

const spec = (file, steps) => ({
  contentPath: `/repo/examples/echo/${file}`,
  tests: [{ testId: "echo", steps }],
});
const goTo = { stepId: "a", location: { line: 3 }, goTo: "http://x" };
const find = { stepId: "b", description: "d", find: "Hi" };

describe("docs-as-tests equivalence", function () {
  it("accepts variants that resolve to the same steps, ignoring IDs and locations", function () {
    const specs = [
      spec("inline.md", [goTo, find]),
      spec("inline.adoc", [{ ...goTo, stepId: "z", location: { line: 9 } }, find]),
      spec("standalone.spec.json", [{ goTo: "http://x" }, { find: "Hi" }]),
      spec("detected.md", [goTo, { checkLink: "http://x" }]),
      spec("detected.rst", [goTo, { checkLink: "http://x" }]),
    ];
    assert.deepEqual(findMismatches(specs), []);
  });

  it("flags an inline variant that differs from the standalone spec", function () {
    const specs = [
      spec("standalone.spec.json", [{ goTo: "http://x" }]),
      spec("inline.html", [{ goTo: "http://y" }]),
    ];
    const problems = findMismatches(specs);
    assert.equal(problems.length, 1);
    assert.match(problems[0], /echo.*inline\.html/);
  });

  it("flags a detected variant that differs from the other detected variants", function () {
    const specs = [
      spec("standalone.spec.json", [{ goTo: "http://x" }]),
      spec("detected.md", [{ goTo: "http://x" }]),
      spec("detected.dita", []),
    ];
    assert.match(findMismatches(specs).join("\n"), /detected\.dita/);
  });

  it("flags an example with no standalone spec", function () {
    assert.match(findMismatches([spec("inline.md", [goTo])]).join("\n"), /echo.*standalone/);
  });

  it("flags a prose file that resolves to any test", function () {
    const specs = [spec("standalone.spec.json", [goTo]), spec("prose.md", [goTo])];
    assert.match(findMismatches(specs).join("\n"), /prose\.md/);
  });
});
