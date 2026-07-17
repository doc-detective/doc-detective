// The annotate step's state machine. `applyAnnotateOps` and `pruneExpired` are
// pure and take an injected clock, so the whole add/update/clear/duration
// contract is testable without a browser.

import assert from "node:assert/strict";
import {
  applyAnnotateOps,
  pruneExpired,
  annotate,
  renderLayer,
} from "../dist/core/tests/annotate.js";

const NOW = 1_000_000;

describe("annotate/applyAnnotateOps", function () {
  it("adds annotations and reports them as new", function () {
    const { next, added, error } = applyAnnotateOps(
      [],
      { add: [{ id: "a", outline: "#x" }] },
      NOW
    );
    assert.equal(error, undefined);
    assert.equal(next.length, 1);
    assert.equal(next[0].id, "a");
    assert.deepEqual(added, ["a"]);
  });

  it("gives an anonymous annotation an internal id", function () {
    // Without an id an annotation can't be updated or cleared individually,
    // but the renderer still needs a handle for it.
    const { next, added } = applyAnnotateOps([], { add: [{ outline: "#x" }] }, NOW);
    assert.equal(next.length, 1);
    assert.ok(next[0].id);
    assert.equal(added.length, 1);
  });

  it("replaces an existing annotation when adding the same id", function () {
    const current = [{ id: "a", spec: { outline: "#old" } }];
    const { next } = applyAnnotateOps(
      current,
      { add: [{ id: "a", outline: "#new" }] },
      NOW
    );
    assert.equal(next.length, 1);
    assert.equal(next[0].spec.outline, "#new");
  });

  it("updates an annotation by id", function () {
    const current = [{ id: "guide", spec: { callout: "#a", label: "old" } }];
    const { next, error } = applyAnnotateOps(
      current,
      { update: [{ id: "guide", callout: "#b", label: "new" }] },
      NOW
    );
    assert.equal(error, undefined);
    assert.equal(next[0].spec.label, "new");
    assert.equal(next[0].spec.callout, "#b");
  });

  it("errors when updating an id that isn't on screen", function () {
    // The author expected something to be there. Silently adding it would hide
    // a typo'd or already-cleared id.
    const { error, next } = applyAnnotateOps(
      [{ id: "other", spec: { outline: "#x" } }],
      { update: [{ id: "missing", outline: "#y" }] },
      NOW
    );
    assert.ok(error);
    assert.match(error, /No annotation with id "missing"/);
    // State is left untouched on error.
    assert.equal(next.length, 1);
    assert.equal(next[0].id, "other");
  });

  it("clears everything with clear: true", function () {
    const current = [
      { id: "a", spec: { outline: "#x" } },
      { id: "b", spec: { blur: "#y" } },
    ];
    const { next } = applyAnnotateOps(current, { clear: true }, NOW);
    assert.deepEqual(next, []);
  });

  it("clears only the named ids", function () {
    const current = [
      { id: "a", spec: { outline: "#x" } },
      { id: "b", spec: { blur: "#y" } },
    ];
    const { next } = applyAnnotateOps(current, { clear: ["a"] }, NOW);
    assert.deepEqual(next.map((e) => e.id), ["b"]);
  });

  it("ignores clear: false", function () {
    const current = [{ id: "a", spec: { outline: "#x" } }];
    const { next } = applyAnnotateOps(current, { clear: false }, NOW);
    assert.equal(next.length, 1);
  });

  it("ignores clearing an id that isn't on screen", function () {
    // Unlike `update`, clearing something already gone is the desired end
    // state, so it isn't an error.
    const current = [{ id: "a", spec: { outline: "#x" } }];
    const { next, error } = applyAnnotateOps(current, { clear: ["zzz"] }, NOW);
    assert.equal(error, undefined);
    assert.equal(next.length, 1);
  });

  it("runs clear before add so the pair reads as a replace", function () {
    const current = [{ id: "a", spec: { outline: "#old" } }];
    const { next } = applyAnnotateOps(
      current,
      { clear: ["a"], add: [{ id: "a", outline: "#new" }] },
      NOW
    );
    assert.equal(next.length, 1);
    assert.equal(next[0].spec.outline, "#new");
  });

  it("stamps an expiry from duration", function () {
    const { next } = applyAnnotateOps(
      [],
      { add: [{ id: "a", outline: "#x", duration: 3500 }] },
      NOW
    );
    assert.equal(next[0].expiresAt, NOW + 3500);
  });

  it("leaves annotations without a duration unexpiring", function () {
    const { next } = applyAnnotateOps([], { add: [{ id: "a", outline: "#x" }] }, NOW);
    assert.equal(next[0].expiresAt, undefined);
  });
});

describe("annotate/pruneExpired", function () {
  it("drops annotations past their expiry and keeps the rest", function () {
    const entries = [
      { id: "gone", spec: {}, expiresAt: NOW - 1 },
      { id: "live", spec: {}, expiresAt: NOW + 1000 },
      { id: "forever", spec: {} },
    ];
    assert.deepEqual(
      pruneExpired(entries, NOW).map((e) => e.id),
      ["live", "forever"]
    );
  });

  it("treats the expiry instant as expired", function () {
    assert.deepEqual(pruneExpired([{ id: "a", spec: {}, expiresAt: NOW }], NOW), []);
  });
});

describe("annotate step", function () {
  it("SKIPs without a browser session rather than failing", async function () {
    // An app-only context has no page to draw into. Screenshot annotations DO
    // work there (composited into the image), so point at that instead of
    // failing a test that never asked for a browser.
    const result = await annotate({
      config: {},
      step: { annotate: { add: [{ outline: "#a" }] } },
      driver: undefined,
    });
    assert.equal(result.status, "SKIPPED");
    assert.match(result.description, /No browser session/);
  });

  it("FAILs an invalid annotate payload", async function () {
    const result = await annotate({
      config: {},
      step: { annotate: { add: [{ outline: "#a", blur: "#b" }] } },
      driver: { state: {} },
    });
    assert.equal(result.status, "FAIL");
    assert.match(result.description, /Invalid step definition/);
  });

  it("FAILs when updating an annotation that isn't on screen", async function () {
    const result = await annotate({
      config: {},
      step: { annotate: { update: [{ id: "nope", outline: "#a" }] } },
      driver: { state: { annotations: [] } },
    });
    assert.equal(result.status, "FAIL");
    assert.match(result.description, /No annotation with id "nope"/);
  });

  it("gives every match of an `all` annotation its own render id", async function () {
    // One stored annotation with `all: true` expands to one placed item per
    // match. If they shared an id the page's querySelector would only ever
    // find the first, so only the first would track — the rest would sit still
    // while the page scrolled and slide off the content they redact.
    const elements = [
      { elementId: "e1" },
      { elementId: "e2" },
      { elementId: "e3" },
    ];
    let mounted;
    const driver = {
      async $$() {
        return elements.map((el) => ({
          ...el,
          async isExisting() {
            return true;
          },
          async getText() {
            return "";
          },
          async getComputedLabel() {
            return "";
          },
          async getAttribute() {
            return null;
          },
        }));
      },
      async execute(fn, ...args) {
        // Match the mount payload FIRST: the layer script itself contains
        // `setAttribute` and `getBoundingClientRect`, so a source-substring
        // check would swallow it before this ever ran.
        if (args && args.length === 3 && args[2] && args[2].svg !== undefined) {
          mounted = args[2];
          return undefined;
        }
        const src = String(fn);
        if (src.includes("innerWidth")) return { width: 800, height: 600 };
        if (src.includes("getBoundingClientRect"))
          return { x: 10, y: 10, width: 50, height: 20 };
        return undefined;
      },
    };

    const { errors } = await renderLayer({
      config: {},
      driver,
      entries: [
        {
          id: "redact",
          spec: { blur: { selector: ".secret" }, all: true, track: true },
        },
      ],
      newIds: ["redact"],
    });

    assert.deepEqual(errors, []);
    assert.ok(mounted, "expected the layer to be mounted");
    const trackedIds = mounted.tracked.map((t) => t.id);
    assert.equal(trackedIds.length, 3, "every match must be tracked");
    assert.equal(
      new Set(trackedIds).size,
      3,
      "tracked ids must be unique or only the first would be found"
    );
    // The first keeps the stored id; expansions are suffixed.
    assert.equal(trackedIds[0], "redact");
    // All three animate, since the whole stored annotation is new.
    assert.equal(mounted.newIds.length, 3);
  });

  it("does not re-animate annotations that aren't newly added", async function () {
    // Re-injection after navigation passes no new ids, so nothing replays its
    // enter transition — a fade-in on every navigation would read as a glitch.
    let mounted;
    const driver = {
      async $$() {
        return [];
      },
      async execute(fn, ...args) {
        const src = String(fn);
        if (src.includes("innerWidth")) return { width: 800, height: 600 };
        if (args && args.length === 3 && args[2] && args[2].svg !== undefined) {
          mounted = args[2];
        }
        return undefined;
      },
    };
    await renderLayer({
      config: {},
      driver,
      entries: [
        { id: "banner", spec: { text: { position: "top-left" }, label: "Demo" } },
      ],
      newIds: [],
    });
    assert.ok(mounted);
    assert.deepEqual(mounted.newIds, []);
  });

  it("hands the page an exit transition for a cleared annotation", async function () {
    // The exit CSS is only reachable if Node says what departed: the page
    // re-renders the whole set, so a cleared annotation is simply absent and
    // would otherwise blink out instead of animating.
    let mounted;
    const driver = {
      state: {
        annotations: [
          {
            id: "bye",
            spec: {
              text: { position: "top-left" },
              label: "x",
              transition: { exit: "fade", durationMs: 400 },
            },
          },
          { id: "stay", spec: { text: { position: "top-right" }, label: "y" } },
        ],
      },
      async $$() {
        return [];
      },
      async execute(fn, ...args) {
        if (args && args.length === 3 && args[2] && args[2].svg !== undefined) {
          mounted = args[2];
          return undefined;
        }
        const src = String(fn);
        if (src.includes("innerWidth")) return { width: 800, height: 600 };
        return undefined;
      },
    };

    const result = await annotate({
      config: {},
      step: { annotate: { clear: ["bye"] } },
      driver,
    });

    assert.equal(result.status, "PASS", result.description);
    assert.ok(mounted, "expected a mount");
    assert.ok(mounted.exit.bye, "the departing annotation needs an exit spec");
    assert.equal(mounted.exit.bye.type, "fade");
    assert.equal(mounted.exit.bye.durationMs, 400);
    // The survivor isn't departing, so it gets no exit entry.
    assert.equal(mounted.exit.stay, undefined);
  });

  it("empties state on clear: true and lets the departing annotation animate out", async function () {
    // The default theme gives every annotation an exit transition, so a clear
    // renders an empty set plus the departing annotation's ghost rather than
    // yanking the layer — otherwise the last frame of the recording would show
    // it blink out. The page drops the layer once the ghost finishes.
    let mounted;
    const driver = {
      state: { annotations: [{ id: "a", spec: { outline: "#x" } }] },
      async $$() {
        return [];
      },
      async execute(fn, ...args) {
        if (args && args.length === 3 && args[2] && args[2].svg !== undefined) {
          mounted = args[2];
          return undefined;
        }
        const src = String(fn);
        if (src.includes("innerWidth")) return { width: 800, height: 600 };
        return undefined;
      },
    };
    const result = await annotate({
      config: {},
      step: { annotate: { clear: true } },
      driver,
    });
    assert.equal(result.status, "PASS", result.description);
    assert.deepEqual(driver.state.annotations, []);
    assert.equal(result.outputs.annotationCount, 0);
    assert.match(result.description, /Cleared all annotations/);
    assert.ok(mounted, "expected a render carrying the ghost");
    assert.ok(mounted.exit.a, "the cleared annotation needs an exit spec");
    // Nothing remains on screen.
    assert.deepEqual(mounted.newIds, []);
  });

  it("keys exit specs by stored id so every `all` expansion can find one", async function () {
    // The DOM carries RENDER ids ("redact", "redact--1", …) while exit specs
    // are keyed by the STORED id. The page falls back from render id to base
    // id; this pins the Node half of that contract — one spec under the stored
    // id, which every expansion resolves against.
    let mounted;
    const driver = {
      state: {
        annotations: [
          {
            id: "redact",
            spec: {
              blur: { selector: ".secret" },
              all: true,
              transition: { exit: "fade", durationMs: 300 },
            },
          },
        ],
      },
      async $$() {
        return [];
      },
      async execute(fn, ...args) {
        if (args && args.length === 3 && args[2] && args[2].svg !== undefined) {
          mounted = args[2];
          return undefined;
        }
        const src = String(fn);
        if (src.includes("innerWidth")) return { width: 800, height: 600 };
        return undefined;
      },
    };
    await annotate({
      config: {},
      step: { annotate: { clear: ["redact"] } },
      driver,
    });
    assert.ok(mounted);
    assert.ok(
      mounted.exit.redact,
      "the exit spec is keyed by the stored id, which every render id derives from"
    );
    assert.equal(mounted.exit.redact.durationMs, 300);
  });

  it("removes the layer when there was nothing up to clear", async function () {
    // No annotations and none departing: nothing to animate, so take the layer
    // down instead of leaving an empty element in the page under test.
    const calls = [];
    const driver = {
      state: { annotations: [] },
      async execute(fn) {
        calls.push(String(fn));
        return undefined;
      },
    };
    const result = await annotate({
      config: {},
      step: { annotate: { clear: true } },
      driver,
    });
    assert.equal(result.status, "PASS", result.description);
    assert.ok(calls.some((c) => /remove\(\)/.test(c)));
  });
});
