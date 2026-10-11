/** Tipos del grupo Operación: comedor, planes de alimentación, comunicaciones, dashboard. Solo tipos. */

export interface ComCarnetDto {
  code: string; name: string; grado: string; plan: string; ok: boolean; allergies: string[];
  restr: string; limit: number; motivo: string; wallet: number; spent: number;
}
export interface ComLecturaDto { t: string; n: string; s: 'ok' | 'alert' | 'no' }
export interface ComedorEstado { carnets: ComCarnetDto[]; log: ComLecturaDto[]; encabezado: string; consumos: { l: string; p: number }[] }
export interface ComEscaneoRes { carnet: ComCarnetDto; log: ComLecturaDto[] }

export interface AliPlanDto {
  id: string; name: string; modelo: 'sub' | 'wal'; meals: boolean[]; precio: string;
  freq: string; dias: string; mora: 'si' | 'no'; recarga: string; limite: string;
  canal: string; saldo: string; diets: boolean[]; estado: 'Activo' | 'Inactivo'; inscritos: number;
}
export type AliPlanInput = Omit<AliPlanDto, 'id' | 'inscritos'>;
export interface AliMenuDto { dia: string; plato: string; algs: string[]; afectados: Record<string, number> }
/** Catálogos de Alimentación (Catalogo 'comidas' | 'dietas' | 'alergias'); las posiciones de meals/diets de un plan siguen el orden de estos catálogos. */
export interface AliCatalogos { comidas: string[]; dietas: string[]; alergias: string[] }
export interface AliData { planes: AliPlanDto[]; menu: AliMenuDto[]; alumnosConAlergia: number; semana: { desde: string; hasta: string; label: string }; catalogos: AliCatalogos }

export type CmnCanal = 'Correo' | 'Push' | 'SMS' | 'WhatsApp';
export interface CmnFiltro { grado: string; tanda: string; cuenta: string }
export interface CmnDestinatarios {
  /** Primeros nombres (muestra acotada); el conteo real va en `total`. */
  tutores: string[];
  total?: number;
  muestra: { tutor: string; alumno: string; saldo: number } | null;
}
export interface CmnMensajeDto {
  id: number; batch: string; t: string; to: string; canal: CmnCanal;
  asunto: string; estado: CmnEstado; by: string;
  /** Último error real del proveedor (vacío si no hubo). */
  error?: string; intentos?: number;
}
export type CmnEstado = 'En cola' | 'Enviando' | 'Entregado' | 'Fallido' | 'Canal no configurado';
/** Config de canales de comunicación (SisConfig 'canales'). La contraseña SMTP nunca se devuelve: solo passSet. */
export interface CmnCanalesCfg {
  email: { activo: boolean; host: string; port: number; user: string; passSet: boolean; from: string; fuente: 'bd' | 'env' };
  sms: { activo: false; soportado: false }; whatsapp: { activo: false; soportado: false }; push: { activo: false; soportado: false };
  demo: boolean; demoDisponible: boolean;
}
export interface CmnCanalesInput { email?: { activo?: boolean; host?: string; port?: number; user?: string; pass?: string; from?: string }; demo?: boolean }
export interface CmnEnviarReq extends CmnFiltro { canales: CmnCanal[]; asunto: string; mensaje: string }
export interface CmnEnviarRes { batch: string; total: number; enCola: number; sinCanal: number }

export interface DashboardData {
  fecha: string; ciclo: string;
  recaudoEfectivo: number; recaudoBanco: number; morosidad: number; proyeccionCiclo: number;
  matricula: number; inscripcionesMes: number;
  asistenciaIncidencias: number; asistenciaPresentes: number; asistenciaSinMarcar: number; asistenciaSeccion: string;
  becasPendientes: number; alumnosEnMora: number; stockBajo: number; ecfCargado: boolean;
  /** Estado de cada secuencia NCF configurada (consumo real vs rango autorizado). */
  ncf: { pref: string; tipo: string; estado: 'Vigente' | 'Por agotar' | 'Agotada' | 'Vencida' | 'Por vencer'; restantes: number; total: number; modalidad?: 'FISICA' | 'ELECTRONICA'; vence?: string | null; diasParaVencer?: number | null }[];
  /** Tipos de comprobante emitibles desde Cobros (CREDITO_FISCAL, CONSUMO...) sin ninguna secuencia disponible en su modalidad configurada. */
  ncfSinSecuencia?: string[];
  barras: { m: string; v: number }[];
  /** Fase 2D: solo cuando el Centro de Control muestra un ciclo NO activo (selector de ciclo). `historico` = ciclo cerrado: morosidad = saldo pendiente historico del ciclo,
   *  proyeccion = lo contratado, asistencia = acumulado del ciclo, sin alertas operativas (NCF/stock/e-CF). `mesRef` = mes que representan "Recaudo del mes" y la ultima barra. */
  historico?: boolean; cicloEstado?: string; mesRef?: string;
}
