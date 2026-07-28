import assert from "node:assert/strict";
import path from "node:path";
import { resolvePaths } from "../dist/core/files.js";

// The image finding criterion carries a template-image path in two shapes:
// bare string (`"image": "gear.png"`) and object (`"image": {"path": "gear.png"}`).
// Both must resolve relative to the spec file like every other spec path, and
// data URIs must pass through untouched (they're inline images, not paths).
describe("resolvePaths image criterion", function () {
  const specDir = path.resolve("test", "artifacts");
  const specFile = path.join(specDir, "fake.spec.json");
  const config = { relativePathBase: "file" };

  async function resolveSpec(step) {
    const object = { tests: [{ steps: [step] }] };
    const resolved = await resolvePaths({ config, object, filePath: specFile });
    return resolved.tests[0].steps[0];
  }

  it("resolves a bare-string image path relative to the spec file", async function () {
    const step = await resolveSpec({ find: { image: "images/gear.png" } });
    assert.equal(step.find.image, path.join(specDir, "images", "gear.png"));
  });

  it("leaves a bare-string data URI untouched", async function () {
    const uri = "data:image/png;base64,iVBORw0KGgo=";
    const step = await resolveSpec({ find: { image: uri } });
    assert.equal(step.find.image, uri);
  });

  it("resolves the object form's path relative to the spec file", async function () {
    const step = await resolveSpec({
      find: { image: { path: "images/gear.png", matchThreshold: 0.9 } },
    });
    assert.equal(step.find.image.path, path.join(specDir, "images", "gear.png"));
    assert.equal(step.find.image.matchThreshold, 0.9);
  });

  it("leaves an object-form data URI untouched", async function () {
    const uri = "data:image/png;base64,iVBORw0KGgo=";
    const step = await resolveSpec({ find: { image: { path: uri } } });
    assert.equal(step.find.image.path, uri);
  });

  it("resolves image inside click and dragAndDrop criteria too", async function () {
    const clickStep = await resolveSpec({ click: { image: "gear.png" } });
    assert.equal(clickStep.click.image, path.join(specDir, "gear.png"));

    const dragStep = await resolveSpec({
      dragAndDrop: {
        source: { image: "card.png" },
        target: { image: { path: "column.png" } },
      },
    });
    assert.equal(
      dragStep.dragAndDrop.source.image,
      path.join(specDir, "card.png")
    );
    assert.equal(
      dragStep.dragAndDrop.target.image.path,
      path.join(specDir, "column.png")
    );
  });

  it("leaves absolute image paths untouched", async function () {
    const absolute = path.join(specDir, "gear.png");
    const step = await resolveSpec({ find: { image: absolute } });
    assert.equal(step.find.image, absolute);
  });
});
