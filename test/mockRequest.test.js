import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { mockRequest, restoreMocks } from "../dist/core/tests/mockRequest.js";
import { resolvePaths } from "../dist/core/files.js";
import { hasBidi } from "../dist/core/tests.js";

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
    // Simulate the browser answering one request.
    answer() {
      handlers.overwrite?.({});
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
      "Couldn't mock requests to `**/x`. The browser session has no WebDriver BiDi connection."
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
    assert.match(result.description, /^Couldn't mock requests to `\*\*\/x`\./);
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
});

describe("hasBidi decides where mockRequest runs", function () {
  it("is true for chrome and false for firefox and webkit", function () {
    assert.equal(hasBidi("chrome"), true);
    assert.equal(hasBidi("firefox"), false);
    assert.equal(hasBidi("webkit"), false);
  });
});
