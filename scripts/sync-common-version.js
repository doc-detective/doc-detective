#!/usr/bin/env node
import { spawnSync } from 'node:child_process';

const version = process.argv[2];
if (!version) {
  console.error('Usage: sync-common-version.js <version>');
  process.exit(1);
}

const SEMVER = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/;
if (!SEMVER.test(version)) {
  console.error(`Refusing to run: ${JSON.stringify(version)} is not a valid semver version`);
  process.exit(1);
}

const args = [
  'version',
  version,
  '--workspace',
  'src/common',
  '--no-git-tag-version',
  '--allow-same-version',
];

const result = spawnSync('npm', args, {
  stdio: 'inherit',
  shell: process.platform === 'win32',
});

if (result.status !== 0) {
  process.exit(result.status ?? 1);
}

console.log(`Synced doc-detective-common to ${version}`);
