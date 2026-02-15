const { app, BrowserWindow, systemPreferences } = require('electron');
const path = require('path');

let mainWindow;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 860,
    height: 700,
    backgroundColor: '#1a1a2e',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
    },
    titleBarStyle: 'hiddenInset',
    trafficLightPosition: { x: 15, y: 15 },
  });

  mainWindow.loadFile(path.join(__dirname, 'renderer', 'index.html'));

  // Grant microphone permission requests from the renderer
  mainWindow.webContents.session.setPermissionRequestHandler(
    (webContents, permission, callback) => {
      if (permission === 'media') {
        callback(true);
      } else {
        callback(false);
      }
    }
  );
}

app.whenReady().then(async () => {
  // On macOS, proactively request mic access at the OS level
  if (process.platform === 'darwin') {
    const statusBefore = systemPreferences.getMediaAccessStatus('microphone');
    console.log(`[mic] permission status before request: ${statusBefore}`);

    if (statusBefore !== 'granted') {
      const granted = await systemPreferences.askForMediaAccess('microphone');
      console.log(`[mic] askForMediaAccess result: ${granted}`);
    }

    const statusAfter = systemPreferences.getMediaAccessStatus('microphone');
    console.log(`[mic] permission status after request: ${statusAfter}`);
  }

  createWindow();
});

app.on('window-all-closed', () => {
  app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});
