import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import type { Movimiento, ProductoFin } from '@stodia/shared';
import { api } from '../../lib/api';
import { useToastStack } from '../../components/useToastStack';
import { TONE, errMsg } from '../../components/finanzas/fin';

const stockTone = (p: ProductoFin): [string, string, readonly [string, string]] =>
  p.stock == null ? ['∞', '#64748B', TONE.mute] : p.stock === 0 ? ['Agotado', '#B91C1C', TONE.bad] : p.stock <= 5 ? ['Bajo', '#B45309', TONE.warn] : ['OK', '#15803D', TONE.ok];
const badge = 'inline-flex h-[19px] flex-none items-center justify-center overflow-hidden text-ellipsis whitespace-nowrap rounded-full px-[5px] text-[10px] font-semibold leading-none';

/** Inventario: existencias + entrada de mercancía + kárdex. */
export default function Screen() {
  const { toast, toasts } = useToastStack();
  const [prods, setProds] = useState<ProductoFin[]>([]);
  const [movs, setMovs] = useState<Movimiento[]>([]);
  const [entId, setEntId] = useState('p3');
  const [entQty, setEntQty] = useState('10');

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
        <Link to="/kiosko" className="flex h-[34px] items-center gap-1.5 whitespace-nowrap rounded-md border border-slate-300 bg-white px-3 text-[13px] font-medium hover:bg-slate-100"><i className="ph ph-storefront" />Ir a Venta Rápida</Link>
      </div>
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
              const e = m.tipo === 'Entrada';
              const fg = e ? TONE.ok[1] : '#475569';
              return (
                <div key={m.id} className="flex items-center gap-2.5 border-b border-slate-100 px-4 py-2 text-xs">
                  <span className="w-[58px] font-mono text-[11px] text-slate-500">{m.t}</span>
                  <span className={badge} style={{ width: 60, background: e ? TONE.ok[0] : TONE.mute[0], color: fg }}>{m.tipo}</span>
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
