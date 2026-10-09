import { prisma } from '../db';
import { cicloActivo } from './pers-fin';

/**
 * «Alumnos» de cada Plan de Pago = contratos del ciclo activo que lo usan (Contrato.planId). Es un valor CALCULADO: ya no existe un
 * contador guardado que pueda divergir. `soloActivos` cuenta unicamente los alumnos con estado Activo (peso de la proyeccion del
 * Centro de Control). Si no hay ciclo activo configurado cuenta todos los contratos.
 */
export async function alumnosPorPlan(soloActivos = false): Promise<Map<string, number>> {
  const ciclo = await cicloActivo();
  const g = await prisma.contrato.groupBy({
    by: ['planId'], _count: { _all: true },
    where: { ...(ciclo.configurado ? { ciclo: ciclo.nombre } : {}), ...(soloActivos ? { alumno: { estado: 'Activo' } } : {}) },
  });
  return new Map(g.map(x => [x.planId, x._count._all]));
}
