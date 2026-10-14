import { useState } from 'react';
import { errMsg } from './fin';
import { autorizarSupervisor } from '../../lib/supervisor';

export interface GuardCfg {
  title: string; desc: string; label: string;
  /** Texto que el usuario debe escribir para confirmar (p. ej. ANULAR-REC-0417). */
  code?: string;
  /** Pide clave de supervisor (no se muestra a Super Admin). */
  pin?: boolean;
  /** Campo de texto opcional (p. ej. motivo de la baja): se muestra en el modal y su valor llega como 2.º argumento de onOk. */
  motivo?: { label: string; placeholder?: string; max?: number };
  /** Recibe el token de supervisor de un solo uso (el servidor valida la clave) y el texto del campo opcional; si lanza, se muestra el error y el modal sigue abierto. */
  onOk: (pin: string, motivo?: string) => Promise<void> | void;
}

/** Modal-Guard del prototipo (L1778): confirmación destructiva con texto exacto y/o clave de supervisor. */
export default function SupervisorGuardModal({ cfg, onClose }: { cfg: GuardCfg; onClose: () => void }) {
  const [text, setText] = useState('');
  const [pin, setPin] = useState('');
  const [motivo, setMotivo] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const ready = (!cfg.code || text === cfg.code) && (!cfg.pin || pin.length >= 4) && !busy;

  const ok = async () => {
    if (!ready) return;
    setBusy(true);
    try {
      await cfg.onOk(cfg.pin ? await autorizarSupervisor(pin) : pin, cfg.motivo ? motivo.trim() : undefined);
      onClose();
    } catch (e) {
      setErr(errMsg(e));
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[80] grid place-items-center bg-slate-900/55 p-5">
      <div className="w-[460px] max-w-full overflow-hidden rounded-[10px] bg-white shadow-2xl" role="dialog" aria-modal="true">
        <div className="flex items-start gap-3 px-5 py-[18px]">
          <span className="grid h-10 w-10 flex-none place-items-center rounded-full bg-bad-bg text-xl text-red-600"><i className="ph ph-shield-warning" /></span>
          <div>
            <div className="text-base font-semibold">{cfg.title}</div>
            <div className="mt-1 text-[13px] leading-normal text-slate-600">{cfg.desc}</div>
          </div>
        </div>
        <div className="flex flex-col gap-3 px-5 pb-4">
          {cfg.code && (
            <label className="flex flex-col gap-1 text-xs font-medium text-slate-600">
              Escribe <span className="self-start rounded bg-bad-bg px-1.5 py-px font-mono text-xs font-semibold leading-[normal] text-bad-fg">{cfg.code}</span> para confirmar
              <input
                value={text}
                onChange={e => { setText(e.target.value.toUpperCase()); setErr(''); }}
                className={`h-[38px] rounded-md border px-2.5 font-mono text-sm outline-none ${text && text !== cfg.code ? 'border-red-300' : 'border-slate-300'}`}
              />
            </label>
          )}
          {cfg.motivo && (
            <label className="flex flex-col gap-1 text-xs font-medium text-slate-600">
              {cfg.motivo.label}
              <textarea value={motivo} maxLength={cfg.motivo.max ?? 300} rows={2} placeholder={cfg.motivo.placeholder} onChange={e => setMotivo(e.target.value)} className="resize-none rounded-md border border-slate-300 px-2.5 py-2 text-sm font-normal outline-none focus:border-accent" />
            </label>
          )}
          {cfg.pin && (
            <div className="flex flex-col gap-1.5 rounded-lg bg-warn-bg p-3">
              <div className="flex items-center gap-1.5 text-xs font-semibold text-amber-800"><i className="ph ph-hourglass-medium" />Pending Supervisor Override</div>
              <label className="flex flex-col gap-1 text-xs font-medium text-amber-900">
                Clave de supervisor (Super Admin / Director Financiero)
                <input
                  type="password" value={pin} placeholder="••••"
                  onChange={e => { setPin(e.target.value); setErr(''); }}
                  className="h-[38px] rounded-md border border-amber-300 bg-white px-2.5 font-mono text-sm outline-none"
                />
              </label>
            </div>
          )}
          {err && <div className="text-xs font-medium text-red-600">{err}</div>}
        </div>
        <div className="flex justify-end gap-2 border-t border-slate-200 bg-slate-50 px-5 py-3.5">
          <button onClick={onClose} className="h-9 rounded-md border border-slate-300 bg-white px-3.5 text-[13px] font-medium">Cancelar</button>
          <button
            onClick={ok}
            className={`h-9 rounded-md px-3.5 text-[13px] font-semibold text-white ${ready ? 'cursor-pointer bg-red-600' : 'cursor-not-allowed bg-red-300'}`}
          >{cfg.label}</button>
        </div>
      </div>
    </div>
  );
}
