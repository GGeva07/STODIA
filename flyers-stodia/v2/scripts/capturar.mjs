// Captura pantallas reales de STODIA (dev local) con Edge headless via CDP. Node >=22, sin dependencias.
// Uso: node scripts/capturar.mjs   (requiere API en :3000 y web en :5173 ya corriendo)
import { spawn } from 'node:child_process';
import { writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const assets = resolve(root, 'assets'); mkdirSync(assets, { recursive: true });
const profile = resolve(root, 'scripts', '.profile-cap');
const API = 'http://localhost:3000', WEB = 'http://localhost:5173';
const exe = ['C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', 'C:/Program Files/Microsoft/Edge/Application/msedge.exe'].find(existsSync);
const port = 9351;
const p = spawn(exe, ['--headless=new', `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`, '--hide-scrollbars', '--disable-gpu', 'about:blank'], { stdio: 'ignore' });
const sleep = ms => new Promise(r => setTimeout(r, ms));
let tabs; for (let i = 0; i < 50; i++) { try { tabs = await (await fetch(`http://127.0.0.1:${port}/json`)).json(); break; } catch { await sleep(200); } }
const ws = new WebSocket(tabs.find(t => t.type === 'page').webSocketDebuggerUrl);
await new Promise(r => ws.onopen = r);
let id = 0; const pend = new Map();
ws.onmessage = e => { const m = JSON.parse(e.data); if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id); } else if (m.method === 'Fetch.requestPaused') handlePaused(m.params); };
const send = (method, params = {}) => new Promise(r => { const i = ++id; pend.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
const ev = async expr => (await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true })).result?.result?.value;
// Intercepta /config.json (sin tocar el archivo del repo) y lo apunta al API local
function handlePaused(q) {
  send('Fetch.fulfillRequest', { requestId: q.requestId, responseCode: 200, responseHeaders: [{ name: 'Content-Type', value: 'application/json' }], body: Buffer.from(JSON.stringify({ apiUrl: API, licenseKey: '', institutionName: 'Colegio Los Pinos', askServer: false })).toString('base64') });
}
await send('Page.enable'); await send('Runtime.enable');
await send('Fetch.enable', { patterns: [{ urlPattern: '*/config.json', requestStage: 'Request' }] });

async function login(usuario) {
  const r = await fetch(API + '/auth/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ usuario, password: 'stodia123' }) });
  if (!r.ok) throw new Error('login fallo ' + usuario + ' ' + r.status);
  return await r.json();
}
async function viewport(w, h, mobile) {
  await send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 2, mobile: !!mobile });
  if (mobile) await send('Emulation.setTouchEmulationEnabled', { enabled: true });
}
async function shot(name, url, token, { wait = 4500, clip, prep } = {}) {
  await send('Page.navigate', { url: WEB + '/login' }); await sleep(1500);
  await ev(`localStorage.setItem('stodia.token', ${JSON.stringify(token.token)}); localStorage.setItem('stodia.user', ${JSON.stringify(JSON.stringify(token.user))}); localStorage.setItem('stodia.apiUrl', ${JSON.stringify(API)}); localStorage.removeItem('stodia.cookies');`);
  await send('Page.navigate', { url: WEB + url });
  await sleep(wait);
  await ev(`document.fonts.ready.then(()=>true)`);
  // quita banners de cookies / overlays
  await ev(`[...document.querySelectorAll('*')].filter(e=>/cookie/i.test(e.className?.toString()||'')||(['fixed','sticky'].includes(getComputedStyle(e).position)&&/cookie|aceptar todas|rechazar/i.test(e.innerText||'')&&(e.innerText||'').length<400)).forEach(e=>e.remove())`);
  if (prep) { await ev(prep); await sleep(1500); }
  const s = await send('Page.captureScreenshot', { format: 'png', ...(clip ? { clip: { ...clip, scale: 1 } } : {}) });
  writeFileSync(resolve(assets, name + '.png'), Buffer.from(s.result.data, 'base64'));
  console.log('captura', name, await ev('location.pathname'), (await ev('document.body.innerText.slice(0,80).replace(/\n/g," ")')));
}
const only = process.argv.slice(2);
const want = n => !only.length || only.includes(n);
const admin = await login('usr_palmanzar');
const H = { authorization: 'Bearer ' + admin.token };
const alumnos = await (await fetch(API + '/directorio', { headers: H })).json().catch(() => null);
console.log('alumnos', Array.isArray(alumnos) ? alumnos.length : JSON.stringify(alumnos)?.slice(0, 200));
const lista = Array.isArray(alumnos) ? alumnos : (alumnos?.items ?? alumnos?.alumnos ?? []);
const al = lista.find(a => a.tutor || a.tutorId || a.responsable) ?? lista[0];
console.log('alumno muestra', al && al.id, al && (al.nombre ?? al.nombres));
await viewport(1440, 900, false);
if (want('directorio')) await shot('captura-directorio', '/directorio', admin);
if (want('expediente') && al) await shot('captura-expediente', '/expediente/' + al.id, admin);
if (want('notas')) await shot('captura-notas', '/notas', admin);
if (want('asistencia')) await shot('captura-asistencia', '/asistencia', admin);
if (want('horarios')) await shot('captura-horarios', '/horarios', admin);
if (want('finanzas')) await shot('captura-finanzas', '/inf-cxc', admin);
if (want('caja')) await shot('captura-caja', '/pos', admin);
if (want('comedor')) await shot('captura-comedor', '/comedor', admin);
if (want('inscripcion')) await shot('captura-inscripcion', '/inscripcion', admin);
if (want('dashboard')) await shot('captura-dashboard', '/dashboard', admin);
if (want('portal')) await shot('captura-portal-admin', '/portal', admin);

const clickTxt = t => `[...document.querySelectorAll('button,a,[role=tab]')].find(e=>e.innerText.trim().startsWith(${JSON.stringify(t)}))?.click()`;
if (want('exp-cuenta') && al) await shot('captura-expediente-cuenta', '/expediente/' + al.id, admin, { prep: clickTxt('Estado de cuenta') });
if (want('exp-red') && al) await shot('captura-expediente-red', '/expediente/' + al.id, admin, { prep: clickTxt('Red familiar') });
if (want('exp-acad') && al) await shot('captura-expediente-academico', '/expediente/' + al.id, admin, { prep: clickTxt('Historial académico') });
if (want('exp-serv') && al) await shot('captura-expediente-servicios', '/expediente/' + al.id, admin, { prep: clickTxt('Servicios y Contrato') });
const doc = await login('usr_ralmonte');
if (want('notas-doc')) await shot('captura-notas-docente', '/notas', doc);
if (want('asis-doc')) await shot('captura-asistencia-docente', '/asistencia', doc);
if (want('horarios-sel')) await shot('captura-horarios-grado', '/horarios', admin, { prep: "(()=>{const s=document.querySelector('select');const o=[...s.options].find(o=>/^5to A/.test(o.text))||s.options[s.options.length-3];const set=Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype,'value').set;set.call(s,o.value);s.dispatchEvent(new Event('change',{bubbles:true}));})()" });
const tutor = await login('c.mendoza');
await viewport(390, 844, true);
if (want('tutor')) await shot('captura-portal-tutor', '/m/tutor', tutor);
if (want('tutor-notas')) await shot('captura-portal-tutor-notas', '/m/tutor', tutor, { prep: "[...document.querySelectorAll('button')].find(e=>e.innerText.trim()==='Notas')?.click()" });
if (want('tutor-sofia')) await shot('captura-portal-tutor-sofia', '/m/tutor', tutor, { prep: "[...document.querySelectorAll('button')].find(e=>e.innerText.trim().startsWith('Sofía'))?.click()" });
await send('Emulation.clearDeviceMetricsOverride');
ws.close(); p.kill();
