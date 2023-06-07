const path = require("path");
const { spawnCommand } = require("../src/utils");

main();

async function main() {
  await installAppiumDepencencies();
}

// Run `appium` to install the Gecko driver, Chromium driver, and image plugin.
async function installAppiumDepencencies() {
  if (__dirname.includes("node_modules")) {
    // If running from node_modules
    appiumPath = path.join(__dirname, "../../appium");
  } else {
    appiumPath = path.join(__dirname, "../node_modules/appium");
  }
  appiumDriverList = await spawnCommand(
    `node "${appiumPath}" driver list --installed`
  );
  appiumPluginsList = await spawnCommand(
    `node "${appiumPath}" plugin list --installed`
  );
  await appiumDriverList;
  await appiumPluginsList;
  // Install gecko and chromium drivers if not already installed
  if (!appiumDriverList.stderr.includes("gecko")) {
    geckoInstall = await spawnCommand(
      `node ${appiumPath} driver install gecko`
    );
    if (geckoInstall.stderr.includes("successfully installed"))
      console.log("Installed Gecko driver.");
  }
  if (!appiumDriverList.stderr.includes("chromium")) {
    chromiumInstall = await spawnCommand(
      `node ${appiumPath} driver install chromium`
    );
    if (chromiumInstall.stderr.includes("successfully installed"))
      console.log("Installed Chromium driver.");
  }
  if (!appiumPluginsList.stderr.includes("images")) {
    imagesInstall = await spawnCommand(
      `node ${appiumPath} plugin install images`
    );
    if (imagesInstall.stderr.includes("successfully installed"))
      console.log("Installed Image plugin.");
  }
}
