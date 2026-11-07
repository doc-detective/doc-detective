// probeAllTools memoizes its spawn-based system-tool probes per process,
// keyed on the PATH the probes resolve against (ADR 01123). The memo tests
// inject controlled probe results, so no live spawn timing is involved.
import path from "node:path";
import assert from "node:assert/strict";
import {
  probeAllTools,
  probeSystemTools,
  runSystemProbes,
} from "../dist/debug/tools.js";

const pathKey = Object.keys(process.env).find((k) => k.toLowerCase() === "path");

// Run `fn` under a PATH no other test uses, so the memo starts empty for it.
async function withUniquePath(tag, fn) {
  const prev = process.env[pathKey];
  process.env[pathKey] = `${prev}${path.delimiter}${path.join(`dd-memo-${tag}-${Date.now()}`, "bin")}`;
  try {
    return await fn();
  } finally {
    process.env[pathKey] = prev;
  }
}

const ok = (name) => ({ name, version: `${name} 1.0.0` });

describe("probeAllTools memo", function () {
  it("reuses the probe set for an unchanged PATH", async function () {
    await withUniquePath("reuse", async () => {
      let runs = 0;
      const results = [ok("npm")];
      const run = async () => {
        runs += 1;
        return { results, timedOut: false };
      };
      const a = await probeSystemTools(run);
      const b = await probeSystemTools(run);
      assert.equal(runs, 1, "the second call must come from the memo");
      // Deliberate reference equality: the same array object means the
      // memoized result was returned, not a fresh probe set.
      assert.equal(a, results);
      assert.equal(b, results);
    });
  });

  it("re-probes when PATH changes", async function () {
    let runs = 0;
    const run = async () => {
      runs += 1;
      return { results: [ok("git")], timedOut: false };
    };
    await withUniquePath("path-a", () => probeSystemTools(run));
    await withUniquePath("path-b", () => probeSystemTools(run));
    assert.equal(runs, 2, "a different PATH must not hit the memo");
  });

  it("doesn't keep a set in which a probe timed out", async function () {
    await withUniquePath("timeout", async () => {
      let runs = 0;
      const run = async () => {
        runs += 1;
        return { results: [ok("npm")], timedOut: true };
      };
      await probeSystemTools(run);
      await probeSystemTools(run);
      assert.equal(runs, 2);
    });
  });

  it("doesn't keep a rejected probe set, and still rejects for the caller", async function () {
    await withUniquePath("reject", async () => {
      await assert.rejects(
        probeSystemTools(() => Promise.reject(new Error("probe boom"))),
        /probe boom/
      );
      const fresh = [ok("npm")];
      assert.equal(await probeSystemTools(async () => ({ results: fresh, timedOut: false })), fresh);
    });
  });

  it("flags a python3 timeout even when the python fallback answers", async function () {
    const probe = async (name) =>
      name === "python3"
        ? { name, version: "<timed out after 3000ms>" }
        : name === "python"
          ? { name, version: "Python 3.12.0" }
          : ok(name);
    const { results, timedOut } = await runSystemProbes(probe);
    assert.equal(timedOut, true, "the python3 attempt timed out");
    assert.deepEqual(
      results.find((r) => r.name === "python"),
      { name: "python", version: "Python 3.12.0", notes: undefined }
    );
    assert.deepEqual(
      results.map((r) => r.name),
      ["npm", "npx", "python", "java", "git", "docker"]
    );
  });

  it("reports no timeout when every attempt answers", async function () {
    const { timedOut } = await runSystemProbes(async (name) => ok(name));
    assert.equal(timedOut, false);
  });

  it("keeps the print order, and rebuilds the appium entry per call", async function () {
    this.timeout(30000);
    const a = await probeAllTools();
    const b = await probeAllTools();
    const order = ["node", "npm", "npx", "python", "java", "ffmpeg", "appium", "git", "docker"];
    assert.deepEqual(a.map((t) => t.name), order);
    assert.deepEqual(b.map((t) => t.name), order);
    // Metadata reads stay per call: appium depends on cacheDir.
    assert.notEqual(
      b.find((t) => t.name === "appium"),
      a.find((t) => t.name === "appium")
    );
  });
});
