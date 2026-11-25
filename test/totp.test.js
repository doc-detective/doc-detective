import assert from "node:assert/strict";
import sinon from "sinon";
import { totp, waitForFreshTotpWindow } from "../dist/core/totp.js";
import {
  evaluateAssertion,
  resolveExpression,
  resolveExpressionOrThrow,
} from "../dist/core/expressions.js";
import { replaceEnvs } from "../dist/core/utils.js";

// RFC 6238 Appendix B, SHA-1: the ASCII secret "12345678901234567890" in base32.
const RFC_SECRET = "GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ";

describe("totp()", function () {
  // The RFC lists 8-digit codes; a 6-digit code is the same value's last 6 digits.
  const vectors = [
    [59, "287082"],
    [1111111109, "081804"],
    [1111111111, "050471"],
    [1234567890, "005924"],
    [2000000000, "279037"],
    [20000000000, "353130"],
  ];
  for (const [seconds, code] of vectors) {
    it(`matches the RFC 6238 SHA-1 vector at T=${seconds}`, function () {
      assert.equal(totp(RFC_SECRET, seconds * 1000), code);
    });
  }

  it("accepts lowercase, spaces, and = padding", function () {
    const messy = "gezd gnbv gy3t qojq gezd gnbv gy3t qojq====";
    assert.equal(totp(messy, 59 * 1000), "287082");
  });

  it("throws the documented message for a secret that isn't base32", function () {
    assert.throws(
      () => totp("not-base32!", 59 * 1000),
      { message: "Couldn't generate a TOTP code: the secret isn't valid base32." }
    );
    assert.throws(() => totp("", 59 * 1000), /isn't valid base32/);
  });

  it("rejects a length that can't encode whole bytes (remainder 1, 3, or 6 mod 8)", function () {
    for (const extra of ["A", "AAA", "AAAAAA"]) {
      assert.throws(() => totp(RFC_SECRET + extra, 59 * 1000), /isn't valid base32/);
    }
    // Remainders 2, 4, 5, and 7 are valid partial groups.
    for (const extra of ["AA", "AAAA", "AAAAA", "AAAAAAA"]) {
      assert.match(totp(RFC_SECRET + extra, 59 * 1000), /^\d{6}$/);
    }
  });
});

describe("function operators on both sides of a comparison", function () {
  // The right-operand quoting regex used to backtrack into a function name,
  // turning `== totp(` into `== "tot"p(`.
  it("totp() == totp() is true", async function () {
    assert.equal(
      await evaluateAssertion(`totp("${RFC_SECRET}") == totp("${RFC_SECRET}")`, {}),
      true
    );
  });
  it("extract() == extract() is true", async function () {
    assert.equal(await evaluateAssertion(`extract("abc", "b") == extract("xbx", "b")`, {}), true);
  });
  it("jq() == jq() is true", async function () {
    const ctx = { outputs: { obj: { n: 1 } } };
    assert.equal(
      await evaluateAssertion(`jq($$outputs.obj, ".n") == jq($$outputs.obj, ".n")`, ctx),
      true
    );
  });
});

describe("waitForFreshTotpWindow()", function () {
  let clock;
  afterEach(() => clock?.restore());

  it("returns at once when 3 or more seconds remain in the window", async function () {
    clock = sinon.useFakeTimers({ now: 30_000 + 27_000 });
    let done = false;
    waitForFreshTotpWindow().then(() => (done = true));
    await clock.tickAsync(0);
    assert.equal(done, true);
  });

  it("waits for the next window when fewer than 3 seconds remain", async function () {
    clock = sinon.useFakeTimers({ now: 30_000 + 28_000 });
    let done = false;
    waitForFreshTotpWindow().then(() => (done = true));
    await clock.tickAsync(1_999);
    assert.equal(done, false);
    await clock.tickAsync(1);
    assert.equal(done, true);
    assert.equal(Date.now() % 30_000, 0);
  });
});

describe("totp() in expressions", function () {
  it("resolves {{totp(...)}} embedded in a step string", async function () {
    const out = await resolveExpression({
      expression: `code-{{totp("${RFC_SECRET}")}}`,
      context: {},
    });
    assert.match(out, /^code-\d{6}$/);
  });

  it("resolves a bare totp(...) variable value", async function () {
    const out = await resolveExpressionOrThrow({ expression: `totp("${RFC_SECRET}")`, context: {} });
    assert.match(out, /^\d{6}$/);
  });

  it("substitutes $VAR before the expression runs (runStep order)", async function () {
    process.env.DD_TEST_TOTP_SECRET = RFC_SECRET;
    try {
      const step = replaceEnvs({ variables: { OTP: '{{totp("$DD_TEST_TOTP_SECRET")}}' } });
      assert.equal(step.variables.OTP, `{{totp("${RFC_SECRET}")}}`);
      const out = await resolveExpressionOrThrow({ expression: step.variables.OTP, context: {} });
      assert.match(out, /^\d{6}$/);
    } finally {
      delete process.env.DD_TEST_TOTP_SECRET;
    }
  });

  it("keeps {{totp(...)}} verbatim when the secret is bad", async function () {
    const out = await resolveExpression({ expression: `x-{{totp("bad!")}}`, context: {} });
    assert.equal(out, `x-{{totp("bad!")}}`);
  });
});
