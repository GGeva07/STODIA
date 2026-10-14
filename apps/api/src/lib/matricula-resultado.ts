/**
 * RESULTADO CONGELADO POR MATRÍCULA (tabla MatriculaResultado · Informes etapa 3, Informe 2 «Movimientos del alumnado»).
 * Una fila por matrícula (UNIQUE matriculaId): se ESCRIBE de forma idempotente (borra y vuelve a insertar las matrículas indicadas, en la misma transacción de quien la llama)
 *  - al APLICAR la promoción (lib/promocion.ts, fuente 'promocion': promedio, materias reprobadas, resultado y destino reales), y
 *  - en cerrarCiclo (lib/ciclo-cierre.ts, fuente 'cierre') para las matrículas SIN resultado de promoción: resultado según el estado de la matrícula
 *    (Retirado→Retirado, Graduado→Graduado, Promovido→Aprobado, Repitente→Reprobado, resto→Pendiente), con el promedio calculado de la Matriz y el destino si ya
 *    tiene matrícula en el ciclo siguiente. Una promoción aplicada después del cierre sobrescribe esas filas; un cierre posterior a la promoción no pisa las de promoción.
 */
import type { Prisma } from '@prisma/client';
import { prisma } from '../db';
import type { FinalesCiclo } from './notas-finales'; // solo tipo: notas-finales importa promocion, que importa este modulo

type Db = typeof prisma | Prisma.TransactionClient;
export type ResultadoMat = 'Aprobado' | 'Reprobado' | 'Pendiente' | 'Graduado' | 'Retirado';
export type FuenteResultado = 'promocion' | 'cierre';

export interface FilaResultado {
  matriculaId: string; alumnoId: string; cicloId: string;
  promedio: number | null; materiasReprobadas: number; resultado: ResultadoMat; accion: string | null;
  gradoOrigenId: string; seccionOrigenId: string; gradoDestinoId: string | null; seccionDestinoId: string | null; cicloDestinoId: string | null;
  fuente: FuenteResultado;
}

const trozos = <T>(l: T[], n: number) => Array.from({ length: Math.ceil(l.length / n) }, (_, i) => l.slice(i * n, (i + 1) * n));

/** Upsert por matrícula (UNIQUE matriculaId): borra las filas existentes de esas matrículas y inserta las nuevas. Devuelve cuántas guardó. */
export async function guardarResultados(db: Db, filas: FilaResultado[]): Promise<number> {
  for (const ch of trozos(filas, 100)) {
    await db.matriculaResultado.deleteMany({ where: { matriculaId: { in: ch.map(f => f.matriculaId) } } });
    await db.matriculaResultado.createMany({ data: ch });
  }
  return filas.length;
}

/** Resultado de una matrícula según su estado (cierre sin promoción aplicada). null = no se registra (reserva o liberada). */
export function resultadoDeEstado(estado: string): { resultado: ResultadoMat; accion: string | null } | null {
  switch (estado) {
    case 'Retirado': return { resultado: 'Retirado', accion: 'Retirado' };
    case 'Graduado': return { resultado: 'Graduado', accion: 'Graduado' };
    case 'Promovido': return { resultado: 'Aprobado', accion: 'Promovido' };
    case 'Repitente': return { resultado: 'Reprobado', accion: 'Repitente' };
    case 'Reservado': case 'Liberada': return null;
    default: return { resultado: 'Pendiente', accion: null };
  }
}

/**
 * Filas de resultado del CIERRE: todas las matrículas del ciclo que aún no tienen resultado de promoción. `finales` aporta el promedio y las reprobadas
 * (nota mínima de la política de promoción); `sigId` = ciclo que queda activo (para el destino de quien ya tiene matrícula allí).
 */
export async function resultadosDeCierre(db: Db, cicloId: string, sigId: string | null, finales: FinalesCiclo, notaMinima: number): Promise<FilaResultado[]> {
  const [mats, secciones, hechos, sig] = await Promise.all([
    db.matricula.findMany({ where: { cicloId }, select: { id: true, alumnoId: true, seccionId: true, estado: true } }),
    db.seccion.findMany({ select: { id: true, gradoId: true } }),
    db.matriculaResultado.findMany({ where: { cicloId, fuente: 'promocion' }, select: { matriculaId: true } }),
    sigId ? db.matricula.findMany({ where: { cicloId: sigId, estado: { notIn: ['Retirado', 'Liberada'] } }, select: { alumnoId: true, seccionId: true } }) : Promise.resolve([]),
  ]);
  const gradoDe = new Map(secciones.map(s => [s.id, s.gradoId]));
  const yaPromovidos = new Set(hechos.map(h => h.matriculaId));
  const destino = new Map(sig.map(m => [m.alumnoId, m.seccionId]));
  const out: FilaResultado[] = [];
  for (const m of mats) {
    if (yaPromovidos.has(m.id)) continue;
    const r = resultadoDeEstado(m.estado);
    if (!r) continue;
    const fin = finales.alumnos.get(m.alumnoId);
    const finales1 = fin ? [...fin.materias.values()].map(x => x.final).filter((x): x is number => x != null) : [];
    const promedio = finales1.length ? Math.round((finales1.reduce((a, b) => a + b, 0) / finales1.length) * 10) / 10 : null; // = notas-finales.promedioGeneral
    const reprobadas = fin ? [...fin.materias.values()].filter(x => x.final != null && x.final < notaMinima).length : 0;
    const ds = destino.get(m.alumnoId) ?? null;
    out.push({
      matriculaId: m.id, alumnoId: m.alumnoId, cicloId, promedio, materiasReprobadas: reprobadas, resultado: r.resultado, accion: r.accion,
      gradoOrigenId: gradoDe.get(m.seccionId)!, seccionOrigenId: m.seccionId, gradoDestinoId: ds ? gradoDe.get(ds) ?? null : null, seccionDestinoId: ds, cicloDestinoId: ds ? sigId : null, fuente: 'cierre',
    });
  }
  return out;
}
