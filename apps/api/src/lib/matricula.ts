/**
 * MATRICULA POR CICLO (Fase 2C): historial real del alumno. Regla de coherencia (documentada en docs/db-relaciones.md):
 *   - `Matricula` es la FUENTE de verdad del historial (alumno, ciclo, seccion, estado).
 *   - `Alumno.seccionId` es la seccion del ciclo ACTIVO: toda escritura que la cambie (inscripcion, Directorio, cierre de ciclo, seeds) llama a
 *     `sincronizarMatricula` para que la Matricula del ciclo activo diga lo mismo. La auditoria (docs/db-auditoria.sql, seccion D) verifica 0 divergencias.
 *   - Estado de la matricula del ciclo activo = estado del alumno (Activo/Inactivo -> Activo, Retirado -> Retirado). El CIERRE del ciclo (contable,
 *     lib/ciclo-cierre.ts) NO cambia matriculas; la PROMOCION de curso (lib/promocion.ts) pasa la del ciclo de origen a Promovido / Repitente / Graduado
 *     y crea/ajusta la del ciclo siguiente: el historial nunca se pierde. Un estado final puesto por la promocion no se revierte al sincronizar
 *     (salvo que el alumno pase a Retirado).
 */
import type { Prisma } from '@prisma/client';
import type { ExpFicha } from '@stodia/shared';
import { prisma } from '../db';
import { cicloActivoRow } from './ciclo';
import { hoyISO, zonaHoraria } from './cxc';

type Db = typeof prisma | Prisma.TransactionClient;
export const ESTADOS_MATRICULA = ['Activo', 'Retirado', 'Promovido', 'Repitente', 'Graduado', 'Reservado', 'Liberada'] as const;
export const idMatricula = (alumnoId: string, cicloId: string) => `mat-${cicloId.slice(4)}-${alumnoId}`;

/** Estado de la matricula del ciclo ACTIVO segun el estado del alumno (null = el alumno no se matricula: Egresado). */
export function estadoMatriculaDe(estadoAlumno: string): 'Activo' | 'Retirado' | null {
  if (estadoAlumno === 'Retirado') return 'Retirado';
  if (estadoAlumno === 'Egresado' || estadoAlumno === 'Preinscrito') return null; // Preinscrito = alumno nuevo de un ciclo PLANIFICADO: su matricula es la de ese ciclo, no la del activo
  return 'Activo';
}

/** Fecha de ingreso razonable de una matricula creada hoy: hoy si cae dentro del ciclo; si no, el inicio del ciclo. */
const ingresoDe = (hoy: string, c: { fechaInicio: string; fechaFin: string }) => (hoy >= c.fechaInicio && hoy <= c.fechaFin ? hoy : c.fechaInicio);

/** Deja la Matricula del ciclo activo igual al Alumno actual (seccion y estado). Idempotente. */
export async function sincronizarMatricula(alumnoId: string, db: Db = prisma): Promise<void> {
  const [c, a] = await Promise.all([cicloActivoRow(db), db.alumno.findUnique({ where: { id: alumnoId }, select: { seccionId: true, estado: true } })]);
  if (!c || !a) return;
  const estado = estadoMatriculaDe(a.estado);
  if (!estado) return;
  const hoy = hoyISO(await zonaHoraria());
  const cur = await db.matricula.findUnique({ where: { alumnoId_cicloId: { alumnoId, cicloId: c.id } } });
  if (!cur) {
    await db.matricula.create({ data: { id: idMatricula(alumnoId, c.id), alumnoId, cicloId: c.id, seccionId: a.seccionId, estado, fechaIngreso: ingresoDe(hoy, c), fechaRetiro: estado === 'Retirado' ? hoy : null } });
    return;
  }
  const fechaRetiro = estado === 'Retirado' ? cur.fechaRetiro ?? hoy : null;
  // Promovido / Repitente / Graduado (promocion aplicada antes del cierre) se conservan mientras el alumno siga vigente.
  // Reservado / Liberada (reinscripcion, Etapa B) tambien se conservan: solo el pago o el Director los cambian.
  const final = estado === 'Activo' && ['Promovido', 'Repitente', 'Graduado', 'Reservado', 'Liberada'].includes(cur.estado) ? cur.estado : estado;
  if (cur.seccionId !== a.seccionId || cur.estado !== final || cur.fechaRetiro !== fechaRetiro) {
    await db.matricula.update({ where: { id: cur.id }, data: { seccionId: a.seccionId, estado: final, fechaRetiro } });
  }
}

/** Crea la Matricula del ciclo activo de todo alumno que no la tenga (menos Egresados). Devuelve cuantas creo. */
export async function reconciliarMatriculas(db: Db = prisma): Promise<number> {
  const c = await cicloActivoRow(db);
  if (!c) return 0;
  const hoy = hoyISO(await zonaHoraria());
  const [alumnos, tienen, insc] = await Promise.all([
    db.alumno.findMany({ where: { estado: { notIn: ['Egresado', 'Preinscrito'] } }, select: { id: true, seccionId: true, estado: true } }),
    db.matricula.findMany({ where: { cicloId: c.id }, select: { alumnoId: true } }),
    db.persInscripcion.findMany({ where: { cicloId: c.id }, select: { alumnoId: true, createdAt: true } }),
  ]);
  const ya = new Set(tienen.map(m => m.alumnoId)), ins = new Map(insc.map(i => [i.alumnoId, i.createdAt.toISOString().slice(0, 10)]));
  const filas = alumnos.filter(a => !ya.has(a.id)).map(a => {
    const estado = estadoMatriculaDe(a.estado)!;
    const ing = ins.get(a.id) ?? ingresoDe(hoy, c);
    return { id: idMatricula(a.id, c.id), alumnoId: a.id, cicloId: c.id, seccionId: a.seccionId, estado, fechaIngreso: ing < c.fechaInicio ? c.fechaInicio : ing, fechaRetiro: estado === 'Retirado' ? hoy : null };
  });
  for (let i = 0; i < filas.length; i += 400) await db.matricula.createMany({ data: filas.slice(i, i + 400) });
  return filas.length;
}

// ---------- Historial academico (Expediente) ----------
const letraDe = (v: number) => (v >= 90 ? 'A' : v >= 80 ? 'B' : v >= 70 ? 'C' : 'D');
const promedio = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
const redondea = (n: number) => Math.round(n * 10) / 10;

/**
 * Historial del Expediente 360 (`ficha.hist`): una fila por CICLO con notas del alumno, del mas reciente al mas antiguo. Promedio = media de las medias de cada
 * nota (materia x periodo; promedio de sus calificaciones capturadas). El ciclo activo se muestra parcial (asterisco, boton «Parcial»).
 */
export async function historialAcademico(alumnoId: string, db: Db = prisma): Promise<ExpFicha['hist']> {
  const [mats, rosters] = await Promise.all([
    db.matricula.findMany({ where: { alumnoId }, include: { ciclo: true, seccion: { include: { grado: true } } } }),
    db.acadRoster.findMany({ where: { alumnoId }, select: { id: true } }),
  ]);
  if (!mats.length || !rosters.length) return [];
  const notas = await db.acadNota.findMany({ where: { rosterId: { in: rosters.map(r => r.id) } }, select: { c1: true, c2: true, c3: true, c4: true, ex: true, periodo: { select: { cicloId: true } } } });
  const porCiclo = new Map<string, number[]>();
  for (const n of notas) {
    const m = promedio([n.c1, n.c2, n.c3, n.c4, n.ex].filter((v): v is number => v != null));
    if (m != null) porCiclo.set(n.periodo.cicloId, [...(porCiclo.get(n.periodo.cicloId) ?? []), m]);
  }
  return mats
    .filter(m => porCiclo.has(m.cicloId))
    .sort((a, b) => b.ciclo.fechaInicio.localeCompare(a.ciclo.fechaInicio))
    .map(m => {
      const p = redondea(promedio(porCiclo.get(m.cicloId)!)!), parcial = m.ciclo.estado !== 'Cerrado';
      return { c: m.ciclo.nombre, g: `${m.seccion.grado.nombre} ${m.seccion.letra}`, prom: parcial ? `${p.toFixed(1)} *` : p.toFixed(1), l: letraDe(p), btn: parcial ? 'Parcial' : 'Boletín' };
    });
}
