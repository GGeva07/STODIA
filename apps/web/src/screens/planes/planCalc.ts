import type { PlanForm } from '@stodia/shared';
import { fmt } from '../../components/finanzas/fin';

export const MN: Record<number, string> = { 1: 'Enero', 2: 'Febrero', 3: 'Marzo', 4: 'Abril', 5: 'Mayo', 6: 'Junio', 7: 'Julio', 8: 'Agosto', 9: 'Septiembre', 10: 'Octubre', 11: 'Noviembre', 12: 'Diciembre' };
export const FREQ_L: Record<string, string> = { '1': 'mensual', '2': 'bimestral', '3': 'trimestral', '0': 'pago único' };

/** planCalc del prototipo (L2459). */
/** `tandasLista`: tandas del catálogo (si no se pasa, las que ya tiene el plan en `tm`). `ciclo0`: año de inicio del ciclo activo (Configuración). */
export function planCalc(f: PlanForm, tandasLista?: string[], ciclo0?: number) {
  const n = Math.max(0, parseInt(f.n) || 0), anual = parseFloat(f.anual) || 0, desc = Math.min(100, parseFloat(f.desc) || 0);
  const total = Math.round(anual * (1 - desc / 100) * 100) / 100, cuota = n ? Math.round((total / n) * 100) / 100 : 0;
  const step = f.freq === '0' ? 0 : Number(f.freq), dia = String(Math.min(28, Math.max(1, parseInt(f.dia) || 1))).padStart(2, '0');
  const sched: { n: number; mes: string; fecha: string; montoF: string }[] = [];
  const base = ciclo0 ?? new Date().getFullYear();
  let m = Number(f.start), y = m >= 7 ? base : base + 1;
  for (let i = 0; i < Math.min(n, 12); i++) {
    sched.push({ n: i + 1, mes: MN[m] + ' ' + y, fecha: dia + '/' + String(m).padStart(2, '0') + '/' + y, montoF: fmt(cuota) });
    m += step || 1;
    if (m > 12) { m -= 12; y++; }
  }
  const tandas = f.porTanda
    ? (tandasLista ?? Object.keys(f.tm ?? {})).map(t => {
        const a = parseFloat(f.tm?.[t] ?? '') || 0;
        const tt = Math.round(a * (1 - desc / 100) * 100) / 100;
        return { l: t, a, total: tt, cuota: n ? Math.round((tt / n) * 100) / 100 : 0 };
      })
    : null;
  return { n, anual, desc, total, cuota, sched, tandas };
}

export const moraLbl = (f: PlanForm) =>
  f.moraTipo === 'pct' ? `${f.moraVal}% mensual · ${f.gracia} d gracia` : f.moraTipo === 'fijo' ? `${fmt(f.moraVal)}/día · ${f.gracia} d gracia` : 'Sin recargo';

export const emptyPlan = (moraPct = 0): PlanForm => ({
  porTanda: false, tm: {}, name: '', freq: '1', n: '10',
  anual: '', desc: '0', start: '8', dia: '1', gracia: '5', moraTipo: 'pct', moraVal: String(moraPct), pronto: '0', prontoDia: '3', estado: 'Activo',
});
