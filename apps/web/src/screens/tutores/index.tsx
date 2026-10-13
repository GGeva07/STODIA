import { SL_MSG, useSoloLectura } from '../../lib/ciclo';
import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { TutorAccesoResp, TutorAlumnoOpt, TutorFicha, TutoresResp, TutorRow } from '@stodia/shared';
import { api } from '../../lib/api';
import { canAccess } from '../../lib/access';
import { useSession } from '../../lib/session';
import { Modal, useToast } from '../../components/system/UiProvider';
import { errMsg, fmt } from '../../components/finanzas/fin';
import { pill, pillBase } from '../../components/system/styles';
import SideDrawer from '../../components/finanzas/SideDrawer';
import { printCarta } from '../../components/personas/printCarta';
import { hoyDMY, usePrintBusy } from '../../components/finanzas/print';
import { AvisoBorrador, useDraft } from '../../lib/useDraft';

/** Pantalla «Tutores» del prototipo (catálogo `tutores`, L2314): padres y tutores legales con datos reales de la API. */
const PARENTESCOS = ['Padre', 'Madre', 'Tutor legal', 'Abuelo(a)', 'Otro'];
const TIPOS = ['Financiero y académico', 'Financiero', 'Académico'];
const th = 'whitespace-nowrap border-b border-slate-200 bg-slate-50 px-3 py-2.5 text-left text-[11px] font-semibold uppercase tracking-[0.04em] text-slate-600';
const digits = (s: string) => s.replace(/\D/g, '');
const ini = (n: string) => n.split(/\s+/).filter(Boolean).slice(0, 2).map(w => w[0]).join('').toUpperCase();

export default function Screen() {
  const toast = useToast();
  const nav = useNavigate();
  const { user } = useSession();
  const sl = useSoloLectura(); // Fase 2D: ciclo que no es el activo = alta / edición / eliminación deshabilitadas
  const slp = { disabled: sl, title: sl ? SL_MSG : undefined };
  const [q, setQ] = useDraft('tutores:q', '');
  const [page, setPage] = useState(1);
  const [data, setData] = useState<TutoresResp | null>(null);
  // El «Nuevo tutor» abierto se reabre al volver; la edición no (sus datos viajan en la fila): se restaura al pulsar Editar.
  const [form, setForm] = useDraft<{ row: TutorRow | null } | null>('tutores:form', null, { transformar: f => (f?.row ? null : f) });
  const [ficha, setFicha] = useState<string | null>(null);
  const [delRow, setDelRow] = useState<TutorRow | null>(null);
  const [cred, setCred] = useState<{ t: string; ced: string; r: TutorAccesoResp } | null>(null);

  const load = useCallback((pg = page, qq = q) => api.get<TutoresResp>(`/tutores?page=${pg}&size=50&q=${encodeURIComponent(qq.trim())}`).then(setData).catch(e => toast(errMsg(e), 'bad')),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [page, q]);
  useEffect(() => { const t = setTimeout(() => { void load(); }, q ? 220 : 0); return () => clearTimeout(t); }, [load, q]);
  const reload = () => load();

  const remove = async () => {
    try { await api.del(`/tutores/${delRow!.id}`); toast(delRow!.nombre + ' eliminado', 'ok'); setDelRow(null); reload(); } catch (e) { toast(errMsg(e), 'bad'); }
  };
  const deactivate = async () => {
    try { await api.post(`/tutores/${delRow!.id}/desactivar`); toast(delRow!.nombre + ' desactivado', 'ok'); setDelRow(null); reload(); } catch (e) { toast(errMsg(e), 'bad'); }
  };

  const pages = data ? Math.max(1, Math.ceil(data.filtrados / data.size)) : 1;
  return (
    <div className="flex flex-col gap-3.5">
      <div>
        <h1 className="m-0 text-xl font-semibold tracking-[-0.01em]">Tutores</h1>
        <p className="mt-1 text-[13px] text-slate-600">Padres y tutores legales vinculados a los estudiantes.</p>
      </div>
      <section className="min-w-[min(100%,520px)] flex-1 overflow-hidden rounded-lg border border-slate-200 bg-white">
        <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-200 px-4 py-3.5">
          <div className="flex min-w-[220px] flex-1 items-start gap-2.5">
            <span className="grid h-9 w-9 flex-none place-items-center rounded-lg bg-blue-50 text-lg text-accent"><i className="ph ph-users-three" /></span>
            <div><div className="text-[15px] font-semibold">Tutores</div><div className="mt-0.5 text-xs text-slate-600">Padres y tutores legales: contacto, responsabilidad financiera y acceso al Portal Tutor.</div></div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative"><i className="ph ph-magnifying-glass absolute left-2.5 top-2.5 text-slate-400" /><input value={q} onChange={e => { setQ(e.target.value); setPage(1); }} placeholder="Buscar…" aria-label="Buscar tutores por nombre, cédula o estudiante" className="h-[34px] w-[200px] rounded-md border border-slate-300 bg-white pl-[30px] pr-2.5 text-[13px] outline-none focus:border-accent" /></div>
            <button onClick={() => setForm({ row: null })} {...slp} className="flex h-[34px] items-center gap-1.5 whitespace-nowrap rounded-md bg-accent px-3 text-[13px] font-medium text-white hover:bg-accent-dark disabled:opacity-50"><i className="ph ph-plus" />Nuevo tutor</button>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] border-collapse text-[13px]">
            <thead><tr>
              {['Tutor', 'Parentesco', 'Responsabilidad', 'Teléfono', 'Estudiantes', 'Usuario portal', 'Contraseña', 'Estado'].map(h => <th key={h} className={th}>{h}</th>)}
              <th className={`${th} text-right`}>Acciones</th>
            </tr></thead>
            <tbody>
              {data?.rows.map(r => (
                <tr key={r.id} className={`h-12 hover:bg-slate-50 ${r.estado === 'Inactivo' ? 'opacity-60' : ''}`}>
                  <td className="border-b border-slate-100 px-3"><button onClick={() => setFicha(r.id)} className="p-0 text-left font-medium text-ink hover:text-accent hover:underline">{r.nombre}</button></td>
                  <td className="border-b border-slate-100 px-3 text-ink">{r.parentesco}</td>
                  <td className="border-b border-slate-100 px-3 text-ink">{r.tipo}</td>
                  <td className="border-b border-slate-100 px-3"><span className="whitespace-nowrap font-mono text-xs font-medium">{r.tel || '—'}</span></td>
                  <td className="border-b border-slate-100 px-3">
                    <div className="flex flex-wrap gap-1 py-1.5">{(r.alumnos.length ? r.alumnos.map(a => a.nombre) : ['—']).map((c, i) => <span key={i} className="inline-flex h-5 items-center whitespace-nowrap rounded bg-mute-bg px-[7px] text-[11px] font-medium text-slate-700">{c}</span>)}</div>
                  </td>
                  <td className="border-b border-slate-100 px-3"><span className="whitespace-nowrap font-mono text-xs font-medium">{r.usuario || '—'}</span></td>
                  <td className="border-b border-slate-100 px-3"><span className="whitespace-nowrap font-mono text-xs font-medium">{r.usuario ? '••••••••' : '—'}</span></td>
                  <td className="border-b border-slate-100 px-3"><span className={`${pillBase} !w-[84px] ${r.estado === 'Activo' ? pill.ok : pill.mute}`}>{r.estado}</span></td>
                  <td className="whitespace-nowrap border-b border-slate-100 px-3 text-right">
                    <div className="inline-flex gap-3">
                      <button onClick={() => setForm({ row: r })} {...slp} className="p-0 text-[13px] font-medium text-accent hover:text-accent-dark disabled:opacity-40">Editar</button>
                      <button onClick={() => setDelRow(r)} {...slp} className="p-0 text-[13px] font-medium text-red-600 hover:text-red-700 disabled:opacity-40">Eliminar</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!data && <div className="px-4 py-8 text-center text-[13px] text-slate-500">Cargando tutores…</div>}
        {data && data.rows.length === 0 && (
          <div className="px-4 py-8 text-center text-[13px] text-slate-500">
            {data.total === 0 ? 'Aún no hay tutores registrados. Se crean al inscribir un estudiante o con «Nuevo tutor».' : 'Sin resultados para la búsqueda.'}
          </div>
        )}
        <div className="flex flex-wrap items-center justify-between gap-2.5 border-t border-slate-200 bg-slate-50 px-4 py-2.5 text-xs text-slate-500">
          <span>{data ? `${data.filtrados} de ${data.total} registros` : ' '}{data && pages > 1 ? ` · página ${data.page} de ${pages}` : ''}</span>
          {pages > 1 && (
            <span className="flex gap-1.5">
              <button disabled={page <= 1} onClick={() => setPage(p => p - 1)} className="h-7 rounded-md border border-slate-300 bg-white px-2.5 font-medium text-ink disabled:opacity-40">Anterior</button>
              <button disabled={page >= pages} onClick={() => setPage(p => p + 1)} className="h-7 rounded-md border border-slate-300 bg-white px-2.5 font-medium text-ink disabled:opacity-40">Siguiente</button>
            </span>
          )}
          <span className="font-mono">GET /api/tutores</span>
        </div>
      </section>

      {form && <TutorForm row={form.row} onClose={() => setForm(null)} onSaved={t => { setForm(null); toast(form.row ? `${t.nombre} actualizado` : `${t.nombre} creado en tutores`, 'ok'); reload(); }} />}

      {ficha && <FichaDrawer id={ficha} canExp={!!user && canAccess(user.rol, 'expediente')} onClose={() => setFicha(null)}
        onEdit={r => { setFicha(null); setForm({ row: r }); }} onChanged={reload}
        onCred={(r, t) => setCred({ r, t: t.nombre, ced: t.cedula })} goExp={id => nav(`/expediente/${id}`)} />}

      {cred && <CredModal c={cred} onClose={() => setCred(null)} />}

      {delRow && (
        <Modal width={460} z={86} onClose={() => setDelRow(null)}>
          <div className="flex items-start gap-3 p-5">
            <span className={`grid h-10 w-10 flex-none place-items-center rounded-full text-xl ${delRow.alumnos.length ? 'bg-amber-100 text-amber-700' : 'bg-red-100 text-red-600'}`}><i className={delRow.alumnos.length ? 'ph ph-link-break' : 'ph ph-trash'} /></span>
            <div className="min-w-0 flex-1">
              <div className="text-base font-semibold">Eliminar {delRow.nombre}</div>
              <div className="mt-1 text-[13px] leading-normal text-slate-600">{delRow.alumnos.length ? 'No se puede eliminar: otros registros dependen de él. Puedes desactivarlo para que deje de aparecer en los selectores sin romper el histórico.' : 'Se eliminará de tutores (y su acceso al portal, si lo tiene). La acción queda registrada en Auditoría.'}</div>
              {delRow.alumnos.length > 0 && <div className="mt-2.5 flex items-baseline gap-2 rounded-md bg-warn-bg px-2.5 py-2 text-xs text-amber-800"><b className="whitespace-nowrap">Estudiantes ({delRow.alumnos.length})</b><span className="min-w-0">{delRow.alumnos.slice(0, 4).map(a => a.nombre).join(', ') + (delRow.alumnos.length > 4 ? '…' : '')}</span></div>}
            </div>
          </div>
          <div className="flex flex-wrap justify-end gap-2 border-t border-slate-200 bg-slate-50 px-5 py-3.5">
            <button onClick={() => setDelRow(null)} className="h-9 rounded-md border border-slate-300 bg-white px-3.5 text-[13px] font-medium">Cancelar</button>
            {delRow.alumnos.length > 0
              ? <button onClick={deactivate} className="h-9 rounded-md border border-amber-300 bg-white px-3.5 text-[13px] font-semibold text-amber-700 hover:bg-warn-bg">Desactivar en su lugar</button>
              : <button onClick={remove} className="h-9 rounded-md bg-red-600 px-4 text-[13px] font-semibold text-white hover:bg-red-700">Eliminar</button>}
          </div>
        </Modal>
      )}
    </div>
  );
}

// ---------------------------------------------------------------- formulario (alta / edición)
function TutorForm({ row, onClose, onSaved }: { row: TutorRow | null; onClose: () => void; onSaved: (t: TutorFicha) => void }) {
  const id = row?.id ?? null;
  // Criterio de borradores (ver docs/borradores-formularios.md): «×»/fondo conservan el borrador; «Cancelar» y guardar con éxito lo descartan.
  const dk = 'tutor:' + (id ?? 'nuevo');
  const [v, setV, limpV, meta] = useDraft(dk + ':v', { nombre: row?.nombre ?? '', cedula: row?.cedula ?? '', parentesco: row?.parentesco ?? '', tipo: row?.tipo ?? '', tel: row?.tel ?? '', email: row?.email ?? '', rnc: row?.rnc ?? '', estado: row?.estado ?? 'Activo' });
  const [alumnos, setAlumnos, limpA] = useDraft<{ id: string; nombre: string }[]>(dk + ':alumnos', row?.alumnos ?? []);
  const [err, setErr] = useState<Record<string, string>>({});
  const [top, setTop] = useState('');
  const [busy, setBusy] = useState(false);
  const [sq, setSq, limpQ] = useDraft(dk + ':sq', ''); // solo el texto de búsqueda
  const [opts, setOpts] = useState<TutorAlumnoOpt[]>([]);
  const descartar = () => { limpV(); limpA(); limpQ(); };
  const set = (k: keyof typeof v, val: string) => { setV(x => ({ ...x, [k]: val })); setErr(e => ({ ...e, [k]: '' })); setTop(''); };

  useEffect(() => {
    const t = setTimeout(() => api.get<TutorAlumnoOpt[]>('/tutores/alumnos?q=' + encodeURIComponent(sq.trim())).then(setOpts).catch(() => setOpts([])), 180);
    return () => clearTimeout(t);
  }, [sq]);

  const save = async () => {
    const e: Record<string, string> = {};
    if (!v.nombre.trim()) e.nombre = 'Campo requerido';
    if (!v.cedula.trim()) e.cedula = 'Campo requerido'; else if (digits(v.cedula).length !== 11) e.cedula = 'Debe tener 11 dígitos';
    if (!v.parentesco) e.parentesco = 'Campo requerido';
    if (!v.tipo) e.tipo = 'Campo requerido';
    if (!v.tel.trim()) e.tel = 'Campo requerido'; else if (digits(v.tel).length < 7) e.tel = 'Teléfono inválido';
    if (v.email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.email.trim())) e.email = 'Formato de correo inválido';
    if (v.rnc.trim() && ![9, 11].includes(digits(v.rnc).length)) e.rnc = 'Debe tener 9 u 11 dígitos';
    if (!alumnos.length && (!row || row.alumnos.length)) e.alumnos = 'Campo requerido';
    if (Object.keys(e).length) { setErr(e); return; }
    setBusy(true);
    try {
      const body = { ...v, alumnos: alumnos.map(a => a.id) };
      const r = id ? await api.put<TutorFicha>(`/tutores/${id}`, body) : await api.post<TutorFicha>('/tutores', body);
      descartar();
      onSaved(r);
    } catch (x) { setTop(errMsg(x)); setBusy(false); }
  };

  const inp = (k: keyof typeof v, mono?: boolean, ph?: string) => (
    <input value={v[k]} onChange={e => set(k, e.target.value)} placeholder={ph} autoComplete="off" className={`box-border h-9 w-full rounded-md border bg-white px-2.5 text-[13px] text-ink outline-none focus:border-accent ${err[k] ? 'border-red-600' : 'border-slate-300'} ${mono ? 'font-mono' : ''}`} />
  );
  const sel = (k: keyof typeof v, options: string[], req = true) => (
    <select value={v[k]} onChange={e => set(k, e.target.value)} className={`h-9 w-full rounded-md border bg-white px-2 text-[13px] text-ink ${err[k] ? 'border-red-600' : 'border-slate-300'}`}>
      <option value="">{req ? 'Seleccionar…' : 'Ninguna'}</option>{options.map(o => <option key={o}>{o}</option>)}
    </select>
  );
  const field = (k: keyof typeof v | 'alumnos', label: string, node: React.ReactNode, hint?: string, req?: boolean) => (
    <div className="flex flex-col gap-[5px]">
      <span className="text-xs font-medium text-slate-600">{label}{req && <span className="text-red-600"> *</span>}</span>
      {node}
      <span className={`text-[11px] leading-snug ${err[k] ? 'text-red-600' : 'text-slate-500'}`}>{err[k] || hint || ''}</span>
    </div>
  );

  return (
    <SideDrawer width={440} z={80} onClose={onClose}>
      <div className="flex items-start justify-between gap-3 border-b border-slate-200 px-5 py-4">
        <div>
          <div className="text-base font-semibold">{id ? 'Editar tutor' : 'Nuevo tutor'}</div>
          <div className="mt-[3px] font-mono text-[11px] text-slate-500">{id ? `PUT /api/tutores/${id}` : 'POST /api/tutores'}</div>
        </div>
        <button onClick={onClose} aria-label="Cerrar" className="h-8 w-8 flex-none rounded-md border border-slate-300 bg-white"><i className="ph ph-x" /></button>
      </div>
      <div className="flex flex-1 flex-col gap-3.5 overflow-auto px-5 py-4">
        <AvisoBorrador meta={{ ...meta, descartar }} />
        {field('nombre', 'Nombre completo', inp('nombre'), undefined, true)}
        {field('cedula', 'Cédula', inp('cedula', true, '001-0000000-0'), undefined, true)}
        {field('parentesco', 'Parentesco', sel('parentesco', PARENTESCOS), undefined, true)}
        {field('tipo', 'Responsabilidad', sel('tipo', TIPOS), 'El tutor financiero recibe los cobros y el estado de cuenta.', true)}
        {field('tel', 'Teléfono', inp('tel', true, '809-555-0000'), undefined, true)}
        {field('email', 'Correo', inp('email', false, 'nombre@correo.do'))}
        {field('rnc', 'RNC (crédito fiscal)', inp('rnc', true), 'Opcional: solo si factura a nombre de una empresa.')}
        {field('alumnos', 'Estudiantes a cargo', (
          <div className={`flex flex-col gap-2 rounded-md border p-2 ${err.alumnos ? 'border-red-600' : 'border-slate-300'}`}>
            <div className="flex flex-wrap gap-1.5">
              {alumnos.map(a => (
                <button key={a.id} type="button" onClick={() => { setAlumnos(l => l.filter(x => x.id !== a.id)); setErr(e => ({ ...e, alumnos: '' })); }} className="flex h-7 items-center gap-1 whitespace-nowrap rounded-full border border-accent bg-blue-50 px-2.5 text-xs font-medium text-blue-700"><i className="ph-bold ph-check" />{a.nombre}<i className="ph ph-x text-[10px]" /></button>
              ))}
              {!alumnos.length && <span className="text-xs text-slate-400">Ningún estudiante seleccionado</span>}
            </div>
            <input value={sq} onChange={e => setSq(e.target.value)} placeholder="Buscar estudiante por nombre o matrícula…" className="box-border h-8 w-full rounded-md border border-slate-300 px-2.5 text-xs outline-none focus:border-accent" />
            <div className="flex max-h-36 flex-col overflow-auto">
              {opts.filter(o => !alumnos.some(a => a.id === o.id)).map(o => (
                <button key={o.id} type="button" onClick={() => { setAlumnos(l => [...l, { id: o.id, nombre: o.nombre }]); setErr(e => ({ ...e, alumnos: '' })); }} className="flex items-center justify-between gap-2 rounded px-2 py-1.5 text-left text-xs hover:bg-slate-100">
                  <span className="font-medium">{o.nombre} <span className="font-mono text-[10px] text-slate-500">{o.code.replace(/^EST-\d{4}-/, 'EST-')}</span></span>
                  <span className="whitespace-nowrap text-[11px] text-slate-500">{o.grado} {o.sec} · tutor: {o.tutor}</span>
                </button>
              ))}
            </div>
          </div>
        ), 'Al añadir un estudiante de otro tutor financiero se reasigna su estado de cuenta a este tutor.', true)}
        {field('estado', 'Estado', sel('estado', ['Activo', 'Inactivo']), undefined, true)}
        <div className="flex items-start gap-2 rounded-md border border-dashed border-slate-300 bg-slate-50 px-2.5 py-2 text-xs text-slate-600">
          <i className="ph ph-device-mobile mt-0.5 text-base" />
          <span>{row?.usuario ? <>Usuario del Portal Tutor: <b className="font-mono">{row.usuario}</b>. </> : 'Sin acceso al Portal Tutor. '}La contraseña temporal se genera desde la ficha del tutor (clic en su nombre) y solo se muestra una vez.</span>
        </div>
        {top && <div className="flex items-center gap-1.5 text-xs font-medium text-red-600"><i className="ph ph-warning-circle" />{top}</div>}
      </div>
      <div className="flex justify-end gap-2 border-t border-slate-200 bg-slate-50 px-5 py-3.5">
        <button onClick={() => { descartar(); onClose(); }} className="h-9 rounded-md border border-slate-300 bg-white px-3.5 text-[13px] font-medium">Cancelar</button>
        <button onClick={save} disabled={busy} className="flex h-9 items-center gap-1.5 rounded-md bg-accent px-4 text-[13px] font-semibold text-white hover:bg-accent-dark disabled:opacity-60"><i className="ph ph-floppy-disk" />{id ? 'Guardar cambios' : 'Crear tutor'}</button>
      </div>
    </SideDrawer>
  );
}

// ---------------------------------------------------------------- ficha del tutor
function FichaDrawer({ id, canExp, onClose, onEdit, onChanged, onCred, goExp }: {
  id: string; canExp: boolean; onClose: () => void; onEdit: (r: TutorRow) => void; onChanged: () => void; onCred: (r: TutorAccesoResp, t: TutorFicha) => void; goExp: (id: string) => void;
}) {
  const toast = useToast();
  const sl = useSoloLectura();
  const [t, setT] = useState<TutorFicha | null>(null);
  const [busy, setBusy] = useState(false);
  const [ask, setAsk] = useState<'crear' | 'reset' | 'revocar' | null>(null);
  useEffect(() => { api.get<TutorFicha>(`/tutores/${id}`).then(setT).catch(e => { toast(errMsg(e), 'bad'); onClose(); }); // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const acceso = async () => {
    if (!t) return;
    setBusy(true);
    try {
      const r = await api.post<TutorAccesoResp>(`/tutores/${t.id}/acceso`);
      setAsk(null); onCred(r, t); setT(await api.get<TutorFicha>(`/tutores/${t.id}`)); onChanged();
    } catch (e) { toast(errMsg(e), 'bad'); } finally { setBusy(false); }
  };
  const revocar = async () => {
    if (!t) return;
    setBusy(true);
    try { setT(await api.post<TutorFicha>(`/tutores/${t.id}/acceso/revocar`)); setAsk(null); toast('Acceso al portal revocado', 'ok'); onChanged(); } catch (e) { toast(errMsg(e), 'bad'); } finally { setBusy(false); }
  };

  const kv = (k: string, val: string, mono?: boolean) => (
    <div className="flex justify-between gap-3 text-[13px]"><span className="text-slate-600">{k}</span><span className={`text-right font-medium ${mono ? 'font-mono text-xs' : ''}`}>{val || '—'}</span></div>
  );
  const tone = t?.acceso.estado === 'Activo' ? pill.ok : t?.acceso.estado === 'Inactivo' ? pill.bad : pill.mute;
  return (
    <SideDrawer width={460} z={70} onClose={onClose}>
      {!t ? <div className="p-6 text-[13px] text-slate-500">Cargando ficha…</div> : (
        <>
          <div className="flex items-start gap-3 border-b border-slate-200 px-5 py-4">
            <span className="grid h-12 w-12 flex-none place-items-center rounded-lg bg-slate-200 text-base font-semibold text-slate-700">{ini(t.nombre)}</span>
            <div className="min-w-0 flex-1">
              <div className="text-base font-semibold">{t.nombre}</div>
              <div className="mt-1 flex flex-wrap items-center gap-2"><span className="font-mono text-xs text-slate-600">{t.cedula}</span><span className={`${pillBase} !w-[64px] ${t.estado === 'Activo' ? pill.ok : pill.mute}`}>{t.estado}</span></div>
            </div>
            <button onClick={onClose} aria-label="Cerrar" className="h-8 w-8 flex-none rounded-md border border-slate-300 bg-white"><i className="ph ph-x" /></button>
          </div>
          <div className="flex flex-1 flex-col gap-4 overflow-auto px-5 py-4">
            <section className="flex flex-col gap-1.5">
              <div className="text-xs font-semibold uppercase tracking-[0.04em] text-slate-600">Contacto</div>
              {kv('Parentesco', t.parentesco)}{kv('Responsabilidad', t.tipo)}{kv('Teléfono', t.tel, true)}{kv('Correo', t.email)}{kv('RNC', t.rnc, true)}
            </section>
            <section className="flex flex-col gap-2">
              <div className="text-xs font-semibold uppercase tracking-[0.04em] text-slate-600">Estado de cuenta</div>
              <div className="grid grid-cols-3 gap-2">
                {([['Vencido', t.saldo.vencido, t.saldo.vencido > 0 ? 'text-red-600' : ''], ['Por vencer', t.saldo.porVencer, ''], ['Total', t.saldo.total, 'font-semibold']] as const).map(([l, n, c]) => (
                  <div key={l} className="rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-2"><div className="text-[11px] text-slate-500">{l}</div><div className={`font-mono text-[13px] ${c}`}>{fmt(n)}</div></div>
                ))}
              </div>
              {t.saldo.total === 0 && <div className="text-xs text-slate-500">{t.hijos.some(h => h.vinculo !== 'Legal') ? 'Sin saldo pendiente: la cuenta está al día.' : 'No es tutor financiero de ningún estudiante: no tiene estado de cuenta.'}</div>}
            </section>
            <section className="flex flex-col gap-1.5">
              <div className="text-xs font-semibold uppercase tracking-[0.04em] text-slate-600">Estudiantes ({t.hijos.length})</div>
              {t.hijos.length === 0 && <div className="text-xs text-slate-500">Sin estudiantes vinculados.</div>}
              {t.hijos.map(h => (
                <div key={h.id} className="flex items-center justify-between gap-2 rounded-lg border border-slate-200 px-3 py-2">
                  <div className="min-w-0">
                    {canExp ? <button onClick={() => goExp(h.id)} className="p-0 text-left text-[13px] font-medium text-ink hover:text-accent hover:underline">{h.nombre}</button> : <span className="text-[13px] font-medium">{h.nombre}</span>}
                    <div className="text-[11px] text-slate-500"><span className="font-mono">{h.code.replace(/^EST-\d{4}-/, 'EST-')}</span> · {h.grado} {h.sec} · {h.tanda} · {h.vinculo}</div>
                  </div>
                  <span className={`font-mono text-xs ${h.vencido > 0 ? 'font-semibold text-red-600' : 'text-slate-500'}`}>{h.vinculo === 'Legal' ? '—' : fmt(h.vencido + h.porVencer)}</span>
                </div>
              ))}
            </section>
            <section className="flex flex-col gap-2 rounded-lg border border-slate-200 p-3">
              <div className="flex items-center justify-between"><div className="text-xs font-semibold uppercase tracking-[0.04em] text-slate-600">Acceso al Portal Tutor</div><span className={`${pillBase} !w-[84px] ${tone}`}>{t.acceso.estado}</span></div>
              {t.acceso.usuario && kv('Usuario', t.acceso.usuario, true)}
              {t.acceso.cambioPendiente && <div className="text-xs text-amber-700">Contraseña temporal pendiente de cambio: el tutor debe cambiarla en su primer ingreso.</div>}
              {t.hijos.every(h => h.vinculo === 'Legal') && <div className="text-xs text-slate-500">El portal muestra los estudiantes de los que es tutor financiero.</div>}
              <div className="flex flex-wrap gap-2 pt-1">
                <button disabled={t.estado !== 'Activo' || busy || sl} title={sl ? SL_MSG : undefined} onClick={() => (t.acceso.estado === 'Sin acceso' ? acceso() : setAsk('reset'))} className="flex h-8 items-center gap-1.5 rounded-md bg-accent px-3 text-xs font-semibold text-white hover:bg-accent-dark disabled:opacity-50"><i className="ph ph-key" />{t.acceso.estado === 'Sin acceso' ? 'Crear acceso al portal' : 'Restablecer contraseña'}</button>
                {t.acceso.estado === 'Activo' && <button onClick={() => setAsk('revocar')} disabled={sl} title={sl ? SL_MSG : undefined} className="h-8 rounded-md border border-red-200 bg-white px-3 text-xs font-semibold text-red-600 hover:bg-red-50 disabled:opacity-50">Revocar acceso</button>}
              </div>
              {t.estado !== 'Activo' && <div className="text-xs text-slate-500">Activa al tutor para darle acceso.</div>}
              <div className="text-[11px] text-slate-500">{t.correoListo && t.email ? 'Las credenciales se enviarán también a su correo.' : 'Canal de correo no configurado o sin correo del tutor: las credenciales se entregan en pantalla o impresas.'}</div>
            </section>
          </div>
          <div className="flex justify-end gap-2 border-t border-slate-200 bg-slate-50 px-5 py-3.5">
            <button onClick={onClose} className="h-9 rounded-md border border-slate-300 bg-white px-3.5 text-[13px] font-medium">Cerrar</button>
            <button onClick={() => onEdit(t)} disabled={sl} title={sl ? SL_MSG : undefined} className="flex h-9 items-center gap-1.5 rounded-md bg-accent px-4 text-[13px] font-semibold text-white hover:bg-accent-dark disabled:opacity-50"><i className="ph ph-pencil-simple" />Editar</button>
          </div>
          {ask && (
            <Modal width={440} z={90} onClose={() => setAsk(null)}>
              <div className="p-5">
                <div className="text-base font-semibold">{ask === 'revocar' ? 'Revocar acceso al portal' : 'Restablecer contraseña'}</div>
                <div className="mt-1 text-[13px] leading-normal text-slate-600">{ask === 'revocar' ? `${t.nombre} dejará de poder iniciar sesión en el Portal Tutor.` : 'Se generará una nueva contraseña temporal y la anterior dejará de funcionar. El tutor deberá cambiarla al ingresar.'}</div>
              </div>
              <div className="flex justify-end gap-2 border-t border-slate-200 bg-slate-50 px-5 py-3.5">
                <button onClick={() => setAsk(null)} className="h-9 rounded-md border border-slate-300 bg-white px-3.5 text-[13px] font-medium">Cancelar</button>
                <button disabled={busy} onClick={ask === 'revocar' ? revocar : acceso} className={`h-9 rounded-md px-4 text-[13px] font-semibold text-white disabled:opacity-60 ${ask === 'revocar' ? 'bg-red-600 hover:bg-red-700' : 'bg-accent hover:bg-accent-dark'}`}>{ask === 'revocar' ? 'Revocar' : 'Restablecer'}</button>
              </div>
            </Modal>
          )}
        </>
      )}
    </SideDrawer>
  );
}

// ---------------------------------------------------------------- credenciales (una sola vez)
function CredModal({ c, onClose }: { c: { t: string; ced: string; r: TutorAccesoResp }; onClose: () => void }) {
  const toast = useToast();
  const pb = usePrintBusy()('tutAcceso', 'Imprimir credenciales', 'ph ph-printer');
  const copy = (s: string) => navigator.clipboard?.writeText(s).then(() => toast('Copiado', 'ok')).catch(() => toast('No se pudo copiar', 'warn'));
  const imprimir = () => printCarta([{
    title: 'Acceso al Portal Tutor', sub: hoyDMY(),
    blocks: [
      { t: 'kv' as const, rows: [['Tutor', c.t], ['Cédula', c.ced], ['Usuario', c.r.usuario], ['Contraseña temporal', c.r.password]] as [string, string][] },
      { t: 'text' as const, s: 'Ingrese al Portal Tutor con el usuario y la contraseña temporal indicados. Por seguridad, el sistema le pedirá crear una contraseña nueva en su primer ingreso. No comparta esta hoja y destrúyala después de usarla.' },
    ],
  }], ['Administración'], 'Acceso al Portal Tutor', 'tutAcceso', `acceso_portal_${c.ced.replace(/\D/g, '')}.pdf`);
  const box = (l: string, v: string) => (
    <div className="flex flex-col gap-1"><span className="text-xs font-medium text-slate-600">{l}</span>
      <div className="flex items-center gap-2"><div className="flex h-10 flex-1 items-center rounded-md border border-slate-300 bg-slate-50 px-3 font-mono text-[15px] font-semibold tracking-wide">{v}</div><button onClick={() => copy(v)} aria-label={'Copiar ' + l} className="h-10 w-10 rounded-md border border-slate-300 bg-white"><i className="ph ph-copy" /></button></div></div>
  );
  return (
    <Modal width={460} z={95} onClose={onClose}>
      <div className="flex flex-col gap-3 p-5">
        <div className="flex items-center gap-2 text-base font-semibold"><i className="ph ph-key text-accent" />Acceso al Portal Tutor · {c.t}</div>
        {box('Usuario', c.r.usuario)}{box('Contraseña temporal', c.r.password)}
        <div className="rounded-md bg-warn-bg px-3 py-2 text-xs leading-snug text-amber-800">Esta contraseña se muestra <b>una sola vez</b>: no se guarda en claro y no podrá consultarse luego. El tutor deberá cambiarla en su primer ingreso.</div>
        <div className="text-xs text-slate-600">{c.r.aviso}</div>
      </div>
      <div className="flex justify-end gap-2 border-t border-slate-200 bg-slate-50 px-5 py-3.5">
        <button onClick={imprimir} className="flex h-9 items-center gap-1.5 rounded-md border border-slate-300 bg-white px-3.5 text-[13px] font-medium"><i className={pb.icon} style={{ animation: pb.spin }} />{pb.label}</button>
        <button onClick={onClose} className="h-9 rounded-md bg-accent px-4 text-[13px] font-semibold text-white hover:bg-accent-dark">Listo</button>
      </div>
    </Modal>
  );
}
