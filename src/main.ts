import { app, BrowserWindow, systemPreferences, ipcMain, desktopCapturer, dialog } from 'electron';
import * as path from 'path';
import * as os from 'os';
import * as fs from 'fs';

let mainWindow: BrowserWindow | null = null;
let controlWindow: BrowserWindow | null = null;
let isRecording = false;
let stopButtonWindow: BrowserWindow | null = null;

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
    hasShadow: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    opacity: 0.8
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
    
    // Show the main window again when control window is closed
    if (mainWindow) {
      mainWindow.show();
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
  
  // Hide the main window so it doesn't appear in the recording
  if (mainWindow) {
    mainWindow.hide();
  }
  
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
      
      // Show the main window again if save was canceled
      if (mainWindow && !mainWindow.isVisible()) {
        mainWindow.show();
      }
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
    }).then(() => {
      // Show the main window again after the message is dismissed
      if (mainWindow && !mainWindow.isVisible()) {
        mainWindow.show();
      }
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
    }).then(() => {
      // Show the main window again after the error message is dismissed
      if (mainWindow && !mainWindow.isVisible()) {
        mainWindow.show();
      }
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

// Handle close control window request
ipcMain.on('close-control-window', () => {
  console.log('Main process: Received close control window request');
  if (controlWindow) {
    controlWindow.close();
  }
  
  // Show the main window again
  if (mainWindow && !mainWindow.isVisible()) {
    mainWindow.show();
  }
});

// Add a new event to hide the control window during recording
ipcMain.on('recording-starting', () => {
  console.log('Main process: Recording starting, hiding control window');
  if (controlWindow) {
    // Hide the control window completely during recording
    controlWindow.hide();
    
    // Create a small floating stop button window
    createStopButtonWindow();
  }
});

// Add a new event to show the control window after recording stops
ipcMain.on('recording-stopped', () => {
  console.log('Main process: Recording stopped, showing control window');
  
  // Close the stop button window
  if (stopButtonWindow) {
    stopButtonWindow.close();
    stopButtonWindow = null;
  }
  
  // Show the control window again
  if (controlWindow) {
    controlWindow.show();
  }
});

// Create a small floating stop button window
function createStopButtonWindow() {
  if (stopButtonWindow) {
    return;
  }
  
  console.log('Main process: Creating stop button window');
  
  stopButtonWindow = new BrowserWindow({
    width: 50,
    height: 50,
    resizable: false,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    skipTaskbar: true,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false
    }
  });
  
  // Create HTML content for the stop button
  const stopButtonHtml = `
    <!DOCTYPE html>
    <html>
    <head>
      <style>
        body {
          margin: 0;
          padding: 0;
          overflow: hidden;
          background-color: transparent;
          -webkit-app-region: drag;
        }
        .stop-button {
          width: 40px;
          height: 40px;
          border-radius: 50%;
          background-color: rgba(255, 59, 48, 0.8);
          display: flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
          margin: 5px;
          box-shadow: 0 2px 10px rgba(0, 0, 0, 0.3);
          -webkit-app-region: no-drag;
        }
        .stop-button:hover {
          background-color: rgba(255, 59, 48, 1);
        }
        .stop-icon {
          width: 16px;
          height: 16px;
          background-color: white;
          border-radius: 2px;
        }
      </style>
    </head>
    <body>
      <div class="stop-button" id="stopBtn">
        <div class="stop-icon"></div>
      </div>
      <script>
        const { ipcRenderer } = require('electron');
        document.getElementById('stopBtn').addEventListener('click', () => {
          ipcRenderer.send('stop-recording-clicked');
        });
      </script>
    </body>
    </html>
  `;
  
  // Write the HTML to a temporary file
  const tempPath = path.join(app.getPath('temp'), 'stop-button.html');
  fs.writeFileSync(tempPath, stopButtonHtml);
  
  // Load the HTML file
  stopButtonWindow.loadFile(tempPath);
  
  // Position in the bottom right corner
  const { screen } = require('electron');
  const primaryDisplay = screen.getPrimaryDisplay();
  const { width, height } = primaryDisplay.workAreaSize;
  stopButtonWindow.setPosition(width - 60, height - 60);
  
  stopButtonWindow.on('closed', () => {
    stopButtonWindow = null;
  });
}

// Handle stop recording button click
ipcMain.on('stop-recording-clicked', () => {
  console.log('Main process: Stop recording button clicked');
  if (controlWindow) {
    controlWindow.webContents.send('stop-recording-from-main');
  }
});