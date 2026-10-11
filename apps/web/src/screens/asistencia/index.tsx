import { useEffect, useState } from 'react';
import type { AcadAsisDia, AcadAsisGuardado, AcadMarca } from '@stodia/shared';
import { api } from '../../lib/api';
import AsigSelect from '../../components/academico/AsigSelect';
import { useToast } from '../../components/system/UiProvider';
import { errMsg } from '../../components/finanzas/fin';
import { runPrint } from '../../components/finanzas/print';
import { docLista } from '../../components/academico/printDocs';
import { card, pill, pillBase, th, td, type PillTone } from '../../components/system/styles';
import { SL_MSG, useSoloLectura } from '../../lib/ciclo';

type Marca = AcadMarca | null;
const ST: Record<AcadMarca, { label: string; tone: PillTone; icon: string; border: string }> = {
  P: { label: 'Presente', tone: 'ok', icon: 'ph-fill ph-check-circle', border: 'border-ok-fg' },
  T: { label: 'Tardanza', tone: 'warn', icon: 'ph-fill ph-clock', border: 'border-warn-fg' },
  AJ: { label: 'Ausencia justificada', tone: 'info', icon: 'ph-fill ph-file-text', border: 'border-info-fg' },
  AI: { label: 'Ausencia injustificada', tone: 'bad', icon: 'ph-fill ph-x-circle', border: 'border-bad-fg' },
};
const NEXT: Record<string, AcadMarca> = { null: 'P', P: 'T', T: 'AJ', AJ: 'AI', AI: 'P' };
const COUNTS: [string, Marca, PillTone][] = [['Presentes', 'P', 'ok'], ['Tardanzas', 'T', 'warn'], ['Justificadas', 'AJ', 'info'], ['Injustificadas', 'AI', 'bad'], ['Sin marcar', null, 'mute']];

/** "Apellidos, Nombre" -> "Nombre Apellido1" (shortName del prototipo). */
const shortName = (s: string) => { const [ap, nm] = s.split(', '); return nm ? `${nm} ${ap.split(' ')[0]}` : s; };
const ini = (s: string) => { const p = shortName(s).split(' '); return (p[0][0] + (p[1] ? p[1][0] : '')).toUpperCase(); };
const longDate = (iso: string) => new Date(iso + 'T12:00:00').toLocaleDateString('es-DO', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });

export default function Screen() {
  const toast = useToast();
  const sl = useSoloLectura(); // Fase 2D: ciclo que no es el activo = sin pase de lista (solo asistencia resumida)
  const [d, setD] = useState<AcadAsisDia | null>(null);
  const [att, setAtt] = useState<Marca[]>([]);
  const [notify, setNotify] = useState<boolean[]>([]);
  const [busy, setBusy] = useState(false);

  const [asig, setAsig] = useState('');

  useEffect(() => {
    api.get<AcadAsisDia>('/asistencia' + (asig ? `?asig=${encodeURIComponent(asig)}` : '')).then(r => { setD(r); setAtt(r.cards.map(c => c.estado)); setNotify(r.cards.map(c => c.notificar)); }).catch(e => toast(errMsg(e), 'bad'));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [asig]);

  if (!d) return <div className="text-[13px] text-slate-500">Cargando lista…</div>;
  if (!d.asigId) return <div className="flex flex-col gap-1"><h1 className="m-0 text-xl font-semibold tracking-[-0.01em]">Pase de Lista</h1><p className="text-[13px] text-slate-600">No tienes secciones asignadas. Pide al administrador que te asigne en Catálogos › Docentes.</p></div>;
  const cnt = (k: Marca) => att.filter(x => x === k).length;

  // Ciclo cerrado: el detalle diario no se conserva; se muestra el RESUMEN por alumno (AsistenciaResumen) en solo lectura.
  if (d.resumen) {
    const tot = d.resumen.reduce((a, r) => ({ dias: a.dias + r.dias, p: a.p + r.presentes, t: a.t + r.tardanzas, aj: a.aj + r.ausJust, ai: a.ai + r.ausInjust }), { dias: 0, p: 0, t: 0, aj: 0, ai: 0 });
    return (
      <div className="flex flex-col gap-3.5">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="m-0 text-xl font-semibold tracking-[-0.01em]">Pase de Lista</h1>
            <p className="mt-1 text-[13px] text-slate-600">Asistencia resumida del ciclo {d.ciclo} · {d.seccion || 'sin sección'}{d.tanda ? ` · ${d.tanda}` : ''} · solo lectura</p>
          </div>
          <AsigSelect options={d.asignaciones} value={d.asigId} onChange={setAsig} />
        </div>
        <section className={`${card} overflow-auto`}>
          <table className="w-full min-w-[640px] border-collapse text-[13px]">
            <thead><tr><th className={th}>Estudiante</th><th className={`${th} text-right`}>Días lectivos</th><th className={`${th} text-right`}>Presentes</th><th className={`${th} text-right`}>Tardanzas</th><th className={`${th} text-right`}>Aus. justificadas</th><th className={`${th} text-right`}>Aus. injustificadas</th><th className={`${th} text-right`}>% asistencia</th></tr></thead>
            <tbody>
              {d.resumen.map(r => (
                <tr key={r.rosterId} className="h-9">
                  <td className={td}>{r.nombre}</td>
                  <td className={`${td} text-right font-mono`}>{r.dias}</td><td className={`${td} text-right font-mono`}>{r.presentes}</td><td className={`${td} text-right font-mono`}>{r.tardanzas}</td>
                  <td className={`${td} text-right font-mono`}>{r.ausJust}</td><td className={`${td} text-right font-mono`}>{r.ausInjust}</td>
                  <td className={`${td} text-right font-mono font-medium`}>{r.dias ? `${(r.presentes / r.dias * 100).toFixed(1)}%` : '—'}</td>
                </tr>
              ))}
              {d.resumen.length === 0 && <tr><td colSpan={7} className="px-3 py-6 text-center text-[13px] text-slate-500">Sin asistencia resumida para esta sección en el ciclo {d.ciclo}.</td></tr>}
            </tbody>
            {d.resumen.length > 0 && <tfoot><tr className="h-9 bg-slate-50 font-semibold"><td className={td}>Total de la sección</td><td className={`${td} text-right font-mono`}>{tot.dias}</td><td className={`${td} text-right font-mono`}>{tot.p}</td><td className={`${td} text-right font-mono`}>{tot.t}</td><td className={`${td} text-right font-mono`}>{tot.aj}</td><td className={`${td} text-right font-mono`}>{tot.ai}</td><td className={`${td} text-right font-mono`}>{tot.dias ? `${(tot.p / tot.dias * 100).toFixed(1)}%` : '—'}</td></tr></tfoot>}
          </table>
        </section>
      </div>
    );
  }

  const save = async () => {
    if (sl) { toast(SL_MSG, 'warn'); return; }
    const un = cnt(null);
    if (un) { toast(`Faltan ${un} estudiantes por marcar`, 'warn'); return; }
    setBusy(true);
    try {
      const res = await api.post<AcadAsisGuardado>('/asistencia', { fecha: d.fecha, asig: d.asigId, items: d.cards.map((c, i) => ({ rosterId: c.rosterId, estado: att[i], notificar: notify[i] })) });
      toast('Pase de lista registrado' + (res.notificados ? ` · ${res.notificados} notificación(es) SMS/Push enviadas a tutores` : ''), 'ok');
    } catch (e) { toast(errMsg(e), 'bad'); } finally { setBusy(false); }
  };

  const printLista = () => runPrint('lista', docLista(d, d.cards.map(c => c.nombre)));

  return (
    <div className="flex flex-col gap-3.5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="m-0 text-xl font-semibold tracking-[-0.01em]">Pase de Lista</h1>
          <p className="mt-1 text-[13px] text-slate-600">Vista de tableta del docente · toca una tarjeta para rotar el estado</p>
        </div>
        <AsigSelect options={d.asignaciones} value={d.asigId} onChange={setAsig} />
      </div>
      <div className="max-w-[1080px] rounded-[28px] bg-ink p-3.5 shadow-[0_20px_40px_rgba(15,23,42,0.18)]">
        <div className="overflow-hidden rounded-2xl bg-canvas">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 bg-white px-5 py-4">
            <div>
              <div className="text-lg font-semibold">{d.seccion} · {d.tanda}</div>
              <div className="text-[13px] text-slate-600">{longDate(d.fecha)} · {d.bloque} · {d.cards.length} estudiantes</div>
            </div>
            <div className="flex items-center gap-2">
              <button onClick={printLista} title="Imprimir lista de contingencia" className="grid h-12 w-12 place-items-center rounded-[10px] border border-slate-300 bg-white text-xl text-slate-600 hover:bg-slate-100"><i className="ph ph-printer" /></button>
              <button onClick={() => { setAtt(d.cards.map(() => 'P')); toast(`${d.cards.length} estudiantes marcados como presentes`, 'ok'); }} className="flex h-12 items-center gap-2 rounded-[10px] bg-green-600 px-5 text-[15px] font-semibold text-white hover:bg-green-700"><i className="ph-bold ph-checks text-lg" />Marcar Todos Presentes</button>
            </div>
          </div>
          <div className="flex flex-wrap gap-2 border-b border-slate-200 px-5 py-3">
            {COUNTS.map(([l, k, t]) => <span key={l} className={`${pillBase} ${pill[t]} !w-[81px] gap-2 !text-[10px]`}>{l}<b className="font-mono">{cnt(k)}</b></span>)}
          </div>
          <div className="grid grid-cols-[repeat(auto-fill,minmax(180px,1fr))] gap-3 p-5">
            {d.cards.map((c, i) => {
              const st = att[i] ? ST[att[i]!] : null;
              return (
                <div
                  key={c.rosterId} role="button" tabIndex={0}
                  onClick={() => setAtt(a => a.map((x, j) => (j === i ? NEXT[String(x)] : x)))}
                  onKeyDown={e => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), setAtt(a => a.map((x, j) => (j === i ? NEXT[String(x)] : x))))}
                  className={`flex min-h-[176px] cursor-pointer select-none flex-col items-start gap-2.5 rounded-xl border-2 bg-white p-3.5 transition-colors duration-100 ${st ? st.border : 'border-slate-200'}`}
                >
                  <div className={`grid h-16 w-16 place-items-center rounded-xl text-xl font-semibold ${st ? pill[st.tone] : 'bg-slate-200 text-slate-700'}`}>{ini(c.nombre)}</div>
                  <div className="text-[15px] font-semibold leading-tight">{shortName(c.nombre)}</div>
                  <span className={`inline-flex h-7 items-center gap-1.5 rounded-full px-2.5 text-xs font-semibold ${st ? pill[st.tone] : 'bg-mute-bg text-slate-500'}`}><i className={st ? st.icon : 'ph ph-circle-dashed'} />{st ? st.label : 'Sin marcar'}</span>
                  {att[i] === 'AI' && (
                    <label onClick={e => e.stopPropagation()} className="flex min-h-7 cursor-pointer items-center gap-2 text-xs font-medium text-bad-fg">
                      <input type="checkbox" checked={notify[i]} onChange={() => setNotify(n => n.map((x, j) => (j === i ? !x : x)))} className="h-[18px] w-[18px] accent-red-600" />Notificar tutor (SMS / Push)
                    </label>
                  )}
                </div>
              );
            })}
          </div>
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 bg-white px-5 py-3.5">
            <span className="text-[13px] text-slate-600">Presente → Tardanza → Ausencia justificada → Ausencia injustificada</span>
            <button onClick={save} disabled={busy} className="h-12 rounded-[10px] bg-accent px-[22px] text-[15px] font-semibold text-white hover:bg-accent-dark disabled:opacity-60">Registrar pase de lista</button>
          </div>
        </div>
      </div>
    </div>
  );
}
