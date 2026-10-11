import { prisma } from './db';

// La autorización de supervisor vive en lib/supervisor.ts (PIN hasheado en SisConfig, tokens de un solo uso).
export { supervisorOk } from './lib/supervisor';

const esSqlServer = () => (process.env.DATABASE_URL ?? '').startsWith('sqlserver:');
/**
 * Devuelve el valor actual del contador y lo incrementa, de forma ATOMICA (un solo UPDATE ... OUTPUT / RETURNING: dos peticiones concurrentes nunca reciben el mismo valor).
 * Si el contador no existe arranca en 1 (el seed de demo siembra rec=418, etc.). Los NCF/e-NCF ya NO usan contadores: ver lib/fiscal.asignarNcf (SecuenciaFiscal). El 2º parametro
 * se ignora y queda solo por compatibilidad.
 */
export async function nextSeq(key: string, _legacyStart?: number): Promise<number> {
  for (let intento = 0; intento < 4; intento++) {
    const rows = esSqlServer()
      ? await prisma.$queryRawUnsafe<{ value: number | bigint }[]>('UPDATE [dbo].[FinCounter] SET [value] = [value] + 1 OUTPUT deleted.[value] AS [value] WHERE [key] = @P1', key)
      : await prisma.$queryRawUnsafe<{ value: number | bigint }[]>('UPDATE "FinCounter" SET "value" = "value" + 1 WHERE "key" = ? RETURNING "value" - 1 AS "value"', key);
    if (rows.length) return Number(rows[0].value);
    try { await prisma.finCounter.create({ data: { key, value: 1 } }); } catch { /* otra peticion lo creo primero: se reintenta el UPDATE */ }
  }
  throw new Error('No se pudo obtener el siguiente número del contador ' + key);
}

export const nowHM = () => new Date().toTimeString().slice(0, 5);
export const round2 = (n: number) => Math.round(n * 100) / 100;
