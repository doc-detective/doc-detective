// Contract suite for the procedure tagger (ADR 01207). The expected values are
// pinned to compromise 14.19.0. A version bump that changes a result must
// update this table on purpose, never by accident.
import assert from "node:assert/strict";
import fs from "node:fs";
import { isInstruction } from "../dist/audit/tagger.js";

const instructions = [
  "Set the timeout to 30",
  "Click **Save**",
  "Run `npm test`",
  "In a terminal, run `npm test`",
  "Read the config",
  "Open a terminal",
  "Sign in with your account",
  "Sign in",
  "Install Doc Detective",
  "Hover over the menu",
  "Double-click the icon",
  "Right-click the file",
  "Tap **Settings**",
  "Select **File** > **Open**",
  "Go to Settings",
  "Log in to the dashboard",
  "Wait for the build to finish",
  "Enter your name",
  "Type `hello`",
  "Press Enter",
  "Choose a plan",
  "Restart the server",
  "Restart Docker",
  "Copy the token",
  "Delete the branch",
  "Delete old branches",
  "Download the installer",
  "Configure the proxy",
  "Make sure Docker is running",
  "Verify that the page loads",
  "Confirm the dialog",
  "Analyze the results",
  "Ensure the server is running",
  "Add `doc-detective` to your PATH",
  "Export the report",
  "Clone the repository",
  "Save",
  "Paste the code into the file",
  "Navigate to the folder",
  "Briefly state the relevant concept",
  "Re-run the test.",
  "Preview the injection using the skill",
  "Apply the patch",
  "Supply your token",
  "Open the file, then save it",
  "Select **File**, and then click **Save**.",
  "Then click Save",
  "Now run the tests",
  "Next, click **Save**",
  "Please enter your name",
  "Just run `npm i`",
  "Don't close the window",
  "Do not close the window",
  "(Optional) Add a description",
  "**Optional:** Click Save",
  "**Create a branch**: run `git checkout -b fix`",
  "__Find the issue__: Navigate to the page with the problem.",
  "**Commit**: Run `git commit`",
  "In the terminal, from the `charmap-docs` folder, run the test:",
  "✅ Follow your own steps exactly as written",
];

const notInstructions = [
  "Set of rules for X",
  "Update frequency is daily",
  "The console shows all matching elements.",
  "Use cases",
  "Installation",
  "To install the CLI:",
  "Note: this is optional",
  "**Settings** page",
  "Le fichier de configuration",
  "Doc Detective runs your tests",
  "First release in 2022",
  "Run history is stored in `.doc-detective`",
  "Check boxes render as toggles",
  "Copy of the file",
  "Export formats",
  "Build artifacts",
  "Start date",
  "Download size: 50 MB",
  "Release notes",
  "Install size",
  "`npm test`",
  "Chrome",
  "Firefox and Safari",
  "Better accuracy",
  "**Action type match** - Step action must match the pattern",
  "**Sequential steps** - Ordered actions that build on each other",
  "Only Chrome supports this",
  "**Exact match** - Step action must match the pattern",
  "**Review**: A maintainer reviews your changes",
  "Next steps",
  "Now available in Chrome",
  "",
];

// Instructions the tagger misses: a verb followed by a bare noun reads the same
// as a noun phrase ("Release notes"). These lists land in "possible procedures".
const knownMisses = ["Open settings", "Copy files to the server", "Run tests with the debug flag"];

describe("audit tagger", function () {
  it("is pinned to compromise 14.19.0", function () {
    const pkg = JSON.parse(fs.readFileSync(new URL("../package.json", import.meta.url), "utf8"));
    assert.equal(pkg.dependencies.compromise, "14.19.0");
  });

  for (const text of instructions) {
    it(`reads ${JSON.stringify(text)} as an instruction`, function () {
      assert.equal(isInstruction(text), true);
    });
  }

  for (const text of notInstructions) {
    it(`doesn't read ${JSON.stringify(text)} as an instruction`, function () {
      assert.equal(isInstruction(text), false);
    });
  }

  for (const text of knownMisses) {
    it(`misses ${JSON.stringify(text)}, a verb with a bare noun`, function () {
      assert.equal(isInstruction(text), false);
    });
  }

  it("reads link text, not the URL", function () {
    assert.equal(isInstruction("Open [the dashboard](https://example.com/a/b)"), true);
  });
});
