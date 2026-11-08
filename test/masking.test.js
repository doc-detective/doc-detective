// Masking environment variable values in output (ADR 01178). Pure: no runner,
// no driver. The registry is module state, so every test starts from a reset.
import assert from "node:assert/strict";
import {
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
  resetMasking,
} from "../dist/core/masking.js";

const b64 = (s) => Buffer.from(s, "utf8").toString("base64");
const b64url = (s) => Buffer.from(s, "utf8").toString("base64url");

describe("masking", function () {
  beforeEach(() => resetMasking());
  after(() => resetMasking());

  describe("forms", function () {
    it("masks the raw value as ***NAME***", function () {
      registerEnvValue("API_TOKEN", "correct-horse");
      assert.equal(maskString("Bearer correct-horse"), "Bearer ***API_TOKEN***");
    });

    it("masks the URL-encoded and form-encoded value", function () {
      registerEnvValue("PASSWORD", "p@ss word/1");
      assert.equal(maskString(`?p=${encodeURIComponent("p@ss word/1")}`), "?p=***PASSWORD***");
      assert.equal(maskString(new URLSearchParams({ p: "p@ss word/1" }).toString()), "p=***PASSWORD***");
    });

    it("masks the strict RFC 3986 and URLSearchParams encodings, which also encode !'()", function () {
      registerEnvValue("PASSWORD", "hunter2!(x)");
      assert.equal(maskString(new URLSearchParams({ p: "hunter2!(x)" }).toString()), "p=***PASSWORD***");
      const value = "hunter2!(x) y*~";
      registerEnvValue("LONG_PASSWORD", value);
      const strict = encodeURIComponent(value).replace(/[!'()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);
      for (const encoded of [new URLSearchParams({ p: value }).toString().slice(2), strict, strict.replace(/%20/g, "+")]) {
        assert.equal(maskString(`p=${encoded}`), "p=***LONG_PASSWORD***", encoded);
      }
    });

    it("masks the JSON-escaped value", function () {
      registerEnvValue("PASSWORD", 'a"b\\c');
      const json = JSON.stringify({ keys: 'a"b\\c' });
      assert.equal(json.includes('a"b\\c'), false, "the raw form isn't in the JSON");
      assert.equal(maskString(json), '{"keys":"***PASSWORD***"}');
    });

    it("masks the HTML-escaped value", function () {
      registerEnvValue("PASSWORD", "<a&b>'\"");
      assert.equal(maskString("x &lt;a&amp;b&gt;&#39;&quot; y"), "x ***PASSWORD*** y");
    });

    it("masks base64 and base64url at all three alignments", function () {
      const secret = "s3cret?value>>";
      registerEnvValue("SESSION", secret);
      for (const prefix of ["", "a", "ab", "abc"]) {
        for (const encode of [b64, b64url]) {
          const encoded = encode(`${prefix}${secret}!!tail`);
          const out = maskString(`data:${encoded}`);
          assert.match(out, /\*\*\*SESSION\*\*\*/, `prefix ${JSON.stringify(prefix)}: ${encoded}`);
        }
      }
    });

    it("leaves base64 alone for values shorter than 7 characters", function () {
      registerEnvValue("PIN_TOKEN", "abcdef");
      const encoded = b64("xxabcdefxx");
      assert.equal(maskString(encoded), encoded);
      assert.equal(maskString("abcdef"), "***PIN_TOKEN***");
    });

    it("masks a Basic auth token whose decoded value holds a secret, even a short one", function () {
      registerEnvValue("PASS", "hunter");
      const header = `Authorization: Basic ${b64("admin:hunter")}`;
      assert.equal(maskString(header), "Authorization: Basic ***PASS***");
    });

    it("leaves a Basic token that holds no secret", function () {
      registerEnvValue("PASS", "hunter");
      const header = `Authorization: Basic ${b64("admin:other")}`;
      assert.equal(maskString(header), header);
    });

    it("replaces the longest value first, so no fragment is left", function () {
      registerEnvValue("SHORT", "abcd");
      registerEnvValue("LONG", "abcdefgh");
      assert.equal(maskString("abcdefgh abcd"), "***LONG*** ***SHORT***");
    });
  });

  describe("which values are secret", function () {
    it("skips values shorter than 4 characters", function () {
      registerEnvValue("ENV", "dev");
      assert.equal(maskString("dev build"), "dev build");
      assert.deepEqual(maskedVariableNames(), []);
    });

    it("skips true, false, and null", function () {
      registerEnvValues({ A_TOKEN: "true", B_TOKEN: "false", C_TOKEN: "null" });
      assert.equal(maskString("true false null"), "true false null");
    });

    it("ignores non-string and empty values", function () {
      registerEnvValues({ A: undefined, B: "", C: 12345 });
      registerEnvValues(null);
      assert.deepEqual(maskedVariableNames(), []);
    });

    it("is a no-op when nothing is registered", function () {
      const obj = { a: "x" };
      assert.equal(maskString("anything"), "anything");
      assert.equal(maskDeep(obj), obj);
    });

    it("names secret-looking variables", function () {
      for (const name of ["API_TOKEN", "my_secret", "DB_PASSWORD", "STRIPE_API_KEY", "PRIVATE_KEY_PEM", "aws_credential"]) {
        assert.equal(looksSecret(name), true, name);
      }
      for (const name of ["BASE_URL", "HOME", "APP_ENV", "KEY"]) {
        assert.equal(looksSecret(name), false, name);
      }
    });
  });

  describe("publicVariables", function () {
    it("shows an exactly named public variable", function () {
      registerEnvValues({ BASE_URL: "https://api.example.com", API_TOKEN: "tok-12345" });
      setPublicVariables(["BASE_URL"]);
      assert.equal(
        maskString("curl -H 'Bearer tok-12345' https://api.example.com/me"),
        "curl -H 'Bearer ***API_TOKEN***' https://api.example.com/me"
      );
    });

    it("matches * against any characters", function () {
      registerEnvValues({ DD_ONE: "first-value", DD_TWO: "second-value", OTHER: "third-value" });
      setPublicVariables(["DD_*"]);
      assert.equal(maskString("first-value second-value third-value"), "first-value second-value ***OTHER***");
    });

    it("turns masking off with *", function () {
      registerEnvValues({ API_TOKEN: "tok-12345" });
      setPublicVariables(["*"]);
      assert.equal(maskString("tok-12345"), "tok-12345");
      assert.deepEqual(secretValuesForCapture(), []);
    });

    it("matches names case-insensitively on Windows only", function () {
      registerEnvValues({ BASE_URL: "https://api.example.com" });
      setPublicVariables(["base_url"], "win32");
      assert.equal(maskString("https://api.example.com"), "https://api.example.com");
      setPublicVariables(["base_url"], "linux");
      assert.equal(maskString("https://api.example.com"), "***BASE_URL***");
    });

    it("keeps a value secret when any of its names isn't public", function () {
      registerEnvValue("PUBLIC_URL", "https://shared.example.com");
      registerEnvValue("SECRET_URL", "https://shared.example.com");
      setPublicVariables(["PUBLIC_URL"]);
      assert.equal(maskString("https://shared.example.com"), "***SECRET_URL***");
    });

    it("unmasks a name for the whole run once any level lists it", function () {
      // The union across config, spec, and test is computed by the caller and set once.
      registerEnvValues({ LOGIN_USER: "login@example.com", SIGNUP_EMAIL: "signup@example.com" });
      setPublicVariables([...["LOGIN_USER"], ...["SIGNUP_EMAIL"]]);
      assert.equal(maskString("login@example.com signup@example.com"), "login@example.com signup@example.com");
    });

    it("ignores blank and non-string entries", function () {
      registerEnvValues({ API_TOKEN: "tok-12345" });
      setPublicVariables([" ", "", 7, null]);
      assert.equal(maskString("tok-12345"), "***API_TOKEN***");
    });
  });

  describe("mask text", function () {
    it("falls back to *** when the name contains the value", function () {
      registerEnvValue("MY_TOKEN", "TOKEN");
      assert.equal(maskString("a TOKEN b"), "a *** b");
    });

    it("is idempotent", function () {
      registerEnvValues({ API_TOKEN: "tok-12345", PASS: "hunter" });
      const once = maskString(`tok-12345 Basic ${b64("u:hunter")} ${encodeURIComponent("tok-12345")}`);
      assert.equal(maskString(once), once);
    });
  });

  describe("maskDeep", function () {
    it("masks values in a copy, never keys, leaving the original intact", function () {
      // A key such as `pass` or `tests` is report structure: renaming it broke
      // summary counts and exit codes.
      registerEnvValue("DB_PASSWORD", "pass");
      registerEnvValue("NODE_ENV", "test");
      const original = { pass: 1, tests: [{ testId: "a pass test" }], list: ["pass", 3, true, null] };
      const masked = maskDeep(original);
      assert.deepEqual(masked, {
        pass: 1,
        tests: [{ testId: "a ***DB_PASSWORD*** ***NODE_ENV***" }],
        list: ["***DB_PASSWORD***", 3, true, null],
      });
      assert.equal(original.list[0], "pass");
    });

    it("masks what toJSON returns, such as axios response headers", function () {
      registerEnvValue("API_TOKEN", "tok-12345");
      class Headers {
        constructor() {
          this.hidden = "tok-12345";
        }
        toJSON() {
          return { authorization: "Bearer tok-12345" };
        }
      }
      const masked = maskDeep({ headers: new Headers() });
      assert.deepEqual(masked, { headers: { authorization: "Bearer ***API_TOKEN***" } });
      assert.equal(JSON.stringify(masked).includes("tok-12345"), false);
    });

    it("walks the own properties of other class instances", function () {
      registerEnvValue("API_TOKEN", "tok-12345");
      class Response {
        constructor() {
          this.body = { token: "tok-12345" };
        }
      }
      assert.deepEqual(maskDeep({ response: new Response() }), { response: { body: { token: "***API_TOKEN***" } } });
    });

    it("leaves Buffers, typed arrays, Dates, and RegExps as they are", function () {
      registerEnvValue("API_TOKEN", "tok-12345");
      const values = { buffer: Buffer.from("x"), bytes: new Uint8Array(2), date: new Date(0), pattern: /tok-12345/ };
      const masked = maskDeep(values);
      for (const key of Object.keys(values)) assert.equal(masked[key], values[key], key);
    });

    it("is cycle-safe", function () {
      registerEnvValue("API_TOKEN", "tok-12345");
      const a = { v: "tok-12345" };
      a.self = a;
      const masked = maskDeep(a);
      assert.equal(masked.v, "***API_TOKEN***");
      assert.equal(masked.self, masked);
    });

    it("is cycle-safe through toJSON", function () {
      registerEnvValue("API_TOKEN", "tok-12345");
      const holder = {};
      holder.self = { toJSON: () => ({ v: "tok-12345", back: holder }) };
      const masked = maskDeep(holder);
      assert.equal(masked.self.v, "***API_TOKEN***");
      assert.equal(masked.self.back, masked);
    });
  });

  describe("keepTail", function () {
    it("cuts without leaving part of a secret at the cut", function () {
      registerEnvValue("API_TOKEN", "tok-12345");
      const text = "xxxxtok-12345yyyy";
      // A plain slice(-12) would start at "-12345yyyy"-ish fragments.
      const kept = keepTail(text, 12);
      assert.equal(kept, "yyyy");
      assert.equal(keepTail("short", 12), "short");
    });

    it("keeps the real value when it isn't at the cut", function () {
      registerEnvValue("API_TOKEN", "tok-12345");
      assert.equal(keepTail("xxxxxxtok-12345", 9), "tok-12345");
    });
  });

  describe("variables exports", function () {
    it("registers an export the run references as $NAME, or whose name looks secret", function () {
      noteVariableReference("SESSION_ID");
      registerExport("SESSION_ID", "sess-12345");
      registerExport("API_TOKEN", "tok-12345");
      registerExport("REC_PATH", "/tmp/rec.mp4");
      assert.equal(maskString("sess-12345 tok-12345 /tmp/rec.mp4"), "***SESSION_ID*** ***API_TOKEN*** /tmp/rec.mp4");
    });
  });

  describe("reporting", function () {
    it("lists the masked names, sorted, without public ones", function () {
      registerEnvValues({ SESSION: "sess-value", API_TOKEN: "tok-12345", BASE_URL: "https://x.example.com", SHORT: "ab" });
      setPublicVariables(["BASE_URL"]);
      assert.deepEqual(maskedVariableNames(), ["API_TOKEN", "SESSION"]);
    });

    it("records which names a mask was applied for", function () {
      registerEnvValues({ SESSION: "sess-value", API_TOKEN: "tok-12345" });
      maskString("sess-value");
      maskDeep({ a: "nothing here" });
      assert.deepEqual(maskedHitNames(), ["SESSION"]);
    });

    it("hands raw secret values to captures", function () {
      registerEnvValues({ API_TOKEN: "tok-12345", BASE_URL: "https://x.example.com", SHORT: "ab" });
      setPublicVariables(["BASE_URL"]);
      assert.deepEqual(secretValuesForCapture(), ["tok-12345"]);
    });
  });
});
