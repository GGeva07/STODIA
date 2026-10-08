import type { CfgFinanzas, CfgAssets, CfgCiclo, CfgEcfInfo, CfgNcf, CfgPerfil, ScreenId } from '@stodia/shared';
import { prisma } from '../db';

/** Valores por defecto del tenant (CFG del prototipo). La BD (SisConfig) guarda solo lo modificado. */
export const CFG_DEFAULTS = {
  perfil: { nombre: 'Colegio Los Pinos, SRL', rnc: '1-31-55678-2', tel: '809-555-0100', dir: 'Av. Los Próceres #45, Santo Domingo', ciudad: 'Santo Domingo, D.N.' } as CfgPerfil,
  assets: { logo: true, fAcad: true, fFin: false } as CfgAssets,
  /** Una instalación nueva no trae secuencias, certificado ni ciclos: se configuran en Configuración (la demo los siembra en seed-finanzas). */
  ncf: [] as CfgNcf[],
  ecf: false,
  ecfInfo: {} as CfgEcfInfo,
  ciclos: [] as CfgCiclo[],
  /** Instalación nueva: todo en 0 (sin configurar) salvo el ITBIS legal; la demo siembra los valores de ejemplo. */
  finanzas: { matricula: 0, inscripcion: 0, itbis: 0.18, recargoMoraPct: 0, descuentoProntoPct: 0, diaCorte: 0 } as CfgFinanzas,
  /** Vacío = se usa ACCESS estático del front; se llena al editar la matriz de roles. */
  access: {} as Record<string, ScreenId[]>,
};
export type CfgKey = keyof typeof CFG_DEFAULTS;

export async function cfgGet<K extends CfgKey>(k: K): Promise<(typeof CFG_DEFAULTS)[K]> {
  const row = await prisma.sisConfig.findUnique({ where: { clave: k } });
  return row ? JSON.parse(row.valor) : CFG_DEFAULTS[k];
}
export async function cfgSet<K extends CfgKey>(k: K, v: (typeof CFG_DEFAULTS)[K]) {
  const valor = JSON.stringify(v);
  await prisma.sisConfig.upsert({ where: { clave: k }, update: { valor }, create: { clave: k, valor } });
}
