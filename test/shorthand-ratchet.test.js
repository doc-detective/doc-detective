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

const CEILING = 15;
const HANDLERS = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "src", "core", "tests");

describe("shorthand ratchet", function () {
  it(`finds ${CEILING} handler files that branch on an action's shorthand`, function () {
    const actions = Object.keys(normalizers).join("|");
    const step = String.raw`\b\w*[sS]tep\.(?:${actions})\b`;
    const shorthand = new RegExp(
      [
        String.raw`typeof\s+${step}\s*[!=]==?\s*["'](?:string|boolean|number|object)["']`,
        String.raw`Array\.isArray\(\s*${step}\s*\)`,
        String.raw`${step}\s*[!=]==?\s*(?:true|false|["'](?:true|false)["'])`,
      ].join("|")
    );
    const files = fs
      .readdirSync(HANDLERS)
      .filter((file) => file.endsWith(".ts") && shorthand.test(fs.readFileSync(path.join(HANDLERS, file), "utf8")));
    expect(files.length, `Handlers that branch on shorthand: ${files.join(", ")}. Lower CEILING when it drops.`).to.equal(
      CEILING
    );
  });
});
