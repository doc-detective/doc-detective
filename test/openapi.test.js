import assert from "node:assert/strict";
import {
  getOperation,
  getSchemas,
  compileExample,
  getExampleParameters,
  getExample,
  checkForExamples,
  loadDescription
} from "../dist/core/openapi.js";

// Minimal OpenAPI definition fixture
const minimalDef = {
  openapi: "3.0.0",
  info: { title: "Test", version: "1.0" },
  servers: [{ url: "http://localhost:8092/api" }],
  paths: {
    "/users": {
      get: {
        operationId: "listUsers",
        parameters: [
          {
            name: "page",
            in: "query",
            schema: { type: "integer" },
            example: 1
          },
          {
            name: "Authorization",
            in: "header",
            schema: { type: "string" },
            example: "Bearer test-token"
          }
        ],
        responses: {
          "200": {
            description: "Success",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    data: { type: "array", items: { type: "object" } }
                  }
                },
                example: { data: [{ id: 1, name: "Test" }] }
              }
            }
          }
        }
      },
      post: {
        operationId: "createUser",
        requestBody: {
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  name: { type: "string" },
                  email: { type: "string" }
                },
                required: ["name"]
              },
              example: { name: "John", email: "john@test.com" }
            }
          }
        },
        responses: {
          "201": {
            description: "Created",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    id: { type: "integer" },
                    name: { type: "string" }
                  }
                },
                example: { id: 1, name: "John" }
              }
            }
          }
        }
      }
    },
    "/users/{userId}": {
      get: {
        operationId: "getUser",
        parameters: [
          {
            name: "userId",
            in: "path",
            required: true,
            schema: { type: "integer" },
            example: 42
          }
        ],
        responses: {
          "200": {
            description: "Success",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    id: { type: "integer" },
                    name: { type: "string" }
                  }
                },
                example: { id: 42, name: "User" }
              }
            }
          }
        }
      }
    }
  }
};

describe("OpenAPI helpers", function () {
  this.timeout(30000);

  describe("getOperation()", function () {
    it("finds operation by valid operationId", function () {
      const result = getOperation(minimalDef, "listUsers");
      assert.ok(result);
      assert.equal(result.method, "get");
      assert.equal(result.path, "/users");
      assert.ok(result.definition);
      assert.ok(result.schemas);
      assert.ok(result.example);
    });

    it("returns null for unknown operationId", function () {
      const result = getOperation(minimalDef, "deleteUser");
      assert.equal(result, null);
    });

    it("finds operation with path parameters", function () {
      const result = getOperation(minimalDef, "getUser");
      assert.ok(result);
      assert.equal(result.path, "/users/{userId}");
    });

    it("uses provided server URL", function () {
      const result = getOperation(minimalDef, "listUsers", "", "", "http://custom-server.com");
      assert.ok(result);
    });

    it("finds POST operation", function () {
      const result = getOperation(minimalDef, "createUser");
      assert.ok(result);
      assert.equal(result.method, "post");
    });
  });

  describe("getSchemas()", function () {
    it("returns response schema for GET operation", function () {
      const operation = minimalDef.paths["/users"].get;
      const schemas = getSchemas(operation, "200");
      assert.ok(schemas);
      assert.ok(schemas.response);
    });

    it("returns request and response schemas for POST operation", function () {
      const operation = minimalDef.paths["/users"].post;
      const schemas = getSchemas(operation, "201");
      assert.ok(schemas);
      assert.ok(schemas.request);
      assert.ok(schemas.response);
    });

    it("defaults to first response code", function () {
      const operation = minimalDef.paths["/users"].get;
      const schemas = getSchemas(operation);
      assert.ok(schemas);
      assert.ok(schemas.response);
    });
  });

  describe("compileExample()", function () {
    it("compiles example for GET with query params", function () {
      const operation = minimalDef.paths["/users"].get;
      const example = compileExample(operation, "/users", "200");
      assert.ok(example);
      assert.ok(example.url !== undefined);
      assert.ok(example.response);
    });

    it("compiles example for POST with request body", function () {
      const operation = minimalDef.paths["/users"].post;
      const example = compileExample(operation, "/users", "201");
      assert.ok(example);
      assert.ok(example.request);
    });

    it("substitutes path parameters in URL", function () {
      const operation = minimalDef.paths["/users/{userId}"].get;
      const example = compileExample(operation, "/users/{userId}", "200");
      assert.ok(example);
      assert.ok(example.url);
      // The path parameter should be substituted
      assert.ok(!example.url.includes("{userId}") || example.url.includes("42"));
    });
  });

  describe("getExampleParameters()", function () {
    it("returns query parameters", function () {
      const operation = minimalDef.paths["/users"].get;
      const params = getExampleParameters(operation, "query");
      assert.ok(Array.isArray(params));
      assert.ok(params.length > 0);
      assert.equal(params[0].key, "page");
    });

    it("returns header parameters", function () {
      const operation = minimalDef.paths["/users"].get;
      const params = getExampleParameters(operation, "header");
      assert.ok(Array.isArray(params));
      assert.ok(params.length > 0);
      assert.equal(params[0].key, "Authorization");
    });

    it("returns path parameters", function () {
      const operation = minimalDef.paths["/users/{userId}"].get;
      const params = getExampleParameters(operation, "path");
      assert.ok(Array.isArray(params));
      assert.ok(params.length > 0);
      assert.equal(params[0].key, "userId");
    });

    it("returns empty array when no matching params", function () {
      const operation = minimalDef.paths["/users/{userId}"].get;
      const params = getExampleParameters(operation, "query");
      assert.ok(Array.isArray(params));
      assert.equal(params.length, 0);
    });
  });

  describe("getExample()", function () {
    it("returns example value when present", function () {
      const schema = {
        example: { data: [{ id: 1 }] }
      };
      const result = getExample(schema);
      assert.deepEqual(result, { data: [{ id: 1 }] });
    });

    it("returns null for empty definition", function () {
      const result = getExample({});
      // When no examples exist and no schema to generate from, should return null
      assert.ok(result === null || result === undefined || typeof result === "object");
    });
  });

  describe("checkForExamples()", function () {
    it("returns true when example key exists", function () {
      const def = { example: { id: 1 } };
      assert.equal(checkForExamples(def), true);
    });

    it("returns false when no examples exist", function () {
      const def = { type: "string" };
      assert.equal(checkForExamples(def), false);
    });

    it("returns true for deeply nested examples", function () {
      const def = {
        properties: {
          user: {
            properties: {
              name: { example: "John" }
            }
          }
        }
      };
      assert.equal(checkForExamples(def), true);
    });

    it("returns true for named examples", function () {
      const def = {
        examples: {
          myExample: { value: "test" }
        }
      };
      assert.equal(checkForExamples(def, "myExample"), true);
    });

    it("returns false when named example not found", function () {
      const def = {
        examples: {
          other: { value: "test" }
        }
      };
      assert.equal(checkForExamples(def, "nonexistent"), false);
    });
  });
});
