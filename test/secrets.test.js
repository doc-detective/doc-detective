import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {
  SECRET_TOKEN_REGEX,
  resolveSecrets,
  findDisallowedSecretRefs,
  listRegisteredSecretNames,
  clearRegisteredSecrets,
  registerSecretValue,
  scrubString,
  scrubObject,
  redactUndeclaredSecrets,
} from "../dist/core/secrets.js";
import { replaceEnvs } from "../dist/core/utils.js";
import { runTests } from "../dist/core/index.js";

// ADR 01071: `$secret.NAME` resolves from process.env at execution time and is
// NEVER emitted. These tests cover the resolution semantics and the fail-closed
// guard. FAIL-path permutations live here (not in fixtures) because every
// fixture must resolve to PASS or SKIPPED.

const VALUE = "hunter2-not-a-real-secret";

function setEnv(vars) {
  const saved = {};
  for (const [k, v] of Object.entries(vars)) {
    saved[k] = process.env[k];
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
  return function restore() {
    for (const [k, v] of Object.entries(saved)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  };
}

// Synchronous only. Using this with an async fn would restore the environment
// before the promise settles.
function withEnv(vars, fn) {
  const restore = setEnv(vars);
  try {
    return fn();
  } finally {
    restore();
  }
}

async function withEnvAsync(vars, fn) {
  const restore = setEnv(vars);
  try {
    return await fn();
  } finally {
    restore();
  }
}

describe("secrets: token matcher", function () {
  it("matches a bare token and captures the name", function () {
    const matches = [..."$secret.API_TOKEN".matchAll(SECRET_TOKEN_REGEX)];
    assert.equal(matches.length, 1);
    assert.equal(matches[0][1], "API_TOKEN");
  });

  it("matches a token used as a substring", function () {
    const matches = [..."Bearer $secret.API_TOKEN".matchAll(SECRET_TOKEN_REGEX)];
    assert.equal(matches.length, 1);
    assert.equal(matches[0][1], "API_TOKEN");
  });

  it("matches multiple distinct tokens in one string", function () {
    const matches = [
      ..."$secret.USER:$secret.PASS".matchAll(SECRET_TOKEN_REGEX),
    ].map((m) => m[1]);
    assert.deepEqual(matches, ["USER", "PASS"]);
  });

  it("does not match a bare $VAR", function () {
    assert.deepEqual([..."$API_TOKEN".matchAll(SECRET_TOKEN_REGEX)], []);
  });
});

// The `$KEY$` sentinel vocabulary ($ENTER$, $HOME$) must be untouched, and
// ENV_VAR_REGEX must never eat the `$secret` prefix. On Windows process.env is
// case-insensitive, so a stray `SECRET` var is the trap: without the negative
// lookahead, replaceEnvs rewrites `$secret.NAME` -> `<value>.NAME` before the
// secret resolver ever sees the token.
describe("secrets: replaceEnvs interop", function () {
  it("replaceEnvs leaves a $secret. token intact when a SECRET env var exists", function () {
    withEnv({ SECRET: "leaked-env-value" }, function () {
      assert.equal(
        replaceEnvs("$secret.API_TOKEN"),
        "$secret.API_TOKEN",
        "ENV_VAR_REGEX must not consume the $secret prefix"
      );
    });
  });

  it("replaceEnvs leaves a $secret. token intact inside a larger string", function () {
    withEnv({ SECRET: "leaked-env-value" }, function () {
      assert.equal(
        replaceEnvs("Bearer $secret.API_TOKEN"),
        "Bearer $secret.API_TOKEN"
      );
    });
  });

  it("replaceEnvs still resolves ordinary $VAR references", function () {
    withEnv({ MY_PLAIN_VAR: "plain-value" }, function () {
      assert.equal(replaceEnvs("$MY_PLAIN_VAR"), "plain-value");
    });
  });

  it("replaceEnvs still leaves $KEY$ sentinels alone", function () {
    withEnv({ HOME: "/home/someone" }, function () {
      assert.equal(replaceEnvs("$HOME$"), "$HOME$");
    });
  });
});

describe("secrets: resolveSecrets", function () {
  it("resolves a bare token from the environment", function () {
    withEnv({ API_TOKEN: VALUE }, function () {
      const { step, failure } = resolveSecrets({ typeKeys: "$secret.API_TOKEN" });
      assert.equal(failure, undefined);
      assert.equal(step.typeKeys, VALUE);
    });
  });

  it("resolves a token used as a substring", function () {
    withEnv({ API_TOKEN: VALUE }, function () {
      const { step } = resolveSecrets({
        httpRequest: { headers: { Authorization: "Bearer $secret.API_TOKEN" } },
      });
      assert.equal(step.httpRequest.headers.Authorization, "Bearer " + VALUE);
    });
  });

  it("resolves multiple tokens in one string", function () {
    withEnv({ U: "alice", P: VALUE }, function () {
      const { step } = resolveSecrets({ typeKeys: "$secret.U:$secret.P" });
      assert.equal(step.typeKeys, "alice:" + VALUE);
    });
  });

  it("does not touch ordinary $VAR references", function () {
    withEnv({ PLAIN: "plain-value" }, function () {
      const { step } = resolveSecrets({ typeKeys: "$PLAIN" });
      assert.equal(step.typeKeys, "$PLAIN");
    });
  });

  // A secret resolves to an opaque string: no JSON->object expansion and no
  // nested $VAR re-resolution, both of which would walk/spread/re-emit it.
  it("does not JSON-expand a whole-string secret value", function () {
    withEnv({ JSON_SECRET: '{"a":1}' }, function () {
      const { step } = resolveSecrets({ typeKeys: "$secret.JSON_SECRET" });
      assert.equal(step.typeKeys, '{"a":1}');
      assert.equal(typeof step.typeKeys, "string");
    });
  });

  it("does not re-resolve $VAR references found inside a secret value", function () {
    withEnv({ NESTED: "$PLAIN", PLAIN: "plain-value" }, function () {
      const { step } = resolveSecrets({ typeKeys: "$secret.NESTED" });
      assert.equal(step.typeKeys, "$PLAIN");
    });
  });

  it("fails when the referenced variable is unset, naming it", function () {
    withEnv({ MISSING_TOKEN: undefined }, function () {
      const { failure } = resolveSecrets({ typeKeys: "$secret.MISSING_TOKEN" });
      assert.equal(failure.status, "FAIL");
      assert.match(failure.description, /MISSING_TOKEN/);
    });
  });

  it("fails when the referenced variable is empty", function () {
    withEnv({ EMPTY_TOKEN: "" }, function () {
      const { failure } = resolveSecrets({ typeKeys: "$secret.EMPTY_TOKEN" });
      assert.equal(failure.status, "FAIL");
      assert.match(failure.description, /EMPTY_TOKEN/);
    });
  });

  it("never includes the secret value in the failure description", function () {
    withEnv({ A: VALUE, MISSING_TOKEN: undefined }, function () {
      const { failure } = resolveSecrets({
        typeKeys: "$secret.A and $secret.MISSING_TOKEN",
      });
      assert.ok(!failure.description.includes(VALUE));
    });
  });

  it("does not mutate the step it is given", function () {
    withEnv({ API_TOKEN: VALUE }, function () {
      const original = { typeKeys: "$secret.API_TOKEN" };
      resolveSecrets(original);
      assert.equal(original.typeKeys, "$secret.API_TOKEN");
    });
  });

  // Masking a 1-3 char value would shred unrelated output, so such a value
  // resolves but is never used as a mask needle. Warn rather than fail — the
  // author's credential still works; they just lose masking on it.
  // A value below the masking floor can't honor the no-emission guarantee: it
  // would be sent to the target but never registered as a mask needle, so an
  // echo would land verbatim in the report. Declared means protected, so this
  // fails rather than resolving with a warning.
  it("fails when a value is too short to mask safely", function () {
    withEnv({ TINY: "ab" }, function () {
      const { failure } = resolveSecrets({ type: "$secret.TINY" });
      assert.equal(failure.status, "FAIL");
      assert.match(failure.description, /TINY/);
      assert.match(failure.description, /shorter than 4/);
    });
  });

  it("does not register a too-short value as a mask needle", function () {
    withEnv({ TINY2: "xy" }, function () {
      resolveSecrets({ type: "$secret.TINY2" });
      assert.ok(!listRegisteredSecretNames().includes("TINY2"));
    });
  });

  it("emits no warnings for a value long enough to mask", function () {
    withEnv({ API_TOKEN: VALUE }, function () {
      const { warnings } = resolveSecrets({ typeKeys: "$secret.API_TOKEN" });
      assert.deepEqual(warnings, []);
    });
  });

  it("registers each resolved value for later masking", function () {
    withEnv({ REGISTERED_TOKEN: VALUE }, function () {
      resolveSecrets({ typeKeys: "$secret.REGISTERED_TOKEN" });
      assert.ok(listRegisteredSecretNames().includes("REGISTERED_TOKEN"));
    });
  });

  it("registers nothing when resolution fails", function () {
    withEnv({ NEVER_REGISTERED: undefined }, function () {
      resolveSecrets({ typeKeys: "$secret.NEVER_REGISTERED" });
      assert.ok(!listRegisteredSecretNames().includes("NEVER_REGISTERED"));
    });
  });

  // The fast path: a step with no `$secret.` token must not be cloned or walked.
  // Returning the SAME reference is the observable proof that it wasn't.
  it("returns the identical step object when there are no secret references", function () {
    const step = { type: "hello", find: { elementText: "world" } };
    const { step: out, failure, warnings } = resolveSecrets(step);
    assert.equal(out, step, "a secret-free step must not be cloned");
    assert.equal(failure, undefined);
    assert.deepEqual(warnings, []);
  });
});

// resolveSecrets returns a resolved COPY. The caller's object is the report
// copy, so any aliasing here would put the credential straight into the report.
describe("secrets: resolution copies rather than aliases", function () {
  it("leaves the caller's nested objects untouched and non-aliased", function () {
    withEnv({ ALIAS_TOKEN: VALUE }, function () {
      const step = {
        httpRequest: { request: { headers: { A: "Bearer $secret.ALIAS_TOKEN" } } },
        list: ["$secret.ALIAS_TOKEN", 2],
      };
      const { step: out } = resolveSecrets(step);
      // The copy carries the real value...
      assert.equal(out.httpRequest.request.headers.A, "Bearer " + VALUE);
      assert.equal(out.list[0], VALUE);
      // ...while the caller's object keeps its placeholders, deeply.
      assert.equal(
        step.httpRequest.request.headers.A,
        "Bearer $secret.ALIAS_TOKEN"
      );
      assert.equal(step.list[0], "$secret.ALIAS_TOKEN");
      assert.notEqual(out.httpRequest, step.httpRequest);
      assert.notEqual(out.list, step.list);
    });
  });
});

// ADR 01071 decision 4: a secret that is COMPARED or EMITTED is an oracle.
// Every row here fails closed at resolution time, before any value is read.
describe("secrets: findDisallowedSecretRefs", function () {
  const blocked = [
    ["description", { typeKeys: "hi", description: "token is $secret.A" }],
    ["variables", { typeKeys: "hi", variables: { X: "$secret.A" } }],
    ["outputs", { typeKeys: "hi", outputs: { X: "$secret.A" } }],
    ["if", { typeKeys: "hi", if: "$$platform == $secret.A" }],
    ["assertions", { typeKeys: "hi", assertions: "$$x == $secret.A" }],
    [
      "onFail condition",
      { typeKeys: "hi", onFail: [{ if: "$$x == $secret.A", stop: "test" }] },
    ],
    [
      "onPass condition",
      { typeKeys: "hi", onPass: [{ if: "$$x == $secret.A", goToStep: "s" }] },
    ],
    ["find.elementText", { find: { elementText: "$secret.A" } }],
    ["find.selector", { find: { selector: "[data-x='$secret.A']" } }],
    [
      "httpRequest.response.body",
      { httpRequest: { url: "http://x", response: { body: { t: "$secret.A" } } } },
    ],
    [
      "httpRequest.response.headers",
      {
        httpRequest: {
          url: "http://x",
          response: { headers: { A: "$secret.A" } },
        },
      },
    ],
    ["runShell.stdio", { runShell: { command: "ls", stdio: "$secret.A" } }],
    ["runShell.exitCodes", { runShell: { command: "ls", exitCodes: ["$secret.A"] } }],
    // Element targeting and readiness are blocked by field NAME under every
    // action that has them, not per-action — these three were missed by an
    // earlier per-action list.
    ["click.selector", { click: { selector: "$secret.A" } }],
    ["click.elementText", { click: { elementText: "$secret.A" } }],
    [
      "dragAndDrop.source.selector",
      { dragAndDrop: { source: { selector: "$secret.A" }, target: { selector: "b" } } },
    ],
    ["dragAndDrop.source shorthand", { dragAndDrop: { source: "$secret.A", target: "b" } }],
    ["dragAndDrop.target shorthand", { dragAndDrop: { source: "a", target: "$secret.A" } }],
    ["goTo.waitUntil", { goTo: { url: "http://x", waitUntil: "$secret.A" } }],
    [
      "startSurface waitUntil",
      { startSurface: { process: { name: "p", waitUntil: { stdio: "$secret.A" } } } },
    ],
    ["type.waitUntil", { type: { keys: "hi", waitUntil: "$secret.A" } }],
  ];

  for (const [label, step] of blocked) {
    it("flags a secret in " + label, function () {
      const refs = findDisallowedSecretRefs(step);
      assert.ok(refs.length > 0, "expected " + label + " to be blocked");
    });
  }

  const allowed = [
    ["typeKeys", { typeKeys: "$secret.A" }],
    [
      "httpRequest request header",
      {
        httpRequest: {
          url: "http://x",
          request: { headers: { Authorization: "Bearer $secret.A" } },
        },
      },
    ],
    [
      "httpRequest request body",
      { httpRequest: { url: "http://x", request: { body: { p: "$secret.A" } } } },
    ],
    ["runShell.command", { runShell: { command: "login --token $secret.A" } }],
    ["a step with no secrets at all", { find: { elementText: "hello" } }],
  ];

  for (const [label, step] of allowed) {
    it("allows a secret in " + label, function () {
      assert.deepEqual(findDisallowedSecretRefs(step), []);
    });
  }

  it("reports the field path of the offending reference", function () {
    const refs = findDisallowedSecretRefs({
      typeKeys: "hi",
      variables: { TOKEN_COPY: "$secret.A" },
    });
    assert.match(refs[0].path, /variables\.TOKEN_COPY/);
  });
});

// ADR 01072: a resolved secret can come back into the run from OUTSIDE the step
// definition — a shell echoing its own argv, an auth endpoint reflecting the
// token. The registry masks by exact value wherever text leaves the run.
describe("secrets: mask registry", function () {
  // The registry is module state that only ever grows within a run, so tests
  // must isolate: a needle registered by one case (notably the pathological
  // `secret` value below) would otherwise mangle every later case's mask.
  beforeEach(clearRegisteredSecrets);
  after(clearRegisteredSecrets);

  it("masks a registered value with a name-bearing literal", function () {
    registerSecretValue("MASK_A", "swordfish-abcdef");
    assert.equal(
      scrubString("token=swordfish-abcdef done"),
      "token=***secret.MASK_A*** done"
    );
  });

  it("masks every occurrence, not just the first", function () {
    registerSecretValue("MASK_B", "repeated-value-xyz");
    assert.equal(
      scrubString("repeated-value-xyz and repeated-value-xyz"),
      "***secret.MASK_B*** and ***secret.MASK_B***"
    );
  });

  // Longest-first: when one registered value contains another, masking the
  // short one first would leave a fragment of the long one exposed.
  it("replaces longest-first so an overlapping value leaves no fragment", function () {
    registerSecretValue("SHORT_ONE", "abcd1234");
    registerSecretValue("LONG_ONE", "abcd1234-with-more-tail");
    const scrubbed = scrubString("value=abcd1234-with-more-tail");
    assert.ok(
      !scrubbed.includes("with-more-tail"),
      `the long value must be fully masked, got: ${scrubbed}`
    );
    assert.equal(scrubbed, "value=***secret.LONG_ONE***");
  });

  // Secrets ride in URLs and form bodies, where they arrive percent-encoded.
  it("masks the URL-encoded form of a registered value", function () {
    registerSecretValue("ENCODED_ONE", "p@ss word/slash");
    const encoded = encodeURIComponent("p@ss word/slash");
    const scrubbed = scrubString(`https://x.test/cb?t=${encoded}`);
    assert.ok(
      !scrubbed.includes(encoded),
      `the URL-encoded value must be masked, got: ${scrubbed}`
    );
  });

  // Masking a 1-3 char value would shred unrelated output.
  it("never uses a value shorter than the floor as a mask needle", function () {
    registerSecretValue("TINY_ONE", "ab");
    assert.equal(scrubString("a cab in a cabin"), "a cab in a cabin");
  });

  // A name can resolve to more than one value in a run (a later loadVariables
  // re-points the variable). Keying the registry by name would evict the first
  // value's needle, and that value — already sent, possibly already echoed —
  // would sail through the end-of-run report scrub unmasked.
  it("keeps masking an earlier value after the same name registers a new one", function () {
    registerSecretValue("ROTATED", "first-value-aaaa");
    registerSecretValue("ROTATED", "second-value-bbbb");
    const scrubbed = scrubString("saw first-value-aaaa and second-value-bbbb");
    assert.ok(!scrubbed.includes("first-value-aaaa"), "the earlier value must stay masked");
    assert.ok(!scrubbed.includes("second-value-bbbb"), "the newer value must be masked");
  });

  // The mask names the secret, so a value that appears inside its own mask
  // literal would survive "masking" verbatim.
  it("does not emit the credential when the mask literal would contain it", function () {
    registerSecretValue("SELFY", "secret");
    const scrubbed = scrubString("token=secret done");
    assert.ok(
      !scrubbed.includes("secret"),
      `the credential must not survive in the mask, got: ${scrubbed}`
    );
  });

  it("still masks a value that collides with the generic fallback", function () {
    registerSecretValue("STARRY", "***secret***");
    const scrubbed = scrubString("v=***secret*** end");
    assert.ok(!scrubbed.includes("***secret***"));
  });

  it("is idempotent", function () {
    registerSecretValue("IDEM_ONE", "idempotent-secret-1");
    const once = scrubString("v=idempotent-secret-1");
    assert.equal(scrubString(once), once);
  });

  it("leaves text with no registered value untouched", function () {
    assert.equal(scrubString("nothing to see here"), "nothing to see here");
  });

  it("passes through non-string input unchanged", function () {
    assert.equal(scrubString(undefined), undefined);
    assert.equal(scrubString(null), null);
  });

  it("scrubs strings nested in objects and arrays", function () {
    registerSecretValue("NESTED_ONE", "nested-secret-value");
    const scrubbed = scrubObject({
      a: "nested-secret-value",
      b: [{ c: "x nested-secret-value y" }],
      n: 42,
    });
    assert.equal(scrubbed.a, "***secret.NESTED_ONE***");
    assert.equal(scrubbed.b[0].c, "x ***secret.NESTED_ONE*** y");
    assert.equal(scrubbed.n, 42);
  });

  it("scrubs object KEYS as well as values", function () {
    registerSecretValue("KEY_ONE", "secret-as-a-key-name");
    const scrubbed = scrubObject({ "secret-as-a-key-name": "v" });
    assert.deepEqual(Object.keys(scrubbed), ["***secret.KEY_ONE***"]);
  });

  it("does not mutate the object it is given", function () {
    registerSecretValue("NOMUT_ONE", "do-not-mutate-me-1");
    const original = { a: "do-not-mutate-me-1" };
    scrubObject(original);
    assert.equal(original.a, "do-not-mutate-me-1");
  });

  it("survives a circular reference", function () {
    registerSecretValue("CIRC_ONE", "circular-secret-val");
    const obj = { a: "circular-secret-val" };
    obj.self = obj;
    const scrubbed = scrubObject(obj);
    assert.equal(scrubbed.a, "***secret.CIRC_ONE***");
  });

  // Rebuilding a value from its enumerable own keys is lossless for JSON-shaped
  // data and destructive for anything else: Object.keys(new Error(...)) is [],
  // so a naive walk turns an Error into {} and eats the message and stack.
  it("passes an Error through instead of flattening it to {}", function () {
    registerSecretValue("ERR_ONE", "error-adjacent-secret");
    const err = new Error("boom: connection refused");
    const out = scrubObject(err);
    assert.ok(out instanceof Error, "an Error must survive the walk");
    assert.equal(out.message, "boom: connection refused");
  });

  it("passes a Date through instead of flattening it", function () {
    registerSecretValue("DATE_ONE", "date-adjacent-secret");
    const d = new Date(0);
    assert.ok(scrubObject(d) instanceof Date);
  });

  it("keeps both fields when two distinct keys mask to the same literal", function () {
    registerSecretValue("COLLIDE_ONE", "collide-secret-val");
    const out = scrubObject({
      "collide-secret-val-a": 1,
      "collide-secret-val-b": 2,
    });
    assert.equal(Object.keys(out).length, 2, "neither field may be dropped");
  });

  // An HTTP request body is free to contain a field called `constructor`.
  // Dropping it would send a different request than the author wrote — the walk
  // must preserve the data while still never invoking the __proto__ setter.
  it("preserves data keys named constructor / prototype / __proto__", function () {
    registerSecretValue("PROTO_ONE", "proto-adjacent-secret");
    // JSON.parse, not an object literal: in a literal, `__proto__:` invokes the
    // prototype setter instead of creating a key, so the literal wouldn't have
    // the own property this test is about. A parsed HTTP body is exactly how
    // such a key reaches the runner for real.
    const input = JSON.parse(
      '{"constructor":"keep-me","prototype":"keep-me-too","__proto__":"keep-me-three","normal":"proto-adjacent-secret"}'
    );
    const out = scrubObject(input);
    assert.equal(Object.getOwnPropertyDescriptor(out, "constructor").value, "keep-me");
    assert.equal(Object.getOwnPropertyDescriptor(out, "prototype").value, "keep-me-too");
    assert.equal(
      Object.getOwnPropertyDescriptor(out, "__proto__").value,
      "keep-me-three",
      "a legitimate __proto__ data key must survive the walk"
    );
    assert.equal(out.normal, "***secret.PROTO_ONE***");
  });

  it("does not pollute Object.prototype via a __proto__ data key", function () {
    registerSecretValue("POLLUTE_ONE", "pollution-secret-val");
    scrubObject(JSON.parse('{"__proto__": {"polluted": "yes"}, "a": "pollution-secret-val"}'));
    assert.equal({}.polluted, undefined, "Object.prototype must be untouched");
  });
});

// ADR 01073: a backstop for credentials the author never declared. Value-shape
// only — name-based redaction is deliberately NOT applied here (it would redact
// this layer's own placeholders and masks, plus legitimate public values).
describe("secrets: heuristic backstop", function () {
  it("redacts a credential-shaped value under an innocuous key", function () {
    const jwt = "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjMifQ.s1gn4tur3v4lu3";
    const out = redactUndeclaredSecrets({ data: jwt });
    assert.ok(!JSON.stringify(out).includes(jwt), "a JWT must be redacted");
  });

  it("redacts a password embedded in a connection string", function () {
    const conn = "postgres://app:hunter2@db.internal/prod";
    const out = redactUndeclaredSecrets({ data: conn });
    assert.ok(!JSON.stringify(out).includes("hunter2"));
  });

  // The regression the measurement in ADR 01073 warned about: name-based
  // redaction would destroy all four of these.
  it("leaves legitimate values under secret-shaped keys alone", function () {
    const out = redactUndeclaredSecrets({
      headers: { Authorization: "Bearer public-demo-token" },
      apiKey: "demo",
      token: "not-a-real-credential",
    });
    assert.equal(out.headers.Authorization, "Bearer public-demo-token");
    assert.equal(out.apiKey, "demo");
    assert.equal(out.token, "not-a-real-credential");
  });

  it("leaves a $secret.NAME placeholder intact", function () {
    const out = redactUndeclaredSecrets({
      headers: { Authorization: "Bearer $secret.API_TOKEN" },
    });
    assert.equal(out.headers.Authorization, "Bearer $secret.API_TOKEN");
  });

  it("leaves a ***secret.NAME*** mask intact", function () {
    const out = redactUndeclaredSecrets({ token: "pre-***secret.API_TOKEN***-post" });
    assert.equal(out.token, "pre-***secret.API_TOKEN***-post");
  });

  it("leaves an ordinary report untouched", function () {
    const report = { result: "PASS", resultDescription: "Found an element." };
    assert.deepEqual(redactUndeclaredSecrets(report), report);
  });
});

// The execution/report split, end to end: the action handler must receive the
// REAL value while the report retains the `$secret.NAME` placeholder.
describe("secrets: execution/report split (integration)", function () {
  this.timeout(60000);
  // Isolate from needles the unit tests registered — notably the pathological
  // `secret` value, which would otherwise mangle this run's mask literals.
  before(clearRegisteredSecrets);
  const tmpDir = path.join(process.cwd(), ".tmp", "secrets-test");
  // runShell joins command+args into one shell line, so keep every path free of
  // backslashes and every value free of shell metacharacters. Forward slashes
  // work on Windows too.
  const posix = (p) => p.split(path.sep).join("/");
  const sink = path.join(tmpDir, "shell-received.txt");
  const writerScript = path.join(tmpDir, "write-arg.cjs");

  before(function () {
    fs.mkdirSync(tmpDir, { recursive: true });
    if (fs.existsSync(sink)) fs.unlinkSync(sink);
    // Writes argv[3] to argv[2] and prints NOTHING — the secret must not come
    // back through stdio, which is a separate (Phase 2) leak surface.
    fs.writeFileSync(
      writerScript,
      "require('fs').writeFileSync(process.argv[2], process.argv[3]);\n"
    );
  });

  it("passes the real value to the shell but reports the placeholder", async function () {
    const spec = {
      tests: [
        {
          testId: "secrets-split-test",
          steps: [
            {
              stepId: "write-secret",
              runShell: {
                command: "node",
                args: [posix(writerScript), posix(sink), "$secret.SPLIT_TOKEN"],
              },
            },
          ],
        },
      ],
    };
    const specPath = path.join(tmpDir, "temp-secrets-split.spec.json");
    fs.writeFileSync(specPath, JSON.stringify(spec, null, 2));

    const result = await withEnvAsync({ SPLIT_TOKEN: VALUE }, async function () {
      return runTests({ input: specPath, logLevel: "silent" });
    });

    assert.equal(result.summary.specs.fail, 0, "the spec must pass");

    // The shell received the resolved value.
    const received = fs.readFileSync(sink, "utf8").trim();
    assert.equal(received, VALUE, "action handler must receive the real value");

    // The report retained the placeholder and never the value.
    const reportJson = JSON.stringify(result);
    assert.ok(
      !reportJson.includes(VALUE),
      "the resolved secret must not appear anywhere in the report"
    );
    assert.ok(
      reportJson.includes("$secret.SPLIT_TOKEN"),
      "the report must retain the $secret.NAME placeholder"
    );
  });

  // The leak ADR 01072 exists to close: the step definition is clean (the secret
  // rides an allowed sink), but the child ECHOES it back, so the value lands in
  // outputs.stdio -> the report, the routing accumulator, and the log.
  it("masks a secret the child process echoes back into outputs", async function () {
    const echoValue = "echoed-secret-value-9876";
    const echoScript = path.join(tmpDir, "echo-arg.cjs");
    fs.writeFileSync(echoScript, "process.stdout.write(process.argv[2]);\n");

    const spec = {
      tests: [
        {
          testId: "secrets-echo-test",
          steps: [
            {
              stepId: "echo-secret",
              runShell: {
                command: "node",
                args: [posix(echoScript), "$secret.ECHO_TOKEN"],
              },
            },
          ],
        },
      ],
    };
    const specPath = path.join(tmpDir, "temp-secrets-echo.spec.json");
    fs.writeFileSync(specPath, JSON.stringify(spec, null, 2));

    const result = await withEnvAsync({ ECHO_TOKEN: echoValue }, async function () {
      return runTests({ input: specPath, logLevel: "silent" });
    });

    const step =
      result.specs?.[0]?.tests?.[0]?.contexts?.[0]?.steps?.[0] ?? {};
    const stdout = step.outputs?.stdio?.stdout ?? "";

    // The child really did receive and print the resolved value...
    assert.ok(stdout.length > 0, "expected the child to print something");
    // ...but the report must carry the mask, not the credential.
    assert.ok(
      !JSON.stringify(result).includes(echoValue),
      "an echoed secret must not survive anywhere in the results"
    );
    assert.ok(
      stdout.includes("***secret.ECHO_TOKEN***"),
      `echoed stdout must be masked, got: ${stdout}`
    );
  });
});
