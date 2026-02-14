// Simple unit test for enhanced element finding

console.log("Testing helper functions...\n");

/**
 * Determine whether a value is a string formatted like a regex literal (enclosed in forward slashes).
 * @param {*} str - Value to inspect.
 * @returns {boolean} `true` if `str` is a string that begins and ends with `/`, `false` otherwise.
 */
function isRegexPattern(str) {
  return typeof str === "string" && str.startsWith("/") && str.endsWith("/");
}

/**
 * Checks whether a value matches a pattern, where the pattern can be a regex-like string (e.g., "/pat/") or a direct value.
 *
 * If `pattern` is a string that starts and ends with `/`, it is treated as a regular expression and tested against the string form of `value`. Otherwise, the string forms of `value` and `pattern` are compared for equality.
 *
 * @param {*} value - The value to test; will be converted to a string when compared or tested.
 * @param {*} pattern - A pattern to match against. If a string that begins and ends with `/`, the interior is used to build a `RegExp`; otherwise compared as a string.
 * @returns {boolean} `true` if `value` matches `pattern`, `false` otherwise.
 */
function matchesPattern(value, pattern) {
  if (isRegexPattern(pattern)) {
    const regex = new RegExp(pattern.slice(1, -1));
    return regex.test(String(value));
  }
  return String(value) === String(pattern);
}

// Test cases
const tests = [
  {
    name: "Regex pattern detection",
    fn: () => isRegexPattern("/test/"),
    expected: true
  },
  {
    name: "Non-regex pattern detection",
    fn: () => isRegexPattern("test"),
    expected: false
  },
  {
    name: "Exact string match",
    fn: () => matchesPattern("test", "test"),
    expected: true
  },
  {
    name: "Regex match",
    fn: () => matchesPattern("submit-button", "/submit-.+/"),
    expected: true
  },
  {
    name: "Regex no match",
    fn: () => matchesPattern("button", "/submit-.+/"),
    expected: false
  },
  {
    name: "Number match",
    fn: () => matchesPattern(5, 5),
    expected: true
  }
];

let passed = 0;
let failed = 0;

tests.forEach(test => {
  try {
    const result = test.fn();
    if (result === test.expected) {
      console.log(`\u2713 ${test.name}`);
      passed++;
    } else {
      console.log(`\u2717 ${test.name} - Expected ${test.expected}, got ${result}`);
      failed++;
    }
  } catch (error) {
    console.log(`\u2717 ${test.name} - Error: ${error.message}`);
    failed++;
  }
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);