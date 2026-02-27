# TDD and Coverage Skill

**Type:** Rigid (follow exactly)

## When to Use

Use this skill when:
- Creating new functionality
- Modifying existing code
- Fixing bugs
- Refactoring

## Mandatory Process

### 1. Test First (TDD)

Before writing or modifying any implementation code:

1. **Write the test(s)** that describe the expected behavior
2. **Run the test** - it should FAIL (red)
3. **Write the implementation** to make the test pass
4. **Run the test** - it should PASS (green)
5. **Refactor** if needed, keeping tests passing

### 2. Coverage Verification

After any code change:

```bash
# Run tests with coverage
npm run test:coverage

# Verify coverage hasn't decreased
npm run test:coverage:ratchet
```

**Coverage must not decrease.** If ratchet check fails:
1. Add tests for uncovered code
2. Re-run coverage until ratchet passes

### 3. Coverage Thresholds

Current thresholds are in `coverage-thresholds.json`. These values must only increase:

| Metric | Threshold |
|--------|-----------|
| Lines | 100% |
| Statements | 100% |
| Functions | 100% |
| Branches | 100% |

### 4. Test Location

| Code | Test File |
|------|-----------|
| `src/validate.js` | `test/validate.test.js` |
| `src/resolvePaths.js` | `test/resolvePaths.test.js` |
| `src/files.js` | `test/files.test.js` |
| Schema validation | `test/schema.test.js` |

### 5. Test Structure Pattern

```javascript
const sinon = require("sinon");

(async () => {
  const { expect } = await import("chai");
  const { functionUnderTest } = require("../src/module");

  describe("functionUnderTest", function () {
    describe("input validation", function () {
      it("should throw error when required param missing", function () {
        expect(() => functionUnderTest()).to.throw();
      });
    });

    describe("happy path", function () {
      it("should return expected result for valid input", function () {
        const result = functionUnderTest({ validInput: true });
        expect(result).to.deep.equal(expectedOutput);
      });
    });

    describe("edge cases", function () {
      it("should handle boundary condition", function () {
        // test edge case
      });
    });
  });
})();
```

### 6. Checklist

Before completing any code change:

- [ ] Tests written BEFORE implementation (or for existing code: tests added)
- [ ] All tests pass (`npm test`)
- [ ] Coverage hasn't decreased (`npm run test:coverage:ratchet`)
- [ ] New code has corresponding test coverage
- [ ] Error paths are tested (not just happy paths)

## Commands Reference

```bash
# Run all tests
npm test

# Run tests with coverage report
npm run test:coverage

# Run coverage ratchet check
npm run test:coverage:ratchet

# Generate HTML coverage report
npm run test:coverage:html
```

## Common Patterns

### Testing async functions

```javascript
it("should handle async operation", async function () {
  const result = await asyncFunction();
  expect(result).to.exist;
});
```

### Mocking with Sinon

```javascript
const stub = sinon.stub(fs, "readFileSync").returns("mock content");
try {
  const result = functionUnderTest();
  expect(result).to.equal("expected");
} finally {
  stub.restore();
}
```

### Testing error handling

```javascript
it("should throw on invalid input", function () {
  expect(() => functionUnderTest(null)).to.throw(/error message/);
});
```

### Testing transformations

```javascript
it("should transform v2 object to v3", function () {
  const result = transformToSchemaKey({
    currentSchema: "schema_v2",
    targetSchema: "schema_v3",
    object: v2Object,
  });
  expect(result.newProperty).to.equal(expectedValue);
});
```
