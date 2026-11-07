// ADR 01167: validate() returns the effective step. With addDefaults (the
// default), it expands shorthand and fills defaults on its own clone.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { expect } from "chai";
import sinon from "sinon";
import { validate, schemas } from "../dist/index.js";
import { normalizers, NormalizeError } from "../dist/normalize/index.js";
import { passthrough, renameAliases } from "../dist/normalize/helpers.js";

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

    it("leaves a $VAR value as it is", function () {
      expect(effective({ goTo: "$URL" }).object.goTo.url).to.equal("$URL");
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

  // ADR 01175: the browser actions move their shorthand and defaults here.
  describe("browser actions", function () {
    const action = (step) => effective(step).object;
    const TYPE = { inputDelay: 100, timeout: 5000 };

    it("leaves click and find strings as they are, since they search by any identifier", function () {
      expect(action({ click: "Submit" })).to.deep.equal({ click: "Submit" });
      expect(action({ find: "Submit" })).to.deep.equal({ find: "Submit" });
    });

    it("fills click's defaults", function () {
      expect(action({ click: { selector: "#a" } }).click).to.deep.equal({ selector: "#a", timeout: 5000, button: "left" });
      expect(action({ click: { selector: "#a", button: "right", timeout: 0 } }).click).to.include({ button: "right", timeout: 0 });
    });

    for (const [click, expected] of [
      [true, { button: "left" }],
      ["left", { button: "left" }],
      ["right", { button: "right" }],
      ["middle", { button: "middle" }],
      [{ duration: 800 }, { button: "left", duration: 800 }],
      [{ button: "middle" }, { button: "middle" }],
      [false, false],
    ]) {
      it(`makes find.click ${JSON.stringify(click)} the click it performs`, function () {
        expect(action({ find: { selector: "#a", click } }).find.click).to.deep.equal(expected);
      });
    }

    it("fills find's defaults and lists its classes", function () {
      expect(action({ find: { elementClass: "btn" } }).find).to.deep.equal({ elementClass: ["btn"], timeout: 5000, moveTo: false });
    });

    it("normalizes find.type like a type step", function () {
      expect(action({ find: { selector: "#a", type: "x" } }).find.type).to.deep.equal({ keys: ["x"], ...TYPE });
    });

    for (const [type, expected] of [
      ["abc", { keys: ["abc"], ...TYPE }],
      [["a", "$ENTER$"], { keys: ["a", "$ENTER$"], ...TYPE }],
      [{ keys: "a", inputDelay: 0 }, { keys: ["a"], inputDelay: 0, timeout: 5000 }],
      [{ keys: ["a"], selector: "#a", elementClass: "x" }, { keys: ["a"], selector: "#a", elementClass: ["x"], ...TYPE }],
      ["$KEYS", { keys: ["$KEYS"], ...TYPE }],
    ]) {
      it(`expands type ${JSON.stringify(type)}`, function () {
        expect(action({ type }).type).to.deep.equal(expected);
      });
    }

    it("fills dragAndDrop's duration and keeps an authored 0", function () {
      expect(action({ dragAndDrop: { source: "a", target: "b" } }).dragAndDrop.duration).to.equal(1000);
      expect(action({ dragAndDrop: { source: "a", target: "b", duration: 0 } }).dragAndDrop.duration).to.equal(0);
    });

    for (const [swipe, expected] of [
      ["up", { direction: "up", distance: 0.5, duration: 500 }],
      [{ direction: "left", distance: 0.8 }, { direction: "left", distance: 0.8, duration: 500 }],
      [{ from: { x: 1, y: 2 }, to: { x: 3, y: 4 } }, { from: { x: 1, y: 2 }, to: { x: 3, y: 4 }, duration: 500 }],
    ]) {
      it(`expands swipe ${JSON.stringify(swipe)}`, function () {
        expect(action({ swipe }).swipe).to.deep.equal(expected);
      });
    }
  });

  describe("idempotence", function () {
    for (const [name, step] of [
      ["goTo shorthand", { goTo: "https://example.com" }],
      ["httpRequest", { httpRequest: { url: "https://x.com", statusCodes: [200] } }],
      ["httpRequest with OpenAPI", { httpRequest: { openApi: "getUsers" } }],
      ["httpRequest with a request", { httpRequest: { url: "https://x.com", request: {} } }],
      ["click", { click: { elementText: "Go" } }],
      ["find with click and type", { find: { selector: "#a", click: "right", type: "x", elementClass: "b" } }],
      ["type shorthand", { type: "abc" }],
      ["dragAndDrop", { dragAndDrop: { source: "a", target: "b" } }],
      ["swipe shorthand", { swipe: "down" }],
      ["swipe point to point", { swipe: { from: { x: 1, y: 2 }, to: { x: 3, y: 4 } } }],
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
      click: { selector: "#a" },
      find: { selector: "#a" },
      type: { keys: ["a"] },
      dragAndDrop: { source: "a", target: "b" },
      swipe: { direction: "up" },
    };
    // Where an action's own defaults live, when it isn't the `object` component:
    // dragAndDrop is always an object, and swipe's directional form has the most.
    const BRANCH = {
      dragAndDrop: (schema) => ({ properties: schema.properties }),
      swipe: (schema) => schema.components.schemas.directional,
    };
    for (const action of actions) {
      it(`fills every plain schema default: ${action}`, function () {
        if (normalizers[action] === passthrough) this.skip();
        const schema = JSON.parse(fs.readFileSync(path.join(SRC_SCHEMAS, `${action}_v3.schema.json`), "utf8"));
        const defaults = [];
        (function walk(node, trail) {
          if (!node || typeof node !== "object") return;
          if (!Array.isArray(node) && "default" in node && !trail.some((key) => key === "anyOf" || key === "oneOf")) {
            defaults.push([trail.filter((key, i) => trail[i - 1] === "properties"), node.default]);
          }
          for (const [key, child] of Object.entries(node)) walk(child, [...trail, key]);
        })((BRANCH[action] ?? ((s) => s.components.schemas.object))(schema), []);
        expect(defaults, "no defaults found").to.not.be.empty;
        const output = normalizers[action](structuredClone(MINIMAL[action]), action);
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
