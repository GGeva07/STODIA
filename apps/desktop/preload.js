// Superficie expuesta a la web (contextIsolation activo).
// La interfaz (app://stodia) solo recibe `platform`; la página local de conexión (file://) además recibe probar/conectar/activar.
const { contextBridge, ipcRenderer } = require('electron');

const esPaginaLocal = location.protocol === 'file:';

contextBridge.exposeInMainWorld('stodiaDesktop', {
  platform: process.platform,
  isDesktop: true,
  ...(esPaginaLocal
    ? {
        probar: (url) => ipcRenderer.invoke('stodia:probar', String(url)),
        conectar: (url) => ipcRenderer.invoke('stodia:conectar', String(url)),
        activar: (url, datos) => ipcRenderer.invoke('stodia:activar', { url: String(url), datos }),
      }
    : {}),
});
