// `doc-detective audit`, in process: output shapes, credit across files, and
// exit codes (ADR 01206).
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import sinon from "sinon";
import { auditHandler } from "../dist/audit/command.js";

const page = [
  "# Install",
  "",
  "1. Open a terminal.",
  "2. Install the CLI:",
  "",
  "   ```bash {#install}",
  "   npm i -g doc-detective",
  "   ```",
  "",
  "3. Check the version.",
  "",
  "See [the site](https://example.com).",
  "",
].join("\n");

describe("audit command", function () {
  let dir, cwd, out, err, exitCode;

  beforeEach(function () {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), "dd-audit-"));
    cwd = process.cwd();
    process.chdir(dir);
    exitCode = process.exitCode;
    out = sinon.stub(process.stdout, "write").returns(true);
    err = sinon.stub(process.stderr, "write").returns(true);
  });

  afterEach(function () {
    out.restore();
    err.restore();
    process.exitCode = exitCode;
    process.chdir(cwd);
    fs.rmSync(dir, { recursive: true, force: true });
  });

  const stdout = () => out.args.map((a) => String(a[0])).join("");
  const run = async (args) => {
    await auditHandler({ envFile: false, ...args });
    out.restore();
    err.restore();
    return stdout();
  };

  it("prints the text report", async function () {
    fs.writeFileSync(path.join(dir, "install.md"), page);
    const text = await run({ input: dir });
    assert.match(text, /^Procedure steps {6}0 of 3 have a step\n/);
    // Item 2's bash block is detected as an unsafe step, so the item is skipped.
    assert.match(text, /2 untested, 0 ignored, 1 skipped as unsafe/);
    assert.match(text, /Code blocks {10}bash 1 \(0 have a step\); 0 not runnable/);
    assert.match(text, /Links {16}1 of 1 testable, 1 have a step/);
    assert.match(text, /Pages {16}0 of 1 have an authored step/);
    assert.match(text, new RegExp(`Untested procedure steps:\\n  ${path.join(dir, "install.md").replace(/\\/g, "\\\\")}\\n {7}3  Open a terminal\\.`));
    assert.equal(process.exitCode ?? 0, 0);
  });

  it("warns and leaves out a file it can't read after detection", async function () {
    const gone = path.join(dir, "gone.md");
    fs.writeFileSync(path.join(dir, "install.md"), page);
    fs.writeFileSync(gone, page);
    const read = fs.readFileSync;
    // Fail only audit's own read, as if the file vanished after detection.
    const stub = sinon.stub(fs, "readFileSync").callsFake(function (file, ...rest) {
      if (path.resolve(String(file)) === gone && /audit[\\/]index\.js/.test(new Error().stack)) {
        throw Object.assign(new Error("ENOENT: no such file"), { code: "ENOENT" });
      }
      return read.call(fs, file, ...rest);
    });
    try {
      const report = JSON.parse(await run({ input: dir, json: true }));
      assert.deepEqual(report.files.map((f) => path.basename(f.path)), ["install.md"]);
      const message = err.args.map((a) => String(a[0])).join("");
      assert.ok(message.includes(`Couldn't read \`${gone}\`.`), message);
      assert.equal(process.exitCode ?? 0, 0);
    } finally {
      stub.restore();
    }
  });

  it("prints only the first line with --quiet", async function () {
    fs.writeFileSync(path.join(dir, "install.md"), page);
    const text = await run({ input: dir, quiet: true });
    assert.equal(text, "Procedure steps      0 of 3 have a step\n");
  });

  it("prints one JSON document with --json, crediting a block by a spec's stepId", async function () {
    fs.writeFileSync(path.join(dir, "install.md"), page);
    fs.writeFileSync(
      path.join(dir, "install.spec.json"),
      JSON.stringify({ tests: [{ steps: [{ stepId: "install", runShell: "npm i -g doc-detective" }] }] })
    );
    const report = JSON.parse(await run({ input: dir, json: true }));
    assert.deepEqual(report.summary.procedureSteps, { total: 3, hasStep: 0, ignored: 0, skipped: 1, untested: 2, navigationOnly: 0 });
    assert.deepEqual(report.summary.codeBlocks, { byLanguage: { bash: { total: 1, hasStep: 1, ignored: 0, skipped: 0, untested: 0 } }, notRunnable: 0 });
    assert.equal(report.summary.pages.total, 1);
    assert.equal(report.files[0].path, path.join(dir, "install.md"));
  });

  it("credits an image a spec's screenshot step writes, resolved against the spec file", async function () {
    fs.mkdirSync(path.join(dir, "img"));
    fs.writeFileSync(path.join(dir, "page.md"), "![Home](img/home.png)\n\n![Other](img/other.png)\n");
    fs.writeFileSync(
      path.join(dir, "shots.spec.json"),
      JSON.stringify({ tests: [{ steps: [{ goTo: "https://example.com" }, { screenshot: { path: "img/home.png" } }] }] })
    );
    const report = JSON.parse(await run({ input: dir, json: true }));
    assert.deepEqual(report.summary.images, { total: 2, hasStep: 1 });
  });

  it("combines positional inputs with --input", async function () {
    fs.mkdirSync(path.join(dir, "a"));
    fs.mkdirSync(path.join(dir, "b"));
    fs.writeFileSync(path.join(dir, "a", "one.md"), page);
    fs.writeFileSync(path.join(dir, "b", "two.md"), page);
    const report = JSON.parse(await run({ input: path.join(dir, "a"), inputs: [path.join(dir, "b")], json: true }));
    assert.equal(report.summary.pages.total, 2);
  });

  it("exits 2 when the inputs hold only spec files", async function () {
    fs.writeFileSync(path.join(dir, "only.spec.json"), JSON.stringify({ tests: [{ steps: [{ goTo: "https://example.com" }] }] }));
    const text = await run({ input: dir });
    assert.equal(text, "");
    assert.equal(process.exitCode, 2);
    const message = err.args.map((a) => String(a[0])).join("");
    assert.match(message, /Couldn't find any files to audit in/);
  });

  for (const json of [true, false]) {
    it(`masks .env secrets in the ${json ? "JSON" : "text"} report`, async function () {
      fs.writeFileSync(path.join(dir, ".env"), "API_TOKEN=s3cr3tvalue42\n");
      fs.writeFileSync(path.join(dir, "page.md"), "1. Open the s3cr3tvalue42 page.\n\nSee [the site](https://example.com/s3cr3tvalue42).\n");
      try {
        const output = await run({ input: dir, json, envFile: true });
        assert.match(output, json ? /"summary"/ : /Procedure steps/);
        assert.ok(!output.includes("s3cr3tvalue42"), output);
      } finally {
        delete process.env.API_TOKEN;
      }
    });
  }

  it("lists untested steps even when a secret equals a state name", async function () {
    fs.writeFileSync(path.join(dir, ".env"), "API_TOKEN=untested\n");
    fs.writeFileSync(path.join(dir, "page.md"), "1. Open the app.\n");
    try {
      const text = await run({ input: dir, envFile: true });
      assert.match(text, /Untested procedure steps:/);
    } finally {
      delete process.env.API_TOKEN;
    }
  });

  it("keeps --json stdout clean when an MDX file doesn't parse", async function () {
    fs.writeFileSync(path.join(dir, "broken.mdx"), "1. Open <Unclosed the app.\n");
    const report = JSON.parse(await run({ input: dir, json: true }));
    assert.equal(report.summary.pages.total, 1);
  });

  it("exits 2 when there are no files to audit", async function () {
    fs.mkdirSync(path.join(dir, "empty"));
    const text = await run({ input: path.join(dir, "empty") });
    assert.equal(text, "");
    assert.equal(process.exitCode, 2);
    const message = err.args.map((a) => String(a[0])).join("");
    assert.match(message, /Couldn't find any files to audit in `.*empty`\. Pass a file or folder with `--input`\./);
  });

  it("names a relative input by its absolute path when there are no files", async function () {
    const empty = path.join(dir, "empty-relative");
    fs.mkdirSync(empty);
    await run({ input: path.relative(process.cwd(), empty) });
    const message = err.args.map((a) => String(a[0])).join("");
    assert.ok(message.includes(`\`${empty}\``), message);
  });
});
