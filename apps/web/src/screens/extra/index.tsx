import { SL_MSG, useCiclo } from '../../lib/ciclo';
import { useEffect, useRef, useState } from 'react';
import type { AcadExtra, AcadExtraInput } from '@stodia/shared';
import { api } from '../../lib/api';
import { useSession } from '../../lib/session';
import SegTabs from '../../components/SegTabs';
import { useToast } from '../../components/system/UiProvider';
import SupervisorGuardModal, { type GuardCfg } from '../../components/finanzas/SupervisorGuardModal';
import { errMsg, fmt, norm } from '../../components/finanzas/fin';
import { pill, pillBase } from '../../components/system/styles';
import ExtraDrawer, { CATS, type Mode } from './ExtraDrawer';

const ICON: Record<string, string> = { Deportes: 'ph ph-soccer-ball', Danza: 'ph ph-person-simple-tai-chi', Arte: 'ph ph-palette', Música: 'ph ph-music-notes', Académico: 'ph ph-robot' };
const KINDS = [{ k: 'all', label: 'Todos' }, { k: 'act', label: 'Actividades' }, { k: 'curso', label: 'Cursos' }];

export default function Screen() {
  const toast = useToast();
  const { user } = useSession();
  const { soloLectura: sl, cicloSeleccionado } = useCiclo(); // Fase 2D: ciclo que no es el activo = alta / edición / baja deshabilitadas
  const slp = { disabled: sl, title: sl ? SL_MSG : undefined };
  const [list, setList] = useState<AcadExtra[]>([]);
  const [q, setQ] = useState('');
  const [cat, setCat] = useState('all');
  const [kind, setKind] = useState('all');
  const [xd, setXd] = useState<{ item: AcadExtra | null; mode: Mode } | null>(null);
  const [guard, setGuard] = useState<GuardCfg | null>(null);
  const pin = useRef('');
  const auth = user?.rol === 'Super Admin' || user?.rol === 'Director Académico';

  useEffect(() => {
    api.get<AcadExtra[]>('/extra').then(setList).catch(e => toast(errMsg(e), 'bad'));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** Crear/modificar exige Dirección Académica o Super Admin; el resto autoriza con clave de supervisor. */
  const gate = (title: string, fn: () => void) => {
    if (auth) { fn(); return; }
    setGuard({ title, desc: 'La gestión de extracurriculares corresponde a Dirección Académica o Super Admin. Autoriza con clave de supervisor.', pin: true, label: 'Autorizar', onOk: p => { pin.current = p; fn(); } });
  };
  const open = (item: AcadExtra | null, mode: Mode) => setXd({ item, mode });

  const del = (a: AcadExtra) => setGuard({
    title: 'Eliminar ' + a.name, label: 'Eliminar actividad', code: 'ELIMINAR-' + a.id, pin: !auth,
    desc: a.inscritos ? `Hay ${a.inscritos} alumnos inscritos: se anularán sus cuotas futuras de esta actividad y se notificará a los tutores.` : 'La actividad no tiene alumnos inscritos.',
    onOk: async p => {
      await api.post(`/extra/${a.id}/eliminar`, { pin: p });
      setList(l => l.filter(x => x.id !== a.id)); setXd(null);
      toast(a.name + ' eliminada' + (a.inscritos ? ` · ${a.inscritos} tutores notificados` : ''), 'warn');
    },
  });

  const save = async (f: AcadExtraInput, id: string | null) => {
    const body = { ...f, pin: pin.current };
    const r = id ? await api.put<AcadExtra>(`/extra/${id}`, body) : await api.post<AcadExtra>('/extra', body);
    setList(l => (id ? l.map(x => (x.id === id ? r : x)) : [...l, r]));
    toast(id ? r.name + ' actualizada' : `${r.name} creada (${r.id})`, 'ok');
    if (id) open(r, 'view'); else setXd(null);
  };

  const nq = norm(q.trim());
  const rows = list.filter(a => (!nq || norm(a.name + ' ' + a.instructor).includes(nq)) && (cat === 'all' || a.cat === cat) && (kind === 'all' || a.kind === kind));
  const catOpts = [{ k: 'all', label: 'Todas', icon: 'ph ph-squares-four', n: list.length }, ...CATS.map(c => ({ k: c, label: c, icon: ICON[c], n: list.filter(a => a.cat === c).length }))];

  return (
    <div className="flex flex-col gap-3.5">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="m-0 text-xl font-semibold tracking-[-0.01em]">Actividades y Cursos Extracurriculares</h1>
          <p className="mt-1 text-[13px] text-slate-600">{list.length} actividades · {list.reduce((n, a) => n + a.inscritos, 0)} inscripciones · Ciclo {cicloSeleccionado}</p>
        </div>
        <button onClick={() => gate('Crear actividad extracurricular', () => open(null, 'create'))} {...slp} className="flex h-[34px] items-center gap-1.5 rounded-md bg-accent px-3.5 text-[13px] font-medium text-white hover:bg-accent-dark disabled:opacity-50"><i className="ph ph-plus" />Nueva Actividad</button>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[200px] max-w-xs flex-1">
          <i className="ph ph-magnifying-glass pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
          <input value={q} onChange={e => setQ(e.target.value)} placeholder="Buscar actividad o instructor…" className="h-[34px] w-full rounded-md border border-slate-300 bg-white pl-8 pr-2.5 text-[13px] outline-none focus:border-accent focus:shadow-[0_0_0_3px_#DBEAFE]" />
        </div>
        <SegTabs options={catOpts} value={cat} onChange={setCat} wrap />
        <SegTabs options={KINDS} value={kind} onChange={setKind} />
      </div>
      <div className="grid grid-cols-[repeat(auto-fill,minmax(270px,1fr))] gap-3">
        {rows.map(a => {
          const curso = a.kind === 'curso', pct = a.inscritos / (a.cupo || 1), et = a.estado === 'Abierta' ? 'ok' : a.estado === 'Cupo lleno' ? 'warn' : 'mute';
          return (
            <div key={a.id} className={`flex flex-col gap-2.5 rounded-lg border border-slate-200 bg-white p-3.5 ${a.estado === 'Cerrada' ? 'opacity-65' : ''}`}>
              <div className="flex items-start gap-2.5">
                <span className="grid h-[38px] w-[38px] flex-none place-items-center rounded-lg bg-mute-bg text-xl text-slate-700"><i className={ICON[a.cat]} /></span>
                <div className="min-w-0 flex-1">
                  <button onClick={() => open(a, 'view')} className="p-0 text-left text-sm font-semibold text-ink hover:text-accent hover:underline">{a.name}</button>
                  <div className="mt-1 flex flex-wrap gap-1">
                    <span className="inline-flex h-5 items-center rounded-full bg-mute-bg px-2 text-[11px] font-semibold text-slate-700">{a.cat}</span>
                    <span className={`${pillBase} !w-[101px] ${curso ? pill.info : pill.mute}`}>{curso ? `Curso · ${a.sem} sem` : 'Actividad'}</span>
                    <span className={`${pillBase} !w-[77px] ${pill[et]}`}>{a.estado}</span>
                  </div>
                </div>
              </div>
              <div className="flex flex-col gap-1 text-xs text-slate-600">
                <span className="flex items-center gap-1.5"><i className="ph ph-user" />{a.instructor}</span>
                <span className="flex items-center gap-1.5"><i className="ph ph-clock" />{a.dias} · {a.hora}</span>
                <span className="flex items-center gap-1.5"><i className="ph ph-map-pin" />{a.lugar} · {a.grados}</span>
              </div>
              <div className="flex flex-col gap-1">
                <div className="flex justify-between text-xs"><span className="text-slate-500">Cupo</span><span className={`font-mono font-semibold ${pct >= 1 ? 'text-bad-fg' : 'text-ink'}`}>{a.inscritos}/{a.cupo}</span></div>
                <div className="h-1.5 overflow-hidden rounded-full bg-slate-200"><div className={`h-full ${pct >= 1 ? 'bg-red-600' : pct >= 0.8 ? 'bg-amber-600' : 'bg-green-600'}`} style={{ width: Math.min(100, Math.round(pct * 100)) + '%' }} /></div>
              </div>
              <div className="flex items-center justify-between border-t border-slate-100 pt-2">
                <span className="font-mono text-sm font-semibold">{a.costo ? fmt(a.costo) : 'Gratuita'}<span className="font-sans text-[11px] font-medium text-slate-500">{a.costo ? (curso ? ' total' : '/mes') : ''}</span></span>
                <div className="flex gap-0.5">
                  <button onClick={() => open(a, 'view')} title="Ver" className="grid h-[30px] w-[30px] place-items-center rounded-md text-base text-slate-600 hover:bg-slate-100"><i className="ph ph-eye" /></button>
                  <button onClick={() => gate('Modificar ' + a.name, () => open(a, 'edit'))} disabled={sl} title={sl ? SL_MSG : 'Editar'} className="grid h-[30px] w-[30px] place-items-center rounded-md text-base text-accent hover:bg-blue-50 disabled:opacity-40"><i className="ph ph-pencil-simple" /></button>
                  <button onClick={() => del(a)} disabled={sl} title={sl ? SL_MSG : 'Eliminar'} className="grid h-[30px] w-[30px] place-items-center rounded-md text-base text-red-600 hover:bg-red-100 disabled:opacity-40"><i className="ph ph-trash" /></button>
                </div>
              </div>
            </div>
          );
        })}
      </div>
      {rows.length === 0 && (
        <section className="flex flex-col items-start gap-2.5 rounded-lg border border-slate-200 bg-white px-6 py-10">
          <span className="grid h-[52px] w-[52px] place-items-center rounded-full bg-blue-50 text-[26px] text-accent"><i className="ph ph-medal" /></span>
          <div className="text-[15px] font-semibold">No hay actividades en esta vista.</div>
          <div className="text-[13px] text-slate-600">Cambia el filtro o registra una nueva actividad o curso.</div>
          <button onClick={() => gate('Crear actividad extracurricular', () => open(null, 'create'))} {...slp} className="flex h-[34px] items-center gap-1.5 rounded-md bg-accent px-3.5 text-[13px] font-medium text-white disabled:opacity-50"><i className="ph ph-plus" />Nueva Actividad</button>
        </section>
      )}
      {xd && <ExtraDrawer key={xd.item?.id + xd.mode} item={xd.item} mode={xd.mode} onClose={() => setXd(null)} onEdit={() => gate('Modificar ' + xd.item!.name, () => open(xd.item, 'edit'))} onDelete={del} onSave={save} />}
      {guard && <SupervisorGuardModal cfg={guard} onClose={() => setGuard(null)} />}
    </div>
  );
}
