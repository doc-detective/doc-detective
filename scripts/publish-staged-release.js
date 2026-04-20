#!/usr/bin/env node
// Publish the root and src/common packages with a dist-tag, idempotently.
//
// Non-idempotent npm publishes are a problem for staged releases: if the
// root publish succeeds but `doc-detective-common` fails (network, registry
// hiccup), the next semantic-release run computes the same version and
// fails on `npm publish` for the already-published root — leaving the
// staging tag in limbo.
//
// For each package this script does:
//   * `npm view` to check if the exact version is already on the registry
//   * if missing → `npm publish --tag <tag>`
//   * if present → `npm dist-tag add pkg@version <tag>` (ensures the tag
//                  points at the intended version even if a prior run set
//                  it incorrectly)
//
// Exits non-zero if either package fails to reach the desired end state.

import { spawnSync } from 'node:child_process';

const version = process.argv[2];
const tag = process.argv[3];

if (!version || !tag) {
  console.error('Usage: publish-staged-release.js <version> <tag>');
  process.exit(1);
}

const SEMVER = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/;
// npm dist-tags must be valid npm identifiers and must not parse as semver.
// Allow lowercase alphanumerics, hyphens, underscores, and dots (dots show up
// in our `staging-<version>` tags). The leading-char constraint and the
// strict character set together rule out shell metacharacters.
const DIST_TAG = /^[a-z0-9][a-z0-9._-]{0,99}$/;

if (!SEMVER.test(version)) {
  console.error(`Refusing to run: ${JSON.stringify(version)} is not a valid semver version`);
  process.exit(1);
}
if (!DIST_TAG.test(tag)) {
  console.error(`Refusing to run: ${JSON.stringify(tag)} is not a valid npm dist-tag`);
  process.exit(1);
}

const shell = process.platform === 'win32';

function run(args, opts = {}) {
  console.log(`$ npm ${args.join(' ')}`);
  return spawnSync('npm', args, { stdio: 'inherit', shell, ...opts });
}

function capture(args) {
  const r = spawnSync('npm', args, { shell });
  return {
    ok: r.status === 0,
    stdout: (r.stdout || '').toString().trim(),
  };
}

function isAlreadyPublished(pkg, ver) {
  const { ok, stdout } = capture(['view', `${pkg}@${ver}`, 'version']);
  return ok && stdout === ver;
}

function publishOrTag(pkg, workspaceArgs) {
  if (isAlreadyPublished(pkg, version)) {
    console.log(`[${pkg}] ${version} already published; ensuring dist-tag ${tag}`);
    const r = run(['dist-tag', 'add', `${pkg}@${version}`, tag]);
    if (r.status !== 0) {
      console.error(`[${pkg}] dist-tag add failed`);
      process.exit(r.status ?? 1);
    }
    return;
  }

  console.log(`[${pkg}] publishing ${version} with --tag ${tag}`);
  const r = run([
    'publish',
    ...workspaceArgs,
    '--access', 'public',
    '--tag', tag,
  ]);
  if (r.status !== 0) {
    console.error(`[${pkg}] publish failed`);
    process.exit(r.status ?? 1);
  }
}

publishOrTag('doc-detective', []);
publishOrTag('doc-detective-common', ['--workspace', 'src/common']);
