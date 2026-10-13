import { useCallback, useEffect, useRef, useState } from 'react';
import type { NotaFila, NotaFiscalDto, NotaListaRes } from '@stodia/shared';
import { api } from '../../lib/api';
import { Modal } from '../../components/system/UiProvider';
import SegTabs from '../../components/SegTabs';
import { TONE, errMsg, fmt } from '../../components/finanzas/fin';
import { SL_MSG, useCiclo } from '../../lib/ciclo';
import type { ToastTone } from '../../components/useToastStack';
import NotaModal from './NotaModal';
import NuevaNota, { type NotaInicial } from './NuevaNota';

type Rango = 'todos' | 'hoy' | 'semana' | 'mes' | 'rango';
type Tab = 'emitidas' | 'nueva';
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
const COLS = 'grid-cols-[minmax(100px,0.8fr)_84px_minmax(120px,1fr)_minmax(130px,1fr)_minmax(0,1.2fr)_minmax(100px,0.8fr)_minmax(0,1.1fr)_minmax(0,0.8fr)]';

/**
 * Modal grande «Notas de Crédito / Débito» del POS: pestaña «Notas emitidas» (listado paginado del ciclo elegido; clic abre el MISMO modal que tras emitir) y «Nueva nota» (asistente de 3 pasos).
 * `inicial` abre directamente el asistente con ese comprobante precargado (acciones «Emitir nota de crédito/débito» del recibo).
 */
export default function NotasFiscales({ onClose, toast, inicial, onCambio }: { onClose: () => void; toast: (msg: string, tone?: ToastTone) => void; inicial?: NotaInicial; onCambio?: () => void }) {
  const { cicloSeleccionado, soloLectura } = useCiclo();
  const [tab, setTab] = useState<Tab>(inicial ? 'nueva' : 'emitidas');
  const [q, setQ] = useState(''), [qd, setQd] = useState('');
  const [tipo, setTipo] = useState<'' | 'credito' | 'debito'>('');
  const [rango, setRango] = useState<Rango>('todos');
  const [d1, setD1] = useState(''), [d2, setD2] = useState('');
  const [mios, setMios] = useState(false);
  const [page, setPage] = useState(1);
  const [data, setData] = useState<NotaListaRes | null>(null);
  const [loading, setLoading] = useState(true), [err, setErr] = useState('');
  const [active, setActive] = useState(0), [opening, setOpening] = useState('');
  const [nota, setNota] = useState<{ n: NotaFiscalDto; origen: 'emision' | 'historial' } | null>(null);
  const [wiz, setWiz] = useState(0); // reinicia el asistente tras emitir
  const seq = useRef(0), rowsRef = useRef<HTMLDivElement>(null);

  useEffect(() => { const t = setTimeout(() => { setQd(q.trim()); setPage(1); }, 300); return () => clearTimeout(t); }, [q]);
  const load = useCallback(async () => {
    const my = ++seq.current;
    setLoading(true); setErr('');
    const { desde, hasta } = fechas(rango, d1, d2);
    const qs = new URLSearchParams({ page: String(page), size: String(SIZE) });
    if (qd) qs.set('q', qd); if (tipo) qs.set('tipo', tipo); if (desde) qs.set('desde', desde); if (hasta) qs.set('hasta', hasta); if (mios) qs.set('mios', '1');
    try { const r = await api.get<NotaListaRes>('/cobros/notas?' + qs.toString()); if (my !== seq.current) return; setData(r); setActive(0); } catch (e) { if (my === seq.current) { setErr(errMsg(e)); setData(null); } } finally { if (my === seq.current) setLoading(false); }
  }, [qd, tipo, rango, d1, d2, mios, page, cicloSeleccionado]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (tab === 'emitidas') void load(); }, [load, tab]);

  const abrir = async (id: string) => {
    if (opening) return;
    setOpening(id);
    try { setNota({ n: await api.get<NotaFiscalDto>('/cobros/notas/' + encodeURIComponent(id)), origen: 'historial' }); } catch (e) { toast(errMsg(e), 'bad'); } finally { setOpening(''); }
  };
  const rows: NotaFila[] = data?.rows ?? [];
  const pages = Math.max(1, Math.ceil((data?.total ?? 0) / SIZE));
  const onKey = (e: React.KeyboardEvent) => {
    if (tab !== 'emitidas') return;
    const t = e.target as HTMLElement;
    if (t.tagName === 'SELECT' || (t.tagName === 'INPUT' && (t as HTMLInputElement).type !== 'text')) return;
    if (e.key === 'ArrowDown') { e.preventDefault(); setActive(a => Math.min(rows.length - 1, a + 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive(a => Math.max(0, a - 1)); }
    else if (e.key === 'Enter' && rows[active] && t.tagName !== 'BUTTON') { e.preventDefault(); void abrir(rows[active].id); }
  };
  useEffect(() => { rowsRef.current?.querySelector('[data-active="true"]')?.scrollIntoView({ block: 'nearest' }); }, [active, rows]);

  const ctl = 'h-8 rounded-md border border-slate-300 bg-white px-2 text-xs outline-none focus:border-accent focus:ring-1 focus:ring-accent';
  const badge = (cr: boolean) => <span className="rounded px-1.5 py-px text-[10px] font-semibold" style={{ background: cr ? TONE.info[0] : TONE.warn[0], color: cr ? TONE.info[1] : TONE.warn[1] }}>{cr ? 'Crédito' : 'Débito'}</span>;

  return (
    <>
      <Modal width={1100} z={60} onClose={nota ? undefined : onClose}>
        <div onKeyDown={onKey} className="flex h-[calc(100vh-40px)] max-h-[760px] flex-col" role="region" aria-label="Notas de crédito y débito">
          <div className="flex items-center justify-between gap-3 border-b border-slate-200 px-5 py-3.5">
            <div>
              <div className="text-[15px] font-semibold"><i className="ph ph-receipt-x mr-1.5 align-[-2px]" />Notas de Crédito / Débito</div>
              <div className="text-xs text-slate-500">Ciclo {cicloSeleccionado || 'activo'} · Devoluciones, correcciones y cobros adicionales sobre comprobantes ya emitidos</div>
            </div>
            <div className="flex items-center gap-3">
              <SegTabs<Tab> value={tab} onChange={setTab} options={[{ k: 'emitidas', label: 'Notas emitidas' }, { k: 'nueva', label: 'Nueva nota' }]} />
              <button onClick={onClose} aria-label="Cerrar" className="h-[34px] w-[34px] rounded-md border border-slate-300 bg-white"><i className="ph ph-x" /></button>
            </div>
          </div>

          {tab === 'nueva' && (soloLectura
            ? <div className="grid flex-1 place-items-center px-6 text-center text-sm text-slate-500"><span><i className="ph ph-lock mb-1 block text-3xl text-slate-300" />{SL_MSG}</span></div>
            : <NuevaNota key={wiz} inicial={wiz === 0 ? inicial : undefined} toast={toast} onEmitida={n => { setNota({ n, origen: 'emision' }); setWiz(w => w + 1); onCambio?.(); void load(); }} />)}

          {tab === 'emitidas' && <>
            <div className="flex flex-wrap items-center gap-2 border-b border-slate-200 bg-slate-50 px-5 py-2.5">
              <div className="relative min-w-[220px] flex-1">
                <i className="ph ph-magnifying-glass pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
                <input autoFocus value={q} onChange={e => setQ(e.target.value)} placeholder="Buscar por nota, NCF, recibo, nombre o cédula…" aria-label="Buscar notas" className={`${ctl} w-full pl-8`} />
              </div>
              <select value={tipo} onChange={e => { setTipo(e.target.value as '' | 'credito' | 'debito'); setPage(1); }} aria-label="Filtrar por tipo" className={ctl}><option value="">Crédito y débito</option><option value="credito">Solo crédito</option><option value="debito">Solo débito</option></select>
              <select value={rango} onChange={e => { setRango(e.target.value as Rango); setPage(1); }} aria-label="Filtrar por fecha" className={ctl}><option value="todos">Todas las fechas</option><option value="hoy">Hoy</option><option value="semana">Esta semana</option><option value="mes">Este mes</option><option value="rango">Rango…</option></select>
              {rango === 'rango' && <><input type="date" value={d1} max={d2 || undefined} onChange={e => { setD1(e.target.value); setPage(1); }} aria-label="Desde" className={ctl} /><span className="text-xs text-slate-400">a</span><input type="date" value={d2} min={d1 || undefined} onChange={e => { setD2(e.target.value); setPage(1); }} aria-label="Hasta" className={ctl} /></>}
              <label className="flex cursor-pointer select-none items-center gap-1.5 text-xs font-medium text-slate-700"><input type="checkbox" checked={mios} onChange={e => { setMios(e.target.checked); setPage(1); }} />Solo mis notas</label>
            </div>
            <div role="table" aria-label="Notas emitidas" aria-rowcount={data?.total ?? 0} className="flex min-h-0 flex-1 flex-col">
              <div role="row" className={`grid ${COLS} gap-3 border-b border-slate-200 bg-white px-5 py-2 text-[11px] font-semibold uppercase tracking-wide text-slate-500`}>
                <span role="columnheader">Nota</span><span role="columnheader">Tipo</span><span role="columnheader">NCF</span><span role="columnheader">Documento afectado</span><span role="columnheader">A nombre de</span><span role="columnheader" className="text-right">Monto</span><span role="columnheader">Motivo</span><span role="columnheader">Hecho por</span>
              </div>
              <div ref={rowsRef} className="min-h-[200px] flex-1 overflow-auto" style={{ opacity: loading && data ? 0.55 : 1 }} aria-busy={loading}>
                {loading && !data && <div className="grid h-[200px] place-items-center text-sm text-slate-500"><span><i className="ph ph-circle-notch mr-2" style={{ animation: 'spin 0.8s linear infinite' }} />Cargando notas…</span></div>}
                {err && <div role="alert" className="m-5 flex items-center justify-between gap-3 rounded-md border border-red-200 bg-bad-bg px-3 py-2.5 text-[13px] text-bad-fg"><span><i className="ph ph-warning mr-1.5" />{err}</span><button onClick={() => void load()} className="h-7 rounded border border-red-300 bg-white px-2.5 text-xs font-medium">Reintentar</button></div>}
                {!loading && !err && rows.length === 0 && (
                  <div className="grid h-[200px] place-items-center px-6 text-center text-sm text-slate-500"><span><i className="ph ph-receipt-x mb-1 block text-3xl text-slate-300" />{qd ? <>Ninguna nota coincide con «<b className="font-mono">{qd}</b>».</> : tipo || rango !== 'todos' || mios ? 'Ninguna nota coincide con los filtros.' : 'Aún no hay notas de crédito ni de débito en este ciclo.'}
                    {!qd && !tipo && rango === 'todos' && !mios && !soloLectura && <button onClick={() => setTab('nueva')} className="mt-2 block w-full text-xs font-semibold text-accent hover:underline">Emitir la primera nota</button>}</span></div>
                )}
                {rows.map((r, i) => (
                  <div key={r.id} role="row" data-active={i === active} data-nota-id={r.id} aria-selected={i === active} onMouseEnter={() => setActive(i)} onClick={() => void abrir(r.id)}
                    className={`grid ${COLS} cursor-pointer items-center gap-3 border-b border-slate-100 px-5 py-2 text-xs ${i === active ? 'bg-blue-50' : 'hover:bg-slate-50'}`} style={{ opacity: opening === r.id ? 0.6 : 1 }}>
                    <div role="cell" className="flex flex-col gap-0.5"><button type="button" onClick={e => { e.stopPropagation(); void abrir(r.id); }} className="self-start font-mono text-xs font-semibold text-accent underline-offset-2 hover:underline focus:underline focus:outline-none">{r.id}</button><span className="font-mono text-[10px] text-slate-400">{r.fecha} {r.hora}</span></div>
                    <span role="cell">{badge(r.clase === 'CREDITO')}</span>
                    <div role="cell" className="flex min-w-0 flex-col gap-0.5"><span className="font-mono text-[11px] text-slate-600">{r.ncf}</span><span className="overflow-hidden text-ellipsis whitespace-nowrap text-[10px] text-slate-400" title={r.tipoComprobante.nombre}>{r.tipoComprobante.nombre}{r.estadoDgii === 'PendienteEnvio' ? ' · pend. DGII' : ''}</span></div>
                    <div role="cell" className="flex min-w-0 flex-col gap-0.5"><span className="font-mono text-[11px] font-semibold">{r.documento.id}</span><span className="font-mono text-[10px] text-slate-400">{r.documento.ncf}</span></div>
                    <span role="cell" className="overflow-hidden text-ellipsis whitespace-nowrap font-medium" title={r.tutor}>{r.tutor}</span>
                    <span role="cell" className="text-right font-mono text-xs font-semibold" style={{ color: r.clase === 'CREDITO' ? TONE.info[1] : TONE.warn[1] }}>{r.clase === 'CREDITO' ? '−' : '+'}{fmt(r.monto).replace('RD$ ', 'RD$ ')}</span>
                    <span role="cell" className="overflow-hidden text-ellipsis whitespace-nowrap text-slate-700" title={r.motivo.nombre + (r.motivoTexto ? ' · ' + r.motivoTexto : '')}>{r.motivo.nombre}</span>
                    <span role="cell" className="overflow-hidden text-ellipsis whitespace-nowrap text-slate-700" title={r.cajero}>{r.cajero}</span>
                  </div>
                ))}
              </div>
            </div>
            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 bg-slate-50 px-5 py-2.5 text-xs text-slate-600">
              <span data-notas-total>{data ? <><b className="font-mono text-ink">{data.total.toLocaleString('en-US')}</b> {data.total === 1 ? 'nota' : 'notas'} · créditos <b className="font-mono text-ink">{fmt(data.suma.credito)}</b> · débitos <b className="font-mono text-ink">{fmt(data.suma.debito)}</b> · neto <b className="font-mono text-ink">{fmt(data.suma.neto)}</b></> : '—'}</span>
              <span className="flex items-center gap-2">
                <button disabled={page <= 1 || loading} onClick={() => setPage(p => p - 1)} className="flex h-7 items-center gap-1 rounded border border-slate-300 bg-white px-2.5 font-medium disabled:opacity-40"><i className="ph ph-caret-left" />Anterior</button>
                <span className="font-mono">Página {page} de {pages}</span>
                <button disabled={page >= pages || loading} onClick={() => setPage(p => p + 1)} className="flex h-7 items-center gap-1 rounded border border-slate-300 bg-white px-2.5 font-medium disabled:opacity-40">Siguiente<i className="ph ph-caret-right" /></button>
              </span>
            </div>
          </>}
        </div>
      </Modal>
      {nota && <NotaModal nota={nota.n} origen={nota.origen} toast={toast} z={75} onClose={() => { setNota(null); if (nota.origen === 'emision') setTab('emitidas'); }} />}
    </>
  );
}
