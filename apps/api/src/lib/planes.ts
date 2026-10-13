import type { Prisma } from '@prisma/client';
import { prisma } from '../db';
import { cicloActivoRow } from './ciclo';

/**
 * «Alumnos» de cada Plan de Pago = contratos del ciclo activo que lo usan (Contrato.planId). Es un valor CALCULADO: ya no existe un
 * contador guardado que pueda divergir. `soloActivos` cuenta unicamente los alumnos con estado Activo (peso de la proyeccion del
 * Centro de Control). Si no hay ciclo activo configurado cuenta todos los contratos.
 */
export async function alumnosPorPlan(soloActivos = false, cicloId?: string): Promise<Map<string, number>> {
  const ciclo = cicloId ? { id: cicloId } : await cicloActivoRow(); // Fase 2D: contratos del ciclo elegido (por defecto el activo)
  const g = await prisma.contrato.groupBy({
    by: ['planId'], _count: { _all: true },
    where: { ...(ciclo ? { cicloId: ciclo.id } : {}), ...(soloActivos ? { alumno: { estado: 'Activo' } } : {}) },
  });
  return new Map(g.map(x => [x.planId, x._count._all]));
}

type Db = typeof prisma | Prisma.TransactionClient;
/**
 * El formulario del plan trae `tm` (importe anual por NOMBRE de tanda). En la base el JSON `data` solo guarda los parametros escalares; el importe por
 * tanda vive en FinPlanTanda (FK a Plan y a Tanda). Devuelve el JSON sin `tm`.
 */
export function datosSinTm(form: object): string {
  const { tm: _tm, ...resto } = form as { tm?: unknown };
  return JSON.stringify(normalizarPronto(resto as Record<string, unknown>));
}
/**
 * Dias de anticipacion del pronto pago (data.prontoDias). Compatibilidad con el campo ANTIGUO `prontoDia` (dia limite del mes): si el plan no trae
 * `prontoDias`, N = dia de vencimiento del plan − prontoDia cuando es positivo; si no, 0 (sin pronto pago hasta que se configure). No se inventan valores.
 */
export function prontoDiasDe(f: Record<string, unknown>): number {
  const num = (k: string) => { const v = parseFloat(String(f[k] ?? '')); return Number.isFinite(v) ? v : NaN; };
  const nuevo = num('prontoDias');
  if (!isNaN(nuevo)) return Math.max(0, Math.round(nuevo));
  const pd = num('prontoDia'), n = pd > 0 ? (num('dia') || 1) - pd : 0;
  return n > 0 ? Math.round(n) : 0;
}
/** Reemplaza el `prontoDia` antiguo por `prontoDias` (texto, como el resto del JSON del plan). */
export function normalizarPronto(f: Record<string, unknown>): Record<string, unknown> {
  const { prontoDia: _viejo, ...resto } = f;
  return { ...resto, prontoDias: String(prontoDiasDe(f)) };
}
/** Reemplaza las filas FinPlanTanda del plan por las del `tm` del formulario (tandas inexistentes o importes vacios/no numericos se ignoran). */
export async function guardarTandasPlan(db: Db, planId: string, tm: Record<string, string> | undefined): Promise<void> {
  await db.finPlanTanda.deleteMany({ where: { planId } });
  if (!tm) return;
  const tandas = await db.tanda.findMany({ select: { id: true, nombre: true } });
  const filas = Object.entries(tm).flatMap(([nombre, v]) => {
    const t = tandas.find(x => x.nombre === nombre), monto = parseFloat(String(v));
    return t && Number.isFinite(monto) ? [{ planId, tandaId: t.id, monto }] : [];
  });
  if (filas.length) await db.finPlanTanda.createMany({ data: filas });
}
/** `data` del plan + `tm` reconstruido desde FinPlanTanda (importes como texto, como los envia el formulario). */
export const datosConTm = (r: { data: string; tandas: { monto: number; tanda: { nombre: string } }[] }): Record<string, unknown> =>
  ({ ...normalizarPronto(JSON.parse(r.data) as Record<string, unknown>), ...(r.tandas.length ? { tm: Object.fromEntries(r.tandas.map(t => [t.tanda.nombre, String(t.monto)])) } : {}) });
export const PLAN_INC = { tandas: { include: { tanda: { select: { nombre: true } } } } } as const;
