import { useCallback, useEffect, useState } from 'react';
import type { BecaFin, BecaNueva } from '@stodia/shared';
import { api } from '../../lib/api';
import { useSession } from '../../lib/session';
import { useToastStack } from '../../components/useToastStack';
import SupervisorGuardModal, { type GuardCfg } from '../../components/finanzas/SupervisorGuardModal';
import { TONE, errMsg } from '../../components/finanzas/fin';
import { useFinCfg } from '../../components/finanzas/finConfig';
import { SL_MSG, useCiclo } from '../../lib/ciclo';

const GRID = 'grid grid-cols-[minmax(0,1.4fr)_130px_120px_minmax(0,1fr)_120px_170px_190px] gap-2';
const TAG: Record<string, readonly [string, string]> = { Aprobada: TONE.ok, Pendiente: TONE.warn, Revocada: TONE.mute };
const sel = 'h-9 rounded-md border border-slate-300 bg-white px-2 text-[13px] text-ink';
const lbl = 'flex flex-col gap-1 text-xs font-medium text-slate-600';

interface BecaForm { est: string; tipo: string; modo: 'pct' | 'fijo'; valor: string; conc: boolean[]; exp: string }
interface Estudiante { id: string; label: string }

export default function Screen() {
  const { user } = useSession();
  const { toast, toasts } = useToastStack();
  const isSuper = user?.rol === 'Super Admin';
  const canApprove = isSuper || user?.rol === 'Director Académico';
  const cfg = useFinCfg();
  const { soloLectura: sl, cicloSeleccionado } = useCiclo(); // Fase 2D: las becas son las del ciclo elegido en el selector global; en otro ciclo, solo lectura
  const [periodo, setPeriodo] = useState('');
  const [tipos, setTipos] = useState<string[]>([]);
  const [BC, setBC] = useState<string[]>([]);
  const [ests, setEsts] = useState<Estudiante[]>([]);
  const [qEst, setQEst] = useState('');
  const per = periodo || cicloSeleccionado || cfg.ciclo;
  const [rows, setRows] = useState<BecaFin[]>([]);
  const [bf, setBf] = useState<BecaForm | null>(null);
  const [guard, setGuard] = useState<GuardCfg | null>(null);

  const load = useCallback(() => api.get<BecaFin[]>('/becas?periodo=' + encodeURIComponent(per)).then(setRows).catch(e => toast(errMsg(e), 'bad')), [per, toast]);
  useEffect(() => { void load(); }, [load]);

  useEffect(() => {
    api.get<{ tipos: string[]; conceptos: string[] }>('/becas/catalogos').then(r => { setTipos(r.tipos); setBC(r.conceptos); }).catch(() => undefined);
  }, []);
  // Estudiantes activos desde la BD, con búsqueda (nombre, carnet) mientras el formulario está abierto.
  useEffect(() => {
    if (!bf) return;
    const t = setTimeout(() => { api.get<Estudiante[]>('/becas/estudiantes?q=' + encodeURIComponent(qEst)).then(setEsts).catch(() => undefined); }, 200);
    return () => clearTimeout(t);
  }, [bf !== null, qEst]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (bf && !bf.est && ests[0]) setBf({ ...bf, est: ests[0].label }); }, [ests]); // eslint-disable-line react-hooks/exhaustive-deps
  const openForm = () => { setQEst(''); setBf({ est: '', tipo: tipos[0] ?? '', modo: 'pct', valor: '25', conc: BC.map((_, i) => i === 0), exp: '' }); };
  const replace = (b: BecaFin) => setRows(r => r.map(x => (x.id === b.id ? b : x)));

  const approve = (b: BecaFin) => {
    const fin = async (pin?: string) => { replace(await api.post<BecaFin>(`/becas/${b.id}/aprobar`, { pin })); toast(`Beca ${b.exp} aprobada · impacta estado de cuenta`, 'ok'); };
    if (canApprove) void fin().catch(e => toast(errMsg(e), 'bad'));
    else setGuard({ title: 'Aprobación del Director Financiero', desc: 'Tu rol puede registrar becas pero no aprobarlas. El Director Financiero debe autorizar con su clave en esta pantalla.', pin: true, label: 'Aprobar beca', onOk: fin });
  };
  const revoke = (b: BecaFin) =>
    setGuard({
      title: 'Revocar beca ' + b.exp, desc: `La revocación recalcula las cuotas futuras de ${b.est} y queda registrada en el audit trail.`,
      code: 'REVOCAR-' + b.exp.replace('EXP-', ''), pin: !isSuper, label: 'Revocar beca',
      onOk: async pin => { replace(await api.post<BecaFin>(`/becas/${b.id}/revocar`, { pin })); toast(`Beca ${b.exp} revocada`, 'warn'); },
    });

  const save = async () => {
    if (!bf) return;
    if (!bf.est) { toast('Selecciona un estudiante', 'bad'); return; }
    if (!bf.exp.trim()) { toast('El expediente de soporte es obligatorio', 'bad'); return; }
    if (!bf.conc.some(Boolean)) { toast('Selecciona al menos un concepto', 'bad'); return; }
    const body: BecaNueva = { alumnoId: ests.find(s => s.label === bf.est)?.id || undefined, est: bf.est, tipo: bf.tipo, modo: bf.modo, valor: bf.valor, conceptos: BC.filter((_, i) => bf.conc[i]), exp: bf.exp, periodo: per };
    try {
      await api.post('/becas', body);
      setBf(null);
      if (periodo && periodo !== (cicloSeleccionado || cfg.ciclo)) setPeriodo(''); else await load();
      toast('Beca registrada · enviada a aprobación', 'ok');
    } catch (e) { toast(errMsg(e), 'bad'); }
  };

  const addBtn = (
    <button onClick={openForm} disabled={sl} title={sl ? SL_MSG : undefined} className="flex h-[34px] items-center gap-1.5 rounded-md bg-accent px-3.5 text-[13px] font-medium text-white hover:bg-accent-dark disabled:opacity-50"><i className="ph ph-plus" />Registrar Beca</button>
  );

  return (
    <div className="flex flex-col gap-3.5">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="m-0 text-xl font-semibold tracking-tight">Becas y Acuerdos</h1>
          <p className="mb-0 mt-1 text-[13px] text-slate-600">Toda beca requiere expediente de soporte y aprobación del Director Financiero antes de impactar el estado de cuenta.</p>
        </div>
        <div className="flex items-center gap-2">
          <span className="inline-flex h-[34px] items-center rounded-md border border-slate-300 bg-white px-2.5 text-[13px] font-medium" title="Cambia el ciclo en la barra lateral">Ciclo {per}</span>
          {addBtn}
        </div>
      </div>

      {rows.length > 0 ? (
        <section className="overflow-auto rounded-lg border border-slate-200 bg-white">
          <div className="min-w-[960px]">
            <div className={`${GRID} border-b border-slate-200 bg-slate-50 px-3.5 py-2 text-[11px] font-semibold uppercase tracking-wide text-slate-600`}>
              <span>Estudiante</span><span>Tipo</span><span>Regla</span><span>Aplica a</span><span>Expediente</span><span>Estado</span><span />
            </div>
            {rows.map(b => {
              const t = TAG[b.estado];
              return (
                <div key={b.id} className={`${GRID} min-h-9 items-center border-b border-slate-100 px-3.5 py-1.5 text-[13px]`}>
                  <span><span className="font-medium">{b.est}</span> <span className="text-xs text-slate-500">· {b.grado}</span></span>
                  <span>{b.tipo}</span>
                  <span className="font-mono text-[13px] font-medium">{b.regla}</span>
                  <span className="text-xs text-slate-600">{b.conceptos}</span>
                  <span className="font-mono text-xs text-accent">{b.exp}</span>
                  <span className="flex flex-col gap-0.5">
                    <span className="inline-flex h-[19px] w-[91px] flex-none items-center justify-center self-start overflow-hidden whitespace-nowrap rounded-full px-[5px] text-[10px] font-medium leading-none" style={{ background: t[0], color: t[1] }}>{b.estado}</span>
                    <span className="text-[11px] text-slate-500">{b.aprob}</span>
                  </span>
                  <span className="flex justify-end gap-1.5">
                    {b.estado === 'Pendiente' && <button onClick={() => approve(b)} disabled={sl} title={sl ? SL_MSG : undefined} className="h-7 rounded-md border border-blue-200 bg-white px-2.5 text-xs font-medium text-accent hover:bg-blue-50 disabled:opacity-50">{canApprove ? 'Aprobar' : 'Solicitar aprobación'}</button>}
                    {b.estado === 'Aprobada' && <button onClick={() => revoke(b)} disabled={sl} title={sl ? SL_MSG : undefined} className="h-7 rounded-md border border-red-300 bg-white px-2.5 text-xs font-medium text-red-600 hover:bg-bad-bg disabled:opacity-50">Revocar</button>}
                  </span>
                </div>
              );
            })}
          </div>
        </section>
      ) : (
        <section className="flex flex-col items-start gap-2.5 rounded-lg border border-slate-200 bg-white px-8 py-12">
          <span className="grid h-14 w-14 place-items-center rounded-full bg-blue-50 text-[28px] text-accent"><i className="ph ph-hand-coins" /></span>
          <div className="text-[15px] font-semibold">No hay becas registradas para este período.</div>
          <div className="max-w-[440px] text-[13px] leading-normal text-slate-600">{cfg.ciclos.find(c => c.n === per)?.estado === 'Planificado' ? 'Las becas del ciclo ' + per + ' se registran después de la generación masiva de cartera. Puedes adelantar solicitudes con su expediente de soporte.' : 'Registra una beca con su expediente de soporte para que pase a aprobación.'}</div>
          {addBtn}
        </section>
      )}

      {bf && (
        <div className="fixed inset-0 z-[70] grid place-items-center bg-slate-900/50 p-5">
          <div className="w-[520px] max-w-full overflow-hidden rounded-[10px] bg-white shadow-2xl">
            <div className="border-b border-slate-200 px-5 py-4 text-base font-semibold">Registrar beca</div>
            <div className="flex flex-col gap-3 px-5 py-4">
              <label className={lbl}>Estudiante
                <input value={qEst} onChange={e => setQEst(e.target.value)} placeholder="Buscar por nombre o carnet…" className="h-9 rounded-md border border-slate-300 px-2 text-[13px] font-normal" />
                <select value={bf.est} onChange={e => setBf({ ...bf, est: e.target.value })} className={sel}>{(ests.some(s => s.label === bf.est) ? ests : [...(bf.est ? [{ id: '', label: bf.est }] : []), ...ests]).map(s => <option key={s.id + s.label} value={s.label}>{s.label}</option>)}{ests.length === 0 && <option value="">Sin resultados</option>}</select>
              </label>
              <div className="flex gap-2.5">
                <label className={`${lbl} flex-1`}>Tipo
                  <select value={bf.tipo} onChange={e => setBf({ ...bf, tipo: e.target.value })} className={sel}>{tipos.map(t => <option key={t}>{t}</option>)}</select>
                </label>
                <label className={`${lbl} w-[120px]`}>Modalidad
                  <select value={bf.modo} onChange={e => setBf({ ...bf, modo: e.target.value as 'pct' | 'fijo' })} className={sel}><option value="pct">%</option><option value="fijo">Monto fijo</option></select>
                </label>
                <label className={`${lbl} w-[110px]`}>Valor
                  <input value={bf.valor} onChange={e => setBf({ ...bf, valor: e.target.value.replace(/[^\d.]/g, '') })} className="h-9 rounded-md border border-slate-300 px-2 text-right font-mono text-[13px]" />
                </label>
              </div>
              <div className="text-xs font-medium text-slate-600">Conceptos afectados</div>
              <div className="flex flex-wrap gap-2">
                {BC.map((n, i) => (
                  <label key={n} className="flex h-8 cursor-pointer items-center gap-1.5 rounded-md border px-2.5 text-[13px]" style={{ borderColor: bf.conc[i] ? '#BFDBFE' : '#CBD5E1', background: bf.conc[i] ? '#EFF6FF' : '#FFFFFF' }}>
                    <input type="checkbox" className="accent-accent" checked={bf.conc[i]} onChange={() => setBf({ ...bf, conc: bf.conc.map((v, j) => (j === i ? !v : v)) })} />{n}
                  </label>
                ))}
              </div>
              <label className={lbl}>Expediente de soporte *
                <input value={bf.exp} onChange={e => setBf({ ...bf, exp: e.target.value.toUpperCase() })} placeholder="EXP-BEC-0000" className="h-9 rounded-md border border-slate-300 px-2 font-mono text-[13px]" />
              </label>
              <div className="rounded-md bg-slate-100 px-2.5 py-2 text-xs text-slate-600">Quedará en <b>Pendiente de aprobación</b> hasta que el Director Financiero la apruebe.</div>
            </div>
            <div className="flex justify-end gap-2 border-t border-slate-200 bg-slate-50 px-5 py-3.5">
              <button onClick={() => setBf(null)} className="h-9 rounded-md border border-slate-300 bg-white px-3.5 text-[13px] font-medium">Cancelar</button>
              <button onClick={() => void save()} className="h-9 rounded-md bg-accent px-3.5 text-[13px] font-semibold text-white">Enviar a aprobación</button>
            </div>
          </div>
        </div>
      )}
      {guard && <SupervisorGuardModal cfg={guard} onClose={() => setGuard(null)} />}
      {toasts}
    </div>
  );
}
