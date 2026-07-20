// `all: true` on an annotation must annotate EVERY matching element, not just
// the first — redacting only the first `.secret` would leave the rest of the
// sensitive content visible, which is worse than not redacting at all because
// it looks handled.
//
// Rather than duplicating find semantics (regex, normalized text, class and
// attribute matching), this rides findElementByCriteria's existing candidate
// enumeration via an `all` option. These tests pin that option's contract
// against a fake driver — hermetic, no browser.

import assert from "node:assert/strict";
import { findElementByCriteria } from "../dist/core/tests/findStrategies.js";

function makeElement({ id, classes = "", text = "", attrs = {} } = {}) {
  return {
    elementId: id,
    async isExisting() {
      return true;
    },
    async getText() {
      return text;
    },
    async getComputedLabel() {
      return "";
    },
    async getAttribute(name) {
      if (name === "class") return classes;
      if (name === "id") return id;
      return attrs[name] ?? null;
    },
  };
}

function fakeDriver(elements) {
  return {
    async $$() {
      return elements;
    },
  };
}

describe("findElementByCriteria — all option", function () {
  it("returns only the first match by default", async function () {
    const driver = fakeDriver([
      makeElement({ id: "a", classes: "secret" }),
      makeElement({ id: "b", classes: "secret" }),
    ]);
    const result = await findElementByCriteria({
      selector: ".secret",
      driver,
      timeout: 500,
    });
    assert.equal(result.error, null);
    assert.equal(result.element.elementId, "a");
  });

  it("returns every match when all is true", async function () {
    const driver = fakeDriver([
      makeElement({ id: "a", classes: "secret" }),
      makeElement({ id: "b", classes: "secret" }),
      makeElement({ id: "c", classes: "secret" }),
    ]);
    const result = await findElementByCriteria({
      selector: ".secret",
      driver,
      timeout: 500,
      all: true,
    });
    assert.equal(result.error, null);
    assert.equal(result.elements.length, 3);
    assert.deepEqual(
      result.elements.map((e) => e.elementId),
      ["a", "b", "c"]
    );
    // `element` still holds the first match, so existing callers are unaffected.
    assert.equal(result.element.elementId, "a");
  });

  it("still exposes elements as a single-item array when all is false", async function () {
    const driver = fakeDriver([makeElement({ id: "a", classes: "secret" })]);
    const result = await findElementByCriteria({
      selector: ".secret",
      driver,
      timeout: 500,
    });
    assert.deepEqual(
      result.elements.map((e) => e.elementId),
      ["a"]
    );
  });

  it("filters by criteria when collecting all matches", async function () {
    const driver = fakeDriver([
      makeElement({ id: "a", attrs: { "data-sensitive": "true" } }),
      makeElement({ id: "b", attrs: { "data-sensitive": null } }),
      makeElement({ id: "c", attrs: { "data-sensitive": "true" } }),
    ]);
    const result = await findElementByCriteria({
      elementAttribute: { "data-sensitive": true },
      driver,
      timeout: 500,
      all: true,
    });
    assert.deepEqual(
      result.elements.map((e) => e.elementId),
      ["a", "c"]
    );
  });

  it("errors when nothing matches, even with all set", async function () {
    const driver = fakeDriver([]);
    const result = await findElementByCriteria({
      selector: ".nope",
      driver,
      timeout: 300,
      all: true,
    });
    assert.ok(result.error);
    assert.equal(result.element, null);
  });
});
