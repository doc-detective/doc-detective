import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { mockRequest, restoreMocks } from "../dist/core/tests/mockRequest.js";
import { resolvePaths } from "../dist/core/files.js";
import { hasBidi } from "../dist/core/tests.js";
import { harToMocks } from "../dist/core/utils.js";

// ADR 01225: hermetic coverage for the mockRequest action. The driver is a fake
// with webdriverio's `mock()` shape; no browser, no BiDi socket.

const config = { logLevel: "silent" };

function fakeMock() {
  const handlers = {};
  const mock = {
    responds: [],
    restored: false,
    respond(body, params) {
      mock.responds.push({ body, params });
      return mock;
    },
    on(event, handler) {
      handlers[event] = handler;
      return mock;
    },
    async restore() {
      mock.restored = true;
      return mock;
    },
    // Simulate the browser answering one request. Like webdriverio, read the
    // latest respond() call: body first, then headers, then status.
    answer() {
      const last = mock.responds.at(-1);
      const call = (v) => (typeof v === "function" ? v({}) : v);
      const answered = last && {
        body: call(last.body),
        headers: call(last.params.headers),
        statusCode: call(last.params.statusCode),
      };
      handlers.overwrite?.({});
      return answered;
    },
  };
  return mock;
}

function fakeDriver() {
  const driver = { isBidi: true, state: {}, mocks: [], mockCalls: [] };
  driver.mock = async (url, filter) => {
    driver.mockCalls.push({ url, filter });
    const mock = fakeMock();
    driver.mocks.push(mock);
    return mock;
  };
  // webdriverio's command overrides and the two BiDi release commands.
  driver.overrides = {};
  driver.overwriteCommand = (name, fn) => {
    driver.overrides[name] = fn;
  };
  driver.sent = [];
  driver.networkContinueResponse = async (params) => driver.sent.push(["continueResponse", params]);
  return driver;
}

// `browserName` defaults to chrome only when the key is absent, so a test can pass undefined.
const run = (mockRequestValue, { driver = fakeDriver(), ...opts } = {}) =>
  mockRequest({
    config,
    step: { mockRequest: mockRequestValue },
    driver,
    browserName: "browserName" in opts ? opts.browserName : "chrome",
    hasBidi,
  }).then(
    (result) => ({ result, driver })
  );

describe("mockRequest action", function () {
  let dir;
  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), "dd-mock-"));
  });
  afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

  it("names `this browser` when it skips with no browser name", async function () {
    const { result } = await run({ url: "**/x" }, { browserName: undefined });
    assert.equal(result.status, "SKIPPED");
    assert.equal(result.description, "Skipped: `this browser` can't mock requests.");
  });

  it("reports the missing BiDi socket before it reads a bodyPath", async function () {
    const driver = fakeDriver();
    driver.isBidi = false;
    const { result } = await run({ url: "**/x", response: { bodyPath: path.join(dir, "nope.json") } }, { driver });
    assert.equal(result.status, "FAIL");
    assert.equal(
      result.description,
      "Couldn't mock requests to `**/x` in `chrome`."
    );
  });

  it("skips a browser whose sessions have no BiDi socket", async function () {
    const { result, driver } = await run({ url: "**/x" }, { browserName: "firefox" });
    assert.equal(result.status, "SKIPPED");
    assert.equal(result.description, "Skipped: `firefox` can't mock requests.");
    assert.equal(driver.mockCalls.length, 0);
  });

  it("names Safari, not its webkit runtime name, when it skips", async function () {
    const { result } = await run({ url: "**/x" }, { browserName: "webkit" });
    assert.equal(result.status, "SKIPPED");
    assert.equal(result.description, "Skipped: `safari` can't mock requests.");
  });

  it("answers with a JSON body and a 200 status by default", async function () {
    const { result, driver } = await run({ url: "**/api/invoices*", response: { body: { next: "2026-12-03" } } });
    assert.equal(result.status, "PASS", result.description);
    assert.deepEqual(driver.mockCalls, [{ url: "**/api/invoices*", filter: {} }]);
    const [{ body, params }] = driver.mocks[0].responds;
    assert.deepEqual(body, { next: "2026-12-03" });
    assert.equal(params.statusCode, 200);
    assert.equal(params.fetchResponse, false);
    assert.equal("headers" in params, false);
    assert.equal(result.outputs.matched, 0);
  });

  it("filters on the method and sends the status code and headers", async function () {
    const { driver } = await run({
      url: "https://api.example.com/user",
      method: "POST",
      response: { statusCode: 201, headers: { "x-a": "1" }, body: "made" },
    });
    assert.deepEqual(driver.mockCalls[0].filter, { method: "POST" });
    const [{ body, params }] = driver.mocks[0].responds;
    assert.equal(body, "made");
    assert.equal(params.statusCode, 201);
    assert.deepEqual(params.headers, { "x-a": "1" });
  });

  it("sends a bodyPath file's bytes", async function () {
    const file = path.join(dir, "user.json");
    fs.writeFileSync(file, '{"name":"Ada"}');
    const { result, driver } = await run({ url: "**/user", response: { bodyPath: file } });
    assert.equal(result.status, "PASS", result.description);
    const [{ body }] = driver.mocks[0].responds;
    // Bytes, which webdriverio sends as base64, so a binary file survives.
    assert.ok(Buffer.isBuffer(body));
    assert.equal(body.toString(), '{"name":"Ada"}');
  });

  it("fails on a missing bodyPath, naming its absolute path", async function () {
    const missing = path.join(dir, "nope.json");
    const { result, driver } = await run({ url: "**/user", response: { bodyPath: missing } });
    assert.equal(result.status, "FAIL");
    assert.equal(result.description, `Couldn't read \`bodyPath\` \`${missing}\`.`);
    assert.equal(driver.mockCalls.length, 0);
  });

  it("fails when the session has no BiDi socket", async function () {
    const driver = fakeDriver();
    driver.isBidi = false;
    const { result } = await run({ url: "**/x" }, { driver });
    assert.equal(result.status, "FAIL");
    assert.equal(result.description, "Couldn't mock requests to `**/x` in `chrome`.");
    assert.doesNotMatch(result.description, /bidi/i);
  });

  it("names the cause, not the driver's error, when the browser rejects the mock", async function () {
    const driver = fakeDriver();
    driver.mock = async () => {
      throw new Error("WebDriver Bidi command network.addIntercept failed");
    };
    const { result } = await run({ url: "**/x" }, { driver });
    assert.equal(result.status, "FAIL");
    assert.equal(
      result.description,
      "Couldn't mock requests to `**/x` in `chrome`. The browser refused the request intercept."
    );
    assert.doesNotMatch(result.description, /bidi|webdriver/i);
  });

  it("counts answered requests per url and method, across a replacement", async function () {
    const driver = fakeDriver();
    await run({ url: "**/x", response: { body: "a" } }, { driver });
    driver.mocks[0].answer();
    driver.mocks[0].answer();
    const { result } = await run({ url: "**/x", response: { body: "b" } }, { driver });
    assert.equal(result.outputs.matched, 2);
    driver.mocks[1].answer();
    // A different method is a different mock with its own count.
    const other = await run({ url: "**/x", method: "GET" }, { driver });
    assert.equal(other.result.outputs.matched, 0);
    const again = await run({ url: "**/x" }, { driver });
    assert.equal(again.result.outputs.matched, 3);
  });

  // webdriverio 10.2.0 releases a response no mock answers with a bare
  // network.provideResponse, which makes Chrome drop the response's headers.
  it("releases a pass-through response with continueResponse, keeping its headers", async function () {
    const driver = fakeDriver();
    await run({ url: "**/api/mocked", response: { body: "x" } }, { driver });
    const override = driver.overrides.networkProvideResponse;
    assert.equal(typeof override, "function");
    const orig = async (params) => driver.sent.push(["provideResponse", params]);
    await override(orig, { request: "r1" });
    await override(orig, { request: "r2", statusCode: 200, body: { type: "string", value: "x" } });
    assert.deepEqual(driver.sent, [
      ["continueResponse", { request: "r1" }],
      ["provideResponse", { request: "r2", statusCode: 200, body: { type: "string", value: "x" } }],
    ]);
  });

  it("installs the release override once per session", async function () {
    const driver = fakeDriver();
    let installs = 0;
    const overwrite = driver.overwriteCommand;
    driver.overwriteCommand = (...args) => {
      installs += 1;
      return overwrite(...args);
    };
    await run({ url: "**/a" }, { driver });
    await run({ url: "**/b" }, { driver });
    assert.equal(installs, 1);
  });

  it("restoreMocks restores every live mock and forgets them", async function () {
    const driver = fakeDriver();
    await run({ url: "**/a" }, { driver });
    await run({ url: "**/b" }, { driver });
    await restoreMocks(driver);
    assert.ok(driver.mocks.every((m) => m.restored));
    assert.equal(driver.state.mocks.size, 0);
    // No driver, or a driver that never mocked: a no-op.
    await restoreMocks(undefined);
    await restoreMocks({ state: {} });
  });
});

// ADR 01229: answer in sequence, and replay a HAR file.
describe("mockRequest responses sequence", function () {
  let dir;
  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), "dd-mock-seq-"));
  });
  afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

  it("answers in order and keeps answering with the last entry", async function () {
    const { result, driver } = await run({
      url: "**/jobs/1",
      responses: [
        { body: { status: "running" } },
        { statusCode: 202, headers: { "x-n": "2" }, body: "second" },
        { statusCode: 404 },
      ],
    });
    assert.equal(result.status, "PASS", result.description);
    assert.equal(driver.mocks.length, 1);
    const mock = driver.mocks[0];
    const answers = [mock.answer(), mock.answer(), mock.answer(), mock.answer()];
    assert.deepEqual(answers[0], { body: { status: "running" }, headers: {}, statusCode: 200 });
    assert.deepEqual(answers[1], { body: "second", headers: { "x-n": "2" }, statusCode: 202 });
    assert.deepEqual(answers[2], { body: "", headers: {}, statusCode: 404 });
    assert.deepEqual(answers[3], answers[2]);
    assert.equal(mock.responds.at(-1).params.fetchResponse, false);
  });

  it("counts a sequence's answers in outputs.matched", async function () {
    const driver = fakeDriver();
    await run({ url: "**/x", responses: [{ body: "a" }, { body: "b" }] }, { driver });
    driver.mocks[0].answer();
    driver.mocks[0].answer();
    driver.mocks[0].answer();
    const { result } = await run({ url: "**/x", response: { body: "c" } }, { driver });
    assert.equal(result.outputs.matched, 3);
  });

  it("reads each entry's bodyPath, and fails on a missing one", async function () {
    const file = path.join(dir, "done.json");
    fs.writeFileSync(file, '{"status":"done"}');
    const { driver } = await run({ url: "**/x", responses: [{ body: "a" }, { bodyPath: file }] });
    driver.mocks[0].answer();
    assert.equal(driver.mocks[0].answer().body.toString(), '{"status":"done"}');

    const missing = path.join(dir, "nope.json");
    const failed = await run({ url: "**/x", responses: [{ body: "a" }, { bodyPath: missing }] });
    assert.equal(failed.result.status, "FAIL");
    assert.equal(failed.result.description, `Couldn't read \`bodyPath\` \`${missing}\`.`);
    assert.equal(failed.driver.mockCalls.length, 0);
  });
});

const har = (entries) => ({ log: { version: "1.2", entries } });
const harEntry = (method, url, { status = 200, text, encoding, headers = [] } = {}) => ({
  request: { method, url },
  response: { status, headers, content: { mimeType: "application/json", ...(text === undefined ? {} : { text }), ...(encoding ? { encoding } : {}) } },
});

describe("harToMocks", function () {
  it("groups repeated url and method pairs into a sequence, in file order", function () {
    const mocks = harToMocks(
      har([
        harEntry("GET", "http://localhost:8092/api/jobs/1", { text: '{"s":"running"}' }),
        harEntry("POST", "http://localhost:8092/api/jobs/1", { status: 201, text: "made" }),
        harEntry("GET", "http://localhost:8092/api/jobs/1", { text: '{"s":"done"}' }),
      ])
    );
    assert.deepEqual(
      mocks.map((m) => [m.method, m.url, m.responses.map((r) => [r.statusCode, r.body])]),
      [
        ["GET", "http://localhost:8092/api/jobs/1", [[200, '{"s":"running"}'], [200, '{"s":"done"}']]],
        ["POST", "http://localhost:8092/api/jobs/1", [[201, "made"]]],
      ]
    );
  });

  it("decodes base64 bodies, sends an empty body without text, and drops wire-format headers", function () {
    const [mock] = harToMocks(
      har([
        harEntry("GET", "https://x.test/a", {
          text: Buffer.from("hi").toString("base64"),
          encoding: "base64",
          headers: [
            { name: "Content-Type", value: "text/plain" },
            { name: "Content-Length", value: "99" },
            { name: "content-encoding", value: "gzip" },
            { name: "Transfer-Encoding", value: "chunked" },
          ],
        }),
        harEntry("GET", "https://x.test/a"),
      ])
    );
    assert.ok(Buffer.isBuffer(mock.responses[0].body));
    assert.equal(mock.responses[0].body.toString(), "hi");
    assert.deepEqual(mock.responses[0].headers, { "Content-Type": "text/plain" });
    assert.equal(mock.responses[1].body, "");
  });

  it("keeps only entries matching the url glob and method", function () {
    const entries = har([
      harEntry("GET", "http://localhost:8092/api/a?x=1"),
      harEntry("POST", "http://localhost:8092/api/b"),
      harEntry("GET", "http://localhost:8092/static/app.js"),
    ]);
    const urls = (filter) => harToMocks(entries, filter).map((m) => `${m.method} ${m.url}`);
    assert.deepEqual(urls({ url: "**/api/**" }), ["GET http://localhost:8092/api/a?x=1", "POST http://localhost:8092/api/b"]);
    assert.deepEqual(urls({ url: "**/api/**", method: "POST" }), ["POST http://localhost:8092/api/b"]);
    assert.deepEqual(urls({ url: "http://localhost:8092/static/*" }), ["GET http://localhost:8092/static/app.js"]);
    assert.equal(urls({}).length, 3);
  });

  it("returns undefined for JSON that isn't HAR", function () {
    assert.equal(harToMocks({}), undefined);
    assert.equal(harToMocks({ log: {} }), undefined);
    assert.equal(harToMocks(null), undefined);
    assert.equal(harToMocks(undefined), undefined);
  });
});

describe("mockRequest harPath", function () {
  let dir;
  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), "dd-mock-har-"));
  });
  afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));
  const writeHar = (content) => {
    const file = path.join(dir, "app.har");
    fs.writeFileSync(file, typeof content === "string" ? content : JSON.stringify(content));
    return file;
  };

  it("matches a recorded URL with brackets in its query literally", async function () {
    const recorded = "http://localhost:8092/api/items?ids[]=1&ids[]=2";
    const file = writeHar(har([harEntry("GET", recorded, { text: "items" })]));
    const { result, driver } = await run({ harPath: file });
    assert.equal(result.status, "PASS", result.description);
    const [{ url }] = driver.mockCalls;
    // The browser sends brackets percent-encoded or as recorded; both must match.
    assert.ok(url.test(recorded));
    assert.ok(url.test(new URL(recorded).href));
    assert.equal(url.test("http://localhost:8092/api/items?ids=1"), false);
  });

  it("mocks each recorded url and method with a literal pattern", async function () {
    const file = writeHar(
      har([
        harEntry("GET", "http://localhost:8092/api/a?x=1", { text: "one" }),
        harEntry("GET", "http://localhost:8092/api/a?x=1", { text: "two" }),
        harEntry("POST", "http://localhost:8092/api/b", { status: 201, text: "made" }),
      ])
    );
    const { result, driver } = await run({ harPath: file });
    assert.equal(result.status, "PASS", result.description);
    assert.equal(driver.mockCalls.length, 2);
    const [a, b] = driver.mockCalls;
    assert.ok(a.url.test("http://localhost:8092/api/a?x=1"));
    assert.equal(a.url.test("http://localhost:8092/api/a?x=2"), false);
    assert.deepEqual(a.filter, { method: "GET" });
    assert.deepEqual(b.filter, { method: "POST" });
    assert.deepEqual([driver.mocks[0].answer().body, driver.mocks[0].answer().body], ["one", "two"]);
    assert.equal(driver.mocks[1].answer().statusCode, 201);
  });

  it("reports the total answered across the HAR's mocks", async function () {
    const file = writeHar(har([harEntry("GET", "https://x.test/a"), harEntry("GET", "https://x.test/b")]));
    const driver = fakeDriver();
    await run({ harPath: file }, { driver });
    driver.mocks[0].answer();
    driver.mocks[1].answer();
    const { result } = await run({ harPath: file }, { driver });
    assert.equal(result.outputs.matched, 2);
  });

  it("fails on an unreadable file, non-HAR JSON, and no matching entries", async function () {
    const missing = path.join(dir, "nope.har");
    let { result } = await run({ harPath: missing });
    assert.equal(result.status, "FAIL");
    assert.equal(result.description, `Couldn't read \`harPath\` \`${missing}\`.`);

    for (const bad of ["not json", { log: { entries: "x" } }]) {
      const file = writeHar(bad);
      ({ result } = await run({ harPath: file }));
      assert.equal(result.description, `Couldn't parse \`harPath\` \`${file}\`: it isn't HAR JSON.`);
    }

    const file = writeHar(har([harEntry("GET", "https://x.test/a")]));
    ({ result } = await run({ harPath: file, url: "**/other" }));
    assert.equal(result.description, `Couldn't find HAR entries matching \`**/other\` in \`${file}\`.`);
    ({ result } = await run({ harPath: writeHar(har([])) }));
    assert.equal(result.description, `Couldn't find HAR entries matching \`*\` in \`${file}\`.`);
  });

  it("fails, mocking nothing, on a `url` filter that isn't a valid pattern", async function () {
    const file = writeHar(har([harEntry("GET", "https://x.test/api/a")]));
    const { result, driver } = await run({ harPath: file, url: "**/api/(" });
    assert.equal(result.status, "FAIL");
    assert.equal(result.description, "Couldn't parse `url` pattern `**/api/(`.");
    assert.equal(driver.mockCalls.length, 0);
  });

  it("fails, mocking nothing, on a relative or malformed recorded URL", async function () {
    for (const bad of ["/api/relative", "http://[bad"]) {
      const file = writeHar(har([harEntry("GET", "https://x.test/ok"), harEntry("GET", bad)]));
      const { result, driver } = await run({ harPath: file });
      assert.equal(result.status, "FAIL");
      assert.equal(result.description, `Couldn't parse a URL in \`harPath\` \`${file}\`.`);
      assert.equal(driver.mockCalls.length, 0);
    }
  });

  it("counts answers that arrive while later HAR mocks register", async function () {
    const file = writeHar(har([harEntry("GET", "https://x.test/a"), harEntry("GET", "https://x.test/b")]));
    const driver = fakeDriver();
    const mock = driver.mock;
    driver.mock = async (...args) => {
      // The first mock answers a request while the second registers.
      driver.mocks[0]?.answer();
      return mock(...args);
    };
    const { result } = await run({ harPath: file }, { driver });
    assert.equal(result.outputs.matched, 1);
  });
});

describe("mockRequest bodyPath resolution", function () {
  const specFile = path.resolve("/specs/sub/mock.spec.json");
  const resolveSpec = (mock, relativePathBase = "file") =>
    resolvePaths({
      config: { relativePathBase },
      object: { tests: [{ steps: [{ mockRequest: mock }] }] },
      filePath: specFile,
      objectType: "spec",
    }).then((spec) => spec.tests[0].steps[0].mockRequest);

  it("resolves a relative bodyPath against the spec file", async function () {
    const mock = await resolveSpec({ url: "**/u", response: { bodyPath: "fixtures/user.json" } });
    assert.equal(mock.response.bodyPath, path.resolve("/specs/sub/fixtures/user.json"));
  });

  it("resolves it against the working directory under relativePathBase cwd", async function () {
    const mock = await resolveSpec({ url: "**/u", response: { bodyPath: "user.json" } }, "cwd");
    assert.equal(mock.response.bodyPath, path.resolve("user.json"));
  });

  it("leaves the url, the headers, and an absolute bodyPath alone", async function () {
    const abs = path.resolve("/data/user.json");
    const mock = await resolveSpec({ url: "fixtures/x", response: { bodyPath: abs, headers: { path: "a" } } });
    assert.equal(mock.url, "fixtures/x");
    assert.equal(mock.response.bodyPath, abs);
    assert.deepEqual(mock.response.headers, { path: "a" });
  });

  it("resolves harPath and every responses bodyPath against the spec file", async function () {
    const mock = await resolveSpec({ harPath: "fixtures/app.har", responses: [{ body: "a" }, { bodyPath: "b.json" }] });
    assert.equal(mock.harPath, path.resolve("/specs/sub/fixtures/app.har"));
    assert.equal(mock.responses[1].bodyPath, path.resolve("/specs/sub/b.json"));
    assert.equal(mock.responses[0].body, "a");
  });

  it("leaves a responses entry's body alone, even when it has path-like keys", async function () {
    const body = { path: "report.csv", directory: "out" };
    const mock = await resolveSpec({ url: "**/u", responses: [{ body }] });
    assert.deepEqual(mock.responses[0].body, { path: "report.csv", directory: "out" });
  });
});

describe("hasBidi decides where mockRequest runs", function () {
  it("is true for chrome and false for firefox and webkit", function () {
    assert.equal(hasBidi("chrome"), true);
    assert.equal(hasBidi("firefox"), false);
    assert.equal(hasBidi("webkit"), false);
  });
});
