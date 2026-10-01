// Guards dependency ranges that are deliberately NOT the obvious value, so a
// routine "update all deps" pass cannot silently undo them.
//
// `vscode-languageserver-textdocument` is pinned to an exact version rather
// than the usual caret range. The package publishes pre-release builds under a
// `next` dist-tag using plain patch numbers (e.g. 1.0.13 was `next`-only while
// `latest` was 1.0.12). A caret range does not express that distinction — npm
// resolves a range to the highest *published* version regardless of dist-tag,
// so a caret would install the next `next`-tagged build the moment one outranks
// `latest`. The exact pin is the only range that keeps the LSP on the released
// build.
//
// When the `latest` tag moves, bump the exact pin to it — do not restore a
// caret.

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
      `vscode-languageserver-textdocument must be an exact version, got "${range}". A range resolves to the highest published version regardless of dist-tag, which pulls in the next-tagged build rather than the latest-tagged release — see the comment at the top of this file.`
    );
  });
});
