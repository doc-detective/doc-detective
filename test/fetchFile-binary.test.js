import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import sinon from "sinon";
import axios from "axios";

describe("fetchFile binary mode", function () {
  let fetchFile;
  const savedAllowLocal = process.env.DOC_DETECTIVE_ALLOW_LOCAL_URLS;

  before(async function () {
    // These tests stub axios at the module level; we don't want the real
    // DNS resolution path in assertUrlHostIsPublic to run for every test
    // (and flake on CI without network). Opt into the local-URL bypass so
    // the SSRF gate is a no-op; it's covered separately in the integration
    // suite against an actual localhost server.
    process.env.DOC_DETECTIVE_ALLOW_LOCAL_URLS = "true";
    ({ fetchFile } = await import("../dist/core/utils.js"));
  });

  after(function () {
    if (savedAllowLocal === undefined) {
      delete process.env.DOC_DETECTIVE_ALLOW_LOCAL_URLS;
    } else {
      process.env.DOC_DETECTIVE_ALLOW_LOCAL_URLS = savedAllowLocal;
    }
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
