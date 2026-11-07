// One grammar for every DOC_DETECTIVE_* boolean (ADR 01165). A leaf module, so
// the runtime modules can read it without importing the CLI or the runner.

const warned = new Set<string>();

function warnOnce(key: string, message: string) {
  if (warned.has(key)) return;
  warned.add(key);
  console.error(`Warning: ${message}`);
}

// On: 1, true, yes, or on. Off: unset, empty, 0, false, no, or off. Trimmed and
// case-insensitive. Anything else warns once and counts as off.
export function envFlag(name: string, env: NodeJS.ProcessEnv = process.env): boolean {
  const value = (env[name] ?? "").trim().toLowerCase();
  if (["1", "true", "yes", "on"].includes(value)) return true;
  if (["", "0", "false", "no", "off"].includes(value)) return false;
  warnOnce(name, `Ignoring ${name}=${JSON.stringify(env[name])}. Use 1, true, yes, or on, or 0, false, no, or off.`);
  return false;
}

// A renamed variable still works for the major, and says what to use instead.
function deprecatedFlag(oldName: string, newName: string, env: NodeJS.ProcessEnv): boolean {
  if (env[oldName] === undefined) return false;
  warnOnce(oldName, `\`${oldName}\` is deprecated. Rename it to \`${newName}\`.`);
  return envFlag(oldName, env);
}

// Whether the environment asks for debug output. DOC_DETECTIVE_DEBUG is the narrow
// switch, for Doc Detective alone. DEBUG is the broad one that many packages read:
// 1, true, *, or a comma-separated pattern matching doc-detective turns this on,
// while a value like `express:*` is someone else's and leaves it off.
export function isDebugRequested(env: NodeJS.ProcessEnv = process.env): boolean {
  if (envFlag("DOC_DETECTIVE_DEBUG", env)) return true;
  if (deprecatedFlag("DOC_DETECTIVE_RUNTIME_DEBUG", "DOC_DETECTIVE_DEBUG", env)) return true;
  return String(env.DEBUG ?? "")
    .split(",")
    .map((pattern) => pattern.trim())
    .some((pattern) => /^(1|true|\*|doc-detective(:?\*)?)$/i.test(pattern));
}
