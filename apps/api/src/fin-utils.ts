import { prisma } from './db';

// La autorización de supervisor vive en lib/supervisor.ts (PIN hasheado en SisConfig, tokens de un solo uso).
export { supervisorOk } from './lib/supervisor';

/** Devuelve el valor actual del contador y lo incrementa. */
export async function nextSeq(key: string, start: number) {
  const c = await prisma.finCounter.upsert({ where: { key }, update: {}, create: { key, value: start } });
  await prisma.finCounter.update({ where: { key }, data: { value: c.value + 1 } });
  return c.value;
}

export const nowHM = () => new Date().toTimeString().slice(0, 5);
export const round2 = (n: number) => Math.round(n * 100) / 100;
