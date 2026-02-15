#!/usr/bin/env node

/**
 * Coverage Ratchet Script
 * 
 * Compares current coverage against baseline thresholds.
 * Fails if any metric has decreased.
 * 
 * Usage: node scripts/check-coverage-ratchet.js
 */

const fs = require('fs');
const path = require('path');

const THRESHOLDS_FILE = path.join(__dirname, '..', 'coverage-thresholds.json');
const COVERAGE_SUMMARY_FILE = path.join(__dirname, '..', 'coverage', 'coverage-summary.json');

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
  
  let failed = false;
  const results = [];
  
  console.log('\n=== Coverage Ratchet Check ===\n');
  console.log('Metric      | Baseline | Current  | Status');
  console.log('------------|----------|----------|--------');
  
  for (const metric of metrics) {
    const baseline = thresholds[metric];
    const currentValue = current[metric].pct;
    const diff = (currentValue - baseline).toFixed(2);
    
    let status;
    if (currentValue < baseline) {
      status = `FAIL (${diff}%)`;
      failed = true;
    } else if (currentValue > baseline) {
      status = `PASS (+${diff}%)`;
    } else {
      status = 'PASS';
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
  
  // Check if we can bump thresholds
  const canBump = results.filter(r => r.current > r.baseline);
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

