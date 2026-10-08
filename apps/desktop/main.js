// Electron mínimo: carga la web de STODIA (URL del cliente) en una ventana aislada.
// URL: variable STODIA_URL, o argumento --url=..., por defecto el contenedor web local.
const { app, BrowserWindow, shell } = require('electron');
const path = require('node:path');

const argUrl = process.argv.find(a => a.startsWith('--url='));
const START_URL = (argUrl && argUrl.slice(6)) || process.env.STODIA_URL || 'http://localhost:8080';
const ORIGIN = new URL(START_URL).origin;

function createWindow() {
  const win = new BrowserWindow({
    width: 1366,
    height: 860,
    backgroundColor: '#F8FAFC',
    icon: path.join(__dirname, 'build', process.platform === 'win32' ? 'icon.ico' : 'icon.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
    },
  });

  // Solo se navega dentro del origen del cliente; todo lo demás abre en el navegador del sistema.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });
  win.webContents.on('will-navigate', (e, url) => {
    if (new URL(url).origin !== ORIGIN) {
      e.preventDefault();
      if (/^https?:/.test(url)) shell.openExternal(url);
    }
  });

  win.loadURL(START_URL);
}

app.whenReady().then(() => {
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
