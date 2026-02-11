const path = require("path");
const { existsSync } = require("fs");

exports.setAppiumHome = setAppiumHome;

function setAppiumHome() {
  const corePath = path.join(__dirname, "../../node_modules");
  const pathArray = corePath.split("node_modules");
  // Starting at the first node_modules directory, check if the appium is installed.
  // If it isn't, move to the next node_modules directory.
  let appiumParentPath = pathArray[0];
  for (let i = 1; i < pathArray.length; i++) {
    if (existsSync(path.join(appiumParentPath, "node_modules", "appium"))) {
      break;
    }
    appiumParentPath = path.join(
      appiumParentPath,
      "node_modules",
      pathArray[i]
    );
  }
  process.env.APPIUM_HOME = appiumParentPath;
}
