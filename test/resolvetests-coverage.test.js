// Coverage-closing tests for the reachable-but-unexercised branches in
// `src/core/resolveTests.ts` (measured against compiled `dist/core/resolveTests.js`).
//
// Fully HERMETIC and OFFLINE:
//   - `resolveContexts` is a pure transform — the browser/platform
//     normalization branches (string form, bare-object form) are driven by
//     passing hand-built context objects, no driver or schema round-trip.
//   - `fetchOpenApiDocuments` (internal; reached through the public
//     `resolveTests`) reads OpenAPI descriptions off disk via `loadDescription`
//     -> `readFile`. The happy path points at a minimal JSON file written to a
//     temp dir; the failure path points at a nonexistent file (readFile returns
//     null -> dereference throws -> the collector's catch/continue runs); the
//     name-dedup path pairs a config-provided doc with a spec-provided doc of
//     the same name so the splice-then-replace branch executes.
//
// Every temp dir is removed in `afterEach`, so nothing leaks into the rest of
// the combined suite.

import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  resolveContexts,
  resolveTests,
} from "../dist/core/resolveTests.js";

const config = { logLevel: "silent" };

describe("resolveTests coverage: resolveContexts normalization", function () {
  // `goTo` is a browser/driver step, so browserRequired is true and each
  // context expands into platform+browser pairs (the branch we want to hit).
  const driverTest = { testId: "t", steps: [{ goTo: { url: "https://x" } }] };

  it("normalizes a bare-string `browsers` value into a single-browser array", function () {
    const contexts = [{ platforms: ["linux"], browsers: "chrome" }];
    const resolved = resolveContexts({ contexts, test: driverTest, config });
    assert.equal(resolved.length, 1);
    assert.equal(resolved[0].platform, "linux");
    assert.deepEqual(resolved[0].browser, { name: "chrome", explicit: true });
  });

  it("normalizes a bare-object `browsers` value into a single-browser array", function () {
    const contexts = [{ platforms: ["linux"], browsers: { name: "firefox" } }];
    const resolved = resolveContexts({ contexts, test: driverTest, config });
    assert.equal(resolved.length, 1);
    assert.deepEqual(resolved[0].browser, { name: "firefox", explicit: true });
  });

  it("normalizes a bare-string `platforms` value into an array", function () {
    const contexts = [{ platforms: "linux", browsers: ["chrome"] }];
    const resolved = resolveContexts({ contexts, test: driverTest, config });
    assert.equal(resolved.length, 1);
    assert.equal(resolved[0].platform, "linux");
  });

  it("rewrites a `safari` browser name to `webkit`", function () {
    const contexts = [{ platforms: ["mac"], browsers: ["safari"] }];
    const resolved = resolveContexts({ contexts, test: driverTest, config });
    assert.equal(resolved[0].browser.name, "webkit");
  });
});

describe("resolveTests coverage: fetchOpenApiDocuments", function () {
  let tmp;
  beforeEach(function () {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), "dd-resolve-oapi-"));
  });
  afterEach(function () {
    fs.rmSync(tmp, { recursive: true, force: true });
  });

  function makeSpec(openApi) {
    return {
      specId: "docs/x.json",
      contentPath: path.join(process.cwd(), "docs", "x.json"),
      openApi,
      runOn: [],
      tests: [
        {
          testId: "t",
          steps: [{ runShell: { command: "echo hi" } }],
          openApi: [],
        },
      ],
    };
  }

  it("loads a valid descriptionPath and attaches the dereferenced definition", async function () {
    const file = path.join(tmp, "api.json");
    fs.writeFileSync(
      file,
      JSON.stringify({
        openapi: "3.0.0",
        info: { title: "t", version: "1" },
        paths: {},
      })
    );
    const spec = makeSpec([{ name: "api", descriptionPath: file }]);
    const resolved = await resolveTests({ config, detectedTests: [spec] });
    const docs = resolved.specs[0].openApi;
    assert.equal(docs.length, 1);
    assert.equal(docs[0].name, "api");
    assert.ok(docs[0].definition, "dereferenced definition attached");
  });

  it("continues past a descriptionPath that fails to load", async function () {
    const spec = makeSpec([
      { name: "missing", descriptionPath: path.join(tmp, "does-not-exist.json") },
    ]);
    const resolved = await resolveTests({ config, detectedTests: [spec] });
    // The failed definition is skipped via `continue`, so it never lands in
    // the resolved openApi list.
    assert.equal(resolved.specs[0].openApi.length, 0);
  });

  it("dedupes by name, replacing a config-provided doc with the spec-provided one", async function () {
    const file = path.join(tmp, "api.json");
    fs.writeFileSync(file, JSON.stringify({ openapi: "3.0.0" }));
    const cfg = {
      ...config,
      integrations: { openApi: [{ name: "api", definition: { fromConfig: true } }] },
    };
    const spec = makeSpec([{ name: "api", descriptionPath: file }]);
    const resolved = await resolveTests({ config: cfg, detectedTests: [spec] });
    const apiDocs = resolved.specs[0].openApi.filter((d) => d.name === "api");
    // The config-provided "api" was spliced out and replaced by the
    // spec-provided one (which carries a descriptionPath).
    assert.equal(apiDocs.length, 1);
    assert.ok(
      apiDocs[0].descriptionPath,
      "kept the spec-provided doc, not the config stub"
    );
  });

  it("memoizes loadDescription across tests sharing one description path (item 3.3)", async function () {
    // Two tests each declare their OWN openApi entry pointing at the SAME
    // description file. With no spec-level openApi to pre-attach a definition,
    // the first test loads + caches the path and the second hits the per-run
    // cache (distinct entry object, so it can't reuse an attached definition —
    // this is the path-keyed branch). Both must resolve identically.
    const file = path.join(tmp, "shared.json");
    fs.writeFileSync(
      file,
      JSON.stringify({
        openapi: "3.0.0",
        info: { title: "shared", version: "1" },
        paths: {},
      })
    );
    const spec = {
      specId: "docs/shared.json",
      contentPath: path.join(process.cwd(), "docs", "shared.json"),
      openApi: [],
      runOn: [],
      tests: [
        {
          testId: "t1",
          steps: [{ runShell: { command: "echo hi" } }],
          openApi: [{ name: "shared", descriptionPath: file }],
        },
        {
          testId: "t2",
          steps: [{ runShell: { command: "echo hi" } }],
          openApi: [{ name: "shared", descriptionPath: file }],
        },
      ],
    };
    const resolved = await resolveTests({ config, detectedTests: [spec] });
    const [t1, t2] = resolved.specs[0].tests;
    const d1 = t1.openApi.find((d) => d.name === "shared");
    const d2 = t2.openApi.find((d) => d.name === "shared");
    assert.ok(d1?.definition, "first test attached the dereferenced definition");
    assert.ok(d2?.definition, "second test attached the dereferenced definition");
    // Identical resolution: the memoized load yields the same dereferenced doc.
    assert.deepEqual(d2.definition, d1.definition);
  });

  it("assigns a random-UUID specId when neither specId nor contentPath is present", async function () {
    const spec = {
      openApi: [],
      runOn: [],
      tests: [
        { testId: "t", steps: [{ runShell: { command: "echo hi" } }], openApi: [] },
      ],
    };
    const resolved = await resolveTests({ config, detectedTests: [spec] });
    assert.match(
      resolved.specs[0].specId,
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
    );
  });
});
