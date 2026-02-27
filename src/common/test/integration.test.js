/**
 * Integration tests to verify both CommonJS and ESM module exports work correctly.
 * These tests verify that the package can be consumed via both module systems.
 */

import { expect } from "chai";
import { createRequire } from "module";
import { fileURLToPath } from "url";
import path from "path";
import fs from "fs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const require = createRequire(import.meta.url);

  describe("Module Integration Tests", function () {
    // Increase timeout for spawning node processes
    this.timeout(10000);

    describe("CommonJS (require)", function () {
      it("should export validate function via require", function () {
        const { validate } = require("../dist/index.cjs");
        expect(typeof validate).to.equal("function");
      });

      it("should export transformToSchemaKey function via require", function () {
        const { transformToSchemaKey } = require("../dist/index.cjs");
        expect(typeof transformToSchemaKey).to.equal("function");
      });

      it("should export schemas object via require", function () {
        const { schemas } = require("../dist/index.cjs");
        expect(typeof schemas).to.equal("object");
        expect(schemas).to.have.property("step_v3");
        expect(schemas).to.have.property("config_v3");
      });

      it("should validate a step using CJS imports", function () {
        const { validate } = require("../dist/index.cjs");
        const result = validate({
          schemaKey: "step_v3",
          object: {
            goTo: { url: "https://example.com" },
          },
        });
        expect(result.valid).to.be.true;
        expect(result.object.goTo.url).to.equal("https://example.com");
      });

      it("should export detectTests function via require", function () {
        const { detectTests } = require("../dist/index.cjs");
        expect(typeof detectTests).to.equal("function");
      });

      it("should detect tests using CJS imports", async function () {
        const { detectTests } = require("../dist/index.cjs");
        const result = await detectTests({
          content: '<!-- test {"steps": [{"goTo": {"url": "https://example.com"}}]} -->',
          filePath: "test.md",
          fileType: {
            extensions: ["md"],
            inlineStatements: {
              testStart: ["<!-- test (.*?)-->"],
            },
          },
        });
        expect(result).to.have.lengthOf(1);
        expect(result[0].steps[0].goTo.url).to.equal("https://example.com");
      });

      it("should work with default export via require", function () {
        const docDetectiveCommon = require("../dist/index.cjs");
        expect(typeof docDetectiveCommon.validate).to.equal("function");
        expect(typeof docDetectiveCommon.schemas).to.equal("object");
        expect(typeof docDetectiveCommon.detectTests).to.equal("function");
      });
    });

    describe("ESM (import)", function () {
      it("should export validate function via ESM import", async function () {
        const module = await import("../dist/index.js");
        expect(typeof module.validate).to.equal("function");
      });

      it("should export transformToSchemaKey function via ESM import", async function () {
        const module = await import("../dist/index.js");
        expect(typeof module.transformToSchemaKey).to.equal("function");
      });

      it("should export schemas object via ESM import", async function () {
        const module = await import("../dist/index.js");
        expect(typeof module.schemas).to.equal("object");
        expect(module.schemas).to.have.property("step_v3");
        expect(module.schemas).to.have.property("config_v3");
      });

      it("should validate a step using ESM imports", async function () {
        const { validate } = await import("../dist/index.js");
        const result = validate({
          schemaKey: "step_v3",
          object: {
            goTo: { url: "https://example.com" },
          },
        });
        expect(result.valid).to.be.true;
        expect(result.object.goTo.url).to.equal("https://example.com");
      });

      it("should export detectTests function via ESM import", async function () {
        const module = await import("../dist/index.js");
        expect(typeof module.detectTests).to.equal("function");
      });

      it("should detect tests using ESM imports", async function () {
        const { detectTests } = await import("../dist/index.js");
        const result = await detectTests({
          content: '<!-- test {"steps": [{"goTo": {"url": "https://example.com"}}]} -->',
          filePath: "test.md",
          fileType: {
            extensions: ["md"],
            inlineStatements: {
              testStart: ["<!-- test (.*?)-->"],
            },
          },
        });
        expect(result).to.have.lengthOf(1);
        expect(result[0].steps[0].goTo.url).to.equal("https://example.com");
      });
    });

    describe("Cross-module compatibility", function () {
      it("should produce identical validation results from CJS and ESM", async function () {
        const cjsModule = require("../dist/index.cjs");
        const esmModule = await import("../dist/index.js");

        const testObject = {
          goTo: { url: "https://example.com" },
        };

        const cjsResult = cjsModule.validate({
          schemaKey: "step_v3",
          object: JSON.parse(JSON.stringify(testObject)),
        });

        const esmResult = esmModule.validate({
          schemaKey: "step_v3",
          object: JSON.parse(JSON.stringify(testObject)),
        });

        expect(cjsResult.valid).to.equal(esmResult.valid);
        // Note: stepId is generated with UUID, so we compare other properties
        expect(cjsResult.object.goTo).to.deep.equal(esmResult.object.goTo);
      });

      it("should produce identical detectTests results from CJS and ESM", async function () {
        const cjsModule = require("../dist/index.cjs");
        const esmModule = await import("../dist/index.js");

        const testInput = {
          content: '<!-- test {"steps": [{"goTo": {"url": "https://example.com"}}]} -->',
          filePath: "test.md",
          fileType: {
            extensions: ["md"],
            inlineStatements: {
              testStart: ["<!-- test (.*?)-->"],
            },
          },
        };

        const cjsResult = await cjsModule.detectTests(structuredClone(testInput));
        const esmResult = await esmModule.detectTests(structuredClone(testInput));

        expect(cjsResult).to.have.lengthOf(1);
        expect(esmResult).to.have.lengthOf(1);
        expect(cjsResult[0].steps[0].goTo.url).to.equal(esmResult[0].steps[0].goTo.url);
      });

      it("should have the same schema keys in CJS and ESM exports", async function () {
        const cjsModule = require("../dist/index.cjs");
        const esmModule = await import("../dist/index.js");

        const cjsSchemaKeys = Object.keys(cjsModule.schemas).sort();
        const esmSchemaKeys = Object.keys(esmModule.schemas).sort();

        expect(cjsSchemaKeys).to.deep.equal(esmSchemaKeys);
      });
    });

    describe("TypeScript type definitions", function () {
      it("should have type definition file for main export", function () {
        const dtsPath = path.join(__dirname, "..", "dist", "index.d.ts");
        expect(fs.existsSync(dtsPath)).to.be.true;
      });

      it("should have CJS type definition file", function () {
        const dtsPath = path.join(__dirname, "..", "dist", "index.d.cts");
        expect(fs.existsSync(dtsPath)).to.be.true;
      });

      it("should have type definitions for validate module", function () {
        const dtsPath = path.join(__dirname, "..", "dist", "validate.d.ts");
        expect(fs.existsSync(dtsPath)).to.be.true;
      });

      it("should have type definitions for detectTests module", function () {
        const dtsPath = path.join(__dirname, "..", "dist", "detectTests.d.ts");
        expect(fs.existsSync(dtsPath)).to.be.true;
      });

      it("should export detectTests types in type definitions", function () {
        const dtsPath = path.join(__dirname, "..", "dist", "detectTests.d.ts");
        const content = fs.readFileSync(dtsPath, "utf8");
        expect(content).to.include("detectTests");
        expect(content).to.include("DetectTestsInput");
        expect(content).to.include("FileType");
      });

      it("should export ValidateOptions interface in type definitions", function () {
        const dtsPath = path.join(__dirname, "..", "dist", "validate.d.ts");
        const content = fs.readFileSync(dtsPath, "utf8");
        expect(content).to.include("ValidateOptions");
      });

      it("should export ValidateResult interface in type definitions", function () {
        const dtsPath = path.join(__dirname, "..", "dist", "validate.d.ts");
        const content = fs.readFileSync(dtsPath, "utf8");
        expect(content).to.include("ValidateResult");
      });
    });

    describe("Package exports field verification", function () {
      it("should have correct main entry in package.json", function () {
        const packageJson = JSON.parse(
          fs.readFileSync(path.join(__dirname, "..", "package.json"), "utf8")
        );
        expect(packageJson.main).to.equal("dist/index.cjs");
      });

      it("should have correct types entry in package.json", function () {
        const packageJson = JSON.parse(
          fs.readFileSync(path.join(__dirname, "..", "package.json"), "utf8")
        );
        expect(packageJson.types).to.equal("dist/index.d.ts");
      });

      it("should have correct exports.require in package.json", function () {
        const packageJson = JSON.parse(
          fs.readFileSync(path.join(__dirname, "..", "package.json"), "utf8")
        );
        expect(packageJson.exports["."]).to.have.property("require");
        expect(packageJson.exports["."].require.default).to.equal("./dist/index.cjs");
      });

      it("should have correct exports.import in package.json", function () {
        const packageJson = JSON.parse(
          fs.readFileSync(path.join(__dirname, "..", "package.json"), "utf8")
        );
        expect(packageJson.exports["."]).to.have.property("import");
        expect(packageJson.exports["."].import.default).to.equal("./dist/index.js");
      });

      it("should have correct exports.import.types in package.json", function () {
        const packageJson = JSON.parse(
          fs.readFileSync(path.join(__dirname, "..", "package.json"), "utf8")
        );
        expect(packageJson.exports["."].import.types).to.equal("./dist/index.d.ts");
      });

      it("should have correct exports.require.types in package.json", function () {
        const packageJson = JSON.parse(
          fs.readFileSync(path.join(__dirname, "..", "package.json"), "utf8")
        );
        expect(packageJson.exports["."].require.types).to.equal("./dist/index.d.cts");
      });
    });
  });
