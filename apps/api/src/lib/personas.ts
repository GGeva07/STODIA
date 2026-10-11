import type { Alumno, AlumnoEstado, CuentaEstado } from '@stodia/shared';
import { prisma } from '../db';

/**
 * include de Prisma para traer la seccion del alumno con su grado y tanda (grado/sec/tanda ya no son columnas: se calculan de Alumno.seccionId)
 * y sus alergias (Alumno.alg ya no es columna: el DTO las muestra como «Maní, Lactosa», en el orden del catalogo).
 */
export const SEC_INC = { seccion: { include: { grado: true, tanda: true } }, alergias: { include: { alergia: true }, orderBy: { alergiaId: 'asc' } } } as const;
type AlergiasRel = { alergia: { nombre: string } }[];
/** Texto de las alergias del alumno (nombres del catalogo separados por coma; '' si no tiene). */
export const algDe = (a: { alergias: AlergiasRel }) => a.alergias.map(x => x.alergia.nombre).join(', ');

type SeccionRel = { letra: string; grado: { nombre: string }; tanda: { nombre: string } };
/** grado / sec / tanda (los nombres de siempre) calculados desde la seccion del alumno (incluida con SEC_INC). */
export const gst = (a: { seccion: SeccionRel }) => ({ grado: a.seccion.grado.nombre, sec: a.seccion.letra, tanda: a.seccion.tanda.nombre });

type Row = {
  id: string; code: string; nombres: string; apellidos: string; fnac: string; seccionId: string; seccion: SeccionRel;
  cuenta: string; estado: string; alergias: AlergiasRel; dir: string; tel: string; tutorId: string; tutor?: { nombre: string } | null;
};

export const toAlumno = (a: Row): Alumno => ({
  id: a.id, code: a.code, nombres: a.nombres, apellidos: a.apellidos, fnac: a.fnac, ...gst(a), seccionId: a.seccionId,
  tutor: a.tutor?.nombre ?? '—', tutorId: a.tutorId, cuenta: a.cuenta as CuentaEstado, estado: a.estado as AlumnoEstado,
  alg: algDe(a), dir: a.dir, tel: a.tel,
});

/** Roles con lectura únicamente sobre la ficha del estudiante (prototipo: canEdit). */
export const READONLY_ROLES = ['Docente', 'Encargado Comedor', 'Tutor'];

export const digits = (s: string) => s.replace(/\D/g, '');

/**
 * Historial que IMPIDE eliminar fisicamente a un alumno (FK NoAction): cobros, inscripcion/NCF, becas, pagos del portal, nomina
 * academica, monedero, accesos y carnet. Devuelve textos legibles ("12 cargo(s) de cobro"); vacio = se puede eliminar.
 * Un alumno con historial se RETIRA o DESACTIVA (estado), nunca se borra.
 */
export async function dependenciasAlumno(id: string): Promise<string[]> {
  const [cobros, insc, becas, intenc, rosters, wallet, accesos, carnet, matriculas] = await Promise.all([
    prisma.finCobroItem.count({ where: { alumnoId: id } }), prisma.persInscripcion.count({ where: { alumnoId: id } }), prisma.finBeca.count({ where: { alumnoId: id } }),
    prisma.mobPagoIntencion.count({ where: { alumnoId: id } }), prisma.acadRoster.count({ where: { alumnoId: id } }), prisma.monedero.count({ where: { alumnoId: id } }),
    prisma.mobAcceso.count({ where: { alumnoId: id } }), prisma.comCarnet.count({ where: { alumnoId: id } }),
    prisma.matricula.count({ where: { alumnoId: id, ciclo: { estado: { not: 'Activo' } } } }), // el historial de ciclos anteriores impide borrar (la matricula del ciclo activo se retira con el alumno)
  ]);
  const out: string[] = [];
  if (cobros) out.push(`${cobros} cargo(s) de cobro`);
  if (insc) out.push(`${insc} inscripción(es) con NCF`);
  if (becas) out.push(`${becas} beca(s)`);
  if (intenc) out.push(`${intenc} pago(s) del portal`);
  if (rosters) out.push('nómina académica (notas y asistencia)');
  if (wallet) out.push('monedero del comedor');
  if (accesos) out.push('accesos registrados');
  if (carnet) out.push('carnet de comedor');
  if (matriculas) out.push(`${matriculas} matrícula(s) de otros ciclos`);
  return out;
}
