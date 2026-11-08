// Schema descriptions ship to users (CLI help, docs, editors), so they describe
// what the tool does today, never planned or deferred work. See "Interfaces
// describe the present" in the root CLAUDE.md.
import { expect } from "chai";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), "../src/schemas/src_schemas");
const FUTURE = /not yet implemented|coming soon|reserved for future|in a future (release|version)/i;

function futureDescriptions(node, at, out) {
  if (Array.isArray(node)) node.forEach((v, i) => futureDescriptions(v, `${at}[${i}]`, out));
  else if (node && typeof node === "object") {
    for (const [k, v] of Object.entries(node)) {
      if (k === "description" && typeof v === "string" && FUTURE.test(v)) out.push(`${at}: ${v}`);
      else futureDescriptions(v, `${at}.${k}`, out);
    }
  }
  return out;
}

describe("schema descriptions", function () {
  it("never describe future or unimplemented behavior", function () {
    const hits = fs
      .readdirSync(dir)
      .filter((f) => f.endsWith(".json"))
      .flatMap((f) => futureDescriptions(JSON.parse(fs.readFileSync(path.join(dir, f), "utf8")), f, []));
    expect(hits).to.deep.equal([]);
  });
});
