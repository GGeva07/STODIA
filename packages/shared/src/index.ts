/**
 * Tipos compartidos, inferidos del mock del prototipo (Sistema Escolar.dc.html).
 * SOLO TIPOS: no agregar valores/runtime aquí. Importar siempre con `import type`.
 * Las fechas viajan como string ISO (YYYY-MM-DD o ISO completo); los montos en RD$ como number.
 */

// ---------- Seguridad ----------
export type Rol =
  | 'Super Admin'
  | 'Director Académico'
  | 'Docente'
  | 'Cajero'
  | 'Encargado Comedor'
  | 'Tutor';

export type ScreenId =
  | 'dashboard' | 'notas' | 'asistencia' | 'horarios' | 'extra'
  | 'directorio' | 'expediente' | 'tutores' | 'inscripcion'
  | 'pos' | 'planes' | 'kiosko' | 'inventario' | 'becas'
  | 'comedor' | 'alimentacion' | 'portal' | 'comunica'
  | 'catalogos' | 'config' | 'auditoria' | 'licencia';

export interface SessionUser {
  usuario: string;
  nombre: string;
  rol: Rol;
  /** Contraseña temporal: debe cambiarla antes de usar el sistema. */
  mustChange?: boolean;
}

export interface LoginRequest { usuario: string; password: string }
export interface LoginResponse { token: string; user: SessionUser }

export interface RuntimeConfig {
  apiUrl: string;
  licenseKey: string;
  institutionName?: string;
  /** Pedir la URL del servidor antes del login cuando no hay una guardada: true = siempre, 'mobile' = solo teléfonos/tabletas. */
  askServer?: boolean | 'mobile';
}

// ---------- Catálogos maestros (CAT_DEF) ----------
export type Estado = 'Activo' | 'Inactivo';
export type CatalogoTipo =
  | 'grados' | 'secciones' | 'tandas' | 'materias' | 'rubricas'
  | 'docentes' | 'staff' | 'aulas' | 'cajas' | 'rutas';

export type NivelEducativo = 'Inicial' | 'Primaria' | 'Secundaria';

export interface Grado { id: string; nivel: NivelEducativo; grado: string; orden: number; estado: Estado }
export interface Tanda { id: string; nombre: string; ini: string; fin: string; estado: Estado }
export interface Aula {
  id: string; nombre: string; tipo: 'Aula' | 'Laboratorio' | 'Cancha' | 'Salón especial';
  edif: string; pupitres: number; estado: Estado;
}
export interface Seccion {
  id: string; grado: string /* Grado.id */; seccion: string; tanda: string /* Tanda.id */;
  aula?: string /* Aula.id */; cap: number; insc: number; estado: Estado;
}
export interface Materia { id: string; codigo: string; nombre: string; grados: string[]; horas: number; estado: Estado }
export interface Rubrica {
  id: string; nombre: string; materias: string[]; escala: string; crit: string; minimo: number; estado: Estado;
}
export interface Docente {
  id: string; nombre: string; cedula: string; esp: string; email?: string; usuario: string;
  rol: Rol; materias: string[]; secciones: string[]; estado: Estado;
}
export interface Empleado {
  id: string; nombre: string; cargo: string; usuario: string; rol: Rol; caja?: string; estado: Estado;
}
export interface Caja {
  id: string; codigo: string; ubic: string; ncf: 'B02 · Consumo' | 'B01 · Crédito fiscal'; estado: 'Activa' | 'Inactiva';
}
export interface RutaTransporte {
  id: string; nombre: string; sectores?: string; chofer: string; ficha: string;
  asientos: number; tarifa: number; estado: Estado;
}

// ---------- Estudiantes ----------
export type CuentaEstado = 'ok' | 'mora';
export type AlumnoEstado = 'Activo' | 'Inactivo' | 'Retirado';

export interface Tutor {
  id: string; nombre: string; cedula: string;
  parentesco: 'Padre' | 'Madre' | 'Tutor legal' | 'Abuelo(a)' | 'Otro';
  tipo: 'Financiero y académico' | 'Financiero' | 'Académico';
  tel: string; email?: string; rnc?: string;
  alumnos: string[]; usuario?: string; estado: Estado;
}

export interface Alumno {
  id: string;            // matrícula corta, ej. '0412'
  code: string;          // 'EST-2026-0412'
  nombres: string;
  apellidos: string;
  fnac: string;          // YYYY-MM-DD
  grado: string;         // etiqueta ('5to')
  sec: string;           // 'A'
  tanda: string;         // 'Matutina'
  seccionId?: string;    // id de la sección (FK Seccion): grado/sec/tanda se calculan de ella
  tutor: string;         // nombre del tutor financiero
  tutorId?: string;
  cuenta: CuentaEstado;
  estado: AlumnoEstado;
  alg: string;           // alergias, texto libre
  dir: string;
  tel: string;
}

// ---------- Finanzas (ERP / CxC) ----------
export type CargoTipo = 'col' | 'mora' | 'com' | 'srv' | 'mat' | 'tra' | 'reins';
export type CargoEstado = 'Pendiente' | 'Por vencer' | 'Vencida' | 'Pagada';

/** Cargo pendiente en el POS (POS0). */
export interface Cargo {
  id: string; concepto: string; alumnoId: string; vence: string;
  monto: number; estado: CargoEstado; tipo: CargoTipo; servicio?: string; unico?: boolean;
}

export type MetodoPago = 'Efectivo' | 'Tarjeta de Crédito' | 'Tarjeta de Débito' | 'Transferencia' | 'Cheque';

export interface Recibo {
  id: string;            // 'REC-0417'
  ncf: string;           // 'B0200001880'
  tutor: string;
  fecha: string;         // ISO
  monto: number;
  estado: 'Activo' | 'Anulado';
  metodo: MetodoPago | string;
  cajaId?: string;
  cargos?: string[];     // Cargo.id
}

export interface PlanPago {
  id: string; name: string;
  freq: '0' | '1' | '3';           // 0 = pago único, meses entre cuotas
  n: number; anual: number; desc: number;
  start: number; dia: number; gracia: number;
  moraTipo: 'none' | 'pct' | 'fijo'; moraVal: number;
  pronto: number; prontoDias: number;
  porTanda?: boolean; tm?: Record<string, number>;
  estado: Estado; alumnos: number;
}

export interface Beca {
  id: number; alumno: string; grado: string; tipo: string; regla: string;
  conceptos: string; exp: string; estado: 'Pendiente' | 'Aprobada' | 'Rechazada'; aprob?: string;
}

export interface ServicioCatalogo {
  k: string; l: string; cat: 'Recurrente opcional' | 'Esporádico' | 'Materiales';
  freq: string; mora: string; price: number; rec: boolean; spec?: string;
}

export interface Producto {
  id: string; code: string; name: string; cat: string; price: number; tax: boolean; stock: number | null;
}

// ---------- Comedor ----------
export interface PlanAlimentacion {
  id: string; name: string; modelo: 'sub' | 'wal'; meals: boolean[]; precio?: number;
  freq: string; dias: string; mora: boolean; recarga?: number; limite?: number;
  canal: string; saldo: string; diets: boolean[]; estado: Estado; inscritos: number;
}
export interface MenuDia { dia: string; plato: string; algs: string[] }

// ---------- Académico ----------
export interface Extracurricular {
  id: string; name: string; cat: string; kind: 'act' | 'curso'; instructor: string; lugar: string;
  dias: string; hora: string; grados: string; cupo: number; inscritos: number; costo: number;
  ini?: string; sem?: number; estado: 'Abierta' | 'Cupo lleno';
}
export interface Calificacion { alumnoId: string; materiaId: string; periodo: string; c1?: number; c2?: number; c3?: number; c4?: number; ex?: number }
export interface Asistencia { alumnoId: string; fecha: string; estado: 'P' | 'A' | 'T' | 'E' }

// ---------- Sistema ----------
export interface AuditoriaEntry {
  t: string; usr: string; a: 'Insert' | 'Update' | 'Delete'; tabla: string; id: string; prev: string; next: string; ip: string;
}
export interface Comunicacion {
  id: number; t: string; to: string; canal: 'Correo' | 'SMS' | 'WhatsApp' | 'Push';
  asunto: string; estado: 'Entregado' | 'Fallido'; by: string;
}
export * from './movil';
export * from './finanzas';
export * from './notas';
export * from './sistema';
export * from './operacion';
export * from './academico';
export * from './personas';
export * from './promocion';
export * from './reinscripcion';
