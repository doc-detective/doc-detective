// saveState and loadState against a fake driver: the Playwright storageState
// file shape, reading a file Playwright wrote, and each message.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import assert from "node:assert/strict";
import sinon from "sinon";
import { saveState } from "../dist/core/tests/saveState.js";
import { loadState } from "../dist/core/tests/loadState.js";
import { resolvePaths } from "../dist/core/files.js";

const future = Math.floor(Date.now() / 1000) + 3600;

// A fake browser: one page URL, a cookie jar, and localStorage per origin.
// `scriptUrl` is where the page is when a script runs, to simulate a page that
// navigates away after `getUrl`. `laterUrl` is what every `getUrl` after the
// first returns, to simulate a page that navigates after the storage script.
// `navigate` moves the page to `to` around cookie write number `atSet`:
// "before" the write lands (so the cookie lands on the new host) or "after" it.
function fakeDriver({ url = "http://localhost:8092/app", scriptUrl = url, laterUrl = url, navigate, cookies = [], storage = {} } = {}) {
  const set = [];
  const deleted = [];
  let urlReads = 0;
  let current;
  const driver = {
    set,
    deleted,
    storage,
    getUrl: async () => current ?? (urlReads++ === 0 ? url : laterUrl),
    getCookies: async () => cookies,
    setCookies: async (cookie) => {
      if (navigate?.atSet === set.length && navigate.when === "before") current = navigate.to;
      set.push(cookie);
      if (navigate?.atSet === set.length - 1 && navigate.when === "after") current = navigate.to;
    },
    deleteCookies: async (name) => deleted.push(name),
    execute: async (script, expectedOrigin, entries) => {
      const origin = new URL(scriptUrl).origin;
      if (script.includes("setItem")) {
        if (origin !== expectedOrigin) return false;
        storage[origin] = { ...storage[origin] };
        for (const { name, value } of entries) storage[origin][name] = value;
        return true;
      }
      return { origin, entries: Object.entries(storage[origin] || {}).map(([name, value]) => ({ name, value })) };
    },
  };
  return driver;
}

describe("saveState and loadState", function () {
  let outputDir;
  beforeEach(function () {
    outputDir = fs.mkdtempSync(path.join(os.tmpdir(), "dd-state-"));
  });
  afterEach(function () {
    fs.rmSync(outputDir, { recursive: true, force: true });
  });
  const config = () => ({ outputDir });

  describe("saveState", function () {
    it("writes cookies and the origin's localStorage in Playwright's storageState shape", async function () {
      const driver = fakeDriver({
        cookies: [
          { name: "sid", value: "1", domain: "localhost", path: "/", secure: false, httpOnly: true, sameSite: "Strict", expiry: future },
          { name: "pref", value: "dark", domain: "localhost", path: "/" },
        ],
        storage: { "http://localhost:8092": { token: "abc" } },
      });
      const result = await saveState({ config: config(), step: { saveState: "auth.json" }, driver });
      assert.equal(result.status, "PASS", result.description);
      const file = path.join(outputDir, "auth.json");
      assert.equal(result.description, `Saved state to \`${file}\`.`);
      assert.deepEqual(result.outputs, { path: file, cookies: 2, localStorage: 1 });
      assert.deepEqual(JSON.parse(fs.readFileSync(file, "utf8")), {
        cookies: [
          { name: "sid", value: "1", domain: "localhost", path: "/", expires: future, httpOnly: true, secure: false, sameSite: "Strict" },
          { name: "pref", value: "dark", domain: "localhost", path: "/", expires: -1, httpOnly: false, secure: false, sameSite: "Lax" },
        ],
        origins: [{ origin: "http://localhost:8092", localStorage: [{ name: "token", value: "abc" }] }],
      });
    });

    it("writes no origin when localStorage is empty", async function () {
      const driver = fakeDriver({ cookies: [{ name: "sid", value: "1", domain: "localhost" }] });
      const result = await saveState({ config: config(), step: { saveState: "auth.json" }, driver });
      assert.equal(result.status, "PASS", result.description);
      assert.deepEqual(JSON.parse(fs.readFileSync(result.outputs.path, "utf8")).origins, []);
    });

    it("saves under directory and creates it", async function () {
      const directory = path.join(outputDir, "nested", ".auth");
      const result = await saveState({ config: config(), step: { saveState: { path: "a.json", directory } }, driver: fakeDriver() });
      assert.equal(result.status, "PASS", result.description);
      assert.ok(fs.existsSync(path.join(directory, "a.json")));
    });

    it("fails on an existing file unless overwrite is true", async function () {
      const file = path.join(outputDir, "auth.json");
      fs.writeFileSync(file, "{}");
      const failed = await saveState({ config: config(), step: { saveState: "auth.json" }, driver: fakeDriver() });
      assert.equal(failed.status, "FAIL");
      assert.equal(failed.description, `Couldn't save state: \`${file}\` exists. Set \`overwrite\` to \`true\` to replace it.`);
      assert.equal(fs.readFileSync(file, "utf8"), "{}", "the existing file is untouched");
      const passed = await saveState({ config: config(), step: { saveState: { path: "auth.json", overwrite: true } }, driver: fakeDriver() });
      assert.equal(passed.status, "PASS", passed.description);
      assert.deepEqual(fs.readdirSync(outputDir), ["auth.json"], "no temporary file is left behind");
    });

    it("leaves the previous file whole when writing the new state fails", async function () {
      const file = path.join(outputDir, "auth.json");
      fs.writeFileSync(file, '{"cookies":[]}');
      // The disk fills partway through the write.
      const realWrite = fs.writeFileSync;
      const stub = sinon.stub(fs, "writeFileSync").callsFake((target, data, options) => {
        realWrite(target, String(data).slice(0, 5), options);
        throw new Error("ENOSPC: no space left on device");
      });
      let result;
      try {
        result = await saveState({ config: config(), step: { saveState: { path: "auth.json", overwrite: true } }, driver: fakeDriver() });
      } finally {
        stub.restore();
      }
      assert.equal(result.status, "FAIL");
      assert.equal(fs.readFileSync(file, "utf8"), '{"cookies":[]}');
      assert.deepEqual(fs.readdirSync(outputDir), ["auth.json"], "no temporary file is left behind");
    });

    it("replaces a broadly readable file with an owner-only one", async function () {
      if (process.platform === "win32") this.skip();
      const file = path.join(outputDir, "auth.json");
      fs.writeFileSync(file, "{}", { mode: 0o644 });
      const result = await saveState({ config: config(), step: { saveState: { path: "auth.json", overwrite: true } }, driver: fakeDriver() });
      assert.equal(result.status, "PASS", result.description);
      assert.equal(fs.statSync(file).mode & 0o777, 0o600);
    });

    for (const url of ["about:blank", "data:,"]) {
      it(`fails when no site is open (${url})`, async function () {
        const result = await saveState({ config: config(), step: { saveState: "auth.json" }, driver: fakeDriver({ url }) });
        assert.equal(result.status, "FAIL");
        assert.equal(result.description, "Couldn't save state: no site is open. Use `goTo` first.");
        assert.ok(!fs.existsSync(path.join(outputDir, "auth.json")));
      });
    }

    it("creates the file readable by its owner only", async function () {
      if (process.platform === "win32") this.skip();
      const result = await saveState({ config: config(), step: { saveState: "auth.json" }, driver: fakeDriver() });
      assert.equal(fs.statSync(result.outputs.path).mode & 0o777, 0o600);
    });

    it("fails, and writes nothing, when the page changes origin while it saves", async function () {
      const driver = fakeDriver({ scriptUrl: "https://other.org/", storage: { "https://other.org": { a: "1" } } });
      const result = await saveState({ config: config(), step: { saveState: "auth.json" }, driver });
      assert.equal(result.status, "FAIL");
      assert.equal(result.description, "Couldn't save state: the page left `http://localhost:8092` while its state was read.");
      assert.ok(!fs.existsSync(path.join(outputDir, "auth.json")));
    });

    it("fails on an invalid step", async function () {
      const result = await saveState({ config: config(), step: { saveState: "auth.txt" }, driver: fakeDriver() });
      assert.equal(result.status, "FAIL");
      assert.match(result.description, /Couldn't run the step/);
    });
  });

  // The cookie path rule (ADR 01174): a `path` without `directory` joins
  // `outputDir` at run time, and a `directory` resolves against the spec file.
  describe("resolvePaths", function () {
    const specFile = path.resolve("/specs/sub/state.spec.json");
    const resolveSpec = (steps) =>
      resolvePaths({ config: { relativePathBase: "file" }, object: { tests: [{ steps }] }, filePath: specFile, objectType: "spec" });

    it("leaves a state path without a directory for the handler to join to outputDir", async function () {
      const spec = await resolveSpec([{ saveState: { path: "a.json" } }, { loadState: { path: "a.json" } }]);
      assert.equal(spec.tests[0].steps[0].saveState.path, "a.json");
      assert.equal(spec.tests[0].steps[1].loadState.path, "a.json");
    });

    it("resolves a state directory, and its path, against the spec file", async function () {
      const spec = await resolveSpec([{ loadState: { path: "a.json", directory: "../.auth" } }]);
      assert.equal(spec.tests[0].steps[0].loadState.directory, path.resolve("/specs/.auth"));
      assert.equal(spec.tests[0].steps[0].loadState.path, path.resolve("/specs/.auth/a.json"));
    });
  });

  describe("loadState", function () {
    const write = (name, state) => {
      const file = path.join(outputDir, name);
      fs.writeFileSync(file, typeof state === "string" ? state : JSON.stringify(state));
      return file;
    };

    it("round-trips what saveState wrote", async function () {
      const saver = fakeDriver({
        cookies: [{ name: "sid", value: "1", domain: "localhost", path: "/", httpOnly: true, sameSite: "Strict", expiry: future }],
        storage: { "http://localhost:8092": { token: "abc", theme: "dark" } },
      });
      await saveState({ config: config(), step: { saveState: "auth.json" }, driver: saver });

      const loader = fakeDriver();
      const result = await loadState({ config: config(), step: { loadState: "auth.json" }, driver: loader });
      assert.equal(result.status, "PASS", result.description);
      const file = path.join(outputDir, "auth.json");
      assert.equal(result.description, `Loaded state from \`${file}\`.`);
      assert.deepEqual(result.outputs, { path: file, cookies: 1, localStorage: 2 });
      assert.equal(loader.set[0].name, "sid");
      assert.equal(loader.set[0].httpOnly, true);
      assert.equal(loader.set[0].sameSite, "Strict");
      assert.equal(loader.set[0].expiry, future);
      assert.deepEqual(loader.storage["http://localhost:8092"], { token: "abc", theme: "dark" });
    });

    it("reads a file Playwright wrote and applies only what fits the open page", async function () {
      // The shape Playwright's `storageState({ path })` writes.
      write("pw.json", {
        cookies: [
          { name: "sid", value: "s", domain: ".example.com", path: "/", expires: -1, httpOnly: true, secure: true, sameSite: "Lax" },
          { name: "other", value: "o", domain: "other.org", path: "/", expires: future, httpOnly: false, secure: false, sameSite: "None" },
        ],
        origins: [
          { origin: "https://app.example.com", localStorage: [{ name: "token", value: "t" }] },
          { origin: "https://other.org", localStorage: [{ name: "x", value: "y" }] },
        ],
      });
      const driver = fakeDriver({ url: "https://app.example.com/home" });
      const result = await loadState({ config: config(), step: { loadState: "pw.json" }, driver });
      assert.equal(result.status, "PASS", result.description);
      assert.deepEqual(result.outputs.cookies, 1);
      assert.deepEqual(result.outputs.localStorage, 1);
      assert.deepEqual(driver.set.map((c) => c.name), ["sid"]);
      assert.equal(driver.set[0].expiry, undefined, "expires -1 is a session cookie");
      assert.deepEqual(driver.storage, { "https://app.example.com": { token: "t" } });
    });

    it("loads from directory", async function () {
      const directory = path.join(outputDir, "shared");
      fs.mkdirSync(directory);
      fs.writeFileSync(path.join(directory, "a.json"), JSON.stringify({ cookies: [{ name: "sid", value: "1", domain: "localhost", path: "/" }], origins: [] }));
      const result = await loadState({ config: config(), step: { loadState: { path: "a.json", directory } }, driver: fakeDriver() });
      assert.equal(result.status, "PASS", result.description);
      assert.equal(result.outputs.path, path.join(directory, "a.json"));
    });

    it("fails when the file is missing", async function () {
      const result = await loadState({ config: config(), step: { loadState: "auth.json" }, driver: fakeDriver() });
      assert.equal(result.status, "FAIL");
      assert.equal(result.description, `Couldn't load state: \`${path.join(outputDir, "auth.json")}\` doesn't exist.`);
    });

    for (const [label, content] of [
      ["not JSON", "{nope"],
      ["not an object", "[]"],
      ["no cookies or origins", "{}"],
      ["cookies not a list", '{"cookies":{}}'],
      ["origins not a list", '{"cookies":[],"origins":"x"}'],
    ]) {
      it(`fails when the file isn't a state file (${label})`, async function () {
        const file = write("auth.json", content);
        const result = await loadState({ config: config(), step: { loadState: "auth.json" }, driver: fakeDriver() });
        assert.equal(result.status, "FAIL");
        assert.equal(result.description, `Couldn't load state: \`${file}\` isn't a valid state file.`);
      });
    }

    it("fails when nothing in the file matches the open page", async function () {
      const file = write("auth.json", {
        cookies: [{ name: "sid", value: "1", domain: "other.org", path: "/" }],
        origins: [{ origin: "https://other.org", localStorage: [{ name: "x", value: "y" }] }],
      });
      const driver = fakeDriver({ url: "https://app.example.com/a?token=secret" });
      const result = await loadState({ config: config(), step: { loadState: "auth.json" }, driver });
      assert.equal(result.status, "FAIL");
      assert.equal(
        result.description,
        `Couldn't load state: \`${file}\` has no data for \`https://app.example.com\`. Use \`goTo\` to open that site first.`
      );
      assert.equal(driver.set.length, 0);
    });

    it("fails, and restores nothing, when the page leaves the origin before storage is restored", async function () {
      write("auth.json", {
        cookies: [{ name: "sid", value: "1", domain: "localhost", path: "/" }],
        origins: [{ origin: "http://localhost:8092", localStorage: [{ name: "a", value: "1" }] }],
      });
      const driver = fakeDriver({ scriptUrl: "https://other.org/" });
      const result = await loadState({ config: config(), step: { loadState: "auth.json" }, driver });
      assert.equal(result.status, "FAIL");
      assert.equal(result.description, "Couldn't load state: the page left `http://localhost:8092` before its state was restored.");
      assert.deepEqual(driver.storage, {});
      assert.equal(driver.set.length, 0);
    });

    it("fails, and sets no cookie, when the page leaves the origin before a cookie-only restore", async function () {
      write("auth.json", { cookies: [{ name: "sid", value: "1", domain: "localhost", path: "/" }] });
      const driver = fakeDriver({ scriptUrl: "http://127.0.0.1:9999/" });
      const result = await loadState({ config: config(), step: { loadState: "auth.json" }, driver });
      assert.equal(result.status, "FAIL");
      assert.equal(result.description, "Couldn't load state: the page left `http://localhost:8092` before its state was restored.");
      assert.equal(driver.set.length, 0);
    });

    for (const [label, navigate, expectedDeleted] of [
      // The page moves after the check for the last cookie, so that write lands
      // on the new host; the check after the loop catches it.
      ["after the check, before a cookie write", { atSet: 1, when: "before" }, ["a", "b"]],
      // The page moves after the first write; the check before the second catches it.
      ["between two cookie writes", { atSet: 0, when: "after" }, ["a"]],
    ]) {
      it(`fails, and deletes the cookies it set, when the page navigates ${label}`, async function () {
        write("auth.json", {
          cookies: [
            { name: "a", value: "1", domain: "localhost", path: "/" },
            { name: "b", value: "2", domain: "localhost", path: "/" },
          ],
        });
        const driver = fakeDriver({ navigate: { ...navigate, to: "http://127.0.0.1:9999/" } });
        const result = await loadState({ config: config(), step: { loadState: "auth.json" }, driver });
        assert.equal(result.status, "FAIL");
        assert.equal(result.description, "Couldn't load state: the page left `http://localhost:8092` before its state was restored.");
        assert.deepEqual(driver.deleted, expectedDeleted);
      });
    }

    it("fails, and sets no cookie, when the page leaves the origin after storage is restored", async function () {
      write("auth.json", {
        cookies: [{ name: "sid", value: "1", domain: "localhost", path: "/" }],
        origins: [{ origin: "http://localhost:8092", localStorage: [{ name: "a", value: "1" }] }],
      });
      const driver = fakeDriver({ laterUrl: "http://127.0.0.1:9999/" });
      const result = await loadState({ config: config(), step: { loadState: "auth.json" }, driver });
      assert.equal(result.status, "FAIL");
      assert.equal(result.description, "Couldn't load state: the page left `http://localhost:8092` before its state was restored.");
      assert.equal(driver.set.length, 0);
    });

    it("fails on a file with a malformed entry, before changing the browser", async function () {
      const file = write("auth.json", {
        cookies: [{ name: "sid", value: "1", domain: "localhost", path: "/" }],
        origins: [{ origin: "http://localhost:8092", localStorage: [{ name: "a", value: 1 }] }],
      });
      const driver = fakeDriver();
      const result = await loadState({ config: config(), step: { loadState: "auth.json" }, driver });
      assert.equal(result.description, `Couldn't load state: \`${file}\` isn't a valid state file.`);
      assert.equal(driver.set.length, 0);
    });

    it("fails when no site is open", async function () {
      write("auth.json", { cookies: [{ name: "sid", value: "1", domain: "localhost", path: "/" }], origins: [] });
      const result = await loadState({ config: config(), step: { loadState: "auth.json" }, driver: fakeDriver({ url: "data:," }) });
      assert.equal(result.status, "FAIL");
      assert.equal(result.description, "Couldn't load state: no site is open. Use `goTo` first.");
    });
  });
});
