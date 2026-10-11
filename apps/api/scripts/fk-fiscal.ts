/**
 * FASE FISCAL para INSTANCIAS YA EXISTENTES (SQLite o SQL Server): secuencias fiscales y tipo de comprobante en cada recibo. Lo invoca scripts/fk-reparar.ts con --fiscal (o --auto).
 * Idempotente, ADITIVO (no borra ni modifica importes, alumnos, recibos ni cartera) y lo ambiguo se informa como BLOQUEANTE (exit 3 en --auto): nunca se inventa un dato.
 *
 * Secuencia (expandir -> rellenar -> contraer), igual que las fases 2A/2B/2C:
 *   1. EXPANDIR: crea TipoComprobante y SecuenciaFiscal; agrega a FinRecibo tipoComprobanteId / secuenciaFiscalId / modalidad / estadoDgii (NOT NULL con DEFAULT B02, secuencia
 *      historica B02, FISICA, NoAplica) y clienteRnc / clienteNombre / regimenEspecial (NULL); agrega Tutor.comprobanteHabitual (NULL).
 *   2. RELLENAR:
 *      - catalogo de 21 tipos (B01..B17, E31..E47) + secuencia «Histórica migrada» B02;
 *      - SecuenciaFiscal <- SisConfig 'ncf' (una por cada rango configurado; `actual` = contador FinCounter - 1: el contador guardaba el PROXIMO numero);
 *      - cada FinRecibo -> su tipo (prefijo real del NCF) y su secuencia: la migrada si el numero cae en lo emitido desde que el sistema cuenta (act..actual), si no la
 *        «historica» del prefijo con el rango observado (no se inventan numeros ni autorizaciones).
 *   3. CONTRAER: `prisma db push` (FK, UNIQUE, indices). Solo agrega constraints; no pierde datos.
 */
import { cuenta, ejecutar, esSqlServer, filas, num, q, tablaExiste, tbl, tieneCol } from './fk-comun';
import { crearTabla, type Informe, type Paso } from './fk-fase2a';
import { prisma } from './fk-comun';
import { CATALOGO_FISCAL, asegurarCatalogoFiscal, asegurarHistorica, idHistorica, recalcularHistoricas, largoNcf } from '../src/lib/fiscal';
import type { ModalidadFiscal } from '@stodia/shared';

const COLUMNAS: [string, string, string, string, string][] = [ // [tabla, columna, SQL Server, SQLite, nombre del DEFAULT (SQL Server)]
  ['FinRecibo', 'tipoComprobanteId', "NVARCHAR(100) NOT NULL CONSTRAINT [FinRecibo_tipoComprobanteId_df] DEFAULT 'B02'", "TEXT NOT NULL DEFAULT 'B02'", ''],
  ['FinRecibo', 'secuenciaFiscalId', "NVARCHAR(100) NOT NULL CONSTRAINT [FinRecibo_secuenciaFiscalId_df] DEFAULT 'SF-HIST-B02-FISICA'", "TEXT NOT NULL DEFAULT 'SF-HIST-B02-FISICA'", ''],
  ['FinRecibo', 'modalidad', "NVARCHAR(1000) NOT NULL CONSTRAINT [FinRecibo_modalidad_df] DEFAULT 'FISICA'", "TEXT NOT NULL DEFAULT 'FISICA'", ''],
  ['FinRecibo', 'estadoDgii', "NVARCHAR(1000) NOT NULL CONSTRAINT [FinRecibo_estadoDgii_df] DEFAULT 'NoAplica'", "TEXT NOT NULL DEFAULT 'NoAplica'", ''],
  ['FinRecibo', 'clienteRnc', 'NVARCHAR(1000) NULL', 'TEXT', ''], ['FinRecibo', 'clienteNombre', 'NVARCHAR(1000) NULL', 'TEXT', ''], ['FinRecibo', 'regimenEspecial', 'NVARCHAR(1000) NULL', 'TEXT', ''],
  ['Tutor', 'comprobanteHabitual', 'NVARCHAR(1000) NULL', 'TEXT', ''],
];
const trozos = <T>(l: T[], n = 400) => Array.from({ length: Math.ceil(l.length / n) }, (_, i) => l.slice(i * n, (i + 1) * n));
const marcas = (n: number) => Array.from({ length: n }, () => '?').join(',');
/** Contador (FinCounter) que consumia cada serie antes del modulo fiscal. */
const CONTADOR: Record<string, string> = { B02: 'ncf', B01: 'b01', B04: 'nc' };

/** true si la base es anterior al modulo fiscal (existe FinRecibo y aun no tiene TipoComprobante / las columnas nuevas). */
export async function pendienteFiscal(): Promise<boolean> {
  if (!(await tablaExiste('FinRecibo'))) return false;
  return !(await tablaExiste('TipoComprobante')) || !(await tablaExiste('SecuenciaFiscal')) || !(await tieneCol('FinRecibo', 'tipoComprobanteId')) || !(await tieneCol('Tutor', 'comprobanteHabitual'));
}

/** UNIQUE de las tablas nuevas, creados con el nombre EXACTO que usa Prisma: asi `db push` no ve nada nuevo que advertir (su aviso generico de «unique constraint» exigiria --accept-data-loss). */
const UNICOS: [string, string, string[]][] = [
  ['TipoComprobante', 'TipoComprobante_codigo_key', ['codigo']],
  ['SecuenciaFiscal', 'SecuenciaFiscal_tipoComprobanteId_modalidad_historica_desde_key', ['tipoComprobanteId', 'modalidad', 'historica', 'desde']],
];
const hayIndice = async (t: string, nombre: string) => esSqlServer
  ? (await cuenta(`SELECT COUNT(*) AS n FROM sys.indexes WHERE name = '${nombre}' AND object_id = OBJECT_ID('dbo.${t}')`)) > 0
  : (await cuenta(`SELECT COUNT(*) AS n FROM sqlite_master WHERE type='index' AND name='${nombre}'`)) > 0;

export async function expandirFiscal(paso: Paso, _informe: Informe) {
  for (const t of ['TipoComprobante', 'SecuenciaFiscal']) await paso(`FISCAL ESTRUCTURA: tabla ${t} (nueva)`, async () => ((await tablaExiste(t)) ? 0 : 1), async () => { await crearTabla(t); });
  for (const [t, c, ss, sl] of COLUMNAS) {
    await paso(`FISCAL ESTRUCTURA: ${t}.${c} (columna nueva)`, async () => ((await tablaExiste(t)) && !(await tieneCol(t, c)) ? 1 : 0), async () => {
      await ejecutar(`ALTER TABLE ${tbl(t)} ADD ${esSqlServer ? '' : 'COLUMN '}${q(c)} ${esSqlServer ? ss : sl}`);
    });
  }
}

const ahora = () => new Date();

/** Crea los UNIQUE (con las tablas ya pobladas por el relleno): idempotente. */
export async function crearUnicosFiscal(paso: Paso) {
  for (const [t, nombre, cols] of UNICOS) {
    await paso(`FISCAL ESTRUCTURA: UNIQUE ${nombre}`, async () => ((await tablaExiste(t)) && !(await hayIndice(t, nombre)) ? 1 : 0), async () => {
      await ejecutar(esSqlServer ? `ALTER TABLE ${tbl(t)} ADD CONSTRAINT ${q(nombre)} UNIQUE NONCLUSTERED (${cols.map(q).join(', ')})` : `CREATE UNIQUE INDEX ${q(nombre)} ON ${tbl(t)} (${cols.map(q).join(', ')})`);
    });
  }
}

interface CfgItem { pref: string; tipo?: string; desde: number; hasta: number; umbral?: number; act?: number }
export async function rellenarFiscal(paso: Paso, informe: Informe, opc: { aplicar: boolean }) {
  const info = (p: string, n: number, e = 'informativo') => informe.push({ paso: p, filas: n, estado: e });
  if (!(await tablaExiste('TipoComprobante')) || !(await tablaExiste('SecuenciaFiscal')) || !(await tieneCol('FinRecibo', 'tipoComprobanteId'))) { info('FISCAL: tablas aun no existen (ejecuta con --aplicar para expandir)', 0, 'pendiente'); return; }

  // ---- 1) catalogo + historica B02 ----
  const hayTipos = await cuenta(`SELECT COUNT(*) AS n FROM ${tbl('TipoComprobante')}`);
  await paso('FISCAL: catalogo de tipos de comprobante (B01..B17, E31..E47) y secuencia historica B02', async () => CATALOGO_FISCAL.length - hayTipos + (await cuenta(`SELECT COUNT(*) AS n FROM ${tbl('SecuenciaFiscal')} WHERE id = '${idHistorica('B02')}'`) ? 0 : 1), async () => { await asegurarCatalogoFiscal(); });
  if (!opc.aplicar && !hayTipos) return; // sin catalogo no se puede clasificar (modo informe)

  // ---- 2) SecuenciaFiscal <- SisConfig ncf ----
  const cfgRow = await filas<{ valor: string }>(`SELECT valor FROM ${tbl('SisConfig')} WHERE clave = 'ncf'`);
  const cfg: CfgItem[] = cfgRow[0] ? (() => { try { return JSON.parse(cfgRow[0].valor) as CfgItem[]; } catch { return []; } })() : [];
  const tipos = new Set(CATALOGO_FISCAL.filter(c => c.modalidad === 'FISICA').map(c => c.codigo));
  const malos = cfg.filter(c => !tipos.has(c.pref) || !(c.desde >= 1) || !(c.hasta >= c.desde));
  if (malos.length) { informe.push({ paso: `SisConfig ncf con prefijo/rango invalido (${malos.map(m => `${m.pref} ${m.desde}-${m.hasta}`).join(', ')}) -> BLOQUEA`, filas: malos.length, estado: 'BLOQUEANTE' }); return; }
  for (const a of cfg) for (const b of cfg) if (a !== b && a.pref === b.pref && a.desde <= b.hasta && a.hasta >= b.desde) { informe.push({ paso: `SisConfig ncf: rangos solapados de ${a.pref} (${a.desde}-${a.hasta} y ${b.desde}-${b.hasta}) -> BLOQUEA`, filas: 2, estado: 'BLOQUEANTE' }); return; }
  const contadores = new Map((await filas<{ key: string; value: unknown }>(`SELECT ${q('key')} AS ${q('key')}, value FROM ${tbl('FinCounter')}`)).map(r => [r.key, num(r.value)]));
  const idMig = (c: CfgItem) => `SF-MIG-${c.pref}-${c.desde}`;
  const existentes = new Set((await filas<{ id: string }>(`SELECT id FROM ${tbl('SecuenciaFiscal')}`)).map(r => r.id));
  const nuevas = cfg.filter(c => !existentes.has(idMig(c)));
  await paso(`FISCAL: SecuenciaFiscal <- SisConfig ncf (${nuevas.map(c => `${c.pref} ${c.desde}-${c.hasta}`).join(', ')})`, async () => nuevas.length, async () => {
    for (const c of nuevas) {
      const cont = contadores.get(CONTADOR[c.pref] ?? '');
      const proximo = cont ?? c.act ?? c.desde; // el contador/act guardaba el PROXIMO numero a emitir
      const actual = Math.min(c.hasta, Math.max(c.desde - 1, proximo - 1));
      const um = Number(c.umbral); const umbralPct = Number.isInteger(um) && um >= 1 && um <= 50 ? um : 10;
      await prisma.secuenciaFiscal.create({ data: { id: idMig(c), tipoComprobanteId: c.pref, modalidad: 'FISICA', prefijo: 'B', desde: c.desde, hasta: c.hasta, actual, vence: null, umbralPct, estado: actual >= c.hasta ? 'Agotada' : 'Activa', autorizacion: 'Migrada · completar nº de autorización y vencimiento', creadaPor: 'migración', createdAt: ahora() } });
    }
  });

  // ---- 3) FinRecibo -> tipo y secuencia ----
  // Recibos aun sin clasificar = los que conservan los DEFAULT (B02 + historica B02). Los emitidos por la API ya traen su secuencia real.
  const pend = await filas<{ id: string; ncf: string }>(`SELECT id, ncf FROM ${tbl('FinRecibo')} WHERE ${q('tipoComprobanteId')} = 'B02' AND ${q('secuenciaFiscalId')} = '${idHistorica('B02')}'`);
  const migradas = await prisma.secuenciaFiscal.findMany({ where: { id: { startsWith: 'SF-MIG-' } } });
  const inicioPorId = new Map(cfg.map(c => [idMig(c), Math.max(c.desde, c.act ?? c.desde)]));
  const destino = new Map<string, { tipo: string; sec: string; modalidad: ModalidadFiscal; ids: string[] }>();
  const ilegibles: string[] = [];
  for (const r of pend) {
    const m = /^([BE])(\d{2})(\d+)$/.exec(r.ncf), cod = m ? m[1] + m[2] : '';
    const cat = CATALOGO_FISCAL.find(c => c.codigo === cod);
    if (!m || !cat || r.ncf.length !== largoNcf(cat.modalidad)) { ilegibles.push(`${r.id}:${r.ncf}`); continue; }
    const n = Number(m[3]);
    const mig = migradas.find(s => s.tipoComprobanteId === cod && n >= (inicioPorId.get(s.id) ?? s.desde) && n <= s.actual && n <= s.hasta);
    const sec = mig ? mig.id : idHistorica(cod, cat.modalidad);
    const k = `${cod}|${sec}`, g = destino.get(k) ?? { tipo: cod, sec, modalidad: cat.modalidad, ids: [] };
    g.ids.push(r.id); destino.set(k, g);
  }
  if (ilegibles.length) { informe.push({ paso: `FinRecibo con NCF de formato no reconocido (${ilegibles.slice(0, 4).join(', ')}...) -> BLOQUEA: corregir a mano`, filas: ilegibles.length, estado: 'BLOQUEANTE' }); return; }
  // Cada recibo que va a un destino distinto del DEFAULT (o su historica) se actualiza; los demas ya estan bien.
  const cambios = [...destino.values()].filter(g => !(g.tipo === 'B02' && g.sec === idHistorica('B02')));
  const nCambios = cambios.reduce((a, g) => a + g.ids.length, 0);
  await paso(`FISCAL: FinRecibo -> secuencia migrada (${cambios.map(g => `${g.sec}: ${g.ids.length}`).join(', ') || 'ninguno'}) y ${pend.length - nCambios} recibo(s) quedan en la historica B02`, async () => nCambios, async () => {
    for (const g of cambios) {
      if (g.tipo !== 'B02' || g.sec !== idHistorica('B02')) {
        if (g.sec === idHistorica(g.tipo, g.modalidad)) await asegurarHistorica(prisma, g.tipo);
      }
      for (const t of trozos(g.ids)) await ejecutar(`UPDATE ${tbl('FinRecibo')} SET ${q('tipoComprobanteId')} = ?, ${q('secuenciaFiscalId')} = ?, ${q('modalidad')} = ? WHERE id IN (${marcas(t.length)})`, g.tipo, g.sec, g.modalidad, ...t);
    }
  });
  await paso('FISCAL: rango observado de las secuencias «Histórica migrada» (min–max del NCF de sus recibos)', async () => {
    const h = await prisma.secuenciaFiscal.findMany({ where: { historica: true } });
    let n = 0;
    for (const s of h) {
      const rows = await prisma.finRecibo.findMany({ where: { secuenciaFiscalId: s.id }, select: { ncf: true } });
      if (!rows.length) continue;
      const nums = rows.map(r => Number(r.ncf.slice(3)));
      if (Math.min(...nums) !== s.desde || Math.max(...nums) !== s.hasta) n++;
    }
    return n;
  }, async () => { await recalcularHistoricas(); });

  // ---- 4) verificacion (informativa) ----
  const sinTipo = await cuenta(`SELECT COUNT(*) AS n FROM ${tbl('FinRecibo')} r WHERE NOT EXISTS (SELECT 1 FROM ${tbl('TipoComprobante')} t WHERE t.id = r.${q('tipoComprobanteId')}) OR NOT EXISTS (SELECT 1 FROM ${tbl('SecuenciaFiscal')} s WHERE s.id = r.${q('secuenciaFiscalId')})`);
  if (sinTipo) informe.push({ paso: 'FinRecibo con tipo o secuencia inexistente -> BLOQUEA', filas: sinTipo, estado: 'BLOQUEANTE' });
  else info('FISCAL: todos los recibos apuntan a un tipo y una secuencia existentes', await cuenta(`SELECT COUNT(*) AS n FROM ${tbl('FinRecibo')}`));
}
