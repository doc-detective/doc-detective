// Simple unit test for enhanced element finding

console.log("Testing helper functions...\n");

// Test logic inline
function isRegexPattern(str) {
  return typeof str === "string" && str.startsWith("/") && str.endsWith("/");
}

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
