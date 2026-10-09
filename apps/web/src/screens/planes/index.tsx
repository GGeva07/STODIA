import { useCallback, useEffect, useState } from 'react';
import type { AcadExtra, AliData, PlanForm, PlanPagoFin } from '@stodia/shared';
import { api } from '../../lib/api';
import { useSession } from '../../lib/session';
import { useToastStack } from '../../components/useToastStack';
import SupervisorGuardModal, { type GuardCfg } from '../../components/finanzas/SupervisorGuardModal';
import { TONE, errMsg, fmt, norm } from '../../components/finanzas/fin';
import { B, descargarPdf, hoyDMY, runPrint, usePrintBusy, type PBlock, type PDoc } from '../../components/finanzas/print';
import { useFinCfg } from '../../components/finanzas/finConfig';
import PlanDrawer, { type DrawerMode } from './PlanDrawer';
import { FREQ_L, MN, moraLbl, planCalc } from './planCalc';

const TH = 'whitespace-nowrap border-b border-slate-200 bg-slate-50 px-3 py-2.5 text-left text-[11px] font-semibold uppercase tracking-[0.04em] text-slate-600';
const TD = 'border-b border-slate-100 px-3 py-0';
const TABS: [string, string][] = [['all', 'Todos'], ['Activo', 'Activos'], ['Inactivo', 'Inactivos']];
const MEALS = ['Desayuno', 'Merienda AM', 'Almuerzo', 'Merienda PM'];
const TAR_OPTS: [string, string, string][] = [['col', 'Matriz de colegiatura', 'por tanda'], ['com', 'Comedor y alimentación', 'planes'], ['tra', 'Transporte', 'por ruta'], ['ext', 'Extracurriculares', 'academias'], ['pol', 'Políticas de facturación', 'mora y pronto pago']];
const ibtn = 'grid h-[30px] w-[30px] place-items-center rounded-md border border-transparent bg-transparent text-base';

export default function Screen() {
  const { user } = useSession();
  const { toast, toasts } = useToastStack();
  const isSuper = user?.rol === 'Super Admin';
  const [plans, setPlans] = useState<PlanPagoFin[]>([]);
  const [q, setQ] = useState('');
  const [tab, setTab] = useState('all');
  const [drawer, setDrawer] = useState<{ plan: PlanPagoFin | null; mode: DrawerMode; pin?: string } | null>(null);
  const [guard, setGuard] = useState<GuardCfg | null>(null);
  const [tarOpen, setTarOpen] = useState(false);
  const [tarOpts, setTarOpts] = useState<Record<string, boolean>>({ col: true, com: true, tra: true, ext: true, pol: true });
  const [ali, setAli] = useState<AliData | null>(null);
  const [ext, setExt] = useState<AcadExtra[]>([]);
  const cfg = useFinCfg();
  const [tandas, setTandas] = useState<string[]>([]);
  const [rutas, setRutas] = useState<[string, string, number][]>([]);
  const pb = usePrintBusy();
  const pbTar = pb('tar', 'Vista previa e imprimir', 'ph ph-printer');

  const load = useCallback(() => api.get<PlanPagoFin[]>('/planes').then(setPlans).catch(e => toast(errMsg(e), 'bad')), [toast]);
  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    api.get<{ nombre: string }[]>('/catalogos/tandas').then(r => setTandas(r.map(x => x.nombre))).catch(() => undefined);
    api.get<{ nombre: string; sectores?: string; tarifa: number; estado: string }[]>('/catalogos/rutas').then(r => setRutas(r.filter(x => x.estado === 'Activo').map(x => ['Ruta ' + x.nombre, x.sectores || 'Ruta ' + x.nombre, Number(x.tarifa)]))).catch(() => undefined);
  }, []);

  const authorize = (title: string, fn: (pin: string) => void) => {
    if (isSuper) fn('');
    else setGuard({ title, desc: 'Tu rol puede crear y consultar planes, pero modificarlos o eliminarlos requiere autorización de un Super Admin.', pin: true, label: 'Autorizar', onOk: pin => fn(pin) });
  };

  const del = (p: PlanPagoFin) => {
    if (p.alumnos > 0) { toast(`No se puede eliminar: ${p.alumnos} alumnos tienen este plan asignado. Reasígnalos o márcalo Inactivo.`, 'bad'); return; }
    setGuard({
      title: 'Eliminar plan ' + p.id, desc: `Se eliminará la plantilla «${p.name}». No afecta cuotas ya generadas. Acción registrada en el audit trail.`,
      code: 'ELIMINAR-' + p.id, pin: !isSuper, label: 'Eliminar plan',
      onOk: async pin => {
        await api.post(`/planes/${p.id}/eliminar`, { pin });
        setDrawer(null); await load(); toast(`Plan ${p.id} eliminado`, 'warn');
      },
    });
  };

  const dup = async (p: PlanPagoFin) => {
    try { const n = await api.post<PlanPagoFin>(`/planes/${p.id}/duplicar`); await load(); toast(`Plan duplicado como ${n.id} (inactivo)`, 'ok'); }
    catch (e) { toast(errMsg(e), 'bad'); }
  };

  const save = async (f: PlanForm, mode: DrawerMode, pin: string) => {
    if (mode === 'create') {
      const n = await api.post<PlanPagoFin>('/planes', f);
      const c = planCalc(n, tandas, cfg.ciclo0);
      setDrawer(null); await load(); toast(`Plan ${n.id} creado · ${c.n} cuotas de ${fmt(c.cuota)}`, 'ok');
      return n;
    }
    const id = drawer!.plan!.id;
    const n = await api.put<PlanPagoFin>(`/planes/${id}`, { ...f, pin });
    await load(); toast(`Plan ${id} actualizado · registrado en auditoría`, 'ok');
    return n;
  };

  const openTar = () => {
    setTarOpen(true);
    api.get<AliData>('/alimentacion').then(setAli).catch(() => undefined);
    api.get<AcadExtra[]>('/extra').then(setExt).catch(() => undefined);
  };

  const docTarifario = (): PDoc | null => {
    if (!Object.values(tarOpts).some(Boolean)) { toast('Selecciona al menos una sección', 'warn'); return null; }
    const act = plans.filter(p => p.estado === 'Activo'), bl: PBlock[] = [];
    if (tarOpts.col) {
      const rows: string[][] = [];
      act.forEach(p => { const c = planCalc(p, tandas, cfg.ciclo0), n = c.n + (c.n === 1 ? ' cuota' : ' cuotas'); if (c.tandas) c.tandas.filter(t => !t.sinPrecio).forEach(t => rows.push([p.name, t.l, fmt(t.total), n, fmt(t.cuota)])); else rows.push([p.name, 'Todas las tandas', fmt(c.total), n, fmt(c.cuota)]); });
      bl.push(B.text('Matriz de colegiatura', true), B.table(['Plan', 'Tanda', 'Monto anual', 'Cuotas', 'Cuota'], rows, ['1fr', '86px', '98px', '66px', '98px'], ['left', 'left', 'right', 'right', 'right']), B.text('Los montos incluyen el descuento propio de cada plan. La inscripción se factura aparte.'));
    }
    if (tarOpts.com) bl.push(B.text('Comedor y alimentación', true), B.table(['Plan', 'Incluye', 'Tarifa'], (ali?.planes ?? []).filter(p => p.estado === 'Activo').map(p => [p.name, p.modelo === 'sub' ? MEALS.filter((_, i) => p.meals[i]).join(' · ') : 'Monedero virtual', p.modelo === 'sub' ? fmt(p.precio) + (p.freq === 'Semestral' ? '/sem' : '/mes') : 'Recarga mín. ' + fmt(p.recarga)]), ['1fr', '1fr', '120px'], ['left', 'left', 'right']));
    if (tarOpts.tra) bl.push(B.text('Transporte escolar', true), B.table(['Ruta', 'Servicio', 'Tarifa'], rutas.map(([l, sp, pr]) => [l, sp, fmt(pr) + '/mes']), ['1fr', '1fr', '110px'], ['left', 'left', 'right']));
    if (tarOpts.ext) bl.push(B.text('Actividades y cursos extracurriculares', true), B.table(['Actividad', 'Categoría', 'Horario', 'Costo'], ext.filter(a => a.estado !== 'Cerrada').map(a => [a.name, a.cat, a.dias + ' · ' + a.hora, Number(a.costo) ? fmt(a.costo) + (a.kind === 'curso' ? ' total' : '/mes') : 'Gratuita']), ['1fr', '70px', '1fr', '110px'], ['left', 'left', 'left', 'right']));
    if (tarOpts.pol) bl.push(B.text('Políticas de facturación', true), B.table(['Plan', 'Gracia', 'Cobro por mora', 'Pronto pago'], act.map(p => [p.name, p.gracia + ' días', p.moraTipo === 'pct' ? p.moraVal + '% mensual' : p.moraTipo === 'fijo' ? fmt(p.moraVal) + ' por día' : 'Sin recargo', Number(p.pronto) ? p.pronto + '% hasta el día ' + p.prontoDia : 'No aplica']), ['1fr', '56px', '110px', '120px'], ['left', 'left', 'left', 'left']));
    bl.push(B.text('Montos expresados en pesos dominicanos (RD$). Tarifas vigentes para el ciclo lectivo ' + cfg.ciclo + ' y sujetas a cambios con previo aviso. Los servicios opcionales se contratan al momento de la inscripción.'));
    return { kind: 'carta', name: 'Tarifario anual ' + cfg.ciclo, file: 'tarifario_' + cfg.ciclo.replace('–', '-') + '.pdf', format: 'Carta 8.5 × 11 in', sign: [], pages: [{ title: 'Tarifario anual', sub: 'Ciclo lectivo ' + cfg.ciclo + ' · Generado el ' + hoyDMY(), blocks: bl }] };
  };
  const printTar = () => { const d = docTarifario(); if (d) { setTarOpen(false); runPrint('tar', d); } };
  const pdfTar = async () => {
    if (!Object.values(tarOpts).some(Boolean)) { toast('Selecciona al menos una sección', 'warn'); return; }
    const d = docTarifario(); if (!d) return;
    setTarOpen(false);
    try { toast('Generando PDF…', 'info'); await descargarPdf(d); toast('PDF generado · tarifario_' + cfg.ciclo.replace('–', '-') + '.pdf', 'ok'); } catch (e) { toast(errMsg(e), 'bad'); }
  };


  const pq = norm(q.trim());
  const rows = plans.filter(p => (!pq || norm(p.name + ' ' + p.id).includes(pq)) && (tab === 'all' || p.estado === tab));

  return (
    <div className="flex flex-col gap-3.5">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="m-0 text-xl font-semibold tracking-tight">Planes de Pago</h1>
          <p className="mb-0 mt-1 text-[13px] text-slate-600">Plantillas que el motor de cartera masiva usa para generar las cuotas de cada alumno inscrito.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button onClick={openTar} className="flex h-[34px] items-center gap-1.5 rounded-md border border-slate-300 bg-white px-3 text-[13px] font-medium hover:bg-slate-100"><i className="ph ph-printer" />Exportar Tarifario Anual</button>
          <button onClick={() => setDrawer({ plan: null, mode: 'create' })} className="flex h-[34px] items-center gap-1.5 rounded-md bg-accent px-3.5 text-[13px] font-medium text-white hover:bg-accent-dark"><i className="ph ph-plus" />Nuevo Plan</button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[220px] max-w-[360px] flex-1">
          <i className="ph ph-magnifying-glass pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
          <input value={q} onChange={e => setQ(e.target.value)} placeholder="Buscar plan…" className="h-[34px] w-full rounded-md border border-slate-300 bg-white pl-8 pr-2.5 text-[13px] outline-none focus:border-accent focus:ring-[3px] focus:ring-accent-soft" />
        </div>
        <div className="flex gap-0.5 rounded-lg bg-slate-100 p-[3px]">
          {TABS.map(([k, l]) => <button key={k} onClick={() => setTab(k)} className={`h-7 rounded-md px-2.5 text-xs font-medium ${tab === k ? 'bg-white text-ink shadow-sm' : 'text-slate-600'}`}>{l}</button>)}
        </div>
        <span className="ml-auto text-xs text-slate-500">{plans.reduce((a, p) => a + p.alumnos, 0)} alumnos con plan asignado · {plans.filter(p => p.estado === 'Activo').length} planes activos</span>
      </div>

      <section className="overflow-hidden rounded-lg border border-slate-200 bg-white">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1040px] border-collapse text-[13px]">
            <thead>
              <tr>
                <th className={TH}>Plan</th><th className={TH}>Esquema</th><th className={`${TH} text-right`}>Monto anual</th><th className={`${TH} text-right`}>Desc.</th>
                <th className={`${TH} text-right`}>Cuota</th><th className={TH}>Mora</th><th className={TH}>Pronto pago</th><th className={`${TH} text-right`}>Alumnos</th>
                <th className={TH}>Estado</th><th className={`${TH} text-right`}>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(p => {
                const c = planCalc(p, tandas, cfg.ciclo0), act = p.estado === 'Activo', et = act ? TONE.ok : TONE.mute;
                return (
                  <tr key={p.id} className="h-9 hover:bg-slate-50" style={{ opacity: act ? 1 : 0.75 }}>
                    <td className={TD}>
                      <div className="flex flex-col py-1.5 leading-tight">
                        <button onClick={() => setDrawer({ plan: p, mode: 'view' })} className="border-none bg-transparent p-0 text-left text-[13px] font-semibold text-ink hover:text-accent hover:underline">{p.name}</button>
                        <span className="font-mono text-[11px] leading-[normal] text-slate-500">{p.id}</span>
                      </div>
                    </td>
                    <td className={`${TD} whitespace-nowrap text-slate-600`}>{c.n + (c.n === 1 ? ' cuota' : ' cuotas')} · {FREQ_L[p.freq]} · desde {MN[Number(p.start)].slice(0, 3)}</td>
                    <td className={`${TD} text-right font-mono font-medium`}>{c.tandas ? 'Por tanda' : fmt(c.anual)}{c.sinPrecio.length > 0 && <div title={c.sinPrecio.join(', ')} className="font-sans text-[10px] font-semibold text-amber-700">{c.sinPrecio.length} {c.sinPrecio.length === 1 ? 'tanda sin precio' : 'tandas sin precio'}</div>}</td>
                    <td className={`${TD} text-right font-mono`} style={{ color: c.desc ? '#16A34A' : '#94A3B8' }}>{c.desc ? c.desc + '%' : '—'}</td>
                    <td className={`${TD} text-right font-mono font-semibold`}>{c.tandas ? (c.tandas.some(x => !x.sinPrecio) ? `${fmt(Math.min(...c.tandas.filter(x => !x.sinPrecio).map(x => x.cuota)))} – ${fmt(Math.max(...c.tandas.map(x => x.cuota)))}` : '—') : fmt(c.cuota)}</td>
                    <td className={`${TD} whitespace-nowrap text-xs text-slate-600`}>{moraLbl(p)}</td>
                    <td className={`${TD} whitespace-nowrap text-xs text-slate-600`}>{Number(p.pronto) ? `${p.pronto}% hasta día ${p.prontoDia}` : '—'}</td>
                    <td className={`${TD} text-right font-mono font-medium`}>{p.alumnos}</td>
                    <td className={TD}><span className="inline-flex h-[19px] w-[76px] items-center justify-center rounded-full text-[10px] font-semibold leading-none" style={{ background: et[0], color: et[1] }}>{p.estado}</span></td>
                    <td className={`${TD} whitespace-nowrap text-right`}>
                      <div className="inline-flex gap-0.5">
                        <button title="Ver detalle" onClick={() => setDrawer({ plan: p, mode: 'view' })} className={`${ibtn} text-slate-600 hover:bg-slate-100`}><i className="ph ph-eye" /></button>
                        <button title="Editar" onClick={() => authorize('Modificar plan ' + p.id, pin => setDrawer({ plan: p, mode: 'edit', pin }))} className={`${ibtn} text-accent hover:bg-blue-50`}><i className="ph ph-pencil-simple" /></button>
                        <button title="Duplicar" onClick={() => void dup(p)} className={`${ibtn} text-slate-600 hover:bg-slate-100`}><i className="ph ph-copy" /></button>
                        <button title="Eliminar" onClick={() => del(p)} className={`${ibtn} text-red-600 hover:bg-bad-bg`}><i className="ph ph-trash" /></button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {rows.length === 0 && (
            <div className="flex flex-col items-start gap-2.5 px-6 py-10">
              <span className="grid h-[52px] w-[52px] place-items-center rounded-full bg-blue-50 text-[26px] text-accent"><i className="ph ph-calendar-blank" /></span>
              <div className="text-[15px] font-semibold">No hay planes de pago en esta vista.</div>
              <div className="text-[13px] text-slate-600">Crea un plan para que la generación masiva de cartera pueda asignarlo a los alumnos inscritos.</div>
              <button onClick={() => setDrawer({ plan: null, mode: 'create' })} className="flex h-[34px] items-center gap-1.5 rounded-md bg-accent px-3.5 text-[13px] font-medium text-white"><i className="ph ph-plus" />Nuevo Plan</button>
            </div>
          )}
        </div>
      </section>

      {drawer && <PlanDrawer tandas={tandas} ciclo0={cfg.ciclo0} moraPct={cfg.finanzas.recargoMoraPct} key={(drawer.plan?.id ?? 'new') + drawer.mode} plan={drawer.plan} mode={drawer.mode} pin0={drawer.pin} plans={plans} onClose={() => setDrawer(null)} authorize={authorize} onSave={save} onDelete={del} />}
      {tarOpen && (
        <div className="fixed inset-0 z-[85] grid place-items-center bg-slate-900/50 p-5">
          <div className="w-[480px] max-w-full overflow-hidden rounded-[10px] bg-white shadow-2xl">
            <div className="flex items-start gap-3 px-5 py-[18px]">
              <span className="grid h-10 w-10 flex-none place-items-center rounded-full bg-blue-100 text-xl text-accent"><i className="ph ph-tag" /></span>
              <div><div className="text-base font-semibold">Tarifario anual · {cfg.ciclo}</div><div className="mt-1 text-[13px] text-slate-600" style={{ lineHeight: 1.5 }}>Elige qué secciones incluir. Los montos y políticas se toman de los planes activos y del catálogo.</div></div>
            </div>
            <div className="flex flex-col gap-2 px-5 pb-4">
              {TAR_OPTS.map(([k, l, d]) => (
                <label key={k} className="flex cursor-pointer items-center gap-2.5 rounded-md border px-3 py-2.5" style={{ borderColor: tarOpts[k] ? '#BFDBFE' : '#E2E8F0', background: tarOpts[k] ? '#EFF6FF' : '#FFFFFF' }}>
                  <input type="checkbox" checked={tarOpts[k]} onChange={() => setTarOpts(o => ({ ...o, [k]: !o[k] }))} className="h-4 w-4 accent-accent" />
                  <span className="flex-1 text-[13px] font-medium">{l}</span><span className="text-xs text-slate-500">{d}</span>
                </label>
              ))}
            </div>
            <div className="flex flex-wrap justify-end gap-2 border-t border-slate-200 bg-slate-50 px-5 py-3.5">
              <button onClick={() => setTarOpen(false)} className="h-9 rounded-md border border-slate-300 bg-white px-3.5 text-[13px] font-medium">Cancelar</button>
              <button onClick={pdfTar} className="flex h-9 items-center gap-1.5 rounded-md border border-slate-300 bg-white px-3.5 text-[13px] font-medium hover:bg-slate-100"><i className="ph ph-file-pdf" />Descargar PDF</button>
              <button onClick={printTar} className="flex h-9 items-center gap-1.5 rounded-md bg-accent px-4 text-[13px] font-semibold text-white hover:bg-accent-dark"><i className={pbTar.icon} style={{ animation: pbTar.spin }} />{pbTar.label}</button>
            </div>
          </div>
        </div>
      )}
      {guard && <SupervisorGuardModal cfg={guard} onClose={() => setGuard(null)} />}
      {toasts}
    </div>
  );
}
