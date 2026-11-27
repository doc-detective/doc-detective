import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { loadMatrixValues } from "../dist/matrixFile.js";

describe("loadMatrixValues (ADR 01241)", function () {
  let dir;
  const write = (name, text) => fs.writeFileSync(path.join(dir, name), text);
  before(function () {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), "matrix-file-"));
  });
  after(function () {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it("reads a JSON array relative to the base folder", function () {
    write("pages.json", JSON.stringify(["a", "b"]));
    assert.deepEqual(loadMatrixValues("page", { file: "pages.json" }, dir), ["a", "b"]);
  });

  it("reads a JSON array of objects", function () {
    write("objects.json", JSON.stringify([{ t: "x" }, { t: "y" }]));
    assert.deepEqual(loadMatrixValues("v", { file: path.join(dir, "objects.json") }, "/elsewhere"), [{ t: "x" }, { t: "y" }]);
  });

  it("reads each sitemap <loc>, decoding entities and dropping repeats", function () {
    write(
      "sitemap.xml",
      `<?xml version="1.0"?><urlset><url><loc> https://x.test/a?b=1&amp;c=2 </loc></url><url><loc>https://x.test/&#233;</loc></url><url><loc>https://x.test/&#xE9;</loc></url><url><loc>&bogus;</loc></url><url><loc>&#99999999;</loc></url></urlset>`
    );
    assert.deepEqual(loadMatrixValues("url", { file: "SITEMAP.xml".toLowerCase() }, dir), [
      "https://x.test/a?b=1&c=2",
      "https://x.test/é",
      "&bogus;",
      "&#99999999;",
    ]);
  });

  it("leaves a surrogate character reference, which XML forbids, as written", function () {
    write("surrogates.xml", "<urlset><url><loc>&#55296;</loc></url><url><loc>&#xDFFF;</loc></url></urlset>");
    assert.deepEqual(loadMatrixValues("url", { file: "surrogates.xml" }, dir), ["&#55296;", "&#xDFFF;"]);
  });

  const cases = [
    ["a missing file", "missing.json", null, "Couldn't read `matrix` file `<file>`."],
    ["another extension", "pages.txt", "a", "Couldn't load `matrix` key `k`: `<file>` must be `.json` or `.xml`."],
    ["JSON that doesn't parse", "bad.json", "{", "Couldn't load `matrix` key `k`: `<file>` isn't a JSON array."],
    ["JSON that isn't an array", "obj.json", "{}", "Couldn't load `matrix` key `k`: `<file>` isn't a JSON array."],
    ["an empty JSON array", "empty.json", "[]", "Couldn't load `matrix` key `k`: `<file>` has no values."],
    ["values matrix doesn't accept", "mixed.json", '["a", {"b": 1}]', "Couldn't load `matrix` key `k`: `<file>` has values `matrix` doesn't accept."],
    ["a sitemap with no <loc>", "empty.xml", "<urlset/>", "Couldn't load `matrix` key `k`: `<file>` has no `<loc>` entries."],
  ];
  for (const [name, file, text, message] of cases) {
    it(`throws for ${name}`, function () {
      if (text !== null) write(file, text);
      assert.throws(() => loadMatrixValues("k", { file }, dir), {
        message: message.replace("<file>", path.join(dir, file)),
      });
    });
  }
});
