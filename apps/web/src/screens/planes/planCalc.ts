import type { PlanForm } from '@stodia/shared';
import { fmt } from '../../components/finanzas/fin';

export const MN: Record<number, string> = { 1: 'Enero', 2: 'Febrero', 3: 'Marzo', 4: 'Abril', 5: 'Mayo', 6: 'Junio', 7: 'Julio', 8: 'Agosto', 9: 'Septiembre', 10: 'Octubre', 11: 'Noviembre', 12: 'Diciembre' };
export const TANDAS = ['Matutina', 'Vespertina', 'Extendida', 'Nocturna'];
export const FREQ_L: Record<string, string> = { '1': 'mensual', '2': 'bimestral', '3': 'trimestral', '0': 'pago único' };

/** planCalc del prototipo (L2459). */
export function planCalc(f: PlanForm) {
  const n = Math.max(0, parseInt(f.n) || 0), anual = parseFloat(f.anual) || 0, desc = Math.min(100, parseFloat(f.desc) || 0);
  const total = Math.round(anual * (1 - desc / 100) * 100) / 100, cuota = n ? Math.round((total / n) * 100) / 100 : 0;
  const step = f.freq === '0' ? 0 : Number(f.freq), dia = String(Math.min(28, Math.max(1, parseInt(f.dia) || 1))).padStart(2, '0');
  const sched: { n: number; mes: string; fecha: string; montoF: string }[] = [];
  let m = Number(f.start), y = m >= 7 ? 2026 : 2027;
  for (let i = 0; i < Math.min(n, 12); i++) {
    sched.push({ n: i + 1, mes: MN[m] + ' ' + y, fecha: dia + '/' + String(m).padStart(2, '0') + '/' + y, montoF: fmt(cuota) });
    m += step || 1;
    if (m > 12) { m -= 12; y++; }
  }
  const tandas = f.porTanda
    ? TANDAS.map(t => {
        const a = parseFloat(f.tm?.[t] ?? '') || 0;
        const tt = Math.round(a * (1 - desc / 100) * 100) / 100;
        return { l: t, a, total: tt, cuota: n ? Math.round((tt / n) * 100) / 100 : 0 };
      })
    : null;
  return { n, anual, desc, total, cuota, sched, tandas };
}

export const moraLbl = (f: PlanForm) =>
  f.moraTipo === 'pct' ? `${f.moraVal}% mensual · ${f.gracia} d gracia` : f.moraTipo === 'fijo' ? `${fmt(f.moraVal)}/día · ${f.gracia} d gracia` : 'Sin recargo';

export const EMPTY_PLAN: PlanForm = {
  porTanda: false, tm: { Matutina: '85000', Vespertina: '85000', Extendida: '85000', Nocturna: '85000' }, name: '', freq: '1', n: '10',
  anual: '85000', desc: '0', start: '8', dia: '1', gracia: '5', moraTipo: 'pct', moraVal: '3', pronto: '0', prontoDia: '3', estado: 'Activo',
};
