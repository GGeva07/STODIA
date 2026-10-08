import { useEffect, useState } from 'react';
import type { InsConfigResp, InsReq, InsResp, InsTutorLookup } from '@stodia/shared';
import { api } from '../../lib/api';
import { useToast } from '../../components/system/UiProvider';
import { pillBase } from '../../components/system/styles';
import { errMsg, fmt } from '../../components/finanzas/fin';

const STEPS = ['Datos del alumno', 'Tutores', 'Curso y tanda', 'Plan de pago', 'Cierre y factura'];
const GRADOS = ['1ro', '2do', '3ro', '4to', '5to', '6to'];
const inp = 'h-[38px] rounded-md border border-slate-300 px-2.5 text-sm text-ink outline-none focus:border-accent focus:ring-[3px] focus:ring-accent-soft';
const fmtCed = (v: string) => {
  const d = v.replace(/\D/g, '').slice(0, 11);
  return d.length <= 3 ? d : d.length <= 10 ? `${d.slice(0, 3)}-${d.slice(3)}` : `${d.slice(0, 3)}-${d.slice(3, 10)}-${d.slice(10)}`;
};
const blank = (): InsReq => ({ nombre: '', apellido: '', fnac: '', docs: [true, false, false, false], legalCed: '', legalName: '', finSame: true, finCed: '', finName: '', tanda: 'Matutina', grado: 'Primaria · 4to', sec: '', plan: '10', serv: [false, true, false], firma: 'digital' });
type Look = InsTutorLookup | { found: false; empty: true };

/** Consulta de duplicados por documento; 'empty' mientras no haya 11 dígitos. */
function useLookup(ced: string): Look {
  const [res, setRes] = useState<InsTutorLookup | null>(null);
  const ok = ced.replace(/\D/g, '').length >= 11;
  useEffect(() => {
    if (!ok) { setRes(null); return; }
    let live = true;
    api.post<InsTutorLookup>('/inscripcion/tutor', { ced }).then(r => live && setRes(r)).catch(() => live && setRes({ found: false }));
    return () => { live = false; };
  }, [ced, ok]);
  return ok && res ? res : { found: false, empty: true };
}
const isNew = (l: Look) => !l.found && !('empty' in l);

export default function Screen() {
  const toast = useToast();
  const [cfg, setCfg] = useState<InsConfigResp | null>(null);
  const [step, setStep] = useState(1);
  const [w, setW] = useState<InsReq>(blank);
  const [done, setDone] = useState<InsResp | null>(null);
  const [busy, setBusy] = useState(false);
  const set = (p: Partial<InsReq>) => setW(s => ({ ...s, ...p }));

  const loadCfg = () => api.get<InsConfigResp>('/inscripcion/config').then(setCfg).catch(e => toast(errMsg(e), 'bad'));
  useEffect(() => { void loadCfg(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const L = useLookup(w.legalCed);
  const Fl = useLookup(w.finCed);
  const F = w.finSame ? L : Fl;
  const legalName = L.found ? L.nombre! : w.legalName.trim();
  const finName = w.finSame ? legalName : F.found ? F.nombre! : w.finName.trim();
  const COL = cfg?.colegiatura ?? 85000, INS = cfg?.inscripcion ?? 15000;
  const servM = (cfg?.servicios ?? []).reduce((a, s, i) => a + (w.serv[i] ? s.price : 0), 0);
  const plans = {
    '1': { name: 'Pago único anual', amt: fmt(COL * 0.9), desc: '10% de descuento por contado', cuota: servM, n: 1 },
    '10': { name: 'Plan regular · 10 cuotas', amt: '10 × ' + fmt(COL / 10), desc: 'Agosto a mayo, vence día 1', cuota: COL / 10 + servM, n: 10 },
    '4': { name: 'Plan trimestral', amt: '4 × ' + fmt(COL / 4), desc: 'Ago · Nov · Feb · May', cuota: COL / 4, n: 4 },
  };
  const plan = plans[w.plan];
  const factura = INS + (w.plan === '1' ? COL * 0.9 : 0);
  const ok: (string | null)[] = [null,
    w.nombre.trim() && w.apellido.trim() && w.fnac ? null : 'Completa nombres, apellidos y fecha de nacimiento',
    legalName && finName ? null : 'Identifica al tutor legal y financiero',
    w.sec ? null : 'Selecciona una sección con cupo', null, null];
  const grado = w.grado.replace('Primaria · ', '');
  const fullName = `${w.nombre} ${w.apellido}`.trim() || '—';
  const secs = (cfg?.cupos ?? []).filter(c => c.tanda === w.tanda);
  const blocked = step < 5 && !!ok[step];

  const next = async () => {
    if (step < 5) { if (ok[step]) { toast(ok[step]!, 'warn'); return; } setStep(step + 1); return; }
    if (done) { setW(blank()); setStep(1); setDone(null); void loadCfg(); return; }
    setBusy(true);
    try {
      setDone(await api.post<InsResp>('/inscripcion', w));
      toast('Contrato firmado y factura de inscripción emitida', 'ok');
    } catch (e) { toast(errMsg(e), 'bad'); } finally { setBusy(false); }
  };

  const TutorCard = ({ role, desc, tag, ced, onCed, look, name, onName }: { role: string; desc: string; tag: string; ced: string; onCed: (v: string) => void; look: Look; name: string; onName: (v: string) => void }) => (
    <div className="flex flex-col gap-2 rounded-lg border border-slate-200 p-3.5">
      <div className="flex items-center gap-2"><span className={`${pillBase} w-[81px] ${tag}`}>{role}</span><span className="text-xs text-slate-500">{desc}</span></div>
      <label className="flex max-w-[280px] flex-col gap-1 text-xs font-medium text-slate-600">Cédula / Pasaporte
        <input value={ced} onChange={e => onCed(fmtCed(e.target.value))} placeholder="000-0000000-0" className={`${inp} font-mono`} />
      </label>
      {look.found && (
        <div className="flex items-center gap-2.5 rounded-md bg-ok-bg px-3 py-2.5 text-[13px] text-green-900"><i className="ph ph-user-check text-lg" /><div><b>{look.nombre}</b> ya existe en el sistema · {look.info}. Se vinculará sin crear duplicado.</div></div>
      )}
      {isNew(look) && (
        <label className="flex max-w-[420px] flex-col gap-1 text-xs font-medium text-slate-600">Nuevo tutor · nombre completo
          <input value={name} onChange={e => onName(e.target.value)} placeholder="Nombre y apellidos" className={inp} />
        </label>
      )}
    </div>
  );

  const summary: [string, string][] = [['Alumno', fullName], ['Tutor legal', legalName || '—'], ['Tutor financiero', finName || '—'],
    ['Curso', w.sec ? `${grado} ${w.sec} · ${w.tanda}` : '—'], ['Plan', plan.name], ['Servicios', servM ? fmt(servM) + '/mes' : 'Ninguno']];

  return (
    <div className="flex max-w-[1100px] flex-col gap-4">
      <div>
        <h1 className="m-0 text-xl font-semibold tracking-tight">Inscripción y Prematrícula</h1>
        <p className="mb-0 mt-1 text-[13px] text-slate-600">Nuevo ingreso · Ciclo {cfg?.ciclo ?? '2026–2027'}</p>
      </div>

      <ol className="m-0 flex list-none items-center overflow-auto rounded-lg border border-slate-200 bg-white px-[18px] py-3.5">
        {STEPS.map((l, i) => {
          const n = i + 1, fin = n < step || !!done, act = n === step && !done;
          return (
            <li key={l} className="flex min-w-[150px] flex-1 items-center">
              <button onClick={() => n < step && !done && setStep(n)} aria-current={act ? 'step' : undefined} className="flex items-center gap-2 whitespace-nowrap border-0 bg-transparent p-0">
                <span className={`grid h-7 w-7 flex-none place-items-center rounded-full border-2 text-xs font-semibold ${fin ? 'border-accent bg-accent text-white' : act ? 'border-accent bg-white text-accent' : 'border-slate-300 bg-white text-slate-400'}`}>{fin ? <i className="ph-bold ph-check" /> : n}</span>
                <span className={`text-[13px] font-medium ${act ? 'text-ink' : 'text-slate-500'}`}>{l}</span>
              </button>
              {i < 4 && <span className={`mx-2.5 h-0.5 min-w-4 flex-1 ${fin ? 'bg-accent' : 'bg-slate-200'}`} />}
            </li>
          );
        })}
      </ol>

      <div className="grid items-start gap-3.5 [grid-template-columns:repeat(auto-fit,minmax(min(100%,300px),1fr))]">
        <section className="flex flex-col gap-4 rounded-lg border border-slate-200 bg-white p-5">
          {step === 1 && (
            <div className="flex flex-col gap-3.5">
              <div className="text-[15px] font-semibold">Datos del alumno</div>
              <div className="grid gap-3 [grid-template-columns:repeat(auto-fit,minmax(200px,1fr))]">
                <label className="flex flex-col gap-1 text-xs font-medium text-slate-600">Nombres *<input value={w.nombre} onChange={e => set({ nombre: e.target.value })} placeholder="Ej. Lucía María" className={inp} /></label>
                <label className="flex flex-col gap-1 text-xs font-medium text-slate-600">Apellidos *<input value={w.apellido} onChange={e => set({ apellido: e.target.value })} placeholder="Ej. Reyes Batista" className={inp} /></label>
                <label className="flex flex-col gap-1 text-xs font-medium text-slate-600">Fecha de nacimiento *<input type="date" value={w.fnac} onChange={e => set({ fnac: e.target.value })} className={`${inp} font-mono`} /></label>
              </div>
              <div className="mt-1 text-xs font-semibold uppercase tracking-wide text-slate-600">Documentos requeridos</div>
              <div className="grid gap-2 [grid-template-columns:repeat(auto-fit,minmax(220px,1fr))]">
                {(cfg?.docs ?? []).map((n, i) => (
                  <label key={n} className={`flex cursor-pointer items-center gap-2.5 rounded-md border px-3 py-2.5 text-[13px] ${w.docs[i] ? 'border-green-200 bg-green-50' : 'border-slate-200 bg-white'}`}>
                    <input type="checkbox" checked={w.docs[i]} onChange={() => set({ docs: w.docs.map((d, j) => (j === i ? !d : d)) })} className="h-4 w-4 accent-accent" />
                    <span className="flex-1">{n}</span><span className={`text-[11px] font-semibold ${w.docs[i] ? 'text-green-700' : 'text-amber-700'}`}>{w.docs[i] ? 'RECIBIDO' : 'PENDIENTE'}</span>
                  </label>
                ))}
              </div>
            </div>
          )}

          {step === 2 && (
            <div className="flex flex-col gap-3.5">
              <div className="text-[15px] font-semibold">Tutores</div>
              <div className="text-[13px] text-slate-600">Se consulta el documento de identidad para evitar duplicados. Prueba con <span className="font-mono">001-0023940-1</span>.</div>
              {TutorCard({ role: 'TUTOR LEGAL', desc: 'Firma boletines, retiro físico, permisos', tag: 'bg-info-bg text-info-fg', ced: w.legalCed, onCed: v => set({ legalCed: v }), look: L, name: w.legalName, onName: v => set({ legalName: v }) })}
              {!w.finSame && TutorCard({ role: 'TUTOR FINANCIERO', desc: 'Titular del contrato · facturas NCF a su nombre', tag: 'bg-warn-bg text-warn-fg', ced: w.finCed, onCed: v => set({ finCed: v }), look: Fl, name: w.finName, onName: v => set({ finName: v }) })}
              <label className="flex cursor-pointer items-center gap-2 text-[13px]"><input type="checkbox" checked={w.finSame} onChange={() => set({ finSame: !w.finSame })} className="h-4 w-4 accent-accent" />El tutor financiero (responsable de pago) es la misma persona que el tutor legal</label>
            </div>
          )}

          {step === 3 && (
            <div className="flex flex-col gap-3.5">
              <div className="text-[15px] font-semibold">Curso y tanda</div>
              <div className="flex flex-wrap gap-3">
                <label className="flex flex-col gap-1 text-xs font-medium text-slate-600">Tanda
                  <select value={w.tanda} onChange={e => set({ tanda: e.target.value, sec: '' })} className={`${inp} min-w-[180px] bg-white`}><option>Matutina</option><option>Vespertina</option><option>Extendida</option></select>
                </label>
                <label className="flex flex-col gap-1 text-xs font-medium text-slate-600">Nivel · Grado
                  <select value={w.grado} onChange={e => set({ grado: e.target.value, sec: '' })} className={`${inp} min-w-[200px] bg-white`}>{GRADOS.map(g => <option key={g}>Primaria · {g}</option>)}</select>
                </label>
              </div>
              <div className="grid gap-2.5 [grid-template-columns:repeat(auto-fill,minmax(200px,1fr))]">
                {secs.map(c => {
                  const pct = c.used / c.cap, full = c.used >= c.cap, sel = w.sec === c.seccion;
                  return (
                    <button key={c.id} disabled={full} onClick={() => set({ sec: c.seccion })} className={`flex flex-col gap-2 rounded-lg border-2 p-3 text-left ${sel ? 'border-accent bg-blue-50' : 'border-slate-200 bg-white'} ${full ? 'cursor-not-allowed opacity-55' : 'cursor-pointer'}`}>
                      <div className="flex items-baseline justify-between"><span className="text-[15px] font-semibold text-ink">Sección {c.seccion}</span><span className="font-mono text-xs font-medium text-slate-600">{c.used}/{c.cap}</span></div>
                      <div className="h-1.5 overflow-hidden rounded-full bg-slate-200"><div className="h-full" style={{ width: `${Math.round(pct * 100)}%`, background: pct >= 1 ? '#DC2626' : pct >= 0.8 ? '#D97706' : '#16A34A' }} /></div>
                      <span className={`text-xs font-medium ${full ? 'text-red-700' : pct >= 0.8 ? 'text-amber-700' : 'text-green-700'}`}>{full ? 'Sin cupo' : `${c.cap - c.used} cupos disponibles`}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {step === 4 && (
            <div className="flex flex-col gap-3.5">
              <div className="text-[15px] font-semibold">Plan de pago</div>
              <div className="grid gap-2.5 [grid-template-columns:repeat(auto-fit,minmax(200px,1fr))]">
                {(Object.entries(plans) as [InsReq['plan'], (typeof plans)['1']][]).map(([k, p]) => (
                  <button key={k} onClick={() => set({ plan: k })} className={`flex cursor-pointer flex-col gap-1.5 rounded-lg border-2 p-3.5 text-left ${w.plan === k ? 'border-accent bg-blue-50' : 'border-slate-200 bg-white'}`}>
                    <span className="text-sm font-semibold text-ink">{p.name}</span><span className="font-mono text-base font-semibold text-ink">{p.amt}</span><span className="text-xs text-slate-600">{p.desc}</span>
                  </button>
                ))}
              </div>
              <div className="text-xs font-semibold uppercase tracking-wide text-slate-600">Servicios recurrentes opcionales</div>
              <div className="flex flex-col gap-2">
                {(cfg?.servicios ?? []).map((s, i) => (
                  <label key={s.k} className={`flex cursor-pointer items-center gap-2.5 rounded-md border px-3 py-2.5 text-[13px] ${w.serv[i] ? 'border-blue-200 bg-blue-50' : 'border-slate-200 bg-white'}`}>
                    <input type="checkbox" checked={w.serv[i]} onChange={() => set({ serv: w.serv.map((v, j) => (j === i ? !v : v)) })} className="h-4 w-4 accent-accent" />
                    <span className="flex-1">{s.n}</span><span className="font-mono text-[13px] font-medium">{fmt(s.price)}/mes</span>
                  </label>
                ))}
              </div>
            </div>
          )}

          {step === 5 && (
            <div className="flex flex-col gap-3.5">
              <div className="text-[15px] font-semibold">Cierre: contrato y factura</div>
              <div className="rounded-md border border-slate-200 bg-slate-50 px-5 py-[18px] text-[13px] leading-[1.6] text-slate-700">
                <div className="text-xs font-bold tracking-[0.06em] text-ink">CONTRATO DE SERVICIOS EDUCATIVOS · 2026–2027</div>
                Entre <b>Colegio Los Pinos, SRL</b> (RNC <span className="font-mono">1-31-55678-2</span>) y <b>{finName || '—'}</b>, en calidad de tutor financiero de <b>{fullName}</b>, inscrito en <b>{grado} {w.sec || '?'} · {w.tanda}</b>, bajo el plan <b>{plan.name}</b>. Las cuotas vencidas generan recargo del 3% mensual tras 5 días de gracia.
              </div>
              <div className="flex flex-wrap gap-2">
                {([['digital', 'Firma digitalizada', 'ph-signature'], ['fisica', 'Imprimir para firma física', 'ph-printer']] as const).map(([k, l, ic]) => (
                  <button key={k} disabled={!!done} onClick={() => set({ firma: k })} className={`flex h-9 items-center gap-1.5 rounded-md border px-3.5 text-[13px] font-medium ${w.firma === k ? 'border-accent bg-blue-50 text-info-fg' : 'border-slate-300 bg-white text-ink'}`}><i className={`ph ${ic}`} />{l}</button>
                ))}
              </div>
              {done && (
                <div className="flex items-center gap-3 rounded-lg bg-ok-bg p-3.5 text-green-900">
                  <i className="ph-fill ph-check-circle text-[28px] text-green-600" />
                  <div className="text-[13px] leading-normal"><b>Inscripción completada.</b> Matrícula <span className="font-mono">{done.code}</span> · Factura de inscripción NCF <span className="font-mono">{done.ncf}</span> por <b className="font-mono">{fmt(done.factura)}</b>. Cartera de {done.cuotas} cuotas generada en estado Pendiente.</div>
                </div>
              )}
            </div>
          )}

          <div className="flex items-center justify-between gap-2.5 border-t border-slate-200 pt-3">
            <button onClick={() => step > 1 && !done && setStep(step - 1)} className={`h-[38px] rounded-md border border-slate-300 bg-white px-3.5 text-[13px] font-medium hover:bg-slate-100 ${step > 1 && !done ? 'visible' : 'invisible'}`}>Atrás</button>
            <span className="text-xs text-amber-700">{step < 5 ? ok[step] ?? '' : ''}</span>
            <button onClick={next} disabled={busy} className={`h-[38px] rounded-md px-[18px] text-[13px] font-semibold text-white hover:brightness-95 ${blocked ? 'cursor-not-allowed bg-blue-300' : 'cursor-pointer bg-accent'}`}>{step < 5 ? 'Continuar' : done ? 'Nueva inscripción' : 'Emitir contrato y factura'}</button>
          </div>
        </section>

        <aside className="sticky top-0 flex flex-col gap-2.5 rounded-lg border border-slate-200 bg-white p-4">
          <div className="text-xs font-semibold uppercase tracking-wide text-slate-600">Resumen</div>
          {summary.map(([k, v]) => <div key={k} className="flex justify-between gap-2.5 text-[13px]"><span className="text-slate-500">{k}</span><span className="text-right font-medium">{v}</span></div>)}
          <div className="flex flex-col gap-1.5 border-t border-dashed border-slate-200 pt-2.5">
            <div className="flex justify-between text-[13px]"><span className="text-slate-500">Cuota periódica</span><span className="font-mono text-[13px] font-semibold">{fmt(plan.cuota)}</span></div>
            <div className="flex justify-between text-[13px]"><span className="text-slate-500">Factura inicial</span><span className="font-mono text-[15px] font-semibold">{fmt(factura)}</span></div>
          </div>
        </aside>
      </div>
    </div>
  );
}
