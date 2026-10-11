/**
 * CICLO LECTIVO como entidad (Fase 2C): Ciclo + PeriodoAcademico + Matricula. Capa reutilizable de la API.
 *
 *  - `cicloDeRequest(req)`: ciclo que pide el cliente (cabecera `X-Ciclo` o `?ciclo=`, id o nombre «2025–2026»); por defecto el ACTIVO. Valida que exista.
 *    La Fase 2D la aplicara a los modulos para que el selector «Ciclo lectivo activo» de la web muestre anos anteriores (solo lectura).
 *  - `cicloIdActivo()` / `cicloActivoRow()`: el ciclo activo (UNO solo: indice unico filtrado UX_Ciclo_activo).
 *  - `crearCiclo()`: alta de un ciclo con sus periodos (4 por defecto: Ago–Oct, Nov–Ene, Feb–Abr, May–Jul).
 *  - `asegurarCicloActivo()`: toda base tiene un ciclo activo (la instalacion crea el del ano en curso).
 *  Un ciclo Cerrado es de solo lectura para la aplicacion (`cicloEditable`).
 */
import type { FastifyRequest } from 'fastify';
import type { Prisma } from '@prisma/client';
import type { CfgCiclo } from '@stodia/shared';
import { prisma } from '../db';

type Db = typeof prisma | Prisma.TransactionClient;
export type EstadoCiclo = 'Planificado' | 'Activo' | 'Cerrado';
export interface CicloRow { id: string; nombre: string; fechaInicio: string; fechaFin: string; estado: EstadoCiclo }

export class CicloError extends Error {
  constructor(message: string, public status = 400) { super(message); }
}

/** Id estable del ciclo: `cic-2026-2027`. */
export const idCiclo = (nombre: string) => 'cic-' + nombre.replace(/[–—]/g, '-').replace(/[^0-9a-zA-Z-]/g, '');
/** Nombre canonico «2026–2027» (guion largo) a partir de «2026-2027». */
export const nombreCiclo = (n: string) => String(n ?? '').trim().replace('-', '–');
export const FORMATO_CICLO = /^\d{4}–\d{4}$/;
export const anioInicio = (nombre: string) => Number(/(\d{4})/.exec(nombre)?.[1] ?? 0);

const p2 = (n: number) => String(n).padStart(2, '0');
const MES3 = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
const iso = (y: number, m: number, d: number) => `${y}-${p2(m)}-${p2(d)}`;
const ultimoDia = (y: number, m: number) => new Date(Date.UTC(y, m, 0)).getUTCDate();

/** Ciclo por defecto que empieza en `y0`: 1 de agosto – 31 de julio (convencion del sistema educativo dominicano). */
export function fechasPorDefecto(y0: number): { inicio: string; fin: string } { return { inicio: iso(y0, 8, 1), fin: iso(y0 + 1, 7, 31) }; }
/** Ano de inicio del ciclo que contiene hoy segun la convencion agosto–julio. */
export function y0DeHoy(hoy = new Date()): number { return hoy.getUTCMonth() + 1 >= 8 ? hoy.getUTCFullYear() : hoy.getUTCFullYear() - 1; }

/** 4 periodos de 3 meses a partir del mes de inicio del ciclo (Ago–Oct, Nov–Ene, Feb–Abr, May–Jul con el ciclo por defecto). */
export function periodosPorDefecto(cicloId: string, inicio: string): { id: string; cicloId: string; orden: number; nombre: string; fechaInicio: string; fechaFin: string }[] {
  const y0 = Number(inicio.slice(0, 4)), m0 = Number(inicio.slice(5, 7));
  return [1, 2, 3, 4].map(k => {
    const a = (m0 - 1) + (k - 1) * 3, b = a + 2;
    const ya = y0 + Math.floor(a / 12), ma = (a % 12) + 1, yb = y0 + Math.floor(b / 12), mb = (b % 12) + 1;
    return { id: `per-${cicloId.slice(4)}-${k}`, cicloId, orden: k, nombre: `Período ${k} (${MES3[ma - 1]}–${MES3[mb - 1]})`, fechaInicio: k === 1 ? inicio : iso(ya, ma, 1), fechaFin: iso(yb, mb, ultimoDia(yb, mb)) };
  });
}

/** Crea el ciclo y sus periodos si no existen (idempotente). Devuelve el ciclo. */
export async function crearCiclo(db: Db, nombre: string, estado: EstadoCiclo, fechas?: { inicio: string; fin: string }): Promise<CicloRow> {
  const n = nombreCiclo(nombre), id = idCiclo(n);
  const ya = await db.ciclo.findUnique({ where: { nombre: n } });
  if (ya) return ya as CicloRow;
  const f = fechas ?? fechasPorDefecto(anioInicio(n));
  const c = await db.ciclo.create({ data: { id, nombre: n, fechaInicio: f.inicio, fechaFin: f.fin, estado } });
  await db.periodoAcademico.createMany({ data: periodosPorDefecto(id, f.inicio) });
  return c as CicloRow;
}

export async function cicloActivoRow(db: Db = prisma): Promise<CicloRow | null> {
  return (await db.ciclo.findFirst({ where: { estado: 'Activo' } })) as CicloRow | null;
}
/** Id del ciclo ACTIVO. Toda base tiene uno (asegurarCicloActivo al arrancar); si falta es un error de configuracion. */
export async function cicloIdActivo(db: Db = prisma): Promise<string> {
  const c = await cicloActivoRow(db);
  if (!c) throw new CicloError('No hay un ciclo lectivo activo: actívalo en Configuración → Ciclos lectivos.', 409);
  return c.id;
}
/** Ciclos como los expone /config (`{ n, estado }`), del mas antiguo al mas reciente. */
export async function listarCiclos(db: Db = prisma): Promise<CfgCiclo[]> {
  const [cs, mats] = await Promise.all([db.ciclo.findMany({ orderBy: [{ fechaInicio: 'asc' }, { nombre: 'asc' }] }), db.matricula.groupBy({ by: ['cicloId'], _count: { _all: true } })]);
  const conDatos = new Set(mats.map(m => m.cicloId));
  return cs.map(c => ({ n: c.nombre, estado: c.estado as CfgCiclo['estado'], datos: conDatos.has(c.id) }));
}

/** Ciclo pedido por el cliente: cabecera `X-Ciclo` o query `?ciclo=` (id o nombre); por defecto el activo. 404 si no existe. */
export async function cicloDeRequest(req: Pick<FastifyRequest, 'headers' | 'query'>): Promise<CicloRow> {
  const h = req.headers['x-ciclo'], q = (req.query as Record<string, unknown> | undefined)?.ciclo;
  const pedido = String(Array.isArray(h) ? h[0] : h ?? q ?? '').trim();
  if (!pedido) {
    const a = await cicloActivoRow();
    if (!a) throw new CicloError('No hay un ciclo lectivo activo', 409);
    return a;
  }
  const c = await prisma.ciclo.findFirst({ where: { OR: [{ id: pedido }, { nombre: nombreCiclo(pedido) }] } });
  if (!c) throw new CicloError(`El ciclo lectivo «${pedido}» no existe`, 404);
  return c as CicloRow;
}
/** Un ciclo Cerrado es de solo lectura. */
export const cicloEditable = (c: { estado: string }) => c.estado !== 'Cerrado';
/** El ciclo ACTIVO: con el las pantallas se comportan exactamente como antes de la Fase 2D (sin cabecera X-Ciclo la API siempre trabaja con el). */
export const esCicloActivo = (c: { estado: string }) => c.estado === 'Activo';

/** `cicloDeRequest` con cache por peticion (un modulo puede preguntarlo varias veces sin repetir la consulta). */
const cacheCiclo = new WeakMap<object, Promise<CicloRow>>();
export function cicloReq(req: Pick<FastifyRequest, 'headers' | 'query'>): Promise<CicloRow> {
  let p = cacheCiclo.get(req);
  if (!p) { p = cicloDeRequest(req); cacheCiclo.set(req, p); }
  return p;
}

/** Ciclo pedido explicitamente (cabecera `X-Ciclo` o `?ciclo=`); '' si la peticion no trae ninguno (= ciclo activo, comportamiento de siempre). */
export function cicloPedido(req: Pick<FastifyRequest, 'headers' | 'query'>): string {
  const h = req.headers['x-ciclo'], q = (req.query as Record<string, unknown> | undefined)?.ciclo;
  return String(Array.isArray(h) ? h[0] : h ?? q ?? '').trim();
}

/**
 * Prefijos de la API cuyos datos son POR CICLO: con un ciclo Cerrado elegido (X-Ciclo / ?ciclo=) cualquier escritura (POST/PUT/PATCH/DELETE) se rechaza con
 * 409 CICLO_CERRADO (hook global en app.ts). El resto (catalogos, usuarios/auth, licencia, configuracion, auditoria, comedor/alimentacion/monedero,
 * inventario/kiosko, comunicaciones enviadas, PIN, documentos/folios...) NO es por ciclo e ignora la cabecera. `ESCRITURA_LIBRE` son POST que solo LEEN.
 */
export const PREFIJOS_POR_CICLO = ['directorio', 'expediente', 'notas', 'asistencia', 'horarios', 'cobros', 'becas', 'planes', 'inscripcion', 'tutores', 'extra'];
export const RUTAS_POR_CICLO = [/^\/movil\/lista(\/|$)/, /^\/comunica\/enviar(\/|$)/];
export const ESCRITURA_LIBRE = [/^\/directorio\/saldos$/, /^\/cobros\/(recibos|notas)\/[^/]+\/(enviar|reimprimir)$/]; // reimprimir / enviar por correo un recibo no tocan contabilidad: permitidos en ciclo cerrado
export function escrituraPorCiclo(method: string, url: string): boolean {
  if (['GET', 'HEAD', 'OPTIONS'].includes(method.toUpperCase())) return false;
  const path = url.split('?')[0].replace(/\/+$/, '');
  if (ESCRITURA_LIBRE.some(r => r.test(path))) return false;
  const seg = path.split('/')[1] ?? '';
  return PREFIJOS_POR_CICLO.includes(seg) || RUTAS_POR_CICLO.some(r => r.test(path));
}
/** Error de escritura sobre un ciclo que no es el activo: Cerrado = solo lectura (CICLO_CERRADO); Planificado = aun no opera, las pantallas por ciclo solo escriben en el activo (CICLO_NO_ACTIVO). */
export const errorCicloCerrado = (nombre: string, estado = 'Cerrado') => estado === 'Cerrado'
  ? { code: 'CICLO_CERRADO', error: `El ciclo ${nombre} está cerrado: solo lectura. Vuelve al ciclo activo para modificar.` }
  : { code: 'CICLO_NO_ACTIVO', error: `El ciclo ${nombre} aún no está activo: solo lectura. Las modificaciones se hacen en el ciclo activo.` };

/** Ciclo cuyo rango contiene la fecha ISO (YYYY-MM-DD); null si ninguno. */
export async function cicloPorFecha(fechaISO: string, db: Db = prisma): Promise<CicloRow | null> {
  return (await db.ciclo.findFirst({ where: { fechaInicio: { lte: fechaISO }, fechaFin: { gte: fechaISO } }, orderBy: { fechaInicio: 'desc' } })) as CicloRow | null;
}

/** Periodo '1'..'4' (clave de la API) de un ciclo -> id de PeriodoAcademico. */
export async function periodoId(cicloId: string, k: string, db: Db = prisma): Promise<string | null> {
  const orden = Number(k);
  if (!Number.isInteger(orden)) return null;
  return (await db.periodoAcademico.findUnique({ where: { cicloId_orden: { cicloId, orden } }, select: { id: true } }))?.id ?? null;
}
export async function periodosDe(cicloId: string, db: Db = prisma) {
  return db.periodoAcademico.findMany({ where: { cicloId }, orderBy: { orden: 'asc' } });
}

/**
 * Toda base tiene un ciclo ACTIVO: si no hay ningun ciclo se crea el del ano en curso (fechas CICLO_INICIO / CICLO_FIN del entorno, o agosto–julio).
 * No toca nada si ya existen ciclos (aunque ninguno este activo: lo decide el administrador).
 */
export async function asegurarCicloActivo(db: Db = prisma): Promise<void> {
  if (await db.ciclo.count()) return;
  const ini = (process.env.CICLO_INICIO ?? '').trim(), fin = (process.env.CICLO_FIN ?? '').trim();
  const ok = /^\d{4}-\d{2}-\d{2}$/.test(ini) && /^\d{4}-\d{2}-\d{2}$/.test(fin) && fin > ini;
  const y0 = ok ? Number(ini.slice(0, 4)) : y0DeHoy();
  const nombre = ok && Number(fin.slice(0, 4)) !== y0 + 1 ? `${y0}–${Number(fin.slice(0, 4))}` : `${y0}–${y0 + 1}`;
  await crearCiclo(db, nombre, 'Activo', ok ? { inicio: ini, fin } : undefined);
}
