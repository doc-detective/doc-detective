const { app, BrowserWindow, ipcMain } = require('electron');
const fs = require('fs');
const path = require('path');
const url = require('url');

function createWindow() {
  const win = new BrowserWindow({
    width: 600,
    height: 800,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
      enableRemoteModule: true
    }
  });

  // Load the built React app
  win.loadFile('frontend/index.html')
}

app.whenReady().then(createWindow);

ipcMain.on('read-file', (event) => {
  fs.readFile(path.join(__dirname, 'some-file.txt'), 'utf-8', (err, data) => {
    if (err) {
      console.error('An error occurred reading the file:', err);
      return;
    }
    event.sender.send('file-data', data);
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});
