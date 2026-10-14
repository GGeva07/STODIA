// Shell Electron de STODIA: carga la web del servidor del colegio en una ventana aislada.
// Prioridad de la URL: --url= > STODIA_URL > userData/stodia.json > pantalla local "Conectar con el servidor".
const { app, BrowserWindow, shell, Menu, ipcMain, net } = require('electron');
const path = require('node:path');
const fs = require('node:fs');
const { pathToFileURL } = require('node:url');

const SETUP_FILE = path.join(__dirname, 'setup.html');
const SETUP_PATHNAME = pathToFileURL(SETUP_FILE).pathname;
const PROBE_TIMEOUT_MS = 8000;
const PENDIENTE_MSG =
  'Este servidor aún no está activado: ejecuta el instalador del cliente en modo instalación nueva.';

let mainWindow = null;
let remoteBase = null;   // URL de la web del servidor cargada (sin / final)
let remoteOrigin = null; // origen de esa URL: único origen de navegación permitido

// Acepta solo http(s) sin credenciales; devuelve origen + ruta sin / final, o null.
function normalizeUrl(raw) {
  if (typeof raw !== 'string') return null;
  const s = raw.trim();
  if (!s || s.length > 500) return null;
  let u;
  try {
    u = new URL(s);
  } catch {
    return null;
  }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') return null;
  if (u.username || u.password) return null;
  return u.origin + u.pathname.replace(/\/+$/, '');
}

function settingsPath() {
  return path.join(app.getPath('userData'), 'stodia.json');
}

function readSavedUrl() {
  try {
    const data = JSON.parse(fs.readFileSync(settingsPath(), 'utf8'));
    return normalizeUrl(data.url);
  } catch {
    return null;
  }
}

function saveUrl(url) {
  fs.mkdirSync(app.getPath('userData'), { recursive: true });
  const data = { url, configuradoEn: new Date().toISOString() };
  fs.writeFileSync(settingsPath(), JSON.stringify(data, null, 2) + '\n', 'utf8');
}

function resolveStartUrl() {
  const arg = process.argv.find((a) => a.startsWith('--url='));
  const candidates = [
    ['--url=', arg && arg.slice(6)],
    ['STODIA_URL', process.env.STODIA_URL],
    ['stodia.json', readSavedUrl()],
  ];
  for (const [origen, valor] of candidates) {
    if (!valor) continue;
    const url = normalizeUrl(valor);
    if (url) return url;
    console.warn(`URL inválida ignorada (${origen}): solo se admiten http(s).`);
  }
  return null;
}

// Página local de configuración (file://, solo el setup.html propio).
function isSetupUrl(url) {
  try {
    const u = new URL(url);
    return u.protocol === 'file:' && u.pathname === SETUP_PATHNAME;
  } catch {
    return false;
  }
}

function isAllowedNavigation(url) {
  if (isSetupUrl(url)) return true;
  try {
    return remoteOrigin !== null && new URL(url).origin === remoteOrigin;
  } catch {
    return false;
  }
}

// Comprueba GET <base>/api/health y luego <base>/health; exige JSON con status 'ok'.
async function probeServer(base) {
  let ultimoError = 'No se encontró un servidor STODIA en esa dirección (probé /api/health y /health).';
  for (const ruta of ['/api/health', '/health']) {
    try {
      const res = await net.fetch(base + ruta, {
        signal: AbortSignal.timeout(PROBE_TIMEOUT_MS),
        headers: { accept: 'application/json' },
      });
      if (!res.ok) {
        ultimoError = `El servidor respondió HTTP ${res.status} en ${ruta}.`;
        continue;
      }
      const data = await res.json();
      if (!data || data.status !== 'ok') {
        ultimoError = 'La respuesta no es de un servidor STODIA.';
        continue;
      }
      return {
        ok: true,
        estado: data.estado,
        version: typeof data.version === 'string' ? data.version : undefined,
        institucion: typeof data.institucion === 'string' ? data.institucion : undefined,
      };
    } catch (err) {
      ultimoError = err && err.name === 'TimeoutError'
        ? 'El servidor no respondió a tiempo (8 s).'
        : 'No se pudo conectar con el servidor.';
    }
  }
  return { ok: false, error: ultimoError };
}

function loadRemote(url) {
  remoteBase = url;
  remoteOrigin = new URL(url).origin;
  mainWindow.loadURL(url).catch(() => {}); // los fallos llegan por did-fail-load
}

function loadSetup({ error, url } = {}) {
  const query = {};
  if (error) query.error = error;
  if (url) query.url = url;
  mainWindow.loadFile(SETUP_FILE, { query }).catch(() => {});
}

function ensureWindow() {
  if (!mainWindow) createWindow();
  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.focus();
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1366,
    height: 860,
    backgroundColor: '#0B1B4A',
    icon: path.join(__dirname, 'build', process.platform === 'win32' ? 'icon.ico' : 'icon.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
    },
  });

  const wc = mainWindow.webContents;

  // Solo se navega dentro del origen del cliente; todo lo demás abre en el navegador del sistema.
  wc.setWindowOpenHandler(({ url }) => {
    if (/^https?:/.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });
  wc.on('will-navigate', (e, url) => {
    if (isAllowedNavigation(url)) return;
    e.preventDefault();
    if (/^https?:/.test(url)) shell.openExternal(url);
  });

  // Si el servidor guardado no responde, volvemos a la pantalla de conexión con el error.
  wc.on('did-fail-load', (_e, errorCode, errorDescription, validatedURL, isMainFrame) => {
    if (!isMainFrame || errorCode === -3) return; // -3 = navegación cancelada
    if (!remoteOrigin) return;
    let esRemoto = false;
    try {
      esRemoto = new URL(validatedURL).origin === remoteOrigin;
    } catch {
      esRemoto = false;
    }
    if (!esRemoto) return;
    loadSetup({
      error: `No se pudo abrir ${remoteBase} (${errorDescription}). Revisa la dirección o la conexión.`,
      url: remoteBase,
    });
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

function openInitial() {
  const start = resolveStartUrl();
  if (start) loadRemote(start);
  else loadSetup({});
}

function buildMenu() {
  return Menu.buildFromTemplate([
    {
      label: 'Archivo',
      submenu: [
        {
          label: 'Conectar con el servidor…',
          accelerator: 'CmdOrCtrl+Shift+S',
          click: () => {
            ensureWindow();
            loadSetup({ url: remoteBase || readSavedUrl() || undefined });
          },
        },
        { type: 'separator' },
        { role: 'quit', label: 'Salir' },
      ],
    },
    {
      label: 'Editar',
      submenu: [
        { role: 'undo' },
        { role: 'redo' },
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' },
        { role: 'selectAll' },
      ],
    },
    {
      label: 'Ver',
      submenu: [{ role: 'reload', label: 'Recargar' }],
    },
  ]);
}

// IPC: solo acepta llamadas desde la página local de configuración.
function assertSetupSender(event) {
  const frame = event.senderFrame;
  if (!frame || frame.parent !== null || !isSetupUrl(frame.url)) {
    throw new Error('Operación no permitida desde esta página.');
  }
}

ipcMain.handle('stodia:probar', async (event, url) => {
  assertSetupSender(event);
  const base = normalizeUrl(url);
  if (!base) return { ok: false, error: 'La dirección debe empezar por http:// o https://.' };
  return probeServer(base);
});

ipcMain.handle('stodia:guardar', async (event, url) => {
  assertSetupSender(event);
  const base = normalizeUrl(url);
  if (!base) return { ok: false, error: 'La dirección debe empezar por http:// o https://.' };
  const probe = await probeServer(base);
  if (!probe.ok) return probe;
  if (probe.estado === 'pendiente') return { ok: false, pendiente: true, error: PENDIENTE_MSG };
  try {
    saveUrl(base);
  } catch (err) {
    return { ok: false, error: `No se pudo guardar la configuración: ${err.message}` };
  }
  loadRemote(base);
  return { ok: true };
});

app.whenReady().then(() => {
  Menu.setApplicationMenu(buildMenu());
  createWindow();
  openInitial();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
      openInitial();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
