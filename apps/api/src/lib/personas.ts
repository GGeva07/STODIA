import type { Alumno, AlumnoEstado, CuentaEstado } from '@stodia/shared';

type Row = {
  id: string; code: string; nombres: string; apellidos: string; fnac: string; grado: string; sec: string; tanda: string;
  cuenta: string; estado: string; alg: string; dir: string; tel: string; tutorId: string | null; tutor?: { nombre: string } | null;
};

export const toAlumno = (a: Row): Alumno => ({
  id: a.id, code: a.code, nombres: a.nombres, apellidos: a.apellidos, fnac: a.fnac, grado: a.grado, sec: a.sec, tanda: a.tanda,
  tutor: a.tutor?.nombre ?? '—', tutorId: a.tutorId ?? undefined, cuenta: a.cuenta as CuentaEstado, estado: a.estado as AlumnoEstado,
  alg: a.alg, dir: a.dir, tel: a.tel,
});

/** Roles con lectura únicamente sobre la ficha del estudiante (prototipo: canEdit). */
export const READONLY_ROLES = ['Docente', 'Encargado Comedor', 'Tutor'];

/** Los ítems de CxC del prototipo identifican al alumno con un `kid` corto. */
export const kidOf = (alumnoId: string) => ({ '0412': 'juan', '0587': 'sofia' } as Record<string, string>)[alumnoId] ?? alumnoId;

export const digits = (s: string) => s.replace(/\D/g, '');
