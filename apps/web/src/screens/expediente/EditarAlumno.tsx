import { useState, type ReactNode } from 'react';
import { AvisoBorrador, useDraft } from '../../lib/useDraft';
import type { Alumno } from '@stodia/shared';
import { api } from '../../lib/api';
import { errMsg } from '../../components/finanzas/fin';
import { autorizarSupervisor } from '../../lib/supervisor';
import { opciones, usePersRef } from '../../components/personas/ref';

const inCls = 'h-9 rounded-md border border-slate-300 bg-white px-2.5 text-[13px] text-ink outline-none focus:border-accent';
const Lbl = ({ t, children }: { t: string; children: ReactNode }) => <label className="flex flex-col gap-1 text-xs font-medium text-slate-600">{t}{children}</label>;

/** Edición de la ficha del alumno desde el expediente: exige clave de supervisor (Super Admin entra directo). */
export default function EditarAlumno({ alumno, pin, onClose, onSaved }: { alumno: Alumno; pin: boolean; onClose: () => void; onSaved: (changed: number) => void }) {
  const ref = usePersRef();
  // Borrador por alumno. Se descarta con «Cancelar» y al guardar; la clave de supervisor NUNCA se guarda (es un useState normal).
  const [f, setF, limpiar, meta] = useDraft<Alumno>('alumno-editar:' + alumno.id, () => ({ ...alumno }));
  const [clave, setClave] = useState('');
  const [motivo, setMotivo] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const set = (k: keyof Alumno) => (e: { target: { value: string } }) => { setF(s => ({ ...s, [k]: e.target.value })); setErr(''); };
  const ready = !!f.nombres.trim() && !!f.apellidos.trim() && (!pin || clave.length >= 4) && !busy;

  const save = async () => {
    if (!ready) return;
    setBusy(true);
    try {
      const token = pin ? await autorizarSupervisor(clave, 'alumno.editar') : undefined;
      const res = await api.put<{ alumno: Alumno; changed: number }>(`/directorio/${alumno.id}`, { ...f, pin: token, ...(f.estado !== alumno.estado && f.estado !== 'Activo' && motivo.trim() ? { motivoRetiro: motivo.trim() } : {}) });
      limpiar();
      onSaved(res.changed);
    } catch (e) { setErr(errMsg(e)); setBusy(false); }
  };

  return (
    <div className="fixed inset-0 z-[80] grid place-items-center bg-slate-900/55 p-5">
      <div className="flex max-h-full w-[560px] max-w-full flex-col overflow-hidden rounded-[10px] bg-white shadow-2xl" role="dialog" aria-modal="true" aria-label="Editar alumno">
        <div className="border-b border-slate-200 px-5 py-4">
          <div className="text-base font-semibold">Editar alumno</div>
          <div className="font-mono text-xs text-slate-500">{alumno.code}</div>
        </div>
        <div className="flex flex-col gap-3.5 overflow-auto px-5 py-4">
          <AvisoBorrador meta={meta} />
          <div className="grid grid-cols-2 gap-3">
            <Lbl t="Nombres *"><input value={f.nombres} onChange={set('nombres')} className={inCls} /></Lbl>
            <Lbl t="Apellidos *"><input value={f.apellidos} onChange={set('apellidos')} className={inCls} /></Lbl>
            <Lbl t="Fecha de nacimiento"><input type="date" value={f.fnac} onChange={set('fnac')} className={inCls} /></Lbl>
            <Lbl t="Estado"><select value={f.estado} onChange={set('estado')} className={inCls}><option>Activo</option><option>Inactivo</option><option>Retirado</option></select></Lbl>
            <Lbl t="Grado"><select value={f.grado} onChange={set('grado')} className={inCls}>{opciones(ref.grados, f.grado).map(g => <option key={g}>{g}</option>)}</select></Lbl>
            <Lbl t="Sección"><select value={f.sec} onChange={set('sec')} className={inCls}>{opciones(ref.secciones, f.sec).map(g => <option key={g}>{g}</option>)}</select></Lbl>
            <Lbl t="Tanda"><select value={f.tanda} onChange={set('tanda')} className={inCls}>{opciones(ref.tandas, f.tanda).map(g => <option key={g}>{g}</option>)}</select></Lbl>
            <Lbl t="Teléfono de emergencia"><input value={f.tel} onChange={set('tel')} className={inCls} /></Lbl>
          </div>
          <Lbl t="Dirección de residencia"><input value={f.dir} onChange={set('dir')} className={inCls} /></Lbl>
          {f.estado !== alumno.estado && f.estado !== 'Activo' && (
            <Lbl t={`Motivo del cambio a ${f.estado} (opcional)`}><input value={motivo} maxLength={300} onChange={e => setMotivo(e.target.value)} placeholder="Ej.: traslado a otro colegio" className={inCls} /></Lbl>
          )}
          {pin && (
            <div className="flex flex-col gap-1.5 rounded-lg bg-warn-bg p-3">
              <label className="flex flex-col gap-1 text-xs font-medium text-amber-900">
                Clave de supervisor (Super Admin / Director Financiero)
                <input type="password" value={clave} placeholder="••••" onChange={e => { setClave(e.target.value); setErr(''); }} className="h-[38px] rounded-md border border-amber-300 bg-white px-2.5 font-mono text-sm outline-none" />
              </label>
            </div>
          )}
          {err && <div className="text-xs font-medium text-red-600">{err}</div>}
        </div>
        <div className="flex justify-end gap-2 border-t border-slate-200 bg-slate-50 px-5 py-3.5">
          <button onClick={() => { limpiar(); onClose(); }} className="h-9 rounded-md border border-slate-300 bg-white px-3.5 text-[13px] font-medium">Cancelar</button>
          <button onClick={save} className={`h-9 rounded-md px-3.5 text-[13px] font-semibold text-white ${ready ? 'bg-accent' : 'cursor-not-allowed bg-blue-300'}`}>Guardar cambios</button>
        </div>
      </div>
    </div>
  );
}
