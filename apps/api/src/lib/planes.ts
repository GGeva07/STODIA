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
  return JSON.stringify(resto);
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
  ({ ...(JSON.parse(r.data) as Record<string, unknown>), ...(r.tandas.length ? { tm: Object.fromEntries(r.tandas.map(t => [t.tanda.nombre, String(t.monto)])) } : {}) });
export const PLAN_INC = { tandas: { include: { tanda: { select: { nombre: true } } } } } as const;
