import { styleText } from "node:util";
import type { Command } from "commander";

const DOCS = "https://docs.doc-detective.com/reference/cli";
const ISSUES = "https://github.com/doc-detective/doc-detective/issues";

const RUN_EXIT_CODES = `Exit codes:
  0  All tests passed, warned, or were skipped
  1  At least one test failed
  2  Nothing was tested: bad usage, bad config, no tests, or an internal error
  130, 143  Interrupted by SIGINT or SIGTERM`;

// What each command's help says beyond its options: a description with examples
// first, then exit codes and links. Keyed by the command's path.
const HELP: Record<string, { usage?: string; description: string; after?: string }> = {
  "": {
    usage: "[options]\n       doc-detective <command> [options]",
    description: `Test that your documentation matches your product. With no command, runs the
tests found in the current directory.

Examples:
  doc-detective                     Run every test in the current directory
  doc-detective -i docs/            Run the tests in docs/
  doc-detective -i docs/ -t login   Run only tests whose ID matches "login"
  doc-detective -n --json           Print the test plan without running it
  doc-detective -o results.json     Also write the results to a file`,
    after: `${RUN_EXIT_CODES}\n\nDocs:   ${DOCS}\nIssues: ${ISSUES}`,
  },
  run: {
    usage: "[inputs...] [options]",
    description: `Run tests on specific files or folders. Without inputs, this matches running
doc-detective with no command.

Examples:
  doc-detective run docs/*.md           Test the files your shell matched
  doc-detective run a.spec.json docs/   Test a spec and a folder
  cat a.spec.json | doc-detective run - Test a spec from stdin`,
    after: `${RUN_EXIT_CODES}\n\nDocs: ${DOCS}`,
  },
  help: {
    description: `Show help for a command.

Examples:
  doc-detective help                    Show top-level help
  doc-detective help install browsers   Show help for install browsers`,
    after: `Docs: ${DOCS}`,
  },
  install: {
    usage: "<asset> [options]",
    description: `Install what Doc Detective needs to run tests. Test runs install most of this
when needed, so use this to prepare an image or a CI cache ahead of time.

Examples:
  doc-detective install all --yes       Install runtimes and browsers
  doc-detective install status          Show what's installed
  doc-detective install browsers chrome Install only Chrome`,
    after: `Docs: ${DOCS}/install`,
  },
  "install all": {
    description: `Install runtime packages, browsers, and, on Windows, Git Bash. Doesn't include
agent tools or the Android and iOS toolchains.

Examples:
  doc-detective install all --yes       Prepare a machine or image
  doc-detective install all --dry-run   Preview the install`,
    after: `Docs: ${DOCS}/install#install-all`,
  },
  "install browsers": {
    description: `Install browsers and their drivers.

Examples:
  doc-detective install browsers          Install everything listed below
  doc-detective install browsers chrome   Install only Chrome`,
    after: `Docs: ${DOCS}/install#install-browsers`,
  },
  "install runtime": {
    description: `Install the heavy npm packages that browser, image, and recording steps need.

Examples:
  doc-detective install runtime           Install every package
  doc-detective install runtime appium    Install only Appium`,
    after: `Docs: ${DOCS}/install#install-runtime`,
  },
  "install bash": {
    description: `Install Git Bash on Windows, which runShell uses by default. Uses an existing
Git for Windows if there is one; otherwise downloads MinGit (about 40 MB).

Examples:
  doc-detective install bash`,
    after: `Docs: ${DOCS}/install#install-bash`,
  },
  "install android": {
    description: `Install the Android SDK tools and a system image, and create the default
virtual device. Downloads several gigabytes, so it needs --yes when it can't
ask. Needs Java 17 or later.

Examples:
  doc-detective install android --yes
  doc-detective install android --yes --os-version 14 --device-type tablet
  doc-detective install android --reset-snapshot`,
    after: `Docs: ${DOCS}/install#install-android`,
  },
  "install ios": {
    description: `Check iOS simulator prerequisites on macOS: Xcode command line tools, simctl,
and WebDriverAgent setup.

Examples:
  doc-detective install ios --yes`,
    after: `Docs: ${DOCS}/install#install-ios`,
  },
  "install agents": {
    description: `Install or update Doc Detective's tools for AI coding assistants. Prompts for
anything you don't specify.

Examples:
  doc-detective install agents
  doc-detective install agents --agent claude --scope project --yes`,
    after: `Docs: ${DOCS}/install#install-agents`,
  },
  "install status": {
    description: `Show what's installed and what's out of date.

Examples:
  doc-detective install status
  doc-detective install status --json`,
    after: `Docs: ${DOCS}/install#install-status`,
  },
  debug: {
    description: `Print diagnostics about your system, install, and config, without running
tests. Secrets are redacted on a best-effort basis, so review the output before
sharing it.

Examples:
  doc-detective debug                   Print diagnostics
  doc-detective debug --json            Print diagnostics as JSON
  doc-detective debug -c ci.config.json Check a specific config`,
    after: `Exit codes:
  0  Diagnostics printed
  2  The config is invalid; diagnostics still print

Docs: ${DOCS}#debug
Issues: ${ISSUES}`,
  },
  lsp: {
    description: `Start the language server over stdio, for editors and AI agents. You normally
don't run this yourself: your editor or agent starts it. Press Ctrl-C to stop.

Examples:
  doc-detective lsp`,
    after: `Docs: ${DOCS}#lsp`,
  },
};

// The summary shown for a command in its parent's list.
const SUMMARIES: Record<string, string> = {
  run: "Run tests on specific files or folders",
  install: "Install browsers, runtimes, and agent tools",
  debug: "Print diagnostics for a bug report",
  lsp: "Start the language server for editors and agents",
  help: "Show help for a command",
  "install all": "Install runtimes, browsers, and Git Bash on Windows",
  "install browsers": "Install browsers and their drivers",
  "install runtime": "Install the heavy npm packages",
  "install bash": "Install Git Bash on Windows",
  "install android": "Install the Android toolchain",
  "install ios": "Check iOS simulator prerequisites on macOS",
  "install agents": "Install agent tools for AI coding assistants",
  "install status": "Show what's installed and what's out of date",
};

function commandPath(command: Command): string {
  const names: string[] = [];
  for (let c: Command | null = command; c?.parent; c = c.parent) names.unshift(c.name());
  return names.join(" ");
}

// Apply the help text to a finished command tree. Help prints to stdout, unless
// it's after an error, so styleText picks the color decision for that stream.
export function applyHelpText(command: Command) {
  const key = commandPath(command);
  const entry = HELP[key];
  if (entry) {
    if (entry.usage) command.usage(entry.usage);
    command.summary(SUMMARIES[key] ?? "");
    command.description(entry.description);
    if (entry.after) command.addHelpText("after", `\n${entry.after}`);
  }
  command.configureHelp({
    styleTitle: (title) => styleText("bold", title, { stream: process.stdout }),
    helpWidth: 80,
    // Each description already names its choices and default.
    optionDescription: (option) => option.description,
    argumentDescription: (argument) => argument.description,
  });
  command.commands.forEach(applyHelpText);
}

// Edit distance, for "did you mean". Commander suggests flags, but a root that has
// its own action reports a mistyped command as an extra argument.
function distance(a: string, b: string): number {
  let previous = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const row = [i];
    for (let j = 1; j <= b.length; j++) {
      row[j] = Math.min(row[j - 1] + 1, previous[j] + 1, previous[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    previous = row;
  }
  return previous[b.length];
}

export function nearestCommand(word: string, names: string[]): string | undefined {
  let best: string | undefined;
  let bestDistance = 3;
  for (const name of names) {
    const d = distance(word.toLowerCase(), name.toLowerCase());
    if (d < bestDistance) {
      best = name;
      bestDistance = d;
    }
  }
  return best;
}

// Rewrite the root's "too many arguments" as what it almost always is: a command
// that doesn't exist, or a path that needs `-i`.
export function rewriteRootError(message: string, commandNames: string[]): string {
  const match = /too many arguments\b.*: ([^,\s]+)[^:]*\.\s*$/.exec(message);
  if (!match) return message;
  const word = match[1];
  const near = nearestCommand(word, commandNames);
  const hint = near ? ` (Did you mean ${near}?)` : ` To test a path, use: doc-detective run ${word}`;
  return `error: unknown command '${word}'.${hint}\n`;
}
