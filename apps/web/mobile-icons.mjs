// Genera los mipmap del launcher Android desde public/brand/stodia-mark.svg (usa @resvg/resvg-js).
import { Resvg } from '@resvg/resvg-js';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
const svg = readFileSync('public/brand/stodia-mark.svg', 'utf8');
const res = 'android/app/src/main/res';
const BG = '#1D4ED8';
const dens = { mdpi: 1, hdpi: 1.5, xhdpi: 2, xxhdpi: 3, xxxhdpi: 4 };
const b64 = Buffer.from(svg).toString('base64');
const wrap = (size, inner, bg, radius) => `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">${bg ? `<rect width="${size}" height="${size}" rx="${radius}" fill="${BG}"/>` : ''}<image href="data:image/svg+xml;base64,${b64}" x="${size * (1 - inner) / 2}" y="${size * (1 - inner) / 2}" width="${size * inner}" height="${size * inner}" preserveAspectRatio="xMidYMid meet"/></svg>`;
const png = (s) => new Resvg(s).render().asPng();
for (const [d, k] of Object.entries(dens)) {
  const dir = `${res}/mipmap-${d}`; mkdirSync(dir, { recursive: true });
  const l = 48 * k, f = 108 * k;
  writeFileSync(`${dir}/ic_launcher.png`, png(wrap(l, 0.7, true, l * 0.2)));
  writeFileSync(`${dir}/ic_launcher_round.png`, png(wrap(l, 0.62, true, l / 2)));
  writeFileSync(`${dir}/ic_launcher_foreground.png`, png(wrap(f, 0.5, false, 0)));
}
// Splash
for (const dir of ['drawable', 'drawable-land', 'drawable-port']) {
  try { writeFileSync(`${res}/${dir}/splash.png`, png(wrap(1080, 0.35, false, 0).replace('<image', `<rect width="1080" height="1080" fill="#0B1B4A"/><image`))); } catch {}
}
writeFileSync(`${res}/values/ic_launcher_background.xml`, `<?xml version="1.0" encoding="utf-8"?>\n<resources>\n    <color name="ic_launcher_background">${BG}</color>\n</resources>\n`);
