import { useCallback, useEffect, useMemo, useState } from 'react';
import type { CfgReinscripcion, EstadoReinscripcion, ReinscripcionAbrirResp, ReinscripcionEvalResp, ReinscripcionListado, ReinscripcionPreview } from '@stodia/shared';
import { btn, btnPrimary, card, input, pill, pillBase, td, th, type PillTone } from '../../components/system/styles';
import { useToast, useUi } from '../../components/system/UiProvider';
import ConfirmModal from '../../components/system/ConfirmModal';
import { fmt } from '../../components/finanzas/fin';
import { xlsxBlob } from '../../components/finanzas/xlsx';
import { api } from '../../lib/api';

/**
 * REINSCRIPCIÓN de alumnos existentes (Configuración → «Reinscripción»). API: /reinscripcion (lib/reinscripcion.ts). Ver docs/cierre-y-promocion.md §6.
 *  1) Política: usar reinscripción, «Pérdida de cupo por falta de pago» (apagada = solo mora y cupo asegurado), cuota (inscripción vigente o monto propio), gracia y fecha límite del ciclo destino.
 *  2) «Abrir reinscripción»: modal de confirmación con la vista previa (reserva cupo y genera la cuota de cada alumno vigente; idempotente).
 *  3) Estado por alumno: Reservado / Confirmado (pagó) / Vencido / Liberado, con filtros, exportación y «Reactivar» (clave de supervisor).
 */
const label = 'flex flex-col gap-1 text-xs font-medium text-slate-600';
const sel = 'h-9 rounded-md border border-slate-300 bg-white px-2 text-[13px] outline-none focus:border-accent';
const TONO: Record<EstadoReinscripcion, PillTone> = { Reservado: 'info', Confirmado: 'ok', Vencido: 'warn', Liberado: 'bad' };
const dmy = (iso: string | null) => (iso ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}` : '—');
const PAGINA = 200;

export default function Reinscripcion() {
  const toast = useToast();
  const { openGuard } = useUi();
  const [cfg, setCfg] = useState<CfgReinscripcion | null>(null);
  const [form, setForm] = useState({ activa: false, perdida: false, modo: 'inscripcion' as 'inscripcion' | 'propia', cuota: '', gracia: '0' });
  const [lim, setLim] = useState('');
  const [guardando, setGuardando] = useState(false);
  const [guardandoLim, setGuardandoLim] = useState(false);
  const [prev, setPrev] = useState<ReinscripcionPreview | null>(null);
  const [lista, setLista] = useState<ReinscripcionListado | null>(null);
  const [abrir, setAbrir] = useState(false);
  const [abriendo, setAbriendo] = useState(false);
  const [errAbrir, setErrAbrir] = useState('');
  const [resultado, setResultado] = useState<ReinscripcionAbrirResp | null>(null);
  const [evaluar, setEvaluar] = useState(false);
  const [evaluando, setEvaluando] = useState(false);
  const [evalRes, setEvalRes] = useState<ReinscripcionEvalResp | null>(null);
  const [f, setF] = useState({ grado: '', seccion: '', estado: '', q: '' });
  const [limite, setLimite] = useState(PAGINA);

  const cargarCfg = useCallback((c: CfgReinscripcion) => { setCfg(c); setForm({ activa: c.activa, perdida: c.perdidaCupoPorFaltaDePago, modo: c.modo, cuota: c.cuotaReinscripcion ? String(c.cuotaReinscripcion) : '', gracia: String(c.diasGracia) }); }, []);
  const recargar = useCallback(async () => {
    try {
      const [p, l] = await Promise.all([api.get<ReinscripcionPreview>('/reinscripcion/preview'), api.get<ReinscripcionListado>('/reinscripcion/listado')]);
      setPrev(p); setLista(l); setLim(p.limite ?? l.limite ?? '');
    } catch (e) { toast((e as Error).message, 'bad'); }
  }, [toast]);
  useEffect(() => {
    api.get<CfgReinscripcion>('/reinscripcion/config').then(cargarCfg).catch(e => toast((e as Error).message, 'bad'));
    void recargar();
  }, [toast, cargarCfg, recargar]);

  const sucio = !!cfg && (cfg.activa !== form.activa || cfg.perdidaCupoPorFaltaDePago !== form.perdida || cfg.modo !== form.modo || String(cfg.cuotaReinscripcion || '') !== form.cuota.trim() || String(cfg.diasGracia) !== form.gracia.trim());
  const guardar = async () => {
    const cuota = Number(form.cuota || 0), gracia = Number(form.gracia || 0);
    if (form.modo === 'propia' && !(cuota > 0)) return toast('Indica el monto de la cuota de reinscripción propia', 'bad');
    if (!Number.isInteger(gracia) || gracia < 0 || gracia > 365) return toast('Los días de gracia deben ser un entero entre 0 y 365', 'bad');
    setGuardando(true);
    try {
      cargarCfg(await api.put<CfgReinscripcion>('/reinscripcion/config', { activa: form.activa, perdidaCupoPorFaltaDePago: form.perdida, modo: form.modo, cuotaReinscripcion: cuota, diasGracia: gracia }));
      toast('Política de reinscripción guardada', 'ok');
      await recargar();
    } catch (e) { toast((e as Error).message, 'bad'); } finally { setGuardando(false); }
  };
  const guardarLimite = async () => {
    if (!prev?.destino) return;
    setGuardandoLim(true);
    try {
      await api.put('/reinscripcion/limite', { ciclo: prev.destino, fecha: lim || null });
      toast(`Fecha límite de ${prev.destino} guardada`, 'ok');
      await recargar();
    } catch (e) { toast((e as Error).message, 'bad'); } finally { setGuardandoLim(false); }
  };
  const abrirReins = async () => {
    setAbriendo(true); setErrAbrir('');
    try {
      const r = await api.post<ReinscripcionAbrirResp>('/reinscripcion/abrir', {});
      setResultado(r); setAbrir(false);
      toast(`Reinscripción abierta · ${r.reservados} cupos reservados, ${r.cargos} cuotas generadas`, 'ok');
      await recargar();
    } catch (e) { setErrAbrir((e as Error).message); } finally { setAbriendo(false); }
  };
  const evaluarYa = async () => {
    setEvaluando(true);
    try { const r = await api.post<ReinscripcionEvalResp>('/reinscripcion/evaluar', {}); setEvalRes(r); setEvaluar(false); await recargar(); toast(r.politicaPerdida ? `${r.liberadas} cupo(s) liberado(s)` : `${r.vencidas} cuota(s) vencida(s): solo se genera mora, el cupo sigue asegurado`, 'ok'); }
    catch (e) { toast((e as Error).message, 'bad'); setEvaluar(false); } finally { setEvaluando(false); }
  };
  const reactivar = (x: { alumnoId: string; nombre: string }) => openGuard({
    title: 'Reactivar a ' + x.nombre, pin: true, label: 'Reactivar alumno',
    desc: 'Vuelve a Activo, recupera su cupo si hay disponibilidad (si no hay, se avisa) y se genera de nuevo su cuota de reinscripción con 7 días para pagar.',
    onOk: async token => {
      try {
        const r = await api.post<{ seccion: string; confirmado: boolean }>('/reinscripcion/reactivar', { alumnoId: x.alumnoId, pin: token });
        toast(`${x.nombre} reactivado en ${r.seccion}`, 'ok'); await recargar();
      } catch (e) { toast((e as Error).message, 'bad'); }
    },
  });

  const filas = useMemo(() => lista?.filas ?? [], [lista]);
  const grados = useMemo(() => [...new Map(filas.map(x => [x.gradoId, [x.gradoOrden, x.grado] as const])).entries()].sort((a, b) => a[1][0] - b[1][0]), [filas]);
  const secciones = useMemo(() => [...new Map(filas.filter(x => !f.grado || x.gradoId === f.grado).map(x => [x.seccionId, x.seccion + ' · ' + x.tanda])).entries()].sort((a, b) => a[1].localeCompare(b[1])), [filas, f.grado]);
  const vista = useMemo(() => {
    const q = f.q.trim().toLowerCase();
    return filas.filter(x => (!f.grado || x.gradoId === f.grado) && (!f.seccion || x.seccionId === f.seccion) && (!f.estado || x.estado === f.estado) && (!q || x.nombre.toLowerCase().includes(q) || x.code.toLowerCase().includes(q)));
  }, [filas, f]);
  const exportar = () => {
    if (!lista) return;
    const head = ['Código', 'Alumno', 'Sección origen', 'Sección reservada', 'Tanda', 'Estado', 'Cuota', 'Vence', 'Mora pendiente', 'Estado del alumno', 'Nota'];
    const rows = vista.map(x => [x.code, x.nombre, x.origen, x.seccion, x.tanda, x.estado, x.monto.toFixed(2), x.vence ?? '', x.mora.toFixed(2), x.alumnoEstado, x.nota]);
    const a = document.createElement('a');
    a.href = URL.createObjectURL(xlsxBlob('Reinscripción', head, rows));
    a.download = `reinscripcion-${(lista.destino ?? '').replace('–', '-')}.xlsx`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  };
  const c = lista?.conteos;
  const TILES: [string, string, PillTone][] = c ? [['Reservados', String(c.reservado), 'info'], ['Confirmados (pagaron)', String(c.confirmado), 'ok'], ['Vencidos', String(c.vencido), 'warn'], ['Cupos liberados', String(c.liberado), 'bad'], ['Mora generada', fmt(c.moraGenerada), 'mute']] : [];

  return (
    <div className="flex max-w-[1100px] flex-col gap-3.5">
      <section className={`${card} flex flex-col gap-3 p-[18px]`}>
        <div className="flex flex-col gap-0.5">
          <span className="text-sm font-semibold">Política de reinscripción</span>
          <span className="text-xs text-slate-500">El ciclo siguiente permite reinscribir y cobrar con anticipación aunque el actual no esté cerrado. Cada alumno vigente reserva su cupo pagando la <b>cuota de reinscripción</b> antes de la fecha límite.</span>
        </div>
        <div className="grid gap-3 [grid-template-columns:repeat(auto-fit,minmax(min(260px,100%),1fr))]">
          <label className="flex cursor-pointer items-start gap-2 rounded-md border border-slate-200 px-3 py-2.5 text-[13px]">
            <input type="checkbox" checked={form.activa} onChange={e => setForm({ ...form, activa: e.target.checked })} className="mt-0.5 h-4 w-4 accent-accent" data-testid="reins-activa" />
            <span className="flex flex-col gap-0.5"><span className="font-medium">Usar reinscripción</span><span className="text-xs text-slate-500">Habilita «Abrir reinscripción». Apagada, no se abre una nueva (las reservas existentes se conservan).</span></span>
          </label>
          <label className="flex cursor-pointer items-start gap-2 rounded-md border border-slate-200 px-3 py-2.5 text-[13px]">
            <input type="checkbox" checked={form.perdida} onChange={e => setForm({ ...form, perdida: e.target.checked })} className="mt-0.5 h-4 w-4 accent-accent" data-testid="reins-perdida" />
            <span className="flex flex-col gap-0.5"><span className="font-medium">Pérdida de cupo por falta de pago</span><span className="text-xs text-slate-500">{form.perdida ? 'ACTIVO: si la cuota no se paga a la fecha límite (más la gracia), el alumno pierde el cupo, pasa a Inactivo y el curso libera un cupo para un nuevo estudiante.' : 'APAGADO: si la cuota vence solo se genera mora y el cupo queda siempre asegurado.'}</span></span>
          </label>
          <label className={label}>Cuota de reinscripción
            <select value={form.modo} onChange={e => setForm({ ...form, modo: e.target.value as 'inscripcion' | 'propia' })} className={sel} data-testid="reins-modo">
              <option value="inscripcion">Usar la cuota de inscripción vigente</option>
              <option value="propia">Monto propio de reinscripción</option>
            </select>
            <span className="text-[11px] font-normal text-slate-500">{form.modo === 'inscripcion' ? 'Fija o por plan de pago del alumno, según Finanzas → modalidad de inscripción.' : 'Un monto único para todos los alumnos.'}</span>
          </label>
          {form.modo === 'propia' && (
            <label className={label}>Monto (RD$)
              <input value={form.cuota} onChange={e => setForm({ ...form, cuota: e.target.value.replace(/[^\d.]/g, '') })} inputMode="decimal" className={`${input} text-right font-mono`} data-testid="reins-cuota" />
            </label>
          )}
          <label className={label}>Días de gracia
            <input value={form.gracia} onChange={e => setForm({ ...form, gracia: e.target.value.replace(/\D/g, '') })} inputMode="numeric" className={`${input} text-right font-mono`} data-testid="reins-gracia" />
            <span className="text-[11px] font-normal text-slate-500">Después de la fecha límite, antes de generar la mora o liberar el cupo. Por defecto 0.</span>
          </label>
        </div>
        <div className="flex justify-end"><button onClick={() => void guardar()} disabled={!sucio || guardando} className={btnPrimary} data-testid="reins-guardar"><i className="ph ph-floppy-disk" />{guardando ? 'Guardando…' : 'Guardar política'}</button></div>
      </section>

      <section className={`${card} flex flex-col gap-3 p-[18px]`}>
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div className="flex flex-col gap-0.5">
            <span className="text-sm font-semibold">Abrir la reinscripción{prev?.destino ? ` · ${prev.destino}` : ''}</span>
            <span className="text-xs text-slate-500">Reserva un cupo en el grado siguiente (provisional hasta aplicar la promoción) y genera la cuota de cada alumno vigente. Es idempotente: no duplica a quien ya tiene reserva. Hazlo <b>antes</b> de aplicar la promoción.</span>
          </div>
          <div className="flex flex-wrap items-end gap-2">
            <label className={label}>Fecha límite de pago{prev?.destino ? ` (${prev.destino})` : ''}
              <input type="date" value={lim} onChange={e => setLim(e.target.value)} disabled={!prev?.destino} className={`${input} w-[170px]`} data-testid="reins-limite" />
            </label>
            <button onClick={() => void guardarLimite()} disabled={!prev?.destino || guardandoLim || lim === (prev?.limite ?? '')} className={btn}><i className="ph ph-calendar-check" />Guardar fecha</button>
            <button onClick={() => { setErrAbrir(''); setAbrir(true); }} disabled={!prev || !!prev.bloqueo || (sucio)} title={prev?.bloqueo ?? (sucio ? 'Guarda primero la política' : undefined)} className={btnPrimary} data-testid="reins-abrir"><i className="ph ph-door-open" />Abrir reinscripción</button>
          </div>
        </div>
        {prev?.bloqueo && <div role="alert" className="rounded-md bg-warn-bg px-3 py-2 text-xs text-[#92400E]">{prev.bloqueo}</div>}
        {resultado && <div className="rounded-md bg-ok-bg px-3 py-2 text-xs text-ok-fg">Reinscripción abierta: {resultado.reservados} cupos reservados, {resultado.cargos} cuotas generadas{resultado.confirmados ? `, ${resultado.confirmados} confirmados sin cuota` : ''}{resultado.sinCupo ? `, ${resultado.sinCupo} sin cupo` : ''}.</div>}
        {prev && !prev.bloqueo && <div className="text-xs text-slate-500">{prev.vigentes} alumnos vigentes · {prev.conMatricula} ya tienen matrícula en {prev.destino} · <b>{prev.reservar}</b> por reservar{prev.sinCupo ? ` · ${prev.sinCupo} sin cupo` : ''}.</div>}
      </section>

      <section className={`${card} flex flex-col gap-3 p-[18px]`}>
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div className="flex flex-col gap-0.5">
            <span className="text-sm font-semibold">Estado de la reinscripción{lista?.destino ? ` · ${lista.destino}` : ''}</span>
            <span className="text-xs text-slate-500">Se evalúan solas cada 6 horas las cuotas vencidas: con la pérdida de cupo activa se libera el cupo; si no, solo se genera la mora.</span>
          </div>
          <div className="flex flex-wrap gap-2">
            <button onClick={() => setEvaluar(true)} disabled={!c || !(c.reservado + c.vencido)} className={btn} data-testid="reins-evaluar"><i className="ph ph-clock-countdown" />Evaluar vencidas ahora</button>
            <button onClick={exportar} disabled={!vista.length} className={btn}><i className="ph ph-file-xls" />Exportar</button>
          </div>
        </div>
        {evalRes && <div className="rounded-md bg-slate-50 px-3 py-2 text-xs text-slate-600">Última evaluación: {evalRes.evaluadas} reservas con cuota impaga, {evalRes.vencidas} vencidas, {evalRes.liberadas} cupo(s) liberado(s){evalRes.politicaPerdida ? '' : ' (pérdida de cupo apagada: solo mora)'}.</div>}
        {!lista?.destino || !c?.total ? <div className="rounded-md border border-dashed border-slate-300 px-3 py-6 text-center text-sm text-slate-500">Aún no hay reservas de reinscripción. Define la política y la fecha límite y abre la reinscripción.</div> : (
          <>
            <div className="grid gap-2 [grid-template-columns:repeat(auto-fit,minmax(min(150px,100%),1fr))]">
              {TILES.map(([l, v, t]) => (
                <div key={l} className="rounded-md border border-slate-200 px-3 py-2"><div className="text-[11px] font-medium text-slate-500">{l}</div><div className="flex items-center gap-1.5 text-lg font-semibold"><span className={`h-2 w-2 rounded-full ${pill[t].split(' ')[0]}`} />{v}</div></div>
              ))}
            </div>
            <div className="flex flex-wrap gap-2">
              <select value={f.grado} onChange={e => setF({ ...f, grado: e.target.value, seccion: '' })} className={sel} aria-label="Grado"><option value="">Todos los grados</option>{grados.map(([id, [, n]]) => <option key={id} value={id}>{n}</option>)}</select>
              <select value={f.seccion} onChange={e => setF({ ...f, seccion: e.target.value })} className={sel} aria-label="Sección"><option value="">Todas las secciones</option>{secciones.map(([id, n]) => <option key={id} value={id}>{n}</option>)}</select>
              <select value={f.estado} onChange={e => setF({ ...f, estado: e.target.value })} className={sel} aria-label="Estado"><option value="">Todos los estados</option>{(Object.keys(TONO) as EstadoReinscripcion[]).map(s => <option key={s} value={s}>{s}</option>)}</select>
              <input value={f.q} onChange={e => setF({ ...f, q: e.target.value })} placeholder="Buscar alumno o código" className={`${input} max-w-[240px]`} />
              <span className="self-center text-xs text-slate-500">{vista.length} de {filas.length}</span>
            </div>
            <div className="overflow-auto rounded-md border border-slate-200">
              <table className="w-full border-collapse text-[12.5px]">
                <thead><tr><th className={th}>Alumno</th><th className={th}>Origen</th><th className={th}>Sección reservada</th><th className={th}>Estado</th><th className={`${th} text-right`}>Cuota</th><th className={th}>Vence</th><th className={`${th} text-right`}>Mora</th><th className={th}>Observación</th><th className={th} /></tr></thead>
                <tbody>
                  {vista.slice(0, limite).map(x => (
                    <tr key={x.alumnoId} className="h-9 hover:bg-slate-50">
                      <td className={`${td} min-w-[210px]`}>{x.nombre} <span className="font-mono text-[11px] text-slate-400">{x.code}</span></td>
                      <td className={`${td} whitespace-nowrap`}>{x.origen}</td>
                      <td className={`${td} whitespace-nowrap`}>{x.seccion} <span className="text-[11px] text-slate-400">{x.tanda}</span></td>
                      <td className={td}><span className={`${pillBase} px-2 ${pill[TONO[x.estado]]}`}>{x.estado}</span></td>
                      <td className={`${td} whitespace-nowrap text-right font-mono`}>{x.monto ? fmt(x.monto) : '—'}</td>
                      <td className={`${td} whitespace-nowrap`}>{x.vence ?? '—'}</td>
                      <td className={`${td} whitespace-nowrap text-right font-mono ${x.mora ? 'text-[#DC2626]' : ''}`}>{x.mora ? fmt(x.mora) : '—'}</td>
                      <td className={`${td} text-[11.5px] text-slate-500`}>{x.nota}</td>
                      <td className={`${td} text-right`}>{x.estado === 'Liberado' && <button onClick={() => reactivar(x)} className={`${btn} !h-7 !px-2 text-[12px]`}><i className="ph ph-arrow-counter-clockwise" />Reactivar</button>}</td>
                    </tr>
                  ))}
                  {!vista.length && <tr><td colSpan={9} className={`${td} py-6 text-center text-slate-500`}>Sin alumnos para estos filtros.</td></tr>}
                </tbody>
              </table>
            </div>
            {vista.length > limite && <div className="flex justify-center"><button onClick={() => setLimite(limite + PAGINA)} className={btn}>Mostrar {Math.min(PAGINA, vista.length - limite)} más</button></div>}
          </>
        )}
      </section>

      {abrir && prev && (
        <ConfirmModal title={`Abrir reinscripción ${prev.origen} → ${prev.destino}`} confirmLabel="Abrir reinscripción" busyLabel="Abriendo…" busy={abriendo} error={errAbrir} icon="ph ph-door-open" onConfirm={() => void abrirReins()} onClose={() => setAbrir(false)}>
          <div className="flex flex-col gap-2">
            <span>Se reservará un cupo en <b>{prev.destino}</b> y se generará la cuota de reinscripción de cada alumno vigente:</span>
            <ul className="m-0 grid grid-cols-2 gap-x-4 gap-y-0.5 pl-4 text-[13px]">
              <li><b>{prev.vigentes}</b> alumnos vigentes</li><li><b>{prev.conMatricula}</b> ya con matrícula (no se tocan)</li>
              <li><b>{prev.reservar}</b> cupos por reservar</li><li><b>{prev.sinCupo}</b> sin cupo disponible</li>
              <li><b>{fmt(prev.montoTotal)}</b> en cuotas</li><li>Límite: <b>{dmy(prev.limite)}</b></li>
            </ul>
            <span className="text-xs text-slate-500">Si la cuota no se paga a tiempo: {prev.cfg.perdidaCupoPorFaltaDePago ? 'el alumno PIERDE el cupo (pasa a Inactivo y el cupo se libera).' : 'solo se genera mora; el cupo queda asegurado.'} Se puede volver a abrir sin duplicar. Queda registrado en auditoría.</span>
            {prev.avisos.map(a => <span key={a} className="text-xs text-[#92400E]">{a}</span>)}
            {prev.sinCupoNombres.length > 0 && <span className="max-h-20 overflow-auto text-xs text-slate-500">Sin cupo: {prev.sinCupoNombres.join(' · ')}</span>}
          </div>
        </ConfirmModal>
      )}
      {evaluar && c && (
        <ConfirmModal title="Evaluar reservas vencidas" confirmLabel="Evaluar ahora" busyLabel="Evaluando…" busy={evaluando} danger={!!cfg?.perdidaCupoPorFaltaDePago && !!cfg.activa} onConfirm={() => void evaluarYa()} onClose={() => setEvaluar(false)}>
          {cfg?.activa && cfg.perdidaCupoPorFaltaDePago
            ? <>Las reservas con la cuota vencida (más la gracia) <b>perderán el cupo</b>: el alumno pasa a Inactivo y la cuota se anula. Puedes reactivarlos después.</>
            : <>Con la pérdida de cupo apagada solo se genera la mora de las cuotas vencidas; ningún cupo se libera.</>}
        </ConfirmModal>
      )}
    </div>
  );
}
