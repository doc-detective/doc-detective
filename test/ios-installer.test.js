import { installIos } from "../dist/runtime/iosInstaller.js";

before(async function () {
  const { expect } = await import("chai");
  global.expect = expect;
});

describe("native app surfaces (A4): install ios", function () {
  it("dry-run returns a preview report", async function () {
    const reports = await installIos({ dryRun: true });
    expect(reports).to.have.length(1);
    expect(reports[0].action).to.equal("dry-run");
    expect((reports[0].notes || []).join(" ")).to.match(/simctl|XCUITest/i);
  });

  it("skips on non-macOS hosts", async function () {
    const reports = await installIos({
      yes: true,
      deps: { platform: "win32" },
    });
    expect(reports[0].action).to.equal("skipped");
    expect((reports[0].notes || []).join(" ")).to.match(/macOS/i);
  });

  it("requires --yes for non-dry-run checks", async function () {
    const reports = await installIos({
      deps: { platform: "darwin" },
    });
    expect(reports[0].action).to.equal("skipped");
    expect((reports[0].notes || []).join(" ")).to.match(/--yes/);
  });

  it("reports up-to-date when xcode-select and simctl are available", async function () {
    const reports = await installIos({
      yes: true,
      deps: {
        platform: "darwin",
        run: () => ({ status: 0, stderr: "" }),
      },
    });
    expect(reports[0].action).to.equal("already-up-to-date");
  });

  it("skips with guidance when xcode-select is not configured", async function () {
    const reports = await installIos({
      yes: true,
      deps: {
        platform: "darwin",
        run: (command) =>
          command === "xcode-select"
            ? { status: 1, stderr: "unable to get active developer directory" }
            : { status: 0, stderr: "" },
      },
    });
    expect(reports[0].action).to.equal("skipped");
    expect((reports[0].notes || []).join(" ")).to.match(/xcode-select/i);
  });

  it("skips with guidance when simctl is unavailable", async function () {
    const reports = await installIos({
      yes: true,
      deps: {
        platform: "darwin",
        run: (command, args) =>
          command === "xcrun" && args[0] === "simctl"
            ? { status: 1, stderr: "simctl not found" }
            : { status: 0, stderr: "" },
      },
    });
    expect(reports[0].action).to.equal("skipped");
    expect((reports[0].notes || []).join(" ")).to.match(/simctl/i);
  });
});
