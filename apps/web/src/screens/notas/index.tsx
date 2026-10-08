import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { AcadNotaGuardada, AcadNotasMatriz } from '@stodia/shared';
import { api } from '../../lib/api';
import SegTabs from '../../components/SegTabs';
import AsigSelect from '../../components/academico/AsigSelect';
import { useToast } from '../../components/system/UiProvider';
import { errMsg } from '../../components/finanzas/fin';
import { descargarPdf, runPrint, usePrintBusy } from '../../components/finanzas/print';
import { docBoletines, docSabana } from '../../components/academico/printDocs';
import { pill, type PillTone } from '../../components/system/styles';

const DENS = [{ k: '36', label: 'Compacta' }, { k: '48', label: 'Regular' }, { k: '60', label: 'Cómoda' }];
const valid = (v: string) => v !== '' && !isNaN(Number(v)) && Number(v) >= 0 && Number(v) <= 100;
const letter = (v: number) => (v >= 90 ? 'A' : v >= 80 ? 'B' : v >= 70 ? 'C' : 'F');
const LTONE: Record<string, PillTone> = { A: 'ok', B: 'info', C: 'warn', F: 'bad', '—': 'mute' };

type Comps = AcadNotasMatriz['comps'];
/** Promedio de competencias, final (rúbrica: 70% + 30% examen en la demo) y letra, igual que gCalc del prototipo; los pesos salen de la rúbrica. */
function calc(g: string[], comps: Comps) {
  const ci = comps.map((c, i) => (c.k === 'EX' ? -1 : i)).filter(i => i >= 0), ei = comps.findIndex(c => c.k === 'EX');
  const vs = ci.filter(i => valid(g[i]));
  const wsum = vs.reduce((a, i) => a + comps[i].w, 0);
  const prom = vs.length ? (wsum ? vs.reduce((a, i) => a + Number(g[i]) * comps[i].w, 0) / wsum : vs.reduce((a, i) => a + Number(g[i]), 0) / vs.length) : null;
  const allC = ci.length > 0 && ci.every(i => valid(g[i]));
  const exW = ei >= 0 ? comps[ei].w / (comps.reduce((a, c) => a + c.w, 0) || 100) : 0;
  const fin = allC && ei < 0 ? prom : allC && valid(g[ei]) ? prom! * (1 - exW) + Number(g[ei]) * exW : null;
  const base = fin ?? prom;
  return { prom, fin, base, L: base != null ? letter(base) : '—' };
}

export default function Screen() {
  const toast = useToast();
  const pb = usePrintBusy();
  const [m, setM] = useState<AcadNotasMatriz | null>(null);
  const [pick, setPick] = useState<{ asig?: string; periodo?: string }>({});
  const [grades, setGrades] = useState<string[][]>([]);
  const [density, setDensity] = useState('36');
  const [fcell, setFcell] = useState<string | null>(null);
  const [menu, setMenu] = useState(false);
  const [audit, setAudit] = useState<(AcadNotaGuardada & { who: string; col: string })[]>([]);
  const orig = useRef('');
  const pend = useRef<Record<string, { r: number; c: number }>>({});
  const timer = useRef<number>();
  const gradesRef = useRef(grades);
  gradesRef.current = grades;

  useEffect(() => {
    window.clearTimeout(timer.current);
    pend.current = {};
    const q = new URLSearchParams(); if (pick.asig) q.set('asig', pick.asig); if (pick.periodo) q.set('periodo', pick.periodo);
    api.get<AcadNotasMatriz>('/notas' + (q.toString() ? '?' + q.toString() : '')).then(d => { setM(d); setGrades(d.rows.map(r => r.g)); setAudit([]); }).catch(e => toast(errMsg(e), 'bad'));
    return () => window.clearTimeout(timer.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pick]);

  const flush = useCallback(async () => {
    const todo = Object.values(pend.current);
    pend.current = {};
    for (const { r, c } of todo) {
      try {
        const row = m!.rows[r], valor = gradesRef.current[r][c];
        if (valor !== '' && !valid(valor)) continue; // valor inválido: no se guarda hasta corregirlo
        const res = await api.put<AcadNotaGuardada>('/notas/celda', { rosterId: row.id, comp: c, valor, asig: m!.asigId, periodo: m!.periodo });
        if (res.prev !== res.next) setAudit(a => [{ ...res, prev: res.prev || '∅', next: res.next || '∅', who: row.nombre, col: m!.comps[c].k }, ...a].slice(0, 6));
      } catch (e) { toast(errMsg(e), 'bad'); }
    }
  }, [m, toast]);

  const setGrade = (r: number, c: number, raw: string) => {
    const v = raw.replace(/[^\d.]/g, '').slice(0, 5);
    setGrades(g => g.map((row, i) => (i === r ? row.map((x, j) => (j === c ? v : x)) : row)));
    if (v === '' || valid(v)) {
      pend.current[`${r}-${c}`] = { r, c };
      window.clearTimeout(timer.current);
      timer.current = window.setTimeout(flush, 500); // guardado en lote tras 500 ms
    }
  };

  const onKey = (r: number, c: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    const k = e.key;
    let dr = 0, dc = 0;
    if (k === 'Enter') dr = e.shiftKey ? -1 : 1; else if (k === 'ArrowDown') dr = 1; else if (k === 'ArrowUp') dr = -1;
    else if (k === 'Tab') dc = e.shiftKey ? -1 : 1; else if (k === 'ArrowRight') dc = 1; else if (k === 'ArrowLeft') dc = -1;
    else if (k === 'Escape') { setGrade(r, c, orig.current); return; } else return;
    e.preventDefault();
    const v = grades[r][c];
    if (v !== '' && !valid(v)) { toast(`Valor inválido «${v}»: la nota máxima es 100. Corrige para continuar.`, 'bad'); return; }
    let nr = r + dr, nc = c + dc;
    const last = m!.comps.length - 1;
    if (nc > last) { nc = 0; nr++; }
    if (nc < 0) { nc = last; nr--; }
    nr = Math.max(0, Math.min(grades.length - 1, nr));
    document.querySelector<HTMLInputElement>(`[data-cell="${nr}-${nc}"]`)?.focus();
  };

  const onBlur = (r: number, c: number) => {
    if (grades[r][c] !== '' && !valid(grades[r][c])) {
      setTimeout(() => { if ((document.activeElement as HTMLElement | null)?.dataset?.cell) document.querySelector<HTMLInputElement>(`[data-cell="${r}-${c}"]`)?.focus(); }, 0);
    }
    setFcell(f => (f === `${r}-${c}` ? null : f));
  };

  const calcs = useMemo(() => grades.map(g => calc(g, m?.comps ?? [])), [grades, m]);
  const bases = calcs.map(c => c.base).filter((v): v is number => v != null);
  const pendCells = grades.reduce((a, r) => a + r.filter(v => v === '').length, 0);

  if (!m) return <div className="text-[13px] text-slate-500">Cargando matriz…</div>;
  if (!m.asigId) return <div className="flex flex-col gap-1"><h1 className="m-0 text-xl font-semibold tracking-[-0.01em]">Matriz de Notas</h1><p className="text-[13px] text-slate-600">No tienes secciones ni materias asignadas. Pide al administrador que te asigne en Catálogos › Docentes.</p></div>;
  const cc = m.comps.filter(c => c.k !== 'EX'), exam = m.comps.find(c => c.k === 'EX');
  const rango = cc.length > 1 ? `${cc[0].k}–${cc[cc.length - 1].k}` : cc[0]?.k ?? '';
  const total = m.rows.length;
  const f1 = (v: number | null) => (v != null ? v.toFixed(1) : '—');

  const filas = () => m.rows.map((r, i) => ({ nombre: r.nombre, g: grades[i], prom: calcs[i].prom, fin: calcs[i].fin, L: calcs[i].L, base: calcs[i].base }));
  const printSabana = () => { setMenu(false); runPrint('sabana', docSabana(m, filas())); };
  const printBoletines = () => { setMenu(false); runPrint('boletines', docBoletines(m, filas(), pendCells > 0)); };
  const generarBoletines = async () => {
    if (pendCells) toast(`Hay ${pendCells} celdas sin capturar: el boletín se generará como borrador`, 'warn');
    try {
      if (!pendCells) toast('Generando boletines…', 'info');
      await descargarPdf(docBoletines(m, filas(), pendCells > 0));
      if (!pendCells) toast('Boletines PDF generados con folio de verificación', 'ok');
    } catch (e) { toast(errMsg(e), 'bad'); }
  };
  const pbS = pb('sabana', 'Sábana del Grado', 'ph ph-table'), pbB = pb('boletines', 'Boletines Individuales', 'ph ph-files');

  const th = 'border-b border-slate-200 px-2.5 py-1.5 text-right';
  return (
    <div className="flex flex-col gap-3.5">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="m-0 text-xl font-semibold tracking-[-0.01em]">Matriz de Notas</h1>
          <p className="mt-1 text-[13px] text-slate-600">{m.materia} · {m.seccion} · {m.nivel} · {m.periodoLabel} · Prof. {m.docente}</p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <AsigSelect options={m.asignaciones} value={m.asigId} onChange={asig => setPick(p => ({ ...p, asig }))} periodos={m.periodos} periodo={m.periodo} onPeriodo={periodo => setPick(p => ({ ...p, periodo }))} />
          <SegTabs options={DENS} value={density} onChange={setDensity} />
          <div className="relative z-30">
            <button onClick={() => setMenu(o => !o)} className="flex h-[34px] items-center gap-1.5 rounded-md border border-slate-300 bg-white px-3 text-[13px] font-medium hover:bg-slate-100"><i className="ph ph-printer" />Exportar Notas <i className="ph ph-caret-down text-[11px]" /></button>
            {menu && (
              <div className="absolute right-0 top-10 z-40 w-[270px] rounded-lg border border-slate-200 bg-white p-1.5 shadow-[0_12px_32px_rgba(15,23,42,0.18)]">
                <div className="px-2.5 py-1.5 text-[11px] font-medium uppercase tracking-[0.04em] text-slate-500">¿Qué deseas imprimir?</div>
                <button onClick={printSabana} className="flex h-[34px] w-full items-center gap-2 rounded-md px-2.5 text-left text-[13px] hover:bg-slate-100"><i className={pbS.icon + ' text-base text-slate-600'} style={{ animation: pbS.spin }} />{pbS.label}</button>
                <button onClick={printBoletines} className="flex h-[34px] w-full items-center gap-2 rounded-md px-2.5 text-left text-[13px] hover:bg-slate-100"><i className={pbB.icon + ' text-base text-slate-600'} style={{ animation: pbB.spin }} />{pbB.label}</button>
              </div>
            )}
          </div>
          <button onClick={generarBoletines} className="flex h-[34px] items-center gap-1.5 rounded-md border border-slate-300 bg-white px-3 text-[13px] font-medium hover:bg-slate-100"><i className="ph ph-file-pdf" />Generar boletines</button>
        </div>
      </div>

      <div className="flex flex-wrap items-baseline gap-7">
        <Stat label="Promedio de sección" v={bases.length ? (bases.reduce((a, b) => a + b, 0) / bases.length).toFixed(1) : '—'} />
        <Stat label={`Aprobados (≥ ${m.minimo})`} v={`${bases.filter(v => v >= m.minimo).length} / ${total}`} />
        <Stat label="Celdas sin capturar" v={String(pendCells)} color={pendCells ? '#B45309' : '#15803D'} />
        <div className="flex-1" />
        <div className="flex flex-wrap gap-2.5 text-xs text-slate-500">
          <span><b className="text-slate-700">Enter</b> baja</span><span><b className="text-slate-700">Tab</b> siguiente competencia</span><span><b className="text-slate-700">Flechas</b> mover</span><span><b className="text-slate-700">Esc</b> revertir</span>
        </div>
      </div>

      <div className="overflow-auto rounded-lg border border-slate-200 bg-white">
        <table className="w-full min-w-[880px] border-collapse text-[13px]">
          <thead>
            <tr className="bg-slate-50">
              <th className="w-9 border-b border-slate-200 px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-[0.04em] text-slate-600">#</th>
              <th className="border-b border-slate-200 px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-[0.04em] text-slate-600">Estudiante</th>
              {m.comps.map(c => (
                <th key={c.k} title={c.n} className={`${th} w-[86px] border-l border-slate-100`}>
                  <div className="font-mono text-xs font-semibold text-ink">{c.k}</div>
                  <div className="whitespace-nowrap text-[10px] font-medium text-slate-500">{c.n}</div>
                </th>
              ))}
              <th className={`${th} w-[92px] border-l border-slate-200 bg-slate-100`}><div className="text-[11px] font-semibold uppercase text-slate-600">Promedio</div><div className="text-[10px] font-normal text-slate-500">{rango}</div></th>
              <th className={`${th} w-[92px] bg-slate-100`}><div className="text-[11px] font-semibold uppercase text-slate-600">Final</div><div className="text-[10px] font-normal text-slate-500">{exam ? `${+(100 - exam.w).toFixed(1)}% + ${exam.w}% Ex.` : 'Promedio'}</div></th>
              <th className="w-[70px] border-b border-slate-200 bg-slate-100 px-2.5 py-1.5 text-center text-[11px] font-semibold uppercase text-slate-600">Letra</th>
            </tr>
          </thead>
          <tbody>
            {m.rows.map((row, r) => {
              const c = calcs[r];
              return (
                <tr key={row.id} className="border-b border-slate-100">
                  <td className="border-b border-slate-100 px-3 font-mono text-xs text-slate-400">{r + 1}</td>
                  <td className="whitespace-nowrap border-b border-slate-100 px-3">{row.nombre}</td>
                  {grades[r].map((v, ci) => {
                    const key = `${r}-${ci}`, bad = v !== '' && !valid(v), f = fcell === key;
                    return (
                      <td key={ci} className="border-b border-l border-slate-100 p-0">
                        <input
                          data-cell={key} value={v} inputMode="decimal" aria-label={`${row.nombre} ${m.comps[ci].k}`}
                          onChange={e => setGrade(r, ci, e.target.value)} onKeyDown={e => onKey(r, ci, e)}
                          onFocus={e => { orig.current = v; setFcell(key); const t = e.target; setTimeout(() => t.select(), 0); }}
                          onBlur={() => onBlur(r, ci)}
                          style={{ height: `${density}px` }}
                          className={`block w-full border-0 px-2.5 text-right font-mono text-[13px] font-medium outline-none ${bad ? 'bg-red-50 text-[#B91C1C] shadow-[inset_0_0_0_2px_#DC2626] [animation:mxBlink_0.8s_ease-in-out_infinite]' : f ? 'bg-white text-ink shadow-[inset_0_0_0_2px_#2563EB]' : m.comps[ci].k === 'EX' ? 'bg-[#FAFBFD] text-ink' : 'bg-white text-ink'}`}
                        />
                      </td>
                    );
                  })}
                  <td className={`border-b border-l border-slate-200 bg-slate-50 px-2.5 text-right font-mono text-[13px] font-medium ${c.fin == null && c.prom != null ? 'text-slate-500' : 'text-ink'}`}>{f1(c.prom)}</td>
                  <td className="border-b border-slate-100 bg-slate-50 px-2.5 text-right font-mono text-[13px] font-semibold">{f1(c.fin)}</td>
                  <td className="border-b border-slate-100 bg-slate-50 px-2.5 text-center"><span className={`inline-grid h-[22px] min-w-[26px] place-items-center rounded px-1.5 font-mono text-xs font-semibold ${pill[LTONE[c.L]]}`}>{c.L}</span></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <section className="rounded-lg border border-slate-200 bg-white">
        <div className="flex items-center justify-between border-b border-slate-200 px-3.5 py-2.5"><span className="text-[13px] font-semibold">Registro de auditoría</span><span className="text-xs text-slate-500">Append-only · Usuario · UTC · IP · valor anterior → nuevo</span></div>
        {audit.map((a, i) => (
          <div key={i} className="flex flex-wrap gap-3.5 border-b border-slate-100 px-3.5 py-[7px] font-mono text-xs text-slate-700">
            <span className="text-slate-500">{a.t}</span><span>{a.usr}</span><span className="text-slate-500">{a.ip}</span>
            <span className="font-sans">{a.who} · {a.col}</span>
            <span><span className="text-red-600">{a.prev}</span> → <span className="text-green-600">{a.next}</span></span>
          </div>
        ))}
        {audit.length === 0 && <div className="p-3.5 text-[13px] text-slate-500">Sin cambios en esta sesión. Edita una celda: se guarda en lote tras 500 ms.</div>}
      </section>
    </div>
  );
}

function Stat({ label, v, color }: { label: string; v: string; color?: string }) {
  return <div><div className="text-xs text-slate-500">{label}</div><div className="font-mono text-xl font-semibold" style={color ? { color } : undefined}>{v}</div></div>;
}
