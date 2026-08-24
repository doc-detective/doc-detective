// Guards dependency ranges that are deliberately NOT the obvious value, so a
// routine "update all deps" pass cannot silently undo them.
//
// `vscode-languageserver-textdocument` is pinned to an exact version rather
// than the usual caret range. The registry's `latest` dist-tag is 1.0.12;
// 1.0.13 is published only under `next`. A caret range does not express that
// distinction — npm resolves a range to the highest *published* version
// regardless of dist-tag, so `^1.0.12` still installs the `next`-tagged 1.0.13.
// The exact pin is the only range that keeps the LSP on the released build.
//
// If a future release moves the `latest` tag to 1.0.13 or beyond, update the
// pin (and this test) together — do not simply restore a caret.

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function rootManifest() {
  return JSON.parse(
    fs.readFileSync(path.join(repoRoot, "package.json"), "utf8")
  );
}

describe("deliberate dependency pins", function () {
  it("pins vscode-languageserver-textdocument to an exact version", function () {
    const range = rootManifest().dependencies?.[
      "vscode-languageserver-textdocument"
    ];

    assert.ok(
      range,
      "vscode-languageserver-textdocument is no longer a direct dependency; if that is intended, drop this guard."
    );
    assert.match(
      range,
      /^\d+\.\d+\.\d+$/,
      `vscode-languageserver-textdocument must be an exact version, got "${range}". A range resolves to the highest published version, which is the next-tagged 1.0.13 rather than the latest-tagged release.`
    );
  });
});
