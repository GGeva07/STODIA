import { useCallback, useEffect, useState } from 'react';
import type { BecaFin, BecaNueva } from '@stodia/shared';
import { api } from '../../lib/api';
import { useSession } from '../../lib/session';
import { useToastStack } from '../../components/useToastStack';
import SupervisorGuardModal, { type GuardCfg } from '../../components/finanzas/SupervisorGuardModal';
import { TONE, errMsg } from '../../components/finanzas/fin';

const BC = ['Colegiatura', 'Inscripción', 'Transporte', 'Comedor'];
const ESTUDIANTES = ['Juan Mendoza Fernández · 5to A', 'Camila Espinal Ortiz · 5to A', 'Héctor De la Cruz · 5to A', 'Lucía Peña Durán · 5to A'];
const GRID = 'grid grid-cols-[minmax(0,1.4fr)_130px_120px_minmax(0,1fr)_120px_170px_190px] gap-2';
const TAG: Record<string, readonly [string, string]> = { Aprobada: TONE.ok, Pendiente: TONE.warn, Revocada: TONE.mute };
const sel = 'h-9 rounded-md border border-slate-300 bg-white px-2 text-[13px] text-ink';
const lbl = 'flex flex-col gap-1 text-xs font-medium text-slate-600';

interface BecaForm { est: string; tipo: string; modo: 'pct' | 'fijo'; valor: string; conc: boolean[]; exp: string }
const NEW_FORM: BecaForm = { est: ESTUDIANTES[0], tipo: 'Académica', modo: 'pct', valor: '25', conc: [true, false, false, false], exp: '' };

export default function Screen() {
  const { user } = useSession();
  const { toast, toasts } = useToastStack();
  const isSuper = user?.rol === 'Super Admin';
  const canApprove = isSuper || user?.rol === 'Director Académico';
  const [periodo, setPeriodo] = useState('2026–2027');
  const [rows, setRows] = useState<BecaFin[]>([]);
  const [bf, setBf] = useState<BecaForm | null>(null);
  const [guard, setGuard] = useState<GuardCfg | null>(null);

  const load = useCallback(() => api.get<BecaFin[]>('/becas?periodo=' + encodeURIComponent(periodo)).then(setRows).catch(e => toast(errMsg(e), 'bad')), [periodo, toast]);
  useEffect(() => { void load(); }, [load]);

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
    if (!bf.exp.trim()) { toast('El expediente de soporte es obligatorio', 'bad'); return; }
    if (!bf.conc.some(Boolean)) { toast('Selecciona al menos un concepto', 'bad'); return; }
    const body: BecaNueva = { est: bf.est, tipo: bf.tipo, modo: bf.modo, valor: bf.valor, conceptos: BC.filter((_, i) => bf.conc[i]), exp: bf.exp, periodo: '2026–2027' };
    try {
      await api.post('/becas', body);
      setBf(null);
      if (periodo !== '2026–2027') setPeriodo('2026–2027'); else await load();
      toast('Beca registrada · enviada a aprobación', 'ok');
    } catch (e) { toast(errMsg(e), 'bad'); }
  };

  const addBtn = (
    <button onClick={() => setBf(NEW_FORM)} className="flex h-[34px] items-center gap-1.5 rounded-md bg-accent px-3.5 text-[13px] font-medium text-white hover:bg-accent-dark"><i className="ph ph-plus" />Registrar Beca</button>
  );

  return (
    <div className="flex flex-col gap-3.5">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="m-0 text-xl font-semibold tracking-tight">Becas y Acuerdos</h1>
          <p className="mb-0 mt-1 text-[13px] text-slate-600">Toda beca requiere expediente de soporte y aprobación del Director Financiero antes de impactar el estado de cuenta.</p>
        </div>
        <div className="flex items-center gap-2">
          <select value={periodo} onChange={e => setPeriodo(e.target.value)} className="h-[34px] rounded-md border border-slate-300 bg-white px-2 text-[13px]"><option>2026–2027</option><option>2027–2028</option></select>
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
                    {b.estado === 'Pendiente' && <button onClick={() => approve(b)} className="h-7 rounded-md border border-blue-200 bg-white px-2.5 text-xs font-medium text-accent hover:bg-blue-50">{canApprove ? 'Aprobar' : 'Solicitar aprobación'}</button>}
                    {b.estado === 'Aprobada' && <button onClick={() => revoke(b)} className="h-7 rounded-md border border-red-300 bg-white px-2.5 text-xs font-medium text-red-600 hover:bg-bad-bg">Revocar</button>}
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
          <div className="max-w-[440px] text-[13px] leading-normal text-slate-600">Las becas del ciclo 2027–2028 se registran después de la generación masiva de cartera. Puedes adelantar solicitudes con su expediente de soporte.</div>
          {addBtn}
        </section>
      )}

      {bf && (
        <div className="fixed inset-0 z-[70] grid place-items-center bg-slate-900/50 p-5">
          <div className="w-[520px] max-w-full overflow-hidden rounded-[10px] bg-white shadow-2xl">
            <div className="border-b border-slate-200 px-5 py-4 text-base font-semibold">Registrar beca</div>
            <div className="flex flex-col gap-3 px-5 py-4">
              <label className={lbl}>Estudiante
                <select value={bf.est} onChange={e => setBf({ ...bf, est: e.target.value })} className={sel}>{ESTUDIANTES.map(s => <option key={s}>{s}</option>)}</select>
              </label>
              <div className="flex gap-2.5">
                <label className={`${lbl} flex-1`}>Tipo
                  <select value={bf.tipo} onChange={e => setBf({ ...bf, tipo: e.target.value })} className={sel}><option>Académica</option><option>Deportiva</option><option>Hijo de Empleado</option><option>Plan Hermano</option></select>
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
