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

      it("should validate a config_v3 object with each supported shell", function () {
        for (const shell of ["bash", "cmd", "powershell"]) {
          const result = validate({
            schemaKey: "config_v3",
            object: { shell },
          });

          expect(result.valid, `expected valid: ${shell} — ${result.errors}`).to
            .be.true;
          expect(result.object.shell).to.equal(shell);
        }
      });

      it("should default config_v3 shell to bash when unset", function () {
        const result = validate({
          schemaKey: "config_v3",
          object: {},
        });

        expect(result.valid).to.be.true;
        expect(result.object.shell).to.equal("bash");
      });

      it("should reject a config_v3 object whose shell is not a supported shell", function () {
        for (const bad of ["zsh", "sh", "", true]) {
          const result = validate({
            schemaKey: "config_v3",
            object: { shell: bad },
          });

          expect(result.valid, `expected invalid: ${JSON.stringify(bad)}`).to.be
            .false;
          expect(result.errors).to.be.a("string");
        }
      });

      it("should validate a runShell step with each supported shell", function () {
        for (const shell of ["bash", "cmd", "powershell"]) {
          const result = validate({
            schemaKey: "step_v3",
            object: { runShell: { command: "echo hello", shell } },
          });

          expect(result.valid, `expected valid: ${shell} — ${result.errors}`).to
            .be.true;
          expect(result.object.runShell.shell).to.equal(shell);
        }
      });

      it("should not default shell on a runShell step when unset", function () {
        // No schema default at the step level — an absent value must stay
        // absent so the runtime can defer to the config-level `shell` default.
        const result = validate({
          schemaKey: "step_v3",
          object: { runShell: { command: "echo hello" } },
        });

        expect(result.valid, result.errors).to.be.true;
        expect(result.object.runShell.shell).to.equal(undefined);
      });

      it("should reject a runShell step whose shell is not a supported shell", function () {
        for (const bad of ["zsh", "sh", "", 5]) {
          const result = validate({
            schemaKey: "step_v3",
            object: { runShell: { command: "echo hello", shell: bad } },
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

      it("should validate a record step targeting an app surface", function () {
        const result = validate({
          schemaKey: "step_v3",
          object: { record: { path: "out.mp4", surface: { app: "notepad" } } },
        });
        expect(result.valid, result.errors).to.be.true;
      });

      it("should validate a record step targeting an app surface with a window selector", function () {
        const result = validate({
          schemaKey: "step_v3",
          object: {
            record: {
              path: "out.mp4",
              surface: { app: "notepad", window: -1 },
            },
          },
        });
        expect(result.valid, result.errors).to.be.true;
      });

      it("should reject a record step with an invalid app surface", function () {
        // Note: primitive values coerce under ajv coerceTypes (7 -> "7"), so
        // the type negative uses an object, which never coerces to a string.
        for (const surface of [
          { app: "" },
          { app: {} },
          { app: "notepad", tab: 1 },
        ]) {
          const result = validate({
            schemaKey: "step_v3",
            object: { record: { path: "out.mp4", surface } },
          });
          expect(
            result.valid,
            `expected invalid surface: ${JSON.stringify(surface)}`
          ).to.be.false;
        }
      });

      it("should not inject a default engine target during validation", function () {
        const result = validate({
          schemaKey: "step_v3",
          object: { record: { path: "out.mp4", engine: { name: "ffmpeg" } } },
        });
        expect(result.valid, result.errors).to.be.true;
        expect(result.object.record.engine.target).to.equal(undefined);
      });

      it("should validate every record overwrite enum value including aboveVariation", function () {
        for (const overwrite of ["true", "false", "aboveVariation"]) {
          const result = validate({
            schemaKey: "step_v3",
            object: { record: { path: "out.mp4", overwrite } },
          });
          expect(result.valid, `overwrite: ${overwrite} -> ${result.errors}`).to
            .be.true;
        }
      });

      it("should reject a record step with an invalid overwrite value", function () {
        const result = validate({
          schemaKey: "step_v3",
          object: { record: { path: "out.mp4", overwrite: "sometimes" } },
        });
        expect(result.valid).to.be.false;
      });

      it("should validate a record step with verify guards", function () {
        for (const verify of [
          {},
          { minDuration: 1 },
          { minDuration: 0.5, maxDuration: 30 },
          { resolution: true },
          { resolution: false },
          { resolution: { width: 1280, height: 720 } },
          { notBlack: true },
          {
            minDuration: 1,
            resolution: { width: 640, height: 480 },
            notBlack: true,
          },
        ]) {
          const result = validate({
            schemaKey: "step_v3",
            object: { record: { path: "out.mp4", verify } },
          });
          expect(
            result.valid,
            `verify: ${JSON.stringify(verify)} -> ${result.errors}`
          ).to.be.true;
        }
      });

      it("should reject a record step with invalid verify guards", function () {
        // Note: primitives coerce under ajv coerceTypes, so negatives use
        // out-of-range numbers, unknown keys, incomplete objects, and arrays.
        for (const verify of [
          { minDuration: -1 },
          { maxDuration: -1 },
          { minDuration: "soon" },
          { notBlack: {} },
          { unknownGuard: true },
          { resolution: { width: 1280 } },
          { resolution: { width: 0, height: 480 } },
          [true],
        ]) {
          const result = validate({
            schemaKey: "step_v3",
            object: { record: { path: "out.mp4", verify } },
          });
          expect(
            result.valid,
            `expected invalid verify: ${JSON.stringify(verify)}`
          ).to.be.false;
        }
      });

      it("should validate a record step with checkpoints enabled", function () {
        for (const checkpoints of [
          true,
          false,
          {},
          { maxVariation: 0.02 },
          { directory: "baselines" },
          { maxVariation: 0.1, directory: "baselines" },
        ]) {
          const result = validate({
            schemaKey: "step_v3",
            object: { record: { path: "out.mp4", checkpoints } },
          });
          expect(
            result.valid,
            `checkpoints: ${JSON.stringify(checkpoints)} -> ${result.errors}`
          ).to.be.true;
        }
      });

      it("should reject a record step with invalid checkpoints", function () {
        // Note: string/number primitives coerce under ajv coerceTypes (7 ->
        // "7"), so negatives use shapes that never coerce clean: out-of-range
        // numbers, unknown keys, arrays, and object-typed field values.
        for (const checkpoints of [
          { maxVariation: 2 },
          { maxVariation: -0.5 },
          { unknownField: true },
          { directory: {} },
          [true],
        ]) {
          const result = validate({
            schemaKey: "step_v3",
            object: { record: { path: "out.mp4", checkpoints } },
          });
          expect(
            result.valid,
            `expected invalid checkpoints: ${JSON.stringify(checkpoints)}`
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

    describe("swipe step", function () {
      it("should validate the simple direction string form", function () {
        const result = validate({
          schemaKey: "step_v3",
          object: { swipe: "left" },
        });

        expect(result.valid).to.be.true;
        expect(result.errors).to.equal("");
        expect(result.object.swipe).to.equal("left");
      });

      it("should validate the directional object form with distance, duration, and an app surface", function () {
        const result = validate({
          schemaKey: "step_v3",
          object: {
            swipe: {
              direction: "up",
              distance: 0.8,
              duration: 300,
              surface: { app: "myapp" },
            },
          },
        });

        expect(result.valid).to.be.true;
        expect(result.errors).to.equal("");
        expect(result.object.swipe.direction).to.equal("up");
        expect(result.object.swipe.distance).to.equal(0.8);
      });

      it("should validate the point-to-point form with pixel coordinates", function () {
        const result = validate({
          schemaKey: "step_v3",
          object: {
            swipe: {
              from: { x: 200, y: 600 },
              to: { x: 200, y: 200 },
              duration: 250,
            },
          },
        });

        expect(result.valid).to.be.true;
        expect(result.errors).to.equal("");
        expect(result.object.swipe.from).to.deep.equal({ x: 200, y: 600 });
        expect(result.object.swipe.to).to.deep.equal({ x: 200, y: 200 });
      });

      it("should reject an unknown direction", function () {
        const result = validate({
          schemaKey: "step_v3",
          object: { swipe: "diagonal" },
        });

        expect(result.valid).to.be.false;
        expect(result.errors).to.be.a("string");
        expect(result.errors.length).to.be.greaterThan(0);
      });

      it("should reject a distance outside the (0, 1] range", function () {
        for (const distance of [0, 1.5]) {
          const result = validate({
            schemaKey: "step_v3",
            object: { swipe: { direction: "up", distance } },
          });

          expect(result.valid, `distance ${distance}`).to.be.false;
          expect(result.errors).to.be.a("string");
        }
      });

      it("should reject from without to", function () {
        const result = validate({
          schemaKey: "step_v3",
          object: { swipe: { from: { x: 200, y: 600 } } },
        });

        expect(result.valid).to.be.false;
        expect(result.errors).to.be.a("string");
      });

      it("should reject a point missing a coordinate", function () {
        const result = validate({
          schemaKey: "step_v3",
          object: { swipe: { from: { x: 200 }, to: { x: 200, y: 200 } } },
        });

        expect(result.valid).to.be.false;
        expect(result.errors).to.be.a("string");
      });

      it("should reject mixing direction with point-to-point coordinates", function () {
        const result = validate({
          schemaKey: "step_v3",
          object: {
            swipe: {
              direction: "up",
              from: { x: 200, y: 600 },
              to: { x: 200, y: 200 },
            },
          },
        });

        expect(result.valid).to.be.false;
        expect(result.errors).to.be.a("string");
      });

      it("should reject negative and non-integer pixel coordinates", function () {
        for (const from of [
          { x: -5, y: 600 },
          { x: 200.5, y: 600 },
        ]) {
          const result = validate({
            schemaKey: "step_v3",
            object: { swipe: { from, to: { x: 200, y: 200 } } },
          });

          expect(result.valid, JSON.stringify(from)).to.be.false;
          expect(result.errors).to.be.a("string");
        }
      });

      it("should reject a non-positive duration", function () {
        const result = validate({
          schemaKey: "step_v3",
          object: { swipe: { direction: "up", duration: 0 } },
        });

        expect(result.valid).to.be.false;
        expect(result.errors).to.be.a("string");
      });

      it("should reject a process surface (swipe has no screen to act on)", function () {
        const result = validate({
          schemaKey: "step_v3",
          object: { swipe: { direction: "up", surface: { process: "node" } } },
        });

        expect(result.valid).to.be.false;
        expect(result.errors).to.be.a("string");
      });
    });

    describe("click duration (long-press)", function () {
      it("should validate a click with a duration", function () {
        const result = validate({
          schemaKey: "step_v3",
          object: { click: { elementText: "Message", duration: 800 } },
        });

        expect(result.valid).to.be.true;
        expect(result.errors).to.equal("");
        expect(result.object.click.duration).to.equal(800);
      });

      it("should validate a find with a duration-only click sub-effect", function () {
        const result = validate({
          schemaKey: "step_v3",
          object: {
            find: { elementText: "Message", click: { duration: 800 } },
          },
        });

        expect(result.valid).to.be.true;
        expect(result.errors).to.equal("");
        expect(result.object.find.click.duration).to.equal(800);
      });

      it("should reject a non-positive click duration", function () {
        const result = validate({
          schemaKey: "step_v3",
          object: { click: { elementText: "Message", duration: 0 } },
        });

        expect(result.valid).to.be.false;
        expect(result.errors).to.be.a("string");
      });

      it("should reject a non-integer click duration", function () {
        const result = validate({
          schemaKey: "step_v3",
          object: { click: { elementText: "Message", duration: 1.5 } },
        });

        expect(result.valid).to.be.false;
        expect(result.errors).to.be.a("string");
      });
    });

    // The screenshot `path` pattern gates every screenshot step, including the
    // ones doc-detective synthesizes internally with ABSOLUTE paths derived
    // from the user's project location (captureAutoScreenshot in
    // src/core/tests.ts, and recording checkpoints in
    // src/core/tests/recordingCheckpoints.ts). The Windows branch accepts any
    // absolute path, so the POSIX branch must be equally permissive — a mac or
    // Linux project under "/Users/jane doe/..." must not be second-class.
    describe("screenshot path pattern", function () {
      const validPath = (path) =>
        validate({ schemaKey: "step_v3", object: { screenshot: { path } } })
          .valid;

      it("accepts absolute POSIX paths containing characters real projects use", function () {
        for (const path of [
          "/Users/jane doe/docs/shot.png",
          "/home/u/docs (v2)/shot.png",
          "/home/u/~backup/shot.png",
          "/home/u/café/shot.png",
          "/home/u/a'b/shot.png",
          "/home/u/shot.PNG",
        ]) {
          expect(validPath(path), `expected valid: ${path}`).to.be.true;
        }
      });

      it("keeps accepting the forms it already did", function () {
        for (const path of [
          "shot.png",
          "screenshots/spec/01.png",
          "/home/user/shot.png",
          "C:\\Users\\jane doe\\docs (v2)\\shot.png",
          "https://example.com/a.png",
          "https://example.com/a.png?sig=1",
          "$MY_VAR",
        ]) {
          expect(validPath(path), `expected valid: ${path}`).to.be.true;
        }
      });

      it("still requires a .png/.PNG target", function () {
        for (const path of [
          "/Users/jane doe/docs/shot.jpg",
          "/Users/jane doe/docs/shot.png.exe",
          "/Users/jane doe/docs/shot",
          "shot.gif",
        ]) {
          expect(validPath(path), `expected invalid: ${path}`).to.be.false;
        }
      });
    });

    describe("annotations", function () {
      const TYPES = ["outline", "arrow", "badge", "callout", "blur", "text"];

      it("should validate an annotation_v3 object for each type with a string target", function () {
        for (const type of TYPES) {
          const result = validate({
            schemaKey: "annotation_v3",
            object: { [type]: "#submit-button" },
          });

          expect(result.valid, `expected valid: ${type} — ${result.errors}`).to
            .be.true;
          expect(result.errors).to.equal("");
        }
      });

      it("should validate an annotation_v3 object with a find-criteria target", function () {
        const result = validate({
          schemaKey: "annotation_v3",
          object: {
            outline: {
              elementClass: ["form-field", "/^billing-/"],
              elementAttribute: { "data-state": "invalid" },
            },
          },
        });

        expect(result.valid, result.errors).to.be.true;
      });

      it("should validate an annotation_v3 object with a position target", function () {
        const named = validate({
          schemaKey: "annotation_v3",
          object: { text: { position: "top-right" }, label: "Demo data" },
        });
        expect(named.valid, named.errors).to.be.true;

        const point = validate({
          schemaKey: "annotation_v3",
          object: { arrow: { position: { x: 640, y: 220 } } },
        });
        expect(point.valid, point.errors).to.be.true;
      });

      it("should reject an annotation_v3 object with no type key", function () {
        const result = validate({
          schemaKey: "annotation_v3",
          object: { label: "Orphaned label" },
        });

        expect(result.valid).to.be.false;
        expect(result.errors).to.be.a("string");
      });

      it("should reject an annotation_v3 object with more than one type key", function () {
        // Exactly one type key per annotation — two shapes in one object is
        // ambiguous about what should be drawn.
        const result = validate({
          schemaKey: "annotation_v3",
          object: { outline: "#a", blur: "#b" },
        });

        expect(result.valid).to.be.false;
        expect(result.errors).to.be.a("string");
      });

      it("should validate an annotation_v3 object with the full shared prop set", function () {
        const result = validate({
          schemaKey: "annotation_v3",
          object: {
            id: "redact-api-keys",
            blur: { elementAttribute: { "data-sensitive": true } },
            all: true,
            track: true,
            duration: 3500,
            position: "right",
            style: { intensity: 22, color: "#E11D48", strokeWidth: 3 },
            transition: { enter: "none", exit: "fade", durationMs: 400 },
          },
        });

        expect(result.valid, result.errors).to.be.true;
      });

      it("should reject unknown annotation_v3 properties and bad style values", function () {
        const unknown = validate({
          schemaKey: "annotation_v3",
          object: { outline: "#a", bogus: true },
        });
        expect(unknown.valid).to.be.false;

        const badOpacity = validate({
          schemaKey: "annotation_v3",
          object: { outline: "#a", style: { opacity: 5 } },
        });
        expect(badOpacity.valid).to.be.false;

        const badTransition = validate({
          schemaKey: "annotation_v3",
          object: { outline: "#a", transition: { enter: "explode" } },
        });
        expect(badTransition.valid).to.be.false;
      });

      it("should not inject defaults into an annotation_v3 object", function () {
        // annotation_v3 is $ref'd from screenshot steps and the defaults
        // cascade alike; a schema-level default here would be force-injected
        // into every consumer and break the config→spec→test resolution.
        const result = validate({
          schemaKey: "annotation_v3",
          object: { outline: "#a" },
        });

        expect(result.valid, result.errors).to.be.true;
        expect(result.object).to.deep.equal({ outline: "#a" });
      });

      it("should validate a screenshot step with an annotations array", function () {
        const result = validate({
          schemaKey: "step_v3",
          object: {
            screenshot: {
              path: "checkout.png",
              crop: { selector: "#checkout-panel", padding: 24 },
              annotations: [
                { outline: "#credit-card-number" },
                { badge: "#expiry", label: "2" },
                {
                  callout: { elementTestId: "cvv-input" },
                  label: "Never stored",
                  position: "right",
                  style: { maxWidth: 240 },
                },
                { blur: ".customer-email", all: true },
              ],
            },
          },
        });

        expect(result.valid, result.errors).to.be.true;
        expect(result.object.screenshot.annotations).to.have.lengthOf(4);
      });

      it("should reject a screenshot annotations entry that isn't a valid annotation", function () {
        const result = validate({
          schemaKey: "step_v3",
          object: {
            screenshot: { path: "a.png", annotations: [{ label: "no type" }] },
          },
        });

        expect(result.valid).to.be.false;
      });

      it("should validate annotationDefaults at the config level", function () {
        const result = validate({
          schemaKey: "config_v3",
          object: {
            annotationDefaults: {
              color: "#E11D48",
              strokeWidth: 3,
              fontFamily: "Inter, system-ui, sans-serif",
              fontSize: 14,
              badge: { background: "#E11D48", color: "#FFFFFF" },
              callout: { background: "#1E293B", maxWidth: 280 },
              blur: { intensity: 14 },
              transition: { enter: "fade", exit: "fade", durationMs: 250 },
            },
          },
        });

        expect(result.valid, result.errors).to.be.true;
        expect(result.object.annotationDefaults.color).to.equal("#E11D48");
      });

      it("should validate annotationDefaults overrides on specs and tests", function () {
        const result = validate({
          schemaKey: "spec_v3",
          object: {
            annotationDefaults: { color: "#7C3AED" },
            tests: [
              {
                annotationDefaults: { color: "#0EA5E9" },
                steps: [{ goTo: { url: "https://example.com" } }],
              },
            ],
          },
        });

        expect(result.valid, result.errors).to.be.true;
        expect(result.object.annotationDefaults.color).to.equal("#7C3AED");
        expect(result.object.tests[0].annotationDefaults.color).to.equal(
          "#0EA5E9"
        );
      });

      it("should not default annotationDefaults at any cascade level when unset", function () {
        // Same contract as autoScreenshot: absent must stay absent so the
        // runtime can resolve test > spec > config > built-in theme.
        const spec = validate({
          schemaKey: "spec_v3",
          object: {
            tests: [{ steps: [{ goTo: { url: "https://example.com" } }] }],
          },
        });
        expect(spec.valid, spec.errors).to.be.true;
        expect(spec.object.annotationDefaults).to.equal(undefined);
        expect(spec.object.tests[0].annotationDefaults).to.equal(undefined);

        const config = validate({ schemaKey: "config_v3", object: {} });
        expect(config.valid, config.errors).to.be.true;
        expect(config.object.annotationDefaults).to.equal(undefined);
      });

      it("should validate an annotate step's add, update, and clear forms", function () {
        const add = validate({
          schemaKey: "step_v3",
          object: {
            annotate: {
              add: [
                { id: "guide", callout: "#totp", label: "Only with 2FA on" },
                { id: "redact", blur: { selector: ".key" }, all: true, track: true },
              ],
            },
          },
        });
        expect(add.valid, add.errors).to.be.true;

        const update = validate({
          schemaKey: "step_v3",
          object: {
            annotate: { update: [{ id: "guide", callout: "#metadata-url" }] },
          },
        });
        expect(update.valid, update.errors).to.be.true;

        const clearAll = validate({
          schemaKey: "step_v3",
          object: { annotate: { clear: true } },
        });
        expect(clearAll.valid, clearAll.errors).to.be.true;

        const clearSome = validate({
          schemaKey: "step_v3",
          object: { annotate: { clear: ["guide", "redact"] } },
        });
        expect(clearSome.valid, clearSome.errors).to.be.true;

        const combined = validate({
          schemaKey: "step_v3",
          object: {
            annotate: { add: [{ outline: "#a" }], clear: ["old"] },
          },
        });
        expect(combined.valid, combined.errors).to.be.true;
      });

      it("should require an id on every annotate update entry", function () {
        // `update` addresses an annotation that's already on screen, so
        // without an id there's nothing to address.
        const result = validate({
          schemaKey: "step_v3",
          object: { annotate: { update: [{ callout: "#a", label: "x" }] } },
        });

        expect(result.valid).to.be.false;
        expect(result.errors).to.be.a("string");
      });

      it("should reject an empty annotate step", function () {
        // An annotate that neither adds, updates, nor clears is a no-op the
        // author didn't mean to write.
        const result = validate({
          schemaKey: "step_v3",
          object: { annotate: {} },
        });

        expect(result.valid).to.be.false;
      });

      it("should reject annotate entries that aren't valid annotations", function () {
        const noType = validate({
          schemaKey: "step_v3",
          object: { annotate: { add: [{ label: "orphan" }] } },
        });
        expect(noType.valid).to.be.false;

        const twoTypes = validate({
          schemaKey: "step_v3",
          object: { annotate: { add: [{ outline: "#a", blur: "#b" }] } },
        });
        expect(twoTypes.valid).to.be.false;

        const unknown = validate({
          schemaKey: "step_v3",
          object: { annotate: { add: [{ outline: "#a" }], bogus: true } },
        });
        expect(unknown.valid).to.be.false;
      });

      it("should keep clear's boolean form a boolean rather than coercing it", function () {
        // AJV runs with coerceTypes; a leading array/string branch could turn
        // `true` into something else. The boolean branch comes first.
        const result = validate({
          schemaKey: "step_v3",
          object: { annotate: { clear: true } },
        });
        expect(result.valid, result.errors).to.be.true;
        expect(result.object.annotate.clear).to.equal(true);
      });

      it("should list annotate as a markup action", function () {
        const result = validate({
          schemaKey: "config_v3",
          object: {
            fileTypes: [
              {
                name: "markdown",
                extensions: [".md"],
                markup: [
                  { name: "annotateStep", regex: ["x"], actions: ["annotate"] },
                ],
              },
            ],
          },
        });
        expect(result.valid, result.errors).to.be.true;
      });

      it("should reject an invalid annotationDefaults theme", function () {
        const result = validate({
          schemaKey: "config_v3",
          object: { annotationDefaults: { color: 5, bogus: true } },
        });

        expect(result.valid).to.be.false;
        expect(result.errors).to.be.a("string");
      });
    });

    describe("selector markup definitions (config_v3)", function () {
      // Wraps a single markup definition in a minimal custom fileType.
      const configWithMarkup = (def) => ({
        fileTypes: [{ name: "custom", extensions: ["md"], markup: [def] }],
      });
      // Wraps an inlineStatements value in a minimal custom fileType.
      const configWithStatements = (inlineStatements) => ({
        fileTypes: [{ name: "custom", extensions: ["md"], inlineStatements }],
      });

      describe("valid selector shapes", function () {
        it("should accept a codeBlock selector with language, metaExcludes, and captures", function () {
          const result = validate({
            schemaKey: "config_v3",
            object: configWithMarkup({
              name: "runCode",
              codeBlock: {
                language: ["bash", "python", "py", "javascript", "js"],
                metaExcludes: "testIgnore",
              },
              captures: ["language", "content"],
              actions: [
                { unsafe: true, runCode: { language: "bash", code: "$2" } },
              ],
            }),
          });
          expect(result.valid, result.errors).to.be.true;
        });

        it("should accept a link selector with url and precededBy", function () {
          const result = validate({
            schemaKey: "config_v3",
            object: configWithMarkup({
              name: "goToUrl",
              link: {
                url: "^https?://",
                precededBy: "\\b(?:[Gg]o\\s+to|[Oo]pen)\\s*$",
              },
              captures: ["url"],
              actions: ["goTo"],
            }),
          });
          expect(result.valid, result.errors).to.be.true;
        });

        it("should accept an empty-object selector (any node of that kind)", function () {
          const result = validate({
            schemaKey: "config_v3",
            object: configWithMarkup({
              name: "findOnscreenText",
              strong: {},
              captures: ["text"],
              actions: ["find"],
            }),
          });
          expect(result.valid, result.errors).to.be.true;
        });

        it("should accept an element scalar shorthand for tag", function () {
          const result = validate({
            schemaKey: "config_v3",
            object: configWithMarkup({
              name: "findUiControl",
              element: "uicontrol",
              captures: ["content"],
              actions: ["find"],
            }),
          });
          expect(result.valid, result.errors).to.be.true;
        });

        it("should accept a codeBlock scalar shorthand for language", function () {
          const result = validate({
            schemaKey: "config_v3",
            object: configWithMarkup({
              name: "runBash",
              codeBlock: "bash",
              captures: ["language", "content"],
              actions: ["runCode"],
            }),
          });
          expect(result.valid, result.errors).to.be.true;
        });

        it("should accept a text selector with a matches capture regex", function () {
          const result = validate({
            schemaKey: "config_v3",
            object: configWithMarkup({
              name: "typeText",
              text: { matches: '\\b(?:[Pp]ress|[Ee]nter|[Tt]ype)\\b\\s+"([^"]+)"' },
              captures: ["match.1"],
              actions: ["type"],
            }),
          });
          expect(result.valid, result.errors).to.be.true;
        });

        it("should accept a followedBy.then chained element selector", function () {
          const result = validate({
            schemaKey: "config_v3",
            object: configWithMarkup({
              name: "typeIntoUiControl",
              element: {
                tag: "userinput",
                precededBy: "\\b(?:[Tt]ype|[Ee]nter|[Ii]nput)\\s*$",
                followedBy: {
                  text: "^\\s+(?:in|into)(?:\\s+the)?\\s*$",
                  then: { element: { tag: "uicontrol" } },
                },
              },
              captures: ["content", "then.content"],
              actions: [{ type: { keys: "$1", selector: "$2" } }],
            }),
          });
          expect(result.valid, result.errors).to.be.true;
        });

        it("should keep an attribute exists-check boolean a boolean rather than coercing it", function () {
          // AJV runs with coerceTypes; the string branch could turn `true`
          // into "true". The const-true branch must come first.
          const result = validate({
            schemaKey: "config_v3",
            object: configWithMarkup({
              name: "screenshotToPath",
              image: { attributes: { class: "screenshot", path: true } },
              captures: ["src", "attributes.path"],
              actions: ["screenshot"],
            }),
          });
          expect(result.valid, result.errors).to.be.true;
          expect(
            result.object.fileTypes[0].markup[0].image.attributes.path
          ).to.equal(true);
        });
      });

      describe("valid statement containers", function () {
        it("should accept the comment shorthand container", function () {
          const result = validate({
            schemaKey: "config_v3",
            object: configWithStatements({ in: ["comment"] }),
          });
          expect(result.valid, result.errors).to.be.true;
        });

        it("should accept an element container with a value field path", function () {
          const result = validate({
            schemaKey: "config_v3",
            object: configWithStatements({
              in: [
                "comment",
                {
                  element: {
                    tag: "data",
                    attributes: { name: "doc-detective" },
                  },
                  value: "attributes.value",
                },
              ],
            }),
          });
          expect(result.valid, result.errors).to.be.true;
        });

        it("should accept selector containers alongside legacy regex statements", function () {
          const result = validate({
            schemaKey: "config_v3",
            object: configWithStatements({
              in: ["comment"],
              testStart: ["<\\?doc-detective\\s+test([\\s\\S]*?)\\?>"],
            }),
          });
          expect(result.valid, result.errors).to.be.true;
        });
      });

      describe("invalid selector shapes", function () {
        it("should reject a selector definition with an unknown kind option", function () {
          const result = validate({
            schemaKey: "config_v3",
            object: configWithMarkup({
              name: "runCode",
              codeBlock: { bogusOption: "x" },
              actions: ["runCode"],
            }),
          });
          expect(result.valid).to.be.false;
        });

        it("should reject a misspelled selector kind", function () {
          // A typo'd kind key (wrong casing) is just an unknown property, so
          // the definition has neither `regex` nor a valid selector kind.
          const result = validate({
            schemaKey: "config_v3",
            object: configWithMarkup({
              name: "runCode",
              codeblock: { language: "bash" },
              actions: ["runCode"],
            }),
          });
          expect(result.valid).to.be.false;
        });

        it("should reject a definition combining regex and a selector kind", function () {
          // The modes are mutually exclusive: a combined definition would
          // have undefined runtime semantics, so validation rejects it.
          const result = validate({
            schemaKey: "config_v3",
            object: configWithMarkup({
              name: "both",
              regex: ["x"],
              codeBlock: { language: "bash" },
              actions: ["runCode"],
            }),
          });
          expect(result.valid).to.be.false;
        });

        it("should reject a definition with two selector kinds", function () {
          const result = validate({
            schemaKey: "config_v3",
            object: configWithMarkup({
              name: "conflicted",
              codeBlock: { language: "bash" },
              link: { url: "^https?://" },
              actions: ["runCode"],
            }),
          });
          expect(result.valid).to.be.false;
        });

        it("should reject a markup definition with neither regex nor a selector kind", function () {
          const result = validate({
            schemaKey: "config_v3",
            object: configWithMarkup({
              name: "empty",
              actions: ["find"],
            }),
          });
          expect(result.valid).to.be.false;
        });

        it("should reject a kind option that belongs to a different kind", function () {
          const result = validate({
            schemaKey: "config_v3",
            object: configWithMarkup({
              name: "wrongOption",
              strong: { url: "^https?://" },
              actions: ["find"],
            }),
          });
          expect(result.valid).to.be.false;
        });

        it("should reject an empty captures array", function () {
          const result = validate({
            schemaKey: "config_v3",
            object: configWithMarkup({
              name: "noCaptures",
              strong: {},
              captures: [],
              actions: ["find"],
            }),
          });
          expect(result.valid).to.be.false;
        });
      });

      describe("invalid statement containers", function () {
        it("should reject an unknown string container", function () {
          const result = validate({
            schemaKey: "config_v3",
            object: configWithStatements({ in: ["bogus"] }),
          });
          expect(result.valid).to.be.false;
        });

        it("should reject a container entry with an unknown property", function () {
          const result = validate({
            schemaKey: "config_v3",
            object: configWithStatements({
              in: [{ element: { tag: "data" }, bogus: 1 }],
            }),
          });
          expect(result.valid).to.be.false;
        });

        it("should reject a container entry with no selector kind", function () {
          const result = validate({
            schemaKey: "config_v3",
            object: configWithStatements({
              in: [{ value: "attributes.value" }],
            }),
          });
          expect(result.valid).to.be.false;
        });
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

    describe("structuredErrors option", function () {
      it("omits errorObjects by default", function () {
        const result = validate({
          schemaKey: "step_v3",
          object: { invalidProperty: "value" },
        });

        expect(result.valid).to.be.false;
        expect(result.errorObjects).to.be.undefined;
      });

      it("returns raw AJV error objects when requested", function () {
        const result = validate({
          schemaKey: "goTo_v3",
          object: {},
          structuredErrors: true,
        });

        expect(result.valid).to.be.false;
        expect(result.errorObjects).to.be.an("array");
        expect(result.errorObjects.length).to.be.greaterThan(0);
        // Each entry is a real AJV error object with the fields the LSP maps to ranges.
        const err = result.errorObjects[0];
        expect(err).to.have.property("instancePath");
        expect(err).to.have.property("keyword");
        expect(err).to.have.property("params");
        // The string form is still produced alongside the structured form.
        expect(result.errors).to.be.a("string").with.length.greaterThan(0);
      });

      it("returns an empty errorObjects array for a valid object when requested", function () {
        const result = validate({
          schemaKey: "goTo_v3",
          object: { url: "https://example.com" },
          structuredErrors: true,
        });

        expect(result.valid).to.be.true;
        expect(result.errorObjects).to.be.an("array").that.is.empty;
      });

      it("surfaces errorObjects on the no-compatible-match path", function () {
        // step_v3 has compatible v2 schemas; an object matching none of them
        // exercises the compatible-schema no-match branch.
        const result = validate({
          schemaKey: "step_v3",
          object: { notAnAction: true },
          structuredErrors: true,
        });

        expect(result.valid).to.be.false;
        expect(result.errorObjects).to.be.an("array");
        expect(result.errorObjects.length).to.be.greaterThan(0);
      });

      it("returns errorObjects when the schema key is not found", function () {
        const result = validate({
          schemaKey: "nonexistent_schema",
          object: { test: "value" },
          structuredErrors: true,
        });

        expect(result.valid).to.be.false;
        expect(result.errorObjects).to.be.an("array").that.is.empty;
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

    // Phase 3.2 clone-strategy invariants. These pin the four contracts the
    // clone exists to protect BEFORE the internal refactor (probe candidate
    // schemas with a non-mutating validator; clone once for the winning
    // mutate-with-defaults pass; structuredClone where JSON-value semantics
    // hold). They must hold identically before and after the refactor.
    describe("clone strategy invariants (phase 3.2)", function () {
      // (a) caller's object is never mutated — direct (non-compat) path.
      it("does not mutate the caller's object on the direct path", function () {
        const original = { goTo: { url: "https://example.com" } };
        const originalCopy = JSON.parse(JSON.stringify(original));
        const result = validate({ schemaKey: "step_v3", object: original });
        expect(result.valid, result.errors).to.be.true;
        expect(original).to.deep.equal(originalCopy);
        // The returned (defaulted) object is a distinct clone, not the input.
        expect(result.object).to.not.equal(original);
      });

      // (a) caller's object is never mutated — compatible-schema transform path.
      // A bare { url, statusCodes } is not a valid step_v3 directly, so it falls
      // through the compatible-schema probe (checkLink_v2) and the v2->v3
      // transform — the exact code being optimized. The caller's object must
      // survive with no v2 defaults, coercions, or v3 transform leaked back.
      it("does not mutate the caller's object on the compatible-schema path", function () {
        const original = {
          action: "checkLink",
          url: "https://example.com",
          statusCodes: [200, 201],
        };
        const originalCopy = JSON.parse(JSON.stringify(original));
        const result = validate({ schemaKey: "step_v3", object: original });
        expect(result.valid, result.errors).to.be.true;
        expect(original).to.deep.equal(originalCopy);
      });

      // (d) the compatible-schema selection picks the same schema, and (b) the
      // returned object carries the transformed shape + applied defaults.
      it("selects the compatible schema and returns the transformed, defaulted object", function () {
        const result = validate({
          schemaKey: "step_v3",
          object: {
            action: "checkLink",
            url: "https://example.com",
            statusCodes: [200, 201],
          },
        });
        expect(result.valid, result.errors).to.be.true;
        // checkLink_v2 was the selected compatible schema and was transformed
        // into a v3 checkLink step.
        expect(result.object.checkLink.url).to.equal("https://example.com");
        expect(result.object.checkLink.statusCodes).to.deep.equal([200, 201]);
        // The target-schema pass applied its dynamic stepId default.
        expect(result.object.stepId).to.be.a("string").and.not.equal("");
      });

      // (d) selection on a multi-candidate schema (config_v3 <- config_v2).
      it("selects config_v2 for a v2-shaped config and returns the restructured object", function () {
        const original = {
          runTests: { input: "./docs", output: "./output" },
          logLevel: "info",
        };
        const originalCopy = JSON.parse(JSON.stringify(original));
        const result = validate({ schemaKey: "config_v3", object: original });
        expect(result.valid, result.errors).to.be.true;
        // config_v2 restructures runTests.input up to the top level.
        expect(result.object.input).to.exist;
        expect(result.object.runTests).to.be.undefined;
        expect(original).to.deep.equal(originalCopy);
      });

      // (d) REGRESSION GUARD: a compatible schema whose *validity* depends on an
      // AJV default must still be selected. config_v2's telemetry.send is
      // required AND has a default, so a v2 config that includes a telemetry
      // object but omits `send` is valid only once useDefaults fills it. The
      // non-mutating probe doesn't apply defaults, so this must fall back to the
      // mutating probe rather than be rejected outright (as the old
      // clone-per-candidate mutating loop accepted it).
      it("selects a compatible schema whose validity needs a default (config_v2 telemetry.send)", function () {
        const original = {
          runTests: { input: "./docs" },
          telemetry: { userId: "abc" }, // note: `send` omitted -> relies on default
        };
        const originalCopy = JSON.parse(JSON.stringify(original));
        const result = validate({ schemaKey: "config_v3", object: original });
        expect(result.valid, result.errors).to.be.true;
        // Restructured to v3 (input hoisted) with the telemetry default applied.
        expect(result.object.input).to.exist;
        expect(result.object.telemetry.send).to.equal(true);
        expect(original).to.deep.equal(originalCopy);
      });

      // (b)/(c) addDefaults=false returns the ORIGINAL object (no defaults, not
      // a clone) and reports the same validity — unchanged by the refactor.
      it("returns the original object unchanged when addDefaults=false and valid", function () {
        const original = { goTo: { url: "https://example.com" } };
        const result = validate({
          schemaKey: "step_v3",
          object: original,
          addDefaults: false,
        });
        expect(result.valid, result.errors).to.be.true;
        expect(result.object).to.equal(original);
        expect(result.object.stepId).to.be.undefined;
      });

      // (c) an object matching neither the target nor any compatible schema is
      // reported invalid with errors, and the original is returned untouched.
      it("reports invalid (with errors) when no compatible schema matches", function () {
        const original = { config_but: "not really", nonsense: 42 };
        const originalCopy = JSON.parse(JSON.stringify(original));
        const result = validate({ schemaKey: "step_v3", object: original });
        expect(result.valid).to.be.false;
        expect(result.errors).to.be.a("string").and.not.equal("");
        expect(result.object).to.deep.equal(originalCopy);
      });

      // structuredClone-based clone must faithfully copy nested arrays/objects
      // (deep independence) exactly like the JSON clone did.
      it("deep-clones nested structures so mutations do not alias the input", function () {
        const original = {
          httpRequest: {
            url: "https://example.com",
            request: { headers: { A: "1" }, parameters: { p: [1, 2, 3] } },
          },
        };
        const originalCopy = JSON.parse(JSON.stringify(original));
        const result = validate({ schemaKey: "step_v3", object: original });
        expect(result.valid, result.errors).to.be.true;
        // Mutating the returned clone must not touch the caller's nested data.
        result.object.httpRequest.request.parameters.p.push(4);
        expect(original).to.deep.equal(originalCopy);
      });
    });

    describe("report_v3 warm block", function () {
      const minimalSpecs = [
        { tests: [{ steps: [{ goTo: { url: "https://example.com" } }] }] },
      ];
      const warmTask = {
        name: "browser-install:chrome",
        kind: "browser-install",
        outcome: "warmed",
        durationMs: 900,
      };

      it("should validate a report_v3 object with a warm block", function () {
        const result = validate({
          schemaKey: "report_v3",
          object: {
            specs: minimalSpecs,
            warm: {
              durationMs: 1234,
              tasks: [
                warmTask,
                {
                  name: "wda-check",
                  kind: "wda-check",
                  outcome: "skipped",
                  durationMs: 3,
                  note: "no prebuilt WebDriverAgent",
                },
              ],
            },
          },
        });
        expect(result.valid, result.errors).to.be.true;
        expect(result.errors).to.equal("");
        expect(result.object.warm.tasks[0].kind).to.equal("browser-install");
      });

      it("should validate a report_v3 object without a warm block (back-compat)", function () {
        const result = validate({
          schemaKey: "report_v3",
          object: { specs: minimalSpecs },
        });
        expect(result.valid, result.errors).to.be.true;
        expect(result.object.warm).to.equal(undefined);
      });

      it("should reject a warm task with an unknown outcome", function () {
        const result = validate({
          schemaKey: "report_v3",
          object: {
            specs: minimalSpecs,
            warm: {
              durationMs: 1,
              tasks: [{ ...warmTask, outcome: "exploded" }],
            },
          },
        });
        expect(result.valid).to.be.false;
        expect(result.errors).to.be.a("string");
        expect(result.errors).to.include("outcome");
      });

      it("should reject a warm task with an unknown kind", function () {
        const result = validate({
          schemaKey: "report_v3",
          object: {
            specs: minimalSpecs,
            warm: {
              durationMs: 1,
              tasks: [{ ...warmTask, kind: "coffee" }],
            },
          },
        });
        expect(result.valid).to.be.false;
        expect(result.errors).to.include("kind");
      });

      it("should reject a warm task missing required fields", function () {
        const result = validate({
          schemaKey: "report_v3",
          object: {
            specs: minimalSpecs,
            warm: {
              durationMs: 1,
              tasks: [{ name: "x", outcome: "warmed", durationMs: 1 }],
            },
          },
        });
        expect(result.valid).to.be.false;
        expect(result.errors).to.include("kind");
      });

      it("should reject unknown properties inside the warm block", function () {
        const result = validate({
          schemaKey: "report_v3",
          object: {
            specs: minimalSpecs,
            warm: { durationMs: 1, tasks: [], extra: true },
          },
        });
        expect(result.valid).to.be.false;
        expect(result.errors).to.be.a("string");
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

    describe("context_v3 requires", function () {
      it("should validate a context_v3 object with a string requirement", function () {
        const result = validate({
          schemaKey: "context_v3",
          object: { platforms: ["linux"], requires: "node" },
        });
        expect(result.valid).to.be.true;
        expect(result.object.requires).to.equal("node");
      });

      it("should validate a context_v3 object with an array of requirements", function () {
        const result = validate({
          schemaKey: "context_v3",
          object: { platforms: ["linux"], requires: ["node", "ffmpeg"] },
        });
        expect(result.valid).to.be.true;
        expect(result.object.requires).to.deep.equal(["node", "ffmpeg"]);
      });

      it("should validate a context_v3 object with a full requires object", function () {
        const result = validate({
          schemaKey: "context_v3",
          object: {
            platforms: ["windows", "mac", "linux"],
            requires: {
              commands: ["node", "ffmpeg"],
              files: ["$HOME/.config/app.toml"],
              env: ["API_TOKEN"],
            },
          },
        });
        expect(result.valid).to.be.true;
        expect(result.object.requires.commands).to.deep.equal(["node", "ffmpeg"]);
        expect(result.object.requires.files).to.deep.equal(["$HOME/.config/app.toml"]);
        expect(result.object.requires.env).to.deep.equal(["API_TOKEN"]);
      });

      it("should validate a requires object with a single category", function () {
        const result = validate({
          schemaKey: "context_v3",
          object: { requires: { env: ["ANTHROPIC_API_KEY"] } },
        });
        expect(result.valid).to.be.true;
      });

      it("should reject an empty or whitespace-only requires string", function () {
        for (const requires of ["", "   "]) {
          const result = validate({
            schemaKey: "context_v3",
            object: { requires },
          });
          expect(result.valid, `requires: ${JSON.stringify(requires)}`).to.be
            .false;
        }
      });

      it("should reject an empty requires array", function () {
        const result = validate({
          schemaKey: "context_v3",
          object: { requires: [] },
        });
        expect(result.valid).to.be.false;
      });

      it("should reject a requires array with an empty entry", function () {
        const result = validate({
          schemaKey: "context_v3",
          object: { requires: ["node", " "] },
        });
        expect(result.valid).to.be.false;
      });

      it("should reject an empty requires object", function () {
        const result = validate({
          schemaKey: "context_v3",
          object: { requires: {} },
        });
        expect(result.valid).to.be.false;
      });

      it("should reject a requires object with unknown categories", function () {
        const result = validate({
          schemaKey: "context_v3",
          object: { requires: { binaries: ["node"] } },
        });
        expect(result.valid).to.be.false;
      });

      it("should reject a requires object whose category is not an array of strings", function () {
        const result = validate({
          schemaKey: "context_v3",
          object: { requires: { commands: "node" } },
        });
        expect(result.valid).to.be.false;
      });

      it("should coerce a numeric requires value to a string (validator-wide coerceTypes policy)", function () {
        const result = validate({
          schemaKey: "context_v3",
          object: { requires: 42 },
        });
        expect(result.valid).to.be.true;
        expect(result.object.requires).to.equal("42");
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

    describe("multi-surface Phase 6: startSurface browser/process branches + parallel array", function () {
      it("should validate a minimal browser descriptor", function () {
        const result = validate({
          schemaKey: "step_v3",
          object: { startSurface: { browser: "chrome" } },
        });
        expect(result.valid, result.errors).to.be.true;
      });

      it("should validate a full browser descriptor (size, not window)", function () {
        const result = validate({
          schemaKey: "step_v3",
          object: {
            startSurface: {
              browser: "firefox",
              name: "admin",
              headless: true,
              size: { width: 1366, height: 768 },
              viewport: { width: 1280, height: 720 },
              driverOptions: { "moz:firefoxOptions": {} },
            },
          },
        });
        expect(result.valid, result.errors).to.be.true;
      });

      it("should reject invalid browser descriptors", function () {
        for (const startSurface of [
          { browser: "opera" },
          { browser: "chrome", window: { width: 800, height: 600 } },
          { browser: "chrome", url: "https://example.com" },
          { browser: "chrome", waitUntil: { delayMs: 100 } },
          { browser: "chrome", timeout: 1000 },
        ]) {
          const result = validate({
            schemaKey: "step_v3",
            object: { startSurface },
          });
          expect(
            result.valid,
            `expected invalid: ${JSON.stringify(startSurface)}`
          ).to.be.false;
        }
      });

      it("should validate a minimal process descriptor (name required)", function () {
        const result = validate({
          schemaKey: "step_v3",
          object: { startSurface: { process: "node server.js", name: "api" } },
        });
        expect(result.valid, result.errors).to.be.true;
      });

      it("should validate a full process descriptor", function () {
        const result = validate({
          schemaKey: "step_v3",
          object: {
            startSurface: {
              process: "python",
              name: "repl",
              args: ["-q"],
              workingDirectory: "./sandbox",
              tty: true,
              waitUntil: {
                port: 8080,
                stdio: "/ready on \\d+/",
                httpGet: "http://localhost:8080/health",
                delayMs: 100,
              },
              timeout: 30000,
            },
          },
        });
        expect(result.valid, result.errors).to.be.true;
      });

      it("should reject invalid process descriptors", function () {
        for (const startSurface of [
          { process: "node server.js" },
          { process: "node", name: "api", waitUntil: {} },
          { process: "node", name: "api", env: { A: "b" } },
          { process: "  ", name: "api" },
        ]) {
          const result = validate({
            schemaKey: "step_v3",
            object: { startSurface },
          });
          expect(
            result.valid,
            `expected invalid: ${JSON.stringify(startSurface)}`
          ).to.be.false;
        }
      });

      it("should validate parallel arrays: one element, mixed kinds, two devices", function () {
        for (const startSurface of [
          [{ browser: "chrome" }],
          [
            { browser: "chrome", name: "web" },
            { process: "node server.js", name: "api" },
            { app: "C:\\Windows\\System32\\notepad.exe" },
          ],
          [
            {
              app: "com.example.chat",
              name: "alice",
              device: { platform: "android", name: "Pixel_7" },
            },
            {
              app: "com.example.chat",
              name: "bob",
              device: { platform: "android", name: "Pixel_7_second" },
            },
          ],
        ]) {
          const result = validate({
            schemaKey: "step_v3",
            object: { startSurface },
          });
          expect(
            result.valid,
            `${JSON.stringify(startSurface)} -> ${result.errors}`
          ).to.be.true;
        }
      });

      it("should reject malformed arrays and kind-less descriptors", function () {
        for (const startSurface of [
          [],
          [{ name: "x" }],
          ["chrome"],
          { name: "x" },
        ]) {
          const result = validate({
            schemaKey: "step_v3",
            object: { startSurface },
          });
          expect(
            result.valid,
            `expected invalid: ${JSON.stringify(startSurface)}`
          ).to.be.false;
        }
      });
    });

    describe("native app surfaces (phase A1): startSurface + app surface branch", function () {
      // --- startSurface: the app opener ---

      it("should validate a minimal startSurface (app path only)", function () {
        const result = validate({
          schemaKey: "step_v3",
          object: {
            startSurface: { app: "C:\\Windows\\System32\\notepad.exe" },
          },
        });
        expect(result.valid).to.be.true;
        expect(result.errors).to.equal("");
      });

      it("should validate a full desktop startSurface", function () {
        const result = validate({
          schemaKey: "step_v3",
          object: {
            startSurface: {
              app: "/Applications/Calculator.app",
              name: "calc",
              args: ["--reset"],
              workingDirectory: "./sandbox",
              env: { LOG_LEVEL: "debug" },
              driverOptions: { "appium:newCommandTimeout": 300 },
              waitUntil: { delayMs: 500, find: { elementText: "Ready" } },
              timeout: 30000,
            },
          },
        });
        expect(result.valid).to.be.true;
        expect(result.errors).to.equal("");
      });

      it("should validate the reserved mobile fields (install/activity/device object)", function () {
        const result = validate({
          schemaKey: "step_v3",
          object: {
            startSurface: {
              app: "com.example.myapp",
              install: "./build/MyApp.apk",
              activity: ".MainActivity",
              device: {
                platform: "android",
                name: "Pixel_7",
                osVersion: "14",
                headless: true,
              },
            },
          },
        });
        expect(result.valid).to.be.true;
        expect(result.errors).to.equal("");
      });

      it("should validate a device string reference and the reserved device fields", function () {
        const byRef = validate({
          schemaKey: "step_v3",
          object: {
            startSurface: { app: "com.example.chat", device: "second-phone" },
          },
        });
        expect(byRef.valid).to.be.true;

        const reserved = validate({
          schemaKey: "step_v3",
          object: {
            startSurface: {
              app: "com.example.myapp",
              device: {
                platform: "ios",
                name: "iPhone 15",
                orientation: "landscape",
                udid: "00008110-001234567890ABCD",
                provider: { browserstack: { app: "bs://abc123" } },
              },
            },
          },
        });
        expect(reserved.valid).to.be.true;
        expect(reserved.errors).to.equal("");
      });

      it("should reject a startSurface without app", function () {
        const result = validate({
          schemaKey: "step_v3",
          object: { startSurface: { name: "calc" } },
        });
        expect(result.valid).to.be.false;
      });

      it("should reject an empty app identifier", function () {
        const result = validate({
          schemaKey: "step_v3",
          object: { startSurface: { app: " " } },
        });
        expect(result.valid).to.be.false;
      });

      it("should reject a device without platform", function () {
        const result = validate({
          schemaKey: "step_v3",
          object: {
            startSurface: { app: "com.example.app", device: { name: "Pixel_7" } },
          },
        });
        expect(result.valid).to.be.false;
      });

      it("should reject a desktop OS as a device platform", function () {
        const result = validate({
          schemaKey: "step_v3",
          object: {
            startSurface: {
              app: "com.example.app",
              device: { platform: "windows" },
            },
          },
        });
        expect(result.valid).to.be.false;
      });

      it("should reject unknown startSurface fields", function () {
        const result = validate({
          schemaKey: "step_v3",
          object: {
            startSurface: { app: "notepad.exe", automationName: "NovaWindows" },
          },
        });
        expect(result.valid).to.be.false;
      });

      it("should reject a startSurface waitUntil.find with no finding fields", function () {
        const result = validate({
          schemaKey: "step_v3",
          object: {
            startSurface: { app: "notepad.exe", waitUntil: { find: {} } },
          },
        });
        expect(result.valid).to.be.false;
      });

      // --- surface: the app reference branch ---

      it("should validate an app surface reference with window selectors", function () {
        for (const window of [undefined, "main", -1, { title: "/Find/" }]) {
          const surface =
            window === undefined ? { app: "notepad" } : { app: "notepad", window };
          const result = validate({
            schemaKey: "step_v3",
            object: { closeSurface: surface },
          });
          expect(result.valid, JSON.stringify(surface)).to.be.true;
          expect(result.errors).to.equal("");
        }
      });

      it("should reject a url criterion on an app window selector", function () {
        const result = validate({
          schemaKey: "step_v3",
          object: {
            closeSurface: { app: "notepad", window: { url: "/x/" } },
          },
        });
        expect(result.valid).to.be.false;
      });

      it("should reject a tab selector on an app surface (apps have windows, no tabs)", function () {
        const result = validate({
          schemaKey: "step_v3",
          object: {
            closeSurface: { app: "notepad", tab: "cart" },
          },
        });
        expect(result.valid).to.be.false;
      });

      it("should reject crop on an app-surface screenshot at validation time", function () {
        const invalid = validate({
          schemaKey: "step_v3",
          object: {
            screenshot: {
              path: "app.png",
              surface: { app: "notepad" },
              crop: "Select",
            },
          },
        });
        expect(invalid.valid).to.be.false;

        // The same crop stays valid on a browser surface.
        const browserCrop = validate({
          schemaKey: "step_v3",
          object: {
            screenshot: {
              path: "page.png",
              surface: { browser: "chrome" },
              crop: "#header",
            },
          },
        });
        expect(browserCrop.valid).to.be.true;
        expect(browserCrop.errors).to.equal("");
      });

      it("should validate app surfaces on find/click/screenshot", function () {
        const steps = [
          { find: { elementText: "Text Editor", surface: { app: "notepad" } } },
          { click: { elementText: "Save", surface: { app: "notepad", window: -1 } } },
          { screenshot: { path: "app.png", surface: { app: "notepad" } } },
        ];
        for (const step of steps) {
          const result = validate({ schemaKey: "step_v3", object: step });
          expect(result.valid, JSON.stringify(step)).to.be.true;
          expect(result.errors).to.equal("");
        }
      });

      it("should validate type to an app surface with app readiness", function () {
        const result = validate({
          schemaKey: "step_v3",
          object: {
            type: {
              keys: ["hello"],
              surface: { app: "notepad" },
              waitUntil: { delayMs: 250 },
              timeout: 5000,
            },
          },
        });
        expect(result.valid).to.be.true;
        expect(result.errors).to.equal("");
      });

      it("should reject process readiness (stdio) on an app surface", function () {
        const result = validate({
          schemaKey: "step_v3",
          object: {
            type: {
              keys: ["hello"],
              surface: { app: "notepad" },
              waitUntil: { stdio: "/ready/" },
            },
          },
        });
        expect(result.valid).to.be.false;
      });
    });

    describe("native app surfaces (phase A3a): mobile contexts + revised device descriptor", function () {
      // --- context_v3: android/ios target platforms ---

      it("should validate an android target platform in a context", function () {
        for (const platforms of ["android", "ios", ["android", "ios"]]) {
          const result = validate({
            schemaKey: "context_v3",
            object: { platforms },
          });
          expect(result.valid, JSON.stringify(platforms)).to.be.true;
          expect(result.errors).to.equal("");
        }
      });

      it("should validate a context device (reference form, platform implied)", function () {
        const result = validate({
          schemaKey: "context_v3",
          object: { platforms: "android", device: { name: "pixel7" } },
        });
        expect(result.valid).to.be.true;
        expect(result.errors).to.equal("");
      });

      it("should validate a context device (provisioning form)", function () {
        const result = validate({
          schemaKey: "context_v3",
          object: {
            platforms: "android",
            device: {
              name: "phone",
              deviceType: "phone",
              osVersion: "14",
              headless: true,
            },
          },
        });
        expect(result.valid).to.be.true;
        expect(result.errors).to.equal("");
      });

      it("should validate a context device string reference", function () {
        const result = validate({
          schemaKey: "context_v3",
          object: { platforms: "android", device: "pixel7" },
        });
        expect(result.valid).to.be.true;
        expect(result.errors).to.equal("");
      });

      it("should reject an unknown context device field", function () {
        const result = validate({
          schemaKey: "context_v3",
          object: { platforms: "android", device: { name: "p", foo: 1 } },
        });
        expect(result.valid).to.be.false;
      });

      // --- deviceDescriptor: deviceType replaces the old reserved `type` ---

      it("should validate deviceType phone and tablet on a startSurface device", function () {
        for (const deviceType of ["phone", "tablet"]) {
          const result = validate({
            schemaKey: "step_v3",
            object: {
              startSurface: {
                app: "com.example.app",
                device: { platform: "android", name: "d", deviceType },
              },
            },
          });
          expect(result.valid, deviceType).to.be.true;
          expect(result.errors).to.equal("");
        }
      });

      it("should reject the retired reserved `type` device field", function () {
        const result = validate({
          schemaKey: "step_v3",
          object: {
            startSurface: {
              app: "com.example.app",
              device: { platform: "android", name: "d", type: "emulator" },
            },
          },
        });
        expect(result.valid).to.be.false;
      });

      it("should reject an unknown deviceType value", function () {
        const result = validate({
          schemaKey: "step_v3",
          object: {
            startSurface: {
              app: "com.example.app",
              device: { platform: "android", name: "d", deviceType: "tv" },
            },
          },
        });
        expect(result.valid).to.be.false;
      });

      it("should still require platform on a startSurface device object", function () {
        const result = validate({
          schemaKey: "step_v3",
          object: {
            startSurface: {
              app: "com.example.app",
              device: { name: "pixel7", deviceType: "phone" },
            },
          },
        });
        expect(result.valid).to.be.false;
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
