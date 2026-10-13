import type { BecaDesglose } from '@stodia/shared';
import { cuotasDe, reglaBeca, resolverPlan, type PlanRow } from './pers-fin';

/**
 * DESGLOSE DE BECA POR CARGO (Monto real − Descuento por beca = Total). Solo presentacion: lo cobrado SIEMPRE es el `monto` del cargo.
 *
 * El sistema no guarda el monto bruto: la beca (o el Plan Hermano) ya viene dentro del `monto` de la cuota de colegiatura. El bruto se reconstruye
 * de la FUENTE MAS FIABLE, el plan del contrato: la cuota base del plan (`cuotasDe(plan, tanda del alumno)`, la misma funcion con que la inscripcion genero la cartera;
 * la ultima cuota absorbe el redondeo, por eso se prueban las cuotas distintas del plan). Se acepta SOLO si, aplicando la beca aprobada a esa cuota base,
 * se obtiene EXACTAMENTE (al centavo) el monto del cargo:
 *   - beca porcentual : base × (1 − pct/100) = monto
 *   - beca de monto   : base − valor          = monto
 *   - varias becas    : se prueba cada una sola y todas en cascada.
 * Si ninguna combinacion cuadra (cargo con abono parcial, cuota sin la beca aplicada, plan cambiado, monto editado) NO se muestra desglose en lugar de inventarlo.
 * Bruto − descuento = total se cumple siempre por construccion (descuento = bruto − monto).
 */
export interface BecaAplicable { nombre: string; modo: string; valor: number }
export interface ContextoBeca { becas: BecaAplicable[]; bases: number[] }

/** Nombre corto para mostrar: «Beca Plan Hermano» → «Plan Hermano». */
const nombreCorto = (n: string) => n.trim().replace(/^beca\s+/i, '') || n.trim();
const regla = (b: BecaAplicable) => (b.modo === 'pct' ? `${b.valor} %` : reglaBeca(b));
const aplicar = (x: number, b: BecaAplicable) => (b.modo === 'pct' ? x * (1 - b.valor / 100) : x - b.valor);
const r2 = (n: number) => Math.round(n * 100) / 100;

/** Contexto de un alumno: becas aprobadas del ciclo que cubren colegiatura + cuotas base distintas de su plan y tanda. null si no hay beca o plan. */
export function contextoBeca(becas: BecaAplicable[], planes: PlanRow[], planId: string | null | undefined, tanda: string): ContextoBeca | null {
  const plan = planId ? resolverPlan(planes, planId) : null;
  if (!becas.length || !plan) return null;
  const bases = [...new Set(cuotasDe(plan, tanda).filter(v => v > 0))];
  return bases.length ? { becas, bases } : null;
}

/** Desglose de un cargo de colegiatura con monto `monto`, o null si no cuadra con ninguna beca. */
export function desgloseBeca(ctx: ContextoBeca | null | undefined, monto: number): BecaDesglose | null {
  if (!ctx || !(monto > 0)) return null;
  const combos: BecaAplicable[][] = [...ctx.becas.map(b => [b]), ...(ctx.becas.length > 1 ? [ctx.becas] : [])];
  for (const base of ctx.bases) for (const c of combos) {
    const neto = r2(c.reduce(aplicar, base));
    if (Math.abs(neto - monto) > 0.004 || neto >= base) continue;
    const descuento = r2(base - monto);
    return { bruto: r2(base), descuento, total: r2(monto), pct: r2((descuento / base) * 100), motivo: c.map(b => `${nombreCorto(b.nombre)} ${regla(b)}`).join(' + ') };
  }
  return null;
}

/** Parte proporcional del desglose cuando solo se cobra una parte `take` del cargo (abono): bruto − descuento = take. */
export function desglosePorcion(d: BecaDesglose, take: number): BecaDesglose {
  if (take >= d.total - 0.001) return d;
  const descuento = r2(d.descuento * (take / d.total));
  return { ...d, descuento, bruto: r2(take + descuento), total: r2(take) };
}

type BecaRow = { alumnoId: string; modo: string; valor: number; tipoBeca: { nombre: string }; conceptos: { concepto: { nombre: string } }[] };
/** Contextos por alumno a partir de becas APROBADAS del ciclo (con tipoBeca y conceptos), contratos del ciclo, planes y la tanda de cada alumno. Solo becas que cubren colegiatura. */
export function contextosBeca(becas: BecaRow[], contratos: { alumnoId: string; planId: string | null }[], planes: PlanRow[], tandaDe: (alumnoId: string) => string): Map<string, ContextoBeca> {
  const out = new Map<string, ContextoBeca>();
  const porAl = new Map<string, BecaAplicable[]>();
  for (const b of becas) if (b.conceptos.some(c => c.concepto.nombre.toLowerCase().includes('colegiatura'))) porAl.set(b.alumnoId, [...(porAl.get(b.alumnoId) ?? []), { nombre: b.tipoBeca.nombre, modo: b.modo, valor: b.valor }]);
  for (const c of contratos) { const ctx = contextoBeca(porAl.get(c.alumnoId) ?? [], planes, c.planId, tandaDe(c.alumnoId)); if (ctx) out.set(c.alumnoId, ctx); }
  return out;
}
