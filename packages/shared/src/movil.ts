/** Tipos de los módulos móviles (portal tutor y pase de lista). Solo tipos. */
export type EstadoCargo = 'Vencida' | 'Por vencer' | 'Pendiente';
export type MarcaAsistencia = 'P' | 'T' | 'AJ' | 'AI';

export interface MobHijo {
  id: string; nombre: string; grado: string; sec: string; alergias: string;
  cargos: { id: string; concepto: string; vence: string; monto: number; estado: EstadoCargo }[];
  notas: { materia: string; valor: number }[];
  /** null = el alumno no tiene monedero activo (se crea con la primera recarga). */
  wallet: { saldo: number; limite: number } | null;
  accesos: { hora: string; resultado: 'ok' | 'alert' | 'no' }[];
  asistencia: { fecha: string; estado: MarcaAsistencia }[];
  /** Pagos registrados en el portal que el cajero aún no verifica. */
  pagosPendientes?: { id: string; tipo: 'cargos' | 'recarga'; monto: number; creado: string }[];
}
export interface MobTutorData {
  tutor: string;
  hijos: MobHijo[];
  menu: { dia: string; plato: string; algs: string[] }[];
  /** demo = pago simulado inmediato (solo presentaciones); manual = registrar el pago en administración; pasarela = proveedor real. */
  pago?: { modo: 'demo' | 'manual' | 'pasarela'; instrucciones: string };
  /** Montos de recarga rápida del monedero (SisConfig 'comedor'). */
  recargas?: number[];
}
/** Intención de pago del portal (sin pasarela): el cajero la verifica y la confirma desde Cobros. */
export interface MobPagoIntencionDto {
  id: string; alumnoId: string; alumno: string; tutor: string; tipo: 'cargos' | 'recarga'; monto: number;
  estado: 'pendiente' | 'confirmada' | 'rechazada'; creado: string; resuelto: string | null; resueltoPor: string; nota: string; reciboId: string;
  detalle: { id: string; con: string; monto: number }[];
}
/** Config de pasarela + instrucciones de pago manual + recargas (Super Admin). */
export interface MobPasarelaCfg { activa: boolean; proveedor: string | null; demo: boolean; instruccionesPago: string; recargas: number[]; demoDisponible: boolean }
export interface MobListaData {
  seccion: string; fecha: string; tanda?: string; bloque?: string; asigId?: string;
  asignaciones?: { id: string; label: string; seccion: string; materia: string }[];
  alumnos: { id: string; nombre: string; estado: MarcaAsistencia | null; notificar: boolean }[];
}
export interface MobListaSave {
  fecha: string; seccion: string; asig?: string;
  marcas: { alumnoId: string; estado: MarcaAsistencia; notificar: boolean }[];
}
