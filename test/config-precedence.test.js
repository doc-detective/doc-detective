// ADR 01165: one precedence order. Flags, then the shell environment, then the
// project config, then the user config, then schema defaults. Objects merge deep.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { expect } from "chai";
import { setConfig } from "../dist/utils.js";

const ENV_KEYS = [
  "DOC_DETECTIVE",
  "DOC_DETECTIVE_CONFIG",
  "DOC_DETECTIVE_CACHE_DIR",
  "DOC_DETECTIVE_SKIP_AUTO_UPDATE",
  "DOC_DETECTIVE_DEBUG",
  "DEBUG",
  "DO_NOT_TRACK",
  "XDG_CONFIG_HOME",
  "APPDATA",
];

describe("config precedence", function () {
  let tmp;
  let saved;
  let cwd;
  let printed;
  let originalError;

  const writeJson = (file, value) => {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, JSON.stringify(value));
    return file;
  };
  const project = (value) => writeJson(path.join(tmp, "cfg", "dd.json"), value);
  const user = (value) => writeJson(path.join(tmp, "xdg", "doc-detective", "config.json"), value);

  beforeEach(function () {
    tmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "dd-precedence-")));
    saved = Object.fromEntries(ENV_KEYS.map((key) => [key, process.env[key]]));
    for (const key of ENV_KEYS) delete process.env[key];
    process.env.XDG_CONFIG_HOME = path.join(tmp, "xdg");
    process.env.APPDATA = path.join(tmp, "xdg");
    cwd = process.cwd();
    process.chdir(tmp);
    printed = [];
    originalError = console.error;
    console.error = (line) => printed.push(String(line));
  });

  afterEach(function () {
    console.error = originalError;
    process.chdir(cwd);
    for (const key of ENV_KEYS) {
      if (saved[key] === undefined) delete process.env[key];
      else process.env[key] = saved[key];
    }
    fs.rmSync(tmp, { recursive: true, force: true });
  });

  it("merges the user config under the project config, deeply", async function () {
    user({ telemetry: { send: false } });
    const config = await setConfig({ configPath: project({ telemetry: { userId: "x" } }), args: {} });
    expect(config.telemetry).to.deep.equal({ send: false, userId: "x" });
  });

  it("merges DOC_DETECTIVE_CONFIG over the project config, deeply", async function () {
    process.env.DOC_DETECTIVE_CONFIG = JSON.stringify({ telemetry: { userId: "env" } });
    const config = await setConfig({ configPath: project({ telemetry: { send: false } }), args: {} });
    expect(config.telemetry).to.deep.equal({ send: false, userId: "env" });
  });

  describe("the deprecated DOC_DETECTIVE variable", function () {
    const legacy = (config) => (process.env.DOC_DETECTIVE = JSON.stringify({ config }));

    it("still applies its config over the project config, and warns", async function () {
      legacy({ logLevel: "error" });
      const config = await setConfig({ configPath: project({ logLevel: "info" }), args: {} });
      expect(config.logLevel).to.equal("error");
      expect(printed).to.include(
        'Warning: `DOC_DETECTIVE` is deprecated. Move its "config" object to `DOC_DETECTIVE_CONFIG`.'
      );
    });

    it("loses to DOC_DETECTIVE_CONFIG", async function () {
      legacy({ logLevel: "error" });
      process.env.DOC_DETECTIVE_CONFIG = JSON.stringify({ logLevel: "warning" });
      expect((await setConfig({ args: {} })).logLevel).to.equal("warning");
    });

    it("loses to flags", async function () {
      legacy({ logLevel: "silent" });
      expect((await setConfig({ args: { logLevel: "info" } })).logLevel).to.equal("info");
    });

    it("no longer turns on unsafe steps with `container`", async function () {
      process.env.DOC_DETECTIVE = JSON.stringify({ container: "docdetective/docdetective:linux" });
      expect((await setConfig({ args: {} })).allowUnsafeSteps).to.not.equal(true);
    });
  });

  describe("cacheDir", function () {
    it("resolves a config file's relative cacheDir against the config file", async function () {
      const config = await setConfig({ configPath: project({ cacheDir: "c" }), args: {} });
      expect(path.resolve(config.cacheDir)).to.equal(path.join(tmp, "cfg", "c"));
    });

    it("lets DOC_DETECTIVE_CACHE_DIR beat the config, against the working directory", async function () {
      process.env.DOC_DETECTIVE_CACHE_DIR = "envc";
      const config = await setConfig({ configPath: project({ cacheDir: "c" }), args: {} });
      expect(path.resolve(config.cacheDir)).to.equal(path.join(tmp, "envc"));
    });

    it("lets --cache-dir beat DOC_DETECTIVE_CACHE_DIR", async function () {
      process.env.DOC_DETECTIVE_CACHE_DIR = "envc";
      const config = await setConfig({ args: { cacheDir: "flagc" } });
      expect(path.resolve(config.cacheDir)).to.equal(path.join(tmp, "flagc"));
    });
  });

  describe("output", function () {
    it("resolves a config file's relative output against the config file", async function () {
      const config = await setConfig({ configPath: project({ output: "res.json" }), args: {} });
      expect(config.output).to.equal(path.join(tmp, "cfg", "res.json"));
    });

    it("resolves --output against the working directory", async function () {
      const config = await setConfig({ configPath: project({ output: "res.json" }), args: { output: "res.json" } });
      expect(config.output).to.equal(path.join(tmp, "res.json"));
    });
  });

  describe("DOC_DETECTIVE_SKIP_AUTO_UPDATE", function () {
    for (const [value, autoUpdate] of [
      ["1", false],
      ["true", false],
      ["0", true],
      ["false", true],
    ]) {
      it(`${value} sets autoUpdate to ${autoUpdate}`, async function () {
        process.env.DOC_DETECTIVE_SKIP_AUTO_UPDATE = value;
        expect((await setConfig({ args: {} })).autoUpdate).to.equal(autoUpdate);
      });
    }

    it("beats DOC_DETECTIVE_CONFIG, and loses to --auto-update", async function () {
      process.env.DOC_DETECTIVE_CONFIG = JSON.stringify({ autoUpdate: true });
      process.env.DOC_DETECTIVE_SKIP_AUTO_UPDATE = "1";
      expect((await setConfig({ args: {} })).autoUpdate).to.equal(false);
      expect((await setConfig({ args: { autoUpdate: true } })).autoUpdate).to.equal(true);
    });
  });
});
