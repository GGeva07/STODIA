/** Tipos del grupo Sistema: licencia, configuración global y auditoría. Solo tipos. */
import type { Rol, ScreenId } from './index';

export type LicPlan = 'Básico' | 'Intermedio' | 'Avanzado';
export type LicEstado = 'valida' | 'por_vencer' | 'vencida' | 'invalida' | 'sin_licencia';
/** Estado efectivo de la licencia, derivado de la CLAVE FIRMADA del proveedor (solo lectura para el cliente). */
export interface LicenciaInfo {
  estado: LicEstado;
  /** Motivo legible cuando el estado no es válido (clave alterada, formato, etc.). */
  detalle?: string;
  plan: LicPlan | null;
  cliente: string | null;
  licId: string | null;
  emitida: string | null;
  vence: string | null;
  q: { alumnos: string; usuarios: string; campus: string };
  tier: number;
  features: LicFeature[];
  screens: ScreenId[];
  uso: { alumnos: number; usuarios: number; campus: number };
  expired: boolean;
  diasRestantes: number;
}
export interface LicFeature { id: string; label: string; cat: string; tier: number; on: boolean; incluido: boolean }

export interface CfgPerfil { nombre: string; rnc: string; tel: string; dir: string; email?: string; ciudad?: string; moneda?: string; zonaHoraria?: string;
  /** Cuentas bancarias / teléfono para que el tutor registre su pago cuando no hay pasarela (se muestra en el portal). */
  instruccionesPago?: string;
  /** Datos de la verificación del RNC en la DGII. Solo los escribe el instalador/servidor: PUT /config/perfil los ignora y los limpia si el RNC cambia. */
  razonSocial?: string; nombreComercial?: string; rncVerificado?: boolean; rncVerificadoAt?: string; rncEstado?: string }
/** Resultado de POST /config/perfil/verificar-rnc (la clave de la API de RNC nunca viaja). `guardado`: se actualizó el perfil (false al verificar un RNC aún no guardado). */
export interface ResultadoVerifRnc { estado: 'verificado' | 'inactivo' | 'no-existe' | 'sin-config' | 'no-disponible'; mensaje: string; rnc: string; razonSocial?: string; nombreComercial?: string; rncEstado?: string; guardado: boolean }
export interface VerifRncResp { perfil: CfgPerfil; resultado: ResultadoVerifRnc }
export interface CfgAssets { logo: boolean; fAcad: boolean; fFin: boolean }
/** Modalidad de un comprobante fiscal: NCF impreso (serie B) o comprobante fiscal electrónico e-CF (serie E). */
export type ModalidadFiscal = 'FISICA' | 'ELECTRONICA';
/** Tipo LÓGICO de comprobante que el POS pide; el servidor decide el prefijo (B01/E31...) según la modalidad configurada. */
export type TipoLogico = 'CREDITO_FISCAL' | 'CONSUMO' | 'GUBERNAMENTAL' | 'REGIMEN_ESPECIAL' | 'NOTA_DEBITO' | 'NOTA_CREDITO';
export type EstadoSecuencia = 'Activa' | 'Agotada' | 'Vencida' | 'Inactiva';
/** Estado del envío del e-NCF a la DGII. Un e-NCF queda PendienteEnvio hasta la integración final (docs/integracion-ecf.md). */
export type EstadoDgii = 'NoAplica' | 'PendienteEnvio' | 'Aceptado' | 'Rechazado' | 'Contingencia';
/**
 * Secuencia fiscal (autorización DGII). Forma COMPATIBLE con la antigua `CfgNcf` (pref, tipo, desde, hasta, umbral, act) más los campos del modelo SecuenciaFiscal.
 * `act` = próximo número a emitir (semántica histórica); `actual` = último usado.
 */
export interface CfgNcf {
  pref: string; tipo: string; desde: number; hasta: number; umbral: number; act?: number;
  id?: string; modalidad?: ModalidadFiscal; prefijo?: string; serie?: string; actual?: number; vence?: string | null; estado?: EstadoSecuencia;
  autorizacion?: string; tipoNombre?: string; usados?: number; disponibles?: number; total?: number; creadaPor?: string; createdAt?: string;
  /** Vence en 30 días o menos (calculado por la API). */
  venceProximo?: boolean;
}
/** Fila del catálogo fijo de tipos de comprobante (TipoComprobante). */
export interface TipoComprobanteDto {
  codigo: string; nombre: string; uso: string; modalidad: ModalidadFiscal; logico: TipoLogico | null; requiereRnc: boolean; nota: string;
}
/** Modalidad configurada por tipo lógico (SisConfig 'modalidadFiscal'). Por defecto todo FISICA. */
export type CfgModalidadFiscal = Record<TipoLogico, ModalidadFiscal>;
/** Alta de una autorización DGII (POST /config/fiscal/secuencias). */
export interface SecuenciaNuevaReq {
  tipo: string; modalidad: ModalidadFiscal; prefijo?: string; serie?: string; desde: number; hasta: number; actual?: number; vence?: string; autorizacion?: string; umbral?: number; pin: string;
}
export interface CfgEcfInfo { archivo?: string; vence?: string }
export interface CfgCiclo { n: string; estado: 'Activo' | 'Cerrado' | 'Planificado'; /** Fase 2D: el ciclo tiene datos (matriculas) y se puede consultar con el selector; un Planificado sin datos no es seleccionable. */ datos?: boolean }
/** Configuración financiera de la instancia (SisConfig 'finanzas'). 0 = sin configurar. itbis es fracción (0.18); porcentajes en %. */
export interface CfgFinanzas { matricula: number; inscripcion: number; itbis: number; recargoMoraPct: number; descuentoProntoPct: number; diaCorte: number;
  /** Monto (RD$) desde el cual una factura de CONSUMO exige identificar al comprador. A VALIDAR con contador/DGII (por defecto 250,000). */
  umbralConsumoIdentificado?: number;
  /** Notas de credito/debito: plazo maximo (dias desde la emision) para acreditar un recibo sin motivo escrito reforzado (por defecto 30; A VALIDAR con contador/DGII). 0 = sin plazo. */
  notaPlazoDias?: number;
  /** 1 = permite emitir notas de credito sobre recibos de un ciclo que ya no es el activo (y no esta Cerrado). Por defecto 0. */
  notaCicloAnterior?: number;
  /** Modalidad de la cuota de inscripcion: 'fija' (la cuota `inscripcion` para todos; por defecto) o 'plan' (la define el plan de pago elegido). */
  inscripcionModo?: 'fija' | 'plan' }
export interface ConfigGlobal {
  perfil: CfgPerfil;
  assets: CfgAssets;
  ncf: CfgNcf[];
  /** Modalidad (física/electrónica) por tipo lógico de comprobante. */
  modalidadFiscal: CfgModalidadFiscal;
  tiposComprobante: TipoComprobanteDto[];
  ecf: boolean;
  ecfInfo: CfgEcfInfo;
  ciclos: CfgCiclo[];
  finanzas: CfgFinanzas;
  /** Papelería abierta al público: si es false, Venta Rápida (kiosko) no está disponible. */
  papeleriaAbierta: boolean;
  access: Record<string, ScreenId[]>;
  rolesBase: Rol[];
}

export interface AuditoriaRow { id: string; t: string; usr: string; a: 'Insert' | 'Update' | 'Delete'; tabla: string; registro: string; prev: string; next: string; ip: string }
export interface AuditoriaList { rows: AuditoriaRow[]; total: number; count: number; users: string[] }
