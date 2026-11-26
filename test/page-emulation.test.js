// ADR 01223: page emulation on the context `browser` object.
import assert from "node:assert/strict";
import {
  emulationCapabilities,
  unsupportedEmulation,
  applyEmulation,
  freezeDateSource,
  keepEmulationCapabilities,
  emulationOpenError,
} from "../dist/core/utils.js";
import { getDriverCapabilities } from "../dist/core/tests.js";

describe("emulationCapabilities", function () {
  it("returns nothing for a browser with no emulation keys", function () {
    for (const name of ["chrome", "firefox", "webkit"]) {
      assert.deepEqual(emulationCapabilities({ name }), {
        args: [],
        prefs: {},
      });
    }
  });

  describe("chrome", function () {
    const caps = (browser) => emulationCapabilities({ name: "chrome", ...browser });

    it("maps colorScheme to --blink-settings", function () {
      assert.deepEqual(caps({ colorScheme: "dark" }).args, [
        "--blink-settings=preferredColorScheme=0",
      ]);
      assert.deepEqual(caps({ colorScheme: "light" }).args, [
        "--blink-settings=preferredColorScheme=1",
      ]);
    });

    it("maps locale to --lang and intl.accept_languages", function () {
      const c = caps({ locale: "de-DE" });
      assert.deepEqual(c.args, ["--lang=de-DE"]);
      assert.deepEqual(c.prefs, { "intl.accept_languages": "de-DE" });
    });

    it("maps deviceScaleFactor to --force-device-scale-factor", function () {
      assert.deepEqual(caps({ deviceScaleFactor: 1.5 }).args, [
        "--force-device-scale-factor=1.5",
      ]);
    });

    it("maps reducedMotion to the force-prefers flags", function () {
      assert.deepEqual(caps({ reducedMotion: "reduce" }).args, [
        "--force-prefers-reduced-motion",
      ]);
      assert.deepEqual(caps({ reducedMotion: "no-preference" }).args, [
        "--force-prefers-no-reduced-motion",
      ]);
    });

    it("leaves timezone and clock to BiDi", function () {
      assert.deepEqual(
        caps({ timezone: "Europe/Berlin", clock: "2026-12-03T09:00:00Z" }),
        { args: [], prefs: {} }
      );
    });
  });

  describe("firefox", function () {
    const caps = (browser) => emulationCapabilities({ name: "firefox", ...browser });

    it("maps colorScheme to the content-override pref", function () {
      assert.deepEqual(caps({ colorScheme: "dark" }).prefs, {
        "layout.css.prefers-color-scheme.content-override": 0,
      });
      assert.deepEqual(caps({ colorScheme: "light" }).prefs, {
        "layout.css.prefers-color-scheme.content-override": 1,
      });
    });

    it("maps locale to the locale and accept-language prefs", function () {
      assert.deepEqual(caps({ locale: "fr-FR" }).prefs, {
        "intl.locale.requested": "fr-FR",
        "intl.accept_languages": "fr-FR",
      });
    });

    it("maps deviceScaleFactor to layout.css.devPixelsPerPx", function () {
      assert.deepEqual(caps({ deviceScaleFactor: 2 }).prefs, {
        "layout.css.devPixelsPerPx": "2",
      });
    });

    it("maps reducedMotion to ui.prefersReducedMotion", function () {
      assert.deepEqual(caps({ reducedMotion: "reduce" }).prefs, {
        "ui.prefersReducedMotion": 1,
      });
      assert.deepEqual(caps({ reducedMotion: "no-preference" }).prefs, {
        "ui.prefersReducedMotion": 0,
      });
    });

    it("sets nothing for timezone or clock, which skip", function () {
      assert.deepEqual(
        caps({ timezone: "Asia/Tokyo", clock: "2026-12-03T09:00:00Z" }),
        { args: [], prefs: {} }
      );
    });
  });
});

describe("unsupportedEmulation", function () {
  it("is null when no emulation key is set", function () {
    assert.equal(unsupportedEmulation({ name: "webkit" }, "mac"), null);
    assert.equal(unsupportedEmulation(undefined, "mac"), null);
  });

  it("is null for every key in chrome on every desktop platform", function () {
    const browser = {
      name: "chrome",
      colorScheme: "dark",
      locale: "de-DE",
      timezone: "Europe/Berlin",
      deviceScaleFactor: 2,
      reducedMotion: "reduce",
      clock: "2026-12-03T09:00:00Z",
    };
    for (const platform of ["windows", "mac", "linux"]) {
      assert.equal(unsupportedEmulation(browser, platform), null);
    }
  });

  it("is null for firefox's launch-time keys", function () {
    const browser = {
      name: "firefox",
      colorScheme: "dark",
      locale: "de-DE",
      deviceScaleFactor: 2,
      reducedMotion: "reduce",
    };
    for (const platform of ["windows", "mac", "linux"]) {
      assert.equal(unsupportedEmulation(browser, platform), null);
    }
  });

  // Headless Firefox on Linux ignored `TZ` in CI, so there's no fallback.
  it("skips firefox timezone on every platform", function () {
    for (const platform of ["windows", "mac", "linux"]) {
      assert.equal(
        unsupportedEmulation({ name: "firefox", timezone: "UTC" }, platform),
        "Skipped: `firefox` can't set `timezone`."
      );
    }
  });

  it("skips firefox clock on every platform", function () {
    for (const platform of ["windows", "mac", "linux"]) {
      assert.equal(
        unsupportedEmulation(
          { name: "firefox", clock: "2026-12-03T09:00:00Z" },
          platform
        ),
        "Skipped: `firefox` can't set `clock`."
      );
    }
  });

  for (const key of [
    ["colorScheme", "dark"],
    ["locale", "de-DE"],
    ["timezone", "UTC"],
    ["deviceScaleFactor", 2],
    ["reducedMotion", "reduce"],
    ["clock", "2026-12-03T09:00:00Z"],
  ]) {
    it(`skips safari for ${key[0]}, named as safari`, function () {
      for (const name of ["safari", "webkit"]) {
        assert.equal(
          unsupportedEmulation({ name, [key[0]]: key[1] }, "mac"),
          `Skipped: \`safari\` can't set \`${key[0]}\`.`
        );
      }
    });
  }

  it("skips every key on a managed device", function () {
    assert.equal(
      unsupportedEmulation({ name: "chrome", colorScheme: "dark" }, "android"),
      "Skipped: `chrome` can't set `colorScheme` on Android."
    );
    assert.equal(
      unsupportedEmulation({ name: "safari", locale: "de-DE" }, "ios"),
      "Skipped: `safari` can't set `locale` on iOS."
    );
  });

  it("names the first unsupported key", function () {
    assert.equal(
      unsupportedEmulation(
        { name: "firefox", locale: "de-DE", clock: "2026-12-03T09:00:00Z" },
        "linux"
      ),
      "Skipped: `firefox` can't set `clock`."
    );
  });
});

// A later startSurface session whose engine can't set a context key fails
// the step instead of skipping it.
describe("emulationOpenError", function () {
  it("is null when the engine can set every key", function () {
    assert.equal(
      emulationOpenError("chrome", { name: "firefox", clock: "2026-12-03T09:00:00Z" }, "linux"),
      null
    );
  });

  it("names the engine and the key it can't set", function () {
    assert.equal(
      emulationOpenError("firefox", { name: "chrome", clock: "2026-12-03T09:00:00Z" }, "linux"),
      "Couldn't open `firefox`: `firefox` can't set `clock`."
    );
    assert.equal(
      emulationOpenError("webkit", { name: "chrome", colorScheme: "dark" }, "mac"),
      "Couldn't open `webkit`: `safari` can't set `colorScheme`."
    );
  });
});

describe("getDriverCapabilities with page emulation", function () {
  const runnerDetails = {
    environment: { platform: "linux" },
    availableApps: [
      { name: "chrome", path: "/c", driver: "/cd" },
      { name: "firefox", path: "/f", driver: "/gd" },
    ],
  };

  it("adds chrome args and prefs alongside the defaults", function () {
    const caps = getDriverCapabilities({
      runnerDetails,
      name: "chrome",
      options: {
        headless: true,
        emulation: { name: "chrome", colorScheme: "dark", locale: "de-DE" },
      },
    });
    const opts = caps["goog:chromeOptions"];
    assert.ok(opts.args.includes("--blink-settings=preferredColorScheme=0"));
    assert.ok(opts.args.includes("--lang=de-DE"));
    assert.ok(opts.args.includes("--headless"));
    assert.equal(opts.prefs["intl.accept_languages"], "de-DE");
    assert.equal(opts.prefs["download.prompt_for_download"], false);
  });

  it("adds firefox prefs alongside the defaults, and no env", function () {
    const caps = getDriverCapabilities({
      runnerDetails,
      name: "firefox",
      options: {
        headless: true,
        emulation: { name: "firefox", reducedMotion: "reduce", timezone: "UTC" },
      },
    });
    const opts = caps["moz:firefoxOptions"];
    assert.equal(opts.prefs["ui.prefersReducedMotion"], 1);
    assert.equal(
      opts.prefs["toolkit.legacyUserProfileCustomizations.stylesheets"],
      true
    );
    assert.equal(opts.env, undefined);
  });
});

describe("applyEmulation", function () {
  const fakeDriver = (fail) => {
    const calls = [];
    return {
      calls,
      emulationSetTimezoneOverride: async (p) => {
        if (fail === "timezone") throw new Error("unsupported");
        calls.push(["timezone", p]);
      },
      scriptAddPreloadScript: async (p) => {
        if (fail === "clock") throw new Error("unsupported");
        calls.push(["clock", p]);
      },
      execute: async (script) => {
        if (fail === "clock-now") throw new Error("no page");
        calls.push(["execute", script]);
      },
    };
  };

  it("sends nothing for a browser outside BIDI_BROWSERS", async function () {
    const d = fakeDriver();
    await applyEmulation(d, { name: "firefox", timezone: "UTC" });
    assert.deepEqual(d.calls, []);
  });

  it("sends nothing without timezone or clock", async function () {
    const d = fakeDriver();
    await applyEmulation(d, { name: "chrome", colorScheme: "dark" });
    assert.deepEqual(d.calls, []);
  });

  it("overrides the timezone over BiDi in chrome", async function () {
    const d = fakeDriver();
    await applyEmulation(d, { name: "chrome", timezone: "Europe/Berlin" });
    // Chrome rejects a global override; the default user context holds
    // every tab and window the session opens.
    assert.deepEqual(d.calls, [
      ["timezone", { timezone: "Europe/Berlin", userContexts: ["default"] }],
    ]);
  });

  it("adds a preload script that freezes Date in chrome", async function () {
    const d = fakeDriver();
    await applyEmulation(d, { name: "chrome", clock: "2026-12-03T09:00:00Z" });
    assert.equal(d.calls[0][0], "clock");
    assert.equal(
      d.calls[0][1].functionDeclaration,
      freezeDateSource(Date.parse("2026-12-03T09:00:00Z"))
    );
  });

  // The preload runs only for documents created after it's added, so the
  // document already open gets the same replacement directly.
  it("also freezes Date in the document that's already open", async function () {
    const d = fakeDriver();
    await applyEmulation(d, { name: "chrome", clock: "2026-12-03T09:00:00Z" });
    assert.equal(d.calls.length, 2);
    assert.equal(d.calls[1][0], "execute");
    assert.equal(
      d.calls[1][1],
      `(${freezeDateSource(Date.parse("2026-12-03T09:00:00Z"))})();`
    );
  });

  it("throws the FAIL message when BiDi rejects a command", async function () {
    await assert.rejects(
      applyEmulation(fakeDriver("timezone"), {
        name: "chrome",
        timezone: "Europe/Berlin",
      }),
      { message: "Couldn't set `timezone` to `Europe/Berlin` in `chrome`." }
    );
    await assert.rejects(
      applyEmulation(fakeDriver("clock"), {
        name: "chrome",
        clock: "2026-12-03T09:00:00Z",
      }),
      {
        message:
          "Couldn't set `clock` to `2026-12-03T09:00:00Z` in `chrome`.",
      }
    );
    await assert.rejects(
      applyEmulation(fakeDriver("clock-now"), {
        name: "chrome",
        clock: "2026-12-03T09:00:00Z",
      }),
      {
        message:
          "Couldn't set `clock` to `2026-12-03T09:00:00Z` in `chrome`.",
      }
    );
  });

  // A value that skipped schema validation must never freeze pages at NaN.
  it("fails an unparseable clock before sending anything", async function () {
    const d = fakeDriver();
    await assert.rejects(
      applyEmulation(d, { name: "chrome", clock: "not a date" }),
      { message: "Couldn't set `clock` to `not a date` in `chrome`." }
    );
    assert.deepEqual(d.calls, []);
  });
});

describe("freezeDateSource", function () {
  it("freezes Date.now and new Date() and keeps explicit dates", function () {
    const T = Date.parse("2026-12-03T09:00:00Z");
    const scope = { Date };
    // Run the declaration against a sandboxed globalThis.
    const fn = new Function("globalThis", `return (${freezeDateSource(T)})();`);
    fn(scope);
    const D = scope.Date;
    assert.equal(D.now(), T);
    assert.equal(new D().getTime(), T);
    assert.equal(new D(0).getTime(), 0);
    assert.equal(new D(2020, 0, 1).getFullYear(), 2020);
    assert.ok(new D() instanceof D);
    assert.equal(typeof D(), "string");
    assert.equal(D.UTC(2020, 0, 1), Date.UTC(2020, 0, 1));
  });

  it("keeps Date subclasses", function () {
    const T = Date.parse("2026-12-03T09:00:00Z");
    const scope = { Date };
    new Function("globalThis", `return (${freezeDateSource(T)})();`)(scope);
    class CustomDate extends scope.Date {
      label() {
        return "date";
      }
    }
    const now = new CustomDate();
    assert.equal(now.label(), "date");
    assert.equal(now.getTime(), T);
    assert.ok(now instanceof CustomDate);
    assert.equal(new CustomDate(0).getTime(), 0);
    assert.equal(new CustomDate(0).label(), "date");
  });
});

describe("keepEmulationCapabilities", function () {
  it("restores chrome emulation args and prefs after authored options replace them", function () {
    const caps = {
      "goog:chromeOptions": {
        args: ["--disable-extensions"],
        prefs: { "intl.accept_languages": "en-US", "custom.pref": 1 },
      },
    };
    keepEmulationCapabilities(caps, {
      name: "chrome",
      colorScheme: "dark",
      locale: "de-DE",
    });
    assert.deepEqual(caps["goog:chromeOptions"].args, [
      "--disable-extensions",
      "--blink-settings=preferredColorScheme=0",
      "--lang=de-DE",
    ]);
    assert.deepEqual(caps["goog:chromeOptions"].prefs, {
      "intl.accept_languages": "de-DE",
      "custom.pref": 1,
    });
  });

  it("doesn't duplicate args that are already there", function () {
    const caps = {
      "goog:chromeOptions": { args: ["--blink-settings=preferredColorScheme=0"] },
    };
    keepEmulationCapabilities(caps, { name: "chrome", colorScheme: "dark" });
    assert.deepEqual(caps["goog:chromeOptions"].args, [
      "--blink-settings=preferredColorScheme=0",
    ]);
  });

  // Chrome lets --force-prefers-reduced-motion win over its opposite, so the
  // authored opposite flag must go.
  it("drops an authored motion flag that opposes reducedMotion", function () {
    const caps = {
      "goog:chromeOptions": {
        args: ["--force-prefers-reduced-motion", "--disable-extensions"],
      },
    };
    keepEmulationCapabilities(caps, {
      name: "chrome",
      reducedMotion: "no-preference",
    });
    assert.deepEqual(caps["goog:chromeOptions"].args, [
      "--disable-extensions",
      "--force-prefers-no-reduced-motion",
    ]);
  });

  // ChromeDriver keeps only the last --blink-settings switch, so the
  // color scheme joins the authored settings in one argument.
  it("merges the color scheme into authored --blink-settings", function () {
    const caps = {
      "goog:chromeOptions": {
        args: ["--blink-settings=imagesEnabled=false,preferredColorScheme=1"],
      },
    };
    keepEmulationCapabilities(caps, { name: "chrome", colorScheme: "dark" });
    assert.deepEqual(caps["goog:chromeOptions"].args, [
      "--blink-settings=imagesEnabled=false,preferredColorScheme=0",
    ]);
  });

  it("restores firefox emulation prefs and keeps authored ones", function () {
    const caps = { "moz:firefoxOptions": { prefs: { "custom.pref": true } } };
    keepEmulationCapabilities(caps, { name: "firefox", reducedMotion: "reduce" });
    assert.deepEqual(caps["moz:firefoxOptions"].prefs, {
      "custom.pref": true,
      "ui.prefersReducedMotion": 1,
    });
  });

  it("leaves capabilities alone without emulation keys", function () {
    const caps = { "goog:chromeOptions": { args: ["--x"] } };
    keepEmulationCapabilities(caps, { name: "chrome" });
    assert.deepEqual(caps, { "goog:chromeOptions": { args: ["--x"] } });
  });
});
