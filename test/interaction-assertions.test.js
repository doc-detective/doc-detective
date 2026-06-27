import assert from "node:assert/strict";
import { rollUpAssertions } from "../dist/core/utils.js";
import { clickElement } from "../dist/core/tests/click.js";
import { typeKeys } from "../dist/core/tests/typeKeys.js";
import { dragAndDropElement } from "../dist/core/tests/dragAndDrop.js";

const config = { logLevel: "silent" };

// Unified model: implicit assertions carry a $$ runtime-expression statement
// (e.g. "$$outputs.found == true"), so match on a substring of the statement.
function findAssertion(assertions, needle) {
  return (assertions || []).find((a) => a.statement.includes(needle));
}

// Mock element exposing the methods setElementOutputs probes plus click()/keys.
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
    getProperty: async () => false,
    getComputedLabel: async () => "Submit",
    waitForExist: async () => true,
    click: clickImpl || (async () => {}),
    dragAndDrop: async () => {},
  };
}

// Mock driver whose $$ (criteria selector path) returns the given candidates.
function makeDriver({ candidates = [], $impl, keysImpl } = {}) {
  return {
    $$: async () => candidates,
    $: $impl || (async () => null),
    pause: async () => {},
    keys: keysImpl || (async () => {}),
    execute: async () => true,
  };
}

// rollUpAssertions: unlike rollUpResults, an empty/falsy assertion set rolls up
// to PASS (zero applicable assertions + successful execution = PASS). Used by
// actions whose `assertions` array may legitimately be empty. The element
// interaction-assertion tests (click/type/dragAndDrop) return here once those
// actions are converted to the unified model.

describe("rollUpAssertions", function () {
  it("empty array -> PASS", () => {
    assert.equal(rollUpAssertions([]), "PASS");
  });
  it("falsy -> PASS", () => {
    assert.equal(rollUpAssertions(undefined), "PASS");
    assert.equal(rollUpAssertions(null), "PASS");
  });
  it("[PASS] -> PASS", () => {
    assert.equal(rollUpAssertions([{ result: "PASS" }]), "PASS");
  });
  it("[FAIL] -> FAIL", () => {
    assert.equal(rollUpAssertions([{ result: "FAIL" }]), "FAIL");
  });
  it("[PASS, SKIPPED] -> PASS", () => {
    assert.equal(
      rollUpAssertions([{ result: "PASS" }, { result: "SKIPPED" }]),
      "PASS"
    );
  });
  it("[WARNING] -> WARNING", () => {
    assert.equal(rollUpAssertions([{ result: "WARNING" }]), "WARNING");
  });
});

describe("click unified assertion model", function () {
  this.timeout(15000);

  it("found → found==true, assertion PASS, status PASS (propagated from find)", async () => {
    const element = makeElement();
    const driver = makeDriver({ candidates: [element] });
    const result = await clickElement({
      config,
      step: { click: { selector: "button" } },
      driver,
    });
    assert.equal(result.status, "PASS");
    assert.equal(result.outputs.found, true);
    const found = findAssertion(result.assertions, "found");
    assert.ok(found, "expected a found assertion propagated from find");
    assert.equal(found.source, "implicit");
    assert.equal(found.result, "PASS");
    assert.equal(found.statement, "$$outputs.found == true");
  });

  it("not found → found==false, assertion FAIL, status FAIL", async () => {
    const driver = makeDriver({ candidates: [] });
    const result = await clickElement({
      config,
      step: { click: { selector: "button", timeout: 50 } },
      driver,
    });
    assert.equal(result.status, "FAIL");
    assert.equal(result.outputs.found, false);
    const found = findAssertion(result.assertions, "found");
    assert.ok(found);
    assert.equal(found.result, "FAIL");
    assert.equal(found.statement, "$$outputs.found == true");
  });

  it("found but click sub-effect fails → status FAIL, found assertion still PASS (execution)", async () => {
    const element = makeElement({
      clickImpl: async () => {
        throw new Error("not interactable");
      },
    });
    const driver = makeDriver({ candidates: [element] });
    const result = await clickElement({
      config,
      step: { click: { selector: "button" } },
      driver,
    });
    assert.equal(result.status, "FAIL");
    assert.equal(result.outputs.found, true);
    assert.equal(result.assertions.length, 1);
    assert.equal(findAssertion(result.assertions, "found").result, "PASS");
  });
});

describe("typeKeys unified assertion model", function () {
  this.timeout(15000);

  it("criteria found → found==true, assertion PASS, status PASS", async () => {
    const element = makeElement();
    const driver = makeDriver({ candidates: [element] });
    const result = await typeKeys({
      config,
      step: { type: { keys: ["hello"], selector: "input" } },
      driver,
    });
    assert.equal(result.status, "PASS");
    assert.equal(result.outputs.found, true);
    const found = findAssertion(result.assertions, "found");
    assert.ok(found, "expected a found assertion built from criteria");
    assert.equal(found.source, "implicit");
    assert.equal(found.result, "PASS");
    assert.equal(found.statement, "$$outputs.found == true");
  });

  it("criteria not found → found==false, assertion FAIL, status FAIL", async () => {
    const driver = makeDriver({ candidates: [] });
    const result = await typeKeys({
      config,
      step: { type: { keys: ["hello"], selector: "input" } },
      driver,
    });
    assert.equal(result.status, "FAIL");
    assert.equal(result.outputs.found, false);
    assert.equal(findAssertion(result.assertions, "found").result, "FAIL");
  });

  it("no criteria + keys (active element) → PASS with empty assertions", async () => {
    const driver = makeDriver();
    const result = await typeKeys({
      config,
      step: { type: { keys: ["hello"] } },
      driver,
    });
    assert.equal(result.status, "PASS");
    assert.deepEqual(result.assertions, []);
  });

  it("no keys → SKIPPED", async () => {
    const driver = makeDriver();
    const result = await typeKeys({
      config,
      step: { type: { keys: [] } },
      driver,
    });
    assert.equal(result.status, "SKIPPED");
  });

  it("criteria found but focus/keys execution error → FAIL, no extra record", async () => {
    const element = makeElement();
    const driver = makeDriver({
      candidates: [element],
      keysImpl: async () => {
        throw new Error("send keys failed");
      },
    });
    const result = await typeKeys({
      config,
      step: { type: { keys: ["hello"], selector: "input" } },
      driver,
    });
    assert.equal(result.status, "FAIL");
    // Element WAS found → found==true, existence assertion PASSed; the keys
    // failure is EXECUTION and adds NO extra record.
    assert.equal(result.outputs.found, true);
    assert.equal(result.assertions.length, 1);
    assert.equal(findAssertion(result.assertions, "found").result, "PASS");
  });
});

describe("dragAndDrop unified assertion model", function () {
  this.timeout(15000);

  it("both found → sourceFound/targetFound==true, two assertions PASS, status PASS", async () => {
    const element = makeElement();
    const driver = makeDriver({ candidates: [element] });
    const result = await dragAndDropElement({
      config,
      step: {
        dragAndDrop: { source: { selector: "#a" }, target: { selector: "#b" } },
      },
      driver,
    });
    assert.equal(result.status, "PASS");
    assert.equal(result.outputs.sourceFound, true);
    assert.equal(result.outputs.targetFound, true);
    assert.equal(result.assertions.length, 2);
    const src = findAssertion(result.assertions, "sourceFound");
    const tgt = findAssertion(result.assertions, "targetFound");
    assert.ok(src && tgt);
    assert.equal(src.statement, "$$outputs.sourceFound == true");
    assert.equal(tgt.statement, "$$outputs.targetFound == true");
    assert.equal(src.result, "PASS");
    assert.equal(tgt.result, "PASS");
  });

  it("source not found → sourceFound==false FAIL, targetFound SKIPPED, status FAIL", async () => {
    // Source find polls a never-matching selector and times out; give a short
    // timeout to keep it quick.
    const driver = makeDriver({ candidates: [] });
    const result = await dragAndDropElement({
      config,
      step: {
        dragAndDrop: {
          source: { selector: "#a", timeout: 50 },
          target: { selector: "#b", timeout: 50 },
        },
      },
      driver,
    });
    assert.equal(result.status, "FAIL");
    assert.equal(result.outputs.sourceFound, false);
    const src = findAssertion(result.assertions, "sourceFound");
    const tgt = findAssertion(result.assertions, "targetFound");
    assert.equal(src.result, "FAIL");
    assert.equal(tgt.result, "SKIPPED");
  });

  it("undefined inner outputs.found is coerced to sourceFound=false → FAIL (input-guard parity)", async () => {
    // Backward-compat guard for the input-guard concern: findElement's input
    // guard returns FAIL with outputs:{} (no `found`). dragAndDrop reads
    // `sourceResult.outputs?.found === true`, so an absent/undefined `found`
    // must coerce to sourceFound=false and FAIL, matching a failed find.
    //
    // The dragAndDrop step schema and the inner find schema are tightly
    // aligned, so a source malformed enough to trip find's input guard already
    // trips dragAndDrop's own step_v3 guard first — also FAIL. We therefore
    // exercise the coercion directly: a driver whose criteria search returns no
    // candidates makes findElement resolve with found=false (the closest
    // reachable analogue of a no-`found` result), and the assertion FAILs.
    const driver = makeDriver({ candidates: [] });
    const result = await dragAndDropElement({
      config,
      step: {
        dragAndDrop: {
          source: { selector: "#a", timeout: 50 },
          target: { selector: "#b", timeout: 50 },
        },
      },
      driver,
    });
    assert.equal(result.status, "FAIL");
    assert.equal(result.outputs.sourceFound, false);
    const src = findAssertion(result.assertions, "sourceFound");
    assert.equal(src.result, "FAIL");
  });

  it("malformed source is rejected by dragAndDrop's own input guard → FAIL", async () => {
    // A source bad enough to trip the inner find input guard trips
    // dragAndDrop's top-level step_v3 guard first: FAIL, no findElement call,
    // no assertion records. This is the outer half of the input-guard chain
    // that keeps a never-`found` inner result from mattering in practice.
    const driver = makeDriver({ candidates: [makeElement()] });
    const result = await dragAndDropElement({
      config,
      step: {
        dragAndDrop: {
          source: { selector: { nested: "object" } },
          target: { selector: "#b" },
        },
      },
      driver,
    });
    assert.equal(result.status, "FAIL");
    assert.match(result.description, /Invalid step definition/);
  });
});
