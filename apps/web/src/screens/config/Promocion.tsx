import { Fragment, useEffect, useMemo, useState } from 'react';
import type { AccionPromocion, CfgPromocion, CriterioPromocion, PromocionAplicarResp, PromocionFila, PromocionPreview, ResultadoPromocion } from '@stodia/shared';
import { btn, btnPrimary, card, input, pill, pillBase, td, th, type PillTone } from '../../components/system/styles';
import { useToast } from '../../components/system/UiProvider';
import ConfirmModal from '../../components/system/ConfirmModal';
import { xlsxBlob } from '../../components/finanzas/xlsx';
import { api } from '../../lib/api';

/**
 * PROMOCIÓN / AVANCE DE CURSO (Configuración → «Promoción de curso»). Separado del cierre contable del año. API: /academico/promocion (lib/promocion.ts).
 *  1) Parámetros (SisConfig 'promocion'): nota mínima (rango seguro), criterio, máx. reprobadas y si exige todos los períodos.
 *  2) «Evaluar promoción»: VISTA PREVIA sin escribir (resultado por alumno según la Matriz de Notas y qué haría al aplicar).
 *  3) «Aplicar promoción»: modal de confirmación con los conteos → crea/ajusta matrículas del ciclo destino (idempotente, auditado).
 * Ver docs/cierre-y-promocion.md.
 */
const label = 'flex flex-col gap-1 text-xs font-medium text-slate-600';
const CRITERIOS: [CriterioPromocion, string, string][] = [
  ['promedio_general', 'Promedio general', 'Aprueba si el promedio de todas sus materias está dentro del rango seguro.'],
  ['todas_las_materias', 'Todas las materias', 'Aprueba solo si ninguna materia queda por debajo de la nota mínima.'],
  ['max_reprobadas', 'Promedio y máximo de reprobadas', 'Aprueba si el promedio está en rango y reprobó como mucho N materias.'],
];
const RES_TONE: Record<ResultadoPromocion, PillTone> = { Aprobado: 'ok', Reprobado: 'bad', 'Pendiente de notas': 'warn' };
const ACC: Record<AccionPromocion, [string, PillTone]> = {
  Promovido: ['Promovido', 'ok'], Repitente: ['Repite', 'bad'], Graduado: ['Egresa', 'info'], Pendiente: ['Pendiente', 'warn'], SinCupo: ['Sin cupo', 'warn'], Respetada: ['Se respeta', 'mute'],
};
const PAGINA = 200;

export default function Promocion() {
  const toast = useToast();
  const [cfg, setCfg] = useState<CfgPromocion | null>(null);
  const [form, setForm] = useState({ notaMinima: '70', criterio: 'promedio_general' as CriterioPromocion, maxReprobadas: '0', requiereTodosLosPeriodos: true });
  const [origen, setOrigen] = useState('');
  const [prev, setPrev] = useState<PromocionPreview | null>(null);
  const [cargando, setCargando] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [confirmar, setConfirmar] = useState(false);
  const [aplicando, setAplicando] = useState(false);
  const [errAplicar, setErrAplicar] = useState('');
  const [resultado, setResultado] = useState<PromocionAplicarResp | null>(null);
  const [f, setF] = useState({ grado: '', seccion: '', resultado: '', accion: '', q: '' });
  const [abierto, setAbierto] = useState<string | null>(null);
  const [limite, setLimite] = useState(PAGINA);

  const cargarCfg = (c: CfgPromocion) => { setCfg(c); setForm({ notaMinima: String(c.notaMinima), criterio: c.criterio, maxReprobadas: String(c.maxReprobadas), requiereTodosLosPeriodos: c.requiereTodosLosPeriodos }); };
  useEffect(() => { api.get<CfgPromocion>('/academico/promocion/config').then(cargarCfg).catch(e => toast((e as Error).message, 'bad')); }, [toast]);

  const evaluar = async (o = origen) => {
    setCargando(true);
    try {
      const p = await api.get<PromocionPreview>('/academico/promocion/preview' + (o ? '?origen=' + encodeURIComponent(o) : ''));
      setPrev(p); setOrigen(p.origen); setLimite(PAGINA); setAbierto(null);
    } catch (e) { toast((e as Error).message, 'bad'); } finally { setCargando(false); }
  };
  const sucio = !!cfg && (String(cfg.notaMinima) !== form.notaMinima.trim() || cfg.criterio !== form.criterio || String(cfg.maxReprobadas) !== form.maxReprobadas.trim() || cfg.requiereTodosLosPeriodos !== form.requiereTodosLosPeriodos);
  const guardar = async () => {
    const n = Number(form.notaMinima), m = Number(form.maxReprobadas);
    if (form.notaMinima.trim() === '' || !Number.isFinite(n) || n < 0 || n > 100) return toast('La nota mínima debe estar entre 0 y 100', 'bad');
    if (form.criterio === 'max_reprobadas' && (!Number.isInteger(m) || m < 0 || m > 30)) return toast('El máximo de reprobadas debe ser un entero entre 0 y 30', 'bad');
    setGuardando(true);
    try {
      cargarCfg(await api.put<CfgPromocion>('/academico/promocion/config', { notaMinima: n, criterio: form.criterio, maxReprobadas: Number.isInteger(m) ? m : 0, requiereTodosLosPeriodos: form.requiereTodosLosPeriodos }));
      toast('Parámetros de promoción guardados', 'ok');
      if (prev) await evaluar(prev.origen);
    } catch (e) { toast((e as Error).message, 'bad'); } finally { setGuardando(false); }
  };
  const aplicar = async () => {
    if (!prev) return;
    setAplicando(true); setErrAplicar('');
    try {
      const r = await api.post<PromocionAplicarResp>('/academico/promocion/aplicar', { origen: prev.origen, esperado: prev.conteos });
      setResultado(r); setPrev(r.preview); setConfirmar(false);
      toast(`Promoción aplicada · ${r.creadas} matrículas creadas, ${r.ajustadas} ajustadas en ${r.preview.destino}`, 'ok');
    } catch (e) { setErrAplicar((e as Error).message); } finally { setAplicando(false); }
  };

  const filas = prev?.filas ?? [];
  const grados = useMemo(() => [...new Map(filas.map(x => [x.gradoId, [x.gradoOrden, `${x.grado} · ${x.nivel}`] as const])).entries()].sort((a, b) => a[1][0] - b[1][0]), [filas]);
  const secciones = useMemo(() => [...new Map(filas.filter(x => !f.grado || x.gradoId === f.grado).map(x => [x.seccionId, x.seccion + ' · ' + x.tanda])).entries()].sort((a, b) => a[1].localeCompare(b[1])), [filas, f.grado]);
  const vista = useMemo(() => {
    const q = f.q.trim().toLowerCase();
    return filas.filter(x => (!f.grado || x.gradoId === f.grado) && (!f.seccion || x.seccionId === f.seccion) && (!f.resultado || x.resultado === f.resultado) && (!f.accion || x.accion === f.accion) && (!q || x.nombre.toLowerCase().includes(q) || x.code.toLowerCase().includes(q)));
  }, [filas, f]);
  const exportar = () => {
    if (!prev) return;
    const head = ['Código', 'Alumno', 'Nivel', 'Sección', 'Tanda', 'Promedio', 'Materias', 'Reprobadas', 'Incompletas', 'Resultado', 'Acción', 'Destino', 'Nota'];
    const rows = vista.map(x => [x.code, x.nombre, x.nivel, x.seccion, x.tanda, x.promedio == null ? '' : x.promedio.toFixed(1), String(x.materias), String(x.reprobadas), String(x.incompletas), x.resultado, ACC[x.accion][0], x.destino ?? '', x.nota]);
    const a = document.createElement('a');
    a.href = URL.createObjectURL(xlsxBlob('Promoción', head, rows));
    a.download = `promocion-${prev.origen.replace('–', '-')}.xlsx`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  };
  const c = prev?.conteos;
  const TILES: [string, number, PillTone][] = c ? [['Evaluados', c.evaluados, 'mute'], ['Aprobados', c.aprobados, 'ok'], ['Reprobados', c.reprobados, 'bad'], ['Pendientes de notas', c.pendientes, 'warn'], ['Egresan', c.graduados, 'info'], ['Sin sección (sin cupo)', c.sinSeccion, 'warn'], ['Matrícula respetada', c.respetadas, 'mute']] : [];
  const sel = 'h-9 rounded-md border border-slate-300 bg-white px-2 text-[13px] outline-none focus:border-accent';

  return (
    <div className="flex max-w-[1100px] flex-col gap-3.5">
      <section className={`${card} flex flex-col gap-3 p-[18px]`}>
        <div className="flex flex-col gap-0.5">
          <span className="text-sm font-semibold">Parámetros de promoción</span>
          <span className="text-xs text-slate-500">Pasan de curso los estudiantes dentro del <b>rango seguro</b>, calculado con las notas reportadas por los maestros en la Matriz de Notas (nota final de cada período según la rúbrica; promedio de los períodos por materia).</span>
        </div>
        <div className="grid gap-3 [grid-template-columns:repeat(auto-fit,minmax(min(220px,100%),1fr))]">
          <label className={label}>Nota mínima (rango seguro)
            <input value={form.notaMinima} onChange={e => setForm({ ...form, notaMinima: e.target.value.replace(/[^\d.]/g, '') })} inputMode="decimal" className={`${input} text-right font-mono`} data-testid="promo-nota" />
            <span className="text-[11px] font-normal text-slate-500">De 0 a 100. Por defecto 70.</span>
          </label>
          <label className={label}>Criterio
            <select value={form.criterio} onChange={e => setForm({ ...form, criterio: e.target.value as CriterioPromocion })} className={sel} data-testid="promo-criterio">
              {CRITERIOS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
            </select>
            <span className="text-[11px] font-normal text-slate-500">{CRITERIOS.find(x => x[0] === form.criterio)?.[2]}</span>
          </label>
          {form.criterio === 'max_reprobadas' && (
            <label className={label}>Máximo de materias reprobadas
              <input value={form.maxReprobadas} onChange={e => setForm({ ...form, maxReprobadas: e.target.value.replace(/\D/g, '') })} inputMode="numeric" className={`${input} text-right font-mono`} />
            </label>
          )}
          <label className="flex cursor-pointer items-start gap-2 rounded-md border border-slate-200 px-3 py-2.5 text-[13px]">
            <input type="checkbox" checked={form.requiereTodosLosPeriodos} onChange={e => setForm({ ...form, requiereTodosLosPeriodos: e.target.checked })} className="mt-0.5 h-4 w-4 accent-accent" />
            <span className="flex flex-col gap-0.5"><span className="font-medium">Exigir notas de todos los períodos</span><span className="text-xs text-slate-500">Si a una materia le falta la nota final de algún período, el alumno queda «Pendiente de notas» (no se mueve).</span></span>
          </label>
        </div>
        <div className="flex justify-end"><button onClick={() => void guardar()} disabled={!sucio || guardando} className={btnPrimary}><i className="ph ph-floppy-disk" />{guardando ? 'Guardando…' : 'Guardar parámetros'}</button></div>
      </section>

      <section className={`${card} flex flex-col gap-3 p-[18px]`}>
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div className="flex flex-col gap-0.5">
            <span className="text-sm font-semibold">Evaluar y aplicar la promoción</span>
            <span className="text-xs text-slate-500">La evaluación es una vista previa: no modifica nada. Puede hacerse antes o después del cierre del año escolar.</span>
          </div>
          <div className="flex flex-wrap items-end gap-2">
            {prev && prev.origenes.length > 1 && (
              <label className={label}>Ciclo evaluado
                <select value={origen} onChange={e => void evaluar(e.target.value)} className={sel}>{prev.origenes.map(o => <option key={o} value={o}>{o}</option>)}</select>
              </label>
            )}
            <button onClick={() => void evaluar()} disabled={cargando || sucio} title={sucio ? 'Guarda primero los parámetros' : undefined} className={btn} data-testid="promo-evaluar"><i className="ph ph-calculator" />{cargando ? 'Evaluando…' : prev ? 'Volver a evaluar' : 'Evaluar promoción'}</button>
            {prev && <button onClick={exportar} disabled={!vista.length} className={btn}><i className="ph ph-file-xls" />Exportar</button>}
            {prev && <button onClick={() => { setErrAplicar(''); setConfirmar(true); }} disabled={!!prev.bloqueo || cargando || sucio} className={btnPrimary} data-testid="promo-aplicar"><i className="ph ph-arrow-fat-lines-up" />Aplicar promoción</button>}
          </div>
        </div>
        {sucio && <div className="rounded-md bg-warn-bg px-3 py-2 text-xs text-[#92400E]">Hay cambios sin guardar en los parámetros: guárdalos para evaluar con ellos.</div>}
        {prev && (
          <>
            <div className="flex flex-wrap items-center gap-2 text-[13px]">
              <span className="font-mono font-semibold">{prev.origen}</span><span className="text-slate-400">({prev.origenEstado})</span>
              <i className="ph ph-arrow-right text-slate-400" />
              <span className="font-mono font-semibold">{prev.destino ?? '—'}</span>{prev.destinoEstado && <span className="text-slate-400">({prev.destinoEstado})</span>}
              <span className="text-xs text-slate-500">· nota mínima {prev.cfg.notaMinima} · {CRITERIOS.find(x => x[0] === prev.cfg.criterio)?.[1]}{prev.cfg.criterio === 'max_reprobadas' ? ` (máx. ${prev.cfg.maxReprobadas})` : ''} · {prev.periodos} períodos · último grado: {prev.ultimoGrado ?? '—'}</span>
            </div>
            {prev.bloqueo && <div role="alert" className="rounded-md bg-warn-bg px-3 py-2 text-xs text-[#92400E]">{prev.bloqueo}</div>}
            {prev.ultima && <div className="text-xs text-slate-500">Última aplicación: {new Date(prev.ultima.fecha).toLocaleString('es-DO')} por {prev.ultima.usuario} · {prev.ultima.aprobados} aprobados, {prev.ultima.reprobados} reprobados, {prev.ultima.pendientes} pendientes, {prev.ultima.graduados} egresados, {prev.ultima.sinSeccion} sin sección. Aplicar de nuevo no duplica: solo ajusta lo que cambió.</div>}
            {resultado && <div className="rounded-md bg-ok-bg px-3 py-2 text-xs text-ok-fg">Promoción aplicada en {resultado.preview.destino}: {resultado.creadas} matrículas creadas, {resultado.ajustadas} ajustadas, {resultado.sinCambios} sin cambios.</div>}
            <div className="grid gap-2 [grid-template-columns:repeat(auto-fit,minmax(min(130px,100%),1fr))]">
              {TILES.map(([l, v, t]) => (
                <div key={l} className="rounded-md border border-slate-200 px-3 py-2"><div className="text-[11px] font-medium text-slate-500">{l}</div><div className="flex items-center gap-1.5 text-lg font-semibold"><span className={`h-2 w-2 rounded-full ${pill[t].split(' ')[0]}`} />{v}</div></div>
              ))}
            </div>
            <div className="flex flex-wrap gap-2">
              <select value={f.grado} onChange={e => setF({ ...f, grado: e.target.value, seccion: '' })} className={sel} aria-label="Grado"><option value="">Todos los grados</option>{grados.map(([id, [, n]]) => <option key={id} value={id}>{n}</option>)}</select>
              <select value={f.seccion} onChange={e => setF({ ...f, seccion: e.target.value })} className={sel} aria-label="Sección"><option value="">Todas las secciones</option>{secciones.map(([id, n]) => <option key={id} value={id}>{n}</option>)}</select>
              <select value={f.resultado} onChange={e => setF({ ...f, resultado: e.target.value })} className={sel} aria-label="Resultado"><option value="">Todos los resultados</option>{(['Aprobado', 'Reprobado', 'Pendiente de notas'] as const).map(r => <option key={r} value={r}>{r}</option>)}</select>
              <select value={f.accion} onChange={e => setF({ ...f, accion: e.target.value })} className={sel} aria-label="Acción"><option value="">Todas las acciones</option>{(Object.keys(ACC) as AccionPromocion[]).map(a => <option key={a} value={a}>{ACC[a][0]}</option>)}</select>
              <input value={f.q} onChange={e => setF({ ...f, q: e.target.value })} placeholder="Buscar alumno o código" className={`${input} max-w-[240px]`} />
              <span className="self-center text-xs text-slate-500">{vista.length} de {filas.length}</span>
            </div>
            <div className="overflow-auto rounded-md border border-slate-200">
              <table className="w-full border-collapse text-[12.5px]">
                <thead><tr><th className={th}>Alumno</th><th className={th}>Sección</th><th className={`${th} text-right`}>Promedio</th><th className={`${th} text-right`}>Reprob.</th><th className={th}>Resultado</th><th className={th}>Acción</th><th className={th}>Destino</th><th className={th}>Observación</th></tr></thead>
                <tbody>
                  {vista.slice(0, limite).map(x => <FilaPromo key={x.alumnoId} x={x} min={prev.cfg.notaMinima} abierto={abierto === x.alumnoId} onToggle={() => setAbierto(abierto === x.alumnoId ? null : x.alumnoId)} />)}
                  {!vista.length && <tr><td colSpan={8} className={`${td} py-6 text-center text-slate-500`}>Sin alumnos para estos filtros.</td></tr>}
                </tbody>
              </table>
            </div>
            {vista.length > limite && <div className="flex justify-center"><button onClick={() => setLimite(limite + PAGINA)} className={btn}>Mostrar {Math.min(PAGINA, vista.length - limite)} más</button></div>}
          </>
        )}
      </section>

      {confirmar && prev && c && (
        <ConfirmModal title={`Aplicar promoción ${prev.origen} → ${prev.destino}`} confirmLabel="Aplicar promoción" busyLabel="Aplicando…" busy={aplicando} error={errAplicar} icon="ph ph-arrow-fat-lines-up" onConfirm={() => void aplicar()} onClose={() => setConfirmar(false)}>
          <div className="flex flex-col gap-2">
            <span>Se crearán o ajustarán las matrículas de <b>{prev.destino}</b> según la vista previa (nota mínima {prev.cfg.notaMinima}):</span>
            <ul className="m-0 grid grid-cols-2 gap-x-4 gap-y-0.5 pl-4 text-[13px]">
              <li><b>{c.aprobados}</b> aprobados (pasan de grado)</li><li><b>{c.reprobados}</b> reprobados (repiten)</li>
              <li><b>{c.graduados}</b> egresan (último grado)</li><li><b>{c.pendientes}</b> pendientes de notas (no se mueven)</li>
              <li><b>{c.sinSeccion}</b> sin sección por cupo</li><li><b>{c.respetadas}</b> con matrícula previa respetada</li>
            </ul>
            <span className="text-xs text-slate-500">Se puede volver a aplicar sin duplicar (por ejemplo, tras corregir notas). Queda registrado en auditoría.</span>
          </div>
        </ConfirmModal>
      )}
    </div>
  );
}

function FilaPromo({ x, min, abierto, onToggle }: { x: PromocionFila; min: number; abierto: boolean; onToggle: () => void }) {
  const [acc, tono] = ACC[x.accion];
  return (
    <Fragment>
      <tr className="h-9 cursor-pointer hover:bg-slate-50" onClick={onToggle}>
        <td className={`${td} min-w-[230px]`}><i className={`ph ${abierto ? 'ph-caret-down' : 'ph-caret-right'} mr-1 text-slate-400`} />{x.nombre} <span className="font-mono text-[11px] text-slate-400">{x.code}</span></td>
        <td className={`${td} whitespace-nowrap`}>{x.seccion} <span className="text-[11px] text-slate-400">{x.tanda}</span></td>
        <td className={`${td} text-right font-mono ${x.promedio != null && x.promedio < min ? 'text-[#DC2626]' : ''}`}>{x.promedio == null ? '—' : x.promedio.toFixed(1)}</td>
        <td className={`${td} text-right font-mono`}>{x.reprobadas || ''}</td>
        <td className={td}><span className={`${pillBase} px-2 ${pill[RES_TONE[x.resultado]]}`}>{x.resultado}</span></td>
        <td className={td}><span className={`${pillBase} px-2 ${pill[tono]}`}>{acc}</span></td>
        <td className={`${td} whitespace-nowrap`}>{x.destino ?? '—'}</td>
        <td className={`${td} text-[11.5px] text-slate-500`}>{x.nota}</td>
      </tr>
      {abierto && (
        <tr><td colSpan={8} className="border-b border-slate-100 bg-slate-50 px-6 py-2">
          {x.detalle.length ? (
            <table className="text-[12px]">
              <thead><tr className="text-left text-[11px] text-slate-500"><th className="pr-4 font-medium">Materia</th>{x.detalle[0].periodos.map((_, i) => <th key={i} className="px-2 text-right font-medium">P{i + 1}</th>)}<th className="px-2 text-right font-medium">Final</th></tr></thead>
              <tbody>
                {x.detalle.map(d => (
                  <tr key={d.materiaId}><td className="pr-4">{d.materia}</td>{d.periodos.map((p, i) => <td key={i} className={`px-2 text-right font-mono ${p == null ? 'text-slate-400' : ''}`}>{p == null ? '—' : p.toFixed(1)}</td>)}<td className={`px-2 text-right font-mono font-semibold ${d.reprobada ? 'text-[#DC2626]' : ''}`}>{d.final == null ? '—' : d.final.toFixed(1)}{!d.completa && <span className="ml-1 text-[10px] font-normal text-[#B45309]">incompleta</span>}</td></tr>
                ))}
              </tbody>
            </table>
          ) : <span className="text-xs text-slate-500">Sin materias ni notas registradas en este ciclo.</span>}
        </td></tr>
      )}
    </Fragment>
  );
}
