/**
 * NOTAS DE CREDITO / DEBITO para INSTANCIAS YA EXISTENTES (SQLite o SQL Server): tablas MotivoNota, NotaFiscal, NotaFiscalLinea y NotaFiscalReembolso, columna FinCobroItem.notaDebitoId
 * y migracion de las ANULACIONES historicas de recibos (FinRecibo.est = 'Anulado' + FinRecibo.nc) a registros NotaFiscal. Lo invoca scripts/fk-reparar.ts con --notas (o --auto).
 * Idempotente, ADITIVO (no borra ni modifica importes, alumnos, recibos ni cartera) y lo ambiguo se informa como BLOQUEANTE (exit 3 en --auto): nunca se inventa un dato.
 *
 * Secuencia (expandir -> rellenar -> contraer), igual que las fases anteriores:
 *   1. EXPANDIR: crea las 4 tablas nuevas (columnas + PK) y FinCobroItem.notaDebitoId (NULL); crea sus UNIQUE con el nombre exacto que usa Prisma (asi `db push` no pide --accept-data-loss).
 *   2. RELLENAR: catalogo de motivos; por cada recibo anulado sin nota, una NotaFiscal con SU NCF B04/E34 YA CONSUMIDO (no se vuelve a numerar), lineas = lineas del recibo (efecto Ajuste:
 *      el sistema anterior NO reabria los cargos) y reembolsos = los pagos del recibo (el sistema anterior excluia el recibo del recaudo, es decir, lo trataba como devuelto).
 *   3. CONTRAER: `prisma db push` (solo agrega FK e indices).
 *
 * DEFECTO CONOCIDO del sistema anterior: anular un recibo emitia la nota B04 pero NO reabria los cargos que ese recibo habia pagado (el padre quedaba sin deuda) ni repuso inventario.
 * `--notas` MUESTRA cuantos recibos anulados tienen cargos aun pagados y cuanto dinero es. Los cargos NO se reabren salvo con la bandera EXPLICITA `--reabrir-cargos` (junto con --aplicar).
 */
import { cuenta, ejecutar, esSqlServer, filas, num, prisma, q, tablaExiste, tbl, tieneCol } from './fk-comun';
import { crearTabla, type Informe, type Paso } from './fk-fase2a';
import { asegurarHistorica, recalcularHistoricas } from '../src/lib/fiscal';
import { MOTIVOS_NOTA, MOTIVO_ANULACION, asegurarMotivosNota, idMotivo } from '../src/lib/notas-motivos';
import { audit } from '../src/lib/audit';

const TABLAS = ['MotivoNota', 'NotaFiscal', 'NotaFiscalLinea', 'NotaFiscalReembolso'];
const COLUMNAS: [string, string, string, string][] = [['FinCobroItem', 'notaDebitoId', 'NVARCHAR(100) NULL', 'TEXT']];
/** UNIQUE de las tablas nuevas con el nombre EXACTO de Prisma (db push no ve nada nuevo que advertir). */
const UNICOS: [string, string, string[]][] = [
  ['MotivoNota', 'MotivoNota_codigo_key', ['codigo']],
  ['NotaFiscal', 'NotaFiscal_ncf_key', ['ncf']],
  ['NotaFiscal', 'NotaFiscal_idempotencyKey_key', ['idempotencyKey']],
  ['NotaFiscalLinea', 'NotaFiscalLinea_notaId_orden_key', ['notaId', 'orden']],
  ['NotaFiscalReembolso', 'NotaFiscalReembolso_notaId_orden_key', ['notaId', 'orden']],
];
const r2 = (n: number) => Math.round(n * 100) / 100;
const trozos = <T>(l: T[], n = 400) => Array.from({ length: Math.ceil(l.length / n) }, (_, i) => l.slice(i * n, (i + 1) * n));
const marcas = (n: number) => Array.from({ length: n }, () => '?').join(',');
const hayIndice = async (t: string, nombre: string) => esSqlServer
  ? (await cuenta(`SELECT COUNT(*) AS n FROM sys.indexes WHERE name = '${nombre}' AND object_id = OBJECT_ID('dbo.${t}')`)) > 0
  : (await cuenta(`SELECT COUNT(*) AS n FROM sqlite_master WHERE type='index' AND name='${nombre}'`)) > 0;

/** true si la base es anterior al modulo de notas (existe FinRecibo y aun no tiene las tablas / la columna nueva). */
export async function pendienteNotas(): Promise<boolean> {
  if (!(await tablaExiste('FinRecibo'))) return false;
  for (const t of TABLAS) if (!(await tablaExiste(t))) return true;
  return !(await tieneCol('FinCobroItem', 'notaDebitoId'));
}

export async function expandirNotas(paso: Paso, _informe: Informe) {
  for (const t of TABLAS) await paso(`NOTAS ESTRUCTURA: tabla ${t} (nueva)`, async () => ((await tablaExiste(t)) ? 0 : 1), async () => { await crearTabla(t); });
  for (const [t, c, ss, sl] of COLUMNAS) {
    await paso(`NOTAS ESTRUCTURA: ${t}.${c} (columna nueva NULL)`, async () => ((await tablaExiste(t)) && !(await tieneCol(t, c)) ? 1 : 0), async () => {
      await ejecutar(`ALTER TABLE ${tbl(t)} ADD ${esSqlServer ? '' : 'COLUMN '}${q(c)} ${esSqlServer ? ss : sl}`);
    });
  }
}

export async function crearUnicosNotas(paso: Paso) {
  for (const [t, nombre, cols] of UNICOS) {
    await paso(`NOTAS ESTRUCTURA: UNIQUE ${nombre}`, async () => ((await tablaExiste(t)) && !(await hayIndice(t, nombre)) ? 1 : 0), async () => {
      await ejecutar(esSqlServer ? `ALTER TABLE ${tbl(t)} ADD CONSTRAINT ${q(nombre)} UNIQUE NONCLUSTERED (${cols.map(q).join(', ')})` : `CREATE UNIQUE INDEX ${q(nombre)} ON ${tbl(t)} (${cols.map(q).join(', ')})`);
    });
  }
}

interface RecAnulado { id: string; ncf: string; nc: string | null; monto: number; tutor: string; tutorId: string | null; cajaId: string | null; cicloId: string; hora: string; createdAt: Date | string; clienteRnc: string | null; clienteNombre: string | null }
const fechaDe = (v: Date | string) => (v instanceof Date ? v : new Date(String(v).replace(' ', 'T') + (/[zZ]|[+-]\d\d:?\d\d$/.test(String(v)) ? '' : 'Z')));

/** Datos del defecto: cargos de recibos ANULADOS que siguen pagados. */
export interface DefectoAnulados {
  anulados: number; recibosConCargosPagados: number; cargosPagados: number; monto: number;
  ambiguos: number; ambiguosMonto: number;
  /** Cargo -> lineas anuladas que lo cobraron (para reabrir). */
  porCargo: Map<string, { monto: number; lineas: number[]; recibos: string[] }>;
}
export async function analizarAnulados(): Promise<DefectoAnulados> {
  const out: DefectoAnulados = { anulados: 0, recibosConCargosPagados: 0, cargosPagados: 0, monto: 0, ambiguos: 0, ambiguosMonto: 0, porCargo: new Map() };
  if (!(await tablaExiste('FinRecibo'))) return out;
  out.anulados = await cuenta(`SELECT COUNT(*) AS n FROM ${tbl('FinRecibo')} WHERE est = 'Anulado'`);
  if (!out.anulados) return out;
  const anuladas = await filas<{ rid: string; lid: number; cid: string; monto: unknown; paid: unknown }>(
    `SELECT r.id AS rid, i.id AS lid, i.${q('cobroItemId')} AS cid, i.monto AS monto, c.paid AS paid FROM ${tbl('FinRecibo')} r JOIN ${tbl('FinReciboItem')} i ON i.${q('reciboId')} = r.id JOIN ${tbl('FinCobroItem')} c ON c.id = i.${q('cobroItemId')} WHERE r.est = 'Anulado'`);
  const activas = new Set((await filas<{ cid: string }>(
    `SELECT DISTINCT i.${q('cobroItemId')} AS cid FROM ${tbl('FinRecibo')} r JOIN ${tbl('FinReciboItem')} i ON i.${q('reciboId')} = r.id WHERE r.est <> 'Anulado' AND i.${q('cobroItemId')} IS NOT NULL`)).map(x => x.cid));
  const recs = new Set<string>();
  for (const l of anuladas) {
    if (!(num(l.paid) === 1 || l.paid === true)) continue; // ya esta abierto
    const g = out.porCargo.get(l.cid) ?? { monto: 0, lineas: [], recibos: [] };
    g.monto = r2(g.monto + num(l.monto)); g.lineas.push(l.lid); g.recibos.push(l.rid);
    out.porCargo.set(l.cid, g);
  }
  for (const [cid, g] of [...out.porCargo]) {
    if (activas.has(cid)) { out.ambiguos++; out.ambiguosMonto = r2(out.ambiguosMonto + g.monto); out.porCargo.delete(cid); continue; } // tambien lo cubre un recibo activo: revisar a mano
    out.cargosPagados++; out.monto = r2(out.monto + g.monto); g.recibos.forEach(r => recs.add(r));
  }
  out.recibosConCargosPagados = recs.size;
  return out;
}

const sumaPendiente = async () => r2(num((await filas<{ s: unknown }>(`SELECT COALESCE(SUM(monto), 0) AS s FROM ${tbl('FinCobroItem')} WHERE paid = 0`))[0]?.s));

const rd = (n: number) => 'RD$ ' + n.toLocaleString('en-US', { minimumFractionDigits: 2 });
function reporteDefecto(info: (p: string, n: number, e?: string) => void, d: DefectoAnulados) {
  info('NOTAS REPORTE: recibos anulados', d.anulados);
  info(`NOTAS REPORTE: recibos anulados cuyos cargos SIGUEN PAGADOS (el padre quedo sin deuda): ${d.recibosConCargosPagados} recibo(s), ${d.cargosPagados} cargo(s), ${rd(d.monto)}`, d.cargosPagados, d.cargosPagados ? 'REVISAR (no se reabren sin --reabrir-cargos)' : 'informativo');
  if (d.ambiguos) info(`NOTAS REPORTE: cargos pagados por un recibo anulado Y por otro recibo activo (revisar a mano, no se tocan): ${rd(d.ambiguosMonto)}`, d.ambiguos, 'REVISAR');
}

export async function rellenarNotas(paso: Paso, informe: Informe, opc: { aplicar: boolean; reabrirCargos: boolean }) {
  const info = (p: string, n: number, e = 'informativo') => informe.push({ paso: p, filas: n, estado: e });
  if (!(await tablaExiste('NotaFiscal')) || !(await tablaExiste('MotivoNota'))) {
    info('NOTAS: tablas aun no existen (ejecuta con --aplicar para expandir)', 0, 'pendiente');
    const d = await analizarAnulados();
    if (d.anulados) { info(`NOTAS: ${d.anulados} recibo(s) anulado(s) se migraran a NotaFiscal`, d.anulados); reporteDefecto(info, d); }
    return;
  }
  await paso(`NOTAS: catalogo de motivos (${MOTIVOS_NOTA.length})`, async () => MOTIVOS_NOTA.length - (await cuenta(`SELECT COUNT(*) AS n FROM ${tbl('MotivoNota')}`)), async () => { await asegurarMotivosNota(); });

  // ---- anulaciones historicas -> NotaFiscal ----
  const pend = await filas<RecAnulado>(`SELECT r.id, r.ncf, r.nc, r.monto, r.tutor, r.${q('tutorId')} AS ${q('tutorId')}, r.${q('cajaId')} AS ${q('cajaId')}, r.${q('cicloId')} AS ${q('cicloId')}, r.hora, r.${q('createdAt')} AS ${q('createdAt')}, r.${q('clienteRnc')} AS ${q('clienteRnc')}, r.${q('clienteNombre')} AS ${q('clienteNombre')} FROM ${tbl('FinRecibo')} r WHERE r.est = 'Anulado' AND NOT EXISTS (SELECT 1 FROM ${tbl('NotaFiscal')} n WHERE n.${q('reciboId')} = r.id AND n.clase = 'CREDITO') ORDER BY r.${q('createdAt')}, r.id`);
  if (pend.length) {
    const formato = /^([BE])(04|34)(\d+)$/;
    const malos = pend.filter(r => !r.nc || !formato.test(r.nc) || (r.nc.startsWith('B') ? r.nc.length !== 11 : r.nc.length !== 13));
    if (malos.length) { informe.push({ paso: `NOTAS: recibos anulados sin NCF de nota de credito legible (${malos.slice(0, 4).map(m => `${m.id}:${m.nc ?? 'NULL'}`).join(', ')}...) -> BLOQUEA: corregir a mano`, filas: malos.length, estado: 'BLOQUEANTE' }); return; }
    const vistos = new Map<string, string>();
    const dups = pend.filter(r => { if (vistos.has(r.nc!)) return true; vistos.set(r.nc!, r.id); return false; });
    const ncs = pend.map(r => r.nc!), choques: { ncf: string }[] = [], choqRec: { ncf: string }[] = [];
    for (const t of trozos(ncs, 300)) { choques.push(...(await filas<{ ncf: string }>(`SELECT ncf FROM ${tbl('NotaFiscal')} WHERE ncf IN (${marcas(t.length)})`, ...t))); choqRec.push(...(await filas<{ ncf: string }>(`SELECT ncf FROM ${tbl('FinRecibo')} WHERE ncf IN (${marcas(t.length)})`, ...t))); }
    if (dups.length || choques.length || choqRec.length) { informe.push({ paso: `NOTAS: NCF de nota de credito repetido (${[...dups.map(d => d.nc), ...choques.map(c => c.ncf), ...choqRec.map(c => c.ncf)].slice(0, 4).join(', ')}) -> BLOQUEA: dos documentos no pueden compartir NCF`, filas: dups.length + choques.length + choqRec.length, estado: 'BLOQUEANTE' }); return; }
    const secs = await prisma.secuenciaFiscal.findMany({ where: { historica: false } });
    const sinSec = pend.filter(r => r.nc!.startsWith('E') && !secs.some(s => s.tipoComprobanteId === r.nc!.slice(0, 3) && Number(r.nc!.slice(3)) >= s.desde && Number(r.nc!.slice(3)) <= s.actual));
    if (sinSec.length) { informe.push({ paso: `NOTAS: e-NCF ${sinSec.slice(0, 3).map(r => r.nc).join(', ')} fuera de toda secuencia electronica -> BLOQUEA`, filas: sinSec.length, estado: 'BLOQUEANTE' }); return; }
    await paso(`NOTAS: ${pend.length} recibo(s) anulado(s) -> NotaFiscal (NCF ya consumido; efecto Ajuste, reembolso = pagos del recibo)`, async () => pend.length, async () => {
      const ult = await filas<{ id: string }>(`SELECT id FROM ${tbl('NotaFiscal')} WHERE id LIKE 'NC-%'`);
      let sig = Math.max(0, ...ult.map(x => Number(x.id.slice(3)) || 0)) + 1;
      for (const r of pend) {
        const cod = r.nc!.slice(0, 3), n = Number(r.nc!.slice(3)), modalidad = r.nc!.startsWith('E') ? 'ELECTRONICA' : 'FISICA';
        const sec = secs.find(s => s.tipoComprobanteId === cod && n >= s.desde && n <= s.actual && n <= s.hasta);
        const secId = sec ? sec.id : await asegurarHistorica(prisma, cod);
        const au = await filas<{ t: string; usr: string }>(`SELECT t, usr FROM ${tbl('SisAudit')} WHERE tabla = 'Recibos' AND registro = ? AND next LIKE 'Anulado%' ORDER BY t DESC`, r.id);
        const cajero = au[0] ? (await prisma.user.findUnique({ where: { usuario: au[0].usr }, select: { id: true } }))?.id ?? null : null;
        const cuando = au[0] ? fechaDe(au[0].t) : fechaDe(r.createdAt);
        const lineas = await prisma.finReciboItem.findMany({ where: { reciboId: r.id }, orderBy: { orden: 'asc' } });
        const pagos = await prisma.finReciboPago.findMany({ where: { reciboId: r.id }, orderBy: { orden: 'asc' } });
        const sumaPagos = pagos.reduce((a, p) => a + p.monto, 0);
        const reemb = pagos.map((p, i) => ({ orden: i, metodoPagoId: p.metodoPagoId, monto: r2(sumaPagos > 0 ? (p.monto * r.monto) / sumaPagos : 0), referencia: 'Migrado: anulación histórica (devuelto por el mismo medio del cobro)' }));
        if (reemb.length) reemb[reemb.length - 1].monto = r2(r.monto - reemb.slice(0, -1).reduce((a, x) => a + x.monto, 0));
        await prisma.notaFiscal.create({
          data: {
            id: 'NC-' + String(sig++).padStart(4, '0'), clase: 'CREDITO', tipoComprobanteId: cod, secuenciaFiscalId: secId, ncf: r.nc!, modalidad, estadoDgii: modalidad === 'ELECTRONICA' ? 'PendienteEnvio' : 'NoAplica',
            reciboId: r.id, ncfModificado: r.ncf, tutorId: r.tutorId, clienteNombre: r.clienteNombre ?? r.tutor, clienteRnc: r.clienteRnc, cicloId: r.cicloId, motivoId: idMotivo(MOTIVO_ANULACION),
            motivoTexto: 'Anulación histórica migrada (sistema anterior)', monto: r.monto, cajeroId: cajero, cajaId: r.cajaId, hora: r.hora, createdAt: cuando, estado: 'Emitida', idempotencyKey: 'migracion:' + r.id,
            lineas: { create: lineas.map((l, i) => ({ orden: i, reciboItemId: l.id, cobroItemId: l.cobroItemId, concepto: l.concepto, monto: l.monto, efecto: 'Ajuste' })) },
            reembolsos: { create: reemb },
          },
        });
      }
      await ejecutar(`UPDATE ${tbl('FinCounter')} SET value = ? WHERE ${q('key')} = ? AND value < ?`, sig, 'notac', sig);
      if (!(await cuenta(`SELECT COUNT(*) AS n FROM ${tbl('FinCounter')} WHERE ${q('key')} = 'notac'`))) await ejecutar(`INSERT INTO ${tbl('FinCounter')} (${q('key')}, value) VALUES ('notac', ?)`, sig);
      await recalcularHistoricas();
    });
  }
  // contador de ids de notas (NC-/ND-): nunca por debajo del mayor id existente
  await paso('NOTAS: contadores notac / notad', async () => {
    let n = 0;
    for (const [clave, pref] of [['notac', 'NC-'], ['notad', 'ND-']] as const) {
      const max = Math.max(0, ...(await filas<{ id: string }>(`SELECT id FROM ${tbl('NotaFiscal')} WHERE id LIKE '${pref}%'`)).map(x => Number(x.id.slice(3)) || 0));
      const cur = await filas<{ value: unknown }>(`SELECT value FROM ${tbl('FinCounter')} WHERE ${q('key')} = '${clave}'`);
      if (!cur.length || num(cur[0].value) <= max) n++;
    }
    return n;
  }, async () => {
    for (const [clave, pref] of [['notac', 'NC-'], ['notad', 'ND-']] as const) {
      const max = Math.max(0, ...(await filas<{ id: string }>(`SELECT id FROM ${tbl('NotaFiscal')} WHERE id LIKE '${pref}%'`)).map(x => Number(x.id.slice(3)) || 0));
      const cur = await filas<{ value: unknown }>(`SELECT value FROM ${tbl('FinCounter')} WHERE ${q('key')} = '${clave}'`);
      if (!cur.length) await ejecutar(`INSERT INTO ${tbl('FinCounter')} (${q('key')}, value) VALUES (?, ?)`, clave, max + 1);
      else if (num(cur[0].value) <= max) await ejecutar(`UPDATE ${tbl('FinCounter')} SET value = ? WHERE ${q('key')} = ?`, max + 1, clave);
    }
  });

  // ---- reporte del defecto «anular no reabria los cargos» y (solo con la bandera explicita) reapertura ----
  const d = await analizarAnulados();
  if (d.anulados) {
    reporteDefecto(info, d);
    if (opc.reabrirCargos && d.cargosPagados) {
      const antes = await sumaPendiente();
      await paso(`NOTAS: REABRIR ${d.cargosPagados} cargo(s) de recibos anulados (--reabrir-cargos) · CxC antes RD$ ${antes.toLocaleString('en-US')}`, async () => d.cargosPagados, async () => {
        for (const [cid, g] of d.porCargo) {
          await ejecutar(`UPDATE ${tbl('FinCobroItem')} SET paid = 0, monto = ?, abono = 0 WHERE id = ?`, g.monto, cid);
          for (const t of trozos(g.lineas)) await ejecutar(`UPDATE ${tbl('NotaFiscalLinea')} SET efecto = 'ReabreCargo' WHERE ${q('reciboItemId')} IN (${marcas(t.length)}) AND efecto = 'Ajuste'`, ...t);
          await audit('fk-reparar', 'Update', { tabla: 'FinCobroItem', id: cid, prev: 'pagado (recibo anulado ' + g.recibos.join(', ') + ')', next: `reabierto RD$ ${g.monto}` });
        }
      });
      if (opc.aplicar) info(`NOTAS: CxC pendiente después de reabrir (antes RD$ ${antes.toLocaleString('en-US')})`, 0, 'RD$ ' + (await sumaPendiente()).toLocaleString('en-US'));
    }
  }
  // verificacion: 1 nota de credito por recibo anulado
  const sinNota = await cuenta(`SELECT COUNT(*) AS n FROM ${tbl('FinRecibo')} r WHERE r.est = 'Anulado' AND NOT EXISTS (SELECT 1 FROM ${tbl('NotaFiscal')} n WHERE n.${q('reciboId')} = r.id AND n.clase = 'CREDITO')`);
  if (sinNota && opc.aplicar) informe.push({ paso: 'NOTAS: recibos anulados sin nota de credito -> BLOQUEA', filas: sinNota, estado: 'BLOQUEANTE' });
  else info('NOTAS: todo recibo anulado tiene su nota de credito', await cuenta(`SELECT COUNT(*) AS n FROM ${tbl('FinRecibo')} WHERE est = 'Anulado'`));
}
