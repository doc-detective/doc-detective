// findElementByShorthand polls every strategy together and returns as soon as
// one matches, instead of waiting out each non-matching strategy's full
// timeout (ADR 01130).
//
// The fake driver mirrors webdriverio's contract closely enough to show the
// old cost: `$(query)` resolves an element that carries an `elementId` only
// when the query matches *at call time*, and `waitForExist({ timeout })` polls
// until the query matches or the timeout elapses, then rejects. Which queries
// match is a function of elapsed time, so tests can model late-rendering DOMs.

import assert from "node:assert/strict";
import { findElementByShorthand } from "../dist/core/tests/findStrategies.js";

// Map a shorthand query to its strategy name, matching the five lookups
// findElementByShorthand issues.
function strategyOf(query) {
  if (query.startsWith("aria/")) return "elementAria";
  if (query.startsWith("//*[normalize-space(.)=")) return "elementText";
  if (query.startsWith("//*[@id=")) return "elementId";
  if (query.startsWith("//*[@data-testid=")) return "elementTestId";
  return "selector";
}

// `presentAt` maps a strategy name to the ms (since driver creation) at which
// its query starts matching. Absent = never matches.
function makeDriver(presentAt = {}) {
  const t0 = Date.now();
  const matches = (strategy) =>
    presentAt[strategy] !== undefined && Date.now() - t0 >= presentAt[strategy];
  const calls = [];
  const driver = {
    calls,
    $: async (query) => {
      const strategy = strategyOf(query);
      calls.push(strategy);
      const el = {
        strategy,
        waitForExist: async ({ timeout = 0 } = {}) => {
          const start = Date.now();
          for (;;) {
            if (matches(strategy)) {
              el.elementId = `id-${strategy}`;
              return true;
            }
            if (Date.now() - start >= timeout) {
              throw new Error(`still not existing after ${timeout}ms`);
            }
            await new Promise((r) => setTimeout(r, 20));
          }
        },
      };
      if (matches(strategy)) el.elementId = `id-${strategy}`;
      return el;
    },
  };
  return driver;
}

async function timed(fn) {
  const start = Date.now();
  const res = await fn();
  return { res, ms: Date.now() - start };
}

describe("findElementByShorthand polling (ADR 01130)", function () {
  this.timeout(15000);

  it("returns as soon as one strategy matches instead of waiting out the others", async function () {
    const driver = makeDriver({ elementText: 0 });
    const { res, ms } = await timed(() =>
      findElementByShorthand({ string: "Hello", timeout: 3000, driver })
    );
    assert.equal(res.foundBy, "elementText");
    assert.equal(res.element.elementId, "id-elementText");
    assert.ok(ms < 1000, `expected an immediate match, took ${ms}ms`);
  });

  for (const strategy of [
    "elementText",
    "elementAria",
    "elementId",
    "elementTestId",
    "selector",
  ]) {
    it(`returns promptly when only ${strategy} matches`, async function () {
      const driver = makeDriver({ [strategy]: 0 });
      const { res, ms } = await timed(() =>
        findElementByShorthand({ string: "thing", timeout: 3000, driver })
      );
      assert.equal(res.foundBy, strategy);
      assert.equal(res.element.strategy, strategy);
      assert.ok(ms < 1000, `expected an immediate match, took ${ms}ms`);
    });
  }

  it("applies precedence among strategies that match at the same time", async function () {
    const driver = makeDriver({
      selector: 0,
      elementTestId: 0,
      elementId: 0,
      elementAria: 0,
      elementText: 0,
    });
    const res = await findElementByShorthand({
      string: "thing",
      timeout: 3000,
      driver,
    });
    // selector > elementText > elementAria > elementId > elementTestId.
    assert.equal(res.foundBy, "selector");

    const driver2 = makeDriver({ elementTestId: 0, elementId: 0 });
    const res2 = await findElementByShorthand({
      string: "thing",
      timeout: 3000,
      driver: driver2,
    });
    assert.equal(res2.foundBy, "elementId");
  });

  it("a matching selector beats a text match on the same pass", async function () {
    const driver = makeDriver({ selector: 0, elementText: 0 });
    const res = await findElementByShorthand({
      string: "thing",
      timeout: 3000,
      driver,
    });
    assert.equal(res.foundBy, "selector");
    assert.equal(res.element.strategy, "selector");
  });

  it("text still wins when no selector matches", async function () {
    const driver = makeDriver({ elementText: 0, elementAria: 0, elementId: 0 });
    const res = await findElementByShorthand({
      string: "thing",
      timeout: 3000,
      driver,
    });
    assert.equal(res.foundBy, "elementText");
  });

  it("re-checks the selector before accepting a lower hit, so a selector that appears a moment later on the same pass wins", async function () {
    // The selector's first lookup misses and its second one hits: the pass
    // finds text, then the re-check finds the selector.
    let selectorCalls = 0;
    const base = makeDriver({ elementText: 0 });
    const driver = {
      $: async (query) => {
        const el = await base.$(query);
        if (el.strategy === "selector" && ++selectorCalls >= 2) {
          el.elementId = "id-selector";
          el.waitForExist = async () => true;
        }
        return el;
      },
    };
    const res = await findElementByShorthand({
      string: "thing",
      timeout: 3000,
      driver,
    });
    assert.equal(res.foundBy, "selector");
    assert.equal(selectorCalls, 2, "expected exactly one re-check, not a wait");
  });

  it("keeps polling until a late element appears", async function () {
    const driver = makeDriver({ elementText: 400 });
    const { res, ms } = await timed(() =>
      findElementByShorthand({ string: "Late", timeout: 3000, driver })
    );
    assert.equal(res.foundBy, "elementText");
    assert.ok(ms >= 350 && ms < 1500, `expected ~400ms, took ${ms}ms`);
  });

  it("returns the highest-precedence strategy present when the first match appears (a later higher-precedence match doesn't win)", async function () {
    // elementText matches immediately; the selector would match at 600ms. The
    // first poll that finds anything decides, after one re-check (ADR 01130).
    const driver = makeDriver({ elementText: 0, selector: 600 });
    const { res, ms } = await timed(() =>
      findElementByShorthand({ string: "thing", timeout: 3000, driver })
    );
    assert.equal(res.foundBy, "elementText");
    assert.ok(ms < 500, `expected an immediate match, took ${ms}ms`);
  });

  it("waits the full timeout and returns nulls when nothing matches", async function () {
    const driver = makeDriver({});
    const { res, ms } = await timed(() =>
      findElementByShorthand({ string: "nothing", timeout: 600, driver })
    );
    assert.deepEqual(res, { element: null, foundBy: null });
    assert.ok(ms >= 600 && ms < 1500, `expected ~600ms, took ${ms}ms`);
    // Every strategy was re-polled, not queried once and abandoned.
    assert.ok(
      driver.calls.filter((s) => s === "elementText").length > 1,
      "expected the text strategy to be re-polled"
    );
  });

  it("checks exactly once when timeout is 0", async function () {
    const driver = makeDriver({ elementAria: 0 });
    const res = await findElementByShorthand({
      string: "thing",
      timeout: 0,
      driver,
    });
    assert.equal(res.foundBy, "elementAria");

    const missDriver = makeDriver({});
    const { res: miss, ms } = await timed(() =>
      findElementByShorthand({ string: "thing", timeout: 0, driver: missDriver })
    );
    assert.deepEqual(miss, { element: null, foundBy: null });
    assert.equal(missDriver.calls.length, 5);
    assert.ok(ms < 500, `expected an immediate return, took ${ms}ms`);
  });

  it("drops a strategy whose lookup rejects and still finds via the others", async function () {
    const base = makeDriver({ elementId: 200 });
    const driver = {
      ...base,
      $: (query) =>
        strategyOf(query) === "elementText"
          ? Promise.reject(new Error("invalid selector"))
          : base.$(query),
    };
    const res = await findElementByShorthand({
      string: "thing",
      timeout: 3000,
      driver,
    });
    assert.equal(res.foundBy, "elementId");
  });

  it("quotes a string containing a double quote as a valid XPath literal in the id/testid lookups", async function () {
    const queries = [];
    const driver = {
      $: async (query) => {
        queries.push(query);
        return {};
      },
    };
    await findElementByShorthand({ string: 'say "hi"', timeout: 0, driver });
    assert.ok(queries.includes(`//*[@id='say "hi"']`), queries.join("\n"));
    assert.ok(
      queries.includes(`//*[@data-testid='say "hi"']`),
      queries.join("\n")
    );
  });

  it("returns immediately when every lookup rejects", async function () {
    const driver = { $: () => Promise.reject(new Error("no session")) };
    const { res, ms } = await timed(() =>
      findElementByShorthand({ string: "thing", timeout: 3000, driver })
    );
    assert.deepEqual(res, { element: null, foundBy: null });
    assert.ok(ms < 500, `expected an immediate return, took ${ms}ms`);
  });
});
