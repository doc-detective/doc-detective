// Whitespace normalization in `find` text matching (ADR 01061).
//
// WebDriver's `getText()` is driver-dependent: geckodriver (Firefox) returns
// surrounding whitespace/newlines that chromedriver strips. The finder must
// normalize whitespace (trim ends + collapse internal runs — full
// `normalize-space` semantics) on both operands for PLAIN-STRING text matches,
// so the same spec matches the same element across engines. Regex matching is
// unchanged (tests against the raw text).
//
// Hermetic + offline: a fake webdriverio-style driver whose `getText()` /
// `getComputedLabel()` return canned padded strings. No browser/network.

import assert from "node:assert/strict";

import {
  findElementBySelectorAndText,
  findElementByCriteria,
  findElementByShorthand,
} from "../dist/core/tests/findStrategies.js";

function makeElement(overrides = {}) {
  return {
    elementId: overrides.elementId ?? "el-1",
    getText: async () => overrides.text ?? "",
    getComputedLabel: async () => overrides.computedLabel ?? "",
    getAttribute: async (name) =>
      overrides.attributes ? overrides.attributes[name] ?? null : null,
    isExisting: async () => overrides.existing ?? true,
    isEnabled: async () => overrides.enabled ?? true,
    waitForExist: async () => true,
  };
}

function makeDriver(config = {}) {
  return {
    pause: async () => {},
    $$: async (query) =>
      typeof config.$$ === "function" ? config.$$(query) : config.$$ ?? [],
    $: (selector) =>
      typeof config.$ === "function"
        ? config.$(selector)
        : Promise.resolve(config.$ ?? null),
  };
}

describe("find text whitespace normalization (ADR 01061)", function () {
  describe("findElementByCriteria — elementText", function () {
    it("matches when the element's text has leading/trailing whitespace and newlines", async function () {
      const el = makeElement({ text: "\n  Garden companion API  \n" });
      const driver = makeDriver({ $$: [el] });
      const res = await findElementByCriteria({
        elementText: "Garden companion API",
        timeout: 500,
        driver,
      });
      assert.equal(res.element, el);
      assert.ok(res.foundBy.includes("elementText"));
    });

    it("collapses internal runs of whitespace (full normalize-space)", async function () {
      const el = makeElement({ text: "Garden   companion\n\tAPI" });
      const driver = makeDriver({ $$: [el] });
      const res = await findElementByCriteria({
        elementText: "Garden companion API",
        timeout: 500,
        driver,
      });
      assert.equal(res.element, el);
    });

    it("normalizes the author's expected value too", async function () {
      const el = makeElement({ text: "Garden companion API" });
      const driver = makeDriver({ $$: [el] });
      const res = await findElementByCriteria({
        elementText: "  Garden   companion API \n",
        timeout: 500,
        driver,
      });
      assert.equal(res.element, el);
    });

    it("still rejects genuinely different text", async function () {
      const el = makeElement({ text: "  Garden  " });
      const driver = makeDriver({ $$: [el] });
      const res = await findElementByCriteria({
        elementText: "Garden companion API",
        timeout: 120,
        driver,
      });
      assert.equal(res.element, null);
    });

    it("keeps regex matching against the raw text (unchanged)", async function () {
      const el = makeElement({ text: "\n  Order #4821  " });
      const driver = makeDriver({ $$: [el] });
      const res = await findElementByCriteria({
        elementText: "/Order #\\d+/",
        timeout: 500,
        driver,
      });
      assert.equal(res.element, el);
    });
  });

  describe("findElementByCriteria — elementAria", function () {
    it("normalizes whitespace in the accessible name", async function () {
      const el = makeElement({ computedLabel: "  Close   dialog \n" });
      const driver = makeDriver({ $$: [el] });
      const res = await findElementByCriteria({
        elementAria: "Close dialog",
        timeout: 500,
        driver,
      });
      assert.equal(res.element, el);
    });
  });

  describe("findElementBySelectorAndText", function () {
    it("matches when the candidate's text is padded with whitespace/newlines", async function () {
      const el = makeElement({ text: "  Submit\n" });
      const driver = makeDriver({ $$: [el] });
      const res = await findElementBySelectorAndText({
        selector: "button",
        text: "Submit",
        timeout: 500,
        driver,
      });
      assert.equal(res.element, el);
      assert.equal(res.foundBy, "selector and text");
    });

    it("collapses internal whitespace for the selector + text combo", async function () {
      const el = makeElement({ text: "Submit   Order" });
      const driver = makeDriver({ $$: [el] });
      const res = await findElementBySelectorAndText({
        selector: "button",
        text: "Submit Order",
        timeout: 500,
        driver,
      });
      assert.equal(res.element, el);
    });
  });
});

// Framework-fragmented text: React/Vue/Svelte routinely split an element's
// text across several text nodes, often with an EMPTY leading node
// (`["", "Title", ""]`). XPath `text()` in a predicate resolves to only the
// FIRST text node, so `normalize-space(text())` is empty and the element is
// excluded from the candidate set — no `elementText` match is ever possible.
// The finder must match the element's WHOLE text (`normalize-space(.)`).
// Here the fake driver answers the whole-element XPath but NOT the
// first-text-node XPath, reproducing that DOM shape (ADR 01061).
describe("find text — framework-fragmented text nodes (ADR 01061)", function () {
  // The element is answered only by the whole-element (plain-string exact) or
  // direct-text-node (regex) candidate queries — NOT the old first-text-node
  // predicate `normalize-space(text())`, reproducing a fragmented element.
  const wholeTextOnly = (element) => (query) => {
    const s = String(query);
    const usesNewForm =
      s.includes("normalize-space(.)") || s.includes("text()[normalize-space()]");
    return usesNewForm && !s.includes("normalize-space(text())") ? [element] : [];
  };

  describe("findElementByCriteria", function () {
    it("finds a plain-string elementText whose text is fragmented across nodes (no selector)", async function () {
      const h1 = makeElement({ text: "Garden companion API" });
      const driver = makeDriver({ $$: wholeTextOnly(h1) });
      const res = await findElementByCriteria({
        elementText: "Garden companion API",
        timeout: 500,
        driver,
      });
      assert.equal(res.element, h1);
      assert.ok(res.foundBy.includes("elementText"));
    });

    it("finds a regex elementText whose text is fragmented across nodes (no selector)", async function () {
      const h1 = makeElement({ text: "Garden companion API" });
      const driver = makeDriver({ $$: wholeTextOnly(h1) });
      const res = await findElementByCriteria({
        elementText: "/Garden companion API/",
        timeout: 500,
        driver,
      });
      assert.equal(res.element, h1);
    });
  });

  describe("findElementByShorthand", function () {
    it("matches the whole element's text (not just its first text node)", async function () {
      const h1 = makeElement({ elementId: "found", text: "Garden companion API" });
      const driver = makeDriver({
        $: (selector) =>
          Promise.resolve(
            String(selector).includes("normalize-space(.)") ? h1 : null
          ),
      });
      const res = await findElementByShorthand({
        string: "Garden companion API",
        timeout: 500,
        driver,
      });
      assert.equal(res.element, h1);
      assert.equal(res.foundBy, "elementText");
    });

    it("returns the innermost match, not a wrapping ancestor (single-child container)", async function () {
      // A single-child wrapper's whole text also equals the string; the finder
      // must exclude it via `not(.//*[…])` so click/type target the leaf.
      const leaf = makeElement({ elementId: "leaf" });
      const driver = makeDriver({
        $: (selector) =>
          Promise.resolve(String(selector).includes("not(.//*") ? leaf : null),
      });
      const res = await findElementByShorthand({
        string: "Wrapped heading",
        timeout: 500,
        driver,
      });
      assert.equal(res.element, leaf);
      assert.equal(res.foundBy, "elementText");
    });

    it("regex text search targets elements with direct text, not pure containers like <body>", async function () {
      // A substring regex against whole-subtree text would match <body> (first
      // in document order) and click the page. The candidate query must select
      // only elements that contribute their own text node.
      const button = makeElement({ text: "Reveal via regex match" });
      const driver = makeDriver({
        $$: (query) =>
          String(query).includes("text()[normalize-space()]") ? [button] : [],
      });
      const res = await findElementByShorthand({
        string: "/Reveal via regex/",
        timeout: 200,
        driver,
      });
      assert.equal(res.element, button);
    });
  });

  describe("findElementByCriteria innermost selection", function () {
    it("narrows to the innermost element for a plain elementText (excludes ancestors)", async function () {
      const leaf = makeElement({ text: "Wrapped heading" });
      const driver = makeDriver({
        $$: (query) =>
          String(query).includes("not(.//*") ? [leaf] : [],
      });
      const res = await findElementByCriteria({
        elementText: "Wrapped heading",
        timeout: 500,
        driver,
      });
      assert.equal(res.element, leaf);
      assert.ok(res.foundBy.includes("elementText"));
    });
  });
});

// XPath string-literal quoting for author text embedded into the whole-element
// match expression. Exercises the single-quote and concat() branches via the
// shorthand text strategy (which now embeds the literal).
describe("find text — XPath literal quoting (ADR 01061)", function () {
  it("embeds text containing a double quote using a single-quoted literal", async function () {
    const el = makeElement({ elementId: "q1" });
    let seen = "";
    const driver = makeDriver({
      $: (selector) => {
        const s = String(selector);
        if (s.includes("normalize-space(.)")) {
          seen = s;
          return Promise.resolve(el);
        }
        return Promise.resolve(null);
      },
    });
    const res = await findElementByShorthand({
      string: 'He said "hi"',
      timeout: 300,
      driver,
    });
    assert.equal(res.element, el);
    // Single-quoted XPath literal wraps the double-quote-bearing text.
    assert.ok(seen.includes(`'He said "hi"'`));
  });

  it("assembles text containing both quote kinds with concat()", async function () {
    const el = makeElement({ elementId: "q2" });
    let seen = "";
    const driver = makeDriver({
      $: (selector) => {
        const s = String(selector);
        if (s.includes("concat(")) {
          seen = s;
          return Promise.resolve(el);
        }
        return Promise.resolve(null);
      },
    });
    const res = await findElementByShorthand({
      string: `both ' and " quotes`,
      timeout: 300,
      driver,
    });
    assert.equal(res.element, el);
    assert.ok(seen.includes("concat("));
  });
});
