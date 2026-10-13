import type { DescuentoLinea } from '@stodia/shared';
import { estadoCuota, round2, venceISO } from './cxc';

/**
 * DESCUENTOS POR LINEA al cobrar: UNICA regla, usada por GET /cobros/cuenta (columna «Descuento» del POS) y POST /cobros/procesar (total cobrado y
 * FinReciboItem.descuento), de modo que lo que se muestra y lo que se cobra nunca difieren. El cajero elige UN modo por cobro:
 *   - 'pronto': PRONTO PAGO POR PLAN, por DIAS DE ANTICIPACION (simetrico a los dias de gracia de la mora: vencimiento + gracia → mora; vencimiento − N → descuento).
 *               Lo define el plan del contrato del alumno en el ciclo activo (FinPlan.data.pronto = %, FinPlan.data.prontoDias = N). Una cuota de colegiatura
 *               (tipo 'col') NO vencida califica si HOY <= (vencimiento de esa cuota − N dias). Vale igual para cuotas futuras (contra SU vencimiento).
 *               Sin plan, o plan con % = 0 o N = 0, NO hay descuento (el descuentoProntoPct global ya no se usa para calcular).
 *   - 'exo'   : exoneracion de mora (requiere clave de supervisor): el 100 % de cada recargo por mora (tipo 'mora').
 * Beca y plan de pago NO se calculan aqui: ya vienen dentro del `monto` del cargo (ver `incluidosDe`).
 */
export type ModoDescuento = 'pronto' | 'exo';
type ItemDesc = { tipo: string; monto: number; vence: string; est?: string };
/** Pronto pago de un plan: porcentaje y dias de anticipacion al vencimiento (1–60); null si el plan no lo ofrece. */
export interface ProntoPlan { pct: number; dias: number }

export function prontoDePlan(p: { pronto: number; prontoDias: number } | null | undefined): ProntoPlan | null {
  return p && p.pronto > 0 && p.pronto <= 100 && p.prontoDias >= 1 && p.prontoDias <= 60 ? { pct: p.pronto, dias: p.prontoDias } : null;
}

/** Fecha limite (AAAA-MM-DD) del pronto pago de una cuota: su vencimiento menos N dias. null si la fecha de vencimiento no es valida. */
export function limiteProntoPago(vence: string, dias: number): string | null {
  const v = venceISO(vence ?? '');
  if (!v) return null;
  return new Date(Date.parse(v + 'T00:00:00Z') - dias * 864e5).toISOString().slice(0, 10);
}

/** ¿Califica la cuota para el pronto pago de su plan HOY? Devuelve la fecha limite efectiva o null. */
export function calificaPronto(i: ItemDesc, plan: ProntoPlan | null, hoy: string): string | null {
  if (!plan || i.tipo !== 'col' || estadoCuota(i, hoy) === 'Vencida') return null;
  const lim = limiteProntoPago(i.vence, plan.dias);
  return lim && hoy <= lim ? lim : null;
}

const fmtDM = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;

export function descuentoLinea(i: ItemDesc, modo: ModoDescuento, plan: ProntoPlan | null, hoy: string): DescuentoLinea | null {
  if (modo === 'pronto') {
    if (!plan || !calificaPronto(i, plan, hoy)) return null;
    return { monto: round2(i.monto * (plan.pct / 100)), motivo: `Pronto pago ${plan.pct} %`, detalle: `hasta el ${fmtDM(limiteProntoPago(i.vence, plan.dias)!)} (${plan.dias} ${plan.dias === 1 ? 'día' : 'días'} antes del vencimiento)` };
  }
  if (i.tipo !== 'mora') return null;
  return { monto: round2(i.monto), motivo: 'Exoneración de mora' };
}

/** Descuentos que podrian aplicarse a la linea segun el modo elegido (para la cuenta); vacio si ninguno. */
export function descuentosAplicables(i: ItemDesc, plan: ProntoPlan | null, hoy: string): { pronto?: DescuentoLinea; exo?: DescuentoLinea } {
  const pronto = descuentoLinea(i, 'pronto', plan, hoy), exo = descuentoLinea(i, 'exo', plan, hoy);
  return { ...(pronto ? { pronto } : {}), ...(exo ? { exo } : {}) };
}
