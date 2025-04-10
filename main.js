const { app, BrowserWindow, ipcMain, shell, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os'); // Keep os module if needed elsewhere, otherwise remove if only for old RAM calc
const si = require('systeminformation');

// --- PowerShell Optimization ---
// *Initialize PowerShell for systeminformation on Windows to avoid high CPU usage from repeated spawning*
if (process.platform === 'win32') {
  si.powerShellStart();
  // *Also, gracefully exit the persistent PowerShell session when the app quits*
  app.on('quit', () => {
    si.powerShellStop();
  });
}

// --- Configuration ---
const IS_DEV = process.env.NODE_ENV !== 'production';
// *Changed back to use __dirname for settings/notes location as requested*
const SETTINGS_FILE = path.join(__dirname, 'settings.json');
const NOTES_FILE = path.join(__dirname, 'notes.json');

// Default settings structure
const DEFAULT_SETTINGS = {
  shortcuts: [], // { name: string, path: string, type: 'app' | 'folder' }
  trackedDisks: process.platform === 'win32' ? ['C:'] : ['/'], // Default starting point
  // *Default window size set to 1920x1080, but will be overridden by saved bounds*
  windowBounds: { width: 1920, height: 1080 },
};

let mainWindow;
let settingsWindow; // *For the settings panel*
let settings = loadSettings();
let systemInfoInterval;

// Enable hot reloading in development
if (IS_DEV) {
  try {
    require('electron-reloader')(module);
  } catch {}
}

// --- Settings Management ---
function loadSettings() {
  try {
    if (fs.existsSync(SETTINGS_FILE)) {
      const rawData = fs.readFileSync(SETTINGS_FILE);
      const parsedSettings = JSON.parse(rawData);
      // *Merge defaults with loaded settings to ensure all keys exist, prioritize loaded over default*
      const mergedSettings = { ...DEFAULT_SETTINGS, ...parsedSettings };
      // *Ensure windowBounds from loaded settings takes precedence if it exists*
      if (parsedSettings.windowBounds) {
           mergedSettings.windowBounds = parsedSettings.windowBounds;
      } else {
           mergedSettings.windowBounds = DEFAULT_SETTINGS.windowBounds; // *Use default if not saved*
      }
      return mergedSettings;
    } else {
      // Create default settings file if it doesn't exist
      fs.writeFileSync(SETTINGS_FILE, JSON.stringify(DEFAULT_SETTINGS, null, 2));
      return DEFAULT_SETTINGS;
    }
  } catch (error) {
    console.error('Failed to load settings, using defaults:', error);
    // Attempt to write default settings if loading failed badly
    try {
        fs.writeFileSync(SETTINGS_FILE, JSON.stringify(DEFAULT_SETTINGS, null, 2));
    } catch (writeError) {
        console.error('Failed to write default settings file:', writeError);
    }
    return DEFAULT_SETTINGS;
  }
}

function saveSettings() {
  try {
    // Ensure necessary keys exist before saving
    const settingsToSave = {
        shortcuts: settings.shortcuts || [],
        trackedDisks: settings.trackedDisks || DEFAULT_SETTINGS.trackedDisks,
        windowBounds: settings.windowBounds || DEFAULT_SETTINGS.windowBounds,
    };
    fs.writeFileSync(SETTINGS_FILE, JSON.stringify(settingsToSave, null, 2));
  } catch (error) {
    console.error('Failed to save settings:', error);
  }
}

// --- Window Creation ---
function createSettingsWindow() {
  // *Prevent creating multiple settings windows*
  if (settingsWindow && !settingsWindow.isDestroyed()) {
    settingsWindow.focus();
    return;
  }

  settingsWindow = new BrowserWindow({
    width: 600, // *Smaller size for settings*
    height: 500,
    parent: mainWindow, // *Associate with the main window*
    modal: true, // *Prevent interaction with main window while settings is open*
    webPreferences: {
      preload: path.join(__dirname, 'settings_preload.js'), // *Dedicated preload*
      nodeIntegration: false,
      contextIsolation: true,
    },
    show: false, // *Show when ready*
    resizable: false, // *Usually settings windows aren't resizable*
    maximizable: false,
    minimizable: false,
    title: 'Settings',
    autoHideMenuBar: true, // *Hide default menu*
    // frame: false, // *Optionally make frameless later*
  });

  settingsWindow.loadFile('settings.html'); // *Load the new HTML file*

  // settingsWindow.webContents.openDevTools(); // *Only for debugging settings window*

  settingsWindow.once('ready-to-show', () => {
    settingsWindow.show();
  });

  settingsWindow.on('closed', () => {
    settingsWindow = null; // *Allow garbage collection*
  });
}

function createWindow() {
  const savedBounds = settings.windowBounds; // *Load potentially saved bounds*
  mainWindow = new BrowserWindow({
    // *Use saved bounds if they exist, otherwise use the default 1920x1080 from settings object*
    width: savedBounds?.width || settings.windowBounds.width,
    height: savedBounds?.height || settings.windowBounds.height,
    minWidth: 1024, // Set a reasonable minimum size
    minHeight: 700,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      // Security Best Practices:
      nodeIntegration: false, // Keep false
      contextIsolation: true, // Keep true
    },
    // icon: path.join(__dirname, 'assets/icon.png'), // Optional: Add an icon
    show: false, // Don't show until ready
    frame: true, // Set to false for custom frame later if desired
    titleBarStyle: 'hidden', // Example for macOS style, adjust as needed
    trafficLightPosition: { x: 15, y: 15 }, // macOS style positioning
    backgroundColor: '#181825' // Match CSS base
  });

  mainWindow.setMenuBarVisibility(false);
  mainWindow.loadFile('main.html');

  // *Listen for updates pushed from the settings window via main process*
  ipcMain.on('settings-updated', (event, updatedSettings) => {
      // *Forward this message to the main renderer*
       if (mainWindow && !mainWindow.isDestroyed()) {
           mainWindow.webContents.send('settings-updated-event', updatedSettings);
       }
  });

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
    // Start sending system info updates after window is ready
    startSystemInfoUpdates();
  });

  // Save window size/position on close
  mainWindow.on('close', () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
        settings.windowBounds = mainWindow.getBounds();
        saveSettings();
    }
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
    stopSystemInfoUpdates();
  });

  // Open DevTools ONLY in development
  if (IS_DEV) {
    mainWindow.webContents.openDevTools(); // *DevTools closed by default in production*
  }
}

// --- System Info Updates ---
async function getSystemInfo() {
    try {
        const [cpuData, memData, gpuData, networkData] = await Promise.all([
            si.currentLoad(),
            si.mem(),
            si.graphics(),
            si.networkStats('*') // Get stats for the default interface
        ]);

        const cpuLoad = cpuData.currentLoad;
        // *Using si.mem() for RAM is generally better than os.freemem()*
        const ramUsage = (memData.active / memData.total) * 100;

        let gpuLoad = null;
        let vramUsage = null;
        if (gpuData.controllers && gpuData.controllers.length > 0) {
            const mainGpu = gpuData.controllers.find(gpu => gpu.utilizationGpu !== undefined) || gpuData.controllers[0];
            gpuLoad = mainGpu.utilizationGpu;

            if (mainGpu.memoryTotal && mainGpu.memoryUsed) {
                vramUsage = (mainGpu.memoryUsed / mainGpu.memoryTotal) * 100;
            }
        }

        const primaryNetwork = networkData[0] || {};
        const downloadSpeed = (primaryNetwork.rx_sec || 0) / 125000; // Bps to Mbps
        const uploadSpeed = (primaryNetwork.tx_sec || 0) / 125000; // Bps to Mbps

        return {
            cpu: cpuLoad?.toFixed(1),
            ram: ramUsage?.toFixed(1),
            gpu: gpuLoad?.toFixed(1),
            vram: vramUsage?.toFixed(1),
            down: downloadSpeed?.toFixed(2),
            up: uploadSpeed?.toFixed(2),
        };
    } catch (error) {
        console.error("Error fetching system info:", error);
        // Return nulls or placeholders if fetching fails
        return { cpu: null, ram: null, gpu: null, vram: null, down: null, up: null };
    }
}

function startSystemInfoUpdates() {
    if (systemInfoInterval) clearInterval(systemInfoInterval); // Clear existing interval if any

    const sendUpdate = async () => {
        if (mainWindow && !mainWindow.isDestroyed()) {
            const info = await getSystemInfo();
            mainWindow.webContents.send('system-info-update', info);
        } else {
            stopSystemInfoUpdates(); // Stop if window is gone
        }
    };

    sendUpdate(); // Send immediate update
    systemInfoInterval = setInterval(sendUpdate, 2000); // Update every 2 seconds
}

function stopSystemInfoUpdates() {
    if (systemInfoInterval) {
        clearInterval(systemInfoInterval);
        systemInfoInterval = null;
    }
}

// --- App Lifecycle ---
app.whenReady().then(createWindow);

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

// --- IPC Handlers ---

// *Handler to open the settings window*
ipcMain.handle('open-settings-window', () => {
    createSettingsWindow();
});

// Settings
ipcMain.handle('get-settings', () => {
  // *Used by both main and settings windows*
  return settings;
});

ipcMain.handle('save-settings', (event, newSettings) => {
  // *Used by the settings window to save changes*
  settings = { ...settings, ...newSettings };
  saveSettings();
  // *Notify the main window that settings have changed so it can update*
  if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('settings-updated-event', settings); // *Send the updated settings*
  }
});

// Shortcuts
ipcMain.handle('select-path', async (event, type) => {
  const properties = type === 'folder'
    ? ['openDirectory']
    : ['openFile'];

  // *Determine the parent window for the dialog*
  const parentWindow = BrowserWindow.getFocusedWindow() || mainWindow;

  const result = await dialog.showOpenDialog(parentWindow, {
    properties: properties,
    title: type === 'folder' ? 'Select Folder' : 'Select Application/File'
  });

  if (!result.canceled && result.filePaths.length > 0) {
    return result.filePaths[0];
  }
  return null; // Return null if cancelled
});

ipcMain.handle('open-shortcut', (event, shortcutPath) => {
  if (shortcutPath) {
    shell.openPath(shortcutPath).catch(err => {
      console.error(`Failed to open path ${shortcutPath}:`, err);
      dialog.showErrorBox('Error Opening Path', `Could not open: ${shortcutPath}\n\n${err.message}`);
    });
  }
});

// Disks
ipcMain.handle('get-disks', () => {
  return settings.trackedDisks || []; // Use disks from settings
});

ipcMain.handle('check-disk-usage', async (event, diskPath) => {
    // Basic validation
    if (!diskPath || typeof diskPath !== 'string') {
        throw new Error('Invalid disk path provided.');
    }

    try {
        // On Windows, fs.statfs needs just the drive letter (e.g., "C:").
        // On Unix, it needs the mount point (e.g., "/").
        const pathToStat = process.platform === 'win32' ? diskPath.substring(0, 2) + '\\' : diskPath; // Windows needs C:\

        return await new Promise((resolve, reject) => {
            fs.statfs(pathToStat, (err, stats) => {
                if (err) {
                    // Provide more context in the error
                    reject(new Error(`Failed to get stats for "${diskPath}" (tried "${pathToStat}"): ${err.message}`));
                } else {
                    const totalSpace = stats.blocks * stats.bsize;
                    const freeSpace = stats.bavail * stats.bsize; // Use 'bavail' (available to non-root)
                    const usedSpace = totalSpace - freeSpace;
                    // Handle potential division by zero if totalSpace is 0
                    const usedPercentage = totalSpace > 0 ? (usedSpace / totalSpace) * 100 : 0;
                    resolve({
                        path: diskPath, // Return the original requested path
                        usedPercentage: usedPercentage.toFixed(1),
                        totalGB: (totalSpace / (1024 ** 3)).toFixed(1),
                        freeGB: (freeSpace / (1024 ** 3)).toFixed(1)
                    });
                }
            });
        });
    } catch (error) {
        console.error(`Error checking disk usage for ${diskPath}:`, error);
        // Rethrow or return a specific error structure
        throw error; // Let the renderer handle the error display
    }
});

// Notes (*Modified for inline editing*)
ipcMain.handle('load-notes', async () => {
  try {
    if (fs.existsSync(NOTES_FILE)) {
      // *Load the raw content of the file as a single string*
      const data = await fs.promises.readFile(NOTES_FILE, 'utf8');
      return data;
    }
    return ''; // Return empty string if file doesn't exist
  } catch (error) {
    console.error('Failed to load notes:', error);
    return ''; // Return empty string on error
  }
});

ipcMain.handle('save-notes', async (event, notesContentString) => {
  // *Receive the entire notes content as a string and write it*
  try {
    await fs.promises.writeFile(NOTES_FILE, notesContentString, 'utf8');
  } catch (error) {
    console.error('Failed to save notes:', error);
    // *Maybe send an error back to the renderer? For now, just log.*
  }
});

// *Commented out as we are editing inline now*
/*
ipcMain.handle('open-notes-file', () => {
    if (!fs.existsSync(NOTES_FILE)) {
        try {
            fs.writeFileSync(NOTES_FILE, '', 'utf8'); // Create empty notes file if inline editing fails?
        } catch (error) {
            console.error('Failed to create notes file:', error);
            dialog.showErrorBox('Error', 'Could not create or find the notes file.');
            return;
        }
    }
    shell.openPath(NOTES_FILE).catch(err => {
        console.error('Failed to open notes file:', err);
        dialog.showErrorBox('Error Opening File', `Could not open: ${NOTES_FILE}\n\n${err.message}`);
    });
});
*/