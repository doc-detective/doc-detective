// Standalone launcher for the test servers (ports 8092 main / 8093 API) that
// the core fixture specs depend on. Under mocha these are started by the root
// hook in test/hooks.js; when the fixtures run OUTSIDE mocha — the per-feature
// Doc Detective GitHub Action jobs in CI — this script stands up the identical
// servers via the shared factory in test/server/instances.js.
//
// Run it from the repo root (staticDir is resolved relative to cwd), in the
// background, before invoking doc-detective, then wait for the port to open:
//
//   node test/server/start.js &
//   node test/server/wait-ready.js
//
// It stays alive until it receives SIGINT/SIGTERM, then shuts the servers down
// cleanly. EADDRINUSE is tolerated (a stray or parallel instance shouldn't fail
// the job) — mirrors the harness's own tolerance in test/hooks.js.
import { createTestServers } from "./instances.js";

const servers = createTestServers();

async function start() {
  for (const { name, server } of servers) {
    try {
      await server.start();
    } catch (error) {
      if (error.code === "EADDRINUSE") {
        console.log(`Test server (${name}) already running`);
      } else {
        throw error;
      }
    }
  }
  console.log(
    "Test servers ready (8092 main, 8093 API). Send SIGINT/SIGTERM to stop."
  );
}

let shuttingDown = false;
async function shutdown() {
  if (shuttingDown) return;
  shuttingDown = true;
  for (const { name, server } of servers) {
    try {
      await server.stop();
    } catch (error) {
      console.error(`Failed to stop test server (${name}): ${error.message}`);
    }
  }
  process.exit(0);
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

start().catch((error) => {
  console.error(`Failed to start test servers: ${error.message}`);
  process.exit(1);
});
