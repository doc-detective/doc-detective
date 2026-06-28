// Unit + integration tests for the `--debug` / `DOC_DETECTIVE_DEBUG`
// diagnostic dump.
//
// Covers the pure helpers (redactValue, findReferencedEnvVars,
// detectContainer, enumerateInputFiles), an end-to-end printDebug call
// against an in-memory print sink, and a smoke test that runs the CLI
// in --debug mode and asserts on the rendered output + exit code.

import path from "node:path";
import fs from "node:fs";
import os from "node:os";
import { spawnSync } from "node:child_process";

before(async function () {
  const { expect } = await import("chai");
  global.expect = expect;
});

describe("debug/redact", function () {
  let redactValue, isSecretName, isSecretValue, redactObject, redactArg, redactArgv;
  before(async function () {
    ({ redactValue, isSecretName, isSecretValue, redactObject, redactArg, redactArgv } =
      await import("../dist/debug/redact.js"));
  });

  describe("redactArgv", function () {
    it("redacts the value of a split secret flag (--password hunter2)", function () {
      const out = redactArgv(["node", "x", "--password", "hunter2", "--input", "."]);
      expect(out).to.deep.equal([
        "node",
        "x",
        "--password",
        "***redacted (7 chars)***",
        "--input",
        ".",
      ]);
    });

    it("does not consume the next token when the secret flag has no value", function () {
      // `--token` immediately followed by another flag: nothing to redact.
      const out = redactArgv(["--token", "--include-env"]);
      expect(out).to.deep.equal(["--token", "--include-env"]);
    });

    it("still handles --flag=value and value-shape via redactArg", function () {
      const out = redactArgv(["--api-key=abc123", "https://u:pw@host/x", "plain"]);
      expect(out[0]).to.match(/^--api-key=\*{3}redacted/);
      expect(out[1]).to.match(/^\*{3}redacted .*value shape/);
      expect(out[2]).to.equal("plain");
    });
  });

  describe("redactArg", function () {
    it("redacts secret-named --flag=value pairs but keeps the flag", function () {
      expect(redactArg("--token=ghp_secretvalue")).to.match(
        /^--token=\*{3}redacted/
      );
      expect(redactArg("--api-key=abc123")).to.match(/^--api-key=\*{3}redacted/);
    });

    it("redacts credential-shaped values regardless of flag name", function () {
      expect(redactArg("--db=postgres://u:pw@host/db")).to.match(
        /^--db=\*{3}redacted .*value shape/
      );
      const bareJwt = "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ4In0.dummysig12345";
      expect(redactArg(bareJwt)).to.match(/^\*{3}redacted .*value shape/);
    });

    it("passes through node/entry paths and ordinary flags/values", function () {
      expect(redactArg("/usr/bin/node")).to.equal("/usr/bin/node");
      expect(redactArg("debug")).to.equal("debug");
      expect(redactArg("--include-env")).to.equal("--include-env");
      expect(redactArg("--logLevel=info")).to.equal("--logLevel=info");
    });
  });

  it("redacts classic secret-looking names case-insensitively", function () {
    expect(isSecretName("MY_TOKEN")).to.equal(true);
    expect(isSecretName("api_key")).to.equal(true);
    expect(isSecretName("DB_PASSWORD")).to.equal(true);
    expect(isSecretName("AUTH_HEADER")).to.equal(true);
    expect(isSecretName("Bearer")).to.equal(true);
    expect(isSecretName("MyCredential")).to.equal(true);
  });

  it("redacts connection-string-style suffix names", function () {
    // _URL / _URI / _DSN: PaaS credential conventions
    expect(isSecretName("DATABASE_URL")).to.equal(true);
    expect(isSecretName("MONGODB_URI")).to.equal(true);
    expect(isSecretName("REDIS_URL")).to.equal(true);
    expect(isSecretName("POSTGRES_URL")).to.equal(true);
    expect(isSecretName("SENTRY_DSN")).to.equal(true);
    // _PASS / _PASSWD / _PWD
    expect(isSecretName("SMTP_PASS")).to.equal(true);
    expect(isSecretName("DB_PASSWD")).to.equal(true);
    expect(isSecretName("MAIL_PWD")).to.equal(true);
    // WEBHOOK substring
    expect(isSecretName("SLACK_WEBHOOK_URL")).to.equal(true);
    expect(isSecretName("DISCORD_WEBHOOK")).to.equal(true);
    // Bare JWT / PAT
    expect(isSecretName("JWT")).to.equal(true);
    expect(isSecretName("PAT")).to.equal(true);
    expect(isSecretName("jwt")).to.equal(true);
  });

  it("does not flag non-secret names", function () {
    expect(isSecretName("LOG_LEVEL")).to.equal(false);
    expect(isSecretName("HOME")).to.equal(false);
    expect(isSecretName("PATH")).to.equal(false);
    // Anchored suffixes don't false-positive on similar prefixes
    expect(isSecretName("PASSAGE")).to.equal(false);
    expect(isSecretName("PASSPORT")).to.equal(false);
    // `key` matches tokenized/CamelCase forms, not the raw substring.
    expect(isSecretName("MONKEY")).to.equal(false);
    expect(isSecretName("hockeyStats")).to.equal(false);
    expect(isSecretName("keyboard")).to.equal(false);
  });

  it("flags tokenized and CamelCase `key` names", function () {
    expect(isSecretName("API_KEY")).to.equal(true);
    expect(isSecretName("api-key")).to.equal(true);
    expect(isSecretName("key")).to.equal(true);
    expect(isSecretName("apiKey")).to.equal(true);
    expect(isSecretName("accessKey")).to.equal(true);
  });

  it("redacts values containing URL userinfo regardless of name", function () {
    expect(
      isSecretValue("postgres://app:hunter2@db.example.com:5432/prod")
    ).to.equal(true);
    // Empty user, password-only (common Redis form).
    expect(isSecretValue("redis://:pwd@127.0.0.1:6379/0")).to.equal(true);
    expect(isSecretValue("https://user:pass@example.com/path")).to.equal(true);
    // Plain URL — no userinfo.
    expect(isSecretValue("https://example.com/path")).to.equal(false);
    // Host:port is NOT userinfo (no @).
    expect(isSecretValue("http://example.com:8080/path")).to.equal(false);
  });

  it("redacts JWT-shaped values regardless of name", function () {
    const fakeJwt =
      "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ4In0.dummysignaturepart12345";
    expect(isSecretValue(fakeJwt)).to.equal(true);
    expect(isSecretValue("eyJfoo")).to.equal(false); // not full JWT shape
  });

  it("redacts GitHub token-shaped values regardless of name", function () {
    const fakePat = "ghp_" + "A".repeat(36);
    expect(isSecretValue(fakePat)).to.equal(true);
    expect(isSecretValue("ghp_short")).to.equal(false);
  });

  it("redacts GitHub fine-grained PAT-shaped values (github_pat_…)", function () {
    const fakeFineGrained = "github_pat_" + "A".repeat(82);
    expect(isSecretValue(fakeFineGrained)).to.equal(true);
    // Even under an innocuous name, the value shape catches it.
    expect(redactValue("GITHUB_PAT", fakeFineGrained)).to.match(
      /^\*{3}redacted/
    );
    expect(isSecretValue("github_pat_short")).to.equal(false);
  });

  it("redacts AWS access key ID-shaped values regardless of name", function () {
    expect(isSecretValue("AKIAIOSFODNN7EXAMPLE")).to.equal(true);
    expect(isSecretValue("ASIAIOSFODNN7EXAMPLE")).to.equal(true);
    expect(isSecretValue("akiainvalidcasing7example")).to.equal(false);
  });

  it("redactValue: name-pattern hit shows generic redacted message", function () {
    const out = redactValue("MY_TOKEN", "abc123");
    expect(out).to.equal("***redacted (6 chars)***");
  });

  it("redactValue: value-shape hit shows value-shape redacted message", function () {
    const url = "postgres://app:hunter2@db.example.com/prod";
    const out = redactValue("INNOCENT_NAME", url);
    expect(out).to.equal(`***redacted (${url.length} chars, value shape)***`);
  });

  it("redactValue: <unset> for undefined and <empty> for empty string", function () {
    expect(redactValue("FOO", undefined)).to.equal("<unset>");
    expect(redactValue("FOO", "")).to.equal("<empty>");
  });

  it("redactValue: returns non-secret values verbatim", function () {
    expect(redactValue("LOG_LEVEL", "debug")).to.equal("debug");
    expect(redactValue("MY_URL_TEMPLATE", "https://example.com/{id}")).to.equal(
      "https://example.com/{id}"
    );
  });

  describe("redactObject", function () {
    it("redacts string values under secret-named keys", function () {
      const out = redactObject({
        integrations: {
          heretto: [
            {
              name: "main",
              apiToken: "abc123def",
              username: "harold@example.com",
            },
          ],
          docDetectiveApi: { apiKey: "xyz789" },
        },
        logLevel: "info",
      });
      expect(out.integrations.heretto[0].apiToken).to.equal(
        "***redacted (9 chars)***"
      );
      expect(out.integrations.docDetectiveApi.apiKey).to.equal(
        "***redacted (6 chars)***"
      );
      // Non-secret-named string preserved.
      expect(out.integrations.heretto[0].name).to.equal("main");
      expect(out.integrations.heretto[0].username).to.equal("harold@example.com");
      expect(out.logLevel).to.equal("info");
    });

    it("redacts value-shape secrets even under innocent keys", function () {
      const out = redactObject({
        // Innocent key, credential-shaped value → redacted by value shape.
        connectionInfo: "postgres://app:hunter2@db.example.com/prod",
        // Innocent key, mixed values → only the one with userinfo is redacted.
        links: ["https://example.com/clean", "https://user:pw@svc/hook"],
      });
      expect(out.connectionInfo).to.match(/^\*{3}redacted .*value shape/);
      expect(out.links[0]).to.equal("https://example.com/clean");
      expect(out.links[1]).to.match(/^\*{3}redacted .*value shape/);
    });

    it("name-based redaction propagates to array elements (e.g. webhookList)", function () {
      const out = redactObject({
        // Parent key contains WEBHOOK — every string element is redacted
        // by name, not by individual inspection.
        webhookList: [
          "https://example.com/clean",
          "https://user:pw@svc/hook",
        ],
      });
      expect(out.webhookList[0]).to.match(/^\*{3}redacted/);
      expect(out.webhookList[1]).to.match(/^\*{3}redacted/);
    });

    it("preserves primitives, null, and undefined", function () {
      const out = redactObject({
        count: 42,
        enabled: true,
        missing: null,
        absent: undefined,
        name: "plain",
      });
      expect(out.count).to.equal(42);
      expect(out.enabled).to.equal(true);
      expect(out.missing).to.equal(null);
      expect(out.absent).to.equal(undefined);
      expect(out.name).to.equal("plain");
    });

    it("does not mutate the input", function () {
      const input = {
        integrations: {
          docDetectiveApi: { apiKey: "secret-key-12345" },
        },
      };
      const out = redactObject(input);
      expect(input.integrations.docDetectiveApi.apiKey).to.equal(
        "secret-key-12345"
      );
      expect(out.integrations.docDetectiveApi.apiKey).to.equal(
        "***redacted (16 chars)***"
      );
      // Top-level returned object is a fresh reference.
      expect(out).to.not.equal(input);
    });

    it("ignores prototype keys defensively", function () {
      const obj = { real: "$REAL", apiToken: "secret" };
      // eslint-disable-next-line no-proto
      Object.defineProperty(obj, "__proto__", {
        value: { hidden: "secret-hidden" },
        enumerable: true,
      });
      const out = redactObject(obj);
      expect(out.real).to.equal("$REAL");
      expect(out.apiToken).to.equal("***redacted (6 chars)***");
      expect(out.hidden).to.equal(undefined);
    });

    it("handles circular references without crashing", function () {
      const a = { name: "a" };
      a.self = a;
      const out = redactObject(a);
      expect(out.name).to.equal("a");
      expect(out.self).to.equal("<circular>");
    });
  });
});

describe("debug/envvars", function () {
  let findReferencedEnvVars,
    detectContainer,
    enumerateInputFiles,
    resolveDocExtensions;
  before(async function () {
    ({
      findReferencedEnvVars,
      detectContainer,
      enumerateInputFiles,
      resolveDocExtensions,
    } = await import("../dist/debug/envvars.js"));
  });

  it("finds $VAR references in a string", function () {
    const refs = findReferencedEnvVars("hello $FOO and $BAR_BAZ done");
    expect(Array.from(refs).sort()).to.deep.equal(["BAR_BAZ", "FOO"]);
  });

  it("ignores numeric-leading tokens (shell positionals, backreferences)", function () {
    // `$0`/`$1`/`$2` are shell positionals or regex backreferences, never
    // env vars — they must not appear, but real `$VAR9` (digit not first)
    // and `$_PRIVATE` (leading underscore) must still be caught.
    const refs = findReferencedEnvVars(
      'sh "$0 $1 $2" and $86 but keep $VAR9 and $_PRIVATE'
    );
    expect(Array.from(refs).sort()).to.deep.equal(["VAR9", "_PRIVATE"]);
  });

  it("walks nested objects and arrays", function () {
    const obj = {
      a: "$ALPHA",
      b: [{ c: "prefix $BETA suffix" }, "$GAMMA"],
      d: null,
      e: 42,
    };
    const refs = findReferencedEnvVars(obj);
    expect(Array.from(refs).sort()).to.deep.equal([
      "ALPHA",
      "BETA",
      "GAMMA",
    ]);
  });

  it("returns an empty set when no $ refs are present", function () {
    const refs = findReferencedEnvVars({ a: "plain", b: ["string"] });
    expect(refs.size).to.equal(0);
  });

  it("ignores prototype keys defensively", function () {
    const obj = { real: "$REAL" };
    // eslint-disable-next-line no-proto
    Object.defineProperty(obj, "__proto__", {
      value: { hidden: "$HIDDEN" },
      enumerable: true,
    });
    const refs = findReferencedEnvVars(obj);
    expect(refs.has("REAL")).to.equal(true);
    expect(refs.has("HIDDEN")).to.equal(false);
  });

  it("detectContainer returns false when no signals present", function () {
    const prev = process.env.IN_CONTAINER;
    delete process.env.IN_CONTAINER;
    try {
      const info = detectContainer();
      // On a developer machine: should be false (unless tests run inside Docker).
      expect(info).to.have.property("inContainer");
      expect(info).to.have.property("signals");
      expect(info.signals).to.be.an("array");
    } finally {
      if (prev !== undefined) process.env.IN_CONTAINER = prev;
    }
  });

  it("detectContainer flags IN_CONTAINER=true", function () {
    const prev = process.env.IN_CONTAINER;
    process.env.IN_CONTAINER = "true";
    try {
      const info = detectContainer();
      expect(info.inContainer).to.equal(true);
      expect(info.signals).to.include("IN_CONTAINER=true");
    } finally {
      if (prev === undefined) delete process.env.IN_CONTAINER;
      else process.env.IN_CONTAINER = prev;
    }
  });

  it("enumerateInputFiles handles files, directories, missing paths, and respects the cap", function () {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "dd-debug-enum-"));
    try {
      fs.writeFileSync(path.join(tmp, "a.txt"), "alpha");
      fs.writeFileSync(path.join(tmp, "b.txt"), "beta");
      fs.mkdirSync(path.join(tmp, "sub"));
      fs.writeFileSync(path.join(tmp, "sub", "c.txt"), "gamma");
      fs.mkdirSync(path.join(tmp, "node_modules"));
      fs.writeFileSync(path.join(tmp, "node_modules", "skip.txt"), "skip");

      const files = enumerateInputFiles(
        [tmp, "/nonexistent/path/that/does/not/exist"],
        100
      );
      // Three real files; node_modules is skipped.
      expect(files.length).to.equal(3);
      expect(files.every((f) => !f.includes("node_modules"))).to.equal(true);

      // Cap is honored.
      const capped = enumerateInputFiles([tmp], 1);
      expect(capped.length).to.equal(1);
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });

  it("enumerateInputFiles filters discovered files by allowed extensions but keeps explicit file paths", function () {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "dd-debug-ext-"));
    try {
      fs.writeFileSync(path.join(tmp, "doc.md"), "# doc");
      fs.writeFileSync(path.join(tmp, "page.html"), "<p>x</p>");
      fs.writeFileSync(path.join(tmp, "script.js"), "const $x = 1;");
      fs.writeFileSync(path.join(tmp, "ci.yaml"), "run: echo $HOME");

      // Directory walk: only md + html survive the doc-extension filter.
      const allowed = new Set(["md", "markdown", "html", "htm"]);
      const found = enumerateInputFiles([tmp], 100, allowed);
      const names = found.map((f) => path.basename(f)).sort();
      expect(names).to.deep.equal(["doc.md", "page.html"]);

      // An explicitly-passed file is honored even if its extension is
      // outside the allow-set (the user pointed at it directly).
      const explicit = enumerateInputFiles(
        [path.join(tmp, "script.js")],
        100,
        allowed
      );
      expect(explicit.map((f) => path.basename(f))).to.deep.equal(["script.js"]);
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });

  it("resolveDocExtensions maps fileType names, reads object extensions, and falls back to the full set", function () {
    // String names → their default extensions.
    expect(
      Array.from(resolveDocExtensions(["markdown", "dita"])).sort()
    ).to.deep.equal(["dita", "ditamap", "markdown", "md", "mdx", "xml"]);

    // Object entries: explicit extensions + name lookup, dot-stripped and
    // lowercased.
    const fromObjects = resolveDocExtensions([
      { extensions: [".MD", "txt"] },
      { name: "html" },
    ]);
    expect(Array.from(fromObjects).sort()).to.deep.equal([
      "htm",
      "html",
      "md",
      "txt",
    ]);

    // The schema allows `extensions` as a string too (e.g. `"ipynb"`).
    const fromStringExt = resolveDocExtensions([{ extensions: ".IPYNB" }]);
    expect(fromStringExt.has("ipynb")).to.equal(true);

    // Absent / empty / unrecognized → union of all known doc extensions.
    const fallback = resolveDocExtensions(undefined);
    expect(fallback.has("md")).to.equal(true);
    expect(fallback.has("adoc")).to.equal(true);
    expect(fallback.has("html")).to.equal(true);
    expect(fallback.has("dita")).to.equal(true);
    expect(resolveDocExtensions(["nonexistent-type"]).has("md")).to.equal(true);
  });

  it("enumerateInputFiles terminates on a symlinked directory cycle", function () {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "dd-debug-cycle-"));
    try {
      const sub = path.join(tmp, "sub");
      fs.mkdirSync(sub);
      fs.writeFileSync(path.join(sub, "a.txt"), "alpha");
      // `sub/loop -> tmp` makes a cycle: tmp/sub/loop/sub/loop/... Skip the
      // test where the OS won't let us create a directory symlink (Windows
      // without Developer Mode / admin).
      try {
        fs.symlinkSync(tmp, path.join(sub, "loop"), "dir");
      } catch {
        this.skip();
      }
      // Must return (not hang) thanks to the visited-dir guard.
      const files = enumerateInputFiles([tmp], 100);
      expect(files.some((f) => f.endsWith("a.txt"))).to.equal(true);
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });
});

describe("debug/tools", function () {
  let probeTool, envWithoutNodeModulesBin;
  before(async function () {
    ({ probeTool, envWithoutNodeModulesBin } = await import(
      "../dist/debug/tools.js"
    ));
  });

  it("envWithoutNodeModulesBin strips node_modules/.bin segments, keeps system dirs", function () {
    const sep = path.delimiter;
    const prev = process.env.PATH;
    const sysA = process.platform === "win32" ? "C:\\Windows\\System32" : "/usr/bin";
    const sysB = process.platform === "win32" ? "C:\\Windows" : "/bin";
    const bin = process.platform === "win32"
      ? "C:\\repo\\node_modules\\.bin"
      : "/repo/node_modules/.bin";
    const nested = process.platform === "win32"
      ? "C:\\repo\\packages\\x\\node_modules\\.bin"
      : "/repo/packages/x/node_modules/.bin";
    try {
      process.env.PATH = [sysA, bin, sysB, nested].join(sep);
      const env = envWithoutNodeModulesBin();
      const key = Object.keys(env).find((k) => k.toLowerCase() === "path");
      const segs = env[key].split(sep);
      expect(segs).to.include(sysA);
      expect(segs).to.include(sysB);
      expect(segs.some((s) => /node_modules[\\/]\.bin/i.test(s))).to.equal(false);
    } finally {
      if (prev === undefined) delete process.env.PATH;
      else process.env.PATH = prev;
    }
  });

  it("returns <not found> for a non-existent binary", async function () {
    this.timeout(5000);
    const result = await probeTool(
      "definitely-not-a-real-binary",
      "definitely-not-a-real-binary --version",
      { timeoutMs: 2000 }
    );
    expect(result.version).to.match(/<not found>|<probe failed>|<timed out/);
  });

  it("suppresses the noisy 'command not found' note for a missing binary", async function () {
    this.timeout(5000);
    // The OS "not recognized"/"command not found" message is a truncated,
    // comma-dangling fragment — `<not found>` already conveys absence, so
    // no note should be attached (regression: java showed a half-sentence).
    const result = await probeTool(
      "definitely-not-a-real-binary",
      "definitely-not-a-real-binary --version",
      { timeoutMs: 2000 }
    );
    if (result.version === "<not found>") {
      expect(result.notes).to.equal(undefined);
    }
  });

  it("returns process.version-style output for a real binary (node)", async function () {
    this.timeout(5000);
    const result = await probeTool("node", "node --version", { timeoutMs: 3000 });
    expect(result.version).to.match(/^v\d+\./);
  });

  it("honors the timeout for a hanging command", async function () {
    this.timeout(5000);
    // `node -e "setInterval(...)"` would hang forever; the probe should
    // settle with a `<timed out ...>` marker.
    const result = await probeTool(
      "hanger",
      `node -e "setInterval(() => {}, 1000)"`,
      { timeoutMs: 500 }
    );
    expect(result.version).to.match(/<timed out after \d+ms>/);
  });
});

describe("debug/printDebug end-to-end", function () {
  let printDebug;
  before(async function () {
    ({ printDebug } = await import("../dist/debug/index.js"));
  });

  it("renders all sections to the print sink", async function () {
    this.timeout(60000);
    const out = [];
    await printDebug({
      config: { input: ".", logLevel: "info", environment: { platform: "linux" } },
      configPath: null,
      print: (line) => out.push(line),
    });
    const text = out.join("\n");

    // Header banner + generated-at timestamp at the top.
    expect(text).to.include("Doc Detective diagnostic dump");
    expect(text).to.match(/Generated: \d{4}-\d{2}-\d{2}T[\d:.]+Z/);
    // Each section header
    expect(text).to.include("-- System ");
    expect(text).to.include("-- Doc Detective ");
    expect(text).to.include("-- Tools ");
    expect(text).to.include("-- Browsers ");
    expect(text).to.include("-- Container state ");
    expect(text).to.include("-- Referenced environment variables ");
    expect(text).to.include("-- Config ");
    // System info markers
    expect(text).to.match(/platform\s+\w+/);
    expect(text).to.match(/nodeVersion\s+v\d+\./);
    // Doc Detective section surfaces where the running package loaded from.
    expect(text).to.match(/loadedFrom\s+\S/);
    expect(text).to.match(/entryPoint\s+\S/);

    // Browsers section always enumerates all three supported browsers with
    // an explicit availability status and per-component breakdown.
    expect(text).to.match(/\n\s+chrome\s+(AVAILABLE|NOT AVAILABLE)/);
    expect(text).to.match(/\n\s+firefox\s+(AVAILABLE|NOT AVAILABLE)/);
    // platform: linux -> Safari is unsupported.
    expect(text).to.match(/\n\s+safari\s+NOT SUPPORTED/);
    expect(text).to.include("appium-chromium-driver:");
    expect(text).to.include("geckodriver:");
    expect(text).to.include("safaridriver:");
  });

  it("writes timestamped dump files to outDir, matching the header timestamp (and nothing when omitted)", async function () {
    this.timeout(60000);
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "dd-debug-outdir-"));
    try {
      const outDir = path.join(tmp, ".doc-detective");
      const out = [];
      await printDebug({
        config: { input: ".", environment: { platform: "linux" } },
        configPath: null,
        outDir,
        print: (line) => out.push(line),
      });
      // Two timestamped files written, parent dir created.
      const files = fs.readdirSync(outDir);
      const txt = files.find((f) => /^debug-.+\.txt$/.test(f));
      const json = files.find((f) => /^debug-.+\.json$/.test(f));
      expect(txt, "timestamped .txt written").to.be.a("string");
      expect(json, "timestamped .json written").to.be.a("string");
      // Both files share the SAME timestamp token.
      const stamp = txt.replace(/^debug-/, "").replace(/\.txt$/, "");
      expect(json).to.equal(`debug-${stamp}.json`);

      const content = fs.readFileSync(path.join(outDir, txt), "utf8");
      expect(content).to.include("Doc Detective diagnostic dump");
      expect(content).to.include("-- Browsers ");
      // The "Generated:" header timestamp is the same instant as the
      // filename timestamp (filename just swaps `:`/`.` for `-`).
      const m = content.match(/Generated: (\S+)/);
      expect(m, "Generated: header present").to.not.equal(null);
      expect(m[1].replace(/[:.]/g, "-")).to.equal(stamp);
      expect(out.join("\n")).to.include("Diagnostic dump saved to");
      expect(out.join("\n")).to.include("Diagnostic JSON saved to");

      // Omitting outDir must not write anything (no side effects in tests).
      const before = fs.readdirSync(outDir);
      await printDebug({
        config: { input: ".", environment: { platform: "linux" } },
        configPath: null,
        print: () => {},
      });
      expect(fs.readdirSync(outDir)).to.deep.equal(before);
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });

  it("saves dump files with owner-only permissions (POSIX)", async function () {
    if (process.platform === "win32") this.skip();
    this.timeout(60000);
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "dd-debug-perms-"));
    try {
      const outDir = path.join(tmp, ".doc-detective");
      await printDebug({
        config: { input: ".", environment: { platform: "linux" } },
        configPath: null,
        outDir,
        print: () => {},
      });
      // Dir is 0700, files are 0600 — dumps can carry env/config data.
      expect(fs.statSync(outDir).mode & 0o777).to.equal(0o700);
      for (const f of fs.readdirSync(outDir)) {
        expect(fs.statSync(path.join(outDir, f)).mode & 0o777, f).to.equal(0o600);
      }
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });

  it("writes structured, redacted JSON to the timestamped outDir file", async function () {
    this.timeout(60000);
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "dd-debug-json-"));
    const prev = process.env.DD_TEST_JSON_CONN;
    process.env.DD_TEST_JSON_CONN = "postgres://app:hunter2@db.example.com/prod";
    try {
      const outDir = path.join(tmp, ".doc-detective");
      const out = [];
      await printDebug({
        config: {
          input: ".",
          environment: { platform: "linux" },
          integrations: { docDetectiveApi: { apiKey: "supersecret-key" } },
        },
        configPath: null,
        includeEnv: true,
        outDir,
        print: (line) => out.push(line),
      });
      const jsonName = fs
        .readdirSync(outDir)
        .find((f) => /^debug-.+\.json$/.test(f));
      expect(jsonName, "timestamped .json written").to.be.a("string");
      const data = JSON.parse(fs.readFileSync(path.join(outDir, jsonName), "utf8"));

      // Structured top-level shape.
      expect(data).to.include.keys(
        "system",
        "docDetective",
        "tools",
        "browsers",
        "container",
        "environment",
        "config"
      );
      // Where doc-detective loaded from is captured.
      expect(data.docDetective.loadedFrom).to.be.a("string");
      expect(data.docDetective.entryPoint).to.be.a("string");
      // Browsers enumerated structurally with availability flags.
      expect(data.browsers.browsers.map((b) => b.name)).to.deep.equal([
        "chrome",
        "firefox",
        "safari",
      ]);
      // Redaction carries into JSON: no secrets in the serialized form.
      const serialized = JSON.stringify(data);
      expect(serialized).to.not.include("hunter2");
      expect(serialized).to.not.include("supersecret-key");
      expect(data.config.redacted.integrations.docDetectiveApi.apiKey).to.match(
        /redacted/
      );
      // stdout reports the JSON save path.
      expect(out.join("\n")).to.include("Diagnostic JSON saved to");
    } finally {
      if (prev === undefined) delete process.env.DD_TEST_JSON_CONN;
      else process.env.DD_TEST_JSON_CONN = prev;
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });

  it("browser binaries are read from the install record (matches `doc-detective install`)", async function () {
    this.timeout(60000);
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "dd-debug-record-"));
    try {
      // Craft an installed.json the way the installer writes it, then point
      // config.cacheDir at it. The browser section must reflect THIS record
      // (the same source `doc-detective install` / `install status` read),
      // not a live browser-cache scan.
      fs.writeFileSync(
        path.join(tmp, "installed.json"),
        JSON.stringify({
          npmPackages: {},
          browsers: {
            chrome: { installedVersion: "140.0.test", installedAt: "now" },
            chromedriver: { installedVersion: "140.0.test", installedAt: "now" },
          },
        })
      );
      const out = [];
      await printDebug({
        config: {
          input: ".",
          environment: { platform: "linux" },
          cacheDir: tmp,
        },
        configPath: null,
        print: (line) => out.push(line),
      });
      const text = out.join("\n");
      // chrome browser + chromedriver reflect the record's versions.
      expect(text).to.match(/chrome browser:\s+installed\s+140\.0\.test/);
      expect(text).to.match(/chromedriver:\s+installed\s+140\.0\.test/);
      // firefox browser is absent from the record -> reported not installed.
      expect(text).to.match(/firefox browser:\s+not installed/);
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });

  it("surfaces the CONFIG INVALID banner when configError is set", async function () {
    this.timeout(60000);
    const out = [];
    await printDebug({
      config: { input: ".", logLevel: "info", environment: { platform: "linux" } },
      configPath: null,
      configError: new Error("Invalid config. boom"),
      print: (line) => out.push(line),
    });
    const text = out.join("\n");
    expect(text).to.include("=== CONFIG INVALID ===");
    expect(text).to.include("Invalid config. boom");
  });

  it("redacts secret-named env vars in the referenced-vars section", async function () {
    this.timeout(60000);
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "dd-debug-redact-"));
    try {
      // Spec file with a secret-shaped env ref + a plain one.
      const specPath = path.join(tmp, "spec.md");
      fs.writeFileSync(specPath, "url: $MY_TOKEN and $LOG_LEVEL\n");
      const prevToken = process.env.MY_TOKEN;
      const prevLog = process.env.LOG_LEVEL;
      process.env.MY_TOKEN = "supersecret";
      process.env.LOG_LEVEL = "info";
      try {
        const out = [];
        await printDebug({
          config: { input: [tmp], environment: { platform: "linux" } },
          configPath: null,
          print: (line) => out.push(line),
        });
        const text = out.join("\n");
        expect(text).to.include("MY_TOKEN");
        expect(text).to.include("***redacted (11 chars)***");
        expect(text).to.match(/LOG_LEVEL\s*=\s*info/);
        expect(text).to.not.include("supersecret");
      } finally {
        if (prevToken === undefined) delete process.env.MY_TOKEN;
        else process.env.MY_TOKEN = prevToken;
        if (prevLog === undefined) delete process.env.LOG_LEVEL;
        else process.env.LOG_LEVEL = prevLog;
      }
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });

  it("redacts secrets in the Config section so heretto apiToken / docDetectiveApi apiKey don't leak", async function () {
    this.timeout(60000);
    const out = [];
    await printDebug({
      config: {
        input: ".",
        environment: { platform: "linux" },
        integrations: {
          heretto: [
            {
              name: "main",
              organizationId: "acme",
              username: "u",
              apiToken: "supersecret-heretto-token",
            },
          ],
          docDetectiveApi: { apiKey: "supersecret-api-key" },
        },
      },
      configPath: null,
      print: (line) => out.push(line),
    });
    const text = out.join("\n");
    expect(text).to.not.include("supersecret-heretto-token");
    expect(text).to.not.include("supersecret-api-key");
    // Redaction markers present.
    expect(text).to.match(/apiToken.*\*{3}redacted/);
    expect(text).to.match(/apiKey.*\*{3}redacted/);
    // Non-secret fields preserved.
    expect(text).to.match(/"organizationId":\s*"acme"/);
  });

  it("includeEnv:true emits the full env dump with value-shape redaction", async function () {
    this.timeout(60000);
    const prevDb = process.env.DD_TEST_FAKE_CONN;
    const prevSafe = process.env.DD_TEST_SAFE_NAME;
    process.env.DD_TEST_FAKE_CONN =
      "postgres://app:hunter2@db.example.com/prod";
    process.env.DD_TEST_SAFE_NAME = "harmless-value";
    try {
      const out = [];
      await printDebug({
        config: { input: ".", environment: { platform: "linux" } },
        configPath: null,
        includeEnv: true,
        print: (line) => out.push(line),
      });
      const text = out.join("\n");
      expect(text).to.include("-- Environment variables (full) ");
      // Innocent-named value containing URL userinfo IS redacted by value shape.
      expect(text).to.match(
        /DD_TEST_FAKE_CONN\s*=\s*\*{3}redacted .*value shape/
      );
      expect(text).to.not.include("hunter2");
      // Safe value still shown plainly.
      expect(text).to.match(/DD_TEST_SAFE_NAME\s*=\s*harmless-value/);
      // Warning banner is present.
      expect(text).to.include("REVIEW BEFORE PASTING");
    } finally {
      if (prevDb === undefined) delete process.env.DD_TEST_FAKE_CONN;
      else process.env.DD_TEST_FAKE_CONN = prevDb;
      if (prevSafe === undefined) delete process.env.DD_TEST_SAFE_NAME;
      else process.env.DD_TEST_SAFE_NAME = prevSafe;
    }
  });
});

describe("debug CLI smoke test", function () {
  it("runs `doc-detective debug` and prints the diagnostic dump with exit 0", function () {
    this.timeout(120000);
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "dd-debug-cli-"));
    try {
      const bin = path.resolve(process.cwd(), "bin/doc-detective.js");
      const result = spawnSync(process.execPath, [bin, "debug"], {
        cwd: tmp,
        encoding: "utf8",
        env: { ...process.env, DOC_DETECTIVE_DEBUG: "" },
      });
      expect(result.status).to.equal(0);
      expect(result.stdout).to.include("Doc Detective diagnostic dump");
      expect(result.stdout).to.include("-- System ");
      expect(result.stdout).to.include("-- Doc Detective ");
      // Without --include-env, full env dump is NOT emitted.
      expect(result.stdout).to.not.include("-- Environment variables (full) ");
      expect(result.stdout).to.include(
        "-- Referenced environment variables "
      );
      // A timestamp is printed at the top of the dump.
      expect(result.stdout).to.match(/Generated: \S+/);
      // The dump is also saved to <cwd>/.doc-detective/ as timestamped
      // text + JSON files (debug-<timestamp>.txt / .json).
      const savedDir = path.join(tmp, ".doc-detective");
      const saved = fs.readdirSync(savedDir);
      const txtName = saved.find((f) => /^debug-.+\.txt$/.test(f));
      const jsonName = saved.find((f) => /^debug-.+\.json$/.test(f));
      expect(txtName, "debug-<ts>.txt should be saved in cwd").to.be.a("string");
      expect(jsonName, "debug-<ts>.json should be saved in cwd").to.be.a("string");
      expect(fs.readFileSync(path.join(savedDir, txtName), "utf8")).to.include(
        "Doc Detective diagnostic dump"
      );
      const parsed = JSON.parse(
        fs.readFileSync(path.join(savedDir, jsonName), "utf8")
      );
      expect(parsed).to.include.keys("system", "docDetective", "browsers");
      expect(result.stdout).to.include("Diagnostic dump saved to");
      expect(result.stdout).to.include("Diagnostic JSON saved to");
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });

  it("--include-env emits the full env dump section", function () {
    this.timeout(120000);
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "dd-debug-includeenv-"));
    try {
      const bin = path.resolve(process.cwd(), "bin/doc-detective.js");
      const result = spawnSync(
        process.execPath,
        [bin, "debug", "--include-env"],
        {
          cwd: tmp,
          encoding: "utf8",
          env: {
            ...process.env,
            DOC_DETECTIVE_DEBUG: "",
            DD_TEST_FAKE_DB: "postgres://app:hunter2@db.example.com/prod",
            DD_TEST_LOG: "info",
          },
        }
      );
      expect(result.status).to.equal(0);
      expect(result.stdout).to.include("-- Environment variables (full) ");
      expect(result.stdout).to.match(/DD_TEST_LOG\s*=\s*info/);
      // Value-shape redaction catches the embedded credential even
      // though the env var name doesn't match the secret-name regex.
      expect(result.stdout).to.match(/DD_TEST_FAKE_DB\s*=\s*\*{3}redacted/);
      expect(result.stdout).to.not.include("hunter2");
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });

  it("DOC_DETECTIVE_DEBUG=true on the default command also dumps (without --include-env)", function () {
    this.timeout(120000);
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "dd-debug-envvar-"));
    try {
      const bin = path.resolve(process.cwd(), "bin/doc-detective.js");
      const result = spawnSync(process.execPath, [bin], {
        cwd: tmp,
        encoding: "utf8",
        env: { ...process.env, DOC_DETECTIVE_DEBUG: "true" },
      });
      expect(result.status).to.equal(0);
      expect(result.stdout).to.include("Doc Detective diagnostic dump");
      // Env-var path never opts into full env dump.
      expect(result.stdout).to.not.include("-- Environment variables (full) ");
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });
});

describe("debug/network", function () {
  let collectNetworkConfig;
  before(async function () {
    ({ collectNetworkConfig } = await import("../dist/debug/network.js"));
  });

  it("lists proxy and npm_config_* vars, sorted", function () {
    const out = collectNetworkConfig({
      HTTPS_PROXY: "http://proxy.example:8080",
      npm_config_registry: "https://registry.example/",
      npm_config_strict_ssl: "true",
      UNRELATED: "ignored",
    });
    const names = out.variables.map((v) => v.name);
    expect(names).to.deep.equal([
      "HTTPS_PROXY",
      "npm_config_registry",
      "npm_config_strict_ssl",
    ]);
    expect(names).to.not.include("UNRELATED");
  });

  it("redacts a registry URL that embeds credentials", function () {
    const out = collectNetworkConfig({
      npm_config_registry: "https://user:s3cr3t@registry.example/",
    });
    const reg = out.variables.find((v) => v.name === "npm_config_registry");
    expect(reg.value).to.match(/\*{3}redacted/);
    expect(reg.value).to.not.include("s3cr3t");
  });

  it("redacts a per-registry _authToken by name", function () {
    const out = collectNetworkConfig({
      "npm_config_//registry.example/:_authToken": "abc123tokenvalue",
    });
    expect(out.variables[0].value).to.match(/\*{3}redacted/);
    expect(out.variables[0].value).to.not.include("abc123tokenvalue");
  });

  it("returns an empty list when no network vars are set", function () {
    expect(collectNetworkConfig({}).variables).to.deep.equal([]);
  });

  it("ignores npm_config_* keys whose value is undefined", function () {
    const out = collectNetworkConfig({
      npm_config_registry: undefined,
      npm_config_proxy: "http://p:8080",
    });
    expect(out.variables.map((v) => v.name)).to.deep.equal(["npm_config_proxy"]);
  });
});

describe("debug/provenance", function () {
  let collectCliOverrides, collectProvenance;
  before(async function () {
    ({ collectCliOverrides, collectProvenance } = await import(
      "../dist/debug/provenance.js"
    ));
  });

  it("reports only the CLI flags actually present, with real flag spellings", function () {
    const overrides = collectCliOverrides({
      input: "docs",
      test: "smoke,api",
      dryRun: true,
      // absent / empty values must NOT be reported
      output: undefined,
      spec: "",
      logLevel: "",
    });
    const flags = overrides.map((o) => o.flag);
    // dryRun is the camel argv key, but the reported flag is the real
    // CLI spelling `--dry-run`.
    expect(flags).to.have.members(["input", "test", "dry-run"]);
    expect(flags).to.not.include("output");
    expect(flags).to.not.include("spec");
    expect(flags).to.not.include("logLevel");
    const testOverride = overrides.find((o) => o.flag === "test");
    expect(testOverride.configKey).to.equal("testFilter");
  });

  it("matches setConfig's guards for reporters / test / spec edge cases", function () {
    // reporters: [] does NOT override in setConfig (normalized list empty).
    expect(
      collectCliOverrides({ reporters: [] }).map((o) => o.flag)
    ).to.not.include("reporters");
    expect(
      collectCliOverrides({ reporters: ["html"] }).map((o) => o.flag)
    ).to.include("reporters");
    // test / spec whose comma-split trims to nothing do NOT override.
    expect(collectCliOverrides({ test: " , " }).map((o) => o.flag)).to.not.include(
      "test"
    );
    expect(collectCliOverrides({ spec: "," }).map((o) => o.flag)).to.not.include(
      "spec"
    );
    // concurrent-runners: "" / "true" / positive int override; "abc"/"0" don't.
    for (const v of ["", "true", "TRUE", "4"]) {
      expect(
        collectCliOverrides({ concurrentRunners: v }).map((o) => o.flag),
        `value ${JSON.stringify(v)}`
      ).to.include("concurrent-runners");
    }
    for (const v of ["abc", "0", "-1", "1.5"]) {
      expect(
        collectCliOverrides({ concurrentRunners: v }).map((o) => o.flag),
        `value ${JSON.stringify(v)}`
      ).to.not.include("concurrent-runners");
    }
  });

  it("pins the full set of recognized override flags (keep in sync with setConfig)", function () {
    // Every flag set at once → the complete list this collector recognizes.
    // If setConfig gains/loses a user-facing override, update OVERRIDE_SPECS
    // and this assertion together.
    const all = collectCliOverrides({
      input: "x",
      output: "y",
      logLevel: "info",
      allowUnsafe: true,
      dryRun: true,
      reporters: ["html"],
      test: "a",
      spec: "b",
      hints: true,
      autoUpdate: true,
      autoScreenshot: true,
      autoRecord: true,
      cacheDir: "z",
      concurrentRunners: "2",
    });
    expect(all.map((o) => o.flag)).to.deep.equal([
      "input",
      "output",
      "logLevel",
      "allow-unsafe",
      "dry-run",
      "reporters",
      "test",
      "spec",
      "hints",
      "auto-update",
      "auto-screenshot",
      "auto-record",
      "cache-dir",
      "concurrent-runners",
    ]);
  });

  it("returns [] for non-object args", function () {
    expect(collectCliOverrides(undefined)).to.deep.equal([]);
    expect(collectCliOverrides(null)).to.deep.equal([]);
  });

  it("reflects DOC_DETECTIVE_CONFIG / DOC_DETECTIVE_API and configPath", function () {
    const applied = collectProvenance({
      configPath: "/abs/.doc-detective.json",
      args: { input: "x" },
      env: { DOC_DETECTIVE_CONFIG: "{}", DOC_DETECTIVE_API: "{}" },
    });
    expect(applied.configPath).to.equal("/abs/.doc-detective.json");
    expect(applied.docDetectiveConfigApplied).to.equal(true);
    expect(applied.docDetectiveApiApplied).to.equal(true);
    expect(applied.cliOverrides.map((o) => o.flag)).to.deep.equal(["input"]);

    const none = collectProvenance({ configPath: null, args: {}, env: {} });
    expect(none.configPath).to.equal(null);
    expect(none.docDetectiveConfigApplied).to.equal(false);
    expect(none.docDetectiveApiApplied).to.equal(false);
    expect(none.cliOverrides).to.deep.equal([]);
  });

  it("treats empty-string env vars as NOT applied (matches getConfigFromEnv)", function () {
    // setConfig's env readers gate on `if (!process.env.*)`, so "" is unset.
    const p = collectProvenance({
      configPath: null,
      args: {},
      env: { DOC_DETECTIVE_CONFIG: "", DOC_DETECTIVE_API: "" },
    });
    expect(p.docDetectiveConfigApplied).to.equal(false);
    expect(p.docDetectiveApiApplied).to.equal(false);
  });
});

describe("debug/cache", function () {
  let collectCacheStatus;
  let prevCacheEnv;
  before(async function () {
    ({ collectCacheStatus } = await import("../dist/debug/cache.js"));
  });
  beforeEach(function () {
    // getCacheDir prefers DOC_DETECTIVE_CACHE_DIR over the passed config —
    // clear it so the config.cacheDir under test is honored.
    prevCacheEnv = process.env.DOC_DETECTIVE_CACHE_DIR;
    delete process.env.DOC_DETECTIVE_CACHE_DIR;
  });
  afterEach(function () {
    if (prevCacheEnv === undefined) delete process.env.DOC_DETECTIVE_CACHE_DIR;
    else process.env.DOC_DETECTIVE_CACHE_DIR = prevCacheEnv;
  });

  it("reports path / exists / writable for the resolved cache dirs", function () {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "dd-cache-status-"));
    try {
      const status = collectCacheStatus({ cacheDir: tmp });
      const labels = status.entries.map((e) => e.label);
      expect(labels).to.include.members([
        "cacheDir",
        "runtimeDir",
        "browsersDir",
        "installed.json",
        "APPIUM_HOME",
      ]);
      const cacheDir = status.entries.find((e) => e.label === "cacheDir");
      // getCacheDir created it, under the temp root, and it's writable.
      expect(cacheDir.path).to.equal(tmp);
      expect(cacheDir.exists).to.equal(true);
      expect(cacheDir.writable).to.equal(true);
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });

  it("reports writable=false for a non-writable cache dir (POSIX)", function () {
    // Root bypasses the directory write-bit, so a 0500 dir still passes
    // W_OK under UID 0 (common in CI containers) — skip there to keep the
    // test implementation-dependent rather than environment-dependent.
    if (
      process.platform === "win32" ||
      (typeof process.getuid === "function" && process.getuid() === 0)
    ) {
      this.skip();
    }
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "dd-cache-ro-"));
    try {
      fs.chmodSync(tmp, 0o500); // r-x, no write
      const status = collectCacheStatus({ cacheDir: tmp });
      const cacheDir = status.entries.find((e) => e.label === "cacheDir");
      expect(cacheDir.writable).to.equal(false);
    } finally {
      fs.chmodSync(tmp, 0o700);
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });
});

describe("debug/appium", function () {
  let registeredDriverPkgNames, collectAppiumDiagnostics;
  before(async function () {
    ({ registeredDriverPkgNames, collectAppiumDiagnostics } = await import(
      "../dist/debug/appium.js"
    ));
  });

  it("extracts driver pkgNames from an extensions.yaml manifest", function () {
    const manifest = [
      "drivers:",
      "  gecko:",
      "    pkgName: appium-geckodriver",
      "    version: 2.2.6",
      "  chromium:",
      "    pkgName: appium-chromium-driver",
      "    version: 2.2.5",
      "plugins: {}",
    ].join("\n");
    const names = registeredDriverPkgNames(manifest);
    expect(names).to.have.members([
      "appium-geckodriver",
      "appium-chromium-driver",
    ]);
  });

  it("falls back to the short key when an entry omits pkgName", function () {
    const names = registeredDriverPkgNames("drivers:\n  chromium:\n    version: 1");
    expect(names).to.deep.equal(["chromium"]);
  });

  it("returns [] for a manifest with no drivers map", function () {
    expect(registeredDriverPkgNames("plugins: {}")).to.deep.equal([]);
  });

  it("returns a drivers array and degrades cleanly when appium is absent", function () {
    // No subprocess any more — pure fs reads against a cacheDir with no
    // appium install; must not throw and must classify each known driver.
    const diag = collectAppiumDiagnostics({
      cacheDir: path.join(os.tmpdir(), "dd-no-appium-xyz"),
    });
    expect(diag.drivers.map((d) => d.name)).to.include.members([
      "appium-chromium-driver",
      "appium-geckodriver",
    ]);
    for (const d of diag.drivers) {
      // registered is tri-state: true / false / null (manifest unread).
      expect(d.registered === null || typeof d.registered === "boolean").to.equal(
        true
      );
      expect(d).to.have.property("npmResolvable").that.is.a("boolean");
    }
    expect(diag).to.have.property("registeredDrivers").that.is.an("array");
  });
});

describe("debug/findings", function () {
  let computeFindings;
  before(async function () {
    ({ computeFindings } = await import("../dist/debug/findings.js"));
  });

  // Minimal DebugData skeleton; each test overrides only what its rule reads.
  function baseData(overrides) {
    return {
      browsers: { browsers: [] },
      appium: { drivers: [] },
      install: { rows: [] },
      cache: { entries: [] },
      network: { variables: [] },
      docDetective: {},
      ...overrides,
    };
  }

  it("flags Chrome unavailable with a missing chromium driver", function () {
    const findings = computeFindings(
      baseData({
        browsers: {
          browsers: [{ name: "chrome", supported: true, available: false }],
        },
        appium: {
          drivers: [
            { name: "appium-chromium-driver", registered: false, npmResolvable: false },
          ],
        },
      })
    );
    const chrome = findings.find((f) => /Chrome is not available/.test(f.title));
    expect(chrome).to.not.equal(undefined);
    expect(chrome.severity).to.equal("error");
    expect(chrome.fix).to.equal("doc-detective install runtime");
  });

  it("tailors the Chrome-unavailable detail to the driver's known state", function () {
    const chromeDown = (driver) =>
      computeFindings(
        baseData({
          browsers: {
            browsers: [{ name: "chrome", supported: true, available: false }],
          },
          appium: { extensionsManifestPresent: true, drivers: driver ? [driver] : [] },
        })
      ).find((f) => /Chrome is not available/.test(f.title));

    // Missing driver (not resolvable).
    expect(
      chromeDown({ name: "appium-chromium-driver", registered: false, npmResolvable: false }).detail
    ).to.match(/is missing/);
    // Installed but confirmed unregistered.
    expect(
      chromeDown({ name: "appium-chromium-driver", registered: false, npmResolvable: true }).detail
    ).to.match(/installed but not registered/);
    // Installed, registration unknown (manifest absent → registered null).
    expect(
      chromeDown({ name: "appium-chromium-driver", registered: null, npmResolvable: true }).detail
    ).to.match(/registration is unknown/);
  });

  it("does NOT flag Chrome when it is available", function () {
    const findings = computeFindings(
      baseData({
        browsers: {
          browsers: [{ name: "chrome", supported: true, available: true }],
        },
      })
    );
    expect(findings.find((f) => /Chrome/.test(f.title))).to.equal(undefined);
  });

  it("flags an outdated install and an unregistered-but-resolvable driver", function () {
    const findings = computeFindings(
      baseData({
        install: {
          rows: [{ assetId: "webdriverio", kind: "npm", installed: true, outdated: true }],
        },
        appium: {
          // Registration is only KNOWN when the manifest was read.
          extensionsManifestPresent: true,
          drivers: [
            { name: "appium-geckodriver", registered: false, npmResolvable: true },
          ],
        },
      })
    );
    expect(findings.find((f) => /stale/i.test(f.title))).to.not.equal(undefined);
    const stranded = findings.find((f) => /not registered/i.test(f.title));
    expect(stranded).to.not.equal(undefined);
    expect(stranded.fix).to.equal("doc-detective install runtime");
  });

  it("does NOT flag unregistered drivers when the manifest is absent", function () {
    // This is the regression that prompted the rewrite: a missing/unreadable
    // manifest must not be treated as "not registered".
    const findings = computeFindings(
      baseData({
        appium: {
          extensionsManifestPresent: false,
          // Manifest unread → registration is null (unknown), not false.
          drivers: [
            { name: "appium-geckodriver", registered: null, npmResolvable: true },
            { name: "appium-chromium-driver", registered: null, npmResolvable: true },
          ],
        },
      })
    );
    expect(findings.find((f) => /not registered/i.test(f.title))).to.equal(
      undefined
    );
  });

  it("flags an npm-only proxy (npm_config_proxy) with missing runtime packages", function () {
    const findings = computeFindings(
      baseData({
        network: { variables: [{ name: "npm_config_proxy", value: "http://p:8080" }] },
        install: {
          rows: [{ assetId: "webdriverio", kind: "npm", installed: false, outdated: false }],
        },
      })
    );
    expect(findings.find((f) => /proxy/i.test(f.title))).to.not.equal(undefined);
  });

  it("flags a non-writable cacheDir", function () {
    const findings = computeFindings(
      baseData({
        cache: { entries: [{ label: "cacheDir", path: "/ro", writable: false }] },
      })
    );
    const finding = findings.find((f) => /not writable/i.test(f.title));
    expect(finding).to.not.equal(undefined);
    expect(finding.fix).to.match(/DOC_DETECTIVE_CACHE_DIR/);
  });

  it("returns no findings for clean data", function () {
    const findings = computeFindings(
      baseData({
        browsers: {
          browsers: [{ name: "chrome", supported: true, available: true }],
        },
      })
    );
    expect(findings).to.deep.equal([]);
  });
});

describe("debug/printDebug new sections end-to-end", function () {
  let printDebug;
  before(async function () {
    ({ printDebug } = await import("../dist/debug/index.js"));
  });

  it("renders the new sections, with Findings first", async function () {
    this.timeout(60000);
    const out = [];
    await printDebug({
      config: { input: ".", logLevel: "info", environment: { platform: "linux" } },
      configPath: null,
      args: { input: ".", dryRun: true },
      print: (line) => out.push(line),
    });
    const text = out.join("\n");
    expect(text).to.include("-- Findings / next steps ");
    expect(text).to.include("-- Install status ");
    expect(text).to.include("-- Appium registration ");
    expect(text).to.include("-- Cache & runtime ");
    expect(text).to.include("-- Proxy / npm network ");
    expect(text).to.include("-- Config provenance ");
    // Findings is the first section, before System.
    expect(text.indexOf("-- Findings / next steps ")).to.be.lessThan(
      text.indexOf("-- System ")
    );
    // Provenance reflects the args we passed (real CLI spelling).
    expect(text).to.match(/--dry-run → config\.dryRun/);
  });
});
