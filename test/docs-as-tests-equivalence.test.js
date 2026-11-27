// The docs-as-tests reference shows one procedure as prose, detected,
// inline, and standalone tests in several formats. Its promise is that the
// variants say the same thing, so the checker compares their resolved steps.

import assert from "node:assert/strict";
import { createRequire } from "node:module";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const require = createRequire(import.meta.url);
const { findMismatches, groupByConfig, findPlatformContexts, selectRunFiles, shardExamples, parseShard } = require("../docs/.scripts/checkDocsAsTests.js");

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

describe("docs-as-tests required platform", function () {
  it("counts a platform's contexts that ran and lists the skipped ones", function () {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "dat-platform-"));
    const file = path.join(dir, "results.json");
    fs.writeFileSync(file, JSON.stringify({ specs: [{ specId: "s", tests: [{ testId: "t", contexts: [
      { platform: "windows", result: "PASS" },
      { platform: "windows", result: "SKIPPED", resultDescription: "Skipped: no app." },
      { platform: "linux", result: "SKIPPED" },
    ] }] }] }));
    try {
      assert.deepEqual(findPlatformContexts(file, "windows"), { ran: 1, skipped: ["t (s): Skipped: no app."] });
      assert.deepEqual(findPlatformContexts(path.join(dir, "missing.json"), "windows"), { ran: 0, skipped: [] });
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe("docs-as-tests run selection", function () {
  const p = (...parts) => path.join("/ex", ...parts);

  it("runs the standalone spec, the first detected format, and inline.txt", function () {
    const files = ["detected.rst", "detected.mdx", "detected.txt", "inline.md", "inline.txt", "prose.md",
      "standalone.spec.json", "standalone.spec.yaml", "doc-detective.json"].map((f) => p("a", f));
    assert.deepEqual(selectRunFiles(files), [p("a", "standalone.spec.json"), p("a", "detected.mdx"), p("a", "inline.txt")]);
  });

  it("falls back to standalone.spec.yaml and skips a missing detected variant", function () {
    const files = [p("a", "inline.dita"), p("a", "standalone.spec.yaml"), p("b", "detected.dita"), p("b", "standalone.spec.json")];
    assert.deepEqual(selectRunFiles(files), [p("a", "standalone.spec.yaml"), p("b", "standalone.spec.json"), p("b", "detected.dita")]);
  });

  it("runs the first inline or detected file of an example with no standalone spec", function () {
    assert.deepEqual(selectRunFiles([p("a", "inline.rst"), p("a", "inline.dita"), p("a", "detected.md")]), [p("a", "inline.rst")]);
    assert.deepEqual(selectRunFiles([p("b", "detected.html"), p("b", "detected.dita")]), [p("b", "detected.html")]);
  });

  it("splits sorted example names round-robin into shards", function () {
    const names = ["e", "a", "d", "c", "b"];
    assert.deepEqual(shardExamples(names, 1, 2), ["a", "c", "e"]);
    assert.deepEqual(shardExamples(names, 2, 2), ["b", "d"]);
    assert.deepEqual(shardExamples(names, 3, 3), ["c"]);
    assert.deepEqual(shardExamples(names, 6, 6), []);
  });

  it("parses `--shard <i>/<n>` and rejects anything else", function () {
    assert.deepEqual(parseShard("2/6"), { index: 2, count: 6 });
    for (const bad of [undefined, "0/6", "7/6", "a/b", "2", "2/0", "1/2x"]) assert.equal(parseShard(bad), null);
  });
});
