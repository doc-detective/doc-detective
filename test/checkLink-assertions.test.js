import http from "node:http";
import assert from "node:assert/strict";
import { checkLink } from "../dist/core/tests/checkLink.js";

const config = { logLevel: "silent" };

function findAssertion(assertions, prefix) {
  return (assertions || []).find((a) => a.statement.startsWith(prefix));
}

let server;
let serverPort;

before(async function () {
  server = http.createServer((req, res) => {
    const statusCode = parseInt(req.url.replace("/", ""), 10) || 200;
    res.writeHead(statusCode, { "Content-Type": "text/plain" });
    res.end(`Status ${statusCode}`);
  });
  await new Promise((resolve) => {
    server.listen(0, () => {
      serverPort = server.address().port;
      resolve();
    });
  });
});

after(function () {
  if (server) server.close();
});

describe("checkLink articulated assertions (Phase 4a.2a)", function () {
  this.timeout(30000);

  it("emits a PASS statusCode assertion and PASS status for an accepted code", async () => {
    const result = await checkLink({
      config,
      step: { checkLink: { url: `http://localhost:${serverPort}/200` } },
    });
    assert.equal(result.status, "PASS");
    assert.ok(Array.isArray(result.assertions));
    const sc = findAssertion(result.assertions, "statusCode");
    assert.ok(sc, "expected a statusCode assertion");
    assert.equal(sc.source, "implicit");
    assert.equal(sc.result, "PASS");
    assert.deepEqual(sc.expected, [200, 301, 302, 307, 308]);
    assert.equal(sc.actual, 200);
  });

  it("emits a FAIL statusCode assertion and FAIL status for an unaccepted code", async () => {
    const result = await checkLink({
      config,
      step: {
        checkLink: {
          url: `http://localhost:${serverPort}/404`,
          statusCodes: [200],
        },
      },
    });
    assert.equal(result.status, "FAIL");
    const sc = findAssertion(result.assertions, "statusCode");
    assert.ok(sc);
    assert.equal(sc.result, "FAIL");
    assert.deepEqual(sc.expected, [200]);
    assert.equal(sc.actual, 404);
  });

  it("returns FAIL with no assertions for an unresolvable URL (execution error)", async () => {
    const result = await checkLink({
      config,
      step: {
        checkLink: {
          url: "http://this-domain-does-not-exist-12345.invalid",
          statusCodes: [200],
        },
      },
    });
    assert.equal(result.status, "FAIL");
    assert.ok(
      result.assertions === undefined || result.assertions.length === 0,
      "execution errors must not produce assertion records"
    );
    assert.match(result.description, /Invalid or unresolvable URL/);
  });

  it("returns FAIL with no assertions for a relative URL without origin (execution error)", async () => {
    const result = await checkLink({
      config: {},
      step: { checkLink: { url: "/relative-path" } },
    });
    assert.equal(result.status, "FAIL");
    assert.ok(
      result.assertions === undefined || result.assertions.length === 0,
      "input-guard failures must not produce assertion records"
    );
  });
});
