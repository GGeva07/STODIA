/**
 * NOTAS FINALES DE UN CICLO (Informes etapa 3 · Informe 3 «Calificaciones consolidadas» y CierreNota). Una sola fuente de cálculo, la MISMA de lib/promocion.ts:
 *   final de un periodo = fórmula de la columna «Final» de la Matriz (finalPeriodo, 1 decimal) · final de la materia = promedio simple de los finales de periodo
 *   que existen (1 decimal) · promedio general = promedio simple de los finales de materia (1 decimal).
 * `finalesCiclo` calcula "en vivo" con la rúbrica de hoy; `guardarCierreNotas` congela esos finales al cerrar el ciclo (tabla CierreNota) y `leerCierreNotas`
 * los devuelve en la misma forma, de modo que el informe usa una u otra fuente sin cambiar de lógica.
 */
import type { Prisma } from '@prisma/client';
import { prisma } from '../db';
import { rubricaDe } from './academico';
import { finalPeriodo, rubricas } from './promocion';

type Db = typeof prisma | Prisma.TransactionClient;
const r1 = (n: number) => Math.round(n * 10) / 10;

export interface MateriaFinal {
  /** finales por periodo en el orden de `periodos` (null = sin nota final completa) */
  per: (number | null)[];
  /** promedio de los periodos con nota */
  final: number | null;
}
export interface AlumnoFinales { alumnoId: string; seccionId: string; matriculaEstado: string; materias: Map<string, MateriaFinal> }
export interface FinalesCiclo {
  periodos: { id: string; orden: number; nombre: string }[];
  materias: Map<string, string>;
  alumnos: Map<string, AlumnoFinales>;
  fuente: 'vivo' | 'congelado';
}

/** Promedio general de un alumno: promedio simple de sus finales de materia (1 decimal); null si no tiene ninguno. */
export function promedioGeneral(a: AlumnoFinales): number | null {
  const v = [...a.materias.values()].map(m => m.final).filter((x): x is number => x != null);
  return v.length ? r1(v.reduce((x, y) => x + y, 0) / v.length) : null;
}

/** Calcula los finales de TODAS las matrículas del ciclo (o de una sección) con la Matriz de Notas actual. */
export async function finalesCiclo(cicloId: string, db: Db = prisma, opt: { seccionId?: string } = {}): Promise<FinalesCiclo> {
  const [mats, periodos, rub] = await Promise.all([
    db.matricula.findMany({
      where: { cicloId, estado: { notIn: ['Liberada', 'Reservado'] }, ...(opt.seccionId ? { seccionId: opt.seccionId } : {}) },
      select: { alumnoId: true, seccionId: true, estado: true, alumno: { select: { rosters: { select: { id: true } } } } },
    }),
    db.periodoAcademico.findMany({ where: { cicloId }, orderBy: { orden: 'asc' }, select: { id: true, orden: true, nombre: true } }),
    rubricas(),
  ]);
  const rosterDe = new Map<string, string>();
  for (const m of mats) for (const r of m.alumno.rosters) rosterDe.set(r.id, m.alumnoId);
  const alumnos = new Map<string, AlumnoFinales>(mats.map(m => [m.alumnoId, { alumnoId: m.alumnoId, seccionId: m.seccionId, matriculaEstado: m.estado, materias: new Map() }]));
  const materias = new Map<string, string>();
  if (!periodos.length || !rosterDe.size) return { periodos, materias, alumnos, fuente: 'vivo' };
  const perIdx = new Map(periodos.map((p, i) => [p.id, i]));
  const notas = await db.acadNota.findMany({ where: { periodoId: { in: periodos.map(p => p.id) } }, select: { rosterId: true, materiaId: true, periodoId: true, c1: true, c2: true, c3: true, c4: true, ex: true } });
  const compsDe = new Map<string, ReturnType<typeof rubricaDe>['comps']>();
  const comps = (id: string) => { let c = compsDe.get(id); if (!c) { c = rubricaDe(rub, id).comps; compsDe.set(id, c); } return c; };
  for (const n of notas) {
    const al = rosterDe.get(n.rosterId);
    if (!al) continue;
    const f = finalPeriodo(n, comps(n.materiaId));
    if (f == null) continue;
    const a = alumnos.get(al)!;
    let m = a.materias.get(n.materiaId);
    if (!m) { m = { per: new Array(periodos.length).fill(null), final: null }; a.materias.set(n.materiaId, m); }
    m.per[perIdx.get(n.periodoId)!] = r1(f);
  }
  const usadas = new Set<string>();
  for (const a of alumnos.values()) for (const [id, m] of a.materias) {
    const v = m.per.filter((x): x is number => x != null);
    m.final = v.length ? r1(v.reduce((x, y) => x + y, 0) / v.length) : null;
    usadas.add(id);
  }
  if (usadas.size) for (const x of await db.materia.findMany({ where: { id: { in: [...usadas] } }, select: { id: true, nombre: true } })) materias.set(x.id, x.nombre);
  return { periodos, materias, alumnos, fuente: 'vivo' };
}

export interface FilaCierreNota { cicloId: string; alumnoId: string; seccionId: string; materiaId: string; periodoId: string | null; final: number }

/** Filas de CierreNota: un final por periodo con nota completa y un final de materia (periodoId NULL). */
export function filasCierreNota(cicloId: string, f: FinalesCiclo): FilaCierreNota[] {
  const out: FilaCierreNota[] = [];
  for (const a of f.alumnos.values()) for (const [materiaId, m] of a.materias) {
    m.per.forEach((v, i) => { if (v != null) out.push({ cicloId, alumnoId: a.alumnoId, seccionId: a.seccionId, materiaId, periodoId: f.periodos[i].id, final: v }); });
    if (m.final != null) out.push({ cicloId, alumnoId: a.alumnoId, seccionId: a.seccionId, materiaId, periodoId: null, final: m.final });
  }
  return out;
}

/**
 * Congela las filas. SQL Server: lotes de 1000 con UN INSERT ... SELECT FROM OPENJSON (mismo patrón que guardarDetalle del cierre; createMany fila a fila es ~30× más lento).
 * Idempotente: borra primero lo que hubiera del ciclo (un reintento no duplica).
 */
export async function guardarCierreNotas(db: Db, cicloId: string, filas: FilaCierreNota[]): Promise<number> {
  const sqlserver = (process.env.DATABASE_URL ?? '').startsWith('sqlserver:');
  await db.cierreNota.deleteMany({ where: { cicloId } });
  for (let i = 0; i < filas.length; i += 1000) {
    const lote = filas.slice(i, i + 1000);
    if (!sqlserver) { await db.cierreNota.createMany({ data: lote }); continue; }
    const json = JSON.stringify(lote);
    await db.$executeRaw`INSERT INTO dbo.CierreNota (cicloId, alumnoId, seccionId, materiaId, periodoId, [final], fecha)
      SELECT cicloId, alumnoId, seccionId, materiaId, periodoId, [final], SYSUTCDATETIME()
      FROM OPENJSON(${json}) WITH (cicloId NVARCHAR(100) '$.cicloId', alumnoId NVARCHAR(100) '$.alumnoId', seccionId NVARCHAR(100) '$.seccionId', materiaId NVARCHAR(100) '$.materiaId', periodoId NVARCHAR(100) '$.periodoId', [final] FLOAT '$.final')`;
  }
  return filas.length;
}

/** ¿El ciclo tiene foto de notas congelada? */
export const tieneCierreNotas = async (cicloId: string, db: Db = prisma) => (await db.cierreNota.count({ where: { cicloId } })) > 0;

/** Lee la foto congelada con la misma forma que `finalesCiclo` (fuente 'congelado'). Los alumnos sin filas no aparecen. */
export async function leerCierreNotas(cicloId: string, db: Db = prisma, opt: { seccionId?: string } = {}): Promise<FinalesCiclo> {
  const [periodos, filas, mats] = await Promise.all([
    db.periodoAcademico.findMany({ where: { cicloId }, orderBy: { orden: 'asc' }, select: { id: true, orden: true, nombre: true } }),
    db.cierreNota.findMany({ where: { cicloId, ...(opt.seccionId ? { seccionId: opt.seccionId } : {}) }, select: { alumnoId: true, seccionId: true, materiaId: true, periodoId: true, final: true } }),
    db.matricula.findMany({ where: { cicloId, ...(opt.seccionId ? { seccionId: opt.seccionId } : {}) }, select: { alumnoId: true, estado: true } }),
  ]);
  const estado = new Map(mats.map(m => [m.alumnoId, m.estado]));
  const perIdx = new Map(periodos.map((p, i) => [p.id, i]));
  const alumnos = new Map<string, AlumnoFinales>();
  const usadas = new Set<string>();
  for (const r of filas) {
    let a = alumnos.get(r.alumnoId);
    if (!a) { a = { alumnoId: r.alumnoId, seccionId: r.seccionId, matriculaEstado: estado.get(r.alumnoId) ?? '', materias: new Map() }; alumnos.set(r.alumnoId, a); }
    let m = a.materias.get(r.materiaId);
    if (!m) { m = { per: new Array(periodos.length).fill(null), final: null }; a.materias.set(r.materiaId, m); }
    usadas.add(r.materiaId);
    if (r.periodoId == null) m.final = r.final; else { const i = perIdx.get(r.periodoId); if (i != null) m.per[i] = r.final; }
  }
  const materias = new Map<string, string>();
  if (usadas.size) for (const x of await db.materia.findMany({ where: { id: { in: [...usadas] } }, select: { id: true, nombre: true } })) materias.set(x.id, x.nombre);
  return { periodos, materias, alumnos, fuente: 'congelado' };
}
