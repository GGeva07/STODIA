import { useEffect, useRef, useState } from 'react';
import type { AcadHorarios } from '@stodia/shared';
import { api } from '../../lib/api';
import { useToast } from '../../components/system/UiProvider';
import { errMsg } from '../../components/finanzas/fin';

export default function Screen() {
  const toast = useToast();
  const [h, setH] = useState<AcadHorarios | null>(null);
  const [hover, setHover] = useState<string | null>(null);
  const drag = useRef<{ subj: string; from: string | null } | null>(null);
  const [sec, setSec] = useState('');

  useEffect(() => {
    api.get<AcadHorarios>('/horarios' + (sec ? `?seccion=${encodeURIComponent(sec)}` : '')).then(setH).catch(e => toast(errMsg(e), 'bad'));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sec]);

  if (!h) return <div className="text-[13px] text-slate-500">Cargando horarios…</div>;
  if (!h.seccionId) return <div className="flex flex-col gap-1"><h1 className="m-0 text-xl font-semibold tracking-[-0.01em]">Grilla de Horarios</h1><p className="text-[13px] text-slate-600">No hay secciones asignadas a tu usuario. Pide al administrador que te asigne en Catálogos › Docentes.</p></div>;
  const subj = Object.fromEntries(h.materias.map(m => [m.k, m]));
  const aulaOf = (k: string) => subj[k].aula;

  /** Validación en vivo (el servidor la repite al guardar): docente ocupado, aula ocupada, capacidad. */
  const conflict = (k: string, slot: string): string | null => {
    const S = subj[k], [d, b] = slot.split('-').map(Number), aula = aulaOf(k);
    const tb = h.tbusy[S.td]?.[slot];
    if (tb) return `Docente ocupado: Prof. ${S.t} imparte en ${tb} el ${h.dias[d]} ${h.bloques[b]}.`;
    const ab = h.abusy[aula]?.[slot];
    if (ab) return `Aula ocupada: ${aula} asignada a ${ab} en ese bloque.`;
    if (h.cap[aula] < h.alumnos) return `Capacidad excedida: ${aula} tiene ${h.cap[aula]} pupitres; ${h.seccion} tiene ${h.alumnos} alumnos.`;
    return null;
  };

  const counts: Record<string, number> = {};
  Object.values(h.sched).forEach(k => { counts[k] = (counts[k] || 0) + 1; });
  const palette = h.materias.map(m => ({ ...m, n: m.h - (counts[m.k] || 0) })).filter(p => p.n > 0);
  const pendTotal = palette.reduce((a, p) => a + p.n, 0);
  const totalH = h.materias.reduce((a, m) => a + m.h, 0);

  const endDrag = () => { drag.current = null; setHover(null); };
  const put = async (slot: string, materia: string | null, desde?: string | null) => {
    try { setH(await api.put<AcadHorarios>('/horarios/slot', { seccion: h.seccionId, slot, materia, desde })); return true; } catch (e) { toast(errMsg(e), 'bad'); return false; }
  };
  const drop = async (slot: string) => {
    const d = drag.current;
    endDrag();
    if (!d || d.from === slot) return;
    const c = conflict(d.subj, slot);
    if (c) { toast(c, 'bad'); return; }
    if (await put(slot, d.subj, d.from)) { const [dd, bb] = slot.split('-').map(Number); toast(`${subj[d.subj].name} asignada · ${h.dias[dd]} ${h.bloques[bb]}`, 'ok'); }
  };
  const dragStart = (e: React.DragEvent, k: string, from: string | null) => { e.dataTransfer.setData('text/plain', k); e.dataTransfer.effectAllowed = 'move'; drag.current = { subj: k, from }; };
  const setAula = async (materia: string, aula: string) => { try { setH(await api.put<AcadHorarios>('/horarios/aula', { seccion: h.seccionId, materia, aula })); } catch (e) { toast(errMsg(e), 'bad'); } };

  return (
    <div className="flex flex-col gap-3.5">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="m-0 text-xl font-semibold tracking-[-0.01em]">Grilla de Horarios</h1>
          <p className="mt-1 text-[13px] text-slate-600">{h.seccion} · {h.tanda} · {h.alumnos} estudiantes · Aula base: {h.aulaBase} ({h.pupitres} pupitres)</p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          {h.secciones.length > 1 && (
            <select aria-label="Sección" value={h.seccionId} onChange={e => setSec(e.target.value)} className="h-8 rounded-md border border-slate-300 bg-white px-2 text-[13px] text-ink">
              {h.secciones.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}
            </select>
          )}
          <div className="flex items-center gap-1.5 text-xs text-slate-600"><i className="ph ph-shield-check text-base text-green-600" />Validación en tiempo real: docente ocupado, aula ocupada, capacidad</div>
        </div>
      </div>
      <div className="flex flex-wrap items-start gap-3.5">
        <section
          onDragOver={e => e.preventDefault()}
          onDrop={async e => { e.preventDefault(); const d = drag.current; endDrag(); if (d?.from && (await put(d.from, null))) toast(`${subj[d.subj].name} desasignada`, 'info'); }}
          className="flex w-60 max-w-full flex-1 basis-60 flex-col gap-2 rounded-lg border border-slate-200 bg-white p-3"
        >
          <div className="text-xs font-semibold uppercase tracking-[0.04em] text-slate-600">Por asignar · {pendTotal} h</div>
          {palette.map(p => (
            <div key={p.k} draggable onDragStart={e => dragStart(e, p.k, null)} onDragEnd={endDrag} className="flex cursor-grab flex-col gap-0.5 rounded-md border border-slate-300 bg-white px-2.5 py-2 hover:border-accent">
              <div className="flex justify-between gap-1.5"><span className="text-[13px] font-semibold">{p.name}</span><span className="font-mono text-[11px] font-semibold text-accent">×{p.n}</span></div>
              <span className="text-xs text-slate-600">Prof. {p.t} · {aulaOf(p.k)}</span>
            </div>
          ))}
          {palette.length === 0 && <div className="flex items-center gap-1.5 text-[13px] text-green-700"><i className="ph ph-check-circle" />Carga horaria completa ({totalH} h)</div>}
          {h.materias.filter(m => m.aulas).map(m => (
            <label key={m.k} className="mt-1.5 flex flex-col gap-1 text-xs font-medium text-slate-600">Aula para {m.name}
              <select value={m.aula} onChange={e => setAula(m.k, e.target.value)} className="h-8 rounded-md border border-slate-300 bg-white px-2 text-[13px] text-ink">
                {m.aulas!.map(a => <option key={a.nombre} value={a.nombre}>{a.nombre} · {a.pupitres} pupitres</option>)}
              </select>
            </label>
          ))}
          <div className="text-xs leading-[1.45] text-slate-500">Arrastra a la grilla. Suelta un bloque aquí para desasignarlo.</div>
        </section>

        <section className="min-w-0 flex-[999_1_520px] overflow-auto rounded-lg border border-slate-200 bg-white">
          <div className="grid min-w-[700px] grid-cols-[72px_repeat(5,minmax(120px,1fr))]">
            <div className="border-b border-slate-200 bg-slate-50 p-2.5" />
            {h.dias.map(d => <div key={d} className="border-b border-l border-slate-200 bg-slate-50 p-2.5 text-xs font-semibold uppercase tracking-[0.04em] text-slate-600">{d}</div>)}
            {h.bloques.map((t, b) => (
              <Row key={t} time={t}>
                {h.dias.map((_, d) => {
                  const slot = `${d}-${b}`, sub = h.sched[slot], S = sub ? subj[sub] : null;
                  const hov = hover === slot && drag.current, conf = hov && drag.current!.from !== slot ? conflict(drag.current!.subj, slot) : null;
                  const showMsg = !!hov && drag.current!.from !== slot;
                  return (
                    <div
                      key={slot}
                      onDragOver={e => { e.preventDefault(); if (hover !== slot) setHover(slot); }}
                      onDrop={e => { e.preventDefault(); drop(slot); }}
                      className={`relative min-h-[76px] border-b border-l border-slate-100 border-l-slate-200 p-[5px] ${hov ? (conf ? 'bg-red-50 shadow-[inset_0_0_0_2px_#DC2626]' : 'bg-green-50 shadow-[inset_0_0_0_2px_#16A34A]') : 'bg-white'}`}
                    >
                      {S && (
                        <div draggable onDragStart={e => dragStart(e, sub, slot)} onDragEnd={endDrag} className="relative flex h-full min-h-16 cursor-grab flex-col gap-0.5 rounded-md border border-blue-200 bg-blue-50 px-2 py-1.5">
                          <span className="pr-4 text-xs font-semibold text-blue-900">{S.name}</span>
                          <span className="text-[11px] text-slate-700">Prof. {S.t}</span>
                          <span className="text-[11px] text-slate-500">{aulaOf(sub)}</span>
                          <button onClick={() => put(slot, null)} title="Desasignar" className="absolute right-1 top-1 grid h-[18px] w-[18px] place-items-center rounded text-xs text-slate-500 hover:bg-info-bg hover:text-ink"><i className="ph ph-x" /></button>
                        </div>
                      )}
                      {showMsg && <div className={`absolute inset-x-1 bottom-1 rounded bg-white/90 px-1 py-0.5 text-[10px] font-semibold leading-snug ${conf ? 'text-bad-fg' : 'text-green-700'}`}>{conf || (S ? 'Reemplazar bloque' : 'Disponible')}</div>}
                    </div>
                  );
                })}
              </Row>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}

function Row({ time, children }: { time: string; children: React.ReactNode }) {
  return (
    <>
      <div className="border-b border-slate-100 bg-slate-50 px-2.5 py-2 font-mono text-xs font-medium text-slate-600">{time}</div>
      {children}
    </>
  );
}
