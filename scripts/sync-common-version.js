#!/usr/bin/env node
// semantic-release `prepare` step for the doc-detective-common workspace.
//
// Four things happen before @semantic-release/git commits its assets:
//   1. Stamp the release version onto src/common (package.json + its lockfile).
//   2. Rebuild src/common/package-lock.json so its dependency tree matches
//      src/common/package.json.
//   3. Reconcile the ROOT lockfile, which step 1 corrupts as a side effect.
//   4. Verify the ROOT lockfile installs, and fail the release if not.
//
// Step 2 exists because `npm version` only rewrites the `version` fields. For a
// long time that was the ONLY thing that ever touched src/common's lockfile, so
// its dependency tree silently rotted: every release faithfully stamped a new
// version onto a lockfile whose deps no longer satisfied its own manifest, and
// `npm ci` inside src/common failed with EUSAGE. CI never noticed because it
// installs from the ROOT lockfile and runs the src/common scripts against the
// hoisted workspace node_modules.
//
// Steps 3 and 4 exist because step 1 has a side effect: `npm version
// --workspace` rewrites the ROOT lockfile too, and the tree it emits does not
// install. Measured on npm 10 (node 22, the release job's runtime): starting
// from a root lockfile where `npm ci` passes, running the step-1 stamp alone
// leaves `npm ci` failing with EBADPLATFORM. In the 4.37.4 release that broken
// lockfile was committed by @semantic-release/git and `npm ci` broke on main
// for every job and every contributor (repaired by hand in #705).
//
// The two `--package-lock-only` passes in step 3 are the same recipe as
// docs/maintenance/release-operations.md: the second pass drops the
// platform-gated "extraneous" entries that make `npm ci` fail with EBADPLATFORM
// on other OSes. Verified to restore a working lockfile from both a healthy and
// an already-broken starting point, so a release now self-heals the root
// lockfile instead of corrupting it. Step 4 is the backstop -- if the reconcile
// ever fails to produce an installable tree, the release stops instead of
// committing the damage.
//
// See ADR 01091.

import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const SEMVER = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/;

/** Repo root, derived from this file's location rather than process.cwd(). */
export const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/**
 * Build the ordered npm invocations for a release of `version`.
 *
 * Pure and side-effect free so test/sync-common-version.test.js can assert the
 * exact flags without spawning npm. `repoRoot` is injected (rather than read
 * from process.cwd()) so every cwd is absolute and the script behaves the same
 * no matter where it is invoked from.
 *
 * Order matters: the version stamp must land before the lockfile rebuild, so
 * the regenerated lockfile carries the release version rather than the previous
 * one, and the root verification must come last so it sees the final state.
 */
export function buildSyncCommands(version, repoRoot = REPO_ROOT) {
  const commonDir = path.join(repoRoot, 'src', 'common');
  return [
    {
      cmd: 'npm',
      // Run from the repo root so `--workspace` resolves. Side effect: this
      // also rewrites the root lockfile's entry for the workspace, which is
      // why step 3 below verifies the result.
      cwd: repoRoot,
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
      cwd: commonDir,
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
    // Reconcile the root lockfile that step 1 corrupted. Two passes, per
    // docs/maintenance/release-operations.md -- a single pass leaves the
    // platform-gated "extraneous" entries that fail `npm ci` with EBADPLATFORM
    // on other OSes. `--package-lock-only` resolves without materializing
    // node_modules, so it does not prune the cross-platform optional tree the
    // way a plain `npm install` on a Linux runner would.
    ...[1, 2].map(() => ({
      cmd: 'npm',
      cwd: repoRoot,
      args: ['install', '--package-lock-only', '--ignore-scripts', '--no-audit', '--no-fund'],
    })),
    {
      cmd: 'npm',
      // Backstop, not a mutation: `ci --dry-run` resolves the root lockfile
      // against the root manifest and exits non-zero on any Missing/Invalid/
      // EBADPLATFORM entry, without writing anything. This is the check every
      // CI job performs, run before the commit rather than after it.
      cwd: repoRoot,
      args: ['ci', '--dry-run', '--ignore-scripts', '--no-audit', '--no-fund'],
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
    // spawnSync reports a failure to *launch* (npm not on PATH, cwd missing)
    // via `error`, leaving status null. Surface it — otherwise the release
    // dies with a bare exit 1 and no diagnostic.
    if (result.error) {
      console.error(`Failed to run \`${cmd} ${args.join(' ')}\` in ${cwd}: ${result.error.message}`);
      process.exit(1);
    }
    if (result.status !== 0) {
      process.exit(result.status ?? 1);
    }
  }

  console.log(`Synced doc-detective-common to ${version} and rebuilt its lockfile`);
}

// Only run the release steps when executed as a script, not when a test imports
// this module for the exported pure helpers above. realpath both sides so a
// relative argv[1], a symlink, or Windows path-case differences can't make the
// comparison fail — a false negative here would silently skip the entire
// prepare step.
function isInvokedDirectly() {
  try {
    if (!process.argv[1]) return false;
    return (
      fs.realpathSync(process.argv[1]) === fs.realpathSync(fileURLToPath(import.meta.url))
    );
  } catch {
    return false;
  }
}

if (isInvokedDirectly()) {
  main(process.argv);
}
