import type { CfgFinanzas, ExpCatalogoItem, InsPlan, PersPlan } from '@stodia/shared';
import { prisma } from '../db';
import { CFG_DEFAULTS, cfgGet } from './sisconfig';
import { partesEnZona, round2, zonaHoraria } from './cxc';
import { anioInicio, cicloActivoRow } from './ciclo';

/**
 * Lo que Personas (Expediente / Inscripción / Directorio) necesita de la configuración del cliente: ciclo activo, Planes de Pago,
 * tipos de beca, catálogo de servicios y fecha de corte. Nada de esto se escribe a mano: sale de SisConfig, FinPlan, Catalogo y
 * las tablas de operación. Una instalación vacía devuelve listas vacías (el front muestra «Configura planes y precios»).
 */
export const MNAME: Record<number, string> = { 1: 'Enero', 2: 'Febrero', 3: 'Marzo', 4: 'Abril', 5: 'Mayo', 6: 'Junio', 7: 'Julio', 8: 'Agosto', 9: 'Septiembre', 10: 'Octubre', 11: 'Noviembre', 12: 'Diciembre' };
export const MES_ES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
/** Mes en que arranca el calendario escolar cuando ningún plan lo define (convención del sistema educativo dominicano). */
const MES_INICIO_DEFECTO = 8;
/** Plazo (días) de las notificaciones de cobro cuando la institución no configuró un día de corte. */
export const DIAS_PLAZO_COBRO = 7;
export const DOCS_DEFECTO = ['Acta de nacimiento', 'Registro de vacunación', 'Fotos 2×2', 'Récord de conducta anterior'];

export const getFinanzas = async (): Promise<CfgFinanzas> => ({ ...CFG_DEFAULTS.finanzas, ...(await cfgGet('finanzas')) });

/** Documentos que se piden al inscribir (tabla TipoDocumento: activos y `requerido`, en su orden). asegurarCatalogosBase siembra los de siempre. */
export async function tiposDocumentoRequeridos(): Promise<{ id: string; nombre: string }[]> {
  return (await prisma.tipoDocumento.findMany({ where: { requerido: true, estado: 'Activo' }, orderBy: [{ orden: 'asc' }, { id: 'asc' }] })).map(t => ({ id: t.id, nombre: t.nombre }));
}
export async function docsRequeridos(): Promise<string[]> {
  const l = (await tiposDocumentoRequeridos()).map(t => t.nombre);
  return l.length ? l : DOCS_DEFECTO;
}

// ---- Ciclo lectivo ----
export interface CicloInfo { id: string | null; nombre: string; y0: number; configurado: boolean; otros: string[] }
/** Ciclo ACTIVO (tabla Ciclo). Sin ciclo activo se calcula el del ano en curso con `configurado: false`. */
export async function cicloActivo(): Promise<CicloInfo> {
  const [act, todos] = await Promise.all([cicloActivoRow(), prisma.ciclo.findMany({ select: { nombre: true } })]);
  const otros = (a: string) => todos.map(c => c.nombre).filter(n => n !== a).sort().reverse();
  if (act) return { id: act.id, nombre: act.nombre, y0: anioInicio(act.nombre), configurado: true, otros: otros(act.nombre) };
  const { y, m } = partesEnZona(await zonaHoraria());
  const y0 = m >= MES_INICIO_DEFECTO ? y : y - 1;
  const nombre = `${y0}–${y0 + 1}`;
  return { id: null, nombre, y0, configurado: false, otros: otros(nombre) };
}

// ---- Planes de pago ----
export interface PlanRow {
  id: string; name: string; estado: string; n: number; freq: number; start: number; dia: number; gracia: number; desc: number;
  moraTipo: string; moraVal: number; porTanda: boolean; anual: number; tm: Record<string, number>;
}
export async function planesPago(): Promise<PlanRow[]> {
  const rows = await prisma.finPlan.findMany({ orderBy: { id: 'asc' }, include: { tandas: { include: { tanda: { select: { nombre: true } } } } } });
  return rows.map(r => {
    const f = JSON.parse(r.data) as Record<string, unknown>;
    const num = (k: string, d = 0) => { const v = parseFloat(String(f[k] ?? '')); return Number.isFinite(v) ? v : d; };
    const tm = Object.fromEntries(r.tandas.map(t => [t.tanda.nombre, t.monto])); // importe anual por tanda (FinPlanTanda)
    const n = Math.max(1, Math.round(num('n', 1)));
    return {
      id: r.id, name: r.name, estado: r.estado, n, freq: Math.round(num('freq', 1)), start: Math.round(num('start', MES_INICIO_DEFECTO)) || MES_INICIO_DEFECTO,
      dia: Math.round(num('dia', 1)) || 1, gracia: Math.round(num('gracia', 0)), desc: num('desc', 0), moraTipo: String(f.moraTipo ?? 'none'), moraVal: num('moraVal', 0),
      porTanda: !!f.porTanda, anual: num('anual', 0), tm,
    };
  });
}
/** Resuelve la clave guardada en el contrato: id de plan, o la clave heredada del prototipo ('10' regular, '4' trimestral, '1' pago único). */
export function resolverPlan(planes: PlanRow[], key: string): PlanRow | null {
  const byId = planes.find(p => p.id === key);
  if (byId) return byId;
  const legacy: Record<string, (p: PlanRow) => boolean> = { '10': p => p.freq === 1 && p.n === 10, '4': p => p.freq === 3 && p.n === 4, '1': p => p.freq === 0 };
  const f = legacy[key];
  return f ? planes.find(p => p.estado === 'Activo' && f(p)) ?? planes.find(f) ?? null : null;
}
export const anualDe = (p: PlanRow, tanda: string) => (p.porTanda ? p.tm[tanda] ?? 0 : p.anual);
export const totalDe = (p: PlanRow, tanda: string) => round2(anualDe(p, tanda) * (1 - p.desc / 100));
/** Cuotas del plan; la última absorbe el redondeo para que la suma sea exactamente el total. */
export function cuotasDe(p: PlanRow, tanda: string): number[] {
  const total = totalDe(p, tanda), c = round2(total / p.n);
  return Array.from({ length: p.n }, (_, i) => (i === p.n - 1 ? round2(total - c * (p.n - 1)) : c));
}
/** Meses (y año) de vencimiento de cada cuota del plan dentro del ciclo que empieza en `y0`. */
export function mesesDe(p: PlanRow, y0: number): { m: number; y: number }[] {
  const step = p.freq > 0 ? p.freq : 0;
  return Array.from({ length: p.n }, (_, i) => { const idx = p.start - 1 + i * step; return { m: (idx % 12) + 1, y: y0 + Math.floor(idx / 12) }; });
}
const unidad = (f: number) => ({ 0: 'único', 1: '/ mes', 2: '/ bimestre', 3: '/ trimestre', 4: '/ cuatrimestre', 6: '/ semestre' } as Record<number, string>)[f] ?? `/ ${f} meses`;
const cap = (s: string) => s[0].toUpperCase() + s.slice(1);
export function moraTxt(p: PlanRow, fin: CfgFinanzas): string {
  if (p.moraTipo === 'none') return '';
  if (p.moraTipo === 'fijo') return p.moraVal > 0 ? `fijo de RD$ ${p.moraVal.toFixed(2)}` : '';
  const pct = p.moraVal > 0 ? p.moraVal : fin.recargoMoraPct;
  return pct > 0 ? `del ${pct}% mensual` : '';
}
function detalleDe(p: PlanRow, y0: number): string {
  const ms = mesesDe(p, y0);
  if (p.freq === 0 || p.n === 1) return p.desc > 0 ? `${p.desc}% de descuento por contado` : 'Pago único';
  if (p.freq === 1) return `${cap(MES_ES[ms[0].m - 1])} a ${MES_ES[ms[ms.length - 1].m - 1]}, vence día ${p.dia}`;
  return ms.map(x => MNAME[x.m].slice(0, 3)).join(' · ');
}
export function persPlan(p: PlanRow, tanda: string, fin: CfgFinanzas, y0: number): PersPlan {
  const total = totalDe(p, tanda);
  return { name: p.name, gross: round2(total / p.n), n: p.n, unit: unidad(p.freq), freq: p.freq, desc: p.desc, total, dia: p.dia, gracia: p.gracia, mora: moraTxt(p, fin), detalle: detalleDe(p, y0) };
}
export function insPlan(p: PlanRow, tandas: string[], fin: CfgFinanzas, y0: number): InsPlan {
  const anual: Record<string, number> = p.porTanda ? Object.fromEntries(tandas.map(t => [t, p.tm[t] ?? 0])) : { '*': p.anual };
  return { id: p.id, name: p.name, n: p.n, freq: p.freq, desc: p.desc, dia: p.dia, gracia: p.gracia, mora: moraTxt(p, fin), detalle: detalleDe(p, y0), anual };
}

/** Meses del ciclo, en orden: los del plan mensual más largo (o agosto–mayo si aún no hay planes). */
export function mesesCiclo(planes: PlanRow[]): number[] {
  const base = planes.filter(p => p.estado === 'Activo' && p.freq === 1).sort((a, b) => b.n - a.n)[0];
  if (base) return mesesDe(base, 0).map(x => x.m);
  return [8, 9, 10, 11, 12, 1, 2, 3, 4, 5];
}
export const anioDeMes = (meses: number[], y0: number, m: number) => (m >= meses[0] ? y0 : y0 + 1);
export const vencDMY = (dia: number, m: number, y: number) => `${String(dia).padStart(2, '0')}/${String(m).padStart(2, '0')}/${y}`;

/** Regla de una beca legible: «50%» (modo pct) o «RD$ 2,000.00» (modo monto). */
export const reglaBeca = (b: { modo: string; valor: number }) => (b.modo === 'pct' ? b.valor + '%' : 'RD$ ' + Number(b.valor || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }));

// ---- Becas (tabla TipoBeca) ----
export interface BecaDef { key: string; nombre: string; pct: number; aprobacion: boolean }
export async function becasCatalogo(): Promise<BecaDef[]> {
  const rows = await prisma.tipoBeca.findMany({ where: { estado: 'Activo' }, orderBy: { id: 'asc' } });
  const out: BecaDef[] = [];
  for (const r of rows) {
    const pct = r.pct > 1 ? r.pct / 100 : r.pct; // TipoBeca.pct es un porcentaje (25 = 25%); el contrato de la API lo expone como fraccion
    const nombre = r.nombre.trim();
    if (nombre && pct > 0) out.push({ key: r.id, nombre, pct, aprobacion: r.requiereAprobacion });
  }
  return out;
}

// ---- Servicios: catálogo universal armado con los catálogos reales ----
export async function catalogoServicios(): Promise<ExpCatalogoItem[]> {
  const [rutas, ali, extras, prods] = await Promise.all([
    prisma.rutaTransporte.findMany({ where: { estado: 'Activo' }, orderBy: { id: 'asc' } }),
    prisma.aliPlan.findMany({ where: { estado: 'Activo', modelo: 'sub' }, orderBy: { id: 'asc' } }),
    prisma.acadExtra.findMany({ where: { estado: 'Abierta' }, orderBy: { id: 'asc' } }),
    prisma.finProducto.findMany({ orderBy: { id: 'asc' }, include: { categoria: true } }),
  ]);
  const out: ExpCatalogoItem[] = [];
  for (const r of rutas) {
    if (r.nombre && r.tarifa > 0) out.push({ k: `rt:${r.id}`, l: `Transporte · Ruta ${r.nombre}`, cat: 'Recurrente opcional', freq: 'Mensual', mora: 'Aplica mora', price: r.tarifa, rec: true, icon: 'ph ph-bus', spec: `Ruta ${r.nombre}${r.sectores ? ` · ${r.sectores}` : ''}` });
  }
  for (const p of ali) {
    if (p.freq === 'Mensual' && (p.precio ?? 0) > 0) out.push({ k: `ali:${p.id}`, l: `Comedor · ${p.name}`, cat: 'Recurrente opcional', freq: 'Mensual', mora: p.mora ? 'Aplica mora' : 'Sin mora', price: p.precio!, rec: true, icon: 'ph ph-fork-knife', spec: p.dias, food: true });
  }
  for (const e of extras) {
    if (e.costo <= 0) continue;
    const spec = `${e.dias} ${e.hora}`.trim();
    out.push(e.kind === 'act'
      ? { k: `ext:${e.id}`, l: `Actividades · ${e.name}`, cat: 'Recurrente opcional', freq: 'Mensual', mora: 'Aplica mora', price: e.costo, rec: true, icon: 'ph ph-medal', spec }
      : { k: `ext:${e.id}`, l: `Curso · ${e.name}`, cat: 'Esporádico', freq: 'Por demanda', mora: 'Sin mora', price: e.costo, rec: false, icon: '', spec });
  }
  for (const p of prods) {
    const serv = p.categoria.nombre === 'Servicios';
    out.push({ k: `prd:${p.id}`, l: p.name, cat: serv ? 'Esporádico' : 'Materiales', freq: serv ? 'Por demanda' : 'Eventual', mora: 'Sin mora', price: p.price, rec: false, icon: '', spec: '' });
  }
  return out;
}

// ---- Fecha de corte de las notificaciones de cobro ----
export async function fechaCorte(): Promise<{ fecha: string; texto: string }> {
  const { y, m, d } = partesEnZona(await zonaHoraria());
  const dc = (await getFinanzas()).diaCorte;
  // Con día de corte configurado: el próximo (hoy cuenta); sin configurar: hoy + plazo estándar.
  const t = dc > 0 ? new Date(Date.UTC(y, d <= dc ? m - 1 : m, dc)) : new Date(Date.UTC(y, m - 1, d + DIAS_PLAZO_COBRO));
  const iso = t.toISOString().slice(0, 10);
  return { fecha: iso, texto: `${t.getUTCDate()} de ${MES_ES[t.getUTCMonth()]} de ${t.getUTCFullYear()}` };
}
