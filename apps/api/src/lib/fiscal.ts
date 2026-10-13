import type { Prisma } from '@prisma/client';
import type { AlertaSecuencia, CfgModalidadFiscal, CfgNcf, EstadoSecuencia, ModalidadFiscal, TipoComprobanteDto, TipoLogico } from '@stodia/shared';
import { prisma } from '../db';
import { cfgGet, cfgSet, CFG_DEFAULTS } from './sisconfig';
import { hoyISO, zonaHoraria } from './cxc';
import { rncValido } from './rnc';

/**
 * COMPROBANTES FISCALES (DGII): catalogo de tipos, secuencias autorizadas y asignacion ATOMICA del NCF / e-NCF.
 *
 *  - TipoComprobante: catalogo FIJO (B01..B17 fisicos, E31..E47 electronicos). Nombres y alcance segun el mejor conocimiento del equipo; lo dudoso
 *    esta marcado «A VALIDAR» en `nota` (validar con contador / DGII antes de usar en produccion).
 *  - SecuenciaFiscal: una autorizacion (rango) de la DGII. `actual` = ULTIMO numero usado. Reemplaza SisConfig 'ncf' + FinCounter ncf/b01/nc.
 *  - asignarNcf(): consume el siguiente numero con un UPDATE atomico (SQL Server: UPDLOCK/ROWLOCK + OUTPUT; SQLite: UPDATE ... RETURNING) DENTRO de la transaccion
 *    del documento: si el documento falla, el numero se revierte con el (sin huecos). Nunca se emite sin NCF.
 *
 * Formato: fisico = `B` + tipo(2) + secuencial(8) = 11 caracteres (B0200001881); electronico = `E` + tipo(2) + secuencial(10) = 13 (E310000000001).
 */
type Db = typeof prisma | Prisma.TransactionClient;
const esSqlServer = () => (process.env.DATABASE_URL ?? '').startsWith('sqlserver:');

export class FiscalError extends Error {
  constructor(public statusCode: number, message: string) { super(message); this.name = 'FiscalError'; }
}

// ---------------------------------------------------------------- catalogo
interface Cat { codigo: string; nombre: string; uso: string; logico?: TipoLogico; requiereRnc?: boolean; nota?: string }
const VAL = 'A VALIDAR con contador/DGII.';
const FISICOS: Cat[] = [
  { codigo: 'B01', nombre: 'Crédito Fiscal', uso: 'Ventas', logico: 'CREDITO_FISCAL', requiereRnc: true, nota: 'Factura de crédito fiscal: el comprador la usa para deducir ITBIS/costos. Exige RNC o cédula y razón social del comprador.' },
  { codigo: 'B02', nombre: 'Consumo', uso: 'Ventas', logico: 'CONSUMO', nota: 'Factura de consumo (consumidor final). Identificar al comprador a partir de un monto umbral (por defecto RD$ 250,000; ' + VAL + ')' },
  { codigo: 'B03', nombre: 'Nota de Débito', uso: 'Notas', logico: 'NOTA_DEBITO', requiereRnc: true, nota: 'Aumenta el valor de un comprobante emitido. Se emite en la etapa 2 (notas de crédito/débito); aquí solo existe el tipo y su secuencia. ' + VAL },
  { codigo: 'B04', nombre: 'Nota de Crédito', uso: 'Notas', logico: 'NOTA_CREDITO', requiereRnc: true, nota: 'Reduce/anula un comprobante emitido (hoy se genera al anular un recibo con numeración propia). Su emisión formal es la etapa 2. ' + VAL },
  { codigo: 'B11', nombre: 'Comprobante de Compras', uso: 'Compras', nota: 'Compras a proveedores informales (sin comprobante). Módulo de compras/contabilidad futuro. ' + VAL },
  { codigo: 'B12', nombre: 'Registro Único de Ingresos', uso: 'Ingresos', nota: 'Registro de ingresos de bajo monto. No se emite desde Cobros. A VALIDAR su vigencia y alcance.' },
  { codigo: 'B13', nombre: 'Gastos Menores', uso: 'Gastos', nota: 'Comprobante de gastos menores. Módulo de compras/contabilidad futuro. ' + VAL },
  { codigo: 'B14', nombre: 'Regímenes Especiales', uso: 'Ventas', logico: 'REGIMEN_ESPECIAL', requiereRnc: true, nota: 'Ventas a contribuyentes en regímenes especiales de tributación (p. ej. zonas francas, entidades exentas). Exige RNC y razón social. ' + VAL },
  { codigo: 'B15', nombre: 'Gubernamental', uso: 'Ventas', logico: 'GUBERNAMENTAL', requiereRnc: true, nota: 'Ventas al Estado y entidades públicas. Exige RNC y razón social. ' + VAL },
  { codigo: 'B16', nombre: 'Exportaciones', uso: 'Exportaciones', nota: 'Ventas al exterior. No aplica a cobros escolares. ' + VAL },
  { codigo: 'B17', nombre: 'Pagos al Exterior', uso: 'Exterior', nota: 'Pagos a proveedores del exterior. Módulo de compras futuro. ' + VAL },
];
const ELECTRONICOS: Cat[] = [
  { codigo: 'E31', nombre: 'Factura de Crédito Fiscal Electrónica', uso: 'Ventas', logico: 'CREDITO_FISCAL', requiereRnc: true, nota: 'Equivalente electrónico del B01. ' + VAL },
  { codigo: 'E32', nombre: 'Factura de Consumo Electrónica', uso: 'Ventas', logico: 'CONSUMO', nota: 'Equivalente electrónico del B02. Las facturas de consumo menores al umbral podrían enviarse como resumen (RFCE). ' + VAL },
  { codigo: 'E33', nombre: 'Nota de Débito Electrónica', uso: 'Notas', logico: 'NOTA_DEBITO', requiereRnc: true, nota: 'Equivalente electrónico del B03 (etapa 2). ' + VAL },
  { codigo: 'E34', nombre: 'Nota de Crédito Electrónica', uso: 'Notas', logico: 'NOTA_CREDITO', requiereRnc: true, nota: 'Equivalente electrónico del B04 (etapa 2). ' + VAL },
  { codigo: 'E41', nombre: 'Comprobante Electrónico de Compras', uso: 'Compras', nota: 'Equivalente electrónico del B11. ' + VAL },
  { codigo: 'E43', nombre: 'Comprobante Electrónico para Gastos Menores', uso: 'Gastos', nota: 'Equivalente electrónico del B13. ' + VAL },
  { codigo: 'E44', nombre: 'Comprobante Electrónico para Regímenes Especiales', uso: 'Ventas', logico: 'REGIMEN_ESPECIAL', requiereRnc: true, nota: 'Equivalente electrónico del B14. ' + VAL },
  { codigo: 'E45', nombre: 'Comprobante Electrónico Gubernamental', uso: 'Ventas', logico: 'GUBERNAMENTAL', requiereRnc: true, nota: 'Equivalente electrónico del B15. ' + VAL },
  { codigo: 'E46', nombre: 'Comprobante Electrónico para Exportaciones', uso: 'Exportaciones', nota: 'Equivalente electrónico del B16. ' + VAL },
  { codigo: 'E47', nombre: 'Comprobante Electrónico para Pagos al Exterior', uso: 'Exterior', nota: 'Equivalente electrónico del B17. ' + VAL },
];
export const CATALOGO_FISCAL = [...FISICOS.map(c => ({ ...c, modalidad: 'FISICA' as ModalidadFiscal, prefijo: 'B' })), ...ELECTRONICOS.map(c => ({ ...c, modalidad: 'ELECTRONICA' as ModalidadFiscal, prefijo: 'E' }))];

/** Tipos LOGICOS que se emiten desde Cobros (los 4 que pide el usuario) y los de nota (etapa 2). */
export const TIPOS_COBRO: TipoLogico[] = ['CREDITO_FISCAL', 'CONSUMO', 'GUBERNAMENTAL', 'REGIMEN_ESPECIAL'];
export const TIPOS_LOGICOS: TipoLogico[] = [...TIPOS_COBRO, 'NOTA_DEBITO', 'NOTA_CREDITO'];
export const esTipoLogico = (v: unknown): v is TipoLogico => typeof v === 'string' && (TIPOS_LOGICOS as string[]).includes(v);
export const NOMBRE_LOGICO: Record<TipoLogico, string> = { CREDITO_FISCAL: 'Crédito fiscal', CONSUMO: 'Consumo', GUBERNAMENTAL: 'Gubernamental', REGIMEN_ESPECIAL: 'Régimen especial', NOTA_DEBITO: 'Nota de débito', NOTA_CREDITO: 'Nota de crédito' };

export const idHistorica = (codigo: string, modalidad: ModalidadFiscal = 'FISICA') => `SF-HIST-${codigo}-${modalidad}`;
/** Longitud del secuencial (sin el prefijo de 3 caracteres): fisico 8, electronico 10. */
export const largoSecuencial = (m: ModalidadFiscal) => (m === 'ELECTRONICA' ? 10 : 8);
export const largoNcf = (m: ModalidadFiscal) => 3 + largoSecuencial(m);
export const formatoNcf = (codigo: string, n: number, m: ModalidadFiscal) => codigo + String(n).padStart(largoSecuencial(m), '0');
export const maxSecuencial = (m: ModalidadFiscal) => 10 ** largoSecuencial(m) - 1;

/** Catalogo de tipos (idempotente) + la secuencia «historica» B02 a la que apuntan por DEFAULT los recibos creados fuera de la API (seeds, importadores). */
export async function asegurarCatalogoFiscal(db: Db = prisma): Promise<void> {
  for (const [i, c] of CATALOGO_FISCAL.entries()) {
    const data = { codigo: c.codigo, nombre: c.nombre, uso: c.uso, modalidad: c.modalidad, tipoNum: c.codigo.slice(1), logico: c.logico ?? null, requiereRnc: !!c.requiereRnc, nota: c.nota ?? '', orden: i + 1 };
    await db.tipoComprobante.upsert({ where: { id: c.codigo }, update: data, create: { id: c.codigo, ...data } });
  }
  await asegurarHistorica(db, 'B02');
}
/** Crea (si falta) la secuencia sintetica «Histórica migrada» de un tipo fisico: documenta lo emitido antes del modulo; NUNCA se consume (Inactiva). */
export async function asegurarHistorica(db: Db, codigo: string, rango?: { desde: number; hasta: number }): Promise<string> {
  const id = idHistorica(codigo), tipo = CATALOGO_FISCAL.find(c => c.codigo === codigo);
  if (!tipo) throw new FiscalError(500, `Tipo de comprobante desconocido: ${codigo}`);
  const hay = await db.secuenciaFiscal.findUnique({ where: { id } });
  const r = rango ?? { desde: hay?.desde ?? 0, hasta: hay?.hasta ?? 0 };
  if (!hay) await db.secuenciaFiscal.create({ data: { id, tipoComprobanteId: codigo, modalidad: tipo.modalidad, prefijo: tipo.prefijo, desde: r.desde, hasta: r.hasta, actual: r.hasta, estado: 'Inactiva', historica: true, autorizacion: 'Histórica migrada (comprobantes emitidos antes del módulo fiscal)', creadaPor: 'migración' } });
  else if (rango) await db.secuenciaFiscal.update({ where: { id }, data: { desde: r.desde, hasta: r.hasta, actual: r.hasta } });
  return id;
}
/** Recalcula el rango observado de cada secuencia historica (min–max de los NCF de los recibos que la usan). Idempotente; lo llaman los seeds y la migracion. */
export async function recalcularHistoricas(db: Db = prisma): Promise<{ id: string; desde: number; hasta: number; n: number }[]> {
  const hist = await db.secuenciaFiscal.findMany({ where: { historica: true } });
  const out: { id: string; desde: number; hasta: number; n: number }[] = [];
  for (const h of hist) {
    const rows = [...(await db.finRecibo.findMany({ where: { secuenciaFiscalId: h.id }, select: { ncf: true } })), ...(await db.notaFiscal.findMany({ where: { secuenciaFiscalId: h.id }, select: { ncf: true } }).catch(() => [] as { ncf: string }[]))]; // las notas pueden no existir aun en una base anterior a este modulo
    if (!rows.length) continue;
    const nums = rows.map(r => Number(r.ncf.slice(3))).filter(Number.isFinite);
    if (!nums.length) continue;
    const desde = Math.min(...nums), hasta = Math.max(...nums);
    if (desde !== h.desde || hasta !== h.hasta || h.actual !== hasta) await db.secuenciaFiscal.update({ where: { id: h.id }, data: { desde, hasta, actual: hasta } });
    out.push({ id: h.id, desde, hasta, n: nums.length });
  }
  return out;
}

export async function listarTipos(db: Db = prisma): Promise<TipoComprobanteDto[]> {
  const rows = await db.tipoComprobante.findMany({ orderBy: { orden: 'asc' } });
  return rows.map(t => ({ codigo: t.codigo, nombre: t.nombre, uso: t.uso, modalidad: t.modalidad as ModalidadFiscal, logico: (t.logico as TipoLogico | null), requiereRnc: t.requiereRnc, nota: t.nota }));
}

// ---------------------------------------------------------------- configuracion de modalidad
export async function modalidadesFiscales(): Promise<CfgModalidadFiscal> {
  return { ...CFG_DEFAULTS.modalidadFiscal, ...(await cfgGet('modalidadFiscal')) };
}
export async function fechaHoyFiscal(): Promise<string> { return hoyISO(await zonaHoraria()); }
/** Codigo del tipo a emitir (B01 / E31...) para un tipo logico segun la modalidad configurada. */
export async function resolverTipo(logico: TipoLogico, db: Db = prisma, modalidadFija?: ModalidadFiscal): Promise<{ codigo: string; nombre: string; modalidad: ModalidadFiscal; requiereRnc: boolean; prefijo: string }> {
  const modalidad = modalidadFija ?? (await modalidadesFiscales())[logico] ?? 'FISICA';
  const t = await db.tipoComprobante.findFirst({ where: { logico, modalidad } });
  if (!t) throw new FiscalError(409, `El catálogo de comprobantes no tiene el tipo ${NOMBRE_LOGICO[logico]} (${modalidad === 'ELECTRONICA' ? 'electrónico' : 'físico'}). Reinicia la API para sembrarlo.`);
  return { codigo: t.codigo, nombre: t.nombre, modalidad, requiereRnc: t.requiereRnc, prefijo: t.codigo.slice(0, 1) };
}

// ---------------------------------------------------------------- estados
/** Marca como Vencida toda secuencia Activa cuya fecha de vencimiento ya paso. Idempotente. Llamar FUERA de la transaccion de un cobro. */
export async function refrescarEstados(db: Db = prisma, hoy?: string): Promise<number> {
  const h = hoy ?? (await fechaHoyFiscal());
  const r = await db.secuenciaFiscal.updateMany({ where: { estado: 'Activa', historica: false, vence: { lt: h } }, data: { estado: 'Vencida' } });
  return r.count;
}
const diasEntre = (desdeISO: string, hastaISO: string) => Math.round((Date.UTC(+hastaISO.slice(0, 4), +hastaISO.slice(5, 7) - 1, +hastaISO.slice(8, 10)) - Date.UTC(+desdeISO.slice(0, 4), +desdeISO.slice(5, 7) - 1, +desdeISO.slice(8, 10))) / 86_400_000);
export const DIAS_ALERTA_VENCIMIENTO = 30;
export const diasParaVencer = (vence: string | null, hoy: string) => (vence ? diasEntre(hoy, vence) : null);

// ---------------------------------------------------------------- asignacion atomica
export interface NcfAsignado {
  ncf: string; codigo: string; nombre: string; modalidad: ModalidadFiscal; secuenciaFiscalId: string; estadoDgii: 'NoAplica' | 'PendienteEnvio'; numero: number;
}
/** Todo lo que asignarNcf necesita de fuera de la transaccion (modalidad configurada, tipo, fecha de hoy). Calcularlo ANTES de abrir la transaccion: dentro de ella cada consulta con el cliente global tomaria otra conexion del pool (con muchas peticiones concurrentes, un deadlock de conexiones). */
export interface ContextoFiscal { t: Awaited<ReturnType<typeof resolverTipo>>; dia: string }
/** `modalidadFija`: las notas de credito / debito heredan la modalidad del NCF que modifican (una nota sobre un e-NCF es electronica), no la configurada para el tipo. */
export async function contextoFiscal(logico: TipoLogico, modalidadFija?: ModalidadFiscal): Promise<ContextoFiscal> { return { t: await resolverTipo(logico, prisma, modalidadFija), dia: await fechaHoyFiscal() }; }
type FilaInc = { actual: number | bigint; estado: string };
/** Incremento atomico de UNA secuencia. null = no se pudo (agotada, inactiva o vencida entre la lectura y el UPDATE). */
async function incrementar(db: Db, id: string, hoy: string): Promise<{ actual: number; estado: string } | null> {
  const rows = esSqlServer()
    ? await db.$queryRawUnsafe<FilaInc[]>(
      `UPDATE [dbo].[SecuenciaFiscal] WITH (UPDLOCK, ROWLOCK) SET [actual] = [actual] + 1, [estado] = CASE WHEN [actual] + 1 >= [hasta] THEN 'Agotada' ELSE [estado] END ` +
      `OUTPUT inserted.[actual] AS [actual], inserted.[estado] AS [estado] WHERE [id] = @P1 AND [estado] = 'Activa' AND [actual] < [hasta] AND ([vence] IS NULL OR [vence] >= @P2)`, id, hoy)
    : await db.$queryRawUnsafe<FilaInc[]>(
      `UPDATE "SecuenciaFiscal" SET "actual" = "actual" + 1, "estado" = CASE WHEN "actual" + 1 >= "hasta" THEN 'Agotada' ELSE "estado" END ` +
      `WHERE "id" = ? AND "estado" = 'Activa' AND "actual" < "hasta" AND ("vence" IS NULL OR "vence" >= ?) RETURNING "actual" AS "actual", "estado" AS "estado"`, id, hoy);
  return rows.length ? { actual: Number(rows[0].actual), estado: String(rows[0].estado) } : null;
}
export const msgSinSecuencia = (codigo: string, m: ModalidadFiscal) => `No hay secuencia ${m === 'ELECTRONICA' ? 'e-NCF' : 'NCF'} ${codigo} disponible: registra una autorización en Configuración › Fiscal`;

/**
 * Consume el siguiente NCF / e-NCF del tipo LOGICO pedido. Regla: la secuencia ACTIVA, no vencida y con numeros libres que VENCE ANTES (sin vencimiento al final, luego por `desde`);
 * al llegar a `hasta` pasa a Agotada y la siguiente llamada usa la que sigue. Sin secuencia disponible -> 409 (nunca se emite sin NCF).
 * Debe llamarse DENTRO de la transaccion del documento (y lo mas tarde posible: el UPDATE retiene el bloqueo de la fila hasta el commit).
 */
export async function asignarNcf(db: Db, logico: TipoLogico, ctx?: ContextoFiscal): Promise<NcfAsignado> {
  const { t, dia } = ctx ?? (await contextoFiscal(logico));
  // SQLite: una transaccion que primero LEE y luego escribe no puede subir su candado si otra ya escribe («database is locked», sin espera). Se empieza con una escritura nula: el motor
  // toma el candado de escritura al inicio (con espera, socket_timeout) y las peticiones se encolan en orden.
  if (!esSqlServer()) await db.$executeRawUnsafe('UPDATE "SecuenciaFiscal" SET "actual" = "actual" WHERE 0');
  const cands = await db.secuenciaFiscal.findMany({ where: { tipoComprobanteId: t.codigo, modalidad: t.modalidad, estado: 'Activa', historica: false } });
  cands.sort((a, b) => (a.vence ?? '9999-12-31').localeCompare(b.vence ?? '9999-12-31') || a.desde - b.desde);
  for (const c of cands) {
    if (c.vence && c.vence < dia) continue;
    const r = await incrementar(db, c.id, dia);
    if (!r) continue;
    if (r.actual > maxSecuencial(t.modalidad)) throw new FiscalError(409, `La secuencia ${c.id} excede el máximo de ${largoSecuencial(t.modalidad)} dígitos de un ${t.modalidad === 'ELECTRONICA' ? 'e-NCF' : 'NCF'}.`);
    return { ncf: formatoNcf(t.codigo, r.actual, t.modalidad), codigo: t.codigo, nombre: t.nombre, modalidad: t.modalidad, secuenciaFiscalId: c.id, estadoDgii: t.modalidad === 'ELECTRONICA' ? 'PendienteEnvio' : 'NoAplica', numero: r.actual };
  }
  throw new FiscalError(409, msgSinSecuencia(t.codigo, t.modalidad));
}

/**
 * Aviso de «secuencia por agotarse» DESPUES de facturar: lee la secuencia que acaba de usar la venta y, si lo libre / total <= su umbral (%), devuelve el aviso.
 * Si estaba agotada pero el tipo aun tiene otra secuencia activa con numeros, no avisa. Nunca lanza: un fallo aqui no debe afectar la venta ya confirmada.
 */
export async function alertaSecuencia(secuenciaFiscalId: string, db: Db = prisma): Promise<AlertaSecuencia | undefined> {
  try {
    const s = await db.secuenciaFiscal.findUnique({ where: { id: secuenciaFiscalId }, include: { tipoComprobante: true } });
    if (!s || s.historica) return undefined;
    const total = s.hasta - s.desde + 1, restantes = Math.max(0, s.hasta - s.actual);
    if (total <= 0 || (restantes / total) * 100 > s.umbralPct) return undefined;
    if (restantes === 0) {
      const otras = await db.secuenciaFiscal.findMany({ where: { tipoComprobanteId: s.tipoComprobanteId, modalidad: s.modalidad, estado: 'Activa', historica: false, id: { not: s.id } } });
      const dia = await fechaHoyFiscal();
      if (otras.some(o => o.hasta > o.actual && !(o.vence && o.vence < dia))) return undefined;
    }
    return { tipo: s.tipoComprobante.nombre, codigo: s.tipoComprobanteId, restantes, total, umbralPct: s.umbralPct, ...(s.vence ? { vence: s.vence } : {}), estado: restantes === 0 ? 'Agotada' : restantes === 1 ? 'Ultimo' : 'PorAgotarse' };
  } catch { return undefined; }
}

// ---------------------------------------------------------------- consulta y DTO
type SecRow = Prisma.SecuenciaFiscalGetPayload<{ include: { tipoComprobante: true } }>;
export function estadoEfectivo(s: { estado: string; actual: number; hasta: number; vence: string | null; historica: boolean }, hoy: string): EstadoSecuencia {
  if (s.estado === 'Inactiva') return 'Inactiva';
  if (s.actual >= s.hasta) return 'Agotada';
  if (s.vence && s.vence < hoy) return 'Vencida';
  return s.estado as EstadoSecuencia;
}
export function secuenciaDto(s: SecRow, hoy: string): CfgNcf {
  const total = s.hasta - s.desde + 1, usados = Math.max(0, Math.min(total, s.actual - s.desde + 1)), d = diasParaVencer(s.vence, hoy);
  return {
    id: s.id, pref: s.tipoComprobanteId, tipo: s.tipoComprobante.nombre, tipoNombre: s.tipoComprobante.nombre, modalidad: s.modalidad as ModalidadFiscal, prefijo: s.prefijo, serie: s.serie,
    desde: s.desde, hasta: s.hasta, actual: s.actual, act: s.actual + 1, umbral: s.umbralPct, vence: s.vence, estado: estadoEfectivo(s, hoy), autorizacion: s.autorizacion,
    usados, total, disponibles: Math.max(0, s.hasta - s.actual), creadaPor: s.creadaPor, createdAt: s.createdAt.toISOString(),
    venceProximo: d !== null && d >= 0 && d <= DIAS_ALERTA_VENCIMIENTO,
  };
}
/** Secuencias NO historicas (las que se configuran), con la forma compatible CfgNcf: fisicas primero y por tipo. */
export async function listarSecuencias(db: Db = prisma, hoy?: string): Promise<CfgNcf[]> {
  const dia = hoy ?? (await fechaHoyFiscal());
  const rows = await db.secuenciaFiscal.findMany({ where: { historica: false }, include: { tipoComprobante: true }, orderBy: [{ modalidad: 'asc' }, { tipoComprobanteId: 'asc' }, { desde: 'asc' }] });
  return rows.map(r => secuenciaDto(r, dia));
}

export interface DispTipo { logico: TipoLogico; codigo: string; nombre: string; modalidad: ModalidadFiscal; disponible: boolean; restantes: number; motivo?: string; requiereRnc: boolean }
/** Por tipo logico: el prefijo que se usara segun la modalidad configurada y si hay secuencia disponible (suma de lo libre en secuencias activas no vencidas). */
export async function disponibilidad(db: Db = prisma, logicos: TipoLogico[] = TIPOS_COBRO, modalidadFija?: ModalidadFiscal): Promise<DispTipo[]> {
  const hoy = await fechaHoyFiscal(), mod = modalidadFija ? Object.fromEntries(logicos.map(l => [l, modalidadFija])) as Partial<Record<TipoLogico, ModalidadFiscal>> : await modalidadesFiscales();
  const tipos = await db.tipoComprobante.findMany({ where: { logico: { in: logicos } } });
  const secs = await db.secuenciaFiscal.findMany({ where: { estado: 'Activa', historica: false } });
  return logicos.map(l => {
    const m = mod[l] ?? 'FISICA', t = tipos.find(x => x.logico === l && x.modalidad === m);
    const codigo = t?.codigo ?? '', libres = secs.filter(s => s.tipoComprobanteId === codigo && s.modalidad === m && !(s.vence && s.vence < hoy)).reduce((a, s) => a + Math.max(0, s.hasta - s.actual), 0);
    return { logico: l, codigo, nombre: t?.nombre ?? NOMBRE_LOGICO[l], modalidad: m, disponible: libres > 0, restantes: libres, requiereRnc: !!t?.requiereRnc, ...(libres > 0 ? {} : { motivo: msgSinSecuencia(codigo, m) }) };
  });
}

/** Compatibilidad: los datos de `ConfigGlobal.ncf` que consume el front actual. */
export async function ncfCompat(): Promise<CfgNcf[]> { await refrescarEstados(); return listarSecuencias(); }

// ---------------------------------------------------------------- alta y edicion de secuencias
const ISO = /^\d{4}-\d{2}-\d{2}$/;
const fechaValida = (s: string) => ISO.test(s) && !Number.isNaN(Date.parse(s + 'T00:00:00Z')) && new Date(s + 'T00:00:00Z').toISOString().slice(0, 10) === s;
const fmtN = (n: number) => n.toLocaleString('en-US');

export interface NuevaSecuencia { tipo: string; modalidad: ModalidadFiscal; prefijo?: string; serie?: string; desde: number; hasta: number; actual?: number; vence?: string; autorizacion?: string; umbral?: number }
/** Valida y crea una autorizacion. Errores 400 en espanol (rango, longitud, solapes, tipo vs modalidad, vencimiento). */
export async function registrarSecuencia(b: NuevaSecuencia, usuario: string): Promise<CfgNcf> {
  const bad = (m: string) => new FiscalError(400, m);
  const tipoCod = String(b.tipo ?? '').trim().toUpperCase(), modalidad = b.modalidad;
  if (modalidad !== 'FISICA' && modalidad !== 'ELECTRONICA') throw bad('Indica la modalidad: Física o Electrónica');
  const tipo = await prisma.tipoComprobante.findUnique({ where: { id: tipoCod } });
  if (!tipo) throw bad(`Tipo de comprobante «${tipoCod}» inexistente`);
  if (tipo.modalidad !== modalidad) throw bad(`El tipo ${tipoCod} es ${tipo.modalidad === 'FISICA' ? 'físico (serie B)' : 'electrónico (serie E)'}: no corresponde a la modalidad ${modalidad === 'FISICA' ? 'Física' : 'Electrónica'}.`);
  const prefijo = (b.prefijo ?? tipoCod.slice(0, 1)).trim().toUpperCase();
  if (prefijo !== tipoCod.slice(0, 1)) throw bad(`El prefijo debe ser «${tipoCod.slice(0, 1)}» para ${tipoCod}`);
  const desde = Number(b.desde), hasta = Number(b.hasta);
  if (!Number.isInteger(desde) || !Number.isInteger(hasta) || desde < 1) throw bad('El rango debe ser de números enteros desde 1 en adelante');
  if (hasta < desde) throw bad('El rango no es válido: «hasta» debe ser mayor o igual que «desde»');
  const max = maxSecuencial(modalidad);
  if (hasta > max) throw bad(`Un ${modalidad === 'ELECTRONICA' ? 'e-NCF' : 'NCF'} tiene ${largoSecuencial(modalidad)} dígitos de secuencial (${tipoCod} + ${largoSecuencial(modalidad)} = ${largoNcf(modalidad)} caracteres): «hasta» no puede pasar de ${fmtN(max)}.`);
  const actual = b.actual === undefined || b.actual === null || (b.actual as unknown) === '' ? desde - 1 : Number(b.actual);
  if (!Number.isInteger(actual) || actual < desde - 1 || actual > hasta) throw bad('«Último número usado» debe estar entre desde−1 y hasta');
  const serie = String(b.serie ?? '').trim().slice(0, 10);
  const autorizacion = String(b.autorizacion ?? '').trim().slice(0, 60);
  const hoy = await fechaHoyFiscal();
  const vence = b.vence ? String(b.vence).trim() : null;
  if (vence && !fechaValida(vence)) throw bad('La fecha de vencimiento no es válida (usa AAAA-MM-DD)');
  if (vence && vence < hoy) throw bad('La fecha de vencimiento de la autorización ya pasó');
  const umbral = b.umbral === undefined || (b.umbral as unknown) === '' ? 10 : Number(b.umbral);
  if (!Number.isInteger(umbral) || umbral < 1 || umbral > 50) throw bad('El umbral de alerta debe estar entre 1 y 50 %');
  const id = `SF-${tipoCod}-${modalidad === 'ELECTRONICA' ? 'E' : 'F'}-${desde}`;
  const row = await prisma.$transaction(async tx => {
    const otras = await tx.secuenciaFiscal.findMany({ where: { tipoComprobanteId: tipoCod, modalidad, historica: false } });
    const choca = otras.find(o => desde <= o.hasta && hasta >= o.desde);
    if (choca) throw bad(`El rango ${fmtN(desde)}–${fmtN(hasta)} se solapa con la secuencia ${fmtN(choca.desde)}–${fmtN(choca.hasta)} de ${tipoCod}${choca.autorizacion ? ' (' + choca.autorizacion + ')' : ''}.`);
    const estado = actual >= hasta ? 'Agotada' : 'Activa';
    return tx.secuenciaFiscal.create({ data: { id, tipoComprobanteId: tipoCod, modalidad, prefijo, serie, desde, hasta, actual, vence, umbralPct: umbral, estado, autorizacion, creadaPor: usuario }, include: { tipoComprobante: true } });
  }, { isolationLevel: 'Serializable' });
  return secuenciaDto(row, hoy);
}

export interface CambioSecuencia { umbral?: number; vence?: string | null; estado?: 'Activa' | 'Inactiva'; autorizacion?: string }
export async function editarSecuencia(id: string, c: CambioSecuencia): Promise<{ antes: CfgNcf; despues: CfgNcf }> {
  const hoy = await fechaHoyFiscal();
  const cur = await prisma.secuenciaFiscal.findUnique({ where: { id }, include: { tipoComprobante: true } });
  if (!cur) throw new FiscalError(404, 'Secuencia no encontrada');
  if (cur.historica) throw new FiscalError(409, 'La secuencia histórica documenta lo emitido antes del módulo fiscal y no se modifica.');
  const data: Prisma.SecuenciaFiscalUpdateInput = {};
  if (c.umbral !== undefined) {
    const v = Number(c.umbral);
    if (!Number.isInteger(v) || v < 1 || v > 50) throw new FiscalError(400, 'El umbral debe estar entre 1 y 50 %');
    data.umbralPct = v;
  }
  if (c.autorizacion !== undefined) data.autorizacion = String(c.autorizacion).trim().slice(0, 60);
  let vence = cur.vence;
  if (c.vence !== undefined) {
    const v = c.vence === null || c.vence === '' ? null : String(c.vence).trim();
    if (v && !fechaValida(v)) throw new FiscalError(400, 'La fecha de vencimiento no es válida (usa AAAA-MM-DD)');
    if (v && v < hoy && v !== cur.vence) throw new FiscalError(400, `La nueva fecha de vencimiento no puede ser anterior a hoy (${hoy.slice(8, 10)}/${hoy.slice(5, 7)}/${hoy.slice(0, 4)}). Si la autorización ya venció y debe quedar así, deja la fecha sin cambios.`);
    vence = v; data.vence = v;
  }
  let estado = cur.estado;
  if (c.estado === 'Inactiva') { if (cur.estado === 'Inactiva') throw new FiscalError(409, 'La secuencia ya está inactiva'); estado = 'Inactiva'; }
  else if (c.estado === 'Activa' && cur.estado === 'Inactiva') estado = 'Activa';
  // Reactivar (o prorrogar el vencimiento de una Vencida) solo si quedan numeros y la autorizacion esta vigente.
  if (estado === 'Vencida' && (!vence || vence >= hoy) && cur.actual < cur.hasta) estado = 'Activa'; // una agotada no se reactiva
  if (estado === 'Activa' || (estado === 'Vencida' && c.estado === 'Activa')) {
    if (cur.actual >= cur.hasta) throw new FiscalError(409, 'La secuencia está agotada: registra una nueva autorización.');
    if (vence && vence < hoy) throw new FiscalError(409, 'La autorización está vencida: actualiza la fecha de vencimiento (prórroga de la DGII) o registra una nueva.');
    estado = 'Activa';
  }
  data.estado = estado;
  const row = await prisma.secuenciaFiscal.update({ where: { id }, data, include: { tipoComprobante: true } });
  return { antes: secuenciaDto(cur, hoy), despues: secuenciaDto(row, hoy) };
}
export async function eliminarSecuencia(id: string): Promise<void> {
  const cur = await prisma.secuenciaFiscal.findUnique({ where: { id }, include: { _count: { select: { recibos: true } } } });
  if (!cur) throw new FiscalError(404, 'Secuencia no encontrada');
  if (cur.historica) throw new FiscalError(409, 'La secuencia histórica no se puede eliminar.');
  if (cur.actual >= cur.desde || cur._count.recibos > 0) throw new FiscalError(409, 'Esta secuencia ya emitió comprobantes: por trazabilidad fiscal no se elimina. Desactívala para que no se use más.');
  await prisma.secuenciaFiscal.delete({ where: { id } });
}

/** Cambia la modalidad de un tipo logico. Electronico exige e-CF activo (advertencia confirmable) y al menos UNA secuencia electronica activa del tipo. */
export async function cambiarModalidad(logico: TipoLogico, modalidad: ModalidadFiscal, confirmar: boolean): Promise<{ modalidadFiscal: CfgModalidadFiscal; advertencias: string[] }> {
  if (!esTipoLogico(logico)) throw new FiscalError(400, 'Tipo de comprobante inválido');
  if (modalidad !== 'FISICA' && modalidad !== 'ELECTRONICA') throw new FiscalError(400, 'Modalidad inválida');
  const advertencias: string[] = [];
  if (modalidad === 'ELECTRONICA') {
    const t = await prisma.tipoComprobante.findFirst({ where: { logico, modalidad } });
    const hoy = await fechaHoyFiscal();
    const hay = t ? await prisma.secuenciaFiscal.findMany({ where: { tipoComprobanteId: t.codigo, modalidad, estado: 'Activa', historica: false } }) : [];
    if (!hay.some(s => s.actual < s.hasta && !(s.vence && s.vence < hoy))) throw new FiscalError(409, `No hay una secuencia electrónica activa para ${t?.codigo ?? NOMBRE_LOGICO[logico]}: registra la autorización de e-CF primero (Registrar autorización DGII › Electrónicos).`);
    if (!(await cfgGet('ecf'))) {
      advertencias.push('El certificado digital e-CF no está cargado. Los e-NCF quedarán «Pendiente de envío».');
      if (!confirmar) throw new FiscalError(409, advertencias[0] + ' Confirma para continuar de todos modos.');
    }
  }
  const cur = await modalidadesFiscales(), next = { ...cur, [logico]: modalidad };
  await cfgSet('modalidadFiscal', next);
  return { modalidadFiscal: next, advertencias };
}

// ---------------------------------------------------------------- datos fiscales del comprador
export interface DatosComprador { rnc: string | null; nombre: string | null; regimen: string | null }
const digitos = (s: unknown) => String(s ?? '').replace(/\D/g, '');
/** Valida los datos del comprador segun el tipo (400 en espanol). Devuelve el RNC normalizado (solo digitos). */
export async function validarComprador(logico: TipoLogico, total: number, b: { clienteRnc?: string; clienteNombre?: string; regimenEspecial?: string }): Promise<DatosComprador> {
  const bad = (m: string) => new FiscalError(400, m);
  const rnc = digitos(b.clienteRnc), nombre = String(b.clienteNombre ?? '').trim().slice(0, 200), regimen = String(b.regimenEspecial ?? '').trim().slice(0, 100);
  const etiqueta = NOMBRE_LOGICO[logico];
  if (logico === 'CREDITO_FISCAL' || logico === 'GUBERNAMENTAL' || logico === 'REGIMEN_ESPECIAL') {
    if (!rnc) throw bad(`${etiqueta}: el RNC o cédula del comprador es obligatorio`);
    if (!rncValido(rnc)) throw bad(`${etiqueta}: el RNC debe tener 9 dígitos (empresa) o la cédula 11 dígitos`);
    if (!nombre) throw bad(`${etiqueta}: la razón social del comprador es obligatoria`);
    return { rnc, nombre, regimen: logico === 'REGIMEN_ESPECIAL' && regimen ? regimen : null };
  }
  if (logico === 'CONSUMO') {
    const umbral = Number((await cfgGet('finanzas')).umbralConsumoIdentificado ?? CFG_DEFAULTS.finanzas.umbralConsumoIdentificado ?? 250000);
    if (umbral > 0 && total >= umbral && !rnc) throw bad(`Consumo por RD$ ${fmtN(umbral)} o más: debes identificar al comprador (cédula o RNC)`);
    if (rnc && !rncValido(rnc)) throw bad('La cédula o RNC del comprador debe tener 9 u 11 dígitos');
    if (umbral > 0 && total >= umbral && !nombre) throw bad(`Consumo por RD$ ${fmtN(umbral)} o más: indica el nombre del comprador`);
    return { rnc: rnc || null, nombre: nombre || null, regimen: null };
  }
  throw bad('Este tipo de comprobante no se emite desde Cobros');
}

// ---------------------------------------------------------------- Dashboard (alertas)
type FilaNcf = { pref: string; tipo: string; estado: 'Vigente' | 'Por agotar' | 'Agotada' | 'Vencida' | 'Por vencer'; restantes: number; total: number; modalidad: ModalidadFiscal; vence: string | null; diasParaVencer: number | null };
/**
 * Alertas de comprobantes para el Centro de Control, calculadas sobre SecuenciaFiscal (fisicas y electronicas): una fila por tipo+modalidad con la suma de lo libre en las
 * secuencias vigentes (Por agotar si lo libre cae al umbral de la secuencia en uso; Por vencer si la que vence primero lo hace en <= 30 dias; Agotada / Vencida si no queda
 * ninguna disponible) y los tipos de Cobros SIN secuencia disponible.
 */
export async function resumenNcf(hoy?: string): Promise<{ ncf: FilaNcf[]; sinSecuencia: string[] }> {
  const dia = hoy ?? (await fechaHoyFiscal());
  const rows = await prisma.secuenciaFiscal.findMany({ where: { historica: false, estado: { not: 'Inactiva' } }, include: { tipoComprobante: true } });
  const grupos = new Map<string, typeof rows>();
  for (const r of rows) { const k = r.tipoComprobanteId + '|' + r.modalidad; grupos.set(k, [...(grupos.get(k) ?? []), r]); }
  const out: FilaNcf[] = [];
  for (const g of grupos.values()) {
    const t = g[0].tipoComprobante, m = g[0].modalidad as ModalidadFiscal;
    const libres = g.filter(s => s.estado === 'Activa' && s.actual < s.hasta && !(s.vence && s.vence < dia)).sort((a, b) => (a.vence ?? '9999-12-31').localeCompare(b.vence ?? '9999-12-31') || a.desde - b.desde);
    if (!libres.length) {
      const vencida = g.some(s => s.actual < s.hasta && s.vence && s.vence < dia);
      const ult = [...g].sort((a, b) => b.desde - a.desde)[0];
      out.push({ pref: t.codigo, tipo: t.nombre, estado: vencida ? 'Vencida' : 'Agotada', restantes: 0, total: ult.hasta - ult.desde + 1, modalidad: m, vence: vencida ? g.filter(s => s.vence).sort((a, b) => b.vence!.localeCompare(a.vence!))[0].vence : null, diasParaVencer: null });
      continue;
    }
    const total = libres.reduce((a, s) => a + (s.hasta - s.desde + 1), 0), restantes = libres.reduce((a, s) => a + (s.hasta - s.actual), 0);
    const enUso = libres[0], d = diasParaVencer(enUso.vence, dia);
    const bajo = total > 0 && (restantes / total) * 100 <= enUso.umbralPct, porVencer = d !== null && d <= DIAS_ALERTA_VENCIMIENTO;
    out.push({ pref: t.codigo, tipo: t.nombre, estado: bajo ? 'Por agotar' : porVencer ? 'Por vencer' : 'Vigente', restantes, total, modalidad: m, vence: enUso.vence, diasParaVencer: d });
  }
  out.sort((a, b) => (a.modalidad === b.modalidad ? a.pref.localeCompare(b.pref) : a.modalidad === 'FISICA' ? -1 : 1));
  const mod = await modalidadesFiscales(), disp = await disponibilidad(prisma, TIPOS_COBRO);
  const sinSecuencia = disp.filter(d => !d.disponible && !out.some(o => o.pref === d.codigo && o.modalidad === d.modalidad) && (d.logico === 'CONSUMO' || d.logico === 'CREDITO_FISCAL' || mod[d.logico] === 'ELECTRONICA')).map(d => `${d.nombre} (${d.codigo})`);
  return { ncf: out, sinSecuencia };
}

// ---------------------------------------------------------------- transacciones con NCF
const esConflicto = (e: unknown) => {
  const x = e as { code?: string; message?: string; meta?: { code?: string } };
  return x?.code === 'P2034' || /deadlock|1205|write conflict/i.test(String(x?.message ?? '')) || x?.meta?.code === '1205';
};
/**
 * Transaccion interactiva para documentos que consumen un NCF. El primer paso de `fn` DEBE ser `asignarNcf`: asi todas las peticiones del mismo tipo se serializan en la
 * fila de la secuencia ANTES de tomar cualquier otro bloqueo (nada de ciclos de espera) y el numero se revierte con el documento. Si aun asi el motor elige la transaccion
 * como victima de un deadlock / conflicto de escritura, se reintenta (la transaccion completa se deshizo, el numero tambien).
 */
async function ejecutarTransaccion<T>(fn: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T> {
  for (let intento = 1; ; intento++) {
    try { return await prisma.$transaction(fn, { timeout: 60_000, maxWait: 60_000 }); }
    catch (e) { if (intento >= 4 || !esConflicto(e)) throw e; await new Promise(r => setTimeout(r, 20 * intento + Math.random() * 40)); }
  }
}
export function transaccionFiscal<T>(fn: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T> { return ejecutarTransaccion(fn); }

/**
 * SQLite (un solo proceso, un solo escritor): los handlers que emiten un documento fiscal se ENCOLAN en memoria (de uno en uno) en vez de pelear por el candado de escritura de la base
 * (con muchas peticiones simultaneas el busy-handler de SQLite se convierte en una cola lentisima y con timeouts). En SQL Server no hace nada: serializa la fila de la secuencia.
 * No anidar: un handler envuelto en enSerie no debe llamar a otro envuelto.
 */
let colaSqlite: Promise<unknown> = Promise.resolve();
export function enSerie<T>(fn: () => Promise<T>): Promise<T> {
  if (esSqlServer()) return fn();
  const run = colaSqlite.then(fn);
  colaSqlite = run.catch(() => undefined);
  return run;
}
