import { Fragment, useEffect, useState } from 'react';
import type { ReciboEnvioRes, ReciboFin } from '@stodia/shared';
import { api } from '../../lib/api';
import { errMsg, fmt, fmtDoc } from '../../components/finanzas/fin';
import { docTirilla, runPrint, usePrintBusy } from '../../components/finanzas/print';
import type { ToastTone } from '../../components/useToastStack';

/**
 * Modal del recibo del POS. Es EL MISMO para el recibo recien emitido (POST /cobros/procesar) y para el que se abre desde el Historial de Recibos
 * (GET /cobros/recibos/:id): ambos entregan el mismo DTO (API lib/recibos.reciboDto), asi que el contenido, los botones y la tirilla son identicos.
 * `origen` solo cambia la auditoria: imprimir desde el historial queda registrado como «Reimpresión de recibo REC-xxxx».
 */
export default function ReciboModal({ recibo, onClose, toast, origen = 'emision', z = 70, onNota }: {
  recibo: ReciboFin; onClose: () => void; toast: (msg: string, tone?: ToastTone) => void; origen?: 'emision' | 'historial'; z?: number;
  /** Acciones secundarias «Emitir nota de crédito / débito» (solo con permiso y fuera de ciclos cerrados: quien llama decide si las pasa). */
  onNota?: (clase: 'credito' | 'debito') => void;
}) {
  const pbr = usePrintBusy()('rcpt', 'Imprimir Tirilla', 'ph ph-receipt');
  const [sending, setSending] = useState(false);
  const an = recibo.est === 'Anulado';
  // Esc cierra el recibo; se corta la propagación para que no cierre también el panel que lo contiene (Historial de Recibos / de Turno).
  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.stopImmediatePropagation(); onClose(); } };
    window.addEventListener('keydown', h, true);
    return () => window.removeEventListener('keydown', h, true);
  }, [onClose]);

  const enviar = async () => {
    if (sending) return;
    setSending(true);
    try {
      const r = await api.post<ReciboEnvioRes>(`/cobros/recibos/${encodeURIComponent(recibo.id)}/enviar`, {});
      if (r.estado === 'Enviado') toast('Recibo enviado por correo a ' + r.destino, 'ok');
      else if (r.estado === 'Sin correo') toast('El tutor no tiene correo registrado', 'warn');
      else toast('Canal no configurado: el recibo no se envió a ' + r.destino, 'warn');
    } catch (e) { toast(errMsg(e), 'bad'); } finally { setSending(false); }
  };
  const imprimir = () => {
    // Si armar la tirilla lanza, antes el clic moría en silencio (solo error en consola): ahora se avisa al cajero.
    try { runPrint('rcpt', docTirilla(recibo)); } catch (e) { console.error('[tirilla]', e); toast('No se pudo preparar la tirilla: ' + errMsg(e), 'bad'); return; }
    if (origen === 'historial') void api.post(`/cobros/recibos/${encodeURIComponent(recibo.id)}/reimprimir`, {}).catch(() => undefined);
  };

  return (
    <div className="fixed inset-0 grid place-items-center bg-slate-900/50 p-5" style={{ zIndex: z }} data-recibo-modal>
      <div className="w-[420px] max-w-full overflow-hidden rounded-[10px] bg-white shadow-2xl" role="dialog" aria-modal="true" aria-label={'Recibo ' + recibo.id}>
        <div className="flex items-center gap-3 border-b border-slate-200 px-5 py-[18px]">
          <i className={`text-[28px] ${an ? 'ph-fill ph-x-circle text-red-600' : 'ph-fill ph-check-circle text-green-600'}`} />
          {/* Recién emitido: «Pago procesado». Al consultarlo después (Historial de Recibos / de Turno) es solo «Recibo». */}
          <div><div className="text-base font-semibold">{an ? 'Recibo anulado' : origen === 'historial' ? (recibo.abono ? 'Recibo de abono' : 'Recibo') : recibo.abono ? 'Abono registrado' : 'Pago procesado'}</div><div className="text-xs text-slate-600">{an && recibo.nc ? 'Nota de crédito ' + recibo.nc : recibo.estadoDgii === 'PendienteEnvio' ? (origen === 'historial' ? 'e-NCF pendiente de envío a la DGII' : 'e-NCF emitido · pendiente de envío a la DGII') : origen === 'historial' ? (recibo.tipoComprobante?.nombre ?? 'Comprobante') + (recibo.fecha ? ' · ' + recibo.fecha + (recibo.hora ? ' ' + recibo.hora : '') : '') : (recibo.tipoComprobante?.nombre ?? 'Comprobante') + ' · NCF asignado'}</div></div>
        </div>
        <div className="flex flex-col gap-1.5 px-5 py-4 text-[13px]">
          <div className="flex justify-between"><span className="text-slate-500">Recibo</span><span className="font-mono">{recibo.id}</span></div>
          {recibo.tipoComprobante && <div className="flex justify-between gap-2.5"><span className="text-slate-500">Comprobante</span><span data-testid="recibo-tipo" className="text-right">{recibo.tipoComprobante.nombre} <span className="font-mono text-slate-500">({recibo.tipoComprobante.codigo}…)</span></span></div>}
          <div className="flex justify-between"><span className="text-slate-500">{recibo.tipoComprobante?.modalidad === 'ELECTRONICA' ? 'e-NCF' : 'NCF'}</span><span className="font-mono">{recibo.ncf}</span></div>
          {recibo.estadoDgii === 'PendienteEnvio' && <div className="flex items-center gap-1.5 rounded-md bg-warn-bg px-2 py-1 text-xs font-medium text-warn-fg"><i className="ph ph-paper-plane-tilt" />e-NCF pendiente de envío a la DGII</div>}
          <div className="flex justify-between"><span className="text-slate-500">Tutor</span><span>{recibo.tutor}</span></div>
          {recibo.clienteRnc && <div className="flex justify-between"><span className="text-slate-500">RNC/Cédula</span><span className="font-mono">{fmtDoc(recibo.clienteRnc)}</span></div>}
          {recibo.clienteNombre && <div className="flex justify-between gap-2.5"><span className="text-slate-500">Razón social</span><span className="text-right">{recibo.clienteNombre}</span></div>}
          {recibo.regimenEspecial && <div className="flex justify-between"><span className="text-slate-500">Régimen especial</span><span className="font-mono">{recibo.regimenEspecial}</span></div>}
          <div className="my-1.5 border-t border-dashed border-slate-200" />
          {recibo.items.map((ri, k) => <Fragment key={k}>
            {(ri.descuentoBeca ?? 0) > 0 && (ri.montoBruto ?? 0) > 0
              ? <div className="flex flex-col gap-0.5" data-testid="recibo-beca-linea">
                  <div className="text-slate-700">{ri.con}</div>
                  <div className="flex justify-between gap-2.5 pl-3 text-[12px] text-slate-600"><span>Monto real</span><span className="font-mono">{fmt(ri.montoBruto!)}</span></div>
                  <div className="flex justify-between gap-2.5 pl-3 text-[12px]" style={{ color: '#16A34A' }}><span>Descuento por beca{ri.becaMotivo ? ' (' + ri.becaMotivo + ')' : ''}</span><span className="font-mono">− {fmt(ri.descuentoBeca!)}</span></div>
                  <div className="flex justify-between gap-2.5 pl-3 font-medium"><span>Total</span><span className="font-mono">{fmt(ri.monto)}</span></div>
                </div>
              : <div className="flex justify-between gap-2.5"><span className="text-slate-700">{ri.con}</span><span className="font-mono">{fmt(ri.monto)}</span></div>}
            {(ri.descuento ?? 0) > 0 && <div className="-mt-1 flex justify-between gap-2.5 text-[11px]" style={{ color: '#16A34A' }} data-testid="recibo-descuento-linea"><span>Descuento{ri.descuentoMotivo ? ' · ' + ri.descuentoMotivo : ''}</span><span className="font-mono">− {fmt(ri.descuento!)}</span></div>}
          </Fragment>)}
          <div className="my-1.5 border-t border-dashed border-slate-200" />
          {recibo.pays.map((rp, k) => <div key={k} className="flex justify-between"><span className="text-slate-500">{rp.m} <span className="font-mono">{rp.r}</span></span><span className="font-mono">{fmt(rp.amt)}</span></div>)}
          <div className="mt-1 flex justify-between text-[15px] font-semibold"><span>{recibo.abono ? 'Abono' : 'Total'}</span><span className="font-mono" style={{ textDecoration: an ? 'line-through' : 'none' }}>{fmt(recibo.monto)}</span></div>
          {recibo.abono && <div className="flex justify-between font-semibold text-warn-fg"><span>Saldo pendiente</span><span className="font-mono">{fmt(recibo.saldo)}</span></div>}
          {recibo.change > 0 && <div className="flex justify-between text-ok-fg"><span>Cambio a devolver</span><span className="font-mono font-semibold">{fmt(recibo.change)}</span></div>}
          {(recibo.notas?.length ?? 0) > 0 && <>
            <div className="my-1.5 border-t border-dashed border-slate-200" />
            {recibo.notas!.map(nt => <div key={nt.id} className="flex justify-between"><span className="text-slate-500">Nota de {nt.clase === 'CREDITO' ? 'crédito' : 'débito'} <span className="font-mono">{nt.id}</span></span><span className="font-mono" style={{ color: nt.clase === 'CREDITO' ? '#1D4ED8' : '#B45309' }}>{nt.clase === 'CREDITO' ? '−' : '+'}{fmt(nt.monto)}</span></div>)}
            {(recibo.acreditado ?? 0) > 0 && <div className="flex justify-between font-semibold"><span>Neto del recibo</span><span className="font-mono" data-testid="recibo-neto">{fmt(recibo.neto ?? 0)}</span></div>}
          </>}
          {(recibo.notasDebitoCobradas?.length ?? 0) > 0 && <div className="rounded-md bg-warn-bg px-2 py-1 text-xs font-medium text-warn-fg">Incluye el cobro de la nota de débito {recibo.notasDebitoCobradas!.map(x => x.id + ' (' + x.ncf + ')').join(', ')}</div>}
        </div>
        <div className="flex flex-wrap justify-end gap-2 border-t border-slate-200 bg-slate-50 px-5 py-3.5">
          {onNota && !an && <>
            <button onClick={() => onNota('credito')} className="flex h-9 items-center gap-1.5 rounded-md border border-slate-300 bg-white px-3 text-xs font-medium text-slate-700 hover:bg-slate-100"><i className="ph ph-arrow-u-down-left" />Emitir nota de crédito</button>
            <button onClick={() => onNota('debito')} className="flex h-9 items-center gap-1.5 rounded-md border border-slate-300 bg-white px-3 text-xs font-medium text-slate-700 hover:bg-slate-100"><i className="ph ph-plus-circle" />Emitir nota de débito</button>
          </>}
          <button onClick={onClose} className="h-9 rounded-md border border-slate-300 bg-white px-3.5 text-[13px] font-medium">Cerrar</button>
          <button onClick={() => void enviar()} disabled={sending} className="flex h-[34px] items-center gap-1.5 rounded-md border border-slate-300 bg-white px-3 text-[13px] font-medium hover:bg-slate-100"><i className="ph ph-envelope-simple" />Enviar por Correo</button>
          <button onClick={imprimir} className="flex h-9 items-center gap-1.5 rounded-md border border-accent bg-white px-3.5 text-[13px] font-semibold text-accent hover:bg-blue-50"><i className={pbr.icon} style={{ animation: pbr.spin }} />{pbr.label}</button>
        </div>
      </div>
    </div>
  );
}
