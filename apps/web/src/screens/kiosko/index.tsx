import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import type { ProductoFin, VentaReq, VentaRes } from '@stodia/shared';
import { api } from '../../lib/api';
import { rncValido } from '../../lib/rnc';
import { useToastStack } from '../../components/useToastStack';
import { errMsg, fmt } from '../../components/finanzas/fin';
import { useWide } from '../../components/finanzas/useWide';
import { docTirilla, runPrint } from '../../components/finanzas/print';
import { useSession } from '../../lib/session';
import { useFinCfg } from '../../components/finanzas/finConfig';

const CATS: [string, string][] = [['all', 'Todo'], ['Uniformes', 'Uniformes'], ['Libros', 'Libros'], ['Papelería', 'Papelería'], ['Servicios', 'Servicios']];
const stockTone = (p: ProductoFin): [string, string] => (p.stock == null ? ['∞', '#64748B'] : p.stock === 0 ? ['Agotado', '#B91C1C'] : p.stock <= 5 ? ['Bajo', '#B45309'] : ['OK', '#15803D']);

/** Venta Rápida (Librería / Kiosko): ventas al contado sin expediente de alumno. */
export default function Screen() {
  const { user } = useSession();
  const { toast, toasts } = useToastStack();
  const wide = useWide();
  const itbisRate = useFinCfg().finanzas.itbis;
  const [prods, setProds] = useState<ProductoFin[]>([]);
  const [cat, setCat] = useState('all');
  const [cart, setCart] = useState<Record<string, number>>({});
  const [bar, setBar] = useState('');
  const [doc, setDoc] = useState<'cf' | 'cf2'>('cf');
  const [rnc, setRnc] = useState('');
  const [razon, setRazon] = useState('');
  const [pay, setPay] = useState('Efectivo');
  const [recv, setRecv] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => api.get<ProductoFin[]>('/kiosko/productos').then(r => setProds([...r].sort((a, b) => a.code.localeCompare(b.code)))).catch(e => toast(errMsg(e), 'bad')), [toast]);
  useEffect(() => { void load(); }, [load]);

  const addCart = (p: ProductoFin, n = 1) => {
    const q = (cart[p.id] || 0) + n;
    if (q <= 0) { const c = { ...cart }; delete c[p.id]; setCart(c); return; }
    if (p.stock != null && q > p.stock) { toast(`Solo hay ${p.stock} unidades de ${p.name}`, 'warn'); return; }
    setCart({ ...cart, [p.id]: q });
  };

  const lines = prods.filter(p => cart[p.id]).map(p => ({ p, q: cart[p.id] }));
  const sub = lines.reduce((a, x) => a + x.p.price * x.q, 0);
  const itbis = Math.round(lines.filter(x => x.p.tax).reduce((a, x) => a + x.p.price * x.q, 0) * itbisRate * 100) / 100;
  const total = sub + itbis;
  const cf2 = doc === 'cf2';
  const recvN = parseFloat(recv) || 0, cash = pay === 'Efectivo';

  let msg = '', msgC = '#64748B', ok = true;
  if (!lines.length) { msg = 'El carrito está vacío'; ok = false; }
  else if (cf2 && !rncValido(rnc)) { msg = 'Crédito fiscal: RNC de 9 u 11 dígitos obligatorio'; msgC = '#B45309'; ok = false; }
  else if (cf2 && !razon.trim()) { msg = 'Indica la razón social'; msgC = '#B45309'; ok = false; }
  else if (cash && recv && recvN < total) { msg = 'El efectivo recibido no cubre el total (falta ' + fmt(total - recvN) + ')'; msgC = '#B91C1C'; ok = false; }
  else if (cash && recvN > total) { msg = 'Cambio a devolver ' + fmt(recvN - total); msgC = '#15803D'; }
  else msg = 'Listo para cobrar · ' + (cf2 ? 'B01 Crédito fiscal' : 'B02 Consumidor final');

  const onBar = (code: string) => {
    const p = prods.find(x => x.code === code.trim());
    if (!p) { toast(`Código ${code} no existe en el catálogo`, 'bad'); return; }
    if (p.stock === 0) { toast(`${p.name} está agotado`, 'bad'); return; }
    setBar(''); addCart(p);
  };

  const cobrar = async () => {
    if (busy) return;
    if (!ok) { toast(msg, 'bad'); return; }
    setBusy(true);
    try {
      const body: VentaReq = { items: lines.map(l => ({ id: l.p.id, q: l.q })), doc, rnc, razon, pay, recv };
      const v = await api.post<VentaRes>('/kiosko/ventas', body);
      setCart({}); setRecv(''); setRnc(''); setRazon('');
      await load();
      toast(`${v.id} cobrada · ${fmt(v.total)}`, 'ok');
      runPrint('ks', docTirilla({ id: v.id, ncf: v.ncf, tutor: v.cliente, hora: v.hora, monto: v.total, items: v.items, pays: [{ m: v.pay, r: '', amt: v.recv }], change: v.change }, user?.nombre));
    } catch (e) { toast(errMsg(e), 'bad'); } finally { setBusy(false); }
  };

  const seg = (a: boolean) => `h-[30px] rounded text-xs ${a ? 'bg-white font-semibold text-accent shadow-sm' : 'font-medium text-slate-600'}`;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="m-0 text-xl font-semibold tracking-tight">Librería / Kiosko</h1>
          <p className="mb-0 mt-1 text-[13px] text-slate-600">Ventas al contado sin expediente de alumno · no afectan estados de cuenta.</p>
        </div>
        <Link to="/inventario" className="flex h-[34px] items-center gap-1.5 whitespace-nowrap rounded-md border border-slate-300 bg-white px-3 text-[13px] font-medium hover:bg-slate-100"><i className="ph ph-package" />Ver inventario</Link>
      </div>

      <div className="grid items-start gap-3" style={{ gridTemplateColumns: wide ? 'minmax(0,1fr) 340px' : 'minmax(0,1fr)' }}>
        <section className="flex min-w-0 flex-col gap-2.5">
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative min-w-[220px] flex-1">
              <i className="ph ph-barcode absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
              <input value={bar} onChange={e => setBar(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') onBar(bar); }}
                placeholder="Escanear código de barras y Enter…"
                className="h-[38px] w-full rounded-md border border-slate-300 bg-white pl-[34px] pr-2.5 font-mono text-[13px] font-medium outline-none focus:border-accent focus:ring-[3px] focus:ring-accent-soft" />
            </div>
            <div className="flex flex-wrap gap-0.5 rounded-lg bg-slate-100 p-[3px]">
              {CATS.map(([k, l]) => (
                <button key={k} onClick={() => setCat(k)} className={`h-[30px] rounded-md px-2.5 text-xs font-medium ${cat === k ? 'bg-white text-ink shadow-sm' : 'text-slate-600'}`}>{l}</button>
              ))}
            </div>
          </div>
          <div className="grid grid-cols-[repeat(auto-fill,minmax(168px,1fr))] gap-2.5">
            {prods.filter(p => cat === 'all' || p.cat === cat).map(p => {
              const st = stockTone(p), out = p.stock === 0;
              return (
                <button key={p.id} disabled={out} onClick={() => addCart(p)}
                  className="flex flex-col gap-1.5 rounded-lg border border-slate-200 bg-white p-3 text-left hover:border-blue-300 disabled:cursor-not-allowed disabled:opacity-50">
                  <span className="flex w-full items-center justify-between">
                    <span className="grid h-8 w-8 place-items-center rounded-md bg-slate-100 text-[17px] text-slate-700"><i className={p.icon} /></span>
                    <span className="font-mono text-[10px] font-semibold" style={{ color: st[1] }}>{p.stock == null ? '∞' : p.stock + ' u.'}</span>
                  </span>
                  <span className="text-[13px] font-semibold leading-[1.3] text-ink">{p.name}</span>
                  <span className="flex w-full items-baseline justify-between">
                    <span className="font-mono text-[13px] font-semibold">{fmt(p.price)}</span>
                    <span className="text-[10px] text-slate-400">{p.tax ? '+ ITBIS' : 'Exento'}</span>
                  </span>
                </button>
              );
            })}
          </div>
        </section>

        <aside className="sticky top-0 flex flex-col gap-2.5 rounded-lg border border-slate-200 bg-white p-3.5">
          <div className="flex items-center justify-between"><span className="text-sm font-bold">Carrito</span><button onClick={() => setCart({})} className="text-xs text-slate-500">Vaciar</button></div>
          <div className="flex max-h-[220px] min-h-10 flex-col gap-1.5 overflow-auto">
            {lines.map(({ p, q }) => (
              <div key={p.id} className="flex items-center gap-2 text-xs">
                <span className="min-w-0 flex-1 overflow-hidden text-ellipsis whitespace-nowrap">{p.name}</span>
                <button onClick={() => addCart(p, -1)} className="h-[22px] w-[22px] rounded border border-slate-300 bg-white">−</button>
                <span className="w-[18px] text-center font-mono text-xs font-semibold">{q}</span>
                <button onClick={() => addCart(p, 1)} className="h-[22px] w-[22px] rounded border border-slate-300 bg-white">+</button>
                <span className="w-[78px] text-right font-mono text-xs font-medium">{fmt(p.price * q)}</span>
              </div>
            ))}
            {!lines.length && <div className="text-xs text-slate-400">Agrega artículos con un toque o escaneando.</div>}
          </div>
          <div className="flex flex-col gap-1 border-t border-dashed border-slate-200 pt-2 text-xs">
            <div className="flex justify-between text-slate-500"><span>Subtotal</span><span className="font-mono">{fmt(sub)}</span></div>
            <div className="flex justify-between text-slate-500"><span>ITBIS {+(itbisRate * 100).toFixed(2)}% (solo gravados)</span><span className="font-mono">{fmt(itbis)}</span></div>
            <div className="flex items-baseline justify-between"><span className="text-[11px] font-bold uppercase tracking-wider">Total</span><span className="font-mono text-[22px] font-bold">{fmt(total)}</span></div>
          </div>
          <div className="grid grid-cols-2 gap-1 rounded-md bg-slate-100 p-1">
            <button onClick={() => setDoc('cf')} className={seg(doc === 'cf')}>Consumidor final</button>
            <button onClick={() => setDoc('cf2')} className={seg(doc === 'cf2')}>Crédito fiscal</button>
          </div>
          {cf2 && (
            <div className="flex flex-col gap-1.5">
              <input value={rnc} onChange={e => setRnc(e.target.value)} placeholder="RNC (9 u 11 dígitos) *" className="h-[34px] rounded-md border px-2.5 font-mono text-[13px]" style={{ borderColor: rnc && !rncValido(rnc) ? '#F59E0B' : '#CBD5E1' }} />
              <input value={razon} onChange={e => setRazon(e.target.value)} placeholder="Razón social *" className="h-[34px] rounded-md border border-slate-300 px-2.5 text-[13px]" />
            </div>
          )}
          <div className="flex gap-1.5">
            <select value={pay} onChange={e => setPay(e.target.value)} className="h-[34px] flex-1 rounded-md border border-slate-300 bg-white px-2 text-[13px]"><option>Efectivo</option><option>Tarjeta</option><option>Transferencia</option></select>
            {cash && <input value={recv} onChange={e => setRecv(e.target.value.replace(/[^\d.]/g, ''))} placeholder={total.toFixed(2)} className="h-[34px] w-[110px] rounded-md border border-slate-300 px-2 text-right font-mono text-[13px]" />}
          </div>
          <div className="min-h-4 text-xs" style={{ color: msgC }}>{msg}</div>
          <button onClick={() => void cobrar()} className="h-11 rounded-md text-sm font-semibold text-white" style={{ background: ok ? '#2563EB' : '#CBD5E1', cursor: ok ? 'pointer' : 'not-allowed' }}>Cobrar e imprimir</button>
        </aside>
      </div>
      {toasts}
    </div>
  );
}
