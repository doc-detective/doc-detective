#!/usr/bin/env node

/**
 * Coverage Ratchet Script
 *
 * Compares current coverage against baseline thresholds.
 * Fails if any metric has decreased.
 *
 * Shared by both the root `doc-detective` package and the `src/common`
 * subpackage. Paths resolve from the invoking package's directory, so each
 * package reads its own `coverage-thresholds.json` and `coverage/`:
 *   - root:       node scripts/check-coverage-ratchet.cjs
 *   - src/common: node ../../scripts/check-coverage-ratchet.cjs   (cwd = src/common)
 * An explicit base directory can also be passed as the first argument.
 */

const fs = require('fs');
const path = require('path');

const baseDir = process.argv[2] ? path.resolve(process.argv[2]) : process.cwd();
const THRESHOLDS_FILE = path.join(baseDir, 'coverage-thresholds.json');
const COVERAGE_SUMMARY_FILE = path.join(baseDir, 'coverage', 'coverage-summary.json');

/**
 * Load and parse JSON from the given path, exiting the process with code 1 if the file is missing or cannot be parsed.
 * @param {string} filePath - Filesystem path to the JSON file.
 * @param {string} description - Human-readable name for the file used in error messages.
 * @returns {Object} The parsed JSON object.
 */
function loadJSON(filePath, description) {
  if (!fs.existsSync(filePath)) {
    console.error(`Error: ${description} not found at ${filePath}`);
    console.error(`Run 'npm run test:coverage' first to generate coverage data.`);
    process.exit(1);
  }
  
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (error) {
    console.error(`Error parsing ${description}: ${error.message}`);
    process.exit(1);
  }
}

/**
 * Compares current test coverage against the stored baseline thresholds and enforces the coverage ratchet.
 *
 * Loads baseline thresholds and the current coverage summary, prints a per-metric table of baseline vs current values and statuses, and enforces policy:
 * - Exits with code 1 if any metric has decreased relative to the baseline.
 * - If one or more metrics have improved, prints suggested threshold updates.
 * - Exits with code 0 when all metrics meet or exceed their baselines.
 */
function main() {
  // Load baseline thresholds
  const thresholds = loadJSON(THRESHOLDS_FILE, 'Coverage thresholds file');
  
  // Load current coverage
  const coverageSummary = loadJSON(COVERAGE_SUMMARY_FILE, 'Coverage summary');
  
  const current = coverageSummary.total;
  const metrics = ['lines', 'statements', 'functions', 'branches'];

  // Optional per-package noise tolerance (percentage points). A metric only
  // fails when it drops MORE than `tolerance` below baseline, and is only
  // suggested for a bump when it rises MORE than `tolerance` above. This
  // absorbs sub-tolerance run-to-run wobble from a non-deterministic suite
  // (the root package measures coverage over the full E2E run). Defaults to 0,
  // so packages that omit it — e.g. src/common at a strict 100% — are exact.
  const tolerance =
    typeof thresholds.tolerance === 'number' && thresholds.tolerance >= 0
      ? thresholds.tolerance
      : 0;

  // Placeholder guard: thresholds of all-zero pass against any coverage, making
  // the gate a silent no-op. Warn loudly (but still run) so a forgotten baseline
  // surfaces in the CI log instead of quietly disabling enforcement.
  if (metrics.every((m) => thresholds[m] === 0)) {
    console.warn('\nWARNING: all coverage thresholds are 0 — these look like placeholders.');
    console.warn('Update coverage-thresholds.json with the real measured baseline before relying on this gate.\n');
  }

  let failed = false;
  const results = [];
  
  console.log('\n=== Coverage Ratchet Check ===\n');
  console.log('Metric      | Baseline | Current  | Status');
  console.log('------------|----------|----------|--------');
  
  for (const metric of metrics) {
    const baseline = thresholds[metric];
    const currentMetric = current?.[metric];
    if (typeof baseline !== 'number' || typeof currentMetric?.pct !== 'number') {
      console.error(`Invalid or missing coverage metric: "${metric}"`);
      process.exit(1);
    }
    const currentValue = currentMetric.pct;
    // Round to 2dp and fold -0 into 0 so a tiny negative delta doesn't print as
    // a confusing "-0.00%" (e.g. PASS (~-0.00%)) within the tolerance band.
    const rounded = Math.round((currentValue - baseline) * 100) / 100;
    const diff = (rounded === 0 ? 0 : rounded).toFixed(2);
    
    let status;
    if (currentValue < baseline - tolerance) {
      status = `FAIL (${diff}%)`;
      failed = true;
    } else if (currentValue > baseline + tolerance) {
      status = `PASS (+${diff}%)`;
    } else {
      // Within ±tolerance of baseline — neither a regression nor a real gain.
      status = tolerance > 0 ? `PASS (~${diff}%)` : 'PASS';
    }
    
    const baselineStr = `${baseline.toFixed(2)}%`.padEnd(8);
    const currentStr = `${currentValue.toFixed(2)}%`.padEnd(8);
    const metricStr = metric.padEnd(11);
    
    console.log(`${metricStr} | ${baselineStr} | ${currentStr} | ${status}`);
    
    results.push({
      metric,
      baseline,
      current: currentValue,
      passed: currentValue >= baseline
    });
  }
  
  console.log('');
  
  if (failed) {
    console.error('Coverage ratchet check FAILED!');
    console.error('Coverage has decreased from the baseline.');
    console.error('Please add tests to restore coverage before committing.');
    process.exit(1);
  }
  
  // Check if we can bump thresholds (only on a real gain beyond the tolerance,
  // so sub-tolerance noise doesn't churn the baseline up and down).
  const canBump = results.filter(r => r.current > r.baseline + tolerance);
  if (canBump.length > 0) {
    console.log('Coverage has improved! Consider updating thresholds:');
    console.log('');
    for (const r of canBump) {
      console.log(`  "${r.metric}": ${r.current.toFixed(2)}`);
    }
    console.log('');
    console.log(`Update ${THRESHOLDS_FILE} to lock in the new baseline.`);
  }
  
  console.log('Coverage ratchet check PASSED!');
  process.exit(0);
}

main();