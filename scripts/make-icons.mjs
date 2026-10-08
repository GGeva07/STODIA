// Genera los iconos PWA y Electron desde apps/web/public/brand/stodia-mark.svg
// Uso: node scripts/make-icons.mjs   (requiere @resvg/resvg-js en apps/web)
import { createRequire } from 'node:module';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const { Resvg } = createRequire(resolve(root, 'apps/web/package.json'))('@resvg/resvg-js');
const logo = readFileSync(resolve(root, 'apps/web/public/brand/stodia-mark.svg'), 'utf8');
const logoUri = 'data:image/svg+xml;base64,' + Buffer.from(logo).toString('base64');

const png = (svg, size) => new Resvg(svg, { fitTo: { mode: 'width', value: size } }).render().asPng();
// La marca es vertical (104:190): se compone centrada (alto = frac del lienzo) sobre azul #1D4ED8.
// Icono normal: esquinas redondeadas, marca al 70% del alto. Maskable: fondo pleno, marca al 56% (zona segura).
const tile = (frac, radius) => {
  const h = 100 * frac, w = h * 104 / 190;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect width="100" height="100" rx="${radius}" fill="#1D4ED8"/><image href="${logoUri}" x="${(100 - w) / 2}" y="${(100 - h) / 2}" width="${w}" height="${h}"/></svg>`;
};
const iconSvg = tile(0.7, 22);
const maskable = size => png(tile(0.56, 0), size);

const web = resolve(root, 'apps/web/public');
const desk = resolve(root, 'apps/desktop/build');
mkdirSync(desk, { recursive: true });
writeFileSync(resolve(web, 'icon-192.png'), png(iconSvg, 192));
writeFileSync(resolve(web, 'icon-512.png'), png(iconSvg, 512));
writeFileSync(resolve(web, 'icon-maskable-512.png'), maskable(512));
writeFileSync(resolve(desk, 'icon.png'), png(iconSvg, 512));

// icon.ico con un único PNG de 256px embebido.
const p256 = png(iconSvg, 256);
const head = Buffer.alloc(22);
head.writeUInt16LE(0, 0); head.writeUInt16LE(1, 2); head.writeUInt16LE(1, 4);
head.writeUInt8(0, 6); head.writeUInt8(0, 7); head.writeUInt16LE(1, 10); head.writeUInt16LE(32, 12);
head.writeUInt32LE(p256.length, 14); head.writeUInt32LE(22, 18);
writeFileSync(resolve(desk, 'icon.ico'), Buffer.concat([head, p256]));
console.log('Iconos generados.');
