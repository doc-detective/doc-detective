// 4.x warnings about what 5.0 changes or removes (ADR 01147). Spawns the real
// CLI, because the contract is about the streams and the exit code.
import { spawnSync } from "node:child_process";
import path from "node:path";
import fs from "node:fs";
import os from "node:os";
import { pathToFileURL } from "node:url";
import {
  browsersDirWarnings,
  commandWarnings,
  configWarnings,
  envWarnings,
  legacyEnv,
  flagWarnings,
  namesFolder,
  runResultWarnings,
  specWarnings,
} from "../dist/upgradeNotice.js";

before(async function () {
  const { expect } = await import("chai");
  global.expect = expect;
});

const URL = "https://docs.doc-detective.com/docs/ci/upgrade-to-v5";
const ACTION_META = JSON.stringify({ dist_interface: "github-actions" });

function run(script, args, { env = {}, cwd, timeout = 60000, unset = [], nodeArgs = [] } = {}) {
  const { DOC_DETECTIVE, DOC_DETECTIVE_CONFIG, DOC_DETECTIVE_API, DOC_DETECTIVE_META, ...hostEnv } = process.env;
  for (const key of unset) delete hostEnv[key];
  return spawnSync(process.execPath, [...nodeArgs, path.resolve(script), ...args], {
    env: { ...hostEnv, DOC_DETECTIVE_SKIP_AUTO_UPDATE: "1", CI: "1", ...env },
    encoding: "utf8",
    cwd,
    timeout,
  });
}
const runCli = (args, opts) => run("bin/doc-detective.js", args, opts);

describe("upgrade warnings", function () {
  this.timeout(90000);
  let dir;
  const FAILING_SPEC = {
    tests: [{ steps: [{ httpRequest: { url: "http://127.0.0.1:1/nope", statusCodes: [200] } }] }],
  };
  const PASSING_SPEC = { tests: [{ steps: [{ wait: 10 }] }] };
  const spec = (name, body) => {
    const p = path.join(dir, name);
    fs.writeFileSync(p, JSON.stringify(body));
    return p;
  };
  const out = () => path.join(dir, "out.json");
  const empty = () => fs.mkdtempSync(path.join(dir, "empty-"));

  beforeEach(function () {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), "dd-upgrade-"));
  });
  afterEach(function () {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  describe("failed specs", function () {
    it("warns on stderr and still exits 0 when exitOnFail wasn't set", function () {
      const r = runCli(["--input", spec("f.spec.json", FAILING_SPEC), "--output", out()]);
      expect(r.status).to.equal(0);
      expect(r.stderr).to.include("exit 1").and.include(URL);
      expect(r.stdout).to.not.include(URL);
    });

    it("stays quiet with --exit-on-fail, and exits 1", function () {
      const r = runCli(["--input", spec("f.spec.json", FAILING_SPEC), "--output", out(), "--exit-on-fail"]);
      expect(r.status).to.equal(1);
      expect(r.stderr).to.not.include(URL);
    });

    it("stays quiet with --no-exit-on-fail", function () {
      const r = runCli(["--input", spec("f.spec.json", FAILING_SPEC), "--output", out(), "--no-exit-on-fail"]);
      expect(r.status).to.equal(0);
      expect(r.stderr).to.not.include(URL);
    });

    it("stays quiet with exitOnFail set in a config file", function () {
      const config = spec("config.json", { exitOnFail: false });
      const r = runCli(["--config", config, "--input", spec("f.spec.json", FAILING_SPEC), "--output", out()]);
      expect(r.stderr).to.not.include(URL);
    });

    it("stays quiet at logLevel silent", function () {
      const r = runCli(["--input", spec("f.spec.json", FAILING_SPEC), "--output", out(), "--logLevel", "silent"]);
      expect(r.stderr).to.not.include(URL);
    });

    it("stays quiet in the Action's legacy path", function () {
      const r = runCli(["--input", spec("f.spec.json", FAILING_SPEC), "--output", out()], {
        env: { DOC_DETECTIVE_META: ACTION_META },
      });
      expect(r.status).to.equal(0);
      expect(r.stderr).to.not.include(URL);
    });
  });

  it("a passing run with a results file stays quiet", function () {
    const r = runCli(["--input", spec("p.spec.json", PASSING_SPEC), "--output", out()]);
    expect(r.status).to.equal(0);
    expect(r.stderr).to.not.include(URL);
  });

  describe("a run that tested nothing", function () {
    it("warns and still exits 0, even with --exit-on-fail", function () {
      for (const flags of [[], ["--exit-on-fail"]]) {
        const r = runCli(["--input", empty(), "--output", out(), ...flags]);
        expect(r.status).to.equal(0);
        expect(r.stderr).to.include("exit 2").and.include(URL);
        expect(r.stderr).to.match(/make sure your inputs always find tests/i);
      }
    });

    it("stays quiet with --no-exit-on-fail", function () {
      const r = runCli(["--input", empty(), "--output", out(), "--no-exit-on-fail"]);
      expect(r.stderr).to.not.include(URL);
    });
  });

  describe("output that names a folder", function () {
    it("warns for a --output folder", function () {
      const r = runCli(["--input", spec("p.spec.json", PASSING_SPEC), "--output", dir]);
      expect(r.stderr).to.include("--output-dir").and.include(URL);
      expect(r.stderr).to.include("without a file extension");
    });

    it("warns for an output folder from a config file", function () {
      const config = spec("config.json", { output: dir });
      const r = runCli(["--config", config, "--input", spec("p.spec.json", PASSING_SPEC)], { cwd: dir });
      expect(r.stderr).to.include("--output-dir");
    });

    it("stays quiet when output wasn't set", function () {
      const r = runCli(["--input", spec("p.spec.json", PASSING_SPEC)], { cwd: dir });
      expect(r.stderr).to.not.include("--output-dir");
    });

    it("keeps --dry-run stdout parseable as JSON", function () {
      const r = runCli(["--input", spec("p.spec.json", PASSING_SPEC), "--output", dir, "--dry-run"]);
      expect(r.status).to.equal(0);
      expect(() => JSON.parse(r.stdout)).to.not.throw();
      expect(r.stderr).to.include("--output-dir");
    });
  });

  describe("--concurrent-runners", function () {
    it("warns with no value", function () {
      const r = runCli(["--input", spec("p.spec.json", PASSING_SPEC), "--output", out(), "--concurrent-runners"]);
      expect(r.stderr).to.include("--concurrent-runners").and.include(URL);
    });

    it("stays quiet with a value", function () {
      const r = runCli(["--input", spec("p.spec.json", PASSING_SPEC), "--output", out(), "--concurrent-runners", "2"]);
      expect(r.stderr).to.not.include(URL);
    });
  });

  describe("install commands", function () {
    const agents = ["--dry-run", "--agent", "claude", "--scope", "project"];

    it("warns on install-agents", function () {
      const r = runCli(["install-agents", ...agents]);
      expect(r.status).to.equal(0);
      expect(r.stderr).to.include("install agents").and.include(URL);
    });

    it("warns on -a and -s", function () {
      const r = runCli(["install", "agents", "--dry-run", "-a", "claude", "-s", "project"]);
      expect(r.stderr).to.include("--agent").and.include(URL);
    });

    it("warns on install --silent", function () {
      const r = runCli(["install", "status", "--silent"]);
      expect(r.stderr).to.include("--quiet").and.include(URL);
    });

    it("warns once, not once per nested command", function () {
      const r = runCli(["install", "status", "--silent"]);
      expect(r.stderr.split(URL).length - 1).to.equal(1);
    });

    it("stays quiet on the forms that keep working", function () {
      const a = runCli(["install", "agents", ...agents]);
      const b = runCli(["install", "status", "--quiet"]);
      expect(a.stderr + b.stderr).to.not.include(URL);
    });

    it("stays quiet at logLevel silent and in the Action", function () {
      const a = runCli(["install-agents", ...agents, "--logLevel", "silent"]);
      const b = runCli(["install-agents", ...agents], { env: { DOC_DETECTIVE_META: ACTION_META } });
      expect(a.stderr + b.stderr).to.not.include(URL);
    });

    it("stays quiet on --help", function () {
      const r = runCli(["install-agents", "--help"]);
      expect(r.stderr).to.not.include(URL);
    });
  });

  describe("removed bins", function () {
    it("warns on doc-detective-lsp, on stderr only", function () {
      // stdin closes right away, so the server exits on its own.
      const r = run("bin/doc-detective-lsp.js", ["--stdio"], { timeout: 5000 });
      expect(r.stderr).to.include("doc-detective lsp").and.include(URL);
      expect(r.stdout).to.not.include(URL);
    });

    it("doesn't warn on doc-detective-runner, which only hosted images call", function () {
      const source = fs.readFileSync(path.resolve("bin/runner-entrypoint.js"), "utf8");
      expect(source).to.not.include("upgradeNotice");
    });

    it("stays quiet in the Action", function () {
      const r = run("bin/doc-detective-lsp.js", ["--stdio"], { env: { DOC_DETECTIVE_META: ACTION_META }, timeout: 5000 });
      expect(r.stderr).to.not.include(URL);
    });
  });

  describe("setup rows", function () {
    it("DOC_DETECTIVE with a config object", function () {
      expect(envWarnings({ DOC_DETECTIVE: '{"config":{"logLevel":"debug"}}' }, {})[0]).to.include(
        "`DOC_DETECTIVE_CONFIG`"
      );
      expect(envWarnings({ DOC_DETECTIVE: '{"version":"4.0.0"}' }, {})).to.deep.equal([]);
      expect(envWarnings({ DOC_DETECTIVE: "not json" }, {})).to.deep.equal([]);
    });

    it("DOC_DETECTIVE container outside the official images, unless allowUnsafeSteps is set", function () {
      const env = { DOC_DETECTIVE: '{"container":"acme/docs-ci"}' };
      expect(envWarnings(env, {})[0]).to.include("`allowUnsafeSteps: true`");
      expect(envWarnings({ DOC_DETECTIVE: '{"container":true}' }, {})).to.have.length(1);
      expect(envWarnings(env, { allowUnsafeSteps: false })).to.deep.equal([]);
      expect(envWarnings(env, { allowUnsafeSteps: true })).to.deep.equal([]);
      // The official images set this value themselves, and their 5.0 builds allow unsafe steps in config.
      for (const os of ["linux", "windows"]) {
        const official = { DOC_DETECTIVE: `{"container":"docdetective/docdetective:${os}","version":"4.41.5"}` };
        expect(envWarnings(official, {})).to.deep.equal([]);
      }
    });

    it("the official images' DOC_DETECTIVE value matches what the Dockerfiles set", function () {
      for (const os of ["linux", "windows"]) {
        const dockerfile = fs.readFileSync(path.resolve("src", "container", `${os}.Dockerfile`), "utf8");
        expect(dockerfile).to.include(`DOC_DETECTIVE='{"container": "docdetective/docdetective:${os}"`);
      }
    });

    it("browsers from a legacy browser-snapshots folder", function () {
      expect(browsersDirWarnings(path.join(dir, "browser-snapshots"))[0]).to.include("`cacheDir`");
      expect(browsersDirWarnings(path.join(dir, "browsers"))).to.deep.equal([]);
    });

    it("more than one reporter after -r, or a repeated -r", function () {
      // 4.x reads `-r terminal,html` as one unknown reporter, so the comma form waits for 5.0.
      const [message] = flagWarnings({ reporters: ["terminal", "html"] });
      expect(message).to.include("`-r terminal,html`").and.include("when you upgrade").and.include("`reporters`");
      expect(message).to.not.include("which works today");
      expect(flagWarnings({ reporters: ["terminal"] })).to.deep.equal([]);
    });

    it("a repeated -t or -s", function () {
      // The fix joins the user's own values, so it can be pasted as is.
      const [test, spec] = flagWarnings({ test: ["a", "b"], spec: ["foo", "bar"] });
      expect(test).to.include("`--test a,b`");
      expect(spec).to.include("`--spec foo,bar`");
      expect(flagWarnings({ test: "a,b", spec: "c" })).to.deep.equal([]);
      expect(flagWarnings({ test: [], spec: ["c"] })).to.deep.equal([]);
    });

    it("a DOC_DETECTIVE_* boolean whose meaning flips, or that 5.0 won't read", function () {
      const [flip] = envWarnings({ DOC_DETECTIVE_SKIP_AUTO_UPDATE: "false" }, {});
      expect(flip).to.include("on today and off in Doc Detective 5.0");
      expect(envWarnings({ DOC_DETECTIVE_RUNTIME_DEBUG: "true" }, {})[0]).to.include("off today and on");
      expect(envWarnings({ DOC_DETECTIVE_DEBUG: "maybe" }, {})[0]).to.include("doesn't accept");
      expect(envWarnings({ DOC_DETECTIVE_ALLOW_LOCAL_URLS: "1" }, {})[0]).to.include("`true` for on");
      expect(envWarnings({ DOC_DETECTIVE_AUTOINSTALL: "2" }, {})[0]).to.include("Set it to `1` for on, or `0` for off");
      // 5.0 trims a blank value to empty, which is off.
      expect(envWarnings({ DOC_DETECTIVE_SKIP_AUTO_UPDATE: " " }, {})[0]).to.include("on today and off in Doc Detective 5.0");
      const same = {
        DOC_DETECTIVE_SKIP_AUTO_UPDATE: "1",
        DOC_DETECTIVE_DEBUG: "0",
        DOC_DETECTIVE_RUNTIME_DEBUG: "1",
        DOC_DETECTIVE_ALLOW_LOCAL_URLS: "true",
        DOC_DETECTIVE_REUSE_APPIUM: "true",
        DOC_DETECTIVE_NO_ANDROID_AUTOINSTALL: "",
        DOC_DETECTIVE_AUTOINSTALL: "off",
        DOC_DETECTIVE_CACHE_DIR: "no",
      };
      expect(envWarnings(same, {})).to.deep.equal([]);
    });

    it("an empty DOC_DETECTIVE_* boolean, which only DOC_DETECTIVE_AUTOINSTALL reads as on today", function () {
      // Common from `${{ inputs.x || '' }}` in CI.
      expect(envWarnings({ DOC_DETECTIVE_AUTOINSTALL: "" }, {})[0])
        .to.include("`DOC_DETECTIVE_AUTOINSTALL`")
        .and.include("on today and off in Doc Detective 5.0");
      const empty = {
        DOC_DETECTIVE_DEBUG: "",
        DOC_DETECTIVE_SKIP_AUTO_UPDATE: "",
        DOC_DETECTIVE_SKIP_AGENT_PROMPT: "",
        DOC_DETECTIVE_RUNTIME_DEBUG: "",
        DOC_DETECTIVE_NO_ANDROID_AUTOINSTALL: "",
        DOC_DETECTIVE_REUSE_APPIUM: "",
        DOC_DETECTIVE_ALLOW_LOCAL_URLS: "",
      };
      expect(envWarnings(empty, {})).to.deep.equal([]);
    });

    it("legacyEnv reads only a JSON object", function () {
      expect(legacyEnv({ DOC_DETECTIVE: '{"container":"x"}' })).to.deep.equal({ container: "x" });
      for (const value of ["[1]", "null", "3", "not json", undefined]) {
        expect(legacyEnv({ DOC_DETECTIVE: value })).to.deep.equal({});
      }
    });

    it("reporters that aren't exact public names", function () {
      expect(configWarnings({ reporters: ["JSON", "terminal"] })[0]).to.include("'JSON'");
      expect(configWarnings({ reporters: ["plainReporter"] })[0]).to.include("'plainReporter'");
      expect(configWarnings({ reporters: ["terminal", "json", "html", "runFolder", "junit", "markdown"] })).to.deep.equal([]);
      // `-r terminal,html` lands here comma-joined, and it's the form 5.0 wants.
      expect(configWarnings({ reporters: ["terminal,html"] })).to.deep.equal([]);
      expect(configWarnings({ reporters: ["terminal,JSON"] })[0]).to.include("'JSON'");
      // 4.x can't use beforeAll, and 5.0 still reads beforeAny.
      expect(configWarnings({ beforeAny: "setup.spec.json" })).to.deep.equal([]);
    });

    it("prints them from the CLI", function () {
      const config = spec("config.json", { reporters: ["JSON"] });
      const r = runCli(
        ["--config", config, "--input", spec("p.spec.json", PASSING_SPEC), "--dry-run", "-t", "a", "-t", "b"],
        { env: { DOC_DETECTIVE: '{"config":{}}', DOC_DETECTIVE_SKIP_AUTO_UPDATE: "no" } }
      );
      expect(r.status).to.equal(0);
      for (const text of ["`DOC_DETECTIVE_CONFIG`", "`DOC_DETECTIVE_SKIP_AUTO_UPDATE`", "`--test a,b`", "'JSON'"]) {
        expect(r.stderr).to.include(text);
      }
      expect(() => JSON.parse(r.stdout)).to.not.throw();
    });

    it("prints the browser-snapshots row from the CLI", function () {
      fs.mkdirSync(path.join(dir, "browser-snapshots"));
      const r = runCli(["--input", spec("p.spec.json", PASSING_SPEC), "--dry-run"], {
        cwd: dir,
        unset: ["DOC_DETECTIVE_CACHE_DIR"],
      });
      expect(r.stderr).to.include("browser-snapshots").and.include(URL);
    });
  });

  describe("spec rows", function () {
    const resolved = (steps, test = {}) => ({
      specs: [{ contentPath: path.resolve("docs", "a.spec.json"), tests: [{ ...test, contexts: [{ steps }] }] }],
    });
    const warns = (steps, test) => specWarnings(resolved(steps, test));

    it("routing a step or test can't perform", function () {
      expect(warns([{ wait: 1, onFail: [{ stop: "spec" }] }])[0]).to.include('`stop: "spec"`');
      expect(warns([{ wait: 1, onPass: [{ stop: "run" }] }])[0]).to.include('`stop: "run"`');
      expect(warns([{ wait: 1, onFail: [{ goToTest: "t2" }] }])[0]).to.include("`goToTest`");
      expect(warns([{ wait: 1 }], { onFail: [{ stop: "run" }] })[0]).to.include('`stop: "run"`');
      expect(warns([{ wait: 1 }], { onFail: [{ retry: { limit: 1 } }] })[0]).to.include("`retry`");
      expect(warns([{ wait: 1 }], { onWarning: [{ goToStep: "s1" }] })[0]).to.include("`goToStep`");
      expect(
        warns([{ wait: 1, onSkip: [{ retry: { limit: 1 } }], onFail: [{ stop: "test" }, { goToStep: "s1" }] }], {
          onFail: [{ stop: "spec" }, { goToTest: "t2" }],
        })
      ).to.deep.equal([]);
    });

    it("names the spec file", function () {
      expect(warns([{ screenshot: false }])[0]).to.include(`'${path.join("docs", "a.spec.json")}'`);
    });

    it("a boolean click", function () {
      expect(warns([{ click: true }])[0]).to.include('`"click": "true"`');
      const off = warns([{ click: false }]);
      expect(off).to.have.length(1);
      expect(off[0]).to.include("`\"click\": \"false\"`, which works today. If you don't want a click, remove the step.");
      expect(warns([{ click: "true" }, { find: { selector: "#a", click: true } }])).to.deep.equal([]);
    });

    it("an edge surface, and removed device keys", function () {
      expect(warns([{ startSurface: { browser: "edge" } }])[0]).to.include('`browser: "edge"`');
      expect(warns([{ closeSurface: [{ browser: "edge" }] }])).to.have.length(1);
      const device = { app: "com.example", device: { platform: "android", orientation: "landscape" } };
      expect(warns([{ startSurface: device }])[0]).to.include("`orientation`");
      expect(warns([{ startSurface: { browser: "chrome" } }, { closeSurface: "main" }])).to.deep.equal([]);
      // A string names a device.
      expect(warns([{ startSurface: { app: "com.example", device: "Pixel 7" } }])).to.deep.equal([]);
    });

    it("timeout 0 on operations, and negative durations", function () {
      const [zero] = warns([{ runShell: { command: "echo", timeout: 0 } }]);
      expect(zero).to.include("`timeout: 0`").and.include("Locator and wait timeouts can still be 0");
      // 4.x has no checkLink timeout to set to 0.
      expect(zero).to.not.include("checkLink");
      expect(warns([{ checkLink: { url: "https://a.b", timeout: 0 } }])).to.deep.equal([]);
      expect(warns([{ startSurface: { process: "npm", name: "p", timeout: 0 } }])).to.have.length(1);
      expect(warns([{ wait: -1 }])[0]).to.include("negative `wait`");
      expect(warns([{ type: { keys: "a", inputDelay: -5 } }])[0]).to.include("negative `inputDelay`");
      expect(
        warns([{ runShell: { command: "echo", timeout: 1 } }, { find: { selector: "#a", timeout: 0 } }, { wait: 0 }])
      ).to.deep.equal([]);
    });

    it("doesn't read user data as durations", function () {
      expect(
        warns([
          { httpRequest: { url: "https://a.b", request: { body: { timeout: -1 } } } },
          { httpRequest: { url: "https://a.b", response: { body: { wait: -1 } } } },
          { find: { elementAttribute: { "data-delay": -100 } } },
        ])
      ).to.deep.equal([]);
    });

    it("screenshot: false", function () {
      expect(warns([{ screenshot: false }])[0]).to.include("`screenshot: true`");
      expect(warns([{ screenshot: true }])).to.deep.equal([]);
    });

    it("find.click that isn't a boolean, a button, or {button, duration}", function () {
      expect(warns([{ find: { selector: "#a", click: "Submit" } }])[0]).to.include("`find.click`");
      expect(warns([{ find: { selector: "#a", click: { button: "left", selector: "#b" } } }])).to.have.length(1);
      expect(
        warns([
          { find: { selector: "#a", click: "right" } },
          { find: { selector: "#a", click: { button: "left", duration: 500 } } },
        ])
      ).to.deep.equal([]);
    });

    it("find.type with its own locator", function () {
      expect(warns([{ find: { selector: "#a", type: { keys: "x", selector: "#b" } } }])[0]).to.include("`find.type`");
      expect(warns([{ find: { selector: "#a", type: { keys: "x" } } }, { find: { selector: "#a", type: "x" } }])).to.deep.equal([]);
    });

    it("goTo and httpRequest URLs 5.0 won't accept", function () {
      expect(warns([{ goTo: "$URL/docs" }])[0]).to.include("`$URL/docs`");
      const five = warns([0, 1, 2, 3, 4].map((n) => ({ goTo: `$BASE/p${n}` })));
      expect(five).to.have.length(1);
      expect(five[0]).to.include("`$BASE/p0` and 4 more");
      expect(warns([{ httpRequest: { url: "$API/users" } }])).to.have.length(1);
      expect(
        warns([{ goTo: "$URL" }, { goTo: "/docs" }, { goTo: { url: "https://example.com" } }, { httpRequest: "http://a.b" }])
      ).to.deep.equal([]);
    });

    it("a cookie path with a slash that doesn't end in .txt", function () {
      expect(warns([{ saveCookie: "auth/session" }])[0]).to.include("`.txt`");
      expect(warns([{ loadCookie: "auth/session.json" }])).to.have.length(1);
      expect(warns([{ saveCookie: "a/one" }, { saveCookie: "a/two" }])[0]).to.include("`a/one` and 1 more");
      expect(warns([{ saveCookie: "auth/session.txt" }, { loadCookie: "session" }])).to.deep.equal([]);
    });

    it('an app with workingDirectory: "."', function () {
      expect(warns([{ startSurface: { app: "notepad", workingDirectory: "." } }])[0]).to.include('`workingDirectory: "."`');
      expect(warns([{ startSurface: [{ app: "notepad", workingDirectory: "C:\\work" }] }])).to.deep.equal([]);
      expect(warns([{ startSurface: { app: null, workingDirectory: "." } }])).to.deep.equal([]);
    });

    it("prints them from the CLI, also with --dry-run", function () {
      const file = spec("s.spec.json", { tests: [{ steps: [{ wait: 1 }, { screenshot: false }] }] });
      const r = runCli(["--input", file, "--dry-run"]);
      expect(r.stderr).to.include("`screenshot: true`").and.include("s.spec.json").and.include(URL);
      expect(() => JSON.parse(r.stdout)).to.not.throw();
    });

    it("doesn't fail a run on a string device", function () {
      const file = spec("d.spec.json", { tests: [{ steps: [{ startSurface: { app: "com.example", device: "Pixel 7" } }] }] });
      const r = runCli(["--input", file, "--dry-run"]);
      expect(r.status).to.equal(0);
      expect(() => JSON.parse(r.stdout)).to.not.throw();
    });

    it("doesn't fail a run when a check throws", function () {
      // Rewrite the built specWarnings to throw, through a module load hook.
      const hook = path.join(dir, "hook.mjs");
      fs.writeFileSync(
        hook,
        `import { registerHooks } from "node:module";
registerHooks({ load(url, ctx, next) {
  const result = next(url, ctx);
  if (!url.endsWith("/dist/upgradeNotice.js")) return result;
  const source = String(result.source).replace(
    "export function specWarnings(resolvedTests) {",
    'export function specWarnings(resolvedTests) { throw new Error("check failed");'
  );
  return { ...result, source };
} });
`
      );
      const file = spec("p.spec.json", PASSING_SPEC);
      const r = run("bin/doc-detective.js", ["--input", file, "--output", out(), "--logLevel", "debug"], {
        nodeArgs: ["--import", pathToFileURL(hook).href],
      });
      expect(r.status).to.equal(0);
      expect(r.stdout + r.stderr).to.include("check failed");
      expect(JSON.parse(fs.readFileSync(out(), "utf8")).summary.specs.pass).to.equal(1);
    });

    it("stays quiet when DOC_DETECTIVE sets logLevel silent", function () {
      const file = spec("s.spec.json", { tests: [{ steps: [{ wait: -1 }] }] });
      const env = { DOC_DETECTIVE: '{"config":{"logLevel":"silent"}}' };
      for (const flags of [["--output", out()], ["--dry-run"]]) {
        const r = runCli(["--input", file, ...flags], { env });
        expect(r.status).to.equal(0);
        expect(r.stderr).to.not.include("negative `wait`");
      }
      // The same spec warns without the override.
      expect(runCli(["--input", file, "--dry-run"]).stderr).to.include("negative `wait`");
    });
  });

  describe("helpers", function () {
    it("namesFolder: trailing slash, existing folder, or no extension", function () {
      expect(namesFolder("results/", path.resolve("results"))).to.equal(true);
      expect(namesFolder(dir, dir)).to.equal(true);
      expect(namesFolder("results", path.resolve("results"))).to.equal(true);
      expect(namesFolder("results.json", path.resolve("results.json"))).to.equal(false);
      expect(namesFolder("junit.xml", path.resolve("junit.xml"))).to.equal(false);
      expect(namesFolder(undefined, path.resolve("."))).to.equal(false);
    });

    it("commandWarnings doesn't take a flag's value for a command", function () {
      expect(commandWarnings(["install", "status"], ["install", "status", "--cache-dir", "-a"], false)).to.deep.equal([]);
      expect(commandWarnings(["install", "agents"], ["install", "agents", "--agent", "claude"], false)).to.deep.equal([]);
      expect(commandWarnings(["install", "agents"], ["install", "agents", "-sy", "project"], false)).to.have.length(1);
      // Only the agents command has -a and -s.
      expect(commandWarnings([], ["-a"], false)).to.deep.equal([]);
    });

    it("commandWarnings reads --silent from the raw arguments, not a parsed key", function () {
      expect(commandWarnings(["install", "status"], ["install", "status", "--silent"])).to.have.length(1);
      expect(commandWarnings(["install", "status"], ["install", "status", "--quiet"])).to.deep.equal([]);
    });

    it("runResultWarnings doesn't suggest --no-exit-on-fail to an --exit-on-fail user", function () {
      expect(runResultWarnings(true, false, null)[0]).to.not.include("--no-exit-on-fail");
      expect(runResultWarnings(undefined, false, null)[0]).to.include("--no-exit-on-fail");
    });

    it("runResultWarnings counts a zero-spec summary as nothing tested", function () {
      const summary = (fail = 0, pass = 0) => ({ summary: { specs: { pass, fail, warning: 0, skipped: 0 } } });
      expect(runResultWarnings(undefined, false, null)).to.have.length(1);
      expect(runResultWarnings(undefined, false, summary())).to.have.length(1);
      expect(runResultWarnings(undefined, false, summary(0, 1))).to.deep.equal([]);
      expect(runResultWarnings(undefined, true, summary(1))).to.have.length(1);
      expect(runResultWarnings(true, true, summary(1))).to.deep.equal([]);
      expect(runResultWarnings(true, false, null)).to.have.length(1);
      expect(runResultWarnings(false, false, null)).to.deep.equal([]);
      // A malformed summary isn't evidence of an empty run.
      expect(runResultWarnings(undefined, false, {})).to.deep.equal([]);
    });
  });
});
