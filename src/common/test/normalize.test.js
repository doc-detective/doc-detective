// ADR 01167: validate() returns the effective step. With addDefaults (the
// default), it expands shorthand and fills defaults on its own clone.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { expect } from "chai";
import sinon from "sinon";
import { validate, schemas } from "../dist/index.js";
import { normalize, normalizers, NormalizeError } from "../dist/normalize/index.js";
import { _resetWarnedForTest, applyDefaults, isWholeVariable, passthrough, renameAliases } from "../dist/normalize/helpers.js";

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
const CHECK_LINK = {
  url: "https://example.com",
  params: {},
  statusCodes: [200, 301, 302, 307, 308],
  headers: {},
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

    // A timeout is at least 1 (ADR 01171), so the 0 is a duration.
    it("keeps an authored 0", function () {
      const { goTo } = effective({ goTo: { url: "https://x.com", waitUntil: { networkIdleTime: 0 } } }).object;
      expect(goTo.waitUntil.networkIdleTime).to.equal(0);
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

    it("expands the checkLink shorthand and fills its defaults", function () {
      expect(effective({ checkLink: "https://example.com" }).object.checkLink).to.deep.equal(CHECK_LINK);
    });

    it("wraps a checkLink scalar statusCodes in an array, after coercion", function () {
      for (const statusCodes of [200, "200"]) {
        const { checkLink } = effective({ checkLink: { url: "https://example.com", statusCodes } }).object;
        expect(checkLink.statusCodes).to.deep.equal([200]);
      }
    });

    it("wraps an httpRequest scalar statusCodes in an array", function () {
      const result = effective({ httpRequest: { url: "https://x.com", statusCodes: 404 } });
      expect(result.valid, result.errors).to.equal(true);
      expect(result.object.httpRequest.statusCodes).to.deep.equal([404]);
    });

    it("expands an httpRequest openApi operation ID to the object form", function () {
      const { httpRequest } = effective({ httpRequest: { openApi: "getUsers" } }).object;
      expect(httpRequest.openApi).to.deep.equal({ operationId: "getUsers" });
    });

    it("leaves header strings as authored", function () {
      const headers = "A: b\n$EXTRA_HEADERS";
      expect(effective({ checkLink: { url: "https://x.com", headers } }).object.checkLink.headers).to.equal(headers);
    });

    for (const action of ["saveCookie", "loadCookie"]) {
      const extra = action === "saveCookie" ? { overwrite: false } : {};
      it(`expands the ${action} file shorthand to a name and a path`, function () {
        expect(effective({ [action]: "session.txt" }).object[action]).to.deep.equal({
          name: "session",
          path: "session.txt",
          ...extra,
        });
        expect(effective({ [action]: "./cookies/session.txt" }).object[action]).to.deep.equal({
          name: "session",
          path: "./cookies/session.txt",
          ...extra,
        });
      });

      it(`expands the ${action} name shorthand to a variable of the same name`, function () {
        for (const name of ["session_token", "__Secure-next-auth.session-token", "1P_JAR"]) {
          const result = effective({ [action]: name });
          expect(result.valid, result.errors).to.equal(true);
          expect(result.object[action]).to.deep.equal({ name, variable: name, ...extra });
        }
      });
    }

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

    it("accepts a recording path with folders", function () {
      const result = effective({ stepId: "demo", record: "sub/demo.mp4" });
      expect(result.valid, result.errors).to.equal(true);
      expect(result.object.record).to.deep.equal({ path: "sub/demo.mp4", overwrite: "false" });
    });

    it("accepts a recording extension in any case", function () {
      const result = effective({ stepId: "demo", record: "Demo.MP4" });
      expect(result.valid, result.errors).to.equal(true);
      expect(result.object.record).to.deep.equal({ path: "Demo.MP4", overwrite: "false" });
    });

    // Every normalizer is pure: it copies before it changes anything, nested
    // objects included. Each sample takes the paths that rewrite or fill.
    const AUTHORED = {
      annotate: { text: "Hi", target: { elementText: "Save" } },
      checkLink: { url: "https://x.com", statusCodes: 200 },
      click: { elementText: "Save", elementClass: "primary" },
      closeSurface: ["chrome"],
      dragAndDrop: { source: "a", target: "b" },
      find: { elementText: "Save", click: { button: "right" }, type: "abc", elementClass: "primary" },
      goTo: { url: "https://x.com", waitUntil: { domIdleTime: 0 } },
      httpRequest: { url: "https://x.com", statusCodes: 200, request: { headers: {} }, response: {} },
      loadCookie: { name: "session", path: "session.txt" },
      loadVariables: "vars.env",
      record: { directory: "d" },
      runBrowserScript: { script: "return 1" },
      runCode: { language: "python", code: "print(1)", background: {} },
      runShell: { command: "echo hi", background: {} },
      saveCookie: { name: "session" },
      screenshot: { directory: "d", crop: { selector: "#a" } },
      startSurface: [{ browser: "chrome" }],
      stopRecord: { name: "demo" },
      swipe: { direction: "up" },
      type: { keys: "abc", elementClass: "field" },
      wait: 500,
    };
    for (const action of Object.keys(normalizers)) {
      it(`leaves the authored ${action} value unchanged`, function () {
        expect(AUTHORED, `add an authored ${action} sample`).to.have.property(action);
        const value = AUTHORED[action];
        const snapshot = structuredClone(value);
        normalizers[action](value, action, false, { stepId: "s" });
        expect(value).to.deep.equal(snapshot);
      });
    }

    it("leaves an authored OpenAPI request and a single surface unchanged", function () {
      const http = { openApi: "getUsers" };
      normalizers.httpRequest(http, "httpRequest", false, {});
      expect(http).to.deep.equal({ openApi: "getUsers" });
      const surface = { browser: "chrome" };
      normalizers.startSurface(surface, "startSurface", false, {});
      expect(surface).to.deep.equal({ browser: "chrome" });
    });

    it("returns a capture with its path, and a copy of a stopRecord object", function () {
      for (const action of ["screenshot", "record"]) {
        expect(normalizers[action]({ directory: "d" }, action, false, { stepId: "s" }), action)
          .to.include({ directory: "d" })
          .and.have.property("path");
      }
      const stop = { name: "demo" };
      const output = normalizers.stopRecord(stop, "stopRecord", false, {});
      expect(output).to.deep.equal(stop);
      expect(output).to.not.equal(stop);
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

  describe("process and surface actions", function () {
    const OUTPUT = { args: [], exitCodes: [0], maxVariation: 0, overwrite: "aboveVariation", timeout: 60000 };

    it("expands the runShell shorthand and fills its defaults, but not workingDirectory", function () {
      const result = effective({ runShell: "echo hi" });
      expect(result.valid, result.errors).to.equal(true);
      expect(result.object.runShell).to.deep.equal({ command: "echo hi", ...OUTPUT });
    });

    it("fills tty only for a background process", function () {
      const background = effective({ runShell: { command: "x", background: { name: "web" } } }).object.runShell;
      expect(background.background).to.deep.equal({ name: "web", tty: false });
      const code = effective({ runCode: { language: "js", code: "1", background: { name: "api", tty: true } } }).object;
      expect(code.runCode.background.tty).to.equal(true);
    });

    it("fills runCode's defaults", function () {
      const result = effective({ runCode: { language: "python", code: "print(1)" } });
      expect(result.object.runCode).to.deep.equal({ language: "python", code: "print(1)", ...OUTPUT });
    });

    it("expands the runBrowserScript shorthand and fills its defaults", function () {
      const result = effective({ runBrowserScript: "return 1;" });
      expect(result.object.runBrowserScript).to.deep.equal({
        script: "return 1;",
        args: [],
        maxVariation: 0,
        overwrite: "aboveVariation",
        timeout: 60000,
      });
    });

    for (const [authored, value] of [
      [true, 5000],
      ["true", 5000],
      [false, false],
      [0, 0],
      [1, 1],
      ["250", 250],
      ["$WAIT", "$WAIT"],
    ]) {
      it(`makes wait: ${JSON.stringify(authored)} wait: ${JSON.stringify(value)}`, function () {
        const result = effective({ wait: authored });
        expect(result.valid, result.errors).to.equal(true);
        expect(result.object.wait).to.equal(value);
      });
    }

    it("wraps one closeSurface reference in a list", function () {
      expect(effective({ closeSurface: "web" }).object.closeSurface).to.deep.equal(["web"]);
      expect(effective({ closeSurface: { process: "web" } }).object.closeSurface).to.deep.equal([{ process: "web" }]);
      expect(effective({ closeSurface: ["web", "chrome"] }).object.closeSurface).to.deep.equal(["web", "chrome"]);
    });

    it("returns a copy of a closeSurface list, never the authored one", function () {
      const list = ["web", "chrome"];
      const output = normalizers.closeSurface(list, "closeSurface", false, {});
      expect(output).to.deep.equal(list);
      expect(output).to.not.equal(list);
    });

    it("copies closeSurface's object references, in a list or alone", function () {
      const target = { process: "web" };
      const [fromList] = normalizers.closeSurface([target], "closeSurface", false, {});
      const [alone] = normalizers.closeSurface(target, "closeSurface", false, {});
      for (const output of [fromList, alone]) {
        expect(output).to.deep.equal(target);
        expect(output).to.not.equal(target);
      }
    });

    it("copies a type key list, never keeping the authored one", function () {
      const keys = ["a", "b"];
      const output = normalizers.type(keys, "type", false, {});
      expect(output.keys).to.deep.equal(keys);
      expect(output.keys).to.not.equal(keys);
    });

    it("fills each startSurface descriptor's defaults, by kind", function () {
      const process = { process: "node server.js", name: "api" };
      expect(effective({ startSurface: process }).object.startSurface).to.deep.equal({
        ...process,
        args: [],
        tty: false,
        timeout: 60000,
      });
      expect(effective({ startSurface: { app: "notepad" } }).object.startSurface).to.deep.equal({
        app: "notepad",
        timeout: 60000,
      });
      expect(effective({ startSurface: { browser: "firefox" } }).object.startSurface).to.deep.equal({ browser: "firefox" });
      const array = effective({ startSurface: [{ browser: "chrome", name: "web" }, process] }).object.startSurface;
      expect(array).to.deep.equal([{ browser: "chrome", name: "web" }, { ...process, args: [], tty: false, timeout: 60000 }]);
    });

    it("leaves a startSurface descriptor of no known kind as it is", function () {
      expect(normalizers.startSurface({ name: "x" }, "startSurface")).to.deep.equal({ name: "x" });
      expect(normalizers.startSurface([{ name: "x" }], "startSurface")).to.deep.equal([{ name: "x" }]);
    });

    it("leaves a startSurface descriptor as it is when its kind's schema is missing", function () {
      const components = schemas.startSurface_v3.components.schemas;
      const saved = components.processDescriptor;
      delete components.processDescriptor;
      try {
        const descriptor = { process: "x", name: "p" };
        expect(normalizers.startSurface(descriptor, "startSurface")).to.deep.equal({ process: "x", name: "p" });
      } finally {
        components.processDescriptor = saved;
      }
    });

    it("leaves loadVariables as authored", function () {
      expect(effective({ loadVariables: ".env" }).object).to.deep.equal({ loadVariables: ".env" });
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

    // validate() turns a null click into false before this, but the normalizer
    // never reads null as a click.
    it("doesn't turn a null find.click into a click", function () {
      expect(normalizers.find({ selector: "#a", click: null }, "find", false).click).to.equal(null);
    });

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
    ]) {
      it(`expands type ${JSON.stringify(type)}`, function () {
        expect(action({ type }).type).to.deep.equal(expected);
      });
    }

    it("fills dragAndDrop's duration and keeps an authored 0", function () {
      expect(action({ dragAndDrop: { source: "a", target: "b" } }).dragAndDrop.duration).to.equal(1000);
      expect(action({ dragAndDrop: { source: "a", target: "b", duration: 0 } }).dragAndDrop.duration).to.equal(0);
    });

    it("lists a dragAndDrop locator's elementClass, as find does", function () {
      const { source, target } = action({ dragAndDrop: { source: { elementClass: "btn" }, target: "b" } }).dragAndDrop;
      expect(source.elementClass).to.deep.equal(["btn"]);
      expect(target).to.equal("b");
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

    // Inside an action too: a variable where a list goes can hold the list, so
    // it isn't wrapped in one until it's literal text (ADR 01175).
    for (const [step, read, literal] of [
      [{ type: { keys: "$K" } }, (s) => s.type.keys, ["$K"]],
      [{ find: { selector: "#a", elementClass: "$C" } }, (s) => s.find.elementClass, ["$C"]],
      [{ click: { selector: "#a", elementClass: "$C" } }, (s) => s.click.elementClass, ["$C"]],
      [{ find: { selector: "#a", type: "$K" } }, (s) => s.find.type, { keys: ["$K"], inputDelay: 100, timeout: 5000 }],
      [{ find: { selector: "#a", type: { keys: "$K" } } }, (s) => s.find.type.keys, ["$K"]],
    ]) {
      it(`keeps ${JSON.stringify(step)} until it's literal`, function () {
        const before = effective(step).object;
        expect(read(before)).to.equal(read(step));
        normalize("step_v3", before, { literal: true });
        expect(read(before)).to.deep.equal(literal);
      });
    }

    it("matches whole variable references only", function () {
      expect(["$URL", "$my_var", "$1"].map(isWholeVariable)).to.deep.equal([true, true, true]);
      expect(["URL", "$", "$URL/x", "a $URL", "$$URL", 5, null].map(isWholeVariable)).to.deep.equal(
        [false, false, false, false, false, false, false]
      );
    });
  });

  describe("idempotence", function () {
    for (const [name, step] of [
      ["runShell shorthand", { runShell: "echo hi" }],
      ["runCode in the background", { runCode: { language: "js", code: "1", background: { name: "api" } } }],
      ["runBrowserScript shorthand", { runBrowserScript: "return 1;" }],
      ["wait: true", { wait: true }],
      ["one closeSurface reference", { closeSurface: "web" }],
      ["startSurface array", { startSurface: [{ app: "notepad" }, { process: "x", name: "p" }] }],
      ["goTo shorthand", { goTo: "https://example.com" }],
      ["httpRequest", { httpRequest: { url: "https://x.com", statusCodes: [200] } }],
      ["httpRequest with OpenAPI", { httpRequest: { openApi: "getUsers" } }],
      ["httpRequest with a request", { httpRequest: { url: "https://x.com", request: {} } }],
      ["screenshot: true", { stepId: "s", screenshot: true }],
      ["screenshot without an ID", { screenshot: true }],
      ["record path", { stepId: "s", record: "x.mp4" }],
      ["stopRecord name", { stopRecord: "demo" }],
      ["stopRecord null", { stopRecord: null }],
      ["click", { click: { elementText: "Go" } }],
      ["find with click and type", { find: { selector: "#a", click: "right", type: "x", elementClass: "b" } }],
      ["type shorthand", { type: "abc" }],
      ["dragAndDrop", { dragAndDrop: { source: "a", target: "b" } }],
      ["swipe shorthand", { swipe: "down" }],
      ["swipe point to point", { swipe: { from: { x: 1, y: 2 }, to: { x: 3, y: 4 } } }],
      ["httpRequest with an operation ID", { httpRequest: { openApi: "getUsers", statusCodes: 200 } }],
      ["checkLink shorthand", { checkLink: "https://example.com" }],
      ["checkLink scalar statusCodes", { checkLink: { url: "https://x.com", statusCodes: 200 } }],
      ["saveCookie file", { saveCookie: "./cookies/session.txt" }],
      ["saveCookie name", { saveCookie: "__Secure-next-auth.session-token" }],
      ["loadCookie file", { loadCookie: "session.txt" }],
      ["loadCookie dotted file", { loadCookie: "dir/a.b.txt" }],
      ["saveCookie dot-only file name", { saveCookie: "..txt" }],
      ["loadCookie name", { loadCookie: "session_token" }],
    ]) {
      it(`changes nothing the second time: ${name}`, function () {
        const once = effective(step).object;
        // The runner validates the effective step again, so it must stay valid.
        const twice = effective(once);
        expect(twice.valid, twice.errors).to.equal(true);
        expect(twice.object).to.deep.equal(once);
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

  describe("plain defaults", function () {
    // A probe action per case, so the rule is tested on a shape no real schema
    // has yet. Each needs its own name: applyDefaults caches by action.
    for (const union of ["anyOf", "oneOf"]) {
      const probe = `${union}Probe`;
      afterEach(function () {
        delete schemas[`${probe}_v3`];
      });

      it(`leaves defaults in a nested object with a ${union} to the normalizer`, function () {
        schemas[`${probe}_v3`] = {
          properties: {
            nested: {
              type: "object",
              [union]: [{ required: ["a"] }, { required: ["b"] }],
              properties: { a: { type: "integer", default: 1 }, b: { type: "integer", default: 2 } },
            },
          },
        };
        expect(applyDefaults({}, probe)).to.deep.equal({});
      });
    }
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
    // An action whose object form isn't `components.schemas.object` names the
    // component its minimal step belongs to.
    const MINIMAL = {
      checkLink: { url: "https://example.com" },
      goTo: { url: "https://example.com" },
      httpRequest: { url: "https://example.com" },
      screenshot: {},
      record: {},
      runShell: { command: "echo hi" },
      runCode: { language: "python", code: "print(1)" },
      runBrowserScript: { script: "return 1;" },
      click: { selector: "#a" },
      find: { selector: "#a" },
      type: { keys: ["a"] },
      dragAndDrop: { source: "a", target: "b" },
      swipe: { direction: "up" },
      loadCookie: { name: "session", variable: "session" },
      saveCookie: { name: "session", path: "session.txt" },
      stopRecord: { name: "demo" },
      startSurface: [
        ["processDescriptor", { process: "node server.js", name: "api" }],
        ["appDescriptor", { app: "notepad" }],
      ],
    };
    // Plain defaults only: not under anyOf/oneOf, and not inside a nested
    // object with required keys, whose defaults the normalizer codes by hand.
    function plainDefaultsOf(component) {
      const defaults = [];
      (function walk(node, trail) {
        if (!node || typeof node !== "object") return;
        if (trail[trail.length - 2] === "properties" && Array.isArray(node.required)) return;
        if (!Array.isArray(node) && "default" in node && !trail.some((key) => key === "anyOf" || key === "oneOf")) {
          defaults.push([trail.filter((key, i) => trail[i - 1] === "properties"), node.default]);
        }
        for (const [key, child] of Object.entries(node)) walk(child, [...trail, key]);
      })(component, []);
      return defaults;
    }
    // Moved actions with no object form, so no plain defaults to check. Every
    // other moved action needs a MINIMAL entry, or this test fails. Passthroughs,
    // like loadVariables, skip on their own.
    const NO_OBJECT_FORM = ["wait", "closeSurface"];
    // Where an action's own defaults live, when it isn't the `object` component (or
    // screenshot's `objectShape`, since its object branch is allOf[$ref objectShape, guard]):
    // dragAndDrop is always an object, and swipe's directional form has the most.
    const BRANCH = {
      dragAndDrop: (schema) => ({ properties: schema.properties }),
      swipe: (schema) => schema.components.schemas.directional,
    };
    // Moved actions whose schemas declare no defaults.
    const NO_DEFAULTS = ["loadCookie", "stopRecord"];
    for (const action of actions) {
      it(`fills every plain schema default: ${action}`, function () {
        if (normalizers[action] === passthrough || NO_OBJECT_FORM.includes(action)) this.skip();
        expect(MINIMAL, `add ${action}'s minimal step to MINIMAL`).to.have.property(action);
        if (NO_DEFAULTS.includes(action)) {
          expect(normalizers[action](structuredClone(MINIMAL[action]), action)).to.deep.equal(MINIMAL[action]);
          return;
        }
        const schema = JSON.parse(fs.readFileSync(path.join(SRC_SCHEMAS, `${action}_v3.schema.json`), "utf8"));
        const cases = Array.isArray(MINIMAL[action])
          ? MINIMAL[action].map(([component, minimal]) => [component, schema.components.schemas[component], minimal])
          : [["object", (BRANCH[action] ?? ((s) => s.components.schemas.objectShape ?? s.components.schemas.object))(schema), MINIMAL[action]]];
        for (const [component, node, minimal] of cases) {
          const defaults = plainDefaultsOf(node);
          expect(defaults, `no defaults found in ${component}`).to.not.be.empty;
          const output = normalizers[action](structuredClone(minimal), action, false, {});
          for (const [keys, value] of defaults) {
            expect(keys.reduce((node, key) => node?.[key], output), keys.join(".")).to.deep.equal(value);
          }
        }
      });
    }

    // Exempt from the parity check above, by name, because the run time
    // supplies them only with openApi:
    // - httpRequest's openApi defaults. A step's openApi spreads over the
    //   config or spec integration it names or shares an operation with, so a
    //   default filled here would override the integration's own value. The
    //   handler applies `validateAgainstSchema`'s default after that merge.
    // - httpRequest's `statusCodes`, `method`, and `request.body`. The
    //   operation supplies them: its 2xx responses, its method, and its example.
    const OPENAPI_SUPPLIES = { httpRequest: ["statusCodes", "method"] };
    it("leaves httpRequest's openApi defaults to the run-time merge", function () {
      const properties = schemas.openApi_v3.properties;
      const defaulted = Object.keys(properties).filter((key) => "default" in properties[key]);
      expect(defaulted).to.include("validateAgainstSchema");
      const { openApi } = effective({ httpRequest: { openApi: { operationId: "getUsers" } } }).object.httpRequest;
      expect(openApi).to.not.have.any.keys(...defaulted);
    });

    it("leaves the defaults an OpenAPI operation supplies unset only with openApi", function () {
      const withOpenApi = effective({ httpRequest: { openApi: "createOrder" } }).object.httpRequest;
      const without = effective({ httpRequest: "https://x.com" }).object.httpRequest;
      expect(withOpenApi).to.not.have.any.keys(...OPENAPI_SUPPLIES.httpRequest);
      expect(withOpenApi.request).to.not.have.property("body");
      expect(without).to.include({ method: "get" });
      expect(without.statusCodes).to.deep.equal([200, 201]);
    });
  });

  describe("deprecated aliases", function () {
    let warn;
    beforeEach(function () {
      _resetWarnedForTest();
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
