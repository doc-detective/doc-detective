// Hiding environment variable values in browser captures (ADR 01178). The page
// scripts run in a real headless Chrome against the 8092 test page. The page
// never receives a secret: it returns candidate text, and Node picks what to blur.
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { registerEnvValue, resetMasking } from "../dist/core/masking.js";
import {
  blurSecretsForCapture,
  blurCandidates,
  collectCaptureCandidates,
  hideTypedSecret,
  hideFocusedField,
  selectSecretCandidates,
} from "../dist/core/tests/hideSecrets.js";
import { runTests } from "../dist/core/index.js";
import { typeKeys } from "../dist/core/tests/typeKeys.js";

const SECRET = "hunter-2222";

describe("hiding secrets in captures", function () {
  beforeEach(() => resetMasking());
  afterEach(() => resetMasking());

  describe("without a browser", function () {
    // A driver whose page returns the given candidates, recording every call.
    const fakeDriver = (candidates = []) => {
      const calls = [];
      return {
        calls,
        execute: async (fn, ...args) => {
          calls.push([fn, ...args]);
          return fn === collectCaptureCandidates ? candidates : undefined;
        },
      };
    };
    const argsHold = (driver, value) => JSON.stringify(driver.calls.map((call) => call.slice(1))).includes(value);

    it("does nothing to the page when no secret is registered", async function () {
      const driver = fakeDriver();
      const restore = await blurSecretsForCapture(driver);
      await restore();
      await hideTypedSecret(driver, ["anything"]);
      assert.equal(driver.calls.length, 0);
    });

    it("decides in Node which candidates to blur, and never sends the page a secret", async function () {
      registerEnvValue("DD_PASSWORD", SECRET);
      const driver = fakeDriver([
        [0, `The token is ${SECRET} today.`],
        [1, "Nothing here."],
        [2, SECRET],
      ]);
      const restore = await blurSecretsForCapture(driver);
      assert.equal(driver.calls[0][0], collectCaptureCandidates);
      assert.deepEqual(driver.calls[1], [blurCandidates, [0, 2]]);
      await restore();
      assert.equal(driver.calls.length, 3);
      assert.equal(argsHold(driver, SECRET), false);
    });

    it("hides the focused field only when the typed keys hold a secret, without sending it", async function () {
      registerEnvValue("DD_PASSWORD", SECRET);
      const driver = fakeDriver();
      await hideTypedSecret(driver, ["plain text"]);
      assert.equal(driver.calls.length, 0);
      await hideTypedSecret(driver, ["h", "u", "n", "t", "e", "r", "-", "2", "2", "2", "2"]);
      assert.deepEqual(driver.calls, [[hideFocusedField]]);
    });

    it("fails closed, naming why, when the page won't run the blur", async function () {
      registerEnvValue("DD_PASSWORD", SECRET);
      const driver = {
        execute: async () => {
          throw new Error("session lost");
        },
      };
      await assert.rejects(blurSecretsForCapture(driver), {
        message: "Couldn't hide secret values on the page before the screenshot: session lost",
      });
    });

    it("types anyway when the page rejects the hiding style", async function () {
      registerEnvValue("DD_PASSWORD", SECRET);
      const typed = [];
      const driver = {
        execute: async () => {
          throw new Error("blocked by the page");
        },
        keys: async (keys) => typed.push(keys),
        state: {},
      };
      const result = await typeKeys({ config: {}, step: { type: { keys: [SECRET] } }, driver });
      assert.equal(result.status, "PASS", result.description);
      assert.deepEqual(typed, [[SECRET]]);
    });

    it("selects the candidates whose text holds a secret", function () {
      const candidates = [[0, "a"], [1, `x${SECRET}y`], [2, SECRET]];
      assert.deepEqual(selectSecretCandidates(candidates, [SECRET]), [1, 2]);
      assert.deepEqual(selectSecretCandidates(candidates, []), []);
    });
  });

  describe("in headless Chrome", function () {
    this.timeout(180000);

    async function runSteps(steps) {
      fs.mkdirSync(path.resolve("./.tmp"), { recursive: true });
      const file = path.resolve(`./.tmp/masking-capture-${process.pid}.spec.json`);
      fs.writeFileSync(
        file,
        JSON.stringify({
          specId: "masking-capture",
          tests: [{ testId: "t", runOn: [{ browsers: [{ name: "chrome", headless: true }] }], steps }],
        })
      );
      try {
        const results = await runTests({ input: file, logLevel: "silent", telemetry: { send: false } });
        return results.specs[0].tests[0].contexts[0].steps;
      } finally {
        fs.rmSync(file, { force: true });
      }
    }

    const seedPage = {
      runBrowserScript: {
        script: `document.body.insertAdjacentHTML("beforeend", '<p id="exact">${SECRET}</p><p id="inside">The token is ${SECRET} today.</p><div id="outer"><span id="split">hun<b>ter-2222</b></span></div><input id="field"><p id="clean">Nothing here.</p><script>var x = "${SECRET}";</script>'); document.getElementById("field").value = "${SECRET}"; return true;`,
      },
    };
    // The test runs the Node-side selection in the page only to drive the real
    // page scripts in one session.
    const blurWith = (secrets) => ({
      runBrowserScript: {
        script: `const candidates = (${collectCaptureCandidates})(); (${blurCandidates})((${selectSecretCandidates})(candidates, ${JSON.stringify(secrets)})); return JSON.stringify({ ids: Array.from(document.querySelectorAll("[data-dd-secret-blur]"), (e) => e.id).sort(), left: document.querySelectorAll("[data-dd-capture-candidate]").length, filter: document.getElementById("exact").style.filter });`,
      },
    });

    it("blurs exact text, text inside a longer string, split text, and an input value", async function () {
      const steps = await runSteps([{ goTo: "http://localhost:8092" }, seedPage, blurWith([SECRET])]);
      assert.deepEqual(steps.map((s) => s.result), ["PASS", "PASS", "PASS"], JSON.stringify(steps));
      assert.deepEqual(JSON.parse(steps[2].outputs.result), {
        ids: ["exact", "field", "inside", "split"],
        left: 0,
        filter: "blur(8px)",
      });
    });

    it("blurs nothing when there's no secret", async function () {
      const steps = await runSteps([{ goTo: "http://localhost:8092" }, seedPage, blurWith([])]);
      assert.deepEqual(JSON.parse(steps[2].outputs.result), { ids: [], left: 0, filter: "" });
    });
  });
});
