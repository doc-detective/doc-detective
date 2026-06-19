import http from "node:http";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import assert from "node:assert/strict";
import { httpRequest } from "../dist/core/tests/httpRequest.js";

const config = { logLevel: "silent" };

// Unified model: implicit assertions carry a $$ runtime-expression statement
// (e.g. "$$outputs.response.statusCode oneOf [200]",
// "$$outputs.bodyMatches == true"), so match on a substring of the statement
// rather than a prose prefix.
function findAssertion(assertions, token) {
  return (assertions || []).find((a) => a.statement.includes(token));
}

let server;
let serverPort;

before(async function () {
  // Returns JSON {status, name, items:[...]} so body/required checks have data.
  // The /text route returns a plain-text body ("plain-text-body") so a STRING
  // `response.body` assertion can be exercised (axios leaves non-JSON bodies as
  // strings). All responses set a known x-test-header so header assertions can
  // be made to match or mismatch deterministically.
  server = http.createServer((req, res) => {
    if (req.url === "/text") {
      res.writeHead(200, {
        "Content-Type": "text/plain",
        "x-test-header": "real-value",
      });
      res.end("plain-text-body");
      return;
    }
    const statusCode = parseInt(req.url.replace("/", ""), 10) || 200;
    res.writeHead(statusCode, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ status: statusCode, name: "John", items: [1, 2] }));
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

describe("httpRequest articulated assertions (Phase 4a.2a)", function () {
  this.timeout(30000);

  it("emits a PASS statusCode assertion and PASS status for an accepted code", async () => {
    const result = await httpRequest({
      config,
      step: {
        httpRequest: {
          url: `http://localhost:${serverPort}/200`,
          method: "get",
        },
      },
    });
    assert.equal(result.status, "PASS");
    assert.ok(Array.isArray(result.assertions));
    const sc = findAssertion(result.assertions, "statusCode");
    assert.ok(sc, "expected a statusCode assertion");
    assert.equal(sc.source, "implicit");
    assert.equal(sc.result, "PASS");
    assert.match(sc.statement, /\$\$outputs\.response\.statusCode oneOf/);
    // outputs preserved
    assert.equal(result.outputs.response.statusCode, 200);
  });

  it("emits a FAIL statusCode assertion and FAIL status for an unaccepted code", async () => {
    const result = await httpRequest({
      config,
      step: {
        httpRequest: {
          url: `http://localhost:${serverPort}/404`,
          method: "get",
          statusCodes: [200],
        },
      },
    });
    assert.equal(result.status, "FAIL");
    const sc = findAssertion(result.assertions, "statusCode");
    assert.equal(sc.result, "FAIL");
    assert.match(sc.statement, /\$\$outputs\.response\.statusCode oneOf/);
    assert.equal(result.outputs.response.statusCode, 404);
  });

  it("allowAdditionalFields:false with UNSET response.body -> noUnexpectedFields PASS (no crash)", async () => {
    // response.body is not provided, so the expected body defaults to {} (no
    // keys). With no expected fields there are no unexpected fields to flag, so
    // the noUnexpectedFields check must PASS and never pass undefined into the
    // object comparison helper.
    const result = await httpRequest({
      config,
      step: {
        httpRequest: {
          url: `http://localhost:${serverPort}/200`,
          method: "get",
          statusCodes: [200],
          allowAdditionalFields: false,
        },
      },
    });
    assert.equal(result.status, "PASS", result.description);
    const noExtra = findAssertion(result.assertions, "noUnexpectedFields");
    assert.ok(noExtra, "expected a noUnexpectedFields assertion");
    assert.equal(noExtra.result, "PASS");
    assert.match(noExtra.statement, /\$\$outputs\.noUnexpectedFields == true/);
    assert.equal(result.outputs.noUnexpectedFields, true);
  });

  it("allowAdditionalFields:false with expected body subset present -> noUnexpectedFields PASS", async () => {
    // The server returns {status, name, items}. Expecting that exact superset
    // as the body means no unexpected fields relative to it -> PASS.
    const result = await httpRequest({
      config,
      step: {
        httpRequest: {
          url: `http://localhost:${serverPort}/200`,
          method: "get",
          statusCodes: [200],
          allowAdditionalFields: false,
          response: { body: { status: 200, name: "John", items: [1, 2] } },
        },
      },
    });
    assert.equal(result.status, "PASS", result.description);
    const noExtra = findAssertion(result.assertions, "noUnexpectedFields");
    assert.ok(noExtra, "expected a noUnexpectedFields assertion");
    assert.equal(noExtra.result, "PASS");
    assert.equal(result.outputs.noUnexpectedFields, true);
  });

  it("required-fields check: present -> PASS", async () => {
    const result = await httpRequest({
      config,
      step: {
        httpRequest: {
          url: `http://localhost:${serverPort}/200`,
          method: "get",
          statusCodes: [200],
          response: { required: ["name", "items"] },
        },
      },
    });
    assert.equal(result.status, "PASS", result.description);
    const req = findAssertion(result.assertions, "requiredFieldsPresent");
    assert.ok(req, "expected a required-fields assertion");
    assert.equal(req.result, "PASS");
    assert.match(req.statement, /\$\$outputs\.requiredFieldsPresent == true/);
    assert.equal(result.outputs.requiredFieldsPresent, true);
  });

  it("status PASS but body type mismatch FAILs, with no leaked status", async () => {
    const result = await httpRequest({
      config,
      step: {
        httpRequest: {
          url: `http://localhost:${serverPort}/200`,
          method: "get",
          statusCodes: [200],
          response: { body: "a string but actual is object" },
        },
      },
    });
    assert.equal(result.status, "FAIL");
    const sc = findAssertion(result.assertions, "statusCode");
    assert.equal(sc.result, "PASS");
    const body = findAssertion(result.assertions, "bodyMatches");
    assert.ok(body, "expected a bodyMatches assertion");
    assert.equal(body.result, "FAIL");
    assert.match(body.statement, /\$\$outputs\.bodyMatches == true/);
    assert.equal(result.outputs.bodyMatches, false);
  });

  it("short-circuits: a FAIL early leaves later applicable checks SKIPPED", async () => {
    // status FAILs (404 not in [200]); a body check is applicable but not reached.
    const result = await httpRequest({
      config,
      step: {
        httpRequest: {
          url: `http://localhost:${serverPort}/404`,
          method: "get",
          statusCodes: [200],
          response: { body: { name: "John" } },
        },
      },
    });
    assert.equal(result.status, "FAIL");
    const sc = findAssertion(result.assertions, "statusCode");
    assert.equal(sc.result, "FAIL");
    const body = findAssertion(result.assertions, "bodyMatches");
    assert.ok(body, "applicable-but-not-reached body assertion must be present");
    assert.equal(body.result, "SKIPPED");
    assert.equal(body.source, "implicit");
  });

  it("file-variation exceeded -> WARNING record and WARNING status", async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "httpreq-"));
    const filePath = path.join(tmpDir, "out.json");
    fs.writeFileSync(filePath, "totally different prior content");
    try {
      const result = await httpRequest({
        config,
        step: {
          httpRequest: {
            url: `http://localhost:${serverPort}/200`,
            method: "get",
            statusCodes: [200],
            path: filePath,
            maxVariation: 0.01,
            overwrite: "aboveVariation",
          },
        },
      });
      assert.equal(result.status, "WARNING", result.description);
      const v = findAssertion(result.assertions, "outputs.variation");
      assert.ok(v, "expected a saved-file variation assertion");
      assert.equal(v.result, "WARNING");
      assert.match(v.statement, /\$\$outputs\.variation <=/);
      assert.equal(typeof result.outputs.variation, "number");
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it("total network failure (no response) -> FAIL with no assertion records", async () => {
    const result = await httpRequest({
      config,
      step: {
        httpRequest: {
          url: "http://this-domain-does-not-exist-12345.invalid",
          method: "get",
          statusCodes: [200],
        },
      },
    });
    assert.equal(result.status, "FAIL");
    assert.ok(
      result.assertions === undefined || result.assertions.length === 0,
      "execution errors must not produce assertion records"
    );
  });

  it("returns FAIL with no assertions on an invalid step (input guard)", async () => {
    const result = await httpRequest({
      config,
      step: { httpRequest: { method: 12345 } },
    });
    assert.equal(result.status, "FAIL");
    assert.ok(
      result.assertions === undefined || result.assertions.length === 0,
      "input-guard failures must not produce assertion records"
    );
  });

  // ---------------------------------------------------------------------------
  // Phase 4a.2a SANCTIONED behavior change: a passing STRING `response.body` used
  // to `return result` early, short-circuiting the response.headers check and the
  // `path` file save. That early return was removed so a matching string body no
  // longer hides a configured headers/path. These three lock that new behavior.
  // ---------------------------------------------------------------------------

  it("string response.body MATCH alone still PASSes (baseline)", async () => {
    const result = await httpRequest({
      config,
      step: {
        httpRequest: {
          url: `http://localhost:${serverPort}/text`,
          method: "get",
          statusCodes: [200],
          response: { body: "plain-text-body" },
        },
      },
    });
    assert.equal(result.status, "PASS", result.description);
    const body = findAssertion(result.assertions, "bodyMatches");
    assert.ok(body, "expected a bodyMatches assertion");
    assert.equal(body.result, "PASS");
    assert.equal(result.outputs.bodyMatches, true);
  });

  it("string response.body MATCH + headers MISMATCH -> FAIL (headers now evaluated, not short-circuited)", async () => {
    const result = await httpRequest({
      config,
      step: {
        httpRequest: {
          url: `http://localhost:${serverPort}/text`,
          method: "get",
          statusCodes: [200],
          response: {
            body: "plain-text-body", // matches
            headers: { "x-test-header": "WRONG-value" }, // does not match real-value
          },
        },
      },
    });
    // Old behavior: PASS (headers check skipped after the body matched).
    // New behavior: FAIL (the headers check now runs).
    assert.equal(result.status, "FAIL", result.description);
    const body = findAssertion(result.assertions, "bodyMatches");
    assert.ok(body, "expected a bodyMatches assertion");
    assert.equal(body.result, "PASS", "the string body itself still matches");
    const headers = findAssertion(result.assertions, "headersMatch");
    assert.ok(headers, "headers assertion must be evaluated, not skipped");
    assert.equal(headers.result, "FAIL");
    assert.equal(result.outputs.headersMatch, false);
  });

  it("string response.body MATCH + path set -> file IS written (save no longer short-circuited)", async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "httpreq-strbody-"));
    const filePath = path.join(tmpDir, "out.json");
    try {
      const result = await httpRequest({
        config,
        step: {
          httpRequest: {
            url: `http://localhost:${serverPort}/text`,
            method: "get",
            statusCodes: [200],
            response: { body: "plain-text-body" }, // matches
            path: filePath,
          },
        },
      });
      assert.equal(result.status, "PASS", result.description);
      const body = findAssertion(result.assertions, "bodyMatches");
      assert.equal(body.result, "PASS");
      // The save side effect must run even though the string body already
      // matched (the old early return skipped it entirely).
      assert.ok(
        fs.existsSync(filePath),
        "string-body match must NOT short-circuit the `path` file save"
      );
      assert.equal(
        fs.readFileSync(filePath, "utf8"),
        JSON.stringify("plain-text-body", null, 2),
        "the saved file must contain the response body"
      );
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });
});
