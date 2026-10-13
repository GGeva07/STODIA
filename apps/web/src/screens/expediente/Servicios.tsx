import { useMemo, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import type { ExpCatalogoItem, ExpServicio, ExpedienteResp } from '@stodia/shared';
import { api } from '../../lib/api';
import { useToast, Modal } from '../../components/system/UiProvider';
import { btnPrimary, card, pill, pillBase, th, type PillTone } from '../../components/system/styles';
import { errMsg, fmt } from '../../components/finanzas/fin';
import SideDrawer from '../../components/finanzas/SideDrawer';
import { SL_MSG } from '../../lib/ciclo';
import { AvisoBorrador, useDraft } from '../../lib/useDraft';

const thw = th.replace('whitespace-nowrap ', '');
const MNAME: Record<number, string> = { 1: 'Enero', 2: 'Febrero', 3: 'Marzo', 4: 'Abril', 5: 'Mayo', 6: 'Junio', 7: 'Julio', 8: 'Agosto', 9: 'Septiembre', 10: 'Octubre', 11: 'Noviembre', 12: 'Diciembre' };
const selCls = 'h-9 rounded-md border border-slate-300 bg-white px-2 text-[13px] text-ink disabled:bg-slate-50';
const Section = ({ title, aside, children }: { title: string; aside?: string; children: ReactNode }) => (
  <section className={`${card} overflow-hidden`}>
    <div className="flex items-center justify-between gap-2.5 border-b border-slate-200 px-4 py-3"><span className="text-sm font-semibold">{title}</span>{aside && <span className="font-mono text-[11px] text-slate-500">{aside}</span>}</div>
    {children}
  </section>
);

type Draft = { key: string | null; filtro: string; hi: number; spec: string; q: number; fecha: string; dia: number; cuotas: number };

/** Pestaña "Servicios y Contrato" (prototipo L1106-1201 + drawers L1850-1921). */
export default function Servicios({ data, reload, canWrite, sl = false }: { data: ExpedienteResp; reload: () => Promise<void>; canWrite: boolean; sl?: boolean }) {
  const toast = useToast();
  const navigate = useNavigate();
  const { alumno, ficha, servicios, ref } = data;
  const cycle = ref.ciclos[0]; // el ciclo lo elige el selector global de la barra lateral (Fase 2D)
  const [edit, setEdit] = useState<{ id: string; draft: string } | null>(null);
  // Borrador del drawer «Asignar servicio» (búsqueda, servicio, cantidad, fecha...). «×»/fondo solo lo ocultan (se retoma con el botón o al volver); «Cancelar» y asignar con éxito lo descartan.
  const [drawer, setDrawer, , metaD] = useDraft<Draft | null>(`expediente:${alumno.id}:servicio`, null);
  const [oculto, setOculto] = useState(false);
  const [saving, setSaving] = useState(false);
  const [reqBeca, setReqBeca] = useState<{ key: string; motivo: string } | null>(null);
  const [baja, setBaja] = useState<{ s: ExpServicio; date: string; chk: boolean } | null>(null);

  const ro = cycle !== ref.ciclos[0] || !canWrite;
  const auditoria = sl; // ciclo que no es el activo: modo auditoría (solo lectura)
  const slT = sl ? SL_MSG : undefined;
  const MONTHS = ref.meses;
  const monthsFrom = (m: number) => MONTHS.length - MONTHS.indexOf(m);
  const plan = ref.planes[ficha.contrato.plan] as (typeof ref.planes)[string] | undefined;
  const be = ref.becas[ficha.contrato.beca] ?? { nombre: '', pct: 0, tag: '', aprobacion: false };
  const gross = plan?.gross ?? 0, disc = Math.round(gross * be.pct * 100) / 100, net = gross - disc;
  const hoyIdx = Math.max(0, MONTHS.indexOf(ref.mesActual));
  const recs = servicios.filter(s => s.kind === 'rec'), onces = servicios.filter(s => s.kind === 'once');
  const act = recs.filter(s => s.est === 'Activo');
  const addM = act.reduce((a, s) => a + s.cost, 0);
  const monthly = (plan?.freq === 1 ? net : 0) + addM;
  const cycleTot = net * (plan?.n ?? 0) + act.reduce((a, s) => a + s.cost * MONTHS.length, 0) + onces.reduce((a, o) => a + o.cost, 0);
  const curso = `${alumno.grado} ${alumno.sec}`;
  const finMes = () => { const [y, m] = ref.hoy.split('-').map(Number); return new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10); };

  const run = async (fn: () => Promise<unknown>, ok: string, tone: 'ok' | 'warn' | 'info' = 'ok') => {
    try { await fn(); await reload(); toast(ok, tone); } catch (e) { toast(errMsg(e), 'bad'); }
  };
  const setContrato = (patch: { plan?: string; beca?: string }, msg: string, tone: 'info' | 'warn') =>
    run(() => api.put(`/expediente/${alumno.id}/contrato`, { plan: ficha.contrato.plan, beca: ficha.contrato.beca, ...patch }), msg, tone);

  const dc = drawer?.key ? ref.catalogo.find(c => c.k === drawer.key) ?? null : null;
  const qMax = dc && dc.stock != null ? Math.max(1, dc.stock) : 99; // stock limitado => tope = disponible; ilimitado/servicio => 99
  const minF = `${ref.anio0}-${String(MONTHS[0]).padStart(2, '0')}-01`, maxF = ref.finCiclo;
  const clampF = (f: string) => (f < minF ? minF : f > maxF ? maxF : f);
  const proxMes = () => { const [y, m] = ref.hoy.split('-').map(Number); return new Date(Date.UTC(y, m, 1)).toISOString().slice(0, 10); };
  const abrir = () => drawer ? setOculto(false) : setDrawer({ key: null, filtro: '', hi: 0, spec: '', q: 1, fecha: clampF(ref.hoy), dia: ref.diaCorte ?? 1, cuotas: 0 });
  const elegir = (c: ExpCatalogoItem) => setDrawer(d => d && { ...d, key: c.k, spec: c.spec, q: 1, cuotas: 0 });
  const lista = useMemo(() => {
    const n = (t: string) => t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
    const words = n(drawer?.filtro ?? '').split(/\s+/).filter(Boolean);
    return ref.catalogo.filter(c => { const h = n(`${c.l} ${c.k} ${c.cat} ${c.spec}`); return words.every(w => h.includes(w)); });
  }, [ref.catalogo, drawer?.filtro]);
  const mesF = drawer && /^\d{4}-\d{2}-\d{2}$/.test(drawer.fecha) ? Number(drawer.fecha.slice(5, 7)) : 0;
  const fechaOk = !!drawer && drawer.fecha >= minF && drawer.fecha <= maxF && MONTHS.includes(mesF);
  const disp = MONTHS.includes(mesF) ? monthsFrom(mesF) : 0; // cuotas posibles desde el mes de inicio hasta fin de ciclo
  const nCuotas = dc?.rec && drawer ? (drawer.cuotas > 0 ? Math.min(drawer.cuotas, disp) : disp) : 1;
  const dmy = (f: string) => f.split('-').reverse().join('/');
  const futura = !!drawer && drawer.fecha > ref.hoy;
  const doAssign = async () => {
    if (!drawer || !dc || !fechaOk || saving) return;
    const d = drawer;
    setSaving(true);
    await run(async () => { await api.post(`/expediente/${alumno.id}/servicios`, { catKey: dc.k, spec: d.spec, fecha: d.fecha, q: dc.rec ? 1 : d.q, ...(dc.rec ? { dia: d.dia, cuotas: nCuotas } : {}) }); setDrawer(null); },
      dc.rec ? `${nCuotas} ${nCuotas === 1 ? 'cuota programada' : 'cuotas programadas'} · desde ${dmy(d.fecha)}` : futura ? `Cargo programado para el ${dmy(d.fecha)}` : 'Cargo generado · pendiente en la cuenta del tutor');
    setSaving(false);
  };

  const endM = baja ? Number(baja.date.slice(5, 7)) : ref.mesActual;
  const futN = baja ? Math.max(0, monthsFrom(MONTHS.includes(endM) ? endM : MONTHS[hoyIdx]) - 1) : 0;

  const onceInfo = (o: ExpServicio): { est: string; tone: PillTone; label: string; fg: string; go: () => void } => {
    if (o.st === 'cobrado') return { est: `Cobrado · Recibo ${o.recibo}`, tone: 'mute', label: 'Ver recibo', fg: 'text-accent', go: () => toast(`Recibo ${o.recibo} emitido en caja`, 'info') };
    if (o.st === 'cargado') return { est: 'Cargado en CxC', tone: 'warn', label: 'Cobrar en caja', fg: 'text-accent', go: () => navigate('/pos') };
    return { est: `Programado · ${o.fecha}`, tone: 'info', label: 'Cancelar', fg: 'text-red-600', go: () => run(() => api.del(`/expediente/${alumno.id}/servicios/${o.id}`), `${o.name} cancelado antes de su emisión`, 'warn') };
  };

  return (
    <div className="flex flex-col gap-3.5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-[18px]">
          <span className="inline-flex h-[30px] items-center rounded-full border border-slate-300 bg-white px-3 text-xs font-semibold">Ciclo Lectivo: {cycle.replace('–', ' – ')}{sl ? ' (auditoría)' : ''}</span>
          <span className="text-xs text-slate-600">Compromiso mensual recurrente <b className="font-mono text-ink">{fmt(monthly)}</b></span>
          <span className="text-xs text-slate-600">Total contratado para el ciclo <b className="font-mono text-ink">{fmt(cycleTot)}</b></span>
        </div>
        <button disabled={ro || !ref.catalogo.length} title={slT} onClick={abrir} className={`${btnPrimary} ${ro || !ref.catalogo.length ? 'opacity-45' : ''}`}><i className="ph ph-plus" />Asignar Nuevo Servicio / Concepto</button>
      </div>
      {ref.avisos.length > 0 && !auditoria && <div className="flex flex-col gap-1 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">{ref.avisos.map(t => <span key={t} className="flex items-center gap-2"><i className="ph ph-warning" />{t}</span>)}</div>}
      {auditoria && <div className="flex items-center gap-2 rounded-md bg-mute-bg px-3 py-2 text-xs text-slate-700"><i className="ph ph-eye" />Modo auditoría · contrato {cycle} en solo lectura.</div>}

      <Section title="Plan de colegiatura base y descuentos institucionales" aside={ficha.contrato.ctr}>
        <div className="grid grid-cols-[repeat(auto-fit,minmax(220px,1fr))] gap-5 p-4">
          <div className="flex flex-col gap-1.5">
            <span className="text-xs font-medium text-slate-500">Esquema de pago asignado</span>
            <select value={ficha.contrato.plan} disabled={ro} title={slT} onChange={e => setContrato({ plan: e.target.value }, 'Esquema actualizado · la cartera futura se reprogramará al guardar el contrato', 'info')} className={selCls}>
              {!plan && <option value="">Sin plan asignado</option>}{Object.entries(ref.planes).map(([k, p]) => <option key={k} value={k}>{p.name}</option>)}
            </select>
            <span className="text-xs text-slate-600">Cuota bruta <b className="font-mono text-ink">{fmt(gross)}</b></span>
          </div>
          <div className="flex flex-col gap-1.5">
            <span className="text-xs font-medium text-slate-500">Beca o convenio</span>
            <select value={ficha.contrato.beca} disabled={ro} title={slT} onChange={e => { if (e.target.value !== ficha.contrato.beca) setReqBeca({ key: e.target.value, motivo: '' }); }} className={selCls}>
              <option value="none">Sin beca ni convenio</option>{Object.entries(ref.becas).map(([k, b]) => <option key={k} value={k}>{Math.round(b.pct * 10000) / 100}% – {b.nombre}</option>)}
            </select>
            <div className="flex flex-wrap items-center gap-2">
              {be.nombre && <span className="inline-flex h-5 items-center rounded-full bg-ok-bg px-2 text-[11px] font-semibold text-ok-fg">Vigente · aprobada por Dirección</span>}
              {(data.becasPendientes ?? []).map(t => <span key={t} className="inline-flex h-5 items-center rounded-full bg-warn-bg px-2 text-[11px] font-semibold text-warn-fg" title="No descuenta hasta que el Director la apruebe en Becas y Acuerdos">Beca pendiente de aprobación · {t}</span>)}
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

      {drawer && !oculto && (
        <SideDrawer width={440} onClose={() => setOculto(true)}>
          <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
            <div><div className="text-[15px] font-semibold">Asignar servicio</div><div className="text-xs text-slate-500">{alumno.nombres.split(' ')[0]} {alumno.apellidos} · {curso}</div></div>
            <button onClick={() => setOculto(true)} aria-label="Cerrar" className="h-8 w-8 rounded-md border border-slate-300 bg-white"><i className="ph ph-x" /></button>
          </div>
          <div className="flex flex-1 flex-col gap-3 overflow-auto px-5 py-4">
            <AvisoBorrador meta={{ ...metaD, descartar: () => { metaD.descartar(); setOculto(false); } }} />
            {!dc ? (
              <>
                <div className="relative">
                  <i className="ph ph-magnifying-glass pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input autoFocus role="combobox" aria-expanded aria-controls="srv-lista" aria-label="Buscar servicio" placeholder="Buscar servicio o código…" value={drawer.filtro}
                    onChange={e => setDrawer({ ...drawer, filtro: e.target.value, hi: 0 })}
                    onKeyDown={e => {
                      if (e.key === 'ArrowDown') { e.preventDefault(); setDrawer({ ...drawer, hi: Math.min(lista.length - 1, drawer.hi + 1) }); }
                      else if (e.key === 'ArrowUp') { e.preventDefault(); setDrawer({ ...drawer, hi: Math.max(0, drawer.hi - 1) }); }
                      else if (e.key === 'Enter' && lista[drawer.hi]) { e.preventDefault(); elegir(lista[drawer.hi]); }
                    }}
                    className="h-10 w-full rounded-md border border-slate-300 pl-8 pr-2.5 text-[13px] text-ink outline-none focus:border-accent" />
                </div>
                <ul id="srv-lista" role="listbox" className="m-0 flex list-none flex-col overflow-auto rounded-md border border-slate-200 p-0">
                  {lista.map((c, i) => (
                    <li key={c.k} role="option" aria-selected={i === drawer.hi} ref={el => { if (el && i === drawer.hi) el.scrollIntoView({ block: 'nearest' }); }}
                      onMouseEnter={() => drawer.hi !== i && setDrawer({ ...drawer, hi: i })} onClick={() => elegir(c)}
                      className={`flex cursor-pointer items-center justify-between gap-3 border-b border-slate-100 px-3 py-2 text-[13px] last:border-b-0 ${i === drawer.hi ? 'bg-info-bg' : ''}`}>
                      <span className="min-w-0 truncate font-medium">{c.l}</span>
                      <span className="flex flex-none items-center gap-2 font-mono text-xs text-slate-600">{c.stock != null && <span className="text-slate-500">{c.stock} en stock</span>}{c.rec && <span className="text-slate-500">/mes</span>}{fmt(c.price)}</span>
                    </li>
                  ))}
                  {lista.length === 0 && <li className="px-3 py-6 text-center text-[13px] text-slate-500">Sin resultados para «{drawer.filtro}».</li>}
                </ul>
              </>
            ) : (
              <>
                <div className="flex items-center justify-between gap-3 rounded-md border border-slate-200 bg-slate-50 px-3 py-2.5">
                  <div className="min-w-0"><div className="truncate text-[13px] font-semibold">{dc.l}</div><div className="font-mono text-xs text-slate-600">{fmt(dc.price)}{dc.rec ? ' / mes' : ''}{dc.stock != null ? ` · ${dc.stock} en stock` : ''}</div></div>
                  <button onClick={() => setDrawer({ ...drawer, key: null, filtro: '', hi: 0 })} className="flex-none border-0 bg-transparent p-0 text-xs font-medium text-accent hover:underline">Cambiar</button>
                </div>
                {dc.spec !== '' && (
                  <label className="flex flex-col gap-1 text-xs font-medium text-slate-600">Detalle
                    <input value={drawer.spec} onChange={e => setDrawer({ ...drawer, spec: e.target.value })} className="h-9 rounded-md border border-slate-300 px-2.5 text-[13px] text-ink outline-none focus:border-accent" />
                  </label>
                )}
                {!dc.rec && (
                  <div className="flex items-center justify-between text-xs font-medium text-slate-600">
                    <span>Cantidad</span>
                    <div className="flex items-center gap-2">
                      <button type="button" aria-label="Menos" disabled={drawer.q <= 1} onClick={() => setDrawer({ ...drawer, q: Math.max(1, drawer.q - 1) })} className="h-7 w-7 rounded border border-slate-300 bg-white disabled:opacity-45">−</button>
                      <span className="w-6 text-center font-mono text-sm font-semibold">{drawer.q}</span>
                      <button type="button" aria-label="Más" disabled={drawer.q >= qMax} onClick={() => setDrawer({ ...drawer, q: Math.min(qMax, drawer.q + 1) })} className="h-7 w-7 rounded border border-slate-300 bg-white disabled:opacity-45">+</button>
                    </div>
                  </div>
                )}
                <div className="flex flex-col gap-1 text-xs font-medium text-slate-600">
                  <div className="flex items-center justify-between gap-2">
                    <label htmlFor="srv-fecha">{dc.rec ? 'Inicio' : 'Fecha del cargo'}</label>
                    <span className="flex gap-3 font-normal">
                      <button type="button" onClick={() => setDrawer({ ...drawer, fecha: clampF(ref.hoy) })} className="border-0 bg-transparent p-0 text-xs text-accent hover:underline">Hoy</button>
                      <button type="button" disabled={proxMes() > maxF} onClick={() => setDrawer({ ...drawer, fecha: clampF(proxMes()) })} className="border-0 bg-transparent p-0 text-xs text-accent hover:underline disabled:opacity-40">Próximo mes</button>
                    </span>
                  </div>
                  <input id="srv-fecha" type="date" value={drawer.fecha} min={minF} max={maxF} onChange={e => setDrawer({ ...drawer, fecha: e.target.value })} className="h-9 rounded-md border border-slate-300 px-2.5 font-mono text-[13px] text-ink outline-none focus:border-accent" />
                  {!fechaOk && <span className="font-normal text-red-600">Elige una fecha dentro del ciclo ({dmy(minF)} – {dmy(maxF)}).</span>}
                </div>
                {dc.rec && (
                  <div className="grid grid-cols-2 gap-3">
                    <label className="flex flex-col gap-1 text-xs font-medium text-slate-600">Día de cobro
                      <select value={drawer.dia} onChange={e => setDrawer({ ...drawer, dia: Number(e.target.value) })} className="h-9 rounded-md border border-slate-300 bg-white px-2 text-[13px] text-ink">
                        {Array.from({ length: 30 }, (_, i) => i + 1).map(n => <option key={n} value={n}>Día {n}</option>)}<option value={31}>Último día</option>
                      </select>
                    </label>
                    <label className="flex flex-col gap-1 text-xs font-medium text-slate-600">Cuotas
                      <select value={drawer.cuotas} onChange={e => setDrawer({ ...drawer, cuotas: Number(e.target.value) })} className="h-9 rounded-md border border-slate-300 bg-white px-2 text-[13px] text-ink">
                        <option value={0}>Hasta fin de ciclo{disp ? ` (${disp})` : ''}</option>
                        {Array.from({ length: Math.max(0, disp - 1) }, (_, i) => i + 1).map(n => <option key={n} value={n}>{n} {n === 1 ? 'cuota' : 'cuotas'}</option>)}
                      </select>
                    </label>
                  </div>
                )}
                {dc.food && alumno.alg && (
                  <div className="flex gap-2 rounded-md bg-bad-bg px-3 py-2 text-xs leading-[1.45] text-red-800"><i className="ph-fill ph-warning text-base" />Alergias: {alumno.alg.toLowerCase()}.</div>
                )}
                <div className="flex items-baseline justify-between gap-3 rounded-md border border-slate-200 bg-slate-50 p-3">
                  <span className="text-xs text-slate-600">{dc.rec ? `${nCuotas} ${nCuotas === 1 ? 'cuota' : 'cuotas'} · desde ${dmy(drawer.fecha)}` : futura ? `Programado · se carga el ${dmy(drawer.fecha)}` : 'Se carga ya · pendiente de cobro'}</span>
                  <span className="font-mono text-base font-semibold">{fmt(dc.rec ? dc.price * nCuotas : dc.price * drawer.q)}</span>
                </div>
              </>
            )}
          </div>
          <div className="flex justify-end gap-2 border-t border-slate-200 bg-slate-50 px-5 py-3.5">
            <button onClick={() => { setDrawer(null); setOculto(false); }} className="h-9 rounded-md border border-slate-300 bg-white px-3.5 text-[13px] font-medium">Cancelar</button>
            <button onClick={doAssign} disabled={!dc || !fechaOk || saving} className="h-9 rounded-md bg-accent px-4 text-[13px] font-semibold text-white disabled:opacity-45">Asignar</button>
          </div>
        </SideDrawer>
      )}

      {reqBeca && (
        <Modal z={82} width={480}>
          <div className="flex items-start gap-3 px-5 py-[18px]">
            <span className="grid h-10 w-10 flex-none place-items-center rounded-full bg-warn-bg text-xl text-warn-fg"><i className="ph ph-hand-coins" /></span>
            <div><div className="text-base font-semibold">{reqBeca.key === 'none' ? 'Quitar beca del contrato' : 'Solicitar beca para este plan'}</div><div className="mt-1 text-[13px] leading-normal text-slate-600">{reqBeca.key === 'none' ? 'Se quitará del contrato.' : <>Se enviará una solicitud <b>Pendiente</b> a Becas y Acuerdos. No descuenta nada hasta que el Director la apruebe.</>}</div></div>
          </div>
          <div className="flex flex-col gap-3 px-5 pb-4">
            {reqBeca.key !== 'none' && <div className="rounded-md bg-slate-100 px-2.5 py-2 text-[13px]"><b>{ref.becas[reqBeca.key]?.nombre}</b> · {Math.round((ref.becas[reqBeca.key]?.pct ?? 0) * 10000) / 100}% · plan {plan?.name ?? '—'}</div>}
            {reqBeca.key !== 'none' && <label className="flex flex-col gap-1 text-xs font-medium text-slate-600">Motivo de la solicitud *
              <textarea value={reqBeca.motivo} maxLength={300} rows={3} onChange={e => setReqBeca({ ...reqBeca, motivo: e.target.value })} className="rounded-md border border-slate-300 p-2 text-[13px] font-normal text-ink outline-none" />
            </label>}
          </div>
          <div className="flex justify-end gap-2 border-t border-slate-200 bg-slate-50 px-5 py-3.5">
            <button onClick={() => setReqBeca(null)} className="h-9 rounded-md border border-slate-300 bg-white px-3.5 text-[13px] font-medium">Cancelar</button>
            <button disabled={reqBeca.key !== 'none' && !reqBeca.motivo.trim()} onClick={() => { const r = reqBeca; setReqBeca(null); void run(() => api.put(`/expediente/${alumno.id}/contrato`, { plan: ficha.contrato.plan, beca: r.key, motivo: r.motivo.trim() }), r.key === 'none' ? 'Beca quitada del contrato' : 'Solicitud de beca enviada a Becas y Acuerdos · pendiente de aprobación del Director; no descuenta hasta aprobarse', r.key === 'none' ? 'info' : 'warn'); }} className={btnPrimary + ' disabled:opacity-50'}>{reqBeca.key === 'none' ? 'Quitar beca' : 'Enviar solicitud'}</button>
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
