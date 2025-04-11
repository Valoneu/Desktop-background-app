const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('settingsAPI', {
    getSettings: () => ipcRenderer.invoke('get-settings'),
    saveSettings: (settings) => ipcRenderer.invoke('save-settings', settings),
    selectPath: (type) => ipcRenderer.invoke('select-path', type),
    closeWindow: () => window.close()
});

console.log('Settings preload script loaded.');