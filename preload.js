const { contextBridge, ipcRenderer } = require('electron');

// Expose protected methods that allow the renderer process to use
// the ipcRenderer without exposing the entire object
contextBridge.exposeInMainWorld('electronAPI', {
    // Dialog APIs
    openDirectory: () => ipcRenderer.invoke('dialog:openDirectory'),

    // File system APIs
    writeFile: (filePath, data) => ipcRenderer.invoke('fs:writeFile', filePath, data),
    readFile: (filePath) => ipcRenderer.invoke('fs:readFile', filePath),
    copyFile: (source, destination) => ipcRenderer.invoke('fs:copyFile', source, destination),
    readdir: (dirPath) => ipcRenderer.invoke('fs:readdir', dirPath),
    mkdir: (dirPath) => ipcRenderer.invoke('fs:mkdir', dirPath),
    unlink: (filePath) => ipcRenderer.invoke('fs:unlink', filePath),
    stat: (filePath) => ipcRenderer.invoke('fs:stat', filePath),
    rmdir: (dirPath) => ipcRenderer.invoke('fs:rmdir', dirPath),

    // Platform info
    platform: process.platform,

    // Check if running in Electron
    isElectron: true
});
