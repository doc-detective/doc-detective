// Long-running HTTP server used by background-process fixtures
// (test/core-artifacts/background-processes.spec.json) to exercise a
// `runShell` step with `background: true`. Cross-platform (Node only).
// ESM, because the repo's package.json sets "type": "module".
// Usage: node bg-server.js <port>
import http from "node:http";
const port = Number(process.argv[2] || 0);
http.createServer((req, res) => res.end("ok")).listen(port, "127.0.0.1");
