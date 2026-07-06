// Unit tests for the phase A6 mobile key vocabulary in typeKeys: the run
// splitter, Android pressKey/typeFocused, iOS pressButton/text folding, the
// desktop rejection (unchanged behavior, updated wording), and the relaxed
// element-criteria rule on mobile app surfaces.
import assert from "node:assert/strict";
import { typeKeys, splitKeyRuns } from "../dist/core/tests/typeKeys.js";
import { createAppSessionState } from "../dist/core/tests/appSurface.js";

const config = { logLevel: "silent" };

function makeMobileSession({ platform, element } = {}) {
  const calls = [];
  const el = element ?? {
    typed: [],
    clicked: 0,
    async waitForExist() {},
    async click() {
      el.clicked += 1;
    },
    async addValue(v) {
      el.typed.push(v);
    },
  };
  const driver = {
    calls,
    async execute(command, args) {
      calls.push({ command, args });
      return undefined;
    },
    $: async () => el,
  };
  const appSession = createAppSessionState();
  appSession.surfaces.set("myapp", {
    name: "myapp",
    appId: "com.example.myapp",
    driver,
    launchedByUs: true,
    platform,
  });
  return { appSession, driver, element: el };
}

describe("splitKeyRuns", function () {
  it("splits text and mapped tokens on Android, merging adjacent text", function () {
    assert.deepEqual(splitKeyRuns(["Hi Bob!", "$ENTER$"], "android"), [
      { kind: "text", text: "Hi Bob!" },
      { kind: "token", token: "$ENTER$" },
    ]);
    assert.deepEqual(splitKeyRuns(["a", "b", "$BACK$", "c"], "android"), [
      { kind: "text", text: "ab" },
      { kind: "token", token: "$BACK$" },
      { kind: "text", text: "c" },
    ]);
  });

  it("passes unknown $…$ tokens through verbatim as text", function () {
    assert.deepEqual(splitKeyRuns(["$WEIRD$", "x"], "android"), [
      { kind: "text", text: "$WEIRD$x" },
    ]);
  });

  it("recognizes digit-bearing sentinels ($F11$, $NUMPAD_0$) as tokens, not text", function () {
    // Neither has an Android keycode mapping, so they fall through to
    // verbatim text — but via the sentinel path, same as $WEIRD$.
    assert.deepEqual(splitKeyRuns(["$F11$"], "android"), [
      { kind: "text", text: "$F11$" },
    ]);
    assert.deepEqual(splitKeyRuns(["$NUMPAD_0$"], "ios"), [
      { kind: "text", text: "$NUMPAD_0$" },
    ]);
  });

  it("folds iOS text-equivalent keys into adjacent text runs", function () {
    assert.deepEqual(splitKeyRuns(["Hi", "$ENTER$", "there"], "ios"), [
      { kind: "text", text: "Hi\nthere" },
    ]);
  });

  it("keeps iOS physical buttons and unsupported device keys as tokens", function () {
    assert.deepEqual(splitKeyRuns(["$HOME$"], "ios"), [
      { kind: "token", token: "$HOME$" },
    ]);
    assert.deepEqual(splitKeyRuns(["$BACK$"], "ios"), [
      { kind: "token", token: "$BACK$" },
    ]);
  });
});

describe("typeKeys mobile app surfaces: Android", function () {
  it("types into a criteria-targeted element then presses mapped keys", async function () {
    const { appSession, driver, element } = makeMobileSession({
      platform: "android",
    });
    const result = await typeKeys({
      config,
      step: {
        type: {
          keys: ["Hi Bob!", "$ENTER$"],
          elementText: "Message",
          surface: { app: "myapp" },
        },
      },
      driver: undefined,
      appSession,
    });
    assert.equal(result.status, "PASS");
    assert.deepEqual(element.typed, ["Hi Bob!"]);
    const press = driver.calls.find((c) => c.command === "mobile: pressKey");
    assert.ok(press, "expected mobile: pressKey");
    assert.equal(press.args.keycode, 66);
  });

  it("types into the focused element when no criteria are given", async function () {
    const { appSession, driver, element } = makeMobileSession({
      platform: "android",
    });
    const result = await typeKeys({
      config,
      step: {
        type: { keys: ["Hi Bob!", "$ENTER$"], surface: { app: "myapp" } },
      },
      driver: undefined,
      appSession,
    });
    assert.equal(result.status, "PASS");
    assert.equal(element.clicked, 0, "no element focus without criteria");
    const typeCall = driver.calls.find((c) => c.command === "mobile: type");
    assert.equal(typeCall.args.text, "Hi Bob!");
    const press = driver.calls.find((c) => c.command === "mobile: pressKey");
    assert.equal(press.args.keycode, 66);
  });

  it("presses device keys without any element criteria", async function () {
    const { appSession, driver } = makeMobileSession({ platform: "android" });
    const result = await typeKeys({
      config,
      step: { type: { keys: ["$BACK$"], surface: { app: "myapp" } } },
      driver: undefined,
      appSession,
    });
    assert.equal(result.status, "PASS");
    const press = driver.calls.find((c) => c.command === "mobile: pressKey");
    assert.equal(press.args.keycode, 4);
  });

  it("wraps a pressKey driver error into a FAIL", async function () {
    const { appSession, driver } = makeMobileSession({ platform: "android" });
    driver.execute = async () => {
      throw new Error("pressKey endpoint missing");
    };
    const result = await typeKeys({
      config,
      step: { type: { keys: ["$BACK$"], surface: { app: "myapp" } } },
      driver: undefined,
      appSession,
    });
    assert.equal(result.status, "FAIL");
    assert.match(result.description, /pressKey endpoint missing/);
  });
});

describe("typeKeys mobile app surfaces: iOS", function () {
  it("folds text-equivalent keys into element typing", async function () {
    const { appSession, element } = makeMobileSession({ platform: "ios" });
    const result = await typeKeys({
      config,
      step: {
        type: {
          keys: ["hi", "$ENTER$"],
          elementText: "Message",
          surface: { app: "myapp" },
        },
      },
      driver: undefined,
      appSession,
    });
    assert.equal(result.status, "PASS");
    assert.deepEqual(element.typed, ["hi\n"]);
  });

  it("presses physical buttons without criteria", async function () {
    const { appSession, driver } = makeMobileSession({ platform: "ios" });
    const result = await typeKeys({
      config,
      step: { type: { keys: ["$HOME$"], surface: { app: "myapp" } } },
      driver: undefined,
      appSession,
    });
    assert.equal(result.status, "PASS");
    const press = driver.calls.find(
      (c) => c.command === "mobile: pressButton"
    );
    assert.equal(press.args.name, "home");
  });

  it("rejects $BACK$ with actionable guidance", async function () {
    const { appSession } = makeMobileSession({ platform: "ios" });
    const result = await typeKeys({
      config,
      step: { type: { keys: ["$BACK$"], surface: { app: "myapp" } } },
      driver: undefined,
      appSession,
    });
    assert.equal(result.status, "FAIL");
    assert.match(result.description, /back/i);
  });

  it("still requires element criteria for text (no focused typing on iOS)", async function () {
    const { appSession } = makeMobileSession({ platform: "ios" });
    const result = await typeKeys({
      config,
      step: { type: { keys: ["hello"], surface: { app: "myapp" } } },
      driver: undefined,
      appSession,
    });
    assert.equal(result.status, "FAIL");
    assert.match(result.description, /element criteria/);
    assert.match(result.description, /iOS/);
  });
});

describe("typeKeys desktop app surfaces (unchanged behavior)", function () {
  function makeDesktopSession() {
    const appSession = createAppSessionState();
    appSession.surfaces.set("charmap", {
      name: "charmap",
      appId: "C:\\Windows\\System32\\charmap.exe",
      driver: { $: async () => ({ async waitForExist() {} }) },
      launchedByUs: true,
    });
    return appSession;
  }

  it("still rejects $KEY$ tokens, naming the mobile-only scope", async function () {
    const result = await typeKeys({
      config,
      step: {
        type: {
          keys: ["$ENTER$"],
          elementText: "x",
          surface: { app: "charmap" },
        },
      },
      driver: undefined,
      appSession: makeDesktopSession(),
    });
    assert.equal(result.status, "FAIL");
    assert.match(result.description, /Special key tokens/);
    assert.match(result.description, /mobile-only/);
  });

  it("rejects digit-bearing tokens ($F11$) on desktop app surfaces too", async function () {
    const result = await typeKeys({
      config,
      step: {
        type: {
          keys: ["$F11$"],
          elementText: "x",
          surface: { app: "charmap" },
        },
      },
      driver: undefined,
      appSession: makeDesktopSession(),
    });
    assert.equal(result.status, "FAIL");
    assert.match(result.description, /Special key tokens/);
  });

  it("still requires element criteria for plain text", async function () {
    const result = await typeKeys({
      config,
      step: { type: { keys: ["hi"], surface: { app: "charmap" } } },
      driver: undefined,
      appSession: makeDesktopSession(),
    });
    assert.equal(result.status, "FAIL");
    assert.match(result.description, /requires element criteria/);
  });
});
