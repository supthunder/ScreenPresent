import { app, BrowserWindow, systemPreferences, ipcMain, desktopCapturer } from 'electron';
import * as path from 'path';

let mainWindow: BrowserWindow | null = null;
let controlWindow: BrowserWindow | null = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 500,
    height: 200,
    resizable: false,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false
    },
    frame: false,
    transparent: true,
    backgroundColor: '#00000000',
    hasShadow: false
  });

  mainWindow.loadFile(path.join(__dirname, '../src/index.html'));
  
  // Position the window in the center of the screen
  const { screen } = require('electron');
  const primaryDisplay = screen.getPrimaryDisplay();
  const { width: screenWidth, height: screenHeight } = primaryDisplay.workAreaSize;
  const windowWidth = 500;
  const windowHeight = 200;
  mainWindow.setPosition(
    Math.floor(screenWidth / 2 - windowWidth / 2),
    Math.floor(screenHeight / 2 - windowHeight / 2)
  );
}

function createControlWindow() {
  controlWindow = new BrowserWindow({
    width: 340,
    height: 48,
    frame: false,
    transparent: true,
    resizable: false,
    alwaysOnTop: true,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false
    },
    skipTaskbar: true,
    hasShadow: true
  });

  controlWindow.loadFile('src/control.html');
  controlWindow.setVisibleOnAllWorkspaces(true);
  
  // Position window in the top-center of the screen
  const { screen } = require('electron');
  const primaryDisplay = screen.getPrimaryDisplay();
  const { width: screenWidth } = primaryDisplay.workAreaSize;
  
  controlWindow.setPosition(
    Math.round((screenWidth - 340) / 2),
    10
  );
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