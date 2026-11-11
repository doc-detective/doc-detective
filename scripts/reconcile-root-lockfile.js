#!/usr/bin/env node
// semantic-release `prepare` step that runs AFTER @semantic-release/npm.
//
// Every plugin that stamps a version rewrites the root package-lock.json as a
// side effect, and the tree npm emits can drop entries the manifest still
// requires. Three times now that produced a root lockfile which fails `npm ci`, was
// committed by @semantic-release/git, and broke main for every job and every
// contributor:
//
//   4.37.4 -> repaired deliberately, in #705
//   4.37.5 -> repaired by accident, when #702 landed a healthy lockfile
//   4.38.0 -> broke again ~4h later; merging #702 is what triggered that
//             release, so the accidental repair and the next breakage were the
//             same event
//
// Every time, the same two `"optional": true, "peer": true` entries under
// @commitlint/read/node_modules were pruned.
//
// ORDER IS THE WHOLE POINT. scripts/sync-common-version.js runs earlier in the
// prepare sequence, so its reconcile could not see what @semantic-release/npm
// did to the lockfile afterward -- which is why the 4.37.5 release still
// shipped a broken one despite that script verifying successfully. This script
// is wired as the LAST prepare step before @semantic-release/git commits, so
// nothing rewrites the lockfile after it has been checked.
//
// Two `--package-lock-only` passes, per docs/maintenance/release-operations.md:
// the second drops the platform-gated "extraneous" entries that make `npm ci`
// fail with EBADPLATFORM on other OSes. `--package-lock-only` resolves without
// materializing node_modules, so it does not prune the cross-platform optional
// tree the way a plain `npm install` on a Linux runner would. The final
// `npm ci --dry-run` is the backstop: if the reconcile ever fails to produce an
// installable tree, the release stops instead of committing the damage.
//
// See ADR 01093.

import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/** Repo root, derived from this file's location rather than process.cwd(). */
export const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/**
 * Build the ordered npm invocations that reconcile and then verify the root
 * lockfile.
 *
 * Pure and side-effect free so test/reconcile-root-lockfile.test.js can assert
 * the exact flags without spawning npm.
 */
export function buildReconcileCommands(repoRoot = REPO_ROOT) {
  const reconcile = {
    cmd: 'npm',
    cwd: repoRoot,
    args: ['install', '--package-lock-only', '--ignore-scripts', '--no-audit', '--no-fund'],
  };
  return [
    { ...reconcile, args: [...reconcile.args] },
    { ...reconcile, args: [...reconcile.args] },
    {
      cmd: 'npm',
      cwd: repoRoot,
      // Backstop, not a mutation.
      args: ['ci', '--dry-run', '--ignore-scripts', '--no-audit', '--no-fund'],
    },
  ];
}

function main() {
  const shell = process.platform === 'win32';

  for (const { cmd, args, cwd } of buildReconcileCommands()) {
    console.log(`$ (${cwd}) ${cmd} ${args.join(' ')}`);
    const result = spawnSync(cmd, args, { stdio: 'inherit', shell, cwd });
    if (result.error) {
      console.error(`Failed to run \`${cmd} ${args.join(' ')}\` in ${cwd}: ${result.error.message}`);
      process.exit(1);
    }
    if (result.status !== 0) {
      console.error(
        'Root lockfile is not installable after the release version stamps. ' +
          'Refusing to let @semantic-release/git commit it. ' +
          'See docs/maintenance/release-operations.md for the regeneration recipe.'
      );
      process.exit(result.status ?? 1);
    }
  }

  console.log('Root lockfile reconciled and verified');
}

// Only run when executed as a script, not when a test imports the pure helper.
// realpath both sides so a relative argv[1], a symlink, or Windows path-case
// differences cannot make the comparison fail -- a false negative would
// silently skip the verification.
function isInvokedDirectly() {
  try {
    if (!process.argv[1]) return false;
    return fs.realpathSync(process.argv[1]) === fs.realpathSync(fileURLToPath(import.meta.url));
  } catch {
    return false;
  }
}

if (isInvokedDirectly()) {
  main();
}
