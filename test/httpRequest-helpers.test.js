import assert from "node:assert/strict";
import { fieldExistsAtPath, objectExistsInObject, arrayExistsInArray } from "../dist/core/tests/httpRequest.js";

describe("httpRequest helper functions", function () {
  describe("fieldExistsAtPath()", function () {
    it("finds simple top-level key", function () {
      assert.equal(fieldExistsAtPath({ name: "John" }, "name"), true);
    });

    it("finds nested path", function () {
      assert.equal(fieldExistsAtPath({ user: { name: "John" } }, "user.name"), true);
    });

    it("returns false for missing nested path", function () {
      assert.equal(fieldExistsAtPath({ user: { name: "John" } }, "user.email"), false);
    });

    it("finds array index path", function () {
      assert.equal(fieldExistsAtPath({ items: [{ id: 1 }] }, "items[0].id"), true);
    });

    it("returns false for out-of-bounds array index", function () {
      assert.equal(fieldExistsAtPath({ items: [{ id: 1 }] }, "items[5].id"), false);
    });

    it("returns false for path into missing parent", function () {
      assert.equal(fieldExistsAtPath({}, "a.b.c"), false);
    });

    it("returns false for null path segments", function () {
      assert.equal(fieldExistsAtPath({ a: 1 }, ""), false);
    });

    it("finds deeply nested path", function () {
      const obj = { a: { b: { c: { d: 42 } } } };
      assert.equal(fieldExistsAtPath(obj, "a.b.c.d"), true);
    });
  });

  describe("objectExistsInObject()", function () {
    it("passes for subset match", function () {
      const result = objectExistsInObject({ a: 1 }, { a: 1, b: 2 });
      assert.equal(result.result.status, "PASS");
    });

    it("fails for missing key", function () {
      const result = objectExistsInObject({ c: 3 }, { a: 1 });
      assert.equal(result.result.status, "FAIL");
    });

    it("passes for nested object match", function () {
      const result = objectExistsInObject(
        { user: { name: "John" } },
        { user: { name: "John", age: 30 }, extra: true }
      );
      assert.equal(result.result.status, "PASS");
    });

    it("fails for value mismatch", function () {
      const result = objectExistsInObject({ a: 1 }, { a: 2 });
      assert.equal(result.result.status, "FAIL");
    });

    it("passes for empty expected object", function () {
      const result = objectExistsInObject({}, { a: 1, b: 2 });
      assert.equal(result.result.status, "PASS");
    });

    it("passes for array value match", function () {
      const result = objectExistsInObject(
        { tags: ["a"] },
        { tags: ["a", "b"] }
      );
      assert.equal(result.result.status, "PASS");
    });

    it("fails for array value mismatch", function () {
      const result = objectExistsInObject(
        { tags: ["c"] },
        { tags: ["a", "b"] }
      );
      assert.equal(result.result.status, "FAIL");
    });
  });

  describe("arrayExistsInArray()", function () {
    it("passes for subset array", function () {
      const result = arrayExistsInArray([1, 2], [1, 2, 3]);
      assert.equal(result.result.status, "PASS");
    });

    it("fails for missing element", function () {
      const result = arrayExistsInArray([4], [1, 2, 3]);
      assert.equal(result.result.status, "FAIL");
    });

    it("passes for object subset in array", function () {
      const result = arrayExistsInArray(
        [{ id: 1 }],
        [{ id: 1, name: "test" }, { id: 2 }]
      );
      assert.equal(result.result.status, "PASS");
    });

    it("fails for object not in array", function () {
      const result = arrayExistsInArray(
        [{ id: 3 }],
        [{ id: 1 }, { id: 2 }]
      );
      assert.equal(result.result.status, "FAIL");
    });

    it("passes for empty expected array", function () {
      const result = arrayExistsInArray([], [1, 2, 3]);
      assert.equal(result.result.status, "PASS");
    });

    it("passes for string elements", function () {
      const result = arrayExistsInArray(["a", "b"], ["a", "b", "c"]);
      assert.equal(result.result.status, "PASS");
    });
  });
});
