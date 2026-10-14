import { prisma } from '../../db';

/**
 * Servicios extracurriculares (ServicioAlumno con extraId) con su ciclo y fechas de alta/baja, compartidos por los informes 9 («Ingresos por disciplina») y 10 («Retención y proyección»).
 * Ciclo efectivo = ServicioAlumno.cicloId; si es anterior a esa columna (sin backfill), el ciclo de sus cargos. Baja = fechaBaja o, si falta, «Baja · dd/mm/aaaa» de `est`.
 */
export interface SvcExtra {
  id: string; alumnoId: string; extraId: string; cicloId: string | null; alta: string | null; baja: string | null; cost: number;
}

const isoDeDMY = (s: string) => { const m = /(\d{2})\/(\d{2})\/(\d{4})/.exec(s); return m ? `${m[3]}-${m[2]}-${m[1]}` : null; };

export async function serviciosExtra(opt: { disciplina?: string } = {}): Promise<SvcExtra[]> {
  const l = await prisma.servicioAlumno.findMany({
    where: { extraId: opt.disciplina ? opt.disciplina : { not: null } },
    select: { id: true, alumnoId: true, extraId: true, cicloId: true, fechaAlta: true, fechaBaja: true, est: true, cost: true, cargos: { select: { cicloId: true }, distinct: ['cicloId'], take: 1 } },
  });
  return l.map(s => ({
    id: s.id, alumnoId: s.alumnoId, extraId: s.extraId!, cicloId: s.cicloId ?? s.cargos[0]?.cicloId ?? null, alta: s.fechaAlta,
    baja: s.fechaBaja ?? (s.est.startsWith('Baja') ? isoDeDMY(s.est) : null), cost: s.cost,
  }));
}
