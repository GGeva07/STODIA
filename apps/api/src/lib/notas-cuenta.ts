import type { ExpCuentaNota, ExpNotaMov } from '@stodia/shared';
import { prisma } from '../db';
import { partesEnZona, round2 } from './cxc';

/**
 * NOTAS EN EL ESTADO DE CUENTA. Cruza los cargos de la cuenta con las lineas de notas fiscales (NotaFiscalLinea.cobroItemId):
 *  - NC con «volver a cobrar» (efecto ReabreCargo): el cargo ya vuelve a paid=false en la emision (lib/notas.ts), asi que cuenta como deuda; aqui se
 *    marca `reabierto` para mostrarlo como «Pendiente de cobro» y ligar el recibo original acreditado.
 *  - NC sin reabrir (Ajuste/Devolucion): el cargo sigue pagado; se marca `acreditado` (devolucion definitiva) y NO vuelve a la deuda.
 *  - ND: el cargo nuevo (tipo 'nd') muestra la nota que lo origino.
 * Solo lectura: no cambia ningun saldo.
 */
const ETQ: Record<string, string> = { ReabreCargo: 'Pendiente de cobro', Devolucion: 'Devolución', Ajuste: 'Acreditado (sin volver a cobrar)', NuevoCargo: 'Cargo nuevo' };

export async function notasDeCuenta(cargos: { id: string; paid: boolean; monto: number }[], tz: string): Promise<{ porCargo: Map<string, ExpCuentaNota>; movimientos: ExpNotaMov[] }> {
  const porCargo = new Map<string, ExpCuentaNota>(), movimientos: ExpNotaMov[] = [];
  if (!cargos.length) return { porCargo, movimientos };
  const lineas = await prisma.notaFiscalLinea.findMany({
    where: { cobroItemId: { in: cargos.map(c => c.id) }, nota: { estado: { not: 'Anulada' } } },
    include: { nota: { select: { id: true, ncf: true, clase: true, reciboId: true, monto: true, createdAt: true, motivo: { select: { nombre: true } } } } },
    orderBy: { id: 'asc' },
  });
  const sumAc = new Map<string, number>();
  for (const l of lineas) {
    const c = cargos.find(x => x.id === l.cobroItemId)!, n = l.nota, clase = n.clase as 'CREDITO' | 'DEBITO';
    if (l.efecto === 'Ajuste' || l.efecto === 'Devolucion') sumAc.set(c.id, round2((sumAc.get(c.id) ?? 0) + l.monto));
    const reabierto = l.efecto === 'ReabreCargo' && !c.paid;
    // la nota MAS RECIENTE manda; un cargo reabierto que ya se volvio a pagar deja de ser «pendiente de cobro»
    porCargo.set(c.id, { nota: n.id, ncf: n.ncf, clase, recibo: n.reciboId, reabierto, acreditado: l.efecto === 'Ajuste' || l.efecto === 'Devolucion', montoAcreditado: 0 });
  }
  for (const [id, v] of porCargo) { v.montoAcreditado = sumAc.get(id) ?? 0; if (v.reabierto) v.acreditado = false; }
  const porNota = new Map<string, ExpNotaMov>();
  const p = (d: Date) => { const x = partesEnZona(tz, d); return `${String(x.d).padStart(2, '0')}/${String(x.m).padStart(2, '0')}/${x.y}`; };
  for (const l of lineas) {
    const n = l.nota;
    const m = porNota.get(n.id) ?? { id: n.id, ncf: n.ncf, clase: n.clase as 'CREDITO' | 'DEBITO', recibo: n.reciboId, fecha: p(n.createdAt), monto: n.monto, motivo: n.motivo.nombre, efecto: '', lineas: [] };
    m.lineas.push({ concepto: l.concepto, monto: l.monto, efecto: ETQ[l.efecto] ?? l.efecto });
    porNota.set(n.id, m);
  }
  for (const m of porNota.values()) {
    const efs = new Set(m.lineas.map(x => x.efecto));
    m.efecto = m.clase === 'DEBITO' ? 'Nota de débito · cargo nuevo' : efs.has(ETQ.ReabreCargo) ? 'Nota de crédito · pendiente de cobro' : 'Nota de crédito · acreditado (devolución definitiva)';
    movimientos.push(m);
  }
  movimientos.sort((a, b) => b.id.localeCompare(a.id));
  return { porCargo, movimientos };
}
