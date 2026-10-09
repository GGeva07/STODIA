import { prisma } from '../db';
import { cfgGet } from './sisconfig';

/**
 * CUENTAS POR COBRAR (CxC): única fuente de verdad de la deuda de los alumnos.
 *
 * Fuente: `FinCobroItem` con `paid = false` (es la cartera que el POS/Cobros, la inscripción y el expediente
 * crean y que el cobro va saldando; abonos parciales reducen `monto`).
 *
 * Un cargo está VENCIDO cuando su fecha de vencimiento (dd/mm/aaaa) es anterior a HOY en la zona horaria
 * de la institución (SisConfig 'perfil'.zonaHoraria, por defecto America/Santo_Domingo). Si la fecha no se
 * puede interpretar, se usa el estado guardado ('Vencida').
 * El alumno de un cargo se identifica con `alumnoId` (FK real a Alumno.id).
 */
export const DEFAULT_TZ = 'America/Santo_Domingo';
export const round2 = (n: number) => Math.round(n * 100) / 100;

export async function zonaHoraria(): Promise<string> {
  const tz = (await cfgGet('perfil')).zonaHoraria || DEFAULT_TZ;
  try { new Intl.DateTimeFormat('en-US', { timeZone: tz }); return tz; } catch { return DEFAULT_TZ; }
}

/** Partes de calendario de un instante en una zona horaria. */
export function partesEnZona(tz: string, d = new Date()) {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit', hour12: false }).formatToParts(d).map(x => [x.type, x.value]));
  return { y: Number(p.year), m: Number(p.month), d: Number(p.day) };
}
export const hoyISO = (tz: string, d = new Date()) => { const { y, m, d: dd } = partesEnZona(tz, d); return `${y}-${String(m).padStart(2, '0')}-${String(dd).padStart(2, '0')}`; };

/** dd/mm/aaaa -> aaaa-mm-dd (null si no es una fecha válida). */
export function venceISO(s: string): string | null {
  const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(s.trim());
  return m ? `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}` : null;
}

/**
 * REGLA ÚNICA del estado de una cuota (la usan Portal Tutor, POS/Cobros, Expediente, Tutores, Directorio, Dashboard y Comunicaciones):
 *   Vencida    = vence ANTES de hoy (zona horaria del perfil). Nunca se guarda en la BD: se deriva.
 *   Por vencer = vence hoy o dentro de los próximos DIAS_POR_VENCER días.
 *   Pendiente  = vence más adelante (aún no exigible).
 * `Pagado` solo aplica a cuotas `paid`. El monto de un abono parcial ya viene descontado en `monto`.
 * Si la fecha no se puede interpretar se cae al `est` guardado (compatibilidad con datos sembrados).
 */
export type EstadoCuota = 'Vencida' | 'Por vencer' | 'Pendiente';
export const DIAS_POR_VENCER = 20;
const diasEntre = (a: string, b: string) => Math.round((Date.parse(b + 'T00:00:00Z') - Date.parse(a + 'T00:00:00Z')) / 864e5);

export function estadoCuota(it: { vence: string; est?: string }, hoy: string): EstadoCuota {
  const v = venceISO(it.vence ?? '');
  if (!v) return it.est === 'Vencida' ? 'Vencida' : it.est === 'Por vencer' ? 'Por vencer' : 'Pendiente';
  if (v < hoy) return 'Vencida';
  return diasEntre(hoy, v) <= DIAS_POR_VENCER ? 'Por vencer' : 'Pendiente';
}
export const esVencido = (it: { vence: string; est?: string }, hoy: string) => estadoCuota(it, hoy) === 'Vencida';

export interface SaldoCuenta { vencido: number; porVencer: number; exigible: number; total: number }
/** Saldo de un conjunto de cuotas sin pagar: vencido, por vencer (todo lo no vencido), exigible (vencido + por vencer del mes) y total. */
export function saldoCuenta(items: { monto: number; vence: string; est?: string }[], hoy: string): SaldoCuenta {
  let vencido = 0, noVencido = 0, exigible = 0;
  for (const i of items) {
    const e = estadoCuota(i, hoy);
    if (e === 'Vencida') vencido += i.monto; else noVencido += i.monto;
    if (e !== 'Pendiente') exigible += i.monto;
  }
  return { vencido: round2(vencido), porVencer: round2(noVencido), exigible: round2(exigible), total: round2(vencido + noVencido) };
}

export interface Cxc { vencido: number; porVencer: number; vencidoPorAlumno: Map<string, number> }

/** Resumen de CxC (opcionalmente acotado a ciertos alumnos). */
export async function cxcResumen(alumnoIds?: string[], tz?: string): Promise<Cxc> {
  const hoy = hoyISO(tz ?? await zonaHoraria());
  const items = await prisma.finCobroItem.findMany({ where: { paid: false, ...(alumnoIds ? { alumnoId: { in: alumnoIds } } : {}) }, select: { alumnoId: true, monto: true, vence: true, est: true } });
  const out: Cxc = { vencido: 0, porVencer: 0, vencidoPorAlumno: new Map() };
  for (const i of items) {
    if (esVencido(i, hoy)) { out.vencido += i.monto; out.vencidoPorAlumno.set(i.alumnoId, (out.vencidoPorAlumno.get(i.alumnoId) ?? 0) + i.monto); } else out.porVencer += i.monto;
  }
  out.vencido = round2(out.vencido); out.porVencer = round2(out.porVencer);
  for (const [k, v] of out.vencidoPorAlumno) out.vencidoPorAlumno.set(k, round2(v));
  return out;
}

/** Estado de cuenta derivado ('mora' si el alumno tiene saldo vencido, 'ok' si no). `Alumno.cuenta` guardado ya no se usa para decidir: es un valor derivado. */
export async function cuentaDerivada(): Promise<(alumnoId: string) => 'mora' | 'ok'> {
  const r = await cxcResumen();
  return id => ((r.vencidoPorAlumno.get(id) ?? 0) > 0 ? 'mora' : 'ok');
}

/** Saldo vencido por id de alumno (0 si no debe nada). */
export async function saldoVencidoPorAlumno(alumnoIds: string[]): Promise<Record<string, number>> {
  const r = await cxcResumen(alumnoIds);
  return Object.fromEntries(alumnoIds.map(id => [id, r.vencidoPorAlumno.get(id) ?? 0]));
}
