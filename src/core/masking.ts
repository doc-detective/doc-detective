// Mask environment variable values in every output (ADR 01178).
//
// A value is secret when it came from a substituted `$NAME`, a loaded `.env`,
// `loadVariables`, or credential file, or a secret-looking variable name; its
// name isn't in the run's `publicVariables`; and it's at least 4 characters and
// isn't `true`, `false`, or `null`. Output shows it as `***NAME***`.
//
// Masking is output-only. Steps, assertions, routing, `$$`, and `variables`
// exports keep real values. The registry is module state, so concurrent
// runners share it, and it's append-only: a value handed to a step stays
// maskable for the life of the process. Prior art: PR #647's secrets.ts.

const SECRET_NAME = /TOKEN|SECRET|PASSWORD|API_KEY|PRIVATE_KEY|CREDENTIAL/i;
const MIN_LENGTH = 4;
// In UTF-8 bytes. Shorter base64 needles would match inside unrelated image data.
const MIN_BASE64_LENGTH = 7;
const NOT_SECRET = new Set(["true", "false", "null"]);
// `Basic <token>`: the token is decoded, so a short password inside it still masks.
// Global, for String.prototype.replace only; never use it with .test() or .exec().
const BASIC_AUTH = /(\bBasic\s+)([A-Za-z0-9+/_-]+={0,2})/gi;

export {
  registerEnvValue,
  registerEnvValues,
  setPublicVariables,
  maskString,
  maskDeep,
  keepTail,
  secretValuesForCapture,
  maskedVariableNames,
  maskedHitNames,
  looksSecret,
  noteVariableReference,
  registerExport,
  registerEnvFile,
  beginRunMasking,
  resetMasking,
};

// value -> every name it was registered under, in registration order.
const namesByValue = new Map<string, string[]>();
// Every `$NAME` the run substitutes or will, set or not.
const referenced = new Set<string>();
let publicMatchers: RegExp[] = [];
const hits = new Set<string>();

type Secret = { value: string; name: string; names: string[]; mask: string };
type Needle = { needle: string; mask: string; names: string[] };
let needles: Needle[] = [];
let secrets: Secret[] = [];
let stale = true;

function looksSecret(name: string): boolean {
  return SECRET_NAME.test(name);
}

function registerEnvValue(name: string, value: unknown): void {
  if (typeof name !== "string" || !name || typeof value !== "string" || !value) return;
  const names = namesByValue.get(value);
  if (names?.includes(name)) return;
  if (names) names.push(name);
  else namesByValue.set(value, [name]);
  stale = true;
}

function registerEnvValues(record: Record<string, unknown> | null | undefined): void {
  if (!record || typeof record !== "object") return;
  for (const [name, value] of Object.entries(record)) registerEnvValue(name, value);
}

// What dotenv parsed from a `.env` or `loadVariables` file. When the file
// doesn't override, the run uses the value already set, so register that, and
// the file's value too when it differs.
function registerEnvFile(parsed: Record<string, string> | null | undefined, env: NodeJS.ProcessEnv = process.env): void {
  for (const [name, value] of Object.entries(parsed ?? {})) {
    registerEnvValue(name, env[name]);
    registerEnvValue(name, value);
  }
}

// At the start of each run: its own public list, and hint names from it alone.
// The registry itself stays append-only. Known race: concurrent runTests calls
// in one process share publicMatchers and hits, so a second run's
// beginRunMasking clears the first run's public list mid-run (ADR 01178).
function beginRunMasking(): void {
  publicMatchers = [];
  hits.clear();
  // A name an earlier run referenced doesn't make this run's export secret.
  referenced.clear();
  stale = true;
}

function noteVariableReference(name: string): void {
  referenced.add(name);
}

// A step's `variables` export. It's secret once the run substitutes it, so
// register it now when the run references it, before a log line can print it.
function registerExport(name: string, value: unknown): void {
  if (referenced.has(name) || looksSecret(name)) registerEnvValue(name, value);
}

// The union of `publicVariables` across the config, every spec, and every test.
// Names match the way the platform's environment does: case-insensitive on Windows.
function setPublicVariables(list: unknown, platform: NodeJS.Platform = process.platform): void {
  const flags = platform === "win32" ? "i" : "";
  publicMatchers = (Array.isArray(list) ? list : [])
    .filter((entry): entry is string => typeof entry === "string" && entry.trim().length > 0)
    .map((entry) => {
      const source = entry.trim().split("*").map((part) => part.replace(/[.+?^${}()|[\]\\]/g, "\\$&")).join(".*");
      return new RegExp(`^${source}$`, flags);
    });
  stale = true;
}

function isPublic(name: string): boolean {
  return publicMatchers.some((matcher) => matcher.test(name));
}

function htmlEscape(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// The base64 characters that depend only on the value's own bytes, with the
// value starting at each of the three byte alignments inside a longer blob.
function base64Needles(value: string): string[] {
  const bytes = Buffer.from(value, "utf8");
  if (bytes.length < MIN_BASE64_LENGTH) return [];
  const out: string[] = [];
  for (const offset of [0, 1, 2]) {
    const encoded = Buffer.concat([Buffer.alloc(offset), bytes]).toString("base64").replace(/=+$/, "");
    const start = Math.ceil((offset * 8) / 6);
    const end = Math.floor(((offset + bytes.length) * 8) / 6);
    const needle = encoded.slice(start, end);
    out.push(needle, needle.replace(/\+/g, "-").replace(/\//g, "_"));
  }
  return out;
}

function formsOf(value: string): string[] {
  const urlEncoded = encodeURIComponent(value);
  // Strict RFC 3986 also encodes !'()*, as curl --data-urlencode and Python's
  // quote do. URLSearchParams encodes !'() and ~ but not *. PHP's urlencode and
  // older curl encode all of !'()*~.
  const strict = urlEncoded.replace(/[!'()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);
  const allEscaped = strict.replace(/~/g, "%7E");
  const form = new URLSearchParams({ v: value }).toString().slice(2);
  return [
    value,
    // Each with both spellings of a space: `%20` turned to `+`, and `+` turned
    // to `%20`. Only the URLSearchParams form contains `+`, so for the other
    // three the second variant equals the original, and the Set drops it.
    ...[urlEncoded, strict, allEscaped, form].flatMap((encoded) => [
      encoded,
      encoded.replace(/%20/g, "+"),
      encoded.replace(/\+/g, "%20"),
    ]),
    JSON.stringify(value).slice(1, -1),
    htmlEscape(value),
    ...base64Needles(value),
  ];
}

function rebuild(): void {
  if (!stale) return;
  stale = false;
  secrets = [];
  for (const [value, names] of namesByValue) {
    if (value.length < MIN_LENGTH || NOT_SECRET.has(value)) continue;
    // The mask names the first non-public name; the hint and the debug line list them all.
    const secretNames = names.filter((candidate) => !isPublic(candidate));
    if (secretNames.length > 0) secrets.push({ value, name: secretNames[0], names: secretNames, mask: "" });
  }
  secrets.sort((a, b) => b.value.length - a.value.length);
  const raw: { needle: string; secret: Secret }[] = [];
  for (const secret of secrets) {
    for (const needle of new Set(formsOf(secret.value))) {
      if (needle.length >= MIN_LENGTH) raw.push({ needle, secret });
    }
  }
  // Longest first: masking a short value first would strand the rest of a long one.
  raw.sort((a, b) => b.needle.length - a.needle.length);
  // A mask that would itself contain a secret names nothing instead. Any
  // secret's needle counts, not just its own: `***PASSWORD***` written for one
  // secret would print another whose value is `WORD`, and a second pass would
  // mask inside the mask. Each secret's mask is set once, here, and its
  // needles and Basic auth read it.
  for (const secret of secrets) {
    const preferred = `***${secret.name}***`;
    secret.mask = raw.some(({ needle }) => preferred.includes(needle)) ? "***" : preferred;
  }
  needles = raw.map(({ needle, secret }) => ({ needle, names: secret.names, mask: secret.mask }));
}

function maskBasicAuth(text: string): string {
  if (!/basic\s/i.test(text)) return text;
  return text.replace(BASIC_AUTH, (match, prefix: string, token: string) => {
    const decoded = Buffer.from(token, "base64").toString("utf8");
    const secret = secrets.find(({ value }) => decoded.includes(value));
    if (!secret) return match;
    for (const name of secret.names) hits.add(name);
    return `${prefix}${secret.mask}`;
  });
}

// Plain split/join, not a regex: a value is arbitrary text, and a mis-escaped
// needle would fail open.
function maskString<T>(text: T): T {
  if (typeof text !== "string" || !text) return text;
  rebuild();
  if (needles.length === 0) return text;
  let out: string = maskBasicAuth(text);
  for (const { needle, mask, names } of needles) {
    if (out.includes(needle)) {
      out = out.split(needle).join(mask);
      for (const name of names) hits.add(name);
    }
  }
  return out as unknown as T;
}

// A masked copy of the values. Keys are never masked: they're report structure,
// and a value such as `pass` or `test` would rename `summary.specs.pass` or
// `tests`. Logs still mask a key's text, since diag() masks the whole line.
function maskDeep<T>(value: T): T {
  rebuild();
  if (needles.length === 0) return value;
  return deepMask(value, new WeakMap()) as T;
}

function deepMask(value: unknown, seen: WeakMap<object, unknown>): unknown {
  if (typeof value === "string") return maskString(value);
  if (value === null || typeof value !== "object") return value;
  if (Buffer.isBuffer(value) || ArrayBuffer.isView(value) || value instanceof Date || value instanceof RegExp) {
    return value;
  }
  if (seen.has(value)) return seen.get(value);
  // An object with toJSON, such as axios's response headers, serializes as
  // what toJSON returns, so mask that. A cycle back to it reads as undefined.
  if (typeof (value as any).toJSON === "function") {
    let json: unknown = value;
    try {
      json = (value as any).toJSON();
    } catch {
      // Walk its own properties instead.
    }
    if (json !== value) {
      seen.set(value, undefined);
      const out = deepMask(json, seen);
      seen.set(value, out);
      return out;
    }
  }
  if (Array.isArray(value)) {
    const out: unknown[] = [];
    seen.set(value, out);
    for (const entry of value) out.push(deepMask(entry, seen));
    return out;
  }
  // Plain objects and other class instances alike: their own enumerable
  // properties are what JSON.stringify writes.
  const out: Record<string, unknown> = {};
  seen.set(value, out);
  for (const key of Object.keys(value)) {
    // defineProperty, not assignment: a `__proto__` key stays plain data.
    Object.defineProperty(out, key, {
      value: deepMask((value as Record<string, unknown>)[key], seen),
      writable: true,
      enumerable: true,
      configurable: true,
    });
  }
  return out;
}

// The last `limit` characters of `text`, moving the cut past any secret it
// would split. For runtime buffers, which keep real values: a cut through a
// secret would leave a fragment no mask matches.
function keepTail(text: string, limit: number): string {
  if (text.length <= limit) return text;
  rebuild();
  let start = text.length - limit;
  for (let moved = true; moved; ) {
    moved = false;
    for (const { needle } of needles) {
      // Only a needle that starts within its own length of the cut can straddle it.
      const from = Math.max(0, start - needle.length + 1);
      const at = text.slice(from, start + needle.length - 1).indexOf(needle);
      if (at !== -1 && from + at < start) {
        start = from + at + needle.length;
        moved = true;
      }
    }
  }
  return text.slice(start);
}

function secretValuesForCapture(): string[] {
  rebuild();
  return secrets.map(({ value }) => value);
}

function maskedVariableNames(): string[] {
  rebuild();
  return [...new Set(secrets.flatMap(({ names }) => names))].sort();
}

function maskedHitNames(): string[] {
  return [...hits].sort();
}

// Forget every value and the public list. The runner never calls this; tests
// do, since the registry is module state.
function resetMasking(): void {
  namesByValue.clear();
  referenced.clear();
  publicMatchers = [];
  hits.clear();
  needles = [];
  secrets = [];
  stale = true;
}
