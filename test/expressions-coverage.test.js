import assert from "node:assert/strict";
import {
  resolveExpression,
  evaluateAssertion,
  getMetaValue,
  replaceMetaValues,
} from "../dist/core/expressions.js";

// These tests target the previously-uncovered branches of src/core/expressions.ts
// (driven only through the 4 public exports). They are additive to
// expressions-unit.test.js and assert the real intended behavior.

describe("expressions coverage: resolveExpression passthrough + object/error paths", function () {
  // Lines 35-37: a non-string expression is returned verbatim.
  it("non-string expression returns the value unchanged (number)", async function () {
    assert.equal(await resolveExpression({ expression: 42, context: {} }), 42);
  });
  it("non-string expression returns the value unchanged (boolean)", async function () {
    assert.equal(
      await resolveExpression({ expression: true, context: {} }),
      true
    );
  });
  it("non-string expression returns the value unchanged (object)", async function () {
    const obj = { a: 1 };
    assert.equal(
      await resolveExpression({ expression: obj, context: {} }),
      obj
    );
  });

  // Lines 62-65: when an operator expression evaluates to an object, the result
  // is JSON.stringified. jq returns structured JSON, so a jq() call whose result
  // is an array/object exercises this. jq is an always-on function operator.
  it("operator expression evaluating to an object is JSON.stringified", async function () {
    const ctx = { data: { a: 1, b: 2 } };
    const r = await resolveExpression({
      expression: 'jq($$data, ".")',
      context: ctx,
    });
    // The whole object round-trips through JSON.stringify.
    assert.equal(typeof r, "string");
    assert.deepEqual(JSON.parse(r), { a: 1, b: 2 });
  });

  // Lines 70-76: the catch path. A jq() with an invalid jq query returns a
  // thenable that rejects; resolveExpression awaits the operator result, the
  // rejection throws, is caught, logged, and the ORIGINAL expression string is
  // returned verbatim.
  it("an expression that throws during evaluation returns the original string", async function () {
    const expr = 'jq($$data, "@@@bad")';
    const r = await resolveExpression({
      expression: expr,
      context: { data: { a: 1 } },
    });
    assert.equal(r, expr);
  });
});

describe("expressions coverage: replaceMetaValues bare-literal inline branch", function () {
  // Lines 110-132: with operators present, a string meta value that IS a bare JS
  // literal (number/true/false/null) is inlined RAW (line 131), not quoted.
  it("inlines a numeric string literal raw when operators are present", function () {
    const out = replaceMetaValues("$$n == 5", { n: "5" }, true);
    assert.equal(out, "5 == 5");
  });
  it("inlines the boolean literal 'true' raw when operators are present", function () {
    const out = replaceMetaValues("$$b == true", { b: "true" }, true);
    assert.equal(out, "true == true");
  });
  it("inlines the boolean literal 'false' raw when operators are present", function () {
    const out = replaceMetaValues("$$b == false", { b: "false" }, true);
    assert.equal(out, "false == false");
  });
  it("inlines the 'null' literal raw when operators are present", function () {
    const out = replaceMetaValues("$$x == null", { x: "null" }, true);
    assert.equal(out, "null == null");
  });
  it("quotes a non-literal string when operators are present", function () {
    const out = replaceMetaValues("$$s == foo", { s: "hello world" }, true);
    assert.equal(out, '"hello world" == foo');
  });
  // The else branch (line 134): no operators -> value.toString() inserted raw.
  it("inserts a value via toString when no operators are present", function () {
    const out = replaceMetaValues("$$n", { n: 7 }, false);
    assert.equal(out, "7");
  });
  // The object branch (line 102-103): object meta value -> JSON.stringify.
  it("JSON.stringifies an object meta value", function () {
    const out = replaceMetaValues("$$o", { o: { a: 1 } }, false);
    assert.equal(out, '{"a":1}');
  });
});

describe("expressions coverage: getMetaValue edge cases", function () {
  // Lines 189-191: no context -> undefined.
  it("returns undefined when context is null", function () {
    assert.equal(getMetaValue("anything", null), undefined);
  });
  it("returns undefined when context is undefined", function () {
    assert.equal(getMetaValue("anything", undefined), undefined);
  });

  // Lines 193-216: JSON pointer (#/...) is applied against a resolved object.
  it("applies a JSON pointer to drill into an object value", function () {
    const ctx = { outputs: { body: { user: { name: "ada" } } } };
    assert.equal(
      getMetaValue("outputs.body#/user/name", ctx),
      "ada"
    );
  });
  it("JSON pointer stops (undefined) when an intermediate key is missing", function () {
    const ctx = { outputs: { body: { user: { name: "ada" } } } };
    assert.equal(
      getMetaValue("outputs.body#/user/missing/deep", ctx),
      undefined
    );
  });
  it("JSON pointer over multiple segments resolves nested arrays/objects", function () {
    const ctx = { resp: { items: { "0": { id: 9 } } } };
    assert.equal(getMetaValue("resp#/items/0/id", ctx), 9);
  });
  // Lines 210-216: the JSON-pointer catch path. A throwing getter at a pointer
  // segment makes `value[key]` throw; the error is caught and logged and the
  // last value is returned (the partially-resolved object).
  it("JSON pointer swallows an error when a segment access throws", function () {
    const ctx = { o: {} };
    Object.defineProperty(ctx.o, "k", {
      enumerable: true,
      get() {
        throw new Error("boom");
      },
    });
    const r = getMetaValue("o#/k", ctx);
    // The catch returns the last good value (the object), not a throw.
    assert.equal(r, ctx.o);
  });

  // Lines 300-311: getNestedProperty array notation `prop[index]`.
  it("resolves array index notation in a nested path", function () {
    const ctx = { list: [{ name: "a" }, { name: "b" }] };
    assert.equal(getMetaValue("list[1].name", ctx), "b");
  });
  it("resolves a top-level array index notation", function () {
    assert.equal(getMetaValue("arr[0]", { arr: [10, 20] }), 10);
  });
  it("array index notation returns undefined when the array prop is missing", function () {
    assert.equal(getMetaValue("missing[0]", { other: [1] }), undefined);
  });

  // Lines 228-237: resolvePathTemplateVariables resolves {{id}} from context.id.
  it("resolves a {{id}} template variable in the path from context.id", function () {
    const ctx = { id: "step1", steps: { step1: { exitCode: 0 } } };
    assert.equal(getMetaValue("steps.{{id}}.exitCode", ctx), 0);
  });
  it("leaves an unknown {{var}} template untouched (no match)", function () {
    const ctx = { id: "step1" };
    // {{other}} is not resolved, so the literal path won't resolve -> undefined.
    assert.equal(getMetaValue("steps.{{other}}.x", ctx), undefined);
  });
});

describe("expressions coverage: resolveEmbeddedExpressions branches", function () {
  // Lines 247-250: non-string passed to the embedded resolver are reached only
  // with strings via resolveExpression, so the null/object/scalar embedded
  // branches are driven through {{...}} strings instead.

  // Lines 267-268: an embedded expression resolving to an object -> JSON.stringify.
  it("an embedded expression resolving to an object is JSON.stringified", async function () {
    const r = await resolveExpression({
      expression: "obj={{$$o}}",
      context: { o: { a: 1 } },
    });
    assert.equal(r, 'obj={"a":1}');
  });

  // Line 268: an embedded expression whose evaluation yields a real object is
  // JSON.stringified. A jq("." ) returns a structured object inside {{...}}.
  it("an embedded jq expression returning an object is JSON.stringified", async function () {
    const r = await resolveExpression({
      expression: 'x={{jq($$d, ".")}}',
      context: { d: { a: 1 } },
    });
    assert.equal(r, 'x={"a":1}');
  });

  // Lines 269-271: a non-object scalar embedded value is String()-ified.
  it("an embedded scalar expression renders via String()", async function () {
    const r = await resolveExpression({
      expression: "n={{$$count}}",
      context: { count: 5 },
    });
    assert.equal(r, "n=5");
  });

  // An embedded jq() whose query string is invalid (but quoted, so the inner
  // expression is still syntactically valid JS — exercising jq's error path, not
  // a JS SyntaxError). On failure the embedded loop preserves the author's
  // ORIGINAL {{...}} text rather than leaking the half-resolved internal
  // sub-expression (#423/#424). Asserts the exact output, not a prefix.
  it("an embedded jq with an invalid query preserves the original {{...}}", async function () {
    const r = await resolveExpression({
      expression: 'r={{jq($$d, "@@@invalid")}}',
      context: { d: { a: 1 } },
    });
    assert.equal(r, 'r={{jq($$d, "@@@invalid")}}');
  });

  // A failed embedded expression must not disturb the surrounding literal text
  // or any sibling expressions that DO resolve. Only the failing {{...}} is
  // preserved verbatim; the good one still resolves.
  it("a failed embedded expression is preserved while a sibling still resolves", async function () {
    const r = await resolveExpression({
      expression: 'ok={{$$n}} bad={{jq($$d, "@@@invalid")}}',
      context: { n: 5, d: { a: 1 } },
    });
    assert.equal(r, 'ok=5 bad={{jq($$d, "@@@invalid")}}');
  });

  // An embedded expression whose evaluation yields `undefined` (a synchronous
  // SyntaxError inside evaluateExpression, e.g. the malformed operator call
  // `jq(`) is rendered as an empty string — the undefined/null embedded branch.
  // Unlike an async jq REJECTION (which propagates and preserves {{...}}), a sync
  // eval error resolves to undefined without throwing, so it renders empty.
  it("an embedded expression evaluating to undefined renders empty", async function () {
    const r = await resolveExpression({
      expression: "a={{jq(}}",
      context: {},
    });
    assert.equal(r, "a=");
  });
});

describe("expressions coverage: interpolation/variables happy path stays byte-identical (#424)", function () {
  // The design roadmap pins the default (non-condition) path: a value containing
  // operator-like text must resolve to its LITERAL string, and an unresolved
  // $$token must pass through as a literal — the error contract change must not
  // regress either. These are the byte-identical guarantees for step.variables.
  it("operator-like literal resolves to itself (no operators active off the condition path)", async function () {
    assert.equal(
      await resolveExpression({ expression: "x > out.txt", context: {} }),
      "x > out.txt"
    );
  });
  it("an unresolved $$token passes through as a literal", async function () {
    assert.equal(
      await resolveExpression({ expression: "value=$$missing", context: {} }),
      "value=$$missing"
    );
  });
  it("a resolved $$token still interpolates normally", async function () {
    assert.equal(
      await resolveExpression({ expression: "value=$$here", context: { here: "ok" } }),
      "value=ok"
    );
  });
});

describe("expressions coverage: operator helpers via the public API (contains/matches/oneOf/extract)", function () {
  // Line 380: contains() with an object operand uses `b in a`.
  it("contains() on an object checks key membership (true)", async function () {
    const r = await evaluateAssertion("$$obj contains key", {
      obj: { key: 1 },
    });
    assert.equal(r, true);
  });
  it("contains() on an object checks key membership (false)", async function () {
    const r = await evaluateAssertion("$$obj contains nope", {
      obj: { key: 1 },
    });
    assert.equal(r, false);
  });
  // contains() default return false for non-string/array/object operand.
  it("contains() on a number operand returns false", async function () {
    const r = await evaluateAssertion("$$n contains x", { n: 5 });
    assert.equal(r, false);
  });
  // Line 379-381: a null operand is typeof "object" but the `a !== null` guard
  // excludes it, so contains() falls through to false.
  it("contains() on a null operand returns false", async function () {
    const r = await evaluateAssertion("$$n contains x", { n: null });
    assert.equal(r, false);
  });

  // Line 562: matches with a BARE (non-slash) regex RHS.
  it("matches with a bare (non-slash) regex string", async function () {
    const r = await evaluateAssertion("$$v matches abc", { v: "abc" });
    assert.equal(r, true);
  });

  // Lines 407-419: extract() first-capture-group path and full-match fallback.
  it("extract() returns the first capture group", async function () {
    const r = await resolveExpression({
      expression: 'extract("user=ada", "user=(\\\\w+)")',
      context: {},
    });
    assert.equal(r, "ada");
  });
  it("extract() returns the full match when there is no capture group", async function () {
    const r = await resolveExpression({
      expression: 'extract("abc123", "[0-9]+")',
      context: {},
    });
    assert.equal(r, "123");
  });
  it("extract() returns null when there is no match", async function () {
    const r = await resolveExpression({
      expression: 'extract("abc", "[0-9]+")',
      context: {},
    });
    // extract() returns JS null; that is typeof "object", so resolveExpression
    // JSON.stringifies it to the string "null".
    assert.equal(r, "null");
  });

  // Lines 416-419: extract() with an invalid regex throws inside `new RegExp`,
  // is caught and logged, and returns null (-> "null" after stringify).
  it("extract() returns null when the regex is invalid", async function () {
    const r = await resolveExpression({
      expression: 'extract("abc", "([")',
      context: {},
    });
    assert.equal(r, "null");
  });

  // matches() with a non-string subject returns false.
  it("matches() returns false when the subject is not a string", async function () {
    const r = await evaluateAssertion("$$n matches /\\d/", { n: 5 });
    assert.equal(r, false);
  });

  // oneOf() returns false when the options operand resolves to a non-array
  // value (here a plain string), exercising the !Array.isArray(options) guard
  // directly rather than an undefined-identifier ReferenceError.
  it("oneOf() returns false when options is not an array", async function () {
    const r = await evaluateAssertion("$$v oneOf $$opts", {
      v: "x",
      opts: "notanarray",
    });
    assert.equal(r, false);
  });
});

describe("expressions coverage: extract infix preprocessing", function () {
  // Lines 574-607: the `<left> extract <right>` infix rewrite, including the
  // quoting fix passes. The infix rewrite only runs when containsOperators is
  // already true, so pair it with a `==` comparison on the condition path
  // (allowOperators=true) so the whole expression is evaluated.
  it("infix 'extract' rewrites bare operands and compares the extracted value", async function () {
    // "abc123 extract [0-9]+" rewrites to extract("abc123","[0-9]+") -> "123",
    // then compared to the numeric literal 123. The identifier-quoting pass only
    // matches alpha-start tokens, so 123 stays a number; the comparison passes
    // via JS loose equality ("123" == 123).
    const r = await evaluateAssertion("abc123 extract [0-9]+ == 123", {});
    assert.equal(r, true);
  });
  it("infix 'extract' -> false when the extracted value differs", async function () {
    const r = await evaluateAssertion("abc123 extract [0-9]+ == 999", {});
    assert.equal(r, false);
  });

  // Lines 596-607: the second extract-quoting pass. A call written with
  // function syntax but UNQUOTED args (extract(abc123, [0-9]+)) gets both
  // operands quoted by this normalization pass.
  it("quotes unquoted args in a literal extract(...) call", async function () {
    const r = await evaluateAssertion("extract(abc123, [0-9]+) == 123", {});
    assert.equal(r, true);
  });

  // Line 581: infix extract whose left operand starts with a digit (so the
  // `!/^[\d...]/` arm is false) still routes through the quoting logic.
  it("infix extract with a digit-leading left operand", async function () {
    const r = await evaluateAssertion("123abc extract [a-z]+ == abc", {});
    assert.equal(r, true);
  });
});

describe("expressions coverage: preprocessExpression quoteIfLiteral + getNestedProperty branches", function () {
  // Line 488: quoteIfLiteral leaves an already-quoted left operand untouched.
  it("contains() with an already-quoted left literal", async function () {
    const r = await evaluateAssertion('"hello world" contains hello', {});
    assert.equal(r, true);
  });
  // Line 491-492: quoteIfLiteral leaves a null/boolean keyword token untouched.
  it("oneOf() with a null keyword operand", async function () {
    const r = await evaluateAssertion("null oneOf [null]", {});
    assert.equal(r, true);
  });
  // Line 292: getNestedProperty returns undefined for an empty path.
  it("getMetaValue with an empty path returns undefined", function () {
    assert.equal(getMetaValue("", { a: 1 }), undefined);
  });
  // Line 705: a resolved value that is the string 'false' coerces to false.
  it("a meta value resolving to the string 'false' coerces to false", async function () {
    assert.equal(await evaluateAssertion("$$s", { s: "false" }), false);
  });
});

describe("expressions coverage: comparison identifier quoting", function () {
  // Lines 611-628 + 636-648: unquoted identifiers on the RIGHT and LEFT of a
  // comparison are quoted as string literals so a bare word compares as a string.
  it("quotes a bare identifier on the right side of == (true)", async function () {
    const r = await evaluateAssertion("$$color == red", { color: "red" });
    assert.equal(r, true);
  });
  it("quotes a bare identifier on the right side of == (false)", async function () {
    const r = await evaluateAssertion("$$color == blue", { color: "red" });
    assert.equal(r, false);
  });
  it("does not quote a JS keyword on the right side (true === boolean)", async function () {
    const r = await evaluateAssertion("$$flag == true", { flag: true });
    assert.equal(r, true);
  });
  it("quotes bare identifiers on BOTH sides of a comparison", async function () {
    // Neither side resolves to a meta value; both are bare words that must be
    // quoted so the comparison is a string compare (foo == foo -> true).
    const r = await evaluateAssertion("foo == foo", {});
    assert.equal(r, true);
  });
  it("quotes bare identifiers on both sides -> false when different", async function () {
    const r = await evaluateAssertion("foo == bar", {});
    assert.equal(r, false);
  });
});

describe("expressions coverage: evaluateAssertion outer catch + coercions", function () {
  // Lines 698-712: resolved boolean returned directly; string 'true'/'false'
  // coercions; truthy coercion fallthrough; and the outer catch.

  it("a non-string assertion that is already boolean true returns true", async function () {
    assert.equal(await evaluateAssertion(true, {}), true);
  });
  it("a non-string falsy assertion returns false", async function () {
    assert.equal(await evaluateAssertion(0, {}), false);
  });
  it("a truthy non-boolean resolved value coerces to true", async function () {
    // $$name resolves to a non-empty string with no operators -> truthy.
    assert.equal(await evaluateAssertion("$$name", { name: "x" }), true);
  });
  it("an empty-string resolved value coerces to false", async function () {
    assert.equal(await evaluateAssertion("$$empty", { empty: "" }), false);
  });

  // Outer catch (709-712): make resolveExpression's internals throw in a way
  // that propagates. evaluateAssertion calls hasUnresolvedMetaReference first
  // (synchronous) then resolveExpression (which swallows). To hit the outer
  // catch, pass an assertion object whose getMetaValue lookups throw. A getter
  // that throws on property access inside the context triggers it.
  it("returns false when assertion evaluation throws (outer catch)", async function () {
    const hostile = {};
    Object.defineProperty(hostile, "boom", {
      enumerable: true,
      get() {
        throw new Error("explode");
      },
    });
    // The assertion references $$boom; hasUnresolvedMetaReference -> getMetaValue
    // -> getNestedProperty reads context.boom -> getter throws -> caught by the
    // outer try/catch in evaluateAssertion -> false.
    const r = await evaluateAssertion("$$boom == 1", hostile);
    assert.equal(r, false);
  });
});
