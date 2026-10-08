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

export interface CfgPerfil { nombre: string; rnc: string; tel: string; dir: string; email?: string; ciudad?: string; moneda?: string; zonaHoraria?: string }
export interface CfgAssets { logo: boolean; fAcad: boolean; fFin: boolean }
export interface CfgNcf { pref: string; tipo: string; desde: number; hasta: number; umbral: number; act?: number }
export interface CfgEcfInfo { archivo?: string; vence?: string }
export interface CfgCiclo { n: string; estado: 'Activo' | 'Cerrado' | 'Planificado' }
export interface ConfigGlobal {
  perfil: CfgPerfil;
  assets: CfgAssets;
  ncf: CfgNcf[];
  ecf: boolean;
  ecfInfo: CfgEcfInfo;
  ciclos: CfgCiclo[];
  access: Record<string, ScreenId[]>;
  rolesBase: Rol[];
}

export interface AuditoriaRow { id: string; t: string; usr: string; a: 'Insert' | 'Update' | 'Delete'; tabla: string; registro: string; prev: string; next: string; ip: string }
export interface AuditoriaList { rows: AuditoriaRow[]; total: number; count: number; users: string[] }
