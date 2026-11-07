import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parse as parseYaml } from "yaml";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const docsYml = parseYaml(
  fs.readFileSync(path.join(repoRoot, "docs", "fern", "docs.yml"), "utf8")
);

describe("docs site links", function () {
  describe("docs.yml redirects for old published paths", function () {
    const redirects = docsYml.redirects;
    const destinationOf = (source) =>
      redirects.find((r) => r.source === source)?.destination;

    // Old paths still linked from READMEs, the samples repo, and the Action's
    // fixtures. Each 404s on docs.doc-detective.com without an entry.
    const expected = {
      "/docs/get-started/doc-detective-tests": "/docs/get-started/how-testing-works",
      "/docs/category/actions": "/docs/get-started/concepts",
      "/docs/category/schemas": "/reference/schemas/config",
      "/docs/references/schemas/typeKeys": "/reference/schemas/type",
      "/get-started.html": "/docs/get-started/introduction",
    };
    for (const [source, destination] of Object.entries(expected)) {
      it(`redirects ${source} to ${destination}`, function () {
        assert.equal(destinationOf(source), destination);
      });
    }

    it("lists the literal typeKeys entry before the :slug pattern", function () {
      // Fern takes the first match. The pattern would send typeKeys to
      // /reference/schemas/typeKeys, which doesn't exist.
      const literal = redirects.findIndex(
        (r) => r.source === "/docs/references/schemas/typeKeys"
      );
      const pattern = redirects.findIndex(
        (r) => r.source === "/docs/references/schemas/:slug"
      );
      assert.ok(literal !== -1 && literal < pattern);
    });
  });

  it("sets og:url to the docs host", function () {
    assert.equal(docsYml.metadata["og:url"], "https://docs.doc-detective.com");
  });

  it("has no doc-detective.com/docs/ deep links in schemas, fixtures, or docs pages", function () {
    // doc-detective.com redirects every path to the docs home, so these
    // links land on the wrong page. Docs live on docs.doc-detective.com.
    const roots = [
      "src/common/src/schemas/src_schemas",
      "src/common/test/fixtures",
      "docs/fern/pages",
    ];
    const offenders = [];
    for (const root of roots) {
      for (const entry of fs.readdirSync(path.join(repoRoot, root), {
        recursive: true,
        withFileTypes: true,
      })) {
        if (!entry.isFile()) continue;
        const file = path.join(entry.parentPath, entry.name);
        if (/(?<!docs\.)doc-detective\.com\/docs\//.test(fs.readFileSync(file, "utf8"))) {
          offenders.push(path.relative(repoRoot, file));
        }
      }
    }
    assert.deepEqual(offenders, []);
  });
});
