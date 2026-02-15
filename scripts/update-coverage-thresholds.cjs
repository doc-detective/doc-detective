#!/usr/bin/env node

/**
 * Coverage Threshold Update Script
 * 
 * Reads current coverage from coverage-summary.json and updates
 * coverage-thresholds.json to match. Only increases thresholds,
 * never decreases them (ratchet behavior).
 * 
 * Usage: node scripts/update-coverage-thresholds.cjs
 */

const fs = require('fs');
const path = require('path');

const THRESHOLDS_FILE = path.join(__dirname, '..', 'coverage-thresholds.json');
const COVERAGE_SUMMARY_FILE = path.join(__dirname, '..', 'coverage', 'coverage-summary.json');

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

function main() {
  const thresholds = loadJSON(THRESHOLDS_FILE, 'Coverage thresholds file');
  const coverageSummary = loadJSON(COVERAGE_SUMMARY_FILE, 'Coverage summary');

  const current = coverageSummary.total;
  const metrics = ['lines', 'statements', 'functions', 'branches'];

  let updated = false;

  console.log('\n=== Coverage Threshold Update ===\n');
  console.log('Metric      | Old      | New      | Changed');
  console.log('------------|----------|----------|--------');

  for (const metric of metrics) {
    const oldValue = thresholds[metric];
    const newValue = current[metric].pct;

    // Only ratchet up, never down
    if (newValue > oldValue) {
      thresholds[metric] = newValue;
      const oldStr = `${oldValue.toFixed(2)}%`.padEnd(8);
      const newStr = `${newValue.toFixed(2)}%`.padEnd(8);
      const metricStr = metric.padEnd(11);
      console.log(`${metricStr} | ${oldStr} | ${newStr} | YES`);
      updated = true;
    } else {
      const valStr = `${oldValue.toFixed(2)}%`.padEnd(8);
      const metricStr = metric.padEnd(11);
      console.log(`${metricStr} | ${valStr} | ${valStr} | no`);
    }
  }

  console.log('');

  if (updated) {
    thresholds.lastUpdated = new Date().toISOString().split('T')[0];
    fs.writeFileSync(THRESHOLDS_FILE, JSON.stringify(thresholds, null, 2) + '\n');
    console.log(`Updated ${THRESHOLDS_FILE}`);
  } else {
    console.log('No thresholds to update (coverage has not improved).');
  }
}

main();
