import { applyDefaults } from "./helpers.js";

// A command string is shorthand for { command }. A background process runs
// without a PTY unless `tty` says otherwise. `workingDirectory` has no default:
// omitted, the command runs where Doc Detective runs.
export default function runShell(value: any): any {
  const shell = applyDefaults(typeof value === "string" ? { command: value } : structuredClone(value), "runShell");
  // Coded, not a schema default: it applies only when there's a background.
  if (shell.background) shell.background.tty ??= false;
  return shell;
}
