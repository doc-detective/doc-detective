import assert from "node:assert/strict";
import sinon from "sinon";
import { EventEmitter } from "node:events";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import https from "node:https";
import http from "node:http";
import { HerettoUploader } from "../dist/core/integrations/heretto.js";

// ─── HTTP mocking helpers ────────────────────────────────────────────────────
// Each raw-HTTP method in HerettoUploader uses `protocol.request(options, cb)`
// where `protocol` is node:https or node:http. We stub `.request` so it never
// opens a socket. The stub returns a fake ClientRequest (an EventEmitter with
// no-op write/end/setTimeout) and, on the next tick, either invokes the
// response callback with a fake IncomingMessage (emitting 'data' then 'end')
// or emits an 'error' on the request.

const noop = () => {};

/**
 * Build a fake ClientRequest.
 * @param {Object} plan - How this request should behave.
 *   plan.response = { statusCode, body, headers } → callback fires with response.
 *   plan.error = Error → request emits 'error'.
 *   plan.timeout = true → the registered setTimeout handler fires.
 * @param {Function} cb - The response callback provided by the caller.
 */
function makeFakeRequest(plan, cb) {
  const req = new EventEmitter();
  let timeoutHandler = null;
  req.write = noop;
  req.setTimeout = (_ms, handler) => {
    timeoutHandler = handler;
    return req;
  };
  req.destroy = (err) => {
    // Mimic node: destroying with an error surfaces it via 'error'.
    if (err) process.nextTick(() => req.emit("error", err));
    return req;
  };
  req.end = () => {
    process.nextTick(() => {
      if (plan.timeout && timeoutHandler) {
        timeoutHandler();
        return;
      }
      if (plan.error) {
        req.emit("error", plan.error);
        return;
      }
      const r = plan.response || { statusCode: 200, body: "", headers: {} };
      const res = new EventEmitter();
      res.statusCode = r.statusCode;
      res.headers = r.headers || {};
      cb(res);
      process.nextTick(() => {
        const body = r.body == null ? "" : r.body;
        if (Buffer.isBuffer(body)) {
          res.emit("data", body);
        } else if (Array.isArray(body)) {
          for (const chunk of body) res.emit("data", Buffer.from(chunk));
        } else if (body !== "") {
          res.emit("data", Buffer.from(String(body)));
        }
        res.emit("end");
      });
    });
  };
  return req;
}

/**
 * Install a queue-driven stub on https.request and http.request.
 * Returns an object with a `queue` array; each entry is a plan (see above).
 * Requests consume plans FIFO. `calls` records the options passed.
 */
function installHttpStub() {
  const state = { queue: [], calls: [] };
  const handler = function (options, cb) {
    state.calls.push(options);
    if (state.queue.length === 0) {
      // Fail fast on an unexpected request so a test can't silently pass while
      // HerettoUploader makes an extra/unordered call — every expected request
      // must be enqueued explicitly.
      throw new Error(
        `Unexpected HTTP request (${options.method || "GET"} ${
          options.path || options.hostname || ""
        }): no response was enqueued.`
      );
    }
    const plan = state.queue.shift();
    return makeFakeRequest(plan, cb);
  };
  sinon.stub(https, "request").callsFake(handler);
  sinon.stub(http, "request").callsFake(handler);
  return state;
}

const silentLog = () => {};

describe("HerettoUploader (hermetic HTTP)", function () {
  const apiBaseUrl = "https://acme.heretto.com";
  const apiToken = "tok";
  const username = "user@example.com";

  afterEach(function () {
    sinon.restore();
  });

  // ─── Pure / near-pure helpers ──────────────────────────────────────────────
  describe("canHandle", function () {
    it("returns true for a heretto source integration", function () {
      const u = new HerettoUploader();
      assert.equal(u.canHandle({ type: "heretto" }), true);
    });
    it("returns false for a non-heretto integration", function () {
      const u = new HerettoUploader();
      assert.equal(u.canHandle({ type: "git" }), false);
    });
    it("returns false for null/undefined", function () {
      const u = new HerettoUploader();
      assert.equal(u.canHandle(null), false);
      assert.equal(u.canHandle(undefined), false);
    });
  });

  describe("escapeXml", function () {
    it("escapes all five special characters", function () {
      const u = new HerettoUploader();
      assert.equal(
        u.escapeXml(`&<>"'`),
        "&amp;&lt;&gt;&quot;&apos;"
      );
    });
    it("leaves plain text unchanged", function () {
      const u = new HerettoUploader();
      assert.equal(u.escapeXml("file.png"), "file.png");
    });
  });

  describe("getContentType", function () {
    it("maps known extensions", function () {
      const u = new HerettoUploader();
      assert.equal(u.getContentType("a.png"), "image/png");
      assert.equal(u.getContentType("a.JPG"), "image/jpeg");
      assert.equal(u.getContentType("a.jpeg"), "image/jpeg");
      assert.equal(u.getContentType("a.gif"), "image/gif");
      assert.equal(u.getContentType("a.svg"), "image/svg+xml");
      assert.equal(u.getContentType("a.webp"), "image/webp");
      assert.equal(u.getContentType("a.bmp"), "image/bmp");
      assert.equal(u.getContentType("a.ico"), "image/x-icon");
      assert.equal(u.getContentType("a.pdf"), "application/pdf");
      assert.equal(u.getContentType("a.xml"), "application/xml");
      assert.equal(u.getContentType("a.dita"), "application/xml");
      assert.equal(u.getContentType("a.ditamap"), "application/xml");
    });
    it("falls back to octet-stream for unknown/no extension", function () {
      const u = new HerettoUploader();
      assert.equal(u.getContentType("a.zzz"), "application/octet-stream");
      assert.equal(u.getContentType("noext"), "application/octet-stream");
    });
  });

  describe("resolveFromDependencies", function () {
    it("returns null when no dependencies map is provided", function () {
      const u = new HerettoUploader();
      assert.equal(
        u.resolveFromDependencies({ resourceDependencies: null, filePath: "a/b.png", filename: "b.png", log: silentLog }),
        null
      );
    });
    it("matches by exact/endsWith path and skips internal keys", function () {
      const u = new HerettoUploader();
      const deps = {
        _ditamapParentFolderId: "IGNORED",
        "images/b.png": { uuid: "u1", parentFolderId: "p1" },
      };
      const res = u.resolveFromDependencies({
        resourceDependencies: deps,
        filePath: "../images/b.png",
        filename: "b.png",
        log: silentLog,
      });
      assert.equal(res.uuid, "u1");
    });
    it("matches by filename + parent folder name when path differs", function () {
      const u = new HerettoUploader();
      const deps = {
        "some/other/images/b.png": { uuid: "u2", parentFolderId: "p2" },
      };
      const res = u.resolveFromDependencies({
        resourceDependencies: deps,
        filePath: "images/b.png",
        filename: "b.png",
        log: silentLog,
      });
      assert.equal(res.uuid, "u2");
    });
    it("matches by filename only as a last resort", function () {
      const u = new HerettoUploader();
      const deps = {
        "unrelated/folder/b.png": { uuid: "u3", parentFolderId: "p3" },
      };
      const res = u.resolveFromDependencies({
        resourceDependencies: deps,
        filePath: "totally/different/b.png",
        filename: "b.png",
        log: silentLog,
      });
      assert.equal(res.uuid, "u3");
    });
    it("returns null when nothing matches", function () {
      const u = new HerettoUploader();
      const deps = { "x/y.png": { uuid: "u4" } };
      const res = u.resolveFromDependencies({
        resourceDependencies: deps,
        filePath: "a/z.png",
        filename: "z.png",
        log: silentLog,
      });
      assert.equal(res, null);
    });
  });

  describe("findParentFolderFromDependencies", function () {
    it("returns default result when no dependencies map is provided", function () {
      const u = new HerettoUploader();
      const res = u.findParentFolderFromDependencies({ resourceDependencies: null, filePath: "a/b.png", log: silentLog });
      assert.deepEqual(res, { folderId: null, targetFolderName: null, ditamapParentFolderId: null });
    });
    it("finds folder id from a sibling file in the same folder", function () {
      const u = new HerettoUploader();
      const deps = {
        _ditamapParentFolderId: "dmp",
        "topics/images/sibling.png": { uuid: "s", parentFolderId: "folder-1" },
      };
      const res = u.findParentFolderFromDependencies({
        resourceDependencies: deps,
        filePath: "../../topics/images/target.png",
        log: silentLog,
      });
      assert.equal(res.folderId, "folder-1");
      assert.equal(res.targetFolderName, "images");
      assert.equal(res.ditamapParentFolderId, "dmp");
    });
    it("finds folder id from a folder-path dependency (uuid)", function () {
      const u = new HerettoUploader();
      const deps = {
        "topics/images": { uuid: "folder-uuid" },
      };
      const res = u.findParentFolderFromDependencies({
        resourceDependencies: deps,
        filePath: "topics/images/target.png",
        log: silentLog,
      });
      assert.equal(res.folderId, "folder-uuid");
    });
    it("returns null folderId with targetFolderName when not found", function () {
      const u = new HerettoUploader();
      const deps = { "unrelated/a.png": { uuid: "x", parentFolderId: "y" } };
      const res = u.findParentFolderFromDependencies({
        resourceDependencies: deps,
        filePath: "images/target.png",
        log: silentLog,
      });
      assert.equal(res.folderId, null);
      assert.equal(res.targetFolderName, "images");
      assert.equal(res.ditamapParentFolderId, null);
    });
  });

  // ─── getChildFolderByName ───────────────────────────────────────────────────
  describe("getChildFolderByName", function () {
    it("resolves the folder id from XML on 200", async function () {
      const state = installHttpStub();
      state.queue.push({ response: { statusCode: 200, body: '<folders><folder name="images" id="abc-123"/></folders>' } });
      const u = new HerettoUploader();
      const id = await u.getChildFolderByName({ apiBaseUrl, apiToken, username, parentFolderId: "pf", folderName: "images", log: silentLog });
      assert.equal(id, "abc-123");
      // Verify the RIGHT request was sent (method/path/auth), not just that a
      // response was handled — catches auth-header or URL-path regressions.
      assert.equal(state.calls[0].method, "GET");
      assert.equal(state.calls[0].path, "/rest/all-files/pf");
      assert.match(state.calls[0].headers.Authorization, /^Basic /);
    });
    it("resolves null when folder not present in body", async function () {
      const state = installHttpStub();
      state.queue.push({ response: { statusCode: 200, body: "<folders></folders>" } });
      const u = new HerettoUploader();
      const id = await u.getChildFolderByName({ apiBaseUrl, apiToken, username, parentFolderId: "pf", folderName: "images", log: silentLog });
      assert.equal(id, null);
    });
    it("resolves null on non-200 status", async function () {
      const state = installHttpStub();
      state.queue.push({ response: { statusCode: 500, body: "err" } });
      const u = new HerettoUploader();
      const id = await u.getChildFolderByName({ apiBaseUrl, apiToken, username, parentFolderId: "pf", folderName: "images", log: silentLog });
      assert.equal(id, null);
    });
    it("resolves null on request error", async function () {
      const state = installHttpStub();
      state.queue.push({ error: new Error("boom") });
      const u = new HerettoUploader();
      const id = await u.getChildFolderByName({ apiBaseUrl, apiToken, username, parentFolderId: "pf", folderName: "images", log: silentLog });
      assert.equal(id, null);
    });
    it("resolves null on timeout", async function () {
      const state = installHttpStub();
      state.queue.push({ timeout: true });
      const u = new HerettoUploader();
      const id = await u.getChildFolderByName({ apiBaseUrl, apiToken, username, parentFolderId: "pf", folderName: "images", log: silentLog });
      assert.equal(id, null);
    });
    it("escapes regex special chars in the folder name", async function () {
      const state = installHttpStub();
      // The decoy "aXbc" would match an UNESCAPED /a.b+c/ pattern (`.`→X, `b+`→b)
      // and appears first, so returning "special-1" proves the folder name was
      // escaped before being built into the lookup regex.
      state.queue.push({ response: { statusCode: 200, body: '<folders><folder name="aXbc" id="decoy"/><folder name="a.b+c" id="special-1"/></folders>' } });
      const u = new HerettoUploader();
      const id = await u.getChildFolderByName({ apiBaseUrl, apiToken, username, parentFolderId: "pf", folderName: "a.b+c", log: silentLog });
      assert.equal(id, "special-1");
    });
    it("returns null when id precedes name (attribute-order limitation)", async function () {
      const state = installHttpStub();
      // The source regex matches `name="..." id="..."` only in that order.
      // Documents that id-before-name yields null (getFileInFolder handles both).
      state.queue.push({ response: { statusCode: 200, body: '<folder id="abc-123" name="images"/>' } });
      const u = new HerettoUploader();
      const id = await u.getChildFolderByName({ apiBaseUrl, apiToken, username, parentFolderId: "pf", folderName: "images", log: silentLog });
      assert.equal(id, null);
    });
    it("uses http for an http base URL", async function () {
      const state = installHttpStub();
      state.queue.push({ response: { statusCode: 200, body: '<folder name="images" id="http-1"/>' } });
      const u = new HerettoUploader();
      const id = await u.getChildFolderByName({ apiBaseUrl: "http://acme.heretto.com", apiToken, username, parentFolderId: "pf", folderName: "images", log: silentLog });
      assert.equal(id, "http-1");
      assert.equal(http.request.callCount, 1);
      assert.equal(https.request.callCount, 0);
    });
  });

  // ─── createDocument ─────────────────────────────────────────────────────────
  describe("createDocument", function () {
    it("resolves created=true and documentId on 200", async function () {
      const state = installHttpStub();
      state.queue.push({ response: { statusCode: 200, body: '<resource id="new-doc-1">ok</resource>' } });
      const u = new HerettoUploader();
      const res = await u.createDocument({ apiBaseUrl, apiToken, username, parentFolderId: "pf", filename: "b.png", mimeType: "image/png", log: silentLog });
      assert.deepEqual(res, { created: true, documentId: "new-doc-1" });
    });
    it("resolves created=true on 201", async function () {
      const state = installHttpStub();
      state.queue.push({ response: { statusCode: 201, body: '<resource id="new-doc-2"/>' } });
      const u = new HerettoUploader();
      const res = await u.createDocument({ apiBaseUrl, apiToken, username, parentFolderId: "pf", filename: "b.png", mimeType: "image/png", log: silentLog });
      assert.equal(res.documentId, "new-doc-2");
    });
    it("rejects when the ID cannot be parsed from a success body", async function () {
      const state = installHttpStub();
      state.queue.push({ response: { statusCode: 200, body: "<resource>no id here</resource>" } });
      const u = new HerettoUploader();
      await assert.rejects(
        u.createDocument({ apiBaseUrl, apiToken, username, parentFolderId: "pf", filename: "b.png", mimeType: "image/png", log: silentLog }),
        /Could not parse document ID/
      );
    });
    it("resolves existsInFolder on 400 with 'already exists'", async function () {
      const state = installHttpStub();
      state.queue.push({ response: { statusCode: 400, body: "resource already exists" } });
      const u = new HerettoUploader();
      const res = await u.createDocument({ apiBaseUrl, apiToken, username, parentFolderId: "pf", filename: "b.png", mimeType: "image/png", log: silentLog });
      assert.deepEqual(res, { created: false, existsInFolder: true, parentFolderId: "pf" });
    });
    it("rejects on other non-success status", async function () {
      const state = installHttpStub();
      state.queue.push({ response: { statusCode: 403, body: "forbidden" } });
      const u = new HerettoUploader();
      await assert.rejects(
        u.createDocument({ apiBaseUrl, apiToken, username, parentFolderId: "pf", filename: "b.png", mimeType: "image/png", log: silentLog }),
        /status 403/
      );
    });
    it("rejects on request error", async function () {
      const state = installHttpStub();
      state.queue.push({ error: new Error("neterr") });
      const u = new HerettoUploader();
      await assert.rejects(
        u.createDocument({ apiBaseUrl, apiToken, username, parentFolderId: "pf", filename: "b.png", mimeType: "image/png", log: silentLog }),
        /Create document request error: neterr/
      );
    });
    it("rejects on timeout", async function () {
      const state = installHttpStub();
      state.queue.push({ timeout: true });
      const u = new HerettoUploader();
      await assert.rejects(
        u.createDocument({ apiBaseUrl, apiToken, username, parentFolderId: "pf", filename: "b.png", mimeType: "image/png", log: silentLog }),
        /Request timeout/
      );
    });
  });

  // ─── getFileInFolder ────────────────────────────────────────────────────────
  describe("getFileInFolder", function () {
    it("finds a file id (id-before-name ordering)", async function () {
      const state = installHttpStub();
      state.queue.push({ response: { statusCode: 200, body: '<resource id="file-1" name="b.png"/>' } });
      const u = new HerettoUploader();
      const id = await u.getFileInFolder({ apiBaseUrl, apiToken, username, folderId: "f", filename: "b.png", log: silentLog });
      assert.equal(id, "file-1");
    });
    it("finds a file id (name-before-id ordering)", async function () {
      const state = installHttpStub();
      state.queue.push({ response: { statusCode: 200, body: '<resource name="b.png" id="file-2"/>' } });
      const u = new HerettoUploader();
      const id = await u.getFileInFolder({ apiBaseUrl, apiToken, username, folderId: "f", filename: "b.png", log: silentLog });
      assert.equal(id, "file-2");
    });
    it("resolves null when file not present", async function () {
      const state = installHttpStub();
      state.queue.push({ response: { statusCode: 200, body: '<resource id="x" name="other.png"/>' } });
      const u = new HerettoUploader();
      const id = await u.getFileInFolder({ apiBaseUrl, apiToken, username, folderId: "f", filename: "b.png", log: silentLog });
      assert.equal(id, null);
    });
    it("resolves null on non-200", async function () {
      const state = installHttpStub();
      state.queue.push({ response: { statusCode: 404, body: "nope" } });
      const u = new HerettoUploader();
      const id = await u.getFileInFolder({ apiBaseUrl, apiToken, username, folderId: "f", filename: "b.png", log: silentLog });
      assert.equal(id, null);
    });
    it("resolves null on request error", async function () {
      const state = installHttpStub();
      state.queue.push({ error: new Error("boom") });
      const u = new HerettoUploader();
      const id = await u.getFileInFolder({ apiBaseUrl, apiToken, username, folderId: "f", filename: "b.png", log: silentLog });
      assert.equal(id, null);
    });
    it("resolves null on timeout", async function () {
      const state = installHttpStub();
      state.queue.push({ timeout: true });
      const u = new HerettoUploader();
      const id = await u.getFileInFolder({ apiBaseUrl, apiToken, username, folderId: "f", filename: "b.png", log: silentLog });
      assert.equal(id, null);
    });
  });

  // ─── searchFolderByName ─────────────────────────────────────────────────────
  describe("searchFolderByName", function () {
    it("returns exact-match uuid", async function () {
      const state = installHttpStub();
      state.queue.push({ response: { statusCode: 200, body: JSON.stringify({ searchResults: [{ name: "images", uuid: "F1" }] }) } });
      const u = new HerettoUploader();
      const id = await u.searchFolderByName({ apiBaseUrl, apiToken, username, folderName: "images", log: silentLog });
      assert.equal(id, "F1");
    });
    it("falls back to first result when no exact match (id field)", async function () {
      const state = installHttpStub();
      state.queue.push({ response: { statusCode: 200, body: JSON.stringify({ searchResults: [{ name: "other", id: "F2" }] }) } });
      const u = new HerettoUploader();
      const id = await u.searchFolderByName({ apiBaseUrl, apiToken, username, folderName: "images", log: silentLog });
      assert.equal(id, "F2");
    });
    it("returns null when searchResults is empty", async function () {
      const state = installHttpStub();
      state.queue.push({ response: { statusCode: 200, body: JSON.stringify({ searchResults: [] }) } });
      const u = new HerettoUploader();
      const id = await u.searchFolderByName({ apiBaseUrl, apiToken, username, folderName: "images", log: silentLog });
      assert.equal(id, null);
    });
    it("returns null on empty response body", async function () {
      const state = installHttpStub();
      state.queue.push({ response: { statusCode: 200, body: "" } });
      const u = new HerettoUploader();
      const id = await u.searchFolderByName({ apiBaseUrl, apiToken, username, folderName: "images", log: silentLog });
      assert.equal(id, null);
    });
    it("rejects on malformed JSON", async function () {
      const state = installHttpStub();
      state.queue.push({ response: { statusCode: 200, body: "{not json" } });
      const u = new HerettoUploader();
      await assert.rejects(
        u.searchFolderByName({ apiBaseUrl, apiToken, username, folderName: "images", log: silentLog }),
        /Failed to parse folder search response/
      );
    });
    it("rejects on non-2xx status", async function () {
      const state = installHttpStub();
      state.queue.push({ response: { statusCode: 500, body: "err" } });
      const u = new HerettoUploader();
      await assert.rejects(
        u.searchFolderByName({ apiBaseUrl, apiToken, username, folderName: "images", log: silentLog }),
        /Folder search request failed with status 500/
      );
    });
    it("rejects on request error", async function () {
      const state = installHttpStub();
      state.queue.push({ error: new Error("neterr") });
      const u = new HerettoUploader();
      await assert.rejects(
        u.searchFolderByName({ apiBaseUrl, apiToken, username, folderName: "images", log: silentLog }),
        /Folder search request error: neterr/
      );
    });
    it("rejects on timeout", async function () {
      const state = installHttpStub();
      state.queue.push({ timeout: true });
      const u = new HerettoUploader();
      await assert.rejects(
        u.searchFolderByName({ apiBaseUrl, apiToken, username, folderName: "images", log: silentLog }),
        /Request timeout/
      );
    });
  });

  // ─── searchFileByName ───────────────────────────────────────────────────────
  describe("searchFileByName", function () {
    it("returns exact-match uuid", async function () {
      const state = installHttpStub();
      state.queue.push({ response: { statusCode: 200, body: JSON.stringify({ searchResults: [{ name: "b.png", uuid: "D1" }] }) } });
      const u = new HerettoUploader();
      const id = await u.searchFileByName({ apiBaseUrl, apiToken, username, filename: "b.png", log: silentLog });
      assert.equal(id, "D1");
    });
    it("falls back to first result when no exact match (id field)", async function () {
      const state = installHttpStub();
      state.queue.push({ response: { statusCode: 200, body: JSON.stringify({ searchResults: [{ title: "other", id: "D2" }] }) } });
      const u = new HerettoUploader();
      const id = await u.searchFileByName({ apiBaseUrl, apiToken, username, filename: "b.png", log: silentLog });
      assert.equal(id, "D2");
    });
    it("returns null when searchResults is empty", async function () {
      const state = installHttpStub();
      state.queue.push({ response: { statusCode: 200, body: JSON.stringify({ searchResults: [] }) } });
      const u = new HerettoUploader();
      const id = await u.searchFileByName({ apiBaseUrl, apiToken, username, filename: "b.png", log: silentLog });
      assert.equal(id, null);
    });
    it("returns null on empty response body", async function () {
      const state = installHttpStub();
      state.queue.push({ response: { statusCode: 204, body: "" } });
      const u = new HerettoUploader();
      const id = await u.searchFileByName({ apiBaseUrl, apiToken, username, filename: "b.png", log: silentLog });
      assert.equal(id, null);
    });
    it("rejects on malformed JSON", async function () {
      const state = installHttpStub();
      state.queue.push({ response: { statusCode: 200, body: "{bad" } });
      const u = new HerettoUploader();
      await assert.rejects(
        u.searchFileByName({ apiBaseUrl, apiToken, username, filename: "b.png", log: silentLog }),
        /Failed to parse search response/
      );
    });
    it("rejects on non-2xx status", async function () {
      const state = installHttpStub();
      state.queue.push({ response: { statusCode: 502, body: "bad gw" } });
      const u = new HerettoUploader();
      await assert.rejects(
        u.searchFileByName({ apiBaseUrl, apiToken, username, filename: "b.png", log: silentLog }),
        /Search request failed with status 502/
      );
    });
    it("rejects on request error", async function () {
      const state = installHttpStub();
      state.queue.push({ error: new Error("neterr") });
      const u = new HerettoUploader();
      await assert.rejects(
        u.searchFileByName({ apiBaseUrl, apiToken, username, filename: "b.png", log: silentLog }),
        /Search request error: neterr/
      );
    });
    it("rejects on timeout", async function () {
      const state = installHttpStub();
      state.queue.push({ timeout: true });
      const u = new HerettoUploader();
      await assert.rejects(
        u.searchFileByName({ apiBaseUrl, apiToken, username, filename: "b.png", log: silentLog }),
        /Request timeout/
      );
    });
  });

  // ─── uploadFile ─────────────────────────────────────────────────────────────
  describe("uploadFile", function () {
    it("resolves on 2xx", async function () {
      const state = installHttpStub();
      state.queue.push({ response: { statusCode: 200, body: "ok" } });
      const u = new HerettoUploader();
      await u.uploadFile({ apiBaseUrl, apiToken, username, documentId: "d", content: Buffer.from("data"), contentType: "image/png", log: silentLog });
    });
    it("rejects on non-2xx", async function () {
      const state = installHttpStub();
      state.queue.push({ response: { statusCode: 500, body: "server error" } });
      const u = new HerettoUploader();
      await assert.rejects(
        u.uploadFile({ apiBaseUrl, apiToken, username, documentId: "d", content: Buffer.from("data"), contentType: "image/png", log: silentLog }),
        /Upload failed with status 500/
      );
    });
    it("rejects on request error", async function () {
      const state = installHttpStub();
      state.queue.push({ error: new Error("neterr") });
      const u = new HerettoUploader();
      await assert.rejects(
        u.uploadFile({ apiBaseUrl, apiToken, username, documentId: "d", content: Buffer.from("data"), contentType: "image/png", log: silentLog }),
        /Upload request error: neterr/
      );
    });
    it("rejects on timeout", async function () {
      const state = installHttpStub();
      state.queue.push({ timeout: true });
      const u = new HerettoUploader();
      await assert.rejects(
        u.uploadFile({ apiBaseUrl, apiToken, username, documentId: "d", content: Buffer.from("data"), contentType: "image/png", log: silentLog }),
        /Request timeout/
      );
    });
  });

  // ─── getDocumentInfo ────────────────────────────────────────────────────────
  describe("getDocumentInfo", function () {
    it("parses attributes and child elements on 200", async function () {
      const state = installHttpStub();
      const body = '<resource id="doc-1" folder-uuid="fu-1"><name>b.png</name><mime-type>image/png</mime-type><xmldb-uri>/db/x/b.png</xmldb-uri></resource>';
      state.queue.push({ response: { statusCode: 200, body } });
      const u = new HerettoUploader();
      const info = await u.getDocumentInfo({ apiBaseUrl, apiToken, username, documentId: "doc-1", log: silentLog });
      assert.equal(info.id, "doc-1");
      assert.equal(info.folderUuid, "fu-1");
      assert.equal(info.name, "b.png");
      assert.equal(info.mimeType, "image/png");
      assert.equal(info.uri, "/db/x/b.png");
      assert.equal(info.rawXml, body);
    });
    it("returns null fields when the resource tag/children are absent", async function () {
      const state = installHttpStub();
      state.queue.push({ response: { statusCode: 200, body: "<other>nothing</other>" } });
      const u = new HerettoUploader();
      const info = await u.getDocumentInfo({ apiBaseUrl, apiToken, username, documentId: "doc-1", log: silentLog });
      assert.equal(info.id, null);
      assert.equal(info.folderUuid, null);
      assert.equal(info.name, null);
      assert.equal(info.mimeType, null);
      assert.equal(info.uri, null);
    });
    it("rejects on non-200", async function () {
      const state = installHttpStub();
      state.queue.push({ response: { statusCode: 404, body: "missing" } });
      const u = new HerettoUploader();
      await assert.rejects(
        u.getDocumentInfo({ apiBaseUrl, apiToken, username, documentId: "doc-1", log: silentLog }),
        /Get document info failed with status 404/
      );
    });
    it("rejects on request error", async function () {
      const state = installHttpStub();
      state.queue.push({ error: new Error("neterr") });
      const u = new HerettoUploader();
      await assert.rejects(
        u.getDocumentInfo({ apiBaseUrl, apiToken, username, documentId: "doc-1", log: silentLog }),
        /Get document info request error: neterr/
      );
    });
    it("rejects on timeout", async function () {
      const state = installHttpStub();
      state.queue.push({ timeout: true });
      const u = new HerettoUploader();
      await assert.rejects(
        u.getDocumentInfo({ apiBaseUrl, apiToken, username, documentId: "doc-1", log: silentLog }),
        /Request timeout/
      );
    });
  });

  // ─── getDocumentContent ─────────────────────────────────────────────────────
  describe("getDocumentContent", function () {
    it("resolves a Buffer of the concatenated chunks on 200", async function () {
      const state = installHttpStub();
      state.queue.push({ response: { statusCode: 200, body: ["hello ", "world"] } });
      const u = new HerettoUploader();
      const buf = await u.getDocumentContent({ apiBaseUrl, apiToken, username, documentId: "doc-1", log: silentLog });
      assert.ok(Buffer.isBuffer(buf));
      assert.equal(buf.toString(), "hello world");
    });
    it("rejects on non-200", async function () {
      const state = installHttpStub();
      state.queue.push({ response: { statusCode: 500, body: "x" } });
      const u = new HerettoUploader();
      await assert.rejects(
        u.getDocumentContent({ apiBaseUrl, apiToken, username, documentId: "doc-1", log: silentLog }),
        /Get document content failed with status 500/
      );
    });
    it("rejects on request error", async function () {
      const state = installHttpStub();
      state.queue.push({ error: new Error("neterr") });
      const u = new HerettoUploader();
      await assert.rejects(
        u.getDocumentContent({ apiBaseUrl, apiToken, username, documentId: "doc-1", log: silentLog }),
        /Get document content request error: neterr/
      );
    });
    it("rejects on timeout", async function () {
      const state = installHttpStub();
      state.queue.push({ timeout: true });
      const u = new HerettoUploader();
      await assert.rejects(
        u.getDocumentContent({ apiBaseUrl, apiToken, username, documentId: "doc-1", log: silentLog }),
        /Request timeout/
      );
    });
  });

  // ─── upload orchestrator ────────────────────────────────────────────────────
  describe("upload", function () {
    let tmpFile;
    let tmpDir;

    before(function () {
      // mkdtempSync avoids cross-process collisions in parallel/worker runs.
      tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "heretto-cov-"));
      tmpFile = path.join(tmpDir, "b.png");
      fs.writeFileSync(tmpFile, Buffer.from("PNGDATA"));
    });
    after(function () {
      try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch { /* ignore */ }
    });

    function baseArgs(overrides = {}) {
      return {
        config: {},
        integrationConfig: { organizationId: "acme", apiToken: "tok", username: "u", ...overrides.integrationConfig },
        localFilePath: tmpFile,
        sourceIntegration: { filePath: "images/b.png", ...overrides.sourceIntegration },
        log: silentLog,
        ...overrides,
      };
    }

    it("fails when no integration config is provided", async function () {
      const u = new HerettoUploader();
      const res = await u.upload({ config: {}, integrationConfig: null, localFilePath: tmpFile, sourceIntegration: {}, log: silentLog });
      assert.equal(res.status, "FAIL");
      assert.match(res.description, /No Heretto integration configuration/);
    });

    it("fails when organizationId/apiToken are missing", async function () {
      const u = new HerettoUploader();
      const res = await u.upload({ config: {}, integrationConfig: { organizationId: "acme" }, localFilePath: tmpFile, sourceIntegration: { filePath: "a.png" }, log: silentLog });
      assert.equal(res.status, "FAIL");
      assert.match(res.description, /missing organizationId or apiToken/);
    });

    it("uses a pre-resolved fileId and uploads successfully", async function () {
      const state = installHttpStub();
      // Only the uploadFile PUT is expected.
      state.queue.push({ response: { statusCode: 200, body: "ok" } });
      const u = new HerettoUploader();
      const res = await u.upload(baseArgs({ sourceIntegration: { filePath: "images/b.png", fileId: "known-id" } }));
      assert.equal(res.status, "PASS");
      assert.match(res.description, /document ID: known-id/);
    });

    it("resolves fileId from resourceDependencies then uploads", async function () {
      const state = installHttpStub();
      state.queue.push({ response: { statusCode: 200, body: "ok" } }); // uploadFile
      const u = new HerettoUploader();
      const res = await u.upload(baseArgs({
        integrationConfig: {
          organizationId: "acme", apiToken: "tok", username: "u",
          resourceDependencies: { "images/b.png": { uuid: "dep-id", parentFolderId: "pf" } },
        },
      }));
      assert.equal(res.status, "PASS");
      assert.match(res.description, /document ID: dep-id/);
    });

    it("finds parent folder from deps, finds existing file, then uploads", async function () {
      const state = installHttpStub();
      // 1) getFileInFolder → found; 2) uploadFile
      state.queue.push({ response: { statusCode: 200, body: '<resource id="existing-file" name="b.png"/>' } });
      state.queue.push({ response: { statusCode: 200, body: "ok" } });
      const u = new HerettoUploader();
      const res = await u.upload(baseArgs({
        integrationConfig: {
          organizationId: "acme", apiToken: "tok", username: "u",
          resourceDependencies: { "images/sibling.png": { uuid: "s", parentFolderId: "folder-1" } },
        },
      }));
      assert.equal(res.status, "PASS");
      assert.match(res.description, /existing-file/);
    });

    it("creates a new document when not found in the target folder", async function () {
      const state = installHttpStub();
      // 1) getFileInFolder → null; 2) createDocument → created; 3) uploadFile
      state.queue.push({ response: { statusCode: 200, body: "<resources></resources>" } });
      state.queue.push({ response: { statusCode: 201, body: '<resource id="created-file"/>' } });
      state.queue.push({ response: { statusCode: 200, body: "ok" } });
      const u = new HerettoUploader();
      const res = await u.upload(baseArgs({
        integrationConfig: {
          organizationId: "acme", apiToken: "tok", username: "u",
          resourceDependencies: { "images/sibling.png": { uuid: "s", parentFolderId: "folder-1" } },
        },
      }));
      assert.equal(res.status, "PASS");
      assert.match(res.description, /created-file/);
    });

    it("handles the createDocument existsInFolder race by re-searching the folder", async function () {
      const state = installHttpStub();
      // 1) getFileInFolder → null; 2) createDocument → 400 already exists; 3) getFileInFolder → found; 4) uploadFile
      state.queue.push({ response: { statusCode: 200, body: "<resources></resources>" } });
      state.queue.push({ response: { statusCode: 400, body: "already exists" } });
      state.queue.push({ response: { statusCode: 200, body: '<resource id="race-file" name="b.png"/>' } });
      state.queue.push({ response: { statusCode: 200, body: "ok" } });
      const u = new HerettoUploader();
      const res = await u.upload(baseArgs({
        integrationConfig: {
          organizationId: "acme", apiToken: "tok", username: "u",
          resourceDependencies: { "images/sibling.png": { uuid: "s", parentFolderId: "folder-1" } },
        },
      }));
      assert.equal(res.status, "PASS");
      assert.match(res.description, /race-file/);
    });

    it("fails when the existsInFolder race re-search returns no id", async function () {
      const state = installHttpStub();
      state.queue.push({ response: { statusCode: 200, body: "<resources></resources>" } }); // getFileInFolder → null
      state.queue.push({ response: { statusCode: 400, body: "already exists" } }); // createDocument
      state.queue.push({ response: { statusCode: 200, body: "<resources></resources>" } }); // re-search → null
      const u = new HerettoUploader();
      const res = await u.upload(baseArgs({
        integrationConfig: {
          organizationId: "acme", apiToken: "tok", username: "u",
          resourceDependencies: { "images/sibling.png": { uuid: "s", parentFolderId: "folder-1" } },
        },
      }));
      assert.equal(res.status, "FAIL");
      assert.match(res.description, /could not get its ID/);
    });

    it("fails when createDocument neither creates nor reports existsInFolder", async function () {
      const state = installHttpStub();
      state.queue.push({ response: { statusCode: 200, body: "<resources></resources>" } }); // getFileInFolder → null
      state.queue.push({ response: { statusCode: 403, body: "forbidden" } }); // createDocument → reject
      const u = new HerettoUploader();
      const res = await u.upload(baseArgs({
        integrationConfig: {
          organizationId: "acme", apiToken: "tok", username: "u",
          resourceDependencies: { "images/sibling.png": { uuid: "s", parentFolderId: "folder-1" } },
        },
      }));
      // createDocument rejects → caught by the try/catch → "Error searching/creating file"
      assert.equal(res.status, "FAIL");
      assert.match(res.description, /Error searching\/creating file/);
    });

    it("uses the ditamap fallback: getChildFolderByName resolves the target folder", async function () {
      const state = installHttpStub();
      // deps have _ditamapParentFolderId + targetFolderName but no folderId match →
      // 1) getChildFolderByName → folder id; 2) getFileInFolder → found; 3) uploadFile
      state.queue.push({ response: { statusCode: 200, body: '<folder name="images" id="child-folder"/>' } });
      state.queue.push({ response: { statusCode: 200, body: '<resource id="ditamap-file" name="b.png"/>' } });
      state.queue.push({ response: { statusCode: 200, body: "ok" } });
      const u = new HerettoUploader();
      const res = await u.upload(baseArgs({
        integrationConfig: {
          organizationId: "acme", apiToken: "tok", username: "u",
          resourceDependencies: { _ditamapParentFolderId: "dmp", "other/x.png": { uuid: "o", parentFolderId: "op" } },
        },
      }));
      assert.equal(res.status, "PASS");
      assert.match(res.description, /ditamap-file/);
    });

    it("falls back to searchFolderByName when no deps folder is found", async function () {
      const state = installHttpStub();
      // no resourceDependencies → searchFolderByName → folder; getFileInFolder → found; uploadFile
      state.queue.push({ response: { statusCode: 200, body: JSON.stringify({ searchResults: [{ name: "images", uuid: "searched-folder" }] }) } });
      state.queue.push({ response: { statusCode: 200, body: '<resource id="searched-file" name="b.png"/>' } });
      state.queue.push({ response: { statusCode: 200, body: "ok" } });
      const u = new HerettoUploader();
      const res = await u.upload(baseArgs());
      assert.equal(res.status, "PASS");
      assert.match(res.description, /searched-file/);
    });

    it("searches globally when no parent folder can be determined", async function () {
      const state = installHttpStub();
      // filePath at root (no parent dir) → skip folder search → searchFileByName → found; uploadFile
      state.queue.push({ response: { statusCode: 200, body: JSON.stringify({ searchResults: [{ name: "root.png", uuid: "global-file" }] }) } });
      state.queue.push({ response: { statusCode: 200, body: "ok" } });
      const u = new HerettoUploader();
      const res = await u.upload(baseArgs({ sourceIntegration: { filePath: "root.png" } }));
      assert.equal(res.status, "PASS");
      assert.match(res.description, /global-file/);
    });

    it("fails when the global search finds nothing", async function () {
      const state = installHttpStub();
      state.queue.push({ response: { statusCode: 200, body: JSON.stringify({ searchResults: [] }) } });
      const u = new HerettoUploader();
      const res = await u.upload(baseArgs({ sourceIntegration: { filePath: "root.png" } }));
      assert.equal(res.status, "FAIL");
      assert.match(res.description, /Could not find file or parent folder/);
    });

    it("fails when the local file does not exist", async function () {
      const u = new HerettoUploader();
      const res = await u.upload({
        config: {},
        integrationConfig: { organizationId: "acme", apiToken: "tok", username: "u" },
        localFilePath: path.join(os.tmpdir(), "does-not-exist-xyz.png"),
        sourceIntegration: { filePath: "images/b.png", fileId: "known-id" },
        log: silentLog,
      });
      assert.equal(res.status, "FAIL");
      assert.match(res.description, /Local file not found/);
    });

    it("reports upload failure when the PUT rejects", async function () {
      const state = installHttpStub();
      state.queue.push({ response: { statusCode: 500, body: "boom" } }); // uploadFile → reject
      const u = new HerettoUploader();
      const res = await u.upload(baseArgs({ sourceIntegration: { filePath: "images/b.png", fileId: "known-id" } }));
      assert.equal(res.status, "FAIL");
      assert.match(res.description, /Upload failed:/);
    });

    it("catches errors thrown during search (searchFolderByName rejects)", async function () {
      const state = installHttpStub();
      // no deps → searchFolderByName rejects
      state.queue.push({ response: { statusCode: 500, body: "err" } });
      const u = new HerettoUploader();
      const res = await u.upload(baseArgs());
      assert.equal(res.status, "FAIL");
      assert.match(res.description, /Error searching\/creating file/);
    });

    it("uses a provided parentFolderId directly (skips folder resolution)", async function () {
      const state = installHttpStub();
      // getFileInFolder → found; uploadFile
      state.queue.push({ response: { statusCode: 200, body: '<resource id="direct-file" name="b.png"/>' } });
      state.queue.push({ response: { statusCode: 200, body: "ok" } });
      const u = new HerettoUploader();
      const res = await u.upload(baseArgs({ sourceIntegration: { filePath: "images/b.png", parentFolderId: "given-folder" } }));
      assert.equal(res.status, "PASS");
      assert.match(res.description, /direct-file/);
    });
  });
});
