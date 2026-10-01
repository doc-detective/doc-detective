// Unit-coverage tests for src/core/openapi.ts (imported from the compiled
// dist/core/openapi.js). The module exposes only `getOperation` (a pure
// OpenAPI -> example/schema extractor) and `loadDescription` (file/URL loader
// + dereferencer). `getOperation` drives the whole internal pipeline —
// compileExample, getExample, getExampleParameters, generateObjectExample,
// generateArrayExample, checkForExamples, and getSchemas — so crafting minimal
// OpenAPI `definition` objects inline exercises nearly every branch with no
// I/O. The only I/O path tested is loadDescription's success case, which is
// kept hermetic by writing a tiny spec to an OS temp dir (cleaned up in
// afterEach). No network calls are made.
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { getOperation, loadDescription } from "../dist/core/openapi.js";

// Helper: wrap an operation under a path + method and attach a server.
function defWith(operation, { server = "https://api.example.com", paths } = {}) {
  return {
    servers: server ? [{ url: server }] : undefined,
    paths: paths || { "/widgets": { get: { operationId: "getWidgets", ...operation } } },
  };
}

// A minimal response so getSchemas / compileExample don't throw.
function jsonResponse(schema, extra = {}) {
  return {
    "200": {
      content: { "application/json": { schema } },
      ...extra,
    },
  };
}

describe("core/openapi coverage", function () {
  describe("getOperation error / lookup branches", function () {
    it("throws when definition is falsy", async function () {
      await assert.rejects(
        () => getOperation(null, "getWidgets"),
        /OpenAPI definition is required/
      );
    });

    it("throws when operationId is empty", async function () {
      await assert.rejects(
        () => getOperation({ paths: {} }, ""),
        /OperationId is required/
      );
    });

    it("returns null when the operationId is not found", async function () {
      const definition = defWith({
        responses: jsonResponse({ type: "object", properties: { id: { type: "string" } } }),
      });
      const result = await getOperation(definition, "doesNotExist");
      assert.equal(result, null);
    });

    it("throws when no server arg and no servers in definition", async function () {
      const definition = {
        // no servers
        paths: {
          "/widgets": {
            get: {
              operationId: "getWidgets",
              responses: jsonResponse({ type: "string", example: "x" }),
            },
          },
        },
      };
      await assert.rejects(
        () => getOperation(definition, "getWidgets"),
        /No server URL provided/
      );
    });

    it("uses definition.servers[0].url when no explicit server arg", async function () {
      const definition = defWith({
        responses: jsonResponse({ type: "string", example: "hello" }),
      });
      const result = await getOperation(definition, "getWidgets");
      assert.ok(result);
      assert.equal(result.path, "/widgets");
      assert.equal(result.method, "get");
      assert.equal(result.example.url, "https://api.example.com/widgets");
    });

    it("honors an explicit server arg over definition.servers", async function () {
      const definition = defWith({
        responses: jsonResponse({ type: "string", example: "hello" }),
      });
      const result = await getOperation(
        definition,
        "getWidgets",
        "",
        "",
        "https://override.test"
      );
      assert.equal(result.example.url, "https://override.test/widgets");
    });
  });

  describe("getSchemas via getOperation", function () {
    it("extracts request + response schemas using the first response code by default", async function () {
      const requestSchema = { type: "object", properties: { name: { type: "string" } } };
      const responseSchema = { type: "object", properties: { id: { type: "integer" } } };
      const definition = defWith({
        requestBody: { content: { "application/json": { schema: requestSchema } } },
        responses: {
          "201": { content: { "application/json": { schema: responseSchema } } },
        },
      });
      const result = await getOperation(definition, "getWidgets");
      assert.deepEqual(result.schemas.request, requestSchema);
      assert.deepEqual(result.schemas.response, responseSchema);
    });

    it("extracts the response schema for an explicit responseCode", async function () {
      const ok = { type: "object", properties: { ok: { type: "boolean" } } };
      const err = { type: "object", properties: { error: { type: "string" } } };
      const definition = defWith({
        responses: {
          "200": { content: { "application/json": { schema: ok } } },
          "404": { content: { "application/json": { schema: err } } },
        },
      });
      const result = await getOperation(definition, "getWidgets", "404");
      assert.deepEqual(result.schemas.response, err);
      assert.equal(result.schemas.request, undefined);
    });

    it("rejects with a TypeError when the operation has an empty responses object", async function () {
      // With `responses: {}` and no responseCode, compileExample sets
      // responseCode = Object.keys(responses)[0] (undefined), then reads
      // operation.responses[undefined].headers — a TypeError, raised before
      // getSchemas' own "No responses defined" branch is reached.
      const definition = defWith({ responses: {} });
      await assert.rejects(() => getOperation(definition, "getWidgets"), TypeError);
    });
  });

  describe("requestBody example generation", function () {
    it("generates an object body from a schema with varied property types", async function () {
      const requestSchema = {
        type: "object",
        required: ["name"],
        // Constraints force json-schema-faker to generate NON-falsy values:
        // openapi.ts drops falsy generated values (`if (objectExample)`), so an
        // unconstrained integer→0 / boolean→false / string→"" would be omitted
        // and make these presence assertions flaky.
        properties: {
          name: { type: "string", minLength: 1 },
          age: { type: "integer", minimum: 1 },
          score: { type: "number", minimum: 1 },
          active: { type: "boolean", enum: [true] },
          tags: { type: "array", items: { type: "string", minLength: 1 } },
          nested: {
            type: "object",
            properties: { inner: { type: "string", minLength: 1 } },
          },
        },
      };
      const definition = defWith({
        requestBody: { content: { "application/json": { schema: requestSchema } } },
        responses: jsonResponse({ type: "string", example: "ok" }),
      });
      const result = await getOperation(definition, "getWidgets");
      const body = result.example.request.body;
      assert.equal(typeof body, "object");
      assert.equal(typeof body.name, "string");
      assert.equal(typeof body.age, "number");
      assert.equal(typeof body.active, "boolean");
      assert.ok(Array.isArray(body.tags));
      assert.equal(typeof body.nested, "object");
    });

    it("uses an explicit `example` on the request media type", async function () {
      const definition = defWith({
        requestBody: {
          content: {
            "application/json": {
              schema: { type: "object", properties: { id: { type: "string" } } },
              example: { id: "fixed-id" },
            },
          },
        },
        responses: jsonResponse({ type: "string", example: "ok" }),
      });
      const result = await getOperation(definition, "getWidgets");
      assert.deepEqual(result.example.request.body, { id: "fixed-id" });
    });
  });

  describe("checkForExamples + examples/exampleKey selection", function () {
    it("selects a named example via exampleKey from response content", async function () {
      const definition = defWith({
        responses: {
          "200": {
            content: {
              "application/json": {
                schema: { type: "object", properties: { id: { type: "string" } } },
                examples: {
                  primary: { value: { id: "primary-id" } },
                  secondary: { value: { id: "secondary-id" } },
                },
              },
            },
          },
        },
      });
      const result = await getOperation(definition, "getWidgets", "", "secondary");
      assert.deepEqual(result.example.response.body, { id: "secondary-id" });
    });

    it("falls back to the media type `example` when exampleKey does not match", async function () {
      const definition = defWith({
        responses: {
          "200": {
            content: {
              "application/json": {
                schema: { type: "object", properties: { id: { type: "string" } } },
                example: { id: "from-example" },
                examples: { primary: { value: { id: "primary-id" } } },
              },
            },
          },
        },
      });
      const result = await getOperation(definition, "getWidgets", "", "nope");
      assert.deepEqual(result.example.response.body, { id: "from-example" });
    });
  });

  describe("parameters (path / query / header) via getExampleParameters", function () {
    it("substitutes path params, collects query + header params from examples", async function () {
      const definition = defWith(
        {},
        {
          paths: {
            "/widgets/{widgetId}": {
              get: {
                operationId: "getWidget",
                parameters: [
                  { name: "widgetId", in: "path", example: "w-123" },
                  { name: "verbose", in: "query", example: "true" },
                  { name: "X-Trace", in: "header", example: "trace-abc" },
                  // A parameter with no schema/example/type resolves to null from
                  // getExample, so getExampleParameters skips it (no push). (Uses
                  // null rather than an empty-string example, which is a valid
                  // OpenAPI value we shouldn't encode as "always dropped".)
                  { name: "noval", in: "query" },
                ],
                responses: jsonResponse({ type: "string", example: "ok" }),
              },
            },
          },
        }
      );
      const result = await getOperation(definition, "getWidget");
      assert.equal(result.example.url, "https://api.example.com/widgets/w-123");
      assert.equal(result.example.request.parameters.verbose, "true");
      assert.equal(result.example.request.headers["X-Trace"], "trace-abc");
      // The null-valued query param was dropped.
      assert.equal(result.example.request.parameters.noval, undefined);
    });

    it("generates a param value from a parameter schema (no example present)", async function () {
      const definition = defWith(
        {},
        {
          paths: {
            "/widgets": {
              get: {
                operationId: "getWidgets",
                parameters: [
                  // minimum:1 so the faked value is non-falsy (a 0 would be
                  // dropped by getExampleParameters' `if (value)` guard).
                  { name: "limit", in: "query", schema: { type: "integer", minimum: 1 } },
                ],
                responses: jsonResponse({ type: "string", example: "ok" }),
              },
            },
          },
        }
      );
      const result = await getOperation(definition, "getWidgets");
      assert.equal(typeof result.example.request.parameters.limit, "number");
    });
  });

  describe("response headers + arrays + nested objects", function () {
    it("includes response headers and generates an array-of-objects body", async function () {
      const definition = defWith({
        responses: {
          "200": {
            headers: {
              "X-Rate-Limit": { schema: { type: "integer" }, example: 100 },
            },
            content: {
              "application/json": {
                schema: {
                  type: "array",
                  items: {
                    type: "object",
                    required: ["id", "qty"],
                    // Non-falsy constraints (see requestBody test): a 0/"" would
                    // be dropped from the generated item object.
                    properties: {
                      id: { type: "string", minLength: 1 },
                      qty: { type: "integer", minimum: 1 },
                    },
                  },
                },
              },
            },
          },
        },
      });
      const result = await getOperation(definition, "getWidgets");
      assert.equal(result.example.response.headers["X-Rate-Limit"], 100);
      const body = result.example.response.body;
      assert.ok(Array.isArray(body));
      assert.equal(body.length, 1);
      assert.equal(typeof body[0].id, "string");
      assert.equal(typeof body[0].qty, "number");
    });

    it("handles enum + default + format properties in a generated object", async function () {
      const definition = defWith({
        responses: {
          "200": {
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["status", "when"],
                  properties: {
                    status: { type: "string", enum: ["open", "closed"] },
                    when: { type: "string", format: "date-time" },
                    count: { type: "integer", default: 7 },
                  },
                },
              },
            },
          },
        },
      });
      const result = await getOperation(definition, "getWidgets");
      const body = result.example.response.body;
      assert.equal(typeof body, "object");
      assert.ok(["open", "closed"].includes(body.status));
      assert.equal(typeof body.when, "string");
    });

    it("returns an empty array body for an items-less array schema with no examples", async function () {
      const definition = defWith({
        responses: {
          "200": {
            content: {
              "application/json": {
                // array with no `items` -> generateArrayExample(undefined,...)
                schema: { type: "array" },
              },
            },
          },
        },
      });
      const result = await getOperation(definition, "getWidgets");
      assert.ok(Array.isArray(result.example.response.body));
      assert.equal(result.example.response.body.length, 0);
    });
  });

  describe("getExample top-level `type` generation (jsf path)", function () {
    it("generates a required parameter value directly from a top-level typed schema", async function () {
      // A required parameter with a top-level `type` (not nested under `schema`)
      // takes the `generateFromSchema && definition.type` branch and is faked by
      // json-schema-faker rather than the schema-walking fallback.
      const definition = defWith(
        {},
        {
          paths: {
            "/widgets": {
              get: {
                operationId: "getWidgets",
                parameters: [
                  // minimum:1 so the top-level-typed faked value is non-falsy.
                  { name: "n", in: "query", required: true, type: "integer", minimum: 1 },
                ],
                responses: jsonResponse({ type: "string", example: "ok" }),
              },
            },
          },
        }
      );
      const result = await getOperation(definition, "getWidgets");
      assert.equal(typeof result.example.request.parameters.n, "number");
    });
  });

  describe("getExample fallback branches", function () {
    it("returns the request body via the content-pattern with a primitive schema", async function () {
      // requestBody has no top-level example/examples; getExample walks into
      // `definition.content`, picks the media object, and recurses into a
      // primitive (string) schema (the non-object/non-array branch).
      const definition = defWith({
        requestBody: {
          content: {
            "application/json": {
              schema: { type: "string", example: "body-string" },
            },
          },
        },
        responses: jsonResponse({ type: "object", properties: { id: { type: "string" } } }),
      });
      const result = await getOperation(definition, "getWidgets");
      assert.equal(result.example.request.body, "body-string");
    });
  });

  describe("replaceEnvs integration in compileExample", function () {
    const KEY = "OPENAPI_COVERAGE_ENV_VALUE";
    afterEach(function () {
      delete process.env[KEY];
    });

    it("resolves $ENV references inside the generated example", async function () {
      process.env[KEY] = "resolved-token";
      const definition = defWith({
        responses: {
          "200": {
            content: {
              "application/json": {
                schema: { type: "object", properties: { token: { type: "string" } } },
                example: { token: "$" + KEY },
              },
            },
          },
        },
      });
      const result = await getOperation(definition, "getWidgets");
      assert.equal(result.example.response.body.token, "resolved-token");
    });
  });

  describe("loadDescription", function () {
    let tmpDir;
    afterEach(function () {
      if (tmpDir) {
        fs.rmSync(tmpDir, { recursive: true, force: true });
        tmpDir = undefined;
      }
    });

    it("rejects when descriptionPath is empty", async function () {
      await assert.rejects(() => loadDescription(""), /Description is required/);
    });

    it("loads and dereferences a local OpenAPI JSON file", async function () {
      tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "openapi-cov-"));
      const specPath = path.join(tmpDir, "spec.json");
      const spec = {
        openapi: "3.0.0",
        info: { title: "Test", version: "1.0.0" },
        servers: [{ url: "https://api.example.com" }],
        components: {
          schemas: {
            Widget: { type: "object", properties: { id: { type: "string" } } },
          },
        },
        paths: {
          "/widgets": {
            get: {
              operationId: "getWidgets",
              responses: {
                "200": {
                  description: "ok",
                  content: {
                    "application/json": {
                      // $ref must resolve after dereference
                      schema: { $ref: "#/components/schemas/Widget" },
                    },
                  },
                },
              },
            },
          },
        },
      };
      fs.writeFileSync(specPath, JSON.stringify(spec), "utf8");

      const loaded = await loadDescription(specPath);
      // The $ref should be resolved inline after dereferencing.
      const schema =
        loaded.paths["/widgets"].get.responses["200"].content["application/json"].schema;
      assert.equal(schema.type, "object");
      assert.deepEqual(schema.properties.id, { type: "string" });

      // And the dereferenced definition should drive getOperation end-to-end.
      const op = await getOperation(loaded, "getWidgets");
      assert.equal(op.path, "/widgets");
      assert.equal(op.method, "get");
    });
  });
});
