#!/usr/bin/env node
import { spawnSync } from 'node:child_process';

const version = process.argv[2];
if (!version) {
  console.error('Usage: sync-common-version.js <version>');
  process.exit(1);
}

const result = spawnSync(
  'npm',
  [
    'version',
    version,
    '--workspace',
    'src/common',
    '--no-git-tag-version',
    '--allow-same-version',
  ],
  { stdio: 'inherit', shell: process.platform === 'win32' }
);

if (result.status !== 0) {
  process.exit(result.status ?? 1);
}

console.log(`Synced doc-detective-common to ${version}`);
