import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import http from "node:http";
import crypto from "node:crypto";
import dns from "node:dns";
import dnsPromises from "node:dns/promises";
import { spawnSync } from "node:child_process";
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
describe("local URL guard (ADR 01162)", function () {
  const ALLOW = "DOC_DETECTIVE_ALLOW_LOCAL_URLS";
  const BLOCK = "DOC_DETECTIVE_BLOCK_LOCAL_URLS";
  const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x01, 0x02]);
  let server;
  let port;
  let fetchFile;
  let loadDescription;
  let checkLink;
  let httpRequest;
  let saved;
  let tmpDir;

  before(async function () {
    ({ fetchFile } = await import("../dist/core/utils.js"));
    ({ loadDescription } = await import("../dist/core/openapi.js"));
    ({ checkLink } = await import("../dist/core/tests/checkLink.js"));
    ({ httpRequest } = await import("../dist/core/tests/httpRequest.js"));
    server = http.createServer((req, res) => {
      if (req.url === "/ref.png") {
        res.writeHead(200, { "Content-Type": "image/png" });
        res.end(png);
      } else if (req.url.split("?")[0] === "/redirect") {
        res.writeHead(302, { Location: `http://127.0.0.1:${port}/ref.png` });
        res.end();
      } else if (req.url === "/loop") {
        res.writeHead(307, { Location: "/loop" });
        res.end();
      } else if (req.url === "/no-location") {
        res.writeHead(302);
        res.end();
      } else if (req.url === "/schema.json") {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ type: "object", properties: { id: { type: "integer" } } }));
      } else if (req.url === "/openapi.yaml") {
        res.writeHead(200, { "Content-Type": "text/plain" });
        res.end(openApiYaml(`http://127.0.0.1:${port}/schema.json`));
      } else {
        res.writeHead(404);
        res.end();
      }
    });
    await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
    port = server.address().port;
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "dd-local-urls-"));
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

  function openApiYaml(ref) {
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
      `              schema: { $ref: '${ref}' }`,
      "",
    ].join("\n");
  }

  function fakePublicHost() {
    const realPromisesLookup = dnsPromises.lookup.bind(dnsPromises);
    const realLookup = dns.lookup.bind(dns);
    sinon.stub(dnsPromises, "lookup").callsFake((host, opts) =>
      host === "public.example.test"
        ? Promise.resolve([{ address: "93.184.216.34", family: 4 }])
        : realPromisesLookup(host, opts)
    );
    sinon.stub(dns, "lookup").callsFake((host, opts, cb) => {
      if (typeof opts === "function") [cb, opts] = [opts, {}];
      if (host !== "public.example.test") return realLookup(host, opts, cb);
      if (opts && opts.all) return cb(null, [{ address: "127.0.0.1", family: 4 }]);
      return cb(null, "127.0.0.1", 4);
    });
  }

  it("fetches a reference image on 127.0.0.1 with no setting", async function () {
    const result = await fetchFile(`http://127.0.0.1:${port}/ref.png`, { binary: true });
    assert.equal(result.result, "success", String(result.message));
    assert.ok(png.equals(fs.readFileSync(result.path)));
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

  it("stops after 5 redirects, and on a redirect with no Location header", async function () {
    const loop = await fetchFile(`http://127.0.0.1:${port}/loop`, { binary: true });
    assert.equal(
      loop.message.message,
      `Couldn't fetch http://127.0.0.1:${port}/loop: it redirects more than 5 times.`
    );
    const bare = await fetchFile(`http://127.0.0.1:${port}/no-location`, { binary: true });
    assert.equal(
      bare.message.message,
      `Couldn't fetch http://127.0.0.1:${port}/no-location: the 302 redirect has no Location header.`
    );
  });

  it("DOC_DETECTIVE_BLOCK_LOCAL_URLS refuses a redirect hop to a local address", async function () {
    fakePublicHost();
    process.env[BLOCK] = "1";
    const result = await fetchFile(`http://public.example.test:${port}/redirect`, { binary: true });
    assert.equal(result.result, "error");
    assert.match(
      result.message.message,
      new RegExp(`^Couldn't fetch http://127\\.0\\.0\\.1:${port}/ref\\.png: DOC_DETECTIVE_BLOCK_LOCAL_URLS refuses`)
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

  it("exits 2 when both switches are set", function () {
    this.timeout(60000);
    const run = spawnSync(process.execPath, [path.resolve("bin/doc-detective.js")], {
      cwd: tmpDir,
      env: { ...process.env, [ALLOW]: "1", [BLOCK]: "1", DOC_DETECTIVE_SKIP_AUTO_UPDATE: "1" },
      encoding: "utf8",
    });
    assert.equal(run.status, 2, run.stderr);
    assert.ok(
      run.stderr.includes(
        "Error: DOC_DETECTIVE_ALLOW_LOCAL_URLS and DOC_DETECTIVE_BLOCK_LOCAL_URLS can't both be set."
      ),
      run.stderr
    );
  });

  it("loads a local OpenAPI description with a local $ref", async function () {
    const file = path.join(tmpDir, "openapi.yaml");
    fs.writeFileSync(file, openApiYaml(`http://127.0.0.1:${port}/schema.json`));
    const definition = await loadDescription(file);
    const schema =
      definition.paths["/items"].get.responses["200"].content["application/json"].schema;
    assert.equal(schema.properties.id.type, "integer");
  });

  it("refuses a public OpenAPI description's $ref to a private address", async function () {
    fakePublicHost();
    await assert.rejects(
      () => loadDescription(`http://public.example.test:${port}/openapi.yaml`),
      {
        message:
          `Couldn't resolve $ref http://127.0.0.1:${port}/schema.json in http://public.example.test:${port}/openapi.yaml: a public document can't refer to a private address.\n` +
          "Hint: If you trust this document, set DOC_DETECTIVE_ALLOW_LOCAL_URLS=1, or download it and point descriptionPath at the local copy.",
      }
    );
    process.env[ALLOW] = "1";
    const definition = await loadDescription(`http://public.example.test:${port}/openapi.yaml`);
    assert.ok(definition.paths["/items"]);
  });

  it("leaves checkLink and httpRequest to 127.0.0.1:8092 unguarded, even in strict mode", async function () {
    process.env[BLOCK] = "1";
    const link = await checkLink({ config: {}, step: { checkLink: { url: "http://127.0.0.1:8092" } } });
    assert.equal(link.status, "PASS", link.description);
    const request = await httpRequest({
      config: {},
      step: { httpRequest: { url: "http://127.0.0.1:8092/", method: "get" } },
    });
    assert.equal(request.status, "PASS", request.description);
  });
});
