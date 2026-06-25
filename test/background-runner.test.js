import fs from "node:fs";
import net from "node:net";
import path from "node:path";
import os from "node:os";
import assert from "node:assert/strict";
import { runTests } from "../dist/core/index.js";
import { findFreePort } from "../dist/core/utils.js";

// Poll-bind a port until it is free (the OS may take a moment to release it
// after the background process is killed).
async function assertPortFree(port, timeoutMs = 5000) {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const free = await new Promise((resolve) => {
      const s = net.createServer();
      s.once("error", () => resolve(false));
      s.listen(port, "127.0.0.1", () => s.close(() => resolve(true)));
    });
    if (free) return;
    if (Date.now() > deadline) throw new Error(`Port ${port} still in use`);
    await new Promise((r) => setTimeout(r, 150));
  }
}

function serverCode(port) {
  return `require('http').createServer((q,r)=>r.end('ok')).listen(${port});`;
}

describe("Background processes via runTests", function () {
  this.timeout(60000);

  it("starts a background process and stops it with closeSurface", async function () {
    const port = await findFreePort();
    const spec = {
      tests: [
        {
          steps: [
            {
              runCode: {
                language: "javascript",
                code: serverCode(port),
                background: {
                  name: "srv",
                  waitUntil: { port: { port, host: "127.0.0.1", pollIntervalMs: 100 } },
                },
                timeout: 15000,
              },
            },
            { closeSurface: "srv" },
          ],
        },
      ],
    };
    const tempFilePath = path.join(os.tmpdir(), `dd-temp-bg-stop-${process.pid}.json`);
    fs.writeFileSync(tempFilePath, JSON.stringify(spec, null, 2));
    try {
      const result = await runTests({ input: tempFilePath, logLevel: "silent" });
      assert.equal(result.summary.steps.fail, 0, "no steps should fail");
      assert.equal(result.summary.steps.pass, 2, "both steps should pass");
      await assertPortFree(port);
    } finally {
      fs.rmSync(tempFilePath, { force: true });
    }
  });

  it("auto-tears-down a background process left running at run end", async function () {
    const port = await findFreePort();
    const spec = {
      tests: [
        {
          steps: [
            {
              runCode: {
                language: "javascript",
                code: serverCode(port),
                background: {
                  name: "leaked",
                  waitUntil: { port: { port, host: "127.0.0.1", pollIntervalMs: 100 } },
                },
                timeout: 15000,
              },
            },
          ],
        },
      ],
    };
    const tempFilePath = path.join(os.tmpdir(), `dd-temp-bg-autosweep-${process.pid}.json`);
    fs.writeFileSync(tempFilePath, JSON.stringify(spec, null, 2));
    try {
      const result = await runTests({ input: tempFilePath, logLevel: "silent" });
      assert.equal(result.summary.steps.fail, 0, "the start step should pass");
      // No closeSurface step — the run-end sweep must have killed it.
      await assertPortFree(port);
    } finally {
      fs.rmSync(tempFilePath, { force: true });
    }
  });
});
