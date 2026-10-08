// Genera public/og-image.png (1200x630) a partir de scripts/og-image.svg. Uso: pnpm --filter @stodia/web og
import { Resvg } from '@resvg/resvg-js';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const svg = readFileSync(resolve(here, 'og-image.svg'), 'utf8');
const png = new Resvg(svg, { fitTo: { mode: 'width', value: 1200 }, font: { loadSystemFonts: true } }).render().asPng();
writeFileSync(resolve(here, '../public/og-image.png'), png);
console.log(`og-image.png generado (${png.length} bytes)`);
