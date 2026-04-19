import assert from "node:assert/strict";
import { goTo } from "../dist/core/tests/goTo.js";

// Minimal driver stub: captures the URL passed to `driver.url()` and then
// throws so goTo short-circuits its wait-loop. We only care about the URL
// resolution side-effect on `step.goTo.url`, which happens before the driver
// is invoked.
function stubDriver() {
  const calls = { url: undefined };
  return {
    driver: {
      url: async (u) => {
        calls.url = u;
        throw new Error("stub-short-circuit");
      },
    },
    calls,
  };
}

describe("goTo originParams / params", function () {
  this.timeout(5000);

  it("appends config.originParams to URL resolved against origin", async function () {
    const { driver, calls } = stubDriver();
    const step = { goTo: { url: "/dashboard" } };
    await goTo({
      config: {
        origin: "https://my-app.com",
        originParams: { __clerk_testing_token: "abc" },
      },
      step,
      driver,
    });
    assert.equal(calls.url, "https://my-app.com/dashboard?__clerk_testing_token=abc");
  });

  it("merges step params with config.originParams; step wins on collision", async function () {
    const { driver, calls } = stubDriver();
    const step = {
      goTo: { url: "/p", params: { token: "step-wins", extra: "e" } },
    };
    await goTo({
      config: {
        origin: "https://my-app.com",
        originParams: { token: "config-loses", keep: "k" },
      },
      step,
      driver,
    });
    const qs = new URLSearchParams(calls.url.split("?")[1]);
    assert.equal(qs.get("token"), "step-wins");
    assert.equal(qs.get("extra"), "e");
    assert.equal(qs.get("keep"), "k");
  });

  it("does NOT append params when the step URL is absolute", async function () {
    const { driver, calls } = stubDriver();
    const step = { goTo: { url: "https://my-app.com/dashboard" } };
    await goTo({
      config: {
        origin: "https://my-app.com",
        originParams: { should_not_appear: "1" },
      },
      step,
      driver,
    });
    assert.equal(calls.url, "https://my-app.com/dashboard");
  });

  it("preserves a URL fragment when merging params", async function () {
    const { driver, calls } = stubDriver();
    const step = { goTo: { url: "/p#section" } };
    await goTo({
      config: {
        origin: "https://my-app.com",
        originParams: { t: "x" },
      },
      step,
      driver,
    });
    assert.equal(calls.url, "https://my-app.com/p?t=x#section");
  });

  it("replaces an existing query-string key rather than duplicating it", async function () {
    const { driver, calls } = stubDriver();
    const step = { goTo: { url: "/p?token=old&keep=y" } };
    await goTo({
      config: {
        origin: "https://my-app.com",
        originParams: { token: "new" },
      },
      step,
      driver,
    });
    const qs = new URLSearchParams(calls.url.split("?")[1]);
    assert.deepEqual(qs.getAll("token"), ["new"]);
    assert.equal(qs.get("keep"), "y");
  });

  it("leaves URL unchanged when neither config nor step provides params", async function () {
    const { driver, calls } = stubDriver();
    const step = { goTo: { url: "/p" } };
    await goTo({
      config: { origin: "https://my-app.com" },
      step,
      driver,
    });
    assert.equal(calls.url, "https://my-app.com/p");
  });
});
