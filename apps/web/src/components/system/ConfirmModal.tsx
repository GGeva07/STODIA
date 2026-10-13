import type { ReactNode } from 'react';
import { Modal } from './UiProvider';

/** Confirmación en pantalla (sustituye a window.confirm). Esc, clic fuera y «Cancelar» cierran salvo mientras `busy`. */
export default function ConfirmModal({ title, children, confirmLabel, busyLabel, cancelLabel = 'Cancelar', danger, busy, error, icon = 'ph ph-question', onConfirm, onClose }: {
  title: string; children?: ReactNode; confirmLabel: string; busyLabel?: string; cancelLabel?: string; danger?: boolean; busy?: boolean; error?: string; icon?: string;
  onConfirm: () => void; onClose: () => void;
}) {
  const close = () => { if (!busy) onClose(); };
  return (
    <Modal onClose={close}>
      <div className="flex items-start gap-3 p-5">
        <span className={`grid h-10 w-10 flex-none place-items-center rounded-full text-xl ${danger ? 'bg-bad-bg text-[#DC2626]' : 'bg-slate-100 text-slate-600'}`}><i className={danger ? 'ph ph-warning' : icon} /></span>
        <div className="min-w-0 flex-1">
          <div className="text-base font-semibold">{title}</div>
          {children && <div className="mt-1 text-[13px] leading-normal text-slate-600">{children}</div>}
          {error && <div role="alert" className="mt-2 text-xs font-medium text-[#DC2626]">{error}</div>}
        </div>
      </div>
      <div className="flex justify-end gap-2 border-t border-slate-200 bg-slate-50 px-5 py-3.5">
        <button onClick={close} disabled={busy} className="h-9 rounded-md border border-slate-300 bg-white px-3.5 text-[13px] font-medium disabled:opacity-50">{cancelLabel}</button>
        <button onClick={onConfirm} disabled={busy} autoFocus className={`h-9 rounded-md px-3.5 text-[13px] font-semibold text-white disabled:cursor-not-allowed disabled:opacity-60 ${danger ? 'bg-[#DC2626]' : 'bg-slate-900'}`}>{busy ? (busyLabel ?? confirmLabel) : confirmLabel}</button>
      </div>
    </Modal>
  );
}
