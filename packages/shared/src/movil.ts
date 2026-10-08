/** Tipos de los módulos móviles (portal tutor y pase de lista). Solo tipos. */
export type EstadoCargo = 'Vencida' | 'Por vencer' | 'Pendiente';
export type MarcaAsistencia = 'P' | 'T' | 'AJ' | 'AI';

export interface MobHijo {
  id: string; nombre: string; grado: string; sec: string; alergias: string;
  cargos: { id: string; concepto: string; vence: string; monto: number; estado: EstadoCargo }[];
  notas: { materia: string; valor: number }[];
  wallet: { saldo: number; limite: number };
  accesos: { hora: string; resultado: 'ok' | 'alert' | 'no' }[];
  asistencia: { fecha: string; estado: MarcaAsistencia }[];
}
export interface MobTutorData {
  tutor: string;
  hijos: MobHijo[];
  menu: { dia: string; plato: string; alergeno?: string }[];
}
export interface MobListaData {
  seccion: string; fecha: string; tanda?: string; bloque?: string; asigId?: string;
  asignaciones?: { id: string; label: string; seccion: string; materia: string }[];
  alumnos: { id: string; nombre: string; estado: MarcaAsistencia | null; notificar: boolean }[];
}
export interface MobListaSave {
  fecha: string; seccion: string; asig?: string;
  marcas: { alumnoId: string; estado: MarcaAsistencia; notificar: boolean }[];
}
