import type { CobroPago } from '@stodia/shared';
import { prisma } from '../db';

/** Linea de un recibo (JSON FinRecibo.items). cobroItemId = FinCobroItem que se cobro; ausente en lineas historicas sin cargo en cartera. */
export interface LineaRecibo { con: string; monto: number; cobroItemId?: string }

export const parseItems = (json: string): LineaRecibo[] => { try { const l = JSON.parse(json) as LineaRecibo[]; return Array.isArray(l) ? l : []; } catch { return []; } };
export const parsePays = (json: string): CobroPago[] => { try { const l = JSON.parse(json) as CobroPago[]; return Array.isArray(l) ? l : []; } catch { return []; } };

/**
 * Metodo del recibo, DERIVADO de los pagos (no se guarda): un pago = su medio (las tarjetas se muestran como «Tarjeta»), varios = «Mixto».
 * `pays[].m` guarda siempre el nombre EXACTO del catalogo metodosPago.
 */
export function metodoDe(pays: CobroPago[]): string {
  if (pays.length > 1) return 'Mixto';
  const m = pays[0]?.m ?? '';
  return m.startsWith('Tarjeta') ? 'Tarjeta' : m;
}
/** Cobrado integramente en efectivo (el resto del recaudo cuenta como banco/tarjeta/transferencia/cheque). */
export const esEfectivo = (pays: CobroPago[]) => pays.length === 1 && pays[0].m === 'Efectivo';

/** Caja (id del catalogo cajas) asignada al usuario segun el catalogo staff (por usuario o, si no, por nombre). NULL si no tiene caja. */
export async function cajaDe(user: { usuario: string; nombre: string }): Promise<string | null> {
  const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
  const rows = await prisma.catalogo.findMany({ where: { tipo: 'staff', estado: 'Activo' } });
  for (const r of rows) {
    const d = JSON.parse(r.data) as { usuario?: string; nombre?: string; caja?: string };
    if (d.caja && (norm(d.usuario ?? '') === norm(user.usuario) || norm(d.nombre ?? '') === norm(user.nombre))) return d.caja;
  }
  return null;
}

/** Nombre EXACTO del catalogo metodosPago para lo que envia un cliente ('Tarjeta' -> 'Tarjeta de Crédito'). Sin coincidencia devuelve el texto tal cual. */
export async function metodoCatalogo(pay: string): Promise<string> {
  const rows = await prisma.catalogo.findMany({ where: { tipo: 'metodosPago', estado: 'Activo' }, orderBy: { id: 'asc' } });
  const nombres = rows.map(r => String((JSON.parse(r.data) as { nombre?: string }).nombre ?? ''));
  return nombres.find(n => n === pay) ?? nombres.find(n => n.toLowerCase().startsWith(pay.toLowerCase())) ?? pay;
}
