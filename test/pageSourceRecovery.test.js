import assert from "node:assert/strict";
import {
  parsePageSource,
  smallestNodeContaining,
  xpathForNode,
  recoverAppElement,
} from "../dist/core/tests/pageSourceRecovery.js";

// Synthetic page-source XML per platform, mirroring each driver's real
// attribute shapes (verified against driver sources: NovaWindows emits
// window-relative x/y/width/height, Mac2/WDA emit x/y/width/height, and
// uiautomator2-server emits bounds="[l,t][r,b]").

const WINDOWS_XML = `<?xml version="1.0" encoding="utf-16"?>
<Window AutomationId="root" x="0" y="0" width="800" height="600">
  <Pane AutomationId="body" x="10" y="10" width="780" height="580">
    <Button AutomationId="other" x="20" y="20" width="60" height="30" Name="Other"/>
    <Button AutomationId="gear" x="100" y="100" width="48" height="48" Name="Gear"/>
  </Pane>
</Window>`;

const MAC_XML = `<?xml version="1.0"?>
<XCUIElementTypeApplication x="200" y="100" width="800" height="600">
  <XCUIElementTypeWindow x="200" y="100" width="800" height="600">
    <XCUIElementTypeButton x="300" y="200" width="48" height="48" title="Gear"/>
    <XCUIElementTypeButton x="500" y="200" width="48" height="48" title="Other"/>
  </XCUIElementTypeWindow>
</XCUIElementTypeApplication>`;

const ANDROID_XML = `<?xml version="1.0" encoding="UTF-8"?>
<hierarchy rotation="0">
  <android.widget.FrameLayout bounds="[0,0][1080,1920]">
    <android.widget.Button bounds="[100,200][200,300]" text="Gear"/>
    <android.widget.Button bounds="[300,200][400,300]" text="Other"/>
  </android.widget.FrameLayout>
</hierarchy>`;

const IOS_XML = `<?xml version="1.0"?>
<XCUIElementTypeApplication x="0" y="0" width="390" height="844">
  <XCUIElementTypeWindow x="0" y="0" width="390" height="844">
    <XCUIElementTypeButton x="100" y="200" width="48" height="48" name="Gear"/>
  </XCUIElementTypeWindow>
</XCUIElementTypeApplication>`;

describe("pageSourceRecovery pure helpers", function () {
  it("parses Windows source with window-relative rect attributes", function () {
    const root = parsePageSource(WINDOWS_XML, "windows");
    assert.ok(root, "expected a parsed root");
    assert.equal(root.tag, "Window");
    assert.deepEqual(root.rect, { x: 0, y: 0, width: 800, height: 600 });
    assert.equal(root.children.length, 1);
    assert.equal(root.children[0].children.length, 2);
  });

  it("parses Android bounds attributes", function () {
    const root = parsePageSource(ANDROID_XML, "android");
    assert.ok(root, "expected a parsed root");
    const frame = root.children[0];
    assert.deepEqual(frame.rect, { x: 0, y: 0, width: 1080, height: 1920 });
    assert.deepEqual(frame.children[0].rect, {
      x: 100,
      y: 200,
      width: 100,
      height: 100,
    });
  });

  it("returns null for malformed XML instead of throwing", function () {
    assert.equal(parsePageSource("<not-closed", "windows"), null);
    assert.equal(parsePageSource("", "android"), null);
  });

  it("finds the smallest node containing a point (Windows)", function () {
    const root = parsePageSource(WINDOWS_XML, "windows");
    const node = smallestNodeContaining(root, { x: 124, y: 124 });
    assert.ok(node, "expected a containing node");
    assert.equal(node.tag, "Button");
    assert.equal(node.attributes.AutomationId, "gear");
  });

  it("finds the smallest node containing a point (Android bounds)", function () {
    const root = parsePageSource(ANDROID_XML, "android");
    const node = smallestNodeContaining(root, { x: 150, y: 250 });
    assert.ok(node);
    assert.equal(node.attributes.text, "Gear");
  });

  it("returns null when no bounds contain the point", function () {
    const root = parsePageSource(WINDOWS_XML, "windows");
    assert.equal(smallestNodeContaining(root, { x: 5000, y: 5000 }), null);
  });

  it("builds a positional XPath with same-tag sibling indexes", function () {
    const root = parsePageSource(WINDOWS_XML, "windows");
    const gear = smallestNodeContaining(root, { x: 124, y: 124 });
    assert.equal(xpathForNode(root, gear), "/Window/Pane[1]/Button[2]");
  });

  it("builds a positional XPath for the mac tree", function () {
    const root = parsePageSource(MAC_XML, "mac");
    // Screen coords: the gear button sits at (300,200)-(348,248).
    const gear = smallestNodeContaining(root, { x: 324, y: 224 });
    assert.equal(gear.attributes.title, "Gear");
    assert.equal(
      xpathForNode(root, gear),
      "/XCUIElementTypeApplication/XCUIElementTypeWindow[1]/XCUIElementTypeButton[1]"
    );
  });

  it("builds a positional XPath for the ios tree (points)", function () {
    const root = parsePageSource(IOS_XML, "ios");
    const gear = smallestNodeContaining(root, { x: 124, y: 224 });
    assert.equal(gear.attributes.name, "Gear");
  });
});

describe("recoverAppElement", function () {
  const fakeElement = { elementId: "recovered-1", waitForExist: async () => true };

  it("recovers a real element from the source tree", async function () {
    const driver = {
      getPageSource: async () => WINDOWS_XML,
      $: async (xpath) => {
        assert.equal(xpath, "/Window/Pane[1]/Button[2]");
        return fakeElement;
      },
    };
    const result = await recoverAppElement({
      driver,
      platform: "windows",
      point: { x: 124, y: 124 },
    });
    assert.equal(result.element, fakeElement);
  });

  it("falls back to rect-only when the point hits nothing", async function () {
    const driver = { getPageSource: async () => WINDOWS_XML, $: async () => null };
    const result = await recoverAppElement({
      driver,
      platform: "windows",
      point: { x: 5000, y: 5000 },
    });
    assert.equal(result.element, null);
    assert.match(result.reason, /bounds/i);
  });

  it("never throws on driver failures", async function () {
    const driver = {
      getPageSource: async () => {
        throw new Error("session died");
      },
    };
    const result = await recoverAppElement({
      driver,
      platform: "windows",
      point: { x: 1, y: 1 },
    });
    assert.equal(result.element, null);
    assert.match(result.reason, /session died/);
  });
});

describe("recoverAppElement re-find branches", function () {
  const point = { x: 124, y: 124 };

  it("returns the element when the lazy handle resolves via waitForExist", async function () {
    const lazy = {
      elementId: undefined,
      waitForExist: async () => true,
    };
    const driver = { getPageSource: async () => WINDOWS_XML, $: async () => lazy };
    const result = await recoverAppElement({ driver, platform: "windows", point });
    assert.equal(result.element, lazy);
  });

  it("reports a miss when the lazy handle never resolves", async function () {
    const lazy = {
      elementId: undefined,
      waitForExist: async () => {
        throw new Error("timeout");
      },
    };
    const driver = { getPageSource: async () => WINDOWS_XML, $: async () => lazy };
    const result = await recoverAppElement({ driver, platform: "windows", point });
    assert.equal(result.element, null);
    assert.match(result.reason, /missed/i);
  });

  it("reports a miss when driver.$ returns nothing", async function () {
    const driver = { getPageSource: async () => WINDOWS_XML, $: async () => null };
    const result = await recoverAppElement({ driver, platform: "windows", point });
    assert.equal(result.element, null);
    assert.match(result.reason, /returned nothing/i);
  });

  it("reports a parse failure on junk source", async function () {
    const driver = { getPageSource: async () => "not xml at all <" };
    const result = await recoverAppElement({ driver, platform: "windows", point });
    assert.equal(result.element, null);
    assert.match(result.reason, /parse/i);
  });
});
