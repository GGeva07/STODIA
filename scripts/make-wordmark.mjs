// Genera el wordmark STODIA con el texto convertido a trazos (sin depender de la fuente Caveat).
// Fuente: @fontsource/caveat (Caveat Bold, licencia OFL). Uso: node scripts/make-wordmark.mjs
// Parámetros tomados de apps/web/dist/brand/txt-stodia.svg (Inkscape): font-size 73.6364, x=-0.2607384, y=58.081448,
// transform scale(0.98029932,1.0200966), relleno linearGradient13, contorno negro 0.383523.
import { createRequire } from 'node:module';
import { inflateSync } from 'node:zlib';
import { pathToFileURL } from 'node:url';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(resolve(root, 'apps/web/package.json'));
const opentype = require('opentype.js');
const fontPath = require.resolve('@fontsource/caveat/files/caveat-latin-700-normal.woff');
const woff = readFileSync(fontPath);

// WOFF -> sfnt (HarfBuzz necesita sfnt; el .woff solo comprime las tablas con zlib)
function woffToSfnt(b) {
  const n = b.readUInt16BE(12);
  const tabs = [];
  let pos = 12 + n * 16;
  for (let i = 0; i < n; i++) {
    const o = 44 + i * 20;
    const t = { tag: b.subarray(o, o + 4), off: b.readUInt32BE(o + 4), cl: b.readUInt32BE(o + 8), ol: b.readUInt32BE(o + 12), cs: b.readUInt32BE(o + 16) };
    let d = b.subarray(t.off, t.off + t.cl);
    if (t.cl < t.ol) d = inflateSync(d);
    t.d = d; t.o = pos; pos += (d.length + 3) & ~3;
    tabs.push(t);
  }
  const out = Buffer.alloc(pos);
  out.writeUInt32BE(b.readUInt32BE(4), 0); out.writeUInt16BE(n, 4);
  let sr = 1, es = 0; while (sr * 2 <= n) { sr *= 2; es++; }
  out.writeUInt16BE(sr * 16, 6); out.writeUInt16BE(es, 8); out.writeUInt16BE(n * 16 - sr * 16, 10);
  tabs.forEach((t, i) => { const o = 12 + i * 16; t.tag.copy(out, o); out.writeUInt32BE(t.cs, o + 4); out.writeUInt32BE(t.o, o + 8); out.writeUInt32BE(t.d.length, o + 12); t.d.copy(out, t.o); });
  return out;
}
const sfnt = woffToSfnt(woff);
const font = opentype.parse(sfnt.buffer.slice(sfnt.byteOffset, sfnt.byteOffset + sfnt.byteLength));
const hb = await import(pathToFileURL(require.resolve('harfbuzzjs')).href);
const hface = new hb.Face(new hb.Blob(sfnt));
const hfont = new hb.Font(hface);
const buffer = new hb.Buffer();
buffer.addText('STODIA'); buffer.guessSegmentProperties();
hb.shape(hfont, buffer); // aplica calt/kern como el navegador e Inkscape

const SIZE = 73.6364, X = -0.2607384, Y = 58.081448, SX = 0.98029932, SY = 1.0200966, STROKE = 0.383523, MARGIN = 0.8;
const path = new opentype.Path();
const infos = buffer.getGlyphInfos(), poss = buffer.getGlyphPositions();
let pen = X;
infos.forEach((g, i) => {
  const gp = font.glyphs.get(g.codepoint).getPath(pen + poss[i].xOffset * SIZE / font.unitsPerEm, Y - poss[i].yOffset * SIZE / font.unitsPerEm, SIZE);
  path.commands.push(...gp.commands);
  pen += poss[i].xAdvance * SIZE / font.unitsPerEm;
});
const bb = path.getBoundingBox();
const h = STROKE / 2;
const x1 = bb.x1 * SX - h * SX - MARGIN, x2 = bb.x2 * SX + h * SX + MARGIN;
const y1 = bb.y1 * SY - h * SY - MARGIN, y2 = bb.y2 * SY + h * SY + MARGIN;
const r = (n) => +n.toFixed(3);
const vb = `${r(x1)} ${r(y1)} ${r(x2 - x1)} ${r(y2 - y1)}`;
const d = path.toPathData(3);

const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${vb}" width="100%" height="100%" role="img" aria-label="STODIA">
<defs><linearGradient id="g" x1="1.2733532" y1="31.888032" x2="304.43622" y2="31.888032" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="#fde047"/><stop offset="0.5" stop-color="#f59e0b"/><stop offset="1" stop-color="#d97706"/></linearGradient></defs>
<g transform="scale(0.98029932 1.0200966)"><path d="${d}" fill="url(#g)" stroke="#000" stroke-width="${STROKE}" fill-rule="nonzero"/></g>
</svg>
`;
for (const out of ['apps/web/public/brand/stodia-wordmark.svg', 'landing-site/public/brand/stodia-wordmark.svg']) {
  mkdirSync(dirname(resolve(root, out)), { recursive: true });
  writeFileSync(resolve(root, out), svg);
}
console.log('viewBox', vb, 'ratio', r((x2 - x1) / (y2 - y1)), 'bytes', svg.length);
