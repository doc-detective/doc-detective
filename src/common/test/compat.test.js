/**
 * Detection compatibility guard (permanent).
 *
 * The built-in fileTypes must detect exactly what the last pre-selector
 * release detected, case by case, including where raw-text matching finds
 * statements and markup that a structural parse would not (code regions,
 * lazy continuation lines, MDX files with HTML comments). The expectations in
 * fixtures/compat/expected.json were recorded from that legacy build; see
 * fixtures/compat/cases.mjs before changing either file.
 */

import { expect } from "chai";
import fs from "node:fs";
import { detectTests } from "../dist/detectTests.js";
import { cases } from "./fixtures/compat/cases.mjs";
import { normalize } from "./fixtures/compat/normalize.mjs";

const expected = JSON.parse(
  fs.readFileSync(new URL("./fixtures/compat/expected.json", import.meta.url), "utf8")
);

describe("detection compatibility with the legacy built-ins", function () {
  for (const [name, ext, content] of cases) {
    it(`detects ${name} as the legacy release did`, async function () {
      const actual = normalize(
        await detectTests({ content, filePath: `${name}.${ext}` })
      );
      expect(actual).to.deep.equal(expected[name]);
    });
  }

  it("has a recorded expectation for every case", function () {
    expect(Object.keys(expected).sort()).to.deep.equal(
      cases.map(([name]) => name).sort()
    );
  });
});
