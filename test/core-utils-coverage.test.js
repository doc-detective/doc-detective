// Unit-coverage tests for src/core/utils.ts (imported from the compiled
// dist/core/utils.js). These exercise the pure / cleanly-mockable helpers:
// URL/SSRF guards, filesystem-name sanitizers, filter compilation, log-level
// filtering, env replacement, output serialization, and container detection.
// Everything here is hermetic: no real network, no real port binding except a
// self-releasing ephemeral loopback port, and any fs/env/process touch is
// either stubbed with sinon or confined to an OS temp dir that is cleaned up.
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import sinon from "sinon";
import dnsPromises from "node:dns/promises";
import {
  log,
  outputResults,
  replaceEnvs,
  timestamp,
  inContainer,
  calculateFractionalDifference,
  serializeBrowserResult,
  matchesExpectedOutput,
  isRelativeUrl,
  appendQueryParams,
  redactUrlForOutput,
  assertUrlHostIsPublic,
  sanitizeFilesystemName,
  compileFilter,
  isRetryableSessionError,
  matchesFilter,
  selectSpecsForRun,
  findFreePort,
  evaluateContextRequirements,
} from "../dist/core/utils.js";

describe("core/utils coverage", function () {
  let sandbox;
  afterEach(function () {
    if (sandbox) sandbox.restore();
    sandbox = undefined;
  });

  describe("compileFilter", function () {
    it("returns [] for non-array / empty input", function () {
      assert.deepEqual(compileFilter(undefined), []);
      assert.deepEqual(compileFilter(null), []);
      assert.deepEqual(compileFilter("foo"), []);
      assert.deepEqual(compileFilter([]), []);
    });
    it("trims, drops whitespace-only/non-string entries, compiles case-insensitive regexes", function () {
      const res = compileFilter(["  Foo ", "   ", 42, "bar"]);
      assert.equal(res.length, 2);
      assert.ok(res[0] instanceof RegExp);
      assert.equal(res[0].flags, "i");
      // Trimmed: "Foo" matches "myfoothing" case-insensitively
      assert.ok(res[0].test("myFOOthing"));
      assert.ok(res[1].test("BARN"));
    });
  });

  describe("matchesFilter", function () {
    it("returns true when there are no filters", function () {
      assert.equal(matchesFilter("anything", []), true);
      assert.equal(matchesFilter("anything", null), true);
    });
    it("returns false when id is not a string but filters exist", function () {
      assert.equal(matchesFilter(undefined, [/x/]), false);
      assert.equal(matchesFilter(123, [/x/]), false);
    });
    it("returns true only when at least one filter matches", function () {
      assert.equal(matchesFilter("hello", [/zzz/, /ell/]), true);
      assert.equal(matchesFilter("hello", [/zzz/, /qqq/]), false);
    });
  });

  describe("selectSpecsForRun", function () {
    it("returns input unchanged when no filters configured", function () {
      const specs = [{ specId: "a", tests: [{ testId: "t1" }] }];
      assert.equal(selectSpecsForRun(specs, {}), specs);
    });
    it("filters specs and narrows tests, dropping specs with zero remaining tests", function () {
      const specs = [
        { specId: "keep-me", tests: [{ testId: "t-good" }, { testId: "t-bad" }] },
        { specId: "drop-me", tests: [{ testId: "t-good" }] },
        { specId: "keep-but-empty", tests: [{ testId: "t-bad" }] },
      ];
      const config = { specFilter: ["keep"], testFilter: ["good"] };
      const out = selectSpecsForRun(specs, config);
      // "drop-me" removed by specFilter; "keep-but-empty" removed (no test passes testFilter)
      assert.equal(out.length, 1);
      assert.equal(out[0].specId, "keep-me");
      assert.equal(out[0].tests.length, 1);
      assert.equal(out[0].tests[0].testId, "t-good");
      // input not mutated
      assert.equal(specs[0].tests.length, 2);
    });
    it("tolerates null specs array and missing tests arrays", function () {
      const out = selectSpecsForRun(null, { specFilter: ["x"] });
      assert.deepEqual(out, []);
      const out2 = selectSpecsForRun([{ specId: "x" }], { testFilter: ["y"] });
      assert.deepEqual(out2, []);
    });
  });

  describe("isRelativeUrl", function () {
    it("returns false for absolute URLs, true for relative paths", function () {
      assert.equal(isRelativeUrl("https://example.com/x"), false);
      assert.equal(isRelativeUrl("./relative/path"), true);
      assert.equal(isRelativeUrl("not a url"), true);
    });
  });

  describe("appendQueryParams", function () {
    it("returns url unchanged for nullish / non-object / array params", function () {
      assert.equal(appendQueryParams("http://x/y", null), "http://x/y");
      assert.equal(appendQueryParams("http://x/y", undefined), "http://x/y");
      assert.equal(appendQueryParams("http://x/y", "str"), "http://x/y");
      assert.equal(appendQueryParams("http://x/y", [1, 2]), "http://x/y");
    });
    it("returns url unchanged when all values are null/undefined", function () {
      assert.equal(appendQueryParams("http://x/y", { a: null, b: undefined }), "http://x/y");
    });
    it("appends params to a url with no existing query", function () {
      assert.equal(appendQueryParams("http://x/y", { a: "1" }), "http://x/y?a=1");
    });
    it("preserves a fragment and inserts params before it", function () {
      assert.equal(
        appendQueryParams("http://x/y#frag", { a: "1" }),
        "http://x/y?a=1#frag"
      );
    });
    it("preserves non-colliding existing segments and replaces colliding keys", function () {
      const out = appendQueryParams("http://x/y?keep=old&a=stale", { a: "new" });
      assert.equal(out, "http://x/y?keep=old&a=new");
    });
    it("encodes new keys and values", function () {
      assert.equal(
        appendQueryParams("http://x/y", { "a b": "c&d" }),
        "http://x/y?a%20b=c%26d"
      );
    });
    it("drops empty existing segments and handles malformed percent-encoding in keys", function () {
      // "%E0%A4%A" is malformed → decodeURIComponent throws → key kept as raw
      const out = appendQueryParams("http://x/y?&%E0%A4%A=v", { a: "1" });
      assert.ok(out.includes("%E0%A4%A=v"));
      assert.ok(out.endsWith("a=1"));
    });
  });

  describe("redactUrlForOutput", function () {
    it("strips query and fragment from a valid URL", function () {
      assert.equal(
        redactUrlForOutput("https://host/path?token=secret#frag"),
        "https://host/path"
      );
    });
    it("falls back to manual stripping for non-URL strings", function () {
      assert.equal(redactUrlForOutput("not a url?token=x#y"), "not a url");
    });
  });

  describe("sanitizeFilesystemName", function () {
    it("returns fallback for empty, '.', '..'", function () {
      assert.equal(sanitizeFilesystemName("", "fb"), "fb");
      assert.equal(sanitizeFilesystemName(".", "fb"), "fb");
      assert.equal(sanitizeFilesystemName("..", "fb"), "fb");
    });
    it("replaces reserved/control chars with underscores", function () {
      // a<b>:"/\|?*c → the 9 reserved chars (< > : " / \ | ? *) around "b"
      assert.equal(sanitizeFilesystemName('a<b>:"/\\|?*c', "fb"), "a_b________c");
    });
    it("returns fallback if result is all-dots", function () {
      // Characters all map to nothing problematic but become all dots
      assert.equal(sanitizeFilesystemName("...", "fb"), "fb");
    });
    it("keeps a normal name untouched", function () {
      assert.equal(sanitizeFilesystemName("file-1.2.png", "fb"), "file-1.2.png");
    });
  });

  describe("assertUrlHostIsPublic (IP literal + scheme + allow-list paths)", function () {
    let prevAllow;
    beforeEach(function () {
      prevAllow = process.env.DOC_DETECTIVE_ALLOW_LOCAL_URLS;
    });
    afterEach(function () {
      if (prevAllow === undefined) delete process.env.DOC_DETECTIVE_ALLOW_LOCAL_URLS;
      else process.env.DOC_DETECTIVE_ALLOW_LOCAL_URLS = prevAllow;
    });

    it("short-circuits when DOC_DETECTIVE_ALLOW_LOCAL_URLS=true", async function () {
      process.env.DOC_DETECTIVE_ALLOW_LOCAL_URLS = "true";
      // would otherwise reject (loopback) — must resolve
      await assertUrlHostIsPublic("http://127.0.0.1/x");
    });
    it("throws on an invalid URL", async function () {
      await assert.rejects(() => assertUrlHostIsPublic("::not a url::"), /Invalid URL/);
    });
    it("throws on an unsupported scheme", async function () {
      await assert.rejects(
        () => assertUrlHostIsPublic("ftp://example.com/x"),
        /Unsupported URL scheme/
      );
    });
    it("rejects a private IPv4 literal", async function () {
      await assert.rejects(
        () => assertUrlHostIsPublic("http://10.0.0.5/x"),
        /private\/loopback/
      );
    });
    it("rejects a loopback IPv6 literal in brackets", async function () {
      await assert.rejects(
        () => assertUrlHostIsPublic("http://[::1]/x"),
        /private\/loopback/
      );
    });
    it("allows a public IP literal without DNS", async function () {
      await assertUrlHostIsPublic("https://8.8.8.8/x");
    });
    it("rejects localhost and *.localhost hostnames before any DNS lookup", async function () {
      // Stub dns.lookup so we can prove the guard short-circuits *before* it.
      sandbox = sinon.createSandbox();
      const lookup = sandbox
        .stub(dnsPromises, "lookup")
        .resolves([{ address: "8.8.8.8" }]);
      await assert.rejects(
        () => assertUrlHostIsPublic("http://localhost/x"),
        /Refusing to fetch localhost/
      );
      await assert.rejects(
        () => assertUrlHostIsPublic("http://app.localhost/x"),
        /Refusing to fetch localhost/
      );
      assert.equal(lookup.callCount, 0);
    });

    // The DNS-resolution branch is covered hermetically by stubbing
    // dns.lookup (the utils module shares this exact promises-API object).
    it("resolves when a hostname's resolved addresses are all public", async function () {
      sandbox = sinon.createSandbox();
      sandbox
        .stub(dnsPromises, "lookup")
        .resolves([{ address: "93.184.216.34" }]);
      await assertUrlHostIsPublic("https://example.test/x");
    });
    it("rejects when a hostname resolves to a private address", async function () {
      sandbox = sinon.createSandbox();
      sandbox
        .stub(dnsPromises, "lookup")
        .resolves([{ address: "10.1.2.3" }]);
      await assert.rejects(
        () => assertUrlHostIsPublic("https://internal.test/x"),
        /resolves to a private\/loopback address/
      );
    });
    it("rejects with a resolution error when DNS lookup fails", async function () {
      sandbox = sinon.createSandbox();
      sandbox
        .stub(dnsPromises, "lookup")
        .rejects(new Error("ENOTFOUND"));
      await assert.rejects(
        () => assertUrlHostIsPublic("https://nonexistent.test/x"),
        /Couldn't resolve host .* ENOTFOUND/
      );
    });
  });

  // isPrivateOrLoopbackAddress is exercised indirectly through assertUrlHostIsPublic,
  // covering its many branches: IPv4 ranges, IPv6 forms, IPv4-mapped recursion.
  describe("assertUrlHostIsPublic IP-literal branch coverage", function () {
    const privateLiterals = [
      "127.0.0.1", // loopback
      "0.0.0.0", // 0.x
      "169.254.169.254", // link-local / metadata
      "172.16.0.1", // RFC1918 172.16-31
      "192.168.1.1", // RFC1918 192.168
      "100.64.0.1", // CGNAT
      "::1", // IPv6 loopback
      "::", // IPv6 unspecified
      "fc00::1", // unique local fc
      "fd00::1", // unique local fd
      "fe80::1", // IPv6 link-local
      // IPv4-mapped IPv6 private addresses are asserted in the mappedPrivate
      // set below (the #427 fix); historically they bypassed the guard.
    ];
    for (const ip of privateLiterals) {
      it(`rejects private literal ${ip}`, async function () {
        const url = ip.includes(":") ? `http://[${ip}]/x` : `http://${ip}/x`;
        await assert.rejects(() => assertUrlHostIsPublic(url), /refusing|private\/loopback/i);
      });
    }
    const publicLiterals = [
      "8.8.8.8",
      "1.1.1.1",
      "2606:4700:4700::1111",
      "::ffff:8.8.8.8", // dotted public mapped (parser normalizes to hex)
      "::ffff:808:808", // hex public mapped form (8.8.8.8) stays allowed
      "::ffff:1", // a normal IPv6 address, not IPv4-mapped → not private
    ];
    for (const ip of publicLiterals) {
      it(`allows public literal ${ip}`, async function () {
        const url = ip.includes(":") ? `http://[${ip}]/x` : `http://${ip}/x`;
        await assertUrlHostIsPublic(url);
      });
    }

    // #427 fix: IPv4-mapped IPv6 private addresses must be rejected. The WHATWG
    // URL parser normalizes ::ffff:10.0.0.1 to hex form (::ffff:a00:1); the guard
    // now reconstructs the dotted v4 from the hex tail before classifying.
    const mappedPrivate = [
      "::ffff:a00:1", // 10.0.0.1
      "::ffff:7f00:1", // 127.0.0.1
      "::ffff:a9fe:a9fe", // 169.254.169.254 (cloud metadata)
      "::ffff:c0a8:1", // 192.168.0.1
      "::ffff:0:1", // 0.0.0.1 (real mapped form of 0.0.0.x, high group is 0)
    ];
    for (const ip of mappedPrivate) {
      it(`rejects IPv4-mapped private literal [${ip}]`, async function () {
        await assert.rejects(
          () => assertUrlHostIsPublic(`http://[${ip}]/x`),
          /private\/loopback/
        );
      });
    }
  });

  describe("log (level filtering + 2-arg form)", function () {
    let logged;
    beforeEach(function () {
      sandbox = sinon.createSandbox();
      logged = [];
      sandbox.stub(console, "log").callsFake((m) => logged.push(m));
    });
    afterEach(function () {
      sandbox.restore();
      sandbox = undefined;
    });

    it("error level only logs error", async function () {
      await log({ logLevel: "error" }, "error", "boom");
      await log({ logLevel: "error" }, "info", "quiet");
      assert.equal(logged.length, 1);
      assert.equal(logged[0], "(ERROR) boom");
    });
    it("warning level logs error + warning, not info", async function () {
      await log({ logLevel: "warning" }, "warning", "w");
      await log({ logLevel: "warning" }, "error", "e");
      await log({ logLevel: "warning" }, "info", "i");
      assert.deepEqual(logged, ["(WARNING) w", "(ERROR) e"]);
    });
    it("info level logs error/warning/info, not debug", async function () {
      await log({ logLevel: "info" }, "info", "i");
      await log({ logLevel: "info" }, "debug", "d");
      assert.deepEqual(logged, ["(INFO) i"]);
    });
    it("debug level logs everything including debug", async function () {
      await log({ logLevel: "debug" }, "debug", "d");
      assert.deepEqual(logged, ["(DEBUG) d"]);
    });
    it("logs objects as pretty JSON on a second line", async function () {
      await log({ logLevel: "info" }, "info", { a: 1 });
      assert.equal(logged[0], "(INFO)");
      assert.equal(logged[1], JSON.stringify({ a: 1 }, null, 2));
    });
    it("supports the 2-arg form log(message, level) with empty config (no match)", async function () {
      // config defaults to {} so logLevel is undefined → no match → nothing logged
      await log("just a message", "info");
      assert.equal(logged.length, 0);
    });
  });

  describe("outputResults", function () {
    let tmpDir;
    beforeEach(function () {
      sandbox = sinon.createSandbox();
      sandbox.stub(console, "log");
      tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "dd-utils-out-"));
    });
    afterEach(function () {
      sandbox.restore();
      sandbox = undefined;
      try {
        fs.rmSync(tmpDir, { recursive: true, force: true });
      } catch {}
    });
    it("writes pretty-printed JSON results to the given path", async function () {
      const outPath = path.join(tmpDir, "results.json");
      const results = { summary: { passed: 2 }, nested: [1, 2, 3] };
      await outputResults(outPath, results, { logLevel: "info" });
      const written = JSON.parse(fs.readFileSync(outPath, "utf8"));
      assert.deepEqual(written, results);
      // pretty-printed (2-space indent → contains newlines)
      assert.ok(fs.readFileSync(outPath, "utf8").includes("\n  "));
    });
  });

  describe("replaceEnvs", function () {
    let prevVal, prevObj;
    beforeEach(function () {
      prevVal = process.env.DD_TEST_VAL;
      prevObj = process.env.DD_TEST_OBJ;
    });
    afterEach(function () {
      if (prevVal === undefined) delete process.env.DD_TEST_VAL;
      else process.env.DD_TEST_VAL = prevVal;
      if (prevObj === undefined) delete process.env.DD_TEST_OBJ;
      else process.env.DD_TEST_OBJ = prevObj;
    });
    it("returns falsy input unchanged", function () {
      assert.equal(replaceEnvs(""), "");
      assert.equal(replaceEnvs(null), null);
      assert.equal(replaceEnvs(undefined), undefined);
    });
    it("returns strings without variables unchanged", function () {
      assert.equal(replaceEnvs("plain text"), "plain text");
    });
    it("substitutes a substring variable", function () {
      process.env.DD_TEST_VAL = "world";
      assert.equal(replaceEnvs("hello $DD_TEST_VAL!"), "hello world!");
    });
    it("does NOT touch a $NAME$ sentinel even when NAME is a set env var", function () {
      // The $KEY$ special-key/device-key vocabulary (dollar on both sides)
      // must survive env substitution. Regression: on Unix $HOME is set, and
      // `$HOME$` used to get rewritten to the home path, breaking the device
      // key. A trailing `$` marks a sentinel, not an env reference.
      // (The describe's afterEach restores DD_TEST_VAL, so no local dance.)
      process.env.DD_TEST_VAL = "/home/runner";
      assert.equal(replaceEnvs("$DD_TEST_VAL$"), "$DD_TEST_VAL$");
      // A bare $NAME reference still substitutes.
      assert.equal(replaceEnvs("$DD_TEST_VAL/x"), "/home/runner/x");
    });
    it("parses a whole-string variable holding a JSON object into an object", function () {
      process.env.DD_TEST_OBJ = JSON.stringify({ k: "v" });
      assert.deepEqual(replaceEnvs("$DD_TEST_OBJ"), { k: "v" });
    });
    it("recurses through nested object values", function () {
      process.env.DD_TEST_VAL = "X";
      const input = { a: "$DD_TEST_VAL", nested: { b: "$DD_TEST_VAL" } };
      const out = replaceEnvs(input);
      assert.equal(out.a, "X");
      assert.equal(out.nested.b, "X");
    });
    it("skips prototype-polluting keys (no Object.prototype mutation)", function () {
      process.env.DD_TEST_VAL = "X";
      // JSON.parse produces __proto__ as an OWN enumerable key, which is what
      // the source guard must skip; assert the prototype is left untouched.
      const malicious = JSON.parse(
        '{"__proto__":{"polluted":true},"a":"$DD_TEST_VAL"}'
      );
      const out = replaceEnvs(malicious);
      assert.equal(out.a, "X");
      assert.equal(Object.prototype.polluted, undefined);
      assert.equal(({}).polluted, undefined);
      // The assertion that actually catches a removed guard: without it,
      // result["__proto__"] = … would set out's OWN [[Prototype]] (so
      // out.polluted === true) while leaving Object.prototype untouched.
      assert.equal(Object.getPrototypeOf(out), Object.prototype);
      assert.equal(out.polluted, undefined);
    });
    it("leaves an undefined env var reference in place", function () {
      assert.equal(replaceEnvs("$DD_DOES_NOT_EXIST_123"), "$DD_DOES_NOT_EXIST_123");
    });
  });

  describe("timestamp", function () {
    it("produces a filesystem-safe ISO string with ':' and '.' replaced by '-'", function () {
      const ts = timestamp();
      assert.ok(!ts.includes(":"));
      assert.ok(!ts.includes("."));
      assert.match(ts, /^\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}-\d{3}Z$/);
    });
  });

  describe("calculateFractionalDifference", function () {
    it("returns 0 for two empty strings", function () {
      assert.equal(calculateFractionalDifference("", ""), 0);
    });
    it("returns 0 for identical strings", function () {
      assert.equal(calculateFractionalDifference("abc", "abc"), 0);
    });
    it("returns 1 for fully different equal-length strings", function () {
      assert.equal(calculateFractionalDifference("abc", "xyz"), 1);
    });
    it("returns a partial fraction for a single-char difference", function () {
      // one substitution over length 3
      assert.ok(Math.abs(calculateFractionalDifference("abc", "abd") - 1 / 3) < 1e-9);
    });
    it("handles one empty string (distance == other length)", function () {
      assert.equal(calculateFractionalDifference("", "abcd"), 1);
      assert.equal(calculateFractionalDifference("abcd", ""), 1);
    });
  });

  describe("serializeBrowserResult", function () {
    it("passes strings through unchanged", function () {
      assert.equal(serializeBrowserResult("hi"), "hi");
    });
    it("stringifies primitives and null preserving special values", function () {
      assert.equal(serializeBrowserResult(null), "null");
      assert.equal(serializeBrowserResult(NaN), "NaN");
      assert.equal(serializeBrowserResult(Infinity), "Infinity");
      assert.equal(serializeBrowserResult(true), "true");
      assert.equal(serializeBrowserResult(42), "42");
    });
    it("JSON-serializes plain objects and arrays", function () {
      assert.equal(serializeBrowserResult({ a: 1 }), '{"a":1}');
      assert.equal(serializeBrowserResult([1, 2]), "[1,2]");
    });
    it("falls back to String() for unserializable structures (circular)", function () {
      const obj = {};
      obj.self = obj;
      // String({}) → "[object Object]"
      assert.equal(serializeBrowserResult(obj), "[object Object]");
    });
  });

  describe("matchesExpectedOutput", function () {
    it("matches a plain substring", function () {
      assert.equal(matchesExpectedOutput("hello world", "lo wo"), true);
      assert.equal(matchesExpectedOutput("hello world", "absent"), false);
    });
    it("matches a /regex/ pattern", function () {
      assert.equal(matchesExpectedOutput("error: 42", "/error:\\s*\\d+/"), true);
      assert.equal(matchesExpectedOutput("nope", "/^\\d+$/"), false);
    });
    it("treats a malformed regex as a non-match instead of throwing", function () {
      assert.equal(matchesExpectedOutput("anything", "/([/"), false);
    });
  });

  describe("inContainer", function () {
    let prevInContainer;
    beforeEach(function () {
      prevInContainer = process.env.IN_CONTAINER;
      delete process.env.IN_CONTAINER;
    });
    afterEach(function () {
      if (prevInContainer === undefined) delete process.env.IN_CONTAINER;
      else process.env.IN_CONTAINER = prevInContainer;
    });
    it("returns true when IN_CONTAINER=true", async function () {
      process.env.IN_CONTAINER = "true";
      assert.equal(await inContainer(), true);
    });
    it("returns false on non-linux without the env flag", async function () {
      sandbox = sinon.createSandbox();
      // Force a non-linux platform so the spawn branch is skipped.
      // IN_CONTAINER is already cleared by beforeEach.
      sandbox.stub(process, "platform").value("win32");
      // process.platform is read-only; if the stub didn't take, skip rather than
      // run the real Linux spawnCommand path and break hermeticity on CI.
      if (process.platform !== "win32") this.skip();
      assert.equal(await inContainer(), false);
    });
  });

  describe("evaluateContextRequirements", function () {
    // Fully-injected deps so nothing touches the real PATH/fs/env.
    const deps = ({ commands = [], files = [], env = {} } = {}) => ({
      commandExists: (cmd) => commands.includes(cmd),
      existsSync: (p) => files.includes(p),
      env,
    });

    it("is met when requires is absent", function () {
      assert.deepEqual(evaluateContextRequirements({ requires: undefined }), {
        met: true,
        missing: [],
      });
      assert.deepEqual(evaluateContextRequirements({ requires: null }), {
        met: true,
        missing: [],
      });
    });

    it("treats a string as a required command", function () {
      const ok = evaluateContextRequirements({
        requires: "node",
        deps: deps({ commands: ["node"] }),
      });
      assert.deepEqual(ok, { met: true, missing: [] });

      const miss = evaluateContextRequirements({
        requires: "definitely-not-a-command",
        deps: deps(),
      });
      assert.equal(miss.met, false);
      assert.equal(miss.missing.length, 1);
      assert.match(miss.missing[0], /command/);
      assert.match(miss.missing[0], /definitely-not-a-command/);
    });

    it("ANDs an array of required commands", function () {
      const result = evaluateContextRequirements({
        requires: ["node", "ffmpeg"],
        deps: deps({ commands: ["node"] }),
      });
      assert.equal(result.met, false);
      assert.equal(result.missing.length, 1);
      assert.match(result.missing[0], /ffmpeg/);
    });

    it("checks commands, files, and env in the object form", function () {
      const result = evaluateContextRequirements({
        requires: {
          commands: ["adb"],
          files: ["/opt/app.toml"],
          env: ["API_TOKEN"],
        },
        deps: deps({
          commands: ["adb"],
          files: ["/opt/app.toml"],
          env: { API_TOKEN: "secret" },
        }),
      });
      assert.deepEqual(result, { met: true, missing: [] });
    });

    it("reports every unmet requirement, not just the first", function () {
      const result = evaluateContextRequirements({
        requires: { commands: ["adb"], files: ["/nope"], env: ["MISSING"] },
        deps: deps(),
      });
      assert.equal(result.met, false);
      assert.equal(result.missing.length, 3);
      assert.match(result.missing[0], /adb/);
      assert.match(result.missing[1], /\/nope/);
      assert.match(result.missing[2], /MISSING/);
    });

    it("treats an empty env var value as unmet", function () {
      const result = evaluateContextRequirements({
        requires: { env: ["EMPTY"] },
        deps: deps({ env: { EMPTY: "" } }),
      });
      assert.equal(result.met, false);
      assert.match(result.missing[0], /EMPTY/);
    });

    it("matches env var names case-insensitively on Windows", function () {
      // Windows env vars are case-insensitive and may surface as mixed case
      // (e.g. `Path`). `requires.env: ["PATH"]` must be met when the injected
      // env only holds `Path`, mirroring commandOnPath's PATH/Path handling.
      const win = evaluateContextRequirements({
        requires: { env: ["PATH"] },
        deps: {
          commandExists: () => true,
          existsSync: () => true,
          env: { Path: "C:\\Windows" },
          platform: "win32",
        },
      });
      assert.deepEqual(win, { met: true, missing: [] });

      // A case-insensitive match to an empty value is still unmet.
      const winEmpty = evaluateContextRequirements({
        requires: { env: ["PATH"] },
        deps: {
          commandExists: () => true,
          existsSync: () => true,
          env: { Path: "" },
          platform: "win32",
        },
      });
      assert.equal(winEmpty.met, false);
    });

    it("keeps env var matching case-sensitive off Windows", function () {
      const result = evaluateContextRequirements({
        requires: { env: ["PATH"] },
        deps: {
          commandExists: () => true,
          existsSync: () => true,
          env: { Path: "/usr/bin" },
          platform: "linux",
        },
      });
      assert.equal(result.met, false);
      assert.match(result.missing[0], /PATH/);
    });

    it("expands $VAR in file entries against the injected env", function () {
      const seen = [];
      const result = evaluateContextRequirements({
        requires: { files: ["$CONFIG_DIR/app.toml"] },
        deps: {
          commandExists: () => true,
          existsSync: (p) => {
            seen.push(p);
            return p === "/etc/myapp/app.toml";
          },
          env: { CONFIG_DIR: "/etc/myapp" },
        },
      });
      assert.deepEqual(seen, ["/etc/myapp/app.toml"]);
      assert.equal(result.met, true);
    });

    it("falls back $HOME to USERPROFILE when HOME is unset", function () {
      const seen = [];
      evaluateContextRequirements({
        requires: { files: ["$HOME/app.toml"] },
        deps: {
          commandExists: () => true,
          existsSync: (p) => {
            seen.push(p);
            return true;
          },
          env: { USERPROFILE: "C:\\Users\\tester" },
        },
      });
      assert.deepEqual(seen, ["C:\\Users\\tester/app.toml"]);
    });

    it("leaves an unexpandable $VAR literal (so the file check fails loudly)", function () {
      const seen = [];
      const result = evaluateContextRequirements({
        requires: { files: ["$NOT_SET/app.toml"] },
        deps: {
          commandExists: () => true,
          existsSync: (p) => {
            seen.push(p);
            return false;
          },
          env: {},
        },
      });
      assert.deepEqual(seen, ["$NOT_SET/app.toml"]);
      assert.equal(result.met, false);
    });

    it("drops whitespace-only and non-string entries (defense-in-depth)", function () {
      const result = evaluateContextRequirements({
        requires: { commands: ["  ", 42], env: [""] },
        deps: deps(),
      });
      assert.deepEqual(result, { met: true, missing: [] });
    });

    it("resolves a real command on the PATH with default deps", function () {
      // `node` is running this test, so it must be resolvable on the PATH.
      const ok = evaluateContextRequirements({ requires: "node" });
      assert.deepEqual(ok, { met: true, missing: [] });
      const miss = evaluateContextRequirements({
        requires: "doc-detective-no-such-binary-xyz",
      });
      assert.equal(miss.met, false);
    });
  });

  describe("findFreePort", function () {
    it("resolves an ephemeral loopback port that is then released (rebindable)", async function () {
      const port = await findFreePort();
      assert.equal(typeof port, "number");
      assert.ok(port > 0 && port < 65536);
      // Prove the port was actually released: we can bind it ourselves.
      const { createServer } = await import("node:net");
      await new Promise((resolve, reject) => {
        const server = createServer();
        server.once("error", reject);
        server.listen(port, "127.0.0.1", () => server.close(() => resolve()));
      });
    });
  });

  describe("isRetryableSessionError", function () {
    // The abort message webdriverio's fetch produces when POST /session
    // exceeds connectionRetryTimeout (observed verbatim in CI).
    const TIMEOUT_ABORT =
      'WebDriverError: The operation was aborted due to timeout when running "http://127.0.0.1:49216/session" with method "POST"';

    it("keeps the existing transient patterns retryable at any ceiling", function () {
      for (const message of [
        "connect ECONNREFUSED 127.0.0.1:4723",
        // The concurrent-chromedriver collision on the fixed default port
        // (9515) that ADR 01039 fixes: the browser driver must retry this the
        // same way the Appium path does.
        "connect ECONNREFUSED 127.0.0.1:9515",
        'WebDriverError: Could not proxy command to the remote server. Original error: connect ECONNREFUSED 127.0.0.1:9515 when running "execute/sync" with method "POST"',
        "read ECONNRESET",
        "socket hang up",
        "unknown error: could not proxy command to the remote browser",
        "unknown error: Chrome failed to start: crashed during startup",
        "unknown error: cannot connect to chrome at 127.0.0.1:9222",
        "unknown error: DevToolsActivePort file doesn't exist",
        "session not created: This version of ChromeDriver only supports...",
      ]) {
        assert.equal(isRetryableSessionError(message, 0), true, message);
        assert.equal(isRetryableSessionError(message, 120000), true, message);
        assert.equal(isRetryableSessionError(message, 900000), true, message);
      }
    });

    it("retries a session-creation timeout abort only when a slow-startup ceiling was declared", function () {
      // Native sessions (XCUITest/Mac2) declare wdaLaunchTimeout etc., which
      // raises the ceiling past the 2-minute default: the server-side WDA
      // build keeps running after the client abort, so a retry binds quickly.
      assert.equal(isRetryableSessionError(TIMEOUT_ABORT, 900000), true);
      assert.equal(isRetryableSessionError(TIMEOUT_ABORT, 120001), true);
    });

    it("keeps the timeout abort fatal for default-ceiling (browser) sessions", function () {
      assert.equal(isRetryableSessionError(TIMEOUT_ABORT, 120000), false);
      assert.equal(isRetryableSessionError(TIMEOUT_ABORT, 0), false);
      assert.equal(isRetryableSessionError(TIMEOUT_ABORT, undefined), false);
    });

    it("treats anything else as a real session-creation failure", function () {
      for (const message of [
        "invalid argument: unrecognized capability: appium:nope",
        "An unknown server-side error occurred while processing the command",
        "",
      ]) {
        assert.equal(isRetryableSessionError(message, 900000), false, message);
      }
      assert.equal(isRetryableSessionError(undefined, 900000), false);
    });
  });
});
