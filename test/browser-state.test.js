// The browser-state helpers shared by saveCookie, loadCookie, saveState and
// loadState, against a fake driver.
import path from "node:path";
import fs from "node:fs";
import os from "node:os";
import crypto from "node:crypto";
import assert from "node:assert/strict";
import sinon from "sinon";
import {
  resolveStatePath,
  readCookies,
  toDriverCookie,
  applyCookies,
  parseStateFile,
  formatStateFile,
  publishFile,
} from "../dist/core/tests/browserState.js";
import { formatCookieForNetscape } from "../dist/core/tests/saveCookie.js";
import { parseNetscapeCookieFile } from "../dist/core/tests/loadCookie.js";

const future = Math.floor(Date.now() / 1000) + 3600;
const past = Math.floor(Date.now() / 1000) - 3600;

describe("browser state helpers", function () {
  describe("resolveStatePath", function () {
    it("resolves against directory, then outputDir, then the working directory", function () {
      const dir = path.resolve("/a");
      const out = path.resolve("/out");
      assert.equal(resolveStatePath({ outputDir: out }, { path: "s.json", directory: dir }), path.join(dir, "s.json"));
      assert.equal(resolveStatePath({ outputDir: out }, { path: "s.json" }), path.join(out, "s.json"));
      assert.equal(resolveStatePath({}, { path: "s.json" }), path.resolve("s.json"));
    });
  });

  describe("readCookies", function () {
    const driver = {
      getCookies: async () => [
        { name: "a", domain: ".example.com" },
        { name: "b", domain: "app.example.com" },
        { name: "a", domain: "other.org" },
      ],
    };

    it("returns every cookie with no filter", async function () {
      assert.equal((await readCookies(driver)).length, 3);
    });

    it("filters by name and domain", async function () {
      assert.deepEqual(
        (await readCookies(driver, { name: "a", domain: "example.com" })).map((c) => c.domain),
        [".example.com"]
      );
      assert.deepEqual(
        (await readCookies(driver, { domain: "example.com" })).map((c) => c.name),
        ["a", "b"]
      );
    });
  });

  describe("toDriverCookie", function () {
    it("keeps sameSite None and forces secure on HTTPS", function () {
      const c = toDriverCookie({ name: "n", value: "v", sameSite: "none", domain: "example.com" }, "https://example.com/");
      assert.equal(c.sameSite, "None");
      assert.equal(c.secure, true);
      assert.equal(c.domain, "example.com");
    });

    it("falls back to Lax for sameSite None on HTTP", function () {
      const c = toDriverCookie({ name: "n", value: "v", sameSite: "None" }, "http://example.com/");
      assert.equal(c.sameSite, "Lax");
      assert.equal(c.secure, false);
    });

    it("normalizes Strict and defaults to Lax", function () {
      assert.equal(toDriverCookie({ name: "n", sameSite: "strict" }, "http://x.com/").sameSite, "Strict");
      assert.equal(toDriverCookie({ name: "n" }, "http://x.com/").sameSite, "Lax");
    });

    it("leaves the domain to the browser on localhost and private addresses", function () {
      for (const url of ["http://localhost:8092/", "http://127.0.0.1/", "http://192.168.1.2/", "http://10.0.0.1/", "http://172.16.0.1/"]) {
        assert.equal(toDriverCookie({ name: "n", domain: "localhost" }, url).domain, undefined, url);
      }
      assert.equal(toDriverCookie({ name: "n", domain: "8.8.8.8" }, "http://8.8.8.8/").domain, "8.8.8.8");
    });

    it("keeps a future expiry, and leaves a session cookie without one", function () {
      assert.equal(toDriverCookie({ name: "n", expiry: future }, "http://x.com/").expiry, future);
      assert.equal(toDriverCookie({ name: "n" }, "http://x.com/").expiry, undefined);
    });

    it("keeps a past expiry rather than turning the cookie into a session cookie", function () {
      assert.equal(toDriverCookie({ name: "n", expiry: past }, "http://x.com/").expiry, past);
    });

    it("defaults path to / and httpOnly to false", function () {
      const c = toDriverCookie({ name: "n", value: "v" }, "http://x.com/");
      assert.equal(c.path, "/");
      assert.equal(c.httpOnly, false);
    });
  });

  describe("applyCookies", function () {
    it("sets only the cookies whose domain fits the page, one call each", async function () {
      const set = [];
      const driver = { setCookies: async (c) => set.push(c) };
      const applied = await applyCookies(
        driver,
        [
          { name: "parent", domain: ".example.com" },
          { name: "host", domain: "app.example.com" },
          { name: "none" },
          { name: "other", domain: "other.org" },
          { name: "sibling", domain: "api.example.com" },
        ],
        "https://app.example.com/page"
      );
      assert.deepEqual(applied.map((c) => c.name), ["parent", "host", "none"]);
      assert.deepEqual(set.map((c) => c.name), ["parent", "host", "none"]);
    });

    it("skips an expired cookie instead of setting it as a session cookie", async function () {
      const set = [];
      const driver = { setCookies: async (c) => set.push(c) };
      const applied = await applyCookies(
        driver,
        [
          { name: "expired", domain: "x.com", expiry: past },
          { name: "live", domain: "x.com", expiry: future },
          { name: "session", domain: "x.com" },
        ],
        "https://x.com/"
      );
      assert.deepEqual(applied.map((c) => c.name), ["live", "session"]);
      assert.deepEqual(set.map((c) => [c.name, c.expiry]), [["live", future], ["session", undefined]]);
    });

    it("keeps the expiry of a cookie that expires while an earlier one is being set", async function () {
      const clock = sinon.useFakeTimers({ now: 1_000_000_000_000, toFake: ["Date"] });
      try {
        const soon = Math.floor(Date.now() / 1000) + 1;
        const set = [];
        // Setting the first cookie takes 5 seconds, so the second expires meanwhile.
        const driver = { setCookies: async (c) => { set.push(c); clock.tick(5000); } };
        await applyCookies(driver, [{ name: "a", domain: "x.com" }, { name: "b", domain: "x.com", expiry: soon }], "https://x.com/");
        assert.equal(set[1].expiry, soon, "a cookie that expired mid-apply is not a session cookie");
      } finally {
        clock.restore();
      }
    });
  });

  describe("publishFile", function () {
    let dir;
    beforeEach(function () {
      dir = fs.mkdtempSync(path.join(os.tmpdir(), "dd-publish-"));
    });
    afterEach(function () {
      sinon.restore();
      fs.rmSync(dir, { recursive: true, force: true });
    });

    it("names its temp file with a random UUID", function () {
      const spy = sinon.spy(crypto, "randomUUID");
      const open = sinon.spy(fs, "openSync");
      publishFile(path.join(dir, "a.json"), "{}", false);
      assert.equal(spy.callCount, 1);
      assert.deepEqual(open.firstCall.args, [`${path.join(dir, "a.json")}.${spy.firstCall.returnValue}.tmp`, "wx", 0o600]);
    });

    it("never deletes a temp file another writer created", function () {
      const file = path.join(dir, "a.json");
      sinon.stub(crypto, "randomUUID").returns("same");
      const theirs = `${file}.same.tmp`;
      fs.writeFileSync(theirs, "theirs");
      assert.throws(() => publishFile(file, "{}", false));
      assert.equal(fs.readFileSync(theirs, "utf8"), "theirs");
      assert.ok(!fs.existsSync(file));
    });

    it("never deletes another writer's temp file when the open fails for another reason", function () {
      const file = path.join(dir, "a.json");
      sinon.stub(crypto, "randomUUID").returns("same");
      const theirs = `${file}.same.tmp`;
      fs.writeFileSync(theirs, "theirs");
      const emfile = () => Object.assign(new Error("EMFILE: too many open files"), { code: "EMFILE" });
      sinon.stub(fs, "openSync").throws(emfile());
      sinon.stub(fs, "writeFileSync").throws(emfile());
      assert.throws(() => publishFile(file, "{}", false), /EMFILE/);
      sinon.restore();
      assert.equal(fs.readFileSync(theirs, "utf8"), "theirs");
    });
  });

  describe("formatStateFile", function () {
    it("writes `expires` -1 for any expiry that isn't a positive time", function () {
      const expires = (expiry) =>
        JSON.parse(formatStateFile({ cookies: [{ name: "a", value: "1", expiry }], origin: "https://x.com", localStorage: [] })).cookies[0].expires;
      assert.equal(expires(future), future);
      for (const expiry of [undefined, null, 0, -5]) assert.equal(expires(expiry), -1, String(expiry));
    });
  });

  describe("parseStateFile", function () {
    it("accepts cookie-only and localStorage-only files", function () {
      assert.ok(parseStateFile(JSON.stringify({ cookies: [{ name: "a", value: "1", domain: "x.com" }] })));
      assert.ok(parseStateFile(JSON.stringify({ origins: [{ origin: "https://x.com", localStorage: [{ name: "a", value: "1" }] }] })));
    });

    for (const [label, state] of [
      ["a cookie that isn't an object", { cookies: ["a"] }],
      ["a cookie without a string name", { cookies: [{ value: "1" }] }],
      ["a cookie without a string value", { cookies: [{ name: "a", value: 1 }] }],
      ["a cookie with a non-string domain", { cookies: [{ name: "a", value: "1", domain: 5 }] }],
      ["an origin that isn't an object", { origins: [null] }],
      ["an origin without a string origin", { origins: [{ localStorage: [] }] }],
      ["an origin whose localStorage isn't a list", { origins: [{ origin: "https://x.com", localStorage: {} }] }],
      ["a localStorage entry without a string value", { origins: [{ origin: "https://x.com", localStorage: [{ name: "a", value: 1 }] }] }],
    ]) {
      it(`rejects ${label}`, function () {
        assert.equal(parseStateFile(JSON.stringify(state)), null);
      });
    }
  });

  describe("Netscape cookie file", function () {
    // The standard 7 columns, so curl reads the file. httpOnly survives through
    // curl's `#HttpOnly_` prefix. The format has no place for sameSite, so it
    // comes back as the default, Lax.
    it("writes 7 columns and round-trips httpOnly", function () {
      for (const cookie of [
        { name: "a", value: "1", domain: ".example.com", path: "/", secure: true, httpOnly: true, sameSite: "Strict", expiry: future },
        { name: "b", value: "2", domain: "example.com", path: "/app", secure: false, httpOnly: false, sameSite: "None", expiry: future },
      ]) {
        const line = formatCookieForNetscape(cookie);
        assert.equal(line.replace(/^#HttpOnly_/, "").split("\t").length, 7, line);
        assert.equal(line.startsWith("#HttpOnly_"), cookie.httpOnly);
        const [parsed] = parseNetscapeCookieFile(line + "\n");
        assert.deepEqual(parsed, { ...cookie, sameSite: "Lax" });
      }
    });
  });
});
