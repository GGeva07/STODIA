import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { AlertaSecuencia } from '@stodia/shared';
import { Modal } from '../system/UiProvider';
import { useSession } from '../../lib/session';
import { canAccess } from '../../lib/access';
import { usePrintOcupado } from './print';

/** Última alerta ya mostrada por secuencia (sesión del navegador): no se repite el mismo estado con el mismo restante. */
const mostradas = new Map<string, string>();

export function textoAlerta(a: AlertaSecuencia): string {
  const base = `La secuencia de ${a.tipo} (${a.codigo})`;
  const n = a.restantes.toLocaleString('es-DO'), t = a.total.toLocaleString('es-DO');
  const fin = ' Solicita una nueva autorización a la DGII y regístrala en Configuración › Gestión fiscal.';
  if (a.restantes === 0) return `${base} se agotó: no quedan comprobantes disponibles de ${t}.${fin}`;
  return `${base} tiene ${n} comprobante${a.restantes === 1 ? '' : 's'} disponible${a.restantes === 1 ? '' : 's'} de ${t}; alcanzó el mínimo configurado (${a.umbralPct} %).${fin}`;
}

/** Modal «Secuencia por agotarse». Se muestra tras facturar, cuando ya no hay vista de impresión ni otro bloqueo (`bloqueado`), y no tapa el flujo de reimpresión. */
export function useAlertaSecuencia(bloqueado = false) {
  const [pend, setPend] = useState<AlertaSecuencia | null>(null);
  const [ver, setVer] = useState<AlertaSecuencia | null>(null);
  const imprimiendo = usePrintOcupado();
  const encolar = useCallback((a: AlertaSecuencia | null | undefined) => {
    if (!a) return;
    const k = a.codigo + '|' + a.tipo, v = a.estado + '|' + a.restantes;
    if (mostradas.get(k) === v) return;
    mostradas.set(k, v); setPend(a);
  }, []);
  useEffect(() => { if (pend && !imprimiendo && !bloqueado && !ver) { setVer(pend); setPend(null); } }, [pend, imprimiendo, bloqueado, ver]);
  const modal = ver ? <AlertaSecuenciaModal alerta={ver} onClose={() => setVer(null)} /> : null;
  return { encolar, modal };
}

export default function AlertaSecuenciaModal({ alerta, onClose }: { alerta: AlertaSecuencia; onClose: () => void }) {
  const { user } = useSession();
  const nav = useNavigate();
  const puedeIr = !!user && canAccess(user.rol, 'config');
  const agotada = alerta.restantes === 0;
  return (
    <Modal onClose={onClose}>
      <div className="flex items-start gap-3 p-5" data-testid="alerta-secuencia">
        <span className="grid h-10 w-10 flex-none place-items-center rounded-full text-xl" style={{ background: agotada ? '#FEE2E2' : '#FEF3C7', color: agotada ? '#DC2626' : '#B45309' }}><i className="ph ph-warning" /></span>
        <div className="min-w-0 flex-1">
          <div className="text-base font-semibold">{agotada ? 'Secuencia agotada' : 'Secuencia por agotarse'}</div>
          <div className="mt-1 text-[13px] leading-normal text-slate-600" data-testid="alerta-secuencia-texto">{textoAlerta(alerta)}</div>
          {alerta.vence && <div className="mt-1.5 text-xs text-slate-500">Vence: {alerta.vence.split('-').reverse().join('/')}</div>}
        </div>
      </div>
      <div className="flex justify-end gap-2 border-t border-slate-200 bg-slate-50 px-5 py-3.5">
        {puedeIr && <button onClick={() => { onClose(); nav('/config?tab=fiscal'); }} className="h-9 rounded-md border border-slate-300 bg-white px-3.5 text-[13px] font-medium">Ir a Gestión fiscal</button>}
        <button onClick={onClose} autoFocus className="h-9 rounded-md bg-slate-900 px-3.5 text-[13px] font-semibold text-white">Entendido</button>
      </div>
    </Modal>
  );
}
