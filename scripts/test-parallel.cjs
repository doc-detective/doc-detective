#!/usr/bin/env node
// Local convenience: run the mocha suite as N concurrent shards (default 2)
// using the same deterministic partition CI uses (scripts/run-test-shard.cjs).
// `npm test` is unchanged; this is `npm run test:parallel` (ADR 01120).
//
// The test servers (8092 main / 8093 API) are started ONCE here, before the
// shards, so neither shard's mocha owns them: each shard's root hook sees
// EADDRINUSE and reuses them, and neither shard's teardown can stop them
// under the other. They're stopped here when both shards finish.
//
// Usage: node scripts/test-parallel.cjs [totalShards]
// Output: every line is prefixed with "[shard i/N]". Exits non-zero if any
// shard does.

const path = require("path");
const readline = require("readline");
const { spawn } = require("child_process");
const treeKill = require("tree-kill");
const { resolveShard } = require("./run-test-shard.cjs");

// Highest exit status wins, so any failing shard fails the run. A shard
// killed by a signal (status null) counts as 1.
function combinedExit(statuses) {
  return Math.max(0, ...statuses.map((s) => (s === null ? 1 : s)));
}

function runShard(index, total) {
  const tag = `[shard ${index}/${total}]`;
  const child = spawn(
    process.execPath,
    [path.join(__dirname, "run-test-shard.cjs"), String(index), String(total)],
    { stdio: ["ignore", "pipe", "pipe"] }
  );
  for (const [stream, out] of [
    [child.stdout, process.stdout],
    [child.stderr, process.stderr],
  ]) {
    readline
      .createInterface({ input: stream })
      .on("line", (line) => out.write(`${tag} ${line}\n`));
  }
  const done = new Promise((resolve) => child.on("close", resolve));
  return { child, done };
}

async function main() {
  const total = Number(process.argv[2] ?? 2);
  resolveShard(["1", String(total)]); // validates totalShards

  // Registered before anything starts, and kept for every signal (not
  // `once`), so a second Ctrl+C still lands here instead of killing this
  // process before it stops the servers. Each shard's whole tree is killed:
  // mocha, plus the browsers and Appium servers it spawned, which would
  // otherwise outlive it.
  const shards = [];
  let interrupted = false;
  const onSignal = () => {
    if (!interrupted) console.error("test:parallel: stopping shards…");
    interrupted = true;
    for (const { child } of shards) {
      if (child.exitCode === null) treeKill(child.pid);
    }
  };
  process.on("SIGINT", onSignal);
  process.on("SIGTERM", onSignal);

  const { createTestServers } = await import("../test/server/instances.js");
  const started = [];
  const t0 = Date.now();
  let statuses = [];
  try {
    for (const { name, server } of createTestServers()) {
      try {
        await server.start();
        started.push(server);
      } catch (error) {
        if (error.code !== "EADDRINUSE") throw error;
        console.log(`Test server (${name}) already running; reusing it`);
      }
    }
    if (!interrupted) {
      for (let i = 1; i <= total; i++) shards.push(runShard(i, total));
    }
    statuses = await Promise.all(shards.map((s) => s.done));
  } finally {
    for (const server of started) {
      try {
        await server.stop();
      } catch (error) {
        console.error(`Failed to stop test server: ${error.message}`);
      }
    }
  }
  const secs = ((Date.now() - t0) / 1000).toFixed(1);
  if (interrupted) {
    // 130 = 128 + SIGINT. Killed shards report null, not a real failure.
    console.log(`test:parallel interrupted after ${secs}s`);
    process.exit(130);
  }
  statuses.forEach((s, i) =>
    console.log(`shard ${i + 1}/${total}: ${s === 0 ? "passed" : `FAILED (exit ${s})`}`)
  );
  console.log(`test:parallel finished in ${secs}s`);
  process.exit(combinedExit(statuses));
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}

module.exports = { combinedExit };
