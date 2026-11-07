// ADR 01167: validate() returns the effective step, so action handlers shouldn't
// branch on an action's shorthand forms. This ratchet counts the handler files
// that still do. When you move an action's normalization into
// src/common/src/normalize/<action>.ts, lower CEILING. It reaches 0 when every
// action has moved.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { expect } from "chai";
import { normalizers } from "../dist/common/src/normalize/index.js";

const CEILING = 9;
const HANDLERS = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "src", "core", "tests");

const step = String.raw`\b\w*[sS]tep\.(?:${Object.keys(normalizers).join("|")})\b`;
// A shorthand branch tests an action's value for a non-object form, or for a
// value that expands, like `true` or a quoted boolean. `false` is the canonical
// disabled value an effective step keeps, so checking it isn't shorthand.
const shorthand = new RegExp(
  [
    String.raw`typeof\s+${step}\s*[!=]==?\s*["'](?:string|boolean|number|object)["']`,
    String.raw`Array\.isArray\(\s*${step}\s*\)`,
    String.raw`${step}\s*[!=]==?\s*(?:true\b|["'](?:true|false)["'])`,
  ].join("|")
);

describe("shorthand ratchet", function () {
  for (const [code, counts] of [
    ['typeof step.goTo === "string"', true],
    ['typeof authoredStep.record !== "boolean"', true],
    ['typeof step.click === "object"', true],
    ["Array.isArray(step.type)", true],
    ["step.wait === true", true],
    ['step.wait === "false"', true],
    ["step.record === false", false],
    ["step.stopRecord !== false", false],
    ['typeof step.record !== "undefined"', false],
    ['typeof step.goTo.url === "string"', false],
    ['typeof step.goToStep === "string"', false],
    ['typeof value === "string"', false],
  ]) {
    it(`${counts ? "counts" : "ignores"} ${code}`, function () {
      expect(shorthand.test(code)).to.equal(counts);
    });
  }

  it(`finds ${CEILING} handler files that branch on an action's shorthand`, function () {
    const files = fs
      .readdirSync(HANDLERS)
      .filter((file) => file.endsWith(".ts") && shorthand.test(fs.readFileSync(path.join(HANDLERS, file), "utf8")));
    expect(files.length, `Handlers that branch on shorthand: ${files.join(", ")}. Lower CEILING when it drops.`).to.equal(
      CEILING
    );
  });
});
