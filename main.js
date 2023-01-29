const { isSafeToUnpackElectronOnRemoteBuildServer } = require("app-builder-lib/out/platformPackager");
const { app, BrowserWindow } = require("electron");

function createWindow() {
  let isCalledViaCLI = checkIfCalledViaCLI(process.argv);

  if (isCalledViaCLI) {
    mainWindow = new BrowserWindow({ show: false, width: 0, height: 0 });
  } else {
    mainWindow = new BrowserWindow({
      width: 800,
      height: 600,
      show: false
    });
  }

  mainWindow.loadFile("pages/index.html");
  mainWindow.once('ready-to-show', () => {
    if (isCalledViaCLI) {
      mainWindow.hide();
      // TODO: Add CLI handling
    } else {
      mainWindow.show();
    }
  })
}

function checkIfCalledViaCLI(args) {
  if (args && args.length > 1 && !args[0].includes("electron.exe")) {
    return true;
  }
  return false;
}

app.whenReady().then(createWindow);

app.on("window-all-closed", () => {
  app.quit();
});

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});
