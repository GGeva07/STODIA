import { useCallback, useEffect, useState } from 'react';
import { AvisoBorrador, useDraft } from '../../lib/useDraft';
import { Link } from 'react-router-dom';
import type { Movimiento, ProductoFin } from '@stodia/shared';
import { api } from '../../lib/api';
import { canAccess, useAccessVersion } from '../../lib/access';
import { useSession } from '../../lib/session';
import { useToastStack } from '../../components/useToastStack';
import { TONE, errMsg } from '../../components/finanzas/fin';
import { Modal } from '../../components/system/UiProvider';
import { runPrint } from '../../components/finanzas/print';
import { docInventario } from '../../components/finanzas/printListados';

const stockTone = (p: ProductoFin): [string, string, readonly [string, string]] =>
  p.stock == null ? ['∞', '#64748B', TONE.mute] : p.stock === 0 ? ['Agotado', '#B91C1C', TONE.bad] : p.stock <= 5 ? ['Bajo', '#B45309', TONE.warn] : ['OK', '#15803D', TONE.ok];
const badge = 'inline-flex h-[19px] flex-none items-center justify-center overflow-hidden text-ellipsis whitespace-nowrap rounded-full px-[5px] text-[10px] font-semibold leading-none';

/** Inventario: existencias + entrada de mercancía + kárdex. */
export default function Screen() {
  const { user } = useSession();
  useAccessVersion();
  const { toast, toasts } = useToastStack();
  const [prods, setProds] = useState<ProductoFin[]>([]);
  const [movs, setMovs] = useState<Movimiento[]>([]);
  // Entrada de stock en edición (sin enviar): se conserva al navegar y se restablece al registrar.
  const [entId, setEntId] = useDraft('inventario:entId', 'p3');
  const [entQty, setEntQty] = useDraft('inventario:entQty', '10');
  const [printOpen, setPrintOpen] = useState(false);

  const load = useCallback(async () => {
    try {
      const [p, m] = await Promise.all([api.get<ProductoFin[]>('/kiosko/productos'), api.get<Movimiento[]>('/kiosko/movimientos')]);
      setProds([...p].sort((a, b) => a.code.localeCompare(b.code))); setMovs(m);
    } catch (e) { toast(errMsg(e), 'bad'); }
  }, [toast]);
  useEffect(() => { void load(); }, [load]);

  const addEntry = async () => {
    const p = prods.find(x => x.id === entId);
    try {
      await api.post('/kiosko/entradas', { id: entId, qty: parseInt(entQty) });
      toast(`Entrada registrada: +${entQty} ${p?.name ?? ''}`, 'ok');
      setEntQty('10');
      await load();
    } catch (e) { toast(errMsg(e), 'bad'); }
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="m-0 text-xl font-semibold tracking-tight">Inventario</h1>
          <p className="mb-0 mt-1 text-[13px] text-slate-600">Existencias de uniformes, libros y artículos de Venta Rápida, con su kárdex de entradas y salidas.</p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => setPrintOpen(true)} disabled={!prods.length} className="flex h-[34px] items-center gap-1.5 whitespace-nowrap rounded-md border border-slate-300 bg-white px-3 text-[13px] font-medium hover:bg-slate-100 disabled:opacity-50"><i className="ph ph-printer" />Imprimir</button>
          {user && canAccess(user.rol, 'kiosko') && <Link to="/kiosko" className="flex h-[34px] items-center gap-1.5 whitespace-nowrap rounded-md border border-slate-300 bg-white px-3 text-[13px] font-medium hover:bg-slate-100"><i className="ph ph-storefront" />Ir a Venta Rápida</Link>}
        </div>
      </div>
      {printOpen && (
        <Modal width={380} z={60} onClose={() => setPrintOpen(false)}>
          <div className="flex flex-col gap-3 p-5" role="dialog" aria-label="Imprimir inventario">
            <div className="text-[15px] font-semibold"><i className="ph ph-printer mr-1.5 align-[-2px]" />Imprimir inventario</div>
            <div className="text-xs text-slate-500">Elige el contenido del reporte ({prods.length} artículos).</div>
            {([['detallado', 'Detallado', 'Todos los artículos con existencia, precio y valor'], ['resumen', 'Resumen por tipo', 'Artículos, unidades y valor por tipo'], ['ambos', 'Ambos', 'Detallado y resumen en el mismo documento']] as const).map(([m, l, d]) => (
              <button key={m} onClick={() => { runPrint('inv', docInventario(prods, m)); setPrintOpen(false); }} className="rounded-md border border-slate-300 bg-white px-3 py-2 text-left hover:bg-slate-50">
                <div className="text-[13px] font-semibold">{l}</div><div className="text-xs text-slate-500">{d}</div>
              </button>
            ))}
            <button onClick={() => setPrintOpen(false)} className="h-8 rounded-md text-xs font-medium text-slate-600 hover:bg-slate-100">Cancelar</button>
          </div>
        </Modal>
      )}
      <div className="grid grid-cols-[repeat(auto-fit,minmax(320px,1fr))] items-start gap-3">
        <section className="overflow-hidden rounded-lg border border-slate-200 bg-white">
          <div className="border-b border-slate-200 px-4 py-3 text-sm font-semibold">Inventario</div>
          {prods.map(p => {
            const st = stockTone(p);
            return (
              <div key={p.id} className="flex items-center gap-2.5 border-b border-slate-100 px-4 py-2 text-[13px]">
                <span className="min-w-0 flex-1">{p.name} <span className="font-mono text-[11px] text-slate-400">{p.code}</span></span>
                <span className="font-mono text-[13px] font-semibold" style={{ color: st[1] }}>{p.stock == null ? '∞' : p.stock}</span>
                <span className={badge} style={{ width: 70, background: st[2][0], color: st[2][1] }}>{st[0]}</span>
              </div>
            );
          })}
        </section>
        <div className="flex flex-col gap-3">
          <section className="flex flex-col gap-2.5 rounded-lg border border-slate-200 bg-white p-3.5">
            <div className="text-sm font-semibold">Entrada de mercancía</div>
            <div className="flex flex-wrap gap-2">
              <select value={entId} onChange={e => setEntId(e.target.value)} className="h-9 min-w-[160px] flex-1 rounded-md border border-slate-300 bg-white px-2 text-[13px]">
                {prods.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
              <input value={entQty} onChange={e => setEntQty(e.target.value.replace(/\D/g, ''))} className="h-9 w-20 rounded-md border border-slate-300 px-2 text-right font-mono text-[13px]" />
              <button onClick={() => void addEntry()} className="flex h-[34px] items-center gap-1.5 whitespace-nowrap rounded-md bg-accent px-3.5 text-[13px] font-medium text-white hover:bg-accent-dark"><i className="ph ph-arrow-down" />Registrar</button>
            </div>
          </section>
          <section className="overflow-hidden rounded-lg border border-slate-200 bg-white">
            <div className="border-b border-slate-200 px-4 py-3 text-sm font-semibold">Kárdex (últimos movimientos)</div>
            {movs.map(m => {
              const e = m.tipo === 'Entrada' || m.tipo === 'Devolución';
              const fg = e ? TONE.ok[1] : '#475569';
              return (
                <div key={m.id} className="flex items-center gap-2.5 border-b border-slate-100 px-4 py-2 text-xs">
                  <span className="w-[58px] font-mono text-[11px] text-slate-500">{m.t}</span>
                  <span className={badge} style={{ width: m.tipo === 'Devolución' ? 76 : 60, background: e ? TONE.ok[0] : TONE.mute[0], color: fg }}>{m.tipo}</span>
                  <span className="min-w-0 flex-1 overflow-hidden text-ellipsis whitespace-nowrap">{m.name}</span>
                  <span className="font-mono text-xs font-semibold" style={{ color: fg }}>{m.q}</span>
                  <span className="w-[70px] text-right font-mono text-[11px] text-slate-500">{m.ref}</span>
                </div>
              );
            })}
          </section>
        </div>
      </div>
      {toasts}
    </div>
  );
}
