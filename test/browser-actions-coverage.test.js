import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import sinon from "sinon";

import { moveTo, instantiateCursor } from "../dist/core/tests/moveTo.js";
import { dragAndDropElement } from "../dist/core/tests/dragAndDrop.js";
import { loadCookie } from "../dist/core/tests/loadCookie.js";
import { saveCookie } from "../dist/core/tests/saveCookie.js";

// Hermetic, offline coverage for four browser ACTION files. Every driver method
// is a plain async stub returning canned values; no real webdriver/network/browser.
// File I/O uses a fresh temp dir per test, cleaned up in afterEach.

const config = { logLevel: "silent" };

// ---------------------------------------------------------------------------
// moveTo / instantiateCursor
// ---------------------------------------------------------------------------

describe("moveTo action (coverage)", function () {
  afterEach(() => sinon.restore());

  // A configurable webdriverio-style element for moveTo.
  function makeElement({
    elementId = "el-1",
    size = { width: 40, height: 20 },
    location = { x: 100, y: 200 },
  } = {}) {
    return {
      elementId,
      getSize: async () => size,
      getLocation: async () => location,
    };
  }

  // A driver whose `.action("pointer").move(...).perform()` chain is stubbable.
  function makeDriver({ performImpl } = {}) {
    const driver = { state: {} };
    driver.action = () => {
      const chain = {
        move: () => chain,
        perform: performImpl || (async () => {}),
      };
      return chain;
    };
    return driver;
  }

  it("returns FAIL when element is missing (no elementId)", async () => {
    const driver = makeDriver();
    const result = await moveTo({ config, step: {}, driver, element: null });
    assert.equal(result.status, "FAIL");
    assert.match(result.description, /Couldn't find element/);
  });

  it("returns FAIL when element has no elementId", async () => {
    const driver = makeDriver();
    const result = await moveTo({
      config,
      step: {},
      driver,
      element: { getSize: async () => ({}) },
    });
    assert.equal(result.status, "FAIL");
  });

  it("center alignment: PASS and computes centered coordinates", async () => {
    const driver = makeDriver();
    const element = makeElement();
    const result = await moveTo({
      config,
      step: { alignment: "center" },
      driver,
      element,
    });
    assert.equal(result.status, "PASS");
    // x = 100 + 40/2 = 120 ; y = 200 + 20/2 = 210
    assert.equal(driver.state.x, 120);
    assert.equal(driver.state.y, 210);
  });

  it("top alignment", async () => {
    const driver = makeDriver();
    const result = await moveTo({
      config,
      step: { alignment: "top" },
      driver,
      element: makeElement(),
    });
    assert.equal(result.status, "PASS");
    assert.equal(driver.state.x, 120);
    assert.equal(driver.state.y, 200);
  });

  it("bottom alignment", async () => {
    const driver = makeDriver();
    const result = await moveTo({
      config,
      step: { alignment: "bottom" },
      driver,
      element: makeElement(),
    });
    assert.equal(driver.state.y, 220);
  });

  it("left alignment", async () => {
    const driver = makeDriver();
    const result = await moveTo({
      config,
      step: { alignment: "left" },
      driver,
      element: makeElement(),
    });
    assert.equal(driver.state.x, 100);
    assert.equal(driver.state.y, 210);
  });

  it("right alignment", async () => {
    const driver = makeDriver();
    const result = await moveTo({
      config,
      step: { alignment: "right" },
      driver,
      element: makeElement(),
    });
    assert.equal(driver.state.x, 140);
    assert.equal(driver.state.y, 210);
  });

  it("default alignment (unknown value) centers", async () => {
    const driver = makeDriver();
    const result = await moveTo({
      config,
      step: { alignment: "nonsense" },
      driver,
      element: makeElement(),
    });
    assert.equal(result.status, "PASS");
    assert.equal(driver.state.x, 120);
    assert.equal(driver.state.y, 210);
  });

  it("applies offset x/y", async () => {
    const driver = makeDriver();
    const result = await moveTo({
      config,
      step: { alignment: "center", offset: { x: 5, y: -3 } },
      driver,
      element: makeElement(),
    });
    assert.equal(result.status, "PASS");
    assert.equal(driver.state.x, 125);
    assert.equal(driver.state.y, 207);
  });

  it("returns FAIL when the pointer move throws", async () => {
    const driver = makeDriver({
      performImpl: async () => {
        throw new Error("no pointer");
      },
    });
    const result = await moveTo({
      config,
      step: { alignment: "center" },
      driver,
      element: makeElement(),
    });
    assert.equal(result.status, "FAIL");
    assert.match(result.description, /Couldn't move mouse/);
  });
});

describe("instantiateCursor (coverage)", function () {
  afterEach(() => {
    sinon.restore();
    // Ensure no leaked browser globals from the fn-invoking execute stub.
    delete global.document;
    delete global.window;
  });

  // A minimal, hermetic DOM stub so we can actually INVOKE the functions passed
  // to driver.execute (readyState probe, viewport probe, cursor-creation body,
  // display toggle) in-process. This exercises the real function bodies rather
  // than skipping them — nothing here touches a real browser.
  function installDomStub({
    ready = "complete",
    innerWidth = 800,
    innerHeight = 600,
  } = {}) {
    const makeEl = () => ({
      style: {},
      classList: { add() {}, remove() {} },
      appendChild() {},
      addEventListener() {},
    });
    global.document = {
      readyState: ready,
      createElement: () => makeEl(),
      head: { appendChild() {} },
      body: { appendChild() {} },
      // Immediately invoke each registered listener with a fake event so the
      // mousedown/mouseup/mousemove handler bodies actually execute.
      addEventListener(type, handler) {
        if (typeof handler === "function") {
          handler({ clientX: 12, clientY: 34 });
        }
      },
      querySelector: () => makeEl(),
    };
    global.window = { innerWidth, innerHeight, mouseX: 5, mouseY: 6 };
  }

  // Driver whose execute() actually calls the provided function under the DOM
  // stub, so each execute callback body runs for real.
  function makeDriver({
    ready = "complete",
    cursorElementId = undefined,
    innerWidth = 800,
    innerHeight = 600,
    state = {},
    waitUntilImpl,
    performActionsImpl,
  } = {}) {
    const driver = {
      state,
      waitUntil:
        waitUntilImpl ||
        (async (fn) => {
          // Emulate webdriverio waitUntil: poll fn once; throw on false.
          const ok = await fn();
          if (!ok) throw new Error("waitUntil timeout");
          return true;
        }),
      execute: async (fn, ...args) => {
        installDomStub({ ready, innerWidth, innerHeight });
        try {
          return await fn(...args);
        } finally {
          delete global.document;
          delete global.window;
        }
      },
      $: async () => ({ elementId: cursorElementId }),
      performActions: performActionsImpl || (async () => {}),
    };
    return driver;
  }

  it("cursor already present: skips instantiation, PASS", async () => {
    const performActions = sinon.spy(async () => {});
    const driver = makeDriver({
      cursorElementId: "existing",
      performActionsImpl: performActions,
    });
    const result = await instantiateCursor(driver);
    assert.equal(result.status, "PASS");
    assert.match(result.description, /Instantiated cursor/);
    // Existing cursor → no performActions call.
    assert.equal(performActions.callCount, 0);
  });

  it("no cursor + position center: creates cursor and moves it", async () => {
    const performActions = sinon.spy(async () => {});
    const driver = makeDriver({
      cursorElementId: undefined,
      performActionsImpl: performActions,
    });
    const result = await instantiateCursor(driver, { position: "center" });
    assert.equal(result.status, "PASS");
    // viewport 800x600 → center 400,300
    assert.equal(driver.state.x, 400);
    assert.equal(driver.state.y, 300);
    assert.equal(performActions.callCount, 1);
  });

  it("no cursor + state.x null → derives from viewport", async () => {
    const driver = makeDriver({
      cursorElementId: undefined,
      state: { x: null, y: null },
    });
    const result = await instantiateCursor(driver, { position: "current" });
    assert.equal(result.status, "PASS");
    assert.equal(driver.state.x, 400);
    assert.equal(driver.state.y, 300);
  });

  it("no cursor + position current + existing state.x → keeps state coords", async () => {
    const driver = makeDriver({
      cursorElementId: undefined,
      state: { x: 42, y: 24 },
    });
    const result = await instantiateCursor(driver, { position: "current" });
    assert.equal(result.status, "PASS");
    // Since state.x is set and position !== center, viewport branch is skipped.
    assert.equal(driver.state.x, 42);
    assert.equal(driver.state.y, 24);
  });

  it("default options argument (position current)", async () => {
    const driver = makeDriver({
      cursorElementId: undefined,
      state: { x: 7, y: 9 },
    });
    const result = await instantiateCursor(driver);
    assert.equal(result.status, "PASS");
    assert.equal(driver.state.x, 7);
    assert.equal(driver.state.y, 9);
  });

  it("returns FAIL when the page never becomes ready (waitUntil rejects)", async () => {
    const driver = makeDriver({ ready: "loading" });
    const result = await instantiateCursor(driver);
    assert.equal(result.status, "FAIL");
    assert.match(result.description, /Couldn't wait for page to load/);
  });
});

// ---------------------------------------------------------------------------
// dragAndDrop
// ---------------------------------------------------------------------------

describe("dragAndDrop action (coverage)", function () {
  this.timeout(15000);
  afterEach(() => sinon.restore());

  // A findElement-compatible element. dragAndDrop calls: getAttribute,
  // getProperty, getLocation, getSize, dragAndDrop.
  //
  // `moving: true` makes getLocation return monotonically increasing coords on
  // every call, so the initial/final reads dragAndDrop compares always differ
  // (sourceChanged === true → WebDriver.io path). `moving: false` returns fixed
  // coords (sourceChanged === false → HTML5 fallback path). Both survive the
  // extra getLocation/getSize calls findElement's setElementOutputs performs.
  function makeElement({ elementId = "el-1", moving = false, dragImpl } = {}) {
    let locCall = 0;
    return {
      elementId,
      getText: async () => "item",
      getHTML: async () => "<div>item</div>",
      getTagName: async () => "div",
      getValue: async () => "",
      getLocation: async () => (moving ? { x: locCall++, y: locCall } : { x: 0, y: 0 }),
      getSize: async () => ({ width: 10, height: 10 }),
      isClickable: async () => true,
      isEnabled: async () => true,
      isSelected: async () => false,
      isDisplayed: async () => true,
      isExisting: async () => true,
      getAttribute: async () => "true",
      getProperty: async () => true,
      getComputedLabel: async () => "item",
      waitForExist: async () => true,
      dragAndDrop: dragImpl || (async () => {}),
    };
  }

  // Driver whose criteria search ($$) returns the given candidates so findElement
  // resolves found=true. `$` backs findElement's string-shorthand path. `execute`
  // backs the HTML5 fallback.
  function makeDriver({ candidates = [], shorthandEl, executeImpl } = {}) {
    return {
      $$: async () => candidates,
      $: async () => shorthandEl || null,
      pause: async () => {},
      keys: async () => {},
      execute: executeImpl || (async () => true),
    };
  }

  it("object source/target: WebDriver.io drag reports change → PASS via WDIO path", async () => {
    // Source location changes between initial and final reads → sourceChanged
    // true → WebDriver.io branch (no HTML5 fallback).
    const element = makeElement({ moving: true });
    const driver = makeDriver({ candidates: [element] });
    const result = await dragAndDropElement({
      config,
      step: {
        dragAndDrop: { source: { selector: "#a" }, target: { selector: "#b" } },
      },
      driver,
    });
    assert.equal(result.status, "PASS");
    assert.match(result.description, /Performed drag and drop/);
  });

  it("string source/target: parses shorthand, drags via WDIO path → PASS", async () => {
    // Exercises the string-form source/target parse branches. findElement's
    // string shorthand resolves through driver.$(...).
    const element = makeElement({ moving: true });
    const shorthandEl = { ...element, waitForExist: async () => true };
    const driver = makeDriver({ shorthandEl });
    const result = await dragAndDropElement({
      config,
      step: { dragAndDrop: { source: "#a", target: "#b" } },
      driver,
    });
    assert.equal(result.status, "PASS");
    assert.match(result.description, /Performed drag and drop/);
  });

  it("object source/target with duration: silent WDIO failure → HTML5 fallback PASS", async () => {
    // Location/size unchanged → sourceChanged false → HTML5 fallback via execute.
    const element = makeElement();
    const executeSpy = sinon.spy(async () => true);
    const driver = makeDriver({ candidates: [element], executeImpl: executeSpy });
    const result = await dragAndDropElement({
      config,
      step: {
        dragAndDrop: {
          source: { selector: "#a" },
          target: { selector: "#b" },
          duration: 250,
        },
      },
      driver,
    });
    assert.equal(result.status, "PASS");
    assert.match(result.description, /Performed drag and drop/);
    // HTML5 fallback path invoked execute at least once.
    assert.ok(executeSpy.callCount >= 1);
  });

  it("silent WDIO failure + HTML5 fallback throws → FAIL", async () => {
    const element = makeElement();
    const driver = makeDriver({
      candidates: [element],
      executeImpl: async () => {
        throw new Error("html5 boom");
      },
    });
    const result = await dragAndDropElement({
      config,
      step: {
        dragAndDrop: { source: { selector: "#a" }, target: { selector: "#b" } },
      },
      driver,
    });
    assert.equal(result.status, "FAIL");
    assert.match(result.description, /Drag and drop failed: html5 boom/);
  });

  it("dragAndDrop throwing → outer catch FAIL", async () => {
    const element = makeElement({
      dragImpl: async () => {
        throw new Error("wdio drag exploded");
      },
    });
    const driver = makeDriver({ candidates: [element] });
    const result = await dragAndDropElement({
      config,
      step: {
        dragAndDrop: { source: { selector: "#a" }, target: { selector: "#b" } },
      },
      driver,
    });
    assert.equal(result.status, "FAIL");
    assert.match(result.description, /Couldn't perform drag and drop\. wdio drag exploded/);
  });

  it("invalid step (missing target) → FAIL from step guard", async () => {
    const driver = makeDriver({ candidates: [makeElement()] });
    const result = await dragAndDropElement({
      config,
      step: { dragAndDrop: { source: "#a" } },
      driver,
    });
    assert.equal(result.status, "FAIL");
    assert.match(result.description, /Invalid step definition/);
  });

  it("target not found → targetFound FAIL, status FAIL, 'target' in description", async () => {
    // Source find matches; target find never matches. findElement uses the same
    // $$ for both, so make $$ return a candidate only for the source selector.
    const element = makeElement();
    const driver = {
      $$: async (selector) => (String(selector).includes("#a") ? [element] : []),
      $: async () => null,
      pause: async () => {},
      keys: async () => {},
      execute: async () => true,
    };
    const result = await dragAndDropElement({
      config,
      step: {
        dragAndDrop: {
          source: { selector: "#a", timeout: 50 },
          target: { selector: "#b", timeout: 50 },
        },
      },
      driver,
    });
    assert.equal(result.status, "FAIL");
    assert.equal(result.outputs.sourceFound, true);
    assert.equal(result.outputs.targetFound, false);
    assert.match(result.description, /Couldn't find target element/);
  });

  it("source not found → sourceFound FALSE, status FAIL, 'source' in description", async () => {
    // No candidates → both finds resolve found=false; short-circuit records
    // sourceFound FAIL and the description names the source element.
    const driver = makeDriver({ candidates: [] });
    const result = await dragAndDropElement({
      config,
      step: {
        dragAndDrop: {
          source: { selector: "#a", timeout: 50 },
          target: { selector: "#b", timeout: 50 },
        },
      },
      driver,
    });
    assert.equal(result.status, "FAIL");
    assert.equal(result.outputs.sourceFound, false);
    assert.match(result.description, /Couldn't find source element/);
  });

  it("outer catch: malformed regex shorthand throws synchronously inside findElement -> FAIL with the raw error message", async () => {
    // findElement's own internals are defensive: findElementByCriteria wraps
    // driver.$$ in a try/catch that swallows a rejection and just keeps
    // polling until timeout (degrading to a FAIL *result*, not a throw). The
    // one genuinely unguarded throw inside findElement's call graph is
    // `new RegExp(...)` in findElementByShorthand's regex branch -- an
    // invalid `/pattern/` shorthand (e.g. an unterminated character class)
    // throws a SyntaxError synchronously, before any try/catch, which
    // propagates out of Promise.all and is caught by dragAndDropElement's
    // OWN outer try/catch (around the two concurrent findElement calls).
    // This is distinct from the "element not found" FAIL path, which returns
    // a result object rather than throwing.
    const driver = {
      $$: async () => [],
      $: async () => null,
      pause: async () => {},
      keys: async () => {},
      execute: async () => true,
    };
    const result = await dragAndDropElement({
      config,
      step: {
        dragAndDrop: { source: "/[/", target: "#b" },
      },
      driver,
    });
    assert.equal(result.status, "FAIL");
    assert.match(result.description, /Invalid regular expression/);
    // The outer catch fires before outputs.sourceFound/targetFound are ever
    // assigned (unlike the "element not found" FAIL path).
    assert.deepEqual(result.outputs, {});
  });
});

// ---------------------------------------------------------------------------
// loadCookie
// ---------------------------------------------------------------------------

describe("loadCookie action (coverage)", function () {
  let tmpDir;
  const savedEnv = {};

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "dd-loadcookie-"));
  });

  afterEach(() => {
    sinon.restore();
    fs.rmSync(tmpDir, { recursive: true, force: true });
    // Restore any env vars mutated by tests.
    for (const k of Object.keys(savedEnv)) {
      if (savedEnv[k] === undefined) delete process.env[k];
      else process.env[k] = savedEnv[k];
      delete savedEnv[k];
    }
  });

  function setEnv(name, value) {
    savedEnv[name] = process.env[name];
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  }

  // Driver exposing getUrl + setCookies for loadCookie.
  function makeDriver({ url = "https://example.com/page", setCookiesImpl } = {}) {
    return {
      getUrl: async () => url,
      setCookies: setCookiesImpl || (async () => {}),
    };
  }

  // Build a Netscape cookie line. Tabs are load-bearing.
  function netscapeLine({
    domain = "example.com",
    flag = "TRUE",
    cpath = "/",
    secure = "FALSE",
    expiry = "0",
    name = "sid",
    value = "abc",
    extra = [],
  } = {}) {
    return [domain, flag, cpath, secure, expiry, name, value, ...extra].join("\t");
  }

  it("invalid step → FAIL", async () => {
    const driver = makeDriver();
    // loadCookie object without a source is schema-invalid.
    const result = await loadCookie({
      config,
      step: { loadCookie: { name: "sid" } },
      driver,
    });
    assert.equal(result.status, "FAIL");
    assert.match(result.description, /Invalid step definition/);
  });

  it("env variable missing → FAIL", async () => {
    setEnv("DD_MISSING_COOKIE", undefined);
    const driver = makeDriver();
    const result = await loadCookie({
      config,
      step: { loadCookie: "DD_MISSING_COOKIE" },
      driver,
    });
    assert.equal(result.status, "FAIL");
    assert.match(result.description, /not found or empty/);
  });

  it("env variable with invalid JSON → FAIL parse", async () => {
    setEnv("DD_BAD_JSON", "{not json");
    const driver = makeDriver();
    const result = await loadCookie({
      config,
      step: { loadCookie: "DD_BAD_JSON" },
      driver,
    });
    assert.equal(result.status, "FAIL");
    assert.match(result.description, /Failed to parse cookie data/);
  });

  it("env variable happy path → sets cookie, PASS", async () => {
    setEnv(
      "DD_GOOD_COOKIE",
      JSON.stringify({ name: "sid", value: "v", domain: "example.com" })
    );
    const setCookies = sinon.spy(async () => {});
    const driver = makeDriver({ setCookiesImpl: setCookies });
    const result = await loadCookie({
      config,
      step: { loadCookie: "DD_GOOD_COOKIE" },
      driver,
    });
    assert.equal(result.status, "PASS");
    assert.equal(result.outputs.cookieName, "sid");
    assert.equal(setCookies.callCount, 1);
  });

  it("file not found → FAIL", async () => {
    const driver = makeDriver();
    const result = await loadCookie({
      config: { ...config, output: tmpDir },
      step: { loadCookie: { name: "sid", path: "missing.txt" } },
      driver,
    });
    assert.equal(result.status, "FAIL");
    assert.match(result.description, /not found/);
  });

  it("file with no valid cookies → FAIL", async () => {
    const file = path.join(tmpDir, "empty.txt");
    fs.writeFileSync(file, "# just a comment\n\n", "utf8");
    const driver = makeDriver();
    const result = await loadCookie({
      config,
      step: { loadCookie: { name: "sid", path: file, directory: tmpDir } },
      driver,
    });
    assert.equal(result.status, "FAIL");
    assert.match(result.description, /No valid cookies found/);
  });

  it("cookie name not found in file → FAIL", async () => {
    const file = path.join(tmpDir, "cookies.txt");
    fs.writeFileSync(file, netscapeLine({ name: "other" }) + "\n", "utf8");
    const driver = makeDriver();
    const result = await loadCookie({
      config,
      step: { loadCookie: { name: "sid", path: file, directory: tmpDir } },
      driver,
    });
    assert.equal(result.status, "FAIL");
    assert.match(result.description, /not found in file/);
  });

  it("file happy path (string .txt form, infers name) → PASS", async () => {
    // String .txt form resolves the relative path against config.output.
    const file = path.join(tmpDir, "sid.txt");
    fs.writeFileSync(
      file,
      netscapeLine({ name: "sid", expiry: "0" }) + "\n",
      "utf8"
    );
    const setCookies = sinon.spy(async () => {});
    const driver = makeDriver({ setCookiesImpl: setCookies });
    const result = await loadCookie({
      config: { ...config, output: tmpDir },
      step: { loadCookie: "sid.txt" },
      driver,
    });
    assert.equal(result.status, "PASS");
    assert.equal(result.outputs.cookieName, "sid");
    assert.equal(setCookies.callCount, 1);
  });

  it("domain filter matches subdomain cookie in file → PASS", async () => {
    const file = path.join(tmpDir, "cookies.txt");
    // #HttpOnly_ prefixed line, secure TRUE, future expiry, sameSite None.
    const future = String(Math.floor(Date.now() / 1000) + 100000);
    fs.writeFileSync(
      file,
      "#HttpOnly_" +
        netscapeLine({
          domain: ".example.com",
          secure: "TRUE",
          expiry: future,
          name: "sid",
          value: "v",
          extra: ["TRUE", "None"],
        }) +
        "\n",
      "utf8"
    );
    const setCookies = sinon.spy(async () => {});
    const driver = makeDriver({
      url: "https://sub.example.com/x",
      setCookiesImpl: setCookies,
    });
    const result = await loadCookie({
      config,
      step: {
        loadCookie: {
          name: "sid",
          path: file,
          directory: tmpDir,
          domain: "example.com",
        },
      },
      driver,
    });
    assert.equal(result.status, "PASS");
    assert.equal(setCookies.callCount, 1);
    // sameSite "None" on HTTPS → secure coerced true.
    const arg = setCookies.firstCall.args[0];
    assert.equal(arg.sameSite, "None");
    assert.equal(arg.secure, true);
  });

  it("sameSite None on HTTP downgrades to Lax", async () => {
    const file = path.join(tmpDir, "cookies.txt");
    fs.writeFileSync(
      file,
      netscapeLine({
        domain: "localhost",
        name: "sid",
        value: "v",
        extra: ["FALSE", "None"],
      }) + "\n",
      "utf8"
    );
    const setCookies = sinon.spy(async () => {});
    const driver = makeDriver({
      url: "http://localhost:3000/x",
      setCookiesImpl: setCookies,
    });
    const result = await loadCookie({
      config,
      step: { loadCookie: { name: "sid", path: file, directory: tmpDir } },
      driver,
    });
    assert.equal(result.status, "PASS");
    const arg = setCookies.firstCall.args[0];
    assert.equal(arg.sameSite, "Lax");
    // localhost → domain omitted from cookieForDriver.
    assert.equal(arg.domain, undefined);
  });

  it("Strict sameSite normalization + future expiry included", async () => {
    const file = path.join(tmpDir, "cookies.txt");
    const future = Math.floor(Date.now() / 1000) + 100000;
    fs.writeFileSync(
      file,
      netscapeLine({
        domain: "example.com",
        name: "sid",
        value: "v",
        expiry: String(future),
        extra: ["FALSE", "strict"],
      }) + "\n",
      "utf8"
    );
    const setCookies = sinon.spy(async () => {});
    const driver = makeDriver({ setCookiesImpl: setCookies });
    const result = await loadCookie({
      config,
      step: { loadCookie: { name: "sid", path: file, directory: tmpDir } },
      driver,
    });
    assert.equal(result.status, "PASS");
    const arg = setCookies.firstCall.args[0];
    assert.equal(arg.sameSite, "Strict");
    assert.equal(arg.domain, "example.com");
    assert.equal(arg.expiry, future);
  });

  it("incompatible cookie domain vs current page → FAIL", async () => {
    setEnv(
      "DD_DOMAIN_COOKIE",
      JSON.stringify({ name: "sid", value: "v", domain: "other.org" })
    );
    const driver = makeDriver({ url: "https://example.com/x" });
    const result = await loadCookie({
      config,
      step: { loadCookie: "DD_DOMAIN_COOKIE" },
      driver,
    });
    assert.equal(result.status, "FAIL");
    assert.match(result.description, /not compatible/);
  });

  it("cookie data missing name → FAIL", async () => {
    setEnv("DD_NONAME", JSON.stringify({ value: "v" }));
    const driver = makeDriver();
    const result = await loadCookie({
      config,
      step: { loadCookie: "DD_NONAME" },
      driver,
    });
    assert.equal(result.status, "FAIL");
    assert.match(result.description, /missing name/);
  });

  it("readFileSync throwing (path is a directory) → FAIL read branch", async () => {
    // Pass a directory as the cookie file so fs.readFileSync throws (EISDIR),
    // exercising the read-error catch.
    const subdir = path.join(tmpDir, "adir");
    fs.mkdirSync(subdir);
    const driver = makeDriver();
    const result = await loadCookie({
      config,
      step: { loadCookie: { name: "sid", path: "adir", directory: tmpDir } },
      driver,
    });
    assert.equal(result.status, "FAIL");
    assert.match(result.description, /Failed to read cookie file/);
  });

  it("directory omitted + config.output omitted → resolves against cwd", async () => {
    // No `directory` and no `config.output` → path resolves against process.cwd().
    // Use a nonexistent relative file so we deterministically land on the
    // file-not-found FAIL without depending on cwd contents.
    const driver = makeDriver();
    const result = await loadCookie({
      config: { logLevel: "silent" },
      step: { loadCookie: { name: "sid", path: "dd-nonexistent-cookie.txt" } },
      driver,
    });
    assert.equal(result.status, "FAIL");
    assert.match(result.description, /not found/);
  });

  it("cookie without a domain skips domain-compatibility check → PASS", async () => {
    // No domain on the cookie → isDomainCompatible short-circuits true, domain
    // is not added to cookieForDriver.
    setEnv("DD_NODOMAIN", JSON.stringify({ name: "sid", value: "v" }));
    const setCookies = sinon.spy(async () => {});
    const driver = makeDriver({ setCookiesImpl: setCookies });
    const result = await loadCookie({
      config,
      step: { loadCookie: "DD_NODOMAIN" },
      driver,
    });
    assert.equal(result.status, "PASS");
    assert.equal(setCookies.firstCall.args[0].domain, undefined);
  });

  // isLocalOrPrivateNetwork branch coverage via the current-page domain. The
  // cookie carries a matching domain so it reaches the localhost check; for
  // private-network hosts the domain is dropped from cookieForDriver.
  const privateHostCases = [
    { host: "10.0.0.5", private: true },
    { host: "192.168.1.1", private: true },
    { host: "172.16.0.1", private: true },
    { host: "172.20.5.5", private: true },
    { host: "127.0.0.1", private: true },
  ];
  for (const c of privateHostCases) {
    it(`private/local host ${c.host}: domain dropped from cookieForDriver`, async () => {
      setEnv(
        "DD_IPCOOKIE",
        JSON.stringify({ name: "sid", value: "v", domain: c.host })
      );
      const setCookies = sinon.spy(async () => {});
      const driver = makeDriver({
        url: `http://${c.host}:3000/x`,
        setCookiesImpl: setCookies,
      });
      const result = await loadCookie({
        config,
        step: { loadCookie: "DD_IPCOOKIE" },
        driver,
      });
      assert.equal(result.status, "PASS");
      // Private/localhost host → domain intentionally omitted.
      assert.equal(setCookies.firstCall.args[0].domain, undefined);
    });
  }

  it("public IP host (8.8.8.8): not private, keeps cookie domain", async () => {
    // 8.8.8.8 is a valid IPv4 but not in any private range → domain retained.
    setEnv(
      "DD_PUBIP",
      JSON.stringify({ name: "sid", value: "v", domain: "8.8.8.8" })
    );
    const setCookies = sinon.spy(async () => {});
    const driver = makeDriver({
      url: "http://8.8.8.8:3000/x",
      setCookiesImpl: setCookies,
    });
    const result = await loadCookie({
      config,
      step: { loadCookie: "DD_PUBIP" },
      driver,
    });
    assert.equal(result.status, "PASS");
    assert.equal(setCookies.firstCall.args[0].domain, "8.8.8.8");
  });

  it("setCookies throwing → catch FAIL", async () => {
    setEnv(
      "DD_THROW_COOKIE",
      JSON.stringify({ name: "sid", value: "v" })
    );
    const driver = makeDriver({
      setCookiesImpl: async () => {
        throw new Error("driver refused");
      },
    });
    const result = await loadCookie({
      config,
      step: { loadCookie: "DD_THROW_COOKIE" },
      driver,
    });
    assert.equal(result.status, "FAIL");
    assert.match(result.description, /Failed to load cookie: driver refused/);
  });
});

// ---------------------------------------------------------------------------
// saveCookie
// ---------------------------------------------------------------------------

describe("saveCookie action (coverage)", function () {
  let tmpDir;
  const savedEnv = {};

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "dd-savecookie-"));
  });

  afterEach(() => {
    sinon.restore();
    fs.rmSync(tmpDir, { recursive: true, force: true });
    for (const k of Object.keys(savedEnv)) {
      if (savedEnv[k] === undefined) delete process.env[k];
      else process.env[k] = savedEnv[k];
      delete savedEnv[k];
    }
  });

  function trackEnv(name) {
    savedEnv[name] = process.env[name];
  }

  function makeDriver({ cookies = [], getCookiesImpl } = {}) {
    return {
      getCookies: getCookiesImpl || (async () => cookies),
    };
  }

  const cookie = {
    name: "sid",
    value: "v",
    domain: ".example.com",
    path: "/",
    secure: true,
    expiry: 9999999999,
  };

  it("invalid step → FAIL", async () => {
    const driver = makeDriver();
    // Object form missing name is schema-invalid.
    const result = await saveCookie({
      config,
      step: { saveCookie: { path: "c.txt" } },
      driver,
    });
    assert.equal(result.status, "FAIL");
    assert.match(result.description, /Invalid step definition/);
  });

  it("cookie not found → FAIL", async () => {
    trackEnv("DD_SAVE_MISS");
    const driver = makeDriver({ cookies: [] });
    const result = await saveCookie({
      config,
      step: { saveCookie: { name: "sid", variable: "DD_SAVE_MISS" } },
      driver,
    });
    assert.equal(result.status, "FAIL");
    assert.match(result.description, /not found/);
  });

  it("cookie not found for domain → FAIL with domain in message", async () => {
    trackEnv("DD_SAVE_DOM");
    const driver = makeDriver({
      cookies: [{ name: "sid", value: "v", domain: "other.org" }],
    });
    const result = await saveCookie({
      config,
      step: {
        saveCookie: { name: "sid", variable: "DD_SAVE_DOM", domain: "example.com" },
      },
      driver,
    });
    assert.equal(result.status, "FAIL");
    assert.match(result.description, /for domain 'example.com'/);
  });

  it("string env form → saves cookie JSON to env var, PASS", async () => {
    trackEnv("sid");
    const driver = makeDriver({ cookies: [cookie] });
    const result = await saveCookie({
      config,
      step: { saveCookie: "sid" },
      driver,
    });
    assert.equal(result.status, "PASS");
    assert.match(result.description, /environment variable 'sid'/);
    assert.deepEqual(JSON.parse(process.env.sid).name, "sid");
  });

  it("object variable form with domain match → PASS", async () => {
    trackEnv("DD_SAVE_OK");
    const driver = makeDriver({ cookies: [cookie] });
    const result = await saveCookie({
      config,
      step: {
        saveCookie: { name: "sid", variable: "DD_SAVE_OK", domain: "example.com" },
      },
      driver,
    });
    assert.equal(result.status, "PASS");
    assert.ok(process.env.DD_SAVE_OK.length > 0);
  });

  it("file form writes Netscape file → PASS", async () => {
    const file = path.join(tmpDir, "out.txt");
    const driver = makeDriver({ cookies: [cookie] });
    const result = await saveCookie({
      config,
      step: {
        saveCookie: { name: "sid", path: "out.txt", directory: tmpDir },
      },
      driver,
    });
    assert.equal(result.status, "PASS");
    assert.equal(result.outputs.path, path.resolve(tmpDir, "out.txt"));
    const written = fs.readFileSync(file, "utf8");
    assert.match(written, /# Netscape HTTP Cookie File/);
    // .example.com → flag TRUE, secure TRUE, name/value present.
    assert.match(written, /\.example\.com\tTRUE\t\/\tTRUE\t9999999999\tsid\tv/);
  });

  it("file exists + overwrite false → FAIL", async () => {
    const file = path.join(tmpDir, "exists.txt");
    fs.writeFileSync(file, "old\n", "utf8");
    const driver = makeDriver({ cookies: [cookie] });
    const result = await saveCookie({
      config,
      step: { saveCookie: { name: "sid", path: "exists.txt", directory: tmpDir } },
      driver,
    });
    assert.equal(result.status, "FAIL");
    assert.match(result.description, /already exists and overwrite is not enabled/);
  });

  it("file exists + overwrite true → overwrites, PASS", async () => {
    const file = path.join(tmpDir, "exists.txt");
    fs.writeFileSync(file, "old\n", "utf8");
    const driver = makeDriver({ cookies: [cookie] });
    const result = await saveCookie({
      config,
      step: {
        saveCookie: {
          name: "sid",
          path: "exists.txt",
          directory: tmpDir,
          overwrite: true,
        },
      },
      driver,
    });
    assert.equal(result.status, "PASS");
    const written = fs.readFileSync(file, "utf8");
    assert.match(written, /Netscape HTTP Cookie File/);
  });

  it("creates nested directory when it does not exist", async () => {
    const nested = path.join(tmpDir, "nested", "deep");
    const driver = makeDriver({ cookies: [cookie] });
    const result = await saveCookie({
      config,
      step: {
        saveCookie: { name: "sid", path: "c.txt", directory: nested },
      },
      driver,
    });
    assert.equal(result.status, "PASS");
    assert.ok(fs.existsSync(path.join(nested, "c.txt")));
  });

  it("session cookie (no expiry, non-dot domain) formats with flag FALSE / expiry 0", async () => {
    const file = path.join(tmpDir, "session.txt");
    const driver = makeDriver({
      cookies: [{ name: "sid", value: "v", domain: "example.com", secure: false }],
    });
    const result = await saveCookie({
      config,
      step: { saveCookie: { name: "sid", path: "session.txt", directory: tmpDir } },
      driver,
    });
    assert.equal(result.status, "PASS");
    const written = fs.readFileSync(file, "utf8");
    assert.match(written, /example\.com\tFALSE\t\/\tFALSE\t0\tsid\tv/);
  });

  it("string .txt form → cookie name from basename, writes file, PASS", async () => {
    // The ".txt" string branch sets cookieName from the basename and filePath
    // from the string; the relative path resolves against config.output.
    const driver = makeDriver({
      cookies: [{ name: "sid", value: "v", domain: "example.com" }],
    });
    const result = await saveCookie({
      config: { ...config, output: tmpDir },
      step: { saveCookie: "sid.txt" },
      driver,
    });
    assert.equal(result.status, "PASS");
    assert.ok(fs.existsSync(path.join(tmpDir, "sid.txt")));
  });

  it("overwrite as the string 'true' also overwrites → PASS", async () => {
    const file = path.join(tmpDir, "exists.txt");
    fs.writeFileSync(file, "old\n", "utf8");
    const driver = makeDriver({ cookies: [cookie] });
    const result = await saveCookie({
      config,
      step: {
        saveCookie: {
          name: "sid",
          path: "exists.txt",
          directory: tmpDir,
          overwrite: "true",
        },
      },
      driver,
    });
    assert.equal(result.status, "PASS");
  });

  it("cookie with no domain/path/secure → formats with empty domain, flag FALSE", async () => {
    // Covers the formatCookieForNetscape fallbacks (domain||'', path||'/', etc.).
    const file = path.join(tmpDir, "bare.txt");
    const driver = makeDriver({ cookies: [{ name: "sid", value: "v" }] });
    const result = await saveCookie({
      config,
      step: { saveCookie: { name: "sid", path: "bare.txt", directory: tmpDir } },
      driver,
    });
    assert.equal(result.status, "PASS");
    const written = fs.readFileSync(file, "utf8");
    // Empty domain → leading tab; flag FALSE; default path '/'; expiry 0.
    assert.match(written, /^\tFALSE\t\/\tFALSE\t0\tsid\tv$/m);
  });

  it("cookie with empty value → [EMPTY] log + value fallback, PASS", async () => {
    // Empty value exercises the '[EMPTY]' debug branch and the value||'' Netscape
    // fallback.
    const file = path.join(tmpDir, "empty-val.txt");
    const driver = makeDriver({
      cookies: [{ name: "sid", value: "", domain: "example.com" }],
    });
    const result = await saveCookie({
      config,
      step: { saveCookie: { name: "sid", path: "empty-val.txt", directory: tmpDir } },
      driver,
    });
    assert.equal(result.status, "PASS");
    const written = fs.readFileSync(file, "utf8");
    // Trailing empty value → line ends right after the name + tab.
    assert.match(written, /example\.com\tFALSE\t\/\tFALSE\t0\tsid\t$/m);
  });

  it("getCookies throwing → catch FAIL", async () => {
    const driver = makeDriver({
      getCookiesImpl: async () => {
        throw new Error("browser gone");
      },
    });
    const result = await saveCookie({
      config,
      step: { saveCookie: "sid" },
      driver,
    });
    assert.equal(result.status, "FAIL");
    assert.match(result.description, /Failed to save cookie: browser gone/);
  });
});
