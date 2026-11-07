import { applyDefaults } from "./helpers.js";

// No shorthand. A background process runs without a PTY unless `tty` says
// otherwise. `workingDirectory` has no default, as in runShell.
export default function runCode(value: any): any {
  const code = applyDefaults(structuredClone(value), "runCode");
  if (code.background) code.background.tty ??= false;
  return code;
}
