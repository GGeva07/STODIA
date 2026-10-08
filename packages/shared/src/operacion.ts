/** Tipos del grupo Operación: comedor, planes de alimentación, comunicaciones, dashboard. Solo tipos. */

export interface ComCarnetDto {
  code: string; name: string; grado: string; plan: string; ok: boolean; allergies: string[];
  restr: string; limit: number; motivo: string; wallet: number; spent: number;
}
export interface ComLecturaDto { t: string; n: string; s: 'ok' | 'alert' | 'no' }
export interface ComedorEstado { carnets: ComCarnetDto[]; log: ComLecturaDto[] }
export interface ComEscaneoRes { carnet: ComCarnetDto; log: ComLecturaDto[] }

export interface AliPlanDto {
  id: string; name: string; modelo: 'sub' | 'wal'; meals: boolean[]; precio: string;
  freq: string; dias: string; mora: 'si' | 'no'; recarga: string; limite: string;
  canal: string; saldo: string; diets: boolean[]; estado: 'Activo' | 'Inactivo'; inscritos: number;
}
export type AliPlanInput = Omit<AliPlanDto, 'id' | 'inscritos'>;
export interface AliMenuDto { dia: string; plato: string; algs: string[]; afectados: Record<string, number> }
export interface AliData { planes: AliPlanDto[]; menu: AliMenuDto[]; alumnosConAlergia: number }

export type CmnCanal = 'Correo' | 'Push' | 'SMS' | 'WhatsApp';
export interface CmnFiltro { grado: string; tanda: string; cuenta: string }
export interface CmnDestinatarios {
  tutores: string[];
  muestra: { tutor: string; alumno: string; saldo: number } | null;
}
export interface CmnMensajeDto {
  id: number; batch: string; t: string; to: string; canal: CmnCanal;
  asunto: string; estado: 'En cola' | 'Entregado' | 'Fallido'; by: string;
}
export interface CmnEnviarReq extends CmnFiltro { canales: CmnCanal[]; asunto: string; mensaje: string }
export interface CmnEnviarRes { batch: string; total: number }

export interface DashboardData {
  fecha: string; ciclo: string;
  recaudoEfectivo: number; recaudoBanco: number; morosidad: number; proyeccionCiclo: number;
  matricula: number; inscripcionesMes: number;
  asistenciaIncidencias: number; asistenciaPresentes: number; asistenciaSinMarcar: number; asistenciaSeccion: string;
  becasPendientes: number; alumnosEnMora: number; stockBajo: number; ecfCargado: boolean;
  /** Estado de cada secuencia NCF configurada (consumo real vs rango autorizado). */
  ncf: { pref: string; tipo: string; estado: 'Vigente' | 'Por agotar' | 'Agotada'; restantes: number; total: number }[];
  barras: { m: string; v: number }[];
}
