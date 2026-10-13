import { useState } from 'react';
import { AvisoBorrador, useDraft } from '../../lib/useDraft';
import SideDrawer from '../../components/finanzas/SideDrawer';
import { errMsg, norm } from '../../components/finanzas/fin';
import { CAT_DEF, type Cat, type FieldDef, type Lbl, type Row } from './defs';

type V = Record<string, unknown>;
interface Props { k: string; row: Row | null; cat: Cat; roles: string[]; L: Lbl; onClose: () => void; onSave: (payload: V, id: string | null) => Promise<void> }

/** Formulario lateral de alta/edición (catForm del prototipo). Valida en cliente; la API vuelve a validar. */
export default function CatalogoForm({ k, row, cat, roles, L, onClose, onSave }: Props) {
  const def = CAT_DEF[k], estados = def.estados ?? ['Activo', 'Inactivo'];
  // Borrador por catálogo y registro. Las contraseñas (campos «password») NUNCA se guardan. «×»/fondo lo conservan; «Cancelar» y guardar con éxito lo descartan.
  const [v, setV, limpiar, meta] = useDraft<V>(`catalogo:${k}:${row?.id ?? 'nuevo'}`, () => {
    const x: V = row ? JSON.parse(JSON.stringify(row)) : { estado: estados[0] };
    def.fields.forEach(f => {
      if (x[f.k] == null) x[f.k] = f.t === 'multi' ? [] : f.t === 'info' ? 0 : '';
      if (f.t === 'int') x[f.k] = String(x[f.k]);
      if (f.t === 'password') x[f.k] = '';
    });
    return x;
  }, { porCiclo: false, omitir: def.fields.filter(f => f.t === 'password').map(f => f.k) });
  const [err, setErr] = useState<Record<string, string>>({});
  const [top, setTop] = useState('');
  const [busy, setBusy] = useState(false);
  const [temp, setTemp] = useState(false); // «Crear acceso» con contraseña temporal aleatoria (docentes/empleados)
  const set = (key: string, val: unknown) => { setV(x => ({ ...x, [key]: val })); setErr(e => ({ ...e, [key]: '' })); setTop(''); };
  const id = row?.id ?? null;

  const save = async () => {
    const out: V = { ...v }, e: Record<string, string> = {};
    if (temp) out.password = '';
    def.fields.forEach(f => {
      if (f.upper && typeof out[f.k] === 'string') out[f.k] = (out[f.k] as string).toUpperCase();
      if (typeof out[f.k] === 'string') out[f.k] = (out[f.k] as string).trim();
      const val = out[f.k];
      if (f.req && (val === '' || val == null || (Array.isArray(val) && !val.length))) { e[f.k] = 'Campo requerido'; return; }
      if (f.t === 'int' && val !== '' && (!/^\d+$/.test(String(val)) || Number(val) <= 0)) e[f.k] = 'Debe ser un número entero mayor que 0';
      if (k === 'rubricas' && f.k === 'crit' && val) {
        const sum = Math.round(((String(val).match(/(\d+(?:\.\d+)?)\s*%/g) || []).map(parseFloat)).reduce((a, b) => a + b, 0));
        if (sum !== 100) { e[f.k] = `Los pesos suman ${sum}%; deben sumar 100%`; return; }
      }
      if (f.t === 'password') {
        if (val && String(val).length < 8) e[f.k] = 'Mínimo 8 caracteres';
        return;
      }
      if (f.t === 'time' && val !== '' && !/^([01]\d|2[0-3]):[0-5]\d$/.test(String(val))) e[f.k] = 'Formato HH:MM (24 h)';
    });
    def.uniq.forEach(combo => {
      if (combo.some(c => e[c] || out[c] === '')) return;
      const dup = cat[k].find(r => r.id !== id && combo.every(c => norm(String(r[c] ?? '')) === norm(String(out[c] ?? ''))));
      if (dup) e[combo[combo.length - 1]] = 'Ya existe: ' + def.label(dup, L);
    });
    if (k === 'secciones' && !e.cap) {
      const cap = Number(out.cap), aula = cat.aulas.find(a => a.id === out.aula);
      if (cap < Number(out.insc || 0)) e.cap = `Hay ${out.insc} alumnos inscritos; la capacidad no puede ser menor`;
      else if (aula && cap > Number(aula.pupitres)) e.cap = `${aula.nombre} solo tiene ${aula.pupitres} pupitres`;
    }
    if (k === 'tandas' && !e.ini && !e.fin && String(out.fin) <= String(out.ini)) e.fin = 'Debe ser posterior a la hora de entrada';
    if (Object.keys(e).length) { setErr(e); return; }
    setBusy(true);
    try { await onSave({ ...out, _acceso: temp }, id); limpiar(); } catch (x) { setTop(errMsg(x)); setBusy(false); }
  };

  const optsFor = (f: FieldDef): { v: string; l: string }[] => {
    if (f.t === 'select') return f.opts!.map(o => ({ v: o, l: o }));
    if (f.t === 'role') return roles.map(o => ({ v: o, l: o }));
    return cat[f.ref!].filter(r => /^Activ/.test(r.estado) || r.id === v[f.k]).map(r => ({ v: r.id, l: L(f.ref!, r.id) + (f.ref === 'aulas' ? ` · ${r.pupitres} pupitres` : '') }));
  };

  const fields: FieldDef[] = [...def.fields, { k: 'estado', l: 'Estado', t: 'select', opts: estados, req: 1 }];
  return (
    <SideDrawer width={440} z={80} onClose={onClose}>
      <div className="flex items-start justify-between gap-3 border-b border-slate-200 px-5 py-4">
        <div>
          <div className="text-base font-semibold">{(id ? 'Editar ' : def.fem ? 'Nueva ' : 'Nuevo ') + def.one}</div>
          <div className="mt-[3px] font-mono text-[11px] text-slate-500">{id ? `PUT /api/catalog/${k}/${id}` : `POST /api/catalog/${k}`}</div>
        </div>
        <button onClick={onClose} aria-label="Cerrar" className="h-8 w-8 flex-none rounded-md border border-slate-300 bg-white"><i className="ph ph-x" /></button>
      </div>
      <div className="flex flex-1 flex-col gap-3.5 overflow-auto px-5 py-4">
        <AvisoBorrador meta={meta} />
        {fields.map(f => {
          const e = err[f.k], val = v[f.k], bd = e ? 'border-red-600' : 'border-slate-300';
          return (
            <div key={f.k} className="flex flex-col gap-[5px]">
              <span className="text-xs font-medium text-slate-600">{f.l}{f.req && <span className="text-red-600"> *</span>}</span>
              {f.t === 'password' && (
                <label className="flex cursor-pointer items-start gap-2 text-xs text-slate-700">
                  <input type="checkbox" checked={temp} onChange={ev => { setTemp(ev.target.checked); set('password', ''); }} className="mt-[2px]" />
                  <span><b>{row?.password ? 'Restablecer con contraseña temporal' : 'Crear acceso con contraseña temporal'}</b> · se genera al azar, se muestra e imprime una sola vez y debe cambiarse en el primer ingreso.</span>
                </label>
              )}
              {(f.t === 'text' || f.t === 'int' || f.t === 'time' || f.t === 'password') && (
                <input
                  type={f.t === 'password' ? 'password' : 'text'} autoComplete="new-password" disabled={f.t === 'password' && temp} value={String(val ?? '')} onChange={ev => set(f.k, ev.target.value)}
                  placeholder={f.t === 'password' && id ? 'Dejar vacío para mantener la actual' : f.ph}
                  className={`box-border h-9 w-full rounded-md border bg-white px-2.5 text-[13px] text-ink outline-none focus:border-accent ${bd} ${f.mono ? 'font-mono' : ''}`}
                />
              )}
              {(f.t === 'select' || f.t === 'ref' || f.t === 'role') && (
                <select value={String(val ?? '')} onChange={ev => set(f.k, ev.target.value)} className={`h-9 w-full rounded-md border bg-white px-2 text-[13px] text-ink ${bd}`}>
                  <option value="">{f.req ? 'Seleccionar…' : 'Ninguna'}</option>
                  {optsFor(f).map(o => <option key={o.v} value={o.v}>{o.l}</option>)}
                </select>
              )}
              {f.t === 'multi' && (
                <div className={`flex max-h-48 flex-wrap gap-1.5 overflow-y-auto rounded-md border p-2 ${bd}`}>
                  {cat[f.ref!].filter(r => /^Activ/.test(r.estado) || (val as string[]).includes(r.id)).map(r => {
                    const arr = val as string[], on = arr.includes(r.id);
                    return (
                      <button key={r.id} type="button" onClick={() => set(f.k, on ? arr.filter(x => x !== r.id) : [...arr, r.id])}
                        className={`flex h-7 items-center gap-1 whitespace-nowrap rounded-full border px-2.5 text-xs font-medium ${on ? 'border-accent bg-blue-50 text-blue-700' : 'border-slate-300 bg-white text-slate-600'}`}>
                        <i className={on ? 'ph-bold ph-check' : 'ph ph-plus'} />{L(f.ref!, r.id)}
                      </button>
                    );
                  })}
                </div>
              )}
              {f.t === 'info' && <div className="flex h-9 items-center rounded-md border border-dashed border-slate-300 bg-slate-50 px-2.5 text-[13px] text-slate-600">{String(val || 0)} alumnos · se actualiza desde Inscripción</div>}
              <span className={`text-[11px] leading-snug ${e ? 'text-red-600' : 'text-slate-500'}`}>{e || (f.t === 'password' ? (id ? 'Solo se guarda cifrada (hash); nunca se muestra.' : 'Opcional: sin contraseña no se crea acceso (puedes crearlo después).') : f.hint) || ''}</span>
            </div>
          );
        })}
        {top && <div className="flex items-center gap-1.5 text-xs font-medium text-red-600"><i className="ph ph-warning-circle" />{top}</div>}
      </div>
      <div className="flex justify-end gap-2 border-t border-slate-200 bg-slate-50 px-5 py-3.5">
        <button onClick={() => { limpiar(); onClose(); }} className="h-9 rounded-md border border-slate-300 bg-white px-3.5 text-[13px] font-medium">Cancelar</button>
        <button onClick={save} disabled={busy} className="flex h-9 items-center gap-1.5 rounded-md bg-accent px-4 text-[13px] font-semibold text-white hover:bg-accent-dark disabled:opacity-60"><i className="ph ph-floppy-disk" />{id ? 'Guardar cambios' : 'Crear ' + def.one}</button>
      </div>
    </SideDrawer>
  );
}
