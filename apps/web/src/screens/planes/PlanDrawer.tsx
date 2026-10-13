import { useState } from 'react';
import { AvisoBorrador, useDraft } from '../../lib/useDraft';
import type { PlanForm, PlanPagoFin } from '@stodia/shared';
import SideDrawer from '../../components/finanzas/SideDrawer';
import { fmt } from '../../components/finanzas/fin';
import { emptyPlan, planCalc } from './planCalc';

export type DrawerMode = 'create' | 'view' | 'edit';
interface Props {
  plan: PlanPagoFin | null; mode: DrawerMode; pin0?: string; plans: PlanPagoFin[];
  /** Tandas del catálogo, año de inicio del ciclo activo y recargo por mora de la configuración financiera. */
  tandas: string[]; ciclo0?: number; moraPct?: number; /** Modalidad de inscripcion configurada y cuota fija global (para avisar cuanto usa este plan). */ insModo?: 'fija' | 'plan'; insFija?: number;
  onClose: () => void;
  /** Pide autorización (Super Admin directo; otros con clave) y luego ejecuta fn(pin). */
  authorize: (title: string, fn: (pin: string) => void) => void;
  onSave: (f: PlanForm, mode: DrawerMode, pin: string) => Promise<PlanPagoFin | null>;
  onDelete: (p: PlanPagoFin) => void;
}

const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const lbl = 'flex flex-col gap-1 text-xs font-medium text-slate-600';

export default function PlanDrawer({ plan, mode: mode0, pin0 = '', plans, tandas: TANDAS, ciclo0, moraPct, insModo = 'fija', insFija = 0, onClose, authorize, onSave, onDelete }: Props) {
  const [mode, setMode] = useState<DrawerMode>(mode0);
  const [pin, setPin] = useState(pin0);
  // Borrador por plan id (o «nuevo»): «×»/fondo lo conservan, «Cancelar» y guardar con éxito lo descartan. En modo «ver» no se restaura ni se guarda; el PIN no se persiste.
  const [f, setF, limpiar, meta] = useDraft<PlanForm>('plan:' + (plan?.id ?? 'nuevo'), () => (plan ? { ...plan, tm: { ...(plan.tm ?? {}) } } : emptyPlan(moraPct)), { pausado: mode === 'view' });
  const [err, setErr] = useState('');
  const ro = mode === 'view';
  const c = planCalc(f, TANDAS, ciclo0);
  const set = (k: keyof PlanForm) => (e: { target: { value: string } }) => {
    const v = e.target.value;
    setF(p => ({ ...p, [k]: v, ...(k === 'freq' && v === '0' ? { n: '1' } : {}) }) as PlanForm);
    setErr('');
  };
  const inp = `h-9 w-full rounded-md border px-2.5 text-right font-mono text-[13px] outline-none focus:border-accent ${ro ? 'border-slate-200 bg-slate-50' : 'border-slate-300 bg-white'}`;
  const selc = `h-9 w-full rounded-md border px-2 text-[13px] ${ro ? 'border-slate-200 bg-slate-50' : 'border-slate-300 bg-white'}`;

  const validate = () => {
    if (!f.name.trim()) return 'El nombre del plan es obligatorio.';
    if (plans.some(p => p.id !== plan?.id && norm(p.name) === norm(f.name.trim()))) return 'Ya existe un plan con ese nombre.';
    if (!(c.n >= 1 && c.n <= 12)) return 'El número de cuotas debe estar entre 1 y 12.';
    if (f.freq === '0' && c.n !== 1) return 'Un pago único debe tener 1 cuota.';
    if (f.freq !== '0' && c.n * Number(f.freq) > 12) return 'La frecuencia y el número de cuotas exceden el ciclo de 12 meses.';
    // Una tanda puede quedar sin precio (el plan no calcula cuotas ni inscribe en ella hasta definirlo, como avisa el formulario); basta con una tanda con precio.
    if (f.porTanda) {
      const vals = TANDAS.map(t => f.tm?.[t] ?? '');
      const malo = TANDAS.find((t, i) => vals[i].trim() !== '' && !(parseFloat(vals[i]) > 0));
      if (malo) return 'El monto de la tanda ' + malo + ' debe ser mayor que cero (o déjalo vacío).';
      if (!vals.some(v => parseFloat(v) > 0)) return 'Define el monto de al menos una tanda.';
    }
    else if (!(c.anual > 0)) return 'El monto anual debe ser mayor que cero.';
    const d = parseInt(f.dia);
    if (!(d >= 1 && d <= 28)) return 'El día de vencimiento debe estar entre 1 y 28.';
    const pr = Number(f.pronto || 0), pd = Number(f.prontoDias || 0);
    if (!(Number.isFinite(pr) && pr >= 0 && pr <= 100)) return 'El descuento por pronto pago debe estar entre 0 y 100 %.';
    // 0 días con % > 0 se permite (plan migrado sin configurar): se guarda, pero el descuento no aplica hasta definir los días.
    if (pr > 0 && !(Number.isInteger(pd) && pd >= 0 && pd <= 60)) return 'Los días de anticipación del pronto pago deben ser un entero entre 1 y 60.';
    const mat = Number(f.materiales || 0), ins = Number(f.inscripcion || 0);
    if (!Number.isFinite(ins) || ins < 0) return 'La cuota de inscripción debe ser un monto válido (0 o mayor).';
    if (!Number.isFinite(mat) || mat < 0) return 'La cuota de materiales debe ser un monto válido (0 o mayor).';
    if (f.materialesOn && !(mat > 0)) return 'Para agregar la cuota de materiales define un monto mayor que cero (o apaga la opción).';
    return null;
  };

  const primary = async () => {
    if (ro) { authorize('Modificar plan ' + plan!.id, p => { setPin(p); setMode('edit'); }); return; }
    const e = validate();
    if (e) { setErr(e); return; }
    try {
      // Si la inscripción queda igual a la cuota fija de Configuración no se guarda como propia: el plan sigue la fija si esta cambia.
      const saved = await onSave({ ...f, name: f.name.trim(), n: String(c.n), inscripcion: Number(f.inscripcion) > 0 && Number(f.inscripcion) !== insFija ? String(f.inscripcion) : '' }, mode, pin);
      if (saved) limpiar();
      if (saved && mode === 'edit') { setF({ ...saved }); setMode('view'); }
    } catch (x) { setErr(x instanceof Error ? x.message : 'Error'); }
  };

  const toggleTanda = () => {
    if (ro) return;
    setF(p => {
      const porTanda = !p.porTanda;
      return { ...p, porTanda, tm: porTanda ? Object.fromEntries(TANDAS.map(t => [t, p.tm?.[t] || p.anual])) : p.tm };
    });
    setErr('');
  };

  const rules: [string, string][] = [
    ['Cobro por mora', f.moraTipo === 'pct' ? f.moraVal + '% mensual' : f.moraTipo === 'fijo' ? fmt(f.moraVal) + ' por día' : 'Sin recargo'],
    ['Días de gracia', f.gracia + (Number(f.gracia) === 1 ? ' día' : ' días')],
    ['Descuento por pronto pago', Number(f.pronto) ? f.pronto + '%' : 'Sin descuento'],
    ['Cuota de inscripción', insModo === 'plan' ? (Number(f.inscripcion) > 0 ? fmt(Number(f.inscripcion)) : `Sin definir · usa la fija (${fmt(insFija)})`) : `Fija para todos (${fmt(insFija)})`],
    ['Cuota de materiales', f.materialesOn && Number(f.materiales) > 0 ? `${fmt(Number(f.materiales))} · se agrega al inscribir` : Number(f.materiales) > 0 ? `${fmt(Number(f.materiales))} · no se agrega` : 'No aplica'],
    ['Días de anticipación (pronto pago)', Number(f.pronto) && Number(f.prontoDias) > 0 ? `${f.prontoDias} ${Number(f.prontoDias) === 1 ? 'día' : 'días'} antes del vencimiento` : '—'],
  ];
  const title = mode === 'create' ? 'Nuevo plan de pago' : (mode === 'edit' ? 'Editar · ' : '') + f.name;
  const sub = mode === 'create' ? 'Se creará como plantilla disponible para la generación masiva de cartera'
    : `${plan!.id} · ${plan!.alumnos} alumnos asignados` + (mode === 'edit' && plan!.alumnos ? ' · los cambios aplican a cuotas no generadas' : '');

  return (
    <SideDrawer width={760} onClose={onClose}>
      <div className="flex items-center gap-3 border-b border-slate-200 px-5 py-4">
        <div className="min-w-0 flex-1"><div className="text-[15px] font-semibold">{title}</div><div className="text-xs text-slate-500">{sub}</div></div>
        <button onClick={onClose} aria-label="Cerrar" className="h-8 w-8 rounded-md border border-slate-300 bg-white"><i className="ph ph-x" /></button>
      </div>
      {meta.restaurado && !ro && <AvisoBorrador meta={meta} className="m-3 mb-0" />}
      <div className="grid flex-1 grid-cols-[repeat(auto-fit,minmax(300px,1fr))] items-start overflow-auto">
        <div className="flex flex-col gap-3.5 px-5 py-[18px]">
          <label className={lbl}>Nombre del plan *<input value={f.name} onChange={set('name')} disabled={ro} className={inp.replace('text-right font-mono', 'text-left')} /></label>
          <div className="grid grid-cols-2 gap-2.5">
            <label className={lbl}>Frecuencia<select value={f.freq} onChange={set('freq')} disabled={ro} className={selc}><option value="1">Mensual</option><option value="2">Bimestral</option><option value="3">Trimestral</option><option value="0">Pago único</option></select></label>
            <label className={lbl}>No. de cuotas *<input value={f.n} onChange={set('n')} disabled={ro} className={inp} /></label>
            <label className={lbl}>Monto anual base (RD$) *<input value={f.anual} onChange={set('anual')} disabled={ro} className={inp} /></label>
            <label className={lbl}>Descuento del plan (%)<input value={f.desc} onChange={set('desc')} disabled={ro} className={inp} /></label>
            <label className={lbl}>Primer vencimiento<select value={f.start} onChange={set('start')} disabled={ro} className={selc}><option value="8">Agosto</option><option value="9">Septiembre</option><option value="10">Octubre</option><option value="1">Enero</option></select></label>
            <label className={lbl}>Día de vencimiento (1–28)<input value={f.dia} onChange={set('dia')} disabled={ro} className={inp} /></label>
          </div>
          <div className="mt-1 text-xs font-semibold uppercase tracking-wide text-slate-600">Inscripción y materiales</div>
          <div className="grid grid-cols-2 gap-2.5">
            <label className={lbl}>Cuota de inscripción (RD$)<input value={insModo !== 'plan' ? (insFija > 0 ? String(insFija) : '') : Number(f.inscripcion) > 0 ? String(f.inscripcion) : insFija > 0 ? String(insFija) : ''} onChange={e => { const v = e.target.value.replace(/[^\d.]/g, ''); setF(p => ({ ...p, inscripcion: v })); setErr(''); }} disabled={ro || insModo !== 'plan'} className={inp} inputMode="decimal" placeholder="Cuota fija de Configuración" data-testid="plan-inscripcion" /></label>
            <label className={lbl}>Cuota de materiales (RD$)<input value={f.materiales ?? ''} onChange={e => { const v = e.target.value.replace(/[^\d.]/g, ''); setF(p => ({ ...p, materiales: v })); setErr(''); }} disabled={ro} className={inp} inputMode="decimal" placeholder="0" data-testid="plan-materiales" /></label>
          </div>
          <div className="text-[11px] leading-snug text-slate-500">{insModo === 'plan' ? `La inscripción se cobra según el plan. Si este plan no tiene monto (0), se usa la cuota fija de Configuración (${fmt(insFija)}).` : `La inscripción es fija para todos los planes (${fmt(insFija)}) y no se edita aquí. Para fijarla por plan, elige «Según el plan de pago» en Configuración › Finanzas.`}</div>
          <label className="flex cursor-pointer items-center gap-2 rounded-md border px-3 py-2.5 text-[13px] font-medium" style={{ borderColor: f.materialesOn ? '#BFDBFE' : '#E2E8F0', background: f.materialesOn ? '#EFF6FF' : '#FFFFFF' }}>
            <input type="checkbox" checked={!!f.materialesOn} onChange={() => { if (ro) return; setF(p => ({ ...p, materialesOn: !p.materialesOn })); setErr(''); }} disabled={ro} className="h-4 w-4 accent-accent" style={{ cursor: ro ? 'not-allowed' : 'pointer' }} data-testid="plan-materiales-on" />Agregar cuota de materiales
          </label>
          <div className="text-[11px] leading-snug text-slate-500">Si está activa, al inscribir con este plan se agrega un cargo aparte «Cuota de materiales» en el primer vencimiento (sin pronto pago ni mora). El monto se conserva aunque la apagues.</div>
          <label className="flex cursor-pointer items-center gap-2 rounded-md border px-3 py-2.5 text-[13px] font-medium" style={{ borderColor: f.porTanda ? '#BFDBFE' : '#E2E8F0', background: f.porTanda ? '#EFF6FF' : '#FFFFFF' }}>
            <input type="checkbox" checked={!!f.porTanda} onChange={toggleTanda} disabled={ro} className="h-4 w-4 accent-accent" style={{ cursor: ro ? 'not-allowed' : 'pointer' }} />Cuota diferenciada por tanda
          </label>
          {f.porTanda && c.sinPrecio.length > 0 && (
            <div className="flex items-start gap-2 rounded-md border border-amber-300 bg-warn-bg px-3 py-2 text-xs text-amber-800"><i className="ph ph-warning mt-px text-base" /><span><b>{c.sinPrecio.length === 1 ? 'Tanda sin precio' : c.sinPrecio.length + ' tandas sin precio'}:</b> {c.sinPrecio.join(', ')}. Mientras no se defina el monto, este plan no calcula cuotas ni permite inscribir en esa tanda{ro ? '. Pulsa Editar para configurarlo.' : '; guarda el plan con el monto de cada tanda.'}</span></div>
          )}
          <div className="flex flex-col gap-2 rounded-md border border-slate-200 bg-slate-50 p-3" style={{ opacity: f.porTanda ? 1 : 0.6 }}>
            <div className="text-xs text-slate-600">{f.porTanda ? 'Monto anual base por tanda (RD$). El descuento del plan se aplica sobre cada monto.' : 'Desactivado: todas las tandas usan el monto anual base. Marca la casilla para fijar un monto por tanda.'}</div>
            {TANDAS.map(t => {
              const v = f.porTanda ? f.tm?.[t] ?? '' : f.anual, off = ro || !f.porTanda;
              return (
                <div key={t} className="grid grid-cols-[minmax(0,1fr)_150px] items-center gap-2.5">
                  <span className="text-[13px] font-medium">{t}</span>
                  <input value={v} disabled={off} onChange={e => { const val = e.target.value.replace(/[^\d.]/g, ''); setF(p => ({ ...p, tm: { ...p.tm, [t]: val } })); setErr(''); }}
                    className="h-[34px] w-full rounded-md border px-2.5 text-right font-mono text-[13px] outline-none focus:border-accent"
                    style={{ background: off ? '#F1F5F9' : '#FFFFFF', borderColor: f.porTanda && !(parseFloat(v) > 0) ? '#F59E0B' : ro ? '#E2E8F0' : '#CBD5E1' }} placeholder={f.porTanda ? 'Sin precio' : ''} />
                </div>
              );
            })}
          </div>
          <div className="mt-1 text-xs font-semibold uppercase tracking-wide text-slate-600">Mora y pronto pago</div>
          <div className="grid grid-cols-2 gap-2.5">
            <label className={lbl}>Días de gracia<input value={f.gracia} onChange={set('gracia')} disabled={ro} className={inp} /></label>
            <label className={lbl}>Tipo de recargo<select value={f.moraTipo} onChange={set('moraTipo')} disabled={ro} className={selc}><option value="pct">% mensual escalonado</option><option value="fijo">Monto fijo por día</option><option value="none">Sin recargo</option></select></label>
            <label className={lbl}>{f.moraTipo === 'fijo' ? 'Recargo por día (RD$)' : 'Recargo mensual (%)'}<input value={f.moraVal} onChange={set('moraVal')} disabled={ro} className={inp} /></label>
            <label className={lbl}>Descuento por pronto pago (%)<input value={f.pronto} onChange={set('pronto')} disabled={ro} className={inp} inputMode="decimal" placeholder="0 = sin pronto pago" /></label>
            <label className={lbl}>Días de anticipación (1–60)<input value={f.prontoDias} onChange={set('prontoDias')} disabled={ro || !(Number(f.pronto) > 0)} className={inp} inputMode="numeric" /></label>
            <label className={lbl}>Estado<select value={f.estado} onChange={set('estado')} disabled={ro} className={selc}><option>Activo</option><option>Inactivo</option></select></label>
          </div>
          {(() => {
            // Vista previa simetrica: mora = vencimiento + gracia; pronto pago = vencimiento − N días de anticipación.
            const D = parseInt(f.dia) || 1, G = parseInt(f.gracia) || 0, N = parseInt(f.prontoDias) || 0, L = D - N;
            const lim = L >= 1 ? `el ${L}` : `el ${L + 30} del mes anterior (según el mes)`;
            return (
              <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-[11px] leading-snug text-slate-600" data-testid="preview-mora-pronto">
                <div>Vence el {D}{f.moraTipo !== 'none' ? ` → mora desde el ${D + G + 1}${G ? ` (tras ${G} ${G === 1 ? 'día' : 'días'} de gracia)` : ''}` : ' → sin recargo por mora'}.</div>
                {Number(f.pronto) > 0 && N > 0
                  ? <div>Vence el {D} → descuento de {f.pronto}% hasta {lim}. Se aplica si se paga con al menos {N} {N === 1 ? 'día' : 'días'} de anticipación al vencimiento de la cuota (también en cuotas futuras).</div>
                  : <div>Sin descuento por pronto pago: se requiere un porcentaje mayor que 0 y los días de anticipación (Cobros no lo aplicará a los alumnos de este plan).</div>}
              </div>
            );
          })()}
          {err && <div className="flex items-center gap-1.5 text-xs font-medium text-red-600"><i className="ph ph-warning-circle" />{err}</div>}
        </div>

        <div className="flex min-h-full flex-col gap-2.5 border-l border-slate-200 bg-slate-50 px-5 py-[18px]">
          <div className="text-xs font-semibold uppercase tracking-wide text-slate-600">Vista previa de cartera</div>
          {c.tandas ? (
            <div className="rounded-md border border-slate-200 bg-white">
              <div className="grid grid-cols-[minmax(0,1fr)_100px_110px] gap-2 border-b border-slate-200 px-2.5 py-[7px] text-[11px] font-semibold uppercase text-slate-600"><span>Tanda</span><span className="text-right">Cuota</span><span className="text-right">Total</span></div>
              {c.tandas.map(x => (
                <div key={x.l} className="grid grid-cols-[minmax(0,1fr)_100px_110px] gap-2 border-b border-slate-100 px-2.5 py-[7px] text-xs">
                  <span>{x.l}</span>{x.sinPrecio ? <span className="col-span-2 text-right text-[11px] font-semibold text-amber-700">Tanda sin precio</span> : <><span className="text-right font-mono font-semibold">{fmt(x.cuota)}</span><span className="text-right font-mono text-slate-600">{fmt(x.total)}</span></>}
                </div>
              ))}
            </div>
          ) : (
            <>
              <div className="flex items-baseline justify-between"><span className="text-xs text-slate-500">Cuota</span><span className="font-mono text-xl font-bold">{fmt(c.cuota)}</span></div>
              <div className="flex justify-between text-xs text-slate-500"><span>Total a facturar por alumno</span><span className="font-mono text-ink">{fmt(c.total)}</span></div>
              <div className="flex justify-between text-xs text-slate-500"><span>Ahorro vs. base</span><span className="font-mono text-green-600">{fmt(c.anual - c.total)}</span></div>
            </>
          )}
          {f.materialesOn && Number(f.materiales) > 0 && <div className="flex justify-between text-xs text-slate-500"><span>+ Cuota de materiales (aparte, 1.er vencimiento)</span><span className="font-mono text-ink">{fmt(Number(f.materiales))}</span></div>}
          <div className="mt-1 rounded-md border border-slate-200 bg-white">
            {c.sched.map(s => (
              <div key={s.n} className="flex justify-between gap-2 border-b border-slate-100 px-2.5 py-[7px] text-xs">
                <span className="w-[22px] font-mono text-slate-500">{s.n}</span><span className="flex-1">{s.mes}</span>
                <span className="font-mono text-slate-600">{s.fecha}</span><span className="w-[92px] text-right font-mono font-medium">{s.montoF}</span>
              </div>
            ))}
          </div>
          <div className="flex flex-col gap-1.5 rounded-md border border-slate-200 bg-white px-3 py-2.5">
            {rules.map(([k, v]) => <div key={k} className="flex justify-between gap-2.5 text-xs"><span className="text-slate-500">{k}:</span><span className="text-right font-semibold">{v}</span></div>)}
          </div>
        </div>
      </div>
      <div className="flex justify-between gap-2 border-t border-slate-200 bg-white px-5 py-3.5">
        {mode !== 'create' && (
          <button onClick={() => onDelete(plan!)} className="flex h-9 items-center gap-1.5 rounded-md border border-red-300 bg-white px-3 text-[13px] font-medium text-red-600"><i className="ph ph-trash" />Eliminar</button>
        )}
        {/* El error también va en el pie: el del formulario queda al final de una columna larga y no se veía al guardar. */}
        <span className="flex flex-1 items-center justify-end px-2 text-right text-xs font-medium text-red-600" role="alert">{err && <><i className="ph ph-warning-circle mr-1.5 flex-none" />{err}</>}</span>
        <div className="flex gap-2">
          <button onClick={() => { if (!ro) limpiar(); onClose(); }} className="h-9 rounded-md border border-slate-300 bg-white px-3.5 text-[13px] font-medium">{ro ? 'Cerrar' : 'Cancelar'}</button>
          <button onClick={() => void primary()} className="flex h-9 items-center gap-1.5 rounded-md bg-accent px-4 text-[13px] font-semibold text-white">
            <i className={ro ? 'ph ph-pencil-simple' : 'ph ph-floppy-disk'} />{ro ? 'Editar' : mode === 'create' ? 'Crear plan' : 'Guardar cambios'}
          </button>
        </div>
      </div>
    </SideDrawer>
  );
}
