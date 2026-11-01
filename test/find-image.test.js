// Proofs for the claims in docs/design/visual-element-matching.md. Each test name
// starts with the claim it proves, so `manni cite` can pin a claim to its proof.
import path from "node:path";
import { fileURLToPath } from "node:url";
import { resolvePaths } from "../dist/core/files.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

let expect;
before(async function () {
  ({ expect } = await import("chai"));
});

describe("elementImage paths", function () {
  const specFile = path.join(__dirname, "fixtures-dir", "doc.spec.json");
  const resolved = (relativePathBase, elementImage) =>
    resolvePaths({
      config: { relativePathBase },
      object: { find: { elementImage } },
      filePath: specFile,
      nested: true,
      objectType: "spec",
    });

  it("image-path-relative: a string path resolves against the spec file", async function () {
    const out = await resolved("file", "icons/save.svg");
    expect(out.find.elementImage).to.equal(path.join(path.dirname(specFile), "icons", "save.svg"));
  });

  it("image-path-relative: an object's path resolves against the spec file", async function () {
    const out = await resolved("file", { path: "icons/save.svg", threshold: 0.95 });
    expect(out.find.elementImage).to.deep.equal({
      path: path.join(path.dirname(specFile), "icons", "save.svg"),
      threshold: 0.95,
    });
  });

  it("image-path-relative: relativePathBase cwd resolves against the working directory", async function () {
    const out = await resolved("cwd", "icons/save.svg");
    expect(out.find.elementImage).to.equal(path.resolve("icons/save.svg"));
  });

  it("image-path-relative: base64 isn't treated as a path", async function () {
    const out = await resolved("file", { base64: "iVBORw0KGgo=" });
    expect(out.find.elementImage).to.deep.equal({ base64: "iVBORw0KGgo=" });
  });
});
