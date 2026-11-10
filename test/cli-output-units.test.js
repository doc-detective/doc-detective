// Pure helpers behind the CLI's messages.
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import assert from "node:assert/strict";
import { expect } from "chai";
import { captureConsoleError } from "./capture-errors.js";
import { nearestCommand, rewriteRootError } from "../dist/cliHelp.js";
import { applyInputFlag, isInteractive, reportCrash, verdictLine } from "../dist/cliOutput.js";
import { createInterruptHandler } from "../dist/core/signals.js";
import { knownKeysAt, summarizeSchemaErrors } from "../dist/core/utils.js";
import { validate } from "../dist/common/src/index.js";
import { schemas } from "../dist/common/src/schemas/index.js";
import { telemetryAllowed, telemetryNotice } from "../dist/core/telemLite.js";
import { defaultCacheRoot, userConfigDir } from "../dist/runtime/cacheDir.js";
import { checkForUpdate } from "../dist/runtime/selfUpdate.js";
import { setConfig } from "../dist/utils.js";

describe("nearestCommand", function () {
  const names = ["run", "install", "debug", "lsp", "help"];
  it("finds a close match", function () {
    expect(nearestCommand("instal", names)).to.equal("install");
    expect(nearestCommand("RUN", names)).to.equal("run");
  });
  it("leaves distant words alone", function () {
    expect(nearestCommand("docs/guide.md", names)).to.equal(undefined);
  });
  it("doesn't stretch a short word to a different one", function () {
    expect(nearestCommand("nope", ["type"])).to.equal(undefined);
    expect(nearestCommand("typo", ["type"])).to.equal("type");
  });
  it("counts two swapped letters as one edit", function () {
    expect(nearestCommand("ulr", ["url"])).to.equal("url");
    expect(nearestCommand("tset", ["test"])).to.equal("test");
    expect(nearestCommand("rnu", names)).to.equal("run");
  });
});

describe("rewriteRootError", function () {
  it("rewrites extra arguments as an unknown command", function () {
    const out = rewriteRootError(
      "error: too many arguments. Expected 0 arguments but got 1: instal.\n",
      ["install"]
    );
    expect(out).to.include("unknown command 'instal'");
    expect(out).to.include("Did you mean install?");
  });
  it("suggests a command with two swapped letters", function () {
    const out = rewriteRootError("error: too many arguments. Expected 0 arguments but got 1: rnu.\n", ["run", "install"]);
    expect(out).to.include("Did you mean run?");
  });
  it("names the bad item of a list option", function () {
    const raw =
      "error: option '-r, --reporters <names>' argument 'terminal, bogus,json' is invalid. Allowed choices are terminal, json, html.\n";
    expect(rewriteRootError(raw, [])).to.equal(
      "error: option '-r, --reporters <names>' argument 'bogus' is invalid. Allowed choices are terminal, json, html.\n"
    );
  });
  it("passes other errors through", function () {
    expect(rewriteRootError("error: unknown option '--x'\n", [])).to.equal(
      "error: unknown option '--x'\n"
    );
  });
});

describe("verdictLine", function () {
  const verdict = (tests) => verdictLine({ summary: { tests } });
  it("reports failures", function () {
    expect(verdict({ pass: 1, fail: 1, warning: 0, skipped: 0 })).to.include("1 of 2 tests failed.");
  });
  it("counts warnings and skips on the fail line too", function () {
    expect(verdict({ pass: 9, fail: 1, warning: 2, skipped: 3 })).to.include(
      "1 of 15 tests failed (2 with warnings, 3 skipped)."
    );
  });
  it("reports a warnings-only run as passed", function () {
    expect(verdict({ pass: 0, fail: 0, warning: 2, skipped: 0 })).to.include("2 of 2 tests passed (2 with warnings).");
  });
  it("reports passes, with warnings and skips", function () {
    expect(verdict({ pass: 1, fail: 0, warning: 1, skipped: 1 })).to.include(
      "2 of 3 tests passed (1 with warnings, 1 skipped)"
    );
  });
  it("reports all skipped", function () {
    expect(verdict({ pass: 0, fail: 0, warning: 0, skipped: 2 })).to.include("All 2 tests skipped");
  });
  it("reports nothing run", function () {
    expect(verdictLine(null)).to.include("No tests ran");
  });
});

// One line format for every schema error, config and spec alike (ADR 01150).
describe("summarizeSchemaErrors", function () {
  const summarize = (object, schemaKey = "spec_v3") =>
    summarizeSchemaErrors(
      validate({ schemaKey, object, addDefaults: false, structuredErrors: true }).errorObjects,
      object,
      schemaKey
    );
  const spec = (step) => ({ tests: [{ steps: [step] }] });

  it("names an unknown action and the nearest real one", function () {
    expect(summarize(spec({ goToo: "x" }))).to.equal("tests[0].steps[0]: unknown action 'goToo'. Did you mean goTo?");
  });

  it("handles a step with no recognizable key", function () {
    expect(summarize(spec({}))).to.include("tests[0].steps[0]: no action");
  });

  // The formatter reads the shared step keys from here and falls back to none,
  // so a schema change that moves them fails this test rather than going quiet.
  it("finds step_v3's shared keys where the formatter reads them", function () {
    expect(Object.keys(schemas.step_v3.components.schemas.common.properties)).to.include("stepId");
  });

  it("names a missing required key", function () {
    expect(summarize({})).to.equal("missing required key 'tests'.");
  });

  it("lists every allowed type, and the value it got", function () {
    expect(summarize(spec({ goTo: [] }))).to.equal("tests[0].steps[0].goTo: must be string or object (got []).");
    expect(summarize({ concurrentRunners: "lots" }, "config_v3")).to.equal(
      'concurrentRunners: must be integer or boolean (got "lots").'
    );
  });

  // A schema's own errorMessage stays whole, commas and parentheses included
  // (ADR 01175).
  for (const [step, line] of [
    [
      { click: true },
      'tests[0].steps[0].click: must be string or object (got true). To click an element whose text is "true", quote it: "click": "true".',
    ],
    [
      { find: { selector: "#a", type: { keys: "x", selector: "#b" } } },
      "tests[0].steps[0].find.type: must not set `selector` (`find` already locates the element).",
    ],
  ]) {
    it(`keeps the schema's message for ${JSON.stringify(step)}`, function () {
      expect(summarize(spec(step)).split("\n")).to.include(line);
    });
  }

  it("lists the allowed values, and drops the other branches' type errors", function () {
    expect(summarize(spec({ click: { selector: "#go", button: "middle-ish" } }))).to.equal(
      'tests[0].steps[0].click.button: must be one of left, right, middle (got "middle-ish").'
    );
  });

  it("suggests a nested key, in place of the missing key it means", function () {
    expect(summarize(spec({ runShell: { comand: "echo hi" } }))).to.equal(
      "tests[0].steps[0].runShell: unknown key `comand`. Did you mean `command`?"
    );
    expect(summarize(spec({ goTo: { url: "https://example.com", waitUntil: { netwrkIdleTime: 1 } } }))).to.equal(
      "tests[0].steps[0].goTo.waitUntil: unknown key `netwrkIdleTime`. Did you mean `networkIdleTime`?"
    );
  });

  it("names the alternatives when one of several keys is required", function () {
    const object = { integrations: { heretto: [{ name: "x", organizationId: "o", username: "u" }] } };
    expect(summarize(object, "config_v3")).to.equal("integrations.heretto[0]: needs one of apiToken, apiTokenFile.");
  });

  it("lets a suggestion stand in for the choice it names", function () {
    const object = { integrations: { heretto: [{ name: "x", organizationId: "o", username: "u", apiTokn: "t" }] } };
    expect(summarize(object, "config_v3")).to.equal(
      "integrations.heretto[0]: unknown key `apiTokn`. Did you mean `apiToken`?"
    );
  });

  it("keeps a missing key beside a deeper error", function () {
    expect(summarize({ runOn: [{ platforms: "bogus" }] })).to.equal(
      [
        "missing required key 'tests'.",
        'runOn[0].platforms: must be one of linux, mac, windows, android, ios (got "bogus").',
      ].join("\n")
    );
    expect(summarize({ tests: [{ runOn: ["bad"] }] })).to.equal(
      ["tests[0]: needs one of steps, contexts.", 'tests[0].runOn[0]: must be object (got "bad").'].join("\n")
    );
  });

  it("drops a branch's missing key when another branch went deeper", function () {
    expect(summarize({ fileTypes: [{ extends: "nope" }] }, "config_v3")).to.equal(
      'fileTypes[0].extends: must be one of markdown, asciidoc, html, dita (got "nope").'
    );
  });

  it("names each key a schema requires together, not as a choice", function () {
    expect(summarize({ integrations: { heretto: [{ apiToken: "t" }] } }, "config_v3")).to.equal(
      [
        "integrations.heretto[0]: missing required key 'name'.",
        "integrations.heretto[0]: missing required key 'organizationId'.",
        "integrations.heretto[0]: missing required key 'username'.",
      ].join("\n")
    );
  });

  it("shortens a long value", function () {
    const line = summarize({ concurrentRunners: { note: "x".repeat(200) } }, "config_v3");
    // `…` is one character, U+2026, as shortJson writes it, not three dots.
    expect(line).to.equal(`concurrentRunners: must be integer or boolean (got {"note":"${"x".repeat(30)}…).`);
  });

  it("shortens a long string, and keeps its quotes", function () {
    expect(summarize({ shell: "z".repeat(100) }, "config_v3")).to.equal(
      `shell: must be one of bash, cmd, powershell (got "${"z".repeat(37)}…").`
    );
  });

  it("counts escapes when it shortens, and never cuts one in half", function () {
    const got = (shell) => /\(got (.*)\)\.$/.exec(summarize({ shell }, "config_v3"))[1];
    for (const shell of ["\n".repeat(37), '"'.repeat(50), `${"a".repeat(36)}\\${"b".repeat(10)}`]) {
      const shown = got(shell);
      expect(shown.length, shown).to.be.at.most(40);
      expect(shown, shown).to.match(/^".*…"$/);
      expect(shown, shown).to.not.match(/(^|[^\\])(\\\\)*\\…/);
    }
    expect(got(`${"a".repeat(36)}\\${"b".repeat(10)}`)).to.equal(`"${"a".repeat(36)}…"`);
  });

  it("names keys that can't be used together as a choice, not as false schemas", function () {
    const markup = { link: {}, image: {}, actions: ["find"] };
    const config = { fileTypes: [{ name: "docs", extensions: ["md"], markup: [markup] }] };
    expect(summarize(config, "config_v3")).to.equal("fileTypes[0].markup[0]: set only one of image, link.");
  });

  it("says a key a schema forbids isn't allowed, not that a schema is false", function () {
    const errorObjects = [
      { instancePath: "/a/b", keyword: "false schema", params: {}, schemaPath: "#/properties/a/properties/b/false schema", message: "boolean schema is false" },
    ];
    expect(summarizeSchemaErrors(errorObjects, { a: { b: 1 } }, "config_v3")).to.equal("a.b: isn't allowed here.");
  });

  it("says a value forbidden at the root isn't allowed, with no path", function () {
    const errorObjects = [
      { instancePath: "", keyword: "false schema", params: {}, schemaPath: "#/false schema", message: "boolean schema is false" },
    ];
    expect(summarizeSchemaErrors(errorObjects, {}, "config_v3")).to.equal("isn't allowed here.");
  });

  it("doesn't offer the root as a choice beside a forbidden key under it", function () {
    const forbidden = (instancePath) => ({ instancePath, keyword: "false schema", params: {}, schemaPath: `#${instancePath}/false schema`, message: "boolean schema is false" });
    const summary = summarizeSchemaErrors([forbidden(""), forbidden("/a")], { a: 1 }, "config_v3");
    expect(summary).to.not.match(/set only one of|undefined/);
    expect(summary.split("\n")).to.have.members(["isn't allowed here.", "a: isn't allowed here."]);
  });

  it("falls back to compound errors' own messages rather than print nothing", function () {
    const errorObjects = [
      { instancePath: "/tests/0", keyword: "oneOf", params: { passingSchemas: null }, schemaPath: "#/oneOf", message: "must match exactly one schema in oneOf" },
    ];
    expect(summarizeSchemaErrors(errorObjects, { tests: [{}] })).to.equal("tests[0]: must match exactly one schema in oneOf.");
  });

  it("says `must be` when only one value is allowed", function () {
    const errorObjects = [
      { instancePath: "/mode", keyword: "const", params: { allowedValue: "fast" }, schemaPath: "#/properties/mode/const" },
    ];
    expect(summarizeSchemaErrors(errorObjects, { mode: "slow" }, "config_v3")).to.equal('mode: must be fast (got "slow").');
  });

  it("names a value JSON can't show, from a JS API caller", function () {
    const errorObjects = [
      { instancePath: "/output", keyword: "type", params: { type: "string" }, schemaPath: "#/properties/output/type" },
    ];
    const line = (output) => summarizeSchemaErrors(errorObjects, { output }, "config_v3");
    expect(line(() => "x")).to.equal("output: must be string (got a function).");
    expect(line(10n)).to.equal("output: must be string (got 10).");
    const cycle = {};
    cycle.self = cycle;
    expect(line(cycle)).to.equal("output: must be string (got an object that can't be shown).");
    expect(line({ big: 1n })).to.equal("output: must be string (got an object that can't be shown).");
  });

  it("drops AJV's if summary for a failed then or else", function () {
    // AJV 8's own output for { if: { required: ["kind"] }, then: { required: ["x"] }, else: ... }:
    // a failed then or else reports keyword "if", with the branch in failingKeyword.
    for (const [branch, key] of [
      ["then", "x"],
      ["else", "y"],
    ]) {
      const errorObjects = [
        {
          instancePath: "",
          schemaPath: `#/${branch}/required`,
          keyword: "required",
          params: { missingProperty: key },
          message: `must have required property '${key}'`,
        },
        { instancePath: "", schemaPath: "#/if", keyword: "if", params: { failingKeyword: branch }, message: `must match "${branch}" schema` },
      ];
      expect(summarizeSchemaErrors(errorObjects, { kind: "a" }, "config_v3")).to.equal(`missing required key '${key}'.`);
    }
  });

  it("finds keys under a key that patternProperties matches", function () {
    const schema = {
      type: "object",
      patternProperties: { "^x-": { type: "object", properties: { inner: {} } } },
      properties: { plain: {} },
    };
    expect(knownKeysAt(["x-custom"], schema)).to.deep.equal(["inner"]);
    expect(knownKeysAt(["other"], schema)).to.deep.equal([]);
    expect(knownKeysAt([], schema)).to.deep.equal(["plain"]);
  });

  it("treats a patternProperties pattern it can't compile as no match", function () {
    const schema = { type: "object", patternProperties: { "(": { properties: { inner: {} } } }, properties: { plain: {} } };
    expect(knownKeysAt(["x"], schema)).to.deep.equal([]);
  });

  it("follows items into an array's entries", function () {
    const schema = { type: "array", items: { type: "object", properties: { foo: {}, bar: {} } } };
    expect(knownKeysAt(["0"], schema)).to.deep.equal(["foo", "bar"]);
    expect(knownKeysAt(["tests", "0"], "spec_v3")).to.include("steps");
  });

  it("names the keyword when AJV leaves an error without a message", function () {
    const at = (keyword) => [{ instancePath: "/concurrentRunners", keyword, params: {}, schemaPath: `#/${keyword}` }];
    expect(summarizeSchemaErrors(at("minimum"), { concurrentRunners: 0 }, "config_v3")).to.equal("concurrentRunners: minimum.");
    // A bare "not." reads as nonsense, so `not` gets AJV's own wording.
    expect(summarizeSchemaErrors(at("not"), { concurrentRunners: 0 }, "config_v3")).to.equal("concurrentRunners: must NOT be valid.");
    expect(summarizeSchemaErrors(at("oneOf"), { concurrentRunners: 0 }, "config_v3")).to.equal("concurrentRunners: oneOf.");
  });

  it("finds keys a conditional branch defines", function () {
    const schema = { type: "object", if: { required: ["kind"] }, then: { properties: { onlyThen: {} } }, else: { properties: { onlyElse: {} } } };
    expect(knownKeysAt([], schema)).to.include.members(["onlyThen", "onlyElse"]);
  });

  it("ends any other message with a period", function () {
    expect(summarize({ concurrentRunners: 0 }, "config_v3")).to.equal("concurrentRunners: must be >= 1.");
  });

  it("shows five lines, then a count", function () {
    const object = { a1: 1, a2: 1, a3: 1, a4: 1, a5: 1, a6: 1, a7: 1 };
    const lines = summarize(object, "config_v3").split("\n");
    expect(lines).to.have.lengthOf(6);
    expect(lines[5]).to.equal("and 2 more");
  });
});

describe("reportCrash", function () {
  let dir;
  beforeEach(function () {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), "dd-crash-"));
  });
  afterEach(function () {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it("writes the stack to a log file, and prints a prefilled issue link", function () {
    const lines = [];
    const error = new Error("boom");
    reportCrash(error, { dir, print: (l) => lines.push(l), version: "5.0.0" });
    const output = lines.join("\n");
    expect(output).to.include("boom");
    expect(output).to.include("github.com/doc-detective/doc-detective/issues/new");
    expect(output).to.include("doc-detective%20debug".replace("%20", "%20"));
    const logs = fs.readdirSync(path.join(dir, ".doc-detective"));
    expect(logs).to.have.lengthOf(1);
    expect(fs.readFileSync(path.join(dir, ".doc-detective", logs[0]), "utf8")).to.include("Error: boom");
  });

  it("redacts secrets in the log file", function () {
    const error = new Error("failed for https://user:hunter2@example.com/");
    reportCrash(error, { dir, print: () => {}, version: "5.0.0" });
    const logs = fs.readdirSync(path.join(dir, ".doc-detective"));
    expect(fs.readFileSync(path.join(dir, ".doc-detective", logs[0]), "utf8")).to.not.include("hunter2");
  });

  it("names the version unknown when the caller's version is undefined", function () {
    // src/cli.ts passes ownVersion(), which is undefined when doc-detective
    // can't read its own package.json. The parameter default must still apply.
    reportCrash(new Error("boom"), { dir, print: () => {}, version: undefined });
    const logs = fs.readdirSync(path.join(dir, ".doc-detective"));
    expect(fs.readFileSync(path.join(dir, ".doc-detective", logs[0]), "utf8")).to.match(/^doc-detective unknown\n/);
  });

  it("still reports when the log can't be written", function () {
    const lines = [];
    reportCrash(new Error("boom"), { dir: path.join(dir, "nope\0"), print: (l) => lines.push(l), version: "5.0.0" });
    expect(lines.join("\n")).to.include("boom");
  });
});

describe("createInterruptHandler", function () {
  const flush = () => new Promise((resolve) => setTimeout(resolve, 20));

  it("announces, cleans up, then exits with the signal's code", async function () {
    const events = [];
    const handler = createInterruptHandler({
      cleanup: async () => events.push("cleanup"),
      exit: (code) => events.push(`exit ${code}`),
      print: (line) => events.push(line),
    });
    handler("SIGINT");
    await flush();
    expect(events[0]).to.match(/^Stopping/);
    expect(events.slice(1)).to.deep.equal(["cleanup", "exit 130"]);
  });

  it("uses 143 for SIGTERM", async function () {
    let exited;
    createInterruptHandler({ cleanup: async () => {}, exit: (code) => (exited = code), print: () => {} })("SIGTERM");
    await flush();
    expect(exited).to.equal(143);
  });

  it("stops immediately on a second signal, and warns", function () {
    const exits = [];
    const lines = [];
    const handler = createInterruptHandler({
      cleanup: () => new Promise(() => {}),
      exit: (code) => exits.push(code),
      print: (line) => lines.push(line),
    });
    handler("SIGINT");
    handler("SIGINT");
    expect(exits).to.deep.equal([130]);
    expect(lines[1]).to.match(/may still be running/);
  });

  it("gives up on cleanup at the deadline", async function () {
    const exits = [];
    const lines = [];
    createInterruptHandler({
      cleanup: () => new Promise(() => {}),
      exit: (code) => exits.push(code),
      print: (line) => lines.push(line),
      deadlineMs: 5,
    })("SIGINT");
    await flush();
    expect(exits).to.deep.equal([130]);
    expect(lines[1]).to.match(/didn't finish in time/);
  });

  it("still exits when cleanup fails", async function () {
    let exited;
    createInterruptHandler({
      cleanup: async () => {
        throw new Error("nope");
      },
      exit: (code) => (exited = code),
      print: () => {},
    })("SIGINT");
    await flush();
    expect(exited).to.equal(130);
  });
});

describe("--no-input", function () {
  it("is taken out of argv, and recorded", function () {
    const env = {};
    expect(applyInputFlag(["node", "x", "--no-input", "-i", "a"], env)).to.deep.equal(["node", "x", "-i", "a"]);
    expect(env.DOC_DETECTIVE_NO_INPUT).to.equal("1");
  });
  it("leaves other argv alone", function () {
    const env = {};
    expect(applyInputFlag(["node", "x"], env)).to.deep.equal(["node", "x"]);
    expect(env).to.deep.equal({});
  });
  it("turns off prompting, even on a TTY", function () {
    expect(isInteractive({ isTTY: true }, {})).to.equal(true);
    expect(isInteractive({ isTTY: true }, { DOC_DETECTIVE_NO_INPUT: "1" })).to.equal(false);
    expect(isInteractive({ isTTY: false }, {})).to.equal(false);
  });
});

describe("defaultCacheRoot", function () {
  const home = path.join("h");
  const none = () => false;
  it("keeps an existing legacy cache, so nobody re-downloads", function () {
    expect(defaultCacheRoot({ env: { XDG_CACHE_HOME: "x" }, home, exists: () => true })).to.equal(path.join(home, ".doc-detective"));
  });
  it("uses XDG_CACHE_HOME", function () {
    expect(defaultCacheRoot({ env: { XDG_CACHE_HOME: "x" }, home, exists: none })).to.equal(path.join("x", "doc-detective"));
  });
  it("uses LOCALAPPDATA on Windows", function () {
    expect(defaultCacheRoot({ env: { LOCALAPPDATA: "l" }, home, platform: "win32", exists: none })).to.equal(path.join("l", "doc-detective"));
  });
  it("falls back to ~/.cache", function () {
    expect(defaultCacheRoot({ env: {}, home, platform: "linux", exists: none })).to.equal(path.join(home, ".cache", "doc-detective"));
  });
});

describe("userConfigDir", function () {
  it("follows XDG, then APPDATA on Windows, then ~/.config", function () {
    expect(userConfigDir({ env: { XDG_CONFIG_HOME: "x" }, home: "h" })).to.equal(path.join("x", "doc-detective"));
    expect(userConfigDir({ env: { APPDATA: "a" }, home: "h", platform: "win32" })).to.equal(path.join("a", "doc-detective"));
    expect(userConfigDir({ env: {}, home: "h", platform: "linux" })).to.equal(path.join("h", ".config", "doc-detective"));
  });
});

describe("telemetry", function () {
  let dir;
  beforeEach(function () {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), "dd-telem-"));
  });
  afterEach(function () {
    fs.rmSync(dir, { recursive: true, force: true });
  });
  it("honors telemetry.send and DO_NOT_TRACK", function () {
    expect(telemetryAllowed({}, {})).to.equal(true);
    expect(telemetryAllowed({ telemetry: { send: false } }, {})).to.equal(false);
    expect(telemetryAllowed({}, { DO_NOT_TRACK: "1" })).to.equal(false);
  });
  it("shows the notice once per machine, even when silent", function () {
    const lines = [];
    const print = (line) => lines.push(line);
    telemetryNotice({ logLevel: "silent" }, { dir, print });
    telemetryNotice({ logLevel: "silent" }, { dir, print });
    expect(lines).to.have.lengthOf(1);
    expect(lines[0]).to.include("--no-telemetry");
  });
  it("shows nothing when telemetry is off", function () {
    const lines = [];
    telemetryNotice({ telemetry: { send: false } }, { dir, print: (line) => lines.push(line) });
    expect(lines).to.deep.equal([]);
  });
  it("still prints where the marker can't be written", function () {
    const file = path.join(dir, "file");
    fs.writeFileSync(file, "");
    const lines = [];
    telemetryNotice({}, { dir: path.join(file, "nested"), print: (line) => lines.push(line) });
    expect(lines).to.have.lengthOf(1);
  });
});

describe("checkForUpdate across majors", function () {
  const registry = (tags) => ({ http: { get: async () => ({ data: { "dist-tags": tags } }) }, logger: () => {} });
  it("updates within a major", async function () {
    expect(await checkForUpdate("5.0.0", registry({ latest: "5.1.0" }))).to.deep.equal({ latest: "5.1.0", newer: true });
  });
  it("doesn't cross a major, and says so", async function () {
    const lines = [];
    const deps = { ...registry({ latest: "6.0.0" }), logger: (line) => lines.push(line) };
    expect((await checkForUpdate("5.0.0", deps)).newer).to.equal(false);
    expect(lines.join()).to.include("npm i doc-detective@6");
  });
  it("uses the maintenance tag when a newer major exists", async function () {
    const deps = registry({ latest: "6.0.0", "release-5.x": "5.9.0" });
    expect(await checkForUpdate("5.0.0", deps)).to.deep.equal({ latest: "5.9.0", newer: true });
  });
  it("ignores a maintenance tag holding another major", async function () {
    const deps = registry({ latest: "7.0.0", "release-5.x": "6.0.0" });
    expect((await checkForUpdate("5.0.0", deps)).newer).to.equal(false);
  });
  it("ignores a maintenance tag that isn't newer", async function () {
    const deps = registry({ latest: "6.0.0", "release-5.x": "5.0.0" });
    expect((await checkForUpdate("5.0.0", deps)).newer).to.equal(false);
  });
});

describe("a remote config's error", function () {
  it("names the config URL without its query string", async function () {
    const server = http.createServer((_req, res) => {
      res.setHeader("content-type", "application/json");
      res.end(JSON.stringify({ logLevl: "info" }));
    });
    await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
    const base = `http://127.0.0.1:${server.address().port}/config.json`;
    try {
      await setConfig({ configPath: `${base}?token=s3cret`, args: {} });
      expect.fail("setConfig accepted an invalid config");
    } catch (error) {
      expect(error.message).to.include(`Invalid config in ${base}:`);
      expect(error.message).to.not.include("s3cret");
    } finally {
      server.close();
    }
  });
});

describe("credentials from files", function () {
  let dir;
  beforeEach(function () {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), "dd-creds-"));
  });
  afterEach(function () {
    fs.rmSync(dir, { recursive: true, force: true });
  });
  const withConfig = async (integrations) => {
    const file = path.join(dir, "config.json");
    fs.writeFileSync(file, JSON.stringify({ integrations }));
    return setConfig({ configPath: file, args: {} });
  };
  it("reads apiKeyFile into apiKey", async function () {
    const key = path.join(dir, "key");
    fs.writeFileSync(key, "secret\n");
    const config = await withConfig({ docDetectiveApi: { apiKeyFile: key } });
    expect(config.integrations.docDetectiveApi.apiKey).to.equal("secret");
    expect(config.integrations.docDetectiveApi.apiKeyFile).to.equal(undefined);
  });
  it("reads apiTokenFile into a heretto apiToken", async function () {
    const token = path.join(dir, "token");
    fs.writeFileSync(token, "secret");
    const config = await withConfig({
      heretto: [{ name: "h", organizationId: "o", username: "u", apiTokenFile: token }],
    });
    expect(config.integrations.heretto[0].apiToken).to.equal("secret");
  });
  it("accepts a partial config source, whose required keys have defaults", async function () {
    const file = path.join(dir, "config.json");
    fs.writeFileSync(file, JSON.stringify({ logLevel: "info", telemetry: { userId: "x" }, hints: {} }));
    const config = await setConfig({ configPath: file, args: {} });
    expect(config.telemetry).to.deep.equal({ userId: "x", send: true });
    expect(config.hints.enabled).to.equal(true);
  });
  it("names the file it couldn't read", async function () {
    let message = "";
    await withConfig({ docDetectiveApi: { apiKeyFile: path.join(dir, "nope") } }).catch((error) => {
      message = error.message;
    });
    expect(message).to.include("apiKeyFile");
  });
});

// ADR 01169: the CLI renames a deprecated beforeAny before it resolves paths.
describe("beforeAll in the CLI config", function () {
  let dir;
  beforeEach(function () {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), "dd-before-all-"));
  });
  afterEach(function () {
    fs.rmSync(dir, { recursive: true, force: true });
  });
  const withConfig = (config) => {
    const file = path.join(dir, "config.json");
    fs.writeFileSync(file, JSON.stringify(config));
    return setConfig({ configPath: file, args: {} });
  };

  it("resolves beforeAll relative to the config file", async function () {
    const config = await withConfig({ beforeAll: "setup.spec.json" });
    expect(config.beforeAll).to.equal(path.join(dir, "setup.spec.json"));
  });

  it("renames beforeAny to beforeAll and warns once", async function () {
    const { result, lines } = await captureConsoleError(() => withConfig({ beforeAny: "setup.spec.json" }));
    expect(result.beforeAll).to.equal(path.join(dir, "setup.spec.json"));
    expect(result).to.not.have.property("beforeAny");
    expect(lines.filter((line) => line.includes("beforeAny"))).to.deep.equal([
      "Warning: `beforeAny` is deprecated. Rename it to `beforeAll`.",
    ]);
  });

  // Each source is renamed on its own, so DOC_DETECTIVE_CONFIG wins over the file
  // whichever name either one uses.
  for (const [fileKey, envKey] of [["beforeAny", "beforeAll"], ["beforeAll", "beforeAny"]]) {
    it(`lets DOC_DETECTIVE_CONFIG ${envKey} override a file ${fileKey}`, async function () {
      const saved = process.env.DOC_DETECTIVE_CONFIG;
      process.env.DOC_DETECTIVE_CONFIG = JSON.stringify({ [envKey]: "b.spec.json" });
      try {
        const { result, lines } = await captureConsoleError(() => withConfig({ [fileKey]: "a.spec.json" }));
        expect(result.beforeAll).to.equal(path.join(dir, "b.spec.json"));
        expect(result).to.not.have.property("beforeAny");
        expect(lines.filter((line) => line.includes("beforeAny"))).to.have.lengthOf(1);
      } finally {
        if (saved === undefined) delete process.env.DOC_DETECTIVE_CONFIG;
        else process.env.DOC_DETECTIVE_CONFIG = saved;
      }
    });
  }

  // The deprecated DOC_DETECTIVE is a source of its own, renamed the same way.
  it("lets a DOC_DETECTIVE beforeAny override a file beforeAll", async function () {
    const saved = process.env.DOC_DETECTIVE;
    process.env.DOC_DETECTIVE = JSON.stringify({ config: { beforeAny: "b.spec.json" } });
    try {
      const { result, lines } = await captureConsoleError(() => withConfig({ beforeAll: "a.spec.json" }));
      expect(result.beforeAll).to.equal(path.join(dir, "b.spec.json"));
      expect(result).to.not.have.property("beforeAny");
      expect(lines.filter((line) => line.includes("`beforeAny`"))).to.have.lengthOf(1);
    } finally {
      if (saved === undefined) delete process.env.DOC_DETECTIVE;
      else process.env.DOC_DETECTIVE = saved;
    }
  });

  // The warning follows the merged config, so a user config's logLevel applies.
  it("doesn't warn about beforeAny when the user config is silent", async function () {
    const saved = process.env.XDG_CONFIG_HOME;
    const home = path.join(dir, "xdg");
    fs.mkdirSync(path.join(home, "doc-detective"), { recursive: true });
    fs.writeFileSync(path.join(home, "doc-detective", "config.json"), JSON.stringify({ logLevel: "silent" }));
    process.env.XDG_CONFIG_HOME = home;
    try {
      const { result, lines } = await captureConsoleError(() => withConfig({ beforeAny: "setup.spec.json" }));
      expect(result.beforeAll).to.equal(path.join(dir, "setup.spec.json"));
      expect(lines.filter((line) => line.includes("beforeAny"))).to.deep.equal([]);
    } finally {
      if (saved === undefined) delete process.env.XDG_CONFIG_HOME;
      else process.env.XDG_CONFIG_HOME = saved;
    }
  });

  it("rejects a DOC_DETECTIVE_CONFIG that sets both, with a config file's message", async function () {
    const saved = process.env.DOC_DETECTIVE_CONFIG;
    process.env.DOC_DETECTIVE_CONFIG = JSON.stringify({ beforeAll: "a.spec.json", beforeAny: "b.spec.json" });
    try {
      await assert.rejects(withConfig({}), {
        message: "Invalid config. beforeAll: set `beforeAll` or `beforeAny`, not both.",
      });
    } finally {
      if (saved === undefined) delete process.env.DOC_DETECTIVE_CONFIG;
      else process.env.DOC_DETECTIVE_CONFIG = saved;
    }
  });

  it("accepts beforeAll beside a null beforeAny in DOC_DETECTIVE_CONFIG, as in a config file", async function () {
    const saved = process.env.DOC_DETECTIVE_CONFIG;
    process.env.DOC_DETECTIVE_CONFIG = JSON.stringify({ beforeAll: "a.spec.json", beforeAny: null });
    try {
      const result = await withConfig({});
      expect(result.beforeAll).to.include("a.spec.json");
      expect(result).to.not.have.property("beforeAny");
    } finally {
      if (saved === undefined) delete process.env.DOC_DETECTIVE_CONFIG;
      else process.env.DOC_DETECTIVE_CONFIG = saved;
    }
  });

  it("logs DOC_DETECTIVE_CONFIG with beforeAny renamed, as it was validated", async function () {
    const saved = process.env.DOC_DETECTIVE_CONFIG;
    process.env.DOC_DETECTIVE_CONFIG = JSON.stringify({ logLevel: "debug", beforeAny: "b.spec.json" });
    try {
      const { lines } = await captureConsoleError(() => withConfig({}));
      const dump = lines.find((line) => line.includes("CLI:ENV_CONFIG"));
      expect(dump).to.include('"beforeAll": "b.spec.json"');
      expect(dump).to.not.include("beforeAny");
    } finally {
      if (saved === undefined) delete process.env.DOC_DETECTIVE_CONFIG;
      else process.env.DOC_DETECTIVE_CONFIG = saved;
    }
  });

  it("rejects a config that sets both", async function () {
    await assert.rejects(withConfig({ beforeAll: "a.spec.json", beforeAny: "b.spec.json" }), {
      message: "Invalid config. beforeAll: set `beforeAll` or `beforeAny`, not both.",
    });
  });
});
