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

  it("has no doc-detective.com/docs/ deep links in schemas, fixtures, docs pages, or READMEs", function () {
    // doc-detective.com redirects every path to the docs home, so these
    // links land on the wrong page. Docs live on docs.doc-detective.com.
    const offenders = [
      "src/common/src/schemas/src_schemas",
      "src/common/test/fixtures",
      "docs/fern/pages",
      "README.md",
      "docs/README.md",
    ]
      .flatMap(filesUnder)
      .filter((file) =>
        /(?<!docs\.)doc-detective\.com\/docs\//.test(fs.readFileSync(file, "utf8"))
      )
      .map((file) => path.relative(repoRoot, file));
    assert.deepEqual(offenders, []);
  });

  it("links to /contribute/ pages only at routes the Contribute tab publishes", function () {
    // Fern builds a route from the tab slug, then each section slug (its own
    // `slug:` or its title, lowercased and hyphenated), then the page slug.
    // The Contribute tab and its "Contribute" section each add a segment, so
    // pages publish at /contribute/contribute/<page>. The docs.yml redirects
    // for the old /docs/contribute/* paths point at the same routes.
    const routes = new Set();
    const slugify = (title) => title.toLowerCase().replace(/\s+/g, "-");
    const walk = (items, prefix) => {
      for (const item of items) {
        if (item.page) routes.add(`${prefix}/${item.slug ?? slugify(item.page)}`);
        if (item.section) {
          const slug = item["skip-slug"] ? "" : `/${item.slug ?? slugify(item.section)}`;
          walk(item.contents ?? [], prefix + slug);
        }
        // ponytail: `folder:` entries (the repo guides) aren't derived. A link
        // into one fails here until this learns Fern's folder slugs.
      }
    };
    const tab = docsYml.navigation.find((t) => t.tab === "contribute");
    walk(tab.layout, `/${docsYml.tabs.contribute.slug}`);

    assert.ok(routes.has("/contribute/contribute/local-development"));
    assert.equal(
      docsYml.redirects.find((r) => r.source === "/docs/contribute/local-development")
        ?.destination,
      "/contribute/contribute/local-development"
    );

    const broken = [];
    for (const file of filesUnder("docs/fern/pages")) {
      const text = fs.readFileSync(file, "utf8");
      for (const [, route] of text.matchAll(/["'(](\/contribute\/[^\s)"'#?]*)/g)) {
        if (!routes.has(route)) broken.push(`${path.relative(repoRoot, file)}: ${route}`);
      }
    }
    assert.deepEqual(broken, []);
  });
});

// Every file under a repo-relative directory, or the file itself.
function filesUnder(relPath) {
  const full = path.join(repoRoot, relPath);
  if (fs.statSync(full).isFile()) return [full];
  return fs
    .readdirSync(full, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile())
    // Dirent.parentPath needs Node 20.12+; the repo requires 22+.
    .map((entry) => path.join(entry.parentPath, entry.name));
}
