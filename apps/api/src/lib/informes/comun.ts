import type { FastifyRequest } from 'fastify';
import type { InformeCelda, InformeColumna, InformeFiltroId, InformeTabla, InformeTipoCol } from '@stodia/shared';
import { prisma } from '../../db';
import { CicloError, cicloReq, nombreCiclo, type CicloRow } from '../ciclo';
import { CATEGORIAS } from '../categorias';
import { inicioDia, zonaHoraria } from '../cxc';

/** Filtros de un informe (query string). `size` 0 = todas las filas (exportación / PDF). */
export interface Filtros {
  ciclo: CicloRow;
  desde?: string; hasta?: string;
  grado?: string; seccion?: string; tutor?: string; soloVencidos: boolean;
  metodo?: string; cajero?: string; plan?: string; tipo?: string; motivo?: string;
  /** Etapa 3 */
  resultado?: string; materia?: string; periodo?: string; categoria?: string; disciplina?: string; comprobante?: string;
  /** Tabla a la que aplican `page`/`size` (las demás paginables devuelven su página 1). */
  tabla?: string; page: number; size: number;
  tz: string;
}

const ISO = /^\d{4}-\d{2}-\d{2}$/;
const q1 = (v: unknown) => { const s = String(Array.isArray(v) ? v[0] : v ?? '').trim(); return s || undefined; };

/** Lee los filtros del query. `?ciclo=` explícito (id o nombre) manda sobre la cabecera X-Ciclo; sin él vale el ciclo de la petición (X-Ciclo o activo). */
export async function leerFiltros(req: FastifyRequest): Promise<Filtros> {
  const q = (req.query ?? {}) as Record<string, unknown>;
  const pedido = q1(q.ciclo);
  let ciclo: CicloRow;
  if (pedido) {
    const c = await prisma.ciclo.findFirst({ where: { OR: [{ id: pedido }, { nombre: nombreCiclo(pedido) }] } });
    if (!c) throw new CicloError(`El ciclo lectivo «${pedido}» no existe`, 404);
    ciclo = c as CicloRow;
  } else ciclo = await cicloReq(req);
  const desde = q1(q.desde), hasta = q1(q.hasta);
  if ((desde && !ISO.test(desde)) || (hasta && !ISO.test(hasta))) throw new CicloError('Las fechas deben tener el formato AAAA-MM-DD', 400);
  if (desde && hasta && desde > hasta) throw new CicloError('La fecha «desde» no puede ser posterior a «hasta»', 400);
  const sizeRaw = q1(q.size);
  const size = sizeRaw === 'all' ? 0 : Math.min(500, Math.max(1, parseInt(sizeRaw ?? '25', 10) || 25));
  return {
    ciclo, desde, hasta, grado: q1(q.grado), seccion: q1(q.seccion), tutor: q1(q.tutor), soloVencidos: ['1', 'true', 'si'].includes((q1(q.soloVencidos) ?? '').toLowerCase()),
    metodo: q1(q.metodo), cajero: q1(q.cajero), plan: q1(q.plan), tipo: q1(q.tipo)?.toUpperCase(), motivo: q1(q.motivo),
    resultado: q1(q.resultado), materia: q1(q.materia), periodo: q1(q.periodo), categoria: q1(q.categoria), disciplina: q1(q.disciplina), comprobante: q1(q.comprobante),
    tabla: q1(q.tabla), page: Math.max(1, parseInt(q1(q.page) ?? '1', 10) || 1), size, tz: await zonaHoraria(),
  };
}

/** Rango [desde, hasta] (días ISO de la zona horaria de la institución) como instantes: createdAt >= gte y < lt. */
export function rangoCreado(f: Pick<Filtros, 'desde' | 'hasta' | 'tz'>): { gte?: Date; lt?: Date } | undefined {
  if (!f.desde && !f.hasta) return undefined;
  const r: { gte?: Date; lt?: Date } = {};
  if (f.desde) r.gte = inicioDia(f.desde, f.tz);
  if (f.hasta) { const [y, m, d] = f.hasta.split('-').map(Number); r.lt = inicioDia(new Date(Date.UTC(y, m - 1, d + 1)).toISOString().slice(0, 10), f.tz); }
  return r;
}

/** Paginación en memoria: devuelve la página que toca (la pedida solo si `f.tabla` es esta tabla; si no, la 1). */
export function paginar<T>(f: Filtros, id: string, filas: T[]) {
  if (f.size === 0) return { filas, page: 1, size: filas.length, total: filas.length };
  const page = f.tabla === id ? f.page : 1;
  return { filas: filas.slice((page - 1) * f.size, page * f.size), page, size: f.size, total: filas.length };
}
/** skip/take para paginar en base de datos. */
export function paginaDb(f: Filtros, id: string): { skip?: number; take?: number; page: number } {
  if (f.size === 0) return { page: 1 };
  const page = f.tabla === id ? f.page : 1;
  return { skip: (page - 1) * f.size, take: f.size, page };
}

export const col = (id: string, titulo: string, tipo: InformeTipoCol = 'texto'): InformeColumna => ({ id, titulo, tipo });
export const trozos = <T>(l: T[], n = 800) => Array.from({ length: Math.ceil(l.length / n) }, (_, i) => l.slice(i * n, (i + 1) * n));

const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
export const etiquetaMes = (ym: string) => { const [y, m] = ym.split('-'); return `${MESES[Number(m) - 1] ?? m} ${y}`; };

/** Minutos de desfase de la zona horaria respecto a UTC (RD no tiene horario de verano). */
function offsetMin(tz: string, d = new Date()) {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone: tz, hourCycle: 'h23', year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric', second: 'numeric' }).formatToParts(d).map(x => [x.type, Number(x.value)]));
  return Math.round((Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second) - d.getTime()) / 60000);
}
/** AAAA-MM de un instante en la zona horaria de la institución. */
export function mesDe(d: Date, tz: string) { const l = new Date(d.getTime() + offsetMin(tz, d) * 60000); return l.toISOString().slice(0, 7); }
export function fechaDMY(d: Date, tz: string) { const l = new Date(d.getTime() + offsetMin(tz, d) * 60000).toISOString(); return `${l.slice(8, 10)}/${l.slice(5, 7)}/${l.slice(0, 4)}`; }
export const dmyDeISO = (s: string) => `${s.slice(8, 10)}/${s.slice(5, 7)}/${s.slice(0, 4)}`;

export const hoy = (tz: string) => fechaDMY(new Date(), tz);

/** Filtros aplicados en texto (encabezado del PDF / hoja de Excel). */
export async function etiquetasFiltros(f: Filtros, soportados: InformeFiltroId[]): Promise<{ etiqueta: string; valor: string }[]> {
  const out: { etiqueta: string; valor: string }[] = [];
  const has = (k: InformeFiltroId) => soportados.includes(k);
  if (has('ciclo')) out.push({ etiqueta: 'Ciclo', valor: f.ciclo.nombre });
  if (has('desde') && f.desde) out.push({ etiqueta: 'Desde', valor: dmyDeISO(f.desde) });
  if (has('hasta') && f.hasta) out.push({ etiqueta: 'Hasta', valor: dmyDeISO(f.hasta) });
  if (has('grado') && f.grado) { const g = await prisma.grado.findUnique({ where: { id: f.grado }, select: { nombre: true, nivel: { select: { nombre: true } } } }); out.push({ etiqueta: 'Grado', valor: g ? `${g.nivel.nombre} · ${g.nombre}` : f.grado }); }
  if (has('seccion') && f.seccion) { const s = await prisma.seccion.findUnique({ where: { id: f.seccion }, select: { letra: true, grado: { select: { nombre: true } } } }); out.push({ etiqueta: 'Sección', valor: s ? `${s.grado.nombre} ${s.letra}` : f.seccion }); }
  if (has('tutor') && f.tutor) out.push({ etiqueta: 'Tutor', valor: f.tutor });
  if (has('soloVencidos') && f.soloVencidos) out.push({ etiqueta: 'Solo vencidos', valor: 'Sí' });
  if (has('metodo') && f.metodo) out.push({ etiqueta: 'Método de pago', valor: (await prisma.metodoPago.findUnique({ where: { id: f.metodo }, select: { nombre: true } }))?.nombre ?? f.metodo });
  if (has('cajero') && f.cajero) out.push({ etiqueta: 'Cajero', valor: (await prisma.user.findUnique({ where: { id: f.cajero }, select: { nombre: true } }))?.nombre ?? f.cajero });
  if (has('plan') && f.plan) out.push({ etiqueta: 'Plan', valor: (await prisma.finPlan.findUnique({ where: { id: f.plan }, select: { name: true } }))?.name ?? f.plan });
  if (has('tipo') && f.tipo) out.push({ etiqueta: 'Tipo', valor: f.tipo === 'CREDITO' ? 'Nota de crédito' : f.tipo === 'DEBITO' ? 'Nota de débito' : f.tipo });
  if (has('motivo') && f.motivo) out.push({ etiqueta: 'Motivo', valor: (await prisma.motivoNota.findUnique({ where: { id: f.motivo }, select: { nombre: true } }))?.nombre ?? f.motivo });
  if (has('resultado') && f.resultado) out.push({ etiqueta: 'Resultado', valor: f.resultado });
  if (has('materia') && f.materia) out.push({ etiqueta: 'Materia', valor: (await prisma.materia.findUnique({ where: { id: f.materia }, select: { nombre: true } }))?.nombre ?? f.materia });
  if (has('periodo') && f.periodo) out.push({ etiqueta: 'Período', valor: `Período ${f.periodo}` });
  if (has('disciplina') && f.disciplina) out.push({ etiqueta: 'Disciplina', valor: (await prisma.acadExtra.findUnique({ where: { id: f.disciplina }, select: { name: true } }))?.name ?? f.disciplina });
  if (has('comprobante') && f.comprobante) { const t = await prisma.tipoComprobante.findUnique({ where: { id: f.comprobante }, select: { codigo: true, nombre: true } }); out.push({ etiqueta: 'Comprobante', valor: t ? `${t.codigo} · ${t.nombre}` : f.comprobante }); }
  if (has('categoria') && f.categoria) {
    const [p, c] = await Promise.all([prisma.categoriaProducto.findUnique({ where: { id: f.categoria }, select: { nombre: true } }), Promise.resolve(CATEGORIAS.find(x => x.id === f.categoria))]);
    out.push({ etiqueta: 'Categoría', valor: c?.nombre ?? p?.nombre ?? f.categoria });
  }
  return out;
}

/** Sección «Nivel · Grado Letra» (los nombres de grado se repiten entre niveles). */
export const seccionTxt = (s: { letra: string; grado: { nombre: string; nivel?: { nombre: string } } }) => `${s.grado.nivel ? s.grado.nivel.nombre + ' · ' : ''}${s.grado.nombre} ${s.letra}`;

/** Tabla en memoria con paginación (y detalle expandible alineado con la página). `filas` = conjunto COMPLETO; los totales deben ser del conjunto completo. */
export function tablaMem(f: Filtros, id: string, titulo: string, columnas: InformeColumna[], filas: InformeCelda[][], opt: { totales?: InformeCelda[]; vacio?: string; paginable?: boolean; detalle?: { titulo: string; columnas: InformeColumna[]; porFila: InformeCelda[][][] } } = {}): InformeTabla {
  const pg = paginar(f, id, filas);
  const ini = f.size === 0 ? 0 : (pg.page - 1) * f.size;
  return {
    id, titulo, columnas, filas: pg.filas, total: pg.total, page: pg.page, size: pg.size, ...(opt.paginable ? { paginable: true } : {}), ...(opt.totales ? { totales: opt.totales } : {}), ...(opt.vacio ? { vacio: opt.vacio } : {}),
    ...(opt.detalle ? { detalle: { titulo: opt.detalle.titulo, columnas: opt.detalle.columnas, porFila: opt.detalle.porFila.slice(ini, ini + pg.filas.length) } } : {}),
  };
}
