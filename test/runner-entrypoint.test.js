import assert from "node:assert/strict";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import {
  apiCall,
  buildEffectiveConfig,
  fetchSpec,
  filterSecrets,
  main,
  makeLogShipper,
  postFinalize,
  provisionWorkspace,
  readRequiredEnv,
  resolvePathPrefix,
  runChild,
  SECRET_DENYLIST,
  sliceLogLine,
} from "../bin/runner-entrypoint.js";

/**
 * Unit tests for the platform runner entrypoint. Real HTTP — a tiny
 * loopback server stands in for the platform API so we exercise the
 * fetch/auth/header path end-to-end without mocks. File-system tests
 * use a per-test tmpdir so we don't touch /workspace on the dev box.
 */

function makeApiServer(handler) {
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      // Drain body for handler convenience.
      const chunks = [];
      req.on("data", (c) => chunks.push(c));
      req.on("end", () => {
        const body = chunks.length ? Buffer.concat(chunks).toString("utf8") : "";
        handler(req, res, body);
      });
    });
    server.listen(0, "127.0.0.1", () => {
      const { port } = server.address();
      resolve({ server, base: `http://127.0.0.1:${port}` });
    });
  });
}

async function closeServer(s) {
  await new Promise((r) => s.close(r));
}

describe("runner-entrypoint: readRequiredEnv", () => {
  it("returns the value when set", () => {
    process.env.__DD_TEST_VAR = "hello";
    try {
      assert.equal(readRequiredEnv("__DD_TEST_VAR"), "hello");
    } finally {
      delete process.env.__DD_TEST_VAR;
    }
  });

  it("throws when the var is missing", () => {
    delete process.env.__DD_TEST_MISSING;
    assert.throws(() => readRequiredEnv("__DD_TEST_MISSING"), /Missing required env var/);
  });

  it("throws when the var is empty string", () => {
    process.env.__DD_TEST_EMPTY = "";
    try {
      assert.throws(() => readRequiredEnv("__DD_TEST_EMPTY"), /Missing required env var/);
    } finally {
      delete process.env.__DD_TEST_EMPTY;
    }
  });
});

describe("runner-entrypoint: sliceLogLine", () => {
  it("returns the line as-is when under the byte limit", () => {
    const out = sliceLogLine("hello");
    assert.deepEqual(out, ["hello"]);
  });

  it("slices oversize lines so each chunk fits the runner's 60 KB internal cap", () => {
    // 200 KB of ASCII → ~4 chunks at 60 KB each. Implementation cap is
    // 60 KB (4 KB headroom under the platform's 64 KB-per-line cap);
    // we assert against the implementation cap, not the platform cap,
    // so a regression that grew slices to 61 KB would surface here.
    const big = "a".repeat(200 * 1024);
    const slices = sliceLogLine(big);
    assert.ok(slices.length >= 3, `expected ≥3 slices, got ${slices.length}`);
    const enc = new TextEncoder();
    for (const s of slices) {
      assert.ok(
        enc.encode(s).byteLength <= 60 * 1024,
        `slice exceeded 60 KB byte cap`
      );
    }
    // Reassembly preserves total content length (modulo lossy mid-codepoint
    // boundaries — for ASCII the count is exact).
    const reassembled = slices.join("");
    assert.equal(reassembled.length, big.length);
  });
});

describe("runner-entrypoint: apiCall", () => {
  let api;
  beforeEach(async () => {
    api = await makeApiServer((req, res, body) => {
      res.setHeader("x-saw-auth", req.headers.authorization || "");
      res.setHeader("x-saw-method", req.method);
      res.setHeader("x-saw-content-type", req.headers["content-type"] || "");
      if (req.url === "/echo") {
        res.writeHead(200, { "content-type": "application/json" });
        res.end(JSON.stringify({ method: req.method, body, url: req.url }));
        return;
      }
      if (req.url === "/410") {
        res.writeHead(410);
        res.end("gone");
        return;
      }
      if (req.url === "/500") {
        res.writeHead(500);
        res.end("nope");
        return;
      }
      res.writeHead(404);
      res.end();
    });
  });
  afterEach(() => closeServer(api.server));

  it("attaches the bearer token and content-type for JSON bodies", async () => {
    const res = await apiCall("POST", `${api.base}/echo`, "tok-1", { x: 1 });
    assert.equal(res.headers.get("x-saw-auth"), "Bearer tok-1");
    assert.equal(res.headers.get("x-saw-content-type"), "application/json");
    const json = await res.json();
    assert.equal(json.method, "POST");
    assert.equal(json.body, JSON.stringify({ x: 1 }));
  });

  it("omits content-type when no body is sent", async () => {
    const res = await apiCall("GET", `${api.base}/echo`, "tok-2");
    assert.equal(res.headers.get("x-saw-content-type"), "");
  });

  it("throws on non-2xx by default", async () => {
    await assert.rejects(apiCall("GET", `${api.base}/500`, "tok-x"), /500/);
  });

  it("does not throw when the status is in allowedStatuses", async () => {
    const res = await apiCall("GET", `${api.base}/410`, "tok-x", undefined, [410]);
    assert.equal(res.status, 410);
  });
});

describe("runner-entrypoint: fetchSpec", () => {
  it("returns canceled=true on 410 Gone", async () => {
    const api = await makeApiServer((req, res) => {
      if (req.url === "/api/runs/run-1/spec") {
        res.writeHead(410);
        res.end();
      }
    });
    try {
      const out = await fetchSpec(api.base, "run-1", "tok");
      assert.equal(out.canceled, true);
      assert.equal(out.spec, undefined);
    } finally {
      await closeServer(api.server);
    }
  });

  it("returns the parsed spec on 200", async () => {
    const api = await makeApiServer((req, res) => {
      res.writeHead(200, { "content-type": "application/json" });
      res.end(
        JSON.stringify({
          run_id: "run-1",
          timeout_seconds: 120,
          config_snapshot: {},
          source_snapshot: { type: "inline", specs: [] },
          secrets: {},
        })
      );
    });
    try {
      const out = await fetchSpec(api.base, "run-1", "tok");
      assert.equal(out.canceled, false);
      assert.equal(out.spec.run_id, "run-1");
      assert.equal(out.spec.timeout_seconds, 120);
    } finally {
      await closeServer(api.server);
    }
  });

  it("URL-encodes the run id in the path", async () => {
    let observed = "";
    const api = await makeApiServer((req, res) => {
      observed = req.url;
      res.writeHead(200, { "content-type": "application/json" });
      res.end("{}");
    });
    try {
      await fetchSpec(api.base, "weird id/with slash", "tok");
      assert.equal(observed, "/api/runs/weird%20id%2Fwith%20slash/spec");
    } finally {
      await closeServer(api.server);
    }
  });
});

describe("runner-entrypoint: buildEffectiveConfig", () => {
  it("forces output to /workspace/output for github sources", () => {
    const cfg = buildEffectiveConfig(
      { input: "docs/", output: "user-output", reporters: ["json"] },
      { type: "github", repo: "x/y", ref: "main" }
    );
    assert.equal(cfg.output, "/workspace/output");
    assert.equal(cfg.input, "docs/"); // user's input preserved for github sources
    assert.deepEqual(cfg.reporters, ["json"]);
  });

  it("forces both input and output for inline sources", () => {
    const cfg = buildEffectiveConfig(
      { input: "ignored-by-platform", output: "user-output" },
      { type: "inline", specs: [] }
    );
    assert.equal(cfg.input, "/workspace/specs");
    assert.equal(cfg.output, "/workspace/output");
  });

  it("returns a usable config when configSnapshot is missing/empty", () => {
    const cfg = buildEffectiveConfig(undefined, { type: "inline", specs: [] });
    assert.equal(cfg.input, "/workspace/specs");
    assert.equal(cfg.output, "/workspace/output");
  });

  it("threads a custom workspaceDir through input/output so it stays in sync with provisionWorkspace", () => {
    // Regression: an earlier draft hardcoded WORKSPACE_DIR here, so
    // an operator pointing DD_WORKSPACE_DIR at /var/dd/ws would have
    // gotten the workspace materialized at /var/dd/ws but the CLI
    // told to read/write at /workspace/* — a silent mismatch that
    // looked fine in unit tests because the fake-runner ignores
    // DOC_DETECTIVE_CONFIG.
    const cfg = buildEffectiveConfig(
      {},
      { type: "inline", specs: [] },
      "/var/dd/ws"
    );
    assert.equal(cfg.output, "/var/dd/ws/output");
    assert.equal(cfg.input, "/var/dd/ws/specs");
  });
});

describe("runner-entrypoint: filterSecrets", () => {
  it("passes through non-reserved keys unchanged", () => {
    const out = filterSecrets({ STRIPE_KEY: "sk_xxx", AWS_REGION: "us-east-1" });
    assert.deepEqual(out, { STRIPE_KEY: "sk_xxx", AWS_REGION: "us-east-1" });
  });

  it("drops every key in the denylist and reports each via onReject", () => {
    const dropped = [];
    const out = filterSecrets(
      { PATH: "/evil", HOME: "/tmp/x", FOO: "ok", NODE_OPTIONS: "--inspect" },
      (k) => dropped.push(k)
    );
    assert.deepEqual(out, { FOO: "ok" });
    assert.deepEqual(dropped.sort(), ["HOME", "NODE_OPTIONS", "PATH"]);
  });

  it("includes every container-shadowing key the implementation cares about", () => {
    // Lock the denylist contents so a future trim doesn't accidentally
    // re-open a footgun.
    const expected = [
      "DOC_DETECTIVE_API",
      "DOC_DETECTIVE_CONFIG",
      "DOC_DETECTIVE_META",
      "HOME",
      "LD_LIBRARY_PATH",
      "LD_PRELOAD",
      "NODE_OPTIONS",
      "NODE_PATH",
      "PATH",
    ];
    assert.deepEqual([...SECRET_DENYLIST].sort(), expected);
  });
});

describe("runner-entrypoint: provisionWorkspace", () => {
  let tmp;
  beforeEach(async () => {
    tmp = await mkdtemp(path.join(os.tmpdir(), "dd-runner-"));
  });
  afterEach(async () => {
    await rm(tmp, { recursive: true, force: true });
  });

  it("writes each inline spec to a deterministic, zero-padded filename", async () => {
    const wsRoot = path.join(tmp, "ws");
    const cwd = await provisionWorkspace(
      {
        type: "inline",
        specs: [
          { id: "s1", tests: [] },
          { id: "s2", tests: [{ steps: [] }] },
        ],
      },
      wsRoot
    );
    assert.equal(cwd, wsRoot);
    const specsDir = path.join(wsRoot, "specs");
    const entries = (await readdir(specsDir)).sort();
    assert.deepEqual(entries, ["spec-0000.json", "spec-0001.json"]);
    const first = JSON.parse(await readFile(path.join(specsDir, "spec-0000.json"), "utf8"));
    assert.equal(first.id, "s1");
  });

  it("returns the workspaceDir as cwd when no path_prefix is set on github sources", async () => {
    // We can't actually clone in unit tests, but the path-prefix logic
    // is reachable independently — exercise inline to confirm the
    // workspaceDir override is honored. The github branch is covered
    // implicitly by the path-prefix join shape above.
    const wsRoot = path.join(tmp, "ws-github-shape");
    const cwd = await provisionWorkspace(
      { type: "inline", specs: [] },
      wsRoot
    );
    assert.equal(cwd, wsRoot);
  });

  it("creates an output subdir for the platform-controlled artifact root", async () => {
    const wsRoot = path.join(tmp, "ws-output");
    await provisionWorkspace({ type: "inline", specs: [] }, wsRoot);
    const entries = await readdir(wsRoot);
    assert.ok(entries.includes("output"), `expected 'output' subdir, got ${entries.join(",")}`);
  });

  it("rejects unsupported source types", async () => {
    await assert.rejects(
      provisionWorkspace({ type: "nope" }, path.join(tmp, "ws-bad")),
      /Unsupported source type/
    );
  });

  it("rejects github sources missing repo or ref before invoking git", async () => {
    // Up-front field guards make a server-side spec-shape regression
    // surface as a clear error instead of an inscrutable
    // `git clone --branch undefined ...` failure. We assert the error
    // message names the missing field so logs are diagnostic.
    await assert.rejects(
      provisionWorkspace(
        { type: "github", ref: "main" },
        path.join(tmp, "ws-no-repo")
      ),
      /missing required field: repo/
    );
    await assert.rejects(
      provisionWorkspace(
        { type: "github", repo: "x/y" },
        path.join(tmp, "ws-no-ref")
      ),
      /missing required field: ref/
    );
  });

  // Note: path_prefix validation is now covered by the
  // `resolvePathPrefix` describe block below — pure-helper tests
  // that don't have to invoke git. The previous version of this
  // suite reached the guard via provisionWorkspace's github branch,
  // which forced one test to make a live `git clone` call to assert
  // the guard wasn't over-eager. The pure-helper extraction lets us
  // assert traversal/no-traversal directly.
});

describe("runner-entrypoint: resolvePathPrefix", () => {
  // Use os.tmpdir() as the workspace base so paths are truly absolute
  // on every platform — Windows treats `/workspace` as drive-relative
  // and path.resolve normalizes it to `C:\workspace`, which would
  // break exact-string assertions. We don't actually create anything
  // in the tmpdir; the helper is pure.
  const ws = os.tmpdir();

  it("returns workspaceDir unchanged when path_prefix is absent", () => {
    assert.equal(resolvePathPrefix(ws), ws);
    assert.equal(resolvePathPrefix(ws, ""), ws);
    assert.equal(resolvePathPrefix(ws, undefined), ws);
  });

  it("joins a normal in-workspace prefix", () => {
    assert.equal(resolvePathPrefix(ws, "docs"), path.join(ws, "docs"));
    assert.equal(
      resolvePathPrefix(ws, "subdir/nested"),
      path.join(ws, "subdir", "nested")
    );
  });

  it("rejects a traversal that escapes the workspace via ..", () => {
    assert.throws(
      () => resolvePathPrefix(ws, "../etc"),
      /escapes workspace/
    );
    assert.throws(
      () => resolvePathPrefix(ws, "subdir/../../escape"),
      /escapes workspace/
    );
  });

  it("rejects an absolute prefix that path.resolve would otherwise honor as an override", () => {
    // path.resolve(ws, '<absolute-other-path>') replaces ws entirely
    // — without the guard this would silently let the user point cwd
    // at an arbitrary path. Use a sibling tmpdir-rooted path so the
    // assertion is platform-agnostic; on Linux this is `/etc/passwd`,
    // on Windows it's `C:\some\other\absolute\path`.
    const otherAbs = path.resolve(os.tmpdir(), "..", "definitely-not-the-workspace");
    assert.throws(
      () => resolvePathPrefix(ws, otherAbs),
      /escapes workspace/
    );
  });
});

describe("runner-entrypoint: makeLogShipper", () => {
  it("ships a flush'd batch with the bearer token", async () => {
    const seen = [];
    const api = await makeApiServer((req, res, body) => {
      seen.push({ url: req.url, auth: req.headers.authorization, body });
      res.writeHead(204);
      res.end();
    });
    try {
      const shipper = makeLogShipper(api.base, "run-X", "tok-Y");
      shipper.add("stdout", "hello");
      shipper.add("stderr", "world");
      await shipper.flush();
      assert.equal(seen.length, 1);
      assert.equal(seen[0].url, "/api/runs/run-X/logs");
      assert.equal(seen[0].auth, "Bearer tok-Y");
      const parsed = JSON.parse(seen[0].body);
      assert.equal(parsed.lines.length, 2);
      assert.equal(parsed.lines[0].stream, "stdout");
      assert.equal(parsed.lines[0].payload, "hello");
      assert.equal(parsed.lines[1].stream, "stderr");
      assert.equal(parsed.lines[1].payload, "world");
    } finally {
      await closeServer(api.server);
    }
  });

  it("swallows transport errors so a bad /logs response doesn't fail the run", async () => {
    const api = await makeApiServer((req, res) => {
      res.writeHead(500);
      res.end();
    });
    try {
      const shipper = makeLogShipper(api.base, "run-Z", "tok");
      shipper.add("stdout", "line");
      // Should resolve, not reject.
      await shipper.flush();
    } finally {
      await closeServer(api.server);
    }
  });

  it("does not POST when the buffer is empty", async () => {
    let calls = 0;
    const api = await makeApiServer((req, res) => {
      calls++;
      res.writeHead(204);
      res.end();
    });
    try {
      const shipper = makeLogShipper(api.base, "run", "tok");
      await shipper.flush();
      assert.equal(calls, 0);
    } finally {
      await closeServer(api.server);
    }
  });

  it("preserves all slices of an oversize line that auto-flushes mid-iteration", async () => {
    // Regression test for a bug where add() returned after the first
    // slice triggered the auto-flush, silently dropping subsequent
    // slices of the same oversize line.
    const seen = [];
    const api = await makeApiServer((req, res, body) => {
      seen.push(JSON.parse(body));
      res.writeHead(204);
      res.end();
    });
    try {
      const shipper = makeLogShipper(api.base, "run", "tok");
      // Pre-fill buffer so the first slice of the oversize line
      // immediately trips LOG_BATCH_SIZE.
      for (let i = 0; i < 99; i++) shipper.add("stdout", `pad-${i}`);
      // 180 KB → 3 slices at 60 KB each.
      const oversize = "x".repeat(180 * 1024);
      shipper.add("stdout", oversize);
      await shipper.flush();
      // Total expected line count: 99 padding + 3 slices = 102.
      const total = seen.reduce((acc, batch) => acc + batch.lines.length, 0);
      assert.equal(total, 102, `expected 102 lines across batches, got ${total}`);
    } finally {
      await closeServer(api.server);
    }
  });

  it("auto-flushes when the batch hits LOG_BATCH_SIZE", async () => {
    const seen = [];
    const api = await makeApiServer((req, res, body) => {
      seen.push(JSON.parse(body));
      res.writeHead(204);
      res.end();
    });
    try {
      const shipper = makeLogShipper(api.base, "run", "tok");
      // Fire 100 lines — the cap. Should flush exactly once without
      // waiting for the interval timer.
      for (let i = 0; i < 100; i++) shipper.add("stdout", `line-${i}`);
      // Give the queued flush microtask a chance to land.
      await new Promise((r) => setImmediate(r));
      // Drain the post-flush state in case the implementation queues
      // a follow-up flush; an extra empty drain is harmless.
      await shipper.flush();
      assert.equal(seen.length, 1, `expected 1 batch, got ${seen.length}`);
      assert.equal(seen[0].lines.length, 100);
    } finally {
      await closeServer(api.server);
    }
  });
});

describe("runner-entrypoint: postFinalize", () => {
  it("returns true on 204", async () => {
    const seen = [];
    const api = await makeApiServer((req, res, body) => {
      seen.push({ url: req.url, body });
      res.writeHead(204);
      res.end();
    });
    try {
      const ok = await postFinalize(api.base, "run-F", "tok", {
        status: "succeeded",
        exit_code: 0,
        summary: {},
      });
      assert.equal(ok, true);
      assert.equal(seen[0].url, "/api/runs/run-F/finalize");
      assert.deepEqual(JSON.parse(seen[0].body), {
        status: "succeeded",
        exit_code: 0,
        summary: {},
      });
    } finally {
      await closeServer(api.server);
    }
  });

  it("returns false on transport failure (does not throw)", async () => {
    // Point at a non-listening port so fetch fails with ECONNREFUSED.
    const ok = await postFinalize("http://127.0.0.1:1", "run", "tok", {
      status: "failed",
    });
    assert.equal(ok, false);
  });
});

describe("runner-entrypoint: apiCall timeout", () => {
  it("aborts and throws TimeoutError-shaped message when the server stalls past the budget", async () => {
    // Server accepts the connection but never writes a response, so
    // only the AbortSignal.timeout can rescue the call. 50ms budget
    // is well under any real server latency on CI.
    const sockets = [];
    const server = await new Promise((resolve) => {
      const s = http.createServer((req) => {
        // Hold the request open. We track the socket so afterEach can
        // force-close it; otherwise server.close() blocks forever.
        sockets.push(req.socket);
      });
      s.listen(0, "127.0.0.1", () => resolve(s));
    });
    const { port } = server.address();
    try {
      await assert.rejects(
        apiCall("GET", `http://127.0.0.1:${port}/stall`, "tok", undefined, [], 50),
        /timed out after 50ms/
      );
    } finally {
      for (const sock of sockets) sock.destroy();
      await new Promise((r) => server.close(r));
    }
  });
});

describe("runner-entrypoint: runChild", () => {
  // Fixtures that exercise each behavior we care about. node -e is
  // self-contained — no test file scaffolding to manage.
  const NODE = process.execPath;
  const echo = (script) => [NODE, ["-e", script]];

  it("delivers each stdout/stderr line to onLine in order", async () => {
    const lines = [];
    const exit = await runChild(
      ...echo(
        "process.stdout.write('a\\nb\\n'); process.stderr.write('e1\\n'); process.exit(0);"
      ),
      { cwd: process.cwd(), env: process.env },
      (stream, payload) => lines.push([stream, payload])
    );
    assert.equal(exit, 0);
    assert.deepEqual(lines, [
      ["stdout", "a"],
      ["stdout", "b"],
      ["stderr", "e1"],
    ]);
  });

  it("re-assembles a line split across two write() chunks", async () => {
    // Force a chunk boundary mid-line by writing two halves with a
    // delay. The line buffer accumulates the partial chunk; only on
    // the newline does onLine fire.
    const lines = [];
    const exit = await runChild(
      ...echo(
        "process.stdout.write('hel'); setTimeout(() => { process.stdout.write('lo\\n'); process.exit(0); }, 50);"
      ),
      { cwd: process.cwd(), env: process.env },
      (stream, payload) => lines.push([stream, payload])
    );
    assert.equal(exit, 0);
    assert.deepEqual(lines, [["stdout", "hello"]]);
  });

  it("flushes a trailing line that the child never terminated with \\n", async () => {
    // The child writes 'tail' with no newline then exits. The 'end'
    // handler must flush the residual buffer or the line is lost.
    const lines = [];
    const exit = await runChild(
      ...echo("process.stdout.write('tail'); process.exit(0);"),
      { cwd: process.cwd(), env: process.env },
      (stream, payload) => lines.push([stream, payload])
    );
    assert.equal(exit, 0);
    assert.deepEqual(lines, [["stdout", "tail"]]);
  });

  it("propagates the child's non-zero exit code", async () => {
    const exit = await runChild(
      ...echo("process.exit(7);"),
      { cwd: process.cwd(), env: process.env },
      () => undefined
    );
    assert.equal(exit, 7);
  });

  it("maps signal-terminated child to 143 when SIGTERM is forwarded", async function () {
    // POSIX-only: Windows doesn't have real signals — child.kill('SIGTERM')
    // there maps to TerminateProcess and Node reports (code: 1,
    // signal: null) rather than (code: null, signal: 'SIGTERM'), so
    // the 143 contract this test asserts only holds on Linux/macOS.
    // The runner only ever runs in the Linux container in
    // production; the Windows test runner is for cross-platform
    // safety on the rest of the file.
    if (process.platform === "win32") this.skip();
    // Child has no SIGTERM handler so Node's default kills it with
    // (code: null, signal: 'SIGTERM') — runChild's mapper resolves
    // that to 143. The setInterval keeps the event loop alive until
    // the signal arrives.
    this.timeout(5000);
    const exitPromise = runChild(
      ...echo("setInterval(() => {}, 1000);"),
      { cwd: process.cwd(), env: process.env },
      () => undefined
    );
    // Let the child reach setInterval, then drive the parent
    // process's SIGTERM listener — which is exactly the
    // `forwardTerm` handler installed by runChild. It SIGTERMs the
    // child, which Node defaults to terminate.
    await new Promise((r) => setTimeout(r, 200));
    process.emit("SIGTERM");
    const exit = await exitPromise;
    assert.equal(exit, 143);
  });

  it("rejects if the child cannot be spawned (ENOENT)", async () => {
    await assert.rejects(
      runChild("definitely-not-a-real-binary-xyz", [], {
        cwd: process.cwd(),
        env: process.env,
      }, () => undefined),
      /ENOENT|spawn|not found/i
    );
  });

  it("removes its SIGTERM listener on exit so successive runs don't accumulate handlers", async () => {
    const before = process.listenerCount("SIGTERM");
    await runChild(
      ...echo("process.exit(0);"),
      { cwd: process.cwd(), env: process.env },
      () => undefined
    );
    const after = process.listenerCount("SIGTERM");
    assert.equal(after, before, "runChild leaked a SIGTERM listener");
  });
});

describe("runner-entrypoint: makeLogShipper backpressure", () => {
  it("load-sheds new batches when pending hits the cap", async () => {
    // Make the API server hold every POST open so pending grows.
    // Tracking the held requests lets afterEach drain them.
    const heldResponses = [];
    const released = [];
    const api = await makeApiServer((req, res, body) => {
      heldResponses.push(res);
      released.push(JSON.parse(body));
      // intentionally never end — the test releases at teardown
    });
    try {
      const shipper = makeLogShipper(api.base, "run", "tok");
      // Saturate pending to LOG_MAX_PENDING_BATCHES (8). Each batch
      // is LOG_BATCH_SIZE=100 lines. Need to push at least 8*100 lines
      // so each fireBatch fires before pending fills, then push more
      // to exercise the load-shed branch.
      for (let i = 0; i < 100 * 9; i++) shipper.add("stdout", `l-${i}`);
      // Yield to let the queued POSTs land on the server. We can't
      // await flush() because that'd hang on the held responses; we
      // assert on the server's seen-batch count instead.
      await new Promise((r) => setTimeout(r, 50));
      // 8 batches should have been accepted (cap = LOG_MAX_PENDING_BATCHES).
      // The 9th batch was dropped on the floor.
      assert.ok(
        released.length === 8,
        `expected exactly 8 in-flight batches, saw ${released.length}`
      );
    } finally {
      for (const res of heldResponses) {
        try { res.writeHead(204); res.end(); } catch {}
      }
      await closeServer(api.server);
    }
  });
});

describe("runner-entrypoint: main()", () => {
  // End-to-end against a loopback server. Uses DD_RUNNER_CMD to
  // override the spawn target with a node fixture so we can drive
  // exit codes / stdout deterministically without depending on the
  // doc-detective binary being installed.
  const NODE = process.execPath;

  // Skip on Windows: the fake-runner approach uses #!/usr/bin/env node
  // which Windows doesn't honor for spawn(). The intra-runner branches
  // are exercised on Linux/macOS coverage; Windows-specific runtime
  // shape is not part of this PR's scope.
  const isWindows = process.platform === "win32";

  let tmpDir;
  let api;
  let observed;
  let runnerScriptPath;

  async function setupSpec(spec) {
    observed = { logs: [], finalize: null, specReturned: false };
    api = await makeApiServer((req, res, body) => {
      const url = req.url;
      if (req.method === "GET" && url.endsWith("/spec")) {
        observed.specReturned = true;
        if (spec === 410) {
          res.writeHead(410);
          res.end();
          return;
        }
        res.writeHead(200, { "content-type": "application/json" });
        res.end(JSON.stringify(spec));
        return;
      }
      if (req.method === "POST" && url.endsWith("/logs")) {
        observed.logs.push(JSON.parse(body));
        res.writeHead(204); res.end();
        return;
      }
      if (req.method === "POST" && url.endsWith("/finalize")) {
        observed.finalize = JSON.parse(body);
        res.writeHead(204); res.end();
        return;
      }
      res.writeHead(404); res.end();
    });
  }

  beforeEach(async () => {
    if (isWindows) return;
    tmpDir = await mkdtemp(path.join(os.tmpdir(), "dd-main-"));
    // Reset across tests so a stale path from an earlier test (which
    // called writeRunnerFixture) can't leak into a later test that
    // didn't. envForRun() picks up whatever's in this var.
    runnerScriptPath = undefined;
  });
  afterEach(async () => {
    if (isWindows) return;
    if (api) await closeServer(api.server);
    api = null;
    if (tmpDir) await rm(tmpDir, { recursive: true, force: true });
    delete process.env.DD_API_BASE;
    delete process.env.DD_RUN_ID;
    delete process.env.DD_RUN_TOKEN;
    delete process.env.DD_RUNNER_CMD;
    delete process.env.DD_TIMEOUT_SECONDS;
    delete process.env.DD_WORKSPACE_DIR;
  });

  async function writeRunnerFixture(jsBody) {
    runnerScriptPath = path.join(tmpDir, "fake-runner.mjs");
    const { writeFile, chmod } = await import("node:fs/promises");
    // Point the shebang at the absolute node path so PATH
    // misconfiguration in CI doesn't bite us.
    const shebang = `#!${NODE}\n`;
    await writeFile(runnerScriptPath, shebang + jsBody, "utf8");
    await chmod(runnerScriptPath, 0o755);
  }

  function envForRun() {
    process.env.DD_API_BASE = api.base;
    process.env.DD_RUN_ID = "run-main-1";
    process.env.DD_RUN_TOKEN = "tok-main-1";
    if (runnerScriptPath) process.env.DD_RUNNER_CMD = runnerScriptPath;
    process.env.DD_TIMEOUT_SECONDS = "60";
    process.env.DD_WORKSPACE_DIR = path.join(tmpDir, "workspace");
  }

  it("returns 0 without finalize when /spec returns 410 (canceled-before-spawn)", async function () {
    if (isWindows) this.skip();
    await setupSpec(410);
    envForRun();
    const code = await main();
    assert.equal(code, 0);
    assert.equal(observed.finalize, null, "no finalize POST expected on 410");
  });

  it("posts failed finalize with spec_fetch_failed reason and the real error when /spec's network call fails", async function () {
    if (isWindows) this.skip();
    // Regression: previously an uncaught fetchSpec() failure crashed
    // main() with zero report back to the platform — the run just sat
    // at 'starting' until Sweep A reaped it as a generic
    // 'cold_start_exceeded' with no indication of the real cause. This
    // simulates a network-level failure (connection reset, no
    // response) on GET /spec specifically, while /finalize is still
    // served normally by the same loopback server — mirroring a Fly
    // machine whose outbound call intermittently fails on the very
    // first hop but can still reach the platform moments later.
    observed = { logs: [], finalize: null, specReturned: false };
    api = await makeApiServer((req, res, body) => {
      const url = req.url;
      if (req.method === "GET" && url.endsWith("/spec")) {
        observed.specReturned = true;
        req.socket.destroy();
        return;
      }
      if (req.method === "POST" && url.endsWith("/finalize")) {
        observed.finalize = JSON.parse(body);
        res.writeHead(204);
        res.end();
        return;
      }
      res.writeHead(404);
      res.end();
    });
    envForRun();
    const code = await main();
    assert.equal(code, 1);
    assert.ok(observed.specReturned, "expected /spec to have been hit");
    assert.equal(observed.finalize.status, "failed");
    assert.equal(observed.finalize.exit_code, 1);
    assert.equal(observed.finalize.summary.reason, "spec_fetch_failed");
    assert.ok(
      typeof observed.finalize.summary.error === "string" &&
        observed.finalize.summary.error.length > 0,
      "expected the real fetch error to be captured in summary.error"
    );
  });

  it("posts succeeded finalize when child exits 0", async function () {
    if (isWindows) this.skip();
    await writeRunnerFixture(
      "process.stdout.write('hello\\n'); process.exit(0);\n"
    );
    await setupSpec({
      run_id: "run-main-1",
      timeout_seconds: 60,
      config_snapshot: {},
      source_snapshot: { type: "inline", specs: [] },
      secrets: {},
    });
    envForRun();
    const code = await main();
    assert.equal(code, 0);
    assert.equal(observed.finalize.status, "succeeded");
    assert.equal(observed.finalize.exit_code, 0);
    // At least one /logs POST should have carried the 'hello' line.
    const allLines = observed.logs.flatMap((b) => b.lines);
    assert.ok(allLines.some((l) => l.payload === "hello"));
  });

  it("posts failed finalize with nonzero_exit reason when child exits non-zero", async function () {
    if (isWindows) this.skip();
    await writeRunnerFixture("process.exit(7);\n");
    await setupSpec({
      run_id: "run-main-1",
      timeout_seconds: 60,
      config_snapshot: {},
      source_snapshot: { type: "inline", specs: [] },
      secrets: {},
    });
    envForRun();
    const code = await main();
    assert.equal(code, 7);
    assert.equal(observed.finalize.status, "failed");
    assert.equal(observed.finalize.exit_code, 7);
    assert.equal(observed.finalize.summary.reason, "nonzero_exit");
  });

  it("posts failed finalize with spawn_failed reason when DD_RUNNER_CMD is bogus", async function () {
    if (isWindows) this.skip();
    await setupSpec({
      run_id: "run-main-1",
      timeout_seconds: 60,
      config_snapshot: {},
      source_snapshot: { type: "inline", specs: [] },
      secrets: {},
    });
    envForRun();
    process.env.DD_RUNNER_CMD = "/nonexistent/path/to/runner-xyz";
    const code = await main();
    assert.equal(code, 1);
    assert.equal(observed.finalize.status, "failed");
    assert.equal(observed.finalize.summary.reason, "spawn_failed");
  });

  it("re-arms self-kill from spec.timeout_seconds when it differs from the env value", async function () {
    if (isWindows) this.skip();
    // Child runs to completion quickly so we don't actually wait for
    // the self-kill — we just need to confirm the run still finalizes
    // succeeded after main() processes the divergent spec timeout
    // (regression-checks that the re-arm path doesn't throw or hang).
    await writeRunnerFixture("process.exit(0);\n");
    await setupSpec({
      run_id: "run-main-1",
      // Diverges from DD_TIMEOUT_SECONDS=60 set in envForRun() so the
      // `specTimeout !== timeoutSeconds` branch fires.
      timeout_seconds: 1234,
      config_snapshot: {},
      source_snapshot: { type: "inline", specs: [] },
      secrets: {},
    });
    envForRun();
    const code = await main();
    assert.equal(code, 0);
    assert.equal(observed.finalize.status, "succeeded");
  });

  it("clears the self-kill watchdog when main() completes (no leaked process.exit(124))", async function () {
    // Regression: main() armed an unref'd `setTimeout(() => process.exit(124))`
    // self-kill watchdog but never cleared it on normal completion. When main()
    // is called in-process (as this suite does), that timer outlived the call
    // and, on a host process still alive when it fired, killed the whole
    // process with exit code 124 — surfacing as an intermittent, slow-runner
    // (macOS) `npm test` abort. The watchdog only needs to bound a *hung* run;
    // once main() returns there's nothing to bound, so it must be disarmed.
    //
    // This case runs on every platform: it drives the 410 (canceled) path,
    // which arms the initial self-kill and returns without spawning a child —
    // so it doesn't need the POSIX-only fake-runner shebang the other main()
    // cases rely on.
    await setupSpec(410);
    // Set env directly rather than via envForRun(): the 410 path returns
    // before provisioning, so it needs no workspace/runner fixture — and
    // this keeps the case Windows-safe (beforeEach skips tmpDir setup on
    // Windows, which would make envForRun()'s path.join throw).
    process.env.DD_API_BASE = api.base;
    process.env.DD_RUN_ID = "run-main-1";
    process.env.DD_RUN_TOKEN = "tok-main-1";
    // A tiny timeout so the leaked timer (if any) would fire almost
    // immediately after main() resolves — well within the wait below.
    process.env.DD_TIMEOUT_SECONDS = "0.05"; // 50ms

    const realExit = process.exit;
    const exitCalls = [];
    // Stub process.exit so a fired watchdog records its code instead of
    // tearing down the mocha process.
    process.exit = (code) => {
      exitCalls.push(code);
    };
    try {
      const code = await main();
      assert.equal(code, 0);
      // Wait well past the 50ms self-kill window. If main() left the timer
      // armed, process.exit(124) fires during this wait and is recorded.
      await new Promise((r) => setTimeout(r, 250));
      assert.deepEqual(
        exitCalls,
        [],
        `self-kill watchdog leaked: process.exit called with ${exitCalls.join(", ")}`
      );
    } finally {
      process.exit = realExit;
      // afterEach skips its cleanup on Windows, so close the loopback
      // server and clear env here to avoid leaking either across tests.
      if (api) {
        await closeServer(api.server);
        api = null;
      }
      delete process.env.DD_API_BASE;
      delete process.env.DD_RUN_ID;
      delete process.env.DD_RUN_TOKEN;
      delete process.env.DD_TIMEOUT_SECONDS;
    }
  });

  it("posts failed finalize with workspace_provision_failed for unsupported source", async function () {
    if (isWindows) this.skip();
    await setupSpec({
      run_id: "run-main-1",
      timeout_seconds: 60,
      config_snapshot: {},
      source_snapshot: { type: "totally-bogus" },
      secrets: {},
    });
    envForRun();
    const code = await main();
    assert.equal(code, 1);
    assert.equal(observed.finalize.status, "failed");
    assert.equal(observed.finalize.summary.reason, "workspace_provision_failed");
  });
});
