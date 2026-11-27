import assert from "node:assert/strict";
import { resolveTests } from "../dist/core/resolveTests.js";
import { resolvePaths } from "../dist/core/files.js";

describe("resolvePaths leaves `matrix` values alone (ADR 01240)", function () {
  for (const objectType of ["spec", "config"]) {
    it(`doesn't treat a ${objectType} matrix key named like a path key as paths`, async function () {
      const object = {
        runOn: [{ matrix: { path: ["a.png", "b.png"], directory: ["x"] } }],
        ...(objectType === "spec" ? { tests: [{ steps: [{ runShell: "echo $$matrix.path $$matrix.directory" }] }] } : {}),
      };
      const resolved = await resolvePaths({
        config: { relativePathBase: "file" },
        object,
        filePath: "/abs/dir/file.json",
        objectType,
      });
      assert.deepEqual(resolved.runOn[0].matrix, { path: ["a.png", "b.png"], directory: ["x"] });
    });
  }
});

const variant = [
  { theme: "light", dpr: 1 },
  { theme: "dark", dpr: 2 },
];

describe("resolveTests with a matrix (ADR 01240)", function () {
  const config = { logLevel: "silent" };
  const spec = (tests, extra = {}) => ({ specId: "s", contentPath: "/abs/s.spec.json", openApi: [], tests, ...extra });
  const resolve = async (specs) => {
    const cfg = { ...config };
    const resolved = await resolveTests({ config: cfg, detectedTests: specs });
    return { resolved, invalid: cfg._invalidSpecs ?? [] };
  };

  it("expands a scalar key used in steps into one context per value", async function () {
    const { resolved } = await resolve([
      spec([{ testId: "t", runOn: [{ matrix: { locale: ["en", "de"] } }], steps: [{ runShell: "echo $$matrix.locale" }] }]),
    ]);
    const contexts = resolved.specs[0].tests[0].contexts;
    assert.deepEqual(contexts.map((c) => c.contextId), ["default~locale=en", "default~locale=de"]);
    assert.deepEqual(contexts.map((c) => c.steps[0].runShell), ["echo en", "echo de"]);
    assert.deepEqual(contexts[1].matrix, { locale: "de" });
  });

  it("substitutes object leaves into the context browser and keeps types", async function () {
    const { resolved } = await resolve([
      spec([
        {
          testId: "t",
          runOn: [
            {
              platforms: "linux",
              browsers: { name: "chrome", colorScheme: "$$matrix.variant.theme", deviceScaleFactor: "$$matrix.variant.dpr" },
              matrix: { variant },
            },
          ],
          steps: [{ goTo: "https://x" }],
        },
      ]),
    ]);
    const contexts = resolved.specs[0].tests[0].contexts;
    assert.deepEqual(contexts.map((c) => c.contextId), ["linux-chrome~variant=light-1", "linux-chrome~variant=dark-2"]);
    assert.equal(contexts[1].browser.colorScheme, "dark");
    assert.equal(contexts[1].browser.deviceScaleFactor, 2);
    assert.deepEqual(contexts[1].matrix, { variant: variant[1] });
  });

  it("suffixes an authored contextId", async function () {
    const { resolved } = await resolve([
      spec([{ testId: "t", runOn: [{ contextId: "mine", matrix: { a: [1, 2] } }], steps: [{ runShell: "echo $$matrix.a" }] }]),
    ]);
    assert.deepEqual(resolved.specs[0].tests[0].contexts.map((c) => c.contextId), ["mine~a=1", "mine~a=2"]);
  });

  it("doesn't expand an inherited key a test doesn't reference", async function () {
    const { resolved, invalid } = await resolve([
      spec(
        [
          { testId: "uses", steps: [{ runShell: "echo $$matrix.a" }] },
          { testId: "ignores", steps: [{ runShell: "echo hi" }] },
        ],
        { runOn: [{ matrix: { a: [1, 2] } }] }
      ),
    ]);
    assert.deepEqual(invalid, []);
    const [uses, ignores] = resolved.specs[0].tests;
    assert.equal(uses.contexts.length, 2);
    assert.equal(ignores.contexts.length, 1);
    assert.equal(ignores.contexts[0].contextId, "default");
    assert.equal(ignores.contexts[0].matrix, undefined);
  });

  it("keeps the runner's hidden `after` marker on substituted steps", async function () {
    const cleanup = { runShell: "echo bye $$matrix.a" };
    Object.defineProperty(cleanup, "_fromAfter", { value: true, enumerable: false, writable: true, configurable: true });
    const { resolved } = await resolve([
      spec([{ testId: "t", runOn: [{ matrix: { a: [1, 2] } }], steps: [{ runShell: "echo $$matrix.a" }, cleanup] }]),
    ]);
    for (const context of resolved.specs[0].tests[0].contexts) {
      const step = context.steps[1];
      assert.equal(step._fromAfter, true);
      assert.equal(Object.keys(step).includes("_fromAfter"), false);
    }
  });

  it("keeps combinations distinct in the duplicate check", async function () {
    const { resolved } = await resolve([
      spec([
        {
          testId: "t",
          runOn: [{ platforms: "linux", matrix: { a: ["x", "y"] } }],
          steps: [{ runShell: "echo $$matrix.a" }],
        },
      ]),
    ]);
    assert.equal(resolved.specs[0].tests[0].contexts.length, 2);
  });

  const invalidCases = [
    [
      "a reference to a key the context lacks",
      { runOn: [{ platforms: "linux", matrix: { a: [1, 2] } }, { platforms: "windows" }], steps: [{ runShell: "echo $$matrix.a" }] },
      "tests[0]: `$$matrix.a` names no `matrix` key in context `windows`.",
    ],
    [
      "a missing object field",
      { runOn: [{ matrix: { variant } }], steps: [{ runShell: "echo $$matrix.variant.size" }] },
      "tests[0]: `$$matrix.variant.size` names no field of `matrix` key `variant`.",
    ],
    [
      "an unused key on a test-authored runOn",
      { runOn: [{ matrix: { theme: ["a", "b"] } }], steps: [{ runShell: "echo hi" }] },
      "tests[0]: `matrix` key `theme` isn't used. Reference it as `$$matrix.theme` or remove it.",
    ],
    [
      "a fixed output path",
      { runOn: [{ matrix: { a: [1, 2] } }], steps: [{ runShell: "echo $$matrix.a" }, { saveState: "/abs/state.json" }] },
      "tests[0]: step 2's `path` `/abs/state.json` is the same for every `matrix` combination. Add `$$matrix.a` to it.",
    ],
    [
      "two values that give one context ID",
      { runOn: [{ matrix: { a: ["a/b", "a-b"] } }], steps: [{ runShell: "echo $$matrix.a" }] },
      "tests[0]: `matrix` values `a/b` and `a-b` give the same context ID.",
    ],
  ];
  for (const [name, test, message] of invalidCases) {
    it(`marks the spec invalid for ${name}`, async function () {
      const { resolved, invalid } = await resolve([spec([{ testId: "t", ...test }])]);
      assert.deepEqual(invalid, [{ path: "/abs/s.spec.json", reason: message }]);
      assert.equal(resolved.specs.length, 0);
    });
  }
});
