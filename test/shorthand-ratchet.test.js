// ADR 01167: validate() returns the effective step, so action handlers shouldn't
// branch on an action's shorthand forms. This ratchet counts the handler files
// that still do. When you move an action's normalization into
// src/common/src/normalize/<action>.ts, lower CEILING. It reaches 0 when every
// action has moved. EXEMPT lists the few branches that aren't shorthand.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { expect } from "chai";
import { normalizers } from "../dist/common/src/normalize/index.js";

const CEILING = 4;
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

// Branches that aren't shorthand, by file and exact expression. Anything else in
// these files still counts.
const EXEMPT = {
  // A click string searches by any identifier and has no object form (ADR 01175).
  "click.ts": ['typeof step.click === "string"'],
  // A find string searches by any identifier and has no object form (ADR 01175).
  "findElement.ts": ['typeof step.find === "string"', 'typeof step.find === "object"'],
};

// The shorthand branches in a handler file's source, less its exemptions.
function branches(file, source) {
  const exempt = EXEMPT[file] ?? [];
  return [...source.matchAll(new RegExp(shorthand.source, "g"))].filter(([code]) => !exempt.includes(code));
}

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

  // An exemption covers its exact expression in its own file, and nothing else.
  for (const [file, code, counts] of [
    ["click.ts", 'typeof step.click === "string"', false],
    ["findElement.ts", 'typeof step.find === "string"', false],
    ["findElement.ts", 'typeof step.find === "object"', false],
    ["click.ts", 'typeof step.click === "object"', true],
    ["click.ts", "Array.isArray(step.click)", true],
    ["findElement.ts", "step.find === true", true],
    ["findElement.ts", 'typeof step.click === "string"', true],
    ["typeKeys.ts", 'typeof step.find === "string"', true],
  ]) {
    it(`${counts ? "counts" : "exempts"} ${code} in ${file}`, function () {
      expect(branches(file, code)).to.have.lengthOf(counts ? 1 : 0);
    });
  }

  it(`finds ${CEILING} handler files that branch on an action's shorthand`, function () {
    const files = fs
      .readdirSync(HANDLERS)
      .filter((file) => file.endsWith(".ts") && branches(file, fs.readFileSync(path.join(HANDLERS, file), "utf8")).length);
    expect(files.length, `Handlers that branch on shorthand: ${files.join(", ")}. Lower CEILING when it drops.`).to.equal(
      CEILING
    );
  });
});
