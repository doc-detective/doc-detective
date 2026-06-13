// Redaction helpers for the debug-dump env-var listings.
//
// Doc Detective's `debug` subcommand and `DOC_DETECTIVE_DEBUG=true` env
// var dump enumerate env vars referenced by config / input files and,
// when `--include-env` is passed, dump the full `process.env`. Both
// flows route values through `redactValue` so credentials don't end up
// in pasted bug reports.
//
// We never redact the NAME — knowing which variable was referenced is
// often more useful than the value, and it lets users grep their config
// for the offender.
//
// Two layers of detection:
//   1. Name-based: catches conventional secret naming (TOKEN, SECRET,
//      KEY, PASSWORD, AUTH, CREDENTIAL, BEARER) PLUS connection-string-
//      shaped suffixes (_URL, _URI, _DSN, _PASS, _PASSWD, _PWD), the
//      WEBHOOK substring, and the bare names JWT / PAT.
//   2. Value-based: catches credentials embedded in values regardless
//      of name — URL userinfo (`://user:pass@`), JWTs, GitHub tokens,
//      and AWS access key IDs. This is what keeps a sloppy
//      `MY_THING = postgres://app:hunter2@host/db` from leaking.

// Name patterns. Both must miss for a value to be considered name-safe.
//
// `_PASS$` covers SMTP_PASS / DB_PASS but NOT PASSAGE / PASSPORT. The
// other suffix anchors are similarly chosen to minimize collateral
// over-redaction while catching every common credential carrier
// surveyed in the security review.
const SECRET_NAME_PATTERNS: RegExp[] = [
  /token|secret|key|password|auth|credential|bearer/i,
  /(_URL|_URI|_DSN|_PASS|_PASSWD|_PWD)$/i,
  /WEBHOOK/i,
  /^(JWT|PAT)$/i,
];

// Value patterns. Even when the NAME looks innocuous, a value matching
// any of these is almost certainly a credential and gets redacted.
//
// Userinfo regex matches `scheme://user:pass@host/...` — the colon-
// separated credentials embedded in connection strings. Anchored on
// `://` to avoid matching arbitrary "x:y@z" substrings.
//
// JWT shape is the canonical three-segment base64url. Anchored on the
// `eyJ` header prefix that all JWTs begin with.
//
// GitHub token patterns from
// https://github.blog/2021-04-05-behind-githubs-new-authentication-token-formats/
//
// AWS access key ID pattern from AWS docs (20 chars, AKIA/ASIA prefix).
const SECRET_VALUE_PATTERNS: RegExp[] = [
  // URL userinfo: `scheme://[user]:password@host`. The user portion is
  // optional so we also catch `redis://:password@host` (a common Redis
  // password-only form).
  /:\/\/[^/\s:@]*:[^@\s]+@/,
  /\beyJ[A-Za-z0-9_-]{5,}\.[A-Za-z0-9_-]{5,}\.[A-Za-z0-9_-]{5,}\b/,
  /\bgh[pousr]_[A-Za-z0-9]{36,255}\b/,
  /\b(AKIA|ASIA)[0-9A-Z]{16}\b/,
];

export function isSecretName(name: string): boolean {
  return SECRET_NAME_PATTERNS.some((p) => p.test(name));
}

export function isSecretValue(value: string): boolean {
  return SECRET_VALUE_PATTERNS.some((p) => p.test(value));
}

export function redactValue(name: string, value: string | undefined): string {
  if (value === undefined) return "<unset>";
  if (value === "") return "<empty>";
  if (isSecretName(name)) {
    return `***redacted (${value.length} chars)***`;
  }
  if (isSecretValue(value)) {
    return `***redacted (${value.length} chars, value shape)***`;
  }
  return value;
}

// Redact a single `process.argv` entry so the dump stays safe to paste.
// CLI args can carry credentials that bypass the env/config redaction:
//   - `--token=ghp_…` / `--api-key=…`  → value redacted when the flag name
//     looks secret;
//   - an embedded credential anywhere (`https://user:pass@host`, a JWT, a
//     GitHub/AWS token) → redacted by value shape.
// Node + entry-point paths and ordinary flags pass through unchanged.
export function redactArg(arg: string): string {
  if (typeof arg !== "string" || arg.length === 0) return arg;
  const eq = arg.indexOf("=");
  if (eq > 0) {
    const flag = arg.slice(0, eq);
    const value = arg.slice(eq + 1);
    const name = flag.replace(/^-+/, "");
    if (isSecretName(name)) {
      return `${flag}=***redacted (${value.length} chars)***`;
    }
    if (isSecretValue(value)) {
      return `${flag}=***redacted (${value.length} chars, value shape)***`;
    }
    return arg;
  }
  if (isSecretValue(arg)) {
    return `***redacted (${arg.length} chars, value shape)***`;
  }
  return arg;
}

// Redact a full argv array with flag/value context. Beyond what redactArg
// catches per-token, this handles the SPLIT form where a secret-named flag
// and its value are separate args (`--password hunter2`) — `hunter2` alone
// matches no value-shape, so it would otherwise leak. When a bare
// secret-named flag is seen, the next non-flag token is redacted.
export function redactArgv(args: string[]): string[] {
  const out: string[] = [];
  let expectSecretValue = false;
  for (const arg of args) {
    if (expectSecretValue && !arg.startsWith("-")) {
      out.push(`***redacted (${arg.length} chars)***`);
      expectSecretValue = false;
      continue;
    }
    expectSecretValue = false;
    // Bare secret-named flag (`--password`, `-p`) with no `=value` — its
    // value is the following token.
    const bareFlag = arg.match(/^--?([^=]+)$/);
    if (bareFlag && isSecretName(bareFlag[1])) {
      out.push(arg);
      expectSecretValue = true;
      continue;
    }
    out.push(redactArg(arg));
  }
  return out;
}

// Recursively walk an arbitrary value (object / array / primitive) and
// return a deep-cloned copy with sensitive strings replaced. Used by
// the Config section of the debug dump so secrets in config files
// (integrations.heretto[].apiToken, integrations.docDetectiveApi.apiKey,
// inline webhook URLs, anything in DOC_DETECTIVE_CONFIG, etc.) don't
// land in pasted bug reports.
//
// Redaction rules, applied per leaf string:
//   1. If the string's parent key matches a secret-name pattern → redact.
//   2. Else if the string's contents match a secret-value pattern → redact.
//   3. Otherwise → return as-is.
//
// Non-string leaves (numbers / booleans / null) are returned as-is even
// under a secret-named key: in practice these don't carry credentials,
// and preserving them keeps the dump useful for debugging non-secret
// numeric / boolean state.
export function redactObject(value: unknown): unknown {
  return redactWalk(value, null, new WeakSet());
}

function redactWalk(
  value: unknown,
  parentKey: string | null,
  seen: WeakSet<object>
): unknown {
  if (value === null || value === undefined) return value;
  if (typeof value === "string") {
    if (parentKey !== null && isSecretName(parentKey)) {
      return `***redacted (${value.length} chars)***`;
    }
    if (isSecretValue(value)) {
      return `***redacted (${value.length} chars, value shape)***`;
    }
    return value;
  }
  if (typeof value !== "object") return value;
  if (seen.has(value as object)) return "<circular>";
  seen.add(value as object);
  if (Array.isArray(value)) {
    // Array elements inherit the parent key (e.g. `tokens: ["a","b"]`
    // → each element evaluated against `tokens` for name-based check).
    return value.map((v) => redactWalk(v, parentKey, seen));
  }
  const out: Record<string, unknown> = {};
  for (const k of Object.keys(value as Record<string, unknown>)) {
    if (k === "__proto__" || k === "constructor" || k === "prototype") continue;
    out[k] = redactWalk((value as Record<string, unknown>)[k], k, seen);
  }
  return out;
}
