// Genera los iconos PWA y Electron desde apps/web/public/brand/stodia-logo.svg
// Uso: node scripts/make-icons.mjs   (requiere @resvg/resvg-js en apps/web)
import { createRequire } from 'node:module';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const { Resvg } = createRequire(resolve(root, 'apps/web/package.json'))('@resvg/resvg-js');
const logo = readFileSync(resolve(root, 'apps/web/public/brand/stodia-logo.svg'), 'utf8');
const logoUri = 'data:image/svg+xml;base64,' + Buffer.from(logo).toString('base64');

const png = (svg, size) => new Resvg(svg, { fitTo: { mode: 'width', value: size } }).render().asPng();
// Maskable: fondo azul pleno + logo al 70% centrado (zona segura del 80%).
const maskable = size => png(
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect width="100" height="100" fill="#1D4ED8"/><image href="${logoUri}" x="15" y="15" width="70" height="70"/></svg>`, size);

const web = resolve(root, 'apps/web/public');
const desk = resolve(root, 'apps/desktop/build');
mkdirSync(desk, { recursive: true });
writeFileSync(resolve(web, 'icon-192.png'), png(logo, 192));
writeFileSync(resolve(web, 'icon-512.png'), png(logo, 512));
writeFileSync(resolve(web, 'icon-maskable-512.png'), maskable(512));
writeFileSync(resolve(desk, 'icon.png'), png(logo, 512));

// icon.ico con un único PNG de 256px embebido.
const p256 = png(logo, 256);
const head = Buffer.alloc(22);
head.writeUInt16LE(0, 0); head.writeUInt16LE(1, 2); head.writeUInt16LE(1, 4);
head.writeUInt8(0, 6); head.writeUInt8(0, 7); head.writeUInt16LE(1, 10); head.writeUInt16LE(32, 12);
head.writeUInt32LE(p256.length, 14); head.writeUInt32LE(22, 18);
writeFileSync(resolve(desk, 'icon.ico'), Buffer.concat([head, p256]));
console.log('Iconos generados.');
