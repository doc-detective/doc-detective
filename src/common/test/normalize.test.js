// ADR 01167: validate() returns the effective step. With addDefaults (the
// default), it expands shorthand and fills defaults on its own clone.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { expect } from "chai";
import sinon from "sinon";
import { validate, schemas } from "../dist/index.js";
import { normalize, normalizers, NormalizeError } from "../dist/normalize/index.js";
import { isWholeVariable, passthrough, renameAliases } from "../dist/normalize/helpers.js";

const SRC_SCHEMAS = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "src", "schemas", "src_schemas");
const effective = (object, schemaKey = "step_v3") => validate({ schemaKey, object });

const GO_TO = {
  url: "https://example.com",
  timeout: 30000,
  params: {},
  waitUntil: { networkIdleTime: 500, domIdleTime: 1000 },
};
const HTTP_REQUEST = {
  url: "https://api.example.com/users",
  method: "get",
  statusCodes: [200],
  timeout: 60000,
  allowAdditionalFields: true,
  maxVariation: 0,
  overwrite: "aboveVariation",
  request: { headers: {}, parameters: {}, body: {} },
  response: { headers: {}, required: [] },
};

describe("normalization", function () {
  describe("the effective step", function () {
    it("expands the goTo shorthand and fills its defaults", function () {
      const result = effective({ stepId: "open", goTo: "https://example.com" });
      expect(result.valid, result.errors).to.equal(true);
      expect(result.object).to.deep.equal({ stepId: "open", goTo: GO_TO });
    });

    it("fills httpRequest's defaults", function () {
      const result = effective({
        stepId: "api",
        httpRequest: { url: "https://api.example.com/users", statusCodes: [200] },
      });
      expect(result.valid, result.errors).to.equal(true);
      expect(result.object).to.deep.equal({ stepId: "api", httpRequest: HTTP_REQUEST });
    });

    it("expands the httpRequest shorthand", function () {
      const result = effective({ httpRequest: "https://api.example.com/users" });
      expect(result.object.httpRequest).to.deep.equal({ ...HTTP_REQUEST, statusCodes: [200, 201] });
    });

    it("wraps a scalar statusCodes in an array", function () {
      const value = normalizers.httpRequest({ url: "https://x.com", statusCodes: 200 }, "httpRequest");
      expect(value.statusCodes).to.deep.equal([200]);
    });

    it("fills defaults around a $VAR field, leaving the field as it is", function () {
      expect(effective({ goTo: { url: "$URL" } }).object.goTo).to.deep.equal({ ...GO_TO, url: "$URL" });
    });

    it("fills the missing parts of an authored waitUntil", function () {
      const partial = effective({ goTo: { url: "https://x.com", waitUntil: { domIdleTime: 0 } } });
      expect(partial.object.goTo.waitUntil).to.deep.equal({ domIdleTime: 0, networkIdleTime: 500 });
    });

    it("keeps an authored 0", function () {
      expect(effective({ goTo: { url: "https://x.com", timeout: 0 } }).object.goTo.timeout).to.equal(0);
    });

    it("lets an OpenAPI operation supply the method, status codes, and body", function () {
      const { httpRequest } = effective({ httpRequest: { openApi: "getUsers" } }).object;
      expect(httpRequest).to.not.have.any.keys("method", "statusCodes");
      expect(httpRequest.request).to.deep.equal({ headers: {}, parameters: {} });
    });

    it("defaults a request body only with the whole request", function () {
      const { httpRequest } = effective({ httpRequest: { url: "https://x.com", request: { headers: { a: "b" } } } }).object;
      expect(httpRequest.request).to.deep.equal({ headers: { a: "b" }, parameters: {} });
    });

    it("never defaults a response body, so an unset body skips the body check", function () {
      expect(effective({ httpRequest: "https://x.com" }).object.httpRequest.response).to.not.have.property("body");
    });

    it("doesn't share default values between steps", function () {
      const first = effective({ httpRequest: "https://x.com" }).object.httpRequest;
      first.statusCodes.push(500);
      expect(effective({ httpRequest: "https://x.com" }).object.httpRequest.statusCodes).to.deep.equal([200, 201]);
    });

    it("leaves step-level keys as authored", function () {
      expect(Object.keys(effective({ goTo: "https://x.com" }).object)).to.deep.equal(["goTo"]);
    });

    it("normalizes every step in a test and a spec", function () {
      const test = { steps: [{ goTo: "https://example.com" }, { wait: 100 }] };
      expect(effective(test, "test_v3").object.steps).to.deep.equal([{ goTo: GO_TO }, { wait: 100 }]);
      const spec = { specId: "s", tests: [test, { testId: "t2", steps: [{ goTo: "https://example.com" }] }] };
      const result = effective(spec, "spec_v3").object;
      expect(result.tests[0].steps[0].goTo).to.deep.equal(GO_TO);
      expect(result.tests[1].steps[0].goTo).to.deep.equal(GO_TO);
    });

    it("leaves a test's resolved contexts alone", function () {
      const test = { contexts: [{ steps: [{ goTo: "https://example.com" }] }] };
      const result = effective(test, "test_v3");
      expect(result.valid, result.errors).to.equal(true);
      expect(result.object.contexts[0].steps[0].goTo).to.equal("https://example.com");
    });

    it("upgrades a v2 step to the effective v3 step", function () {
      const result = effective({ action: "goTo", url: "https://example.com" });
      expect(result.valid, result.errors).to.equal(true);
      expect(result.object.goTo).to.deep.equal(GO_TO);
    });

    // Detection validates with addDefaults: false and hashes generated IDs from
    // what comes back, so a v2 upgrade must keep the authored steps.
    it("upgrades v2 objects without normalizing them when addDefaults is false", function () {
      const step = validate({ schemaKey: "step_v3", object: { action: "goTo", url: "https://example.com" }, addDefaults: false });
      expect(step.valid, step.errors).to.equal(true);
      expect(step.object.goTo).to.deep.equal({ url: "https://example.com" });
      const spec = validate({
        schemaKey: "spec_v3",
        object: { id: "s", tests: [{ id: "t", steps: [{ action: "goTo", url: "https://example.com" }] }] },
        addDefaults: false,
      });
      expect(spec.valid, spec.errors).to.equal(true);
      expect(spec.object.tests[0].steps[0].goTo).to.deep.equal({ url: "https://example.com" });
    });
  });

  // ADR 01173: a capture with no path is named for its step. The runner
  // resolves a relative path against outputDir; validate() never does.
  describe("captures", function () {
    const SHOT = { maxVariation: 0.05, overwrite: "aboveVariation" };

    for (const [name, value] of [
      ["true", true],
      ["{}", {}],
    ]) {
      it(`names screenshot: ${name} for its step`, function () {
        const result = effective({ stepId: "shot", screenshot: value });
        expect(result.valid, result.errors).to.equal(true);
        expect(result.object.screenshot).to.deep.equal({ path: "shot.png", ...SHOT });
      });
    }

    it("expands a screenshot path", function () {
      expect(effective({ stepId: "shot", screenshot: "x.png" }).object.screenshot).to.deep.equal({ path: "x.png", ...SHOT });
    });

    it("names a screenshot in a directory for its step", function () {
      expect(effective({ stepId: "shot", screenshot: { directory: "shots" } }).object.screenshot).to.deep.equal({
        directory: "shots",
        path: "shot.png",
        ...SHOT,
      });
    });

    it("leaves the path unset until the step has an ID", function () {
      expect(effective({ screenshot: true }).object.screenshot).to.deep.equal(SHOT);
      expect(effective({ record: true }).object.record).to.deep.equal({ overwrite: "false" });
    });

    it("keeps false, which disables the step", function () {
      expect(effective({ stepId: "s", screenshot: false }).object.screenshot).to.equal(false);
      expect(effective({ stepId: "s", record: false }).object.record).to.equal(false);
      expect(effective({ stopRecord: false }).object.stopRecord).to.equal(false);
    });

    it("names record: true for its step", function () {
      expect(effective({ stepId: "demo", record: true }).object.record).to.deep.equal({ path: "demo.mp4", overwrite: "false" });
    });

    it("accepts a recording extension in any case", function () {
      const result = effective({ stepId: "demo", record: "Demo.MP4" });
      expect(result.valid, result.errors).to.equal(true);
      expect(result.object.record).to.deep.equal({ path: "Demo.MP4", overwrite: "false" });
    });

    it("leaves the authored capture object unchanged", function () {
      for (const action of ["screenshot", "record"]) {
        const value = { directory: "d" };
        const output = normalizers[action](value, action, { stepId: "s" });
        expect(value, action).to.deep.equal({ directory: "d" });
        expect(output, action).to.include({ directory: "d" }).and.have.property("path");
      }
    });

    it("keeps stopRecord: false through type coercion", function () {
      const result = effective({ stopRecord: false });
      expect(result.valid, result.errors).to.equal(true);
      expect(result.object.stopRecord).to.equal(false);
    });

    it("expands a stopRecord name, and makes null an untargeted stop", function () {
      expect(effective({ stopRecord: "demo" }).object.stopRecord).to.deep.equal({ name: "demo" });
      expect(effective({ stopRecord: null }).object.stopRecord).to.equal(true);
      expect(effective({ stopRecord: true }).object.stopRecord).to.equal(true);
    });
  });

  // A whole-variable value can hold the whole action, even an object, so
  // validate() leaves it as authored. It covers every action whose schema takes
  // a string, so each action inherits the rule as its normalizer moves here.
  describe("whole-variable values", function () {
    const takesString = (node) =>
      node?.type === "string" || ["anyOf", "oneOf"].some((key) => (node?.[key] ?? []).some(takesString));
    for (const action of Object.keys(normalizers)) {
      if (!takesString(schemas[`${action}_v3`])) continue;
      it(`leaves "${action}": "$DD_VAR" as authored`, function () {
        const object = { [action]: "$DD_VAR" };
        const result = effective(object);
        if (!result.valid) this.skip(); // This action's string pattern doesn't take a variable.
        expect(result.object).to.deep.equal(object);
        expect(effective(result.object).object).to.deep.equal(object);
      });
    }

    it("covers goTo and httpRequest", function () {
      expect(effective({ goTo: "$URL" }).object).to.deep.equal({ goTo: "$URL" });
      expect(effective({ httpRequest: "$REQ" }).object).to.deep.equal({ httpRequest: "$REQ" });
    });

    it("normalizes a value with a $VAR inside it, leaving the variable as it is", function () {
      expect(effective({ goTo: "https://$HOST/x" }).object.goTo).to.deep.equal({ ...GO_TO, url: "https://$HOST/x" });
    });

    it("treats one as literal text after substitution", function () {
      const step = { goTo: "$UNSET" };
      normalize("step_v3", step, { literal: true });
      expect(step.goTo).to.deep.equal({ ...GO_TO, url: "$UNSET" });
    });

    it("matches whole variable references only", function () {
      expect(["$URL", "$my_var", "$1"].map(isWholeVariable)).to.deep.equal([true, true, true]);
      expect(["URL", "$", "$URL/x", "a $URL", "$$URL", 5, null].map(isWholeVariable)).to.deep.equal(
        [false, false, false, false, false, false, false]
      );
    });
  });

  describe("idempotence", function () {
    for (const [name, step] of [
      ["goTo shorthand", { goTo: "https://example.com" }],
      ["httpRequest", { httpRequest: { url: "https://x.com", statusCodes: [200] } }],
      ["httpRequest with OpenAPI", { httpRequest: { openApi: "getUsers" } }],
      ["httpRequest with a request", { httpRequest: { url: "https://x.com", request: {} } }],
      ["screenshot: true", { stepId: "s", screenshot: true }],
      ["screenshot without an ID", { screenshot: true }],
      ["record path", { stepId: "s", record: "x.mp4" }],
      ["stopRecord name", { stopRecord: "demo" }],
      ["stopRecord null", { stopRecord: null }],
    ]) {
      it(`changes nothing the second time: ${name}`, function () {
        const once = effective(step).object;
        expect(effective(once).object).to.deep.equal(once);
      });
    }
  });

  describe("addDefaults", function () {
    it("false returns the caller's own object, unchanged", function () {
      const object = { goTo: "https://example.com" };
      const snapshot = structuredClone(object);
      const result = validate({ schemaKey: "step_v3", object, addDefaults: false });
      expect(result.valid).to.equal(true);
      expect(result.object).to.equal(object);
      expect(object).to.deep.equal(snapshot);
    });

    it("true normalizes only the returned object, never the caller's", function () {
      const object = { goTo: "https://example.com" };
      const snapshot = structuredClone(object);
      const result = validate({ schemaKey: "step_v3", object });
      expect(object).to.deep.equal(snapshot);
      expect(result.object).to.not.equal(object);
      expect(result.object.goTo).to.deep.equal(GO_TO);
    });
  });

  describe("the registry", function () {
    const actions = Object.keys(schemas.step_v3.properties).filter(
      (key) => !(key in schemas.step_v3.components.schemas.common.properties)
    );

    it("has one normalizer for each of the 21 actions", function () {
      expect(actions).to.have.lengthOf(21);
      expect(Object.keys(normalizers)).to.have.members(actions);
    });

    // A normalizer's output for a minimal authored step holds every plain
    // default in its schema's object branch. Defaults under anyOf/oneOf are
    // conditional and coded by hand. Add your action's minimal step as you
    // move its normalization out of the handler.
    const MINIMAL = {
      goTo: { url: "https://example.com" },
      httpRequest: { url: "https://example.com" },
      screenshot: {},
      record: {},
    };
    for (const action of actions) {
      it(`fills every plain schema default: ${action}`, function () {
        // stopRecord's object form has no defaults.
        if (normalizers[action] === passthrough || action === "stopRecord") this.skip();
        const schema = JSON.parse(fs.readFileSync(path.join(SRC_SCHEMAS, `${action}_v3.schema.json`), "utf8"));
        const defaults = [];
        // screenshot's object branch is allOf[$ref objectShape, guard], so walk the shape.
        const branch = schema.components.schemas.objectShape ?? schema.components.schemas.object;
        (function walk(node, trail) {
          if (!node || typeof node !== "object") return;
          if (!Array.isArray(node) && "default" in node && !trail.some((key) => key === "anyOf" || key === "oneOf")) {
            defaults.push([trail.filter((key, i) => trail[i - 1] === "properties"), node.default]);
          }
          for (const [key, child] of Object.entries(node)) walk(child, [...trail, key]);
        })(branch, []);
        expect(defaults, "no defaults found").to.not.be.empty;
        const output = normalizers[action](structuredClone(MINIMAL[action]), action, {});
        for (const [keys, value] of defaults) {
          expect(keys.reduce((node, key) => node?.[key], output), keys.join(".")).to.deep.equal(value);
        }
      });
    }
  });

  describe("deprecated aliases", function () {
    let warn;
    beforeEach(function () {
      warn = sinon.stub(console, "warn");
    });
    afterEach(function () {
      warn.restore();
    });

    it("renames the old key and warns once per run", function () {
      const first = renameAliases({ oldKey: 1 }, { oldKey: "newKey" }, "click");
      const second = renameAliases({ oldKey: 2 }, { oldKey: "newKey" }, "click");
      expect(first).to.deep.equal({ newKey: 1 });
      expect(second).to.deep.equal({ newKey: 2 });
      expect(warn.callCount).to.equal(1);
      expect(warn.firstCall.args[0]).to.equal("Warning: `oldKey` is deprecated. Rename it to `newKey`.");
    });

    it("leaves an object without the old key alone", function () {
      expect(renameAliases({ newKey: 1 }, { oldKey: "newKey" }, "click")).to.deep.equal({ newKey: 1 });
    });

    it("rejects setting both", function () {
      expect(() => renameAliases({ oldKey: 1, newKey: 2 }, { oldKey: "newKey" }, "tests[0].steps[1].click"))
        .to.throw(NormalizeError, "tests[0].steps[1].click: set `newKey` or `oldKey`, not both.");
    });
  });

  describe("errors", function () {
    let original;
    beforeEach(function () {
      original = normalizers.goTo;
    });
    afterEach(function () {
      normalizers.goTo = original;
    });

    for (const addDefaults of [true, false]) {
      it(`makes the object invalid with addDefaults: ${addDefaults}`, function () {
        normalizers.goTo = (value, at) => renameAliases({ ...value, newKey: 1, oldKey: 2 }, { oldKey: "newKey" }, at);
        const object = { tests: [{ steps: [{ wait: 1 }, { goTo: { url: "https://x.com" } }] }] };
        const result = validate({ schemaKey: "spec_v3", object, addDefaults });
        expect(result.valid).to.equal(false);
        expect(result.errors).to.equal("tests[0].steps[1].goTo: set `newKey` or `oldKey`, not both.");
        expect(result).to.not.have.property("errorObjects");
        expect(result.object).to.equal(object);
      });
    }

    // The language server maps errorObjects to source ranges.
    it("reports a structured error at the action's path", function () {
      normalizers.goTo = (value, at) => renameAliases({ ...value, newKey: 1, oldKey: 2 }, { oldKey: "newKey" }, at);
      const object = { tests: [{ steps: [{ wait: 1 }, { goTo: { url: "https://x.com" } }] }] };
      const result = validate({ schemaKey: "spec_v3", object, addDefaults: false, structuredErrors: true });
      expect(result.errorObjects).to.deep.equal([
        {
          instancePath: "/tests/0/steps/1/goTo",
          schemaPath: "#",
          keyword: "normalize",
          params: {},
          message: "set `newKey` or `oldKey`, not both.",
        },
      ]);
    });

    it("passes other errors through", function () {
      normalizers.goTo = () => {
        throw new TypeError("boom");
      };
      expect(() => validate({ schemaKey: "step_v3", object: { goTo: "https://x.com" } })).to.throw(TypeError, "boom");
    });
  });
});
