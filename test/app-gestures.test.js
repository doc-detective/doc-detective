// Unit tests for the phase A6 movement engine (movement.ts) and the
// per-platform gesture adapters (appGestures.ts). Everything here runs against
// fake drivers that record their calls — no Appium, no devices.
import assert from "node:assert/strict";
import {
  MOVEMENT_INSET,
  DEFAULT_SWIPE_DISTANCE,
  DEFAULT_SWIPE_DURATION,
  directionToPoints,
  fractionsToPixels,
  surfaceToAbsolutePixels,
  performMovement,
  getBrowserViewportRect,
} from "../dist/core/tests/movement.js";
import {
  APP_GESTURES,
  ANDROID_KEYCODES,
  IOS_BUTTONS,
  IOS_TEXT_KEYS,
  DEVICE_KEYS,
} from "../dist/core/tests/appGestures.js";

// A fake wdio driver that records execute()/getWindowRect() calls and exposes
// a recording W3C action builder.
function makeFakeDriver({
  rect = { x: 0, y: 0, width: 1000, height: 2000 },
  executeResults = {},
} = {}) {
  const calls = [];
  const actions = [];
  return {
    calls,
    actions,
    async getWindowRect() {
      calls.push({ method: "getWindowRect" });
      return rect;
    },
    async execute(command, args) {
      calls.push({ method: "execute", command, args });
      if (command in executeResults) return executeResults[command];
      return undefined;
    },
    action(type, opts) {
      const chain = { type, opts, steps: [] };
      actions.push(chain);
      const builder = {
        move(args) {
          chain.steps.push({ kind: "move", args });
          return builder;
        },
        down(args) {
          chain.steps.push({ kind: "down", args });
          return builder;
        },
        up(args) {
          chain.steps.push({ kind: "up", args });
          return builder;
        },
        pause(ms) {
          chain.steps.push({ kind: "pause", ms });
          return builder;
        },
        async perform() {
          chain.performed = true;
        },
      };
      return builder;
    },
  };
}

function fakeElement(id = "el-1") {
  return { elementId: id };
}

describe("movement: directionToPoints", function () {
  it("computes an upward finger motion centered in the surface", function () {
    const { from, to } = directionToPoints("up", 0.5);
    assert.deepEqual(from, { x: 0.5, y: 0.75 });
    assert.deepEqual(to, { x: 0.5, y: 0.25 });
  });

  it("computes down/left/right symmetrically", function () {
    assert.deepEqual(directionToPoints("down", 0.5), {
      from: { x: 0.5, y: 0.25 },
      to: { x: 0.5, y: 0.75 },
    });
    assert.deepEqual(directionToPoints("left", 0.5), {
      from: { x: 0.75, y: 0.5 },
      to: { x: 0.25, y: 0.5 },
    });
    assert.deepEqual(directionToPoints("right", 0.5), {
      from: { x: 0.25, y: 0.5 },
      to: { x: 0.75, y: 0.5 },
    });
  });

  it("clamps long swipes to the inset box (edge-gesture avoidance)", function () {
    const { from, to } = directionToPoints("up", 1);
    assert.equal(from.y, 1 - MOVEMENT_INSET);
    assert.equal(to.y, MOVEMENT_INSET);
  });

  it("defaults distance to the exported default", function () {
    const { from } = directionToPoints("up");
    assert.equal(from.y, 0.5 + DEFAULT_SWIPE_DISTANCE / 2);
  });
});

describe("movement: fractionsToPixels", function () {
  it("maps fractions into the rect, honoring its origin offset", function () {
    const rect = { x: 100, y: 50, width: 400, height: 300 };
    assert.deepEqual(fractionsToPixels(rect, { x: 0.5, y: 0.5 }), {
      x: 300,
      y: 200,
    });
    assert.deepEqual(fractionsToPixels(rect, { x: 0, y: 1 }), { x: 100, y: 350 });
  });

  it("rounds to whole pixels", function () {
    const rect = { x: 0, y: 0, width: 333, height: 333 };
    const px = fractionsToPixels(rect, { x: 0.5, y: 0.5 });
    assert.ok(Number.isInteger(px.x));
    assert.ok(Number.isInteger(px.y));
  });
});

describe("movement: surfaceToAbsolutePixels", function () {
  it("offsets author pixels by the rect origin", function () {
    const rect = { x: 100, y: 50, width: 400, height: 300 };
    assert.deepEqual(surfaceToAbsolutePixels(rect, { x: 200, y: 100 }), {
      x: 300,
      y: 150,
    });
  });

  it("passes pixels through unchanged at a zero origin", function () {
    const rect = { x: 0, y: 0, width: 400, height: 300 };
    assert.deepEqual(surfaceToAbsolutePixels(rect, { x: 200, y: 100 }), {
      x: 200,
      y: 100,
    });
  });
});

describe("movement: performMovement", function () {
  it("builds a W3C pointer chain: move, down, pause, timed move, up", async function () {
    const driver = makeFakeDriver();
    await performMovement({
      driver,
      from: { x: 500, y: 1500 },
      to: { x: 500, y: 500 },
      duration: 300,
      pointerType: "touch",
    });
    assert.equal(driver.actions.length, 1);
    const chain = driver.actions[0];
    assert.equal(chain.type, "pointer");
    assert.equal(chain.opts.parameters.pointerType, "touch");
    assert.equal(chain.performed, true);
    const kinds = chain.steps.map((s) => s.kind);
    assert.deepEqual(kinds, ["move", "down", "pause", "move", "up"]);
    assert.deepEqual(
      { x: chain.steps[0].args.x, y: chain.steps[0].args.y },
      { x: 500, y: 1500 }
    );
    assert.equal(chain.steps[3].args.duration, 300);
    assert.deepEqual(
      { x: chain.steps[3].args.x, y: chain.steps[3].args.y },
      { x: 500, y: 500 }
    );
  });

  it("defaults pointerType to mouse and duration to the exported default", async function () {
    const driver = makeFakeDriver();
    await performMovement({
      driver,
      from: { x: 0, y: 0 },
      to: { x: 100, y: 100 },
    });
    const chain = driver.actions[0];
    assert.equal(chain.opts.parameters.pointerType, "mouse");
    assert.equal(chain.steps[3].args.duration, DEFAULT_SWIPE_DURATION);
  });
});

describe("movement: getBrowserViewportRect", function () {
  it("reads innerWidth/innerHeight through driver.execute", async function () {
    const driver = {
      async execute(fn) {
        return [1024, 768];
      },
    };
    assert.deepEqual(await getBrowserViewportRect(driver), {
      x: 0,
      y: 0,
      width: 1024,
      height: 768,
    });
  });
});

describe("appGestures: key maps", function () {
  it("maps the device keys on Android", function () {
    assert.equal(ANDROID_KEYCODES.$BACK$, 4);
    assert.equal(ANDROID_KEYCODES.$HOME$, 3);
    assert.equal(ANDROID_KEYCODES.$APP_SWITCH$, 187);
    assert.equal(ANDROID_KEYCODES.$VOLUME_UP$, 24);
    assert.equal(ANDROID_KEYCODES.$VOLUME_DOWN$, 25);
  });

  it("maps common editing keys on Android", function () {
    assert.equal(ANDROID_KEYCODES.$ENTER$, 66);
    assert.equal(ANDROID_KEYCODES.$RETURN$, 66);
    assert.equal(ANDROID_KEYCODES.$TAB$, 61);
    assert.equal(ANDROID_KEYCODES.$BACKSPACE$, 67);
    assert.equal(ANDROID_KEYCODES.$ARROW_DOWN$, 20);
  });

  it("maps the physical buttons iOS has", function () {
    assert.equal(IOS_BUTTONS.$HOME$, "home");
    assert.equal(IOS_BUTTONS.$VOLUME_UP$, "volumeup");
    assert.equal(IOS_BUTTONS.$VOLUME_DOWN$, "volumedown");
    assert.equal(IOS_BUTTONS.$BACK$, undefined);
  });

  it("folds text-equivalent keys into typed text on iOS", function () {
    assert.equal(IOS_TEXT_KEYS.$ENTER$, "\n");
    assert.equal(IOS_TEXT_KEYS.$TAB$, "\t");
  });

  it("names the device-only keys that need no element criteria", function () {
    for (const key of [
      "$BACK$",
      "$HOME$",
      "$APP_SWITCH$",
      "$VOLUME_UP$",
      "$VOLUME_DOWN$",
    ]) {
      assert.ok(DEVICE_KEYS.has(key), key);
    }
    assert.ok(!DEVICE_KEYS.has("$ENTER$"));
  });
});

describe("appGestures: android", function () {
  const android = APP_GESTURES.android;

  it("directional swipe uses mobile: swipeGesture over the inset window area", async function () {
    const driver = makeFakeDriver({
      rect: { x: 0, y: 0, width: 1000, height: 2000 },
    });
    await android.swipe(driver, {
      direction: "up",
      distance: 0.8,
      duration: 500,
    });
    const call = driver.calls.find(
      (c) => c.method === "execute" && c.command === "mobile: swipeGesture"
    );
    assert.ok(call, "expected a mobile: swipeGesture call");
    assert.equal(call.args.direction, "up");
    assert.equal(call.args.percent, 0.8);
    assert.equal(call.args.left, 100);
    assert.equal(call.args.top, 200);
    assert.equal(call.args.width, 800);
    assert.equal(call.args.height, 1600);
  });

  it("point-to-point swipe rides the W3C touch movement engine with pixel coords", async function () {
    const driver = makeFakeDriver({
      rect: { x: 0, y: 0, width: 1000, height: 2000 },
    });
    await android.swipe(driver, {
      from: { x: 500, y: 1600 },
      to: { x: 500, y: 400 },
      duration: 400,
    });
    assert.equal(driver.actions.length, 1);
    assert.equal(driver.actions[0].opts.parameters.pointerType, "touch");
    assert.deepEqual(
      { x: driver.actions[0].steps[0].args.x, y: driver.actions[0].steps[0].args.y },
      { x: 500, y: 1600 }
    );
  });

  it("long-press uses mobile: longClickGesture with the element id and ms duration", async function () {
    const driver = makeFakeDriver();
    await android.longPress(driver, fakeElement("abc"), 800);
    const call = driver.calls.find(
      (c) => c.method === "execute" && c.command === "mobile: longClickGesture"
    );
    assert.ok(call);
    assert.equal(call.args.elementId, "abc");
    assert.equal(call.args.duration, 800);
  });

  it("presses mapped keycodes via mobile: pressKey", async function () {
    const driver = makeFakeDriver();
    const result = await android.pressKey(driver, "$BACK$");
    assert.deepEqual(result, {});
    const call = driver.calls.find(
      (c) => c.method === "execute" && c.command === "mobile: pressKey"
    );
    assert.equal(call.args.keycode, 4);
  });

  it("errors on a token with no Android keycode", async function () {
    const driver = makeFakeDriver();
    const result = await android.pressKey(driver, "$F5$");
    assert.ok(result.error);
    assert.equal(
      driver.calls.filter((c) => c.method === "execute").length,
      0
    );
  });

  it("types into the focused element via mobile: type", async function () {
    const driver = makeFakeDriver();
    await android.typeFocused(driver, "Hi Bob!");
    const call = driver.calls.find(
      (c) => c.method === "execute" && c.command === "mobile: type"
    );
    assert.equal(call.args.text, "Hi Bob!");
  });

  it("scrollStep scrolls content-down and reports whether more remains", async function () {
    const driver = makeFakeDriver({
      executeResults: { "mobile: scrollGesture": true },
    });
    const more = await android.scrollStep(driver);
    assert.equal(more, true);
    const call = driver.calls.find(
      (c) => c.method === "execute" && c.command === "mobile: scrollGesture"
    );
    assert.equal(call.args.direction, "down");
    assert.ok(call.args.percent > 0 && call.args.percent <= 1);
  });
});

describe("appGestures: ios", function () {
  const ios = APP_GESTURES.ios;

  it("directional swipe uses mobile: dragFromToForDuration with screen coords", async function () {
    const driver = makeFakeDriver({
      rect: { x: 0, y: 0, width: 400, height: 800 },
    });
    await ios.swipe(driver, { direction: "up", distance: 0.5, duration: 500 });
    const call = driver.calls.find(
      (c) =>
        c.method === "execute" && c.command === "mobile: dragFromToForDuration"
    );
    assert.ok(call);
    assert.equal(call.args.fromX, 200);
    assert.equal(call.args.fromY, 600);
    assert.equal(call.args.toX, 200);
    assert.equal(call.args.toY, 200);
    // XCUITest requires duration in seconds within [0.5, 60].
    assert.ok(call.args.duration >= 0.5);
  });

  it("clamps sub-500ms durations to the driver's 0.5s floor and passes pixels through", async function () {
    const driver = makeFakeDriver({
      rect: { x: 0, y: 0, width: 400, height: 800 },
    });
    await ios.swipe(driver, {
      from: { x: 40, y: 80 },
      to: { x: 360, y: 720 },
      duration: 100,
    });
    const call = driver.calls.find(
      (c) =>
        c.method === "execute" && c.command === "mobile: dragFromToForDuration"
    );
    assert.equal(call.args.duration, 0.5);
    assert.equal(call.args.fromX, 40);
    assert.equal(call.args.toY, 720);
  });

  it("long-press uses mobile: touchAndHold with seconds", async function () {
    const driver = makeFakeDriver();
    await ios.longPress(driver, fakeElement("xyz"), 800);
    const call = driver.calls.find(
      (c) => c.method === "execute" && c.command === "mobile: touchAndHold"
    );
    assert.equal(call.args.elementId, "xyz");
    assert.equal(call.args.duration, 0.8);
  });

  it("presses physical buttons via mobile: pressButton", async function () {
    const driver = makeFakeDriver();
    const result = await ios.pressKey(driver, "$HOME$");
    assert.deepEqual(result, {});
    const call = driver.calls.find(
      (c) => c.method === "execute" && c.command === "mobile: pressButton"
    );
    assert.equal(call.args.name, "home");
  });

  it("rejects $BACK$ with guidance (iOS has no back button)", async function () {
    const driver = makeFakeDriver();
    const result = await ios.pressKey(driver, "$BACK$");
    assert.ok(result.error);
    assert.match(result.error, /back/i);
    assert.equal(driver.calls.filter((c) => c.method === "execute").length, 0);
  });

  it("rejects $APP_SWITCH$ with guidance", async function () {
    const driver = makeFakeDriver();
    const result = await ios.pressKey(driver, "$APP_SWITCH$");
    assert.ok(result.error);
  });

  it("has no focused-typing support (mobile: keys is iPad-only)", function () {
    assert.equal(ios.typeFocused, undefined);
  });

  it("scrollStep swipes content-down via dragFromToForDuration and can't detect the end", async function () {
    const driver = makeFakeDriver({
      rect: { x: 0, y: 0, width: 400, height: 800 },
    });
    const more = await ios.scrollStep(driver);
    assert.equal(more, true);
    const call = driver.calls.find(
      (c) =>
        c.method === "execute" && c.command === "mobile: dragFromToForDuration"
    );
    assert.ok(call);
    // Finger moves up: fromY below toY reveals content further down.
    assert.ok(call.args.fromY > call.args.toY);
  });
});

describe("appGestures: windows", function () {
  const windows = APP_GESTURES.windows;

  it("directional swipe scrolls with wheel clicks at the window center", async function () {
    const driver = makeFakeDriver({
      rect: { x: 100, y: 50, width: 1000, height: 600 },
    });
    await windows.swipe(driver, { direction: "up", distance: 0.5, duration: 500 });
    const call = driver.calls.find(
      (c) => c.method === "execute" && c.command === "windows: scroll"
    );
    assert.ok(call);
    assert.equal(call.args.x, 600);
    assert.equal(call.args.y, 350);
    // Swipe up reveals content below: wheel rotates backward (negative deltaY).
    assert.ok(call.args.deltaY < 0);
    assert.equal(call.args.deltaX, undefined);
  });

  it("horizontal swipe maps to deltaX", async function () {
    const driver = makeFakeDriver({
      rect: { x: 0, y: 0, width: 1000, height: 600 },
    });
    await windows.swipe(driver, { direction: "left", distance: 0.5, duration: 500 });
    const call = driver.calls.find(
      (c) => c.method === "execute" && c.command === "windows: scroll"
    );
    // Swipe left reveals content to the right: wheel rotates right (positive deltaX).
    assert.ok(call.args.deltaX > 0);
    assert.equal(call.args.deltaY, undefined);
  });

  it("point-to-point swipe uses windows: clickAndDrag with window-offset pixels", async function () {
    const driver = makeFakeDriver({
      rect: { x: 100, y: 50, width: 1000, height: 600 },
    });
    await windows.swipe(driver, {
      from: { x: 200, y: 300 },
      to: { x: 800, y: 300 },
      duration: 400,
    });
    const call = driver.calls.find(
      (c) => c.method === "execute" && c.command === "windows: clickAndDrag"
    );
    assert.ok(call);
    assert.equal(call.args.startX, 300);
    assert.equal(call.args.startY, 350);
    assert.equal(call.args.endX, 900);
    assert.equal(call.args.durationMs, 400);
  });

  it("long-press holds the primary button via windows: click durationMs", async function () {
    const driver = makeFakeDriver();
    await windows.longPress(driver, fakeElement("win-el"), 800);
    const call = driver.calls.find(
      (c) => c.method === "execute" && c.command === "windows: click"
    );
    assert.equal(call.args.elementId, "win-el");
    assert.equal(call.args.durationMs, 800);
  });

  it("has no key vocabulary (desktop rejection stays in typeKeys)", function () {
    assert.equal(windows.pressKey, undefined);
    assert.equal(windows.typeFocused, undefined);
    assert.equal(windows.scrollStep, undefined);
  });
});

describe("appGestures: mac", function () {
  const mac = APP_GESTURES.mac;

  it("directional swipe scrolls with pixel deltas at the window center", async function () {
    const driver = makeFakeDriver({
      rect: { x: 0, y: 0, width: 800, height: 600 },
    });
    await mac.swipe(driver, { direction: "up", distance: 0.5, duration: 500 });
    const call = driver.calls.find(
      (c) => c.method === "execute" && c.command === "macos: scroll"
    );
    assert.ok(call);
    assert.equal(call.args.x, 400);
    assert.equal(call.args.y, 300);
    assert.equal(call.args.deltaY, -300);
    assert.equal(call.args.deltaX, 0);
  });

  it("point-to-point swipe uses macos: clickAndDrag with float seconds and window-offset pixels", async function () {
    const driver = makeFakeDriver({
      rect: { x: 0, y: 0, width: 800, height: 600 },
    });
    await mac.swipe(driver, {
      from: { x: 200, y: 300 },
      to: { x: 600, y: 300 },
      duration: 1500,
    });
    const call = driver.calls.find(
      (c) => c.method === "execute" && c.command === "macos: clickAndDrag"
    );
    assert.ok(call);
    assert.equal(call.args.startX, 200);
    assert.equal(call.args.endX, 600);
    assert.equal(call.args.duration, 1.5);
  });

  it("long-press prefers a W3C mouse chain on the element", async function () {
    const driver = makeFakeDriver();
    await mac.longPress(driver, fakeElement("mac-el"), 900);
    assert.equal(driver.actions.length, 1);
    const chain = driver.actions[0];
    assert.equal(chain.opts.parameters.pointerType, "mouse");
    const kinds = chain.steps.map((s) => s.kind);
    assert.deepEqual(kinds, ["move", "down", "pause", "up"]);
    assert.equal(chain.steps[2].ms, 900);
  });

  it("falls back to macos: clickAndDragAndHold when W3C actions throw", async function () {
    const driver = makeFakeDriver();
    driver.action = () => {
      throw new Error("actions not supported");
    };
    await mac.longPress(driver, fakeElement("mac-el"), 900);
    const call = driver.calls.find(
      (c) =>
        c.method === "execute" && c.command === "macos: clickAndDragAndHold"
    );
    assert.ok(call);
    assert.equal(call.args.sourceElementId, "mac-el");
    assert.equal(call.args.destinationElementId, "mac-el");
    assert.equal(call.args.holdDuration, 0.9);
  });

  it("has no key vocabulary", function () {
    assert.equal(mac.pressKey, undefined);
    assert.equal(mac.typeFocused, undefined);
  });
});
