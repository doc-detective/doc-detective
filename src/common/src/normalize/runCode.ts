import { applyDefaults, ttySize } from "./helpers.js";

// No shorthand. A background process runs without a PTY unless `tty` says
// otherwise. `workingDirectory` has no default, as in runShell.
export default function runCode(value: any): any {
  const code = applyDefaults(structuredClone(value), "runCode");
  // Coded, not a schema default: it applies only when there's a background.
  if (code.background) code.background.tty = ttySize(code.background.tty);
  return code;
}
