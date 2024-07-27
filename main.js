const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');
const { exec } = require('child_process');

try {
	require('electron-reloader')(module);
} catch {}

const NOTES_FILE = path.join(__dirname, 'notes.json');

function createWindow () {
  const mainWindow = new BrowserWindow({
    width: 1920,
    height: 1080,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false
    }
  });
  mainWindow.setMenuBarVisibility(false)

  mainWindow.loadFile('main.html');

  // Open the DevTools (optional)
  mainWindow.webContents.openDevTools();
}

app.on('ready', createWindow);

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

// Specify the disks to track here
const disksToTrack = process.platform === 'win32' 
  ? ['C:', 'D:', 'F:', 'H:'] // Modify this list for Windows
  : ['/'];       // Modify this list for Unix-like systems

ipcMain.handle('get-disks', () => {
  return disksToTrack;
});

ipcMain.handle('check-disk-usage', (event, disk) => {
  return new Promise((resolve, reject) => {
    fs.statfs(disk, (err, stats) => {
      if (err) {
        reject(err);
      } else {
        const totalSpace = stats.blocks * stats.bsize;
        const freeSpace = stats.bfree * stats.bsize;
        const usedSpace = totalSpace - freeSpace;
        const usedPercentage = (usedSpace / totalSpace) * 100;
        resolve({
          path: disk,
          usedPercentage: usedPercentage.toFixed(2),
          total: (totalSpace / (1024 * 1024 * 1024)).toFixed(2), // in GB
          free: (freeSpace / (1024 * 1024 * 1024)).toFixed(2)    // in GB
        });
      }
    });
  });
});

ipcMain.handle('load-notes', async () => {
  try {
    const data = fs.readFileSync(NOTES_FILE);
    return JSON.parse(data);
  } catch (error) {
    return [];
  }
});

ipcMain.handle('save-notes', async (event, notes) => {
  fs.writeFileSync(NOTES_FILE, JSON.stringify(notes));
});

ipcMain.handle('open-notes-file', async () => {
  const notesFilePath = NOTES_FILE;
  const command = process.platform === 'win32' 
    ? `start "" "${notesFilePath}"`
    : process.platform === 'darwin'
      ? `open "${notesFilePath}"`
      : `xdg-open "${notesFilePath}"`;
      
  exec(command, (error) => {
    if (error) {
      console.error('Failed to open the notes file:', error);
    }
  });
});