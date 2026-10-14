import { Fragment, useEffect, useState } from 'react';
import type { InformeCelda, InformeColumna, InformeTabla } from '@stodia/shared';
import { btn, card, td, th } from '../../components/system/styles';
import { celdaTxt } from '../../components/finanzas/printInformes';

const alin = (c: InformeColumna) => (c.tipo === 'texto' || c.tipo === 'fecha' ? 'text-left' : 'whitespace-nowrap text-right font-mono');

function Filas({ cols, filas, ancho }: { cols: InformeColumna[]; filas: InformeCelda[][]; ancho?: number }) {
  return (
    <table className="w-full border-collapse text-[12px]" style={ancho ? { minWidth: ancho } : undefined}>
      <thead><tr>{cols.map(c => <th key={c.id} className={`${th} ${c.tipo === 'texto' || c.tipo === 'fecha' ? '' : '!text-right'}`}>{c.titulo}</th>)}</tr></thead>
      <tbody>{filas.map((f, i) => <tr key={i} className="h-8 hover:bg-slate-50">{cols.map((c, ci) => <td key={c.id} className={`${td} ${alin(c)} ${ci === 0 ? 'whitespace-nowrap' : ''}`}>{celdaTxt(f[ci], c, false)}</td>)}</tr>)}</tbody>
    </table>
  );
}

/** Tabla de un informe: totales del conjunto completo, detalle expandible por fila y paginación en el servidor (`onPage`). */
export default function TablaInforme({ t, onPage, cargando }: { t: InformeTabla; onPage: (page: number) => void; cargando?: boolean }) {
  const [abiertas, setAbiertas] = useState<Set<number>>(new Set());
  useEffect(() => { setAbiertas(new Set()); }, [t.filas]);
  const cols = t.columnas, det = t.detalle;
  const paginas = Math.max(1, Math.ceil(t.total / Math.max(1, t.size)));
  const desde = t.total ? (t.page - 1) * t.size + 1 : 0, hasta = Math.min(t.total, (t.page - 1) * t.size + t.filas.length);
  const alternar = (i: number) => setAbiertas(s => { const n = new Set(s); if (n.has(i)) n.delete(i); else n.add(i); return n; });
  return (
    <section className={`${card} overflow-hidden`} aria-label={t.titulo}>
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 px-4 py-2.5">
        <h3 className="m-0 text-sm font-semibold">{t.titulo}</h3>
        <span className="text-xs text-slate-500">{t.total.toLocaleString('en-US')} {t.total === 1 ? 'fila' : 'filas'}</span>
      </div>
      {t.filas.length === 0 && !t.totales ? (
        <div className="px-4 py-6 text-center text-[13px] text-slate-500">{t.vacio ?? 'Sin datos con estos filtros.'}</div>
      ) : (
        <div className={`overflow-x-auto ${cargando ? 'opacity-60' : ''}`}>
          <table className="w-full border-collapse text-[12px]" style={{ minWidth: Math.max(480, cols.length * 96) }}>
            <thead><tr>
              {det && <th className={`${th} w-8`} aria-label="Detalle" />}
              {cols.map(c => <th key={c.id} className={`${th} ${c.tipo === 'texto' || c.tipo === 'fecha' ? '' : '!text-right'}`}>{c.titulo}</th>)}
            </tr></thead>
            <tbody>
              {t.filas.map((f, i) => {
                const abierta = abiertas.has(i), d = det?.porFila[i] ?? [];
                return (
                  <Fragment key={i}>
                    <tr className="h-9 hover:bg-slate-50">
                      {det && (
                        <td className={`${td} w-8 text-center`}>
                          <button type="button" onClick={() => alternar(i)} disabled={!d.length} aria-expanded={abierta} aria-label={abierta ? 'Ocultar detalle' : 'Ver detalle'} className="grid h-6 w-6 cursor-pointer place-items-center rounded border-0 bg-transparent text-slate-500 hover:bg-slate-200 disabled:cursor-default disabled:opacity-30">
                            <i className={`ph ${abierta ? 'ph-caret-down' : 'ph-caret-right'}`} />
                          </button>
                        </td>
                      )}
                      {cols.map((c, ci) => <td key={c.id} className={`${td} ${alin(c)} ${ci < 2 && c.tipo === 'texto' ? 'whitespace-nowrap' : ''}`}>{celdaTxt(f[ci], c)}</td>)}
                    </tr>
                    {abierta && det && (
                      <tr>
                        <td colSpan={cols.length + 1} className="border-b border-slate-100 bg-slate-50 px-4 py-3">
                          <div className="mb-1.5 text-[11px] font-semibold uppercase tracking-[0.04em] text-slate-500">{det.titulo}</div>
                          <div className="overflow-x-auto rounded-md border border-slate-200 bg-white"><Filas cols={det.columnas} filas={d} ancho={420} /></div>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
            {t.totales && (
              <tfoot><tr className="h-9 bg-slate-50 font-semibold">
                {det && <td className="border-t border-slate-300" />}
                {cols.map((c, ci) => <td key={c.id} className={`border-t border-slate-300 px-3 ${alin(c)}`}>{celdaTxt(t.totales![ci], c)}</td>)}
              </tr></tfoot>
            )}
          </table>
        </div>
      )}
      {t.paginable && t.total > t.size && (
        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-200 px-4 py-2 text-xs text-slate-600">
          <span>Mostrando {desde.toLocaleString('en-US')}–{hasta.toLocaleString('en-US')} de {t.total.toLocaleString('en-US')}</span>
          <div className="flex items-center gap-2">
            <button type="button" className={btn} disabled={t.page <= 1 || cargando} onClick={() => onPage(t.page - 1)}><i className="ph ph-caret-left" />Anterior</button>
            <span>Página {t.page} de {paginas}</span>
            <button type="button" className={btn} disabled={t.page >= paginas || cargando} onClick={() => onPage(t.page + 1)}>Siguiente<i className="ph ph-caret-right" /></button>
          </div>
        </div>
      )}
    </section>
  );
}
