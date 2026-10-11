import type { CfgFinanzas, CfgAssets, CfgEcfInfo, CfgModalidadFiscal, CfgNcf, CfgPerfil, ScreenId } from '@stodia/shared';
import { prisma } from '../db';

/** Valores por defecto del tenant (CFG del prototipo). La BD (SisConfig) guarda solo lo modificado. */
export const CFG_DEFAULTS = {
  perfil: { nombre: 'Colegio Los Pinos, SRL', rnc: '1-31-55678-2', tel: '809-555-0100', dir: 'Av. Los Próceres #45, Santo Domingo', ciudad: 'Santo Domingo, D.N.' } as CfgPerfil,
  assets: { logo: true, fAcad: true, fFin: false } as CfgAssets,
  /** Una instalación nueva no trae secuencias ni certificado: se configuran en Configuración (la demo los siembra en seed-finanzas). Los ciclos lectivos viven en la tabla Ciclo (lib/ciclo). */
  ncf: [] as CfgNcf[],
  /** LEGADO: las secuencias fiscales viven ahora en la tabla SecuenciaFiscal (lib/fiscal.ts). Esta clave solo la lee la migracion (scripts/fk-fiscal.ts). */
  ecf: false,
  /** Modalidad por tipo LOGICO de comprobante (FISICA = NCF serie B, ELECTRONICA = e-NCF serie E). Por defecto todo fisico. */
  modalidadFiscal: { CREDITO_FISCAL: 'FISICA', CONSUMO: 'FISICA', GUBERNAMENTAL: 'FISICA', REGIMEN_ESPECIAL: 'FISICA', NOTA_DEBITO: 'FISICA', NOTA_CREDITO: 'FISICA' } as CfgModalidadFiscal,
  ecfInfo: {} as CfgEcfInfo,
  /** Instalación nueva: todo en 0 (sin configurar) salvo el ITBIS legal; la demo siembra los valores de ejemplo. */
  finanzas: { matricula: 0, inscripcion: 0, itbis: 0.18, recargoMoraPct: 0, descuentoProntoPct: 0, diaCorte: 0, umbralConsumoIdentificado: 250000, notaPlazoDias: 30, notaCicloAnterior: 0 } as CfgFinanzas,
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
