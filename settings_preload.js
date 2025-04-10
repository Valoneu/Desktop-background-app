const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('settingsAPI', {
  getSettings: () => ipcRenderer.invoke('get-settings'),
  saveSettings: (settings) => ipcRenderer.invoke('save-settings', settings),
  selectPath: (type) => ipcRenderer.invoke('select-path', type), // *Needed for browsing disks/folders*

  // *No direct way to close from preload for security reasons.*
  // *The save/cancel buttons in the renderer will trigger saveSettings or just finish.*
  // *Main process could close it after saveSettings resolves, or renderer could message main process to close.*
  // *Let's rely on saveSettings triggering the update and the renderer closing itself conceptually.*
  // *Update: Added programmatic close via window.close() for cancel button*
  closeWindow: () => window.close()

});

console.log('Settings preload script loaded.');