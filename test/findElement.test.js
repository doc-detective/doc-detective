import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { findElement } from "../dist/core/tests/findElement.js";

const config = { logLevel: "silent" };

// Read the AUTHORED schema, not a generated copy: the `default` keyword is
// what the docs generator prints and what users read, and it's the half of
// this invariant that nothing else covers.
const FIND_V3 = JSON.parse(
  fs.readFileSync(
    path.join(
      path.dirname(fileURLToPath(import.meta.url)),
      "..",
      "src",
      "common",
      "src",
      "schemas",
      "src_schemas",
      "find_v3.schema.json"
    ),
    "utf8"
  )
);

/**
 * find's declared `moveTo`, located by SEARCHING the detailed object's branches
 * rather than by a fixed path.
 *
 * The object is wrapped as `allOf: [shape, guard]` so the TypeScript generator
 * doesn't collapse it to an index signature, which puts `properties` one level
 * deeper than the obvious `components.schemas.object.properties`. Hard-coding
 * either shape makes this test fail the next time the wrapping is revisited,
 * for a reason that has nothing to do with what it is asserting.
 */
function declaredMoveTo() {
  const object = FIND_V3.components.schemas.object;
  const branches = [object, ...(object.allOf ?? []), ...(object.anyOf ?? []), ...(object.oneOf ?? [])];
  for (const branch of branches) {
    const prop = branch?.properties?.moveTo;
    if (prop && Object.prototype.hasOwnProperty.call(prop, "default")) return prop.default;
  }
  throw new Error("find_v3 declares no moveTo default — the schema shape changed");
}

// Helper: find the implicit assertion whose statement CONTAINS `needle`. Under
// the unified model `statement` is a runtime `$$` expression, so we match on the
// distinguishing output reference (here, "found").
function findAssertion(assertions, needle) {
  return (assertions || []).find((a) => a.statement.includes(needle));
}

// Build a mock element exposing the methods setElementOutputs probes plus
// click(). `clickImpl` lets a test force the click sub-effect to throw.
function makeElement({ elementId = "el-1", clickImpl } = {}) {
  return {
    elementId,
    getText: async () => "Submit",
    getHTML: async () => "<button>Submit</button>",
    getTagName: async () => "button",
    getValue: async () => "",
    getLocation: async () => ({ x: 0, y: 0 }),
    getSize: async () => ({ width: 10, height: 10 }),
    isClickable: async () => true,
    isEnabled: async () => true,
    isSelected: async () => false,
    isDisplayed: async () => true,
    isExisting: async () => true,
    getAttribute: async () => null,
    getComputedLabel: async () => "Submit",
    waitForExist: async () => true,
    click: clickImpl || (async () => {}),
  };
}

// Mock driver whose $$ (criteria selector path) returns the given candidates.
function makeDriver({ candidates = [], $impl } = {}) {
  return {
    $$: async () => candidates,
    $: $impl || (async () => null),
    pause: async () => {},
  };
}

describe("findElement unified assertion model", function () {
  this.timeout(15000);

  it("found via selector → found==true, assertion PASS, status PASS, element.* populated", async () => {
    const element = makeElement();
    const driver = makeDriver({ candidates: [element] });
    const result = await findElement({
      config,
      step: { find: { selector: "button" } },
      driver,
    });
    assert.equal(result.status, "PASS");
    assert.equal(result.outputs.found, true);
    const found = findAssertion(result.assertions, "found");
    assert.ok(found, "expected a found assertion");
    assert.equal(found.source, "implicit");
    assert.equal(found.result, "PASS");
    assert.equal(found.statement, "$$outputs.found == true");
    // element.* / rawElement preserved
    assert.equal(result.outputs.element.tag, "button");
    assert.equal(result.outputs.element.text, "Submit");
    assert.equal(result.outputs.rawElement, element);
  });

  it("found via shorthand string → found==true, assertion PASS, element.* populated", async () => {
    const element = makeElement();
    // Shorthand exact-match path resolves the text promise (driver.$).
    const driver = makeDriver({ $impl: async () => element });
    const result = await findElement({
      config,
      step: { find: "Submit" },
      driver,
    });
    assert.equal(result.status, "PASS");
    assert.equal(result.outputs.found, true);
    assert.equal(findAssertion(result.assertions, "found").result, "PASS");
    assert.equal(result.outputs.element.tag, "button");
    assert.equal(result.outputs.rawElement, element);
  });

  it("not found (criteria) → found==false, assertion FAIL, status FAIL, no element.*", async () => {
    // No candidates ever match → criteria path times out quickly.
    const driver = makeDriver({ candidates: [] });
    const result = await findElement({
      config,
      step: { find: { selector: "button", timeout: 50 } },
      driver,
    });
    assert.equal(result.status, "FAIL");
    assert.equal(result.outputs.found, false);
    const found = findAssertion(result.assertions, "found");
    assert.ok(found);
    assert.equal(found.result, "FAIL");
    assert.equal(found.statement, "$$outputs.found == true");
    assert.equal(result.outputs.element, undefined);
    assert.equal(result.outputs.rawElement, undefined);
  });

  it("not found (shorthand) → found==false, assertion FAIL, status FAIL", async () => {
    const driver = makeDriver({ $impl: async () => null });
    const result = await findElement({
      config,
      step: { find: "Nonexistent" },
      driver,
    });
    assert.equal(result.status, "FAIL");
    assert.equal(result.outputs.found, false);
    assert.equal(findAssertion(result.assertions, "found").result, "FAIL");
  });

  it("shorthand string + caller click request → click sub-effect runs", async () => {
    let clicks = 0;
    const element = makeElement({
      clickImpl: async () => {
        clicks++;
      },
    });
    const driver = makeDriver({ $impl: async () => element });
    const result = await findElement({
      config,
      step: { find: "Submit" },
      driver,
      click: true,
    });
    assert.equal(result.status, "PASS");
    assert.equal(result.outputs.found, true);
    assert.equal(clicks, 1, "caller-requested click must fire on the shorthand path");
    assert.ok(/Clicked element/.test(result.description));
  });

  it("shorthand string + click request, click throws → FAIL, found assertion still PASS", async () => {
    const element = makeElement({
      clickImpl: async () => {
        throw new Error("not interactable");
      },
    });
    const driver = makeDriver({ $impl: async () => element });
    const result = await findElement({
      config,
      step: { find: "Submit" },
      driver,
      click: true,
    });
    assert.equal(result.status, "FAIL");
    assert.equal(result.outputs.found, true);
    assert.equal(result.assertions.length, 1);
    assert.equal(findAssertion(result.assertions, "found").result, "PASS");
    assert.ok(/Couldn't click/.test(result.description));
  });

  it("left-button clicks use the argument-less classic click (mobile-web compatible)", async () => {
    // With options, WebdriverIO implements click via W3C pointer actions,
    // which XCUITest rejects in a web context ("only supports W3C actions
    // execution in the native context") — so a default/left click must call
    // element.click() bare, which maps to the classic element-click endpoint
    // and works on desktop AND device browsers (phase A5).
    const calls = [];
    const element = makeElement({
      clickImpl: async (...args) => {
        calls.push(args);
      },
    });
    // Shorthand path.
    const driver = makeDriver({ $impl: async () => element });
    await findElement({ config, step: { find: "Submit" }, driver, click: true });
    // Criteria path with an explicit left button.
    const driver2 = makeDriver({ candidates: [element] });
    await findElement({
      config,
      step: { find: { selector: "button", click: { button: "left" } } },
      driver: driver2,
    });
    assert.equal(calls.length, 2);
    for (const args of calls) {
      assert.deepEqual(args, [], "left click must not pass options");
    }
  });

  it("non-left buttons still pass the button option (needs pointer actions)", async () => {
    const calls = [];
    const element = makeElement({
      clickImpl: async (...args) => {
        calls.push(args);
      },
    });
    const driver = makeDriver({ candidates: [element] });
    await findElement({
      config,
      step: { find: { selector: "button", click: { button: "right" } } },
      driver,
    });
    assert.equal(calls.length, 1);
    assert.deepEqual(calls[0], [{ button: "right" }]);
  });

  // A schema `default` is documentation, not behavior: find_v3's properties
  // sit inside an `anyOf`, and Ajv skips defaults there, so nothing injects
  // the value. The runtime carries its own default in the `step.find = {...}`
  // normalization block, and the two drifted apart unnoticed — the schema and
  // docs advertised `true` while every run behaved as `false`. These pin them
  // together so the next divergence fails here instead of shipping.
  it("moveTo's declared default is false", function () {
    assert.equal(declaredMoveTo(), false);
  });

  it("a bare find performs no moveTo, matching the declared default", async () => {
    const element = makeElement();
    const driver = makeDriver({ candidates: [element] });
    const result = await findElement({
      config,
      step: { find: { selector: "button" } },
      driver,
    });

    // findElement appends this only when it takes the moveTo branch, and it
    // appends unconditionally once inside — so it reports whether the branch
    // ran, independent of whether the move itself succeeded.
    const movedAtRuntime = /Moved to element\./.test(result.description);
    assert.equal(
      movedAtRuntime,
      false,
      `a bare find moved to the element: ${result.description}`
    );
    assert.equal(
      movedAtRuntime,
      declaredMoveTo(),
      "find_v3's declared moveTo default no longer matches what a bare find does"
    );
  });

  it("found but click sub-effect fails → status FAIL with NO extra assertion record", async () => {
    const element = makeElement({
      clickImpl: async () => {
        throw new Error("not interactable");
      },
    });
    const driver = makeDriver({ candidates: [element] });
    const result = await findElement({
      config,
      step: { find: { selector: "button", click: true } },
      driver,
    });
    // Sub-effect failure is EXECUTION → FAIL.
    assert.equal(result.status, "FAIL");
    // The element WAS found, so found==true and the existence assertion PASSed;
    // the click failure adds NO extra record.
    assert.equal(result.outputs.found, true);
    assert.equal(result.assertions.length, 1);
    const found = findAssertion(result.assertions, "found");
    assert.equal(found.result, "PASS");
    assert.ok(/Couldn't click/.test(result.description));
  });
});
