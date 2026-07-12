// Shared archive-download helpers for runtime installers (androidInstaller,
// windowsBash). Deliberately dependency-light: importing this module must not
// pull in any installer, so consumers like `install status` don't pay the
// load cost of toolchains they never touch.

import fs from "node:fs";
import https from "node:https";
import { spawn } from "node:child_process";

/* c8 ignore start — real network downloads and archive-extractor spawns; the
   callers' orchestration around these helpers is what unit tests exercise
   (with these effects stubbed), matching the pre-extraction coverage shape in
   androidInstaller.ts. */

// Download a URL to a file, following redirects (release CDNs redirect).
// Fails on any non-2xx final status. 60s to first response, and an
// idle-socket timeout once streaming, so a stalled connection fails rather
// than hanging the installer forever.
export async function downloadFile(
  url: string,
  dest: string,
  redirects = 0
): Promise<void> {
  if (redirects > 10) throw new Error(`too many redirects fetching ${url}`);
  await new Promise<void>((resolve, reject) => {
    const req = https.get(url, (res) => {
      const status = res.statusCode ?? 0;
      if (status >= 300 && status < 400 && res.headers.location) {
        res.resume();
        downloadFile(res.headers.location, dest, redirects + 1).then(
          resolve,
          reject
        );
        return;
      }
      if (status !== 200) {
        res.resume();
        reject(new Error(`download failed (HTTP ${status}) for ${url}`));
        return;
      }
      const file = fs.createWriteStream(dest);
      res.pipe(file);
      file.on("finish", () => file.close(() => resolve()));
      file.on("error", reject);
    });
    req.setTimeout(60000, () =>
      req.destroy(new Error(`download timed out: ${url}`))
    );
    req.on("error", reject);
  });
}

// Run a real executable (tar/unzip/powershell — never a .bat/.cmd shim, so
// no shell is needed) and fail on a non-zero exit.
async function run(cmd: string, args: string[]): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    let stderr = "";
    const child = spawn(cmd, args, { windowsHide: true });
    child.stderr?.on("data", (d: any) => (stderr += d.toString()));
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) resolve();
      else
        reject(
          new Error(`${cmd} exited with code ${code}: ${stderr.slice(0, 500)}`)
        );
    });
  });
}

// Extract a .zip cross-platform, trying the extractors likely to be present:
// unzip / bsdtar on POSIX, bsdtar / PowerShell Expand-Archive on Windows.
export async function extractZip(
  zipPath: string,
  destDir: string
): Promise<void> {
  const attempts: [string, string[]][] =
    process.platform === "win32"
      ? [
          ["tar", ["-xf", zipPath, "-C", destDir]],
          [
            "powershell",
            [
              "-NoProfile",
              "-NonInteractive",
              "-Command",
              // Escape apostrophes for PS single-quoted literals (doubling)
              // so a path containing `'` can't break the command parse.
              `Expand-Archive -LiteralPath '${zipPath.replace(/'/g, "''")}' -DestinationPath '${destDir.replace(/'/g, "''")}' -Force`,
            ],
          ],
        ]
      : [
          ["unzip", ["-q", "-o", zipPath, "-d", destDir]],
          ["tar", ["-xf", zipPath, "-C", destDir]],
        ];
  let lastError: any;
  for (const [cmd, args] of attempts) {
    try {
      await run(cmd, args);
      return;
    } catch (error) {
      lastError = error;
    }
  }
  throw new Error(
    `couldn't extract ${zipPath}: no working zip extractor found (${lastError?.message ?? lastError})`
  );
}
/* c8 ignore stop */
