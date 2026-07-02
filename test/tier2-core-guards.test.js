// Tier-2 coverage: hermetic guard/error-path tests for small core action
// handlers (loadVariables, wait, click) and appium-home resolution. Every
// test here is OFFLINE and driver-free (or uses a trivial in-line fake
// driver) — no browser, no network, no real subprocess. Targets the exact
// uncovered lines reported by the cross-platform coverage union (ADR 01017):
//
//   loadVariables.ts  21-24 (invalid step), 29-33 (loadEnvs FAIL)
//   wait.ts           13-16 (invalid step), 30-33 (NaN wait), 50-54 (pause throw)
//   click.ts          17-20 (invalid step)
//   appium.ts         31-35 (cache-installed appium home), + appiumHomeForDriverPath branches
//
// Input shapes are pinned to the v3 schemas so validation lands where
// intended: wait's string form must match `^\$[A-Za-z0-9_]+$` (an env-var
// ref), so "abc" is schema-INVALID while "$UNSET" is valid-but-NaN; click's
// object form requires one element* field, so `{ button }` alone fails the
// anyOf; loadVariables is a bare string, so an object can't coerce and is
// invalid.

import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { loadVariables } from "../dist/core/tests/loadVariables.js";
import { wait } from "../dist/core/tests/wait.js";
import { clickElement } from "../dist/core/tests/click.js";
import {
  setAppiumHome,
  appiumHomeForDriverPath,
} from "../dist/core/appium.js";

describe("Tier-2 core guard/error paths", function () {
  describe("loadVariables", function () {
    it("FAILs an invalid step definition (uncoercible object value)", async function () {
      // loadVariables is a bare string in the schema; an object can't coerce
      // to string, so step_v3 validation rejects it -> invalid-step branch.
      const result = await loadVariables({ step: { loadVariables: {} } });
      assert.equal(result.status, "FAIL");
      assert.match(result.description, /Invalid step definition/);
    });

    it("FAILs when the .env file does not exist (loadEnvs FAIL)", async function () {
      const missing = path.join(
        os.tmpdir(),
        "dd-nonexistent-" + process.pid + ".env"
      );
      const result = await loadVariables({ step: { loadVariables: missing } });
      assert.equal(result.status, "FAIL");
      assert.match(result.description, /Couldn't set variables/);
    });

    it("PASSes and sets vars from a real .env file", async function () {
      const dir = fs.mkdtempSync(path.join(os.tmpdir(), "dd-loadvars-"));
      const envFile = path.join(dir, ".env");
      const key = "DD_TIER2_LOADVARS_" + process.pid;
      delete process.env[key];
      fs.writeFileSync(envFile, `${key}=hello\n`);
      try {
        const result = await loadVariables({ step: { loadVariables: envFile } });
        assert.equal(result.status, "PASS");
        assert.equal(process.env[key], "hello");
      } finally {
        delete process.env[key];
        fs.rmSync(dir, { recursive: true, force: true });
      }
    });
  });

  describe("wait", function () {
    it("FAILs an invalid step definition (non-env-ref string)", async function () {
      // wait's string form must match ^\$[A-Za-z0-9_]+$, so "abc" is invalid.
      const result = await wait({ step: { wait: "abc" }, driver: undefined });
      assert.equal(result.status, "FAIL");
      assert.match(result.description, /Invalid step definition/);
    });

    it("FAILs a valid env-ref string that parses to NaN", async function () {
      // "$DD_UNSET..." satisfies the schema pattern but is not substituted in
      // a direct unit call, so parseInt() yields NaN -> the invalid-wait branch.
      const result = await wait({
        step: { wait: "$DD_UNSET_WAIT_VALUE" },
        driver: undefined,
      });
      assert.equal(result.status, "FAIL");
      assert.match(result.description, /Invalid wait value/);
    });

    it("FAILs when driver.pause throws (outer catch)", async function () {
      const driver = {
        pause: async () => {
          throw new Error("pause boom");
        },
      };
      const result = await wait({ step: { wait: 5 }, driver });
      assert.equal(result.status, "FAIL");
      assert.match(result.description, /Couldn't wait/);
      assert.match(result.description, /pause boom/);
    });

    it("PASSes via driver.pause when a driver is present", async function () {
      let paused = -1;
      const driver = {
        pause: async (ms) => {
          paused = ms;
        },
      };
      const result = await wait({ step: { wait: 7 }, driver });
      assert.equal(result.status, "PASS");
      assert.equal(paused, 7);
    });
  });

  describe("click", function () {
    it("FAILs an invalid step definition (object missing an element field)", async function () {
      // The click object form requires one of selector/elementText/... —
      // `{ button }` alone fails the anyOf, so step_v3 rejects it.
      const result = await clickElement({
        config: {},
        step: { click: { button: "left" } },
        driver: undefined,
      });
      assert.equal(result.status, "FAIL");
      assert.match(result.description, /Invalid step definition/);
    });
  });

  describe("appium setAppiumHome / appiumHomeForDriverPath", function () {
    it("appiumHomeForDriverPath returns the pre-node_modules dir, or null with no marker", function () {
      const entry =
        path.join("root", "node_modules", "appium-geckodriver", "index.js");
      assert.equal(appiumHomeForDriverPath(entry), "root");
      assert.equal(appiumHomeForDriverPath("/no/marker/here/index.js"), null);
    });

    it("anchors APPIUM_HOME to <cacheDir>/runtime when a cache-installed appium exists", function () {
      const savedHome = process.env.APPIUM_HOME;
      const savedCacheEnv = process.env.DOC_DETECTIVE_CACHE_DIR;
      // DOC_DETECTIVE_CACHE_DIR takes precedence over ctx.cacheDir in
      // getCacheDir — clear it so the ctx path is honored.
      delete process.env.DOC_DETECTIVE_CACHE_DIR;
      const cacheDir = fs.mkdtempSync(path.join(os.tmpdir(), "dd-appium-cache-"));
      const runtimeAppium = path.join(
        cacheDir,
        "runtime",
        "node_modules",
        "appium"
      );
      fs.mkdirSync(runtimeAppium, { recursive: true });
      try {
        setAppiumHome({ cacheDir });
        assert.equal(
          process.env.APPIUM_HOME,
          path.join(cacheDir, "runtime")
        );
      } finally {
        if (savedHome === undefined) delete process.env.APPIUM_HOME;
        else process.env.APPIUM_HOME = savedHome;
        if (savedCacheEnv === undefined)
          delete process.env.DOC_DETECTIVE_CACHE_DIR;
        else process.env.DOC_DETECTIVE_CACHE_DIR = savedCacheEnv;
        fs.rmSync(cacheDir, { recursive: true, force: true });
      }
    });
  });
});
