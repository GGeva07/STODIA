import { useCallback, useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import type { CierreInforme, CierreTablaId, InformeCierreFila, InformeMeta, InformeResp, InformeTabla } from '@stodia/shared';
import { btn, btnPrimary, card, input, pill, pillBase } from '../../components/system/styles';
import { useUi } from '../../components/system/UiProvider';
import { conGenerando } from '../../components/system/GenerandoModal';
import { fmt } from '../../components/finanzas/fin';
import { guardarBlob, runPrint, usePrintBusy } from '../../components/finanzas/print';
import { docInforme } from '../../components/finanzas/printInformes';
import { api, apiBlob } from '../../lib/api';
import { useCiclo } from '../../lib/ciclo';
import TablaInforme from './TablaInforme';

/**
 * Informe de cierre de año (inf-cierre › Cierre), ETAPA 2: cada cifra del resumen es un acordeón que muestra su desglose (tablas agregadas) y, debajo, «Ver detalle»
 * con el listado paginado y buscable de las líneas guardadas al cerrar (CierreCicloDetalle). Cada cifra lleva su insignia de cuadre (cifra guardada vs suma del detalle).
 * API: GET /informes/cierre/:ciclo[?tabla=...] y /export. Un cierre anterior a esta función muestra solo sus totales y deudores, con aviso (docs/informes-analisis.md §9).
 */
const TAM = 25;
const CATS: [string, string][] = [['colegiatura', 'Colegiatura'], ['inscripcion', 'Inscripción'], ['reinscripcion', 'Reinscripción'], ['materiales', 'Materiales'], ['servicio', 'Servicios'], ['articulo', 'Artículos'], ['mora', 'Mora'], ['otro', 'Otros']];

interface Filtros { q: string; categoria: string; estado: string; metodo: string }
const SIN: Filtros = { q: '', categoria: '', estado: '', metodo: '' };
interface ListadoDef { tabla: CierreTablaId; etiqueta: string; inicial: Partial<Filtros>; /** columna cuya suma debe igualar `cifra` */ col?: number; cifra?: number }
interface CardDef { id: string; etiqueta: string; valor: string; tono?: 'ok' | 'warn' | 'bad'; cuadre?: string[]; sub?: string; desgloses: string[]; listados: ListadoDef[] }

const TONO = { ok: 'text-[#15803D]', warn: 'text-[#B45309]', bad: 'text-[#DC2626]' };

function Insignia({ ids, inf }: { ids?: string[]; inf: CierreInforme }) {
  if (!ids?.length || !inf.detalle) return null;
  const cs = ids.map(i => inf.detalle!.cuadre[i]).filter(Boolean);
  const mal = cs.filter(c => !c.ok);
  if (!cs.length) return null;
  return mal.length === 0
    ? <span className={`${pillBase} ${pill.ok} !w-auto gap-1 px-2`} title="La suma de las líneas del detalle coincide con la cifra guardada al cerrar"><i className="ph ph-check-circle" />Cuadra</span>
    : <span className={`${pillBase} ${pill.bad} !w-auto gap-1 px-2`} title="Diferencia entre la suma del detalle y la cifra guardada"><i className="ph ph-warning" />Diferencia {mal.map(c => fmt(c.diferencia)).join(' · ')}</span>;
}

/** Listado paginado y buscable (una o varias pestañas) de la cifra desplegada. */
function Listado({ ciclo, defs, ver, metodos }: { ciclo: string; defs: ListadoDef[]; ver: CierreInforme; metodos: string[] }) {
  const [i, setI] = useState(0);
  const def = defs[i];
  const [f, setF] = useState<Filtros>({ ...SIN, ...def.inicial });
  const [qIn, setQIn] = useState('');
  const [page, setPage] = useState(1);
  const [t, setT] = useState<InformeTabla | null>(null);
  const [err, setErr] = useState('');
  const [cargando, setCargando] = useState(true);
  const seq = useRef(0);
  const cambiar = (n: number) => { setI(n); setF({ ...SIN, ...defs[n].inicial }); setQIn(''); setPage(1); setT(null); };
  useEffect(() => { const h = setTimeout(() => { setF(x => (x.q === qIn.trim() ? x : { ...x, q: qIn.trim() })); setPage(1); }, 350); return () => clearTimeout(h); }, [qIn]);
  const cargar = useCallback(async () => {
    const n = ++seq.current;
    setCargando(true); setErr('');
    const qs = new URLSearchParams({ tabla: def.tabla, page: String(page), size: String(TAM) });
    for (const [k, v] of Object.entries(f)) if (v) qs.set(k, v);
    const r = await conGenerando({ texto: 'Generando reporte…', informe: `Cierre ${ciclo} · ${def.etiqueta}`, cancelable: true }, signal => api.get<InformeTabla>(`/informes/cierre/${encodeURIComponent(ciclo)}?${qs}`, { signal }));
    if (n === seq.current) { if (r.ok) setT(r.valor); else setErr(r.cancelado ? 'Se canceló la carga del listado.' : (r.error ?? 'No se pudo cargar el listado')); setCargando(false); }
  }, [ciclo, def.tabla, def.etiqueta, f, page]);
  useEffect(() => { void cargar(); }, [cargar]);
  const set = (k: keyof Filtros, v: string) => { setF(x => ({ ...x, [k]: v })); setPage(1); };
  const sinFiltrar = !f.q && (['categoria', 'estado', 'metodo'] as const).every(k => f[k] === (def.inicial[k] ?? ''));
  const suma = t && def.col !== undefined && typeof t.totales?.[def.col] === 'number' ? (t.totales![def.col] as number) : null;
  const dif = suma !== null && def.cifra !== undefined ? Math.round((suma - def.cifra) * 100) / 100 : null;
  const tab = def.tabla;
  const sel = 'h-9 rounded-md border border-slate-300 bg-white px-2 text-[13px] text-ink outline-none focus:border-accent';
  return (
    <div className="flex flex-col gap-2.5">
      {defs.length > 1 && (
        <div className="flex flex-wrap gap-1.5" role="tablist" aria-label="Listados de la cifra">
          {defs.map((d, n) => <button key={d.tabla + d.etiqueta} role="tab" aria-selected={n === i} type="button" onClick={() => cambiar(n)} className={`${btn} ${n === i ? '!border-accent !bg-accent-soft !text-accent' : ''}`}>{d.etiqueta}</button>)}
        </div>
      )}
      <div className="flex flex-wrap items-end gap-2.5">
        <label className="flex min-w-[220px] flex-1 flex-col gap-1 text-[11px] font-medium text-slate-600">Buscar
          <span className="relative"><i className="ph ph-magnifying-glass absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" /><input value={qIn} onChange={e => setQIn(e.target.value)} placeholder="Alumno, tutor, recibo, NCF…" className={`${input} !pl-8`} aria-label="Buscar en el listado" /></span>
        </label>
        {(tab === 'cargos' || tab === 'notas' || tab === 'descuentos') && (
          <label className="flex flex-col gap-1 text-[11px] font-medium text-slate-600">{tab === 'notas' ? 'Tipo' : 'Categoría'}
            <select className={sel} value={f.categoria} onChange={e => set('categoria', e.target.value)}>
              <option value="">Todas</option>
              {tab === 'notas' ? <><option value="credito">Crédito</option><option value="debito">Débito</option></> : CATS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          </label>
        )}
        {(tab === 'recibos' || tab === 'ventas') && (
          <label className="flex flex-col gap-1 text-[11px] font-medium text-slate-600">Método
            <select className={sel} value={f.metodo} onChange={e => set('metodo', e.target.value)}><option value="">Todos</option>{metodos.map(m => <option key={m} value={m}>{m}</option>)}</select>
          </label>
        )}
        {tab === 'cargos' && (
          <label className="flex flex-col gap-1 text-[11px] font-medium text-slate-600">Estado
            <select className={sel} value={f.estado} onChange={e => set('estado', e.target.value)}><option value="">Todos</option><option value="SinPagar">Sin pagar</option><option value="Pagado">Pagado</option><option value="Pendiente">Pendiente (no vencido)</option><option value="Vencido">Vencido</option></select>
          </label>
        )}
        {(tab === 'recibos' || tab === 'notas') && (
          <label className="flex flex-col gap-1 text-[11px] font-medium text-slate-600">Estado
            <select className={sel} value={f.estado} onChange={e => set('estado', e.target.value)}><option value="">Todos</option><option value="Emitido">Emitido</option><option value="Anulado">Anulado</option></select>
          </label>
        )}
        {!sinFiltrar && <button type="button" className={btn} onClick={() => { setF({ ...SIN, ...def.inicial }); setQIn(''); setPage(1); }}>Quitar filtros</button>}
      </div>
      {err && <div role="alert" className="flex items-center justify-between gap-2 rounded-md bg-bad-bg px-3 py-2 text-xs text-[#B91C1C]"><span>{err}</span><button type="button" className={btn} onClick={() => void cargar()}>Reintentar</button></div>}
      {!t && !err && <div className="rounded-md border border-slate-200 px-4 py-6 text-center text-sm text-slate-500" role="status"><i className="ph ph-circle-notch animate-spin mr-2" />Cargando detalle…</div>}
      {t && <TablaInforme t={t} cargando={cargando} onPage={setPage} />}
      {t && suma !== null && (
        <div className={`flex flex-wrap items-center gap-2 rounded-md px-3 py-2 text-xs ${sinFiltrar && dif !== null ? (Math.abs(dif) < 0.01 ? 'bg-ok-bg text-ok-fg' : 'bg-bad-bg text-bad-fg') : 'bg-slate-50 text-slate-600'}`}>
          {sinFiltrar && dif !== null
            ? (Math.abs(dif) < 0.01
              ? <><i className="ph ph-check-circle" /><span>La suma del listado ({fmt(suma)}) cuadra con la cifra del cierre ({fmt(def.cifra!)}).</span></>
              : <><i className="ph ph-warning" /><span>La suma del listado ({fmt(suma)}) difiere de la cifra del cierre ({fmt(def.cifra!)}) en {fmt(dif)}.</span></>)
            : <><i className="ph ph-funnel" /><span>Total del conjunto filtrado: {fmt(suma)}{def.cifra !== undefined ? ` (cifra completa del cierre: ${fmt(def.cifra)})` : ''}.</span></>}
        </div>
      )}
      {ver.detalle && def.tabla === 'ventas' && <p className="m-0 text-xs text-slate-500">Las ventas rápidas no tienen ciclo: se listan las de las fechas del ciclo y no forman parte de ninguna cifra del cierre.</p>}
    </div>
  );
}

function tarjetas(r: CierreInforme): CardDef[] {
  const dd: ListadoDef = { tabla: 'deudores', etiqueta: 'Alumnos con deuda', inicial: {} };
  return [
    { id: 'facturado', etiqueta: 'Facturado (cargos del ciclo)', valor: fmt(r.facturado), cuadre: ['facturado', 'cargos'], sub: `${r.cargos.toLocaleString('en-US')} cargos`, desgloses: ['facturadoCategoria', 'facturadoMes'], listados: [{ tabla: 'cargos', etiqueta: 'Cargos facturados', inicial: {}, col: 6, cifra: r.facturado }] },
    { id: 'cobrado', etiqueta: 'Cobrado (recibos del ciclo)', valor: fmt(r.cobrado), tono: 'ok', cuadre: ['cobrado', 'recibos', 'anulados'], sub: `${r.recibos.toLocaleString('en-US')} recibos${r.recibosAnulados ? ` (+${r.recibosAnulados} anulados)` : ''}`, desgloses: ['cobradoMetodo', 'cobradoMes', 'recibosEstado'], listados: [{ tabla: 'recibos', etiqueta: 'Recibos', inicial: { estado: 'Emitido' }, col: 7, cifra: r.cobrado }] },
    { id: 'nc', etiqueta: 'Notas de crédito', valor: fmt(r.notasCredito), cuadre: ['nc'], desgloses: ['notasMotivo'], listados: [{ tabla: 'notas', etiqueta: 'Notas de crédito', inicial: { categoria: 'credito', estado: 'Emitido' } }] },
    { id: 'nd', etiqueta: 'Notas de débito', valor: fmt(r.notasDebito), cuadre: ['nd'], desgloses: ['notasMotivo'], listados: [{ tabla: 'notas', etiqueta: 'Notas de débito', inicial: { categoria: 'debito', estado: 'Emitido' } }] },
    { id: 'neto', etiqueta: 'Cobrado neto', valor: fmt(r.cobradoNeto), tono: 'ok', cuadre: ['neto'], sub: 'cobrado − notas de crédito sobre recibos del ciclo', desgloses: ['netoMetodo', 'devolucionesMetodo'], listados: [{ tabla: 'notas', etiqueta: 'Notas de crédito', inicial: { categoria: 'credito', estado: 'Emitido' } }] },
    { id: 'desc', etiqueta: 'Descuentos aplicados', valor: fmt(r.descuentos), cuadre: ['desc'], desgloses: ['descuentosMotivo', 'descuentosCategoria'], listados: [{ tabla: 'descuentos', etiqueta: 'Líneas con descuento', inicial: {}, col: 9, cifra: r.descuentos }] },
    { id: 'pend', etiqueta: 'Pendiente por cobrar', valor: fmt(r.pendiente), tono: 'warn', cuadre: ['pend'], sub: `${r.cargosPendientes.toLocaleString('en-US')} cargos sin pagar · ${r.alumnosConDeuda.toLocaleString('en-US')} alumnos`, desgloses: ['pendienteAntiguedad', 'pendienteCategoria'], listados: [{ tabla: 'cargos', etiqueta: 'Cargos sin pagar', inicial: { estado: 'SinPagar' }, col: 8, cifra: r.pendiente }, { ...dd, col: 4, cifra: r.pendiente }] },
    { id: 'venc', etiqueta: 'De ello vencido', valor: fmt(r.vencido), tono: 'bad', cuadre: ['venc'], sub: 'a la fecha del cierre', desgloses: ['vencidoAntiguedad'], listados: [{ tabla: 'cargos', etiqueta: 'Cargos vencidos', inicial: { estado: 'Vencido' }, col: 8, cifra: r.vencido }, { ...dd, col: 5, cifra: r.vencido }] },
    { id: 'mora', etiqueta: 'Recargos por mora', valor: fmt(r.mora), cuadre: ['mora', 'morap'], sub: `${fmt(r.moraPendiente)} pendiente`, desgloses: ['moraMes'], listados: [{ tabla: 'cargos', etiqueta: 'Cargos de mora', inicial: { categoria: 'mora' }, col: 6, cifra: r.mora }] },
    { id: 'cant', etiqueta: 'Cantidades', valor: `${r.recibos.toLocaleString('en-US')} recibos · ${r.cargos.toLocaleString('en-US')} cargos`, cuadre: ['recibos', 'anulados', 'cargos', 'deudores'], sub: `${r.alumnosConDeuda.toLocaleString('en-US')} alumnos con deuda · ${r.matriculas.toLocaleString('en-US')} matrículas`, desgloses: ['cantidades'], listados: [{ tabla: 'recibos', etiqueta: 'Recibos', inicial: {} }, { tabla: 'cargos', etiqueta: 'Cargos', inicial: {} }, dd] },
    { id: 'ventas', etiqueta: 'Ventas rápidas del período (no suman a las cifras del cierre)', valor: fmt(Number(r.detalle?.desgloses.ventasMetodo?.totales?.[2] ?? 0)), desgloses: ['ventasMetodo'], listados: [{ tabla: 'ventas', etiqueta: 'Ventas rápidas', inicial: {} }] },
  ];
}

/** Tabla de deudores calculada en el cliente (cierres sin detalle: solo existe el JSON de deuda por alumno). */
function DeudoresGuardados({ r }: { r: CierreInforme }) {
  const [q, setQ] = useState(''), [page, setPage] = useState(1);
  const ql = q.trim().toLowerCase();
  const l = ql ? r.deudaAlumnos.filter(d => `${d.code} ${d.nombre} ${d.seccion}`.toLowerCase().includes(ql)) : r.deudaAlumnos;
  const t: InformeTabla = {
    id: 'deudores', titulo: 'Deuda por alumno al cierre', paginable: true, vacio: 'Ningún alumno tenía deuda al cerrar el ciclo.',
    columnas: [{ id: 'cod', titulo: 'Código', tipo: 'texto' }, { id: 'al', titulo: 'Alumno', tipo: 'texto' }, { id: 'sec', titulo: 'Grado / sección', tipo: 'texto' }, { id: 'car', titulo: 'Cargos', tipo: 'entero' }, { id: 'pen', titulo: 'Pendiente', tipo: 'moneda' }, { id: 'ven', titulo: 'Vencido', tipo: 'moneda' }],
    filas: l.slice((page - 1) * TAM, page * TAM).map(d => [d.code, d.nombre, d.seccion, d.cargos, d.pendiente, d.vencido]), total: l.length, page, size: TAM,
    totales: ['', 'TOTAL', '', l.reduce((a, d) => a + d.cargos, 0), Math.round(l.reduce((a, d) => a + d.pendiente, 0) * 100) / 100, Math.round(l.reduce((a, d) => a + d.vencido, 0) * 100) / 100],
  };
  return (
    <div className="flex flex-col gap-2.5">
      <label className="flex max-w-sm flex-col gap-1 text-[11px] font-medium text-slate-600">Buscar deudor<input value={q} onChange={e => { setQ(e.target.value); setPage(1); }} placeholder="Alumno, código o sección…" className={input} /></label>
      <TablaInforme t={t} onPage={setPage} />
    </div>
  );
}

export default function CierreInformeView({ meta, grupo }: { meta: InformeMeta; grupo: string }) {
  const { toast } = useUi();
  const navigate = useNavigate();
  const loc = useLocation();
  const { cicloSeleccionado } = useCiclo();
  const urlCiclo = new URLSearchParams(loc.search).get('ciclo') ?? '';
  const [cierres, setCierres] = useState<InformeCierreFila[] | null>(null);
  const [ciclo, setCiclo] = useState(urlCiclo);
  const [inf, setInf] = useState<CierreInforme | null>(null);
  const [err, setErr] = useState('');
  const [abiertas, setAbiertas] = useState<Set<string>>(new Set());
  const [verDetalle, setVerDetalle] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState<'' | 'xls' | 'pdf'>('');
  const pb = usePrintBusy();

  useEffect(() => {
    api.get<InformeCierreFila[]>('/informes/cierres').then(l => {
      setCierres(l);
      if (!urlCiclo) setCiclo(l.find(c => c.ciclo === cicloSeleccionado)?.ciclo ?? l[0]?.ciclo ?? '');
    }).catch(e => setErr((e as Error).message));
  }, [urlCiclo, cicloSeleccionado]);
  useEffect(() => {
    if (!ciclo) return;
    let vivo = true;
    setInf(null); setErr(''); setAbiertas(new Set()); setVerDetalle(new Set());
    void conGenerando({ texto: 'Generando reporte…', informe: `Resumen del cierre ${ciclo}`, cancelable: true }, signal => api.get<CierreInforme>(`/informes/cierre/${encodeURIComponent(ciclo)}`, { signal })).then(r => { if (!vivo) return; if (r.ok) setInf(r.valor); else setErr(r.cancelado ? 'Se canceló la carga del resumen.' : (r.error ?? 'No se pudo cargar el resumen')); });
    return () => { vivo = false; };
  }, [ciclo]);

  const alt = (s: Set<string>, id: string) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; };
  const excel = async () => {
    setBusy('xls');
    const res = await conGenerando({ texto: 'Exportando a Excel…', informe: `Resumen del cierre ${ciclo}`, cancelable: true }, async signal => {
      guardarBlob(await apiBlob(`/informes/cierre/${encodeURIComponent(ciclo)}/export`, { signal }), `informe_cierre_${ciclo.replace(/[^0-9A-Za-z]+/g, '-')}_${new Date().toISOString().slice(0, 10)}.xlsx`);
    });
    if (res.ok) toast('Excel del cierre generado', 'ok');
    setBusy('');
  };
  const pdf = async () => {
    if (!inf) return;
    setBusy('pdf');
    await conGenerando({ texto: 'Preparando PDF…', informe: `Resumen del cierre ${ciclo}`, cancelable: true }, async signal => {
      const tablas: InformeTabla[] = [];
      const notas: string[] = [];
      if (inf.detalle) {
        tablas.push(...Object.values(inf.detalle.desgloses));
        for (const tb of ['cargos', 'recibos', 'notas', 'descuentos', 'ventas', 'deudores'] as CierreTablaId[]) {
          const t = await api.get<InformeTabla>(`/informes/cierre/${encodeURIComponent(ciclo)}?tabla=${tb}&size=50&orden=monto`, { signal });
          tablas.push({ ...t, titulo: `${t.titulo} · ${t.total > 50 ? '50 mayores de ' + t.total.toLocaleString('en-US') : t.total + ' ' + (t.total === 1 ? 'fila' : 'filas')}` });
          if (t.total > 50) notas.push(`${t.titulo}: se imprimen las 50 líneas de mayor monto de ${t.total.toLocaleString('en-US')}; el listado completo está en la exportación a Excel.`);
        }
        notas.push(...inf.detalle.notas);
      } else {
        if (inf.aviso) notas.push(inf.aviso);
        const l = inf.deudaAlumnos;
        tablas.push({
          id: 'deudores', titulo: `Deuda por alumno al cierre · ${l.length > 50 ? '50 mayores de ' + l.length.toLocaleString('en-US') : l.length + ' alumnos'}`, total: Math.min(50, l.length), page: 1, size: 50,
          columnas: [{ id: 'cod', titulo: 'Código', tipo: 'texto' }, { id: 'al', titulo: 'Alumno', tipo: 'texto' }, { id: 'sec', titulo: 'Grado / sección', tipo: 'texto' }, { id: 'car', titulo: 'Cargos', tipo: 'entero' }, { id: 'pen', titulo: 'Pendiente', tipo: 'moneda' }, { id: 'ven', titulo: 'Vencido', tipo: 'moneda' }],
          filas: l.slice(0, 50).map(d => [d.code, d.nombre, d.seccion, d.cargos, d.pendiente, d.vencido]),
        });
      }
      const resp: InformeResp = {
        id: 'cierre', titulo: `Cierre del año escolar ${inf.ciclo}`, grupo: 'inf-cierre', ciclo: inf.ciclo, generado: new Date().toLocaleDateString('es-DO'),
        filtros: [{ etiqueta: 'Ciclo', valor: inf.ciclo }, ...(inf.cerrado ? [{ etiqueta: 'Cerrado el', valor: `${new Date(inf.cerrado.fecha).toLocaleDateString('es-DO')} por ${inf.cerrado.usuarioNombre || inf.cerrado.usuario}` }] : [])],
        resumen: tarjetas(inf).filter(c => c.id !== 'ventas').map(c => ({ id: c.id, etiqueta: c.etiqueta, valor: c.valor, tipo: 'texto' as const })),
        tablas, notas,
      };
      await runPrint('inf-cierre', docInforme(resp));
    });
    setBusy('');
  };
  const p = pb('inf-cierre', 'Imprimir / PDF', 'ph ph-printer');
  const metodos = (inf?.detalle?.desgloses.cobradoMetodo?.filas ?? []).map(f => String(f[0]));
  const metodosVentas = (inf?.detalle?.desgloses.ventasMetodo?.filas ?? []).map(f => String(f[0]));

  return (
    <div className="flex flex-col gap-3.5 pb-8">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <button type="button" onClick={() => navigate(`/${grupo}`)} className="mb-1 inline-flex cursor-pointer items-center gap-1 border-0 bg-transparent p-0 text-xs text-accent hover:underline"><i className="ph ph-arrow-left" />Volver a los informes</button>
          <h1 className="m-0 text-xl font-semibold">{meta.titulo}</h1>
          <p className="m-0 mt-0.5 max-w-[760px] text-[13px] text-slate-600">Cada cifra se despliega para ver de dónde sale: desglose por concepto, mes, método y antigüedad, y el listado línea por línea guardado al cerrar el año.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" className={btn} onClick={() => void excel()} disabled={!inf || !!busy}><i className={busy === 'xls' ? 'ph ph-circle-notch animate-spin' : 'ph ph-file-xls'} />Exportar Excel</button>
          <button type="button" className={btnPrimary} onClick={() => void pdf()} disabled={!inf || !!busy || p.label === 'Generando…'}><i className={busy === 'pdf' ? 'ph ph-circle-notch animate-spin' : p.icon} style={{ animation: p.spin }} />{busy === 'pdf' ? 'Preparando…' : p.label}</button>
        </div>
      </div>

      <div className={`${card} flex flex-wrap items-end gap-3 px-4 py-3`}>
        <label className="flex min-w-[160px] flex-col gap-1 text-[11px] font-medium text-slate-600">Año escolar cerrado
          <select value={ciclo} onChange={e => navigate(`/${grupo}/${meta.id}?ciclo=${encodeURIComponent(e.target.value)}`)} className={input} disabled={!cierres}>
            {!cierres?.some(c => c.ciclo === ciclo) && ciclo && <option value={ciclo}>{ciclo}</option>}
            {(cierres ?? []).map(c => <option key={c.ciclo} value={c.ciclo}>{c.ciclo}</option>)}
          </select>
        </label>
        {inf?.cerrado && <span className="pb-2 text-xs text-slate-600">Cerrado el {new Date(inf.cerrado.fecha).toLocaleString('es-DO')} por {inf.cerrado.usuarioNombre || inf.cerrado.usuario}{inf.detalle ? ` · a la fecha del cierre (${inf.detalle.fechaCierre}) se calcula lo vencido` : ''}</span>}
      </div>

      {err && <div role="alert" className="rounded-md bg-bad-bg px-3 py-2.5 text-[13px] text-[#B91C1C]"><i className="ph ph-warning-circle mr-1.5" />{err}</div>}
      {!inf && !err && <div className="rounded-lg border border-slate-200 bg-white px-4 py-8 text-center text-sm text-slate-500" role="status"><i className="ph ph-circle-notch animate-spin mr-2" />Cargando el cierre…</div>}

      {inf && !inf.detalleDisponible && (
        <div role="status" className="flex items-start gap-2 rounded-md bg-warn-bg px-3.5 py-3 text-[13px] text-[#92400E]"><i className="ph ph-info mt-0.5" /><span><b>Sin detalle (cierre anterior a esta función).</b> Este cierre solo conserva sus totales y la deuda por alumno al cerrar; el desglose línea por línea se guarda desde los cierres nuevos.</span></div>
      )}

      {inf && (
        <div className="flex flex-col gap-2.5">
          {tarjetas(inf).filter(c => inf.detalleDisponible || c.id !== 'ventas').map(c => {
            const abierta = abiertas.has(c.id), conDetalle = inf.detalleDisponible;
            return (
              <section key={c.id} className={`${card} overflow-hidden`} aria-label={c.etiqueta}>
                <button type="button" onClick={() => conDetalle && setAbiertas(s => alt(s, c.id))} aria-expanded={conDetalle ? abierta : undefined} aria-controls={`panel-${c.id}`} disabled={!conDetalle}
                  className={`flex w-full flex-wrap items-center gap-x-3 gap-y-1 border-0 bg-transparent px-4 py-3 text-left ${conDetalle ? 'cursor-pointer hover:bg-slate-50' : 'cursor-default'}`}>
                  {conDetalle && <i className={`ph ${abierta ? 'ph-caret-down' : 'ph-caret-right'} text-slate-500`} />}
                  <span className="min-w-[200px] flex-1">
                    <span className="block text-[13px] font-semibold text-ink">{c.etiqueta}</span>
                    {c.sub && <span className="block text-[11px] text-slate-500">{c.sub}</span>}
                  </span>
                  <span className={`font-mono text-[15px] font-semibold ${c.tono ? TONO[c.tono] : 'text-ink'}`}>{c.valor}</span>
                  {conDetalle && (c.cuadre ? <Insignia ids={c.cuadre} inf={inf} /> : <span className={`${pillBase} ${pill.mute} !w-auto px-2`}>No suma a los totales</span>)}
                </button>
                {abierta && conDetalle && inf.detalle && (
                  <div id={`panel-${c.id}`} className="flex flex-col gap-3 border-t border-slate-200 bg-slate-50/50 px-4 py-3.5">
                    <div className="grid gap-3 [grid-template-columns:repeat(auto-fit,minmax(min(440px,100%),1fr))]">
                      {c.desgloses.map(id => inf.detalle!.desgloses[id] && <TablaInforme key={id} t={inf.detalle!.desgloses[id]} onPage={() => undefined} />)}
                    </div>
                    {c.cuadre && inf.detalle && (
                      <ul className="m-0 flex list-none flex-wrap gap-x-5 gap-y-1 p-0 text-xs text-slate-600">
                        {c.cuadre.map(i => inf.detalle!.cuadre[i]).filter(Boolean).map(q => (
                          <li key={q.id} className={q.ok ? '' : 'font-semibold text-[#B91C1C]'}>{q.etiqueta}: cifra {q.id === 'recibos' || q.id === 'anulados' || q.id === 'cargos' || q.id === 'deudores' ? q.cifra.toLocaleString('en-US') : fmt(q.cifra)} · detalle {q.id === 'recibos' || q.id === 'anulados' || q.id === 'cargos' || q.id === 'deudores' ? q.detalle.toLocaleString('en-US') : fmt(q.detalle)} · {q.ok ? 'cuadra' : `diferencia ${fmt(q.diferencia)}`}</li>
                        ))}
                      </ul>
                    )}
                    <div>
                      <button type="button" className={btn} onClick={() => setVerDetalle(s => alt(s, c.id))} aria-expanded={verDetalle.has(c.id)}><i className={`ph ${verDetalle.has(c.id) ? 'ph-eye-slash' : 'ph-list-magnifying-glass'}`} />{verDetalle.has(c.id) ? 'Ocultar detalle' : 'Ver detalle'}</button>
                    </div>
                    {verDetalle.has(c.id) && <Listado ciclo={ciclo} defs={c.listados} ver={inf} metodos={c.id === 'ventas' ? metodosVentas : metodos} />}
                  </div>
                )}
              </section>
            );
          })}
        </div>
      )}

      {inf && !inf.detalleDisponible && <DeudoresGuardados r={inf} />}

      {inf && (
        <div className="rounded-lg border border-slate-200 bg-slate-50 px-3.5 py-3 text-xs leading-relaxed text-slate-600">
          <div className="mb-1 font-semibold text-slate-700">Definiciones y notas</div>
          <ul className="m-0 flex list-disc flex-col gap-1 pl-4">
            <li>{inf.cerrado ? 'Foto contable guardada al cerrar el año escolar (solo lectura): los importes no cambian aunque después se cobre la deuda.' : 'Ciclo cerrado antes de existir el registro de cierres: los totales se calculan ahora con los datos del ciclo (solo lectura).'}</li>
            <li>Definiciones: facturado = cobrado de cargos del ciclo + pendiente; cobrado = recibos vigentes emitidos en el ciclo; cobrado neto = cobrado − notas de crédito sobre esos recibos. La deuda pendiente sigue cobrable desde el ciclo activo.</li>
            {(inf.detalle?.notas ?? []).map((n, i) => <li key={i}>{n}</li>)}
          </ul>
        </div>
      )}
    </div>
  );
}
