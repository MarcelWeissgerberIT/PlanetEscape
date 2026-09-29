// Exposes the small desktop bridge the game uses (src/game/desktop.ts): file storage, window control, Steam.
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('peDesktop', {
  platform: process.platform,
  version: process.versions.electron,
  store: {
    get: (key) => ipcRenderer.sendSync('store:get', key),
    set: (key, value) => void ipcRenderer.sendSync('store:set', key, value),
    remove: (key) => void ipcRenderer.sendSync('store:remove', key),
  },
  quit: () => ipcRenderer.send('app:quit'),
  toggleFullscreen: () => ipcRenderer.sendSync('app:fullscreen'),
  isFullscreen: () => ipcRenderer.sendSync('app:is-fullscreen'),
  openExternal: (url) => ipcRenderer.send('app:open', url),
  steam: {
    available: () => ipcRenderer.sendSync('steam:available'),
    activate: (id) => ipcRenderer.send('steam:activate', id),
  },
});
