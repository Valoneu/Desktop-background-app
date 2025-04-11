const { app, BrowserWindow, ipcMain, shell, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');
const si = require('systeminformation');

if (process.platform === 'win32') {
    si.powerShellStart();
}

const IS_DEV = process.env.NODE_ENV !== 'production';
const USER_DATA_PATH = app.getPath('userData');
const SETTINGS_FILE = path.join(USER_DATA_PATH, 'settings.json');
const NOTES_FILE = path.join(USER_DATA_PATH, 'notes.json');

const DEFAULT_SETTINGS = {
    shortcuts: [],
    trackedDisks: process.platform === 'win32' ? ['C:'] : ['/'],
    windowBounds: { width: 1920, height: 1080 },
};

let mainWindow;
let settingsWindow;
let settings = loadSettings();
let systemInfoInterval;
let diskUpdateInterval;

if (IS_DEV) {
    try {
        require('electron-reloader')(module);
    } catch { }
}

function loadSettings() {
    try {
        if (fs.existsSync(SETTINGS_FILE)) {
            const rawData = fs.readFileSync(SETTINGS_FILE);
            const parsedSettings = JSON.parse(rawData);
            const mergedSettings = { ...DEFAULT_SETTINGS, ...parsedSettings };

            if (parsedSettings.windowBounds) {
                mergedSettings.windowBounds = parsedSettings.windowBounds;
            } else {
                mergedSettings.windowBounds = DEFAULT_SETTINGS.windowBounds;
            }
            mergedSettings.trackedDisks = Array.isArray(mergedSettings.trackedDisks) ? mergedSettings.trackedDisks : DEFAULT_SETTINGS.trackedDisks;
            mergedSettings.shortcuts = Array.isArray(mergedSettings.shortcuts) ? mergedSettings.shortcuts : DEFAULT_SETTINGS.shortcuts;
            return mergedSettings;
        } else {
            fs.writeFileSync(SETTINGS_FILE, JSON.stringify(DEFAULT_SETTINGS, null, 2));
            return DEFAULT_SETTINGS;
        }
    } catch (error) {
        console.error('Failed to load settings, using defaults:', error);
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
        const currentBounds = mainWindow && !mainWindow.isDestroyed() ? mainWindow.getBounds() : settings?.windowBounds;
        const settingsToSave = {
            shortcuts: settings?.shortcuts || [],
            trackedDisks: settings?.trackedDisks || DEFAULT_SETTINGS.trackedDisks,
            windowBounds: currentBounds || DEFAULT_SETTINGS.windowBounds,
        };
        fs.writeFileSync(SETTINGS_FILE, JSON.stringify(settingsToSave, null, 2));
    } catch (error) {
        console.error('Failed to save settings:', error);
    }
}

function createSettingsWindow() {
    if (settingsWindow && !settingsWindow.isDestroyed()) {
        settingsWindow.focus();
        return;
    }
    settingsWindow = new BrowserWindow({
        width: 700,
        height: 550,
        minWidth: 550,
        minHeight: 450,
        parent: mainWindow,
        modal: true,
        webPreferences: {
            preload: path.join(__dirname, 'settings_preload.js'),
            nodeIntegration: false,
            contextIsolation: true,
        },
        show: false,
        title: 'Settings',
        autoHideMenuBar: true,
    });

    settingsWindow.loadFile('settings.html');

    settingsWindow.once('ready-to-show', () => {
        settingsWindow.show();
    });

    settingsWindow.on('closed', () => {
        settingsWindow = null;
    });
}

function createWindow() {
    const savedBounds = settings.windowBounds;
    mainWindow = new BrowserWindow({
        width: savedBounds?.width || DEFAULT_SETTINGS.windowBounds.width,
        height: savedBounds?.height || DEFAULT_SETTINGS.windowBounds.height,
        minWidth: 1024,
        minHeight: 700,
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            nodeIntegration: false,
            contextIsolation: true,
        },
        show: false,
        frame: false,
        titleBarStyle: 'hidden',
        trafficLightPosition: { x: 15, y: 15 },
        backgroundColor: '#181926'
    });

    mainWindow.setMenuBarVisibility(false);
    mainWindow.loadFile('main.html');

    mainWindow.once('ready-to-show', () => {
        mainWindow.show();
        startSystemInfoUpdates();
    });

    mainWindow.on('close', () => {
        if (mainWindow && !mainWindow.isDestroyed() && settings) {
            settings.windowBounds = mainWindow.getBounds();
            saveSettings();
        }
    });

    mainWindow.on('closed', () => {
        mainWindow = null;
        stopSystemInfoUpdates();
    });
}

async function getSystemInfo() {
    try {
        // --- Network Stats Enhancement ---
        let networkStats = null;
        try {
            const defaultInterface = await si.networkInterfaceDefault();
            if (defaultInterface) {
                const stats = await si.networkStats(defaultInterface);
                // networkStats can return an array or object, handle both
                networkStats = Array.isArray(stats) ? stats[0] : stats;
            }
        } catch (netError) {
            console.warn("Could not get stats for default network interface, falling back:", netError.message);
            // Fallback to trying the first interface if default fails
            const allStats = await si.networkStats('*');
            if (allStats && allStats.length > 0) {
                networkStats = allStats[0];
            }
        }
        // --- End Network Stats Enhancement ---

        const [cpuData, memData, gpuData] = await Promise.all([
            si.currentLoad(),
            si.mem(),
            si.graphics()
            // Network stats are fetched above sequentially to handle default interface logic
        ]);

        const cpuLoad = cpuData?.currentLoad ?? null;
        const ramUsage = (memData?.total > 0) ? (memData.active / memData.total) * 100 : null;

        let gpuLoad = null;
        let vramUsage = null;
        if (gpuData?.controllers && gpuData.controllers.length > 0) {
            const mainGpu = gpuData.controllers.find(gpu => gpu.utilizationGpu !== undefined && gpu.utilizationGpu !== null) || gpuData.controllers[0];
            if (mainGpu) {
                 gpuLoad = mainGpu.utilizationGpu ?? null;
                 if (mainGpu.memoryTotal && mainGpu.memoryUsed && mainGpu.memoryTotal > 0) {
                     vramUsage = (mainGpu.memoryUsed / mainGpu.memoryTotal) * 100;
                 }
            }
        }

        // Use the determined networkStats object
        const downloadSpeedBps = networkStats?.rx_sec ?? 0;
        const uploadSpeedBps = networkStats?.tx_sec ?? 0;
        // Correct conversion: Bytes/sec * 8 bits/byte / 1,000,000 bits/Mbps
        const downloadSpeedMbps = (downloadSpeedBps * 8) / 1000000;
        const uploadSpeedMbps = (uploadSpeedBps * 8) / 1000000;

        return {
            cpu: cpuLoad !== null ? cpuLoad.toFixed(1) : null,
            ram: ramUsage !== null ? ramUsage.toFixed(1) : null,
            gpu: gpuLoad !== null ? gpuLoad.toFixed(1) : null,
            vram: vramUsage !== null ? vramUsage.toFixed(1) : null,
            down: downloadSpeedMbps.toFixed(2), // Always provide a value, even if 0.00
            up: uploadSpeedMbps.toFixed(2)      // Always provide a value, even if 0.00
        };
    } catch (error) {
        // Catch errors from Promise.all or other parts
        console.error("Error fetching system info:", error);
        return { cpu: null, ram: null, gpu: null, vram: null, down: '0.00', up: '0.00' }; // Return default strings on error
    }
}


function startSystemInfoUpdates() {
    if (systemInfoInterval) clearInterval(systemInfoInterval);
    const sendUpdate = async () => {
        if (mainWindow && !mainWindow.isDestroyed()) {
            try {
                 const info = await getSystemInfo();
                 mainWindow.webContents.send('system-info-update', info);
            } catch (error) {
                 console.error("Error during system info update cycle:", error);
                 // Optionally send an error state to the renderer
            }
        } else {
            stopSystemInfoUpdates();
        }
    };
    sendUpdate(); // Initial call
    systemInfoInterval = setInterval(sendUpdate, 1000); // Update every second
}

function stopSystemInfoUpdates() {
    if (systemInfoInterval) {
        clearInterval(systemInfoInterval);
        systemInfoInterval = null;
    }
}

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

ipcMain.handle('open-settings-window', () => {
    createSettingsWindow();
});

ipcMain.handle('get-settings', () => {
    if (!settings) settings = loadSettings();
    return settings;
});

ipcMain.handle('save-settings', (event, newSettings) => {
    settings = { ...settings, ...newSettings };
    saveSettings();
    if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('settings-updated-event', settings);
    }
});

ipcMain.handle('select-path', async (event, type) => {
    const properties = type === 'folder' ? ['openDirectory'] : ['openFile'];
    const parentWindow = BrowserWindow.getFocusedWindow() || mainWindow;
    const result = await dialog.showOpenDialog(parentWindow, {
        properties: properties,
        title: type === 'folder' ? 'Select Folder' : 'Select Application/File'
    });
    if (!result.canceled && result.filePaths.length > 0) {
        return result.filePaths[0];
    }
    return null;
});

ipcMain.handle('open-shortcut', (event, shortcutPath) => {
    if (shortcutPath) {
        shell.openPath(shortcutPath).catch(err => {
            console.error(`Failed to open path ${shortcutPath}:`, err);
            dialog.showErrorBox('Error Opening Path', `Could not open: ${shortcutPath}\n\n${err.message}`);
        });
    }
});

ipcMain.handle('get-disks', () => {
    if (!settings) settings = loadSettings();
    return settings.trackedDisks || [];
});

ipcMain.handle('check-disk-usage', async (event, diskPath) => {
    if (!diskPath || typeof diskPath !== 'string') {
        throw new Error('Invalid disk path provided.');
    }
    try {
        const pathToStat = process.platform === 'win32' ? diskPath.substring(0, 2) + path.sep : diskPath;
        return await new Promise((resolve, reject) => {
            fs.statfs(pathToStat, (err, stats) => {
                if (err) {
                    reject(new Error(`Failed to get stats for "${diskPath}" (tried "${pathToStat}"): ${err.message}`));
                } else {
                    const totalSpace = stats.blocks * stats.bsize;
                    const freeSpace = stats.bavail * stats.bsize;
                    const freePercentage = totalSpace > 0 ? (freeSpace / totalSpace) * 100 : 0;
                    resolve({
                        path: diskPath,
                        freePercentage: freePercentage.toFixed(1),
                        totalGB: (totalSpace / (1024 ** 3)).toFixed(1),
                        freeGB: (freeSpace / (1024 ** 3)).toFixed(1)
                    });
                }
            });
        });
    } catch (error) {
        console.error(`Error checking disk usage for ${diskPath}:`, error);
        throw error;
    }
});

ipcMain.handle('load-notes', async () => {
    try {
        if (fs.existsSync(NOTES_FILE)) {
            const data = await fs.promises.readFile(NOTES_FILE, 'utf8');
            return data;
        }
        return '';
    } catch (error) {
        console.error('Failed to load notes:', error);
        return '';
    }
});

ipcMain.handle('save-notes', async (event, notesContentString) => {
    try {
        await fs.promises.writeFile(NOTES_FILE, notesContentString, 'utf8');
    } catch (error) {
        console.error('Failed to save notes:', error);
    }
});