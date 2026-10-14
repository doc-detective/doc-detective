// The Git Bash resolver finds `git` on PATH in-process (whereLike) instead of
// spawning `where.exe git` (~80 ms per run on Windows). Only the DIRECTORY of
// each hit matters (bash candidates derive from it), so whereLike returns one
// hit per directory, in where.exe's directory order. The parity test pins
// that order against the real where.exe on Windows.
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { spawnSync } from "node:child_process";
import { whereLike } from "../dist/runtime/windowsBash.js";

const W = path.win32;

describe("runtime/windowsBash whereLike", function () {
  const files = (list) => {
    const set = new Set(list.map((f) => f.toLowerCase()));
    return (p) => set.has(p.toLowerCase());
  };

  it("searches the current directory first, then PATH in order, one hit per directory", async function () {
    const hits = await whereLike("git", {
      cwd: "C:\\work",
      env: { PATH: "C:\\A;C:\\B;C:\\A\\;C:\\C", PATHEXT: ".COM;.EXE;.BAT;.CMD" },
      isFile: files(["C:\\work\\git.bat", "C:\\A\\git.exe", "C:\\A\\git.cmd", "C:\\C\\git"]),
    });
    assert.deepEqual(hits.map((h) => W.dirname(h)), ["C:\\work", "C:\\A", "C:\\C"]);
  });

  it("matches the bare name and PATHEXT extensions only", async function () {
    const deps = (list) => ({
      cwd: "C:\\work",
      env: { PATH: "C:\\A", PATHEXT: ".COM;.EXE" },
      isFile: files(list),
    });
    assert.deepEqual(await whereLike("git", deps(["C:\\A\\git.js", "C:\\A\\git.txt"])), []);
    assert.equal((await whereLike("git", deps(["C:\\A\\git"]))).length, 1);
    assert.equal((await whereLike("git", deps(["C:\\A\\git.com"]))).length, 1);
  });

  it("trims entries and resolves relative ones against the current directory", async function () {
    const hits = await whereLike("git", {
      cwd: "C:\\work",
      env: { PATH: "  ;rel;C:\\Space  ", PATHEXT: ".EXE" },
      isFile: files(["C:\\work\\rel\\git.exe", "C:\\Space\\git.exe"]),
    });
    assert.deepEqual(hits.map((h) => W.dirname(h)), ["C:\\work\\rel", "C:\\Space"]);
  });

  it("skips a quoted PATH entry, as where.exe does (quotes are not stripped)", async function () {
    // Measured: `where.exe` finds nothing through PATH="\"C:\\Program Files\\Git\\cmd\""
    // and finds the tool through the same entry unquoted. Stripping quotes
    // here would pick candidates where.exe never offers, changing which bash
    // the resolver returns; when the in-process lookup finds nothing, the
    // resolver falls back to where.exe exactly as before.
    const hits = await whereLike("git", {
      cwd: "C:\\work",
      env: { PATH: '"C:\\Program Files\\Git\\cmd";C:\\B', PATHEXT: ".EXE" },
      isFile: files(["C:\\Program Files\\Git\\cmd\\git.exe", "C:\\B\\git.exe"]),
    });
    assert.deepEqual(hits.map((h) => h.toLowerCase()), ["c:\\b\\git.exe"]);
  });

  it("returns [] with no PATH", async function () {
    assert.deepEqual(await whereLike("git", { cwd: "C:\\work", env: {}, isFile: () => false }), []);
  });

  it("finds the same directories, in the same order, as where.exe", async function () {
    if (process.platform !== "win32") this.skip();
    // Long-name form: where.exe prints long names, os.tmpdir() may be 8.3.
    const root = fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(), "dd-wherelike-")));
    try {
      const name = "ddfaketool";
      const mk = (dir, names) => {
        fs.mkdirSync(path.join(root, dir), { recursive: true });
        for (const n of names) fs.writeFileSync(path.join(root, dir, n.replace("N", name)), "");
      };
      mk("cwd", ["N.bat"]);
      mk("d1", ["N", "N.exe", "N.txt"]);
      mk("d2", ["N.cmd"]);
      mk("d 3", ["N.exe"]);
      mk("none", ["N.js"]);
      mk("cwd/rel", ["N.com"]);
      fs.mkdirSync(path.join(root, "asdir", `${name}.exe`), { recursive: true });
      const env = {
        PATH: [
          path.join(root, "d1"),
          `"${path.join(root, "d 3")}"`,
          path.join(root, "none"),
          "rel",
          path.join(root, "asdir"),
          `${path.join(root, "d2")}\\  `,
          "",
          path.join(root, "d1"),
        ].join(";"),
        PATHEXT: ".COM;.EXE;.BAT;.CMD",
      };
      const cwd = path.join(root, "cwd");
      const real = spawnSync(path.join(process.env.SystemRoot, "System32", "where.exe"), [name], {
        cwd,
        env: { ...process.env, ...env },
        encoding: "utf8",
      });
      const realDirs = [];
      for (const line of real.stdout.split(/\r?\n/).filter(Boolean)) {
        const d = path.dirname(line.trim()).toLowerCase();
        if (!realDirs.includes(d)) realDirs.push(d);
      }
      const ours = (await whereLike(name, { cwd, env })).map((h) => path.dirname(h).toLowerCase());
      assert.ok(realDirs.length >= 3, `where.exe found too little to compare: ${real.stdout}`);
      assert.deepEqual(ours, realDirs);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
});
