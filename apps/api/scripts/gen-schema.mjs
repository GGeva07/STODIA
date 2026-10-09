#!/usr/bin/env node
// Genera el schema de Prisma del motor elegido a partir de UNA sola fuente: prisma/schema.prisma (flavor SQL Server).
//   node scripts/gen-schema.mjs sqlserver            -> valida/normaliza prisma/schema.prisma (provider sqlserver)
//   node scripts/gen-schema.mjs sqlite               -> escribe prisma/schema.sqlite.prisma (provider sqlite, sin @db.*)
//   node scripts/gen-schema.mjs sqlite --inplace     -> SOBRESCRIBE prisma/schema.prisma (solo en imagenes Docker / CI efimeros)
//   node scripts/gen-schema.mjs sqlite --out <ruta>  -> destino explicito
// Los @db.* (NVarChar, etc.) solo valen en SQL Server; en SQLite se eliminan. El resto es identico.
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const raiz = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const fuente = resolve(raiz, 'prisma/schema.prisma');
const [motor, ...flags] = process.argv.slice(2);
if (!['sqlserver', 'sqlite'].includes(motor)) {
  console.error('Uso: node scripts/gen-schema.mjs <sqlserver|sqlite> [--inplace] [--out <ruta>]');
  process.exit(2);
}
const inplace = flags.includes('--inplace');
const iOut = flags.indexOf('--out');
const destino = iOut >= 0 ? resolve(process.cwd(), flags[iOut + 1]) : inplace ? fuente : resolve(raiz, motor === 'sqlite' ? 'prisma/schema.sqlite.prisma' : 'prisma/schema.prisma');

const src = readFileSync(fuente, 'utf8');
const m = src.match(/(datasource\s+db\s*\{[^}]*?provider\s*=\s*")(\w+)(")/);
if (!m) { console.error('No se encontro el datasource en prisma/schema.prisma'); process.exit(1); }
const actual = m[2];
if (actual !== 'sqlserver' && motor === 'sqlserver') { console.error(`prisma/schema.prisma esta en "${actual}" (fue sobrescrito con --inplace). Restaurala con: git checkout apps/api/prisma/schema.prisma`); process.exit(1); }
if (actual !== 'sqlserver' && motor === 'sqlite') { /* ya es sqlite: idempotente */ }

let out = src.replace(m[0], `${m[1]}${motor}${m[3]}`);
if (motor === 'sqlite') out = out.replace(/[ \t]+@db\.\w+(\([^)]*\))?/g, '');
if (motor === 'sqlite' && destino !== fuente) out = `// GENERADO por scripts/gen-schema.mjs desde prisma/schema.prisma. NO editar: cambia schema.prisma y regenera.\n${out}`;
if (destino === fuente && out === src) { console.log(`schema.prisma ya es ${motor}; sin cambios.`); process.exit(0); }
writeFileSync(destino, out);
console.log(`schema ${motor} -> ${destino}`);
