import { useCallback, useEffect, useMemo, useState } from 'react';
import { useDraft } from '../../lib/useDraft';
import { useNavigate } from 'react-router-dom';
import type { Alumno, DirCorte } from '@stodia/shared';
import { api } from '../../lib/api';
import { canAccess } from '../../lib/access';
import { useSession } from '../../lib/session';
import { useToast } from '../../components/system/UiProvider';
import { btn, btnPrimary, card, pillBase, pill, th, td, type PillTone } from '../../components/system/styles';
import { errMsg, norm } from '../../components/finanzas/fin';
import { cartaDoc, printCarta } from '../../components/personas/printCarta';
import { xlsxBlob } from '../../components/finanzas/xlsx';
import { opciones, usePersRef } from '../../components/personas/ref';
import { descargarPdf, guardarBlob, hoyDMY, runPrint, usePrintBusy } from '../../components/finanzas/print';
import { SL_MSG, useCiclo } from '../../lib/ciclo';

const ESTADO_TONE: Record<string, PillTone> = { Activo: 'ok', Inactivo: 'warn', Retirado: 'mute', Egresado: 'info' };
const PAGE = 50;
const filterCls = 'h-[34px] rounded-md border border-slate-300 bg-white px-2 text-[13px] text-ink';
const full = (a: Alumno) => `${a.nombres} ${a.apellidos}`;

export default function Screen() {
  const { user } = useSession();
  const navigate = useNavigate();
  const toast = useToast();
  const ref = usePersRef();
  const { soloLectura: sl, cicloSeleccionado } = useCiclo(); // Fase 2D: otro ciclo = solo lectura (editar / eliminar / ingreso deshabilitados)
  const cicloTxt = (cicloSeleccionado || ref.ciclo) ? ` · Ciclo ${cicloSeleccionado || ref.ciclo}` : '';
  const [rows, setRows] = useState<Alumno[] | null>(null);
  const [q, setQ] = useDraft('directorio:q', ''); // búsqueda y filtros se conservan al navegar
  const [fil, setFil] = useDraft('directorio:fil', { grado: '', tanda: '', estado: '', cuenta: '' });
  const [sort, setSort] = useState(1);
  const [page, setPage] = useState(0);
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [menu, setMenu] = useState(false);

  const load = useCallback(async () => {
    try { setRows(await api.get<Alumno[]>('/directorio')); } catch (e) { toast(errMsg(e), 'bad'); setRows([]); }
  }, [toast]);
  useEffect(() => { void load(); }, [load]);

  const list = rows ?? [];
  const view = useMemo(() => {
    const nq = norm(q.trim());
    return list
      .filter(x => (!nq || norm(`${full(x)} ${x.code} ${x.tutor}`).includes(nq)) && (!fil.grado || x.grado === fil.grado) && (!fil.tanda || x.tanda === fil.tanda)
        && (!fil.estado || x.estado === fil.estado) && (!fil.cuenta || (fil.cuenta === 'En mora') === (x.cuenta === 'mora')))
      .sort((a, b) => a.apellidos.localeCompare(b.apellidos, 'es') * sort);
  }, [list, q, fil, sort]);
  const pages = Math.max(1, Math.ceil(view.length / PAGE));
  const cur0 = Math.min(page, pages - 1);
  const pageRows = useMemo(() => view.slice(cur0 * PAGE, cur0 * PAGE + PAGE), [view, cur0]);
  useEffect(() => { setPage(0); }, [q, fil, sort]);
  const anyFilter = !!(q || fil.grado || fil.tanda || fil.estado || fil.cuenta);
  const clear = () => { setQ(''); setFil({ grado: '', tanda: '', estado: '', cuenta: '' }); };
  const selList = list.filter(x => sel.has(x.id));
  const allOn = view.length > 0 && view.every(x => sel.has(x.id));
  const toggleAll = () => setSel(s => { const n = new Set(s); view.forEach(x => (allOn ? n.delete(x.id) : n.add(x.id))); return n; });
  const toggle = (id: string) => setSel(s => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });

  const open = (x: Alumno) => navigate(`/expediente/${x.id}`); // Directo al expediente 360 (Editar / Eliminar viven allí, con clave de supervisor)

  const target = () => (selList.length ? selList : view);
  const head = ['Matrícula', 'Alumno', 'Curso', 'Tanda', 'Tutor financiero', 'Estado'];
  const tableRows = (r: Alumno[]) => r.map(x => [x.code.replace(/^EST-\d{4}-/, 'EST-'), full(x), `${x.grado} ${x.sec}`, x.tanda, x.tutor, x.estado]);
  const listDoc = (r: Alumno[]) => cartaDoc([{ title: 'Listado de alumnos', sub: `${r.length} estudiantes${cicloTxt}`, blocks: [{ t: 'table', head, rows: tableRows(r), widths: ['66px', '1fr', '42px', '70px', '120px', '58px'] }] }], ['Dirección académica'], 'Listado de alumnos', 'directorio_alumnos.pdf');
  const printList = (r: Alumno[], key = 'dirPrint') => runPrint(key, listDoc(r));
  const pb = usePrintBusy();
  const pbPrint = pb('dirPrint', selList.length ? 'Imprimir seleccionados' : 'Imprimir listado', 'ph ph-printer');
  const pbSel = pb('dirSelPrint', 'Imprimir seleccionados', 'ph ph-printer');
  const pbNotif = pb('dirNotif', 'Imprimir notificaciones de cobro', 'ph ph-envelope-simple');
  // Excel y PDF reales con la misma tabla que ve el usuario (selección o resultado filtrado).
  const exportXls = () => { setMenu(false); guardarBlob(xlsxBlob('Directorio', head, tableRows(target())), 'directorio_alumnos.xlsx'); toast('Excel generado · directorio_alumnos.xlsx', 'ok'); };
  const exportPdf = async () => { setMenu(false); try { toast('Generando PDF…', 'info'); await descargarPdf(listDoc(target())); toast('PDF generado · directorio_alumnos.pdf', 'ok'); } catch (e) { toast(errMsg(e), 'bad'); } };
  const printNotif = async () => {
    const m = selList.filter(x => x.cuenta === 'mora');
    if (!m.length) { toast('Ninguno de los alumnos seleccionados está en mora', 'warn'); return; }
    try {
      const [saldos, corte] = await Promise.all([api.post<Record<string, number>>('/directorio/saldos', { ids: m.map(x => x.id) }), api.get<DirCorte>('/directorio/corte')]);
      const fmt = (n: number) => 'RD$ ' + n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
      printCarta(m.map(x => ({
        title: 'Notificación de cobro', sub: hoyDMY(),
        blocks: [
          { t: 'kv' as const, rows: [['Tutor financiero', x.tutor], ['Estudiante', full(x)], ['Matrícula', x.code], ['Curso', `${x.grado} ${x.sec} · ${x.tanda}`]] as [string, string][] },
          { t: 'text' as const, s: `Estimado(a) tutor(a): nuestros registros indican que la cuenta del estudiante arriba mencionado presenta cuotas vencidas. Le invitamos a regularizar su situación en caja antes del ${corte.texto} para evitar recargos adicionales por mora. Si ya realizó el pago, haga caso omiso de esta comunicación.` },
          { t: 'total' as const, rows: [['SALDO VENCIDO', fmt(saldos[x.id] ?? 0), true]] as [string, string, boolean][] },
        ],
      })), ['Administración financiera'], 'Notificaciones de cobro', 'dirNotif', `notificaciones_cobro_${new Date().toISOString().slice(0, 10)}.pdf`);
    } catch (e) { toast(errMsg(e), 'bad'); }
  };

  return (
    <div className="flex flex-col gap-3.5">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="m-0 text-xl font-semibold tracking-tight">Directorio de Alumnos</h1>
          <p className="mb-0 mt-1 text-[13px] text-slate-600">{list.filter(x => x.estado === 'Activo').length} activos · {list.length} en total{cicloTxt}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative z-30">
            <button onClick={() => setMenu(m => !m)} className={btn}><i className="ph ph-download-simple" />Exportar <i className="ph ph-caret-down text-[11px]" /></button>
            {menu && (
              <>
                <div className="fixed inset-0 z-30" onClick={() => setMenu(false)} />
                <div className="absolute right-0 top-10 z-40 w-[270px] rounded-lg border border-slate-200 bg-white p-1.5 shadow-[0_12px_32px_rgba(15,23,42,0.18)]">
                  {[['ph ph-file-pdf', 'PDF', exportPdf, 'none'], ['ph ph-file-xls', 'Excel', exportXls, 'none'], [pbPrint.icon, pbPrint.label, () => { setMenu(false); printList(target()); }, pbPrint.spin]].map(([ic, l, fn, sp]) => (
                    <button key={l as string} onClick={fn as () => void} className="flex h-[34px] w-full items-center gap-2 rounded-md px-2.5 text-left text-[13px] hover:bg-slate-100">
                      <i className={`${ic} text-base text-slate-600`} style={{ animation: sp as string }} />{l as string}
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
          {user && canAccess(user.rol, 'inscripcion') && <button onClick={() => navigate('/inscripcion')} disabled={sl} title={sl ? SL_MSG : undefined} className={btn}><i className="ph ph-user-plus" />Nuevo ingreso vía Inscripción</button>}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[220px] max-w-[420px] flex-1">
          <i className="ph ph-magnifying-glass pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
          <input value={q} onChange={e => setQ(e.target.value)} placeholder="Buscar por nombre, matrícula o tutor…" className="h-[34px] w-full rounded-md border border-slate-300 bg-white pl-8 pr-2.5 text-[13px] outline-none focus:border-accent focus:ring-[3px] focus:ring-accent-soft" />
        </div>
        <select value={fil.grado} onChange={e => setFil({ ...fil, grado: e.target.value })} className={filterCls}><option value="">Todos los grados</option>{opciones(ref.grados, ...list.map(x => x.grado)).map(g => <option key={g}>{g}</option>)}</select>
        <select value={fil.tanda} onChange={e => setFil({ ...fil, tanda: e.target.value })} className={filterCls}><option value="">Todas las tandas</option>{opciones(ref.tandas, ...list.map(x => x.tanda)).map(g => <option key={g}>{g}</option>)}</select>
        <select value={fil.estado} onChange={e => setFil({ ...fil, estado: e.target.value })} className={filterCls}><option value="">Todos los estados</option>{['Activo', 'Inactivo', 'Retirado'].map(g => <option key={g}>{g}</option>)}</select>
        <select value={fil.cuenta} onChange={e => setFil({ ...fil, cuenta: e.target.value })} className={filterCls}><option value="">Cualquier cuenta</option>{['Al día', 'En mora'].map(g => <option key={g}>{g}</option>)}</select>
        {anyFilter && <button onClick={clear} className="h-[34px] rounded-md px-2.5 text-xs font-semibold text-accent hover:bg-blue-50">Limpiar filtros</button>}
      </div>

      <section className={`${card} overflow-hidden`}>
        <div className="max-h-[calc(100vh-290px)] overflow-auto">
          <table className="w-full min-w-[900px] border-collapse text-[13px]">
            <thead>
              <tr>
                <th className={`${th} sticky top-0 w-9`}><input type="checkbox" checked={allOn} onChange={toggleAll} aria-label="Seleccionar todos" className="h-[15px] w-[15px] cursor-pointer accent-accent" /></th>
                <th className={`${th} sticky top-0`}><button onClick={() => setSort(-sort)} className="flex items-center gap-1 border-0 bg-transparent p-0 uppercase tracking-[inherit]" style={{ font: 'inherit' }}>Alumno <i className={`ph ${sort > 0 ? 'ph-sort-ascending' : 'ph-sort-descending'}`} /></button></th>
                {['Curso', 'Tanda', 'Tutor financiero', 'Cuenta', 'Estado'].map(h => <th key={h} className={`${th} sticky top-0`}>{h}</th>)}
                <th className={`${th} sticky top-0 text-right`}>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {pageRows.map(x => {
                const on = sel.has(x.id);
                return (
                  <tr key={x.id} className={`h-9 hover:bg-slate-50 ${on ? 'bg-blue-50' : 'bg-white'}`}>
                    <td className={td}><input type="checkbox" checked={on} onChange={() => toggle(x.id)} aria-label={`Seleccionar ${full(x)}`} className="h-[15px] w-[15px] cursor-pointer accent-accent" /></td>
                    <td className={td}>
                      <div className="flex items-center gap-2.5">
                        <span className="grid h-[30px] w-[30px] flex-none place-items-center rounded-md bg-slate-200 text-[11px] font-semibold text-slate-700">{(x.nombres[0] + x.apellidos[0]).toUpperCase()}</span>
                        <div className="flex flex-col leading-tight">
                          <button onClick={() => open(x)} className="border-0 bg-transparent p-0 text-left text-[13px] font-medium text-ink hover:text-accent hover:underline">{full(x)}</button>
                          <span className="font-mono text-[11px] leading-[normal] text-slate-500">{x.code}</span>
                        </div>
                        {x.alg && <i className="ph-fill ph-warning text-red-600" title="Alergias registradas" />}
                      </div>
                    </td>
                    <td className={td}>{x.grado} {x.sec}</td>
                    <td className={`${td} text-slate-600`}>{x.tanda}</td>
                    <td className={`${td} whitespace-nowrap text-slate-600`}>{x.tutor}</td>
                    <td className={td}><span className={`${pillBase} w-[76px] ${pill[x.cuenta === 'mora' ? 'bad' : 'ok']}`}>{x.cuenta === 'mora' ? 'En mora' : 'Al día'}</span></td>
                    <td className={td}><span className={`${pillBase} w-[81px] ${pill[ESTADO_TONE[x.estado] ?? 'mute']}`}>{x.estado}</span></td>
                    <td className={`${td} whitespace-nowrap text-right`}>
                      <div className="inline-flex gap-1">
                        <button onClick={() => open(x)} title="Ver expediente" aria-label="Ver expediente" className="grid h-[30px] w-[30px] place-items-center rounded-md border border-transparent text-base text-slate-600 hover:border-slate-200 hover:bg-slate-100"><i className="ph ph-eye" /></button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {rows && view.length === 0 && (
            <div className="flex flex-col items-start gap-2.5 px-6 py-10">
              <span className="grid h-[52px] w-[52px] place-items-center rounded-full bg-blue-50 text-[26px] text-accent"><i className="ph ph-users-three" /></span>
              <div className="text-[15px] font-semibold">Ningún alumno coincide con los filtros.</div>
              <div className="text-[13px] text-slate-600">Ajusta la búsqueda o limpia los filtros para ver el directorio completo.</div>
              <button onClick={clear} className={btnPrimary}>Limpiar filtros</button>
            </div>
          )}
        </div>
        <div className="flex items-center justify-between gap-3 border-t border-slate-200 bg-slate-50 px-3.5 py-2.5 text-xs text-slate-500">
          <span>Mostrando {view.length > PAGE ? `${cur0 * PAGE + 1}–${Math.min(view.length, cur0 * PAGE + PAGE)}` : view.length} de {view.length > PAGE && view.length !== list.length ? `${view.length} coincidencias (${list.length} alumnos)` : `${list.length} alumnos`} · Altas solo por el flujo de Inscripción</span>
          {pages > 1 && (
            <span className="flex items-center gap-1.5">
              <button onClick={() => setPage(cur0 - 1)} disabled={cur0 === 0} aria-label="Página anterior" className="grid h-7 w-7 place-items-center rounded-md border border-slate-300 bg-white text-slate-600 enabled:hover:text-ink disabled:opacity-40"><i className="ph ph-caret-left" /></button>
              <span className="font-mono">{cur0 + 1} / {pages}</span>
              <button onClick={() => setPage(cur0 + 1)} disabled={cur0 >= pages - 1} aria-label="Página siguiente" className="grid h-7 w-7 place-items-center rounded-md border border-slate-300 bg-white text-slate-600 enabled:hover:text-ink disabled:opacity-40"><i className="ph ph-caret-right" /></button>
            </span>
          )}
        </div>
      </section>

      {selList.length > 0 && (
        <div className="fixed bottom-6 left-1/2 z-50 flex max-w-[94vw] -translate-x-1/2 flex-wrap items-center gap-2.5 rounded-[10px] bg-slate-900 py-2 pl-4 pr-2.5 text-slate-50 shadow-[0_12px_32px_rgba(15,23,42,0.35)]">
          <span className="whitespace-nowrap text-[13px] font-semibold">{selList.length} {selList.length === 1 ? 'seleccionado' : 'seleccionados'}</span>
          <button onClick={() => printList(selList, 'dirSelPrint')} className="flex h-[34px] items-center gap-1.5 rounded-md bg-accent px-3 text-[13px] font-semibold text-white"><i className={pbSel.icon} style={{ animation: pbSel.spin }} />{pbSel.label}</button>
          <button onClick={printNotif} className="flex h-[34px] items-center gap-1.5 rounded-md border border-slate-600 px-3 text-[13px] font-medium hover:bg-slate-800"><i className={pbNotif.icon} style={{ animation: pbNotif.spin }} />{pbNotif.label}</button>
          <button onClick={() => setSel(new Set())} title="Quitar selección" aria-label="Quitar selección" className="h-[34px] w-[34px] rounded-md text-slate-300 hover:bg-slate-800"><i className="ph ph-x" /></button>
        </div>
      )}

    </div>
  );
}
