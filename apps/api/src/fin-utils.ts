import { prisma } from './db';
import { cfgGet } from './lib/sisconfig';

// La autorización de supervisor vive en lib/supervisor.ts (PIN hasheado en SisConfig, tokens de un solo uso).
export { supervisorOk } from './lib/supervisor';

/** Primer valor de un contador que aún no existe: el `act`/`desde` de la secuencia fiscal configurada (SisConfig ncf); 1 en el resto. */
async function seqStart(key: string): Promise<number> {
  const pref = ({ ncf: 'B02', b01: 'B01', nc: 'B04' } as Record<string, string>)[key];
  if (!pref) return 1;
  const s = (await cfgGet('ncf')).find(x => x.pref === pref);
  return s ? (s.act ?? s.desde) : 1;
}

/**
 * Devuelve el valor actual del contador y lo incrementa. Si el contador no existe arranca según la configuración de la instancia
 * (el seed de demo siembra rec=418, ncf=1881, etc.); el 2º parámetro se ignora y queda solo por compatibilidad.
 */
export async function nextSeq(key: string, _legacyStart?: number) {
  const c = await prisma.finCounter.upsert({ where: { key }, update: {}, create: { key, value: await seqStart(key) } });
  await prisma.finCounter.update({ where: { key }, data: { value: c.value + 1 } });
  return c.value;
}

export const nowHM = () => new Date().toTimeString().slice(0, 5);
export const round2 = (n: number) => Math.round(n * 100) / 100;
