/**
 * MONEDERO UNICO del alumno (Fase 2C): Monedero (saldo + limite diario) y MonederoMovimiento (cada recarga / consumo / ajuste). Reemplaza MobWallet +
 * ComCarnet.wallet/limit/spent (dos fuentes de saldo que el codigo sincronizaba a mano). El consumo del dia se CALCULA con los movimientos de hoy.
 */
import type { Prisma } from '@prisma/client';
import { prisma } from '../db';
import { partesEnZona, zonaHoraria } from './cxc';

type Db = typeof prisma | Prisma.TransactionClient;
export type TipoMovimiento = 'Recarga' | 'Consumo' | 'Ajuste';
export class SaldoInsuficiente extends Error { constructor() { super('Saldo insuficiente en monedero'); } }

/**
 * Registra un movimiento y actualiza el saldo de forma atomica. `monto` es la magnitud (> 0): Recarga suma, Consumo resta (falla con SaldoInsuficiente si
 * no alcanza) y Ajuste suma (usa `signo = -1` para restar). Crea el monedero (limite 200) si el alumno aun no tiene.
 */
export async function movimientoMonedero(db: Db, alumnoId: string, tipo: TipoMovimiento, monto: number, concepto = '', intencionId?: string, signo: 1 | -1 = 1): Promise<number> {
  const delta = (tipo === 'Consumo' ? -1 : signo) * Math.abs(monto);
  const hacer = async (tx: Db) => {
    if (!(await tx.monedero.findUnique({ where: { alumnoId }, select: { alumnoId: true } }))) await tx.monedero.create({ data: { alumnoId, saldo: 0, limite: 200 } });
    if (delta < 0) {
      const r = await tx.monedero.updateMany({ where: { alumnoId, saldo: { gte: -delta } }, data: { saldo: { decrement: -delta } } });
      if (!r.count) throw new SaldoInsuficiente();
    } else await tx.monedero.update({ where: { alumnoId }, data: { saldo: { increment: delta } } });
    const saldo = (await tx.monedero.findUniqueOrThrow({ where: { alumnoId } })).saldo;
    await tx.monederoMovimiento.create({ data: { alumnoId, tipo, monto: delta, saldoDespues: saldo, concepto, intencionId: intencionId ?? null } });
    return saldo;
  };
  return '$transaction' in db ? (db as typeof prisma).$transaction(hacer) : hacer(db);
}

/** Instante UTC en que empieza el dia de hoy en la zona horaria de la institucion. */
export async function inicioDeHoy(): Promise<Date> {
  const tz = await zonaHoraria(), { y, m, d } = partesEnZona(tz);
  const guess = Date.UTC(y, m - 1, d);
  const off = (t: number) => {
    const p = Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone: tz, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' }).formatToParts(new Date(t)).map(x => [x.type, x.value]));
    return Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second) - Math.floor(t / 1000) * 1000;
  };
  return new Date(guess - off(guess - off(guess)));
}
/** Consumo de hoy (positivo) por alumno: suma de los movimientos de tipo Consumo desde el inicio del dia. */
export async function consumoHoy(alumnoIds: string[], db: Db = prisma): Promise<Map<string, number>> {
  const desde = await inicioDeHoy(), out = new Map<string, number>();
  for (let i = 0; i < alumnoIds.length; i += 800) {
    for (const g of await db.monederoMovimiento.groupBy({ by: ['alumnoId'], where: { alumnoId: { in: alumnoIds.slice(i, i + 800) }, tipo: 'Consumo', creado: { gte: desde } }, _sum: { monto: true } })) out.set(g.alumnoId, Math.abs(g._sum.monto ?? 0));
  }
  return out;
}
