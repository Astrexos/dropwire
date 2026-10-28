// client/electron/preload.cjs
const { contextBridge, ipcRenderer, webUtils } = require('electron');

contextBridge.exposeInMainWorld('dropwireDesktop', {
  getSources: () => ipcRenderer.invoke('get-desktop-sources'),
  selectSource: (sourceId, shareAudio) =>
    ipcRenderer.invoke('select-desktop-source', { sourceId, shareAudio }),
  checkSourceAlive: (sourceId) =>
    ipcRenderer.invoke('check-source-alive', sourceId),
  getFilePath: (file) => {
    try {
      if (webUtils && typeof webUtils.getPathForFile === 'function') {
        return webUtils.getPathForFile(file);
      }
      return file?.path || '';
    } catch (e) {
      return file?.path || '';
    }
  },
  registerDesktopFile: (fileId, filePath, fileName, fileSize, mimeType) =>
    ipcRenderer.invoke('register-desktop-file', { fileId, filePath, fileName, fileSize, mimeType }),
  getDesktopFile: (fileId) =>
    ipcRenderer.invoke('get-desktop-file', fileId),
  saveDesktopFile: (fileId, defaultName) =>
    ipcRenderer.invoke('save-desktop-file', { fileId, defaultName })
});

