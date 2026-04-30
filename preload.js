const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  setIgnoreMouseEvents: (ignore, options) => ipcRenderer.send('set-ignore-mouse-events', ignore, options),
  resizeWindow: (size) => ipcRenderer.send('resize-window', size),
  onFirebaseEvent: (callback) => ipcRenderer.on('firebase-event', (event, data) => callback(data)),
  sendFirebaseEvent: (data) => ipcRenderer.send('send-firebase-event', data),
});
