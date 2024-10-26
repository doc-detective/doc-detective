const { execSync, spawn } = require("child_process");
const semver = require("semver");
const readline = require("readline");
const path = require("path");
const packageJson = require(path.join(__dirname, "../package.json"));

async function checkForUpdates(options = { autoInstall: false, tag: "latest" }) {
  try {
    // Check if running from the global npm install path
    const npmGlobalPath = execSync("npm root -g", { encoding: "utf8" }).trim();
    if (!__dirname.startsWith(npmGlobalPath)) {
      return false;
    }
    console.log("Checking for updates.");

    // Get the latest version from npm registry based on the tag
    const latestVersion = execSync(`npm show doc-detective@${options.tag} version`, {
      encoding: "utf8",
    }).trim();
    const currentVersion = packageJson.version;

    // Compare versions
    if (semver.gt(latestVersion, currentVersion)) {
      console.log(`\nA new version of doc-detective is available!`);
      console.log(`Current version: ${currentVersion}`);
      console.log(`Latest version: ${latestVersion}\n`);

      const currentMajor = semver.major(currentVersion);
      const latestMajor = semver.major(latestVersion);
      if (options.autoInstall && currentMajor === latestMajor) {
        await performUpdate();
        return true;
      }

      // If not auto-installing, prompt the user
      const answer = await promptForUpdate();
      if (answer.toLowerCase() === "y") {
        await performUpdate();
        return true;
      }
    }
    return false;
  } catch (error) {
    console.error("Error checking for updates:", error);
    return false;
  }
}

function promptForUpdate() {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise((resolve) => {
    rl.question("Would you like to update now? (y/N) ", (answer) => {
      rl.close();
      resolve(answer);
    });
  });
}

async function performUpdate(options = { tag: "latest" }) {
  console.log("Installing update. This may take a few minutes.");
  execSync(`npm install -g doc-detective@${tag}`, { stdio: "inherit" });
  console.log("Update complete! Restarting with new version.\n");

  // Get the original command line arguments
  const args = process.argv.slice(2);

  // Spawn a new process with the updated version
  const child = spawn("npx", ["doc-detective", ...args], {
    stdio: "inherit",
    detached: true,
  });

  // Exit the current process once the new one is spawned
  child.on("spawn", () => {
    process.exit(0);
  });
}

module.exports = { checkForUpdates };
