// Verifica assets y renderiza flyers.html -> out/<id>.png + .jpg (calidad 92) con Edge headless via CDP. Node >=22.
// Aborta (exit 1) si algun asset/imagen/fuente falla. Uso: node scripts/render.mjs [f1 f2 f3]
import { spawn } from 'node:child_process';
import { writeFileSync, mkdirSync, existsSync, readFileSync, statSync, readdirSync } from 'node:fs';
import { resolve, dirname, extname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const out = resolve(root, 'out'); mkdirSync(out, { recursive: true });
const profile = resolve(root, 'scripts', '.profile-render');
const IDS = process.argv.slice(2).length ? process.argv.slice(2) : ['f1', 'f2', 'f3'];
const log = []; const L = s => { console.log(s); log.push(s); };
let fail = false;

// 1) Verificacion de archivos (existe, tamano > 0, cabecera/dimensiones o XML con viewBox)
const html = readFileSync(resolve(root, 'flyers.html'), 'utf8');
const used = [...new Set([...html.matchAll(/src="(assets\/[^"]+)"/g)].map(m => m[1]))];
L('== Verificacion de archivos ==');
for (const rel of used) {
  const f = resolve(root, rel); let res;
  if (!existsSync(f)) res = 'FALLO no existe';
  else if (statSync(f).size === 0) res = 'FALLO tamano 0';
  else {
    const b = readFileSync(f), ext = extname(f).toLowerCase();
    if (ext === '.png') res = b.subarray(1, 4).toString() === 'PNG' && b.readUInt32BE(12) === 0x49484452 ? `OK PNG ${b.readUInt32BE(16)}x${b.readUInt32BE(20)} (${b.length} B)` : 'FALLO cabecera PNG';
    else if (ext === '.svg') { const t = b.toString('utf8'); res = /<svg[\s>]/.test(t) && /viewBox="[^"]+"/.test(t) && /<\/svg>\s*$/.test(t) ? `OK SVG viewBox=${t.match(/viewBox="([^"]+)"/)[1]} (${b.length} B)` : 'FALLO SVG sin viewBox/cierre'; }
    else res = 'FALLO formato no soportado';
  }
  if (res.startsWith('FALLO')) fail = true;
  L(`${rel} | ${res}`);
}
if (fail) { L('ABORTADO: assets invalidos'); writeFileSync(resolve(out, 'verificacion-assets.txt'), log.join('\n')); process.exit(1); }

const exe = ['C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', 'C:/Program Files/Microsoft/Edge/Application/msedge.exe'].find(existsSync);
const port = 9361;
const p = spawn(exe, ['--headless=new', `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`, '--hide-scrollbars', '--disable-gpu', '--allow-file-access-from-files', '--window-size=1700,1300', 'about:blank'], { stdio: 'ignore' });
const sleep = ms => new Promise(r => setTimeout(r, ms));
let tabs; for (let i = 0; i < 50; i++) { try { tabs = await (await fetch(`http://127.0.0.1:${port}/json`)).json(); break; } catch { await sleep(200); } }
const ws = new WebSocket(tabs.find(t => t.type === 'page').webSocketDebuggerUrl);
await new Promise(r => ws.onopen = r);
let id = 0; const pend = new Map();
ws.onmessage = e => { const m = JSON.parse(e.data); if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id); } };
const send = (method, params = {}) => new Promise(r => { const i = ++id; pend.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
const ev = async expr => { const r = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true }); if (r.result?.exceptionDetails) throw new Error(JSON.stringify(r.result.exceptionDetails)); return r.result?.result?.value; };
const done = async (code) => { writeFileSync(resolve(out, 'verificacion-assets.txt'), log.join('\n')); try { ws.close(); } catch {} p.kill(); process.exit(code); };

await send('Page.enable'); await send('Runtime.enable');
await send('Emulation.setDeviceMetricsOverride', { width: 1700, height: 1300, deviceScaleFactor: 1, mobile: false });
await send('Page.navigate', { url: pathToFileURL(resolve(root, 'flyers.html')).href });
await sleep(1500);
// 2) Imagenes por slide + SVG parseable en el navegador + fuentes
const rep = await ev(`(async()=>{
  const out={imgs:[],bad:[],svg:[],fonts:{}};
  await Promise.all([...document.images].map(i=>i.complete?1:new Promise(r=>{i.onload=i.onerror=r;setTimeout(r,15000)})));
  for(const s of document.querySelectorAll('section.slide')) for(const i of s.querySelectorAll('img')){
    const ok=i.complete&&i.naturalWidth>0; out.imgs.push([s.id,i.getAttribute('src'),ok,i.naturalWidth,i.naturalHeight]); if(!ok) out.bad.push(s.id+':'+i.getAttribute('src'));
  }
  for(const u of new Set([...document.images].map(i=>i.getAttribute('src')).filter(s=>s.endsWith('.svg')))){
    const t=await (await fetch(u)).text(); const d=new DOMParser().parseFromString(t,'image/svg+xml');
    out.svg.push([u,!d.querySelector('parsererror'),d.documentElement.getAttribute('viewBox')]);
  }
  await document.fonts.ready;
  for(const f of ['Inter','JetBrains Mono','Caveat']){ await document.fonts.load('700 20px "'+f+'"'); out.fonts[f]=document.fonts.check('700 20px "'+f+'"'); }
  out.fontsLoaded=[...document.fonts].filter(f=>f.status==='loaded').map(f=>f.family).filter((v,i,a)=>a.indexOf(v)===i);
  return out;})()`);
L('== Imagenes en slides (complete && naturalWidth>0) ==');
for (const [s, src, ok, w, h] of rep.imgs) L(`${s} | ${src} | ${ok ? 'OK' : 'FALLO'} ${w}x${h}`);
L('== SVG parseados en navegador ==');
for (const [u, ok, vb] of rep.svg) { L(`${u} | ${ok ? 'OK' : 'FALLO'} viewBox=${vb}`); if (!ok) fail = true; }
L('== Fuentes ==');
for (const [f, ok] of Object.entries(rep.fonts)) { L(`${f} | ${ok ? 'OK' : 'FALLO'}`); if (!ok) fail = true; }
L('cargadas: ' + rep.fontsLoaded.join(', '));
if (rep.bad.length) { L('ABORTADO: imagenes que no cargaron: ' + rep.bad.join(', ')); await done(1); }
if (fail) { L('ABORTADO: fuentes/SVG con fallo (sin red a Google Fonts?)'); await done(1); }

for (const sid of IDS) {
  const r = await ev(`(()=>{const e=document.getElementById(${JSON.stringify(sid)});e.scrollIntoView();const b=e.getBoundingClientRect();return [b.x+scrollX,b.y+scrollY,b.width,b.height]})()`);
  if (r[2] !== 1600 || r[3] !== 1200) { L(`ABORTADO: ${sid} mide ${r[2]}x${r[3]}`); await done(1); }
  for (const [fmt, ext] of [['png', 'png'], ['jpeg', 'jpg']]) {
    const s = await send('Page.captureScreenshot', { format: fmt, ...(fmt === 'jpeg' ? { quality: 92 } : {}), captureBeyondViewport: true, clip: { x: r[0], y: r[1], width: 1600, height: 1200, scale: 1 } });
    writeFileSync(resolve(out, `${sid}.${ext}`), Buffer.from(s.result.data, 'base64'));
  }
  L(`render ${sid} ok`);
}
await done(0);
