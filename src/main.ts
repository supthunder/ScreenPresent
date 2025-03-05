import { app, BrowserWindow, systemPreferences, ipcMain, desktopCapturer, dialog } from 'electron';
import * as path from 'path';
import * as os from 'os';
import * as fs from 'fs';

let mainWindow: BrowserWindow | null = null;
let controlWindow: BrowserWindow | null = null;
let isRecording = false;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 500,
    height: 400,
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
  const windowHeight = 400;
  mainWindow.setPosition(
    Math.floor(screenWidth / 2 - windowWidth / 2),
    Math.floor(screenHeight / 2 - windowHeight / 2)
  );

  // Log when window is ready
  mainWindow.webContents.on('did-finish-load', () => {
    console.log('Main process: Main window loaded and ready');
  });
}

function createControlWindow(sourceId = null) {
  if (controlWindow) {
    console.log('Main process: Control window already exists');
    return;
  }

  console.log('Main process: Creating control window for source ID');
  
  controlWindow = new BrowserWindow({
    width: 450,
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

  // Fix the path to control.html - use the src directory instead of dist
  controlWindow.loadFile(path.join(__dirname, '../src/control.html'));
  
  // Position the window at the top center of the screen
  const { screen } = require('electron');
  const primaryDisplay = screen.getPrimaryDisplay();
  const { width: screenWidth } = primaryDisplay.workAreaSize;
  const windowWidth = 450;
  controlWindow.setPosition(
    Math.floor(screenWidth / 2 - windowWidth / 2),
    20
  );

  // Log when window is ready
  controlWindow.webContents.on('did-finish-load', () => {
    console.log('Main process: Control window loaded and ready');
    
    // If we have a sourceId, send it to the control window
    if (sourceId) {
      console.log('Main process: Sending source ID to control window');
      setTimeout(() => {
        if (controlWindow) {
          controlWindow.webContents.send('source-id', sourceId);
        }
      }, 500); // Add a small delay to ensure the window is fully loaded
    }
  });

  controlWindow.on('closed', () => {
    console.log('Main process: Control window closed');
    controlWindow = null;
    
    // If recording is still active when window is closed, stop it
    if (isRecording) {
      console.log('Main process: Recording was active, stopping due to window close');
      isRecording = false;
      if (mainWindow) {
        console.log('Main process: Showing main window');
        mainWindow.show();
      }
    }
  });
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

// Handle source ID selection
ipcMain.on('source-id-selected', (event, sourceId) => {
  console.log('Main process: Received source ID selection:', sourceId);
  
  // Create control window if it doesn't exist
  createControlWindow(sourceId);
});

// Handle start recording
ipcMain.on('start-recording', () => {
  console.log('Main process: Start recording received');
  if (mainWindow) {
    console.log('Main process: Hiding main window');
    mainWindow.hide();
  }
  
  if (!controlWindow) {
    console.log('Main process: Creating control window');
    createControlWindow();
  } else {
    console.log('Main process: Control window already exists');
  }
  
  isRecording = true;
  console.log('Main process: Recording started');
});

// Handle stop recording
ipcMain.on('stop-recording', () => {
  console.log('Main process: Stop recording received');
  isRecording = false;
  
  if (mainWindow) {
    console.log('Main process: Showing main window');
    mainWindow.show();
  }
});

// Handle save recording request
ipcMain.on('save-recording', async (event, data) => {
  console.log('Main process: Received save recording request');
  
  try {
    const { buffer, fileName } = data;
    
    // Show save dialog
    const result = await dialog.showSaveDialog({
      title: 'Save Recording',
      defaultPath: path.join(os.homedir(), 'Downloads', `${fileName}.webm`),
      filters: [
        { name: 'WebM Video', extensions: ['webm'] },
        { name: 'MP4 Video', extensions: ['mp4'] }
      ]
    });
    
    if (result.canceled) {
      console.log('Main process: Save dialog canceled');
      return;
    }
    
    // Save the file
    console.log('Main process: Saving recording to:', result.filePath);
    fs.writeFileSync(result.filePath, buffer);
    
    // Show success message
    dialog.showMessageBox({
      type: 'info',
      title: 'Recording Saved',
      message: 'Your recording has been saved successfully.',
      detail: `Saved to: ${result.filePath}`,
      buttons: ['OK']
    });
    
  } catch (error: any) {
    console.error('Main process: Error saving recording:', error);
    
    // Show error message
    dialog.showMessageBox({
      type: 'error',
      title: 'Error Saving Recording',
      message: 'Failed to save your recording.',
      detail: error.message || String(error),
      buttons: ['OK']
    });
  }
});

// Check screen recording permission
ipcMain.handle('check-screen-recording-permission', async () => {
  console.log('Main process: Checking screen recording permission');
  if (process.platform === 'darwin') {
    return systemPreferences.getMediaAccessStatus('screen') === 'granted';
  }
  return false;
});

// Request screen recording permission
ipcMain.handle('request-screen-recording-permission', () => {
  console.log('Main process: Requesting screen recording permission');
  if (process.platform === 'darwin') {
    // On macOS, we can't directly request screen recording permission
    // We can only check if it's granted and guide the user to System Preferences
    const screenCaptureStatus = systemPreferences.getMediaAccessStatus('screen');
    if (screenCaptureStatus !== 'granted') {
      // Open System Preferences > Security & Privacy > Privacy > Screen Recording
      // Use shell.openExternal to open system preferences
      const { shell } = require('electron');
      shell.openExternal('x-apple.systempreferences:com.apple.preference.security?Privacy_ScreenCapture');
    }
    return screenCaptureStatus === 'granted';
  }
  return false;
});

// Request accessibility permission
ipcMain.handle('request-accessibility-permission', () => {
  console.log('Main process: Opening accessibility preferences');
  return systemPreferences.isTrustedAccessibilityClient(true);
});

// Handle request for desktop sources
ipcMain.on('get-desktop-sources', async (event) => {
  console.log('Main process: Getting desktop sources');
  try {
    const sources = await desktopCapturer.getSources({ 
      types: ['screen'],
      thumbnailSize: { width: 300, height: 200 }
    });
    
    console.log(`Main process: Found ${sources.length} sources`);
    
    // Convert the sources to a format that can be sent over IPC
    const serializedSources = sources.map(source => ({
      id: source.id,
      name: source.name,
      thumbnail: source.thumbnail.toDataURL()
    }));
    
    // Send the sources back to the renderer
    event.sender.send('desktop-sources', serializedSources);
  } catch (error) {
    console.error('Main process: Error getting desktop sources:', error);
    event.sender.send('desktop-sources', []);
  }
});