#!/usr/bin/env node
// semantic-release `prepare` step for the doc-detective-common workspace.
//
// Two things must happen before @semantic-release/git commits its assets:
//   1. Stamp the release version onto src/common (package.json + its lockfile).
//   2. Rebuild src/common/package-lock.json so its dependency tree matches
//      src/common/package.json.
//
// Step 2 exists because `npm version` only rewrites the `version` fields. For a
// long time that was the ONLY thing that ever touched src/common's lockfile, so
// its dependency tree silently rotted: every release faithfully stamped a new
// version onto a lockfile whose deps no longer satisfied its own manifest, and
// `npm ci` inside src/common failed with EUSAGE. CI never noticed because it
// installs from the ROOT lockfile and runs the src/common scripts against the
// hoisted workspace node_modules. See ADR 01091.

import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const SEMVER = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/;

/**
 * Build the ordered npm invocations for a release of `version`.
 *
 * Pure and side-effect free so test/sync-common-version.test.js can assert the
 * exact flags without spawning npm.
 *
 * Order matters: the version stamp must land before the lockfile rebuild, so
 * the regenerated lockfile carries the release version rather than the previous
 * one.
 */
export function buildSyncCommands(version) {
  return [
    {
      cmd: 'npm',
      // Run from the repo root so `--workspace` resolves. This also updates the
      // root lockfile's entry for the workspace.
      cwd: '.',
      args: [
        'version',
        version,
        '--workspace',
        'src/common',
        '--no-git-tag-version',
        '--allow-same-version',
      ],
    },
    {
      cmd: 'npm',
      // Run INSIDE the workspace so npm rewrites that package's own lockfile.
      cwd: 'src/common',
      args: [
        'install',
        '--package-lock-only',
        '--ignore-scripts',
        '--no-audit',
        '--no-fund',
        // Load-bearing. Without it npm walks up from src/common, finds
        // `workspaces: ["src/common"]` in the root manifest, and rewrites the
        // ROOT package-lock.json while leaving src/common's untouched -- the
        // exact inverse of the intent. @semantic-release/git commits both
        // files, so omitting this flag ships a corrupted root lockfile.
        '--no-workspaces',
      ],
    },
  ];
}

function main(argv) {
  const version = argv[2];
  if (!version) {
    console.error('Usage: sync-common-version.js <version>');
    process.exit(1);
  }

  if (!SEMVER.test(version)) {
    console.error(`Refusing to run: ${JSON.stringify(version)} is not a valid semver version`);
    process.exit(1);
  }

  const shell = process.platform === 'win32';

  for (const { cmd, args, cwd } of buildSyncCommands(version)) {
    console.log(`$ (${cwd}) ${cmd} ${args.join(' ')}`);
    const result = spawnSync(cmd, args, { stdio: 'inherit', shell, cwd });
    if (result.status !== 0) {
      process.exit(result.status ?? 1);
    }
  }

  console.log(`Synced doc-detective-common to ${version} and rebuilt its lockfile`);
}

// Only run when invoked as a script; importing this module (from tests) must be
// side-effect free.
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main(process.argv);
}
