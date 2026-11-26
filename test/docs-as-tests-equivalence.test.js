// The docs-as-tests reference shows one procedure as prose, detected,
// inline, and standalone tests in several formats. Its promise is that the
// variants say the same thing, so the checker compares their resolved steps.

import assert from "node:assert/strict";
import { createRequire } from "node:module";
import path from "node:path";

const require = createRequire(import.meta.url);
const { findMismatches, groupByConfig } = require("../docs/.scripts/checkDocsAsTests.js");

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

  it("compares the steps a dry run puts under each test's contexts", function () {
    const resolved = (file, steps) => ({
      contentPath: `/repo/examples/echo/${file}`,
      tests: [{ testId: "echo", contexts: [{ steps }] }],
    });
    const specs = [
      resolved("standalone.spec.json", [{ goTo: "http://x" }]),
      resolved("inline.md", [{ goTo: "http://y" }]),
    ];
    assert.match(findMismatches(specs).join("\n"), /inline\.md/);
  });

  it("flags an example with no standalone spec", function () {
    assert.match(findMismatches([spec("inline.md", [goTo])]).join("\n"), /echo.*standalone/);
  });

  it("flags a prose file that resolves to any test", function () {
    const specs = [spec("standalone.spec.json", [goTo]), spec("prose.md", [goTo])];
    assert.match(findMismatches(specs).join("\n"), /prose\.md/);
  });
});

describe("docs-as-tests config groups", function () {
  it("uses an example's own doc-detective.json, else the shared config", function () {
    const p = (...parts) => path.join("/ex", ...parts);
    const files = [p("a", "detected.md"), p("a", "inline.md"), p("b", "detected.md")];
    const own = p("b", "doc-detective.json");
    const groups = groupByConfig(files, p("shared.json"), (f) => f === own);
    assert.deepEqual(groups, new Map([
      [p("shared.json"), [p("a", "detected.md"), p("a", "inline.md")]],
      [own, [p("b", "detected.md")]],
    ]));
  });
});
