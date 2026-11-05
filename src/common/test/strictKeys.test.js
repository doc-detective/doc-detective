// ADR 01150: specs and steps reject unknown keys, so a typo can't silently turn
// off a check. These run through validate(), the same path the runner uses.
import { expect } from "chai";
import { validate, schemas, detectTests } from "../dist/index.js";

const goTo = { goTo: "https://example.com" };
const spec = (extra = {}, stepExtra = {}) => ({
  ...extra,
  tests: [{ steps: [{ ...goTo, ...stepExtra }] }],
});

describe("unknown keys", function () {
  describe("step_v3", function () {
    it("rejects an unknown key alongside a valid action", function () {
      const result = validate({ schemaKey: "step_v3", object: { ...goTo, asertions: [] } });
      expect(result.valid).to.equal(false);
      expect(result.errors).to.include('"additionalProperty":"asertions"');
    });

    it("accepts every common key and report field", function () {
      const object = {
        ...goTo,
        stepId: "s",
        description: "d",
        result: "PASS",
        resultDescription: "ok",
        durationMs: 1,
      };
      const result = validate({ schemaKey: "step_v3", object, addDefaults: false });
      expect(result.valid, result.errors).to.equal(true);
    });

    it("lists exactly the common keys and every action at the root", function () {
      const step = schemas.step_v3;
      const actions = step.anyOf.flatMap((branch) =>
        branch.allOf.flatMap((part) => Object.keys(part.properties ?? {}))
      );
      const common = Object.keys(step.components.schemas.common.properties);
      expect(Object.keys(step.properties).sort()).to.deep.equal(
        [...new Set([...common, ...actions])].sort()
      );
    });
  });

  describe("spec_v3", function () {
    it("rejects an unknown spec key", function () {
      const result = validate({ schemaKey: "spec_v3", object: spec({ runon: [] }), addDefaults: false });
      expect(result.valid).to.equal(false);
    });

    it("rejects an unknown step key nested in a spec", function () {
      const result = validate({
        schemaKey: "spec_v3",
        object: spec({}, { asertions: [] }),
        addDefaults: false,
      });
      expect(result.valid).to.equal(false);
    });

    it("rejects an unknown step key nested in a resolved context", function () {
      const object = {
        tests: [{ contexts: [{ steps: [{ ...goTo, asertions: [] }] }] }],
      };
      const result = validate({ schemaKey: "spec_v3", object, addDefaults: false });
      expect(result.valid).to.equal(false);
    });

    it("doesn't let an unknown key escape through the v2 fallback", function () {
      const object = {
        typo: 1,
        tests: [{ steps: [{ action: "goTo", url: "https://example.com" }] }],
      };
      const result = validate({ schemaKey: "spec_v3", object, addDefaults: false });
      expect(result.valid).to.equal(false);
    });

    it("still upgrades a clean v2 spec, including the IDs the runner injects", function () {
      const object = {
        specId: "s",
        contentPath: "s.spec.json",
        tests: [{ steps: [{ action: "goTo", url: "https://example.com" }] }],
      };
      const result = validate({ schemaKey: "spec_v3", object, addDefaults: false });
      expect(result.valid, result.errors).to.equal(true);
    });
  });

  describe("action objects", function () {
    for (const [name, step] of [
      ["click", { click: { selector: "a", timeout: 50, typo: 1 } }],
      ["find.click", { find: { selector: "a", click: { button: "left", typo: 1 } } }],
      ["runCode", { runCode: { language: "python", code: "print(1)", typo: 1 } }],
      ["record", { record: { path: "a.mp4", typo: 1 } }],
      ["dragAndDrop", { dragAndDrop: { source: "a", target: "b", typo: 1 } }],
    ]) {
      it(`rejects an unknown key in ${name}`, function () {
        const result = validate({ schemaKey: "step_v3", object: step, addDefaults: false });
        expect(result.valid).to.equal(false);
      });

      it(`accepts ${name} without the unknown key`, function () {
        const clean = structuredClone(step);
        const strip = (value) => {
          if (value && typeof value === "object") {
            delete value.typo;
            Object.values(value).forEach(strip);
          }
        };
        strip(clean);
        const result = validate({ schemaKey: "step_v3", object: clean, addDefaults: false });
        expect(result.valid, result.errors).to.equal(true);
      });
    }
  });

  describe("inline tests", function () {
    const fileType = {
      extensions: ["md"],
      inlineStatements: {
        testStart: ["<!--\\s*test\\s+([\\s\\S]*?)\\s*-->"],
        testEnd: ["<!--\\s*test end\\s*-->"],
        ignoreStart: [],
        ignoreEnd: [],
        step: ["<!--\\s*step\\s+([\\s\\S]*?)\\s*-->"],
      },
      markup: [
        { name: "link", regex: ["\\[.*?\\]\\((.*?)\\)"], actions: [{ goTo: "$1", typo: 1 }] },
      ],
    };
    const detect = async (content, onInvalid) =>
      detectTests({ content, filePath: "a.md", fileType, config: { logLevel: "silent" }, onInvalid });

    it("reports an invalid authored step, and still drops it", async function () {
      const reasons = [];
      const tests = await detect(
        '<!-- step {"goTo":"https://example.com","asertions":[]} -->\n<!-- step {"goTo":"https://example.com"} -->',
        (reason) => reasons.push(reason)
      );
      expect(reasons).to.have.lengthOf(1);
      expect(reasons[0]).to.include("asertions");
      expect(tests[0].steps).to.have.lengthOf(1);
    });

    it("doesn't report a test that only ended up with no steps", async function () {
      const reasons = [];
      await detect('<!-- test {"testId":"t"} -->\ntext\n<!-- test end -->', (reason) =>
        reasons.push(reason)
      );
      expect(reasons).to.deep.equal([]);
    });

    it("doesn't report an invalid step from detected markup", async function () {
      const reasons = [];
      await detect("[link](https://example.com)", (reason) => reasons.push(reason));
      expect(reasons).to.deep.equal([]);
    });

    it("reports a v2 inline test with an unknown key instead of dropping the key", async function () {
      const reasons = [];
      await detect(
        '<!-- test {"id":"t","typo":1} -->\n<!-- step {"goTo":"https://example.com"} -->\n<!-- test end -->',
        (reason) => reasons.push(reason)
      );
      expect(reasons).to.have.lengthOf(1);
    });

    it("works without an onInvalid callback", async function () {
      const tests = await detect('<!-- step {"goTo":"https://example.com","asertions":[]} -->');
      expect(tests).to.be.an("array");
    });
  });
});
