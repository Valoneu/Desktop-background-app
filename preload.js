const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
    onSystemInfoUpdate: (callback) => ipcRenderer.on('system-info-update', (event, ...args) => callback(...args)),
    removeSystemInfoListener: () => ipcRenderer.removeAllListeners('system-info-update'),

    getSettings: () => ipcRenderer.invoke('get-settings'),
    saveSettings: (settings) => ipcRenderer.invoke('save-settings', settings),
    selectPath: (type) => ipcRenderer.invoke('select-path', type),
    openShortcut: (path) => ipcRenderer.invoke('open-shortcut', path),
    openSettingsWindow: () => ipcRenderer.invoke('open-settings-window'),

    getDisks: () => ipcRenderer.invoke('get-disks'),
    checkDiskUsage: (disk) => ipcRenderer.invoke('check-disk-usage', disk),

    loadNotes: () => ipcRenderer.invoke('load-notes'),
    saveNotes: (notesContentString) => ipcRenderer.invoke('save-notes', notesContentString),

    onSettingsUpdated: (callback) => ipcRenderer.on('settings-updated-event', (event, ...args) => callback(...args)),
    removeSettingsUpdatedListener: () => ipcRenderer.removeAllListeners('settings-updated-event'),
});

console.log('Main preload script loaded.');