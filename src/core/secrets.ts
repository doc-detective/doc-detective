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

// Token grammar: `$secret.` + an env var name. Global, so it is only ever used
// with `matchAll` / `replace` — both of which are stateless on the source regex
// (`matchAll` clones internally; `replace` with /g resets lastIndex). Never call
// `.test()` on this: that IS stateful. Use `hasSecretToken` instead.
const SECRET_TOKEN_REGEX = /\$secret\.([A-Za-z0-9_]+)/g;

// Non-global twin for stateless predicate checks.
const SECRET_TOKEN_PROBE = /\$secret\.[A-Za-z0-9_]+/;

// Values shorter than this cannot be mask needles — masking a 1-3 char value
// would shred unrelated output. Resolution FAILs for such values (sending a
// credential we cannot mask would violate the no-emission guarantee).
const SECRET_MIN_MASK_LENGTH = 4;

// Consts are declared above this block (and functions below it), matching the
// module layout used elsewhere in core — e.g. tests/ffmpegRecorder.ts.
export {
  SECRET_TOKEN_REGEX,
  resolveSecrets,
  findDisallowedSecretRefs,
  describeDisallowedSecretRefs,
  registerSecretValue,
  listRegisteredSecretNames,
  clearRegisteredSecrets,
  hasRegisteredSecrets,
  scrubString,
  scrubObject,
  redactUndeclaredSecrets,
  SECRET_MIN_MASK_LENGTH,
};

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
// shared across concurrent runners for free. (SECRET_MIN_MASK_LENGTH, the floor
// below which a value is never used as a mask needle, is declared at the top.)

// Keyed by VALUE, not by name. A name can legitimately resolve to more than one
// value in a single run — a later `loadVariables` re-points the same variable,
// or an embedding host mutates process.env between runs. Keying by name would
// make the second registration EVICT the first, and the evicted value then
// sails through the end-of-run report scrub unmasked even though it was
// resolved, sent, and possibly echoed earlier in that same run. The registry is
// append-only: once a value has been handed to a step, it must stay maskable
// for the rest of the process.
const registeredSecrets = new Map<string, string>(); // value -> name

// Mask needles, rebuilt on registration and kept sorted longest-first. When one
// registered value contains another, masking the SHORT one first would consume
// its prefix and strand the rest of the long one in the output, so order is a
// correctness property, not a nicety.
type MaskNeedle = { needle: string; name: string };
let maskNeedles: MaskNeedle[] = [];

function rebuildMaskNeedles(): void {
  const needles: MaskNeedle[] = [];
  for (const [value, name] of registeredSecrets) {
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
  if (registeredSecrets.get(value) === name) return;
  registeredSecrets.set(value, name);
  rebuildMaskNeedles();
}

function listRegisteredSecretNames(): string[] {
  return [...new Set(registeredSecrets.values())];
}

/**
 * Drop every registered value. The runner never calls this — within a run the
 * registry must only ever grow (see the note on `registeredSecrets`). It exists
 * for tests, which need isolation because the registry is module state, and for
 * a long-lived embedding host that wants to stop masking a previous run's
 * credentials once that run's report has been consumed.
 */
function clearRegisteredSecrets(): void {
  registeredSecrets.clear();
  rebuildMaskNeedles();
}

// Cheap guard so callers can skip the walk entirely on runs with no secrets —
// which is nearly every run.
function hasRegisteredSecrets(): boolean {
  return maskNeedles.length > 0;
}

// The mask names the secret so a masked report stays debuggable — but the name
// is author-chosen and the VALUE is arbitrary, so the preferred literal can
// itself contain the needle. A credential that is literally `secret`, or a
// variable named after its own value, would otherwise be "masked" into a string
// that still contains it verbatim (and each scrub pass would re-find it).
// Fall back to a literal that names nothing when that happens: losing the
// which-credential hint is strictly better than emitting the credential.
function maskLiteral(name: string, needle: string): string {
  const preferred = `***secret.${name}***`;
  if (!preferred.includes(needle)) return preferred;
  const generic = "***secret***";
  if (!generic.includes(needle)) return generic;
  return "***";
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
    if (out.includes(needle)) out = out.split(needle).join(maskLiteral(name, needle));
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
    const mapped = deepMapStrings((value as Record<string, unknown>)[key], map, opts, seen);
    // A masked key can collide with an existing one (two distinct keys that
    // both contain the same secret mask to the same string). Keep the first
    // writer rather than silently dropping a field.
    let outKey = opts.mapKeys ? map(key) : key;
    if (outKey !== key && Object.prototype.hasOwnProperty.call(out, outKey)) {
      outKey = `${outKey} (${Object.keys(out).length})`;
    }
    defineDataProperty(out, outKey, mapped);
  }
  return out;
}

// `out[key] = v` invokes the `__proto__` SETTER rather than creating a data
// property, which is the prototype-pollution hazard — but simply skipping those
// keys silently DROPS legitimate data (an HTTP request body is free to contain a
// field called `constructor`, and dropping it would send a different request
// than the author wrote, or hide it from the report). Define them as plain own
// data properties instead: no setter runs, Object.prototype is untouched, and
// the payload survives intact.
function defineDataProperty(
  target: Record<string, unknown>,
  key: string,
  value: unknown
): void {
  Object.defineProperty(target, key, {
    value,
    writable: true,
    enumerable: true,
    configurable: true,
  });
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
  // --- element targeting, wherever it appears ---
  // These field NAMES mean "match this against the page" under every action that
  // has them (find, type, click, dragAndDrop's source/target, and any action
  // added later). Matching on the segment rather than enumerating
  // `<action>.<field>` per action is deliberate: the per-action list already
  // missed click and dragAndDrop once, and a new action would silently inherit
  // the gap. Anything named this way is a comparison, never a sink.
  {
    pattern:
      /(^|\.)(elementText|selector|elementId|elementTestId|elementAria|elementClass|elementAttribute)(\.|$)/,
    reason: "element-targeting fields are matched against the page",
  },
  {
    // Bare-string shorthands that mean "find this element":
    //   find: "text"                    -> elementText
    //   dragAndDrop: { source: "..." }  -> element specification
    pattern: /^(find|dragAndDrop\.(source|target))$/,
    reason: "this string shorthand is an element match",
  },
  // --- readiness conditions, wherever they appear ---
  // `waitUntil` hangs off goTo, type, startSurface (app/process descriptors),
  // and runShell/runCode background blocks. Every one of them polls until the
  // condition matches, which is a comparison.
  {
    pattern: /(^|\.)waitUntil(\.|$)/,
    reason: "readiness conditions are compared against the target",
  },
  // --- expected results, wherever they appear ---
  {
    pattern: /(^|\.)(statusCodes|exitCodes|stdio)(\.|$)/,
    reason: "expected status/exit codes and stdio are compared against the real result",
  },
  // --- httpRequest: the whole `response` block is an expectation ---
  {
    pattern: /^httpRequest\.response(\.|$)/,
    reason: "the expected response is compared against the real one",
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

/**
 * The user-facing wording for a blocked reference. Shared so the pre-guard
 * check in `runContext` and `resolveSecrets`' own fail-closed path can't drift.
 * Names the variable and the field; never the value.
 */
function describeDisallowedSecretRefs(refs: DisallowedRef[]): string {
  const detail = refs
    .map((r) => `\`$secret.${r.name}\` in \`${r.path}\` (${r.reason})`)
    .join("; ");
  return (
    `Secret references aren't allowed in fields that are compared or reported: ${detail}. ` +
    `Secrets can only be sent to the system under test (for example \`type\`, or an \`httpRequest\` URL, header, or body). ` +
    `Assert on an observable effect instead — a status code, or an element that appears once the credential worked.`
  );
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
  // Fast path for the overwhelming majority of steps: no `$secret.` token
  // anywhere, so there is nothing to guard, clone, or resolve. Without this,
  // every step of every run — including every run by every user who has never
  // heard of secrets — pays a full JSON round-trip clone plus a recursive walk.
  if (!containsSecretToken(step)) return { step };

  // Defense in depth: `runContext` runs this same check earlier (before the
  // guard/skip branches, which can route a step past runStep entirely), but
  // resolveSecrets must stay fail-closed on its own for the httpRequest
  // OpenAPI-injection pass and any future caller.
  const disallowed = findDisallowedSecretRefs(step);
  if (disallowed.length > 0) {
    return {
      step,
      failure: {
        status: "FAIL",
        description: describeDisallowedSecretRefs(disallowed),
      },
    };
  }

  const missing = new Set<string>();
  const unmaskable = new Set<string>();

  // `deepMapStrings` COPIES rather than mutating in place, so this both clones
  // and resolves in a single walk. Building a fresh object also means no
  // assignment ever targets an attacker-influenced key on an existing object —
  // the prototype-pollution shape is absent by construction rather than by
  // denylist (the copy's keys are still filtered by the shared walker).
  const resolved = deepMapStrings(step, (value) => {
    if (!hasSecretToken(value)) return value;
    return value.replace(SECRET_TOKEN_REGEX, (token, name: string) => {
      const envValue = process.env[name];
      if (envValue === undefined || envValue === "") {
        missing.add(name);
        return token;
      }
      // Too short to mask safely — collect and fail below rather than resolve.
      if (envValue.length < SECRET_MIN_MASK_LENGTH) {
        unmaskable.add(name);
        return token;
      }
      registerSecretValue(name, envValue);
      return envValue;
    });
  });

  // A value below the masking floor cannot honor the guarantee this feature
  // exists for: it would be sent to the target but never registered as a mask
  // needle, so an echo would land verbatim in outputs and reports. Warning and
  // proceeding would mean `$secret.` silently means "not actually secret" for
  // this value. Fail instead — declared means protected, always.
  if (unmaskable.size > 0) {
    const names = [...unmaskable];
    return {
      step,
      failure: {
        status: "FAIL",
        description:
          `${names.length === 1 ? "Secret" : "Secrets"} ${names
            .map((n) => `\`$secret.${n}\``)
            .join(", ")} ${names.length === 1 ? "is" : "are"} shorter than ${SECRET_MIN_MASK_LENGTH} characters. ` +
          `Doc Detective can't mask a value that short without corrupting unrelated output, so it can't guarantee the value stays out of reports and logs — and a secret it can't protect is one it won't resolve. ` +
          `Use a longer value, or reference it as a plain \`$${names[0]}\` variable if it isn't really a credential.`,
      },
    };
  }

  if (missing.size > 0) {
    const names = [...missing];
    return {
      step,
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

  return { step: resolved };
}

