// Phase 13 coverage ratchet: additional HERMETIC, OFFLINE unit tests for
// `dist/debug/index.js` and `dist/core/tests/findStrategies.js`.
//
// - debug/index.js: drives `printDebug` through the render/collect branches
//   that `test/debug.test.js` does not already hit (referenced-env file
//   scanning, container signals, write-failure path, config stringify
//   failure, detectPlatform fallbacks, empty-network render, etc.).
// - findStrategies.js: exercises every exported strategy against a FAKE
//   webdriverio-style driver — found via each selector, not-found → next
//   strategy, all-fail, and driver-method-throws error paths.
//
// All tests are deterministic and offline: no real browser/webdriver/network,
// no spawn. Any global / process.env / process.platform swap is restored in
// a `finally` AND in `afterEach` so nothing leaks into the combined suite.

import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import sinon from "sinon";

import { printDebug } from "../dist/debug/index.js";
import {
  findElementBySelectorAndText,
  findElementByShorthand,
  findElementByCriteria,
  setElementOutputs,
} from "../dist/core/tests/findStrategies.js";

// ---------------------------------------------------------------------------
// findStrategies.js — fake driver + element helpers
// ---------------------------------------------------------------------------

// A minimal element stub. `overrides` supplies canned return values or
// throwing behavior for whichever methods a test cares about; everything
// else defaults to a benign value.
function makeElement(overrides = {}) {
  const el = {
    elementId: overrides.elementId ?? "el-1",
    getText: async () => overrides.text ?? "",
    getHTML: async () => overrides.html ?? "<div></div>",
    getTagName: async () => overrides.tag ?? "div",
    getValue: async () => overrides.value ?? "",
    getLocation: async () => overrides.location ?? { x: 0, y: 0 },
    getSize: async () => overrides.size ?? { width: 1, height: 1 },
    isClickable: async () => overrides.clickable ?? true,
    isEnabled: async () => overrides.enabled ?? true,
    isSelected: async () => overrides.selected ?? false,
    isDisplayed: async () => overrides.displayed ?? true,
    getAttribute: async (name) =>
      overrides.attributes ? overrides.attributes[name] ?? null : null,
    getComputedLabel: async () => overrides.computedLabel ?? "",
    isExisting: async () => overrides.existing ?? true,
    waitForExist: async () => true,
  };
  // Allow selective method overrides (e.g. a throwing getText).
  for (const [k, v] of Object.entries(overrides.methods ?? {})) {
    el[k] = v;
  }
  return el;
}

// Build a fake driver. `config` controls what `$` / `$$` return per query.
//   - $$byXpath: map of xpath-substring -> array of elements (or a function)
//   - $bySelector: map of selector -> element / thenable behavior
function makeDriver(config = {}) {
  const driver = {
    pauseCalls: [],
    pause: async (t) => {
      driver.pauseCalls.push(t);
    },
    $$: async (query) => {
      if (typeof config.$$ === "function") return config.$$(query);
      return config.$$ ?? [];
    },
    // driver.$ in webdriverio returns a chainable thenable; the code calls
    // `.then(...).catch(...)`. A resolved Promise satisfies that contract.
    $: (selector) => {
      if (typeof config.$ === "function") return config.$(selector);
      return Promise.resolve(config.$ ?? null);
    },
  };
  return driver;
}

describe("findStrategies coverage (phase 13)", function () {
  afterEach(function () {
    sinon.restore();
  });

  // --- setElementOutputs -------------------------------------------------

  describe("setElementOutputs", function () {
    it("collects all element properties from a fully-resolving element", async function () {
      const el = makeElement({
        text: "hello",
        html: "<b>hi</b>",
        tag: "button",
        value: "v",
        location: { x: 3, y: 4 },
        size: { width: 10, height: 20 },
        clickable: true,
        enabled: true,
        selected: true,
        displayed: true,
      });
      const outputs = await setElementOutputs({ element: el });
      assert.equal(outputs.rawElement, el);
      assert.equal(outputs.element.text, "hello");
      assert.equal(outputs.element.html, "<b>hi</b>");
      assert.equal(outputs.element.tag, "button");
      assert.equal(outputs.element.value, "v");
      assert.deepEqual(outputs.element.location, { x: 3, y: 4 });
      assert.deepEqual(outputs.element.size, { width: 10, height: 20 });
      assert.equal(outputs.element.clickable, true);
      assert.equal(outputs.element.selected, true);
    });

    it("maps rejected property lookups to null (Promise.allSettled path)", async function () {
      // Every getter throws → each settled result is `rejected` → null.
      const throwing = {};
      for (const m of [
        "getText",
        "getHTML",
        "getTagName",
        "getValue",
        "getLocation",
        "getSize",
        "isClickable",
        "isEnabled",
        "isSelected",
        "isDisplayed",
      ]) {
        throwing[m] = async () => {
          throw new Error("boom");
        };
      }
      const el = makeElement({ methods: throwing });
      const outputs = await setElementOutputs({ element: el });
      for (const key of [
        "text",
        "html",
        "tag",
        "value",
        "location",
        "size",
        "clickable",
        "enabled",
        "selected",
        "displayed",
        "displayedInViewport",
      ]) {
        assert.equal(outputs.element[key], null, `${key} should be null`);
      }
    });
  });

  // --- findElementBySelectorAndText -------------------------------------

  describe("findElementBySelectorAndText", function () {
    it("returns null immediately when selector or text is missing", async function () {
      const driver = makeDriver();
      assert.deepEqual(
        await findElementBySelectorAndText({
          selector: null,
          text: "x",
          timeout: 100,
          driver,
        }),
        { element: null, foundBy: null }
      );
      assert.deepEqual(
        await findElementBySelectorAndText({
          selector: "div",
          text: "",
          timeout: 100,
          driver,
        }),
        { element: null, foundBy: null }
      );
    });

    it("finds the first element whose exact text matches", async function () {
      const match = makeElement({ text: "Submit" });
      const other = makeElement({ text: "Cancel" });
      const driver = makeDriver({ $$: [other, match] });
      const res = await findElementBySelectorAndText({
        selector: "button",
        text: "Submit",
        timeout: 1000,
        driver,
      });
      assert.equal(res.element, match);
      assert.equal(res.foundBy, "selector and text");
    });

    it("matches text via a /regex/ pattern", async function () {
      const match = makeElement({ text: "Order #4821" });
      const driver = makeDriver({ $$: [match] });
      const res = await findElementBySelectorAndText({
        selector: ".order",
        text: "/Order #\\d+/",
        timeout: 1000,
        driver,
      });
      assert.equal(res.element, match);
      assert.equal(res.foundBy, "selector and text");
    });

    it("skips candidates with empty text and non-matching text, then times out", async function () {
      // One empty-text candidate (continue) + one mismatched candidate
      // (continue). No match → loop runs to timeout → null.
      const empty = makeElement({ text: "" });
      const wrong = makeElement({ text: "Nope" });
      const driver = makeDriver({ $$: [empty, wrong] });
      const res = await findElementBySelectorAndText({
        selector: "button",
        text: "Yes",
        timeout: 120, // short, but long enough for one 100ms retry sleep
        driver,
      });
      assert.deepEqual(res, { element: null, foundBy: null });
    });

    it("skips candidates whose text fails the /regex/ pattern", async function () {
      const wrong = makeElement({ text: "abc" });
      const driver = makeDriver({ $$: [wrong] });
      const res = await findElementBySelectorAndText({
        selector: "span",
        text: "/^\\d+$/",
        timeout: 60,
        driver,
      });
      assert.deepEqual(res, { element: null, foundBy: null });
    });
  });

  // --- findElementByShorthand: exact-match path -------------------------

  describe("findElementByShorthand (exact match)", function () {
    it("finds by elementText and honors precedence over other strategies", async function () {
      // driver.$ resolves the same element for every query; textResult wins
      // by precedence (elementText is checked first).
      const el = makeElement({ elementId: "found" });
      const driver = makeDriver({ $: () => Promise.resolve(el) });
      const res = await findElementByShorthand({
        string: "Click me",
        timeout: 500,
        driver,
      });
      assert.equal(res.element, el);
      assert.equal(res.foundBy, "elementText");
    });

    it("falls through to selector when text/aria/id/testId queries fail", async function () {
      // Only the CSS-selector query (first $ call) resolves an element with
      // an elementId; the four attribute queries resolve to null.
      const selEl = makeElement({ elementId: "sel" });
      let call = 0;
      const driver = makeDriver({
        $: () => {
          call += 1;
          // Call order: selector, text, aria, id, testId.
          return Promise.resolve(call === 1 ? selEl : null);
        },
      });
      const res = await findElementByShorthand({
        string: "#widget",
        timeout: 200,
        driver,
      });
      assert.equal(res.element, selEl);
      assert.equal(res.foundBy, "selector");
    });

    it("returns null when every exact-match query resolves without an element", async function () {
      const driver = makeDriver({ $: () => Promise.resolve(null) });
      const res = await findElementByShorthand({
        string: "nothing",
        timeout: 100,
        driver,
      });
      assert.deepEqual(res, { element: null, foundBy: null });
    });

    it("swallows a rejected query (waitForExist throws) and returns null", async function () {
      // Each $ resolves an element whose waitForExist rejects → the
      // per-query `.catch(() => null)` yields null → overall null.
      const driver = makeDriver({
        $: () =>
          Promise.resolve(
            makeElement({
              methods: {
                waitForExist: async () => {
                  throw new Error("gone");
                },
              },
            })
          ),
      });
      const res = await findElementByShorthand({
        string: "flaky",
        timeout: 80,
        driver,
      });
      assert.deepEqual(res, { element: null, foundBy: null });
    });

    it("prefers aria over id/testId/selector when text is absent", async function () {
      const ariaEl = makeElement({ elementId: "aria" });
      let call = 0;
      const driver = makeDriver({
        $: () => {
          call += 1;
          // selector(1)=null, text(2)=null, aria(3)=ariaEl, id(4)=null, testId(5)=null
          return Promise.resolve(call === 3 ? ariaEl : null);
        },
      });
      const res = await findElementByShorthand({
        string: "Save",
        timeout: 200,
        driver,
      });
      assert.equal(res.foundBy, "elementAria");
    });

    it("prefers id then testId over selector", async function () {
      const idEl = makeElement({ elementId: "id" });
      let call = 0;
      const driver = makeDriver({
        $: () => {
          call += 1;
          return Promise.resolve(call === 4 ? idEl : null); // id is 4th
        },
      });
      const res = await findElementByShorthand({
        string: "thing",
        timeout: 200,
        driver,
      });
      assert.equal(res.foundBy, "elementId");

      const testIdEl = makeElement({ elementId: "tid" });
      let call2 = 0;
      const driver2 = makeDriver({
        $: () => {
          call2 += 1;
          return Promise.resolve(call2 === 5 ? testIdEl : null); // testId is 5th
        },
      });
      const res2 = await findElementByShorthand({
        string: "thing",
        timeout: 200,
        driver: driver2,
      });
      assert.equal(res2.foundBy, "elementTestId");
    });

    it("uses the default timeout when none is supplied", async function () {
      // Exercises the `timeout = 5000` default parameter branch. All queries
      // resolve immediately to null so the call returns fast.
      const driver = makeDriver({ $: () => Promise.resolve(null) });
      const res = await findElementByShorthand({ string: "x", driver });
      assert.deepEqual(res, { element: null, foundBy: null });
    });
  });

  // --- findElementByShorthand: regex path -------------------------------

  describe("findElementByShorthand (regex)", function () {
    it("finds by text regex (selector strategy resolves first)", async function () {
      // //*[normalize-space(text())] drives findElementByRegex; the first
      // resolving strategy ("selector") wins by precedence.
      const el = makeElement({ text: "Total: 42" });
      const driver = makeDriver({
        $$: (q) => {
          if (q.includes("normalize-space(text())")) return [el];
          return [];
        },
      });
      const res = await findElementByShorthand({
        string: "/Total: \\d+/",
        timeout: 10,
        driver,
      });
      assert.equal(res.element, el);
      assert.equal(res.foundBy, "selector");
    });

    it("finds by aria-label regex when text strategies miss", async function () {
      const ariaEl = makeElement({
        text: "",
        attributes: { "aria-label": "Close dialog" },
      });
      const driver = makeDriver({
        $$: (q) => {
          // Only the plain //* query (aria scan) returns the element; the
          // text/id/testid xpaths return nothing.
          if (q === "//*") return [ariaEl];
          return [];
        },
      });
      const res = await findElementByShorthand({
        string: "/Close/",
        timeout: 10,
        driver,
      });
      assert.equal(res.element, ariaEl);
      assert.equal(res.foundBy, "elementAria");
    });

    it("finds by aria text-fallback and by id/testId regex", async function () {
      // id regex path
      const idEl = makeElement({ attributes: { id: "user-42" } });
      const idDriver = makeDriver({
        $$: (q) => (q.includes("@id") ? [idEl] : []),
      });
      const idRes = await findElementByShorthand({
        string: "/user-\\d+/",
        timeout: 10,
        driver: idDriver,
      });
      assert.equal(idRes.foundBy, "elementId");

      // testId regex path
      const tidEl = makeElement({ attributes: { "data-testid": "row-7" } });
      const tidDriver = makeDriver({
        $$: (q) => (q.includes("@data-testid") ? [tidEl] : []),
      });
      const tidRes = await findElementByShorthand({
        string: "/row-\\d+/",
        timeout: 10,
        driver: tidDriver,
      });
      assert.equal(tidRes.foundBy, "elementTestId");
    });

    it("aria-regex strategy falls back to text content when aria-label is absent", async function () {
      // aria-label missing → the getText() fallback matches instead.
      const el = makeElement({
        text: "Fallback text 99",
        attributes: {}, // no aria-label
      });
      const driver = makeDriver({
        $$: (q) => (q === "//*" ? [el] : []),
      });
      const res = await findElementByShorthand({
        string: "/Fallback text \\d+/",
        timeout: 10,
        driver,
      });
      assert.equal(res.element, el);
      assert.equal(res.foundBy, "elementAria");
    });

    it("aria-regex strategy skips elements whose attribute lookups throw", async function () {
      const boom = makeElement({
        methods: {
          getAttribute: async () => {
            throw new Error("stale");
          },
          getText: async () => {
            throw new Error("stale");
          },
        },
      });
      const driver = makeDriver({
        $$: (q) => (q === "//*" ? [boom] : []),
      });
      const res = await findElementByShorthand({
        string: "/anything/",
        timeout: 10,
        driver,
      });
      // No strategy matched.
      assert.deepEqual(res, { element: null, foundBy: null });
    });

    it("returns null when no regex strategy matches anything", async function () {
      const driver = makeDriver({ $$: [] });
      const res = await findElementByShorthand({
        string: "/nope/",
        timeout: 10,
        driver,
      });
      assert.deepEqual(res, { element: null, foundBy: null });
    });
  });

  // --- findElementByCriteria --------------------------------------------

  describe("findElementByCriteria", function () {
    it("returns an error when no criterion is supplied", async function () {
      const driver = makeDriver();
      const res = await findElementByCriteria({ timeout: 50, driver });
      assert.equal(res.element, null);
      assert.equal(res.foundBy, null);
      assert.match(res.error, /At least one/);
    });

    it("finds by CSS selector alone (no further criteria)", async function () {
      const el = makeElement();
      const driver = makeDriver({ $$: [el] });
      const res = await findElementByCriteria({
        selector: ".btn",
        timeout: 500,
        driver,
      });
      assert.equal(res.element, el);
      // Selector-only match: the inner loop tags the element "selector" and
      // the outer wrapper prepends "selector" again → duplicated by design.
      assert.deepEqual(res.foundBy, ["selector", "selector"]);
      assert.equal(res.error, null);
    });

    it("matches a combination of selector + text + class + attribute", async function () {
      const el = makeElement({
        text: "Go",
        attributes: { class: "primary big", role: "button" },
      });
      const driver = makeDriver({ $$: [el] });
      const res = await findElementByCriteria({
        selector: "button",
        elementText: "Go",
        elementClass: ["primary", "/^big$/"],
        elementAttribute: { role: "button" },
        timeout: 500,
        driver,
      });
      assert.equal(res.element, el);
      assert.deepEqual(res.foundBy, [
        "selector",
        "elementText",
        "elementClass",
        "elementAttribute",
      ]);
    });

    it("builds an XPath from id/testId/class/text/attribute criteria (no selector)", async function () {
      const el = makeElement({
        text: "Row",
        computedLabel: "Row label",
        attributes: {
          id: "r1",
          "data-testid": "row",
          class: "cell",
          "data-count": "3",
          "aria-live": "polite",
          hidden: "", // present (empty value) → boolean-true existence passes
        },
      });
      const driver = makeDriver({ $$: [el] });
      const res = await findElementByCriteria({
        elementText: "Row",
        elementAria: "Row label",
        elementId: "r1",
        elementTestId: "row",
        elementClass: ["cell"],
        elementAttribute: {
          "data-count": 3, // number branch
          "aria-live": "polite", // string branch
          hidden: true, // boolean-true existence branch
          disabled: false, // disabled special-case branch (isEnabled=true → not disabled)
        },
        timeout: 500,
        driver,
      });
      assert.equal(res.element, el);
      assert.ok(res.foundBy.includes("elementText"));
      assert.ok(res.foundBy.includes("elementAria"));
      assert.ok(res.foundBy.includes("elementId"));
    });

    it("handles regex id/testId and 'true'-string attribute in XPath building", async function () {
      const el = makeElement({
        attributes: { id: "abc123", "data-testid": "t9", checked: "true" },
      });
      const driver = makeDriver({ $$: [el] });
      const res = await findElementByCriteria({
        elementId: "/abc\\d+/",
        elementTestId: "/t\\d+/",
        elementAttribute: { checked: "true" },
        timeout: 500,
        driver,
      });
      assert.equal(res.element, el);
    });

    it("matches a regex attribute value (existence in XPath, pattern check later)", async function () {
      const el = makeElement({ attributes: { "data-token": "tok-123" } });
      const driver = makeDriver({ $$: [el] });
      const res = await findElementByCriteria({
        elementAttribute: { "data-token": "/tok-\\d+/" },
        timeout: 500,
        driver,
      });
      assert.equal(res.element, el);
    });

    it("skips a candidate whose isExisting() throws (outer candidate catch)", async function () {
      const boom = makeElement({
        methods: {
          isExisting: async () => {
            throw new Error("stale node");
          },
        },
      });
      const driver = makeDriver({ $$: [boom] });
      const res = await findElementByCriteria({
        elementText: "x",
        timeout: 120,
        driver,
      });
      assert.equal(res.element, null);
    });

    it("falls back to //* when only aria/regex criteria are given", async function () {
      const el = makeElement({ computedLabel: "Just aria" });
      let seen;
      const driver = makeDriver({
        $$: (q) => {
          seen = q;
          return [el];
        },
      });
      const res = await findElementByCriteria({
        elementAria: "Just aria",
        timeout: 500,
        driver,
      });
      assert.equal(seen, "//*");
      assert.equal(res.element, el);
    });

    it("times out when no candidates are ever returned", async function () {
      const driver = makeDriver({ $$: [] });
      const res = await findElementByCriteria({
        elementText: "never",
        timeout: 120,
        driver,
      });
      assert.equal(res.element, null);
      assert.match(res.error, /not found within timeout/);
    });

    it("skips a candidate that no longer exists in the DOM", async function () {
      const gone = makeElement({ text: "Match", existing: false });
      const driver = makeDriver({ $$: [gone] });
      const res = await findElementByCriteria({
        elementText: "Match",
        timeout: 120,
        driver,
      });
      assert.equal(res.element, null);
    });

    it("rejects a candidate whose text does not match the criterion", async function () {
      const el = makeElement({ text: "Other" });
      const driver = makeDriver({ $$: [el] });
      const res = await findElementByCriteria({
        elementText: "Wanted",
        timeout: 120,
        driver,
      });
      assert.equal(res.element, null);
    });

    it("rejects when a check promise is rejected (getText throws)", async function () {
      const el = makeElement({
        methods: {
          getText: async () => {
            throw new Error("stale");
          },
        },
      });
      const driver = makeDriver({ $$: [el] });
      const res = await findElementByCriteria({
        elementText: "x",
        timeout: 120,
        driver,
      });
      assert.equal(res.element, null);
    });

    it("rejects when a class criterion is not satisfied", async function () {
      const el = makeElement({ attributes: { class: "alpha" } });
      const driver = makeDriver({ $$: [el] });
      const res = await findElementByCriteria({
        elementClass: ["beta"],
        timeout: 120,
        driver,
      });
      assert.equal(res.element, null);
    });

    it("handles a boolean-true attribute match (attribute present)", async function () {
      const el = makeElement({ attributes: { required: "" } });
      const driver = makeDriver({ $$: [el] });
      const res = await findElementByCriteria({
        elementAttribute: { required: true },
        timeout: 500,
        driver,
      });
      assert.equal(res.element, el);
    });

    it("handles the disabled boolean special-case via isEnabled", async function () {
      const el = makeElement({
        methods: { isEnabled: async () => false },
        attributes: {},
      });
      const driver = makeDriver({ $$: [el] });
      const res = await findElementByCriteria({
        elementAttribute: { disabled: true },
        timeout: 500,
        driver,
      });
      assert.equal(res.element, el);
    });

    it("matches a numeric attribute value exactly", async function () {
      const el = makeElement({ attributes: { tabindex: "2" } });
      const driver = makeDriver({ $$: [el] });
      const res = await findElementByCriteria({
        elementAttribute: { tabindex: 2 },
        timeout: 500,
        driver,
      });
      assert.equal(res.element, el);
    });

    it("rejects a numeric attribute that does not match", async function () {
      const el = makeElement({ attributes: { tabindex: "9" } });
      const driver = makeDriver({ $$: [el] });
      const res = await findElementByCriteria({
        elementAttribute: { tabindex: 2 },
        timeout: 120,
        driver,
      });
      assert.equal(res.element, null);
    });

    it("recovers from a thrown driver.$$ (logs and retries to timeout)", async function () {
      const errStub = sinon.stub(console, "error");
      try {
        const driver = makeDriver({
          $$: () => {
            throw new Error("driver exploded");
          },
        });
        const res = await findElementByCriteria({
          elementText: "x",
          timeout: 120,
          driver,
        });
        assert.equal(res.element, null);
        assert.match(res.error, /not found within timeout/);
        assert.ok(errStub.called);
      } finally {
        errStub.restore();
      }
    });

    it("uses the default 5000ms timeout parameter when omitted (still returns fast on match)", async function () {
      const el = makeElement();
      const driver = makeDriver({ $$: [el] });
      const res = await findElementByCriteria({ selector: "*", driver });
      assert.equal(res.element, el);
    });

    it("normalizes a non-array $$ result into an array", async function () {
      // Some drivers return an array-like (not a true Array). The code path
      // Array.from(...) must still yield the element.
      const el = makeElement();
      const arrayLike = { 0: el, length: 1 };
      const driver = makeDriver({ $$: () => arrayLike });
      const res = await findElementByCriteria({
        selector: ".x",
        timeout: 500,
        driver,
      });
      assert.equal(res.element, el);
    });
  });
});

// ---------------------------------------------------------------------------
// debug/index.js — printDebug branch coverage
// ---------------------------------------------------------------------------

describe("debug/index printDebug branch coverage (phase 13)", function () {
  // Guard against env / platform leakage.
  const saved = {};
  function saveEnv(name) {
    saved[name] = process.env[name];
  }
  function restoreEnv(name) {
    if (saved[name] === undefined) delete process.env[name];
    else process.env[name] = saved[name];
  }

  afterEach(function () {
    sinon.restore();
  });

  it("scans a config file and input docs for $VAR references (referenced mode)", async function () {
    this.timeout(60000);
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "dd-p13-refs-"));
    saveEnv("DD_P13_TOKEN");
    saveEnv("DOC_DETECTIVE_CONFIG");
    try {
      // Config file referencing $DD_P13_TOKEN (exercises the configPath read
      // branch). DOC_DETECTIVE_CONFIG raw string references another var.
      const cfgFile = path.join(tmp, "config.json");
      fs.writeFileSync(cfgFile, '{ "token": "$DD_P13_TOKEN" }');
      const docFile = path.join(tmp, "doc.md");
      fs.writeFileSync(docFile, "See $DD_P13_TOKEN for details.");
      process.env.DD_P13_TOKEN = "plainvalue";
      process.env.DOC_DETECTIVE_CONFIG = "url: $DD_P13_FROM_ENV";

      const out = [];
      await printDebug({
        config: { input: [tmp], environment: { platform: "linux" } },
        configPath: cfgFile,
        print: (line) => out.push(line),
      });
      const text = out.join("\n");
      assert.ok(text.includes("Referenced environment variables"));
      assert.ok(text.includes("DD_P13_TOKEN"));
      assert.ok(text.includes("DD_P13_FROM_ENV"));
      // Scanned at least the one doc file.
      assert.match(text, /Scanned \d+ documentation file/);
    } finally {
      restoreEnv("DD_P13_TOKEN");
      restoreEnv("DOC_DETECTIVE_CONFIG");
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });

  it("skips an unreadable config file gracefully (referenced mode)", async function () {
    this.timeout(60000);
    saveEnv("DOC_DETECTIVE_CONFIG");
    try {
      delete process.env.DOC_DETECTIVE_CONFIG;
      const out = [];
      // configPath points at a non-existent file → readFileSync throws →
      // caught and skipped (best-effort branch).
      await printDebug({
        config: { input: ".", environment: { platform: "linux" } },
        configPath: path.join(os.tmpdir(), "dd-p13-does-not-exist.json"),
        print: (line) => out.push(line),
      });
      assert.ok(out.join("\n").includes("Referenced environment variables"));
    } finally {
      restoreEnv("DOC_DETECTIVE_CONFIG");
    }
  });

  it("handles a config with no `input` field (normalizeInputs fallback → [])", async function () {
    this.timeout(60000);
    saveEnv("DOC_DETECTIVE_CONFIG");
    try {
      delete process.env.DOC_DETECTIVE_CONFIG;
      const out = [];
      // No `input` key at all → normalizeInputs receives undefined → returns
      // the empty-array fallback → no files scanned.
      await printDebug({
        config: { environment: { platform: "linux" } },
        configPath: null,
        print: (line) => out.push(line),
      });
      const text = out.join("\n");
      assert.ok(text.includes("Referenced environment variables"));
      assert.match(text, /Scanned 0 documentation file/);
    } finally {
      restoreEnv("DOC_DETECTIVE_CONFIG");
    }
  });

  it("renders container signals when IN_CONTAINER=true", async function () {
    this.timeout(60000);
    saveEnv("IN_CONTAINER");
    try {
      process.env.IN_CONTAINER = "true";
      const out = [];
      await printDebug({
        config: { input: ".", environment: { platform: "linux" } },
        configPath: null,
        print: (line) => out.push(line),
      });
      const text = out.join("\n");
      assert.ok(text.includes("-- Container state "));
      assert.ok(text.includes("signals:"));
      assert.ok(text.includes("IN_CONTAINER=true"));
    } finally {
      restoreEnv("IN_CONTAINER");
    }
  });

  it("synthesizes a platform via detectPlatform when config has no environment (win32)", async function () {
    this.timeout(60000);
    // No `config.environment` → collectBrowsers calls detectPlatform().
    // Stub process.platform to hit the win32 branch deterministically.
    const platformStub = sinon
      .stub(process, "platform")
      .value("win32");
    try {
      const out = [];
      await printDebug({
        config: { input: "." },
        configPath: null,
        print: (line) => out.push(line),
      });
      // Just assert the dump rendered a Browsers section; we do NOT assert
      // on host-specific browser availability.
      assert.ok(out.join("\n").includes("-- Browsers "));
    } finally {
      platformStub.restore();
    }
  });

  it("synthesizes a platform via detectPlatform when config has no environment (darwin)", async function () {
    this.timeout(60000);
    const platformStub = sinon.stub(process, "platform").value("darwin");
    try {
      const out = [];
      await printDebug({
        config: { input: "." },
        configPath: null,
        print: (line) => out.push(line),
      });
      assert.ok(out.join("\n").includes("-- Browsers "));
    } finally {
      platformStub.restore();
    }
  });

  it("falls through detectPlatform to the linux default on a non-win/darwin platform", async function () {
    this.timeout(60000);
    const platformStub = sinon.stub(process, "platform").value("freebsd");
    try {
      const out = [];
      await printDebug({
        config: { input: "." }, // no environment → detectPlatform() invoked
        configPath: null,
        print: (line) => out.push(line),
      });
      assert.ok(out.join("\n").includes("-- Browsers "));
    } finally {
      platformStub.restore();
    }
  });

  it("renders '<no proxy / npm network env vars set>' when no network vars are present", async function () {
    this.timeout(60000);
    // Snapshot and strip any proxy / npm_config_* vars so the empty-render
    // branch is hit deterministically, then restore every one.
    const stripped = {};
    for (const key of Object.keys(process.env)) {
      if (
        /^(https?_proxy|no_proxy|all_proxy)$/i.test(key) ||
        /^npm_config_/i.test(key)
      ) {
        stripped[key] = process.env[key];
        delete process.env[key];
      }
    }
    try {
      const out = [];
      await printDebug({
        config: { input: ".", environment: { platform: "linux" } },
        configPath: null,
        print: (line) => out.push(line),
      });
      const text = out.join("\n");
      assert.ok(text.includes("-- Proxy / npm network "));
      assert.ok(text.includes("<no proxy / npm network env vars set>"));
    } finally {
      for (const [k, v] of Object.entries(stripped)) process.env[k] = v;
    }
  });

  it("surfaces a config that cannot be JSON.stringify'd (BigInt) via the stringify-catch path", async function () {
    this.timeout(60000);
    // redactObject preserves BigInt primitives; JSON.stringify then throws
    // inside renderConfigSection → the catch branch emits a marker instead
    // of crashing the dump.
    const out = [];
    await printDebug({
      config: { input: ".", environment: { platform: "linux" }, weird: 10n },
      configPath: null,
      print: (line) => out.push(line),
    });
    const text = out.join("\n");
    assert.ok(text.includes("-- Config "));
    assert.ok(text.includes("could not stringify config"));
  });

  it("emits a save-failure marker when outDir cannot be written", async function () {
    this.timeout(60000);
    // Point outDir at a path whose parent is a regular file, so mkdirSync
    // fails → writeFileSafe's catch emits the failure marker. This is
    // filesystem-shape driven, not OS-specific.
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "dd-p13-writefail-"));
    try {
      const fileAsParent = path.join(tmp, "not-a-dir");
      fs.writeFileSync(fileAsParent, "x");
      const badOutDir = path.join(fileAsParent, "sub"); // parent is a file
      const out = [];
      await printDebug({
        config: { input: ".", environment: { platform: "linux" } },
        configPath: null,
        outDir: badOutDir,
        print: (line) => out.push(line),
      });
      const text = out.join("\n");
      assert.ok(/failed to save/.test(text), "expected a save-failure marker");
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });
});
