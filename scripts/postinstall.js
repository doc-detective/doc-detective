import path from "node:path";
import { fileURLToPath } from "node:url";
import * as browsers from "@puppeteer/browsers";
import * as geckodriver from "geckodriver";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * Run post-install setup tasks for the package, installing required browser binaries and drivers.
 *
 * This entrypoint performs repository-level installation steps needed after package install.
 */
async function main() {
  await installBrowsers();
  // await installAppiumDepencencies();
}

main();

/**
 * Install local browser binaries and drivers used by the project.
 *
 * Performs platform-detected installations of Chrome, Firefox, and ChromeDriver into
 * the repository's "browser-snapshots" cache, and downloads Geckodriver to a
 * bin directory determined from the runtime location. Temporarily changes the
 * working directory to the package root while installing and restores it when done.
 *
 * Side effects:
 * - Writes browser snapshots into "<repo>/browser-snapshots".
 * - Sets the `GECKODRIVER_CACHE_DIR` environment variable before downloading Geckodriver.
 * - Logs a message when a particular download is not available.
 */
async function installBrowsers() {
  // Move to package root directory to correctly set browser snapshot directory
  let cwd = process.cwd();
  process.chdir(path.join(__dirname, ".."));

  // Meta
  const browser_platform = browsers.detectBrowserPlatform();
  const cacheDir = path.resolve("browser-snapshots");

  // Install Chrome
  try {
    console.log("Installing Chrome browser");
    let browser = "chrome";
    let buildId = await browsers.resolveBuildId(
      browser,
      browser_platform,
      "stable"
    );
    await browsers.install({
      browser,
      buildId,
      cacheDir,
    });
  } catch (error) {
    console.log("Chrome download not available.", error);
  }

  // Install Firefox
  try {
    console.log("Installing Firefox browser");
    let browser = "firefox";
    let buildId = await browsers.resolveBuildId(
      browser,
      browser_platform,
      "latest"
    );
    await browsers.install({
      browser,
      buildId,
      cacheDir,
    });
  } catch (error) {
    console.log("Firefox download not available.", error);
  }

  // Install ChromeDriver
  try {
    console.log("Installing ChromeDriver binary");
    let browser = "chromedriver";
    let buildId = await browsers.resolveBuildId(
      browser,
      browser_platform,
      "stable"
    );
    await browsers.install({
      browser,
      buildId,
      cacheDir,
    });
  } catch (error) {
    console.log("ChromeDriver download not available.", error);
  }

  // Install Geckodriver
  try {
    console.log("Installing Geckodriver binary");
    let binPath;
    if (__dirname.includes("AppData\\Roaming\\")) {
      // Running from global install on Windows
      binPath = path.join(__dirname.split("node_modules")[0]);
    } else if (__dirname.includes("node_modules")) {
      // If running from node_modules
      binPath = path.join(__dirname, "../../.bin");
    } else {
      binPath = path.join(__dirname, "../node_modules/.bin");
    }
    process.env.GECKODRIVER_CACHE_DIR = binPath;
    await geckodriver.download();
  } catch (error) {
    console.log("Geckodriver download not available.", error);
  }
  // Move back to original directory
  process.chdir(cwd);
}