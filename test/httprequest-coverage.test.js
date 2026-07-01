// Unit-coverage tests for src/core/tests/httpRequest.ts (imported from the
// compiled dist/core/tests/httpRequest.js). These exercise the request-building,
// response-assertion, response-body/header/schema matching, file-save, and
// OpenAPI code paths — plus the pure helpers `fieldExistsAtPath`,
// `arrayExistsInArray`, and `objectExistsInObject` (reached through the public
// `httpRequest` entrypoint).
//
// Hermetic + deterministic: axios is NOT allowed to touch the network. The
// module calls the axios default callable directly (`axios(request)`), so we
// intercept every request by swapping `axios.defaults.adapter` for a stub that
// returns (or throws) a canned response. The stub is installed per-test and the
// original adapter is restored in afterEach. Any files live under an OS temp dir
// that is removed in afterEach, and env vars are saved/restored (never blindly
// deleted).
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import axios from "axios";
import { httpRequest } from "../dist/core/tests/httpRequest.js";

const config = { logLevel: "silent" };

// Unified model: implicit assertions carry a $$ runtime-expression statement.
// Match on a substring of the statement to find a specific check.
function findAssertion(assertions, token) {
  return (assertions || []).find((a) => a.statement.includes(token));
}

describe("httpRequest coverage (stubbed axios)", function () {
  this.timeout(30000);

  let originalAdapter;
  let lastRequestConfig;
  let tmpDirs;
  let savedEnv;

  beforeEach(function () {
    originalAdapter = axios.defaults.adapter;
    lastRequestConfig = undefined;
    tmpDirs = [];
    savedEnv = {};
  });

  afterEach(function () {
    // Restore the axios adapter (all interception is via the adapter swap).
    axios.defaults.adapter = originalAdapter;
    // Clean up temp dirs.
    for (const dir of tmpDirs) {
      fs.rmSync(dir, { recursive: true, force: true });
    }
    tmpDirs = [];
    // Restore env vars.
    for (const [key, value] of Object.entries(savedEnv)) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
    savedEnv = {};
  });

  // Install an adapter that captures the outgoing request config and returns a
  // canned axios-style response.
  function stubResponse({ status = 200, statusText = "OK", headers = {}, data } = {}) {
    axios.defaults.adapter = async (reqConfig) => {
      lastRequestConfig = reqConfig;
      return { data, status, statusText, headers, config: reqConfig, request: {} };
    };
  }

  // Install an adapter that throws an axios-style error. If `response` is
  // provided, the error carries it (4xx/5xx that came back); otherwise it is a
  // total network failure (no response object).
  function stubError({ response } = {}) {
    axios.defaults.adapter = async (reqConfig) => {
      lastRequestConfig = reqConfig;
      const err = new Error("stubbed network error");
      if (response) {
        err.response = { ...response, config: reqConfig, request: {} };
      }
      throw err;
    };
  }

  function mkTmpDir(prefix = "httpreq-cov-") {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
    tmpDirs.push(dir);
    return dir;
  }

  function setEnv(key, value) {
    // Own-property check so an unusual env name (e.g. one shadowing a prototype
    // key) is still saved exactly once.
    if (!Object.prototype.hasOwnProperty.call(savedEnv, key)) {
      savedEnv[key] = process.env[key];
    }
    process.env[key] = value;
  }

  // Read a header from a captured axios request config. axios v1 normalizes
  // request headers into an AxiosHeaders instance (case-insensitive .get());
  // fall back to plain-object access for a bare object.
  function reqHeader(reqConfig, name) {
    const h = reqConfig?.headers;
    if (h && typeof h.get === "function") return h.get(name);
    if (!h) return undefined;
    // Case-insensitive plain-object lookup.
    const hit = Object.keys(h).find((k) => k.toLowerCase() === name.toLowerCase());
    return hit === undefined ? undefined : h[hit];
  }

  // ---------------------------------------------------------------------------
  // Request building
  // ---------------------------------------------------------------------------
  describe("request building", function () {
    it("adds https:// to a bare host supplied via env var", async function () {
      setEnv("HR_BARE_HOST", "api.example.com/thing");
      stubResponse({ status: 200, data: { ok: true } });
      const result = await httpRequest({
        config,
        step: { httpRequest: { url: "$HR_BARE_HOST", method: "get", statusCodes: [200] } },
      });
      assert.equal(result.status, "PASS", result.description);
      assert.equal(lastRequestConfig.url, "https://api.example.com/thing");
    });

    it("passes method, headers (object), params, body, and timeout through to axios", async function () {
      stubResponse({ status: 200, data: { ok: true } });
      const result = await httpRequest({
        config,
        step: {
          httpRequest: {
            url: "http://api.example.com/",
            method: "post",
            statusCodes: [200],
            timeout: 1234,
            request: {
              headers: { "X-Custom": "abc" },
              parameters: { q: "search" },
              body: { field: "value" },
            },
          },
        },
      });
      assert.equal(result.status, "PASS", result.description);
      assert.equal(lastRequestConfig.method, "post");
      assert.equal(lastRequestConfig.timeout, 1234);
      // axios wraps headers in an AxiosHeaders instance and adds defaults, so
      // assert our custom header is present rather than requiring exact equality.
      assert.equal(reqHeader(lastRequestConfig, "X-Custom"), "abc");
      assert.deepEqual(lastRequestConfig.params, { q: "search" });
      // axios serializes an object JSON body to a string before the adapter runs.
      assert.equal(lastRequestConfig.data, JSON.stringify({ field: "value" }));
    });

    it("parses a string headers block into an object", async function () {
      stubResponse({ status: 200, data: { ok: true } });
      const result = await httpRequest({
        config,
        step: {
          httpRequest: {
            url: "http://api.example.com/",
            method: "get",
            statusCodes: [200],
            request: {
              headers: "Content-Type: application/json\nAuthorization: Bearer token\nbad-line-without-colon",
            },
          },
        },
      });
      assert.equal(result.status, "PASS", result.description);
      // The string headers block was parsed into an object; axios re-wraps it in
      // AxiosHeaders, so assert the parsed pairs are present (case-insensitive
      // header lookup) rather than requiring exact object equality.
      assert.equal(reqHeader(lastRequestConfig, "Content-Type"), "application/json");
      assert.equal(reqHeader(lastRequestConfig, "Authorization"), "Bearer token");
      // The colon-less line was dropped by the parser.
      assert.ok(reqHeader(lastRequestConfig, "bad-line-without-colon") === undefined);
    });

    it("keeps colons in string-header values (splits on the first colon only)", async function () {
      stubResponse({ status: 200, data: { ok: true } });
      const result = await httpRequest({
        config,
        step: {
          httpRequest: {
            url: "http://api.example.com/",
            method: "get",
            statusCodes: [200],
            request: {
              // A value that itself contains colons (a URL) plus a normal value.
              headers: "X-Callback: https://example.com/cb\nAuthorization: Bearer t",
            },
          },
        },
      });
      assert.equal(result.status, "PASS", result.description);
      // The full URL survives; splitting on every colon would truncate it to "https".
      assert.equal(reqHeader(lastRequestConfig, "X-Callback"), "https://example.com/cb");
      assert.equal(reqHeader(lastRequestConfig, "Authorization"), "Bearer t");
    });

    it("parses a stringified-JSON request body into an object", async function () {
      stubResponse({ status: 200, data: { ok: true } });
      const result = await httpRequest({
        config,
        step: {
          httpRequest: {
            url: "http://api.example.com/",
            method: "post",
            statusCodes: [200],
            request: { body: '{"a": 1, "b": [2, 3]}' },
          },
        },
      });
      assert.equal(result.status, "PASS", result.description);
      // The module parsed the JSON string into an object; axios then re-serializes
      // it, so the adapter sees the compact JSON form of that object.
      assert.equal(lastRequestConfig.data, JSON.stringify({ a: 1, b: [2, 3] }));
    });

    it("leaves an unparseable JSON-looking body as a string", async function () {
      stubResponse({ status: 200, data: { ok: true } });
      const result = await httpRequest({
        config,
        step: {
          httpRequest: {
            url: "http://api.example.com/",
            method: "post",
            statusCodes: [200],
            request: { body: '{not valid json' },
          },
        },
      });
      // Still PASSes (status matched); the malformed body stayed a string (the
      // JSON.parse failed and the module continued with the raw string, so axios
      // sends it verbatim rather than a serialized object).
      assert.equal(result.status, "PASS", result.description);
      assert.equal(lastRequestConfig.data, "{not valid json");
    });

    it("replaces $VAR env references in request fields", async function () {
      setEnv("HR_TOKEN", "secret-123");
      stubResponse({ status: 200, data: { ok: true } });
      const result = await httpRequest({
        config,
        step: {
          httpRequest: {
            url: "http://api.example.com/",
            method: "get",
            statusCodes: [200],
            request: { headers: { Authorization: "Bearer $HR_TOKEN" } },
          },
        },
      });
      assert.equal(result.status, "PASS", result.description);
      assert.equal(reqHeader(lastRequestConfig, "Authorization"), "Bearer secret-123");
    });

    it("defaults method to get and statusCodes to [200,201] when omitted", async function () {
      stubResponse({ status: 201, data: { ok: true } });
      const result = await httpRequest({
        config,
        step: { httpRequest: { url: "http://api.example.com/" } },
      });
      assert.equal(result.status, "PASS", result.description);
      assert.equal(lastRequestConfig.method, "get");
    });

    it("accepts the string shorthand form of httpRequest (URL string)", async function () {
      stubResponse({ status: 200, data: { ok: true } });
      const result = await httpRequest({
        config,
        step: { httpRequest: "http://api.example.com/thing" },
      });
      // String shorthand -> { url }, method defaults to get, statusCodes [200,201].
      assert.equal(result.status, "PASS", result.description);
      assert.equal(lastRequestConfig.url, "http://api.example.com/thing");
      assert.equal(lastRequestConfig.method, "get");
    });
  });

  // ---------------------------------------------------------------------------
  // Status-code assertions
  // ---------------------------------------------------------------------------
  describe("status code assertions", function () {
    it("FAILs when the returned status is not in statusCodes", async function () {
      stubResponse({ status: 418, data: {} });
      const result = await httpRequest({
        config,
        step: { httpRequest: { url: "http://api.example.com/", method: "get", statusCodes: [200] } },
      });
      assert.equal(result.status, "FAIL");
      assert.match(result.description, /Returned 418\. Expected one of \[200\]/);
      const sc = findAssertion(result.assertions, "statusCode");
      assert.equal(sc.result, "FAIL");
    });

    it("PASSes for a 4xx code that came back via an axios error response", async function () {
      stubError({ response: { status: 404, statusText: "Not Found", headers: {}, data: { err: "nope" } } });
      const result = await httpRequest({
        config,
        step: { httpRequest: { url: "http://api.example.com/", method: "get", statusCodes: [404] } },
      });
      assert.equal(result.status, "PASS", result.description);
      assert.equal(result.outputs.response.statusCode, 404);
      assert.deepEqual(result.outputs.response.body, { err: "nope" });
    });
  });

  // ---------------------------------------------------------------------------
  // Response body matching
  // ---------------------------------------------------------------------------
  describe("response body matching", function () {
    it("PASSes an exact object match", async function () {
      stubResponse({ status: 200, data: { a: 1, b: "two", c: true } });
      const result = await httpRequest({
        config,
        step: {
          httpRequest: {
            url: "http://api.example.com/",
            method: "get",
            statusCodes: [200],
            response: { body: { a: 1, b: "two", c: true } },
          },
        },
      });
      assert.equal(result.status, "PASS", result.description);
      assert.equal(result.outputs.bodyMatches, true);
    });

    it("PASSes a partial object subset (objectExistsInObject)", async function () {
      stubResponse({ status: 200, data: { a: 1, b: 2, extra: "ignored" } });
      const result = await httpRequest({
        config,
        step: {
          httpRequest: {
            url: "http://api.example.com/",
            method: "get",
            statusCodes: [200],
            response: { body: { a: 1 } },
          },
        },
      });
      assert.equal(result.status, "PASS", result.description);
      assert.equal(result.outputs.bodyMatches, true);
    });

    it("FAILs a value mismatch with a descriptive message", async function () {
      stubResponse({ status: 200, data: { a: 1 } });
      const result = await httpRequest({
        config,
        step: {
          httpRequest: {
            url: "http://api.example.com/",
            method: "get",
            statusCodes: [200],
            response: { body: { a: 999 } },
          },
        },
      });
      assert.equal(result.status, "FAIL");
      assert.equal(result.outputs.bodyMatches, false);
      assert.match(result.description, /didn't match the expected value/);
    });

    it("FAILs when an expected key is missing from the response", async function () {
      stubResponse({ status: 200, data: { a: 1 } });
      const result = await httpRequest({
        config,
        step: {
          httpRequest: {
            url: "http://api.example.com/",
            method: "get",
            statusCodes: [200],
            response: { body: { missing: "x" } },
          },
        },
      });
      assert.equal(result.status, "FAIL");
      assert.match(result.description, /didn't exist in returned JSON/);
    });

    it("matches nested objects recursively", async function () {
      stubResponse({ status: 200, data: { user: { name: "Jo", role: "admin" }, other: 1 } });
      const result = await httpRequest({
        config,
        step: {
          httpRequest: {
            url: "http://api.example.com/",
            method: "get",
            statusCodes: [200],
            response: { body: { user: { name: "Jo" } } },
          },
        },
      });
      assert.equal(result.status, "PASS", result.description);
      assert.equal(result.outputs.bodyMatches, true);
    });

    it("matches array subsets, primitives, and nested arrays (arrayExistsInArray)", async function () {
      stubResponse({
        status: 200,
        data: { items: [1, 2, 3], objs: [{ id: 1 }, { id: 2 }], nested: [[10, 20], [30, 40]] },
      });
      const result = await httpRequest({
        config,
        step: {
          httpRequest: {
            url: "http://api.example.com/",
            method: "get",
            statusCodes: [200],
            response: {
              body: {
                items: [1, 3],
                objs: [{ id: 2 }],
                nested: [[10, 20]],
              },
            },
          },
        },
      });
      assert.equal(result.status, "PASS", result.description);
      assert.equal(result.outputs.bodyMatches, true);
    });

    it("matches objects nested inside arrays inside arrays", async function () {
      stubResponse({ status: 200, data: { matrix: [[{ x: 1 }, { y: 2 }], [[9], 8]] } });
      const result = await httpRequest({
        config,
        step: {
          httpRequest: {
            url: "http://api.example.com/",
            method: "get",
            statusCodes: [200],
            response: { body: { matrix: [[{ x: 1 }]] } },
          },
        },
      });
      assert.equal(result.status, "PASS", result.description);
      assert.equal(result.outputs.bodyMatches, true);
    });

    it("matches arrays nested inside arrays inside arrays", async function () {
      stubResponse({ status: 200, data: { grid: [[[1, 2]], [3, 4]] } });
      const result = await httpRequest({
        config,
        step: {
          httpRequest: {
            url: "http://api.example.com/",
            method: "get",
            statusCodes: [200],
            response: { body: { grid: [[[1, 2]]] } },
          },
        },
      });
      assert.equal(result.status, "PASS", result.description);
      assert.equal(result.outputs.bodyMatches, true);
    });

    it("FAILs and reports a nested-array value mismatch inside an object", async function () {
      // Drives objectExistsInObject -> arrayExistsInArray, whose FAIL description
      // is concatenated back into the object comparison result.
      stubResponse({ status: 200, data: { tags: ["a", "b"] } });
      const result = await httpRequest({
        config,
        step: {
          httpRequest: {
            url: "http://api.example.com/",
            method: "get",
            statusCodes: [200],
            response: { body: { tags: ["missing-tag"] } },
          },
        },
      });
      assert.equal(result.status, "FAIL");
      assert.equal(result.outputs.bodyMatches, false);
      assert.match(result.description, /isn't present in expected array/);
    });

    it("FAILs and propagates a nested-object value mismatch description", async function () {
      // Drives objectExistsInObject recursion whose FAIL description bubbles up
      // through the parent object comparison.
      stubResponse({ status: 200, data: { user: { profile: { age: 30 } } } });
      const result = await httpRequest({
        config,
        step: {
          httpRequest: {
            url: "http://api.example.com/",
            method: "get",
            statusCodes: [200],
            response: { body: { user: { profile: { age: 99 } } } },
          },
        },
      });
      assert.equal(result.status, "FAIL");
      assert.equal(result.outputs.bodyMatches, false);
      assert.match(result.description, /didn't match the expected value/);
    });

    it("FAILs when a primitive value is absent from an expected array", async function () {
      stubResponse({ status: 200, data: { items: [1, 2, 3] } });
      const result = await httpRequest({
        config,
        step: {
          httpRequest: {
            url: "http://api.example.com/",
            method: "get",
            statusCodes: [200],
            response: { body: { items: [99] } },
          },
        },
      });
      assert.equal(result.status, "FAIL");
      assert.equal(result.outputs.bodyMatches, false);
      assert.match(result.description, /isn't present in expected array/);
    });

    it("FAILs when an expected object is absent from an actual array", async function () {
      stubResponse({ status: 200, data: { objs: [{ id: 1 }] } });
      const result = await httpRequest({
        config,
        step: {
          httpRequest: {
            url: "http://api.example.com/",
            method: "get",
            statusCodes: [200],
            response: { body: { objs: [{ id: 42 }] } },
          },
        },
      });
      assert.equal(result.status, "FAIL");
      assert.equal(result.outputs.bodyMatches, false);
    });

    it("FAILs when an expected nested array is absent from an actual array", async function () {
      stubResponse({ status: 200, data: { nested: [[1, 2]] } });
      const result = await httpRequest({
        config,
        step: {
          httpRequest: {
            url: "http://api.example.com/",
            method: "get",
            statusCodes: [200],
            response: { body: { nested: [[7, 8, 9]] } },
          },
        },
      });
      assert.equal(result.status, "FAIL");
      assert.equal(result.outputs.bodyMatches, false);
    });

    it("PASSes a matching array response body (top-level array)", async function () {
      stubResponse({ status: 200, data: [1, 2, 3] });
      const result = await httpRequest({
        config,
        step: {
          httpRequest: {
            url: "http://api.example.com/",
            method: "get",
            statusCodes: [200],
            response: { body: [1, 2] },
          },
        },
      });
      // Top-level array expected vs actual array: typeof both "object",
      // Array.isArray equal -> falls into objectExistsInObject over indices.
      assert.equal(result.status, "PASS", result.description);
      assert.equal(result.outputs.bodyMatches, true);
    });

    it("PASSes when a string response body matches exactly", async function () {
      stubResponse({ status: 200, data: "plain-text-body", headers: {} });
      const result = await httpRequest({
        config,
        step: {
          httpRequest: {
            url: "http://api.example.com/",
            method: "get",
            statusCodes: [200],
            response: { body: "plain-text-body" },
          },
        },
      });
      assert.equal(result.status, "PASS", result.description);
      assert.equal(result.outputs.bodyMatches, true);
    });

    it("FAILs when a string response body does not match", async function () {
      stubResponse({ status: 200, data: "actual-text", headers: {} });
      const result = await httpRequest({
        config,
        step: {
          httpRequest: {
            url: "http://api.example.com/",
            method: "get",
            statusCodes: [200],
            response: { body: "expected-text" },
          },
        },
      });
      assert.equal(result.status, "FAIL");
      assert.equal(result.outputs.bodyMatches, false);
      assert.match(result.description, /Expected response body didn't match actual response body/);
    });

    it("FAILs a body type mismatch: expected array but got object", async function () {
      stubResponse({ status: 200, data: { a: 1 } });
      const result = await httpRequest({
        config,
        step: {
          httpRequest: {
            url: "http://api.example.com/",
            method: "get",
            statusCodes: [200],
            response: { body: [1, 2] },
          },
        },
      });
      assert.equal(result.status, "FAIL");
      assert.equal(result.outputs.bodyMatches, false);
      assert.match(result.description, /response body type didn't match/);
    });
  });

  // ---------------------------------------------------------------------------
  // Required-field checks (fieldExistsAtPath)
  // ---------------------------------------------------------------------------
  describe("required response fields (fieldExistsAtPath)", function () {
    it("PASSes when dot- and bracket-notation paths all resolve", async function () {
      stubResponse({
        status: 200,
        data: { user: { profile: { name: "Jo" } }, items: [{ id: 5 }] },
      });
      const result = await httpRequest({
        config,
        step: {
          httpRequest: {
            url: "http://api.example.com/",
            method: "get",
            statusCodes: [200],
            response: { required: ["user.profile.name", "items[0].id"] },
          },
        },
      });
      assert.equal(result.status, "PASS", result.description);
      assert.equal(result.outputs.requiredFieldsPresent, true);
    });

    it("FAILs and lists missing required fields (missing property, bad index, non-object)", async function () {
      stubResponse({ status: 200, data: { user: { name: "Jo" }, items: [] } });
      const result = await httpRequest({
        config,
        step: {
          httpRequest: {
            url: "http://api.example.com/",
            method: "get",
            statusCodes: [200],
            response: { required: ["user.age", "items[3].id", "user.name.deep"] },
          },
        },
      });
      assert.equal(result.status, "FAIL");
      assert.equal(result.outputs.requiredFieldsPresent, false);
      assert.match(result.description, /Missing required fields/);
      assert.match(result.description, /user\.age/);
      assert.match(result.description, /items\[3\]\.id/);
    });

    it("treats a path with no parseable segments as missing", async function () {
      stubResponse({ status: 200, data: { a: 1 } });
      const result = await httpRequest({
        config,
        step: {
          httpRequest: {
            url: "http://api.example.com/",
            method: "get",
            statusCodes: [200],
            // "[]" contains only separators -> no segments -> field absent.
            response: { required: ["[]"] },
          },
        },
      });
      assert.equal(result.status, "FAIL");
      assert.equal(result.outputs.requiredFieldsPresent, false);
    });

    it("treats a null field value as present (uses `in`, not truthiness)", async function () {
      stubResponse({ status: 200, data: { maybe: null } });
      const result = await httpRequest({
        config,
        step: {
          httpRequest: {
            url: "http://api.example.com/",
            method: "get",
            statusCodes: [200],
            response: { required: ["maybe"] },
          },
        },
      });
      assert.equal(result.status, "PASS", result.description);
      assert.equal(result.outputs.requiredFieldsPresent, true);
    });
  });

  // ---------------------------------------------------------------------------
  // Response headers
  // ---------------------------------------------------------------------------
  describe("response header assertions", function () {
    it("PASSes when expected headers are a present subset (case-insensitive)", async function () {
      stubResponse({
        status: 200,
        data: { ok: true },
        headers: { "Content-Type": "application/json", "X-Extra": "z" },
      });
      const result = await httpRequest({
        config,
        step: {
          httpRequest: {
            url: "http://api.example.com/",
            method: "get",
            statusCodes: [200],
            response: { headers: { "content-type": "application/json" } },
          },
        },
      });
      assert.equal(result.status, "PASS", result.description);
      assert.equal(result.outputs.headersMatch, true);
    });

    it("FAILs when an expected header value mismatches", async function () {
      stubResponse({
        status: 200,
        data: { ok: true },
        headers: { "x-token": "real" },
      });
      const result = await httpRequest({
        config,
        step: {
          httpRequest: {
            url: "http://api.example.com/",
            method: "get",
            statusCodes: [200],
            response: { headers: { "x-token": "expected-different" } },
          },
        },
      });
      assert.equal(result.status, "FAIL");
      assert.equal(result.outputs.headersMatch, false);
    });
  });

  // ---------------------------------------------------------------------------
  // allowAdditionalFields
  // ---------------------------------------------------------------------------
  describe("allowAdditionalFields", function () {
    it("FAILs when an expected field's value does not match (drives noUnexpectedFields false)", async function () {
      // NOTE: this is a VALUE mismatch (expected unexpected:3, actual :2), not an
      // extra-field case — the object subset comparison FAILs, which drives
      // noUnexpectedFields false. The genuine extra-field behavior is covered by
      // the #437 test below.
      stubResponse({ status: 200, data: { a: 1, unexpected: 2 } });
      const result = await httpRequest({
        config,
        step: {
          httpRequest: {
            url: "http://api.example.com/",
            method: "get",
            statusCodes: [200],
            allowAdditionalFields: false,
            response: { body: { a: 1, unexpected: 3 } },
          },
        },
      });
      assert.equal(result.status, "FAIL");
      assert.equal(result.outputs.noUnexpectedFields, false);
    });

    it("[bug #437] does not yet reject a response with fields beyond the expected body", async function () {
      // Expected { a: 1 }, actual { a: 1, extra: 99 } — every expected value
      // matches but the response has an EXTRA field. allowAdditionalFields:false
      // SHOULD FAIL ("Response contained unexpected fields"), but the source uses
      // a subset check (objectExistsInObject(expected, actual)) that ignores
      // extras, so noUnexpectedFields stays true and the step PASSes. Documents
      // current behavior; flip to expect FAIL once #437 is fixed.
      stubResponse({ status: 200, data: { a: 1, extra: 99 } });
      const result = await httpRequest({
        config,
        step: {
          httpRequest: {
            url: "http://api.example.com/",
            method: "get",
            statusCodes: [200],
            allowAdditionalFields: false,
            response: { body: { a: 1 } },
          },
        },
      });
      // TODO(bug #437): should be FAIL / noUnexpectedFields === false.
      assert.equal(result.status, "PASS", result.description);
      assert.equal(result.outputs.noUnexpectedFields, true);
    });

    it("PASSes noUnexpectedFields when the expected body is a non-object (string)", async function () {
      // A non-object expected body can't have "unexpected fields" relative to it,
      // so the check short-circuits to true without calling the object comparison.
      stubResponse({ status: 200, data: "hello" });
      const result = await httpRequest({
        config,
        step: {
          httpRequest: {
            url: "http://api.example.com/",
            method: "get",
            statusCodes: [200],
            allowAdditionalFields: false,
            response: { body: "hello" },
          },
        },
      });
      assert.equal(result.status, "PASS", result.description);
      assert.equal(result.outputs.noUnexpectedFields, true);
    });

    it("PASSes noUnexpectedFields when the expected body is a superset match", async function () {
      stubResponse({ status: 200, data: { a: 1, b: 2 } });
      const result = await httpRequest({
        config,
        step: {
          httpRequest: {
            url: "http://api.example.com/",
            method: "get",
            statusCodes: [200],
            allowAdditionalFields: false,
            response: { body: { a: 1, b: 2 } },
          },
        },
      });
      assert.equal(result.status, "PASS", result.description);
      assert.equal(result.outputs.noUnexpectedFields, true);
    });
  });

  // ---------------------------------------------------------------------------
  // File save / variation
  // ---------------------------------------------------------------------------
  describe("saved-file output", function () {
    it("writes the response to a new file (creating parent dirs)", async function () {
      stubResponse({ status: 200, data: { saved: true } });
      const dir = mkTmpDir();
      const filePath = path.join(dir, "nested", "deep", "out.json");
      const result = await httpRequest({
        config,
        step: {
          httpRequest: {
            url: "http://api.example.com/",
            method: "get",
            statusCodes: [200],
            path: filePath,
          },
        },
      });
      assert.equal(result.status, "PASS", result.description);
      assert.ok(fs.existsSync(filePath));
      assert.equal(
        fs.readFileSync(filePath, "utf8"),
        JSON.stringify({ saved: true }, null, 2)
      );
      assert.match(result.description, /Saved output to file/);
    });

    it("PASSes with a variation assertion when the existing file is within tolerance", async function () {
      stubResponse({ status: 200, data: { same: 1 } });
      const dir = mkTmpDir();
      const filePath = path.join(dir, "out.json");
      // Pre-write identical content so fractionalDiff is 0.
      fs.writeFileSync(filePath, JSON.stringify({ same: 1 }, null, 2));
      const result = await httpRequest({
        config,
        step: {
          httpRequest: {
            url: "http://api.example.com/",
            method: "get",
            statusCodes: [200],
            path: filePath,
            maxVariation: 0,
          },
        },
      });
      assert.equal(result.status, "PASS", result.description);
      const v = findAssertion(result.assertions, "outputs.variation");
      assert.ok(v, "expected a variation assertion");
      assert.equal(v.result, "PASS");
      assert.equal(result.outputs.variation, 0);
    });

    it("emits a WARNING when variation exceeds maxVariation and overwrites the file", async function () {
      stubResponse({ status: 200, data: { totally: "different" } });
      const dir = mkTmpDir();
      const filePath = path.join(dir, "out.json");
      fs.writeFileSync(filePath, "prior unrelated content");
      const result = await httpRequest({
        config,
        step: {
          httpRequest: {
            url: "http://api.example.com/",
            method: "get",
            statusCodes: [200],
            path: filePath,
            maxVariation: 0.01,
            overwrite: "aboveVariation",
          },
        },
      });
      assert.equal(result.status, "WARNING", result.description);
      assert.equal(typeof result.outputs.variation, "number");
      // aboveVariation overwrite: file now holds the new response.
      assert.equal(
        fs.readFileSync(filePath, "utf8"),
        JSON.stringify({ totally: "different" }, null, 2)
      );
      assert.match(result.description, /greater than the max accepted variation/);
    });

    it("does not overwrite an existing file when overwrite is 'false'", async function () {
      stubResponse({ status: 200, data: { new: "data" } });
      const dir = mkTmpDir();
      const filePath = path.join(dir, "out.json");
      fs.writeFileSync(filePath, "keep me");
      const result = await httpRequest({
        config,
        step: {
          httpRequest: {
            url: "http://api.example.com/",
            method: "get",
            statusCodes: [200],
            path: filePath,
            maxVariation: 0,
            overwrite: "false",
          },
        },
      });
      // Variation is high -> WARNING, but the file must be preserved.
      assert.equal(result.status, "WARNING", result.description);
      assert.equal(fs.readFileSync(filePath, "utf8"), "keep me");
      assert.match(result.description, /Didn't save output. File already exists/);
    });

    it("overwrites within-tolerance content when overwrite is 'true'", async function () {
      stubResponse({ status: 200, data: { v: 1 } });
      const dir = mkTmpDir();
      const filePath = path.join(dir, "out.json");
      fs.writeFileSync(filePath, JSON.stringify({ v: 1 }, null, 2));
      const result = await httpRequest({
        config,
        step: {
          httpRequest: {
            url: "http://api.example.com/",
            method: "get",
            statusCodes: [200],
            path: filePath,
            maxVariation: 0,
            overwrite: "true",
          },
        },
      });
      assert.equal(result.status, "PASS", result.description);
      assert.match(result.description, /Saved response to file/);
    });
  });

  // ---------------------------------------------------------------------------
  // Error / execution-failure paths
  // ---------------------------------------------------------------------------
  describe("error paths", function () {
    it("FAILs with no assertion records on a total network failure (no response)", async function () {
      stubError({}); // no `response` -> no status came back
      const result = await httpRequest({
        config,
        step: { httpRequest: { url: "http://api.example.com/", method: "get", statusCodes: [200] } },
      });
      assert.equal(result.status, "FAIL");
      assert.match(result.description, /no response received/);
      assert.ok(
        result.assertions === undefined || result.assertions.length === 0,
        "execution errors must not produce assertion records"
      );
      // outputs.response.statusCode is undefined for a total failure.
      assert.equal(result.outputs.response.statusCode, undefined);
    });

    it("FAILs with no assertion records on an invalid step shape", async function () {
      const result = await httpRequest({
        config,
        step: { httpRequest: { url: "http://api.example.com/", method: 12345 } },
      });
      assert.equal(result.status, "FAIL");
      assert.match(result.description, /Invalid step definition/);
      assert.ok(result.assertions === undefined || result.assertions.length === 0);
    });
  });

  // ---------------------------------------------------------------------------
  // OpenAPI mode
  // ---------------------------------------------------------------------------
  describe("openApi mode", function () {
    // A minimal, self-contained OpenAPI definition with one operation whose
    // request and response schemas + examples drive the various branches.
    function sampleDefinition() {
      return {
        openapi: "3.0.0",
        servers: [{ url: "http://api.example.com" }],
        paths: {
          "/users": {
            post: {
              operationId: "createUser",
              requestBody: {
                content: {
                  "application/json": {
                    schema: {
                      type: "object",
                      required: ["name"],
                      properties: { name: { type: "string", example: "Jo" } },
                    },
                  },
                },
              },
              responses: {
                201: {
                  description: "Created",
                  content: {
                    "application/json": {
                      schema: {
                        type: "object",
                        required: ["id"],
                        properties: { id: { type: "integer", example: 7 } },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      };
    }

    function writeDefinition(def) {
      const dir = mkTmpDir("oapi-");
      const p = path.join(dir, "openapi.json");
      fs.writeFileSync(p, JSON.stringify(def));
      return p;
    }

    it("resolves an operation from a descriptionPath and mocks the response", async function () {
      const p = writeDefinition(sampleDefinition());
      const result = await httpRequest({
        config,
        step: {
          httpRequest: {
            openApi: {
              descriptionPath: p,
              operationId: "createUser",
              mockResponse: true,
              useExample: "both",
            },
          },
        },
      });
      assert.equal(result.status, "PASS", result.description);
      // Mocked from the response example.
      assert.deepEqual(result.outputs.response.body, { id: 7 });
      assert.equal(result.outputs.response.statusCode, 201);
    });

    it("resolves a definition by name from openApiDefinitions and sends via stubbed axios", async function () {
      stubResponse({ status: 201, data: { id: 7 }, headers: {} });
      const result = await httpRequest({
        config,
        openApiDefinitions: [{ name: "MyApi", definition: sampleDefinition() }],
        step: {
          httpRequest: {
            openApi: { name: "MyApi", operationId: "createUser", statusCode: 201 },
          },
        },
      });
      assert.equal(result.status, "PASS", result.description);
      assert.equal(lastRequestConfig.method, "post");
      assert.equal(lastRequestConfig.url, "http://api.example.com/users");
    });

    it("FAILs when the named integration is not found in openApiDefinitions", async function () {
      const result = await httpRequest({
        config,
        openApiDefinitions: [{ name: "Other", definition: sampleDefinition() }],
        step: {
          httpRequest: {
            openApi: { name: "Missing", operationId: "createUser" },
          },
        },
      });
      assert.equal(result.status, "FAIL");
      assert.match(result.description, /OpenAPI integration 'Missing' not found/);
    });

    it("resolves a definition by operationId across openApiDefinitions", async function () {
      stubResponse({ status: 201, data: { id: 7 } });
      const result = await httpRequest({
        config,
        openApiDefinitions: [{ name: "MyApi", definition: sampleDefinition() }],
        step: {
          httpRequest: {
            openApi: { operationId: "createUser", statusCode: 201 },
          },
        },
      });
      assert.equal(result.status, "PASS", result.description);
      assert.equal(lastRequestConfig.url, "http://api.example.com/users");
    });

    it("FAILs when no OpenAPI definition can be resolved", async function () {
      const result = await httpRequest({
        config,
        openApiDefinitions: [{ name: "MyApi", definition: sampleDefinition() }],
        step: {
          httpRequest: {
            openApi: { operationId: "doesNotExist" },
          },
        },
      });
      assert.equal(result.status, "FAIL");
      assert.match(result.description, /OpenAPI definition not found/);
    });

    it("FAILs when the operationId is absent from a resolved definition", async function () {
      const p = writeDefinition(sampleDefinition());
      const result = await httpRequest({
        config,
        step: {
          httpRequest: {
            openApi: { descriptionPath: p, operationId: "notHere" },
          },
        },
      });
      assert.equal(result.status, "FAIL");
      assert.match(result.description, /Couldn't find operation 'notHere'/);
    });

    it("validates the request body against the OpenAPI schema (valid -> proceeds)", async function () {
      stubResponse({ status: 201, data: { id: 7 } });
      const p = writeDefinition(sampleDefinition());
      const result = await httpRequest({
        config,
        step: {
          httpRequest: {
            openApi: {
              descriptionPath: p,
              operationId: "createUser",
              validateAgainstSchema: "request",
              statusCode: 201,
            },
            request: { body: { name: "Valid Name" } },
          },
        },
      });
      assert.equal(result.status, "PASS", result.description);
      assert.match(result.description, /Request body matched the OpenAPI schema/);
    });

    it("FAILs (execution gate) when the request body violates the OpenAPI schema", async function () {
      // Never reaches axios: request-body preflight fails.
      const p = writeDefinition(sampleDefinition());
      const result = await httpRequest({
        config,
        step: {
          httpRequest: {
            openApi: {
              descriptionPath: p,
              operationId: "createUser",
              validateAgainstSchema: "request",
              statusCode: 201,
            },
            // `name` is required by the schema; supply a wrong type.
            request: { body: { name: 123 } },
          },
        },
      });
      assert.equal(result.status, "FAIL");
      assert.match(result.description, /Request body didn't match the OpenAPI schema/);
      assert.ok(result.assertions === undefined || result.assertions.length === 0);
    });

    it("validates the response body against the OpenAPI schema (valid -> PASS)", async function () {
      stubResponse({ status: 201, data: { id: 7 } });
      const p = writeDefinition(sampleDefinition());
      const result = await httpRequest({
        config,
        step: {
          httpRequest: {
            openApi: {
              descriptionPath: p,
              operationId: "createUser",
              validateAgainstSchema: "response",
              statusCode: 201,
            },
            request: { body: { name: "Jo" } },
          },
        },
      });
      assert.equal(result.status, "PASS", result.description);
      assert.equal(result.outputs.responseSchemaValid, true);
      assert.match(result.description, /Response data matched the OpenAPI schema/);
    });

    it("FAILs the response-schema assertion when the response body is invalid", async function () {
      // id must be an integer; return a string to violate the response schema.
      stubResponse({ status: 201, data: { id: "not-an-int" } });
      const p = writeDefinition(sampleDefinition());
      const result = await httpRequest({
        config,
        step: {
          httpRequest: {
            openApi: {
              descriptionPath: p,
              operationId: "createUser",
              validateAgainstSchema: "response",
              statusCode: 201,
            },
            request: { body: { name: "Jo" } },
          },
        },
      });
      assert.equal(result.status, "FAIL");
      assert.equal(result.outputs.responseSchemaValid, false);
      assert.match(result.description, /Response data didn't match the OpenAPI schema/);
    });

    it("validates BOTH request and response schemas with validateAgainstSchema: 'both'", async function () {
      // 'both' runs the request-body preflight gate AND the response-body
      // assertion; a valid request + valid response passes both.
      stubResponse({ status: 201, data: { id: 7 } });
      const p = writeDefinition(sampleDefinition());
      const result = await httpRequest({
        config,
        step: {
          httpRequest: {
            openApi: {
              descriptionPath: p,
              operationId: "createUser",
              validateAgainstSchema: "both",
              statusCode: 201,
            },
            request: { body: { name: "Valid Name" } },
          },
        },
      });
      assert.equal(result.status, "PASS", result.description);
      assert.equal(result.outputs.responseSchemaValid, true);
      assert.match(result.description, /Request body matched the OpenAPI schema/);
      assert.match(result.description, /Response data matched the OpenAPI schema/);
    });

    it("merges openApi.headers into request headers", async function () {
      stubResponse({ status: 201, data: { id: 7 } });
      const p = writeDefinition(sampleDefinition());
      const result = await httpRequest({
        config,
        step: {
          httpRequest: {
            openApi: {
              descriptionPath: p,
              operationId: "createUser",
              statusCode: 201,
              validateAgainstSchema: "none",
              headers: { Authorization: "Bearer abc" },
            },
            request: { body: { name: "Jo" } },
          },
        },
      });
      assert.equal(result.status, "PASS", result.description);
      assert.equal(reqHeader(lastRequestConfig, "Authorization"), "Bearer abc");
    });

    it("mockResponse uses an explicit response.body over the example", async function () {
      const p = writeDefinition(sampleDefinition());
      const result = await httpRequest({
        config,
        step: {
          httpRequest: {
            openApi: {
              descriptionPath: p,
              operationId: "createUser",
              mockResponse: true,
              statusCode: 201,
              validateAgainstSchema: "none",
            },
            response: { body: { id: 99 } },
          },
        },
      });
      assert.equal(result.status, "PASS", result.description);
      assert.deepEqual(result.outputs.response.body, { id: 99 });
    });

    it("merges request AND response examples with useExample:'both'", async function () {
      // A definition whose operation carries path/query/header parameter examples
      // and a response header example, exercising both example-merge blocks.
      const def = {
        openapi: "3.0.0",
        servers: [{ url: "http://api.example.com" }],
        paths: {
          "/users/{userId}": {
            post: {
              operationId: "createUser",
              parameters: [
                { name: "userId", in: "path", schema: { type: "string" }, example: "u1" },
                { name: "q", in: "query", schema: { type: "string" }, example: "searchval" },
                { name: "X-Req", in: "header", schema: { type: "string" }, example: "hval" },
              ],
              requestBody: {
                content: {
                  "application/json": {
                    schema: { type: "object", properties: { name: { type: "string", example: "Jo" } } },
                  },
                },
              },
              responses: {
                201: {
                  description: "ok",
                  headers: { "X-Resp": { schema: { type: "string" }, example: "rhval" } },
                  content: {
                    "application/json": {
                      schema: { type: "object", properties: { id: { type: "integer", example: 7 } } },
                    },
                  },
                },
              },
            },
          },
        },
      };
      // The response example header (x-resp: rhval) becomes an expected header, so
      // the stubbed response must include it for a PASS.
      stubResponse({ status: 201, data: { id: 7 }, headers: { "x-resp": "rhval" } });
      const result = await httpRequest({
        config,
        step: {
          httpRequest: {
            openApi: {
              descriptionPath: writeDefinition(def),
              operationId: "createUser",
              useExample: "both",
              statusCode: 201,
              validateAgainstSchema: "none",
            },
          },
        },
      });
      assert.equal(result.status, "PASS", result.description);
      // Path param filled from example, query + header params merged into request.
      assert.equal(lastRequestConfig.url, "http://api.example.com/users/u1");
      assert.deepEqual(lastRequestConfig.params, { q: "searchval" });
      assert.equal(reqHeader(lastRequestConfig, "X-Req"), "hval");
    });

    it("merges request/response examples with pre-existing step values", async function () {
      // The step supplies its own request params/headers/body and response
      // headers, so each example-merge spread combines the example with the
      // caller-provided values (both sides of the merge are exercised).
      const def = {
        openapi: "3.0.0",
        servers: [{ url: "http://api.example.com" }],
        paths: {
          "/users/{userId}": {
            post: {
              operationId: "createUser",
              parameters: [
                { name: "userId", in: "path", schema: { type: "string" }, example: "u1" },
                { name: "q", in: "query", schema: { type: "string" }, example: "qex" },
                { name: "X-Req", in: "header", schema: { type: "string" }, example: "hex" },
              ],
              requestBody: {
                content: {
                  "application/json": {
                    schema: { type: "object", properties: { name: { type: "string", example: "Jo" } } },
                  },
                },
              },
              responses: {
                201: {
                  description: "ok",
                  headers: { "X-Resp": { schema: { type: "string" }, example: "rhval" } },
                  content: {
                    "application/json": {
                      schema: { type: "object", properties: { id: { type: "integer", example: 7 } } },
                    },
                  },
                },
              },
            },
          },
        },
      };
      stubResponse({ status: 201, data: { id: 7 }, headers: { "x-resp": "rhval" } });
      const result = await httpRequest({
        config,
        step: {
          httpRequest: {
            openApi: {
              descriptionPath: writeDefinition(def),
              operationId: "createUser",
              useExample: "both",
              statusCode: 201,
              validateAgainstSchema: "none",
            },
            request: {
              parameters: { extra: "e" },
              headers: { "X-Own": "own" },
              body: { own: "b" },
            },
            response: { headers: { "x-resp": "rhval" } },
          },
        },
      });
      assert.equal(result.status, "PASS", result.description);
      // Example + step values coexist on the outgoing request.
      assert.deepEqual(lastRequestConfig.params, { q: "qex", extra: "e" });
      assert.equal(reqHeader(lastRequestConfig, "X-Req"), "hex");
      assert.equal(reqHeader(lastRequestConfig, "X-Own"), "own");
    });

    it("handles useExample:'both' for an operation with no request examples", async function () {
      // A bare GET operation: no parameters, no request body, no response
      // headers — only a response body example. Exercises the empty-section
      // guards in both example-merge blocks.
      const def = {
        openapi: "3.0.0",
        servers: [{ url: "http://api.example.com" }],
        paths: {
          "/ping": {
            get: {
              operationId: "ping",
              responses: {
                201: {
                  description: "ok",
                  content: {
                    "application/json": {
                      schema: { type: "object", properties: { id: { type: "integer", example: 7 } } },
                    },
                  },
                },
              },
            },
          },
        },
      };
      stubResponse({ status: 201, data: { id: 7 } });
      const result = await httpRequest({
        config,
        step: {
          httpRequest: {
            openApi: {
              descriptionPath: writeDefinition(def),
              operationId: "ping",
              useExample: "both",
              statusCode: 201,
              validateAgainstSchema: "none",
            },
          },
        },
      });
      assert.equal(result.status, "PASS", result.description);
      assert.equal(lastRequestConfig.url, "http://api.example.com/ping");
    });

    it("defaults statusCodes to the 2xx codes from the definition when unset", async function () {
      stubResponse({ status: 201, data: { id: 7 } });
      const p = writeDefinition(sampleDefinition());
      const result = await httpRequest({
        config,
        step: {
          httpRequest: {
            openApi: {
              descriptionPath: p,
              operationId: "createUser",
              validateAgainstSchema: "none",
            },
            request: { body: { name: "Jo" } },
          },
        },
      });
      // 201 is the only 2xx response code -> derived statusCodes = [201].
      assert.equal(result.status, "PASS", result.description);
      assert.equal(result.outputs.response.statusCode, 201);
    });
  });
});
