const { contextBridge, ipcRenderer } = require('electron');

// Expose protected methods that allow the renderer process to use
// the ipcRenderer without exposing the entire object
contextBridge.exposeInMainWorld('electronAPI', {
  // System Info Updates
  onSystemInfoUpdate: (callback) => ipcRenderer.on('system-info-update', (event, ...args) => callback(...args)),
  removeSystemInfoListener: () => ipcRenderer.removeAllListeners('system-info-update'), // *Good practice*

  // Invoke methods (request/response)
  getSettings: () => ipcRenderer.invoke('get-settings'),
  // *Keep saveSettings exposed in case main window needs it, though settings window primarily uses it*
  saveSettings: (settings) => ipcRenderer.invoke('save-settings', settings),
  selectPath: (type) => ipcRenderer.invoke('select-path', type),
  openShortcut: (path) => ipcRenderer.invoke('open-shortcut', path),
  openSettingsWindow: () => ipcRenderer.invoke('open-settings-window'), // *Expose open settings*

  // Disks
  getDisks: () => ipcRenderer.invoke('get-disks'),
  checkDiskUsage: (disk) => ipcRenderer.invoke('check-disk-usage', disk),

  // Notes (*Updated for inline editing*)
  loadNotes: () => ipcRenderer.invoke('load-notes'),
  saveNotes: (notesContentString) => ipcRenderer.invoke('save-notes', notesContentString), // *Pass the string*
  // openNotesFile: () => ipcRenderer.invoke('open-notes-file'), // *Removed/Commented out*

  // *Listener for settings updates pushed from main process after settings window saves*
  onSettingsUpdated: (callback) => ipcRenderer.on('settings-updated-event', (event, ...args) => callback(...args)),
  removeSettingsUpdatedListener: () => ipcRenderer.removeAllListeners('settings-updated-event'), // *Good practice*
});

console.log('Main preload script loaded.');