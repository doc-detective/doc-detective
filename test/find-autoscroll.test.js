// Unit tests for find auto-scroll on mobile app surfaces (phase A6):
// findAppElement scrolls toward content below when the initial wait misses,
// bounded by MAX_FIND_SCROLLS and the step timeout. Desktop platforms don't
// scroll — UIA/AX expose off-screen elements without it.
import assert from "node:assert/strict";
import {
  findAppElement,
  MAX_FIND_SCROLLS,
} from "../dist/core/tests/appSurface.js";

function makeScrollingDriver({
  platform = "android",
  existsAfterScrolls = Infinity,
  canScrollMore = true,
} = {}) {
  const calls = [];
  let scrolls = 0;
  const element = {
    async waitForExist() {
      throw new Error("not found");
    },
    async isExisting() {
      return scrolls >= existsAfterScrolls;
    },
  };
  const driver = {
    calls,
    element,
    scrollCount: () => scrolls,
    async getWindowRect() {
      return { x: 0, y: 0, width: 400, height: 800 };
    },
    async execute(command, args) {
      calls.push({ command, args });
      if (
        command === "mobile: scrollGesture" ||
        command === "mobile: dragFromToForDuration"
      ) {
        scrolls += 1;
        if (command === "mobile: scrollGesture") return canScrollMore;
      }
      return undefined;
    },
    $: async () => element,
  };
  return driver;
}

const criteria = { elementText: "Bottom entry" };

describe("findAppElement auto-scroll (mobile)", function () {
  it("scrolls until the element appears on Android", async function () {
    const driver = makeScrollingDriver({ existsAfterScrolls: 2 });
    const found = await findAppElement({
      driver,
      criteria,
      timeout: 4000,
      platform: "android",
    });
    assert.ok(found.element, found.error);
    assert.equal(driver.scrollCount(), 2);
  });

  it("stops early when the surface can't scroll further", async function () {
    const driver = makeScrollingDriver({ canScrollMore: false });
    const found = await findAppElement({
      driver,
      criteria,
      timeout: 4000,
      platform: "android",
    });
    assert.ok(found.error);
    assert.equal(driver.scrollCount(), 1);
    assert.match(found.error, /scrolled 1 time/);
  });

  it("gives up after MAX_FIND_SCROLLS attempts", async function () {
    const driver = makeScrollingDriver({});
    const found = await findAppElement({
      driver,
      criteria,
      timeout: 250,
      platform: "android",
    });
    assert.ok(found.error);
    assert.equal(driver.scrollCount(), MAX_FIND_SCROLLS);
    assert.match(found.error, new RegExp(`scrolled ${MAX_FIND_SCROLLS} time`));
  });

  it("scrolls via dragFromToForDuration on iOS", async function () {
    const driver = makeScrollingDriver({
      platform: "ios",
      existsAfterScrolls: 1,
    });
    const found = await findAppElement({
      driver,
      criteria,
      timeout: 4000,
      platform: "ios",
    });
    assert.ok(found.element, found.error);
    const call = driver.calls.find(
      (c) => c.command === "mobile: dragFromToForDuration"
    );
    assert.ok(call, "expected an iOS scroll drag");
    assert.ok(call.args.fromY > call.args.toY, "finger moves up");
  });

  it("keeps timeout: 0 an immediate check with zero scrolls", async function () {
    const driver = makeScrollingDriver({ existsAfterScrolls: 1 });
    const found = await findAppElement({
      driver,
      criteria,
      timeout: 0,
      platform: "android",
    });
    assert.ok(found.error);
    assert.equal(driver.scrollCount(), 0);
    assert.doesNotMatch(found.error, /scrolled/);
  });

  it("never scrolls desktop app surfaces", async function () {
    const driver = makeScrollingDriver({});
    const found = await findAppElement({
      driver,
      criteria,
      timeout: 200,
      platform: "windows",
    });
    assert.ok(found.error);
    assert.equal(driver.scrollCount(), 0);
    assert.doesNotMatch(found.error, /scrolled/);
  });
});
