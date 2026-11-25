// The browser-state helpers shared by saveCookie, loadCookie, saveState and
// loadState, against a fake driver.
import path from "node:path";
import assert from "node:assert/strict";
import {
  resolveStatePath,
  readCookies,
  toDriverCookie,
  applyCookies,
} from "../dist/core/tests/browserState.js";

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

    it("keeps a future expiry and drops a past one", function () {
      assert.equal(toDriverCookie({ name: "n", expiry: future }, "http://x.com/").expiry, future);
      assert.equal(toDriverCookie({ name: "n", expiry: past }, "http://x.com/").expiry, undefined);
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
  });
});
