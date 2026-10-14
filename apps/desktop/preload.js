// Superficie expuesta a la web (contextIsolation activo).
// La página remota solo recibe `platform`; la página local de configuración (file://) además recibe probar/guardar.
const { contextBridge, ipcRenderer } = require('electron');

const esPaginaLocal = location.protocol === 'file:';

contextBridge.exposeInMainWorld('stodiaDesktop', {
  platform: process.platform,
  isDesktop: true,
  ...(esPaginaLocal
    ? {
        probar: (url) => ipcRenderer.invoke('stodia:probar', String(url)),
        guardar: (url) => ipcRenderer.invoke('stodia:guardar', String(url)),
      }
    : {}),
});
