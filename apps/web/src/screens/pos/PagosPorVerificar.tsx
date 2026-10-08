import { useState } from 'react';
import type { MobPagoIntencionDto } from '@stodia/shared';
import { api } from '../../lib/api';
import SideDrawer from '../../components/finanzas/SideDrawer';
import { errMsg, fmt } from '../../components/finanzas/fin';

type Toast = (msg: string, tone?: 'ok' | 'warn' | 'bad' | 'info') => void;
const fecha = (iso: string) => new Date(iso).toLocaleString('es-DO', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });

/** Intenciones de pago reportadas por tutores desde el portal (sin pasarela), pendientes de verificar por el cajero. */
export default function PagosPorVerificar({ items, receiptId, onClose, onChanged, onCargar, toast }: {
  items: MobPagoIntencionDto[]; receiptId?: string; onClose: () => void; onChanged: () => void; onCargar: (it: MobPagoIntencionDto) => void; toast: Toast;
}) {
  const [open, setOpen] = useState<string | null>(null);
  const [recibo, setRecibo] = useState(receiptId ?? '');
  const [nota, setNota] = useState('');
  const [busy, setBusy] = useState(false);

  const resolver = async (it: MobPagoIntencionDto, accion: 'confirmar' | 'rechazar') => {
    if (accion === 'rechazar' && !nota.trim()) { toast('Indica el motivo del rechazo', 'warn'); return; }
    setBusy(true);
    try {
      await api.post(`/movil/pagos/intenciones/${it.id}/${accion}`, { reciboId: recibo.trim() || undefined, nota: nota.trim() || undefined });
      toast(accion === 'confirmar' ? `Pago de ${it.tutor} confirmado${it.tipo === 'recarga' ? ' · monedero acreditado' : ''}` : `Pago de ${it.tutor} rechazado`, accion === 'confirmar' ? 'ok' : 'warn');
      setOpen(null); setNota(''); onChanged();
    } catch (e) { toast(errMsg(e), 'bad'); } finally { setBusy(false); }
  };

  const inp = 'h-8 w-full rounded-md border border-slate-300 bg-slate-50 px-2 text-xs outline-none focus:border-accent focus:bg-white focus:ring-1 focus:ring-accent';
  return (
    <SideDrawer width={460} onClose={onClose}>
      <div className="flex flex-none items-center justify-between border-b border-slate-200 px-4 py-3">
        <div><div className="text-[15px] font-semibold">Pagos por verificar ({items.length})</div><div className="text-xs text-slate-500">Reportados por tutores desde el portal</div></div>
        <button onClick={onClose} aria-label="Cerrar" className="flex h-8 w-8 items-center justify-center rounded-md text-slate-500 hover:bg-slate-100"><i className="ph ph-x text-base" /></button>
      </div>
      <div className="flex-1 space-y-2.5 overflow-auto p-3">
        {items.length === 0 && <div className="py-10 text-center text-sm text-slate-500">No hay pagos pendientes de verificar.</div>}
        {items.map(it => (
          <div key={it.id} className="rounded-lg border border-slate-200 bg-white p-3 text-xs shadow-sm">
            <div className="flex items-start justify-between gap-2">
              <div><div className="text-sm font-semibold">{it.tutor}</div><div className="text-slate-500">Alumno: {it.alumno}</div></div>
              <div className="text-right"><div className="font-mono text-sm font-semibold">{fmt(it.monto)}</div>
                <span className="rounded px-1.5 py-0.5 text-[10px] font-semibold" style={{ background: it.tipo === 'recarga' ? '#DBEAFE' : '#FEF3C7', color: it.tipo === 'recarga' ? '#1D4ED8' : '#92400E' }}>{it.tipo === 'recarga' ? 'RECARGA' : 'CARGOS'}</span></div>
            </div>
            <div className="mt-1 text-slate-500">{fecha(it.creado)}</div>
            {it.detalle.length > 0 && <ul className="mt-1.5 space-y-0.5 text-slate-700">{it.detalle.map(d => <li key={d.id} className="flex justify-between gap-2"><span>{d.con}</span><span className="font-mono">{fmt(d.monto)}</span></li>)}</ul>}
            {it.nota && <div className="mt-1.5 rounded bg-slate-50 px-2 py-1 text-slate-600">Nota del tutor: {it.nota}</div>}
            <div className="mt-2.5 flex flex-wrap gap-1.5">
              {it.tipo === 'cargos' && <button onClick={() => onCargar(it)} className="flex h-8 items-center gap-1.5 rounded-md bg-accent px-3 font-semibold text-white hover:bg-accent-dark"><i className="ph ph-user-focus" />Cargar cuenta</button>}
              <button onClick={() => { setOpen(open === it.id ? null : it.id); setNota(''); setRecibo(receiptId ?? ''); }} className="flex h-8 items-center gap-1.5 rounded-md border border-slate-300 bg-white px-3 font-semibold text-slate-700 hover:bg-slate-100">Confirmar / Rechazar</button>
            </div>
            {open === it.id && (
              <div className="mt-2 space-y-1.5 border-t border-slate-100 pt-2">
                <input className={inp} value={recibo} onChange={e => setRecibo(e.target.value)} placeholder="Recibo del cobro (opcional, ej. REC-0419)" />
                <input className={inp} value={nota} onChange={e => setNota(e.target.value)} placeholder="Nota (obligatoria para rechazar)" />
                <div className="flex gap-1.5">
                  <button disabled={busy} onClick={() => void resolver(it, 'confirmar')} className="h-8 flex-1 rounded-md bg-green-700 font-semibold text-white hover:bg-green-800 disabled:opacity-50">Confirmar</button>
                  <button disabled={busy} onClick={() => void resolver(it, 'rechazar')} className="h-8 flex-1 rounded-md border border-red-300 bg-white font-semibold text-red-700 hover:bg-red-50 disabled:opacity-50">Rechazar</button>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
    </SideDrawer>
  );
}
