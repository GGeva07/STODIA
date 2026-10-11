/**
 * TutorAlumno (Fase 2C): vinculos N:M tutor-alumno con rol (Financiero | Legal | Academico) y vigencia.
 * Regla de coherencia: la FUENTE de verdad es TutorAlumno; `Alumno.tutorId` (financiero) y `Alumno.tutorLegalId` (legal) son su copia VIGENTE.
 * Quien cambie esas dos columnas (inscripcion, pantalla Tutores, seeds) llama a `sincronizarTutores`, que cierra los vinculos que ya no valen (`hasta` = hoy)
 * y abre los nuevos. Indices unicos filtrados (lib/db-indices): un solo Financiero y un solo Legal vigentes por alumno. El rol Academico lo da
 * `Tutor.tipo` (contiene «Académico»): se abre para el tutor financiero y/o legal que sea academico. La auditoria verifica 0 divergencias.
 */
import type { Prisma } from '@prisma/client';
import { prisma } from '../db';
import { cicloActivoRow } from './ciclo';
import { hoyISO, zonaHoraria } from './cxc';

type Db = typeof prisma | Prisma.TransactionClient;
export const ROLES_TUTOR = ['Financiero', 'Legal', 'Academico'] as const;
export type RolTutor = (typeof ROLES_TUTOR)[number];
const esAcademico = (tipo: string) => /cad[eé]mico/i.test(tipo);

interface Deseado { tutorId: string; rol: RolTutor }
/** Vinculos que deben estar vigentes segun las columnas del alumno y el tipo de cada tutor. */
export function vinculosDeseados(a: { tutorId: string; tutorLegalId: string | null }, tipos: Map<string, string>): Deseado[] {
  const out: Deseado[] = [{ tutorId: a.tutorId, rol: 'Financiero' }];
  if (a.tutorLegalId) out.push({ tutorId: a.tutorLegalId, rol: 'Legal' });
  for (const t of new Set([a.tutorId, a.tutorLegalId].filter((x): x is string => !!x))) if (esAcademico(tipos.get(t) ?? '')) out.push({ tutorId: t, rol: 'Academico' });
  return out;
}

/** Deja los vinculos vigentes del alumno iguales a lo que dicen sus columnas. Idempotente. */
export async function sincronizarTutores(alumnoId: string, db: Db = prisma, hoy?: string): Promise<void> {
  const a = await db.alumno.findUnique({ where: { id: alumnoId }, select: { tutorId: true, tutorLegalId: true } });
  if (!a) return;
  const fecha = hoy ?? hoyISO(await zonaHoraria());
  const ids = [a.tutorId, ...(a.tutorLegalId ? [a.tutorLegalId] : [])];
  const tipos = new Map((await db.tutor.findMany({ where: { id: { in: ids } }, select: { id: true, tipo: true } })).map(t => [t.id, t.tipo]));
  const quiere = vinculosDeseados(a, tipos), k = (x: Deseado) => `${x.rol}|${x.tutorId}`;
  const vigentes = await db.tutorAlumno.findMany({ where: { alumnoId, hasta: null } });
  const set = new Set(quiere.map(k));
  // 1) cerrar los que ya no valen (antes de abrir: el indice unico filtrado solo admite un Financiero vigente)
  for (const v of vigentes.filter(v => !set.has(`${v.rol}|${v.tutorId}`))) await db.tutorAlumno.update({ where: { id: v.id }, data: { hasta: fecha < v.desde ? v.desde : fecha } });
  // 2) abrir los nuevos (si el mismo vinculo ya existio con la misma fecha de inicio, se reabre)
  const abiertos = new Set(vigentes.map(v => `${v.rol}|${v.tutorId}`));
  for (const q of quiere.filter(q => !abiertos.has(k(q)))) {
    const previo = await db.tutorAlumno.findUnique({ where: { alumnoId_tutorId_rol_desde: { alumnoId, tutorId: q.tutorId, rol: q.rol, desde: fecha } } });
    if (previo) await db.tutorAlumno.update({ where: { id: previo.id }, data: { hasta: null } });
    else await db.tutorAlumno.create({ data: { alumnoId, tutorId: q.tutorId, rol: q.rol, desde: fecha } });
  }
}

/** Crea los vinculos vigentes de todo alumno que no tenga ninguno (seeds, migracion). `desde` = inicio del ciclo activo. Devuelve cuantas filas creo. */
export async function reconciliarTutorAlumno(db: Db = prisma): Promise<number> {
  const c = await cicloActivoRow(db);
  const desde = c?.fechaInicio ?? hoyISO(await zonaHoraria());
  const [alumnos, tutores, ya] = await Promise.all([
    db.alumno.findMany({ select: { id: true, tutorId: true, tutorLegalId: true } }),
    db.tutor.findMany({ select: { id: true, tipo: true } }),
    db.tutorAlumno.findMany({ where: { hasta: null }, select: { alumnoId: true, tutorId: true, rol: true } }),
  ]);
  const tipos = new Map(tutores.map(t => [t.id, t.tipo])), tiene = new Set(ya.map(v => `${v.alumnoId}|${v.rol}|${v.tutorId}`));
  const filas = alumnos.flatMap(a => vinculosDeseados(a, tipos).filter(q => !tiene.has(`${a.id}|${q.rol}|${q.tutorId}`)).map(q => ({ alumnoId: a.id, tutorId: q.tutorId, rol: q.rol, desde })));
  for (let i = 0; i < filas.length; i += 400) await db.tutorAlumno.createMany({ data: filas.slice(i, i + 400) });
  return filas.length;
}
