import { SL_MSG, useSoloLectura } from '../../lib/ciclo';
import { AvisoBorrador, useDraft } from '../../lib/useDraft';
import { useState } from 'react';
import type { AcadExtra, AcadExtraInput } from '@stodia/shared';
import SideDrawer from '../../components/finanzas/SideDrawer';
import { errMsg, fmt } from '../../components/finanzas/fin';

export const CATS = ['Deportes', 'Danza', 'Arte', 'Música', 'Académico'];
export type Mode = 'create' | 'view' | 'edit';
const BLANK: AcadExtra = { id: '', name: '', cat: 'Deportes', kind: 'act', instructor: '', lugar: '', dias: 'Lun y Mié', hora: '3:00 – 4:30 PM', grados: '4to – 6to', cupo: 20, inscritos: 0, costo: 1500, ini: '', sem: 0, estado: 'Abierta' };
const lbl = 'flex flex-col gap-1 text-xs font-medium text-slate-600';
const mono = 'font-mono text-right';

interface Props {
  item: AcadExtra | null; mode: Mode;
  onClose: () => void;
  /** Pide autorización (si hace falta) y pasa a modo edición. */
  onEdit: () => void;
  onDelete: (a: AcadExtra) => void;
  /** Guarda en la API; lanza si falla (el error se muestra en el panel). */
  onSave: (f: AcadExtraInput, id: string | null) => Promise<void>;
}

/** Panel lateral Ver / Editar / Nueva actividad o curso (xd del prototipo). */
export default function ExtraDrawer({ item, mode, onClose, onEdit, onDelete, onSave }: Props) {
  const sl = useSoloLectura(); // Fase 2D: ciclo que no es el activo
  // Borrador por actividad (o «nueva»): «×»/fondo lo conservan; «Cancelar» y guardar con éxito lo descartan. En modo «ver» no se guarda.
  const [f, setF, limpiar, meta] = useDraft<AcadExtra>('extra:' + (item?.id ?? 'nueva'), item ?? BLANK, { pausado: mode === 'view' });
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const ro = mode === 'view', curso = f.kind === 'curso';
  const set = <K extends keyof AcadExtra>(k: K, v: AcadExtra[K]) => { setF(x => ({ ...x, [k]: v })); setErr(''); };
  const field = `h-9 w-full rounded-md border px-2.5 text-[13px] text-ink outline-none focus:border-accent disabled:text-ink ${ro ? 'border-slate-200 bg-slate-50' : 'border-slate-300 bg-white'}`;
  const sel = `h-9 w-full rounded-md border px-2 text-[13px] text-ink ${ro ? 'border-slate-200 bg-slate-50' : 'border-slate-300 bg-white'}`;

  const impact = f.costo
    ? (curso ? `Se generará 1 cargo de ${fmt(f.costo)} en CxC al inscribir a cada alumno.` : `Se generarán cuotas mensuales de ${fmt(f.costo)} en CxC desde la inscripción hasta mayo.`) + ` Cupo: ${f.inscritos}/${f.cupo || '?'}.`
    : 'Actividad gratuita: no genera cargos en CxC.';

  const primary = async () => {
    if (ro) { onEdit(); return; }
    setBusy(true);
    try { await onSave({ ...f }, mode === 'create' ? null : f.id); limpiar(); } catch (e) { setErr(errMsg(e)); setBusy(false); }
  };

  return (
    <SideDrawer width={520} onClose={onClose}>
      <div className="flex items-center gap-3 border-b border-slate-200 px-5 py-4">
        <div className="min-w-0 flex-1">
          <div className="text-[15px] font-semibold">{mode === 'create' ? 'Nueva actividad o curso' : (mode === 'edit' ? 'Editar · ' : '') + f.name}</div>
          <div className="text-xs text-slate-500">{mode === 'create' ? 'Aparecerá en Inscripción y en Servicios y Contrato del expediente' : `${f.id} · ${f.inscritos} alumnos inscritos`}</div>
        </div>
        <button onClick={onClose} aria-label="Cerrar" className="h-8 w-8 rounded-md border border-slate-300 bg-white"><i className="ph ph-x" /></button>
      </div>
      <div className="flex flex-1 flex-col gap-3.5 overflow-auto px-5 py-[18px]">
        {!ro && <AvisoBorrador meta={meta} />}
        <label className={lbl}>Nombre *<input value={f.name} onChange={e => set('name', e.target.value)} disabled={ro} className={field} /></label>
        <div className="grid grid-cols-2 gap-2.5">
          <label className={lbl}>Categoría<select value={f.cat} onChange={e => set('cat', e.target.value)} disabled={ro} className={sel}>{CATS.map(c => <option key={c}>{c}</option>)}</select></label>
          <label className={lbl}>Tipo<select value={f.kind} onChange={e => set('kind', e.target.value as AcadExtra['kind'])} disabled={ro} className={sel}><option value="act">Actividad (todo el ciclo)</option><option value="curso">Curso (duración fija)</option></select></label>
          <label className={lbl}>Instructor *<input value={f.instructor} onChange={e => set('instructor', e.target.value)} disabled={ro} className={field} /></label>
          <label className={lbl}>Lugar<input value={f.lugar} onChange={e => set('lugar', e.target.value)} disabled={ro} className={field} /></label>
          <label className={lbl}>Días<select value={f.dias} onChange={e => set('dias', e.target.value)} disabled={ro} className={sel}>{['Lun y Mié', 'Mar y Jue', 'Viernes', 'Sábado', 'Lun, Mié y Vie', ...(['Lun y Mié', 'Mar y Jue', 'Viernes', 'Sábado', 'Lun, Mié y Vie'].includes(f.dias) ? [] : [f.dias])].map(d => <option key={d}>{d}</option>)}</select></label>
          <label className={lbl}>Horario<input value={f.hora} onChange={e => set('hora', e.target.value)} disabled={ro} className={field} /></label>
          <label className={lbl}>Grados<select value={f.grados} onChange={e => set('grados', e.target.value)} disabled={ro} className={sel}>{['1ro – 3ro', '4to – 6to', '1ro – 6to'].map(g => <option key={g}>{g}</option>)}</select></label>
          <label className={lbl}>Cupo máximo *<input value={f.cupo || ''} onChange={e => set('cupo', Number(e.target.value.replace(/\D/g, '')))} disabled={ro} className={`${field} ${mono}`} /></label>
          <label className={lbl}>Costo (RD$)<input value={f.costo || ''} onChange={e => set('costo', Number(e.target.value.replace(/[^\d.]/g, '')) || 0)} disabled={ro} className={`${field} ${mono}`} /></label>
          <label className={lbl}>Estado<select value={f.estado} onChange={e => set('estado', e.target.value as AcadExtra['estado'])} disabled={ro} className={sel}><option>Abierta</option><option>Cupo lleno</option><option>Cerrada</option></select></label>
        </div>
        {curso && (
          <div className="grid grid-cols-2 gap-2.5">
            <label className={lbl}>Inicio<input value={f.ini} onChange={e => set('ini', e.target.value)} disabled={ro} className={field} /></label>
            <label className={lbl}>Duración (semanas)<input value={f.sem || ''} onChange={e => set('sem', Number(e.target.value.replace(/\D/g, '')))} disabled={ro} className={`${field} ${mono}`} /></label>
          </div>
        )}
        <div className="rounded-md border border-slate-200 bg-slate-50 p-3 text-xs leading-normal text-slate-600">{impact}</div>
        {err && <div className="flex items-center gap-1.5 text-xs font-medium text-red-600"><i className="ph ph-warning-circle" />{err}</div>}
      </div>
      <div className="flex justify-between gap-2 border-t border-slate-200 bg-slate-50 px-5 py-3.5">
        {mode !== 'create' && <button onClick={() => onDelete(f)} disabled={sl} title={sl ? SL_MSG : undefined} className="flex h-9 items-center gap-1.5 rounded-md border border-red-300 bg-white px-3 text-[13px] font-medium text-red-600 disabled:opacity-50"><i className="ph ph-trash" />Eliminar</button>}
        <span className="flex-1" />
        <div className="flex gap-2">
          <button onClick={() => { if (!ro) limpiar(); onClose(); }} className="h-9 rounded-md border border-slate-300 bg-white px-3.5 text-[13px] font-medium">{ro ? 'Cerrar' : 'Cancelar'}</button>
          <button onClick={primary} disabled={busy || sl} title={sl ? SL_MSG : undefined} className="flex h-9 items-center gap-1.5 rounded-md bg-accent px-4 text-[13px] font-semibold text-white hover:bg-accent-dark disabled:opacity-60"><i className={ro ? 'ph ph-pencil-simple' : 'ph ph-floppy-disk'} />{ro ? 'Editar' : mode === 'create' ? 'Crear actividad' : 'Guardar cambios'}</button>
        </div>
      </div>
    </SideDrawer>
  );
}
