// Shared classifier for npm's noisy, non-actionable output. Deprecation,
// funding, and notice lines (e.g. `npm warn deprecated glob@10.5.0: …`,
// `npm warn deprecated whatwg-encoding@3.1.1: …`) are about transitive
// dependencies the user can't change, and they alarm users out of context.
// We drop them from all user-facing install output — `install all`,
// lazy-install on first use, and the postinstall pre-warm — so a noisy
// transitive tree never produces scary terminal output.
//
// NOTE: scripts/postinstall.js keeps a parallel copy of this predicate because
// it is a plain Node script that runs before/without the compiled `dist/`. Keep
// the two in sync.

/** True for npm deprecation / funding / notice noise (and blank lines). */
export function isNpmNoiseLine(line: string): boolean {
  const l = line.trim();
  if (!l) return true;
  return (
    /^npm warn deprecated/i.test(l) ||
    /^npm notice/i.test(l) ||
    /^npm fund/i.test(l) ||
    /packages are looking for funding/i.test(l)
  );
}
