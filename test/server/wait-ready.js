// Poll until the test servers (8092 main / 8093 API) accept TCP connections,
// then exit 0. CI backgrounds test/server/start.js and runs this to gate the
// fixture run on server readiness — without pulling in an external `wait-on`
// dependency. Exits 1 if the servers aren't up within the timeout.
import net from "node:net";

const PORTS = [8092, 8093];
const HOST = "127.0.0.1";
const TIMEOUT_MS = 30000;
const INTERVAL_MS = 250;

function canConnect(port) {
  return new Promise((resolve) => {
    const socket = net.connect({ port, host: HOST });
    const done = (ok) => {
      socket.destroy();
      resolve(ok);
    };
    socket.once("connect", () => done(true));
    socket.once("error", () => done(false));
  });
}

async function waitForPort(port, deadline) {
  while (Date.now() < deadline) {
    if (await canConnect(port)) return true;
    await new Promise((r) => setTimeout(r, INTERVAL_MS));
  }
  return false;
}

async function main() {
  const deadline = Date.now() + TIMEOUT_MS;
  for (const port of PORTS) {
    const ready = await waitForPort(port, deadline);
    if (!ready) {
      console.error(`Test server on port ${port} did not become ready in time.`);
      process.exit(1);
    }
    console.log(`Test server on port ${port} is ready.`);
  }
}

main();
