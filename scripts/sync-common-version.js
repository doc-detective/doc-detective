#!/usr/bin/env node
// semantic-release `prepare` step for the doc-detective-common workspace.
//
// Two things happen here:
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
// hoisted workspace node_modules.
//
// The ROOT lockfile is deliberately NOT handled here. Every version stamp --
// this script's, and @semantic-release/npm's afterward -- rewrites it, so any
// reconcile done at this point is invalidated by the plugin that runs next.
// That is exactly how 4.37.5 shipped a broken root lockfile even though this
// script verified successfully. Root reconciliation and verification now live
// in scripts/reconcile-root-lockfile.js, wired as the last prepare step before
// @semantic-release/git commits. See ADR 01093.
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
 * one.
 */
export function buildSyncCommands(version, repoRoot = REPO_ROOT) {
  const commonDir = path.join(repoRoot, 'src', 'common');
  return [
    {
      cmd: 'npm',
      // Run from the repo root so `--workspace` resolves. Side effect: this
      // also rewrites the root lockfile's entry for the workspace; root
      // reconciliation and verification happen afterward, in
      // scripts/reconcile-root-lockfile.js.
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
