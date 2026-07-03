import { expect } from "chai";
import { validate, transformToSchemaKey } from "../dist/validate.js";

  describe("validate", function () {
    describe("input validation", function () {
      it("should throw error when schemaKey is missing", function () {
        expect(() => validate({ object: { test: "value" } })).to.throw(
          "Schema key is required."
        );
      });

      it("should throw error when schemaKey is null", function () {
        expect(() => validate({ schemaKey: null, object: { test: "value" } })).to.throw(
          "Schema key is required."
        );
      });

      it("should throw error when schemaKey is empty string", function () {
        expect(() => validate({ schemaKey: "", object: { test: "value" } })).to.throw(
          "Schema key is required."
        );
      });

      it("should throw error when object is missing", function () {
        expect(() => validate({ schemaKey: "step_v3" })).to.throw(
          "Object is required."
        );
      });

      it("should throw error when object is null", function () {
        expect(() => validate({ schemaKey: "step_v3", object: null })).to.throw(
          "Object is required."
        );
      });
    });

    describe("schema not found", function () {
      it("should return error when schema key does not exist", function () {
        const result = validate({
          schemaKey: "nonexistent_schema",
          object: { test: "value" },
        });

        expect(result.valid).to.be.false;
        expect(result.errors).to.equal("Schema not found: nonexistent_schema");
        expect(result.object).to.deep.equal({ test: "value" });
      });
    });

    describe("valid objects", function () {
      it("should validate a valid step_v3 object", function () {
        const result = validate({
          schemaKey: "step_v3",
          object: { goTo: { url: "https://example.com" } },
        });

        expect(result.valid).to.be.true;
        expect(result.errors).to.equal("");
        expect(result.object.goTo.url).to.equal("https://example.com");
      });

      it("should validate a valid config_v3 object", function () {
        const result = validate({
          schemaKey: "config_v3",
          object: { input: "./docs" },
        });

        expect(result.valid).to.be.true;
        expect(result.errors).to.equal("");
      });

      it("should validate a config_v3 object with testFilter and specFilter as arrays of strings", function () {
        const result = validate({
          schemaKey: "config_v3",
          object: {
            testFilter: ["smoke", "login"],
            specFilter: ["auth"],
          },
        });

        expect(result.valid).to.be.true;
        expect(result.errors).to.equal("");
        expect(result.object.testFilter).to.deep.equal(["smoke", "login"]);
        expect(result.object.specFilter).to.deep.equal(["auth"]);
      });

      it("should reject a config_v3 object whose testFilter is a bare string", function () {
        const result = validate({
          schemaKey: "config_v3",
          object: { testFilter: "smoke" },
        });

        expect(result.valid).to.be.false;
        expect(result.errors).to.be.a("string");
        expect(result.errors).to.include("testFilter");
      });

      it("should reject a config_v3 object whose testFilter contains a whitespace-only entry", function () {
        // A whitespace-only pattern would compile to a regex that matches
        // almost anything containing whitespace — never the user's intent.
        // Rejecting at validation time is clearer than silently dropping it
        // at runtime (which compileFilter also does as defense-in-depth).
        const result = validate({
          schemaKey: "config_v3",
          object: { testFilter: ["   "] },
        });

        expect(result.valid).to.be.false;
        expect(result.errors).to.be.a("string");
      });

      it("should reject a config_v3 object whose specFilter contains a whitespace-only entry", function () {
        const result = validate({
          schemaKey: "config_v3",
          object: { specFilter: ["\t\n"] },
        });

        expect(result.valid).to.be.false;
        expect(result.errors).to.be.a("string");
      });

      it("should validate a config_v3 object with autoScreenshot set", function () {
        const result = validate({
          schemaKey: "config_v3",
          object: { autoScreenshot: true },
        });

        expect(result.valid).to.be.true;
        expect(result.errors).to.equal("");
        expect(result.object.autoScreenshot).to.equal(true);
      });

      it("should default autoScreenshot to false when unset", function () {
        const result = validate({
          schemaKey: "config_v3",
          object: {},
        });

        expect(result.valid).to.be.true;
        expect(result.object.autoScreenshot).to.equal(false);
      });

      it("should reject a config_v3 object whose autoScreenshot is not a boolean", function () {
        const result = validate({
          schemaKey: "config_v3",
          object: { autoScreenshot: "yes" },
        });

        expect(result.valid).to.be.false;
        expect(result.errors).to.be.a("string");
        expect(result.errors).to.include("autoScreenshot");
      });

      it("should validate spec_v3 and test_v3 objects with autoScreenshot overrides", function () {
        const result = validate({
          schemaKey: "spec_v3",
          object: {
            autoScreenshot: true,
            tests: [
              {
                autoScreenshot: false,
                steps: [{ goTo: { url: "https://example.com" } }],
              },
            ],
          },
        });

        expect(result.valid).to.be.true;
        expect(result.errors).to.equal("");
        expect(result.object.autoScreenshot).to.equal(true);
        expect(result.object.tests[0].autoScreenshot).to.equal(false);
      });

      it("should not default autoScreenshot on specs or tests when unset", function () {
        // No schema default at the spec/test levels — an absent value must
        // stay absent so the runtime can defer to the config level.
        const result = validate({
          schemaKey: "spec_v3",
          object: {
            tests: [{ steps: [{ goTo: { url: "https://example.com" } }] }],
          },
        });

        expect(result.valid).to.be.true;
        expect(result.object.autoScreenshot).to.equal(undefined);
        expect(result.object.tests[0].autoScreenshot).to.equal(undefined);
      });

      it("should reject a test_v3 object whose autoScreenshot is not a boolean", function () {
        const result = validate({
          schemaKey: "test_v3",
          object: {
            autoScreenshot: "yes",
            steps: [{ goTo: { url: "https://example.com" } }],
          },
        });

        expect(result.valid).to.be.false;
        expect(result.errors).to.be.a("string");
        expect(result.errors).to.include("autoScreenshot");
      });

      it("should accept a relative forward-slash step autoScreenshot path", function () {
        const result = validate({
          schemaKey: "step_v3",
          object: {
            goTo: { url: "https://example.com" },
            autoScreenshot: "screenshots/spec/test/ctx/01-goTo-sabc.png",
          },
        });
        expect(result.valid, result.errors).to.be.true;
      });

      it("should reject step autoScreenshot paths that are empty, absolute, or backslashed", function () {
        for (const bad of [
          "",
          "/abs/shot.png",
          "C:\\shot.png",
          "screenshots\\spec\\01.png",
        ]) {
          const result = validate({
            schemaKey: "step_v3",
            object: { goTo: { url: "https://example.com" }, autoScreenshot: bad },
          });
          expect(result.valid, `expected invalid: ${JSON.stringify(bad)}`).to.be
            .false;
        }
      });

      it("should validate a record step with an engine string shorthand", function () {
        for (const engine of ["browser", "ffmpeg"]) {
          const result = validate({
            schemaKey: "step_v3",
            object: { record: { path: "out.mp4", engine } },
          });
          expect(result.valid, `engine: ${engine} -> ${result.errors}`).to.be
            .true;
        }
      });

      it("should validate a record step with a detailed engine object", function () {
        const result = validate({
          schemaKey: "step_v3",
          object: {
            record: {
              path: "out.mp4",
              engine: { name: "ffmpeg", target: "window", fps: 60 },
            },
          },
        });
        expect(result.valid, result.errors).to.be.true;
      });

      it("should reject a record step with an invalid engine", function () {
        for (const engine of [
          "webkit",
          { name: "vlc" },
          { name: "ffmpeg", target: "tab" },
          { name: "ffmpeg", fps: 1.5 },
        ]) {
          const result = validate({
            schemaKey: "step_v3",
            object: { record: { path: "out.mp4", engine } },
          });
          expect(
            result.valid,
            `expected invalid engine: ${JSON.stringify(engine)}`
          ).to.be.false;
        }
      });

      it("should validate a config_v3 object with autoRecord set", function () {
        const result = validate({
          schemaKey: "config_v3",
          object: { autoRecord: true },
        });

        expect(result.valid).to.be.true;
        expect(result.errors).to.equal("");
        expect(result.object.autoRecord).to.equal(true);
      });

      it("should default autoRecord to false when unset", function () {
        const result = validate({
          schemaKey: "config_v3",
          object: {},
        });

        expect(result.valid).to.be.true;
        expect(result.object.autoRecord).to.equal(false);
      });

      it("should reject a config_v3 object whose autoRecord is not a boolean", function () {
        const result = validate({
          schemaKey: "config_v3",
          object: { autoRecord: "yes" },
        });

        expect(result.valid).to.be.false;
        expect(result.errors).to.be.a("string");
        expect(result.errors).to.include("autoRecord");
      });

      it("should validate spec_v3 and test_v3 objects with autoRecord overrides", function () {
        const result = validate({
          schemaKey: "spec_v3",
          object: {
            autoRecord: true,
            tests: [
              {
                autoRecord: false,
                steps: [{ goTo: { url: "https://example.com" } }],
              },
            ],
          },
        });

        expect(result.valid).to.be.true;
        expect(result.errors).to.equal("");
        expect(result.object.autoRecord).to.equal(true);
        expect(result.object.tests[0].autoRecord).to.equal(false);
      });

      it("should not default autoRecord on specs or tests when unset", function () {
        const result = validate({
          schemaKey: "spec_v3",
          object: {
            tests: [{ steps: [{ goTo: { url: "https://example.com" } }] }],
          },
        });

        expect(result.valid).to.be.true;
        expect(result.object.autoRecord).to.equal(undefined);
        expect(result.object.tests[0].autoRecord).to.equal(undefined);
      });

      it("should validate a record step with a name", function () {
        const result = validate({
          schemaKey: "step_v3",
          object: { record: { path: "out.mp4", name: "demo" } },
        });
        expect(result.valid, result.errors).to.be.true;
        expect(result.object.record.name).to.equal("demo");
      });

      it("should reject a record step whose name is whitespace-only", function () {
        const result = validate({
          schemaKey: "step_v3",
          object: { record: { path: "out.mp4", name: "   " } },
        });
        expect(result.valid).to.be.false;
      });

      it("should validate stopRecord as boolean, null, a name string, or a name object", function () {
        for (const stopRecord of [true, null, "demo", { name: "demo" }]) {
          const result = validate({
            schemaKey: "step_v3",
            object: { stopRecord },
          });
          expect(
            result.valid,
            `stopRecord: ${JSON.stringify(stopRecord)} -> ${result.errors}`
          ).to.be.true;
        }
      });

      it("should reject stopRecord with an empty name or extra properties", function () {
        for (const stopRecord of [{ name: "" }, { name: "demo", extra: 1 }]) {
          const result = validate({
            schemaKey: "step_v3",
            object: { stopRecord },
          });
          expect(
            result.valid,
            `expected invalid stopRecord: ${JSON.stringify(stopRecord)}`
          ).to.be.false;
        }
      });

      it("should validate config_v3 concurrentRunners as a positive integer or true", function () {
        for (const concurrentRunners of [1, 4, true]) {
          const result = validate({
            schemaKey: "config_v3",
            object: { input: ".", concurrentRunners },
          });

          expect(result.valid, `concurrentRunners: ${concurrentRunners}`).to.be
            .true;
          expect(result.errors).to.equal("");
        }
      });

      it("should reject config_v3 concurrentRunners of 0, false, or a fraction", function () {
        for (const concurrentRunners of [0, false, 1.5]) {
          const result = validate({
            schemaKey: "config_v3",
            object: { input: ".", concurrentRunners },
          });

          expect(result.valid, `concurrentRunners: ${concurrentRunners}`).to.be
            .false;
          expect(result.errors).to.be.a("string");
        }
      });

      it("should validate a config_v3 object with dryRun set", function () {
        const result = validate({
          schemaKey: "config_v3",
          object: { dryRun: true },
        });

        expect(result.valid).to.be.true;
        expect(result.errors).to.equal("");
        expect(result.object.dryRun).to.equal(true);
      });

      it("should reject a config_v3 object whose dryRun is not a boolean", function () {
        const result = validate({
          schemaKey: "config_v3",
          object: { dryRun: "yes" },
        });

        expect(result.valid).to.be.false;
        expect(result.errors).to.be.a("string");
        expect(result.errors).to.include("dryRun");
      });

      it("should accept a config_v3 object with the deprecated `debug` field (ignored; kept so existing configs still validate)", function () {
        // `debug` is deprecated and ignored — diagnostics moved to the
        // DOC_DETECTIVE_DEBUG env var / `doc-detective debug` subcommand —
        // but old configs that still carry it must keep validating.
        for (const value of [false, true, "stepThrough"]) {
          const result = validate({
            schemaKey: "config_v3",
            object: { debug: value },
          });
          expect(result.valid, `debug: ${JSON.stringify(value)}`).to.be.true;
        }
      });

      it("should reject a config_v3 object whose deprecated `debug` value is malformed", function () {
        // The accepted envelope is boolean | "stepThrough". Use values that
        // are neither (and not AJV-coercible to boolean, so not "true"/"false"
        // or 0/1) so the deprecated field's contract can't silently widen.
        for (const value of ["yes", "stepthrough", "enabled", "on"]) {
          const result = validate({
            schemaKey: "config_v3",
            object: { debug: value },
          });
          expect(result.valid, `debug: ${JSON.stringify(value)}`).to.be.false;
          expect(result.errors).to.be.a("string");
        }
      });

      it("should validate a config_v3 object with hints set", function () {
        const result = validate({
          schemaKey: "config_v3",
          object: { hints: { enabled: true } },
        });

        expect(result.valid).to.be.true;
        expect(result.errors).to.equal("");
        expect(result.object.hints.enabled).to.equal(true);
      });

      it("should reject a config_v3 object whose hints.enabled is not a boolean", function () {
        const result = validate({
          schemaKey: "config_v3",
          object: { hints: { enabled: "yes" } },
        });

        expect(result.valid).to.be.false;
        expect(result.errors).to.be.a("string");
        expect(result.errors).to.include("hints");
      });

      it("should reject unknown properties on the hints object", function () {
        const result = validate({
          schemaKey: "config_v3",
          object: { hints: { enabled: true, bogusKey: 1 } },
        });

        expect(result.valid).to.be.false;
        expect(result.errors).to.be.a("string");
      });

      it("should validate a config_v3 object with autoUpdate set", function () {
        const result = validate({
          schemaKey: "config_v3",
          object: { autoUpdate: false },
        });

        expect(result.valid).to.be.true;
        expect(result.errors).to.equal("");
        expect(result.object.autoUpdate).to.equal(false);
      });

      it("should default autoUpdate to true when omitted", function () {
        const result = validate({
          schemaKey: "config_v3",
          object: {},
        });

        expect(result.valid).to.be.true;
        expect(result.object.autoUpdate).to.equal(true);
      });

      it("should reject a config_v3 object whose autoUpdate is not a boolean", function () {
        const result = validate({
          schemaKey: "config_v3",
          object: { autoUpdate: "no" },
        });

        expect(result.valid).to.be.false;
        expect(result.errors).to.be.a("string");
        expect(result.errors).to.include("autoUpdate");
      });

      it("should validate a config_v3 object with cacheDir set", function () {
        const result = validate({
          schemaKey: "config_v3",
          object: { cacheDir: "/tmp/dd-cache" },
        });

        expect(result.valid).to.be.true;
        expect(result.errors).to.equal("");
        expect(result.object.cacheDir).to.equal("/tmp/dd-cache");
      });

      it("should reject a config_v3 object whose cacheDir is not a string", function () {
        // AJV's coerceTypes converts scalars to strings, so use an object —
        // it can't be coerced and forces a true type-mismatch failure.
        const result = validate({
          schemaKey: "config_v3",
          object: { cacheDir: { not: "a string" } },
        });

        expect(result.valid).to.be.false;
        expect(result.errors).to.be.a("string");
        expect(result.errors).to.include("cacheDir");
      });

      it("should reject a config_v3 object whose cacheDir is an empty string", function () {
        const result = validate({
          schemaKey: "config_v3",
          object: { cacheDir: "" },
        });

        expect(result.valid).to.be.false;
        expect(result.errors).to.be.a("string");
        expect(result.errors).to.include("cacheDir");
      });

      it("should reject a config_v3 object whose cacheDir is whitespace-only", function () {
        // minLength alone accepts whitespace-only strings like "   ";
        // the schema pairs it with a non-whitespace `pattern` so a
        // config file / env var carrying a typo can't pass validation
        // and then silently fail at runtime.
        const result = validate({
          schemaKey: "config_v3",
          object: { cacheDir: "   " },
        });

        expect(result.valid).to.be.false;
        expect(result.errors).to.be.a("string");
        expect(result.errors).to.include("cacheDir");
      });

      it("should validate a config_v3 object with each browserFallback mode", function () {
        for (const browserFallback of ["auto", "explicit", "off"]) {
          const result = validate({
            schemaKey: "config_v3",
            object: { browserFallback },
          });

          expect(result.valid, `browserFallback: ${browserFallback}`).to.be.true;
          expect(result.errors).to.equal("");
          expect(result.object.browserFallback).to.equal(browserFallback);
        }
      });

      it("should default browserFallback to 'auto' when addDefaults=true", function () {
        const result = validate({
          schemaKey: "config_v3",
          object: { input: "." },
          addDefaults: true,
        });

        expect(result.valid).to.be.true;
        expect(result.object.browserFallback).to.equal("auto");
      });

      it("should reject a config_v3 object whose browserFallback is not a known mode", function () {
        const result = validate({
          schemaKey: "config_v3",
          object: { browserFallback: "sometimes" },
        });

        expect(result.valid).to.be.false;
        expect(result.errors).to.be.a("string");
        expect(result.errors).to.include("browserFallback");
      });

      it("should add default values when addDefaults=true", function () {
        const result = validate({
          schemaKey: "step_v3",
          object: { goTo: { url: "https://example.com" } },
          addDefaults: true,
        });

        expect(result.valid).to.be.true;
        // Returns the validated object (with any schema coercions applied)
        expect(result.object.goTo.url).to.equal("https://example.com");
      });

      it("should return original object when addDefaults=false", function () {
        const result = validate({
          schemaKey: "step_v3",
          object: { goTo: { url: "https://example.com" } },
          addDefaults: false,
        });

        expect(result.valid).to.be.true;
        // The returned object should be the original without validation mutations
        expect(result.object.goTo.url).to.equal("https://example.com");
      });
    });

    describe("runBrowserScript step", function () {
      it("should validate the simple string form", function () {
        const result = validate({
          schemaKey: "step_v3",
          object: { runBrowserScript: "return document.title;" },
        });

        expect(result.valid).to.be.true;
        expect(result.errors).to.equal("");
        expect(result.object.runBrowserScript).to.equal(
          "return document.title;"
        );
      });

      it("should validate the detailed object form with all fields", function () {
        const result = validate({
          schemaKey: "step_v3",
          object: {
            runBrowserScript: {
              script: "return arguments[0] + arguments[1];",
              args: ["foo", "bar"],
              output: "foobar",
              path: "result.json",
              directory: "output",
              maxVariation: 0.1,
              overwrite: "aboveVariation",
              timeout: 5000,
            },
          },
        });

        expect(result.valid).to.be.true;
        expect(result.errors).to.equal("");
        expect(result.object.runBrowserScript.script).to.equal(
          "return arguments[0] + arguments[1];"
        );
        expect(result.object.runBrowserScript.args).to.deep.equal([
          "foo",
          "bar",
        ]);
      });

      it("should accept non-string args (numbers, booleans)", function () {
        const result = validate({
          schemaKey: "step_v3",
          object: {
            runBrowserScript: {
              script: "return arguments[0];",
              args: [42, true, "x", null],
            },
          },
        });

        expect(result.valid).to.be.true;
        expect(result.errors).to.equal("");
        expect(result.object.runBrowserScript.args).to.deep.equal([
          42,
          true,
          "x",
          null,
        ]);
      });

      it("should reject the object form when script is missing", function () {
        const result = validate({
          schemaKey: "step_v3",
          object: { runBrowserScript: { args: ["foo"] } },
        });

        expect(result.valid).to.be.false;
        expect(result.errors).to.be.a("string");
        expect(result.errors.length).to.be.greaterThan(0);
      });

      it("should reject maxVariation outside the 0-1 range", function () {
        const result = validate({
          schemaKey: "step_v3",
          object: {
            runBrowserScript: { script: "return 1;", maxVariation: 2 },
          },
        });

        expect(result.valid).to.be.false;
        expect(result.errors).to.be.a("string");
        expect(result.errors.length).to.be.greaterThan(0);
      });

      it("should reject unknown properties on the object form", function () {
        const result = validate({
          schemaKey: "step_v3",
          object: {
            runBrowserScript: { script: "return 1;", bogus: true },
          },
        });

        expect(result.valid).to.be.false;
        expect(result.errors).to.be.a("string");
        expect(result.errors.length).to.be.greaterThan(0);
      });

      it("should reject a non-positive timeout", function () {
        const result = validate({
          schemaKey: "step_v3",
          object: {
            runBrowserScript: { script: "return 1;", timeout: 0 },
          },
        });

        expect(result.valid).to.be.false;
        expect(result.errors).to.be.a("string");
        expect(result.errors.length).to.be.greaterThan(0);
      });
    });

    describe("invalid objects", function () {
      it("should return error for invalid step_v3 object", function () {
        const result = validate({
          schemaKey: "step_v3",
          object: { invalidProperty: "value" },
        });

        expect(result.valid).to.be.false;
        expect(result.errors).to.be.a("string");
        expect(result.errors.length).to.be.greaterThan(0);
      });

      it("should return error for object missing required properties", function () {
        const result = validate({
          schemaKey: "goTo_v3",
          object: {},
        });

        expect(result.valid).to.be.false;
        expect(result.errors).to.include("required");
      });
    });

    describe("backward compatibility (v2 to v3 transformation)", function () {
      it("should transform and validate goTo_v2 as step_v3", function () {
        const result = validate({
          schemaKey: "step_v3",
          object: {
            action: "goTo",
            url: "https://example.com",
          },
        });

        expect(result.valid).to.be.true;
        expect(result.object.goTo).to.be.an("object");
        expect(result.object.goTo.url).to.equal("https://example.com");
      });

      it("should transform and validate find_v2 as step_v3", function () {
        const result = validate({
          schemaKey: "step_v3",
          object: {
            action: "find",
            selector: "#myElement",
            matchText: "Hello",
          },
        });

        expect(result.valid).to.be.true;
        expect(result.object.find).to.be.an("object");
        expect(result.object.find.selector).to.equal("#myElement");
        expect(result.object.find.elementText).to.equal("Hello");
      });

      it("should transform and validate checkLink_v2 as step_v3", function () {
        const result = validate({
          schemaKey: "step_v3",
          object: {
            action: "checkLink",
            url: "https://example.com",
          },
        });

        expect(result.valid).to.be.true;
        expect(result.object.checkLink).to.be.an("object");
        expect(result.object.checkLink.url).to.equal("https://example.com");
      });

      it("should transform wait_v2 to step_v3 via validate", function () {
        const result = validate({
          schemaKey: "step_v3",
          object: {
            action: "wait",
            duration: 3000,
          },
        });

        expect(result.valid).to.be.true;
        expect(result.object.wait).to.equal(3000);
      });

      it("should transform wait_v2 with missing duration to step_v3 via validate", function () {
        const result = validate({
          schemaKey: "step_v3",
          object: {
            action: "wait",
          },
        });

        expect(result.valid).to.be.true;
        expect(result.object.wait).to.equal(5000);
      });

      it("should transform typeKeys_v2 with delay to step_v3 with inputDelay", function () {
        const result = validate({
          schemaKey: "step_v3",
          object: {
            action: "typeKeys",
            keys: "Hello",
            delay: 100,
          },
        });

        expect(result.valid).to.be.true;
        expect(result.object.type).to.be.an("object");
        expect(result.object.type.keys).to.equal("Hello");
        expect(result.object.type.inputDelay).to.equal(100);
      });
    });

    describe("object cloning", function () {
      it("should not modify the original object", function () {
        const original = { goTo: { url: "https://example.com" } };
        const originalCopy = JSON.parse(JSON.stringify(original));

        validate({
          schemaKey: "step_v3",
          object: original,
        });

        // Original should be unchanged
        expect(original).to.deep.equal(originalCopy);
      });
    });
  });

  describe("transformToSchemaKey", function () {
    describe("same schema transformation", function () {
      it("should return object unchanged when currentSchema equals targetSchema", function () {
        const object = { goTo: { url: "https://example.com" } };

        const result = transformToSchemaKey({
          currentSchema: "step_v3",
          targetSchema: "step_v3",
          object,
        });

        expect(result).to.deep.equal(object);
      });
    });

    describe("incompatible schemas", function () {
      it("should throw error for incompatible schema transformation", function () {
        expect(() =>
          transformToSchemaKey({
            currentSchema: "config_v3",
            targetSchema: "step_v3",
            object: {},
          })
        ).to.throw("Can't transform from config_v3 to step_v3.");
      });
    });

    describe("step_v3 transformations", function () {
      it("should transform goTo_v2 to step_v3", function () {
        const result = transformToSchemaKey({
          currentSchema: "goTo_v2",
          targetSchema: "step_v3",
          object: {
            id: "test-id",
            description: "Test description",
            url: "https://example.com",
            origin: "https://example.com",
          },
        });

        expect(result.stepId).to.equal("test-id");
        expect(result.description).to.equal("Test description");
        expect(result.goTo.url).to.equal("https://example.com");
        expect(result.goTo.origin).to.equal("https://example.com");
      });

      it("should transform checkLink_v2 to step_v3", function () {
        const result = transformToSchemaKey({
          currentSchema: "checkLink_v2",
          targetSchema: "step_v3",
          object: {
            url: "https://example.com",
            statusCodes: [200, 201],
          },
        });

        expect(result.checkLink.url).to.equal("https://example.com");
        expect(result.checkLink.statusCodes).to.deep.equal([200, 201]);
      });

      it("should transform find_v2 with typeKeys to step_v3", function () {
        const result = transformToSchemaKey({
          currentSchema: "find_v2",
          targetSchema: "step_v3",
          object: {
            selector: "#input",
            matchText: "Hello",
            typeKeys: {
              keys: "World",
              delay: 50,
            },
          },
        });

        expect(result.find.selector).to.equal("#input");
        expect(result.find.elementText).to.equal("Hello");
        expect(result.find.type.keys).to.equal("World");
        expect(result.find.type.inputDelay).to.equal(50);
      });

      it("should transform find_v2 with setVariables to step_v3", function () {
        const result = transformToSchemaKey({
          currentSchema: "find_v2",
          targetSchema: "step_v3",
          object: {
            selector: "#input",
            setVariables: [{ name: "myVar", regex: ".*" }],
          },
        });

        expect(result.find.selector).to.equal("#input");
        expect(result.variables.myVar).to.equal('extract($$element.text, ".*")');
      });

      it("should transform httpRequest_v2 to step_v3", function () {
        const result = transformToSchemaKey({
          currentSchema: "httpRequest_v2",
          targetSchema: "step_v3",
          object: {
            method: "GET",
            url: "https://api.example.com",
            requestData: { key: "value" },
            requestHeaders: { "Content-Type": "application/json" },
            responseData: { expected: "response" },
            statusCodes: [200],
            maxVariation: 10,
            overwrite: "byVariation",
          },
        });

        expect(result.httpRequest.method).to.equal("get");
        expect(result.httpRequest.url).to.equal("https://api.example.com");
        expect(result.httpRequest.request.body).to.deep.equal({ key: "value" });
        expect(result.httpRequest.request.headers).to.deep.equal({ "Content-Type": "application/json" });
        expect(result.httpRequest.response.body).to.deep.equal({ expected: "response" });
        expect(result.httpRequest.maxVariation).to.equal(0.1); // Converted from 10/100
        expect(result.httpRequest.overwrite).to.equal("aboveVariation");
      });

      it("should transform httpRequest_v2 with envsFromResponseData to step_v3", function () {
        const result = transformToSchemaKey({
          currentSchema: "httpRequest_v2",
          targetSchema: "step_v3",
          object: {
            method: "GET",
            url: "https://api.example.com",
            envsFromResponseData: [{ name: "token", jqFilter: ".data.token" }],
          },
        });

        expect(result.variables.token).to.equal('jq($$response.body, ".data.token")');
      });

      it("should transform runShell_v2 to step_v3", function () {
        const result = transformToSchemaKey({
          currentSchema: "runShell_v2",
          targetSchema: "step_v3",
          object: {
            command: "echo",
            args: ["hello"],
            workingDirectory: "/tmp",
            exitCodes: [0],
            output: "Hello",
            maxVariation: 5,
          },
        });

        expect(result.runShell.command).to.equal("echo");
        expect(result.runShell.args).to.deep.equal(["hello"]);
        expect(result.runShell.workingDirectory).to.equal("/tmp");
        expect(result.runShell.exitCodes).to.deep.equal([0]);
        expect(result.runShell.stdio).to.equal("Hello");
        expect(result.runShell.maxVariation).to.equal(0.05);
      });

      it("should transform runShell_v2 with overwrite byVariation to step_v3", function () {
        const result = transformToSchemaKey({
          currentSchema: "runShell_v2",
          targetSchema: "step_v3",
          object: {
            command: "echo",
            overwrite: "byVariation",
          },
        });

        expect(result.runShell.command).to.equal("echo");
        expect(result.runShell.overwrite).to.equal("aboveVariation");
      });

      it("should transform runShell_v2 with setVariables to step_v3", function () {
        const result = transformToSchemaKey({
          currentSchema: "runShell_v2",
          targetSchema: "step_v3",
          object: {
            command: "echo",
            setVariables: [{ name: "output", regex: "(.*)" }],
          },
        });

        expect(result.variables.output).to.equal('extract($$stdio.stdout, "(.*)")');
      });

      it("should transform runCode_v2 to step_v3", function () {
        const result = transformToSchemaKey({
          currentSchema: "runCode_v2",
          targetSchema: "step_v3",
          object: {
            language: "javascript",
            code: "console.log('hello');",
          },
        });

        expect(result.runCode).to.exist;
        expect(result.runCode.language).to.equal("javascript");
        expect(result.runCode.code).to.equal("console.log('hello');");
      });

      it("should transform runCode_v2 with overwrite byVariation to step_v3", function () {
        const result = transformToSchemaKey({
          currentSchema: "runCode_v2",
          targetSchema: "step_v3",
          object: {
            language: "javascript",
            code: "console.log('hello');",
            overwrite: "byVariation",
          },
        });

        expect(result.runCode).to.exist;
        expect(result.runCode.overwrite).to.equal("aboveVariation");
      });

      it("should transform runCode_v2 with setVariables to step_v3", function () {
        const result = transformToSchemaKey({
          currentSchema: "runCode_v2",
          targetSchema: "step_v3",
          object: {
            language: "javascript",
            code: "console.log('hello');",
            setVariables: [
              {
                name: "OUTPUT",
                regex: "hello"
              }
            ]
          },
        });

        expect(result.runCode).to.exist;
        expect(result.variables).to.exist;
        expect(result.variables.OUTPUT).to.equal('extract($$stdio.stdout, "hello")');
      });

      it("should transform setVariables_v2 to step_v3", function () {
        const result = transformToSchemaKey({
          currentSchema: "setVariables_v2",
          targetSchema: "step_v3",
          object: {
            path: "./vars.json",
          },
        });

        expect(result.loadVariables).to.equal("./vars.json");
      });

      it("should transform typeKeys_v2 to step_v3", function () {
        const result = transformToSchemaKey({
          currentSchema: "typeKeys_v2",
          targetSchema: "step_v3",
          object: {
            keys: "Hello World",
            delay: 100,
          },
        });

        expect(result.type.keys).to.equal("Hello World");
        expect(result.type.inputDelay).to.equal(100);
      });

      it("should transform saveScreenshot_v2 to step_v3", function () {
        const result = transformToSchemaKey({
          currentSchema: "saveScreenshot_v2",
          targetSchema: "step_v3",
          object: {
            path: "screenshot.png",
            directory: "./screenshots",
            maxVariation: 5,
            overwrite: "byVariation",
          },
        });

        expect(result.screenshot.path).to.equal("screenshot.png");
        expect(result.screenshot.directory).to.equal("./screenshots");
        expect(result.screenshot.maxVariation).to.equal(0.05);
        expect(result.screenshot.overwrite).to.equal("aboveVariation");
      });

      it("should transform saveScreenshot_v2 with non-byVariation overwrite to step_v3", function () {
        const result = transformToSchemaKey({
          currentSchema: "saveScreenshot_v2",
          targetSchema: "step_v3",
          object: {
            path: "screenshot.png",
            overwrite: "true",
          },
        });

        expect(result.screenshot.path).to.equal("screenshot.png");
        expect(result.screenshot.overwrite).to.equal("true");
      });

      it("should transform startRecording_v2 to step_v3", function () {
        const result = transformToSchemaKey({
          currentSchema: "startRecording_v2",
          targetSchema: "step_v3",
          object: {
            path: "recording.webm",
            directory: "./recordings",
            overwrite: "true",
          },
        });

        expect(result.record.path).to.equal("recording.webm");
        expect(result.record.directory).to.equal("./recordings");
        expect(result.record.overwrite).to.equal("true");
      });

      it("should transform stopRecording_v2 to step_v3", function () {
        const result = transformToSchemaKey({
          currentSchema: "stopRecording_v2",
          targetSchema: "step_v3",
          object: {},
        });

        expect(result.stopRecord).to.equal(true);
      });

      it("should transform wait_v2 to step_v3", function () {
        const result = transformToSchemaKey({
          currentSchema: "wait_v2",
          targetSchema: "step_v3",
          object: { duration: 1000 },
        });
        expect(result.wait).to.equal(1000);

        const result2 = transformToSchemaKey({
          currentSchema: "wait_v2",
          targetSchema: "step_v3",
          object: {},
        });
        expect(result2.wait).to.equal(5000);

      });
    });

    describe("config_v3 transformations", function () {
      it("should transform config_v2 to config_v3", function () {
        const result = transformToSchemaKey({
          currentSchema: "config_v2",
          targetSchema: "config_v3",
          object: {
            envVariables: "./env.json",
            runTests: {
              input: "./docs",
              output: "./results",
              recursive: true,
              detectSteps: true,
              setup: "./setup.js",
              cleanup: "./cleanup.js",
            },
            logLevel: "info",
          },
        });

        expect(result.loadVariables).to.equal("./env.json");
        expect(result.input).to.equal("./docs");
        expect(result.output).to.equal("./results");
        expect(result.recursive).to.equal(true);
        expect(result.detectSteps).to.equal(true);
        expect(result.beforeAny).to.equal("./setup.js");
        expect(result.afterAll).to.equal("./cleanup.js");
      });

      it("should transform config_v2 with top-level input to config_v3", function () {
        const result = transformToSchemaKey({
          currentSchema: "config_v2",
          targetSchema: "config_v3",
          object: {
            input: "./docs",
            output: "./results",
            recursive: true,
          },
        });

        expect(result.input).to.equal("./docs");
        expect(result.output).to.equal("./results");
        expect(result.recursive).to.equal(true);
      });

      it("should transform config_v2 with contexts to config_v3", function () {
        const result = transformToSchemaKey({
          currentSchema: "config_v2",
          targetSchema: "config_v3",
          object: {
            runTests: {
              input: "./docs",
              contexts: [
                {
                  platforms: ["linux"],
                  app: {
                    name: "chrome",
                    options: {
                      headless: true,
                      width: 1920,
                      height: 1080,
                    },
                  },
                },
              ],
            },
          },
        });

        expect(result.runOn).to.be.an("array");
        expect(result.runOn[0].platforms).to.deep.equal(["linux"]);
        expect(result.runOn[0].browsers[0].name).to.equal("chrome");
        expect(result.runOn[0].browsers[0].headless).to.equal(true);
      });
    });

    describe("context_v3 browserFallback", function () {
      it("should validate a context_v3 object with each browserFallback mode", function () {
        for (const browserFallback of ["auto", "explicit", "off"]) {
          const result = validate({
            schemaKey: "context_v3",
            object: { platforms: ["linux"], browsers: ["firefox"], browserFallback },
          });
          expect(result.valid, `browserFallback: ${browserFallback}`).to.be.true;
          expect(result.object.browserFallback).to.equal(browserFallback);
        }
      });

      it("should reject a context_v3 object whose browserFallback is not a known mode", function () {
        const result = validate({
          schemaKey: "context_v3",
          object: { platforms: ["linux"], browserFallback: "sometimes" },
        });
        expect(result.valid).to.be.false;
        expect(result.errors).to.be.a("string");
        expect(result.errors).to.include("browserFallback");
      });
    });

    describe("context_v3 transformations", function () {
      it("should transform context_v2 to context_v3", function () {
        const result = transformToSchemaKey({
          currentSchema: "context_v2",
          targetSchema: "context_v3",
          object: {
            platforms: ["linux", "windows"],
            app: {
              name: "chrome",
              options: {
                headless: true,
                width: 1920,
                height: 1080,
                viewport_width: 1280,
                viewport_height: 720,
              },
            },
          },
        });

        expect(result.platforms).to.deep.equal(["linux", "windows"]);
        expect(result.browsers[0].name).to.equal("chrome");
        expect(result.browsers[0].headless).to.equal(true);
        expect(result.browsers[0].window.width).to.equal(1920);
        expect(result.browsers[0].window.height).to.equal(1080);
        expect(result.browsers[0].viewport.width).to.equal(1280);
        expect(result.browsers[0].viewport.height).to.equal(720);
      });

      it("should transform edge browser to chrome in context_v3", function () {
        const result = transformToSchemaKey({
          currentSchema: "context_v2",
          targetSchema: "context_v3",
          object: {
            app: {
              name: "edge",
            },
          },
        });

        expect(result.browsers[0].name).to.equal("chrome");
      });
    });

    describe("openApi_v3 transformations", function () {
      it("should transform openApi_v2 to openApi_v3", function () {
        const result = transformToSchemaKey({
          currentSchema: "openApi_v2",
          targetSchema: "openApi_v3",
          object: {
            name: "My API",
            descriptionPath: "./openapi.json",
            requestHeaders: { Authorization: "Bearer token" },
          },
        });

        expect(result.name).to.equal("My API");
        expect(result.descriptionPath).to.equal("./openapi.json");
        expect(result.headers).to.deep.equal({ Authorization: "Bearer token" });
      });
    });

    describe("spec_v3 transformations", function () {
      it("should transform spec_v2 to spec_v3", function () {
        const result = transformToSchemaKey({
          currentSchema: "spec_v2",
          targetSchema: "spec_v3",
          object: {
            id: "test-spec",
            description: "Test specification",
            file: "./test.md",
            tests: [
              {
                id: "test-1",
                steps: [{ action: "goTo", url: "https://example.com" }],
              },
            ],
          },
        });

        expect(result.specId).to.equal("test-spec");
        expect(result.description).to.equal("Test specification");
        expect(result.contentPath).to.equal("./test.md");
        expect(result.tests).to.be.an("array");
      });
    });

    describe("test_v3 transformations", function () {
      it("should transform test_v2 to test_v3", function () {
        const result = transformToSchemaKey({
          currentSchema: "test_v2",
          targetSchema: "test_v3",
          object: {
            id: "test-1",
            description: "Test description",
            file: "./test.md",
            detectSteps: true,
            setup: "./setup.js",
            cleanup: "./cleanup.js",
            steps: [{ action: "goTo", url: "https://example.com" }],
          },
        });

        expect(result.testId).to.equal("test-1");
        expect(result.description).to.equal("Test description");
        expect(result.contentPath).to.equal("./test.md");
        expect(result.detectSteps).to.equal(true);
        expect(result.before).to.equal("./setup.js");
        expect(result.after).to.equal("./cleanup.js");
        expect(result.steps[0].goTo.url).to.equal("https://example.com");
      });

      it("should transform test_v2 with contexts to test_v3", function () {
        const result = transformToSchemaKey({
          currentSchema: "test_v2",
          targetSchema: "test_v3",
          object: {
            id: "test-1",
            steps: [{ action: "goTo", url: "https://example.com" }],
            contexts: [
              {
                platforms: ["linux"],
                app: { name: "firefox" },
              },
            ],
          },
        });

        expect(result.runOn).to.be.an("array");
        expect(result.runOn[0].platforms).to.deep.equal(["linux"]);
        expect(result.runOn[0].browsers[0].name).to.equal("firefox");
      });

      it("should transform test_v2 with openApi to test_v3", function () {
        const result = transformToSchemaKey({
          currentSchema: "test_v2",
          targetSchema: "test_v3",
          object: {
            id: "test-1",
            steps: [{ action: "goTo", url: "https://example.com" }],
            openApi: [
              {
                name: "API",
                descriptionPath: "./openapi.json",
              },
            ],
          },
        });

        expect(result.openApi).to.be.an("array");
        expect(result.openApi[0].name).to.equal("API");
      });
    });

    describe("config_v3 fileTypes transformations", function () {
      it("should transform config_v2 with fileTypes to config_v3", function () {
        const result = transformToSchemaKey({
          currentSchema: "config_v2",
          targetSchema: "config_v3",
          object: {
            runTests: {
              input: "./docs",
            },
            fileTypes: [
              {
                name: "markdown",
                extensions: [".md", ".markdown"],
                testStartStatementOpen: "<!--",
                testStartStatementClose: "-->",
                testEndStatement: "<!-- end -->",
                testIgnoreStatement: "<!-- ignore -->",
                stepStatementOpen: "<!-- step:",
                stepStatementClose: "-->",
              },
            ],
          },
        });

        expect(result.fileTypes).to.be.an("array");
        expect(result.fileTypes[0].name).to.equal("markdown");
        expect(result.fileTypes[0].extensions).to.deep.equal(["md", "markdown"]);
        expect(result.fileTypes[0].inlineStatements.testStart).to.include("<!--");
        expect(result.fileTypes[0].inlineStatements.testEnd).to.include("end");
      });

      it("should transform config_v2 fileTypes with markup to config_v3", function () {
        const result = transformToSchemaKey({
          currentSchema: "config_v2",
          targetSchema: "config_v3",
          object: {
            runTests: {
              input: "./docs",
            },
            fileTypes: [
              {
                name: "markdown",
                extensions: [".md"],
                testStartStatementOpen: "<!--",
                testStartStatementClose: "-->",
                testEndStatement: "<!-- end -->",
                testIgnoreStatement: "<!-- ignore -->",
                stepStatementOpen: "<!-- step:",
                stepStatementClose: "-->",
                markup: [
                  {
                    name: "link",
                    regex: "\\[(.+?)\\]\\((.+?)\\)",
                  },
                ],
              },
            ],
          },
        });

        expect(result.fileTypes[0].markup).to.be.an("array");
        expect(result.fileTypes[0].markup[0].name).to.equal("link");
        expect(result.fileTypes[0].markup[0].regex).to.include("\\[");
      });

      it("should transform config_v2 fileTypes markup with string actions to config_v3", function () {
        const result = transformToSchemaKey({
          currentSchema: "config_v2",
          targetSchema: "config_v3",
          object: {
            runTests: {
              input: "./docs",
            },
            fileTypes: [
              {
                name: "markdown",
                extensions: [".md"],
                testStartStatementOpen: "<!--",
                testStartStatementClose: "-->",
                testEndStatement: "<!-- end -->",
                testIgnoreStatement: "<!-- ignore -->",
                stepStatementOpen: "<!-- step:",
                stepStatementClose: "-->",
                markup: [
                  {
                    name: "link",
                    regex: "\\[(.+?)\\]\\((.+?)\\)",
                    actions: ["checkLink"],
                  },
                ],
              },
            ],
          },
        });

        expect(result.fileTypes[0].markup[0].actions).to.deep.equal(["checkLink"]);
      });

      it("should transform config_v2 fileTypes markup with object actions to config_v3", function () {
        const result = transformToSchemaKey({
          currentSchema: "config_v2",
          targetSchema: "config_v3",
          object: {
            runTests: {
              input: "./docs",
            },
            fileTypes: [
              {
                name: "markdown",
                extensions: [".md"],
                testStartStatementOpen: "<!--",
                testStartStatementClose: "-->",
                testEndStatement: "<!-- end -->",
                testIgnoreStatement: "<!-- ignore -->",
                stepStatementOpen: "<!-- step:",
                stepStatementClose: "-->",
                markup: [
                  {
                    name: "link",
                    regex: "\\[(.+?)\\]\\((.+?)\\)",
                    actions: [
                      {
                        action: "goTo",
                        url: "https://example.com",
                      },
                    ],
                  },
                ],
              },
            ],
          },
        });

        expect(result.fileTypes[0].markup[0].actions[0].goTo.url).to.equal("https://example.com");
      });

      it("should transform config_v2 fileTypes markup with action params to config_v3", function () {
        const result = transformToSchemaKey({
          currentSchema: "config_v2",
          targetSchema: "config_v3",
          object: {
            runTests: {
              input: "./docs",
            },
            fileTypes: [
              {
                name: "markdown",
                extensions: [".md"],
                testStartStatementOpen: "<!--",
                testStartStatementClose: "-->",
                testEndStatement: "<!-- end -->",
                testIgnoreStatement: "<!-- ignore -->",
                stepStatementOpen: "<!-- step:",
                stepStatementClose: "-->",
                markup: [
                  {
                    name: "link",
                    regex: "\\[(.+?)\\]\\((.+?)\\)",
                    actions: [
                      {
                        name: "goTo",
                        params: {
                          url: "https://example.com",
                        },
                      },
                    ],
                  },
                ],
              },
            ],
          },
        });

        expect(result.fileTypes[0].markup[0].actions[0].goTo.url).to.equal("https://example.com");
      });

      it("should transform config_v2 with openApi integrations to config_v3", function () {
        const result = transformToSchemaKey({
          currentSchema: "config_v2",
          targetSchema: "config_v3",
          object: {
            runTests: {
              input: "./docs",
            },
            integrations: {
              openApi: [
                {
                  name: "My API",
                  descriptionPath: "./openapi.json",
                  requestHeaders: { "X-API-Key": "test" },
                },
              ],
            },
          },
        });

        expect(result.integrations.openApi).to.be.an("array");
        expect(result.integrations.openApi[0].name).to.equal("My API");
        expect(result.integrations.openApi[0].headers).to.deep.equal({ "X-API-Key": "test" });
      });
    });

    describe("spec_v3 with nested transformations", function () {
      it("should transform spec_v2 with contexts to spec_v3", function () {
        const result = transformToSchemaKey({
          currentSchema: "spec_v2",
          targetSchema: "spec_v3",
          object: {
            id: "test-spec",
            tests: [
              {
                id: "test-1",
                steps: [{ action: "goTo", url: "https://example.com" }],
              },
            ],
            contexts: [
              {
                platforms: ["windows"],
                app: { name: "chrome" },
              },
            ],
          },
        });

        expect(result.runOn).to.be.an("array");
        expect(result.runOn[0].platforms).to.deep.equal(["windows"]);
      });

      it("should transform spec_v2 with openApi to spec_v3", function () {
        const result = transformToSchemaKey({
          currentSchema: "spec_v2",
          targetSchema: "spec_v3",
          object: {
            id: "test-spec",
            tests: [
              {
                id: "test-1",
                steps: [{ action: "goTo", url: "https://example.com" }],
              },
            ],
            openApi: [
              {
                name: "API",
                descriptionPath: "./api.json",
              },
            ],
          },
        });

        expect(result.openApi).to.be.an("array");
        expect(result.openApi[0].name).to.equal("API");
      });
    });

    describe("httpRequest_v2 with openApi", function () {
      it("should transform httpRequest_v2 with openApi to step_v3", function () {
        // httpRequest_v3 requires operationId in openApi (not just descriptionPath)
        const result = transformToSchemaKey({
          currentSchema: "httpRequest_v2",
          targetSchema: "step_v3",
          object: {
            method: "GET",
            url: "https://api.example.com",
            openApi: {
              name: "API",
              descriptionPath: "./openapi.json",
              operationId: "getUserById",
              requestHeaders: { Authorization: "Bearer token" },
            },
          },
        });

        expect(result.httpRequest.openApi.name).to.equal("API");
        expect(result.httpRequest.openApi.operationId).to.equal("getUserById");
        expect(result.httpRequest.openApi.headers).to.deep.equal({ Authorization: "Bearer token" });
      });
    });

    describe("error handling", function () {
      it("should throw error when transformation results in invalid object", function () {
        // This should fail because the transformed object won't be valid
        expect(() =>
          transformToSchemaKey({
            currentSchema: "goTo_v2",
            targetSchema: "step_v3",
            object: {
              // Missing required url property
            },
          })
        ).to.throw(/Failed to transform object to step/);
      });

      it("should throw error when openApi_v2 to openApi_v3 transformation results in invalid object", function () {
        // Create an object with an additional property that will fail openApi_v2 validation
        // (additionalProperties: false), and also fail openApi_v3 validation (no descriptionPath or operationId)
        expect(() =>
          transformToSchemaKey({
            currentSchema: "openApi_v2",
            targetSchema: "openApi_v3",
            object: {
              name: "Test API",
              invalidProperty: "this should not exist",
            },
          })
        ).to.throw(/Invalid object/);
      });

      it("should throw error when spec_v2 to spec_v3 transformation results in invalid object", function () {
        expect(() =>
          transformToSchemaKey({
            currentSchema: "spec_v2",
            targetSchema: "spec_v3",
            object: {
              // Create an invalid spec by having invalid nested data
              id: "test-spec",
              contexts: [
                {
                  // Invalid context - browsers array requires valid browser objects
                  app: { name: "invalid_browser_name" }
                }
              ]
            },
          })
        ).to.throw(/Invalid object/);
      });

      it("should throw error when test_v2 to test_v3 transformation results in invalid object", function () {
        expect(() =>
          transformToSchemaKey({
            currentSchema: "test_v2",
            targetSchema: "test_v3",
            object: {
              id: "test-id",
              // Create an invalid test via invalid nested context
              contexts: [
                {
                  // Invalid context - app.name must be a valid browser
                  app: { name: "invalid_browser_name_xyz" }
                }
              ]
            },
          })
        ).to.throw(/Invalid object/);
      });
    });

    describe("dynamic routing (Phase 1 schema foundation)", function () {
      // Positive cases — must validate.
      it("validates a step with onFail conditional goToTest + unconditional stop", function () {
        const result = validate({
          schemaKey: "step_v3",
          object: {
            goTo: { url: "https://example.com" },
            onFail: [
              { if: "$$platform == windows", goToTest: "x" },
              { stop: "test" },
            ],
          },
        });
        expect(result.valid, result.errors).to.be.true;
      });

      it("validates a step with onPass continue:true", function () {
        const result = validate({
          schemaKey: "step_v3",
          object: {
            goTo: { url: "https://example.com" },
            onPass: [{ continue: true }],
          },
        });
        expect(result.valid, result.errors).to.be.true;
      });

      it("validates a step with onFail retry (full) and a retry with only limit", function () {
        const result = validate({
          schemaKey: "step_v3",
          object: {
            goTo: { url: "https://example.com" },
            onFail: [
              { retry: { limit: 3, delay: 1000, backoff: "exponential" } },
              { retry: { limit: 1 } },
            ],
          },
        });
        expect(result.valid, result.errors).to.be.true;
      });

      it("validates a step with onWarning and onSkip arrays", function () {
        const result = validate({
          schemaKey: "step_v3",
          object: {
            goTo: { url: "https://example.com" },
            onWarning: [{ continue: true }],
            onSkip: [{ goToStep: "next-step" }],
          },
        });
        expect(result.valid, result.errors).to.be.true;
      });

      it("validates a step with if as a string", function () {
        const result = validate({
          schemaKey: "step_v3",
          object: {
            goTo: { url: "https://example.com" },
            if: "$$platform == linux",
          },
        });
        expect(result.valid, result.errors).to.be.true;
      });

      it("validates a step with if as an array (logical AND)", function () {
        const result = validate({
          schemaKey: "step_v3",
          object: {
            goTo: { url: "https://example.com" },
            if: ["a", "b"],
          },
        });
        expect(result.valid, result.errors).to.be.true;
      });

      it("validates a step with assertions as a string", function () {
        const result = validate({
          schemaKey: "step_v3",
          object: {
            goTo: { url: "https://example.com" },
            assertions: "$$outputs.exitCode == 0",
          },
        });
        expect(result.valid, result.errors).to.be.true;
      });

      it("validates a step with assertions as an array", function () {
        const result = validate({
          schemaKey: "step_v3",
          object: {
            goTo: { url: "https://example.com" },
            assertions: ["$$outputs.exitCode == 0", "$$outputs.x == 1"],
          },
        });
        expect(result.valid, result.errors).to.be.true;
      });

      it("validates a test with onFail and if", function () {
        const result = validate({
          schemaKey: "test_v3",
          object: {
            steps: [{ goTo: { url: "https://example.com" } }],
            onFail: [{ stop: "spec" }],
            if: "$$platform == mac",
          },
        });
        expect(result.valid, result.errors).to.be.true;
      });

      it("validates a spec with if", function () {
        const result = validate({
          schemaKey: "spec_v3",
          object: {
            tests: [{ steps: [{ goTo: { url: "https://example.com" } }] }],
            if: "$$platform == linux",
          },
        });
        expect(result.valid, result.errors).to.be.true;
      });

      // Negative cases — must reject.
      it("rejects a routing entry with two action keys", function () {
        const result = validate({
          schemaKey: "step_v3",
          object: {
            goTo: { url: "https://example.com" },
            onFail: [{ continue: true, stop: "test" }],
          },
        });
        expect(result.valid).to.be.false;
      });

      it("rejects a routing entry with an unknown key", function () {
        const result = validate({
          schemaKey: "step_v3",
          object: {
            goTo: { url: "https://example.com" },
            onFail: [{ foo: true }],
          },
        });
        expect(result.valid).to.be.false;
      });

      it("rejects a routing entry with no action key (if only)", function () {
        const result = validate({
          schemaKey: "step_v3",
          object: {
            goTo: { url: "https://example.com" },
            onFail: [{ if: "x" }],
          },
        });
        expect(result.valid).to.be.false;
      });

      it("rejects goToStep empty string", function () {
        const result = validate({
          schemaKey: "step_v3",
          object: {
            goTo: { url: "https://example.com" },
            onFail: [{ goToStep: "" }],
          },
        });
        expect(result.valid).to.be.false;
      });

      it("rejects goToTest whitespace-only string", function () {
        const result = validate({
          schemaKey: "step_v3",
          object: {
            goTo: { url: "https://example.com" },
            onFail: [{ goToTest: "   " }],
          },
        });
        expect(result.valid).to.be.false;
      });

      it("rejects stop with an invalid enum value", function () {
        const result = validate({
          schemaKey: "step_v3",
          object: {
            goTo: { url: "https://example.com" },
            onFail: [{ stop: "galaxy" }],
          },
        });
        expect(result.valid).to.be.false;
      });

      it("rejects retry with limit:0", function () {
        const result = validate({
          schemaKey: "step_v3",
          object: {
            goTo: { url: "https://example.com" },
            onFail: [{ retry: { limit: 0 } }],
          },
        });
        expect(result.valid).to.be.false;
      });

      it("rejects retry with limit:-1", function () {
        const result = validate({
          schemaKey: "step_v3",
          object: {
            goTo: { url: "https://example.com" },
            onFail: [{ retry: { limit: -1 } }],
          },
        });
        expect(result.valid).to.be.false;
      });

      it("rejects retry with limit:1.5", function () {
        const result = validate({
          schemaKey: "step_v3",
          object: {
            goTo: { url: "https://example.com" },
            onFail: [{ retry: { limit: 1.5 } }],
          },
        });
        expect(result.valid).to.be.false;
      });

      it("validates retry with delay:0", function () {
        const result = validate({
          schemaKey: "step_v3",
          object: {
            goTo: { url: "https://example.com" },
            onFail: [{ retry: { limit: 1, delay: 0 } }],
          },
        });
        expect(result.valid, result.errors).to.be.true;
      });

      it("validates retry with limit:100 (boundary)", function () {
        const result = validate({
          schemaKey: "step_v3",
          object: {
            goTo: { url: "https://example.com" },
            onFail: [{ retry: { limit: 100 } }],
          },
        });
        expect(result.valid, result.errors).to.be.true;
      });

      it("rejects retry with limit:101 (over maximum)", function () {
        const result = validate({
          schemaKey: "step_v3",
          object: {
            goTo: { url: "https://example.com" },
            onFail: [{ retry: { limit: 101 } }],
          },
        });
        expect(result.valid).to.be.false;
      });

      it("accepts a step result carrying the system-populated attempts field", function () {
        // `attempts` is a result-only, documented step field (like
        // `autoScreenshot`). The top-level step schema is permissive (anyOf,
        // no top-level additionalProperties), so this asserts the field is
        // accepted on a result object — its purpose is schema documentation +
        // generated types, not a runtime constraint.
        const result = validate({
          schemaKey: "step_v3",
          object: { goTo: { url: "https://example.com" }, attempts: 2 },
        });
        expect(result.valid, result.errors).to.be.true;
      });

      it("accepts a step result carrying the system-populated visit field", function () {
        // `visit` is a result-only, documented step field (like `attempts`) set
        // when a routing goToStep re-ran the step. Asserts the field is accepted
        // on a result object.
        const result = validate({
          schemaKey: "step_v3",
          object: { goTo: { url: "https://example.com" }, visit: 2 },
        });
        expect(result.valid, result.errors).to.be.true;
      });

      it("validates retry with delay at the maximum (3600000)", function () {
        const result = validate({
          schemaKey: "step_v3",
          object: {
            goTo: { url: "https://example.com" },
            onFail: [{ retry: { limit: 1, delay: 3600000 } }],
          },
        });
        expect(result.valid, result.errors).to.be.true;
      });

      it("rejects retry with delay above the maximum (3600001)", function () {
        const result = validate({
          schemaKey: "step_v3",
          object: {
            goTo: { url: "https://example.com" },
            onFail: [{ retry: { limit: 1, delay: 3600001 } }],
          },
        });
        expect(result.valid).to.be.false;
      });

      it("rejects continue:false in a routing entry", function () {
        const result = validate({
          schemaKey: "step_v3",
          object: {
            goTo: { url: "https://example.com" },
            onFail: [{ continue: false }],
          },
        });
        expect(result.valid).to.be.false;
      });

      it("rejects a retry entry with no limit", function () {
        const result = validate({
          schemaKey: "step_v3",
          object: {
            goTo: { url: "https://example.com" },
            onFail: [{ retry: {} }],
          },
        });
        expect(result.valid).to.be.false;
      });

      it("rejects if:null (non-coercible to string)", function () {
        const result = validate({
          schemaKey: "step_v3",
          object: {
            goTo: { url: "https://example.com" },
            if: null,
          },
        });
        expect(result.valid).to.be.false;
      });

      it("rejects if as an object (non-coercible to string)", function () {
        const result = validate({
          schemaKey: "step_v3",
          object: {
            goTo: { url: "https://example.com" },
            if: {},
          },
        });
        expect(result.valid).to.be.false;
      });

      it("rejects if as an empty array (minItems)", function () {
        const result = validate({
          schemaKey: "step_v3",
          object: {
            goTo: { url: "https://example.com" },
            if: [],
          },
        });
        expect(result.valid).to.be.false;
      });

      it("rejects if as an array with an empty-string item (pattern)", function () {
        const result = validate({
          schemaKey: "step_v3",
          object: {
            goTo: { url: "https://example.com" },
            if: [""],
          },
        });
        expect(result.valid).to.be.false;
      });

      it("rejects if as an array with a whitespace-only item (pattern)", function () {
        const result = validate({
          schemaKey: "step_v3",
          object: {
            goTo: { url: "https://example.com" },
            if: ["  "],
          },
        });
        expect(result.valid).to.be.false;
      });

      // Level-scoping: test_v3 sets additionalProperties:false, so assertions
      // (a step-level field) is not allowed at the test level.
      it("rejects test-level assertions (not a test field)", function () {
        const result = validate({
          schemaKey: "test_v3",
          object: {
            testId: "t",
            assertions: "$$outputs.exitCode == 0",
            steps: [{ goTo: { url: "https://example.com" } }],
          },
        });
        expect(result.valid).to.be.false;
      });

      // Coercion-by-design regression guards (bug fix): bare numbers/booleans
      // coerce to strings under the global coerceTypes:true, so string-looking
      // conditions like "123"/"0"/"true"/"1.5" must validate, not reject.
      it("validates if as a numeric-looking string", function () {
        for (const v of ["123", "0", "true", "1.5"]) {
          const result = validate({
            schemaKey: "step_v3",
            object: {
              goTo: { url: "https://example.com" },
              if: v,
            },
          });
          expect(result.valid, `${v}: ${result.errors}`).to.be.true;
        }
      });

      it("validates if:123 (coerced to string by design)", function () {
        const result = validate({
          schemaKey: "step_v3",
          object: {
            goTo: { url: "https://example.com" },
            if: 123,
          },
        });
        expect(result.valid, result.errors).to.be.true;
      });

      it("validates if:true (coerced to string by design)", function () {
        const result = validate({
          schemaKey: "step_v3",
          object: {
            goTo: { url: "https://example.com" },
            if: true,
          },
        });
        expect(result.valid, result.errors).to.be.true;
      });

      it("validates assertions as a numeric-looking string", function () {
        const result = validate({
          schemaKey: "step_v3",
          object: {
            goTo: { url: "https://example.com" },
            assertions: "0",
          },
        });
        expect(result.valid, result.errors).to.be.true;
      });
    });

    // Phase 4a.1: articulated assertion records emitted by the runner into the
    // step result. A reusable `assertion_v3` record shape, plus step_v3 now
    // accepting an array of those records under `assertions` (the report shape),
    // while still accepting the custom-input condition string|string[].
    describe("assertion records (Phase 4a.1)", function () {
      it("validates a minimal assertion record", function () {
        const result = validate({
          schemaKey: "assertion_v3",
          object: {
            statement: "exitCode in [0]",
            source: "implicit",
            result: "PASS",
          },
        });
        expect(result.valid, result.errors).to.be.true;
      });

      it("validates a full assertion record", function () {
        const result = validate({
          schemaKey: "assertion_v3",
          object: {
            statement: "exitCode in [0]",
            source: "implicit",
            result: "PASS",
            expected: [0],
            actual: 0,
            description: "Returned exit code 0.",
          },
        });
        expect(result.valid, result.errors).to.be.true;
      });

      it("validates an assertion record with array expected and number actual", function () {
        const result = validate({
          schemaKey: "assertion_v3",
          object: {
            statement: "exitCode in [0]",
            source: "implicit",
            result: "PASS",
            expected: [0],
            actual: 0,
          },
        });
        expect(result.valid, result.errors).to.be.true;
      });

      it("validates an assertion record with string expected and boolean actual (permissive)", function () {
        const result = validate({
          schemaKey: "assertion_v3",
          object: {
            statement: "value matches",
            source: "custom",
            result: "PASS",
            expected: "x",
            actual: true,
          },
        });
        expect(result.valid, result.errors).to.be.true;
      });

      it("rejects an assertion record with permissive expected/actual but missing required result", function () {
        const result = validate({
          schemaKey: "assertion_v3",
          object: {
            statement: "value matches",
            source: "custom",
            expected: "x",
            actual: true,
          },
        });
        expect(result.valid).to.be.false;
      });

      it("rejects an assertion record with an unknown result", function () {
        const result = validate({
          schemaKey: "assertion_v3",
          object: {
            statement: "exitCode in [0]",
            source: "implicit",
            result: "BOGUS",
          },
        });
        expect(result.valid).to.be.false;
      });

      it("rejects an assertion record with an unknown source", function () {
        const result = validate({
          schemaKey: "assertion_v3",
          object: {
            statement: "exitCode in [0]",
            source: "runner",
            result: "PASS",
          },
        });
        expect(result.valid).to.be.false;
      });

      it("rejects an assertion record missing required statement", function () {
        const result = validate({
          schemaKey: "assertion_v3",
          object: {
            source: "implicit",
            result: "PASS",
          },
        });
        expect(result.valid).to.be.false;
      });

      it("rejects an assertion record with additional properties", function () {
        const result = validate({
          schemaKey: "assertion_v3",
          object: {
            statement: "exitCode in [0]",
            source: "implicit",
            result: "PASS",
            severity: "fail",
          },
        });
        expect(result.valid).to.be.false;
      });

      it("validates step_v3 assertions as an array of records (report shape)", function () {
        const result = validate({
          schemaKey: "step_v3",
          object: {
            runShell: { command: "echo hi" },
            assertions: [
              {
                statement: "exitCode in [0]",
                source: "implicit",
                result: "PASS",
                expected: [0],
                actual: 0,
                description: "Returned exit code 0.",
              },
            ],
          },
        });
        expect(result.valid, result.errors).to.be.true;
      });

      it("still validates step_v3 assertions as a condition string (custom input)", function () {
        const result = validate({
          schemaKey: "step_v3",
          object: {
            goTo: { url: "https://example.com" },
            assertions: "$$outputs.exitCode == 0",
          },
        });
        expect(result.valid, result.errors).to.be.true;
      });

      it("rejects step_v3 assertions as an array of malformed records", function () {
        const result = validate({
          schemaKey: "step_v3",
          object: {
            runShell: { command: "echo hi" },
            assertions: [{ source: "implicit", result: "PASS" }],
          },
        });
        expect(result.valid).to.be.false;
      });
    });

    describe("background processes (runShell/runCode) and closeSurface", function () {
      it("should validate a background runShell with a port condition", function () {
        const result = validate({
          schemaKey: "step_v3",
          object: {
            runShell: {
              command: "docker run -p 5432:5432 postgres",
              background: { name: "db", waitUntil: { port: 5432 } },
            },
          },
        });
        expect(result.valid).to.be.true;
        expect(result.errors).to.equal("");
      });

      it("should validate a background runShell with a stdio condition", function () {
        const result = validate({
          schemaKey: "step_v3",
          object: {
            runShell: {
              command: "my-server",
              background: {
                name: "srv",
                waitUntil: { stdio: "/ready to accept/" },
              },
            },
          },
        });
        expect(result.valid).to.be.true;
        expect(result.errors).to.equal("");
      });

      it("should validate a background runShell with an httpGet condition", function () {
        const result = validate({
          schemaKey: "step_v3",
          object: {
            runShell: {
              command: "my-server",
              background: {
                name: "web",
                waitUntil: { httpGet: "http://localhost:8080" },
              },
              timeout: 30000,
            },
          },
        });
        expect(result.valid).to.be.true;
        expect(result.errors).to.equal("");
      });

      it("should validate a background runShell with a delayMs condition", function () {
        const result = validate({
          schemaKey: "step_v3",
          object: {
            runShell: {
              command: "my-server",
              background: { name: "srv", waitUntil: { delayMs: 2000 } },
            },
          },
        });
        expect(result.valid).to.be.true;
        expect(result.errors).to.equal("");
      });

      it("should validate multiple waitUntil conditions combined", function () {
        const result = validate({
          schemaKey: "step_v3",
          object: {
            runShell: {
              command: "my-server",
              background: {
                name: "srv",
                waitUntil: {
                  port: 5432,
                  stdio: "/ready/",
                  httpGet: "http://localhost:8080/health",
                  delayMs: 1000,
                },
              },
            },
          },
        });
        expect(result.valid).to.be.true;
        expect(result.errors).to.equal("");
      });

      it("should validate a background with no waitUntil (ready on spawn)", function () {
        const result = validate({
          schemaKey: "step_v3",
          object: {
            runShell: {
              command: "my-server",
              background: { name: "srv" },
            },
          },
        });
        expect(result.valid).to.be.true;
        expect(result.errors).to.equal("");
      });

      it("should validate a background runCode with a port condition", function () {
        const result = validate({
          schemaKey: "step_v3",
          object: {
            runCode: {
              language: "javascript",
              code: "require('http').createServer((q,r)=>r.end('ok')).listen(8088)",
              background: { name: "api", waitUntil: { port: 8088 } },
            },
          },
        });
        expect(result.valid).to.be.true;
        expect(result.errors).to.equal("");
      });

      it("should validate a background runShell with tty:true", function () {
        const result = validate({
          schemaKey: "step_v3",
          object: {
            runShell: {
              command: "claude",
              background: { name: "x", tty: true },
            },
          },
        });
        expect(result.valid).to.be.true;
        expect(result.errors).to.equal("");
      });

      it("should validate a background runShell with tty:false", function () {
        const result = validate({
          schemaKey: "step_v3",
          object: {
            runShell: {
              command: "node -i",
              background: { name: "x", tty: false },
            },
          },
        });
        expect(result.valid).to.be.true;
        expect(result.errors).to.equal("");
      });

      it("should validate a background runShell with tty + waitUntil", function () {
        const result = validate({
          schemaKey: "step_v3",
          object: {
            runShell: {
              command: "claude",
              background: { name: "x", tty: true, waitUntil: { stdio: "/r/" } },
            },
          },
        });
        expect(result.valid).to.be.true;
        expect(result.errors).to.equal("");
      });

      it("should reject a background runShell with a non-boolean tty", function () {
        const result = validate({
          schemaKey: "step_v3",
          object: {
            runShell: {
              command: "claude",
              background: { name: "x", tty: "yes" },
            },
          },
        });
        expect(result.valid).to.be.false;
        expect(result.errors).to.be.a("string");
      });

      it("should validate a background runCode with tty:true", function () {
        const result = validate({
          schemaKey: "step_v3",
          object: {
            runCode: {
              language: "python",
              code: "print('hi')",
              background: { name: "x", tty: true },
            },
          },
        });
        expect(result.valid).to.be.true;
        expect(result.errors).to.equal("");
      });

      it("should validate a background runCode with tty:false", function () {
        const result = validate({
          schemaKey: "step_v3",
          object: {
            runCode: {
              language: "python",
              code: "print('hi')",
              background: { name: "x", tty: false },
            },
          },
        });
        expect(result.valid).to.be.true;
        expect(result.errors).to.equal("");
      });

      it("should validate a background runCode with tty + waitUntil", function () {
        const result = validate({
          schemaKey: "step_v3",
          object: {
            runCode: {
              language: "python",
              code: "print('hi')",
              background: { name: "x", tty: true, waitUntil: { stdio: "/r/" } },
            },
          },
        });
        expect(result.valid).to.be.true;
        expect(result.errors).to.equal("");
      });

      it("should reject a background runCode with a non-boolean tty", function () {
        const result = validate({
          schemaKey: "step_v3",
          object: {
            runCode: {
              language: "python",
              code: "print('hi')",
              background: { name: "x", tty: "yes" },
            },
          },
        });
        expect(result.valid).to.be.false;
        expect(result.errors).to.be.a("string");
      });

      it("should validate a closeSurface step (string name)", function () {
        const result = validate({
          schemaKey: "step_v3",
          object: { closeSurface: "db" },
        });
        expect(result.valid).to.be.true;
        expect(result.errors).to.equal("");
      });

      it("should validate a closeSurface step (process object form)", function () {
        const result = validate({
          schemaKey: "step_v3",
          object: { closeSurface: { process: "db" } },
        });
        expect(result.valid).to.be.true;
        expect(result.errors).to.equal("");
      });

      it("should validate a closeSurface step (array of surfaces)", function () {
        const result = validate({
          schemaKey: "step_v3",
          object: { closeSurface: ["db", { process: "web" }] },
        });
        expect(result.valid).to.be.true;
        expect(result.errors).to.equal("");
      });

      it("should reject an empty closeSurface array", function () {
        const result = validate({
          schemaKey: "step_v3",
          object: { closeSurface: [] },
        });
        expect(result.valid).to.be.false;
        expect(result.errors).to.be.a("string");
      });

      it("should reject an empty closeSurface object", function () {
        const result = validate({
          schemaKey: "step_v3",
          object: { closeSurface: {} },
        });
        expect(result.valid).to.be.false;
        expect(result.errors).to.be.a("string");
      });

      it("should reject a closeSurface process object with an extra key", function () {
        const result = validate({
          schemaKey: "step_v3",
          object: { closeSurface: { process: "db", bogus: true } },
        });
        expect(result.valid).to.be.false;
        expect(result.errors).to.be.a("string");
      });

      it("should reject a background that is not an object (e.g. true)", function () {
        const result = validate({
          schemaKey: "step_v3",
          object: {
            runShell: { command: "my-server", background: true },
          },
        });
        expect(result.valid).to.be.false;
        expect(result.errors).to.be.a("string");
      });

      it("should reject an unknown key inside background", function () {
        const result = validate({
          schemaKey: "step_v3",
          object: {
            runShell: {
              command: "my-server",
              background: { name: "srv", bogus: true },
            },
          },
        });
        expect(result.valid).to.be.false;
        expect(result.errors).to.be.a("string");
      });

      it("should reject an unknown key inside waitUntil", function () {
        const result = validate({
          schemaKey: "step_v3",
          object: {
            runShell: {
              command: "my-server",
              background: { name: "srv", waitUntil: { tcp: 5432 } },
            },
          },
        });
        expect(result.valid).to.be.false;
        expect(result.errors).to.be.a("string");
      });

      it("should reject an empty waitUntil object (no conditions)", function () {
        const result = validate({
          schemaKey: "step_v3",
          object: {
            runShell: {
              command: "my-server",
              background: { name: "srv", waitUntil: {} },
            },
          },
        });
        expect(result.valid).to.be.false;
        expect(result.errors).to.be.a("string");
      });

      it("should reject an empty-string stdio condition", function () {
        const result = validate({
          schemaKey: "step_v3",
          object: {
            runShell: {
              command: "my-server",
              background: { name: "srv", waitUntil: { stdio: "" } },
            },
          },
        });
        expect(result.valid).to.be.false;
        expect(result.errors).to.be.a("string");
      });

      it("should reject the old object-shaped port condition", function () {
        const result = validate({
          schemaKey: "step_v3",
          object: {
            runShell: {
              command: "my-server",
              background: { name: "srv", waitUntil: { port: { port: 5432 } } },
            },
          },
        });
        expect(result.valid).to.be.false;
        expect(result.errors).to.be.a("string");
      });

      it("should reject a background runShell without a name", function () {
        const result = validate({
          schemaKey: "step_v3",
          object: {
            runShell: {
              command: "my-server",
              background: { waitUntil: { delayMs: 1000 } },
            },
          },
        });
        expect(result.valid).to.be.false;
        expect(result.errors).to.be.a("string");
      });

      it("should reject a background runCode without a name", function () {
        const result = validate({
          schemaKey: "step_v3",
          object: {
            runCode: {
              language: "bash",
              code: "sleep 100",
              background: { waitUntil: { delayMs: 1000 } },
            },
          },
        });
        expect(result.valid).to.be.false;
        expect(result.errors).to.be.a("string");
      });

      it("should reject a waitUntil port that is out of range", function () {
        const result = validate({
          schemaKey: "step_v3",
          object: {
            runShell: {
              command: "my-server",
              background: { name: "srv", waitUntil: { port: 70000 } },
            },
          },
        });
        expect(result.valid).to.be.false;
        expect(result.errors).to.be.a("string");
      });

      it("should reject a whitespace-only closeSurface name", function () {
        const result = validate({
          schemaKey: "step_v3",
          object: { closeSurface: "   " },
        });
        expect(result.valid).to.be.false;
        expect(result.errors).to.be.a("string");
      });

      it("should reject a background process with a whitespace-only name", function () {
        const result = validate({
          schemaKey: "step_v3",
          object: {
            runShell: {
              command: "my-server",
              background: { name: "   ", waitUntil: { delayMs: 1000 } },
            },
          },
        });
        expect(result.valid).to.be.false;
        expect(result.errors).to.be.a("string");
      });
    });

    describe("type to a process surface", function () {
      it("should validate surface as a string", function () {
        const result = validate({
          schemaKey: "step_v3",
          object: { type: { keys: ["2+2", "$ENTER$"], surface: "node" } },
        });
        expect(result.valid).to.be.true;
        expect(result.errors).to.equal("");
      });

      it("should validate surface as a process object", function () {
        const result = validate({
          schemaKey: "step_v3",
          object: {
            type: { keys: ["2+2", "$ENTER$"], surface: { process: "node" } },
          },
        });
        expect(result.valid).to.be.true;
        expect(result.errors).to.equal("");
      });

      it("should validate surface + waitUntil.stdio + timeout", function () {
        const result = validate({
          schemaKey: "step_v3",
          object: {
            type: {
              keys: ["2+2", "$ENTER$"],
              surface: "node",
              waitUntil: { stdio: "/4/" },
              timeout: 5000,
            },
          },
        });
        expect(result.valid).to.be.true;
        expect(result.errors).to.equal("");
      });

      it("should validate surface + waitUntil.delayMs", function () {
        const result = validate({
          schemaKey: "step_v3",
          object: {
            type: {
              keys: ["slow build"],
              surface: "node",
              waitUntil: { delayMs: 0 },
            },
          },
        });
        expect(result.valid).to.be.true;
        expect(result.errors).to.equal("");
      });

      it("should reject an empty surface object", function () {
        const result = validate({
          schemaKey: "step_v3",
          object: { type: { keys: ["x"], surface: {} } },
        });
        expect(result.valid).to.be.false;
        expect(result.errors).to.be.a("string");
      });

      it("should validate a browser surface object (Phase 3 branch)", function () {
        const result = validate({
          schemaKey: "step_v3",
          object: { type: { keys: ["x"], surface: { browser: "chrome" } } },
        });
        expect(result.valid).to.be.true;
        expect(result.errors).to.equal("");
      });

      it("should reject a process surface with an extra key", function () {
        const result = validate({
          schemaKey: "step_v3",
          object: {
            type: { keys: ["x"], surface: { process: "n", bogus: 1 } },
          },
        });
        expect(result.valid).to.be.false;
        expect(result.errors).to.be.a("string");
      });

      it("should reject an empty waitUntil (minProperties)", function () {
        const result = validate({
          schemaKey: "step_v3",
          object: {
            type: { keys: ["x"], surface: "node", waitUntil: {} },
          },
        });
        expect(result.valid).to.be.false;
        expect(result.errors).to.be.a("string");
      });

      it("should reject a port probe in type waitUntil (service-only)", function () {
        const result = validate({
          schemaKey: "step_v3",
          object: {
            type: {
              keys: ["x"],
              surface: "node",
              waitUntil: { port: { port: 3000 } },
            },
          },
        });
        expect(result.valid).to.be.false;
        expect(result.errors).to.be.a("string");
      });

      it("should reject waitUntil without a surface", function () {
        const result = validate({
          schemaKey: "step_v3",
          object: { type: { keys: ["x"], waitUntil: { stdio: "/4/" } } },
        });
        expect(result.valid).to.be.false;
        expect(result.errors).to.be.a("string");
      });

      it("should reject a process surface combined with element targeting", function () {
        const result = validate({
          schemaKey: "step_v3",
          object: {
            type: {
              keys: ["x"],
              surface: { process: "node" },
              selector: "#q",
            },
          },
        });
        expect(result.valid).to.be.false;
        expect(result.errors).to.be.a("string");
      });
    });

    describe("browser surfaces (Phase 3): window/tab targeting", function () {
      // --- surface browser branch shapes ---

      it("should validate a full browser surface (engine + window + tab)", function () {
        const result = validate({
          schemaKey: "step_v3",
          object: {
            click: {
              selector: "#checkout",
              surface: { browser: "chrome", window: "main", tab: "cart" },
            },
          },
        });
        expect(result.valid).to.be.true;
        expect(result.errors).to.equal("");
      });

      it("should validate tab selection by index and negative index", function () {
        for (const tab of [0, 2, -1, -2]) {
          const result = validate({
            schemaKey: "step_v3",
            object: {
              find: { elementText: "Order", surface: { browser: "firefox", tab } },
            },
          });
          expect(result.valid, `tab: ${tab}`).to.be.true;
          expect(result.errors).to.equal("");
        }
      });

      it("should validate tab/window selection by criteria object", function () {
        const result = validate({
          schemaKey: "step_v3",
          object: {
            find: {
              elementText: "Order #",
              surface: {
                browser: "chrome",
                window: { name: "admin" },
                tab: { title: "/Cart/", url: "/checkout/", index: 1 },
              },
            },
          },
        });
        expect(result.valid).to.be.true;
        expect(result.errors).to.equal("");
      });

      it("should validate a browser surface with a name (multi-browser targeting)", function () {
        const result = validate({
          schemaKey: "step_v3",
          object: {
            click: { selector: "#a", surface: { browser: "chrome", name: "secondary" } },
          },
        });
        expect(result.valid).to.be.true;
        expect(result.errors).to.equal("");
      });

      it("should reject an unknown browser engine", function () {
        const result = validate({
          schemaKey: "step_v3",
          object: { click: { selector: "#a", surface: { browser: "opera" } } },
        });
        expect(result.valid).to.be.false;
        expect(result.errors).to.be.a("string");
      });

      it("should reject a browser surface with an extra key", function () {
        const result = validate({
          schemaKey: "step_v3",
          object: {
            click: { selector: "#a", surface: { browser: "chrome", bogus: 1 } },
          },
        });
        expect(result.valid).to.be.false;
        expect(result.errors).to.be.a("string");
      });

      it("should reject an empty tab selector object", function () {
        const result = validate({
          schemaKey: "step_v3",
          object: {
            click: { selector: "#a", surface: { browser: "chrome", tab: {} } },
          },
        });
        expect(result.valid).to.be.false;
        expect(result.errors).to.be.a("string");
      });

      it("should reject a tab selector object with unknown keys", function () {
        const result = validate({
          schemaKey: "step_v3",
          object: {
            click: { selector: "#a", surface: { browser: "chrome", tab: { handle: "x" } } },
          },
        });
        expect(result.valid).to.be.false;
        expect(result.errors).to.be.a("string");
      });

      it("coerces a non-integer tab index to a name string (coerceTypes)", function () {
        // Ajv runs with coerceTypes: true, so 1.5 can't be rejected while the
        // by-name string branch exists — it coerces to the name "1.5", which
        // resolves (and cleanly no-matches) at runtime like any other name.
        const result = validate({
          schemaKey: "step_v3",
          object: {
            click: { selector: "#a", surface: { browser: "chrome", tab: 1.5 } },
          },
        });
        expect(result.valid).to.be.true;
        expect(result.object.click.surface.tab).to.equal("1.5");
      });

      // --- per-step wiring (allowed kinds only) ---

      it("should validate surface (string form) on every browser-targeting step", function () {
        const steps = [
          { click: { selector: "#a", surface: "chrome" } },
          { find: { elementText: "Cart", surface: "chrome" } },
          {
            dragAndDrop: { source: "#a", target: "#b", surface: "chrome" },
          },
          { runBrowserScript: { script: "return 1;", surface: "chrome" } },
          { screenshot: { path: "shot.png", surface: "chrome" } },
          { record: { path: "rec.mp4", surface: "chrome" } },
          { goTo: { url: "https://example.com", surface: "chrome" } },
        ];
        for (const step of steps) {
          const result = validate({ schemaKey: "step_v3", object: step });
          expect(result.valid, JSON.stringify(step)).to.be.true;
          expect(result.errors).to.equal("");
        }
      });

      it("should validate surface (browser object form) on every browser-targeting step", function () {
        const surface = { browser: "chrome", tab: "cart" };
        const steps = [
          { click: { selector: "#a", surface } },
          { find: { elementText: "Cart", surface } },
          { dragAndDrop: { source: "#a", target: "#b", surface } },
          { runBrowserScript: { script: "return 1;", surface } },
          { screenshot: { path: "shot.png", surface } },
          { record: { path: "rec.mp4", surface } },
          { goTo: { url: "https://example.com", surface } },
          { type: { keys: ["hi"], selector: "#q", surface } },
        ];
        for (const step of steps) {
          const result = validate({ schemaKey: "step_v3", object: step });
          expect(result.valid, JSON.stringify(step)).to.be.true;
          expect(result.errors).to.equal("");
        }
      });

      it("should reject a process surface on browser-only steps", function () {
        const surface = { process: "web" };
        const steps = [
          { click: { selector: "#a", surface } },
          { find: { elementText: "Cart", surface } },
          { dragAndDrop: { source: "#a", target: "#b", surface } },
          { runBrowserScript: { script: "return 1;", surface } },
          { screenshot: { path: "shot.png", surface } },
          { record: { path: "rec.mp4", surface } },
          { goTo: { url: "https://example.com", surface } },
        ];
        for (const step of steps) {
          const result = validate({ schemaKey: "step_v3", object: step });
          expect(result.valid, JSON.stringify(step)).to.be.false;
          expect(result.errors).to.be.a("string");
        }
      });

      it("should reject a process-NAME string surface on browser-only steps", function () {
        // Browser-only steps can never target a process, so the bare-string
        // form is restricted to the engine enum — a process name like "web"
        // must be rejected at validation time, not left to fail at runtime.
        const surface = "web";
        const steps = [
          { click: { selector: "#a", surface } },
          { find: { elementText: "Cart", surface } },
          { dragAndDrop: { source: "#a", target: "#b", surface } },
          { runBrowserScript: { script: "return 1;", surface } },
          { screenshot: { path: "shot.png", surface } },
          { record: { path: "rec.mp4", surface } },
          { goTo: { url: "https://example.com", surface } },
        ];
        for (const step of steps) {
          const result = validate({ schemaKey: "step_v3", object: step });
          expect(result.valid, JSON.stringify(step)).to.be.false;
          expect(result.errors).to.be.a("string");
        }
      });

      it("should still validate a process-NAME string surface on type/closeSurface (all kinds allowed)", function () {
        const result1 = validate({
          schemaKey: "step_v3",
          object: { type: { keys: ["x"], surface: "web" } },
        });
        expect(result1.valid).to.be.true;
        expect(result1.errors).to.equal("");
        const result2 = validate({
          schemaKey: "step_v3",
          object: { closeSurface: "web" },
        });
        expect(result2.valid).to.be.true;
        expect(result2.errors).to.equal("");
      });

      it("should reject an unknown engine keyword as a bare-string surface on browser-only steps", function () {
        const result = validate({
          schemaKey: "step_v3",
          object: { click: { selector: "#a", surface: "opera" } },
        });
        expect(result.valid).to.be.false;
        expect(result.errors).to.be.a("string");
      });

      // --- goTo newTab / newWindow ---

      it("should validate every newTab shape", function () {
        for (const newTab of [true, false, "cart", { name: "cart" }]) {
          const result = validate({
            schemaKey: "step_v3",
            object: { goTo: { url: "https://example.com", newTab } },
          });
          expect(result.valid, JSON.stringify(newTab)).to.be.true;
          expect(result.errors).to.equal("");
        }
      });

      it("should validate every newWindow shape", function () {
        for (const newWindow of [
          true,
          false,
          "admin",
          { name: "admin" },
          { name: "admin", tab: "overview" },
          { tab: "overview" },
        ]) {
          const result = validate({
            schemaKey: "step_v3",
            object: { goTo: { url: "https://example.com", newWindow } },
          });
          expect(result.valid, JSON.stringify(newWindow)).to.be.true;
          expect(result.errors).to.equal("");
        }
      });

      it("should validate newTab combined with a surface window selector", function () {
        const result = validate({
          schemaKey: "step_v3",
          object: {
            goTo: {
              url: "/checkout",
              surface: { browser: "chrome", window: "main" },
              newTab: "cart",
            },
          },
        });
        expect(result.valid).to.be.true;
        expect(result.errors).to.equal("");
      });

      it("should reject newTab and newWindow together", function () {
        const result = validate({
          schemaKey: "step_v3",
          object: {
            goTo: { url: "https://example.com", newTab: "a", newWindow: "b" },
          },
        });
        expect(result.valid).to.be.false;
        expect(result.errors).to.be.a("string");
      });

      it("should reject newTab combined with a surface tab selector", function () {
        const result = validate({
          schemaKey: "step_v3",
          object: {
            goTo: {
              url: "/checkout",
              surface: { browser: "chrome", tab: "cart" },
              newTab: true,
            },
          },
        });
        expect(result.valid).to.be.false;
        expect(result.errors).to.be.a("string");
      });

      it("should reject newWindow combined with a surface window or tab selector", function () {
        for (const surface of [
          { browser: "chrome", window: "main" },
          { browser: "chrome", tab: "cart" },
        ]) {
          const result = validate({
            schemaKey: "step_v3",
            object: {
              goTo: { url: "/admin", surface, newWindow: true },
            },
          });
          expect(result.valid, JSON.stringify(surface)).to.be.false;
          expect(result.errors).to.be.a("string");
        }
      });

      it("should reject a whitespace-only newTab name", function () {
        const result = validate({
          schemaKey: "step_v3",
          object: { goTo: { url: "https://example.com", newTab: "   " } },
        });
        expect(result.valid).to.be.false;
        expect(result.errors).to.be.a("string");
      });

      it("should reject unknown keys inside newTab/newWindow objects", function () {
        for (const goTo of [
          { url: "https://example.com", newTab: { name: "a", bogus: 1 } },
          { url: "https://example.com", newWindow: { name: "a", bogus: 1 } },
        ]) {
          const result = validate({ schemaKey: "step_v3", object: { goTo } });
          expect(result.valid, JSON.stringify(goTo)).to.be.false;
          expect(result.errors).to.be.a("string");
        }
      });

      // --- type readiness with a browser surface ---

      it("should validate type + browser surface + browser waitUntil", function () {
        const result = validate({
          schemaKey: "step_v3",
          object: {
            type: {
              keys: ["hello", "$ENTER$"],
              selector: "#q",
              surface: { browser: "chrome", tab: "cart" },
              waitUntil: {
                networkIdleTime: 500,
                domIdleTime: 1000,
                find: { selector: ".result" },
              },
              timeout: 10000,
            },
          },
        });
        expect(result.valid).to.be.true;
        expect(result.errors).to.equal("");
      });

      it("should reject type + browser surface + process waitUntil (stdio)", function () {
        const result = validate({
          schemaKey: "step_v3",
          object: {
            type: {
              keys: ["x"],
              surface: { browser: "chrome" },
              waitUntil: { stdio: "/4/" },
            },
          },
        });
        expect(result.valid).to.be.false;
        expect(result.errors).to.be.a("string");
      });

      it("should reject type + process surface + browser waitUntil (find)", function () {
        const result = validate({
          schemaKey: "step_v3",
          object: {
            type: {
              keys: ["x"],
              surface: { process: "node" },
              waitUntil: { find: { selector: ".ready" } },
            },
          },
        });
        expect(result.valid).to.be.false;
        expect(result.errors).to.be.a("string");
      });

      it("should validate type + browser-engine STRING surface + browser waitUntil", function () {
        const result = validate({
          schemaKey: "step_v3",
          object: {
            type: {
              keys: ["x"],
              surface: "chrome",
              waitUntil: { find: { selector: ".ready" } },
            },
          },
        });
        expect(result.valid).to.be.true;
        expect(result.errors).to.equal("");
      });

      it("should reject type + browser-engine STRING surface + process waitUntil (stdio)", function () {
        const result = validate({
          schemaKey: "step_v3",
          object: {
            type: {
              keys: ["x"],
              surface: "chrome",
              waitUntil: { stdio: "/ready/" },
            },
          },
        });
        expect(result.valid).to.be.false;
        expect(result.errors).to.be.a("string");
      });

      it("should still validate a process (non-engine) STRING surface with stdio waitUntil", function () {
        const result = validate({
          schemaKey: "step_v3",
          object: {
            type: {
              keys: ["x"],
              surface: "node",
              waitUntil: { stdio: "/ready/" },
            },
          },
        });
        expect(result.valid).to.be.true;
        expect(result.errors).to.equal("");
      });

      it("should trim a criteria-object name selector the same as the by-name form", function () {
        const result = validate({
          schemaKey: "step_v3",
          object: {
            click: {
              selector: "#a",
              surface: { browser: "chrome", tab: { name: " cart " } },
            },
          },
        });
        expect(result.valid).to.be.true;
        expect(result.object.click.surface.tab.name).to.equal("cart");
      });

      // --- closeSurface browser forms ---

      it("should validate closeSurface with a browser tab reference", function () {
        const result = validate({
          schemaKey: "step_v3",
          object: { closeSurface: { browser: "chrome", tab: "cart" } },
        });
        expect(result.valid).to.be.true;
        expect(result.errors).to.equal("");
      });

      it("should validate closeSurface with a browser window reference", function () {
        const result = validate({
          schemaKey: "step_v3",
          object: { closeSurface: { browser: "chrome", window: "admin" } },
        });
        expect(result.valid).to.be.true;
        expect(result.errors).to.equal("");
      });

      it("should validate a mixed closeSurface array (process + browser tab)", function () {
        const result = validate({
          schemaKey: "step_v3",
          object: {
            closeSurface: [
              "web",
              { process: "api" },
              { browser: "chrome", tab: -1 },
            ],
          },
        });
        expect(result.valid).to.be.true;
        expect(result.errors).to.equal("");
      });

      it("should reject a closeSurface browser object with an extra key", function () {
        const result = validate({
          schemaKey: "step_v3",
          object: {
            closeSurface: { browser: "chrome", tab: "cart", bogus: true },
          },
        });
        expect(result.valid).to.be.false;
        expect(result.errors).to.be.a("string");
      });
    });

    describe("browser surfaces (Phase 4): multiple browsers", function () {
      // Phase 4 activates shapes Phase 3 shipped schema-side but gated at
      // runtime (ADR 01019). These pins keep the multi-browser forms valid.

      it("should validate goTo opening a second engine by bare keyword", function () {
        const result = validate({
          schemaKey: "step_v3",
          object: {
            goTo: { url: "https://example.com/admin", surface: "firefox" },
          },
        });
        expect(result.valid).to.be.true;
        expect(result.errors).to.equal("");
      });

      it("should validate goTo opening a named browser surface", function () {
        const result = validate({
          schemaKey: "step_v3",
          object: {
            goTo: {
              url: "https://example.com",
              surface: { browser: "chrome", name: "shopper" },
            },
          },
        });
        expect(result.valid).to.be.true;
        expect(result.errors).to.equal("");
      });

      it("should validate a named browser surface with window/tab selectors", function () {
        const result = validate({
          schemaKey: "step_v3",
          object: {
            type: {
              keys: ["hi"],
              selector: "#q",
              surface: { browser: "chrome", name: "shopper", window: "main", tab: -1 },
            },
          },
        });
        expect(result.valid).to.be.true;
        expect(result.errors).to.equal("");
      });

      it("should validate whole-browser closeSurface forms", function () {
        for (const closeSurface of [
          "chrome",
          { browser: "firefox" },
          { browser: "chrome", name: "shopper" },
        ]) {
          const result = validate({
            schemaKey: "step_v3",
            object: { closeSurface },
          });
          expect(result.valid, JSON.stringify(closeSurface)).to.be.true;
          expect(result.errors).to.equal("");
        }
      });

      it("should validate a closeSurface array mixing whole browsers and a process", function () {
        const result = validate({
          schemaKey: "step_v3",
          object: {
            closeSurface: ["chrome", { browser: "firefox", name: "admin" }, { process: "api" }],
          },
        });
        expect(result.valid).to.be.true;
        expect(result.errors).to.equal("");
      });

      it("should reject a named browser surface with an empty name", function () {
        const result = validate({
          schemaKey: "step_v3",
          object: {
            click: { selector: "#a", surface: { browser: "chrome", name: "  " } },
          },
        });
        expect(result.valid).to.be.false;
        expect(result.errors).to.be.a("string");
      });
    });
  });
