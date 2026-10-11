import { ApiError } from '../../lib/api';

/** RD$ 1,234.00 (igual que `fmt` del prototipo). */
export const fmt = (n: number | string) =>
  'RD$ ' + Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** Tonos de estado del prototipo: [fondo, texto]. */
export const TONE = {
  ok: ['#DCFCE7', '#15803D'], warn: ['#FEF3C7', '#B45309'], bad: ['#FEE2E2', '#B91C1C'],
  info: ['#DBEAFE', '#1D4ED8'], mute: ['#F1F5F9', '#475569'],
} as const;

/** RNC (9 dígitos: 1-31-55678-2) o cédula (11: 001-0023940-1) con su formato habitual; otro largo se devuelve tal cual. */
export const fmtDoc = (v: string) => { const d = (v ?? '').replace(/D/g, ''); return d.length === 9 ? `${d[0]}-${d.slice(1, 3)}-${d.slice(3, 8)}-${d[8]}` : d.length === 11 ? `${d.slice(0, 3)}-${d.slice(3, 10)}-${d[10]}` : v; };
export const errMsg = (e: unknown) => (e instanceof ApiError || e instanceof Error ? e.message : 'Error inesperado');

export const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

/** Impresión simple: documento HTML en un iframe oculto + window.print(). */
export function printHtml(body: string, width = '80mm') {
  const f = document.createElement('iframe');
  f.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0';
  document.body.appendChild(f);
  const d = f.contentDocument!;
  d.open();
  d.write(`<html><head><title>Imprimir</title><style>
    @page{margin:6mm} body{font:12px 'JetBrains Mono',monospace;color:#000;width:${width};margin:0 auto}
    h1,h2{font-size:14px;text-align:center;margin:4px 0} .r{display:flex;justify-content:space-between;gap:8px}
    hr{border:0;border-top:1px dashed #000;margin:6px 0} table{width:100%;border-collapse:collapse} th,td{text-align:left;padding:2px 4px;font-size:11px}
  </style></head><body>${body}</body></html>`);
  d.close();
  f.contentWindow!.focus();
  f.contentWindow!.print();
  setTimeout(() => f.remove(), 2000);
}

const esc = (s: string) => s.replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c]!);

/** Tirilla de recibo/factura (docTirilla del prototipo, simplificado). */
export function printTirilla(d: {
  id: string; ncf: string; tutor: string; hora: string; monto: number;
  items: { con: string; monto: number }[]; pays: { m: string; r?: string; amt: number }[]; change: number; saldo?: number;
}) {
  const rows = (a: [string, string][]) => a.map(([k, v]) => `<div class="r"><span>${esc(k)}</span><span>${esc(v)}</span></div>`).join('');
  printHtml(
    `<h1>Colegio Los Pinos, SRL</h1><h2>${esc(d.id)}</h2>` +
      rows([['NCF', d.ncf], ['Cliente', d.tutor], ['Hora', d.hora]]) + '<hr>' +
      rows(d.items.map(i => [i.con, fmt(i.monto)])) + '<hr>' +
      rows(d.pays.map(p => [p.m + (p.r ? ' ' + p.r : ''), fmt(p.amt)])) +
      rows([['TOTAL', fmt(d.monto)]]) +
      (d.saldo ? rows([['Saldo pendiente', fmt(d.saldo)]]) : '') +
      (d.change > 0 ? rows([['Cambio', fmt(d.change)]]) : ''),
  );
}
