import { applyBadgeAnchoredTests, verifiedDate } from "../dist/core/utils.js";
import { runTests } from "../dist/core/index.js";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

before(async function () {
  const { expect } = await import("chai");
  global.expect = expect;
});

// Recomputed before each test (see beforeEach) rather than captured once at
// module load, so a suite that spans a UTC midnight boundary can't drift from
// the date the writer actually stamps.
let TODAY;
let tmpDir;

function write(name, content) {
  const p = path.join(tmpDir, name);
  fs.writeFileSync(p, content);
  return p;
}
function read(p) {
  return fs.readFileSync(p, "utf8");
}
// Synthetic report: one spec, one badge-flagged test anchored at `line` in `file`.
function report(file, { line = 3, result = "PASS", testId = "t1", withLocation = true, badge = true } = {}) {
  return {
    specs: [
      {
        specId: "s1",
        contentPath: file,
        result,
        tests: [
          {
            testId,
            contentPath: file,
            result,
            badge,
            ...(withLocation ? { location: { line, startIndex: 0, endIndex: 0 } } : {}),
          },
        ],
      },
    ],
  };
}
const silent = { logLevel: "silent" };

describe("Badge-anchored test verification — write-back", function () {
  beforeEach(function () {
    TODAY = verifiedDate();
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "dd-badge-anchor-"));
  });
  afterEach(function () {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  describe("PASS inserts a badge above the test statement, per format", function () {
    it("markdown", function () {
      const f = write(
        "a.md",
        '# Doc\n\n<!-- test {"badge": true} -->\n<!-- step {"wait": 10} -->\n<!-- test end -->\n'
      );
      applyBadgeAnchoredTests({ config: silent, results: report(f) });
      const out = read(f);
      expect(out).to.contain(
        `![Last verified ${TODAY}](https://img.shields.io/badge/Last_verified-${TODAY.replace(/-/g, "--")}-brightgreen)`
      );
      // inserted directly above the test statement
      const lines = out.split("\n");
      expect(lines[2]).to.match(/img\.shields\.io\/badge/);
      expect(lines[3]).to.equal('<!-- test {"badge": true} -->');
    });

    it("asciidoc", function () {
      const f = write(
        "a.adoc",
        '= Doc\n\n// (test {"badge": true})\n// (step {"wait": 10})\n// (test end)\n'
      );
      applyBadgeAnchoredTests({ config: silent, results: report(f) });
      expect(read(f)).to.contain(
        `image:https://img.shields.io/badge/Last_verified-${TODAY.replace(/-/g, "--")}-brightgreen[Last verified ${TODAY}]`
      );
    });

    it("html", function () {
      const f = write(
        "a.html",
        '<h1>Doc</h1>\n<!-- test {"badge": true} -->\n<!-- step {"wait": 10} -->\n<!-- test end -->\n'
      );
      applyBadgeAnchoredTests({ config: silent, results: report(f, { line: 2 }) });
      expect(read(f)).to.contain(
        `<img src="https://img.shields.io/badge/Last_verified-${TODAY.replace(/-/g, "--")}-brightgreen" alt="Last verified ${TODAY}">`
      );
    });

    it("dita", function () {
      const f = write(
        "a.dita",
        '<topic><title>Doc</title></topic>\n<!-- test {"badge": true} -->\n<!-- step {"wait": 10} -->\n<!-- test end -->\n'
      );
      applyBadgeAnchoredTests({ config: silent, results: report(f, { line: 2 }) });
      expect(read(f)).to.contain(
        `<image href="https://img.shields.io/badge/Last_verified-${TODAY.replace(/-/g, "--")}-brightgreen">`
      );
    });
  });

  describe("idempotency", function () {
    it("a second call with the location a fresh detection would now report is byte-identical", function () {
      // Inserting a badge above a test at line 1 shifts that test down to line
      // 2 — exactly what a real re-run's fresh detection would report. This
      // models that correctly, rather than reusing a now-stale line number.
      const f = write(
        "a.md",
        '<!-- test {"badge": true} -->\n<!-- step {"wait": 10} -->\n<!-- test end -->\n'
      );
      applyBadgeAnchoredTests({ config: silent, results: report(f, { line: 1 }) });
      const once = read(f);
      applyBadgeAnchoredTests({ config: silent, results: report(f, { line: 2 }) });
      expect(read(f)).to.equal(once);
    });

    it("replaces a stale badge in place rather than duplicating it", function () {
      const f = write(
        "a.md",
        "![Last verified 2020-01-01](https://img.shields.io/badge/Last_verified-2020--01--01-brightgreen)\n" +
          '<!-- test {"badge": true} -->\n<!-- step {"wait": 10} -->\n<!-- test end -->\n'
      );
      applyBadgeAnchoredTests({ config: silent, results: report(f, { line: 2 }) });
      const out = read(f);
      expect(out).to.contain(TODAY);
      expect(out).to.not.contain("2020-01-01");
      expect((out.match(/img\.shields\.io/g) || []).length).to.equal(1);
    });
  });

  describe("gating", function () {
    it("FAIL leaves an existing badge untouched (ages)", function () {
      const f = write(
        "a.md",
        "![Last verified 2020-01-01](https://img.shields.io/badge/Last_verified-2020--01--01-brightgreen)\n" +
          '<!-- test {"badge": true} -->\n<!-- step {"find": "nope"} -->\n<!-- test end -->\n'
      );
      const before = read(f);
      applyBadgeAnchoredTests({ config: silent, results: report(f, { line: 2, result: "FAIL" }) });
      expect(read(f)).to.equal(before);
    });

    it("SKIPPED does not insert a badge", function () {
      const f = write(
        "a.md",
        '<!-- test {"badge": true} -->\n<!-- step {"wait": 10} -->\n<!-- test end -->\n'
      );
      const before = read(f);
      applyBadgeAnchoredTests({ config: silent, results: report(f, { line: 1, result: "SKIPPED" }) });
      expect(read(f)).to.equal(before);
    });

    it("a badge:true test with no location (e.g. a JSON/YAML spec test) warns and is skipped, not crashed", function () {
      const f = write("a.md", "# Doc\n");
      const logs = [];
      const realLog = console.log;
      console.log = (...a) => logs.push(a.join(" "));
      try {
        applyBadgeAnchoredTests({ config: { logLevel: "warning" }, results: report(f, { withLocation: false }) });
      } finally {
        console.log = realLog;
      }
      expect(read(f)).to.equal("# Doc\n");
      expect(logs.join("\n")).to.match(/no location/i);
    });
  });

  describe("indentation", function () {
    it("indents an inserted badge to match the test statement's own line", function () {
      const f = write(
        "a.md",
        '- item\n  <!-- test {"badge": true} -->\n  <!-- step {"wait": 10} -->\n  <!-- test end -->\n'
      );
      applyBadgeAnchoredTests({ config: silent, results: report(f, { line: 2 }) });
      const lines = read(f).split("\n");
      expect(lines[1]).to.match(/^ {2}!\[Last verified/);
    });
  });

  // `verification.write: true`: a passing inline test with an authored testId
  // gets a `meta` statement naming it, for the fill to complete and pin.
  describe("init: declaring a meta statement above a passing test", function () {
    const stmt = (form) => form('{"verified-by":[{"tool":"doc-detective","check":"install"}]}');
    const md = (s) => `<!-- meta ${s} -->`;
    const test = '<!-- test {"testId": "install"} -->\n<!-- step {"wait": 10} -->\n<!-- test end -->\n';
    // The report carries the test statement's own span, as detection records it.
    const run = (f, opts = {}, config = silent) => {
      const r = report(f, { testId: "install", badge: false, ...opts });
      const lines = read(f).split("\n");
      const line = r.specs[0].tests[0].location.line;
      const startIndex = lines.slice(0, line - 1).reduce((n, l) => n + l.length + 1, 0);
      r.specs[0].tests[0].location = { line, startIndex, endIndex: startIndex + lines[line - 1].length };
      applyBadgeAnchoredTests({ config, results: r, init: true });
    };

    it("inserts the statement on the line above the test statement", function () {
      const f = write("a.md", `# Doc\n\n${test}`);
      run(f);
      expect(read(f)).to.equal(`# Doc\n\n${stmt(md)}\n${test}`);
    });
    it("uses the format's comment form", function () {
      const mdx = write("a.mdx", '# Doc\n\n{/* test {"testId": "install"} */}\n');
      const adoc = write("a.adoc", '= Doc\n\n// (test {"testId": "install"})\n');
      run(mdx);
      run(adoc);
      expect(read(mdx)).to.equal(`# Doc\n\n${stmt((s) => `{/* meta ${s} */}`)}\n{/* test {"testId": "install"} */}\n`);
      expect(read(adoc)).to.equal(`= Doc\n\n${stmt((s) => `// (meta ${s})`)}\n// (test {"testId": "install"})\n`);
    });
    it("goes above the test's badge, and the badge stays put", function () {
      const f = write("a.md", `# Doc\n\n${test}`);
      run(f, { badge: true });
      const lines = read(f).split("\n");
      expect(lines[2]).to.equal(stmt(md));
      expect(lines[3]).to.match(/^!\[Last verified/);
      expect(lines[4]).to.equal('<!-- test {"testId": "install"} -->');
    });
    // A generated id changes whenever its test does, so it's frozen: written
    // into the test's own statement, where it counts as authored from then on.
    const generated = "a.md~1a2b3c4d";
    const declares = (form, id = generated) => form(`{"verified-by":[{"tool":"doc-detective","check":"${id}"}]}`);
    it("freezes a generated id into a JSON statement, then declares it", function () {
      const f = write("a.md", '# Doc\n\n<!-- test {"description": "x"} -->\n');
      run(f, { testId: generated });
      expect(read(f)).to.equal(
        `# Doc\n\n${declares(md)}\n<!-- test {"testId": "${generated}", "description": "x"} -->\n`
      );
    });
    it("freezes a generated id into a statement with no options", function () {
      const f = write("a.md", "# Doc\n\n<!-- test -->\n");
      run(f, { testId: generated });
      expect(read(f)).to.equal(`# Doc\n\n${declares(md)}\n<!-- test {"testId": "${generated}"} -->\n`);
    });
    it("freezes in the statement's own comment form", function () {
      const f = write("a.mdx", '# Doc\n\n{/* test {} */}\n');
      run(f, { testId: generated });
      expect(read(f)).to.equal(
        `# Doc\n\n${declares((s) => `{/* meta ${s} */}`)}\n{/* test {"testId": "${generated}"} */}\n`
      );
    });
    it("freezes an id the page mentions elsewhere but its statement doesn't hold", function () {
      const f = write("a.md", '# Doc\n\nSign in with login.\n\n<!-- test {"description": "x"} -->\n');
      run(f, { testId: "login", line: 5 });
      expect(read(f)).to.contain('<!-- test {"testId": "login", "description": "x"} -->');
    });
    it("warns, and writes nothing, for a statement whose options aren't JSON", function () {
      const original = "# Doc\n\n<!-- test description: x -->\n";
      const f = write("a.md", original);
      const logs = [];
      const realLog = console.log;
      console.log = (...a) => logs.push(a.join(" "));
      try {
        run(f, { testId: generated }, { logLevel: "warning" });
      } finally {
        console.log = realLog;
      }
      expect(read(f)).to.equal(original);
      expect(logs.join("\n")).to.contain(generated);
    });
    it("freezes nothing for a test that didn't pass", function () {
      const original = '# Doc\n\n<!-- test {"description": "x"} -->\n';
      const f = write("a.md", original);
      run(f, { testId: generated, result: "FAIL" });
      expect(read(f)).to.equal(original);
    });
    it("skips a test that didn't pass", function () {
      const original = `# Doc\n\n${test}`;
      const f = write("a.md", original);
      run(f, { result: "FAIL" });
      expect(read(f)).to.equal(original);
    });
    it("skips a test a statement already declares", function () {
      const original = `# Doc\n\n<!-- meta {"verified-by": [{"tool": "doc-detective", "check": "install"}]} -->\n${test}`;
      const f = write("a.md", original);
      run(f);
      expect(read(f)).to.equal(original);
    });
    it("warns, and writes nothing, when the format's comment can't hold the payload", function () {
      // AsciiDoc's `// ( )` form ends at the first `)`.
      const original = '= Doc\n\n// (test {"testId": "a(1)"})\n';
      const f = write("a.adoc", original);
      const logs = [];
      const realLog = console.log;
      console.log = (...a) => logs.push(a.join(" "));
      try {
        run(f, { testId: "a(1)" }, { logLevel: "warning" });
      } finally {
        console.log = realLog;
      }
      expect(read(f)).to.equal(original);
      expect(logs.join("\n")).to.match(/a\(1\).*\)/);
    });
    it("declares nothing without init", function () {
      const original = `# Doc\n\n${test}`;
      const f = write("a.md", original);
      applyBadgeAnchoredTests({ config: silent, results: report(f, { testId: "install", badge: false }) });
      expect(read(f)).to.equal(original);
    });
  });

  describe("only its own badge", function () {
    it("keeps another shields.io badge on the line above, and adds its own below it", function () {
      const own = `![Last verified ${TODAY}](https://img.shields.io/badge/Last_verified-${TODAY.replace(/-/g, "--")}-brightgreen)`;
      const build = "![build](https://img.shields.io/badge/build-passing-green)";
      const f = write("a.md", `# Doc\n${build}\n<!-- test {"badge": true} -->\n`);
      applyBadgeAnchoredTests({ config: silent, results: report(f) });
      expect(read(f)).to.equal(`# Doc\n${build}\n${own}\n<!-- test {"badge": true} -->\n`);
    });
  });

  describe("a test revisited by routing", function () {
    // A goToTest route can run one inline test twice, so the report holds two
    // entries with the same location.
    const twice = (f, results) => {
      const r = report(f, { result: results[0] });
      r.specs[0].tests.push({ ...r.specs[0].tests[0], result: results[1] });
      return r;
    };
    it("inserts one badge, not one per visit", function () {
      const f = write("a.md", '# Doc\n\n<!-- test {"badge": true} -->\n');
      applyBadgeAnchoredTests({ config: silent, results: twice(f, ["PASS", "PASS"]) });
      expect(read(f).match(/img\.shields\.io/g)).to.have.length(1);
    });
    it("inserts one badge for two tests on one line, which share the line above", function () {
      const f = write("a.md", '# Doc\n\n<!-- test {"badge": true} --><!-- test end --><!-- test {"badge": true} -->\n');
      const r = report(f);
      r.specs[0].tests.push({ ...r.specs[0].tests[0], testId: "t2", location: { line: 3, startIndex: 40, endIndex: 70 } });
      applyBadgeAnchoredTests({ config: silent, results: r });
      expect(read(f).match(/img\.shields\.io/g)).to.have.length(1);
    });
    it("inserts no badge when any visit didn't pass", function () {
      const original = '# Doc\n\n<!-- test {"badge": true} -->\n';
      const f = write("a.md", original);
      applyBadgeAnchoredTests({ config: silent, results: twice(f, ["FAIL", "PASS"]) });
      expect(read(f)).to.equal(original);
    });
  });

  describe("multiple badge tests in one file", function () {
    it("stamps only the passing test's badge; the failing one's is untouched", function () {
      const f = write(
        "a.md",
        '<!-- test {"badge": true} -->\n<!-- step {"wait": 10} -->\n<!-- test end -->\n\n' +
          "![Last verified 2020-01-01](https://img.shields.io/badge/Last_verified-2020--01--01-brightgreen)\n" +
          '<!-- test {"badge": true} -->\n<!-- step {"find": "nope"} -->\n<!-- test end -->\n'
      );
      const results = {
        specs: [
          {
            specId: "s1",
            contentPath: f,
            tests: [
              { testId: "t1", contentPath: f, result: "PASS", badge: true, location: { line: 1 } },
              { testId: "t2", contentPath: f, result: "FAIL", badge: true, location: { line: 6 } },
            ],
          },
        ],
      };
      applyBadgeAnchoredTests({ config: silent, results });
      const out = read(f);
      expect(out).to.contain(TODAY);
      expect(out).to.contain("2020-01-01");
    });
  });

  describe("skip paths", function () {
    it("no-ops when results has no specs array", function () {
      applyBadgeAnchoredTests({ config: silent, results: {} });
      applyBadgeAnchoredTests({ config: silent, results: null });
    });
    it("ignores tests without badge: true", function () {
      const f = write("a.md", '<!-- test {"testId": "t1"} -->\n<!-- step {"wait": 10} -->\n<!-- test end -->\n');
      const results = {
        specs: [
          {
            specId: "s1",
            contentPath: f,
            tests: [{ testId: "t1", contentPath: f, result: "PASS", location: { line: 1 } }],
          },
        ],
      };
      const before = read(f);
      applyBadgeAnchoredTests({ config: silent, results });
      expect(read(f)).to.equal(before);
    });
    it("skips a non-existent content path without throwing", function () {
      const missing = path.join(tmpDir, "nope.md");
      applyBadgeAnchoredTests({ config: silent, results: report(missing) });
      expect(fs.existsSync(missing)).to.equal(false);
    });
    it("skips a spec with no tests array", function () {
      applyBadgeAnchoredTests({ config: silent, results: { specs: [{ specId: "s1", contentPath: "x" }] } });
    });
    it("skips a badge:true test with no contentPath", function () {
      const results = {
        specs: [
          { specId: "s1", tests: [{ testId: "t1", result: "PASS", badge: true, location: { line: 1 } }] },
        ],
      };
      applyBadgeAnchoredTests({ config: silent, results });
    });
    it("skips a badge:true test whose contentPath has an unsupported extension", function () {
      const f = write("a.txt", '<!-- test {"badge": true} -->\n<!-- step {"wait": 10} -->\n<!-- test end -->\n');
      const before = read(f);
      applyBadgeAnchoredTests({ config: silent, results: report(f, { line: 1 }) });
      expect(read(f)).to.equal(before);
    });
    it("skips a badge:true test whose location is out of range for the current file", function () {
      const f = write("a.md", '<!-- test {"badge": true} -->\n<!-- step {"wait": 10} -->\n<!-- test end -->\n');
      const before = read(f);
      applyBadgeAnchoredTests({ config: silent, results: report(f, { line: 999 }) });
      expect(read(f)).to.equal(before);
    });
    it("warns and continues when the content path is unreadable (e.g. a directory)", function () {
      const dir = path.join(tmpDir, "a-directory.md");
      fs.mkdirSync(dir);
      const logs = [];
      const realLog = console.log;
      console.log = (...a) => logs.push(a.join(" "));
      try {
        applyBadgeAnchoredTests({ config: { logLevel: "warning" }, results: report(dir, { line: 1 }) });
      } finally {
        console.log = realLog;
      }
      expect(logs.join("\n")).to.match(/failed to update badge-anchored tests/i);
    });
  });

  describe("end-to-end via runTests — no testId anywhere", function () {
    it("inserts a badge on a passing badge:true test with no authored testId", async function () {
      this.timeout(120000);
      const f = write(
        "page.md",
        [
          "# Page",
          "",
          '<!-- test {"badge": true} -->',
          '<!-- step {"wait": 10} -->',
          "<!-- test end -->",
          "",
        ].join("\n")
      );
      await runTests({ input: f, logLevel: "silent" });
      const out = read(f);
      expect(out).to.match(/!\[Last verified \d{4}-\d{2}-\d{2}\]\(https:\/\/img\.shields\.io\/badge\//);
      expect(out).to.not.contain("testId");
    });

    it("leaves a failing badge:true test's badge untouched", async function () {
      this.timeout(120000);
      const f = write(
        "page.md",
        [
          "# Page",
          "",
          "![Last verified 2020-01-01](https://img.shields.io/badge/Last_verified-2020--01--01-brightgreen)",
          '<!-- test {"badge": true} -->',
          '<!-- step {"find": "this-text-does-not-exist"} -->',
          "<!-- test end -->",
          "",
        ].join("\n")
      );
      await runTests({ input: f, logLevel: "silent" });
      expect(read(f)).to.contain("2020-01-01");
    });

    it("running twice in a row is byte-identical (real detection re-reports the shifted line)", async function () {
      this.timeout(120000);
      const f = write(
        "page.md",
        [
          "# Page",
          "",
          '<!-- test {"badge": true} -->',
          '<!-- step {"wait": 10} -->',
          "<!-- test end -->",
          "",
        ].join("\n")
      );
      await runTests({ input: f, logLevel: "silent" });
      const once = read(f);
      expect((once.match(/img\.shields\.io/g) || []).length).to.equal(1);
      await runTests({ input: f, logLevel: "silent" });
      expect(read(f)).to.equal(once);
    });
  });
});
