import { prisma } from '../db';
import { cfgGet } from './sisconfig';
import { kidOf } from './personas';

/**
 * CUENTAS POR COBRAR (CxC): única fuente de verdad de la deuda de los alumnos.
 *
 * Fuente: `FinCobroItem` con `paid = false` (es la cartera que el POS/Cobros, la inscripción y el expediente
 * crean y que el cobro va saldando; abonos parciales reducen `monto`). `MobCargo` es solo el espejo para el
 * portal móvil del tutor y NO se suma, para no contar dos veces el mismo cargo.
 *
 * Un cargo está VENCIDO cuando su fecha de vencimiento (dd/mm/aaaa) es anterior a HOY en la zona horaria
 * de la institución (SisConfig 'perfil'.zonaHoraria, por defecto America/Santo_Domingo). Si la fecha no se
 * puede interpretar, se usa el estado guardado ('Vencida').
 * El alumno de un cargo se identifica con `kid`: el corto del prototipo (juan/sofia) o el id del alumno (ver kidOf).
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

export const esVencido = (it: { vence: string; est: string }, hoy: string) => { const v = venceISO(it.vence); return v ? v < hoy : it.est === 'Vencida'; };

export interface Cxc { vencido: number; porVencer: number; vencidoPorKid: Map<string, number> }

/** Resumen de CxC (opcionalmente acotado a ciertos `kid`). */
export async function cxcResumen(kids?: string[], tz?: string): Promise<Cxc> {
  const hoy = hoyISO(tz ?? await zonaHoraria());
  const items = await prisma.finCobroItem.findMany({ where: { paid: false, ...(kids ? { kid: { in: kids } } : {}) }, select: { kid: true, monto: true, vence: true, est: true } });
  const out: Cxc = { vencido: 0, porVencer: 0, vencidoPorKid: new Map() };
  for (const i of items) {
    if (esVencido(i, hoy)) { out.vencido += i.monto; out.vencidoPorKid.set(i.kid, (out.vencidoPorKid.get(i.kid) ?? 0) + i.monto); } else out.porVencer += i.monto;
  }
  out.vencido = round2(out.vencido); out.porVencer = round2(out.porVencer);
  for (const [k, v] of out.vencidoPorKid) out.vencidoPorKid.set(k, round2(v));
  return out;
}

/** Saldo vencido por id de alumno (0 si no debe nada). */
export async function saldoVencidoPorAlumno(alumnoIds: string[]): Promise<Record<string, number>> {
  const r = await cxcResumen(alumnoIds.map(kidOf));
  return Object.fromEntries(alumnoIds.map(id => [id, r.vencidoPorKid.get(kidOf(id)) ?? 0]));
}
