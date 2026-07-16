// Secret references: `$secret.NAME` resolves from `process.env.NAME` at step
// execution time and is NEVER emitted. See ADR 01071 and
// docs/design/secrets-management.md.
//
// Two guarantees, both structural rather than best-effort:
//
//   1. A resolved secret reaches the action handler (the execution copy) but
//      never the step report (the report copy keeps the `$secret.NAME`
//      placeholder). `runStep` owns that split; this module owns resolution.
//   2. A secret is never COMPARED. A pass/fail, a retry count, or an echoed
//      failure description over a secret is an oracle that leaks the value one
//      run at a time — so a `$secret.` token in any emit-or-compare field is a
//      hard FAIL before the value is ever read (`findDisallowedSecretRefs`).
//
// Everything here is pure and unit-testable without a driver.

import { isSecretValue } from "../debug/redact.js";

export {
  SECRET_TOKEN_REGEX,
  resolveSecrets,
  findDisallowedSecretRefs,
  deepCloneStep,
  registerSecretValue,
  listRegisteredSecretNames,
  hasRegisteredSecrets,
  scrubString,
  scrubObject,
  redactUndeclaredSecrets,
  SECRET_MIN_MASK_LENGTH,
};

// Token grammar: `$secret.` + an env var name. Global, so it is only ever used
// with `matchAll` / `replace` — both of which are stateless on the source regex
// (`matchAll` clones internally; `replace` with /g resets lastIndex). Never call
// `.test()` on this: that IS stateful. Use `hasSecretToken` instead.
const SECRET_TOKEN_REGEX = /\$secret\.([A-Za-z0-9_]+)/g;

// Non-global twin for stateless predicate checks.
const SECRET_TOKEN_PROBE = /\$secret\.[A-Za-z0-9_]+/;

function hasSecretToken(value: string): boolean {
  return SECRET_TOKEN_PROBE.test(value);
}

// Does any string anywhere in this structure carry a `$secret.` token? Cheap
// short-circuiting probe that lets the resolver skip its clone-and-walk on the
// steps that don't reference a secret — which is nearly all of them.
function containsSecretToken(value: unknown, seen = new WeakSet<object>()): boolean {
  if (typeof value === "string") return hasSecretToken(value);
  if (value === null || typeof value !== "object") return false;
  if (seen.has(value as object)) return false;
  seen.add(value as object);
  if (Array.isArray(value)) {
    return value.some((entry) => containsSecretToken(entry, seen));
  }
  for (const key of Object.keys(value as Record<string, unknown>)) {
    if (containsSecretToken((value as Record<string, unknown>)[key], seen)) return true;
  }
  return false;
}

// --- mask registry -------------------------------------------------------
// Populated at resolution time; consumed by the scrubbing layer. Runners are
// in-process async closures sharing module state, so a module-level store is
// shared across concurrent runners for free.
//
// Values shorter than this are registered but never used as mask needles —
// masking a 1-3 char value would shred unrelated output. Resolution still works;
// the caller warns.
const SECRET_MIN_MASK_LENGTH = 4;

const registeredSecrets = new Map<string, string>();

// Mask needles, rebuilt on registration and kept sorted longest-first. When one
// registered value contains another, masking the SHORT one first would consume
// its prefix and strand the rest of the long one in the output, so order is a
// correctness property, not a nicety.
type MaskNeedle = { needle: string; name: string };
let maskNeedles: MaskNeedle[] = [];

function rebuildMaskNeedles(): void {
  const needles: MaskNeedle[] = [];
  for (const [name, value] of registeredSecrets) {
    if (value.length < SECRET_MIN_MASK_LENGTH) continue;
    needles.push({ needle: value, name });
    // Secrets ride in URLs and form bodies, where they arrive percent-encoded.
    // Only worth registering when encoding actually changes the string.
    const encoded = encodeURIComponent(value);
    if (encoded !== value && encoded.length >= SECRET_MIN_MASK_LENGTH) {
      needles.push({ needle: encoded, name });
    }
  }
  needles.sort((a, b) => b.needle.length - a.needle.length);
  maskNeedles = needles;
}

function registerSecretValue(name: string, value: string): void {
  if (typeof value !== "string" || value.length === 0) return;
  // A secret referenced in N steps registers N times with the same value. Only
  // rebuild when something actually changed.
  if (registeredSecrets.get(name) === value) return;
  registeredSecrets.set(name, value);
  rebuildMaskNeedles();
}

function listRegisteredSecretNames(): string[] {
  return [...registeredSecrets.keys()];
}

// Cheap guard so callers can skip the walk entirely on runs with no secrets —
// which is nearly every run.
function hasRegisteredSecrets(): boolean {
  return maskNeedles.length > 0;
}

function maskLiteral(name: string): string {
  return `***secret.${name}***`;
}

/**
 * Replace every registered secret value in a string with `***secret.NAME***`.
 *
 * The mask literal is deliberately UNSPECIFIED (ADR 01072): it names the secret
 * so a masked report stays debuggable, but specs must not match on it.
 *
 * Plain `split`/`join` rather than a regex: secret values are arbitrary strings
 * and would need escaping to be regex-safe, and a mis-escaped needle fails OPEN
 * (leaks) rather than closed.
 */
function scrubString<T>(value: T): T {
  if (typeof value !== "string") return value;
  if (maskNeedles.length === 0) return value;
  let out: string = value;
  for (const { needle, name } of maskNeedles) {
    if (out.includes(needle)) out = out.split(needle).join(maskLiteral(name));
  }
  return out as unknown as T;
}

/**
 * Deep copy of an arbitrary value with every registered secret masked, in KEYS
 * as well as values (a secret can end up as an object key — a header name built
 * from a credential, a map keyed by token). Cycle-safe: the runner's result
 * objects can carry back-references.
 */
function scrubObject(value: unknown): unknown {
  if (maskNeedles.length === 0) return value;
  return deepMapStrings(value, scrubString, { mapKeys: true });
}

// Rebuilding an object from its enumerable own keys is lossless for the
// JSON-shaped data this module was written for (reports, step outputs) and
// DESTRUCTIVE for anything else: `Object.keys(new Error("boom"))` is `[]`, so a
// naive walk turns an Error into `{}` and swallows the message and stack. Dates,
// Buffers, and Maps degrade the same way. The CLI logger hands us whatever a
// caller passed, so pass such values through untouched rather than mangle them.
function isPlainContainer(value: object): boolean {
  if (Array.isArray(value)) return true;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

/**
 * Cycle-safe deep copy that applies `map` to every string leaf. Shared by the
 * registry scrub and the heuristic backstop so the container handling, cycle
 * guard, and prototype-pollution guard exist once.
 *
 * `mapKeys` also rewrites object keys. Only the registry scrub wants it: a
 * secret can end up IN a key. The heuristic pass deliberately doesn't, since a
 * credential-shaped key is not a thing and rewriting keys there would only risk
 * collisions.
 */
function deepMapStrings(
  value: unknown,
  map: (value: string) => string,
  opts: { mapKeys?: boolean } = {},
  seen: WeakMap<object, unknown> = new WeakMap()
): unknown {
  if (typeof value === "string") return map(value);
  if (value === null || typeof value !== "object") return value;
  if (!isPlainContainer(value as object)) return value;
  const existing = seen.get(value as object);
  if (existing !== undefined) return existing;

  if (Array.isArray(value)) {
    const out: unknown[] = [];
    seen.set(value as object, out);
    for (const entry of value) out.push(deepMapStrings(entry, map, opts, seen));
    return out;
  }
  const out: Record<string, unknown> = {};
  seen.set(value as object, out);
  for (const key of Object.keys(value as Record<string, unknown>)) {
    if (key === "__proto__" || key === "constructor" || key === "prototype") continue;
    const mapped = deepMapStrings((value as Record<string, unknown>)[key], map, opts, seen);
    if (!opts.mapKeys) {
      out[key] = mapped;
      continue;
    }
    // A masked key can collide with an existing one (two distinct keys that
    // both contain the same secret mask to the same string). Keep the first
    // writer rather than silently dropping a field.
    const outKey = map(key);
    if (outKey !== key && Object.prototype.hasOwnProperty.call(out, outKey)) {
      out[`${outKey} (${Object.keys(out).length})`] = mapped;
    } else {
      out[outKey] = mapped;
    }
  }
  return out;
}

// --- heuristic backstop (ADR 01073) --------------------------------------
// For credentials the author never declared with `$secret.`. VALUE-shape only:
// `isSecretValue` (JWTs, GitHub PATs, AWS key IDs, URL userinfo). The
// name-based half of debug/redact.ts is deliberately NOT used here — measured
// against real run output it redacted this feature's own `$secret.NAME`
// placeholders and `***secret.NAME***` masks, plus legitimate public values
// like `Authorization: "Bearer public-demo-token"`, while still missing the
// commonest leak (`type: "$PASSWORD"` reports under the key `type`, which no
// name pattern matches). It stays where it already earns its keep: the `debug`
// dump, where the user asked for a pasteable dump and over-redaction is right.

/**
 * Deep copy with credential-SHAPED strings replaced. A backstop, not the
 * mechanism: a credential with no recognizable shape (an ordinary password) is
 * not caught, and `$secret.` is the answer for those.
 */
function redactUndeclaredSecrets(value: unknown): unknown {
  return deepMapStrings(value, (s) =>
    isSecretValue(s) ? `***redacted (${s.length} chars, value shape)***` : s
  );
}

// --- clone ---------------------------------------------------------------
// JSON round-trip, matching the existing precedent in config.ts / validate.ts.
// Steps are JSON-shaped by construction (they come from JSON/YAML specs), so
// this is lossless here. Also fixes latent aliasing: today `runStep` resolves
// the caller's step in place, so a retried step re-resolves an already-resolved
// object.
function deepCloneStep<T>(step: T): T {
  if (step === null || typeof step !== "object") return step;
  return JSON.parse(JSON.stringify(step));
}

// --- disallowed contexts (fail closed) -----------------------------------
// Paths are dot-joined from the step root, with array indices as segments
// (`onFail.0.if`, `find.elementClass.1`). Each rule matches a path PREFIX so
// nested shapes are covered without enumerating them.
//
// The listed fields either COMPARE the value (match/assertion/routing), or
// EMIT it verbatim (`description`), or LAUNDER it back into unprotected state
// (`variables` / `outputs` write resolved expression values to process.env).
// Everything not listed is an emit SINK — the value goes to the system under
// test (typed keys, request URL/headers/body, shell command) and never comes
// back through the report.
const DISALLOWED_PATH_RULES: { pattern: RegExp; reason: string }[] = [
  // --- common to every action ---
  {
    pattern: /^description$/,
    reason: "step descriptions are emitted verbatim by every reporter",
  },
  {
    pattern: /^variables(\.|$)/,
    reason:
      "`variables` writes resolved values to the environment as ordinary variables, which would launder the secret back in unprotected",
  },
  {
    pattern: /^outputs(\.|$)/,
    reason: "`outputs` are emitted in the report and readable by later steps",
  },
  {
    pattern: /^if(\.|$)/,
    reason: "a guard condition makes control flow a readable function of the secret",
  },
  {
    pattern: /^assertions(\.|$)/,
    reason: "an assertion over a secret is an oracle: it leaks a bit per run",
  },
  {
    pattern: /^on(Pass|Fail|Warning|Skip)(\.|$)/,
    reason: "routing conditions make control flow a readable function of the secret",
  },
  // --- find: every element-targeting field is a comparison ---
  {
    // Bare-string shorthand (`find: "text"`) is elementText.
    pattern: /^find$/,
    reason: "the `find` string shorthand is an elementText match",
  },
  {
    pattern:
      /^find\.(elementText|selector|elementId|elementTestId|elementAria|elementClass|elementAttribute)(\.|$)/,
    reason: "element-targeting fields are matched against the page",
  },
  // --- httpRequest: the `response` block and status codes are expectations ---
  {
    pattern: /^httpRequest\.(statusCodes|response)(\.|$)/,
    reason: "the expected response is compared against the real one",
  },
  { pattern: /^checkLink\.statusCodes(\.|$)/, reason: "status codes are compared" },
  // --- runShell / runCode: expected output and exit codes are expectations ---
  {
    pattern: /^run(Shell|Code)\.(exitCodes|stdio)(\.|$)/,
    reason: "expected exit codes and stdio are compared against the real output",
  },
  {
    pattern: /^run(Shell|Code)\.background\.waitUntil(\.|$)/,
    reason: "readiness conditions are compared against process output",
  },
  // --- type / typeKeys: `keys` is the sink; targeting and waiting compare ---
  {
    pattern:
      /^type(Keys)?\.(selector|elementText|elementId|elementTestId|elementAria)(\.|$)/,
    reason: "element-targeting fields are matched against the page",
  },
  {
    pattern: /^type(Keys)?\.waitUntil(\.|$)/,
    reason: "readiness conditions are compared against the page",
  },
];

type DisallowedRef = { path: string; name: string; reason: string };

/**
 * Statically walk an UNRESOLVED step and report every `$secret.` reference that
 * sits in an emit-or-compare field. Runs before resolution, so a blocked
 * reference fails without the value ever being read.
 */
function findDisallowedSecretRefs(step: any): DisallowedRef[] {
  const found: DisallowedRef[] = [];
  walkStrings(step, [], (value, pathSegments) => {
    if (!hasSecretToken(value)) return;
    const path = pathSegments.join(".");
    const rule = DISALLOWED_PATH_RULES.find((r) => r.pattern.test(path));
    if (!rule) return;
    for (const match of value.matchAll(SECRET_TOKEN_REGEX)) {
      found.push({ path, name: match[1], reason: rule.reason });
    }
  });
  return found;
}

function walkStrings(
  value: any,
  pathSegments: string[],
  visit: (value: string, pathSegments: string[]) => void
): void {
  if (typeof value === "string") {
    visit(value, pathSegments);
    return;
  }
  if (value === null || typeof value !== "object") return;
  if (Array.isArray(value)) {
    value.forEach((entry, index) =>
      walkStrings(entry, [...pathSegments, String(index)], visit)
    );
    return;
  }
  for (const key of Object.keys(value)) {
    if (key === "__proto__" || key === "constructor" || key === "prototype") continue;
    walkStrings(value[key], [...pathSegments, key], visit);
  }
}

type ResolveResult = {
  step: any;
  failure?: { status: "FAIL"; description: string };
  warnings: string[];
};

/**
 * Resolve every `$secret.NAME` reference in a step against `process.env`,
 * returning a resolved COPY (the input is never mutated).
 *
 * A secret resolves to an opaque string and nothing more: unlike `replaceEnvs`,
 * there is no whole-string JSON->object expansion and no re-resolution of `$VAR`
 * references found inside the value. Both would walk, spread, and re-emit the
 * secret field by field.
 *
 * Fails closed: a blocked reference, or one whose variable is unset/empty, fails
 * the step naming only the VARIABLE, never the value.
 */
function resolveSecrets(step: any): ResolveResult {
  const warnings: string[] = [];

  // Fast path for the overwhelming majority of steps: no `$secret.` token
  // anywhere, so there is nothing to guard, clone, or resolve. Without this,
  // every step of every run — including every run by every user who has never
  // heard of secrets — pays a full JSON round-trip clone plus a recursive walk.
  if (!containsSecretToken(step)) return { step, warnings };

  const disallowed = findDisallowedSecretRefs(step);
  if (disallowed.length > 0) {
    const detail = disallowed
      .map((r) => `\`$secret.${r.name}\` in \`${r.path}\` (${r.reason})`)
      .join("; ");
    return {
      step,
      warnings,
      failure: {
        status: "FAIL",
        description:
          `Secret references aren't allowed in fields that are compared or reported: ${detail}. ` +
          `Secrets can only be sent to the system under test (for example \`typeKeys\`, or an \`httpRequest\` URL, header, or body). ` +
          `Assert on an observable effect instead — a status code, or an element that appears once the credential worked.`,
      },
    };
  }

  const missing = new Set<string>();
  const resolved = deepCloneStep(step);

  mapStrings(resolved, (value) => {
    if (!hasSecretToken(value)) return value;
    return value.replace(SECRET_TOKEN_REGEX, (token, name: string) => {
      const envValue = process.env[name];
      if (envValue === undefined || envValue === "") {
        missing.add(name);
        return token;
      }
      registerSecretValue(name, envValue);
      if (envValue.length < SECRET_MIN_MASK_LENGTH) {
        warnings.push(
          `Secret \`${name}\` is shorter than ${SECRET_MIN_MASK_LENGTH} characters, so it won't be masked in reports or logs (masking a value that short would corrupt unrelated output).`
        );
      }
      return envValue;
    });
  });

  if (missing.size > 0) {
    const names = [...missing];
    return {
      step,
      warnings,
      failure: {
        status: "FAIL",
        description:
          `Couldn't resolve ${names.length === 1 ? "secret" : "secrets"} ${names
            .map((n) => `\`$secret.${n}\``)
            .join(", ")}: ${
            names.length === 1 ? "the environment variable is" : "the environment variables are"
          } unset or empty. ` +
          `Set ${names.map((n) => `\`${n}\``).join(", ")} in the environment, load it with \`loadVariables\`, or gate this context with \`requires.env\` so it skips when the credential is absent.`,
      },
    };
  }

  return { step: resolved, warnings };
}

/**
 * In-place string mapper over an already-cloned structure. Separate from
 * `walkStrings` because it REPLACES values rather than observing them.
 */
function mapStrings(value: any, map: (value: string) => string): void {
  if (value === null || typeof value !== "object") return;
  if (Array.isArray(value)) {
    value.forEach((entry, index) => {
      if (typeof entry === "string") value[index] = map(entry);
      else mapStrings(entry, map);
    });
    return;
  }
  for (const key of Object.keys(value)) {
    if (key === "__proto__" || key === "constructor" || key === "prototype") continue;
    const entry = value[key];
    if (typeof entry === "string") value[key] = map(entry);
    else mapStrings(entry, map);
  }
}
