import http from "node:http";
import assert from "node:assert/strict";
import { checkLink } from "../dist/core/tests/checkLink.js";

let server;
let serverPort;

before(async function () {
  const { expect } = await import("chai");
  global.expect = expect;

  // Create a local HTTP server that returns various status codes based on URL path
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
