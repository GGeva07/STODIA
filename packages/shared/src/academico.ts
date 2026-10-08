/** Tipos del grupo académico (Matriz de Notas, Pase de Lista, Extracurriculares, Horarios, Catálogos). SOLO TIPOS. */

// ---------- Asignaciones (docente x sección x materia) ----------
export interface AcadAsigOpt { id: string; label: string; seccion: string; materia: string }
export interface AcadPeriodo { k: string; label: string }

// ---------- Matriz de Notas ----------
export interface AcadNotasFila { id: string; nombre: string; orden: number; g: string[] /* una nota por competencia, en el orden de `comps` ('' = sin capturar) */ }
export interface AcadNotasMatriz {
  seccion: string; materia: string; periodo: string; periodoLabel: string; docente: string;
  /** Competencias de la rúbrica del catálogo: `w` = peso en % (EX = examen). */
  comps: { k: string; n: string; w: number }[]; rows: AcadNotasFila[];
  nivel: string; minimo: number; rubrica: string;
  asigId: string; asignaciones: AcadAsigOpt[]; periodos: AcadPeriodo[];
}
export interface AcadNotaGuardada { t: string; usr: string; ip: string; prev: string; next: string }

// ---------- Pase de Lista ----------
export type AcadMarca = 'P' | 'T' | 'AJ' | 'AI';
export interface AcadAsisCard { rosterId: string; nombre: string; estado: AcadMarca | null; notificar: boolean }
export interface AcadAsisDia { seccion: string; tanda: string; fecha: string; bloque: string; cards: AcadAsisCard[]; asigId: string; asignaciones: AcadAsigOpt[] }
export interface AcadAsisGuardado { guardados: number; notificados: number }

// ---------- Horarios ----------
/** `k` = id de materia del catálogo; `td` = id del docente; `aulas` solo si la materia admite más de un aula. */
export interface AcadMateriaHorario { k: string; name: string; t: string; td: string; aula: string; h: number; aulas?: { nombre: string; pupitres: number }[] }
export interface AcadHorarios {
  seccionId: string; secciones: { id: string; label: string }[];
  seccion: string; tanda: string; alumnos: number; aulaBase: string; pupitres: number;
  dias: string[]; bloques: string[]; materias: AcadMateriaHorario[];
  sched: Record<string, string>;
  /** Restricciones (otras secciones) para la validación en vivo; el servidor las revalida al guardar. tbusy: por id de docente. */
  tbusy: Record<string, Record<string, string>>; abusy: Record<string, Record<string, string>>; cap: Record<string, number>;
}

// ---------- Extracurriculares ----------
export interface AcadExtra {
  id: string; name: string; cat: string; kind: 'act' | 'curso'; instructor: string; lugar: string; dias: string; hora: string;
  grados: string; cupo: number; inscritos: number; costo: number; ini: string; sem: number; estado: 'Abierta' | 'Cupo lleno' | 'Cerrada';
}
export type AcadExtraInput = Omit<AcadExtra, 'id' | 'inscritos' | 'estado'> & { estado: string; pin?: string };

// ---------- Catálogos (fila genérica; los campos varían por tipo) ----------
export type AcadCatalogos = Record<string, ({ id: string; estado: string } & Record<string, unknown>)[]>;
