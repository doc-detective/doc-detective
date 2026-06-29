import { verifyAppDrivers } from "../dist/core/config.js";

before(async function () {
  const { expect } = await import("chai");
  global.expect = expect;
});

describe("verifyAppDrivers (Layer 2 functional gate)", function () {
  it("keeps an app whose driver verifies", async function () {
    const apps = await verifyAppDrivers(
      [{ app: { name: "chrome" }, driverName: "chromedriver", driverPath: "/c/chromedriver" }],
      { verify: async () => ({ ok: true, version: "124.0.0" }) }
    );
    expect(apps.map((a) => a.name)).to.deep.equal(["chrome"]);
  });

  it("excludes an app whose driver is present but non-functional", async function () {
    const warnings = [];
    const apps = await verifyAppDrivers(
      [{ app: { name: "firefox" }, driverName: "geckodriver", driverPath: "/c/geckodriver" }],
      {
        verify: async () => ({ ok: false, error: "no parseable version" }),
        logger: (msg) => warnings.push(msg),
      }
    );
    expect(apps).to.deep.equal([]);
    // The warning should name both the app and the broken driver.
    const warningText = warnings.join("\n");
    expect(warningText).to.match(/firefox/i);
    expect(warningText).to.match(/geckodriver/i);
  });

  it("passes through an app that has no driver path to check (left to runtime fallback)", async function () {
    const apps = await verifyAppDrivers(
      [{ app: { name: "firefox" } }],
      {
        // verify must not even be consulted when there's no driver path —
        // throwing locks that contract.
        verify: async () => {
          throw new Error("verify should not be called without a driverPath");
        },
      }
    );
    expect(apps.map((a) => a.name)).to.deep.equal(["firefox"]);
  });

  it("gates each app independently — a broken driver does not drop a healthy one", async function () {
    const apps = await verifyAppDrivers(
      [
        { app: { name: "chrome" }, driverName: "chromedriver", driverPath: "/c/chromedriver" },
        { app: { name: "firefox" }, driverName: "geckodriver", driverPath: "/c/geckodriver" },
      ],
      {
        verify: async (driverName) => ({ ok: driverName === "chromedriver" }),
        logger: () => {},
      }
    );
    expect(apps.map((a) => a.name)).to.deep.equal(["chrome"]);
  });
});
