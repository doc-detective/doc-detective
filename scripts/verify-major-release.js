#!/usr/bin/env node
// Stops an accidental major release (ADR 01147). Squash bodies never reach the
// commit-msg hook, and release.yml promotes to @latest on its own, so a stray
// BREAKING CHANGE: footer would otherwise reach users. This reads the release
// type semantic-release computed, which covers every route a footer can take.
//
// Usage: verify-major-release.js <release type> <release|prerelease>

const [type, branchKind] = process.argv.slice(2);

// A safety guard fails closed: a missing argument isn't a pass.
if (!type || !branchKind) {
  console.error('Usage: verify-major-release.js <release-type> <release|prerelease>');
  process.exit(1);
}

const allowed = (process.env.ALLOW_MAJOR_RELEASE || '').trim().toLowerCase() === 'true';

if (type === 'major' && branchKind !== 'prerelease' && !allowed) {
  console.error(
    'Refusing a major release: the commits since the last release include a breaking change. ' +
      'If it is intended, set the ALLOW_MAJOR_RELEASE repository variable to true and rerun. ' +
      'If not, revert the commit that carries the BREAKING CHANGE footer or the `!`.'
  );
  process.exit(1);
}
