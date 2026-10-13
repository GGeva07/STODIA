import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { CobroMetodo, MotivoNotaDto, NotaBuscarFila, NotaDisponible, NotaFiscalDto } from '@stodia/shared';
import { api } from '../../lib/api';
import { errMsg, fmt } from '../../components/finanzas/fin';
import SupervisorGuardModal from '../../components/finanzas/SupervisorGuardModal';
import type { ToastTone } from '../../components/useToastStack';
import { AvisoBorrador, useDraft } from '../../lib/useDraft';

export type Intencion = 'anular' | 'parcial' | 'debito';
export interface NotaInicial { tipo: 'recibo' | 'venta'; id: string; intencion: Intencion }
interface Sel { on: boolean; monto: string; cant: string; reabrir: boolean }
interface Reemb { metodo: string; monto: string; ref: string }
interface Cargo { concepto: string; monto: string; vence: string }

const r2 = (n: number) => Math.round(n * 100) / 100;
const num = (s: string) => { const v = parseFloat(String(s).replace(/,/g, '')); return Number.isFinite(v) ? v : 0; };
const hoyDMY = () => { const d = new Date(); return String(d.getDate()).padStart(2, '0') + '/' + String(d.getMonth() + 1).padStart(2, '0') + '/' + d.getFullYear(); };
const uuid = () => (typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : 'k' + Math.random().toString(36).slice(2) + Date.now().toString(36));
const inp = 'h-8 rounded-md border border-slate-300 bg-white px-2 text-xs outline-none focus:border-accent focus:ring-1 focus:ring-accent';

const TARJETAS: { k: Intencion; icon: string; t: string; d: string }[] = [
  { k: 'anular', icon: 'ph-arrow-u-down-left', t: 'Devolver dinero o anular un cobro', d: 'Nota de crédito: se devuelve lo cobrado, los cargos vuelven a la deuda si hace falta y se repone el inventario.' },
  { k: 'parcial', icon: 'ph-scissors', t: 'Corregir un cobro a la baja', d: 'Nota de crédito parcial: se devuelve solo una parte (un descuento olvidado, un error de monto, un producto).' },
  { k: 'debito', icon: 'ph-plus-circle', t: 'Cobrar un monto adicional', d: 'Nota de débito: intereses por mora, recargos o gastos adicionales; se crea un cargo nuevo que se cobra en Cobros.' },
];

/** Asistente de 3 pasos «Nueva nota» (credito parcial/total y debito). El PIN de supervisor se pide SIEMPRE al emitir (token de un solo uso). */
export default function NuevaNota({ inicial, toast, onEmitida }: { inicial?: NotaInicial; toast: (m: string, t?: ToastTone) => void; onEmitida: (n: NotaFiscalDto) => void }) {
  const nav = useNavigate();
  // Borrador de la nota en edición (por recibo de origen, o «libre»). Se descarta al emitir la nota; el PIN de supervisor se pide siempre al emitir y nunca se guarda.
  const dk = 'nota:' + (inicial ? inicial.id : 'libre') + ':';
  const [step, setStep, limStep, metaStep] = useDraft<1 | 2 | 3>(dk + 'step', 1);
  const [intencion, setIntencion, limInt] = useDraft<Intencion | null>(dk + 'intencion', inicial?.intencion ?? null);
  const [q, setQ, limQ] = useDraft(dk + 'q', ''); // solo el texto buscado
  const [res, setRes] = useState<NotaBuscarFila[]>([]), [buscando, setBuscando] = useState(false);
  const [ref, setRef, limRef, metaRef] = useDraft<{ tipo: 'recibo' | 'venta'; id: string } | null>(dk + 'ref', inicial ? { tipo: inicial.tipo, id: inicial.id } : null);
  const [doc, setDoc] = useState<NotaDisponible | null>(null), [cargando, setCargando] = useState(false);
  const [sel, setSel, limSel] = useDraft<Record<number, Sel>>(dk + 'sel', {});
  const [cargos, setCargos, limCar] = useDraft<Cargo[]>(dk + 'cargos', [{ concepto: '', monto: '', vence: hoyDMY() }]);
  const [alumnoId, setAlumnoId, limAlu] = useDraft(dk + 'alumno', '');
  const restaurando = useRef(Object.keys(sel).length > 0 || !!alumnoId); // con selección restaurada, la primera carga del documento no la pisa
  const [motivos, setMotivos] = useState<MotivoNotaDto[]>([]), [metodos, setMetodos] = useState<CobroMetodo[]>([]);
  const [motivo, setMotivo, limMot] = useDraft(dk + 'motivo', ''), [texto, setTexto, limTxt] = useDraft(dk + 'texto', ''), [motivoManual, setMotivoManual, limMan] = useDraft(dk + 'motivoManual', false);
  const [reemb, setReemb, limReem] = useDraft<Reemb[]>(dk + 'reemb', []), [reembEdit, setReembEdit, limRE] = useDraft(dk + 'reembEdit', false);
  const [cliente, setCliente, limCli] = useDraft(dk + 'cliente', { nombre: '', rnc: '' });
  const descartar = () => { [limStep, limInt, limQ, limRef, limSel, limCar, limAlu, limMot, limTxt, limMan, limReem, limRE, limCli].forEach(f => f()); };
  const [guard, setGuard] = useState(false), [busy, setBusy] = useState(false), [err, setErr] = useState('');
  const key = useRef(uuid());
  const seq = useRef(0);

  useEffect(() => { void Promise.all([api.get<MotivoNotaDto[]>('/cobros/notas/motivos'), api.get<CobroMetodo[]>('/cobros/metodos')]).then(([m, mt]) => { setMotivos(m); setMetodos(mt); }).catch(e => setErr(errMsg(e))); }, []);

  // búsqueda de comprobante (recibo REC-, venta VTA-, NCF, nombre o cédula)
  useEffect(() => {
    const t = q.trim();
    if (t.length < 2) { setRes([]); return; }
    const my = ++seq.current;
    const h = setTimeout(async () => {
      setBuscando(true);
      try { const r = await api.get<NotaBuscarFila[]>('/cobros/notas/documentos?q=' + encodeURIComponent(t)); if (my === seq.current) setRes(r); } catch (e) { if (my === seq.current) setErr(errMsg(e)); } finally { if (my === seq.current) setBuscando(false); }
    }, 300);
    return () => clearTimeout(h);
  }, [q]);

  const cargarDoc = useCallback(async (r: { tipo: 'recibo' | 'venta'; id: string }) => {
    setCargando(true); setErr('');
    try { setDoc(await api.get<NotaDisponible>(`/cobros/${r.tipo === 'recibo' ? 'recibos' : 'ventas'}/${encodeURIComponent(r.id)}/notas-disponible`)); } catch (e) { restaurando.current = false; setErr(errMsg(e)); setDoc(null); } finally { setCargando(false); }
  }, []);
  useEffect(() => { if (ref) void cargarDoc(ref); else setDoc(null); }, [ref, cargarDoc]);

  // selección inicial de líneas según la intención
  useEffect(() => {
    if (!doc) return;
    if (restaurando.current) { restaurando.current = false; return; }
    const s: Record<number, Sel> = {};
    for (const l of doc.lineas) {
      const venta = doc.documento.tipo === 'venta', full = l.restante > 0.004 && (!venta || (l.cantidadRestante ?? 0) > 0);
      s[l.id] = { on: intencion === 'anular' && full, monto: String(l.restante), cant: String(l.cantidadRestante ?? 0), reabrir: !venta && l.reabrible && intencion === 'anular' };
    }
    setSel(s); setReembEdit(false);
    setAlumnoId(doc.alumnosDebito[0]?.id ?? '');
    setMotivo(''); setTexto(''); setMotivoManual(false);
  }, [doc, intencion]);

  const venta = doc?.documento.tipo === 'venta';
  const credito = intencion !== 'debito';
  // ---- cálculo del crédito ----
  const lineasSel = useMemo(() => (doc?.lineas ?? []).filter(l => sel[l.id]?.on).map(l => {
    const s = sel[l.id];
    const cant = venta ? Math.min(Math.max(0, Math.floor(num(s.cant))), l.cantidadRestante ?? 0) : 0;
    const monto = venta ? (cant === (l.cantidadRestante ?? 0) ? l.restante : r2((l.precioUnit ?? 0) * cant)) : Math.min(r2(num(s.monto)), l.restante);
    const completa = Math.abs(monto - l.restante) < 0.006;
    return { l, s, cant, monto, completa, reabre: !venta && s.reabrir && completa && l.reabrible };
  }), [doc, sel, venta]);
  const totalCredito = r2(lineasSel.reduce((a, x) => a + x.monto, 0));
  const reabiertos = lineasSel.filter(x => x.reabre), montoReab = r2(reabiertos.reduce((a, x) => a + x.l.monto, 0));
  const unidades = lineasSel.filter(x => venta && x.l.inventario).reduce((a, x) => a + x.cant, 0);
  const totalDebito = r2(cargos.reduce((a, c) => a + Math.max(0, num(c.monto)), 0));
  const monto = credito ? totalCredito : totalDebito;
  const anulacionTotal = !!doc && !venta && doc.acreditado < 0.005 && doc.lineas.length > 0 && doc.lineas.every(l => sel[l.id]?.on && Math.abs(Math.min(num(sel[l.id].monto), l.restante) - l.restante) < 0.006);

  // reembolso sugerido: mismos medios del cobro, proporcional
  useEffect(() => {
    if (!credito || reembEdit || !doc) return;
    if (totalCredito <= 0) { setReemb([]); return; }
    const medios = doc.mediosCobro.length ? doc.mediosCobro : [{ metodo: 'Efectivo', monto: 1 }];
    const sum = medios.reduce((a, m) => a + m.monto, 0) || 1;
    let resto = totalCredito;
    setReemb(medios.map((m, i) => { const v = i === medios.length - 1 ? r2(resto) : r2((m.monto * totalCredito) / sum); resto = r2(resto - v); return { metodo: m.metodo, monto: String(v), ref: '' }; }).filter(r => num(r.monto) > 0));
  }, [credito, reembEdit, doc, totalCredito]);

  const motivosOk = motivos.filter(m => m.aplica === 'AMBAS' || m.aplica === (credito ? 'CREDITO' : 'DEBITO'));
  useEffect(() => {
    if (!doc) return;
    // sugerencia automatica hasta que la persona elige un motivo; «01» solo es posible si se acredita TODO el recibo
    if (motivoManual && !(motivo === '01' && !anulacionTotal)) return;
    if (!credito) setMotivo('OP05'); else if (anulacionTotal) setMotivo('01'); else if (venta) setMotivo('OP01'); else setMotivo('03');
  }, [doc, motivo, motivoManual, credito, anulacionTotal, venta]);

  const sumReemb = r2(reemb.reduce((a, r) => a + num(r.monto), 0));
  const faltaTexto = doc?.fueraDePlazo && credito && texto.trim().length < 10;
  const motivoTxtReq = motivo === '02' && texto.trim().length < 3;
  const refFalta = reemb.some(r => metodos.find(m => m.nombre === r.metodo)?.ref && !r.ref.trim());
  const clienteFalta = venta && doc?.requiereCliente && (!cliente.nombre.trim() || !cliente.rnc.trim());
  const puede = credito ? doc?.puedeCredito : doc?.puedeDebito;
  const paso2Ok = !!doc && !!puede && (credito ? totalCredito > 0 && lineasSel.every(x => x.monto > 0) : totalDebito > 0 && cargos.every(c => c.concepto.trim().length >= 3 && num(c.monto) > 0) && (!!alumnoId || doc.alumnosDebito.length === 0 ? true : false));
  const paso3Ok = !!motivo && !faltaTexto && !motivoTxtReq && (!credito || (Math.abs(sumReemb - totalCredito) < 0.006 && !refFalta && !clienteFalta));

  const resumen = (() => {
    if (!doc) return '';
    if (!credito) return `Qué pasará: se crea ${cargos.length === 1 ? 'un cargo nuevo' : cargos.length + ' cargos nuevos'} por ${fmt(totalDebito)} que aparecerá en Cobros como pendiente; al cobrarlo, su recibo referenciará esta nota de débito.`;
    const p: string[] = [];
    if (reabiertos.length) p.push(`se reabrirán ${reabiertos.length} cargo${reabiertos.length === 1 ? '' : 's'} (${fmt(montoReab)}) y volverán a la deuda del alumno`);
    if (unidades > 0) p.push(`se repondrán ${unidades} unidad${unidades === 1 ? '' : 'es'} al inventario`);
    const aj = lineasSel.filter(x => !x.reabre && !venta);
    if (aj.length) p.push(`se acreditarán ${fmt(r2(aj.reduce((a, x) => a + x.monto, 0)))} sin volver a cobrar${aj.length === 1 ? ' ese concepto' : ' esos conceptos'}`);
    p.push(`se devolverán ${fmt(totalCredito)}${reemb.length ? ' (' + reemb.map(r => `${fmt(num(r.monto))} en ${r.metodo.toLowerCase()}`).join(' + ') + ')' : ''}`);
    return 'Qué pasará: ' + p.join(', ') + '.';
  })();

  const emitir = async (pin: string) => {
    if (!doc || !ref) return;
    setBusy(true); setErr('');
    try {
      const comun = { motivo, motivoTexto: texto.trim(), pin, idempotencyKey: key.current };
      const nota = credito
        ? await api.post<NotaFiscalDto>('/cobros/notas/credito', {
          ...(ref.tipo === 'recibo' ? { reciboId: ref.id } : { ventaId: ref.id }), ...comun,
          lineas: lineasSel.map(x => venta ? { id: x.l.id, cantidad: x.cant } : { id: x.l.id, monto: x.monto, reabrir: x.reabre }),
          reembolsos: reemb.map(r => ({ metodo: r.metodo, monto: r2(num(r.monto)), referencia: r.ref.trim() })),
          ...(venta && doc.requiereCliente ? { clienteNombre: cliente.nombre.trim(), clienteRnc: cliente.rnc.trim() } : {}),
        })
        : await api.post<NotaFiscalDto>('/cobros/notas/debito', { reciboId: ref.id, ...comun, alumnoId, conceptos: cargos.map(c => ({ concepto: c.concepto.trim(), monto: r2(num(c.monto)), vence: c.vence.trim() })) });
      key.current = uuid();
      descartar();
      onEmitida(nota);
    } catch (e) { setBusy(false); throw e; }
    setBusy(false);
  };

  const sinSecuencia = err.includes('Configuración › Fiscal');
  const cmp = credito ? doc?.comprobanteCredito : doc?.comprobanteDebito;
  const stepBtn = (n: 1 | 2 | 3, t: string) => <li key={n} aria-current={step === n ? 'step' : undefined} className={`flex items-center gap-1.5 text-xs font-semibold ${step === n ? 'text-accent' : step > n ? 'text-ok-fg' : 'text-slate-400'}`}><span className={`grid h-5 w-5 place-items-center rounded-full text-[11px] ${step === n ? 'bg-accent text-white' : step > n ? 'bg-ok-bg text-ok-fg' : 'bg-slate-100'}`}>{step > n ? <i className="ph ph-check" /> : n}</span>{t}</li>;

  return (
    <div className="flex min-h-0 flex-1 flex-col" data-nueva-nota>
      <ol className="flex flex-wrap items-center gap-5 border-b border-slate-200 bg-slate-50 px-5 py-2.5">{stepBtn(1, '¿Qué quieres hacer?')}{stepBtn(2, intencion === 'debito' ? 'Qué se cobra' : 'Qué se acredita')}{stepBtn(3, 'Motivo y confirmación')}</ol>
      <div className="min-h-[320px] flex-1 overflow-auto px-5 py-4">
        <AvisoBorrador meta={{ ...metaStep, restaurado: metaStep.restaurado || metaRef.restaurado, descartar: () => { descartar(); setDoc(null); } }} className="mb-3 w-fit" />
        {err && <div role="alert" className="mb-3 flex items-start justify-between gap-3 rounded-md border border-red-200 bg-bad-bg px-3 py-2 text-[13px] text-bad-fg"><span><i className="ph ph-warning mr-1.5" />{err}</span>{sinSecuencia && <button onClick={() => nav('/config?tab=fiscal')} className="h-7 flex-none rounded border border-red-300 bg-white px-2.5 text-xs font-medium">Ir a Configuración › Fiscal</button>}</div>}

        {step === 1 && <>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-3" role="radiogroup" aria-label="Tipo de nota">
            {TARJETAS.map(t => (
              <button key={t.k} role="radio" aria-checked={intencion === t.k} onClick={() => { setIntencion(t.k); setErr(''); }} className={`flex flex-col gap-1.5 rounded-lg border p-3.5 text-left transition ${intencion === t.k ? 'border-accent bg-blue-50 ring-1 ring-accent' : 'border-slate-200 bg-white hover:border-slate-400'}`}>
                <i className={`ph ${t.icon} text-2xl ${intencion === t.k ? 'text-accent' : 'text-slate-500'}`} /><span className="text-[13px] font-semibold">{t.t}</span><span className="text-xs text-slate-600">{t.d}</span>
              </button>
            ))}
          </div>
          <div className="mt-4">
            <div className="mb-1.5 text-xs font-semibold text-slate-700">¿Sobre qué comprobante? Busca por recibo (REC-0001), venta (VTA-0001), NCF, nombre o cédula</div>
            <div className="relative"><i className="ph ph-magnifying-glass pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" /><input value={q} onChange={e => setQ(e.target.value)} placeholder="Buscar comprobante…" aria-label="Buscar comprobante" className={`${inp} w-full pl-8`} /></div>
            {buscando && <div className="mt-2 text-xs text-slate-500"><i className="ph ph-circle-notch mr-1" style={{ animation: 'spin 0.8s linear infinite' }} />Buscando…</div>}
            {!buscando && q.trim().length >= 2 && res.length === 0 && <div className="mt-2 text-xs text-slate-500">Ningún comprobante coincide con «{q.trim()}» en este ciclo.</div>}
            {res.length > 0 && (
              <ul className="mt-2 max-h-[170px] divide-y divide-slate-100 overflow-auto rounded-md border border-slate-200" role="listbox" aria-label="Comprobantes encontrados">
                {res.map(r => (
                  <li key={r.tipo + r.id}><button role="option" aria-selected={ref?.id === r.id} onClick={() => { setRef({ tipo: r.tipo, id: r.id }); setRes([]); setQ(''); }} className="grid w-full grid-cols-[110px_1fr_110px_120px] items-center gap-3 px-3 py-1.5 text-left text-xs hover:bg-slate-50">
                    <span className="font-mono font-semibold text-accent">{r.id}</span><span className="truncate">{r.tutor}<span className="ml-2 font-mono text-[10px] text-slate-400">{r.ncf}</span></span><span className="text-right font-mono">{fmt(r.monto)}</span><span className="text-right text-[10px] text-slate-500">{r.est === 'Anulado' ? 'Anulado' : r.acreditado > 0 ? 'Acreditado ' + fmt(r.acreditado) : r.fecha}</span></button></li>
                ))}
              </ul>
            )}
          </div>
          {cargando && <div className="mt-3 text-xs text-slate-500"><i className="ph ph-circle-notch mr-1" style={{ animation: 'spin 0.8s linear infinite' }} />Cargando comprobante…</div>}
          {doc && (
            <div className="mt-4 rounded-lg border border-slate-200 p-3 text-xs" data-doc-seleccionado>
              <div className="flex flex-wrap items-center justify-between gap-2"><div><span className="font-mono text-sm font-semibold">{doc.documento.id}</span><span className="ml-2 font-mono text-slate-500">{doc.documento.ncf}</span><span className="ml-2 text-slate-500">{doc.documento.fecha}</span></div><div className="text-slate-600">{doc.documento.tutor}{doc.documento.cedula ? ' · ' + doc.documento.cedula : ''}</div></div>
              <div className="mt-1.5 flex flex-wrap gap-4 text-slate-600"><span>Monto <b className="font-mono text-ink">{fmt(doc.documento.monto)}</b></span><span>Acreditado <b className="font-mono text-ink">{fmt(doc.acreditado)}</b></span><span>Disponible <b className="font-mono text-ink">{fmt(doc.disponible)}</b></span>{doc.documento.est === 'Anulado' && <b className="text-bad-fg">Anulado</b>}{doc.notas.length > 0 && <span>{doc.notas.length} nota(s) previas: {doc.notas.map(n => n.id).join(', ')}</span>}</div>
              {doc.fueraDePlazo && <div className="mt-1.5 text-warn-fg"><i className="ph ph-clock-countdown mr-1" />Pasaron {doc.diasTranscurridos} días (plazo {doc.plazoDias}): se exigirá el motivo por escrito.</div>}
              <div className="mt-2 divide-y divide-slate-100 rounded border border-slate-100">{doc.lineas.map(l => <div key={l.id} className="flex justify-between gap-3 px-2 py-1"><span>{l.concepto}{l.alumno && <span className="text-slate-400"> · {l.alumno}</span>}</span><span className="font-mono">{fmt(l.monto)}{l.acreditado > 0 && <span className="ml-1 text-[10px] text-slate-400">(acredit. {fmt(l.acreditado)})</span>}</span></div>)}</div>
              {intencion && !puede && <div className="mt-2 font-medium text-bad-fg"><i className="ph ph-prohibit mr-1" />{credito ? doc.motivoNoCredito : doc.motivoNoDebito}</div>}
              {intencion && puede && cmp && !cmp.disponible && <div className="mt-2 font-medium text-bad-fg"><i className="ph ph-warning mr-1" />{cmp.motivo}</div>}
            </div>
          )}
        </>}

        {step === 2 && doc && credito && <>
          <div className="mb-2 text-xs text-slate-600">{venta ? 'Marca los productos que se devuelven y cuántas unidades.' : 'Marca las líneas que se acreditan. Puedes acreditar una parte; para volver a cobrar un concepto debe acreditarse completo.'}</div>
          <div className="overflow-hidden rounded-lg border border-slate-200" role="table" aria-label="Líneas acreditables">
            <div role="row" className="grid grid-cols-[28px_minmax(0,1fr)_100px_150px_150px] gap-2 border-b border-slate-200 bg-slate-50 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-500"><span /><span>Concepto</span><span className="text-right">Disponible</span><span>{venta ? 'Unidades' : 'Monto a acreditar'}</span><span>{venta ? 'Inventario' : 'Cargo'}</span></div>
            {doc.lineas.map(l => {
              const s = sel[l.id]; if (!s) return null;
              const agotada = venta ? (l.cantidadRestante ?? 0) <= 0 : l.restante < 0.005;
              const x = lineasSel.find(y => y.l.id === l.id);
              return (
                <div key={l.id} role="row" className={`grid grid-cols-[28px_minmax(0,1fr)_100px_150px_150px] items-center gap-2 border-b border-slate-100 px-3 py-2 text-xs ${agotada ? 'opacity-50' : ''}`}>
                  <input type="checkbox" checked={s.on} disabled={agotada} aria-label={'Acreditar ' + l.concepto} onChange={e => setSel({ ...sel, [l.id]: { ...s, on: e.target.checked } })} />
                  <span className="min-w-0 truncate" title={l.concepto}>{l.concepto}{l.alumno && <span className="text-slate-400"> · {l.alumno}</span>}{agotada && <span className="ml-1 text-[10px] text-slate-500">(ya acreditada)</span>}</span>
                  <span className="text-right font-mono">{fmt(l.restante)}</span>
                  {venta
                    ? <input type="number" min={1} max={l.cantidadRestante} value={s.cant} disabled={!s.on} aria-label={'Unidades de ' + l.concepto} onChange={e => setSel({ ...sel, [l.id]: { ...s, cant: e.target.value } })} className={`${inp} w-20 text-right font-mono`} />
                    : <input inputMode="decimal" value={s.monto} disabled={!s.on} aria-label={'Monto de ' + l.concepto} onChange={e => setSel({ ...sel, [l.id]: { ...s, monto: e.target.value.replace(/[^\d.]/g, '') } })} className={`${inp} w-32 text-right font-mono ${s.on && num(s.monto) > l.restante + 0.005 ? 'border-red-400' : ''}`} />}
                  {venta ? <span className="text-slate-600">{l.inventario ? 'Se repone' : 'Sin inventario'}</span>
                    : l.reabrible ? <label className={`flex items-center gap-1.5 ${s.on && x?.completa ? '' : 'opacity-50'}`}><input type="checkbox" checked={s.reabrir && !!x?.completa} disabled={!s.on || !x?.completa} onChange={e => setSel({ ...sel, [l.id]: { ...s, reabrir: e.target.checked } })} />Volver a cobrar</label>
                      : <span className="text-slate-400">Sin cargo asociado</span>}
                </div>
              );
            })}
          </div>
          <div className="mt-3 flex items-center justify-between rounded-md bg-slate-50 px-3 py-2 text-[13px]"><span className="text-slate-600">Total de la nota de crédito</span><b className="font-mono text-base">{fmt(totalCredito)}</b></div>
          {totalCredito > 0 && <div className="mt-2 rounded-md bg-info-bg px-3 py-2 text-xs text-info-fg" data-resumen><i className="ph ph-info mr-1" />{resumen}</div>}
        </>}

        {step === 2 && doc && !credito && <>
          <div className="mb-2 text-xs text-slate-600">Una nota de débito solo <b>aumenta</b> lo que se debe. Cada concepto crea un cargo nuevo del ciclo activo que se cobra normalmente en Cobros.</div>
          {doc.alumnosDebito.length > 0 && <label className="mb-3 flex max-w-sm flex-col gap-1 text-xs font-medium text-slate-600">¿A qué alumno se le cobra?<select value={alumnoId} onChange={e => setAlumnoId(e.target.value)} className={inp}>{doc.alumnosDebito.map(a => <option key={a.id} value={a.id}>{a.nombre}</option>)}</select></label>}
          <div className="flex flex-col gap-2">
            {cargos.map((c, i) => (
              <div key={i} className="grid grid-cols-[minmax(0,1fr)_140px_130px_32px] items-end gap-2">
                <label className="flex flex-col gap-1 text-xs font-medium text-slate-600">Concepto<input value={c.concepto} placeholder="Ej.: Intereses por mora · septiembre" onChange={e => setCargos(cargos.map((x, k) => k === i ? { ...x, concepto: e.target.value } : x))} className={inp} /></label>
                <label className="flex flex-col gap-1 text-xs font-medium text-slate-600">Monto (RD$)<input inputMode="decimal" value={c.monto} onChange={e => setCargos(cargos.map((x, k) => k === i ? { ...x, monto: e.target.value.replace(/[^\d.]/g, '') } : x))} className={`${inp} text-right font-mono`} /></label>
                <label className="flex flex-col gap-1 text-xs font-medium text-slate-600">Vence (dd/mm/aaaa)<input value={c.vence} onChange={e => setCargos(cargos.map((x, k) => k === i ? { ...x, vence: e.target.value } : x))} className={`${inp} font-mono`} /></label>
                <button onClick={() => setCargos(cargos.filter((_, k) => k !== i))} disabled={cargos.length === 1} aria-label="Quitar concepto" className="h-8 rounded-md border border-slate-300 bg-white disabled:opacity-40"><i className="ph ph-trash" /></button>
              </div>
            ))}
          </div>
          {cargos.length < 10 && <button onClick={() => setCargos([...cargos, { concepto: '', monto: '', vence: hoyDMY() }])} className="mt-2 flex h-8 items-center gap-1.5 rounded-md border border-slate-300 bg-white px-3 text-xs font-medium"><i className="ph ph-plus" />Agregar concepto</button>}
          <div className="mt-3 flex items-center justify-between rounded-md bg-slate-50 px-3 py-2 text-[13px]"><span className="text-slate-600">Total de la nota de débito</span><b className="font-mono text-base">{fmt(totalDebito)}</b></div>
          {totalDebito > 0 && <div className="mt-2 rounded-md bg-info-bg px-3 py-2 text-xs text-info-fg" data-resumen><i className="ph ph-info mr-1" />{resumen}</div>}
        </>}

        {step === 3 && doc && <div className="flex flex-col gap-4">
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <label className="flex flex-col gap-1 text-xs font-medium text-slate-600">Motivo
              <select value={motivo} onChange={e => { setMotivo(e.target.value); setMotivoManual(true); }} className={inp} aria-label="Motivo de la nota"><option value="">Selecciona…</option>
                {motivosOk.map(m => <option key={m.id} value={m.codigo} disabled={m.codigo === '01' && !anulacionTotal}>{m.origen === 'DGII' ? m.codigo + ' · ' : ''}{m.nombre}{m.codigo === '01' && !anulacionTotal ? ' (solo si se acredita todo el recibo)' : ''}</option>)}</select></label>
            <label className="flex flex-col gap-1 text-xs font-medium text-slate-600">Detalle del motivo {doc.fueraDePlazo && credito ? '(obligatorio: fuera de plazo)' : '(opcional)'}
              <input value={texto} onChange={e => setTexto(e.target.value)} maxLength={500} className={`${inp} ${faltaTexto ? 'border-red-400' : ''}`} placeholder={doc.fueraDePlazo && credito ? `Explica por qué se emite pasados ${doc.diasTranscurridos} días` : 'Ej.: el padre devolvió el uniforme'} /></label>
          </div>
          {credito && <div>
            <div className="mb-1.5 flex items-center justify-between text-xs font-semibold text-slate-700"><span>¿Cómo se devuelve el dinero? <span className="font-normal text-slate-500">(debe sumar {fmt(totalCredito)})</span></span>
              <button onClick={() => { setReembEdit(true); setReemb([...reemb, { metodo: metodos[0]?.nombre ?? 'Efectivo', monto: '', ref: '' }]); }} className="flex h-7 items-center gap-1 rounded border border-slate-300 bg-white px-2 font-medium"><i className="ph ph-plus" />Otro medio</button></div>
            <div className="flex flex-col gap-2">
              {reemb.map((r, i) => {
                const m = metodos.find(x => x.nombre === r.metodo);
                return <div key={i} className="grid grid-cols-[200px_130px_minmax(0,1fr)_32px] items-center gap-2">
                  <select value={r.metodo} aria-label="Medio de devolución" onChange={e => { setReembEdit(true); setReemb(reemb.map((x, k) => k === i ? { ...x, metodo: e.target.value } : x)); }} className={inp}>{metodos.map(mm => <option key={mm.nombre} value={mm.nombre}>{mm.nombre}</option>)}</select>
                  <input inputMode="decimal" value={r.monto} aria-label="Monto devuelto" onChange={e => { setReembEdit(true); setReemb(reemb.map((x, k) => k === i ? { ...x, monto: e.target.value.replace(/[^\d.]/g, '') } : x)); }} className={`${inp} text-right font-mono`} />
                  <input value={r.ref} placeholder={m?.ref ? m.ref + ' (obligatoria)' : 'Referencia (opcional)'} aria-label="Referencia" onChange={e => { setReembEdit(true); setReemb(reemb.map((x, k) => k === i ? { ...x, ref: e.target.value } : x)); }} className={`${inp} ${m?.ref && !r.ref.trim() ? 'border-amber-400' : ''}`} />
                  <button onClick={() => { setReembEdit(true); setReemb(reemb.filter((_, k) => k !== i)); }} disabled={reemb.length <= 1} aria-label="Quitar medio" className="h-8 rounded-md border border-slate-300 bg-white disabled:opacity-40"><i className="ph ph-trash" /></button></div>;
              })}
            </div>
            <div className={`mt-1.5 text-xs font-medium ${Math.abs(sumReemb - totalCredito) < 0.006 ? 'text-ok-fg' : 'text-bad-fg'}`}>Devuelto {fmt(sumReemb)} de {fmt(totalCredito)}{Math.abs(sumReemb - totalCredito) >= 0.006 && ' · ajusta los montos'}</div>
            <div className="mt-1 text-[11px] text-slate-500">Todo lo que se acredita se devuelve al cliente (no hay saldo a favor): si un cargo vuelve a la deuda, el padre lo paga de nuevo con un recibo nuevo.</div>
          </div>}
          {venta && doc.requiereCliente && <div className="grid grid-cols-1 gap-3 md:grid-cols-2"><label className="flex flex-col gap-1 text-xs font-medium text-slate-600">Razón social del comprador (la venta fue con crédito fiscal)<input value={cliente.nombre} onChange={e => setCliente({ ...cliente, nombre: e.target.value })} className={inp} /></label><label className="flex flex-col gap-1 text-xs font-medium text-slate-600">RNC o cédula<input value={cliente.rnc} onChange={e => setCliente({ ...cliente, rnc: e.target.value.replace(/\D/g, '') })} className={`${inp} font-mono`} /></label></div>}
          <div className="rounded-md bg-info-bg px-3 py-2 text-xs text-info-fg" data-resumen><i className="ph ph-info mr-1" />{resumen}</div>
          {cmp && <div className="text-xs text-slate-600">Se usará {cmp.modalidad === 'ELECTRONICA' ? 'el e-NCF' : 'el NCF'} <b className="font-mono">{cmp.codigo}</b>{cmp.disponible ? <> ({cmp.restantes.toLocaleString('en-US')} disponibles)</> : <b className="text-bad-fg"> · {cmp.motivo}</b>}{cmp.modalidad === 'ELECTRONICA' && ' · quedará pendiente de envío a la DGII'}</div>}
        </div>}
      </div>

      <div className="flex items-center justify-between gap-2 border-t border-slate-200 bg-slate-50 px-5 py-3">
        <button onClick={() => setStep((step - 1) as 1 | 2)} disabled={step === 1 || busy} className="h-9 rounded-md border border-slate-300 bg-white px-3.5 text-[13px] font-medium disabled:opacity-40"><i className="ph ph-caret-left mr-1" />Atrás</button>
        {step < 3
          ? <button onClick={() => { setErr(''); setStep((step + 1) as 2 | 3); }} disabled={step === 1 ? !intencion || !doc || !puede || !cmp?.disponible : !paso2Ok} className="h-9 rounded-md bg-accent px-4 text-[13px] font-semibold text-white disabled:cursor-not-allowed disabled:opacity-40">Siguiente<i className="ph ph-caret-right ml-1" /></button>
          : <button onClick={() => setGuard(true)} disabled={!paso3Ok || busy} className="h-9 rounded-md bg-red-600 px-4 text-[13px] font-semibold text-white disabled:cursor-not-allowed disabled:opacity-40"><i className="ph ph-shield-check mr-1" />{credito ? 'Emitir nota de crédito' : 'Emitir nota de débito'}</button>}
      </div>
      {guard && <SupervisorGuardModal onClose={() => setGuard(false)} cfg={{
        title: credito ? 'Autorizar nota de crédito' : 'Autorizar nota de débito', desc: `${credito ? `Se acreditarán ${fmt(totalCredito)}` : `Se cobrarán ${fmt(totalDebito)} adicionales`} sobre ${doc?.documento.id}. Una nota emitida no se puede deshacer.`,
        label: credito ? 'Emitir nota de crédito' : 'Emitir nota de débito', pin: true, onOk: emitir,
      }} />}
    </div>
  );
}
