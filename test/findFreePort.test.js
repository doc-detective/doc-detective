import assert from "node:assert/strict";
import net from "node:net";
import { findFreePort } from "../dist/core/utils.js";

describe("findFreePort", () => {
  it("returns a port in the non-privileged TCP range", async () => {
    const port = await findFreePort();
    assert.equal(typeof port, "number");
    assert.ok(port >= 1024 && port <= 65535, `out of range: ${port}`);
  });

  it("returns a port that is immediately bindable on 127.0.0.1", async () => {
    const port = await findFreePort();
    await new Promise((resolve, reject) => {
      const s = net.createServer();
      s.once("error", reject);
      s.listen(port, "127.0.0.1", () => s.close(resolve));
    });
  });

  it("does not return a port currently bound by another listener", async () => {
    const taken = net.createServer();
    await new Promise((r) => taken.listen(0, "127.0.0.1", r));
    const takenPort = taken.address().port;
    try {
      for (let i = 0; i < 5; i++) {
        const port = await findFreePort();
        assert.notEqual(port, takenPort);
      }
    } finally {
      await new Promise((r) => taken.close(r));
    }
  });
});
