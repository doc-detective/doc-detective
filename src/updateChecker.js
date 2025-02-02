const { execSync, spawn } = require("child_process");
const semver = require("semver");
const path = require("path");
const packageJson = require(path.join(__dirname, "../package.json"));
const { confirm } = require("@inquirer/prompts");

/**
 * Checks for updates to the "doc-detective" package and optionally installs them.
 *
 * @param {Object} [options] - Options for the update check.
 * @param {boolean} [options.autoInstall=false] - Whether to automatically install the update if available.
 * @param {string} [options.tag="latest"] - The npm tag to check for the latest version.
 * @returns {Promise<boolean>} - Returns a promise that resolves to true if an update was installed, otherwise false.
 */
async function checkForUpdates(
  options = { autoInstall: false, tag: "latest" }
) {
  try {
    // Check if running from the global npm install path
    let updateMessage;
    if (
      __dirname.includes("node_modules/doc-detective/") ||
      __dirname.includes("node_modules\\doc-detective\\")
    ) {
      updateMessage =
        `# Run 'npm i -g doc-detective@${options.tag}' to update your install.            #`;
    } else if (__dirname.includes("_npx")) {
      updateMessage =
        `# Run 'npx doc-detective@${options.tag} <command>' to always stay up-to-date.    #`;
    } else {
      return false;
    }

    // Get the latest version from npm registry based on the tag
    const latestVersion = execSync(
      `npm show doc-detective@${options.tag} version`,
      {
        encoding: "utf8",
      }
    ).trim();
    const currentVersion = packageJson.version;

    // Compare versions
    if (semver.gt(latestVersion, currentVersion)) {
      console.log(`
##########################################################################
# A new version of doc-detective is available!                           #
# - Installed version: ${currentVersion}                                            #
# - Latest version: ${latestVersion}                                               #
#                                                                        #
${updateMessage}
##########################################################################`);
      return true;

      // TODO: Implement auto-install
      const currentMajor = semver.major(currentVersion);
      const latestMajor = semver.major(latestVersion);
      if (options.autoInstall && currentMajor === latestMajor) {
        await performUpdate({ tag: options.tag });
        return true;
      }

      // If not auto-installing, prompt the user
      const answer = await promptForUpdate();
      if (answer) {
        await performUpdate({ tag: options.tag });
        return true;
      }
    } else {
      console.log("Up to date.");
    }
    return false;
  } catch (error) {
    console.error("Error checking for updates:", error);
    return false;
  }
}

async function promptForUpdate() {
  const answer = await confirm({
    name: "update",
    message: "Would you like to update now?",
    default: false,
  });
  return answer;
}
async function performUpdate(options = { tag: "latest" }) {
  console.log("Installing update. This may take a few minutes.");
  const updateScript = `
      setTimeout(() => {
        const { spawn } = require('child_process');
        spawn('npm', ['install', '-g', 'doc-detective@${
          options.tag || "latest"
        }'], {
          stdio: 'inherit',
          shell: true,
        });
      }, 1000);
    `;

  // Spawn a detached Node.js process to run the update script
  const updater = spawn(process.argv[0], ["-e", updateScript], {
    detached: true,
    stdio: "inherit",
  });
  updater.unref();

  // Exit the main process
  process.exit(0);
}

module.exports = { checkForUpdates };
