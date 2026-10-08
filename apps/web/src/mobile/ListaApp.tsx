import { useEffect, useMemo, useState } from 'react';
import type { MarcaAsistencia, MobListaData } from '@stodia/shared';
import { api } from '../lib/api';
import { runPrint } from '../components/finanzas/print';
import { docLista } from '../components/academico/printDocs';
import AsigSelect from '../components/academico/AsigSelect';

type Marca = MarcaAsistencia | null;
const ST: Record<MarcaAsistencia, { l: string; icon: string; chip: string; border: string; av: string }> = {
  P: { l: 'Presente', icon: 'ph-fill ph-check-circle', chip: 'bg-ok-bg text-ok-fg', border: 'border-ok-fg', av: 'bg-ok-bg text-ok-fg' },
  T: { l: 'Tardanza', icon: 'ph-fill ph-clock', chip: 'bg-warn-bg text-warn-fg', border: 'border-warn-fg', av: 'bg-warn-bg text-warn-fg' },
  AJ: { l: 'Ausencia justificada', icon: 'ph-fill ph-file-text', chip: 'bg-info-bg text-info-fg', border: 'border-info-fg', av: 'bg-info-bg text-info-fg' },
  AI: { l: 'Ausencia injustificada', icon: 'ph-fill ph-x-circle', chip: 'bg-bad-bg text-bad-fg', border: 'border-bad-fg', av: 'bg-bad-bg text-bad-fg' },
};
const NEXT: Record<string, MarcaAsistencia> = { null: 'P', P: 'T', T: 'AJ', AJ: 'AI', AI: 'P' };
const COUNTS: [string, Marca, string][] = [
  ['Presentes', 'P', 'bg-ok-bg text-ok-fg'], ['Tardanzas', 'T', 'bg-warn-bg text-warn-fg'], ['Justificadas', 'AJ', 'bg-info-bg text-info-fg'],
  ['Injustificadas', 'AI', 'bg-bad-bg text-bad-fg'], ['Sin marcar', null, 'bg-mute-bg text-mute-fg'],
];
const short = (n: string) => { const [ap, no = ''] = n.split(', '); return `${no.split(' ')[0]} ${ap.split(' ')[0]}`.trim(); };
const longDate = (iso: string) => new Date(iso + 'T12:00:00').toLocaleDateString('es-DO', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
const ini = (n: string) => { const [ap, no = ''] = n.split(', '); return ((no[0] ?? '') + ap[0]).toUpperCase(); };

/** Pase de Lista en tableta (prototipo L447-490). Marco de dispositivo solo en escritorio muy ancho. */
export default function ListaApp() {
  const [data, setData] = useState<MobListaData | null>(null);
  const [att, setAtt] = useState<Marca[]>([]);
  const [notify, setNotify] = useState<boolean[]>([]);
  const [msg, setMsg] = useState<{ t: string; bad?: boolean } | null>(null);
  const [saving, setSaving] = useState(false);
  const [asig, setAsig] = useState('');

  useEffect(() => {
    api.get<MobListaData>('/movil/lista' + (asig ? `?asig=${encodeURIComponent(asig)}` : ''))
      .then(d => { setData(d); setAtt(d.alumnos.map(a => a.estado)); setNotify(d.alumnos.map(a => a.notificar)); })
      .catch(e => setMsg({ t: e.message, bad: true }));
  }, [asig]);

  const counts = useMemo(() => COUNTS.map(([l, k, c]) => ({ l, c, n: att.filter(x => x === k).length })), [att]);
  const printLista = () => { if (data) runPrint('lista', docLista(data, data.alumnos.map(a => a.nombre))); };
  const rotate = (i: number) => setAtt(a => a.map((x, j) => (j === i ? NEXT[String(x)] : x)));

  const save = async () => {
    if (!data) return;
    const un = att.filter(x => x === null).length;
    if (un) { setMsg({ t: `Faltan ${un} estudiantes por marcar`, bad: true }); return; }
    setSaving(true);
    try {
      const r = await api.put<{ notificados: number }>('/movil/lista', {
        fecha: data.fecha,
        seccion: data.seccion,
        asig: data.asigId,
        marcas: data.alumnos.map((a, i) => ({ alumnoId: a.id, estado: att[i] as MarcaAsistencia, notificar: notify[i] })),
      });
      setMsg({ t: 'Pase de lista registrado' + (r.notificados ? ` · ${r.notificados} notificación(es) SMS/Push a tutores` : '') });
    } catch (e) {
      setMsg({ t: (e as Error).message, bad: true });
    }
    setSaving(false);
  };

  return (
    <div className="mx-auto flex min-h-0 w-full flex-1 flex-col p-4 xl:max-w-[1080px] xl:flex-none xl:rounded-[28px] xl:bg-ink xl:p-3.5 xl:shadow-2xl">
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl bg-canvas xl:flex-none xl:rounded-2xl">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 bg-white px-5 py-4">
          <div>
            <div className="text-lg font-semibold">{data ? (data.seccion ? data.seccion.replace('-', ' ') + ' · ' + (data.tanda ?? '') : 'Pase de Lista') : 'Pase de Lista'}</div>
            <div className="text-[13px] text-slate-600">{data ? longDate(data.fecha) : ''} · {data?.bloque ?? ''} · {data?.alumnos.length ?? 0} estudiantes</div>
            {data && <div className="mt-1.5"><AsigSelect options={data.asignaciones ?? []} value={data.asigId ?? ''} onChange={setAsig} /></div>}
          </div>
          <div className="flex items-center gap-2">
            <button onClick={printLista} title="Imprimir lista de contingencia" className="grid h-12 w-12 place-items-center rounded-[10px] border border-slate-300 bg-white text-xl text-slate-600 active:bg-slate-100"><i className="ph ph-printer" /></button>
            <button onClick={() => { setAtt(a => a.map(() => 'P')); setMsg({ t: `${att.length} estudiantes marcados como presentes` }); }} className="flex h-12 items-center gap-2 rounded-[10px] bg-green-600 px-5 text-[15px] font-semibold text-white active:bg-green-700">
              <i className="ph-bold ph-checks text-lg" />Marcar Todos Presentes
            </button>
          </div>
        </div>
        <div className="flex flex-wrap gap-2 border-b border-slate-200 px-5 py-3">
          {counts.map(c => (
            <span key={c.l} className={`inline-flex h-[19px] w-[81px] flex-none items-center justify-center gap-2 overflow-hidden text-ellipsis whitespace-nowrap rounded-full px-[5px] text-[10px] font-medium leading-none ${c.c}`}>{c.l}<b className="font-mono">{c.n}</b></span>
          ))}
        </div>
        <div className="grid grid-cols-[repeat(auto-fill,minmax(180px,1fr))] gap-3 overflow-y-auto overscroll-contain p-5">
          {data?.alumnos.map((a, i) => {
            const s = att[i] ? ST[att[i] as MarcaAsistencia] : null;
            return (
              <div
                key={a.id}
                role="button"
                tabIndex={0}
                onClick={() => rotate(i)}
                onKeyDown={e => (e.key === 'Enter' || e.key === ' ') && rotate(i)}
                className={`flex min-h-[176px] cursor-pointer select-none flex-col items-start gap-2.5 rounded-xl border-2 bg-white p-3.5 ${s ? s.border : 'border-slate-200'}`}
              >
                <div className={`grid h-16 w-16 place-items-center rounded-xl text-xl font-semibold ${s ? s.av : 'bg-slate-200 text-slate-700'}`}>{ini(a.nombre)}</div>
                <div className="text-[15px] font-semibold leading-tight">{short(a.nombre)}</div>
                <span className={`inline-flex h-7 items-center gap-1.5 rounded-full px-2.5 text-xs font-semibold ${s ? s.chip : 'bg-slate-100 text-slate-500'}`}>
                  <i className={s ? s.icon : 'ph ph-circle-dashed'} />{s ? s.l : 'Sin marcar'}
                </span>
                {att[i] === 'AI' && (
                  <label onClick={e => e.stopPropagation()} className="flex min-h-[28px] cursor-pointer items-center gap-2 text-xs font-medium text-bad-fg">
                    <input type="checkbox" checked={notify[i]} onChange={() => setNotify(n => n.map((x, j) => (j === i ? !x : x)))} className="h-[18px] w-[18px] accent-red-600" />
                    Notificar tutor (SMS / Push)
                  </label>
                )}
              </div>
            );
          })}
          {data && data.alumnos.length === 0 && <p className="text-sm text-slate-500">{data.asigId ? 'No hay estudiantes activos en esta sección.' : 'No tienes secciones asignadas.'}</p>}
        </div>
        <div className="flex flex-none flex-wrap items-center justify-between gap-3 border-t border-slate-200 bg-white px-5 py-3.5 pb-[max(0.875rem,env(safe-area-inset-bottom))]">
          <span className="text-[13px] text-slate-600">Presente → Tardanza → Ausencia justificada → Ausencia injustificada</span>
          <button disabled={saving || !data} onClick={save} className="h-12 rounded-[10px] bg-accent px-[22px] text-[15px] font-semibold text-white active:bg-accent-dark disabled:opacity-50">
            {saving ? 'Guardando…' : 'Registrar pase de lista'}
          </button>
        </div>
      </div>
      {msg && (
        <div role="status" onClick={() => setMsg(null)} className={`fixed inset-x-4 bottom-4 z-20 mx-auto max-w-md rounded-xl px-4 py-3 text-center text-sm text-white shadow-lg ${msg.bad ? 'bg-bad-fg' : 'bg-ink'}`}>
          {msg.t}
        </div>
      )}
    </div>
  );
}
