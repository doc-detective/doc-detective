import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { verifiedDate, shieldsBadge, resolveVerifiedId } from "../dist/core/utils.js";
import { applyVerification, declarePage, pinOf } from "../dist/core/verification.js";

before(async function () {
  const { expect } = await import("chai");
  global.expect = expect;
});

const here = path.dirname(fileURLToPath(import.meta.url));
const fixtures = path.join(here, "verification-fixtures");

// Fixed on purpose: opts() hands these to applyVerification as the run's day
// and version, so every expected output is exact. They aren't the wall clock
// or package.json, and the fixtures' pins don't depend on them.
const TODAY = "2026-10-21";
const VERSION = "4.27.0";
// Every check resolves to `result` unless `results` names it.
function opts(result = "PASS", results = {}) {
  return {
    today: TODAY,
    version: VERSION,
    resolve: (check) => (check in results ? results[check] : result),
  };
}

describe("Verification metadata — pure helpers", function () {
  describe("verifiedDate()", function () {
    it("formats a Date as zero-padded YYYY-MM-DD (UTC)", function () {
      expect(verifiedDate(new Date("2026-06-26T12:34:56Z"))).to.equal("2026-06-26");
      expect(verifiedDate(new Date("2026-01-05T00:00:00Z"))).to.equal("2026-01-05");
    });
  });

  describe("shieldsBadge()", function () {
    it("markdown image with shields.io dash-doubling", function () {
      expect(shieldsBadge("markdown", "2026-06-26")).to.equal(
        "![Last verified 2026-06-26](https://img.shields.io/badge/Last_verified-2026--06--26-brightgreen)"
      );
    });
    it("asciidoc image macro", function () {
      expect(shieldsBadge("asciidoc", "2026-06-26")).to.equal(
        "image:https://img.shields.io/badge/Last_verified-2026--06--26-brightgreen[Last verified 2026-06-26]"
      );
    });
    it("html img tag", function () {
      expect(shieldsBadge("html", "2026-06-26")).to.equal(
        '<img src="https://img.shields.io/badge/Last_verified-2026--06--26-brightgreen" alt="Last verified 2026-06-26">'
      );
    });
    it("dita image element", function () {
      expect(shieldsBadge("dita", "2026-06-26")).to.equal(
        '<image href="https://img.shields.io/badge/Last_verified-2026--06--26-brightgreen"><alt>Last verified 2026-06-26</alt></image>'
      );
    });
    it("honors a custom label and color", function () {
      expect(shieldsBadge("markdown", "2026-06-26", { label: "Verified", color: "green" })).to.equal(
        "![Verified 2026-06-26](https://img.shields.io/badge/Verified-2026--06--26-green)"
      );
    });
  });

  describe("resolveVerifiedId()", function () {
    const results = {
      specs: [
        { specId: "s1", result: "PASS", tests: [{ testId: "t1", result: "PASS" }, { testId: "t2", result: "FAIL" }] },
      ],
    };
    it("resolves a spec id", function () {
      expect(resolveVerifiedId(results, "s1")).to.equal("PASS");
    });
    it("resolves a test id", function () {
      expect(resolveVerifiedId(results, "t2")).to.equal("FAIL");
    });
    it("returns null for an unknown id", function () {
      expect(resolveVerifiedId(results, "nope")).to.equal(null);
    });
    it("returns null for null / non-array-specs inputs", function () {
      expect(resolveVerifiedId(null, "x")).to.equal(null);
      expect(resolveVerifiedId({}, "x")).to.equal(null);
      expect(resolveVerifiedId({ specs: [{ specId: "s", tests: [] }] }, "x")).to.equal(null);
    });
    it("gives specId precedence over a same-named testId", function () {
      const r = { specs: [{ specId: "dup", result: "PASS", tests: [{ testId: "dup", result: "FAIL" }] }] };
      expect(resolveVerifiedId(r, "dup")).to.equal("PASS");
    });
    it("passes a test revisited by routing only if every visit passed", function () {
      const r = { specs: [{ specId: "s", tests: [{ testId: "t", result: "PASS" }, { testId: "t", result: "FAIL" }] }] };
      expect(resolveVerifiedId(r, "t")).to.equal("FAIL");
      r.specs[0].tests[1].result = "PASS";
      expect(resolveVerifiedId(r, "t")).to.equal("PASS");
    });
    it("gives specId precedence even when a testId match comes first", function () {
      const r = {
        specs: [
          { specId: "a", result: "FAIL", tests: [{ testId: "dup", result: "FAIL" }] },
          { specId: "dup", result: "PASS", tests: [] },
        ],
      };
      expect(resolveVerifiedId(r, "dup")).to.equal("PASS");
    });
  });

  describe("pinOf()", function () {
    it("hashes lines joined with LF, by manni's rule", function () {
      const hex = crypto.createHash("sha256").update("a\nb", "utf8").digest("hex");
      expect(pinOf(["a", "b"])).to.equal(`sha256-${hex}`);
    });
  });

  // `verification.write: true`: a passing page with no entry of ours gets one,
  // naming its spec, for the fill to complete in the same run.
  describe("declarePage()", function () {
    const ours = ["  - tool: doc-detective", "    check: docs/a.md"];
    it("creates front matter on a page that has none", function () {
      expect(declarePage("# Doc\n", "docs/a.md")).to.equal(["---", "verified-by:", ...ours, "---", "# Doc", ""].join("\n"));
    });
    it("appends verified-by to front matter without one", function () {
      expect(declarePage("---\ntitle: X\n---\n# X\n", "docs/a.md")).to.equal(
        ["---", "title: X", "verified-by:", ...ours, "---", "# X", ""].join("\n")
      );
    });
    it("adds its entry to another tool's list", function () {
      expect(declarePage("---\nverified-by:\n  - tool: lychee\n---\n", "docs/a.md")).to.equal(
        ["---", "verified-by:", "  - tool: lychee", ...ours, "---", ""].join("\n")
      );
    });
    it("keeps a flow list flow", function () {
      expect(declarePage("---\nverified-by: [{tool: lychee}]\n---\n", "docs/a.md")).to.equal(
        "---\nverified-by: [{tool: lychee}, {tool: doc-detective, check: docs/a.md}]\n---\n"
      );
    });
    it("leaves a page that already names doc-detective alone", function () {
      const page = "---\nverified-by:\n  - tool: doc-detective\n    check: other\n---\n";
      expect(declarePage(page, "docs/a.md")).to.equal(page);
    });
    it("quotes a spec id YAML would misread, and keeps CRLF", function () {
      expect(declarePage("---\r\ntitle: X\r\n---\r\n", "a: b")).to.equal(
        '---\r\ntitle: X\r\nverified-by:\r\n  - tool: doc-detective\r\n    check: "a: b"\r\n---\r\n'
      );
    });
    it("is completed by the fill in the same pass", function () {
      const out = applyVerification(declarePage("# Doc\n", "docs/a.md"), "markdown", opts());
      expect(out).to.equal(
        ["---", "verified-by:", ...ours, "    version: 4.27.0", "    passed: 2026-10-21", "last-verified: 2026-10-21", "---", "# Doc", ""].join("\n")
      );
    });
  });

  describe("front matter: verified-by and last-verified", function () {
    it("fills its entry and sets last-verified on PASS", function () {
      const input = [
        "---",
        "title: Set up",
        "last-updated: 2026-10-17",
        "verified-by:",
        "  - tool: doc-detective",
        "    check: cite-set-up",
        "---",
        "",
        "# Set up",
        "",
      ].join("\n");
      expect(applyVerification(input, "markdown", opts())).to.equal(
        [
          "---",
          "title: Set up",
          "last-updated: 2026-10-17",
          "verified-by:",
          "  - tool: doc-detective",
          "    check: cite-set-up",
          "    version: 4.27.0",
          "    passed: 2026-10-21",
          "last-verified: 2026-10-21",
          "---",
          "",
          "# Set up",
          "",
        ].join("\n")
      );
    });

    for (const result of ["FAIL", "WARNING", "SKIPPED"]) {
      it(`writes nothing on ${result}`, function () {
        const input = "---\nverified-by:\n  - tool: doc-detective\n    check: a\n---\n";
        expect(applyVerification(input, "markdown", opts(result))).to.equal(input);
      });
    }

    it("is idempotent: a second pass on the same day changes nothing", function () {
      const input = "---\ntitle: X\nverified-by:\n  - tool: doc-detective\n    check: a\n---\n# X\n";
      const once = applyVerification(input, "markdown", opts());
      expect(once).to.not.equal(input);
      expect(applyVerification(once, "markdown", opts())).to.equal(once);
    });

    it("fills a key that is present with no value", function () {
      const input = "---\nverified-by:\n  - tool: doc-detective\n    check: a\n    passed:\nlast-verified:\n---\n";
      expect(applyVerification(input, "markdown", opts())).to.equal(
        "---\nverified-by:\n  - tool: doc-detective\n    check: a\n    passed: 2026-10-21\n    version: 4.27.0\nlast-verified: 2026-10-21\n---\n"
      );
    });

    it("updates existing values in place, keeping their quotes", function () {
      const input = [
        "---",
        'last-verified: "2026-01-01"',
        "verified-by:",
        "  - tool: doc-detective",
        "    check: a",
        "    version: 4.0.0",
        "    passed: '2026-01-01' # last good run",
        "---",
        "",
      ].join("\n");
      expect(applyVerification(input, "markdown", opts())).to.equal(
        [
          "---",
          'last-verified: "2026-10-21"',
          "verified-by:",
          "  - tool: doc-detective",
          "    check: a",
          "    version: 4.27.0",
          "    passed: '2026-10-21' # last good run",
          "---",
          "",
        ].join("\n")
      );
    });

    it("sets last-verified to the oldest pass across all entries", function () {
      const input = [
        "---",
        "verified-by:",
        "  - tool: doc-detective",
        "    check: a",
        "  - tool: lychee",
        "    passed: 2026-10-01T09:00:00Z",
        "---",
        "",
      ].join("\n");
      const out = applyVerification(input, "markdown", opts());
      expect(out).to.contain("last-verified: 2026-10-01T09:00:00Z\n");
      expect(out).to.contain("    passed: 2026-10-21\n");
    });

    it("leaves last-verified unset while another entry has never passed", function () {
      const input = [
        "---",
        "verified-by:",
        "  - tool: doc-detective",
        "    check: a",
        "  - tool: lychee",
        "---",
        "",
      ].join("\n");
      const out = applyVerification(input, "markdown", opts());
      expect(out).to.contain("    passed: 2026-10-21\n");
      expect(out).to.not.contain("last-verified");
    });

    it("never touches another tool's entry, even one naming the same check", function () {
      const input = [
        "---",
        "verified-by:",
        "  - tool: sample-runner",
        "    check: a",
        "  - tool: doc-detective",
        "    check: a",
        "---",
        "",
      ].join("\n");
      const out = applyVerification(input, "markdown", opts());
      expect(out).to.contain("  - tool: sample-runner\n    check: a\n  - tool: doc-detective");
      expect(out.match(/passed:/g)).to.have.length(1);
    });

    it("fills each of its own entries by its own check", function () {
      const input = [
        "---",
        "verified-by:",
        "  - tool: doc-detective",
        "    check: a",
        "  - tool: doc-detective",
        "    check: b",
        "---",
        "",
      ].join("\n");
      const out = applyVerification(input, "markdown", opts("PASS", { b: "FAIL" }));
      expect(out).to.contain("    check: a\n    version: 4.27.0\n    passed: 2026-10-21\n  - tool: doc-detective\n    check: b\n---");
      expect(out).to.not.contain("last-verified");
    });

    it("leaves an entry with no check alone", function () {
      const input = "---\nverified-by:\n  - tool: doc-detective\n---\n";
      expect(applyVerification(input, "markdown", opts())).to.equal(input);
    });

    it("keeps flow style, adding keys at the end of the flow map", function () {
      const input = "---\ntags: [a, b]\nverified-by: [{tool: doc-detective, check: a}]\n---\n";
      expect(applyVerification(input, "markdown", opts())).to.equal(
        "---\ntags: [a, b]\nverified-by: [{tool: doc-detective, check: a, version: 4.27.0, passed: 2026-10-21}]\nlast-verified: 2026-10-21\n---\n"
      );
    });

    it("keeps CRLF line endings", function () {
      const input = "---\r\nverified-by:\r\n  - tool: doc-detective\r\n    check: a\r\n---\r\n# X\r\n";
      const out = applyVerification(input, "markdown", opts());
      expect(out).to.equal(
        "---\r\nverified-by:\r\n  - tool: doc-detective\r\n    check: a\r\n    version: 4.27.0\r\n    passed: 2026-10-21\r\nlast-verified: 2026-10-21\r\n---\r\n# X\r\n"
      );
    });

    it("no longer reads or writes doc-detective.verified", function () {
      const input = "---\ndoc-detective:\n  verified:\n    id: a\n---\n";
      expect(applyVerification(input, "markdown", opts())).to.equal(input);
    });

    it("reports a check that matches no test or spec", function () {
      const unknown = [];
      const input = "---\nverified-by:\n  - tool: doc-detective\n    check: gone\n---\n";
      const out = applyVerification(input, "markdown", {
        ...opts(),
        resolve: () => null,
        onUnknown: (check) => unknown.push(check),
      });
      expect(out).to.equal(input);
      expect(unknown).to.deep.equal(["gone"]);
    });
  });

  describe("inline meta statements", function () {
    const files = fs.readdirSync(fixtures);
    for (const name of files) {
      const format = { md: "markdown", mdx: "markdown", html: "html", adoc: "asciidoc", dita: "dita" }[
        name.split(".").pop()
      ];
      it(`pins ${name} exactly as manni does, and fills each entry`, function () {
        const pinned = fs.readFileSync(path.join(fixtures, name), "utf8");
        const manniPins = pinned.match(/sha256-[0-9a-f]{64}/g);
        expect(manniPins.length).to.be.greaterThan(0);
        const unpinned = pinned.replace(/meta sha256-[0-9a-f]{64} /g, "meta ");
        const out = applyVerification(unpinned, format, opts());
        expect(out.match(/sha256-[0-9a-f]{64}/g)).to.deep.equal(manniPins);
        expect(out.match(/"version":"4\.27\.0","passed":"2026-10-21"}\],"last-verified":"2026-10-21"/g)).to.have.length(
          manniPins.length
        );
        // A second pass changes nothing.
        expect(applyVerification(out, format, opts())).to.equal(out);
      });
    }

    it("keeps each comment form as written", function () {
      const read = (n) => fs.readFileSync(path.join(fixtures, n), "utf8").replace(/meta sha256-[0-9a-f]{64} /g, "meta ");
      expect(applyVerification(read("pinned.mdx"), "markdown", opts())).to.match(/^\{\/\* meta sha256-[0-9a-f]{64} \{.*\} \*\/\}$/m);
      expect(applyVerification(read("pinned.md"), "markdown", opts())).to.match(/^\[comment\]: # \(meta sha256-[0-9a-f]{64} \{.*\}\)$/m);
      expect(applyVerification(read("pinned.adoc"), "asciidoc", opts())).to.match(/^\/\/ \(meta sha256-[0-9a-f]{64} \{.*\}\)$/m);
      expect(applyVerification(read("pinned.dita"), "dita", opts())).to.match(/<step><\?manni meta sha256-[0-9a-f]{64} \{.*\}\?>/);
    });

    it("re-pins a statement whose block changed since its last pin", function () {
      const stale = "sha256-" + "0".repeat(64);
      const input = `<!-- meta ${stale} {"verified-by":[{"tool":"doc-detective","check":"a"}]} -->\nNew text.\n`;
      const out = applyVerification(input, "markdown", opts());
      expect(out).to.contain(`meta ${pinOf(["New text."])} {`);
    });

    it("writes nothing on FAIL", function () {
      const input = '<!-- meta {"verified-by":[{"tool":"doc-detective","check":"a"}]} -->\nText.\n';
      expect(applyVerification(input, "markdown", opts("FAIL"))).to.equal(input);
    });

    it("never touches another tool's entry, and holds last-verified back for it", function () {
      const input =
        '<!-- meta {"verified-by":[{"tool":"lychee"},{"tool":"doc-detective","check":"a"}]} -->\nText.\n';
      expect(applyVerification(input, "markdown", opts())).to.equal(
        `<!-- meta ${pinOf(["Text."])} {"verified-by":[{"tool":"lychee"},{"tool":"doc-detective","check":"a","version":"4.27.0","passed":"2026-10-21"}]} -->\nText.\n`
      );
    });

    it("keeps the statement's other fields", function () {
      const input = '{/* meta {"concepts":["install"],"verified-by":[{"tool":"doc-detective","check":"a"}]} */}\nText.\n';
      expect(applyVerification(input, "markdown", opts())).to.equal(
        `{/* meta ${pinOf(["Text."])} {"concepts":["install"],"verified-by":[{"tool":"doc-detective","check":"a","version":"4.27.0","passed":"2026-10-21"}],"last-verified":"2026-10-21"} */}\nText.\n`
      );
    });

    it("skips a statement that anchors nothing, or whose payload is not one JSON object", function () {
      const orphan = 'Text.\n\n<!-- meta {"verified-by":[{"tool":"doc-detective","check":"a"}]} -->\n';
      expect(applyVerification(orphan, "markdown", opts())).to.equal(orphan);
      const broken = '<!-- meta {"verified-by": -->\nText.\n';
      expect(applyVerification(broken, "markdown", opts())).to.equal(broken);
    });

    it("ignores the retired inline `verified` marker", function () {
      const input = "<!-- verified id=a -->\nText.\n";
      expect(applyVerification(input, "markdown", opts())).to.equal(input);
    });
  });

  // manni proposal 0101: before hashing, every statement inside the anchored
  // lines is cut out, a <data> carrier whole, and a line the cut leaves blank
  // is dropped. Mirrors manni's test/statements-pin-cut.test.ts.
  describe("a pin ignores every statement inside its lines", function () {
    const ask = (check) => `<?manni meta {"verified-by":[{"tool":"doc-detective","check":"${check}"}]}?>`;
    const pinsIn = (content) => content.match(/sha256-[0-9a-f]{64}/g);

    it("pins a <steps> statement over a step statement on content only, and stays put on a second pass", function () {
      const page = ["<steps>", `  ${ask("outer")}`, "  <step>", `    ${ask("inner")}`, "    <cmd>Run the installer.</cmd>", "  </step>", "</steps>", ""].join("\n");
      const out = applyVerification(page, "dita", opts());
      expect(pinsIn(out)).to.deep.equal([
        pinOf(["<steps>", "  <step>", "    <cmd>Run the installer.</cmd>", "  </step>", "</steps>"]),
        pinOf(["  <step>", "    <cmd>Run the installer.</cmd>", "  </step>"]),
      ]);
      expect(applyVerification(out, "dita", opts())).to.equal(out);
    });

    it("pins a first child the same on its start tag's line and on its own line", function () {
      const onTagLine = ["<steps>", `  <step>${ask("a")}`, "    <cmd>Run it.</cmd>", "  </step>", "</steps>", ""].join("\n");
      const ownLine = ["<steps>", "  <step>", `    ${ask("a")}`, "    <cmd>Run it.</cmd>", "  </step>", "</steps>", ""].join("\n");
      const expected = pinOf(["  <step>", "    <cmd>Run it.</cmd>", "  </step>"]);
      expect(pinsIn(applyVerification(onTagLine, "dita", opts()))).to.deep.equal([expected]);
      expect(pinsIn(applyVerification(ownLine, "dita", opts()))).to.deep.equal([expected]);
    });

    it("still hashes a line that was blank before the cut", function () {
      const page = ["<steps>", "  <step>", `    ${ask("a")}`, "    <cmd>Run it.</cmd>", "", "  </step>", "</steps>", ""].join("\n");
      expect(pinsIn(applyVerification(page, "dita", opts()))).to.deep.equal([
        pinOf(["  <step>", "    <cmd>Run it.</cmd>", "", "  </step>"]),
      ]);
    });

    const value = `value='{"concepts":["a"]}'`;
    for (const [shape, carrier] of [
      ["self-closing", `<data name="manni-meta" ${value}/>`],
      ["with an end tag", `<data name="manni-meta" ${value}></data>`],
      ["whose start tag spans two lines", `<data name="manni-meta"\n      ${value}/>`],
    ]) {
      it(`cuts a <data> carrier whole when it is ${shape}`, function () {
        const page = ["<steps>", "  <step>", `    ${ask("a")}`, "    <cmd>Run it.</cmd>", `    <info>${carrier}More.</info>`, "  </step>", "</steps>", ""].join("\n");
        expect(pinsIn(applyVerification(page, "dita", opts()))).to.deep.equal([
          pinOf(["  <step>", "    <cmd>Run it.</cmd>", "    <info>More.</info>", "  </step>"]),
        ]);
      });
    }

    // In a line format, a statement lands inside another's anchor only by
    // sharing a line with its text (mirrors manni 0df6b6b1).
    for (const [format, lines, hashed] of [
      ["markdown", ["Run the installer <!-- meta {\"concepts\":[\"inner\"]} --> and wait."], "Run the installer  and wait."],
      ["html", ["<p>Hello <!-- meta {\"concepts\":[\"inner\"]} --> world.</p>"], "<p>Hello  world.</p>"],
    ]) {
      it(`cuts a statement inside another's anchor in ${format}, and the pin holds when it changes`, function () {
        const page = ['<!-- meta {"verified-by":[{"tool":"doc-detective","check":"a"}]} -->', ...lines, ""].join("\n");
        const out = applyVerification(page, format, opts());
        expect(pinsIn(out)).to.deep.equal([pinOf([hashed])]);
        const written = out.replace('{"concepts":["inner"]}', '{"concepts":["inner"],"last-verified":"2026-10-22"}');
        expect(pinsIn(applyVerification(written, format, opts()))).to.deep.equal([pinOf([hashed])]);
      });
    }

    it("cuts a statement from the line it shares with its text", function () {
      const page = `<!-- meta {"verified-by":[{"tool":"doc-detective","check":"a"}]} --> Run it.\n`;
      expect(pinsIn(applyVerification(page, "markdown", opts()))).to.deep.equal([pinOf([" Run it."])]);
    });
  });
});
