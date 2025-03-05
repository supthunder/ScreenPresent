import { app, BrowserWindow, systemPreferences, ipcMain, desktopCapturer } from 'electron';
import * as path from 'path';

let mainWindow: BrowserWindow | null = null;
let controlWindow: BrowserWindow | null = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 500,
    height: 400,
    resizable: false,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false
    },
    titleBarStyle: 'hiddenInset',
    backgroundColor: '#ffffff'
  });

  mainWindow.loadFile(path.join(__dirname, '../src/index.html'));
}

function createControlWindow() {
  controlWindow = new BrowserWindow({
    width: 120,
    height: 40,
    frame: false,
    resizable: false,
    alwaysOnTop: true,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false
    },
    transparent: true,
    backgroundColor: '#00ffffff'
  });

  controlWindow.loadFile(path.join(__dirname, '../src/control.html'));
  controlWindow.setVisibleOnAllWorkspaces(true);
}

app.whenReady().then(() => {
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

// Handle screen recording permission request
ipcMain.handle('request-screen-permission', async () => {
  if (process.platform !== 'darwin') {
    return true;
  }
  
  // For screen recording, we need to check the status
  const status = systemPreferences.getMediaAccessStatus('screen');
  if (status === 'not-determined') {
    // This will open System Preferences > Security & Privacy > Screen Recording
    systemPreferences.askForMediaAccess('camera'); // This is a workaround to trigger the dialog
  }
  return status === 'granted';
});

// Handle accessibility permission check
ipcMain.handle('check-accessibility-permission', () => {
  if (process.platform !== 'darwin') {
    return true;
  }
  return systemPreferences.isTrustedAccessibilityClient(false);
});

// Handle opening System Preferences for accessibility
ipcMain.handle('open-accessibility-preferences', () => {
  if (process.platform === 'darwin') {
    // Open System Preferences to Security & Privacy > Accessibility
    return systemPreferences.isTrustedAccessibilityClient(true);
  }
  return true;
});

// Get available screens
ipcMain.handle('get-sources', async () => {
  const sources = await desktopCapturer.getSources({
    types: ['screen'],
    thumbnailSize: {
      width: 150,
      height: 150
    }
  });
  return sources;
});

// Start recording
ipcMain.on('start-recording', () => {
  createControlWindow();
  if (mainWindow) {
    mainWindow.hide();
  }
});

// Stop recording
ipcMain.on('stop-recording', () => {
  if (controlWindow) {
    controlWindow.close();
    controlWindow = null;
  }
  if (mainWindow) {
    mainWindow.show();
  }
}); 