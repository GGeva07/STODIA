// Shell Electron de STODIA. Lleva la interfaz EMPAQUETADA (apps/web/dist) y solo se conecta a la API del colegio.
// Servidor: --url= > STODIA_URL > userData/stodia.json > pantalla local «Conectar con el servidor» (que también hace la
// activación inicial si el servidor está nuevo). La interfaz se sirve por app://stodia/ y su /config.json apunta a la API.
const { app, BrowserWindow, shell, Menu, ipcMain, net, protocol } = require('electron');
const path = require('node:path');
const fs = require('node:fs');
const { pathToFileURL } = require('node:url');

const APP_SCHEME = 'app';
const APP_ORIGIN = 'app://stodia';
protocol.registerSchemesAsPrivileged([
  { scheme: APP_SCHEME, privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true } },
]);

const SETUP_FILE = path.join(__dirname, 'setup.html');
const SETUP_PATHNAME = pathToFileURL(SETUP_FILE).pathname;
const PROBE_TIMEOUT_MS = 8000;
const ACTIVAR_TIMEOUT_MS = 40000; // el servidor verifica el RNC en la DGII

let mainWindow = null;
let serverUrl = null; // dirección que escribió el usuario (sin / final)
let apiBase = null;   // base real de la API (serverUrl o serverUrl + '/api')
let institucion = '';

// Acepta solo http(s) sin credenciales; devuelve origen + ruta sin / final, o null.
function normalizeUrl(raw) {
  if (typeof raw !== 'string') return null;
  const s = raw.trim();
  if (!s || s.length > 500) return null;
  let u;
  try { u = new URL(s); } catch { return null; }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') return null;
  if (u.username || u.password) return null;
  return u.origin + u.pathname.replace(/\/+$/, '');
}

const settingsPath = () => path.join(app.getPath('userData'), 'stodia.json');

function readSavedUrl() {
  try { return normalizeUrl(JSON.parse(fs.readFileSync(settingsPath(), 'utf8')).url); } catch { return null; }
}

function saveUrl(url) {
  fs.mkdirSync(app.getPath('userData'), { recursive: true });
  fs.writeFileSync(settingsPath(), JSON.stringify({ url, configuradoEn: new Date().toISOString() }, null, 2) + '\n', 'utf8');
}

function resolveStartUrl() {
  const arg = process.argv.find((a) => a.startsWith('--url='));
  for (const [origen, valor] of [['--url=', arg && arg.slice(6)], ['STODIA_URL', process.env.STODIA_URL], ['stodia.json', readSavedUrl()]]) {
    if (!valor) continue;
    const url = normalizeUrl(valor);
    if (url) return url;
    console.warn(`URL inválida ignorada (${origen}): solo se admiten http(s).`);
  }
  return null;
}

// GET <base>/api/health y luego <base>/health; exige JSON con status 'ok'. Devuelve también la base de la API.
async function probeServer(base) {
  let ultimoError = 'No se encontró un servidor STODIA en esa dirección (probé /api/health y /health).';
  for (const ruta of ['/api/health', '/health']) {
    try {
      const res = await net.fetch(base + ruta, { signal: AbortSignal.timeout(PROBE_TIMEOUT_MS), headers: { accept: 'application/json' } });
      if (!res.ok) { ultimoError = `El servidor respondió HTTP ${res.status} en ${ruta}.`; continue; }
      const data = await res.json();
      if (!data || data.status !== 'ok') { ultimoError = 'La respuesta no es de un servidor STODIA.'; continue; }
      return {
        ok: true,
        api: ruta === '/api/health' ? base + '/api' : base,
        estado: data.estado,
        version: typeof data.version === 'string' ? data.version : undefined,
        institucion: typeof data.institucion === 'string' ? data.institucion : undefined,
      };
    } catch (err) {
      ultimoError = err && err.name === 'TimeoutError' ? 'El servidor no respondió a tiempo (8 s).' : 'No se pudo conectar con el servidor.';
    }
  }
  return { ok: false, error: ultimoError };
}

// ---- Interfaz empaquetada servida por app://stodia/ -------------------------------------------------------------------
const webRoot = () => (app.isPackaged ? path.join(process.resourcesPath, 'web') : path.join(__dirname, '..', 'web', 'dist'));

function serveApp(request) {
  const u = new URL(request.url);
  if (u.hostname !== 'stodia') return new Response('No encontrado', { status: 404 });
  let rel;
  try { rel = decodeURIComponent(u.pathname); } catch { return new Response('Solicitud inválida', { status: 400 }); }
  // config en tiempo de ejecución: la web lee /config.json para saber a qué API hablar.
  if (rel === '/config.json') {
    return new Response(JSON.stringify({ apiUrl: apiBase || '', licenseKey: '', institutionName: institucion }), { headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } });
  }
  const root = webRoot();
  const file = path.resolve(root, '.' + rel);
  if (file !== root && !file.startsWith(root + path.sep)) return new Response('Prohibido', { status: 403 });
  let target = file;
  try { if (!fs.statSync(target).isFile()) throw new Error('no es archivo'); } catch {
    if (path.extname(rel)) return new Response('No encontrado', { status: 404 });
    target = path.join(root, 'index.html'); // ruta de la SPA (react-router)
  }
  return net.fetch(pathToFileURL(target).toString());
}

// ---- Ventana ----------------------------------------------------------------------------------------------------------
function isSetupUrl(url) {
  try { const u = new URL(url); return u.protocol === 'file:' && u.pathname === SETUP_PATHNAME; } catch { return false; }
}
function isAllowedNavigation(url) {
  if (isSetupUrl(url)) return true;
  try { return new URL(url).origin === APP_ORIGIN; } catch { return false; }
}

function loadSetup({ error, url, pendiente } = {}) {
  const query = {};
  if (error) query.error = error;
  if (url) query.url = url;
  if (pendiente) query.pendiente = '1';
  mainWindow.loadFile(SETUP_FILE, { query }).catch(() => {});
}

// Comprueba el servidor y abre la interfaz; si falla o está sin activar, vuelve a la pantalla de conexión.
async function abrirServidor(url) {
  const probe = await probeServer(url);
  if (!probe.ok) return loadSetup({ error: `No se pudo abrir ${url}. ${probe.error}`, url });
  if (probe.estado === 'pendiente') return loadSetup({ url, pendiente: true });
  serverUrl = url; apiBase = probe.api; institucion = probe.institucion || '';
  mainWindow.loadURL(APP_ORIGIN + '/').catch(() => {});
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1366, height: 860, backgroundColor: '#0B1B4A',
    icon: path.join(__dirname, 'build', process.platform === 'win32' ? 'icon.ico' : 'icon.png'),
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, nodeIntegration: false, sandbox: true, webSecurity: true },
  });
  const wc = mainWindow.webContents;
  // Solo se navega dentro de la app; todo lo demás abre en el navegador del sistema.
  wc.setWindowOpenHandler(({ url }) => { if (/^https?:/.test(url)) shell.openExternal(url); return { action: 'deny' }; });
  wc.on('will-navigate', (e, url) => { if (isAllowedNavigation(url)) return; e.preventDefault(); if (/^https?:/.test(url)) shell.openExternal(url); });
  mainWindow.on('closed', () => { mainWindow = null; });
}

function ensureWindow() {
  if (!mainWindow) createWindow();
  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.focus();
}

function openInitial() {
  const start = resolveStartUrl();
  if (start) void abrirServidor(start); else loadSetup({});
}

function buildMenu() {
  return Menu.buildFromTemplate([
    { label: 'Archivo', submenu: [
      { label: 'Conectar con el servidor…', accelerator: 'CmdOrCtrl+Shift+S', click: () => { ensureWindow(); loadSetup({ url: serverUrl || readSavedUrl() || undefined }); } },
      { type: 'separator' }, { role: 'quit', label: 'Salir' } ] },
    { label: 'Editar', submenu: [{ role: 'undo' }, { role: 'redo' }, { type: 'separator' }, { role: 'cut' }, { role: 'copy' }, { role: 'paste' }, { role: 'selectAll' }] },
    { label: 'Ver', submenu: [{ role: 'reload', label: 'Recargar' }] },
  ]);
}

// ---- IPC: solo desde la página local de conexión ------------------------------------------------------------------------
function assertSetupSender(event) {
  const frame = event.senderFrame;
  if (!frame || frame.parent !== null || !isSetupUrl(frame.url)) throw new Error('Operación no permitida desde esta página.');
}
const MSG_URL = 'La dirección debe empezar por http:// o https://.';
const txt = (v, max) => (typeof v === 'string' ? v.trim().slice(0, max) : '');

ipcMain.handle('stodia:probar', async (event, url) => {
  assertSetupSender(event);
  const base = normalizeUrl(url);
  return base ? probeServer(base) : { ok: false, error: MSG_URL };
});

// Servidor ya activado: guarda la dirección y abre la interfaz.
ipcMain.handle('stodia:conectar', async (event, url) => {
  assertSetupSender(event);
  const base = normalizeUrl(url);
  if (!base) return { ok: false, error: MSG_URL };
  const probe = await probeServer(base);
  if (!probe.ok) return probe;
  if (probe.estado === 'pendiente') return { ok: false, pendiente: true, error: 'Este servidor aún no está activado.' };
  try { saveUrl(base); } catch (err) { return { ok: false, error: `No se pudo guardar la configuración: ${err.message}` }; }
  serverUrl = base; apiBase = probe.api; institucion = probe.institucion || '';
  mainWindow.loadURL(APP_ORIGIN + '/').catch(() => {});
  return { ok: true };
});

// Primera configuración del colegio: POST /instalacion/activar con el código de un solo uso del servidor.
ipcMain.handle('stodia:activar', async (event, payload) => {
  assertSetupSender(event);
  const p = payload && typeof payload === 'object' ? payload : {};
  const base = normalizeUrl(p.url);
  if (!base) return { ok: false, error: MSG_URL };
  const probe = await probeServer(base);
  if (!probe.ok) return probe;
  if (probe.estado !== 'pendiente') return { ok: false, error: 'Este servidor ya está activado. Usa «Conectar».' };
  const d = p.datos && typeof p.datos === 'object' ? p.datos : {};
  const body = {
    codigo: txt(d.codigo, 20),
    institucion: { nombre: txt(d.nombre, 200), rnc: txt(d.rnc, 20), direccion: txt(d.direccion, 200), ciudad: txt(d.ciudad, 100), telefono: txt(d.telefono, 20), email: txt(d.email, 200) },
    admin: { usuario: txt(d.usuario, 32), nombre: txt(d.adminNombre, 100), password: typeof d.password === 'string' ? d.password.slice(0, 200) : '' },
    pin: txt(d.pin, 8),
    zonaHoraria: txt(d.zonaHoraria, 64) || 'America/Santo_Domingo',
    moneda: txt(d.moneda, 3) || 'DOP',
  };
  const lic = txt(d.licencia, 4000);
  if (lic) body.licencia = lic;
  try {
    const res = await net.fetch(probe.api + '/instalacion/activar', {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body), signal: AbortSignal.timeout(ACTIVAR_TIMEOUT_MS),
    });
    let data = {};
    try { data = await res.json(); } catch { /* sin cuerpo JSON */ }
    if (res.status !== 201) return { ok: false, status: res.status, error: data.error || `El servidor respondió HTTP ${res.status}.` };
    return { ok: true, admin: data.admin, rnc: data.rnc };
  } catch (err) {
    return { ok: false, error: err && err.name === 'TimeoutError' ? 'El servidor tardó demasiado en responder.' : 'No se pudo conectar con el servidor.' };
  }
});

app.whenReady().then(() => {
  protocol.handle(APP_SCHEME, serveApp);
  Menu.setApplicationMenu(buildMenu());
  createWindow();
  openInitial();
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) { createWindow(); openInitial(); } });
});

app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
