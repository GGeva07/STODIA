import { useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import type { ExpCatalogoItem, ExpServicio, ExpedienteResp } from '@stodia/shared';
import { api } from '../../lib/api';
import { useToast, Modal } from '../../components/system/UiProvider';
import { btnPrimary, card, pill, pillBase, th, type PillTone } from '../../components/system/styles';
import { errMsg, fmt } from '../../components/finanzas/fin';
import SideDrawer from '../../components/finanzas/SideDrawer';

const thw = th.replace('whitespace-nowrap ', '');
const MNAME: Record<number, string> = { 1: 'Enero', 2: 'Febrero', 3: 'Marzo', 4: 'Abril', 5: 'Mayo', 6: 'Junio', 7: 'Julio', 8: 'Agosto', 9: 'Septiembre', 10: 'Octubre', 11: 'Noviembre', 12: 'Diciembre' };
const selCls = 'h-9 rounded-md border border-slate-300 bg-white px-2 text-[13px] text-ink disabled:bg-slate-50';
const Chip = ({ children }: { children: string }) => <span className="inline-flex h-[22px] items-center rounded-full bg-mute-bg px-2 text-[11px] font-semibold text-slate-700">{children}</span>;
const Section = ({ title, aside, children }: { title: string; aside?: string; children: ReactNode }) => (
  <section className={`${card} overflow-hidden`}>
    <div className="flex items-center justify-between gap-2.5 border-b border-slate-200 px-4 py-3"><span className="text-sm font-semibold">{title}</span>{aside && <span className="font-mono text-[11px] text-slate-500">{aside}</span>}</div>
    {children}
  </section>
);

/** Pestaña "Servicios y Contrato" (prototipo L1106-1201 + drawers L1850-1921). */
export default function Servicios({ data, reload, canWrite }: { data: ExpedienteResp; reload: () => Promise<void>; canWrite: boolean }) {
  const toast = useToast();
  const navigate = useNavigate();
  const { alumno, ficha, servicios, ref } = data;
  const [cycle, setCycle] = useState(ref.ciclos[0]);
  const [edit, setEdit] = useState<{ id: string; draft: string } | null>(null);
  const [drawer, setDrawer] = useState<{ key: string; spec: string; mes: number } | null>(null);
  const [confirm, setConfirm] = useState<{ cc: ExpCatalogoItem; spec: string; mes: number; msg: string } | null>(null);
  const [baja, setBaja] = useState<{ s: ExpServicio; date: string; chk: boolean } | null>(null);

  const ro = cycle !== ref.ciclos[0] || !canWrite;
  const auditoria = cycle !== ref.ciclos[0];
  const MONTHS = ref.meses;
  const monthsFrom = (m: number) => MONTHS.length - MONTHS.indexOf(m);
  const plan = ref.planes[ficha.contrato.plan] as (typeof ref.planes)[string] | undefined;
  const be = ref.becas[ficha.contrato.beca] ?? { nombre: '', pct: 0, tag: '', aprobacion: false };
  const gross = plan?.gross ?? 0, disc = Math.round(gross * be.pct * 100) / 100, net = gross - disc;
  const hoyIdx = Math.max(0, MONTHS.indexOf(ref.mesActual));
  const mesesInicio = MONTHS.slice(hoyIdx, hoyIdx + 4);
  const recs = servicios.filter(s => s.kind === 'rec'), onces = servicios.filter(s => s.kind === 'once');
  const act = recs.filter(s => s.est === 'Activo');
  const addM = act.reduce((a, s) => a + s.cost, 0);
  const monthly = (plan?.freq === 1 ? net : 0) + addM;
  const cycleTot = net * (plan?.n ?? 0) + act.reduce((a, s) => a + s.cost * MONTHS.length, 0) + onces.reduce((a, o) => a + o.cost, 0);
  const curso = `${alumno.grado} ${alumno.sec}`;
  const yr = (m: number) => (m >= MONTHS[0] ? ref.anio0 : ref.anio0 + 1);
  const finMes = () => { const [y, m] = ref.hoy.split('-').map(Number); return new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10); };

  const run = async (fn: () => Promise<unknown>, ok: string, tone: 'ok' | 'warn' | 'info' = 'ok') => {
    try { await fn(); await reload(); toast(ok, tone); } catch (e) { toast(errMsg(e), 'bad'); }
  };
  const setContrato = (patch: { plan?: string; beca?: string }, msg: string, tone: 'info' | 'warn') =>
    run(() => api.put(`/expediente/${alumno.id}/contrato`, { plan: ficha.contrato.plan, beca: ficha.contrato.beca, ...patch }), msg, tone);

  const dc = drawer ? ref.catalogo.find(c => c.k === drawer.key)! : null;
  const askConfirm = () => {
    if (!drawer || !dc) return;
    const f = `1 de ${MNAME[drawer.mes].toLowerCase()} de ${yr(drawer.mes)}`;
    const msg = dc.rec
      ? `Se generarán ${monthsFrom(drawer.mes)} cuotas automáticas de ${fmt(dc.price)} en la terminal de cobros a partir del ${f}. ¿Confirmar asignación?`
      : `Se generará 1 cargo de ${fmt(dc.price)} en la terminal de cobros con fecha ${f}. ¿Confirmar asignación?`;
    setConfirm({ cc: dc, spec: drawer.spec, mes: drawer.mes, msg });
  };
  const doAssign = async () => {
    if (!confirm) return;
    const c = confirm;
    setConfirm(null); setDrawer(null);
    await run(async () => { await api.post(`/expediente/${alumno.id}/servicios`, { catKey: c.cc.k, spec: c.spec, mes: c.mes }); },
      `${c.cc.rec ? monthsFrom(c.mes) + ' cuotas generadas' : '1 cargo generado'} en CxC · primera visible en la terminal de cobros`);
  };

  const endM = baja ? Number(baja.date.slice(5, 7)) : ref.mesActual;
  const futN = baja ? Math.max(0, monthsFrom(MONTHS.includes(endM) ? endM : MONTHS[hoyIdx]) - 1) : 0;

  const onceInfo = (o: ExpServicio): { est: string; tone: PillTone; label: string; fg: string; go: () => void } => {
    if (o.st === 'cobrado') return { est: `Cobrado · Recibo ${o.recibo}`, tone: 'mute', label: 'Ver recibo', fg: 'text-accent', go: () => toast(`Recibo ${o.recibo} emitido en caja`, 'info') };
    if (o.st === 'cargado') return { est: 'Cargado en CxC', tone: 'warn', label: 'Cobrar en caja', fg: 'text-accent', go: () => navigate('/pos') };
    return { est: `Programado para ${o.mes}`, tone: 'info', label: 'Cancelar', fg: 'text-red-600', go: () => run(() => api.del(`/expediente/${alumno.id}/servicios/${o.id}`), `${o.name} cancelado antes de su emisión`, 'warn') };
  };

  return (
    <div className="flex flex-col gap-3.5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-[18px]">
          <select value={cycle} onChange={e => setCycle(e.target.value)} aria-label="Ciclo lectivo" className="h-[30px] cursor-pointer rounded-full border border-slate-300 bg-white px-3 text-xs font-semibold">
            {ref.ciclos.map((c, i) => <option key={c} value={c}>Ciclo Lectivo: {c.replace('–', ' – ')}{i ? ' (auditoría)' : ''}</option>)}
          </select>
          <span className="text-xs text-slate-600">Compromiso mensual recurrente <b className="font-mono text-ink">{fmt(monthly)}</b></span>
          <span className="text-xs text-slate-600">Total contratado para el ciclo <b className="font-mono text-ink">{fmt(cycleTot)}</b></span>
        </div>
        <button disabled={ro || !ref.catalogo.length} onClick={() => setDrawer({ key: ref.catalogo[0].k, spec: ref.catalogo[0].spec, mes: ref.mesActual })} className={`${btnPrimary} ${ro || !ref.catalogo.length ? 'opacity-45' : ''}`}><i className="ph ph-plus" />Asignar Nuevo Servicio / Concepto</button>
      </div>
      {ref.avisos.length > 0 && !auditoria && <div className="flex flex-col gap-1 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">{ref.avisos.map(t => <span key={t} className="flex items-center gap-2"><i className="ph ph-warning" />{t}</span>)}</div>}
      {auditoria && <div className="flex items-center gap-2 rounded-md bg-mute-bg px-3 py-2 text-xs text-slate-700"><i className="ph ph-eye" />Modo auditoría · contrato {cycle} en solo lectura.</div>}

      <Section title="Plan de colegiatura base y descuentos institucionales" aside={ficha.contrato.ctr}>
        <div className="grid grid-cols-[repeat(auto-fit,minmax(220px,1fr))] gap-5 p-4">
          <div className="flex flex-col gap-1.5">
            <span className="text-xs font-medium text-slate-500">Esquema de pago asignado</span>
            <select value={ficha.contrato.plan} disabled={ro} onChange={e => setContrato({ plan: e.target.value }, 'Esquema actualizado · la cartera futura se reprogramará al guardar el contrato', 'info')} className={selCls}>
              {!plan && <option value="">Sin plan asignado</option>}{Object.entries(ref.planes).map(([k, p]) => <option key={k} value={k}>{p.name}</option>)}
            </select>
            <span className="text-xs text-slate-600">Cuota bruta <b className="font-mono text-ink">{fmt(gross)}</b></span>
          </div>
          <div className="flex flex-col gap-1.5">
            <span className="text-xs font-medium text-slate-500">Beca o convenio</span>
            <select value={ficha.contrato.beca} disabled={ro} onChange={e => { const needs = !!ref.becas[e.target.value]?.aprobacion; void setContrato({ beca: e.target.value }, needs ? 'Beca enviada a aprobación del Director Financiero; no impacta CxC hasta aprobarse' : 'Beca actualizada', needs ? 'warn' : 'info'); }} className={selCls}>
              <option value="none">Sin beca ni convenio</option>{Object.entries(ref.becas).map(([k, b]) => <option key={k} value={k}>{Math.round(b.pct * 10000) / 100}% – {b.nombre}</option>)}
            </select>
            <div className="flex flex-wrap items-center gap-2">
              {be.tag && <span className={`inline-flex h-5 items-center rounded-full px-2 text-[11px] font-semibold ${be.aprobacion ? 'bg-warn-bg text-warn-fg' : 'bg-ok-bg text-ok-fg'}`}>{be.tag}</span>}
              {disc > 0 && <span className="font-mono text-xs font-medium text-green-600">− {fmt(disc)} por cuota</span>}
            </div>
          </div>
          <div className="flex flex-col gap-1.5">
            <span className="text-xs font-medium text-slate-500">Monto neto facturable</span>
            <span className="font-mono text-[22px] font-bold tracking-[-0.02em] text-ink">{fmt(net)} <span className="text-[13px] font-medium text-slate-500">{plan?.unit ?? ''}</span></span>
            {plan ? <span className="flex items-center gap-1.5 text-xs text-green-700"><i className="ph-fill ph-check-circle" />{plan.n} {plan.n === 1 ? 'cuota programada' : 'cuotas programadas'} en cartera masiva</span> : <span className="flex items-center gap-1.5 text-xs text-amber-700"><i className="ph ph-warning" />Sin plan de pago asignado</span>}
          </div>
        </div>
      </Section>

      <Section title="Servicios recurrentes · suscripciones activas">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[860px] border-collapse text-[13px]">
            <thead><tr>
              <th className={thw}>Servicio</th><th className={thw}>Especificación / asignación</th><th className={`${thw} text-right`}>Costo recurrente</th><th className={thw}>Día de corte</th><th className={thw}>Estado</th><th className={`${thw} text-right`}>Acciones</th>
            </tr></thead>
            <tbody>
              {recs.map(s => {
                const on = s.est === 'Activo', ed = edit?.id === s.id;
                const save = () => { const d = edit!.draft; setEdit(null); void run(() => api.put(`/expediente/${alumno.id}/servicios/${s.id}`, { spec: d }), `Especificación actualizada · ${s.name}`); };
                return (
                  <tr key={s.id} className={on ? '' : 'opacity-70'}>
                    <td className="h-12 border-b border-slate-100 px-3 py-0">
                      <div className="flex flex-wrap items-center gap-2.5">
                        <span className="grid h-[30px] w-[30px] flex-none place-items-center rounded-md bg-mute-bg text-base text-slate-700"><i className={s.icon} /></span>
                        <span className="font-medium">{s.name}</span>
                        {s.alert && <span className="inline-flex h-5 items-center gap-1 rounded-full bg-bad-bg px-[7px] text-[11px] font-semibold text-bad-fg"><i className="ph-fill ph-warning" />{s.alert}</span>}
                      </div>
                    </td>
                    <td className="h-12 border-b border-slate-100 px-3 py-0 text-slate-600">
                      {ed ? (
                        <div className="flex gap-1.5">
                          <input autoFocus value={edit!.draft} onChange={e => setEdit({ id: s.id, draft: e.target.value })} onKeyDown={e => { if (e.key === 'Enter') save(); if (e.key === 'Escape') setEdit(null); }} className="h-[30px] min-w-[160px] flex-1 rounded-[5px] border border-accent px-2 text-[13px] text-ink outline-none" />
                          <button onClick={save} className="h-[30px] rounded-[5px] bg-accent px-2.5 text-xs font-semibold text-white">Guardar</button>
                        </div>
                      ) : s.spec}
                    </td>
                    <td className="h-12 border-b border-slate-100 px-3 py-0 text-right font-mono text-[13px] font-medium">{fmt(s.cost)}</td>
                    <td className="h-12 border-b border-slate-100 px-3 py-0 text-slate-600">{s.corte}</td>
                    <td className="h-12 border-b border-slate-100 px-3 py-0"><span className={`${pillBase} w-[91px] ${on ? 'bg-emerald-100 text-emerald-700' : pill.mute}`}>{s.est}</span></td>
                    <td className="h-12 whitespace-nowrap border-b border-slate-100 px-3 py-0 text-right">
                      {on && !ro && (
                        <span className="inline-flex justify-end gap-3">
                          <button onClick={() => setEdit({ id: s.id, draft: s.spec })} className="border-0 bg-transparent p-0 text-[13px] font-medium text-accent hover:underline">Editar</button>
                          <button onClick={() => setBaja({ s, date: finMes(), chk: false })} className="border-0 bg-transparent p-0 text-[13px] font-medium text-red-600 hover:underline">Dar de baja</button>
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
              {recs.length === 0 && <tr><td colSpan={6} className="px-3 py-6 text-center text-[13px] text-slate-500">Sin servicios recurrentes contratados.</td></tr>}
            </tbody>
          </table>
        </div>
        <div className="flex justify-end gap-2.5 bg-slate-50 px-4 py-3 text-[13px] text-slate-600">Total adicional: <b className="font-mono text-ink">{fmt(addM)}/mes</b></div>
      </Section>

      <Section title="Cargos únicos, materiales y servicios esporádicos">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] border-collapse text-[13px]">
            <thead><tr>
              <th className={thw}>Concepto</th><th className={thw}>Fecha programada de cargo</th><th className={`${thw} text-right`}>Monto total</th><th className={thw}>Estado en CxC</th><th className={`${thw} text-right`}>Acciones</th>
            </tr></thead>
            <tbody>
              {onces.map(o => {
                const i = onceInfo(o);
                return (
                  <tr key={o.id}>
                    <td className="h-12 border-b border-slate-100 px-3 py-0 font-medium">{o.name}</td>
                    <td className="h-12 border-b border-slate-100 px-3 py-0 font-mono text-xs text-slate-600">{o.fecha}</td>
                    <td className="h-12 border-b border-slate-100 px-3 py-0 text-right font-mono text-[13px] font-medium">{fmt(o.cost)}</td>
                    <td className="h-12 border-b border-slate-100 px-3 py-0"><span className={`${pillBase} w-[160px] ${pill[i.tone]}`}>{i.est}</span></td>
                    <td className="h-12 border-b border-slate-100 px-3 py-0 text-right">{!ro && <button onClick={i.go} className={`border-0 bg-transparent p-0 text-[13px] font-medium hover:underline ${i.fg}`}>{i.label}</button>}</td>
                  </tr>
                );
              })}
              {onces.length === 0 && <tr><td colSpan={5} className="px-3 py-6 text-center text-[13px] text-slate-500">Sin cargos únicos registrados.</td></tr>}
            </tbody>
          </table>
        </div>
      </Section>

      {drawer && dc && (
        <SideDrawer width={440} onClose={() => setDrawer(null)}>
          <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
            <div><div className="text-[15px] font-semibold">Asignar servicio o concepto</div><div className="text-xs text-slate-500">{alumno.nombres.split(' ')[0]} {alumno.apellidos} · {curso}</div></div>
            <button onClick={() => setDrawer(null)} aria-label="Cerrar" className="h-8 w-8 rounded-md border border-slate-300 bg-white"><i className="ph ph-x" /></button>
          </div>
          <div className="flex flex-1 flex-col gap-3.5 overflow-auto px-5 py-[18px]">
            <label className="flex flex-col gap-1 text-xs font-medium text-slate-600">Concepto del catálogo universal
              <select value={drawer.key} onChange={e => setDrawer({ ...drawer, key: e.target.value, spec: ref.catalogo.find(c => c.k === e.target.value)!.spec })} className="h-[38px] rounded-md border border-slate-300 bg-white px-2 text-[13px] text-ink">
                {ref.catalogo.map(c => <option key={c.k} value={c.k}>{c.l}</option>)}
              </select>
            </label>
            <div className="flex flex-wrap gap-2"><Chip>{dc.cat}</Chip><Chip>{dc.freq}</Chip><Chip>{dc.mora}</Chip></div>
            <label className="flex flex-col gap-1 text-xs font-medium text-slate-600">Especificación / asignación
              <input value={drawer.spec} onChange={e => setDrawer({ ...drawer, spec: e.target.value })} className="h-[38px] rounded-md border border-slate-300 px-2.5 text-[13px] text-ink outline-none focus:border-accent" />
            </label>
            <label className="flex flex-col gap-1 text-xs font-medium text-slate-600">{dc.rec ? 'Inicio del servicio (primer cargo)' : 'Fecha de cargo'}
              <select value={drawer.mes} onChange={e => setDrawer({ ...drawer, mes: Number(e.target.value) })} className="h-[38px] rounded-md border border-slate-300 bg-white px-2 text-[13px] text-ink">
                {mesesInicio.map(m => <option key={m} value={m}>1 de {MNAME[m].toLowerCase()} de {yr(m)}</option>)}
              </select>
            </label>
            <div className="flex items-baseline justify-between rounded-md border border-slate-200 bg-slate-50 p-3"><span className="text-xs text-slate-600">{dc.rec ? 'Costo recurrente mensual' : 'Monto del cargo único'}</span><span className="font-mono text-base font-semibold">{fmt(dc.price)}</span></div>
            {dc.food && alumno.alg && (
              <div className="flex gap-2 rounded-md bg-bad-bg px-3 py-2.5 text-xs leading-[1.45] text-red-800"><i className="ph-fill ph-warning text-base" />El alumno tiene alergias severas ({alumno.alg.toLowerCase()}). Se marcará el plan con restricción en el punto de verificación del comedor.</div>
            )}
          </div>
          <div className="flex justify-end gap-2 border-t border-slate-200 bg-slate-50 px-5 py-3.5">
            <button onClick={() => setDrawer(null)} className="h-9 rounded-md border border-slate-300 bg-white px-3.5 text-[13px] font-medium">Cancelar</button>
            <button onClick={askConfirm} className="h-9 rounded-md bg-accent px-4 text-[13px] font-semibold text-white">Guardar asignación</button>
          </div>
        </SideDrawer>
      )}

      {confirm && (
        <Modal z={82}>
          <div className="flex items-start gap-3 px-5 py-[18px]">
            <span className="grid h-10 w-10 flex-none place-items-center rounded-full bg-info-bg text-xl text-accent"><i className="ph ph-receipt" /></span>
            <div><div className="text-base font-semibold">Impacto financiero</div><div className="mt-1.5 text-sm leading-relaxed text-slate-700">{confirm.msg}</div></div>
          </div>
          <div className="flex justify-end gap-2 border-t border-slate-200 bg-slate-50 px-5 py-3.5">
            <button onClick={() => setConfirm(null)} className="h-9 rounded-md border border-slate-300 bg-white px-3.5 text-[13px] font-medium">Volver</button>
            <button onClick={doAssign} className="h-9 rounded-md bg-accent px-4 text-[13px] font-semibold text-white">Confirmar asignación</button>
          </div>
        </Modal>
      )}

      {baja && (
        <Modal z={82} width={480}>
          <div className="flex items-start gap-3 px-5 py-[18px]">
            <span className="grid h-10 w-10 flex-none place-items-center rounded-full bg-bad-bg text-xl text-red-600"><i className="ph ph-calendar-x" /></span>
            <div><div className="text-base font-semibold">Dar de baja: {baja.s.name}</div><div className="mt-1 text-[13px] leading-normal text-slate-600">Define la fecha efectiva. Las cuotas vencidas se mantienen en el balance del tutor.</div></div>
          </div>
          <div className="flex flex-col gap-3 px-5 pb-4">
            <label className="flex flex-col gap-1 text-xs font-medium text-slate-600">Fecha de finalización efectiva *
              <input type="date" value={baja.date} min={ref.hoy} max={ref.finCiclo} onChange={e => setBaja({ ...baja, date: e.target.value })} className="h-[38px] rounded-md border border-slate-300 px-2.5 font-mono text-sm text-ink outline-none" />
            </label>
            <label className={`flex cursor-pointer items-start gap-2.5 rounded-md border p-3 text-[13px] leading-[1.45] ${baja.chk ? 'border-red-300 bg-red-50' : 'border-slate-200 bg-white'}`}>
              <input type="checkbox" checked={baja.chk} onChange={() => setBaja({ ...baja, chk: !baja.chk })} className="mt-0.5 h-4 w-4 accent-red-600" />
              <span>Cancelar y anular automáticamente las cuotas futuras pendientes en CxC no vencidas <b className="font-mono">({futN} cuotas · {fmt(futN * baja.s.cost)})</b></span>
            </label>
          </div>
          <div className="flex justify-end gap-2 border-t border-slate-200 bg-slate-50 px-5 py-3.5">
            <button onClick={() => setBaja(null)} className="h-9 rounded-md border border-slate-300 bg-white px-3.5 text-[13px] font-medium">Cancelar</button>
            <button
              onClick={() => {
                if (!baja.chk || !baja.date) { toast('Marca la anulación de cuotas futuras para confirmar la baja', 'warn'); return; }
                const b = baja; setBaja(null);
                void run(() => api.post(`/expediente/${alumno.id}/servicios/${b.s.id}/baja`, { fecha: b.date }), `${b.s.name} dado de baja · ${futN} cuotas futuras anuladas en CxC`, 'warn');
              }}
              className={`h-9 rounded-md px-4 text-[13px] font-semibold text-white ${baja.chk && baja.date ? 'cursor-pointer bg-red-600' : 'cursor-not-allowed bg-red-300'}`}
            >Confirmar baja</button>
          </div>
        </Modal>
      )}
    </div>
  );
}
