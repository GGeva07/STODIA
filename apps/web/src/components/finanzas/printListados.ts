import type { ProductoFin, ReciboListaFila } from '@stodia/shared';
import { B, hoyDMY, type PDoc } from './print';
import { fmt } from './fin';

export type InvModo = 'detallado' | 'resumen' | 'ambos';
const n0 = (n: number) => n.toLocaleString('en-US');

/** Reporte Carta del inventario: detallado (por artículo), resumen por tipo o ambos. `filtro` se indica en el subtítulo. */
export function docInventario(prods: ProductoFin[], modo: InvModo, filtro = ''): PDoc {
  const val = (p: ProductoFin) => (p.stock ?? 0) * p.price;
  const sub = `Al ${hoyDMY()}${filtro ? ' · ' + filtro : ''}`;
  const pages: PDoc['pages'] = [];
  if (modo !== 'resumen') {
    const tot = prods.reduce((s, p) => s + val(p), 0);
    pages.push({
      title: 'Inventario detallado', sub: `${sub} · ${n0(prods.length)} artículos`,
      blocks: [
        B.table(['Código', 'Artículo', 'Tipo', 'Existencia', 'Precio', 'Valor'],
          prods.map(p => [p.code, p.name, p.cat, p.stock == null ? '∞' : n0(p.stock), fmt(p.price), p.stock == null ? '—' : fmt(val(p))]),
          ['auto', '1fr', 'auto', 'auto', 'auto', 'auto'], ['left', 'left', 'left', 'right', 'right', 'right']),
        B.total([['VALOR TOTAL DEL INVENTARIO', fmt(tot), true]]),
        B.text('Los artículos de existencia ilimitada (∞), como los servicios, no suman al valor.'),
      ],
    });
  }
  if (modo !== 'detallado') {
    const g = new Map<string, { n: number; u: number; v: number }>();
    for (const p of prods) { const x = g.get(p.cat) ?? { n: 0, u: 0, v: 0 }; x.n++; x.u += p.stock ?? 0; x.v += val(p); g.set(p.cat, x); }
    const rows = [...g.entries()].sort((a, b) => a[0].localeCompare(b[0]));
    pages.push({
      title: 'Inventario · resumen por tipo', sub,
      blocks: [
        B.table(['Tipo', 'Artículos', 'Unidades', 'Valor total'], rows.map(([c, x]) => [c, n0(x.n), n0(x.u), fmt(x.v)]), ['1fr', 'auto', 'auto', 'auto'], ['left', 'right', 'right', 'right']),
        B.total([['TOTAL ARTÍCULOS', n0(prods.length)], ['TOTAL UNIDADES', n0(rows.reduce((s, [, x]) => s + x.u, 0))], ['VALOR TOTAL GENERAL', fmt(rows.reduce((s, [, x]) => s + x.v, 0)), true]]),
      ],
    });
  }
  return { kind: 'carta', name: 'Inventario', file: `inventario_${modo}_${new Date().toISOString().slice(0, 10)}.pdf`, format: 'Carta 8.5 × 11 in', sign: [], pages };
}

/** Reporte Carta del historial de recibos (todas las filas del filtro). `suma` = neto de notas sin anulados, como el pie del historial. */
export function docRecibos(rows: ReciboListaFila[], suma: number, filtro: string, ciclo = ''): PDoc {
  const an = rows.filter(r => r.est === 'Anulado').length;
  return {
    kind: 'carta', name: 'Historial de recibos', file: `recibos_${new Date().toISOString().slice(0, 10)}.pdf`, format: 'Carta 8.5 × 11 in', sign: [],
    pages: [{
      title: 'Historial de recibos', sub: `${ciclo ? 'Ciclo ' + ciclo + ' · ' : ''}${filtro} · ${n0(rows.length)} recibos`,
      blocks: [
        B.table(['Recibo', 'Fecha', 'Monto', 'NCF', 'A nombre de', 'Hecho por', 'Estado'],
          rows.map(r => [r.id, r.fecha, fmt(r.monto), r.ncf, r.tutor, r.cajero, r.est === 'Anulado' ? 'Anulado' : (r.acreditado ?? 0) > 0 ? 'Con N/C' : 'Activo']),
          ['auto', 'auto', 'auto', 'auto', '1fr', 'auto', 'auto'], ['left', 'left', 'right', 'left', 'left', 'left', 'left']),
        B.total([['RECIBOS', n0(rows.length)], ...(an ? [['ANULADOS (no suman)', n0(an)] as [string, string]] : []), ['TOTAL (neto de notas, sin anulados)', fmt(suma), true]]),
      ],
    }],
  };
}
