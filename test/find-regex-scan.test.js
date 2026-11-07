// Regex find cost (ADR 01131): the shorthand "/re/" path polls instead of
// sleeping the whole timeout before its one scan, and findElementByCriteria
// no longer calls wdio's isExisting() on every candidate. For an element from
// `$$`, isExisting re-runs the whole candidate query, so a per-candidate call
// made the scan O(n²). Matching still uses each candidate's driver getText(),
// so the text a regex sees is unchanged.

import assert from "node:assert/strict";
import {
  findElementByShorthand,
  findElementByCriteria,
} from "../dist/core/tests/findStrategies.js";

function makeElement({ text = "", attributes = {}, existing = true } = {}) {
  const el = {
    isExistingCalls: 0,
    getText: async () => text,
    getAttribute: async (name) => attributes[name] ?? null,
    isExisting: async () => {
      el.isExistingCalls += 1;
      return typeof existing === "function" ? existing() : existing;
    },
  };
  return el;
}

// `$$` returns `elementsFor(query, elapsedMs)`. `pause` records any fixed
// sleep the code asks the driver for.
function makeDriver(elementsFor) {
  const t0 = Date.now();
  const driver = {
    queries: [],
    pauseCalls: [],
    pause: async (ms) => {
      driver.pauseCalls.push(ms);
      await new Promise((r) => setTimeout(r, ms));
    },
    $$: async (query) => {
      driver.queries.push(query);
      return elementsFor(query, Date.now() - t0);
    },
  };
  return driver;
}

const TEXT_QUERY = "//*[text()[normalize-space()]]";
// The aria scan skips elements the text scan just checked (#757).
const ARIA_QUERY = "//*[@aria-label or not(text()[normalize-space()])]";

async function timed(fn) {
  const start = Date.now();
  const res = await fn();
  return { res, ms: Date.now() - start };
}

describe("regex find scanning (ADR 01131)", function () {
  this.timeout(20000);

  describe("findElementByShorthand regex", function () {
    it("finds a present element without sleeping the timeout first", async function () {
      const target = makeElement({ text: "Total: 42" });
      const driver = makeDriver((q) => (q === TEXT_QUERY ? [target] : []));
      const { res, ms } = await timed(() =>
        findElementByShorthand({ string: "/Total: \\d+/", timeout: 3000, driver })
      );
      assert.equal(res.element, target);
      assert.equal(res.foundBy, "selector");
      assert.deepEqual(driver.pauseCalls, []);
      assert.ok(ms < 1000, `expected an immediate match, took ${ms}ms`);
    });

    it("polls until a late element renders", async function () {
      const target = makeElement({ text: "Late 7" });
      const driver = makeDriver((q, elapsed) =>
        q === TEXT_QUERY && elapsed >= 400 ? [target] : []
      );
      const { res, ms } = await timed(() =>
        findElementByShorthand({ string: "/Late \\d/", timeout: 3000, driver })
      );
      assert.equal(res.element, target);
      assert.ok(ms >= 350 && ms < 1500, `expected ~400ms, took ${ms}ms`);
    });

    it("polls the full timeout, re-scanning, and returns nulls when nothing matches", async function () {
      const other = makeElement({ text: "unrelated" });
      const driver = makeDriver(() => [other]);
      const { res, ms } = await timed(() =>
        findElementByShorthand({ string: "/nope/", timeout: 600, driver })
      );
      assert.deepEqual(res, { element: null, foundBy: null });
      assert.ok(ms >= 600 && ms < 2000, `expected ~600ms, took ${ms}ms`);
      // More than one pass. (The old code always issued exactly two text
      // scans, one each for its "selector" and "elementText" labels.)
      assert.ok(
        driver.queries.filter((q) => q === TEXT_QUERY).length > 2,
        "expected the text scan to re-run"
      );
    });

    it("scans once when timeout is 0", async function () {
      const driver = makeDriver(() => []);
      const res = await findElementByShorthand({
        string: "/nope/",
        timeout: 0,
        driver,
      });
      assert.deepEqual(res, { element: null, foundBy: null });
      assert.equal(driver.queries.filter((q) => q === TEXT_QUERY).length, 1);
    });

    it("keeps precedence: a text hit beats an aria-label hit on the same scan", async function () {
      const textHit = makeElement({ text: "Save 1" });
      const ariaHit = makeElement({ attributes: { "aria-label": "Save 2" } });
      const driver = makeDriver((q) => {
        if (q === TEXT_QUERY) return [textHit];
        if (q === ARIA_QUERY) return [ariaHit, textHit];
        return [];
      });
      const res = await findElementByShorthand({
        string: "/Save \\d/",
        timeout: 1000,
        driver,
      });
      assert.equal(res.element, textHit);
      assert.equal(res.foundBy, "selector");
    });

    it("re-checks the text scan when an element renders mid-pass, so the aria text fallback's container doesn't win", async function () {
      // The late <p> renders after the pass's text scan ran but while the
      // aria scan walks every element. Its getText() fallback then matches the
      // <p>'s container. The old code scanned once, after the timeout, and
      // returned the <p> by text. That's what CI's late-arrival fixture caught.
      let rendered = false;
      const p = makeElement({ text: "Late regex arrival 5" });
      const container = {
        ...makeElement(),
        getText: async () => {
          rendered = true; // the <p> lands while the aria scan is mid-walk
          return "Late regex arrival 5";
        },
      };
      const driver = makeDriver((q) => {
        if (q === TEXT_QUERY) return rendered ? [p] : [];
        if (q === ARIA_QUERY) return [makeElement(), container];
        return [];
      });
      const res = await findElementByShorthand({
        string: "/Late regex arrival \\d/",
        timeout: 3000,
        driver,
      });
      assert.equal(res.element, p);
      assert.equal(res.foundBy, "selector");
    });

    it("labels a text match by text, not elementAria, when the text scan's getText throws once mid-pass", async function () {
      // A per-element getText() that throws (e.g. a stale element) rejects the
      // whole text scan for that pass. The aria scan's text fallback then
      // matches the same element. The text scan is re-checked before the aria
      // hit is accepted.
      let textCalls = 0;
      const target = makeElement({ text: "Total: 42" });
      const flaky = {
        ...target,
        getText: async () => {
          textCalls += 1;
          if (textCalls === 1) throw new Error("stale element reference");
          return "Total: 42";
        },
      };
      const driver = makeDriver((q) => {
        if (q === TEXT_QUERY) return [flaky];
        if (q === ARIA_QUERY) return [target];
        return [];
      });
      const res = await findElementByShorthand({
        string: "/Total: \\d+/",
        timeout: 3000,
        driver,
      });
      assert.equal(res.element, flaky);
      assert.equal(res.foundBy, "selector");
    });

    it("treats a scan that throws as no match for that pass and still finds via another strategy", async function () {
      const idHit = makeElement({ attributes: { id: "user-42" } });
      const driver = makeDriver((q) => {
        if (q === TEXT_QUERY) throw new Error("stale element reference");
        if (q === "//*[@id]") return [idHit];
        return [];
      });
      const res = await findElementByShorthand({
        string: "/user-\\d+/",
        timeout: 1000,
        driver,
      });
      assert.equal(res.element, idHit);
      assert.equal(res.foundBy, "elementId");
    });
  });

  describe("findElementByShorthand aria scan (#757)", function () {
    it("queries only aria-labelled elements and those without their own text", async function () {
      const driver = makeDriver(() => []);
      await findElementByShorthand({ string: "/nope/", timeout: 0, driver });
      assert.ok(driver.queries.includes(ARIA_QUERY), driver.queries.join(" | "));
      assert.ok(!driver.queries.includes("//*"), "no full-DOM aria scan");
    });
  });

  describe("findElementByCriteria regex elementText", function () {
    it("doesn't call isExisting on candidates that don't match", async function () {
      const misses = Array.from({ length: 50 }, (_, i) =>
        makeElement({ text: `Row ${i}` })
      );
      const hit = makeElement({ text: "Needle 50" });
      const driver = makeDriver(() => [...misses, hit]);
      const res = await findElementByCriteria({
        elementText: "/Needle \\d+/",
        timeout: 1000,
        driver,
      });
      assert.equal(res.element, hit);
      assert.deepEqual(res.foundBy, ["elementText"]);
      const calls = misses.reduce((n, el) => n + el.isExistingCalls, 0);
      assert.equal(calls, 0, "isExisting must not run per non-matching candidate");
      assert.equal(hit.isExistingCalls, 1);
    });

    it("still skips a matching candidate that no longer exists, and takes the next match", async function () {
      const gone = makeElement({ text: "Needle 1", existing: false });
      const next = makeElement({ text: "Needle 2" });
      const driver = makeDriver(() => [gone, next]);
      const res = await findElementByCriteria({
        elementText: "/Needle \\d/",
        timeout: 1000,
        driver,
      });
      assert.equal(res.element, next);
    });

    it("collects every match with all: true, confirming each one exists", async function () {
      const a = makeElement({ text: "Needle 1" });
      const miss = makeElement({ text: "Row" });
      const b = makeElement({ text: "Needle 2" });
      const driver = makeDriver(() => [a, miss, b]);
      const res = await findElementByCriteria({
        elementText: "/Needle \\d/",
        timeout: 1000,
        driver,
        all: true,
      });
      assert.deepEqual(res.elements, [a, b]);
      assert.equal(miss.isExistingCalls, 0);
    });

    // #757: wdio's isExisting() on a `$$` element re-runs the whole query, so
    // n matches cost n extra queries. The check goes straight to the
    // element's own ID instead.
    it("confirms all: true matches by element ID, without re-running the query", async function () {
      const n = 200;
      const els = Array.from({ length: n }, (_, i) => ({
        ...makeElement({ text: `Needle ${i}` }),
        elementId: `e${i}`,
      }));
      const driver = makeDriver(() => els);
      driver.tagNameCalls = [];
      driver.getElementTagName = async (id) => {
        driver.tagNameCalls.push(id);
        return "p";
      };
      const res = await findElementByCriteria({
        elementText: "/Needle \\d+/",
        timeout: 1000,
        driver,
        all: true,
      });
      assert.equal(res.elements.length, n);
      assert.equal(driver.queries.length, 1, "one candidate query, not one per match");
      assert.equal(els.reduce((c, el) => c + el.isExistingCalls, 0), 0);
      assert.equal(driver.tagNameCalls.length, n);
    });

    it("skips a match whose element ID has gone stale", async function () {
      const gone = { ...makeElement({ text: "Needle 1" }), elementId: "gone" };
      const next = { ...makeElement({ text: "Needle 2" }), elementId: "next" };
      const driver = makeDriver(() => [gone, next]);
      driver.getElementTagName = async (id) => {
        if (id === "gone") throw new Error("stale element reference");
        return "p";
      };
      const res = await findElementByCriteria({
        elementText: "/Needle \\d/",
        timeout: 1000,
        driver,
        all: true,
      });
      assert.deepEqual(res.elements, [next]);
    });
  });
});
