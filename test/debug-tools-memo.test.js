// probeAllTools memoizes its spawn-based system-tool probes per process,
// keyed on the PATH the probes resolve against (ADR 01123).
import path from "node:path";
import assert from "node:assert/strict";
import { probeAllTools, probeSystemTools } from "../dist/debug/tools.js";

const SPAWNED = ["npm", "npx", "python", "java", "git", "docker"];

describe("probeAllTools memo", function () {
  this.timeout(30000);

  it("reuses the spawn-based probe results for an unchanged PATH", async function () {
    const a = await probeAllTools();
    const b = await probeAllTools();
    assert.deepEqual(
      b.map((t) => t.name),
      a.map((t) => t.name),
      "print order is unchanged"
    );
    for (const name of SPAWNED) {
      assert.equal(
        b.find((t) => t.name === name),
        a.find((t) => t.name === name),
        `${name} should come from the memo`
      );
    }
    // Metadata reads stay per call: appium depends on cacheDir.
    assert.notEqual(
      b.find((t) => t.name === "appium"),
      a.find((t) => t.name === "appium")
    );
  });

  it("doesn't keep a rejected probe set, and still rejects for the caller", async function () {
    const key = Object.keys(process.env).find((k) => k.toLowerCase() === "path");
    const prev = process.env[key];
    try {
      // A PATH no other test uses, so the memo starts empty for it.
      process.env[key] = `${prev}${path.delimiter}${path.join("dd-memo-reject", "bin")}`;
      await assert.rejects(
        probeSystemTools(() => Promise.reject(new Error("probe boom"))),
        /probe boom/
      );
      const fresh = [{ name: "npm", version: "1.0.0" }];
      assert.equal(await probeSystemTools(async () => fresh), fresh);
    } finally {
      process.env[key] = prev;
    }
  });

  it("re-probes when PATH changes", async function () {
    const a = await probeAllTools();
    const key = Object.keys(process.env).find((k) => k.toLowerCase() === "path");
    const prev = process.env[key];
    try {
      process.env[key] = `${prev}${path.delimiter}${path.join("dd-memo-test", "bin")}`;
      const b = await probeAllTools();
      assert.notEqual(
        b.find((t) => t.name === "git"),
        a.find((t) => t.name === "git"),
        "a different PATH must not hit the memo"
      );
    } finally {
      process.env[key] = prev;
    }
  });
});
