import http from "node:http";
import assert from "node:assert/strict";
import { checkLink } from "../dist/core/tests/checkLink.js";

let server;
let serverPort;
const requestLog = {};
const flakyCounters = {};

before(async function () {
  const { expect } = await import("chai");
  global.expect = expect;

  // Create a local HTTP server that supports:
  //  - "/<code>" -> returns that status (e.g. /200, /429)
  //  - "/flaky/<id>/<failCount>/<failCode>/<finalCode>" -> returns failCode
  //    the first failCount requests for <id>, then finalCode afterward
  //  - "/retry-after/<id>/<delayMs>" -> returns 429 with Retry-After: <delayMs>ms worth of seconds
  //    the first time for <id>, then 200 afterward. Also records timestamps.
  //  - "/method-sensitive/<id>" -> GET returns 429, HEAD returns 200
  //  - "/echo-headers" -> returns 200 and records headers in requestLog["echo-headers"]
  server = http.createServer((req, res) => {
    const url = req.url;

    if (url === "/echo-headers") {
      requestLog["echo-headers"] = { ...req.headers };
      res.writeHead(200, { "Content-Type": "text/plain" });
      res.end("ok");
      return;
    }

    const flakyMatch = url.match(/^\/flaky\/([^/]+)\/(\d+)\/(\d+)\/(\d+)$/);
    if (flakyMatch) {
      const [, id, failCountStr, failCodeStr, finalCodeStr] = flakyMatch;
      const failCount = parseInt(failCountStr, 10);
      const failCode = parseInt(failCodeStr, 10);
      const finalCode = parseInt(finalCodeStr, 10);
      flakyCounters[id] = (flakyCounters[id] || 0) + 1;
      const code = flakyCounters[id] <= failCount ? failCode : finalCode;
      res.writeHead(code, { "Content-Type": "text/plain" });
      res.end(`Status ${code}`);
      return;
    }

    const retryAfterMatch = url.match(/^\/retry-after\/([^/]+)\/(\d+)$/);
    if (retryAfterMatch) {
      const [, id, delayStr] = retryAfterMatch;
      const delayMs = parseInt(delayStr, 10);
      requestLog[`retry-after-${id}`] = requestLog[`retry-after-${id}`] || [];
      requestLog[`retry-after-${id}`].push(Date.now());
      flakyCounters[`ra-${id}`] = (flakyCounters[`ra-${id}`] || 0) + 1;
      if (flakyCounters[`ra-${id}`] === 1) {
        res.writeHead(429, {
          "Content-Type": "text/plain",
          "Retry-After": String(Math.max(1, Math.round(delayMs / 1000))),
        });
        res.end("Status 429");
      } else {
        res.writeHead(200, { "Content-Type": "text/plain" });
        res.end("Status 200");
      }
      return;
    }

    const methodMatch = url.match(/^\/method-sensitive\/([^/]+)$/);
    if (methodMatch) {
      if (req.method === "HEAD") {
        res.writeHead(200, { "Content-Type": "text/plain" });
        res.end();
      } else {
        res.writeHead(429, { "Content-Type": "text/plain" });
        res.end("Status 429");
      }
      return;
    }

    const statusCode = parseInt(url.replace("/", ""), 10) || 200;
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

describe("checkLink non-2xx status code regression", function () {
  this.timeout(30000);

  it("should PASS for a 200 response with default statusCodes", async function () {
    const result = await checkLink({
      config: {},
      step: {
        checkLink: { url: `http://localhost:${serverPort}/200` },
      },
    });
    assert.equal(result.status, "PASS");
    assert.match(result.description, /Returned 200/);
  });

  it("should PASS for a 429 response when 429 is in statusCodes", async function () {
    const result = await checkLink({
      config: {},
      step: {
        checkLink: {
          url: `http://localhost:${serverPort}/429`,
          statusCodes: [200, 429],
        },
      },
    });
    assert.equal(result.status, "PASS", `Expected PASS but got: ${result.description}`);
    assert.match(result.description, /Returned 429/);
  });

  it("should FAIL for a 429 response when 429 is NOT in statusCodes", async function () {
    const result = await checkLink({
      config: {},
      step: {
        checkLink: {
          url: `http://localhost:${serverPort}/429`,
          statusCodes: [200],
        },
      },
    });
    assert.equal(result.status, "FAIL");
    assert.match(result.description, /Returned 429/);
  });

  it("should PASS for a 403 response when 403 is in statusCodes", async function () {
    const result = await checkLink({
      config: {},
      step: {
        checkLink: {
          url: `http://localhost:${serverPort}/403`,
          statusCodes: [200, 403],
        },
      },
    });
    assert.equal(result.status, "PASS", `Expected PASS but got: ${result.description}`);
    assert.match(result.description, /Returned 403/);
  });

  it("should PASS for a 500 response when 500 is in statusCodes", async function () {
    const result = await checkLink({
      config: {},
      step: {
        checkLink: {
          url: `http://localhost:${serverPort}/500`,
          statusCodes: [200, 500],
        },
      },
    });
    assert.equal(result.status, "PASS", `Expected PASS but got: ${result.description}`);
    assert.match(result.description, /Returned 500/);
  });

  it("should FAIL for unresolvable URL", async function () {
    const result = await checkLink({
      config: {},
      step: {
        checkLink: {
          url: "http://this-domain-does-not-exist-12345.invalid",
          statusCodes: [200],
        },
      },
    });
    assert.equal(result.status, "FAIL");
    assert.match(result.description, /Invalid or unresolvable URL/);
  });
});

describe("checkLink retry, headers, and HEAD fallback", function () {
  this.timeout(30000);

  it("should retry on 429 and PASS when a subsequent attempt returns 200", async function () {
    const id = `retry-${Date.now()}`;
    const result = await checkLink({
      config: {},
      step: {
        checkLink: {
          // Fail once with 429, then return 200
          url: `http://localhost:${serverPort}/flaky/${id}/1/429/200`,
        },
      },
    });
    assert.equal(result.status, "PASS", `Expected PASS but got: ${result.description}`);
    assert.match(result.description, /Returned 200/);
  });

  it("should retry up to three times (fail-fail-fail-pass sequence succeeds)", async function () {
    const id = `retry3-${Date.now()}`;
    const result = await checkLink({
      config: {},
      step: {
        checkLink: {
          // Fail three times with 429, then return 200. Must succeed on the 4th attempt.
          url: `http://localhost:${serverPort}/flaky/${id}/3/429/200`,
        },
      },
    });
    assert.equal(result.status, "PASS", `Expected PASS but got: ${result.description}`);
    assert.match(result.description, /Returned 200/);
    assert.equal(flakyCounters[id], 4, `Expected 4 attempts, got ${flakyCounters[id]}`);
  });

  it("should retry on 503 and PASS when a subsequent attempt returns 200", async function () {
    const id = `retry5xx-${Date.now()}`;
    const result = await checkLink({
      config: {},
      step: {
        checkLink: {
          url: `http://localhost:${serverPort}/flaky/${id}/2/503/200`,
        },
      },
    });
    assert.equal(result.status, "PASS", `Expected PASS but got: ${result.description}`);
    assert.match(result.description, /Returned 200/);
  });

  it("should honor Retry-After header when retrying", async function () {
    const id = `ra-${Date.now()}`;
    const delayMs = 1500;
    const start = Date.now();
    const result = await checkLink({
      config: {},
      step: {
        checkLink: {
          url: `http://localhost:${serverPort}/retry-after/${id}/${delayMs}`,
        },
      },
    });
    const elapsed = Date.now() - start;
    assert.equal(result.status, "PASS", `Expected PASS but got: ${result.description}`);
    // Retry-After was 1 or 2 seconds (rounded). Elapsed should be >= ~1000ms.
    assert.ok(
      elapsed >= 900,
      `Expected elapsed >= ~1000ms for Retry-After honor, got ${elapsed}ms`
    );
  });

  it("should fall back to HEAD when GET returns 429", async function () {
    const id = `hs-${Date.now()}`;
    const result = await checkLink({
      config: {},
      step: {
        checkLink: {
          url: `http://localhost:${serverPort}/method-sensitive/${id}`,
        },
      },
    });
    assert.equal(
      result.status,
      "PASS",
      `Expected PASS via HEAD fallback but got: ${result.description}`
    );
    assert.match(result.description, /Returned 200/);
  });

  it("should send browser-mimicking default headers", async function () {
    delete requestLog["echo-headers"];
    const result = await checkLink({
      config: {},
      step: {
        checkLink: { url: `http://localhost:${serverPort}/echo-headers` },
      },
    });
    assert.equal(result.status, "PASS");
    const received = requestLog["echo-headers"];
    assert.ok(received, "Expected server to have recorded the request");
    assert.ok(received["sec-fetch-mode"], "Expected Sec-Fetch-Mode header to be sent");
    assert.ok(received["sec-fetch-dest"], "Expected Sec-Fetch-Dest header to be sent");
    assert.ok(received["accept-encoding"], "Expected Accept-Encoding header to be sent");
    assert.ok(received["upgrade-insecure-requests"], "Expected Upgrade-Insecure-Requests header");
    assert.ok(received["sec-ch-ua"], "Expected Sec-Ch-Ua header to be sent");
  });

  it("should send user-supplied headers via object form", async function () {
    delete requestLog["echo-headers"];
    const result = await checkLink({
      config: {},
      step: {
        checkLink: {
          url: `http://localhost:${serverPort}/echo-headers`,
          headers: {
            "X-Doc-Detective-Check": "shared-secret",
            "CF-Access-Client-Id": "test-client.access",
          },
        },
      },
    });
    assert.equal(result.status, "PASS", `Expected PASS but got: ${result.description}`);
    const received = requestLog["echo-headers"];
    assert.equal(received["x-doc-detective-check"], "shared-secret");
    assert.equal(received["cf-access-client-id"], "test-client.access");
  });

  it("should accept user-supplied headers via newline-separated string form", async function () {
    delete requestLog["echo-headers"];
    const result = await checkLink({
      config: {},
      step: {
        checkLink: {
          url: `http://localhost:${serverPort}/echo-headers`,
          headers: "X-Origin-Verify: abc123\nX-Vercel-Protection-Bypass: tok456",
        },
      },
    });
    assert.equal(result.status, "PASS", `Expected PASS but got: ${result.description}`);
    const received = requestLog["echo-headers"];
    assert.equal(received["x-origin-verify"], "abc123");
    assert.equal(received["x-vercel-protection-bypass"], "tok456");
  });

  it("should NOT retry when an accepted status code is returned on the first attempt", async function () {
    const id = `accepted-${Date.now()}`;
    const start = Date.now();
    const result = await checkLink({
      config: {},
      step: {
        checkLink: {
          // Would return 429 three times then 200 — but since 429 is accepted,
          // we should take the first response immediately without backoff.
          url: `http://localhost:${serverPort}/flaky/${id}/3/429/200`,
          statusCodes: [200, 429],
        },
      },
    });
    const elapsed = Date.now() - start;
    assert.equal(result.status, "PASS", `Expected PASS but got: ${result.description}`);
    assert.match(result.description, /Returned 429/);
    // No retry means no 1s backoff. Allow generous slack for slow CI.
    assert.ok(
      elapsed < 800,
      `Expected short-circuit (no retry) but took ${elapsed}ms`
    );
    // And only one request should have hit the server.
    assert.equal(flakyCounters[id], 1, `Expected 1 request, got ${flakyCounters[id]}`);
  });

  it("should coerce non-string header values to strings", async function () {
    delete requestLog["echo-headers"];
    const result = await checkLink({
      config: {},
      step: {
        checkLink: {
          url: `http://localhost:${serverPort}/echo-headers`,
          headers: {
            "X-Numeric": 42,
            "X-Bool": true,
          },
        },
      },
    });
    assert.equal(result.status, "PASS");
    const received = requestLog["echo-headers"];
    assert.equal(received["x-numeric"], "42");
    assert.equal(received["x-bool"], "true");
  });

  it("should let user headers override defaults (case-insensitive)", async function () {
    delete requestLog["echo-headers"];
    const result = await checkLink({
      config: {},
      step: {
        checkLink: {
          url: `http://localhost:${serverPort}/echo-headers`,
          headers: { "user-agent": "custom-ua/1.0" },
        },
      },
    });
    assert.equal(result.status, "PASS");
    assert.equal(requestLog["echo-headers"]["user-agent"], "custom-ua/1.0");
  });
});

// Live network smoke test against portal.prove.com, which previously returned
// 429 due to WAF-based bot protection. Opt-in via RUN_LIVE_SMOKE=1 so CI is
// not slowed or destabilized by external network traffic.
describe("checkLink live smoke (portal.prove.com)", function () {
  this.timeout(60000);

  it("reports the status observed from portal.prove.com (opt-in)", async function () {
    if (!process.env.RUN_LIVE_SMOKE) {
      this.skip();
      return;
    }
    const result = await checkLink({
      config: {},
      step: {
        checkLink: { url: "https://portal.prove.com/" },
      },
    });
    console.log(
      `[portal.prove.com smoke] status=${result.status} description=${result.description}`
    );
    // Diagnostic, not a regression gate.
    assert.ok(result.status === "PASS" || result.status === "FAIL");
  });
});
