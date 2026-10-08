// Superficie mínima expuesta a la web (contextIsolation activo). Ampliar solo con APIs explícitas.
const { contextBridge } = require('electron');

contextBridge.exposeInMainWorld('stodiaDesktop', {
  platform: process.platform,
  isDesktop: true,
});
