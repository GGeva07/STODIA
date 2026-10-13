// Falla si algo fuera de apps/api (y de este paquete) referencia @stodia/dgii-ecf.
// La web, shared, desktop y landing NUNCA deben importarlo: contiene logica de certificado y clave privada.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';

const raiz = resolve(import.meta.dirname, '../../..');
const prohibidos = ['apps/web', 'apps/desktop', 'packages/shared', 'landing-site'];
const patron = /dgii-ecf/;
const ignorar = new Set(['node_modules', 'dist', 'build', '.git', 'android', 'release']);
const exts = /\.(ts|tsx|js|jsx|mjs|cjs|json)$/;
const hallazgos = [];

function recorrer(dir) {
  for (const nombre of readdirSync(dir)) {
    if (ignorar.has(nombre)) continue;
    const p = join(dir, nombre);
    const st = statSync(p);
    if (st.isDirectory()) recorrer(p);
    else if (exts.test(nombre) && nombre !== 'package-lock.json' && patron.test(readFileSync(p, 'utf8'))) hallazgos.push(p);
  }
}
for (const d of prohibidos) {
  try { recorrer(join(raiz, d)); } catch { /* carpeta inexistente */ }
}
if (hallazgos.length) {
  console.error('ERROR: referencias prohibidas a dgii-ecf fuera del backend:\n' + hallazgos.join('\n'));
  process.exit(1);
}
console.log('OK: ninguna referencia a dgii-ecf en ' + prohibidos.join(', '));
