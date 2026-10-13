/**
 * CIERRE DEL AÑO ESCOLAR (contable/administrativo) y PROMOCION DE CURSO (por notas). SOLO TIPOS.
 * Ver docs/cierre-y-promocion.md. API: GET /config/ciclos/:n/cierre (vista previa), POST /config/ciclos/:n/eoy (cierre),
 * GET/PUT /academico/promocion/config, GET /academico/promocion/preview, POST /academico/promocion/aplicar.
 */
import type { CfgCiclo } from './sistema';

// ---------- Cierre contable del ciclo ----------
/** Deuda vigente de un alumno al cerrar (cargos sin pagar del ciclo). */
export interface CierreDeudaAlumno { alumnoId: string; code: string; nombre: string; seccion: string; pendiente: number; vencido: number; cargos: number }

/** Resumen financiero del ciclo (RD$). Definiciones en apps/api/src/lib/ciclo-cierre.ts → resumenFinancieroCiclo. */
export interface CierreResumen {
  ciclo: string;
  estado: 'Planificado' | 'Activo' | 'Cerrado';
  /** Ciclo Planificado que se activará al cerrar (null si no hay ninguno: el cierre lo exige). */
  siguiente: string | null;
  /** Cargos del ciclo: lo cobrado de cargos del ciclo (bruto de las líneas) + lo pendiente. */
  facturado: number;
  /** Recibos vigentes emitidos en el ciclo (caja). */
  cobrado: number;
  notasCredito: number;
  notasDebito: number;
  /** cobrado − notas de crédito sobre recibos vigentes del ciclo. */
  cobradoNeto: number;
  /** Descuentos aplicados al cobrar (pronto pago, exoneraciones). */
  descuentos: number;
  /** Cartera sin pagar del ciclo (sigue cobrable desde el ciclo activo como «deuda anterior»). */
  pendiente: number;
  vencido: number;
  /** Recargos por mora generados en el ciclo (total) y su parte sin pagar. */
  mora: number;
  moraPendiente: number;
  recibos: number;
  recibosAnulados: number;
  cargos: number;
  cargosPendientes: number;
  alumnosConDeuda: number;
  matriculas: number;
  /** Mayores deudas (top 50 en la vista previa; el snapshot guarda todas). */
  deudaAlumnos: CierreDeudaAlumno[];
  /** Cierre ya realizado (fecha ISO y usuario), si el ciclo está Cerrado y hay snapshot. */
  cerrado?: { fecha: string; usuario: string; usuarioNombre: string };
}

export interface CierreResultado { ciclos: CfgCiclo[]; activo: string | null; resumen: CierreResumen; /** Alumnos alineados a la matrícula que ya tenían en el ciclo que se activa (pre-inscritos / promoción aplicada antes del cierre). */ alineados: number; egresados: number }

// ---------- Promoción de curso ----------
export type CriterioPromocion = 'promedio_general' | 'todas_las_materias' | 'max_reprobadas';
/** Parámetros de promoción (SisConfig 'promocion'). */
export interface CfgPromocion {
  /** Rango seguro: nota mínima para aprobar (0–100). Por defecto 70. */
  notaMinima: number;
  /** promedio_general: promedio general ≥ nota mínima · todas_las_materias: cada materia ≥ nota mínima · max_reprobadas: promedio ≥ mínima y como mucho `maxReprobadas` materias por debajo. */
  criterio: CriterioPromocion;
  /** Solo para criterio max_reprobadas. */
  maxReprobadas: number;
  /** true: una materia sin nota final en TODOS los períodos del ciclo deja al alumno «Pendiente de notas». false: se promedian los períodos con nota. */
  requiereTodosLosPeriodos: boolean;
}

export type ResultadoPromocion = 'Aprobado' | 'Reprobado' | 'Pendiente de notas';
export type AccionPromocion = 'Promovido' | 'Repitente' | 'Graduado' | 'Pendiente' | 'SinCupo' | 'Respetada';

export interface PromocionMateria { materiaId: string; materia: string; final: number | null; periodos: (number | null)[]; completa: boolean; reprobada: boolean }
export interface PromocionFila {
  alumnoId: string; code: string; nombre: string;
  gradoId: string; grado: string; gradoOrden: number; /** Nivel del grado (Primaria, Secundaria...): distingue grados con el mismo nombre. */ nivel: string; seccionId: string; seccion: string; tanda: string;
  promedio: number | null; materias: number; reprobadas: number; incompletas: number;
  resultado: ResultadoPromocion;
  /** Qué haría «Aplicar promoción» y en qué sección del ciclo destino (null = sin sección). */
  accion: AccionPromocion; destino: string | null; destinoId: string | null;
  /** Explicación corta (p. ej. «Sin cupo en 3ro A (cap 30)», «Ya matriculado en 2do B»). */
  nota: string;
  detalle: PromocionMateria[];
}
export interface PromocionConteos { evaluados: number; aprobados: number; reprobados: number; pendientes: number; graduados: number; sinSeccion: number; respetadas: number }
export interface PromocionPreview {
  origen: string; origenEstado: 'Planificado' | 'Activo' | 'Cerrado';
  /** Ciclo donde se crean las matrículas (Planificado siguiente o, si ya se cerró el origen, el Activo). null = no hay destino: no se puede aplicar. */
  destino: string | null; destinoEstado: 'Planificado' | 'Activo' | 'Cerrado' | null;
  /** Ciclos que pueden ser origen (los que tienen matrícula), del más reciente al más antiguo. */
  origenes: string[];
  periodos: number;
  cfg: CfgPromocion;
  /** Motivo por el que no se puede aplicar (sin ciclo destino, ciclo ya promovido por el cierre anterior...). */
  bloqueo?: string;
  ultimoGrado: string | null;
  conteos: PromocionConteos;
  filas: PromocionFila[];
  /** Última aplicación registrada para este origen. */
  ultima?: { fecha: string; usuario: string; aprobados: number; reprobados: number; pendientes: number; graduados: number; sinSeccion: number };
}
export interface PromocionAplicarReq { origen?: string; /** Conteos que el usuario vio en la vista previa: si cambiaron, el servidor responde 409 para que revise. */ esperado?: Partial<PromocionConteos> }
export interface PromocionAplicarResp { id: number; conteos: PromocionConteos; creadas: number; ajustadas: number; sinCambios: number; preview: PromocionPreview }
