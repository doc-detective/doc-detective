import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import http from "node:http";
import crypto from "node:crypto";
import dns from "node:dns";
import dnsPromises from "node:dns/promises";
import { spawnSync } from "node:child_process";
import { pathToFileURL } from "node:url";
import sinon from "sinon";
import axios from "axios";

describe("fetchFile binary mode", function () {
  let fetchFile;

  // These tests stub axios at the module level. The stubbed responses never
  // redirect, so the local-URL guard does no DNS lookups here; the guard
  // itself is covered against a real local server below.
  before(async function () {
    ({ fetchFile } = await import("../dist/core/utils.js"));
  });

  afterEach(function () {
    sinon.restore();
  });

  it("writes PNG bytes verbatim when { binary: true }", async function () {
    // Arbitrary bytes including a 0x00 so we prove .toString() would corrupt them.
    const bytes = Buffer.from([
      0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
      0x00, 0x00, 0x00, 0x0d, 0xff, 0xfe, 0xfd, 0xfc,
    ]);
    sinon.stub(axios, "get").resolves({ data: bytes });

    const result = await fetchFile(
      "https://example.com/image.png",
      { binary: true }
    );

    assert.equal(result.result, "success");
    const onDisk = fs.readFileSync(result.path);
    assert.ok(bytes.equals(onDisk), "on-disk bytes must match the source buffer");

    // Cache key is content-addressed by md5 of the raw bytes.
    const expectedHash = crypto.createHash("md5").update(bytes).digest("hex");
    assert.ok(
      result.path.includes(expectedHash),
      `temp path should embed md5(${expectedHash}), got ${result.path}`
    );
  });

  it("passes responseType: arraybuffer to axios when { binary: true }", async function () {
    const bytes = Buffer.from([0x01, 0x02, 0x03]);
    const stub = sinon.stub(axios, "get").resolves({ data: bytes });

    await fetchFile("https://example.com/x.png", { binary: true });

    assert.equal(stub.callCount, 1);
    assert.equal(stub.firstCall.args[1].responseType, "arraybuffer");
  });

  it("strips query string from the temp file name", async function () {
    const bytes = Buffer.from([0x42]);
    sinon.stub(axios, "get").resolves({ data: bytes });

    const result = await fetchFile(
      "https://bucket.s3.example.com/path/to/img.png?X-Amz-Signature=abc123",
      { binary: true }
    );

    assert.equal(result.result, "success");
    assert.ok(
      result.path.endsWith("img.png"),
      `temp path should end with img.png (no query string), got ${result.path}`
    );
    assert.ok(!result.path.includes("?"), "temp path must not contain '?'");
  });

  it("still works as a text fetcher without the binary flag (no regression)", async function () {
    sinon.stub(axios, "get").resolves({ data: "plain text body" });

    const result = await fetchFile("https://example.com/notes.txt");
    assert.equal(result.result, "success");
    assert.equal(fs.readFileSync(result.path, "utf8"), "plain text body");
  });

  it("returns an error envelope when the fetch throws", async function () {
    sinon.stub(axios, "get").rejects(new Error("boom"));

    const result = await fetchFile("https://example.com/x.png", { binary: true });
    assert.equal(result.result, "error");
    assert.ok(result.message);
  });

  it("applies hard timeout + size limits on the axios call when binary", async function () {
    const stub = sinon.stub(axios, "get").resolves({ data: Buffer.from([0x01]) });
    await fetchFile("https://example.com/x.png", { binary: true });
    const opts = stub.firstCall.args[1];
    assert.ok(opts.timeout > 0, "timeout must be set");
    assert.ok(opts.maxContentLength > 0, "maxContentLength must be set");
    assert.ok(opts.maxBodyLength > 0, "maxBodyLength must be set");
    assert.ok(
      typeof opts.maxRedirects === "number",
      "maxRedirects must be set"
    );
  });

  it("replaces Windows-invalid filename characters in URL-derived names", async function () {
    const bytes = Buffer.from([0x01]);
    sinon.stub(axios, "get").resolves({ data: bytes });
    // URL path segment containing `:` — legal in URLs, invalid in Windows
    // filenames. The on-disk name must not contain any of `<>:"/\|?*` or
    // control chars after sanitization.
    const result = await fetchFile(
      "https://example.com/artwork/render:v2.png",
      { binary: true }
    );
    assert.equal(result.result, "success");
    const base = path.basename(result.path);
    const invalidChars = /[\x00-\x1f<>:"|?*]/;
    assert.ok(
      !invalidChars.test(base),
      `on-disk basename must not contain Windows-invalid chars, got ${base}`
    );
    assert.ok(
      base.endsWith("render_v2.png") ||
        base.endsWith("render_v2_png") ||
        /render_v2\.png$/.test(base),
      `expected sanitized suffix like render_v2.png, got ${base}`
    );
  });

  it("neutralizes path-traversal segments in URL-derived filenames", async function () {
    const bytes = Buffer.from([0xde, 0xad, 0xbe, 0xef]);
    sinon.stub(axios, "get").resolves({ data: bytes });

    const result = await fetchFile(
      "https://evil.example.com/foo/..%2Fpwn.png",
      { binary: true }
    );
    assert.equal(result.result, "success");
    // The on-disk filename must not escape the doc-detective temp dir.
    const os = await import("node:os");
    const expectedPrefix = path.resolve(
      path.join(os.default.tmpdir(), "doc-detective")
    );
    assert.ok(
      path.resolve(result.path).startsWith(expectedPrefix + path.sep),
      `path must stay inside ${expectedPrefix}, got ${result.path}`
    );
    // And must not contain a raw separator after the hash_ prefix.
    const base = path.basename(result.path);
    assert.ok(
      !base.includes("/") && !base.includes("\\"),
      `sanitized basename must not contain separators, got ${base}`
    );
  });
});

// ADR 01162: local URLs work with no setting; the guarded fetches (screenshot
// reference images, OpenAPI $ref resolution) refuse only a hop from a public
// address to a private one. `public.example.test` stands in for a public
// host: the guard's DNS check sees a public address, while the connection
// itself lands on the local server.
// Escape every regex metacharacter, backslash included, so a literal string
// (a URL, a Windows path) matches only itself.
const escapeRegExp = (s) => s.replace(/[\\^$.*+?()[\]{}|]/g, "\\$&");

describe("local URL guard (ADR 01162)", function () {
  const ALLOW = "DOC_DETECTIVE_ALLOW_LOCAL_URLS";
  const BLOCK = "DOC_DETECTIVE_BLOCK_LOCAL_URLS";
  const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x01, 0x02]);
  let server;
  let port;
  let fetchFile;
  let UrlGuardError;
  let loadDescription;
  let checkLink;
  let httpRequest;
  let saved;
  let tmpDir;
  let localFile;
  let localFileUrl;
  let windowsPath;

  before(async function () {
    ({ fetchFile, UrlGuardError } = await import("../dist/core/utils.js"));
    ({ loadDescription } = await import("../dist/core/openapi.js"));
    ({ checkLink } = await import("../dist/core/tests/checkLink.js"));
    ({ httpRequest } = await import("../dist/core/tests/httpRequest.js"));
    const secret = () => `http://127.0.0.1:${port}/schema.json`;
    const json = (body) => ["application/json", JSON.stringify(body)];
    const text = (body) => ["text/plain", body];
    const refTo = (ref) => json({ type: "object", properties: { item: { $ref: ref } } });
    // Path → [content type, body]. Matching on the pathname also answers
    // requests sent through a proxy, which carry the absolute URL.
    const routes = {
      "/ref.png": () => ["image/png", png],
      "/schema.json": () => json({ type: "object", properties: { id: { type: "integer" } } }),
      "/plain.json": () => json({ type: "string" }),
      "/schema.yaml": () => text("type: object\nproperties:\n  id:\n    type: integer\n"),
      "/openapi.yaml": () => text(openApiYaml(secret())),
      "/openapi.json": () =>
        json({ openapi: "3.0.0", info: { title: "t", version: "1" }, paths: {} }),
      "/openapi-chain.yaml": () => text(openApiYaml(`http://public.example.test:${port}/public-doc.yaml`)),
      "/openapi-rebind.yaml": () => text(openApiYaml(`http://rebind.example.test:${port}/plain.json`)),
      "/openapi-gone.yaml": () => text(openApiYaml(`http://gone.example.test:${port}/plain.json?token=s3cret`)),
      "/openapi-public-refs.yaml": () => text(openApiYaml(`http://other.example.test:${port}/plain.json`)),
      // Relative refs in a description resolve against the working directory.
      "/openapi-file.yaml": () => text(openApiYaml("./local-secret.json")),
      "/public-doc.yaml": () =>
        text(`type: object\nproperties:\n  item:\n    $ref: '${secret()}'\n`),
      "/public-doc.json": () => refTo(secret()),
      "/p-space.json": () => refTo(`${secret()} `),
      "/p-alias.yaml": () =>
        text(
          "x: &x 1\n" +
            Array.from({ length: 101 }, (_, i) => `k${i}: *x`).join("\n") +
            `\nleak:\n  $ref: '${secret()}'\n`
        ),
      "/p-cycle.yaml": () => text(`a: &a\n  b: *a\nleak:\n  $ref: '${secret()}'\n`),
      "/p-file-url.json": () => refTo(localFileUrl),
      "/p-file-url-space.json": () => refTo(`${localFileUrl} `),
      // The parser reads a $ref as a filesystem path when it resolves to no
      // `xx://` scheme: a drive-letter path does, on every OS. A POSIX
      // absolute path resolves against the public document's URL instead, so
      // it's an HTTP read on that same public host.
      "/p-file-back.json": () => refTo(windowsPath),
      "/p-file-fwd.json": () => refTo(windowsPath.split("\\").join("/")),
      "/p-file-posix.json": () => refTo(localFile.split(path.sep).join("/").replace(/^[A-Za-z]:/, "")),
      "/private-then-public.json": () => refTo(`http://public.example.test:${port}/plain.json`),
    };
    const redirects = {
      "/redirect": () => [302, secret().replace("schema.json", "ref.png")],
      "/to-rebind": () => [302, `http://rebind.example.test:${port}/ref.png`],
      "/to-public": () => [302, `http://public.example.test:${port}/public-doc.json`],
      "/to-public-root.yaml": () => [302, `http://public.example.test:${port}/openapi.yaml`],
      "/to-js": () => [302, "javascript:alert(1)"],
      "/loop": () => [307, "/loop"],
      "/no-location": () => [302, undefined],
      // Five redirects, then a sixth with no Location header.
      "/chain": (n) => [302, n < 5 ? `/chain?n=${n + 1}` : undefined],
    };
    server = http.createServer((req, res) => {
      const { pathname, searchParams } = new URL(req.url, "http://x");
      if (redirects[pathname]) {
        const [status, location] = redirects[pathname](Number(searchParams.get("n")));
        res.writeHead(status, location ? { Location: location } : {});
        return res.end();
      }
      if (!routes[pathname]) {
        res.writeHead(404);
        return res.end();
      }
      const [type, body] = routes[pathname]();
      res.writeHead(200, { "Content-Type": type });
      res.end(body);
    });
    await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
    port = server.address().port;
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "dd-local-urls-"));
    localFile = path.join(tmpDir, "local.json");
    fs.writeFileSync(localFile, JSON.stringify({ type: "boolean" }));
    localFileUrl = pathToFileURL(localFile).href;
    windowsPath =
      process.platform === "win32" ? localFile : "C:\\Users\\runner\\AppData\\local.json";
  });

  after(function () {
    server.close();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  beforeEach(function () {
    saved = { [ALLOW]: process.env[ALLOW], [BLOCK]: process.env[BLOCK] };
    delete process.env[ALLOW];
    delete process.env[BLOCK];
  });

  afterEach(function () {
    sinon.restore();
    for (const [key, value] of Object.entries(saved)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });

  function openApiYaml(...refs) {
    const schema =
      refs.length === 1
        ? `{ $ref: '${refs[0]}' }`
        : `{ type: object, properties: { ${refs.map((ref, i) => `p${i}: { $ref: '${ref}' }`).join(", ")} } }`;
    return [
      "openapi: 3.0.0",
      "info: { title: t, version: '1' }",
      "paths:",
      "  /items:",
      "    get:",
      "      operationId: getItem",
      "      responses:",
      "        '200':",
      "          description: ok",
      "          content:",
      "            application/json:",
      `              schema: ${schema}`,
      "",
    ].join("\n");
  }

  // Fake DNS for *.example.test names, so a local server can stand in for
  // public hosts:
  //   - the guard's check (dns/promises) answers public for every one, except
  //     rootrebind.example.test, which answers 127.0.0.1;
  //   - the connection's lookup (dns, callback form) answers public too,
  //     except rebind.example.test, which answers 127.0.0.1. Those two are
  //     the shapes of a DNS rebinding attack;
  //   - whatever the lookup answers, the socket then connects to this
  //     suite's server on 127.0.0.1.
  function fakePublicHost() {
    const realPromisesLookup = dnsPromises.lookup.bind(dnsPromises);
    const realLookup = dns.lookup.bind(dns);
    const fake = (host) => host.endsWith(".example.test");
    const reply = (address, opts, cb) =>
      opts && opts.all ? cb(null, [{ address, family: 4 }]) : cb(null, address, 4);
    sinon.stub(dnsPromises, "lookup").callsFake((host, opts) =>
      host === "gone.example.test"
        ? Promise.reject(
            Object.assign(new Error(`getaddrinfo ENOTFOUND ${host}`), { code: "ENOTFOUND" })
          )
        : fake(host)
        ? Promise.resolve([
            {
              address: host === "rootrebind.example.test" ? "127.0.0.1" : "93.184.216.34",
              family: 4,
            },
          ])
        : realPromisesLookup(host, opts)
    );
    sinon.stub(dns, "lookup").callsFake((host, opts, cb) => {
      if (typeof opts === "function") [cb, opts] = [opts, {}];
      if (!fake(host)) return realLookup(host, opts, cb);
      return reply(host === "rebind.example.test" ? "127.0.0.1" : "93.184.216.34", opts, cb);
    });
    // http:// fake-public URLs only; an https:// one needs https.Agent stubbed too.
    const realCreateConnection = http.Agent.prototype.createConnection;
    sinon.stub(http.Agent.prototype, "createConnection").callsFake(function (options, cb) {
      // Only connections to the fake hosts are redirected; anything else
      // (127.0.0.1, localhost, a proxy) connects as it would.
      if (!fake(options.host ?? "")) return realCreateConnection.call(this, options, cb);
      const lookup = options.lookup || dns.lookup;
      const local = (host, opts, done) =>
        lookup(host, opts, (error) => (error ? done(error) : reply("127.0.0.1", opts, done)));
      return realCreateConnection.call(this, { ...options, lookup: local }, cb);
    });
  }

  it("fetches a reference image on 127.0.0.1 or localhost with no setting", async function () {
    for (const host of ["127.0.0.1", "localhost"]) {
      const result = await fetchFile(`http://${host}:${port}/ref.png`, { binary: true });
      assert.equal(result.result, "success", `${host}: ${result.message}`);
      assert.ok(png.equals(fs.readFileSync(result.path)));
    }
  });

  it("refuses a redirect hop that rebinds to a private address at connect time", async function () {
    fakePublicHost();
    const result = await fetchFile(`http://public.example.test:${port}/to-rebind`, {
      binary: true,
    });
    assert.equal(result.result, "error");
    // The refusal itself, not axios's wrapper, so callers report it as is.
    assert.ok(result.message instanceof UrlGuardError, String(result.message));
    assert.equal(
      result.message.message,
      `Couldn't follow the redirect from http://public.example.test:${port}/to-rebind: it leads to 127.0.0.1, a private address, from a public one.\n` +
        "Hint: If you trust this redirect, set DOC_DETECTIVE_ALLOW_LOCAL_URLS=1."
    );
  });

  it("refuses a public host's redirect to 127.0.0.1, with a hint", async function () {
    fakePublicHost();
    const result = await fetchFile(`http://public.example.test:${port}/redirect?token=s3cret`, {
      binary: true,
    });
    assert.equal(result.result, "error");
    assert.equal(
      result.message.message,
      `Couldn't follow the redirect from http://public.example.test:${port}/redirect: it leads to 127.0.0.1, a private address, from a public one.\n` +
        "Hint: If you trust this redirect, set DOC_DETECTIVE_ALLOW_LOCAL_URLS=1."
    );
  });

  it("follows that redirect with DOC_DETECTIVE_ALLOW_LOCAL_URLS=1", async function () {
    fakePublicHost();
    process.env[ALLOW] = "1";
    const result = await fetchFile(`http://public.example.test:${port}/redirect`, { binary: true });
    assert.equal(result.result, "success", String(result.message));
    assert.ok(png.equals(fs.readFileSync(result.path)));
  });

  it("follows a local redirect to a local address", async function () {
    const result = await fetchFile(`http://127.0.0.1:${port}/redirect`, { binary: true });
    assert.equal(result.result, "success", String(result.message));
  });

  it("refuses a redirect to a scheme other than http or https", async function () {
    const result = await fetchFile(`http://127.0.0.1:${port}/to-js?token=s3cret`, { binary: true });
    assert.equal(result.result, "error");
    assert.equal(
      result.message.message,
      `Couldn't fetch http://127.0.0.1:${port}/to-js: the redirect leads to an unsupported scheme (\`javascript\`).`
    );
  });

  it("stops after 5 redirects, and on a redirect with no Location header", async function () {
    const loop = await fetchFile(`http://127.0.0.1:${port}/loop`, { binary: true });
    assert.equal(
      loop.message.message,
      `Couldn't fetch http://127.0.0.1:${port}/loop: it needs more than 5 redirects.`
    );
    const bare = await fetchFile(`http://127.0.0.1:${port}/no-location`, { binary: true });
    assert.equal(
      bare.message.message,
      `Couldn't fetch http://127.0.0.1:${port}/no-location: the 302 redirect has no Location header.`
    );
    // Both at once: the limit is the reason it stopped.
    const chain = await fetchFile(`http://127.0.0.1:${port}/chain`, { binary: true });
    assert.equal(
      chain.message.message,
      `Couldn't fetch http://127.0.0.1:${port}/chain: it needs more than 5 redirects.`
    );
  });

  it("DOC_DETECTIVE_BLOCK_LOCAL_URLS refuses a host that rebinds to a private address at connect time", async function () {
    fakePublicHost();
    process.env[BLOCK] = "1";
    const result = await fetchFile(`http://rebind.example.test:${port}/ref.png`, { binary: true });
    assert.equal(result.result, "error");
    assert.equal(
      result.message.message,
      `Couldn't fetch http://rebind.example.test:${port}/ref.png: DOC_DETECTIVE_BLOCK_LOCAL_URLS refuses private and loopback addresses.\n` +
        "Hint: Unset DOC_DETECTIVE_BLOCK_LOCAL_URLS to allow local URLs."
    );
  });

  it("DOC_DETECTIVE_BLOCK_LOCAL_URLS refuses a direct local reference image", async function () {
    process.env[BLOCK] = "1";
    const result = await fetchFile(`http://127.0.0.1:${port}/ref.png`, { binary: true });
    assert.equal(result.result, "error");
    assert.equal(
      result.message.message,
      `Couldn't fetch http://127.0.0.1:${port}/ref.png: DOC_DETECTIVE_BLOCK_LOCAL_URLS refuses private and loopback addresses.\n` +
        "Hint: Unset DOC_DETECTIVE_BLOCK_LOCAL_URLS to allow local URLs."
    );
  });

  it("reads the switches as 1, true, yes or on, in any case, trimmed", async function () {
    for (const value of ["1", "TRUE", "Yes", " on "]) {
      process.env[BLOCK] = value;
      const result = await fetchFile(`http://127.0.0.1:${port}/ref.png`, { binary: true });
      assert.equal(result.result, "error", `BLOCK=${JSON.stringify(value)} should refuse`);
    }
    for (const value of ["0", "false", "no", ""]) {
      process.env[BLOCK] = value;
      const result = await fetchFile(`http://127.0.0.1:${port}/ref.png`, { binary: true });
      assert.equal(result.result, "success", `BLOCK=${JSON.stringify(value)} should allow`);
    }
  });

  it("fails a guarded fetch when both switches are set", async function () {
    process.env[ALLOW] = "1";
    process.env[BLOCK] = "1";
    const result = await fetchFile(`http://127.0.0.1:${port}/ref.png`, { binary: true });
    assert.equal(result.result, "error");
    assert.equal(
      result.message.message,
      "DOC_DETECTIVE_ALLOW_LOCAL_URLS and DOC_DETECTIVE_BLOCK_LOCAL_URLS can't both be set."
    );
  });

  const runCli = (args) =>
    spawnSync(process.execPath, [path.resolve("bin/doc-detective.js"), ...args], {
      cwd: tmpDir,
      env: { ...process.env, [ALLOW]: "1", [BLOCK]: "1", DOC_DETECTIVE_SKIP_AUTO_UPDATE: "1" },
      encoding: "utf8",
    });

  // Every command, not just a test run. Bare `install` would otherwise fail
  // fast with exit 1, without fetching anything.
  for (const args of [[], ["install"]]) {
    it(`exits 2 when both switches are set (${["doc-detective", ...args].join(" ")})`, function () {
      this.timeout(60000);
      const run = runCli(args);
      assert.equal(run.status, 2, run.stderr);
      assert.ok(
        run.stderr.includes(
          "Error: DOC_DETECTIVE_ALLOW_LOCAL_URLS and DOC_DETECTIVE_BLOCK_LOCAL_URLS can't both be set."
        ),
        run.stderr
      );
    });
  }

  // Help and version still work, for diagnosing the misconfiguration.
  for (const args of [["--help"], ["-h"], ["help"], ["install", "--help"], ["--version"]]) {
    it(`still answers ${args.join(" ")} when both switches are set`, function () {
      this.timeout(60000);
      const run = runCli(args);
      assert.equal(run.status, 0, run.stderr);
      assert.ok(run.stdout.trim().length > 0);
    });
  }

  it("loads a local OpenAPI description with a local $ref", async function () {
    const file = path.join(tmpDir, "openapi.yaml");
    fs.writeFileSync(file, openApiYaml(`http://127.0.0.1:${port}/schema.json`));
    const definition = await loadDescription(file);
    const schema =
      definition.paths["/items"].get.responses["200"].content["application/json"].schema;
    assert.equal(schema.properties.id.type, "integer");
  });

  // The ref parser rethrows what a resolver throws as its own ResolverError,
  // with the original as `cause`.
  const refusalOf = async (description) => {
    const error = await loadDescription(description).then(
      () => assert.fail("loaded"),
      (e) => e
    );
    assert.ok(error.cause instanceof UrlGuardError, String(error.cause));
    return error;
  };

  it("refuses a public OpenAPI description's $ref to a private address", async function () {
    fakePublicHost();
    const error = await refusalOf(`http://public.example.test:${port}/openapi.yaml`);
    assert.equal(
      error.message,
      `Couldn't resolve $ref http://127.0.0.1:${port}/schema.json in http://public.example.test:${port}/openapi.yaml: a public document can't refer to 127.0.0.1, a private address.\n` +
        "Hint: If you trust this document, set DOC_DETECTIVE_ALLOW_LOCAL_URLS=1, or download it and point descriptionPath at the local copy."
    );
    process.env[ALLOW] = "1";
    const definition = await loadDescription(`http://public.example.test:${port}/openapi.yaml`);
    assert.ok(definition.paths["/items"]);
  });

  const refMessage = (ref, doc) =>
    `Couldn't resolve $ref ${ref} in ${doc}: a public document can't refer to ${new URL(ref).hostname}, a private address.\n` +
    "Hint: If you trust this document, set DOC_DETECTIVE_ALLOW_LOCAL_URLS=1, or download it and point descriptionPath at the local copy.";

  it("refuses a private $ref reached through a public document in a local description", async function () {
    fakePublicHost();
    const file = path.join(tmpDir, "openapi-via-public.yaml");
    fs.writeFileSync(file, openApiYaml(`http://public.example.test:${port}/public-doc.json`));
    await assert.rejects(() => loadDescription(file), {
      message: refMessage(
        `http://127.0.0.1:${port}/schema.json`,
        `http://public.example.test:${port}/public-doc.json`
      ),
    });
  });

  // Fail closed: once any public document has been read, every later private
  // read is refused, however the $ref spells it.
  for (const [name, doc] of [
    ["a trailing space", "p-space.json"],
    ["101 YAML aliases", "p-alias.yaml"],
    ["a recursive YAML anchor", "p-cycle.yaml"],
  ]) {
    it(`refuses a private $ref with ${name} in a public document`, async function () {
      fakePublicHost();
      const file = path.join(tmpDir, `openapi-${doc}.yaml`);
      fs.writeFileSync(file, openApiYaml(`http://public.example.test:${port}/${doc}`));
      await assert.rejects(() => loadDescription(file), {
        message: new RegExp(
          `^${escapeRegExp(`Couldn't resolve $ref http://127.0.0.1:${port}/schema.json`)}\\S* ` +
            escapeRegExp(
              `in http://public.example.test:${port}/${doc}: a public document can't refer to 127.0.0.1, a private address.\n`
            )
        ),
      });
    });
  }

  it("allows a private $ref read before any public document", async function () {
    fakePublicHost();
    const file = path.join(tmpDir, "openapi-private-first.yaml");
    fs.writeFileSync(file, openApiYaml(`http://127.0.0.1:${port}/private-then-public.json`));
    const definition = await loadDescription(file);
    const schema =
      definition.paths["/items"].get.responses["200"].content["application/json"].schema;
    assert.equal(schema.properties.item.type, "string");
  });

  const fileRefMessage = (doc) =>
    new RegExp(
      `^${escapeRegExp("Couldn't resolve $ref ")}.*local(-secret)?\\.json\\s* ` +
        escapeRegExp(
          `in ${doc}: a public document can't refer to a local file.\n` +
            "Hint: If you trust this document, set DOC_DETECTIVE_ALLOW_LOCAL_URLS=1, or download it and point descriptionPath at the local copy."
        ) +
        "$"
    );

  it("refuses a public description's $ref to a local file, in default and strict mode", async function () {
    const doc = `http://public.example.test:${port}/openapi-file.yaml`;
    for (const block of [undefined, "1"]) {
      sinon.restore();
      fakePublicHost();
      if (block) process.env[BLOCK] = block;
      await assert.rejects(() => loadDescription(doc), { message: fileRefMessage(doc) });
    }
  });

  for (const doc of ["p-file-url.json", "p-file-url-space.json", "p-file-back.json", "p-file-fwd.json"]) {
    it(`refuses a local file $ref reached through a public document (${doc})`, async function () {
      fakePublicHost();
      const file = path.join(tmpDir, `openapi-${doc}.yaml`);
      fs.writeFileSync(file, openApiYaml(`http://public.example.test:${port}/${doc}`));
      await assert.rejects(() => loadDescription(file), {
        message: fileRefMessage(`http://public.example.test:${port}/${doc}`),
      });
    });
  }

  it("never reads a local file for a POSIX-path $ref in a public document", async function () {
    fakePublicHost();
    const file = path.join(tmpDir, "openapi-p-file-posix.yaml");
    fs.writeFileSync(file, openApiYaml(`http://public.example.test:${port}/p-file-posix.json`));
    // It resolves to a URL on the public host, which this server doesn't
    // serve. A file read would have hit the local-file refusal instead.
    await assert.rejects(() => loadDescription(file), {
      message: "Request failed with status code 404",
    });
  });

  // Strict mode governs network addresses. A local file isn't one, so only a
  // public document read first makes a local file $ref refused.
  it("lets a local description $ref a local file, in default and strict mode", async function () {
    const file = path.join(tmpDir, "openapi-local-file.yaml");
    fs.writeFileSync(file, openApiYaml(localFileUrl));
    for (const block of [undefined, "1"]) {
      if (block) process.env[BLOCK] = block;
      const definition = await loadDescription(file);
      const schema =
        definition.paths["/items"].get.responses["200"].content["application/json"].schema;
      assert.equal(schema.type, "boolean", `${BLOCK}=${block}`);
    }
  });

  it("refuses a private $ref two documents deep under a public description", async function () {
    fakePublicHost();
    await assert.rejects(
      () => loadDescription(`http://public.example.test:${port}/openapi-chain.yaml`),
      {
        message: refMessage(
          `http://127.0.0.1:${port}/schema.json`,
          `http://public.example.test:${port}/public-doc.yaml`
        ),
      }
    );
  });

  it("counts a root description as public by the address it connected to", async function () {
    fakePublicHost();
    const doc = `http://rootrebind.example.test:${port}/openapi.yaml`;
    await assert.rejects(() => loadDescription(doc), {
      message: refMessage(`http://127.0.0.1:${port}/schema.json`, doc),
    });
  });

  it("refuses a private $ref under a private root that redirects to a public one", async function () {
    fakePublicHost();
    await assert.rejects(
      () => loadDescription(`http://127.0.0.1:${port}/to-public-root.yaml`),
      {
        message: refMessage(
          `http://127.0.0.1:${port}/schema.json`,
          `http://127.0.0.1:${port}/to-public-root.yaml (redirected to http://public.example.test:${port}/openapi.yaml)`
        ),
      }
    );
  });

  it("names the $ref and the document when a $ref's host doesn't resolve", async function () {
    fakePublicHost();
    await assert.rejects(
      () => loadDescription(`http://public.example.test:${port}/openapi-gone.yaml`),
      {
        message:
          `Couldn't resolve $ref http://gone.example.test:${port}/plain.json in ` +
          `http://public.example.test:${port}/openapi-gone.yaml: couldn't resolve host gone.example.test (ENOTFOUND).`,
      }
    );
  });

  it("loads a remote .json description without a parse warning", async function () {
    const calls = [];
    for (const method of ["warn", "log", "error"]) {
      sinon.stub(console, method).callsFake((...args) => calls.push(args.join(" ")));
    }
    const definition = await loadDescription(`http://127.0.0.1:${port}/openapi.json`);
    sinon.restore();
    assert.equal(definition.openapi, "3.0.0");
    assert.deepEqual(calls.filter((line) => /Failed to parse/.test(line)), []);
  });

  it("resolves a YAML $ref", async function () {
    const file = path.join(tmpDir, "openapi-yaml-ref.yaml");
    fs.writeFileSync(file, openApiYaml(`http://127.0.0.1:${port}/schema.yaml`));
    const definition = await loadDescription(file);
    const schema =
      definition.paths["/items"].get.responses["200"].content["application/json"].schema;
    assert.equal(schema.properties.id.type, "integer");
  });

  it("loads a localhost description with a localhost $ref", async function () {
    const definition = await loadDescription(`http://localhost:${port}/openapi.yaml`);
    const schema =
      definition.paths["/items"].get.responses["200"].content["application/json"].schema;
    assert.equal(schema.properties.id.type, "integer");
  });

  it("DOC_DETECTIVE_BLOCK_LOCAL_URLS refuses a private root description", async function () {
    process.env[BLOCK] = "1";
    await assert.rejects(() => loadDescription(`http://127.0.0.1:${port}/openapi.yaml`), {
      message: new RegExp(
        `^${escapeRegExp(`Couldn't fetch http://127.0.0.1:${port}/openapi.yaml: DOC_DETECTIVE_BLOCK_LOCAL_URLS refuses`)}`
      ),
    });
  });

  it("refuses a public description's $ref that rebinds to a private address at connect time", async function () {
    fakePublicHost();
    // The refusal itself, not axios's wrapper around it.
    const error = await refusalOf(`http://public.example.test:${port}/openapi-rebind.yaml`);
    assert.equal(
      error.message,
      `Couldn't resolve $ref http://rebind.example.test:${port}/plain.json in ` +
        `http://public.example.test:${port}/openapi-rebind.yaml: a public document can't refer to 127.0.0.1, a private address.\n` +
        "Hint: If you trust this document, set DOC_DETECTIVE_ALLOW_LOCAL_URLS=1, or download it and point descriptionPath at the local copy."
    );
  });

  describe("through a proxy", function () {
    const PROXY_KEYS = ["HTTP_PROXY", "http_proxy", "NO_PROXY", "no_proxy"];
    let proxySaved;
    beforeEach(function () {
      proxySaved = Object.fromEntries(PROXY_KEYS.map((key) => [key, process.env[key]]));
      for (const key of PROXY_KEYS) delete process.env[key];
      // This suite's server answers proxy requests too, on a private address.
      process.env.HTTP_PROXY = `http://localhost:${port}`;
    });
    afterEach(function () {
      for (const key of PROXY_KEYS) delete process.env[key];
      for (const [key, value] of Object.entries(proxySaved)) {
        if (value !== undefined) process.env[key] = value;
      }
    });

    it("doesn't refuse a proxy on a private address", async function () {
      fakePublicHost();
      const definition = await loadDescription(
        `http://public.example.test:${port}/openapi-public-refs.yaml`
      );
      const schema =
        definition.paths["/items"].get.responses["200"].content["application/json"].schema;
      assert.equal(schema.type, "string");
    });

    it("refuses a private $ref after a local $ref redirects to a public document", async function () {
      fakePublicHost();
      const file = path.join(tmpDir, "openapi-proxy-redirect.yaml");
      fs.writeFileSync(file, openApiYaml(`http://127.0.0.1:${port}/to-public`));
      await assert.rejects(() => loadDescription(file), {
        message: refMessage(
          `http://127.0.0.1:${port}/schema.json`,
          `http://127.0.0.1:${port}/to-public (redirected to http://public.example.test:${port}/public-doc.json)`
        ),
      });
    });

    it("still checks each address before a proxied request", async function () {
      fakePublicHost();
      const redirect = await fetchFile(`http://public.example.test:${port}/redirect`, {
        binary: true,
      });
      assert.match(redirect.message.message, /^Couldn't follow the redirect from /);
      process.env[BLOCK] = "1";
      const direct = await fetchFile(`http://localhost:${port}/ref.png`, { binary: true });
      assert.match(direct.message.message, /DOC_DETECTIVE_BLOCK_LOCAL_URLS refuses/);
    });

    it("looks a proxied hop's host up once, and keeps that answer", async function () {
      // A flapping resolver: private first, public after. Through the proxy
      // the connection never looks the host up, so the guard does, once.
      const realLookup = dnsPromises.lookup.bind(dnsPromises);
      let asked = 0;
      sinon.stub(dnsPromises, "lookup").callsFake((host, opts) => {
        if (host !== "flap.example.test") return realLookup(host, opts);
        asked++;
        const address = asked === 1 ? "127.0.0.1" : "93.184.216.34";
        return Promise.resolve([{ address, family: 4 }]);
      });
      const result = await fetchFile(`http://flap.example.test:${port}/redirect`, {
        binary: true,
      });
      assert.equal(asked, 1);
      assert.equal(result.result, "success", String(result.message));
    });
  });

  // This suite's own server, not the shared 8092 one, so a concurrent run
  // holding that port can't stall the test.
  it("leaves checkLink and httpRequest to 127.0.0.1 unguarded, even in strict mode", async function () {
    process.env[BLOCK] = "1";
    const url = `http://127.0.0.1:${port}/ref.png`;
    const link = await checkLink({ config: {}, step: { checkLink: { url } } });
    assert.equal(link.status, "PASS", link.description);
    const request = await httpRequest({
      config: {},
      step: { httpRequest: { url, method: "get" } },
    });
    assert.equal(request.status, "PASS", request.description);
  });
});
