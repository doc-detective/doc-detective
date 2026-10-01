// Decides whether a pull request's change set needs the test matrix.
//
// This list used to be the `paths:` filter on .github/workflows/npm-test.yaml.
// It moved here because a path-filtered workflow never reports its checks, and
// the `main` ruleset REQUIRES four of them (`test / Test (ubuntu-latest, node
// 22, shard 1|2)` and the two coverage ratchets). A docs-only PR therefore
// blocked forever with nothing failing. The workflow now always runs and asks
// this script what to do. See adrs/01103-required-test-contexts-report-on-every-pull-request.md.
//
// Sibling of scripts/select-fixture-bundles.cjs, and it fails safe the same
// way: anything unusable (no PR context, a `gh api` blip, an empty list) means
// RUN the matrix. Under-running is a correctness risk; over-running costs time.

// Prefix match for a directory entry, exact match for a single file. Mirrors
// how GitHub's `paths:` globs behaved, which is what this replaces.
const CODE_PATH_PREFIXES = [
  "src/",
  "test/",
  "bin/",
  "scripts/",
];

const CODE_PATH_FILES = [
  "coverage-thresholds.json",
  "package.json",
  "package-lock.json",
  // Mocha's runner config governs how the whole suite executes (timeouts,
  // hooks), so a change to it must re-run the matrix.
  ".mocharc.yml",
  ".github/workflows/npm-test.yaml",
  ".github/workflows/test.yml",
  // The fixture matrix is half the PR gate; a change to it must run it.
  ".github/workflows/fixtures.yml",
];

function isCodePath(file) {
  const normalized = String(file || "").trim().replace(/\\/g, "/");
  if (normalized.length === 0) return false;
  if (CODE_PATH_FILES.includes(normalized)) return true;
  return CODE_PATH_PREFIXES.some((prefix) => normalized.startsWith(prefix));
}

// true when the matrix must run. An empty or whitespace-only change set reads as
// "we could not tell", not as "nothing changed", so it returns true.
function codePathsChanged(files) {
  if (!Array.isArray(files)) return true;
  const usable = files
    .map((f) => String(f || "").trim())
    .filter((f) => f.length > 0);
  if (usable.length === 0) return true;
  return usable.some(isCodePath);
}

function main() {
  let input = "";
  process.stdin.setEncoding("utf8");
  process.stdin.on("data", (chunk) => {
    input += chunk;
  });
  process.stdin.on("end", () => {
    const files = input.split(/\r?\n/);
    process.stdout.write(String(codePathsChanged(files)) + "\n");
  });
}

if (require.main === module) {
  main();
}

module.exports = {
  codePathsChanged,
  isCodePath,
  CODE_PATH_PREFIXES,
  CODE_PATH_FILES,
};
