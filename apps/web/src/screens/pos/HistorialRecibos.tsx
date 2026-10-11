import { useCallback, useEffect, useRef, useState } from 'react';
import type { ReciboFin, ReciboListaRes } from '@stodia/shared';
import { api } from '../../lib/api';
import { Modal } from '../../components/system/UiProvider';
import { TONE, errMsg, fmt } from '../../components/finanzas/fin';
import { useCiclo } from '../../lib/ciclo';
import type { ToastTone } from '../../components/useToastStack';
import ReciboModal from './ReciboModal';

type Rango = 'todos' | 'hoy' | 'semana' | 'mes' | 'rango';
const SIZE = 25;
const iso = (d: Date) => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
function fechas(r: Rango, d1: string, d2: string): { desde: string; hasta: string } {
  const now = new Date();
  if (r === 'hoy') return { desde: iso(now), hasta: iso(now) };
  if (r === 'semana') { const lun = new Date(now); lun.setDate(now.getDate() - ((now.getDay() + 6) % 7)); return { desde: iso(lun), hasta: iso(now) }; }
  if (r === 'mes') return { desde: iso(new Date(now.getFullYear(), now.getMonth(), 1)), hasta: iso(now) };
  if (r === 'rango') return { desde: d1, hasta: d2 };
  return { desde: '', hasta: '' };
}
const COLS = 'grid-cols-[minmax(110px,0.9fr)_minmax(120px,0.9fr)_minmax(110px,0.9fr)_minmax(0,1.6fr)_minmax(0,1.1fr)]';

/** Modal «Historial de Recibos» del POS: listado paginado del ciclo elegido; al abrir un recibo se apila encima el MISMO modal que tras emitir (ReciboModal). */
export default function HistorialRecibos({ onClose, toast, initialQ = '' }: { onClose: () => void; toast: (msg: string, tone?: ToastTone) => void; initialQ?: string }) {
  const { cicloSeleccionado } = useCiclo();
  // Si el buscador del POS tenía texto al abrir el historial, el listado nace ya filtrado con ese texto (sin parpadeo de «todos»).
  const [q, setQ] = useState(initialQ.trim()), [qd, setQd] = useState(initialQ.trim());
  const [rango, setRango] = useState<Rango>('todos');
  const [d1, setD1] = useState(''), [d2, setD2] = useState('');
  const [mios, setMios] = useState(false);
  const [page, setPage] = useState(1);
  const [data, setData] = useState<ReciboListaRes | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');
  const [active, setActive] = useState(0);
  const [opening, setOpening] = useState('');
  const [recibo, setRecibo] = useState<ReciboFin | null>(null);
  const seq = useRef(0);
  const rowsRef = useRef<HTMLDivElement>(null);

  useEffect(() => { const t = setTimeout(() => { setQd(q.trim()); setPage(1); }, 300); return () => clearTimeout(t); }, [q]);

  const load = useCallback(async () => {
    const my = ++seq.current;
    setLoading(true); setErr('');
    const { desde, hasta } = fechas(rango, d1, d2);
    const qs = new URLSearchParams({ page: String(page), size: String(SIZE) });
    if (qd) qs.set('q', qd);
    if (desde) qs.set('desde', desde);
    if (hasta) qs.set('hasta', hasta);
    if (mios) qs.set('mios', '1');
    try {
      const r = await api.get<ReciboListaRes>('/cobros/recibos?' + qs.toString());
      if (my !== seq.current) return;
      setData(r); setActive(0);
    } catch (e) { if (my === seq.current) { setErr(errMsg(e)); setData(null); } } finally { if (my === seq.current) setLoading(false); }
  }, [qd, rango, d1, d2, mios, page, cicloSeleccionado]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { void load(); }, [load]);

  const abrir = async (id: string) => {
    if (opening) return;
    setOpening(id);
    try { setRecibo(await api.get<ReciboFin>('/cobros/recibos/' + encodeURIComponent(id))); } catch (e) { toast(errMsg(e), 'bad'); } finally { setOpening(''); }
  };

  const rows = data?.rows ?? [];
  const pages = Math.max(1, Math.ceil((data?.total ?? 0) / SIZE));
  const onKey = (e: React.KeyboardEvent) => {
    const t = e.target as HTMLElement;
    if (t.tagName === 'SELECT' || (t.tagName === 'INPUT' && (t as HTMLInputElement).type !== 'text')) return;
    if (e.key === 'ArrowDown') { e.preventDefault(); setActive(a => Math.min(rows.length - 1, a + 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive(a => Math.max(0, a - 1)); }
    else if (e.key === 'Enter' && rows[active] && !(t.tagName === 'BUTTON')) { e.preventDefault(); void abrir(rows[active].id); }
  };
  useEffect(() => { rowsRef.current?.querySelector('[data-active="true"]')?.scrollIntoView({ block: 'nearest' }); }, [active, rows]);

  const ctl = 'h-8 rounded-md border border-slate-300 bg-white px-2 text-xs outline-none focus:border-accent focus:ring-1 focus:ring-accent';
  return (
    <>
      <Modal width={1000} z={60} onClose={recibo ? undefined : onClose}>
        <div onKeyDown={onKey} className="flex max-h-[calc(100vh-40px)] flex-col" role="region" aria-label="Historial de recibos">
          <div className="flex items-center justify-between gap-3 border-b border-slate-200 px-5 py-3.5">
            <div>
              <div className="text-[15px] font-semibold"><i className="ph ph-receipt mr-1.5 align-[-2px]" />Historial de Recibos</div>
              <div className="text-xs text-slate-500">Ciclo {cicloSeleccionado || 'activo'} · Más recientes primero · Clic (o Enter) para ver el recibo</div>
            </div>
            <button onClick={onClose} aria-label="Cerrar" className="h-[34px] w-[34px] rounded-md border border-slate-300 bg-white"><i className="ph ph-x" /></button>
          </div>
          <div className="flex flex-wrap items-center gap-2 border-b border-slate-200 bg-slate-50 px-5 py-2.5">
            <div className="relative min-w-[220px] flex-1">
              <i className="ph ph-magnifying-glass pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
              <input autoFocus value={q} onChange={e => setQ(e.target.value)} placeholder="Buscar por recibo, NCF, nombre o cédula…" aria-label="Buscar recibos" className={`${ctl} w-full pl-8`} />
            </div>
            <select value={rango} onChange={e => { setRango(e.target.value as Rango); setPage(1); }} aria-label="Filtrar por fecha" className={ctl}>
              <option value="todos">Todas las fechas</option><option value="hoy">Hoy</option><option value="semana">Esta semana</option><option value="mes">Este mes</option><option value="rango">Rango…</option>
            </select>
            {rango === 'rango' && <>
              <input type="date" value={d1} max={d2 || undefined} onChange={e => { setD1(e.target.value); setPage(1); }} aria-label="Desde" className={ctl} />
              <span className="text-xs text-slate-400">a</span>
              <input type="date" value={d2} min={d1 || undefined} onChange={e => { setD2(e.target.value); setPage(1); }} aria-label="Hasta" className={ctl} />
            </>}
            <label className="flex cursor-pointer select-none items-center gap-1.5 text-xs font-medium text-slate-700"><input type="checkbox" checked={mios} onChange={e => { setMios(e.target.checked); setPage(1); }} />Solo mis recibos</label>
          </div>
          <div role="table" aria-label="Recibos" aria-rowcount={data?.total ?? 0} className="flex min-h-0 flex-1 flex-col">
            <div role="row" className={`grid ${COLS} gap-3 border-b border-slate-200 bg-white px-5 py-2 text-[11px] font-semibold uppercase tracking-wide text-slate-500`}>
              <span role="columnheader">Recibo</span><span role="columnheader" className="text-right">Monto facturado</span><span role="columnheader">Comprobante / NCF</span><span role="columnheader">A nombre de</span><span role="columnheader">Hecho por</span>
            </div>
            <div ref={rowsRef} className="min-h-[200px] flex-1 overflow-auto" style={{ opacity: loading && data ? 0.55 : 1 }} aria-busy={loading}>
              {loading && !data && <div className="grid h-[200px] place-items-center text-sm text-slate-500"><span><i className="ph ph-circle-notch mr-2" style={{ animation: 'spin 0.8s linear infinite' }} />Cargando recibos…</span></div>}
              {err && <div role="alert" className="m-5 flex items-center justify-between gap-3 rounded-md border border-red-200 bg-bad-bg px-3 py-2.5 text-[13px] text-bad-fg"><span><i className="ph ph-warning mr-1.5" />{err}</span><button onClick={() => void load()} className="h-7 rounded border border-red-300 bg-white px-2.5 text-xs font-medium">Reintentar</button></div>}
              {!loading && !err && rows.length === 0 && <div className="grid h-[200px] place-items-center px-6 text-center text-sm text-slate-500"><span><i className="ph ph-receipt mb-1 block text-3xl text-slate-300" />{qd ? <>Ningún recibo coincide con «<b className="font-mono">{qd}</b>».</> : rango !== 'todos' || mios ? 'Ningún recibo coincide con los filtros.' : 'Aún no hay recibos en este ciclo.'}{qd && <button onClick={() => { setQ(''); setQd(''); setPage(1); }} className="mt-2 block w-full text-xs font-semibold text-accent hover:underline">Ver todos los recibos</button>}</span></div>}
              {rows.map((r, i) => {
                const an = r.est === 'Anulado';
                return (
                  <div key={r.id} role="row" data-active={i === active} data-recibo-id={r.id} aria-selected={i === active} onMouseEnter={() => setActive(i)} onClick={() => void abrir(r.id)}
                    className={`grid ${COLS} cursor-pointer items-center gap-3 border-b border-slate-100 px-5 py-2 text-xs ${i === active ? 'bg-blue-50' : 'hover:bg-slate-50'}`} style={{ opacity: opening === r.id ? 0.6 : 1 }}>
                    <div role="cell" className="flex flex-col gap-0.5">
                      <span className="flex items-center gap-1.5"><button type="button" onClick={e => { e.stopPropagation(); void abrir(r.id); }} className="font-mono text-xs font-semibold text-accent underline-offset-2 hover:underline focus:underline focus:outline-none">{r.id}</button>
                        {an && <span className="rounded px-1 py-px text-[10px] font-semibold" style={{ background: TONE.bad[0], color: TONE.bad[1] }}>Anulado</span>}
                        {r.abono && !an && <span className="rounded px-1 py-px text-[10px] font-semibold" style={{ background: TONE.warn[0], color: TONE.warn[1] }}>Abono</span>}</span>
                      <span className="font-mono text-[10px] text-slate-400">{r.fecha} {r.hora}</span>
                    </div>
                    <span role="cell" className="text-right font-mono text-xs font-semibold" style={{ textDecoration: an ? 'line-through' : 'none', color: an ? '#94A3B8' : undefined }}>{fmt(r.monto)}</span>
                    <div role="cell" className="flex min-w-0 flex-col gap-0.5"><span className="font-mono text-[11px] text-slate-600">{r.ncf}</span>{r.tipoComprobante && <span className="overflow-hidden text-ellipsis whitespace-nowrap text-[10px] text-slate-400" title={r.tipoComprobante.nombre}>{r.tipoComprobante.nombre}{r.estadoDgii === 'PendienteEnvio' ? ' · pend. DGII' : ''}</span>}</div>
                    <div role="cell" className="flex min-w-0 flex-col gap-0.5"><span className="overflow-hidden text-ellipsis whitespace-nowrap font-medium" title={r.tutor}>{r.tutor}</span>{r.cedula && <span className="font-mono text-[10px] text-slate-400">{r.cedula}</span>}</div>
                    <span role="cell" className="overflow-hidden text-ellipsis whitespace-nowrap text-slate-700" title={r.cajero}>{r.cajero}</span>
                  </div>
                );
              })}
            </div>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 bg-slate-50 px-5 py-2.5 text-xs text-slate-600">
            <span data-recibos-total>{data ? <><b className="font-mono text-ink">{data.total.toLocaleString('en-US')}</b> {data.total === 1 ? 'recibo' : 'recibos'} · <b className="font-mono text-ink">{fmt(data.suma)}</b><span className="text-slate-400"> (neto, sin anulados)</span></> : '—'}</span>
            <span className="flex items-center gap-2">
              <button disabled={page <= 1 || loading} onClick={() => setPage(p => p - 1)} className="flex h-7 items-center gap-1 rounded border border-slate-300 bg-white px-2.5 font-medium disabled:opacity-40"><i className="ph ph-caret-left" />Anterior</button>
              <span className="font-mono">Página {page} de {pages}</span>
              <button disabled={page >= pages || loading} onClick={() => setPage(p => p + 1)} className="flex h-7 items-center gap-1 rounded border border-slate-300 bg-white px-2.5 font-medium disabled:opacity-40">Siguiente<i className="ph ph-caret-right" /></button>
            </span>
          </div>
        </div>
      </Modal>
      {recibo && <ReciboModal recibo={recibo} origen="historial" toast={toast} z={70} onClose={() => setRecibo(null)} />}
    </>
  );
}
