/**
 * REINSCRIPCION de alumnos existentes en el ciclo siguiente (Etapa B). SOLO TIPOS. Ver docs/cierre-y-promocion.md §6.
 * API: GET/PUT /reinscripcion/config · PUT /reinscripcion/limite · GET /reinscripcion/preview · POST /reinscripcion/abrir · GET /reinscripcion/listado
 *      · POST /reinscripcion/evaluar · POST /reinscripcion/reactivar
 */

/** Politica de reinscripcion (SisConfig 'reinscripcion'). */
export interface CfgReinscripcion {
  /** Usar reinscripcion: sin esto no se puede abrir (las reservas ya creadas se conservan). */
  activa: boolean;
  /** CHECK «Perdida de cupo por falta de pago»: si esta APAGADO (por defecto) el impago solo genera mora y el cupo queda asegurado; si esta ACTIVO el alumno pierde el cupo. */
  perdidaCupoPorFaltaDePago: boolean;
  /** 'inscripcion' = usa la cuota de inscripcion vigente (finanzas.inscripcionModo: fija o por plan del contrato); 'propia' = `cuotaReinscripcion`. */
  modo: 'inscripcion' | 'propia';
  /** Monto (RD$) de la cuota de reinscripcion propia (solo con modo 'propia'). */
  cuotaReinscripcion: number;
  /** Dias de gracia despues de la fecha limite antes de considerarla vencida (mora / perdida de cupo). Por defecto 0. */
  diasGracia: number;
}

export type EstadoReinscripcion = 'Reservado' | 'Confirmado' | 'Vencido' | 'Liberado';

/** Fila del listado del Director. */
export interface ReinscripcionFila {
  alumnoId: string; code: string; nombre: string;
  gradoId: string; grado: string; gradoOrden: number; seccionId: string; seccion: string; tanda: string;
  /** Seccion de origen (ciclo activo). */
  origen: string;
  estado: EstadoReinscripcion;
  monto: number; vence: string | null; cargoId: string | null;
  /** Mora pendiente asociada (RD$). */
  mora: number;
  alumnoEstado: string;
  nota: string;
}

export interface ReinscripcionConteos { reservado: number; confirmado: number; vencido: number; liberado: number; total: number; moraGenerada: number }

export interface ReinscripcionListado {
  destino: string | null; destinoEstado: string | null; limite: string | null;
  cfg: CfgReinscripcion;
  conteos: ReinscripcionConteos;
  /** Cupos liberados por falta de pago (matriculas Liberada del ciclo destino) y cupos libres hoy por seccion para reutilizar. */
  cuposLiberados: number;
  filas: ReinscripcionFila[];
}

/** Vista previa / resultado de «Abrir reinscripcion». */
export interface ReinscripcionPreview {
  origen: string; destino: string | null; destinoEstado: string | null; limite: string | null;
  cfg: CfgReinscripcion;
  /** Alumnos vigentes (Activo con matricula Activo en el ciclo activo). */
  vigentes: number;
  /** Ya tienen matricula en el destino (no se tocan). */
  conMatricula: number;
  /** Alumnos que se reservarian ahora. */
  reservar: number;
  /** Sin seccion con cupo en el grado siguiente: no se reservan. */
  sinCupo: number;
  sinCupoNombres: string[];
  /** Total de cuotas (RD$) que se generarian y alumnos cuya cuota es 0 (quedan confirmados sin cobro). */
  montoTotal: number;
  sinCuota: number;
  bloqueo?: string;
  avisos: string[];
}
export interface ReinscripcionAbrirResp { preview: ReinscripcionPreview; reservados: number; cargos: number; confirmados: number; sinCupo: number }

export interface ReinscripcionEvalResp { evaluadas: number; vencidas: number; liberadas: number; conMora: number; politicaPerdida: boolean }
export interface ReinscripcionReactivarReq { alumnoId: string; pin?: string; limite?: string }
