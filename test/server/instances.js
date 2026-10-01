import { createServer } from "./index.js";

// Canonical test-server topology shared by the mocha harness (test/hooks.js)
// and the standalone CI launcher (test/server/start.js). Defining it in one
// place keeps the two entry points from drifting: the per-feature Doc Detective
// Action jobs must stand up byte-for-byte the same servers the mocha suite
// relies on (the main server injects `extraField` via modifyResponse; several
// httpRequest fixtures assert on it).
//
//   - main (8092): static site + echo API, injects extraField into responses
//   - API  (8093): static site + echo API, no response modification
export function createTestServers() {
  const main = createServer({
    port: 8092,
    staticDir: "./test/server/public",
    modifyResponse: (req, body) => {
      return { ...body, extraField: "added by server" };
    },
  });
  const api = createServer({
    port: 8093,
    staticDir: "./test/server/public",
  });
  return [
    { name: "main", server: main },
    { name: "API", server: api },
  ];
}
