const { contextBridge, ipcRenderer, webFrame } = require('electron');

contextBridge.exposeInMainWorld('minuteMark', {
  loadStore: () => ipcRenderer.invoke('store:load'),
  saveStore: (store) => ipcRenderer.invoke('store:save', store),
  exportDocument: (payload) => ipcRenderer.invoke('document:export', payload),
  setZoomFactor: (factor) => webFrame.setZoomFactor(factor),
  openCapture: () => ipcRenderer.invoke('app:open-capture'),
  pickMedia: () => ipcRenderer.invoke('dialog:pick-media'),
  cloudApiKeyStatus: () => ipcRenderer.invoke('settings:cloud-api-key-status'),
  saveCloudApiKey: (apiKey) => ipcRenderer.invoke('settings:save-cloud-api-key', apiKey),
  summarize: (payload) => ipcRenderer.invoke('ai:summarize', payload),
  transcribe: (payload) => ipcRenderer.invoke('ai:transcribe', payload),
  onCaptureInserted: (callback) => ipcRenderer.on('capture:insert', (_event, dataUrl) => callback(dataUrl)),
  onCaptureSource: (callback) => ipcRenderer.on('capture:source', (_event, dataUrl) => callback(dataUrl)),
  finishCapture: (dataUrl) => ipcRenderer.send('capture:done', dataUrl),
  cancelCapture: () => ipcRenderer.send('capture:cancel')
});
