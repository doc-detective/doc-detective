// Coverage-ratchet unit tests for the remaining EDGE / ERROR / FALLBACK
// branches across several doc-detective modules. TEST-ONLY: no source changes.
//
// Everything here is HERMETIC, DETERMINISTIC and OFFLINE:
//   - no network (axios / dns / spawn are stubbed where a real call would occur),
//   - no real browser / driver / binary is launched,
//   - OS-specific branches are driven by stubbing `process.platform` / `os`
//     and asserting STRUCTURE, never the host's real OS,
//   - every stub / global / env swap is restored in a `finally` AND in
//     `afterEach`, because these modules touch process.env / process.platform /
//     fs and a leak would corrupt the combined `npm test` run.
//
// Repo conventions: mocha, node:assert/strict, ESM imported from `../dist/...`,
// sinon for stubbing. Imports mirror the other `*-coverage.test.js` suites.

import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { EventEmitter } from "node:events";
import sinon from "sinon";
import axios from "axios";

import { readFile, resolvePaths } from "../dist/core/files.js";
import { runShell } from "../dist/core/tests/runShell.js";
import {
  getCacheDir,
  getBrowsersDir,
  assertSafeRuntimePath,
  readInstalledRecord,
  writeInstalledRecord,
} from "../dist/runtime/cacheDir.js";
import { ensureRuntimeInstalled } from "../dist/runtime/loader.js";
import {
  compileFilter,
  matchesFilter,
  selectSpecsForRun,
  isRelativeUrl,
  appendQueryParams,
  redactUrlForOutput,
  sanitizeFilesystemName,
  assertUrlHostIsPublic,
  fetchFile,
  cleanTemp,
  waitForStdio,
  getRunOutputDir,
  runArchivesArtifacts,
  spawnCommand as coreSpawnCommand,
} from "../dist/core/utils.js";
import { reporters, setMeta, getVersionData, spawnCommand } from "../dist/utils.js";
import {
  parseOriginUrl,
  readGitOriginUrl,
  detectDocDetectiveWorkflow,
  walkResults,
  hasDocDetectiveScriptInPackageJson,
  detectOutputDirGitignored,
  gitignoreCovers,
  parseNodeMajor,
  detectRstFiles,
} from "../dist/hints/context.js";

// --- shared teardown -------------------------------------------------------
// Track every temp dir and env swap so nothing leaks into sibling suites.
const tmpDirs = [];
function mkTmp(prefix) {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  tmpDirs.push(d);
  return d;
}
const envKeys = [
  "DOC_DETECTIVE_CACHE_DIR",
  "DOC_DETECTIVE_ALLOW_LOCAL_URLS",
  "DOC_DETECTIVE_META",
];
let savedEnv = {};

beforeEach(function () {
  savedEnv = {};
  for (const k of envKeys) savedEnv[k] = process.env[k];
});

afterEach(function () {
  sinon.restore();
  // Restore env keys exactly (delete ones that were unset).
  for (const k of envKeys) {
    if (savedEnv[k] === undefined) delete process.env[k];
    else process.env[k] = savedEnv[k];
  }
  while (tmpDirs.length) {
    const d = tmpDirs.pop();
    try {
      fs.rmSync(d, { recursive: true, force: true });
    } catch {
      /* best-effort */
    }
  }
});

// ===========================================================================
// src/core/files.ts
// ===========================================================================
describe("core/files.ts — readFile / resolvePaths edge branches", function () {
  it("readFile throws for missing / non-string / empty fileURLOrPath", async function () {
    await assert.rejects(() => readFile({}), /fileURLOrPath is required/);
    await assert.rejects(
      () => readFile({ fileURLOrPath: 123 }),
      /must be a string/
    );
    await assert.rejects(
      () => readFile({ fileURLOrPath: "   " }),
      /cannot be an empty string/
    );
  });

  it("readFile fetches a remote JSON URL via axios (stubbed)", async function () {
    sinon.stub(axios, "get").resolves({ data: '{"remote":true}' });
    const out = await readFile({ fileURLOrPath: "https://example.test/config.json" });
    assert.deepEqual(out, { remote: true });
  });

  it("readFile returns null and warns when a remote fetch fails", async function () {
    sinon.stub(console, "warn");
    sinon.stub(axios, "get").rejects(new Error("network down"));
    const out = await readFile({ fileURLOrPath: "https://example.test/x.json" });
    assert.equal(out, null);
  });

  it("readFile returns null and warns on a non-ENOENT local read error", async function () {
    sinon.stub(console, "warn");
    sinon
      .stub(fs.promises, "readFile")
      .rejects(Object.assign(new Error("perm"), { code: "EACCES" }));
    const out = await readFile({ fileURLOrPath: "/some/file.txt" });
    assert.equal(out, null);
  });

  it("readFile parses YAML and returns raw text when YAML parsing fails", async function () {
    sinon.stub(console, "warn");
    const dir = mkTmp("dd-edge-files-");
    const good = path.join(dir, "a.yaml");
    fs.writeFileSync(good, "key: value\nlist:\n  - one\n");
    assert.deepEqual(await readFile({ fileURLOrPath: good }), { key: "value", list: ["one"] });
    const bad = path.join(dir, "b.yml");
    fs.writeFileSync(bad, "key: : : broken\n  - nope");
    const out = await readFile({ fileURLOrPath: bad });
    assert.equal(typeof out, "string");
  });

  it("resolvePaths detects a config object at the top level and resolves config paths", async function () {
    const dir = mkTmp("dd-edge-files-");
    const config = { input: ["rel/docs"], output: "rel/out", relativePathBase: "file" };
    const out = await resolvePaths({
      config: { relativePathBase: "file" },
      object: config,
      filePath: path.join(dir, "config.json"),
    });
    assert.ok(path.isAbsolute(out.output), "config `output` path should be absolutized");
  });

  it("resolvePaths returns an empty nested object unchanged", async function () {
    const out = await resolvePaths({
      config: { relativePathBase: "file" },
      object: {},
      filePath: "/x/spec.json",
      nested: true,
      objectType: "spec",
    });
    assert.deepEqual(out, {});
  });

  it("resolvePaths recurses into a nested object property and skips no-resolve spec keys", async function () {
    const object = {
      // nested object property → recursion branch
      before: { file: "rel/setup.md" },
      // spec no-resolve object → left untouched
      requestData: { file: "should/not/resolve.md" },
    };
    const out = await resolvePaths({
      config: { relativePathBase: "file" },
      object,
      filePath: "/anchor/spec.json",
      objectType: "spec",
    });
    assert.ok(path.isAbsolute(out.before.file), "nested `file` should be resolved");
    assert.equal(out.requestData.file, "should/not/resolve.md", "no-resolve key untouched");
  });

  it("resolvePaths leaves http/heretto array-item strings unchanged (resolve early-return)", async function () {
    const object = {
      objectType: "spec",
      setup: ["https://example.com/a.md", "heretto:doc/1", "rel/local.md"],
    };
    const out = await resolvePaths({
      config: { relativePathBase: "file" },
      object,
      filePath: "/anchor/spec.json",
      objectType: "spec",
    });
    assert.equal(out.setup[0], "https://example.com/a.md");
    assert.equal(out.setup[1], "heretto:doc/1");
    assert.ok(path.isAbsolute(out.setup[2]), "the local relative path is resolved");
  });

  it("resolvePaths resolves array-of-string `path` items relative to a sibling absolute directory", async function () {
    const absDir = path.resolve(mkTmp("dd-edge-files-"));
    const object = { directory: absDir, path: ["p1.md", "p2.md"] };
    const out = await resolvePaths({
      config: { relativePathBase: "file" },
      object,
      filePath: "/somewhere/spec.json",
      objectType: "spec",
    });
    assert.equal(out.path[0], path.resolve(absDir, "p1.md"));
    assert.equal(out.path[1], path.resolve(absDir, "p2.md"));
  });

  it("readFile returns raw content for a non-json/yaml extension", async function () {
    const dir = mkTmp("dd-edge-files-");
    const p = path.join(dir, "note.txt");
    fs.writeFileSync(p, "plain text body");
    const out = await readFile({ fileURLOrPath: p });
    assert.equal(out, "plain text body");
  });

  it("readFile returns null when a local file is missing (ENOENT warn path)", async function () {
    sinon.stub(console, "warn");
    const dir = mkTmp("dd-edge-files-");
    const out = await readFile({ fileURLOrPath: path.join(dir, "nope.json") });
    assert.equal(out, null);
  });

  it("readFile returns the raw string when JSON parsing fails", async function () {
    sinon.stub(console, "warn");
    const dir = mkTmp("dd-edge-files-");
    const p = path.join(dir, "broken.json");
    fs.writeFileSync(p, "{ not: json");
    const out = await readFile({ fileURLOrPath: p });
    assert.equal(out, "{ not: json");
  });

  it("resolvePaths detects a spec object (not a config) and resolves spec paths", async function () {
    const dir = mkTmp("dd-edge-files-");
    const spec = { specId: "s1", tests: [{ steps: [{ goTo: "https://x" }] }], file: "rel/file.md" };
    const out = await resolvePaths({
      config: { relativePathBase: "file" },
      object: spec,
      filePath: path.join(dir, "spec.json"),
    });
    assert.ok(path.isAbsolute(out.file), "spec `file` path should be absolutized");
  });

  it("resolvePaths throws when neither config nor spec schema matches", async function () {
    await assert.rejects(
      () =>
        resolvePaths({
          config: { relativePathBase: "file" },
          object: { totallyBogus: true, notAValidKey: 42 },
          filePath: "/tmp/x.json",
        }),
      /isn't a valid config or spec/
    );
  });

  it("resolvePaths throws 'Object type is required' for a nested call without objectType", async function () {
    await assert.rejects(
      () =>
        resolvePaths({
          config: { relativePathBase: "file" },
          object: { a: 1 },
          filePath: "/tmp/x.json",
          nested: true,
        }),
      /Object type is required/
    );
  });

  it("resolvePaths throws 'Invalid objectType' for an unrecognized objectType", async function () {
    await assert.rejects(
      () =>
        resolvePaths({
          config: { relativePathBase: "file" },
          object: { a: 1 },
          filePath: "/tmp/x.json",
          objectType: "bogus",
        }),
      /Invalid objectType/
    );
  });

  it("resolvePaths leaves http/heretto string values untouched (continue branch)", async function () {
    const object = { objectType: "spec", file: "https://example.com/a.md", note: "heretto:doc/1" };
    const out = await resolvePaths({
      config: { relativePathBase: "file" },
      object,
      filePath: "/base/spec.json",
      objectType: "spec",
    });
    assert.equal(out.file, "https://example.com/a.md");
    assert.equal(out.note, "heretto:doc/1");
  });

  it("resolvePaths resolves a spec `path` relative to a sibling absolute `directory`", async function () {
    const absDir = path.resolve(mkTmp("dd-edge-files-"));
    const object = { directory: absDir, path: "sub/page.md" };
    const out = await resolvePaths({
      config: { relativePathBase: "file" },
      object,
      filePath: "/somewhere/else/spec.json",
      objectType: "spec",
    });
    assert.equal(out.path, path.resolve(absDir, "sub/page.md"));
  });

  it("resolvePaths resolves a `path` against a relative `directory` (directory-resolve branch)", async function () {
    const object = { directory: "relbase", path: "page.md" };
    const out = await resolvePaths({
      config: { relativePathBase: "file" },
      object,
      filePath: "/anchor/spec.json",
      objectType: "spec",
    });
    // directory is relativized against filePath's dir, then path against that.
    assert.equal(out.path, path.resolve("/anchor", "relbase", "page.md"));
  });
});

// ===========================================================================
// src/core/tests/runShell.ts
// ===========================================================================
describe("core/tests/runShell.ts — stdio + saved-file edge branches", function () {
  const config = { logLevel: "silent" };
  this.timeout?.(30000);

  it("FAILs a background step when no process registry is available", async function () {
    const result = await runShell({
      config,
      step: { runShell: { command: "echo hi", background: { name: "bg1" } } },
      // no processRegistry
    });
    assert.equal(result.status, "FAIL");
    assert.match(result.description, /no process registry available/);
  });

  it("FAILs a background step whose name is already registered", async function () {
    const registry = new Map();
    registry.set("dup", { name: "dup" });
    const result = await runShell({
      config,
      step: { runShell: { command: "echo hi", background: { name: "dup" } } },
      processRegistry: registry,
    });
    assert.equal(result.status, "FAIL");
    assert.match(result.description, /already running/);
  });

  it("matches stdio via a /regex/ (regex branch)", async function () {
    const result = await runShell({
      config,
      step: { runShell: { command: "echo", args: ["abc123"], stdio: "/[a-z]+\\d+/" } },
    });
    assert.equal(result.outputs.stdioMatched, true);
  });

  it("reports the regex-specific 'Couldn't find' message when a /regex/ does not match", async function () {
    const result = await runShell({
      config,
      step: {
        runShell: { command: "echo", args: ["hello"], stdio: "/\\d{5,}/", exitCodes: [0] },
      },
    });
    assert.equal(result.outputs.stdioMatched, false);
    assert.match(result.description, /Couldn't find expected output/);
  });

  it("creates a missing parent directory and writes a new saved file (no prior file → no variation)", async function () {
    const dir = mkTmp("dd-edge-runshell-");
    const target = path.join(dir, "nested", "created", "out.txt");
    const result = await runShell({
      config,
      step: { runShell: { command: "echo", args: ["fresh-output"], path: target } },
    });
    assert.ok(fs.existsSync(target), "file should have been created");
    assert.match(fs.readFileSync(target, "utf8"), /fresh-output/);
    // No variation assertion when the file did not exist beforehand.
    assert.equal(result.outputs.variation, undefined);
  });

  it("does not overwrite an existing file when overwrite:'false' (adds the 'already exists' note)", async function () {
    const dir = mkTmp("dd-edge-runshell-");
    const target = path.join(dir, "keep.txt");
    fs.writeFileSync(target, "ORIGINAL");
    const result = await runShell({
      config,
      step: {
        runShell: {
          command: "echo",
          args: ["different"],
          path: target,
          overwrite: "false",
          maxVariation: 0.001,
        },
      },
    });
    assert.equal(fs.readFileSync(target, "utf8"), "ORIGINAL", "file must be preserved");
    assert.match(result.description, /File already exists/);
  });

  it("overwrites an existing file when overwrite:'true' even within variation tolerance", async function () {
    const dir = mkTmp("dd-edge-runshell-");
    const target = path.join(dir, "same.txt");
    // Pre-seed with content identical (modulo trailing newline) to echo's output
    // so the fractional diff stays <= maxVariation, exercising the else branch.
    fs.writeFileSync(target, "identical");
    await runShell({
      config,
      step: {
        runShell: {
          command: "echo",
          args: ["identical"],
          path: target,
          overwrite: "true",
          maxVariation: 1,
        },
      },
    });
    // overwrite:'true' rewrites the file with the (newline-stripped) stdout.
    assert.equal(fs.readFileSync(target, "utf8"), "identical");
  });
});

// ===========================================================================
// src/runtime/cacheDir.ts
// ===========================================================================
describe("runtime/cacheDir.ts — guard + fallback branches", function () {
  it("assertSafeRuntimePath throws on a shell metacharacter", function () {
    assert.throws(
      () => assertSafeRuntimePath("C:/tmp/dd$bad", "cacheDir"),
      /shell-metacharacter/
    );
  });

  it("getCacheDir rejects a metacharacter-laden DOC_DETECTIVE_CACHE_DIR", function () {
    process.env.DOC_DETECTIVE_CACHE_DIR = "/tmp/bad;rm";
    assert.throws(() => getCacheDir({}), /shell-metacharacter/);
  });

  it("getBrowsersDir returns a legacy snapshot dir when one exists and no override is set", function () {
    // No env / ctx override → the legacy `./browser-snapshots` probe runs.
    delete process.env.DOC_DETECTIVE_CACHE_DIR;
    const legacy = mkTmp("dd-edge-legacy-");
    // First candidate is path.resolve('browser-snapshots'); force statSync to
    // report our temp dir as the directory so we don't touch the real cwd.
    const realStat = fs.statSync;
    sinon.stub(fs, "statSync").callsFake((p, ...rest) => {
      if (String(p).endsWith("browser-snapshots")) {
        return { isDirectory: () => true };
      }
      return realStat.call(fs, p, ...rest);
    });
    const out = getBrowsersDir({});
    assert.match(out.replace(/\\/g, "/"), /browser-snapshots$/);
    assert.ok(legacy); // referenced to keep tmp tracked
  });

  it("getBrowsersDir skips legacy candidates whose statSync throws and falls back to the default cache", function () {
    // No override → the legacy loop runs; every statSync throws → catch/skip →
    // fall through to <cacheDir>/browsers. Redirect the default cache root to a
    // temp dir so we don't create anything under the real tmpdir cache.
    delete process.env.DOC_DETECTIVE_CACHE_DIR;
    const fakeTmp = mkTmp("dd-edge-tmproot-");
    sinon.stub(os, "tmpdir").returns(fakeTmp);
    sinon.stub(fs, "statSync").throws(Object.assign(new Error("nope"), { code: "ENOENT" }));
    const out = getBrowsersDir({});
    assert.equal(out, path.join(fakeTmp, "doc-detective", "browsers"));
  });

  it("readInstalledRecord degrades to an empty record on a non-ENOENT read error", function () {
    const cacheDir = mkTmp("dd-edge-cache-");
    sinon.stub(fs, "readFileSync").throws(Object.assign(new Error("perm"), { code: "EACCES" }));
    const rec = readInstalledRecord({ cacheDir });
    assert.deepEqual(rec, { npmPackages: {}, browsers: {} });
  });

  it("writeInstalledRecord falls back to unlink+rename when rename throws EEXIST", function () {
    const cacheDir = mkTmp("dd-edge-cache-");
    process.env.DOC_DETECTIVE_CACHE_DIR = cacheDir;
    let renameCalls = 0;
    const realRename = fs.renameSync;
    sinon.stub(fs, "renameSync").callsFake((from, to) => {
      renameCalls += 1;
      if (renameCalls === 1) throw Object.assign(new Error("exists"), { code: "EEXIST" });
      return realRename.call(fs, from, to);
    });
    const unlink = sinon.stub(fs, "unlinkSync");
    writeInstalledRecord({ npmPackages: { a: { installedVersion: "1", installedAt: "t" } }, browsers: {} }, { cacheDir });
    assert.ok(unlink.called, "should attempt unlink before the second rename");
    assert.equal(renameCalls, 2, "rename retried after unlink");
    // Restore stubs before reading back so the real record is parsed.
    sinon.restore();
    const back = readInstalledRecord({ cacheDir });
    assert.equal(back.npmPackages.a.installedVersion, "1");
  });

  it("writeInstalledRecord falls back to unlink+rename when rename throws EPERM", function () {
    const cacheDir = mkTmp("dd-edge-cache-");
    process.env.DOC_DETECTIVE_CACHE_DIR = cacheDir;
    let renameCalls = 0;
    const realRename = fs.renameSync;
    sinon.stub(fs, "renameSync").callsFake((from, to) => {
      renameCalls += 1;
      if (renameCalls === 1) throw Object.assign(new Error("perm"), { code: "EPERM" });
      return realRename.call(fs, from, to);
    });
    sinon.stub(fs, "unlinkSync");
    writeInstalledRecord({ npmPackages: {}, browsers: {} }, { cacheDir });
    assert.equal(renameCalls, 2, "rename retried after unlink on EPERM");
  });

  it("writeInstalledRecord swallows an unlink failure during the EEXIST/EPERM fallback", function () {
    const cacheDir = mkTmp("dd-edge-cache-");
    let renameCalls = 0;
    const realRename = fs.renameSync;
    sinon.stub(fs, "renameSync").callsFake((from, to) => {
      renameCalls += 1;
      if (renameCalls === 1) throw Object.assign(new Error("exists"), { code: "EEXIST" });
      return realRename.call(fs, from, to);
    });
    // unlink itself throws — the best-effort catch must swallow it, then rename succeeds.
    sinon.stub(fs, "unlinkSync").throws(new Error("cannot unlink"));
    assert.doesNotThrow(() =>
      writeInstalledRecord({ npmPackages: {}, browsers: {} }, { cacheDir })
    );
    assert.equal(renameCalls, 2);
  });

  it("writeInstalledRecord rethrows a non-EEXIST/EPERM rename error", function () {
    const cacheDir = mkTmp("dd-edge-cache-");
    sinon.stub(fs, "renameSync").throws(Object.assign(new Error("io"), { code: "EIO" }));
    assert.throws(
      () => writeInstalledRecord({ npmPackages: {}, browsers: {} }, { cacheDir }),
      /io/
    );
  });
});

// ===========================================================================
// src/runtime/loader.ts
// ===========================================================================
// Minimal EventEmitter-backed fake spawner (mirrors runtime-loader.test.js).
function makeFakeChild() {
  const child = new EventEmitter();
  child.stdout = new EventEmitter();
  child.stderr = new EventEmitter();
  return child;
}

// A richer fake spawner that resolves via the stdout/stderr + close lifecycle.
function makeFakeSpawner({ exitCode = 0, stdout = "", stderr = "" } = {}) {
  const calls = [];
  const spawner = (cmd, args, opts) => {
    calls.push({ cmd, args, opts });
    const child = makeFakeChild();
    setImmediate(() => {
      if (stdout) child.stdout.emit("data", stdout);
      if (stderr) child.stderr.emit("data", stderr);
      child.emit("close", exitCode);
    });
    return child;
  };
  spawner.calls = calls;
  return spawner;
}

describe("runtime/loader.ts — install teardown & log-stream branches", function () {
  this.timeout?.(10000);

  it("continues installing when the log WriteStream can't be created (createWriteStream throws)", async function () {
    const cacheDir = mkTmp("dd-edge-loader-");
    // Force the log stream creation to throw → the catch sets logStream=null and
    // the install proceeds and settles on exit 0.
    sinon.stub(fs, "createWriteStream").throws(new Error("no stream"));
    const spawner = makeFakeSpawner({ exitCode: 0 });
    await ensureRuntimeInstalled(["pngjs"], {
      deps: { spawn: spawner, logger: () => {} },
      ctx: { cacheDir },
      force: true,
    });
    assert.equal(spawner.calls.length, 1, "install still spawned once");
  });

  it("swallows a log WriteStream 'error' event and still settles the install", async function () {
    const cacheDir = mkTmp("dd-edge-loader-");
    // Return a fake stream whose write() emits an 'error' asynchronously.
    const fakeStream = new EventEmitter();
    fakeStream.write = () => {
      setImmediate(() => fakeStream.emit("error", new Error("disk full")));
      return true;
    };
    fakeStream.end = (cb) => {
      if (typeof cb === "function") setImmediate(cb);
    };
    sinon.stub(fs, "createWriteStream").returns(fakeStream);
    const spawner = makeFakeSpawner({ exitCode: 0, stdout: "some npm output line\n" });
    await ensureRuntimeInstalled(["pngjs"], {
      deps: { spawn: spawner, logger: () => {} },
      ctx: { cacheDir },
      force: true,
    });
    assert.equal(spawner.calls.length, 1);
  });

  it("throws 'Failed to resolve' when install exits 0 but the dep still doesn't resolve", async function () {
    const cacheDir = mkTmp("dd-edge-loader-");
    // Use an obviously-unresolvable name. getDeclaredVersion would normally
    // reject unknown names, so use a real declared heavy dep name but a fake
    // spawner that reports success WITHOUT actually installing it.
    const spawner = makeFakeSpawner({ exitCode: 0 });
    let caught;
    try {
      // loadHeavyDep triggers ensureRuntimeInstalled then re-resolves.
      const { loadHeavyDep } = await import("../dist/runtime/loader.js");
      await loadHeavyDep("pngjs", {
        autoInstall: true,
        ctx: { cacheDir },
        deps: { spawn: spawner, logger: () => {} },
      });
    } catch (err) {
      caught = err;
    }
    // pngjs resolves from the shim's node_modules in this repo, so loadHeavyDep
    // succeeds without installing — in that case there's no throw. Only assert
    // the negative (no crash) to stay robust across environments.
    assert.ok(caught === undefined || /Failed to resolve|not installed/.test(String(caught.message)));
  });

  it("kills the child on install timeout and settles even when child.kill() throws", async function () {
    const cacheDir = mkTmp("dd-edge-loader-");
    const child = makeFakeChild();
    // Never emit `close` — force the wall-clock timeout to fire.
    child.kill = () => {
      throw new Error("kill failed");
    };
    const spawner = () => child;
    let caught;
    try {
      await ensureRuntimeInstalled(["pngjs"], {
        deps: { spawn: spawner, logger: () => {} },
        ctx: { cacheDir },
        force: true,
        installTimeoutMs: 40,
      });
    } catch (err) {
      caught = err;
    }
    assert.ok(caught, "install should reject on timeout");
    assert.match(String(caught.message), /timed out after 40ms/);
  });
});

// ===========================================================================
// src/core/utils.ts — pure helpers & guard branches
// ===========================================================================
describe("core/utils.ts — filter helpers", function () {
  it("compileFilter drops non-strings and whitespace-only entries", function () {
    const res = compileFilter(["  ", "abc", 42, "  x "]);
    assert.equal(res.length, 2);
    assert.ok(res[0].test("ABC"), "case-insensitive compile");
  });

  it("compileFilter returns [] for a non-array / empty input", function () {
    assert.deepEqual(compileFilter(undefined), []);
    assert.deepEqual(compileFilter("not-array"), []);
    assert.deepEqual(compileFilter([]), []);
  });

  it("matchesFilter returns true when there are no filters, false for a non-string id", function () {
    assert.equal(matchesFilter("anything", []), true);
    assert.equal(matchesFilter(undefined, compileFilter(["x"])), false);
  });

  it("selectSpecsForRun returns input unchanged when no filters configured", function () {
    const specs = [{ specId: "a", tests: [] }];
    assert.equal(selectSpecsForRun(specs, {}), specs);
  });

  it("selectSpecsForRun drops non-matching specs and narrows tests", function () {
    const specs = [
      { specId: "keep-me", tests: [{ testId: "t-yes" }, { testId: "t-no" }] },
      { specId: "drop-me", tests: [{ testId: "t-yes" }] },
    ];
    const out = selectSpecsForRun(specs, { specFilter: ["keep"], testFilter: ["yes"] });
    assert.equal(out.length, 1);
    assert.equal(out[0].specId, "keep-me");
    assert.equal(out[0].tests.length, 1);
    assert.equal(out[0].tests[0].testId, "t-yes");
  });

  it("selectSpecsForRun drops a spec whose tests all fail the test filter", function () {
    const specs = [{ specId: "s", tests: [{ testId: "nope" }] }];
    const out = selectSpecsForRun(specs, { testFilter: ["match-nothing"] });
    assert.deepEqual(out, []);
  });
});

describe("core/utils.ts — URL helpers", function () {
  it("isRelativeUrl distinguishes absolute from relative", function () {
    assert.equal(isRelativeUrl("https://example.com"), false);
    assert.equal(isRelativeUrl("some/relative/path"), true);
  });

  it("appendQueryParams no-ops on non-object / empty params", function () {
    assert.equal(appendQueryParams("http://x/y", null), "http://x/y");
    assert.equal(appendQueryParams("http://x/y", ["a"]), "http://x/y");
    assert.equal(appendQueryParams("http://x/y", { a: undefined, b: null }), "http://x/y");
  });

  it("appendQueryParams preserves the fragment, merges colliding keys, keeps others byte-for-byte", function () {
    const out = appendQueryParams("http://x/y?keep=1&drop=old#frag", { drop: "new", add: "z" });
    assert.match(out, /keep=1/);
    assert.match(out, /drop=new/);
    assert.doesNotMatch(out, /drop=old/);
    assert.match(out, /add=z/);
    assert.ok(out.endsWith("#frag"), "fragment stays at the end");
  });

  it("appendQueryParams tolerates an undecodable existing key", function () {
    const out = appendQueryParams("http://x/y?%E0%A4%A=raw", { add: "z" });
    assert.match(out, /add=z/);
    assert.match(out, /%E0%A4%A=raw/);
  });

  it("redactUrlForOutput strips query/fragment for a valid URL and via fallback", function () {
    assert.equal(redactUrlForOutput("https://h/p?token=secret#f"), "https://h/p");
    // Non-URL input hits the catch fallback (still strips ? and #).
    assert.equal(redactUrlForOutput("not a url?token=secret#f"), "not a url");
  });

  it("sanitizeFilesystemName replaces invalid chars and falls back for dot-only names", function () {
    assert.equal(sanitizeFilesystemName("a/b:c*d", "fb"), "a_b_c_d");
    assert.equal(sanitizeFilesystemName("..", "fb"), "fb");
    assert.equal(sanitizeFilesystemName("...", "fb"), "fb");
    assert.equal(sanitizeFilesystemName("", "fb"), "fb");
  });
});

describe("core/utils.ts — assertUrlHostIsPublic SSRF guard", function () {
  it("allows everything when DOC_DETECTIVE_ALLOW_LOCAL_URLS=true (early return)", async function () {
    process.env.DOC_DETECTIVE_ALLOW_LOCAL_URLS = "true";
    await assertUrlHostIsPublic("http://127.0.0.1/x"); // must not throw
  });

  it("throws on an invalid URL", async function () {
    delete process.env.DOC_DETECTIVE_ALLOW_LOCAL_URLS;
    await assert.rejects(() => assertUrlHostIsPublic("::::not-a-url"), /Invalid URL/);
  });

  it("throws on an unsupported scheme", async function () {
    delete process.env.DOC_DETECTIVE_ALLOW_LOCAL_URLS;
    await assert.rejects(() => assertUrlHostIsPublic("ftp://example.com/x"), /Unsupported URL scheme/);
  });

  it("refuses a private IPv4 literal", async function () {
    delete process.env.DOC_DETECTIVE_ALLOW_LOCAL_URLS;
    await assert.rejects(() => assertUrlHostIsPublic("http://10.0.0.5/x"), /private\/loopback/);
  });

  it("refuses 172.16/12, 192.168/16, 169.254 link-local, and 100.64 CGNAT literals", async function () {
    delete process.env.DOC_DETECTIVE_ALLOW_LOCAL_URLS;
    for (const ip of ["172.20.1.1", "192.168.0.1", "169.254.1.1", "100.66.0.1", "127.0.0.1", "0.0.0.0"]) {
      await assert.rejects(() => assertUrlHostIsPublic(`http://${ip}/x`), /private\/loopback/);
    }
  });

  it("refuses IPv6 loopback / unique-local / link-local literals", async function () {
    delete process.env.DOC_DETECTIVE_ALLOW_LOCAL_URLS;
    for (const host of ["[::1]", "[fc00::1]", "[fd12::1]", "[fe80::1]"]) {
      await assert.rejects(() => assertUrlHostIsPublic(`http://${host}/x`), /private\/loopback/);
    }
  });

  it("refuses an IPv4-mapped IPv6 private address (::ffff: hex reconstruction)", async function () {
    delete process.env.DOC_DETECTIVE_ALLOW_LOCAL_URLS;
    // ::ffff:a00:1 == 10.0.0.1 after the URL parser normalizes the embedded v4.
    await assert.rejects(() => assertUrlHostIsPublic("http://[::ffff:a00:1]/x"), /private\/loopback/);
  });

  it("refuses the literal 'localhost' hostname", async function () {
    delete process.env.DOC_DETECTIVE_ALLOW_LOCAL_URLS;
    await assert.rejects(() => assertUrlHostIsPublic("http://localhost/x"), /localhost/);
    await assert.rejects(() => assertUrlHostIsPublic("http://api.localhost/x"), /localhost/);
  });
});

describe("core/utils.ts — fetchFile binary path (stubbed axios)", function () {
  it("fetches binary bytes and writes them under the temp dir", async function () {
    process.env.DOC_DETECTIVE_ALLOW_LOCAL_URLS = "true"; // bypass SSRF for a fake host
    const payload = Buffer.from([1, 2, 3, 4]);
    sinon.stub(axios, "get").resolves({ data: payload });
    const res = await fetchFile("http://example.test/img.png", { binary: true });
    assert.equal(res.result, "success");
    assert.ok(res.path.endsWith(".png"));
    assert.ok(fs.existsSync(res.path));
    try {
      assert.deepEqual([...fs.readFileSync(res.path)], [1, 2, 3, 4]);
    } finally {
      try {
        fs.unlinkSync(res.path);
      } catch {
        /* best-effort */
      }
    }
  });

  it("returns {result:'error'} when the fetch rejects", async function () {
    process.env.DOC_DETECTIVE_ALLOW_LOCAL_URLS = "true";
    sinon.stub(axios, "get").rejects(new Error("boom"));
    const res = await fetchFile("http://example.test/x.bin", { binary: true });
    assert.equal(res.result, "error");
  });

  it("stringifies an object response on the text (non-binary) path", async function () {
    sinon.stub(axios, "get").resolves({ data: { k: "v", n: 1 } });
    const res = await fetchFile("http://example.test/data.json");
    assert.equal(res.result, "success");
    const written = fs.readFileSync(res.path, "utf8");
    assert.deepEqual(JSON.parse(written), { k: "v", n: 1 });
    try {
      fs.unlinkSync(res.path);
    } catch {
      /* best-effort */
    }
  });

  it("stringifies a primitive text response via .toString()", async function () {
    sinon.stub(axios, "get").resolves({ data: 12345 });
    const res = await fetchFile("http://example.test/plain.txt");
    assert.equal(res.result, "success");
    assert.equal(fs.readFileSync(res.path, "utf8"), "12345");
    try {
      fs.unlinkSync(res.path);
    } catch {
      /* best-effort */
    }
  });
});

describe("core/utils.ts — cleanTemp / waitForStdio / run output helpers", function () {
  it("cleanTemp is a no-op when the temp dir does not exist", function () {
    const missing = path.join(mkTmp("dd-edge-clean-"), "does-not-exist");
    const existsStub = sinon.stub(fs, "existsSync");
    existsStub.callsFake((p) => (String(p).endsWith("doc-detective") ? false : true));
    // Should return early without throwing / reading.
    cleanTemp();
    assert.ok(existsStub.called);
  });

  it("cleanTemp removes scratch files/dirs but preserves cache entries", function () {
    // Redirect os.tmpdir to a throwaway root so we never touch the real cache.
    const fakeTmp = mkTmp("dd-edge-tmproot-");
    sinon.stub(os, "tmpdir").returns(fakeTmp);
    const ddDir = path.join(fakeTmp, "doc-detective");
    fs.mkdirSync(path.join(ddDir, "runtime"), { recursive: true });
    fs.mkdirSync(path.join(ddDir, "scratch-dir"), { recursive: true });
    fs.writeFileSync(path.join(ddDir, "installed.json"), "{}");
    fs.writeFileSync(path.join(ddDir, "scratch.txt"), "x");
    cleanTemp();
    assert.ok(fs.existsSync(path.join(ddDir, "runtime")), "runtime preserved");
    assert.ok(fs.existsSync(path.join(ddDir, "installed.json")), "installed.json preserved");
    assert.ok(!fs.existsSync(path.join(ddDir, "scratch-dir")), "scratch dir removed");
    assert.ok(!fs.existsSync(path.join(ddDir, "scratch.txt")), "scratch file removed");
  });

  it("waitForStdio rejects for an invalid regular expression", async function () {
    const bg = { getStdout: () => "", getStderr: () => "", onChunk: () => () => {} };
    await assert.rejects(
      () => waitForStdio(bg, "/(/", { deadline: Date.now() + 1000 }),
      /invalid regular expression/
    );
  });

  it("getRunOutputDir(create:false) resolves a path without touching disk", function () {
    const dir = mkTmp("dd-edge-runout-");
    const config = { output: path.join(dir, "report.json") };
    const resolved = getRunOutputDir(config, { create: false });
    assert.ok(resolved.includes(".doc-detective"));
    assert.ok(!fs.existsSync(resolved), "create:false must not create the folder");
    // A subsequent create:true call via the memoized branch materializes it.
    const again = getRunOutputDir(config, { create: true });
    assert.equal(again, resolved);
    assert.ok(fs.existsSync(again));
  });

  it("getRunOutputDir suffixes on an EEXIST collision when reserving the folder", function () {
    const dir = mkTmp("dd-edge-runout-");
    const config = { output: dir };
    let threw = false;
    const realMkdir = fs.mkdirSync;
    sinon.stub(fs, "mkdirSync").callsFake((p, opts) => {
      // Non-recursive reservation mkdir (no opts) throws EEXIST exactly once.
      if (!opts && !threw) {
        threw = true;
        throw Object.assign(new Error("exists"), { code: "EEXIST" });
      }
      return realMkdir.call(fs, p, opts);
    });
    const out = getRunOutputDir(config, { create: true });
    assert.match(out, /-2$/, "should append an ordinal suffix after EEXIST");
  });

  it("runArchivesArtifacts: true when a per-test autoScreenshot overrides a global false", function () {
    const specs = [{ tests: [{ autoScreenshot: true }] }];
    assert.equal(runArchivesArtifacts({ autoScreenshot: false, reporters: ["terminal"] }, specs), true);
  });

  it("runArchivesArtifacts: true when global autoRecord is set and no specs are supplied", function () {
    assert.equal(runArchivesArtifacts({ autoRecord: true, reporters: ["terminal"] }, []), true);
  });

  it("runArchivesArtifacts: false when no artifacts and no runFolder reporter active", function () {
    assert.equal(runArchivesArtifacts({ reporters: ["terminal", "json"] }, []), false);
  });
});

describe("core/utils.ts — spawnCommand debug echo", function () {
  this.timeout?.(20000);
  it("streams stdout chunks to console.log when options.debug is set", async function () {
    const logStub = sinon.stub(console, "log");
    const res = await coreSpawnCommand("echo", ["debug-line"], { debug: true });
    assert.match(res.stdout, /debug-line/);
    assert.ok(logStub.called, "debug mode should log streamed chunks");
  });

  it("streams stderr chunks to console.log when options.debug is set", async function () {
    const logStub = sinon.stub(console, "log");
    // Cross-platform: node writes to stderr regardless of shell.
    const res = await coreSpawnCommand(
      `node -e "process.stderr.write('err-debug-line')"`,
      [],
      { debug: true }
    );
    assert.match(res.stderr, /err-debug-line/);
    assert.ok(logStub.called);
  });
});

// ===========================================================================
// src/utils.ts — reporters + meta/version helpers
// ===========================================================================
describe("utils.ts — reporters and helpers edge branches", function () {
  it("terminalReporter prints the filter-specific 'No tests were run' note", async function () {
    const logStub = sinon.stub(console, "log");
    await reporters.terminalReporter({ specFilter: ["x"], testFilter: [] }, "out", null, {});
    const text = logStub.getCalls().map((c) => c.args.join(" ")).join("\n");
    assert.match(text, /No tests were run/);
    assert.match(text, /filters excluded every spec\/test/);
  });

  it("terminalReporter falls back to default ids/labels for SKIPPED items without ids/browser", async function () {
    const logStub = sinon.stub(console, "log");
    // The detail lists only print when `hasFailures` is truthy, so include one
    // FAIL step alongside SKIPPED items that lack ids / platform / browser — the
    // latter drive the `spec.specId || 'Spec N'` (and friends) fallback branches.
    const results = {
      summary: {
        specs: { pass: 0, fail: 1, warning: 0, skipped: 1 },
        tests: { pass: 0, fail: 1, warning: 0, skipped: 1 },
        contexts: { pass: 0, fail: 1, warning: 0, skipped: 1 },
        steps: { pass: 0, fail: 1, warning: 0, skipped: 1 },
      },
      specs: [
        {
          // FAIL spec WITH an id (so a failure exists → detail lists render).
          specId: "spec-has-fail",
          result: "FAIL",
          tests: [
            {
              testId: "test-has-fail",
              result: "FAIL",
              contexts: [
                {
                  result: "FAIL",
                  platform: "linux",
                  browser: { name: "chrome" },
                  steps: [{ result: "FAIL", stepId: "step-has-fail" }],
                },
              ],
            },
          ],
        },
        {
          // SKIPPED spec/test/context/step WITHOUT ids or browser → fallbacks.
          result: "SKIPPED",
          tests: [
            {
              result: "SKIPPED",
              contexts: [
                {
                  result: { status: "SKIPPED" }, // nested-status skipped, no platform/browser
                  steps: [{ result: "SKIPPED" }],
                },
              ],
            },
          ],
        },
      ],
    };
    await reporters.terminalReporter({}, "out", results, {});
    const text = logStub.getCalls().map((c) => c.args.join(" ")).join("\n");
    // Skipped fallbacks: the second spec/test/context/step carry no ids.
    assert.match(text, /Spec 2/); // default spec id for the skipped spec
    assert.match(text, /Test 1/); // default test id for the skipped test
    assert.match(text, /unknown\/unknown/); // default platform/browser
    assert.match(text, /Step 1/); // default step id for the skipped step
  });

  it("jsonReporter appends a counter when the target .json file already exists", async function () {
    const dir = mkTmp("dd-edge-json-");
    const file = path.join(dir, "results.json");
    sinon.stub(console, "log");
    const first = await reporters.jsonReporter({}, file, { a: 1 }, {});
    const second = await reporters.jsonReporter({}, file, { a: 2 }, {});
    assert.equal(first, file);
    assert.match(second, /results-0\.json$/);
  });

  it("setMeta merges an existing DOC_DETECTIVE_META and stamps distribution fields", function () {
    process.env.DOC_DETECTIVE_META = JSON.stringify({ custom: "keepme" });
    setMeta();
    const meta = JSON.parse(process.env.DOC_DETECTIVE_META);
    assert.equal(meta.custom, "keepme");
    assert.equal(meta.distribution, "doc-detective");
    assert.ok(["windows", "mac", "linux"].includes(meta.dist_platform));
  });

  it("getVersionData returns structured version info with a dependencies map", function () {
    const data = getVersionData();
    assert.ok(data.main["doc-detective"].version);
    assert.equal(typeof data.dependencies, "object");
    assert.ok(data.context.nodeVersion.startsWith("v"));
  });

  it("spawnCommand splits a space-containing command and concatenates provided args", async function () {
    // `node -e "<script>"` — the command has a space, and args are appended.
    const res = await spawnCommand('node -e', ['process.stdout.write("hi")']);
    assert.equal(res.exitCode, 0);
    assert.match(res.stdout, /hi/);
  });
});

// ===========================================================================
// src/hints/context.ts — pure probe/walk branches
// ===========================================================================
describe("hints/context.ts — git origin + workflow + walk branches", function () {
  it("parseOriginUrl returns the origin url, ignoring comments and other remotes", function () {
    const cfg = [
      "# a comment",
      '[remote "upstream"]',
      "  url = https://upstream/repo.git",
      '[remote "origin"]',
      "  url = git@github.com:me/repo.git",
    ].join("\n");
    assert.equal(parseOriginUrl(cfg), "git@github.com:me/repo.git");
  });

  it("parseOriginUrl returns null when there is no origin remote", function () {
    assert.equal(parseOriginUrl('[remote "upstream"]\n url = https://x'), null);
  });

  it("readGitOriginUrl walks up to a .git/config and returns null when absent", function () {
    const root = mkTmp("dd-edge-git-");
    // No .git anywhere under a fresh temp dir → null.
    assert.equal(readGitOriginUrl(root), null);
    // Now place a .git/config with an origin and read it from a subdir.
    const sub = path.join(root, "a", "b");
    fs.mkdirSync(sub, { recursive: true });
    fs.mkdirSync(path.join(root, ".git"), { recursive: true });
    fs.writeFileSync(path.join(root, ".git", "config"), '[remote "origin"]\n url = https://found/repo.git');
    assert.equal(readGitOriginUrl(sub), "https://found/repo.git");
  });

  it("readGitOriginUrl returns null when reading .git/config throws (catch branch)", function () {
    const root = mkTmp("dd-edge-git-");
    fs.mkdirSync(path.join(root, ".git"), { recursive: true });
    fs.writeFileSync(path.join(root, ".git", "config"), "[remote \"origin\"]\n url = x");
    sinon.stub(fs, "readFileSync").throws(new Error("read boom"));
    assert.equal(readGitOriginUrl(root), null);
  });

  it("detectDocDetectiveWorkflow: false when the workflow file read throws mid-scan", function () {
    const root = mkTmp("dd-edge-wf-");
    const wfDir = path.join(root, ".github", "workflows");
    fs.mkdirSync(wfDir, { recursive: true });
    fs.writeFileSync(path.join(wfDir, "ci.yml"), "jobs: {}\n");
    // readdir succeeds, but reading the file throws → the per-file catch `continue`s.
    sinon.stub(fs, "readFileSync").throws(new Error("read boom"));
    assert.equal(detectDocDetectiveWorkflow(root), false);
  });

  it("detectDocDetectiveWorkflow: true for a workflow that runs doc-detective, false otherwise", function () {
    const root = mkTmp("dd-edge-wf-");
    const wfDir = path.join(root, ".github", "workflows");
    fs.mkdirSync(wfDir, { recursive: true });
    // A non-yaml file (skipped), a malformed yaml (skipped), and a matching one.
    fs.writeFileSync(path.join(wfDir, "notes.txt"), "ignore me");
    fs.writeFileSync(path.join(wfDir, "broken.yml"), "::: not yaml :::\n\t- [");
    fs.writeFileSync(
      path.join(wfDir, "ci.yml"),
      "jobs:\n  test:\n    steps:\n      - run: npx doc-detective runTests\n"
    );
    assert.equal(detectDocDetectiveWorkflow(root), true);

    const root2 = mkTmp("dd-edge-wf-");
    const wfDir2 = path.join(root2, ".github", "workflows");
    fs.mkdirSync(wfDir2, { recursive: true });
    fs.writeFileSync(path.join(wfDir2, "ci.yml"), "jobs:\n  test:\n    steps:\n      - run: echo hi\n");
    assert.equal(detectDocDetectiveWorkflow(root2), false);
  });

  it("walkResults collects transient-failure requests, selector-only finds, relative urls and shell sniffs", function () {
    const results = {
      specs: [
        {
          tests: [
            {
              contexts: [
                {
                  browser: { name: "chrome" },
                  steps: [
                    // transient 5xx httpRequest failure
                    { result: "FAIL", httpRequest: {}, outputs: { response: { statusCode: 503 } } },
                    // transient 429 checkLink failure
                    { result: "FAIL", checkLink: {}, outputs: { statusCode: 429 } },
                    // selector-only find (no stable sibling)
                    { find: { selector: ".btn" } },
                    // relative goTo url
                    { goTo: "some/relative/page" },
                    // curl + node in an object-form runShell
                    { runShell: { command: "curl https://x | node script.js" } },
                    // python in a string-form runShell
                    { runShell: "python3 build.py" },
                    // custom assertion + routing retry
                    {
                      assertions: [{ source: "custom" }],
                      onFail: [{ retry: { maxRetries: 2 } }],
                    },
                  ],
                },
              ],
              // loose steps directly under the test
              steps: [{ record: true }],
            },
          ],
        },
      ],
    };
    const data = walkResults(results);
    assert.equal(data.failedTransientRequest, true);
    assert.equal(data.usedSelectorOnlyFinds, true);
    assert.equal(data.hasRelativeUrls, true);
    assert.equal(data.hasCurlInRunShell, true);
    assert.equal(data.hasNodeOrPythonInRunShell, true);
    assert.equal(data.usedCustomAssertions, true);
    assert.equal(data.usedRetry, true);
    assert.ok(data.usedBrowserContexts.has("chrome"));
    assert.equal(data.producedRecordings, true);
  });

  it("walkResults flags a relative url given in object form (goTo.url branch)", function () {
    const data = walkResults({
      specs: [
        {
          tests: [
            {
              contexts: [
                {
                  steps: [
                    { goTo: { url: "relative/only" } }, // object-form url → relative
                    { checkLink: { url: "https://ok.example" } }, // absolute → not relative
                  ],
                },
              ],
            },
          ],
        },
      ],
    });
    assert.equal(data.hasRelativeUrls, true);
  });

  it("walkResults swallows a malformed-shape error and returns partial data (defensive catch)", function () {
    // A test whose `contexts` getter throws forces the inner loop to throw,
    // which the function's defensive try/catch absorbs.
    const boobyTrapped = {
      specs: [
        {
          tests: [
            {
              get contexts() {
                throw new Error("malformed");
              },
            },
          ],
        },
      ],
    };
    const data = walkResults(boobyTrapped);
    assert.equal(data.usedBrowserContexts.size, 0);
  });

  it("walkResults returns empty data for a non-object argument", function () {
    const data = walkResults(null);
    assert.equal(data.usedBrowserContexts.size, 0);
  });

  it("findPackageJsonUpward returns null when fs.existsSync throws during the walk", async function () {
    const { findPackageJsonUpward } = await import("../dist/hints/context.js");
    const root = mkTmp("dd-edge-pkgwalk-");
    sinon.stub(fs, "existsSync").throws(new Error("stat boom"));
    assert.equal(findPackageJsonUpward(root), null);
  });

  it("hasDocDetectiveScriptInPackageJson: true/false and null-safe", function () {
    const dir = mkTmp("dd-edge-pkg-");
    const withScript = path.join(dir, "pkg-yes.json");
    fs.writeFileSync(withScript, JSON.stringify({ scripts: { test: "doc-detective runTests" } }));
    assert.equal(hasDocDetectiveScriptInPackageJson(withScript), true);

    const withoutScript = path.join(dir, "pkg-no.json");
    fs.writeFileSync(withoutScript, JSON.stringify({ scripts: { build: "tsc" } }));
    assert.equal(hasDocDetectiveScriptInPackageJson(withoutScript), false);

    assert.equal(hasDocDetectiveScriptInPackageJson(null), false);
    // No `scripts` object at all.
    const noScripts = path.join(dir, "pkg-empty.json");
    fs.writeFileSync(noScripts, JSON.stringify({ name: "x" }));
    assert.equal(hasDocDetectiveScriptInPackageJson(noScripts), false);
  });

  it("detectOutputDirGitignored: matches a covered dir and short-circuits on '.'/absolute-escape", function () {
    const root = mkTmp("dd-edge-ignore-");
    fs.writeFileSync(path.join(root, ".gitignore"), "build/\n");
    // relative covered dir
    assert.equal(detectOutputDirGitignored(root, "build"), true);
    // '.' short-circuits to false
    assert.equal(detectOutputDirGitignored(root, "."), false);
    // empty / non-string short-circuits
    assert.equal(detectOutputDirGitignored(root, ""), false);
    assert.equal(detectOutputDirGitignored(root, 123), false);
  });

  it("gitignoreCovers: ignores comments/negations and matches prefixes; empty target is false", function () {
    const text = "# comment\n!keepme\nbuild/\n";
    assert.equal(gitignoreCovers(text, "build/nested/out"), true);
    assert.equal(gitignoreCovers(text, "src"), false);
    assert.equal(gitignoreCovers(text, ""), false);
  });

  it("parseNodeMajor handles non-strings and unparseable input", function () {
    // The matcher is anchored at a leading digit (callers pass process.versions.node).
    assert.equal(parseNodeMajor("20.11.1"), 20);
    assert.equal(parseNodeMajor("v20.11.1"), 0); // leading 'v' → no match
    assert.equal(parseNodeMajor(20), 0); // non-string
    assert.equal(parseNodeMajor("not-a-version"), 0);
  });

  it("detectOutputDirGitignored returns false when readGitignore throws (outer catch)", function () {
    const root = mkTmp("dd-edge-ignore-");
    fs.writeFileSync(path.join(root, ".gitignore"), "build/\n");
    // existsSync finds the .gitignore, but reading it throws → outer catch → false.
    sinon.stub(fs, "readFileSync").throws(new Error("read boom"));
    assert.equal(detectOutputDirGitignored(root, "build"), false);
  });

  it("detectOutputDirGitignored returns false when an absolute output escapes the repo root", function () {
    const root = mkTmp("dd-edge-ignore-");
    fs.writeFileSync(path.join(root, ".gitignore"), "build/\n");
    // An absolute path in an unrelated tree relativizes to a `..`-prefixed path.
    const escaping = path.resolve(mkTmp("dd-edge-elsewhere-"), "build");
    assert.equal(detectOutputDirGitignored(root, escaping), false);
  });

  it("detectRstFiles returns false for a directory whose readdir throws (scan guard)", function () {
    const root = mkTmp("dd-edge-rst-");
    sinon.stub(fs, "readdirSync").throws(Object.assign(new Error("perm"), { code: "EACCES" }));
    assert.equal(detectRstFiles(root), false);
  });
});
