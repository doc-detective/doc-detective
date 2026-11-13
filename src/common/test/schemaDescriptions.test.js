// Schema descriptions ship to users (CLI help, docs, editors), so they describe
// what the tool does today, never planned or deferred work. See "Interfaces
// describe the present" in the root CLAUDE.md.
import { expect } from "chai";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), "../src/schemas/src_schemas");
// ADR 01188 widens it: "yet", "in this phase", "currently supported", "in the
// future", and pointers into docs/design/ all describe a plan, not the tool.
const FUTURE =
  /not yet implemented|coming soon|reserved for future|in a future (release|version)|in the future|\byet\b|in this phase|currently supported|docs\/design\//i;
// A results file is written to `outputDir`; `output` names the results file.
const WRONG_KEY = /<output>\//;

function badText(pattern, node, at, out) {
  if (Array.isArray(node)) node.forEach((v, i) => badText(pattern, v, `${at}[${i}]`, out));
  else if (node && typeof node === "object") {
    for (const [k, v] of Object.entries(node)) {
      if ((k === "description" || k === "title") && typeof v === "string" && pattern.test(v)) out.push(`${at}.${k}: ${v}`);
      else badText(pattern, v, `${at}.${k}`, out);
    }
  }
  return out;
}

const hitsFor = (pattern) =>
  fs
    .readdirSync(dir)
    .filter((f) => f.endsWith(".json"))
    .flatMap((f) => badText(pattern, JSON.parse(fs.readFileSync(path.join(dir, f), "utf8")), f, []));

describe("schema descriptions", function () {
  it("never describe future or unimplemented behavior", function () {
    expect(hitsFor(FUTURE)).to.deep.equal([]);
  });

  it("name the run folder under `outputDir`, the key that sets it", function () {
    expect(hitsFor(WRONG_KEY)).to.deep.equal([]);
  });
});
