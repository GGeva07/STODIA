import { useCallback, useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import type { InformeCatalogos, InformeFiltroId, InformeMeta, InformeResp, InformeTabla } from '@stodia/shared';
import { btn, btnPrimary, card, input } from '../../components/system/styles';
import { useUi } from '../../components/system/UiProvider';
import { conGenerando } from '../../components/system/GenerandoModal';
import { guardarBlob, runPrint, usePrintBusy } from '../../components/finanzas/print';
import { docInforme, hojasInforme, valorResumen } from '../../components/finanzas/printInformes';
import { xlsxLibro } from '../../components/finanzas/xlsx';
import { api } from '../../lib/api';
import { useCiclo } from '../../lib/ciclo';
import TablaInforme from './TablaInforme';

const TAM = 25;
const TONO: Record<string, string> = { ok: 'text-[#15803D]', warn: 'text-[#B45309]', bad: 'text-[#DC2626]', info: 'text-[#1D4ED8]' };
type F = Record<string, string>;

const consulta = (f: F, extra: Record<string, string> = {}) => new URLSearchParams(Object.entries({ ...f, ...extra }).filter(([, v]) => v !== '' && v !== undefined)).toString();
const Campo = ({ label, children, ancho = 170 }: { label: string; children: React.ReactNode; ancho?: number }) => (
  <label className="flex flex-col gap-1 text-[11px] font-medium text-slate-600" style={{ minWidth: ancho }}>{label}{children}</label>
);

/** Visor genérico de un informe: filtros según `meta.filtros`, tarjetas de resumen, tablas paginadas con detalle expandible, Excel y PDF con TODAS las filas. */
export default function Visor({ meta, grupo }: { meta: InformeMeta; grupo: string }) {
  const { toast } = useUi();
  const navigate = useNavigate();
  const loc = useLocation();
  const { cicloSeleccionado } = useCiclo();
  const urlCiclo = new URLSearchParams(loc.search).get('ciclo') ?? '';
  const [cat, setCat] = useState<InformeCatalogos | null>(null);
  const [f, setF] = useState<F>(() => ({ ciclo: urlCiclo || cicloSeleccionado }));
  const [aplicado, setAplicado] = useState<F>(f);
  const [data, setData] = useState<InformeResp | null>(null);
  const [cargando, setCargando] = useState(true);
  const [err, setErr] = useState('');
  const [pagCarga, setPagCarga] = useState('');
  const [busy, setBusy] = useState<'' | 'xls' | 'pdf'>('');
  const seq = useRef(0);
  const pb = usePrintBusy();
  const sop = (id: InformeFiltroId) => meta.filtros.includes(id);

  useEffect(() => { api.get<InformeCatalogos>('/informes/catalogos').then(setCat).catch(() => undefined); }, []);
  // Informe de cierre: solo existe para ciclos Cerrados; si el ciclo elegido no lo es (p. ej. el activo) se parte del cierre más reciente.
  useEffect(() => {
    if (meta.id !== 'cierre' || !cat || urlCiclo) return;
    const cerrados = cat.ciclos.filter(c => c.estado === 'Cerrado');
    if (cerrados.length && !cerrados.some(c => c.n === f.ciclo)) { const n = cerrados[cerrados.length - 1].n; setF(x => ({ ...x, ciclo: n })); setAplicado(x => ({ ...x, ciclo: n })); }
  }, [cat, meta.id, urlCiclo, f.ciclo]);

  const cargar = useCallback(async (a: F) => {
    const n = ++seq.current;
    setCargando(true); setErr('');
    const r = await conGenerando({ texto: 'Generando reporte…', informe: meta.titulo, cancelable: true }, signal => api.get<InformeResp>(`/informes/${meta.id}?${consulta(a, { size: String(TAM) })}`, { signal }));
    if (n === seq.current) {
      if (r.ok) setData(r.valor); else { setErr(r.cancelado ? 'Se canceló la generación del reporte.' : (r.error ?? 'No se pudo generar el reporte')); setData(null); }
      setCargando(false);
    }
  }, [meta.id]);
  const listo = meta.id !== 'cierre' || !!urlCiclo || !!cat; // el cierre espera a conocer los ciclos cerrados
  useEffect(() => { if (listo && aplicado.ciclo) void cargar(aplicado); }, [aplicado, cargar, listo]);

  const paginar = async (t: InformeTabla, page: number) => {
    setPagCarga(t.id);
    const res = await conGenerando({ texto: 'Generando reporte…', informe: meta.titulo, cancelable: true }, signal => api.get<InformeResp>(`/informes/${meta.id}?${consulta(aplicado, { size: String(TAM), tabla: t.id, page: String(page) })}`, { signal }));
    if (res.ok) {
      const nueva = res.valor.tablas.find(x => x.id === t.id);
      if (nueva) setData(d => (d ? { ...d, tablas: d.tablas.map(x => (x.id === t.id ? nueva : x)) } : d));
    }
    setPagCarga('');
  };

  const aplicar = () => {
    if (f.desde && f.hasta && f.desde > f.hasta) { toast('La fecha «desde» no puede ser posterior a «hasta»', 'warn'); return; }
    setAplicado({ ...f });
  };
  const limpiar = () => { const base = { ciclo: f.ciclo }; setF(base); setAplicado(base); };
  const set = (k: string, v: string) => setF(x => ({ ...x, [k]: v, ...(k === 'grado' ? { seccion: '' } : {}) }));

  const completo = (signal?: AbortSignal) => api.get<InformeResp>(`/informes/${meta.id}?${consulta(aplicado, { size: 'all' })}`, { signal });
  const nombreArchivo = (ext: string) => `informe_${meta.id}_${(aplicado.ciclo ?? '').replace(/[^0-9A-Za-z]+/g, '-')}_${new Date().toISOString().slice(0, 10)}.${ext}`;
  const excel = async () => {
    setBusy('xls');
    const res = await conGenerando({ texto: 'Exportando a Excel…', informe: meta.titulo, cancelable: true }, async signal => {
      const r = await completo(signal);
      guardarBlob(xlsxLibro(hojasInforme(r)), nombreArchivo('xlsx'));
    });
    if (res.ok) toast('Excel generado · ' + nombreArchivo('xlsx'), 'ok');
    setBusy('');
  };
  const pdf = async () => {
    setBusy('pdf');
    await conGenerando({ texto: 'Preparando PDF…', informe: meta.titulo, cancelable: true }, async signal => {
      const r = await completo(signal);
      await runPrint('inf-' + meta.id, docInforme(r));
    });
    setBusy('');
  };
  const p = pb('inf-' + meta.id, 'Imprimir / PDF', 'ph ph-printer');

  const ciclos = (meta.id === 'cierre' ? cat?.ciclos.filter(c => c.estado === 'Cerrado') : cat?.ciclos) ?? [];
  const secciones = (cat?.secciones ?? []).filter(s => !f.grado || s.gradoId === f.grado);
  const hayFiltros = meta.filtros.filter(x => x !== 'ciclo').length > 0 || meta.id === 'cierre';

  return (
    <div className="flex flex-col gap-3.5 pb-8">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <button type="button" onClick={() => navigate(`/${grupo}`)} className="mb-1 inline-flex cursor-pointer items-center gap-1 border-0 bg-transparent p-0 text-xs text-accent hover:underline"><i className="ph ph-arrow-left" />Volver a los informes</button>
          <h1 className="m-0 text-xl font-semibold">{meta.titulo}</h1>
          <p className="m-0 mt-0.5 max-w-[760px] text-[13px] text-slate-600">{meta.descripcion}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" className={btn} onClick={() => void excel()} disabled={!data || !!busy}><i className={busy === 'xls' ? 'ph ph-circle-notch animate-spin' : 'ph ph-file-xls'} />Exportar Excel</button>
          <button type="button" className={btnPrimary} onClick={() => void pdf()} disabled={!data || !!busy || p.label === 'Generando…'}><i className={busy === 'pdf' ? 'ph ph-circle-notch animate-spin' : p.icon} style={{ animation: p.spin }} />{busy === 'pdf' ? 'Preparando…' : p.label}</button>
        </div>
      </div>

      <form onSubmit={e => { e.preventDefault(); aplicar(); }} className={`${card} flex flex-wrap items-end gap-3 px-4 py-3`} aria-label="Filtros del informe">
        {sop('ciclo') && (
          <Campo label="Ciclo lectivo" ancho={140}>
            <select value={f.ciclo ?? ''} onChange={e => set('ciclo', e.target.value)} className={input}>
              {!ciclos.some(c => c.n === f.ciclo) && f.ciclo && <option value={f.ciclo}>{f.ciclo}</option>}
              {ciclos.map(c => <option key={c.n} value={c.n}>{c.n} · {c.estado}</option>)}
            </select>
          </Campo>
        )}
        {sop('desde') && <Campo label="Desde" ancho={140}><input type="date" value={f.desde ?? ''} onChange={e => set('desde', e.target.value)} className={input} /></Campo>}
        {sop('hasta') && <Campo label="Hasta" ancho={140}><input type="date" value={f.hasta ?? ''} onChange={e => set('hasta', e.target.value)} className={input} /></Campo>}
        {sop('grado') && (
          <Campo label="Grado" ancho={170}>
            <select value={f.grado ?? ''} onChange={e => set('grado', e.target.value)} className={input}><option value="">Todos</option>{(cat?.grados ?? []).map(g => <option key={g.id} value={g.id}>{g.nombre}</option>)}</select>
          </Campo>
        )}
        {sop('seccion') && (
          <Campo label="Sección" ancho={190}>
            <select value={f.seccion ?? ''} onChange={e => set('seccion', e.target.value)} className={input}><option value="">Todas</option>{secciones.map(s => <option key={s.id} value={s.id}>{s.nombre}</option>)}</select>
          </Campo>
        )}
        {sop('tutor') && <Campo label="Tutor (nombre o cédula)" ancho={200}><input value={f.tutor ?? ''} onChange={e => set('tutor', e.target.value)} placeholder="Buscar tutor…" className={input} /></Campo>}
        {sop('plan') && (
          <Campo label="Plan de pago" ancho={200}>
            <select value={f.plan ?? ''} onChange={e => set('plan', e.target.value)} className={input}><option value="">Todos</option>{(cat?.planes ?? []).map(x => <option key={x.id} value={x.id}>{x.nombre}</option>)}</select>
          </Campo>
        )}
        {sop('metodo') && (
          <Campo label="Método de pago" ancho={170}>
            <select value={f.metodo ?? ''} onChange={e => set('metodo', e.target.value)} className={input}><option value="">Todos</option>{(cat?.metodos ?? []).map(x => <option key={x.id} value={x.id}>{x.nombre}</option>)}</select>
          </Campo>
        )}
        {sop('cajero') && (
          <Campo label="Cajero" ancho={170}>
            <select value={f.cajero ?? ''} onChange={e => set('cajero', e.target.value)} className={input}><option value="">Todos</option>{(cat?.cajeros ?? []).map(x => <option key={x.id} value={x.id}>{x.nombre}</option>)}</select>
          </Campo>
        )}
        {sop('tipo') && (
          <Campo label="Tipo de nota" ancho={150}>
            <select value={f.tipo ?? ''} onChange={e => set('tipo', e.target.value)} className={input}><option value="">Crédito y débito</option><option value="CREDITO">Crédito</option><option value="DEBITO">Débito</option></select>
          </Campo>
        )}
        {sop('motivo') && (
          <Campo label="Motivo" ancho={220}>
            <select value={f.motivo ?? ''} onChange={e => set('motivo', e.target.value)} className={input}><option value="">Todos</option>{(cat?.motivos ?? []).map(x => <option key={x.id} value={x.id}>{x.nombre}</option>)}</select>
          </Campo>
        )}
        {sop('resultado') && (
          <Campo label="Resultado" ancho={170}>
            <select value={f.resultado ?? ''} onChange={e => set('resultado', e.target.value)} className={input}><option value="">Todos</option>{(cat?.resultados ?? []).map(x => <option key={x.id} value={x.id}>{x.nombre}</option>)}</select>
          </Campo>
        )}
        {sop('materia') && (
          <Campo label="Materia" ancho={200}>
            <select value={f.materia ?? ''} onChange={e => set('materia', e.target.value)} className={input}><option value="">Todas</option>{(cat?.materias ?? []).map(x => <option key={x.id} value={x.id}>{x.nombre}</option>)}</select>
          </Campo>
        )}
        {sop('periodo') && (
          <Campo label="Período" ancho={150}>
            <select value={f.periodo ?? ''} onChange={e => set('periodo', e.target.value)} className={input}><option value="">Final (todos)</option>{(cat?.periodos ?? []).map(x => <option key={x.orden} value={String(x.orden)}>{x.nombre || `Período ${x.orden}`}</option>)}</select>
          </Campo>
        )}
        {sop('disciplina') && (
          <Campo label="Disciplina / taller" ancho={200}>
            <select value={f.disciplina ?? ''} onChange={e => set('disciplina', e.target.value)} className={input}><option value="">Todas</option>{(cat?.disciplinas ?? []).map(x => <option key={x.id} value={x.id}>{x.nombre}</option>)}</select>
          </Campo>
        )}
        {sop('comprobante') && (
          <Campo label="Tipo de comprobante" ancho={230}>
            <select value={f.comprobante ?? ''} onChange={e => set('comprobante', e.target.value)} className={input}><option value="">Todos</option>{(cat?.comprobantes ?? []).map(x => <option key={x.id} value={x.id}>{x.nombre}</option>)}</select>
          </Campo>
        )}
        {sop('categoria') && (
          <Campo label="Categoría" ancho={220}>
            <select value={f.categoria ?? ''} onChange={e => set('categoria', e.target.value)} className={input}><option value="">Todas</option>{(meta.id === 'inventario-rotacion' ? cat?.categoriasProducto : cat?.categoriasCargo)?.map(x => <option key={x.id} value={x.id}>{x.nombre}</option>)}</select>
          </Campo>
        )}
        {sop('soloVencidos') && (
          <label className="flex h-9 items-center gap-2 text-[13px]"><input type="checkbox" checked={f.soloVencidos === '1'} onChange={e => set('soloVencidos', e.target.checked ? '1' : '')} className="h-4 w-4 accent-accent" />Solo vencidos</label>
        )}
        <div className="flex gap-2">
          <button type="submit" className={btnPrimary} disabled={cargando}><i className="ph ph-funnel" />Aplicar</button>
          {hayFiltros && <button type="button" className={btn} onClick={limpiar} disabled={cargando}>Limpiar</button>}
        </div>
      </form>

      {err && (
        <div role="alert" className="flex flex-wrap items-center justify-between gap-2 rounded-md bg-bad-bg px-3 py-2.5 text-[13px] text-[#B91C1C]">
          <span><i className="ph ph-warning-circle mr-1.5" />{err}</span>
          <button type="button" className={btn} onClick={() => void cargar(aplicado)}>Reintentar</button>
        </div>
      )}
      {cargando && !data && !err && <div className="rounded-lg border border-slate-200 bg-white px-4 py-8 text-center text-sm text-slate-500" role="status"><i className="ph ph-circle-notch animate-spin mr-2" />Calculando informe…</div>}

      {data && (
        <div className={`flex flex-col gap-3.5 ${cargando ? 'opacity-60' : ''}`} aria-busy={cargando}>
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-600">
            {data.filtros.map(x => <span key={x.etiqueta}><b className="font-semibold">{x.etiqueta}:</b> {x.valor}</span>)}
            <span>Generado el {data.generado}</span>
          </div>
          <div className="grid gap-2 [grid-template-columns:repeat(auto-fit,minmax(min(190px,100%),1fr))]">
            {data.resumen.map(r => (
              <div key={r.id} className="rounded-lg border border-slate-200 bg-white px-3 py-2.5">
                <div className="text-[11px] font-medium text-slate-500">{r.etiqueta}</div>
                <div className={`font-mono text-[15px] font-semibold ${r.tono ? TONO[r.tono] : 'text-ink'}`}>{valorResumen(r)}</div>
              </div>
            ))}
          </div>
          {data.tablas.map(t => <TablaInforme key={t.id} t={t} cargando={pagCarga === t.id} onPage={n => void paginar(t, n)} />)}
          {data.notas.length > 0 && (
            <div className="rounded-lg border border-slate-200 bg-slate-50 px-3.5 py-3 text-xs leading-relaxed text-slate-600">
              <div className="mb-1 font-semibold text-slate-700">Definiciones y notas</div>
              <ul className="m-0 flex list-disc flex-col gap-1 pl-4">{data.notas.map((n, i) => <li key={i}>{n}</li>)}</ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
