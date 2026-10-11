/**
 * Migra TODOS los datos de una BD SQLite (solo lectura) a la BD destino de DATABASE_URL (SQL Server).
 *   pnpm --filter @stodia/api db:migrar [ruta.db] [--reemplazar] [--solo=Tabla1,Tabla2]
 *   - ruta por defecto: prisma/preview.db (relativa a apps/api). El origen se abre READ-ONLY y nunca se modifica.
 *   - Sin --reemplazar: una tabla destino que ya tiene filas se OMITE (idempotente / reanudable).
 *   - Con --reemplazar: vacia TODAS las tablas destino (orden inverso de FK) antes de insertar. Es destructivo sobre el DESTINO.
 *   - Orden por claves foraneas (derivado del schema, ahora con las 35 FK de la Fase 1: Alumno y Tutor primero, luego FinRecibo/PersServicio/FinCobroItem...),
 *     lotes <= 1000 filas y <= 2000 parametros, una transaccion por tabla. El destino valida cada FK al insertar.
 *   - El ORIGEN debe estar en el esquema de la Fase 1. Un SQLite anterior (FinCobroItem.kid, sin Contrato, Tutor.usuario...) se actualiza ANTES:
 *     scripts/fk-reparar.ts --aplicar sobre ese .db (con DATABASE_URL=file:...), `prisma db push --accept-data-loss --schema prisma/schema.sqlite.prisma`, y
 *     otra vez fk-reparar --aplicar (ver README, «Actualizar una base anterior a la Fase 1»). El script lo detecta y se detiene.
 *   - Tambien debe estar en la Fase 2A (Alumno.seccionId, tablas Grado/Seccion...): un SQLite con Catalogo academico y Alumno.grado/sec/tanda se actualiza ANTES con
 *     `fk-reparar --fase2a --aplicar` sobre ese .db + `prisma db push --accept-data-loss --schema prisma/schema.sqlite.prisma` + `fk-reparar --fase2a --aplicar`.
 *   - Y en la Fase 2B (tablas Caja, RutaTransporte, TipoBeca, MetodoPago, Alergia... y sin Alumno.alg): un SQLite con esos catalogos en Catalogo se actualiza ANTES con
 *     `fk-reparar --fase2b --aplicar` + `prisma db push --accept-data-loss --schema prisma/schema.sqlite.prisma` + `fk-reparar --fase2b --aplicar` (retira Catalogo).
 *   - Y en la Fase 2C (tablas Ciclo, Matricula, TutorAlumno, FinReciboItem/Pago, ServicioAlumno, Monedero...; sin Catalogo): un SQLite anterior se actualiza ANTES con
 *     `fk-reparar --auto` (o --fase2c --aplicar) + `prisma db push --accept-data-loss --schema prisma/schema.sqlite.prisma` + `fk-reparar --auto`.
 *   - Convierte DateTime (ms epoch / ISO) a Date y 0/1 a boolean; los campos JSON ya son String en el schema (sin cambios).
 *   - Verificacion por tabla: conteo y checksum de una columna (suma numerica o suma de longitudes de texto).
 */
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import 'dotenv/config';
import { Prisma, PrismaClient } from '@prisma/client';

const args = process.argv.slice(2);
const reemplazar = args.includes('--reemplazar');
const solo = args.find(a => a.startsWith('--solo='))?.slice(7).split(',');
const ruta = resolve(process.cwd(), args.find(a => !a.startsWith('--')) ?? 'prisma/preview.db');
if (!existsSync(ruta)) { console.error(`No existe el origen SQLite: ${ruta}`); process.exit(2); }
if (!(process.env.DATABASE_URL ?? '').startsWith('sqlserver:')) { console.error('DATABASE_URL debe apuntar a SQL Server (sqlserver://...). Abortado.'); process.exit(2); }

// node:sqlite (Node >= 22.5) no tiene tipos en @types/node 20.
// eslint-disable-next-line @typescript-eslint/no-var-requires, @typescript-eslint/no-explicit-any
const { DatabaseSync } = require('node:sqlite') as { DatabaseSync: new (p: string, o?: { readOnly?: boolean }) => any };
const prisma = new PrismaClient();
const origen = new DatabaseSync(ruta, { readOnly: true });
// Origen anterior a la Fase 1 o con violaciones de FK: no se migra (las FK del destino rechazarian las filas).
{
  const cols = (t: string) => (origen.prepare(`PRAGMA table_info("${t}")`).all() as { name: string }[]).map(c => c.name);
  if (cols('FinCobroItem').length && !cols('FinCobroItem').includes('alumnoId')) {
    console.error('El origen es ANTERIOR a la Fase 1 (FinCobroItem sin alumnoId). Actualizalo primero con scripts/fk-reparar.ts + prisma db push (README, «Actualizar una base anterior a la Fase 1»).');
    process.exit(2);
  }
  if (cols('Alumno').includes('grado') || (cols('Alumno').length && !cols('Alumno').includes('seccionId'))) {
    console.error('El origen es ANTERIOR a la Fase 2A (Alumno con grado/sec/tanda de texto y catalogos academicos en Catalogo). Actualizalo primero: fk-reparar --fase2a --aplicar, prisma db push --accept-data-loss y fk-reparar --fase2a --aplicar (README).');
    process.exit(2);
  }
  if (cols('Alumno').includes('alg') || (cols('Alumno').length && !cols('Caja').length)) {
    console.error('El origen es ANTERIOR a la Fase 2B (Alumno.alg en texto y cajas, rutas, becas, medios de pago, comidas, dietas y alergias en Catalogo). Actualizalo primero: fk-reparar --fase2b --aplicar, prisma db push --accept-data-loss y fk-reparar --fase2b --aplicar (README).');
    process.exit(2);
  }
  if (cols('Alumno').length && (!cols('Ciclo').length || cols('FinRecibo').includes('items') || cols('Contrato').includes('ciclo'))) {
    console.error('El origen es ANTERIOR a la Fase 2C (ciclo lectivo como tabla, matricula por ciclo, lineas y pagos de recibo en tablas, ServicioAlumno, Monedero; Catalogo ya no existe). Actualizalo primero: fk-reparar --auto, prisma db push --accept-data-loss y fk-reparar --auto (README).');
    process.exit(2);
  }
  if (cols('Alumno').length && (!cols('TipoComprobante').length || !cols('FinRecibo').includes('tipoComprobanteId'))) {
    console.error('El origen es ANTERIOR al modulo fiscal (SecuenciaFiscal / tipo de comprobante por recibo). Actualizalo primero: fk-reparar --fiscal --aplicar y prisma db push (aditivo).');
    process.exit(2);
  }
  const malas = origen.prepare('PRAGMA foreign_key_check').all();
  if (malas.length && !args.includes('--ignorar-fk')) {
    console.error(`El origen tiene ${malas.length} fila(s) que violan sus FK (ej. ${JSON.stringify(malas[0])}). Corrigelo con scripts/fk-reparar.ts o usa --ignorar-fk bajo tu responsabilidad.`);
    process.exit(2);
  }
}
type Campo = { name: string; type: string; isId: boolean; hasDefaultValue: boolean; isRequired: boolean; kind: string; relationFromFields?: readonly string[] };
const modelos = Prisma.dmmf.datamodel.models.map(m => ({ name: m.name, fields: m.fields as unknown as Campo[] }));

// Orden topologico: un modelo con FK depende del modelo referenciado.
function ordenar(): string[] {
  const deps = new Map<string, Set<string>>();
  for (const m of modelos) deps.set(m.name, new Set(m.fields.filter(f => f.kind === 'object' && f.relationFromFields?.length).map(f => f.type).filter(t => t !== m.name)));
  const out: string[] = []; const hechos = new Set<string>();
  while (out.length < modelos.length) {
    const listo = modelos.filter(m => !hechos.has(m.name) && [...deps.get(m.name)!].every(d => hechos.has(d))).map(m => m.name).sort();
    if (!listo.length) throw new Error('Ciclo de FK en el schema');
    for (const n of listo) { out.push(n); hechos.add(n); }
  }
  return out;
}

function convertir(f: Campo, v: unknown): unknown {
  if (v === null || v === undefined) return null;
  switch (f.type) {
    case 'Boolean': return v === 1 || v === 1n || v === true || v === '1' || v === 'true';
    case 'DateTime': {
      if (typeof v === 'number' || typeof v === 'bigint') return new Date(Number(v));
      const d = new Date(String(v));
      if (Number.isNaN(d.getTime())) throw new Error(`Fecha invalida en ${f.name}: ${String(v)}`);
      return d;
    }
    case 'Int':
    case 'Float': return Number(v);
    case 'BigInt': return BigInt(v as number);
    default: return String(v);
  }
}

const q = (s: string) => `"${s.replace(/"/g, '""')}"`;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const delegado = (tx: any, name: string) => tx[name.charAt(0).toLowerCase() + name.slice(1)];
function checksumFila(f: Campo, v: unknown): number {
  if (v === null || v === undefined) return 0;
  if (f.type === 'Int' || f.type === 'Float') return Number(v);
  if (f.type === 'Boolean') return v ? 1 : 0;
  return String(v).replace(/ +$/, '').length;
}

async function main() {
  const tablasOrigen = new Set((origen.prepare("SELECT name FROM sqlite_master WHERE type='table'").all() as { name: string }[]).map(t => t.name));
  const orden = ordenar().filter(n => !solo || solo.includes(n));
  console.log(`Origen: ${ruta}\nDestino: ${(process.env.DATABASE_URL ?? '').replace(/(password=)[^;]*/i, '$1***')}\nModo: ${reemplazar ? 'REEMPLAZAR (vacia destino)' : 'solo tablas vacias (idempotente)'}\n`);

  if (reemplazar) {
    for (const n of [...orden].reverse()) await delegado(prisma, n).deleteMany();
    console.log('Destino vaciado (orden inverso de FK).');
  }

  const informe: { tabla: string; origen: number; destino: number; checksumO: number; checksumD: number; ok: boolean; nota: string }[] = [];
  for (const n of orden) {
    const m = modelos.find(x => x.name === n)!;
    const escalares = m.fields.filter(f => f.kind === 'scalar');
    const colCk = escalares.find(f => !f.isId && (f.type === 'Float' || f.type === 'Int')) ?? escalares.find(f => !f.isId && f.type === 'String') ?? escalares[0];
    let filas: Record<string, unknown>[] = [];
    let nota = '';
    if (tablasOrigen.has(n)) filas = origen.prepare(`SELECT * FROM ${q(n)}`).all() as Record<string, unknown>[];
    else nota = 'tabla ausente en origen';
    const previos = await delegado(prisma, n).count();
    let omitida = false;
    if (previos > 0 && !reemplazar) { omitida = true; nota = `omitida: destino ya tiene ${previos} filas`; }
    if (!omitida && filas.length) {
      const cols = escalares.filter(f => f.name in filas[0]);
      const faltan = escalares.filter(f => !(f.name in filas[0]) && !f.hasDefaultValue && f.isRequired);
      if (faltan.length) throw new Error(`${n}: faltan columnas obligatorias en el origen: ${faltan.map(f => f.name).join(', ')}`);
      const identidad = escalares.some(f => f.isId && f.type === 'Int' && f.hasDefaultValue);
      // IDENTITY: una fila por INSERT (un VALUES multifila mezcla NULL tipado int con texto y SQL Server falla con «Conversion failed»).
      const tam = identidad ? 1 : Math.max(1, Math.min(1000, Math.floor(2000 / cols.length)));
      const datos = filas.map(r => Object.fromEntries(cols.map(f => [f.name, convertir(f, r[f.name])])));
      await prisma.$transaction(async tx => {
        for (let i = 0; i < datos.length; i += tam) {
          const lote = datos.slice(i, i + tam);
          if (identidad) {
            // Prisma no permite fijar columnas IDENTITY via createMany: INSERT crudo con IDENTITY_INSERT (misma conexion, dentro de la transaccion).
            const sql = `SET IDENTITY_INSERT [dbo].[${n}] ON; INSERT INTO [dbo].[${n}] (${cols.map(c => '[' + c.name + ']').join(',')}) VALUES ${lote.map((_, r) => '(' + cols.map((_c, k) => '@P' + (r * cols.length + k + 1)).join(',') + ')').join(',')}; SET IDENTITY_INSERT [dbo].[${n}] OFF`;
            await tx.$executeRawUnsafe(sql, ...lote.flatMap(r => cols.map(c => r[c.name])));
          } else await delegado(tx, n).createMany({ data: lote });
        }
      }, { timeout: 300_000, maxWait: 60_000 }).catch((e: Error) => { throw new Error(`Tabla ${n}: ${e.message}`); });
    }
    const destino = await delegado(prisma, n).count();
    const ckO = filas.reduce((s, r) => s + checksumFila(colCk, colCk.type === 'DateTime' ? null : r[colCk.name]), 0);
    let ckD = 0;
    if (colCk.type === 'Int' || colCk.type === 'Float') {
      const r = (await prisma.$queryRawUnsafe(`SELECT CAST(COALESCE(SUM(CAST([${colCk.name}] AS float)),0) AS float) AS s FROM [dbo].[${n}]`)) as { s: number }[];
      ckD = Number(r[0].s);
    } else if (colCk.type === 'String') {
      const r = (await prisma.$queryRawUnsafe(`SELECT CAST(COALESCE(SUM(CAST(LEN([${colCk.name}]) AS bigint)),0) AS float) AS s FROM [dbo].[${n}]`)) as { s: number }[];
      ckD = Number(r[0].s);
    }
    const ok = omitida ? destino > 0 : destino === filas.length && Math.abs(ckO - ckD) < 0.005 * Math.max(1, filas.length);
    informe.push({ tabla: n, origen: filas.length, destino, checksumO: Math.round(ckO * 100) / 100, checksumD: Math.round(ckD * 100) / 100, ok, nota });
    console.log(`${ok ? 'OK ' : 'ERR'} ${n.padEnd(18)} origen=${String(filas.length).padStart(6)} destino=${String(destino).padStart(6)} checksum(${colCk.name})=${Math.round(ckO * 100) / 100}/${Math.round(ckD * 100) / 100} ${nota}`);
  }

  // Los autoincrement de SQLite se conservan como IDENTITY; reseed al maximo.
  for (const n of ['CmnMensaje', 'FinMovimiento', 'FinVentaItem', 'FinReciboItem', 'FinReciboPago', 'TutorAlumno', 'MonederoMovimiento', 'AsistenciaResumen']) {
    if (solo && !solo.includes(n)) continue;
    try { await prisma.$executeRawUnsafe(`DECLARE @m int = (SELECT ISNULL(MAX(id),0) FROM [dbo].[${n}]); DBCC CHECKIDENT ('dbo.${n}', RESEED, @m) WITH NO_INFOMSGS`); } catch (e) { console.warn(`reseed ${n}:`, (e as Error).message); }
  }
  const { asegurarIndices } = await import('../src/lib/db-indices');
  await asegurarIndices();

  console.table(informe.map(i => ({ tabla: i.tabla, origen: i.origen, destino: i.destino, 'checksum origen': i.checksumO, 'checksum destino': i.checksumD, estado: i.ok ? 'OK' : 'DIFERENCIA', nota: i.nota })));
  const mal = informe.filter(i => !i.ok);
  console.log(mal.length ? `\nATENCION: ${mal.length} tabla(s) con diferencias: ${mal.map(i => i.tabla).join(', ')}` : '\nMigracion verificada: todas las tablas coinciden.');
  process.exitCode = mal.length ? 1 : 0;
}

main().catch(e => { console.error(e); process.exitCode = 1; }).finally(async () => { origen.close(); await prisma.$disconnect(); });
