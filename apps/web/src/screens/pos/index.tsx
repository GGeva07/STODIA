import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { CobroTurno, CobroCuenta, CobroComprobantes, CobroItem, CobroMetodo, CobroPagoReq, MobPagoIntencionDto, ReciboFin, TipoLogico } from '@stodia/shared';
import { api } from '../../lib/api';
import { useSession } from '../../lib/session';
import { useToastStack } from '../../components/useToastStack';
import SupervisorGuardModal, { type GuardCfg } from '../../components/finanzas/SupervisorGuardModal';
import SideDrawer from '../../components/finanzas/SideDrawer';
import { TONE, errMsg, fmt } from '../../components/finanzas/fin';
import { useWide } from '../../components/finanzas/useWide';
import { useFinCfg } from '../../components/finanzas/finConfig';
import PagosPorVerificar from './PagosPorVerificar';
import { useCaja } from '../../components/finanzas/caja';
import { SL_MSG, useCiclo } from '../../lib/ciclo';
import { B, hoyDMY, runPrint, usePrintBusy, type PDoc } from '../../components/finanzas/print';
import ConfirmModal from '../../components/system/ConfirmModal';
import ReciboModal from './ReciboModal';
import { useAlertaSecuencia } from '../../components/finanzas/AlertaSecuenciaModal';
import HistorialRecibos from './HistorialRecibos';
import NotasFiscales from './NotasFiscales';
import type { NotaInicial } from './NuevaNota';
import { AvisoBorrador, useDraft } from '../../lib/useDraft';
import ComprobanteSelector, { DATOS_VACIOS, datosEnvio, faltaFiscal, type DatosFiscales } from './ComprobanteSelector';

const METODOS0: CobroMetodo[] = [{ nombre: 'Efectivo', ref: null }];
/** Solo desarrollo: VITE_DEV_AUTOLOAD=<cédula|carnet|nombre> carga esa cuenta al abrir la terminal (en producción la terminal abre vacía). */
const DEV_AUTOLOAD: string = import.meta.env.DEV ? (import.meta.env.VITE_DEV_AUTOLOAD ?? '') : '';
const EMPTY_PAY: CobroPagoReq[] = [{ m: 'Efectivo', a: '', r: '' }];
const Kbd = ({ k, children }: { k: string; children: string }) => (
  <span className="flex items-center gap-1"><span className="rounded border border-slate-300 bg-white px-1.5 py-0.5 font-mono text-[11px] font-medium text-slate-700">{k}</span>{children}</span>
);
const Pill = ({ tone, w, children }: { tone: readonly [string, string]; w: number; children: string }) => (
  <span className="inline-flex h-[19px] flex-none items-center justify-center overflow-hidden text-ellipsis whitespace-nowrap rounded px-[5px] text-[10px] font-semibold leading-none" style={{ width: w, background: tone[0], color: tone[1] }}>{children}</span>
);

/** Descuento de la linea para el modo elegido (viene de la API: CobroItem.descuento.aplicable). */
const descDe = (i: CobroItem, modo: 'none' | 'pronto' | 'exo') => (modo === 'none' ? undefined : i.descuento?.aplicable?.[modo]);

export default function Screen() {
  const { user } = useSession();
  const { toast, toasts } = useToastStack();
  const [receipt, setReceipt] = useState<ReciboFin | null>(null);
  const alertaSec = useAlertaSecuencia(!!receipt);
  const wide = useWide();
  const { soloLecturaFin: sl, cicloSeleccionado } = useCiclo(); // Fase 2D: un ciclo cerrado es solo lectura (el planificado permite cobrar cargos de pre-inscripcion) (cobrar / anular / descuentos deshabilitados)
  const isSuper = user?.rol === 'Super Admin';
  const searchRef = useRef<HTMLInputElement>(null);
  const cajaInfo = useCaja();
  const [metodos, setMetodos] = useState<CobroMetodo[]>(METODOS0);
  const REFS = useMemo<Record<string, string | null>>(() => Object.fromEntries(metodos.map(m => [m.nombre, m.ref])), [metodos]);
  useEffect(() => { api.get<CobroMetodo[]>('/cobros/metodos').then(setMetodos).catch(() => undefined); }, []);
  // Pagos por verificar (intenciones del portal del tutor).
  const [intens, setIntens] = useState<MobPagoIntencionDto[]>([]);
  const [intOpen, setIntOpen] = useState(false);
  const [vinc, setVinc] = useState<MobPagoIntencionDto | null>(null);
  const loadIntens = useCallback(() => { api.get<MobPagoIntencionDto[]>('/movil/pagos/intenciones?estado=pendiente').then(setIntens).catch(() => setIntens([])); }, []);
  useEffect(() => { loadIntens(); }, [loadIntens]);

  // Borradores (docs/borradores-formularios.md): búsqueda, cuenta cargada (solo su cédula; los datos se piden de nuevo), cargos marcados, método/referencia de pago en edición y datos del comprador.
  // NUNCA se guardan el PIN de exoneración ni el efectivo ya cobrado (tras procesar todo vuelve al estado inicial = sin borrador).
  const [q, setQ] = useDraft('pos:q', '');
  const [ced, setCed, limpCed, metaCed] = useDraft('pos:ced', '');
  const restaurar = useRef(ced); // cuenta a recargar al volver a la terminal
  const fcfg = useFinCfg();
  const [cuenta, setCuenta] = useState<CobroCuenta | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [sel, setSel] = useDraft<Record<string, boolean>>('pos:sel', {});
  const [focus, setFocus] = useState(0);
  const [kid, setKid] = useDraft('pos:kid', 'all');
  const [discount, setDiscount] = useDraft<'none' | 'pronto' | 'exo'>('pos:discount', 'none', { transformar: d => (d === 'exo' ? 'none' : d) }); // «exo» exige PIN: no se restaura
  const [exoPin, setExoPin] = useState('');
  const [pays, setPays] = useDraft<CobroPagoReq[]>('pos:pays', EMPTY_PAY);
  // Comprobante fiscal del cobro (tipo LOGICO: el servidor decide B01/E31... segun la modalidad configurada) y datos fiscales del comprador.
  const [comprobantes, setComprobantes] = useState<CobroComprobantes | null>(null);
  const [comp, setComp] = useDraft<TipoLogico>('pos:comp', 'CONSUMO');
  const [fiscal, setFiscal] = useDraft<DatosFiscales>('pos:fiscal', DATOS_VACIOS);
  const [recordar, setRecordar] = useDraft('pos:recordar', false);
  const cargarComprobantes = useCallback(() => { api.get<CobroComprobantes>('/cobros/comprobantes').then(setComprobantes).catch(() => undefined); }, []);
  useEffect(() => { cargarComprobantes(); }, [cargarComprobantes]);
  /** Al cambiar de cuenta: el comprobante vuelve al habitual del tutor (si hay secuencia) o a Consumo, y los datos fiscales se precargan del tutor. */
  const reiniciarComprobante = useCallback((cu: CobroCuenta | null) => {
    setRecordar(false);
    setFiscal(DATOS_VACIOS);
    setComp(cu?.comprobanteHabitual ?? 'CONSUMO');
  }, []);
  const [histOpen, setHistOpen] = useState(false);
  const [turnoRecibo, setTurnoRecibo] = useState<ReciboFin | null>(null); // recibo abierto desde el Historial de Turno (mismo modal que tras emitir)
  const [notasOpen, setNotasOpen] = useState<{ inicial?: NotaInicial } | null>(null); // Notas de Crédito / Débito (listado + asistente); con `inicial` abre el asistente con ese recibo
  const [recHistOpen, setRecHistOpen] = useState(false); // Historial de Recibos (listado de todos los recibos del ciclo)
  const [guard, setGuard] = useState<GuardCfg | null>(null);
  const [expired, setExpired] = useState(false);
  const [busy, setBusy] = useState(false);
  const lastAct = useRef(Date.now());

  const search = useCallback(async (term: string, quiet = false, link?: MobPagoIntencionDto, keep = false) => {
    try {
      const t0 = performance.now();
      const c = await api.get<CobroCuenta>('/cobros/cuenta?q=' + encodeURIComponent(term.trim()));
      setCuenta(c); setNotFound(false); setFocus(0); setCed(c.cedula); setExoPin('');
      if (keep) { // restaurando el borrador: se conservan cargos marcados, pagos, descuento y comprobante; solo se descartan los cargos que ya no existen
        const ids = new Set([...c.items, ...(c.deudaAnterior ?? []), ...(c.anticipados ?? [])].map(i => i.id));
        setSel(s => Object.fromEntries(Object.entries(s).filter(([id]) => ids.has(id))));
        setKid(k => (k === 'all' || c.hijos.some(h => h.kid === k) ? k : 'all'));
        return;
      }
      setKid('all'); setPays(EMPTY_PAY); setDiscount('none'); reiniciarComprobante(c);
      setVinc(link ?? null);
      const pre = link?.tipo === 'cargos' ? link.detalle.map(d => d.id).filter(id => c.items.some(i => i.id === id)) : [];
      setSel(Object.fromEntries(pre.length ? pre.map(id => [id, true]) : c.items.filter(i => i.est === 'Vencida').map(i => [i.id, true]))); // arranca con lo vencido marcado (o con los cargos de la intención)
      if (!quiet) toast('Cuenta cargada en ' + Math.max(1, Math.round(performance.now() - t0)) + ' ms', 'info');
    } catch {
      setCuenta(null); setNotFound(true);
    }
  }, [toast, reiniciarComprobante]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { if (restaurar.current) { const c0 = restaurar.current; restaurar.current = ''; void search(c0, true, undefined, true); } }, []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (DEV_AUTOLOAD) { setQ(DEV_AUTOLOAD); void search(DEV_AUTOLOAD, true); } }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Turno del cajero (GET /cobros/turno): independiente de la cuenta consultada. Se carga al abrir, tras cobrar/anular y al cambiar la franja horaria;
  // conserva el dato anterior mientras recarga (sin parpadeo). Turno = recibos del usuario autenticado, de hoy, dentro de la franja actual.
  const [turnoData, setTurnoData] = useState<CobroTurno | null>(null);
  const [turnoErr, setTurnoErr] = useState(false);
  const turnoSeq = useRef(0);
  const cargarTurno = useCallback(async () => {
    const n = ++turnoSeq.current;
    try { const t = await api.get<CobroTurno>('/cobros/turno'); if (n === turnoSeq.current) { setTurnoData(t); setTurnoErr(false); } }
    catch { if (n === turnoSeq.current) setTurnoErr(true); }
  }, []);
  useEffect(() => { void cargarTurno(); }, [cargarTurno, user?.usuario]);
  // El turno NO se reinicia por hora/franja: dura hasta el cuadre (POST /cobros/turno/cierre). Al volver a la pestana se refresca por si hubo cambios en otra sesion.
  useEffect(() => { const f = () => { if (document.visibilityState === 'visible') void cargarTurno(); }; document.addEventListener('visibilitychange', f); return () => document.removeEventListener('visibilitychange', f); }, [cargarTurno]);

  const items = cuenta?.items ?? [];
  const deuda = useMemo(() => cuenta?.deudaAnterior ?? [], [cuenta]); // Fase 2D: cargos pendientes de ciclos cerrados (solo desde el ciclo activo), cobrables en una linea aparte
  const adel = useMemo(() => cuenta?.anticipados ?? [], [cuenta]); // pre-inscripcion: cargos de ciclos planificados (solo desde el ciclo activo), tambien cobrables
  const todos = useMemo(() => [...items, ...deuda, ...adel], [items, deuda, adel]);
  const recibos = useMemo(() => turnoData?.recibos ?? [], [turnoData]); // SOLO el turno (nunca cuenta.recibos)
  const nAct = useMemo(() => items.filter(i => kid === 'all' || i.kid === kid).length, [items, kid]);
  const nDeu = useMemo(() => deuda.filter(i => kid === 'all' || i.kid === kid).length, [deuda, kid]);
  const nAdel = useMemo(() => adel.filter(i => kid === 'all' || i.kid === kid).length, [adel, kid]);
  const vis = useMemo(() => todos.filter(i => kid === 'all' || i.kid === kid), [todos, kid]);
  // Beca / Plan Hermano ya incluida en el monto: columnas «Monto real» y «Desc. beca» (solo si alguna línea visible la tiene); el Total que se cobra es el monto del cargo.
  const hayBeca = vis.some(i => !!i.descuento?.beca), nCols = hayBeca ? 10 : 8;
  // Pronto pago POR PLAN: la API marca por linea si califica hoy (aplicable.pronto). El selector se habilita solo si alguna linea SELECCIONADA califica.
  const hayPronto = todos.some(i => i.descuento?.aplicable?.pronto), selPronto = todos.some(i => sel[i.id] && i.descuento?.aplicable?.pronto);

  const c = useMemo(() => {
    const s = todos.filter(i => sel[i.id]);
    const sub = s.reduce((a, i) => a + i.monto, 0);
    // Descuento por linea calculado por la API (lib/descuentos.ts, la misma regla de /cobros/procesar): aqui solo se suma el del modo elegido.
    const desc = Math.round(s.reduce((a, i) => a + (descDe(i, discount)?.monto ?? 0), 0) * 100) / 100;
    const total = Math.round((sub - desc) * 100) / 100;
    const ps = pays.map(p => ({ ...p, amt: pays.length === 1 && p.a === '' ? total : parseFloat(p.a) || 0 }));
    const paid = ps.reduce((a, p) => a + p.amt, 0);
    const nonCash = ps.filter(p => p.m !== 'Efectivo').reduce((a, p) => a + p.amt, 0);
    const missingRef = ps.find(p => REFS[p.m] && !p.r.trim());
    const remaining = Math.round((total - paid) * 100) / 100;
    const change = paid > total ? paid - total : 0;
    const abono = s.length > 0 && total > 0 && remaining > 0.001 && paid > 0.001;
    const tc = comprobantes?.tipos.find(t => t.logico === comp), umbral = comprobantes?.umbralConsumoIdentificado ?? 250000;
    const falta = comprobantes ? faltaFiscal(comp, total, umbral, fiscal, !!tc?.disponible, tc?.motivo, cuenta?.fiscal) : '';
    let msg = 'Listo para procesar', tone: 'ok' | 'warn' | 'bad' | 'mute' = 'ok';
    if (!s.length) { msg = 'Selecciona al menos un ítem'; tone = 'mute'; }
    else if (nonCash > total + 0.001) { msg = 'El monto no-efectivo excede el total'; tone = 'bad'; }
    else if (paid <= 0.001) { msg = 'Ingresa el monto recibido'; tone = 'warn'; }
    else if (missingRef) { msg = 'Ingresa ' + REFS[missingRef.m]!.toLowerCase() + ' (' + missingRef.m + ')'; tone = 'warn'; }
    else if (falta) { msg = falta; tone = 'warn'; }
    else if (abono) { msg = 'Monto menor al total: se registrará como abono y se resta del saldo pendiente'; tone = 'warn'; }
    else if (change > 0) { msg = 'Cambio a devolver ' + fmt(change); }
    const canPay = !sl && s.length > 0 && total > 0 && paid > 0.001 && !missingRef && nonCash <= total + 0.001 && !falta;
    if (sl) { msg = SL_MSG; tone = 'mute'; }
    return { sel: s, sub, desc, total, pays: ps, change, remaining, abono, msg, tone, canPay };
  }, [todos, sel, discount, pays, REFS, sl, comprobantes, comp, fiscal, cuenta]);

  const venc = items.filter(i => i.est === 'Vencida').reduce((a, i) => a + i.monto, 0);
  const mora = items.some(i => i.est === 'Vencida');
  const mesesMora = Math.max(0, ...Object.values(items.filter(i => i.est === 'Vencida' && i.tipo === 'col').reduce<Record<string, number>>((m, i) => ({ ...m, [i.kid]: (m[i.kid] ?? 0) + 1 }), {})));
  const KIDS: [string, string, string][] = [['all', 'Todos los conceptos', ''], ...(cuenta?.hijos ?? []).map(h => [h.kid, h.nombre, '(' + h.grado + ' ' + h.sec + ')'] as [string, string, string])];
  const kidName = (k: string) => cuenta?.hijos.find(h => h.kid === k)?.corto ?? '';

  const setPay = (i: number, k: keyof CobroPagoReq, v: string) =>
    setPays(ps => ps.map((p, j) => (j === i ? { ...p, [k]: k === 'a' ? v.replace(/[^\d.]/g, '') : v } : p)));

  const openGuard = (cfg: Omit<GuardCfg, 'pin'> & { pin?: boolean }) => setGuard({ ...cfg, pin: !!cfg.pin && !isSuper });

  const process = useCallback(async () => {
    if (expired || busy) return;
    if (sl) { toast(SL_MSG, 'warn'); return; }
    if (!c.canPay) { toast(c.msg, 'bad'); return; }
    setBusy(true);
    try {
      const rec = await api.post<ReciboFin>('/cobros/procesar', { ids: c.sel.map(i => i.id), discount, pays, pin: exoPin, cedula: cuenta?.cedula, tipoComprobante: comp, ...(() => { const d = datosEnvio(comp, c.total, comprobantes?.umbralConsumoIdentificado ?? 250000, fiscal, cuenta?.fiscal); return d ? { clienteRnc: d.rnc, clienteNombre: d.nombre } : {}; })(), ...(comp === 'REGIMEN_ESPECIAL' && fiscal.regimen.trim() ? { regimenEspecial: fiscal.regimen } : {}), ...(recordar ? { habitual: true } : {}), ...(vinc?.tipo === 'cargos' ? { intencionId: vinc.id } : {}) });
      const fresh = await api.get<CobroCuenta>('/cobros/cuenta?q=' + encodeURIComponent(cuenta!.cedula));
      void cargarTurno();
      setCuenta(fresh); setSel({}); setPays(EMPTY_PAY); setDiscount('none'); setExoPin(''); setFocus(0); setReceipt(rec); alertaSec.encolar(rec.alertaSecuencia); reiniciarComprobante(fresh); cargarComprobantes();
      if (vinc?.tipo === 'cargos' && !rec.abono) { setVinc(null); loadIntens(); }
      toast(rec.abono ? `${rec.id} · Abono ${fmt(rec.monto)} aplicado · saldo pendiente ${fmt(rec.saldo)}` : `${rec.id} procesado · ${fmt(rec.monto)}`, rec.abono ? 'warn' : 'ok');
    } catch (e) { toast(errMsg(e), 'bad'); } finally { setBusy(false); }
  }, [c, discount, pays, exoPin, expired, busy, toast, cuenta, vinc, loadIntens, sl, cargarTurno, comp, fiscal, recordar, reiniciarComprobante, cargarComprobantes, comprobantes]);

  // Atajos de teclado del prototipo + bloqueo por inactividad (15 min).
  const toggle = (id: string, idx: number) => { setSel(s => ({ ...s, [id]: !s[id] })); setFocus(idx); };
  const kb = useRef({ vis, focus, process });
  kb.current = { vis, focus, process };
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      lastAct.current = Date.now();
      const { vis: v, focus: f, process: p } = kb.current;
      const tag = (e.target as HTMLElement).tagName;
      const typing = tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA';
      if (e.key === 'F1' || (e.key === '/' && !typing)) { e.preventDefault(); searchRef.current?.focus(); }
      else if (e.key === 'F12') { e.preventDefault(); void p(); }
      else if (!typing && e.key === 'ArrowDown') { e.preventDefault(); setFocus(Math.min(v.length - 1, f + 1)); }
      else if (!typing && e.key === 'ArrowUp') { e.preventDefault(); setFocus(Math.max(0, f - 1)); }
      else if (!typing && e.key === ' ' && v[f]) { e.preventDefault(); toggle(v[f].id, f); }
    };
    const tick = setInterval(() => { if (Date.now() - lastAct.current > 15 * 60000) setExpired(true); }, 30000);
    const touch = () => { lastAct.current = Date.now(); };
    window.addEventListener('keydown', onKey);
    window.addEventListener('mousedown', touch);
    return () => { window.removeEventListener('keydown', onKey); window.removeEventListener('mousedown', touch); clearInterval(tick); };
  }, []);

  const newCobro = () => {
    setQ(''); limpCed(); setSel({}); setFiscal(DATOS_VACIOS); setCuenta(null); setVinc(null); setNotFound(false); setPays(EMPTY_PAY); setDiscount('none'); setKid('all'); reiniciarComprobante(null);
    setTimeout(() => searchRef.current?.focus(), 0);
  };

  const onDiscount = (v: string) => {
    if (sl) return;
    if (v === 'exo') {
      openGuard({
        title: 'Exonerar recargo por mora', desc: 'La exoneración de moras es una acción auditada. Requiere autorización jerárquica.',
        code: 'EXONERAR-MORA', pin: true, label: 'Autorizar exoneración',
        onOk: pin => { setExoPin(pin); setDiscount('exo'); toast('Mora exonerada · autorizado por supervisor', 'ok'); },
      });
    } else setDiscount(v as 'none' | 'pronto');
  };

  const pb = usePrintBusy();
  const pbc = pb('cuadre', 'Imprimir Cuadre', 'ph ph-printer');
  const docCuadre = (): PDoc => {
    const act = recibos.filter(r => r.est !== 'Anulado'), res = turnoData?.resumen, by: Record<string, number> = res?.porMetodo ? { ...res.porMetodo } : {};
    if (!res?.porMetodo) act.forEach(r => { by[r.metodo] = (by[r.metodo] || 0) + r.monto; });
    const notasT = turnoData?.notas ?? [];
    // Cuadre NETO: cobrado de los recibos del turno − devoluciones (reembolsos de las notas de crédito que emitió este cajero en el turno), por medio de pago.
    const tot: [string, string, boolean?][] = [...Object.entries(by).map(([k, v]) => ['Neto ' + k, fmt(v)] as [string, string]), ...(res?.devoluciones ? [['Cobrado bruto', fmt(res.bruto ?? 0)] as [string, string], ['Devoluciones (notas de crédito)', '−' + fmt(res.devoluciones)] as [string, string]] : []), ['TOTAL NETO COBRADO', fmt(res?.netoActivo ?? act.reduce((a, r) => a + r.monto, 0)), true]];
    return { kind: 'carta', name: 'Cuadre de caja', format: 'Carta 8.5 × 11 in', sign: ['Firma del cajero', 'Firma de dirección'], pages: [{ title: 'Cuadre de caja', sub: (turnoData?.caja || cajaInfo.caja ? (turnoData?.caja || cajaInfo.caja) + ' · ' : '') + 'Turno ' + (turnoData?.turno ?? cajaInfo.turno) + (turnoData ? ' (' + turnoData.desde + '–' + turnoData.hasta + ')' : '') + ' · ' + hoyDMY(), blocks: [
      B.kv([['Cajero', user?.nombre ?? ''], ['Sucursal', turnoData?.sucursal ?? cajaInfo.sucursal], ['Turno', (turnoData?.turno ?? cajaInfo.turno) + (turnoData ? ' · ' + turnoData.desde + ' a ' + turnoData.hasta : '')], ['Recibos emitidos', String(recibos.length)], ['Anulados', String(recibos.length - act.length)]]),
      B.table(['Recibo', 'Comprobante', 'NCF / e-NCF', 'Tutor', 'Método', 'Hora', 'Monto', 'Estado'], recibos.map(r => [r.id, r.tipoComprobante?.nombre ?? '', r.ncf, r.tutor, r.metodo, r.hora, fmt(r.monto), r.est === 'Anulado' ? 'Anulado' : (r.abono ? 'Abono' : 'Activo')]), ['62px', '92px', '104px', '1fr', '66px', '40px', '88px', '52px'], ['left', 'left', 'left', 'left', 'left', 'left', 'right', 'left']),
      ...(notasT.length ? [B.text('Devoluciones / Notas de crédito y débito del turno', true), B.table(['Nota', 'Tipo', 'NCF / e-NCF', 'Documento', 'Motivo', 'Monto'], notasT.map(nt => [nt.id, nt.clase === 'CREDITO' ? 'Crédito' : 'Débito', nt.ncf, nt.documento.id, nt.motivo.nombre, (nt.clase === 'CREDITO' ? '−' : '+') + fmt(nt.monto)]), ['62px', '52px', '104px', '84px', '1fr', '88px'], ['left', 'left', 'left', 'left', 'left', 'right'])] : []),
      B.total(tot)] }] };
  };

  /** Cuadrar: cierra el turno (queda guardado en BD), imprime el cuadre y el turno siguiente empieza vacio. */
  const [cuadrando, setCuadrando] = useState(false);
  const [cuadreOpen, setCuadreOpen] = useState(false);
  const [cuadreErr, setCuadreErr] = useState('');
  const cuadrar = async () => {
    if (cuadrando || !turnoData) return;
    const doc = docCuadre(); setCuadrando(true); setCuadreErr('');
    try { await api.post('/cobros/turno/cierre', {}); setCuadreOpen(false); toast('Turno cuadrado y cerrado', 'ok'); void cargarTurno(); runPrint('cuadre', doc); }
    catch (e) { setCuadreErr(errMsg(e)); } finally { setCuadrando(false); }
  };

  /** «Emitir nota de crédito / débito» desde el modal de un recibo: cierra los listados y abre el asistente con ese recibo precargado. */
  const emitirNotaDe = (rc: ReciboFin, clase: 'credito' | 'debito') => {
    setRecHistOpen(false); setHistOpen(false); setTurnoRecibo(null);
    setNotasOpen({ inicial: { tipo: 'recibo', id: rc.id, intencion: clase === 'debito' ? 'debito' : 'parcial' } });
  };

  const anular = (rc: ReciboFin) =>
    openGuard({
      title: 'Anular recibo ' + rc.id,
      desc: 'El rol Cajero no posee permiso de anulación. La terminal queda en espera hasta que un Super Admin o Director Financiero autorice. Se emitirá una nota de crédito.',
      code: 'ANULAR-' + rc.id, pin: true, label: 'Anular y emitir nota de crédito',
      onOk: async pin => {
        const r = await api.post<ReciboFin>(`/cobros/recibos/${rc.id}/anular`, { pin });
        setTurnoData(t => t && { ...t, recibos: t.recibos.map(x => (x.id === r.id ? r : x)) });
        setCuenta(cu => cu && { ...cu, recibos: cu.recibos.map(x => (x.id === r.id ? r : x)) });
        void cargarTurno();
        toast(`${rc.id} anulado · Nota de crédito ${r.nc}`, 'warn');
      },
    });

  const tone = { ok: '#15803D', warn: '#B45309', bad: '#B91C1C', mute: '#64748B' }[c.tone];
  const tIcon = { ok: 'ph ph-check-circle', warn: 'ph ph-warning', bad: 'ph ph-x-circle', mute: 'ph ph-info' }[c.tone];
  const single = pays.length === 1;
  const p0 = pays[0];
  const refOf = (m: string) => REFS[m];
  const showBox = c.sel.length > 0 && (c.change > 0 || c.remaining > 0.001);
  const histRecs = recibos.slice().reverse();
  const inputFocus = 'outline-none focus:border-accent focus:bg-white focus:ring-1 focus:ring-accent';

  return (
    <div className="flex min-h-[600px] flex-col gap-2.5" style={{ height: wide ? 'calc(100vh - 126px)' : 'auto' }}>
      <div className="flex flex-none flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <h1 className="m-0 text-lg font-semibold tracking-tight">Terminal de Cobros</h1>
          <span className="flex items-center gap-1.5 text-xs text-slate-600"><span className="h-2 w-2 rounded-full bg-green-600" />{cajaInfo.cajaLabel}</span>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-xs text-slate-600">
          {intens.length > 0 && <button onClick={() => setIntOpen(true)} className="flex h-[30px] items-center gap-1.5 rounded-md border border-amber-300 bg-amber-50 px-3 text-xs font-semibold text-amber-800 hover:bg-amber-100"><i className="ph ph-hourglass-medium" />Pagos por verificar ({intens.length})</button>}
          <Kbd k="F1">Buscar</Kbd><Kbd k="↑↓">Mover</Kbd><Kbd k="Espacio">Marcar</Kbd><Kbd k="F12">Cobrar</Kbd>
          <button onClick={newCobro} className="ml-1.5 flex h-[30px] items-center gap-1.5 rounded-md bg-accent px-3 text-xs font-semibold text-white hover:bg-accent-dark"><i className="ph ph-plus" />Nuevo Cobro</button>
        </div>
      </div>

      <div className="grid min-h-0 flex-1 gap-3" style={{ gridTemplateColumns: wide ? 'minmax(0,68fr) minmax(300px,32fr)' : 'minmax(0,1fr)' }}>
        <div className="flex min-h-0 min-w-0 flex-col gap-3">
          <section className="flex-none rounded-lg border border-slate-200 bg-white p-3 shadow-sm">
            {metaCed.restaurado && <AvisoBorrador meta={{ ...metaCed, descartar: () => newCobro() }} className="mb-2 w-fit" />}
            <div className="flex items-center gap-2.5">
              <div className="relative min-w-0 flex-1">
                <i className="ph ph-magnifying-glass pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-[15px] text-slate-400" />
                <input
                  ref={searchRef} value={q} onChange={e => setQ(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') void search(q); }}
                  placeholder="Buscar por Cédula, RNC, Matrícula o Nombre…"
                  className={`h-[34px] w-full rounded-md border border-slate-300 bg-slate-50 pl-8 pr-3 font-mono text-[13px] font-medium ${inputFocus}`}
                />
              </div>
              <button onClick={() => setHistOpen(true)} className="flex h-[34px] items-center gap-1.5 whitespace-nowrap rounded-md border border-slate-300 bg-slate-100 px-3 text-xs font-semibold text-slate-700 hover:bg-slate-200">
                <i className="ph ph-clock-counter-clockwise" />Historial de Turno ({turnoData?.resumen.emitidos ?? recibos.length})
              </button>
              <button onClick={() => setRecHistOpen(true)} className="flex h-[34px] items-center gap-1.5 whitespace-nowrap rounded-md border border-slate-300 bg-slate-100 px-3 text-xs font-semibold text-slate-700 hover:bg-slate-200">
                <i className="ph ph-receipt" />Historial de Recibos
              </button>
              <button onClick={() => setNotasOpen({})} data-notas-btn className="flex h-[34px] items-center gap-1.5 whitespace-nowrap rounded-md border border-slate-300 bg-slate-100 px-3 text-xs font-semibold text-slate-700 hover:bg-slate-200">
                <i className="ph ph-receipt-x" />Notas de Crédito / Débito
              </button>
            </div>
            {cuenta && (
              <div className="mt-2.5 flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-2.5 text-xs">
                <div className="flex flex-wrap items-center gap-2.5">
                  <span className="text-sm font-semibold">{cuenta.tutor}</span>
                  <span className="font-mono text-xs text-slate-500">{cuenta.cedula}</span>
                  {vinc && <span className="inline-flex items-center gap-1 rounded border border-amber-300 bg-amber-50 px-1.5 py-0.5 text-[10px] font-semibold text-amber-800" title="Al emitir el recibo se confirma el pago reportado por el tutor"><i className="ph ph-link" />Pago del portal · {fmt(vinc.monto)}<button onClick={() => setVinc(null)} aria-label="Desvincular" className="ml-0.5 text-amber-700 hover:text-amber-900"><i className="ph ph-x" /></button></span>}
                  <span className="inline-flex h-[19px] w-[126px] flex-none items-center justify-center whitespace-nowrap rounded border px-[5px] text-[10px] font-semibold leading-none"
                    style={mora ? { background: '#FEE2E2', color: '#B91C1C', borderColor: '#FECACA' } : { background: '#DCFCE7', color: '#15803D', borderColor: '#BBF7D0' }}>
                    {mora ? 'EN MORA' + (mesesMora ? ' · ' + mesesMora + (mesesMora === 1 ? ' MES' : ' MESES') : '') : 'AL DÍA'}
                  </span>
                </div>
                <div className="flex flex-wrap items-center gap-3 font-medium text-slate-700">
                  <span>Total vencido: <b className="font-mono" style={{ color: venc > 0 ? '#DC2626' : '#16A34A' }}>{fmt(venc)}</b></span>
                  <span className="text-slate-300">|</span>
                  <span>Deuda total: <b className="font-mono text-ink">{fmt(items.reduce((a, i) => a + i.monto, 0))}</b></span>
                  {adel.length > 0 && <><span className="text-slate-300">|</span><span title="Cargos de inscripción anticipada (ciclo planificado): no cuentan como deuda vencida">Anticipados: <b className="font-mono" style={{ color: '#0369A1' }}>{fmt(adel.reduce((a, i) => a + i.monto, 0))}</b></span></>}
                  {deuda.length > 0 && <><span className="text-slate-300">|</span><span title="Cargos pendientes de ciclos cerrados: se cobran aquí mismo, en el recibo del ciclo activo">Deuda anterior: <b className="font-mono" style={{ color: '#B45309' }}>{fmt(deuda.reduce((a, i) => a + i.monto, 0))}</b></span></>}
                </div>
              </div>
            )}
          </section>

          <section className="flex flex-1 flex-col overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm" style={{ minHeight: wide ? 0 : 380 }}>
            {cuenta ? (
              <>
                <div className="flex flex-none flex-wrap items-center justify-between gap-2.5 border-b border-slate-200 bg-slate-50 px-2.5 py-1.5">
                  <div className="flex flex-wrap gap-1">
                    {KIDS.map(([k, l, sub]) => {
                      const a = kid === k;
                      return (
                        <button key={k} onClick={() => { setKid(k); setFocus(0); }}
                          className={`h-7 whitespace-nowrap rounded-[5px] border px-2.5 text-xs hover:bg-white ${a ? 'border-slate-300 bg-white font-semibold text-ink' : 'border-transparent font-medium text-slate-600'}`}>
                          {l}{k === 'all' ? ` (${items.length})` : ''} <span className="text-[10px] text-slate-400">{sub}</span>
                        </button>
                      );
                    })}
                  </div>
                  <span className="text-[11px] text-slate-500">Marcar/desmarcar con la barra espaciadora</span>
                </div>
                <div className="min-h-0 flex-1 overflow-auto">
                  <table className={'w-full border-collapse text-left text-xs ' + (hayBeca ? 'min-w-[1260px]' : 'min-w-[1000px]')}>
                    <thead className="sticky top-0 z-[1]">
                      <tr className="bg-slate-100 text-slate-600">
                        <th className="w-10 border-b border-slate-200 p-[9px_10px] text-center">
                          <input type="checkbox" className="h-3.5 w-3.5 cursor-pointer accent-accent" checked={vis.length > 0 && vis.every(i => sel[i.id])}
                            onChange={() => { const on = !(vis.length > 0 && vis.every(i => sel[i.id])); setSel(s => ({ ...s, ...Object.fromEntries(vis.map(i => [i.id, on])) })); }} />
                        </th>
                        <th className="min-w-[220px] border-b border-slate-200 p-[9px_10px] font-semibold">Concepto cobrable</th>
                        <th className="w-[150px] border-b border-slate-200 p-[9px_10px] font-semibold">Estudiante</th>
                        <th className="w-[104px] border-b border-slate-200 p-[9px_10px] text-center font-semibold">Vencimiento</th>
                        <th className="w-24 border-b border-slate-200 p-[9px_10px] text-center font-semibold">Estado</th>
                        {hayBeca && <th className="w-[116px] border-b border-slate-200 p-[9px_10px] text-right font-semibold" title="Monto bruto de la cuota según el plan, antes de la beca o el Plan Hermano.">Monto real</th>}
                        {hayBeca && <th className="w-[150px] border-b border-slate-200 p-[9px_10px] text-right font-semibold" title="Descuento por beca / Plan Hermano (RD$ y %). Ya está descontado del Total.">Desc. beca</th>}
                        <th className="w-[124px] border-b border-slate-200 p-[9px_10px] text-right font-semibold" title={hayBeca ? 'Total de la cuota: lo que realmente se cobra (Monto real − Descuento por beca).' : undefined}>{hayBeca ? 'Total' : 'Monto'}</th>
                        <th className="w-[190px] border-b border-slate-200 p-[9px_10px] text-right font-semibold" title="Descuento aplicado a esa línea según el descuento elegido abajo. Beca y plan de pago ya vienen incluidos en el monto.">Descuento</th>
                        <th className="w-[124px] border-b border-slate-200 p-[9px_10px] text-right font-semibold" title="Monto − descuento">Neto</th>
                      </tr>
                    </thead>
                    <tbody>
                      {vis.map((i: CobroItem, idx) => {
                        const on = !!sel[i.id];
                        const tn = i.est === 'Vencida' ? TONE.bad : i.est === 'Por vencer' ? TONE.warn : TONE.mute;
                        return (
                          <Fragment key={i.id}>
                          {idx === nAct && nDeu > 0 && (
                            <tr className="bg-amber-50"><td colSpan={nCols} className="border-y border-amber-200 px-2.5 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-amber-800"><i className="ph-fill ph-clock-counter-clockwise mr-1.5" />Deuda de ciclos anteriores · {[...new Set(deuda.map(d => d.ciclo))].join(', ')} <span className="font-normal normal-case tracking-normal">(se cobra aquí; el recibo se emite en el ciclo activo)</span></td></tr>
                          )}
                          {idx === nAct + nDeu && nAdel > 0 && (
                            <tr className="bg-sky-50"><td colSpan={nCols} className="border-y border-sky-200 px-2.5 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-sky-800"><i className="ph-fill ph-calendar-dots mr-1.5" />Inscripción anticipada · {[...new Set(adel.map(d => d.ciclo))].join(', ')} <span className="font-normal normal-case tracking-normal">(cargos de un ciclo planificado; se cobran aquí y el recibo se emite en el ciclo activo)</span></td></tr>
                          )}
                          <tr onClick={() => toggle(i.id, idx)} className="h-9 cursor-pointer hover:bg-slate-50"
                            style={{ background: on ? '#EFF6FF' : '#FFFFFF', boxShadow: focus === idx ? 'inset 3px 0 0 #2563EB, inset 0 0 0 1px #BFDBFE' : 'none' }}>
                            <td className="border-b border-slate-100 px-2.5 text-center"><input type="checkbox" readOnly checked={on} className="pointer-events-none h-3.5 w-3.5 accent-accent" /></td>
                            <td className="whitespace-nowrap border-b border-slate-100 px-2.5 font-medium" style={{ color: on ? '#0F172A' : '#334155' }}>{i.con + (i.abono ? ' · saldo tras abono' : '') + (i.ciclo ? ' · ' + i.ciclo : '')}{i.nd && <span className="ml-1.5 rounded border border-amber-300 bg-warn-bg px-1 py-px align-[1px] text-[9px] font-bold text-warn-fg" title={'Cargo creado por la nota de débito ' + i.nd} data-nd-tag>ND</span>}</td>
                            <td className="whitespace-nowrap border-b border-slate-100 px-2.5 text-slate-600">{i.al.replace(' · ', ' • ')} Primaria</td>
                            <td className="border-b border-slate-100 px-2.5 text-center font-mono text-[11px] text-slate-500">{i.vence}</td>
                            <td className="border-b border-slate-100 px-2.5 text-center"><Pill tone={tn} w={81}>{i.est}</Pill></td>
                            {hayBeca && <td className="whitespace-nowrap border-b border-slate-100 px-2.5 text-right font-mono text-xs text-slate-600" data-testid="col-monto-real">{i.descuento?.beca ? fmt(i.descuento.beca.bruto) : <span className="text-slate-400">—</span>}</td>}
                            {hayBeca && <td className="whitespace-nowrap border-b border-slate-100 px-2.5 text-right font-mono text-xs" data-testid="col-desc-beca">{i.descuento?.beca ? <span title={'Descuento por beca: ' + i.descuento.beca.motivo} className="font-semibold" style={{ color: '#16A34A' }}>− {fmt(i.descuento.beca.descuento)} <span className="text-[10px] font-normal">({+i.descuento.beca.pct.toFixed(2)}%)</span></span> : <span className="text-slate-400">—</span>}</td>}
                            <td className="border-b border-slate-100 px-2.5 text-right font-mono text-xs text-ink" style={{ fontWeight: on ? 600 : 400 }}>{fmt(i.monto)}</td>
                            <td className="whitespace-nowrap border-b border-slate-100 px-2.5 text-right" data-testid="col-descuento">
                              {(() => {
                                // Solo el porcentaje (el monto va en el total del resumen; el motivo queda en el tooltip).
                                const d = descDe(i, discount);
                                return d && i.monto > 0
                                  ? <span title={d.detalle ? `${d.motivo}: ${d.detalle}` : d.motivo} className="font-mono text-xs font-semibold" style={{ color: '#16A34A' }}>{+(d.monto / i.monto * 100).toFixed(2)}%</span>
                                  : <span className="text-slate-400">—</span>;
                              })()}
                            </td>
                            <td className="border-b border-slate-100 px-2.5 text-right font-mono text-xs text-ink" style={{ fontWeight: on ? 600 : 400 }}>{fmt(i.monto - (descDe(i, discount)?.monto ?? 0))}</td>
                          </tr>
                          </Fragment>
                        );
                      })}
                    </tbody>
                  </table>
                  {vis.length === 0 && (
                    <div className="flex items-center gap-3.5 px-4 py-7">
                      <span className="grid h-11 w-11 place-items-center rounded-full bg-ok-bg text-[22px] text-green-600"><i className="ph ph-check-circle" /></span>
                      <div><div className="text-sm font-semibold">Sin conceptos pendientes</div><div className="text-[13px] text-slate-600">No hay cuotas abiertas para este filtro en el ciclo {cicloSeleccionado || fcfg.ciclo}.</div></div>
                    </div>
                  )}
                </div>
                <div className="flex flex-none flex-wrap items-center gap-2.5 border-t border-slate-200 bg-slate-50 px-2.5 py-2">
                  <label className="flex items-center gap-1.5 text-xs font-medium text-slate-600">Descuento
                    <select value={discount} onChange={e => onDiscount(e.target.value)} disabled={sl} title={sl ? SL_MSG : undefined} className="h-7 rounded-[5px] border border-slate-300 bg-white px-1.5 text-xs text-ink disabled:opacity-50">
                      <option value="none">Ninguno</option>
                      {(hayPronto || discount === 'pronto') && <option value="pronto" disabled={!selPronto && discount !== 'pronto'}>Pronto pago (según plan)</option>}
                      <option value="exo">Exonerar mora (supervisor)</option>
                    </select>
                  </label>
                  {(hayPronto || discount === 'pronto') && !selPronto && <span className="text-[11px] text-slate-500" data-testid="pronto-sin-lineas">Pronto pago: ninguna línea seleccionada califica</span>}
                  {(cuenta.becas ?? []).map(b => <span key={b} className="text-[11px] text-slate-500">{b}</span>)}
                </div>
              </>
            ) : (
              <div className="flex max-w-[440px] flex-col items-start gap-2.5 px-6 py-10">
                <span className="grid h-[52px] w-[52px] place-items-center rounded-full bg-blue-50 text-[26px] text-accent"><i className="ph ph-identification-badge" /></span>
                <div className="text-[15px] font-semibold">{notFound ? `Sin coincidencias para «${q}»` : 'Busca un tutor o alumno'}</div>
                <div className="text-[13px] leading-normal text-slate-600">
                  {notFound ? 'Verifica la cédula o RNC. También puedes buscar por carnet, por nombre del tutor o del alumno.' : 'Escanea el carnet o escribe cédula, RNC o matrícula. Presiona / para enfocar la búsqueda.'}
                </div>
                {DEV_AUTOLOAD && <button onClick={() => { setQ(DEV_AUTOLOAD); void search(DEV_AUTOLOAD, true); }} className="flex h-[34px] items-center gap-1.5 rounded-md bg-accent px-3.5 text-[13px] font-medium text-white hover:bg-accent-dark">
                  <i className="ph ph-user-focus" />Cargar cuenta de prueba (DEV)
                </button>}
              </div>
            )}
          </section>
        </div>

        <aside className="relative flex min-h-0 flex-col justify-between gap-3.5 overflow-auto rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex flex-none flex-col">
            <div className="flex items-center justify-between border-b border-slate-200 pb-2.5">
              <h2 className="m-0 text-sm font-bold">Resumen de Cobro</h2>
              <span className="rounded bg-info-bg px-2 py-0.5 text-[11px] font-semibold text-info-fg">{c.sel.length + (c.sel.length === 1 ? ' Ítem' : ' Ítems')}</span>
            </div>
            <div className="mt-2.5 flex max-h-[200px] flex-col gap-[7px] overflow-auto text-xs">
              {c.sel.map(i => (
                <div key={i.id} className="flex justify-between gap-2.5 text-slate-600">
                  <span className="overflow-hidden text-ellipsis whitespace-nowrap">{i.con} ({kidName(i.kid)})</span>
                  <span className="whitespace-nowrap font-mono text-xs font-medium text-ink" title={descDe(i, discount) ? `${fmt(i.monto)} − ${fmt(descDe(i, discount)!.monto)} (${descDe(i, discount)!.motivo})` : undefined}>{fmt(i.monto - (descDe(i, discount)?.monto ?? 0))}</span>
                </div>
              ))}
              {c.sel.length === 0 && <div className="text-slate-400">Marca conceptos en la tabla para cobrarlos.</div>}
            </div>
            <div className="mt-3.5 flex flex-col gap-1.5 border-t border-slate-100 pt-2.5 text-xs">
              <div className="flex justify-between text-slate-500"><span>Subtotal</span><span className="font-mono">{fmt(c.sub)}</span></div>
              <div className="flex justify-between text-slate-500"><span>Descuentos</span><span className="font-mono" style={{ color: c.desc ? '#16A34A' : '#475569' }}>{c.desc ? '− ' + fmt(c.desc) : fmt(0)}</span></div>
              <div className="flex flex-wrap items-baseline justify-between gap-2 border-t border-slate-200 pt-2">
                <span className="text-[11px] font-bold uppercase tracking-wider text-slate-800">Total a cobrar</span>
                <span className="font-mono text-2xl font-bold tracking-[-0.02em]">{fmt(c.total)}</span>
              </div>
            </div>
          </div>

          <div className="flex flex-none flex-col gap-2.5">
          {comprobantes && <ComprobanteSelector tipos={comprobantes.tipos} value={comp} onChange={setComp} datos={fiscal} onDatos={setFiscal} registrada={cuenta?.fiscal} total={c.total} umbral={comprobantes.umbralConsumoIdentificado}
            habitual={cuenta?.comprobanteHabitual ?? null} recordar={recordar} onRecordar={setRecordar} disabled={sl} ecf={comprobantes.ecf} />}
          <div className="flex flex-col gap-2.5 border-t border-slate-200 pt-3.5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-700">Forma de pago</span>
              <button onClick={() => setPays(ps => (ps.length > 1 ? [{ ...ps[0], a: '' }] : [{ ...ps[0], a: c.total.toFixed(2) }, { m: 'Tarjeta de Crédito', a: '0.00', r: '' }]))}
                className="h-[22px] rounded px-1.5 text-[11px] font-semibold text-accent hover:bg-blue-50">{single ? 'Dividir pago' : 'Pago único'}</button>
            </div>
            {single ? (
              <div className="flex flex-col gap-2.5">
                <div className="grid grid-cols-3 gap-1 rounded-md bg-slate-100 p-1">
                  {([['Efectivo', 'Efectivo'], ['Tarjeta de Crédito', 'Tarjeta'], ['Transferencia', 'Transf.']] as const).map(([m, l]) => {
                    const a = p0.m === m || (m === 'Tarjeta de Crédito' && p0.m.startsWith('Tarjeta'));
                    return <button key={m} onClick={() => setPays([{ m, a: '', r: '' }])}
                      className={`h-[30px] rounded text-xs ${a ? 'bg-white font-semibold text-accent shadow-sm' : 'font-medium text-slate-600 hover:text-ink'}`}>{l}</button>;
                  })}
                </div>
                {p0.m === 'Efectivo' && (
                  <div className="flex flex-col gap-1">
                    <div className="flex justify-between text-[11px] text-slate-600"><span>Monto recibido</span><button onClick={() => setPay(0, 'a', c.total.toFixed(2))} className="text-[11px] font-semibold text-accent">Exacto</button></div>
                    <input value={p0.a} onChange={e => setPay(0, 'a', e.target.value)} placeholder={c.total.toFixed(2)} className={`h-9 w-full rounded-md border border-slate-300 bg-slate-50 px-3 text-right font-mono text-sm font-medium ${inputFocus}`} />
                  </div>
                )}
                {refOf(p0.m) && (
                  <div className="flex flex-col gap-1">
                    <div className="flex justify-between text-[11px] text-slate-600"><span>{refOf(p0.m)} *</span><span className="text-slate-500">Monto: <b className="font-mono">{fmt(c.total)}</b></span></div>
                    <input value={p0.r} onChange={e => setPay(0, 'r', e.target.value)} placeholder="Obligatorio"
                      className={`h-9 w-full rounded-md border bg-slate-50 px-3 font-mono text-sm font-medium ${inputFocus}`} style={{ borderColor: !p0.r.trim() ? '#F59E0B' : '#CBD5E1' }} />
                  </div>
                )}
              </div>
            ) : (
              <div className="flex flex-col gap-1.5">
                {pays.map((p, i) => (
                  <div key={i} className="flex flex-col gap-[5px] rounded-md border border-slate-200 bg-slate-50 p-[7px]">
                    <div className="flex gap-[5px]">
                      <select value={p.m} onChange={e => setPay(i, 'm', e.target.value)} className="h-[30px] min-w-0 flex-1 rounded-[5px] border border-slate-300 bg-white px-1.5 text-xs">
                        {Object.keys(REFS).map(m => <option key={m}>{m}</option>)}
                      </select>
                      <input value={p.a} onChange={e => setPay(i, 'a', e.target.value)} placeholder="0.00" className="h-[30px] w-24 rounded-[5px] border border-slate-300 bg-white px-1.5 text-right font-mono text-xs outline-none focus:border-accent" />
                      <button title="Completar restante" onClick={() => { const others = c.pays.reduce((a, q2, j) => a + (j === i ? 0 : q2.amt), 0); setPay(i, 'a', Math.max(0, c.total - others).toFixed(2)); }}
                        className="grid h-[30px] w-[30px] place-items-center rounded-[5px] border border-slate-300 bg-white text-slate-600"><i className="ph ph-equals" /></button>
                      <button title="Quitar" onClick={() => setPays(ps => ps.filter((_, j) => j !== i))} className="h-[30px] w-[30px] place-items-center rounded-[5px] border border-slate-300 bg-white text-red-600" style={{ display: pays.length > 1 ? 'grid' : 'none' }}><i className="ph ph-x" /></button>
                    </div>
                    {refOf(p.m) && (
                      <input value={p.r} onChange={e => setPay(i, 'r', e.target.value)} placeholder={`${refOf(p.m)} (obligatorio)`}
                        className="h-7 rounded-[5px] border bg-white px-1.5 font-mono text-xs outline-none" style={{ borderColor: !p.r.trim() ? '#F59E0B' : '#CBD5E1' }} />
                    )}
                  </div>
                ))}
                <button onClick={() => setPays(ps => [...ps.map(p => (ps.length === 1 && p.a === '' ? { ...p, a: String(c.total) } : p)), { m: 'Efectivo', a: '', r: '' }])}
                  className="h-7 rounded-md border border-dashed border-slate-300 bg-white text-xs text-slate-600 hover:border-accent hover:text-accent">+ Agregar medio</button>
              </div>
            )}
            {showBox && (
              <div className="flex items-center justify-between gap-2 rounded-md border px-3 py-2 text-xs"
                style={c.change > 0 ? { background: '#ECFDF5', borderColor: '#A7F3D0', color: '#047857' } : { background: '#FFFBEB', borderColor: '#FDE68A', color: '#B45309' }}>
                <span className="font-medium">{c.change > 0 ? 'Cambio a devolver:' : 'Saldo pendiente tras abono:'}</span>
                <span className="font-mono text-sm font-bold">{fmt(c.change > 0 ? c.change : c.remaining)}</span>
              </div>
            )}
            {!(c.canPay && c.change > 0) && <div className="flex items-center gap-1.5 text-[11px]" style={{ color: tone }}><i className={tIcon} />{c.msg}</div>}
            <div className="sticky bottom-0 z-10 -mx-4 -mb-4 flex flex-col bg-white px-4 pb-4 pt-2 shadow-[0_-8px_8px_-8px_rgba(15,23,42,0.18)]">
              <button onClick={() => void process()} disabled={sl} title={sl ? SL_MSG : undefined} className="flex h-[46px] items-center justify-center gap-2 rounded-md text-sm font-semibold shadow hover:brightness-95"
              style={{ background: c.canPay ? '#2563EB' : '#CBD5E1', color: c.canPay ? '#FFFFFF' : '#64748B', cursor: c.canPay ? 'pointer' : 'not-allowed' }}>
              <span className="rounded bg-slate-900/20 px-1.5 py-0.5 font-mono text-[10px] font-semibold">F12</span>
              {c.abono ? 'Procesar Abono e Imprimir Recibo' : 'Procesar e Imprimir Recibo'}
            </button>
            </div>
          </div>
          </div>

          {expired && (
            <div className="absolute inset-0 flex flex-col items-start justify-center gap-2.5 rounded-lg bg-slate-50/95 p-6">
              <i className="ph ph-lock-key text-[28px] text-slate-600" />
              <div className="font-semibold">Sesión de caja bloqueada</div>
              <div className="text-[13px] text-slate-600">15 minutos sin actividad. Reautentícate con 2FA para continuar.</div>
              <button onClick={() => { lastAct.current = Date.now(); setExpired(false); }} className="h-[34px] rounded-md bg-accent px-3.5 text-[13px] font-medium text-white">Reanudar sesión</button>
            </div>
          )}
        </aside>
      </div>

      {intOpen && <PagosPorVerificar items={intens} receiptId={receipt?.id} onClose={() => setIntOpen(false)} onChanged={loadIntens} toast={toast}
        onCargar={it => { setIntOpen(false); setQ(it.tutor); void search(it.tutor, true, it); }} />}
      {histOpen && (
        <SideDrawer width={760} z={65} onClose={() => setHistOpen(false)}>
          <div className="flex items-center justify-between gap-2.5 border-b border-slate-200 px-[18px] py-3.5">
            <div>
              <div className="text-[15px] font-semibold">Historial de turno{cajaInfo.caja ? ' · ' + cajaInfo.caja : ''}</div>
              <div className="text-xs text-slate-500">Anular requiere clave de supervisor (el cajero no tiene permiso D)</div>
            </div>
            <div className="flex items-center gap-2">
              <button onClick={() => runPrint('cuadre', docCuadre())} className="flex h-[34px] items-center gap-1.5 rounded-md border border-slate-300 bg-white px-3 text-[13px] font-medium hover:bg-slate-100"><i className={pbc.icon} style={{ animation: pbc.spin }} />{pbc.label}</button>
              <button onClick={() => { setCuadreErr(''); setCuadreOpen(true); }} disabled={cuadrando || !turnoData || (!recibos.length && !(turnoData.ventas?.length) && !(turnoData.notas?.length))} data-testid="turno-cuadrar" className="flex h-[34px] items-center gap-1.5 rounded-md bg-slate-900 px-3 text-[13px] font-medium text-white hover:bg-slate-800 disabled:opacity-40"><i className="ph ph-lock-key" />Cuadrar turno</button>
              <button onClick={() => setHistOpen(false)} aria-label="Cerrar" className="h-[34px] w-[34px] rounded-md border border-slate-300 bg-white"><i className="ph ph-x" /></button>
            </div>
          </div>
          <div className="flex gap-6 border-b border-slate-200 px-[18px] py-2.5 text-xs text-slate-600">
            <span>Recibos: <b className="font-mono text-ink">{recibos.length}</b></span>
            <span>Cobrado neto: <b className="font-mono text-ink" data-testid="turno-neto">{fmt(turnoData?.resumen.netoActivo ?? recibos.filter(r => r.est !== 'Anulado').reduce((a, r) => a + r.monto, 0))}</b></span>
            {(turnoData?.resumen.devoluciones ?? 0) > 0 && <span>Devoluciones: <b className="font-mono text-info-fg" data-testid="turno-devoluciones">−{fmt(turnoData!.resumen.devoluciones!)}</b></span>}
          </div>
          <div className="flex-1 overflow-auto">
            {histRecs.map(rc => {
              const an = rc.est === 'Anulado';
              const t = an ? TONE.bad : TONE.ok;
              return (
                <div key={rc.id} role="button" tabIndex={0} title={'Ver recibo ' + rc.id} onClick={() => setTurnoRecibo(rc)}
                  onKeyDown={e => { if ((e.key === 'Enter' || e.key === ' ') && e.target === e.currentTarget) { e.preventDefault(); setTurnoRecibo(rc); } }}
                  className="grid cursor-pointer grid-cols-[84px_minmax(0,1fr)_120px_140px_74px] items-center gap-2.5 border-b border-slate-100 px-[18px] py-2.5 text-xs hover:bg-slate-50 focus:bg-slate-50 focus:outline-none focus-visible:ring-1 focus-visible:ring-accent">
                  <div className="flex flex-col gap-0.5"><span className="font-mono text-xs font-semibold">{rc.id}</span><span className="font-mono text-[11px] text-slate-500">{rc.hora}</span></div>
                  <div className="flex min-w-0 flex-col gap-0.5"><span className="overflow-hidden text-ellipsis whitespace-nowrap font-medium">{rc.tutor}</span><span className="font-mono text-[11px] text-slate-500">{rc.tipoComprobante ? rc.tipoComprobante.nombre + ' · ' : ''}{rc.ncf} · {rc.metodo}</span></div>
                  <span className="text-right font-mono text-xs font-semibold" style={{ textDecoration: an ? 'line-through' : 'none' }}>{fmt(rc.monto)}</span>
                  <span><Pill tone={t} w={148}>{an ? 'Anulado · ' + rc.nc : (rc.acreditado ?? 0) > 0 ? 'Con NC · neto ' + fmt(rc.neto ?? 0) : rc.abono ? 'Abono · saldo ' + fmt(rc.saldo) : 'Activo'}</Pill></span>
                  <button disabled={an || sl} title={sl ? SL_MSG : undefined} onClick={e => { e.stopPropagation(); anular(rc); }} className="h-7 rounded-[5px] border border-red-300 bg-white text-xs font-medium text-red-600 hover:bg-bad-bg" style={{ opacity: an ? 0.4 : 1 }}>Anular</button>
                </div>
              );
            })}
            {(turnoData?.ventas?.length ?? 0) > 0 && <div data-turno-ventas>
              <div className="border-b border-t border-slate-200 bg-slate-50 px-[18px] py-2 text-[11px] font-semibold uppercase tracking-wide text-slate-500">Ventas rápidas del turno</div>
              {turnoData!.ventas!.map(v => (
                <div key={v.id} className="grid grid-cols-[84px_minmax(0,1fr)_120px_140px] items-center gap-2.5 border-b border-slate-100 px-[18px] py-2 text-xs">
                  <div className="flex flex-col gap-0.5"><span className="font-mono font-semibold">{v.id}</span><span className="font-mono text-[11px] text-slate-500">{v.hora}</span></div>
                  <span className="min-w-0 truncate font-medium">Venta rápida<span className="ml-2 font-mono text-[11px] text-slate-500">{v.ncf} · {v.metodo}</span></span>
                  <span className="text-right font-mono font-semibold">{fmt(v.monto)}</span><span><Pill tone={TONE.ok} w={148}>Venta rápida</Pill></span>
                </div>
              ))}
            </div>}
            {(turnoData?.notas?.length ?? 0) > 0 && <div data-turno-notas>
              <div className="border-b border-t border-slate-200 bg-slate-50 px-[18px] py-2 text-[11px] font-semibold uppercase tracking-wide text-slate-500">Devoluciones / Notas del turno</div>
              {turnoData!.notas!.map(nt => (
                <button key={nt.id} onClick={() => setNotasOpen({})} title={'Ver en Notas de Crédito / Débito'} className="grid w-full grid-cols-[84px_minmax(0,1fr)_120px_140px] items-center gap-2.5 border-b border-slate-100 px-[18px] py-2 text-left text-xs hover:bg-slate-50">
                  <span className="font-mono font-semibold">{nt.id}</span><span className="min-w-0 truncate">{nt.tutor}<span className="ml-2 font-mono text-[11px] text-slate-500">{nt.ncf} · {nt.documento.id}</span></span>
                  <span className="text-right font-mono font-semibold" style={{ color: nt.clase === 'CREDITO' ? '#1D4ED8' : '#B45309' }}>{nt.clase === 'CREDITO' ? '−' : '+'}{fmt(nt.monto)}</span><span className="truncate text-slate-600">{nt.motivo.nombre}</span>
                </button>
              ))}
            </div>}
          </div>
        </SideDrawer>
      )}

      {turnoRecibo && <ReciboModal recibo={turnoRecibo} toast={toast} origen="historial" z={80} onClose={() => setTurnoRecibo(null)} onNota={sl ? undefined : c => emitirNotaDe(turnoRecibo, c)} />}
      {receipt && <ReciboModal recibo={receipt} toast={toast} onClose={() => setReceipt(null)} />}
      {recHistOpen && <HistorialRecibos toast={toast} initialQ={q} onClose={() => setRecHistOpen(false)} onNota={sl ? undefined : emitirNotaDe} />}
      {notasOpen && <NotasFiscales toast={toast} inicial={notasOpen.inicial} onClose={() => setNotasOpen(null)} onCambio={() => { void cargarTurno(); if (cuenta) void search(cuenta.cedula, true); }} />}

      {guard && <SupervisorGuardModal cfg={guard} onClose={() => setGuard(null)} />}
      {cuadreOpen && turnoData && (
        <ConfirmModal title="¿Cuadrar y cerrar el turno?" icon="ph ph-lock-key" confirmLabel="Cuadrar turno" busyLabel="Cuadrando…" busy={cuadrando} error={cuadreErr} onConfirm={() => void cuadrar()} onClose={() => setCuadreOpen(false)}>
          <p>Se guarda el cuadre y el historial de turno empezará vacío.</p>
          <dl data-testid="cuadre-resumen" className="mt-2.5 grid grid-cols-[1fr_auto] gap-x-4 gap-y-1 rounded-lg bg-slate-50 p-3 text-[13px]">
            <dt>Turno {turnoData.turno} · desde</dt><dd className="text-right font-medium text-ink">{turnoData.desdeISO ? new Date(turnoData.desdeISO).toLocaleString('es-DO', { dateStyle: 'short', timeStyle: 'short' }) : turnoData.desde}</dd>
            <dt>Recibos (emitidos / anulados)</dt><dd className="text-right font-medium text-ink">{turnoData.resumen.emitidos} / {turnoData.resumen.anulados}</dd>
            <dt>Ventas rápidas</dt><dd className="text-right font-medium text-ink">{turnoData.ventas?.length ?? 0}</dd>
            <dt>Notas de crédito/débito</dt><dd className="text-right font-medium text-ink">{turnoData.notas?.length ?? 0}</dd>
            {Object.entries(turnoData.resumen.porMetodo ?? {}).map(([k, v]) => <Fragment key={k}><dt>Neto {k}</dt><dd className="text-right font-medium text-ink">{fmt(v)}</dd></Fragment>)}
            <dt className="border-t border-slate-200 pt-1 font-semibold text-ink">Total neto</dt><dd className="border-t border-slate-200 pt-1 text-right font-semibold text-ink">{fmt(turnoData.resumen.netoActivo)}</dd>
          </dl>
        </ConfirmModal>
      )}
      {toasts}
      {alertaSec.modal}
    </div>
  );
}
