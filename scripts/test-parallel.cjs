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
  const { createTestServers } = await import("../test/server/instances.js");
  const servers = createTestServers();
  const started = [];
  for (const { name, server } of servers) {
    try {
      await server.start();
      started.push(server);
    } catch (error) {
      if (error.code !== "EADDRINUSE") throw error;
      console.log(`Test server (${name}) already running; reusing it`);
    }
  }

  const t0 = Date.now();
  const shards = Array.from({ length: total }, (_, i) => runShard(i + 1, total));
  const stopChildren = () => shards.forEach(({ child }) => child.kill());
  process.once("SIGINT", stopChildren);
  process.once("SIGTERM", stopChildren);
  let statuses;
  try {
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
