// Render flyers.html -> out/<id>.png + out/<id>.jpg con Edge/Chromium headless via CDP (Node >=22, sin dependencias)
import { spawn } from 'node:child_process';
import { writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const out = resolve(root, 'out'); mkdirSync(out, { recursive: true });
const profile = resolve(root, 'scripts', '.profile');
const IDS = process.argv.slice(2).length ? process.argv.slice(2) : ['f1', 'f2', 'f3'];
const cands = [process.env.CHROME, 'C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'].filter(Boolean);
const exe = cands.find(existsSync); if (!exe) throw new Error('No Chromium/Edge');
const port = 9341;
const p = spawn(exe, ['--headless=new', `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`, '--hide-scrollbars', '--disable-gpu', '--allow-file-access-from-files', '--window-size=1700,1300', 'about:blank'], { stdio: 'ignore' });
const sleep = ms => new Promise(r => setTimeout(r, ms));
let tabs; for (let i = 0; i < 50; i++) { try { tabs = await (await fetch(`http://127.0.0.1:${port}/json`)).json(); break; } catch { await sleep(200); } }
const ws = new WebSocket(tabs.find(t => t.type === 'page').webSocketDebuggerUrl);
await new Promise(r => ws.onopen = r);
let id = 0; const pend = new Map();
ws.onmessage = e => { const m = JSON.parse(e.data); if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id); } };
const send = (method, params = {}) => new Promise(r => { const i = ++id; pend.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
await send('Page.enable');
await send('Emulation.setDeviceMetricsOverride', { width: 1700, height: 1300, deviceScaleFactor: 1, mobile: false });
await send('Page.navigate', { url: pathToFileURL(resolve(root, 'flyers.html')).href });
await sleep(2500);
await send('Runtime.evaluate', { expression: 'document.fonts.ready.then(()=>1)', awaitPromise: true });
await sleep(800);
for (const sid of IDS) {
  const r = await send('Runtime.evaluate', { expression: `(()=>{const b=document.getElementById('${sid}').getBoundingClientRect();return JSON.stringify([b.x,b.y+scrollY,b.width,b.height])})()`, returnByValue: true });
  const [x, y, w, h] = JSON.parse(r.result.result.value);
  for (const [fmt, ext] of [['png', 'png'], ['jpeg', 'jpg']]) {
    const s = await send('Page.captureScreenshot', { format: fmt, quality: 92, captureBeyondViewport: true, clip: { x, y, width: 1600, height: 1200, scale: 1 } });
    writeFileSync(resolve(out, `${sid}.${ext}`), Buffer.from(s.result.data, 'base64'));
  }
  console.log(sid, w, h, 'ok');
}
ws.close(); p.kill();
