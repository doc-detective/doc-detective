// Unit tests for the pure native-app-surface helpers (phase A1 of
// docs/design/native-app-surfaces.md): app-identifier classification, default
// surface naming, native-selector escape-hatch classification, and the UIA
// (Windows) semantic-locator mapping. Everything here is pure — no driver, no
// fs, no env.
import assert from "node:assert/strict";
import {
  classifyAppIdentifier,
  defaultAppSurfaceName,
  classifyNativeSelector,
  buildUiaLocator,
} from "../dist/core/tests/appSurface.js";

describe("classifyAppIdentifier", function () {
  it("classifies absolute and relative paths", function () {
    assert.equal(classifyAppIdentifier("C:\\Windows\\notepad.exe"), "path");
    assert.equal(classifyAppIdentifier("C:/Windows/notepad.exe"), "path");
    assert.equal(classifyAppIdentifier("/Applications/Calculator.app"), "path");
    assert.equal(classifyAppIdentifier("./build/MyApp.exe"), "path");
  });

  it("classifies UWP AUMIDs by the ! separator", function () {
    assert.equal(
      classifyAppIdentifier("Microsoft.WindowsCalculator_8wekyb3d8bbwe!App"),
      "aumid"
    );
  });

  it("classifies reverse-DNS identifiers (bundle/package/desktop-file ids)", function () {
    assert.equal(classifyAppIdentifier("com.apple.TextEdit"), "id");
    assert.equal(classifyAppIdentifier("org.gnome.TextEditor"), "id");
  });

  it("treats a bare token as a path (relative executable)", function () {
    assert.equal(classifyAppIdentifier("notepad.exe"), "path");
    assert.equal(classifyAppIdentifier("notepad"), "path");
  });
});

describe("defaultAppSurfaceName", function () {
  it("uses the executable basename without extension for paths", function () {
    assert.equal(defaultAppSurfaceName("C:\\Windows\\notepad.exe"), "notepad");
    assert.equal(
      defaultAppSurfaceName("/Applications/Calculator.app"),
      "Calculator"
    );
    assert.equal(defaultAppSurfaceName("./build/MyApp.exe"), "MyApp");
  });

  it("uses the final dot-segment for reverse-DNS ids", function () {
    assert.equal(defaultAppSurfaceName("com.apple.TextEdit"), "TextEdit");
  });

  it("uses the package family name's app token for AUMIDs", function () {
    assert.equal(
      defaultAppSurfaceName("Microsoft.WindowsCalculator_8wekyb3d8bbwe!App"),
      "WindowsCalculator"
    );
  });

  it("falls back to the identifier itself when nothing better exists", function () {
    assert.equal(defaultAppSurfaceName("notepad"), "notepad");
  });
});

describe("classifyNativeSelector", function () {
  it("classifies XPath by // or ( prefix", function () {
    assert.equal(classifyNativeSelector('//Button[@Name="Save"]'), "xpath");
    assert.equal(
      classifyNativeSelector('(//Button)[last()]'),
      "xpath"
    );
  });

  it("classifies ~ prefixed selectors as accessibility ids", function () {
    assert.equal(classifyNativeSelector("~SaveButton"), "accessibilityId");
  });

  it("classifies everything else as CSS (browser-only; caller rejects on app surfaces)", function () {
    assert.equal(classifyNativeSelector("#save"), "css");
    assert.equal(classifyNativeSelector("button.primary"), "css");
  });
});

describe("buildUiaLocator", function () {
  it("maps a lone elementId to the accessibility id strategy (AutomationId fast path)", function () {
    assert.deepEqual(buildUiaLocator({ elementId: "SaveButton" }), {
      strategy: "accessibility id",
      value: "SaveButton",
    });
  });

  it("maps elementText to an XPath @Name match", function () {
    assert.deepEqual(buildUiaLocator({ elementText: "Save" }), {
      strategy: "xpath",
      value: '//*[@Name="Save"]',
    });
  });

  it("ANDs combined semantic criteria into one XPath", function () {
    assert.deepEqual(
      buildUiaLocator({ elementId: "SaveButton", elementText: "Save" }),
      {
        strategy: "xpath",
        value: '//*[@AutomationId="SaveButton" and @Name="Save"]',
      }
    );
  });

  it("maps elementAria role+name to a ControlType tag with @Name", function () {
    assert.deepEqual(
      buildUiaLocator({ elementAria: { role: "button", name: "Save" } }),
      {
        strategy: "xpath",
        value: '//Button[@Name="Save"]',
      }
    );
  });

  it("maps a role-only elementAria to a bare ControlType tag", function () {
    assert.deepEqual(buildUiaLocator({ elementAria: { role: "button" } }), {
      strategy: "xpath",
      value: "//Button",
    });
  });

  it("escapes double quotes in values", function () {
    const { value } = buildUiaLocator({ elementText: 'Say "hi"' });
    assert.equal(value.includes('concat('), true);
  });

  it("returns null for criteria with no UIA mapping", function () {
    assert.equal(buildUiaLocator({}), null);
    assert.equal(buildUiaLocator({ elementClass: "x" }), null);
  });
});
