import type { Alumno, AlumnoEstado, CuentaEstado } from '@stodia/shared';
import { prisma } from '../db';

type Row = {
  id: string; code: string; nombres: string; apellidos: string; fnac: string; grado: string; sec: string; tanda: string;
  cuenta: string; estado: string; alg: string; dir: string; tel: string; tutorId: string; tutor?: { nombre: string } | null;
};

export const toAlumno = (a: Row): Alumno => ({
  id: a.id, code: a.code, nombres: a.nombres, apellidos: a.apellidos, fnac: a.fnac, grado: a.grado, sec: a.sec, tanda: a.tanda,
  tutor: a.tutor?.nombre ?? '—', tutorId: a.tutorId, cuenta: a.cuenta as CuentaEstado, estado: a.estado as AlumnoEstado,
  alg: a.alg, dir: a.dir, tel: a.tel,
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
  const [cobros, insc, becas, intenc, rosters, wallet, accesos, carnet] = await Promise.all([
    prisma.finCobroItem.count({ where: { alumnoId: id } }), prisma.persInscripcion.count({ where: { alumnoId: id } }), prisma.finBeca.count({ where: { alumnoId: id } }),
    prisma.mobPagoIntencion.count({ where: { alumnoId: id } }), prisma.acadRoster.count({ where: { alumnoId: id } }), prisma.mobWallet.count({ where: { alumnoId: id } }),
    prisma.mobAcceso.count({ where: { alumnoId: id } }), prisma.comCarnet.count({ where: { alumnoId: id } }),
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
  return out;
}
