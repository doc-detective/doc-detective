#!/usr/bin/env node
// Fails when an ADR the branch adds reuses a number already taken. Duplicates
// that already exist on the base branch are grandfathered: only added files
// are checked. Renames (renumbering) count as an add plus a delete.
//
// Usage: node scripts/check-adr-numbers.cjs [base-ref]   (default: origin/main)

const { execFileSync } = require("child_process");

const NUMBERED = /^adrs\/(\d{5})-[^/]*\.md$/;
const number = (file) => (file.match(NUMBERED) || [])[1];

// base: ADR files on the base tip. head: on the branch (or the PR merge commit).
// mergeBase: where the branch left the base, so deletions and renames are the branch's own.
function findCollisions(base, head, mergeBase = base) {
  const added = head.filter((f) => number(f) && !mergeBase.includes(f));
  const deleted = new Set(mergeBase.filter((f) => !head.includes(f)));
  const pool = [...new Set([...head, ...base])].filter((f) => number(f) && !deleted.has(f));
  // 00001–00999 is reserved for backfilling older decisions, so new numbers start at 01000.
  const next = String(Math.max(999, ...pool.map((f) => Number(number(f)))) + 1).padStart(5, "0");
  return added
    .map((file) => ({ file, number: number(file), others: pool.filter((f) => f !== file && number(f) === number(file)), next }))
    .filter((c) => c.others.length > 0);
}

function adrFiles(ref) {
  return execFileSync("git", ["ls-tree", "--name-only", ref, "adrs/"], { encoding: "utf8" })
    .split("\n")
    .filter(Boolean);
}

if (require.main === module) {
  const baseRef = process.argv[2] || "origin/main";
  const mergeBase = execFileSync("git", ["merge-base", baseRef, "HEAD"], { encoding: "utf8" }).trim();
  const collisions = findCollisions(adrFiles(baseRef), adrFiles("HEAD"), adrFiles(mergeBase));
  for (const c of collisions) {
    console.error(
      `${c.file}: ADR number ${c.number} is already used by ${c.others.join(", ")}. Renumber the file to ${c.next}.`
    );
  }
  if (collisions.length) process.exit(1);
  console.log("ADR numbers are unique.");
}

module.exports = { findCollisions };
