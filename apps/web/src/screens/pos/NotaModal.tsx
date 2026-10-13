import { useState } from 'react';
import type { NotaFiscalDto, ReciboEnvioRes } from '@stodia/shared';
import { api } from '../../lib/api';
import { errMsg, fmt, fmtDoc } from '../../components/finanzas/fin';
import { runPrint, usePrintBusy } from '../../components/finanzas/print';
import { docNota } from '../../components/finanzas/printNotas';
import type { ToastTone } from '../../components/useToastStack';

/**
 * Modal de una NOTA DE CREDITO / DEBITO. Es EL MISMO tras emitirla (POST /cobros/notas/credito|debito) y al abrirla desde el listado (GET /cobros/notas/:id):
 * ambos entregan el MISMO DTO (API lib/notas.notaDto), asi que contenido, botones, tirilla y carta son identicos. Mismo patron visual que ReciboModal.
 * `origen` solo cambia la auditoria: imprimir desde el listado queda registrado como «Reimpresión de nota».
 */
export default function NotaModal({ nota, onClose, toast, origen = 'emision', z = 75 }: { nota: NotaFiscalDto; onClose: () => void; toast: (msg: string, tone?: ToastTone) => void; origen?: 'emision' | 'historial'; z?: number }) {
  const pbT = usePrintBusy()('nota-t', 'Imprimir Tirilla', 'ph ph-receipt');
  const pbC = usePrintBusy()('nota-c', 'Imprimir Carta / PDF', 'ph ph-file-pdf');
  const [sending, setSending] = useState(false);
  const cr = nota.clase === 'CREDITO', ele = nota.tipoComprobante.modalidad === 'ELECTRONICA';

  const enviar = async () => {
    if (sending) return;
    setSending(true);
    try {
      const r = await api.post<ReciboEnvioRes>(`/cobros/notas/${encodeURIComponent(nota.id)}/enviar`, {});
      if (r.estado === 'Enviado') toast('Nota enviada por correo a ' + r.destino, 'ok');
      else if (r.estado === 'Sin correo') toast('El cliente no tiene correo registrado', 'warn');
      else toast('Canal no configurado: la nota no se envió a ' + r.destino, 'warn');
    } catch (e) { toast(errMsg(e), 'bad'); } finally { setSending(false); }
  };
  const imprimir = (f: 'tirilla' | 'carta') => {
    runPrint(f === 'tirilla' ? 'nota-t' : 'nota-c', docNota(nota, f));
    if (origen === 'historial') void api.post(`/cobros/notas/${encodeURIComponent(nota.id)}/reimprimir`, {}).catch(() => undefined);
  };

  return (
    <div className="fixed inset-0 grid place-items-center bg-slate-900/50 p-5" style={{ zIndex: z }} data-nota-modal>
      <div className="max-h-[calc(100vh-40px)] w-[440px] max-w-full overflow-auto rounded-[10px] bg-white shadow-2xl" role="dialog" aria-modal="true" aria-label={'Nota ' + nota.id}>
        <div className="flex items-center gap-3 border-b border-slate-200 px-5 py-[18px]">
          <i className={`text-[28px] ${cr ? 'ph-fill ph-arrow-u-down-left text-blue-600' : 'ph-fill ph-plus-circle text-amber-600'}`} />
          <div>
            <div className="text-base font-semibold">{cr ? 'Nota de crédito emitida' : 'Nota de débito emitida'}</div>
            <div className="text-xs text-slate-600">{ele && nota.estadoDgii === 'PendienteEnvio' ? 'e-NCF emitido · pendiente de envío a la DGII' : nota.tipoComprobante.nombre + ' · ' + (ele ? 'e-NCF' : 'NCF') + ' asignado'}</div>
          </div>
        </div>
        <div className="flex flex-col gap-1.5 px-5 py-4 text-[13px]">
          <div className="flex justify-between"><span className="text-slate-500">Nota</span><span className="font-mono">{nota.id}</span></div>
          <div className="flex justify-between gap-2.5"><span className="text-slate-500">Comprobante</span><span data-testid="nota-tipo" className="text-right">{nota.tipoComprobante.nombre} <span className="font-mono text-slate-500">({nota.tipoComprobante.codigo}…)</span></span></div>
          <div className="flex justify-between"><span className="text-slate-500">{ele ? 'e-NCF' : 'NCF'}</span><span className="font-mono">{nota.ncf}</span></div>
          {ele && nota.estadoDgii === 'PendienteEnvio' && <div className="flex items-center gap-1.5 rounded-md bg-warn-bg px-2 py-1 text-xs font-medium text-warn-fg"><i className="ph ph-paper-plane-tilt" />e-NCF pendiente de envío a la DGII</div>}
          <div className="flex justify-between"><span className="text-slate-500">{ele ? 'e-NCF modificado' : 'NCF modificado'}</span><span className="font-mono">{nota.documento.ncf}</span></div>
          <div className="flex justify-between"><span className="text-slate-500">{nota.documento.tipo === 'recibo' ? 'Recibo' : 'Venta'} afectado</span><span className="font-mono">{nota.documento.id}</span></div>
          <div className="flex justify-between"><span className="text-slate-500">Cliente</span><span className="text-right">{nota.cliente.nombre}</span></div>
          {nota.cliente.rnc && <div className="flex justify-between"><span className="text-slate-500">RNC/Cédula</span><span className="font-mono">{fmtDoc(nota.cliente.rnc)}</span></div>}
          {nota.alumnos.length > 0 && <div className="flex justify-between gap-2.5"><span className="text-slate-500">Alumno(s)</span><span className="text-right">{nota.alumnos.join(', ')}</span></div>}
          <div className="flex justify-between gap-2.5"><span className="text-slate-500">Motivo</span><span className="text-right">{nota.motivo.codigo} · {nota.motivo.nombre}</span></div>
          {nota.motivoTexto && <div className="rounded-md bg-slate-50 px-2 py-1 text-xs text-slate-600">{nota.motivoTexto}</div>}
          {nota.fueraDePlazo && <div className="flex items-center gap-1.5 text-xs font-medium text-warn-fg"><i className="ph ph-clock-countdown" />Emitida fuera de plazo con autorización de supervisor</div>}
          <div className="my-1.5 border-t border-dashed border-slate-200" />
          {nota.lineas.map((l, k) => (
            <div key={k} className="flex justify-between gap-2.5"><span className="text-slate-700">{l.concepto}{l.alumno ? <span className="text-slate-400"> · {l.alumno}</span> : null}{l.efecto === 'ReabreCargo' && <span className="ml-1 rounded bg-warn-bg px-1 text-[10px] font-semibold text-warn-fg">vuelve a cobrarse</span>}{l.efecto === 'Devolucion' && <span className="ml-1 rounded bg-info-bg px-1 text-[10px] font-semibold text-info-fg">repuesto al inventario</span>}</span><span className="font-mono">{fmt(l.monto)}</span></div>
          ))}
          {nota.cargos && nota.cargos.length > 0 && <>
            <div className="mt-1 text-[11px] font-semibold uppercase tracking-wide text-slate-500">Cargos creados · se cobran en Cobros</div>
            {nota.cargos.map(c => <div key={c.id} className="flex justify-between gap-2.5 text-xs"><span className="text-slate-600">{c.con} <span className="text-slate-400">· vence {c.vence}{c.pagado ? ' · cobrado' : ''}</span></span><span className="font-mono">{fmt(c.monto)}</span></div>)}
          </>}
          {nota.reembolsos.length > 0 && <div className="my-1.5 border-t border-dashed border-slate-200" />}
          {nota.reembolsos.map((r, k) => <div key={k} className="flex justify-between"><span className="text-slate-500">Devuelto en {r.metodo} <span className="font-mono">{r.referencia}</span></span><span className="font-mono">{fmt(r.monto)}</span></div>)}
          <div className="mt-1 flex justify-between text-[15px] font-semibold"><span>{cr ? 'Total acreditado' : 'Total a cobrar'}</span><span className="font-mono">{fmt(nota.monto)}</span></div>
          {nota.documentoAnulado && <div className="flex items-center gap-1.5 text-xs font-semibold text-bad-fg"><i className="ph ph-x-circle" />El recibo quedó anulado (acreditado por completo)</div>}
          {cr && (nota.reabiertos ?? 0) > 0 && <div className="text-xs text-slate-600">Se reabrieron {nota.reabiertos} cargo(s) por {fmt(nota.montoReabierto ?? 0)}: vuelven a la deuda del alumno.</div>}
          {cr && (nota.unidadesRepuestas ?? 0) > 0 && <div className="text-xs text-slate-600">Se repusieron {nota.unidadesRepuestas} unidad(es) al inventario.</div>}
          <div className="text-[11px] text-slate-400">{nota.fecha} {nota.hora} · {nota.cajero}{nota.caja ? ' · ' + nota.caja : ''}</div>
        </div>
        <div className="flex flex-wrap justify-end gap-2 border-t border-slate-200 bg-slate-50 px-5 py-3.5">
          <button onClick={onClose} className="h-9 rounded-md border border-slate-300 bg-white px-3.5 text-[13px] font-medium">Cerrar</button>
          <button onClick={() => void enviar()} disabled={sending} className="flex h-[34px] items-center gap-1.5 rounded-md border border-slate-300 bg-white px-3 text-[13px] font-medium hover:bg-slate-100"><i className="ph ph-envelope-simple" />Enviar por Correo</button>
          <button onClick={() => imprimir('tirilla')} className="flex h-9 items-center gap-1.5 rounded-md border border-accent bg-white px-3 text-[13px] font-semibold text-accent hover:bg-blue-50"><i className={pbT.icon} style={{ animation: pbT.spin }} />{pbT.label}</button>
          <button onClick={() => imprimir('carta')} className="flex h-9 items-center gap-1.5 rounded-md border border-slate-300 bg-white px-3 text-[13px] font-semibold hover:bg-slate-100"><i className={pbC.icon} style={{ animation: pbC.spin }} />{pbC.label}</button>
        </div>
      </div>
    </div>
  );
}
