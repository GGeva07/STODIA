import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { CobroCuenta, CobroItem, CobroPagoReq, ReciboFin } from '@stodia/shared';
import { api } from '../../lib/api';
import { useSession } from '../../lib/session';
import { useToastStack } from '../../components/useToastStack';
import SupervisorGuardModal, { type GuardCfg } from '../../components/finanzas/SupervisorGuardModal';
import SideDrawer from '../../components/finanzas/SideDrawer';
import { TONE, errMsg, fmt } from '../../components/finanzas/fin';
import { useWide } from '../../components/finanzas/useWide';
import { B, docTirilla, hoyDMY, runPrint, usePrintBusy, type PDoc } from '../../components/finanzas/print';

const REFS: Record<string, string | null> = { 'Efectivo': null, 'Tarjeta de Crédito': 'Autorización', 'Tarjeta de Débito': 'Autorización', 'Transferencia': 'Ref. bancaria', 'Cheque': 'No. cheque' };
const DEMO_Q = '001-0023940-1';
const KIDS: [string, string, string][] = [['all', 'Todos los conceptos', ''], ['juan', 'Juan Mendoza', '(5to A)'], ['sofia', 'Sofía Mendoza', '(2do B)']];
const KID_NAME: Record<string, string> = { juan: 'Juan', sofia: 'Sofía' };
const EMPTY_PAY: CobroPagoReq[] = [{ m: 'Efectivo', a: '', r: '' }];
const Kbd = ({ k, children }: { k: string; children: string }) => (
  <span className="flex items-center gap-1"><span className="rounded border border-slate-300 bg-white px-1.5 py-0.5 font-mono text-[11px] font-medium text-slate-700">{k}</span>{children}</span>
);
const Pill = ({ tone, w, children }: { tone: readonly [string, string]; w: number; children: string }) => (
  <span className="inline-flex h-[19px] flex-none items-center justify-center overflow-hidden text-ellipsis whitespace-nowrap rounded px-[5px] text-[10px] font-semibold leading-none" style={{ width: w, background: tone[0], color: tone[1] }}>{children}</span>
);

export default function Screen() {
  const { user } = useSession();
  const { toast, toasts } = useToastStack();
  const wide = useWide();
  const isSuper = user?.rol === 'Super Admin';
  const searchRef = useRef<HTMLInputElement>(null);

  const [q, setQ] = useState(DEMO_Q);
  const [cuenta, setCuenta] = useState<CobroCuenta | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [sel, setSel] = useState<Record<string, boolean>>({ c09: true, m09: true, c10: true, k10: true });
  const [focus, setFocus] = useState(0);
  const [kid, setKid] = useState('all');
  const [discount, setDiscount] = useState<'none' | 'pronto' | 'exo'>('none');
  const [exoPin, setExoPin] = useState('');
  const [pays, setPays] = useState<CobroPagoReq[]>(EMPTY_PAY);
  const [histOpen, setHistOpen] = useState(false);
  const [receipt, setReceipt] = useState<ReciboFin | null>(null);
  const [guard, setGuard] = useState<GuardCfg | null>(null);
  const [expired, setExpired] = useState(false);
  const [busy, setBusy] = useState(false);
  const lastAct = useRef(Date.now());

  const search = useCallback(async (term: string, quiet = false) => {
    try {
      const c = await api.get<CobroCuenta>('/cobros/cuenta?q=' + encodeURIComponent(term));
      setCuenta(c); setNotFound(false); setFocus(0);
      if (!quiet) toast('Cuenta cargada en 128 ms', 'info');
    } catch {
      setCuenta(null); setNotFound(true);
    }
  }, [toast]);

  useEffect(() => { void search(DEMO_Q, true); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const items = cuenta?.items ?? [];
  const recibos = cuenta?.recibos ?? [];
  const vis = useMemo(() => items.filter(i => kid === 'all' || i.kid === kid), [items, kid]);

  const c = useMemo(() => {
    const s = items.filter(i => sel[i.id]);
    const sub = s.reduce((a, i) => a + i.monto, 0);
    let desc = 0;
    if (discount === 'pronto') desc = s.filter(i => i.tipo === 'col' && i.est === 'Pendiente').reduce((a, i) => a + i.monto * 0.05, 0);
    if (discount === 'exo') desc = s.filter(i => i.tipo === 'mora').reduce((a, i) => a + i.monto, 0);
    const total = Math.round((sub - desc) * 100) / 100;
    const ps = pays.map(p => ({ ...p, amt: pays.length === 1 && p.a === '' ? total : parseFloat(p.a) || 0 }));
    const paid = ps.reduce((a, p) => a + p.amt, 0);
    const nonCash = ps.filter(p => p.m !== 'Efectivo').reduce((a, p) => a + p.amt, 0);
    const missingRef = ps.find(p => REFS[p.m] && !p.r.trim());
    const remaining = Math.round((total - paid) * 100) / 100;
    const change = paid > total ? paid - total : 0;
    const abono = s.length > 0 && total > 0 && remaining > 0.001 && paid > 0.001;
    let msg = 'Listo para procesar', tone: 'ok' | 'warn' | 'bad' | 'mute' = 'ok';
    if (!s.length) { msg = 'Selecciona al menos un ítem'; tone = 'mute'; }
    else if (nonCash > total + 0.001) { msg = 'El monto no-efectivo excede el total'; tone = 'bad'; }
    else if (paid <= 0.001) { msg = 'Ingresa el monto recibido'; tone = 'warn'; }
    else if (missingRef) { msg = 'Ingresa ' + REFS[missingRef.m]!.toLowerCase() + ' (' + missingRef.m + ')'; tone = 'warn'; }
    else if (abono) { msg = 'Monto menor al total: se registrará como abono y se resta del saldo pendiente'; tone = 'warn'; }
    else if (change > 0) { msg = 'Cambio a devolver ' + fmt(change); }
    const canPay = s.length > 0 && total > 0 && paid > 0.001 && !missingRef && nonCash <= total + 0.001;
    return { sel: s, sub, desc, total, pays: ps, change, remaining, abono, msg, tone, canPay };
  }, [items, sel, discount, pays]);

  const venc = items.filter(i => i.est === 'Vencida').reduce((a, i) => a + i.monto, 0);
  const mora = items.some(i => i.est === 'Vencida' && i.kid === 'juan');

  const setPay = (i: number, k: keyof CobroPagoReq, v: string) =>
    setPays(ps => ps.map((p, j) => (j === i ? { ...p, [k]: k === 'a' ? v.replace(/[^\d.]/g, '') : v } : p)));

  const openGuard = (cfg: Omit<GuardCfg, 'pin'> & { pin?: boolean }) => setGuard({ ...cfg, pin: !!cfg.pin && !isSuper });

  const process = useCallback(async () => {
    if (expired || busy) return;
    if (!c.canPay) { toast(c.msg, 'bad'); return; }
    setBusy(true);
    try {
      const rec = await api.post<ReciboFin>('/cobros/procesar', { ids: c.sel.map(i => i.id), discount, pays, pin: exoPin });
      const fresh = await api.get<CobroCuenta>('/cobros/cuenta?q=' + DEMO_Q);
      setCuenta(fresh); setSel({}); setPays(EMPTY_PAY); setDiscount('none'); setExoPin(''); setFocus(0); setReceipt(rec);
      toast(rec.abono ? `${rec.id} · Abono ${fmt(rec.monto)} aplicado · saldo pendiente ${fmt(rec.saldo)}` : `${rec.id} procesado · ${fmt(rec.monto)}`, rec.abono ? 'warn' : 'ok');
    } catch (e) { toast(errMsg(e), 'bad'); } finally { setBusy(false); }
  }, [c, discount, pays, exoPin, expired, busy, toast]);

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
    setQ(''); setCuenta(null); setNotFound(false); setPays(EMPTY_PAY); setDiscount('none'); setKid('all');
    setTimeout(() => searchRef.current?.focus(), 0);
  };

  const onDiscount = (v: string) => {
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
  const pbr = pb('rcpt', 'Imprimir Tirilla', 'ph ph-receipt');
  const docCuadre = (): PDoc => {
    const act = recibos.filter(r => r.est !== 'Anulado'), by: Record<string, number> = {};
    act.forEach(r => { by[r.metodo] = (by[r.metodo] || 0) + r.monto; });
    const tot: [string, string, boolean?][] = [...Object.entries(by).map(([k, v]) => ['Total ' + k, fmt(v)] as [string, string]), ['TOTAL NETO COBRADO', fmt(act.reduce((a, r) => a + r.monto, 0)), true]];
    return { kind: 'carta', name: 'Cuadre de caja', format: 'Carta 8.5 × 11 in', sign: ['Firma del cajero', 'Firma de dirección'], pages: [{ title: 'Cuadre de caja', sub: 'Caja 02 · Turno matutino · ' + hoyDMY(), blocks: [
      B.kv([['Cajero', user?.nombre ?? 'Ana Rosario'], ['Sucursal', 'Principal'], ['Recibos emitidos', String(recibos.length)], ['Anulados', String(recibos.length - act.length)]]),
      B.table(['Recibo', 'NCF', 'Tutor', 'Método', 'Hora', 'Monto', 'Estado'], recibos.map(r => [r.id, r.ncf, r.tutor, r.metodo, r.hora, fmt(r.monto), r.est === 'Anulado' ? 'Anulado' : (r.abono ? 'Abono' : 'Activo')]), ['62px', '92px', '1fr', '70px', '40px', '90px', '52px'], ['left', 'left', 'left', 'left', 'left', 'right', 'left']),
      B.total(tot)] }] };
  };

  const anular = (rc: ReciboFin) =>
    openGuard({
      title: 'Anular recibo ' + rc.id,
      desc: 'El rol Cajero no posee permiso de anulación. La terminal queda en espera hasta que un Super Admin o Director Financiero autorice. Se emitirá una nota de crédito.',
      code: 'ANULAR-' + rc.id, pin: true, label: 'Anular y emitir nota de crédito',
      onOk: async pin => {
        const r = await api.post<ReciboFin>(`/cobros/recibos/${rc.id}/anular`, { pin });
        setCuenta(cu => cu && { ...cu, recibos: cu.recibos.map(x => (x.id === r.id ? r : x)) });
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
          <span className="flex items-center gap-1.5 text-xs text-slate-600"><span className="h-2 w-2 rounded-full bg-green-600" />Caja 02 · Turno Matutino</span>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-xs text-slate-600">
          <Kbd k="F1">Buscar</Kbd><Kbd k="↑↓">Mover</Kbd><Kbd k="Espacio">Marcar</Kbd><Kbd k="F12">Cobrar</Kbd>
          <button onClick={newCobro} className="ml-1.5 flex h-[30px] items-center gap-1.5 rounded-md bg-accent px-3 text-xs font-semibold text-white hover:bg-accent-dark"><i className="ph ph-plus" />Nuevo Cobro</button>
        </div>
      </div>

      <div className="grid min-h-0 flex-1 gap-3" style={{ gridTemplateColumns: wide ? 'minmax(0,68fr) minmax(300px,32fr)' : 'minmax(0,1fr)' }}>
        <div className="flex min-h-0 min-w-0 flex-col gap-3">
          <section className="flex-none rounded-lg border border-slate-200 bg-white p-3 shadow-sm">
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
                <i className="ph ph-clock-counter-clockwise" />Historial de Turno ({recibos.length})
              </button>
            </div>
            {cuenta && (
              <div className="mt-2.5 flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-2.5 text-xs">
                <div className="flex flex-wrap items-center gap-2.5">
                  <span className="text-sm font-semibold">{cuenta.tutor}</span>
                  <span className="font-mono text-xs text-slate-500">{cuenta.cedula}</span>
                  <span className="inline-flex h-[19px] w-[126px] flex-none items-center justify-center whitespace-nowrap rounded border px-[5px] text-[10px] font-semibold leading-none"
                    style={mora ? { background: '#FEE2E2', color: '#B91C1C', borderColor: '#FECACA' } : { background: '#DCFCE7', color: '#15803D', borderColor: '#BBF7D0' }}>
                    {mora ? 'EN MORA · 2 MESES' : 'AL DÍA'}
                  </span>
                </div>
                <div className="flex flex-wrap items-center gap-3 font-medium text-slate-700">
                  <span>Total vencido: <b className="font-mono" style={{ color: venc > 0 ? '#DC2626' : '#16A34A' }}>{fmt(venc)}</b></span>
                  <span className="text-slate-300">|</span>
                  <span>Deuda total: <b className="font-mono text-ink">{fmt(items.reduce((a, i) => a + i.monto, 0))}</b></span>
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
                  <table className="w-full min-w-[760px] border-collapse text-left text-xs">
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
                        <th className="w-[124px] border-b border-slate-200 p-[9px_10px] text-right font-semibold">Monto</th>
                      </tr>
                    </thead>
                    <tbody>
                      {vis.map((i: CobroItem, idx) => {
                        const on = !!sel[i.id];
                        const tn = i.est === 'Vencida' ? TONE.bad : i.est === 'Por vencer' ? TONE.warn : TONE.mute;
                        return (
                          <tr key={i.id} onClick={() => toggle(i.id, idx)} className="h-9 cursor-pointer hover:bg-slate-50"
                            style={{ background: on ? '#EFF6FF' : '#FFFFFF', boxShadow: focus === idx ? 'inset 3px 0 0 #2563EB, inset 0 0 0 1px #BFDBFE' : 'none' }}>
                            <td className="border-b border-slate-100 px-2.5 text-center"><input type="checkbox" readOnly checked={on} className="pointer-events-none h-3.5 w-3.5 accent-accent" /></td>
                            <td className="whitespace-nowrap border-b border-slate-100 px-2.5 font-medium" style={{ color: on ? '#0F172A' : '#334155' }}>{i.con + (i.abono ? ' · saldo tras abono' : '')}</td>
                            <td className="whitespace-nowrap border-b border-slate-100 px-2.5 text-slate-600">{i.al.replace(' · ', ' • ')} Primaria</td>
                            <td className="border-b border-slate-100 px-2.5 text-center font-mono text-[11px] text-slate-500">{i.vence}</td>
                            <td className="border-b border-slate-100 px-2.5 text-center"><Pill tone={tn} w={81}>{i.est}</Pill></td>
                            <td className="border-b border-slate-100 px-2.5 text-right font-mono text-xs text-ink" style={{ fontWeight: on ? 600 : 400 }}>{fmt(i.monto)}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                  {vis.length === 0 && (
                    <div className="flex items-center gap-3.5 px-4 py-7">
                      <span className="grid h-11 w-11 place-items-center rounded-full bg-ok-bg text-[22px] text-green-600"><i className="ph ph-check-circle" /></span>
                      <div><div className="text-sm font-semibold">Sin conceptos pendientes</div><div className="text-[13px] text-slate-600">No hay cuotas abiertas para este filtro en el ciclo 2026–2027.</div></div>
                    </div>
                  )}
                </div>
                <div className="flex flex-none flex-wrap items-center gap-2.5 border-t border-slate-200 bg-slate-50 px-2.5 py-2">
                  <label className="flex items-center gap-1.5 text-xs font-medium text-slate-600">Descuento
                    <select value={discount} onChange={e => onDiscount(e.target.value)} className="h-7 rounded-[5px] border border-slate-300 bg-white px-1.5 text-xs text-ink">
                      <option value="none">Ninguno</option>
                      <option value="pronto">Pronto pago −5% (cuotas futuras)</option>
                      <option value="exo">Exonerar mora (supervisor)</option>
                    </select>
                  </label>
                  <span className="text-[11px] text-slate-500">Beca Plan Hermano −10% ya aplicada a la colegiatura de Sofía.</span>
                </div>
              </>
            ) : (
              <div className="flex max-w-[440px] flex-col items-start gap-2.5 px-6 py-10">
                <span className="grid h-[52px] w-[52px] place-items-center rounded-full bg-blue-50 text-[26px] text-accent"><i className="ph ph-identification-badge" /></span>
                <div className="text-[15px] font-semibold">{notFound ? `Sin coincidencias para «${q}»` : 'Busca un tutor o alumno'}</div>
                <div className="text-[13px] leading-normal text-slate-600">
                  {notFound ? 'Verifica la cédula o RNC. También puedes buscar por matrícula (EST-0412) o por nombre.' : 'Escanea el carnet o escribe cédula, RNC o matrícula. Presiona / para enfocar la búsqueda.'}
                </div>
                <button onClick={() => { setQ(DEMO_Q); void search(DEMO_Q, true); }} className="flex h-[34px] items-center gap-1.5 rounded-md bg-accent px-3.5 text-[13px] font-medium text-white hover:bg-accent-dark">
                  <i className="ph ph-user-focus" />Cargar cuenta de Carlos Mendoza
                </button>
              </div>
            )}
          </section>
        </div>

        <aside className="relative flex min-h-0 flex-col justify-between gap-3.5 overflow-auto rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex min-h-0 flex-col">
            <div className="flex items-center justify-between border-b border-slate-200 pb-2.5">
              <h2 className="m-0 text-sm font-bold">Resumen de Cobro</h2>
              <span className="rounded bg-info-bg px-2 py-0.5 text-[11px] font-semibold text-info-fg">{c.sel.length + (c.sel.length === 1 ? ' Ítem' : ' Ítems')}</span>
            </div>
            <div className="mt-2.5 flex max-h-[200px] flex-col gap-[7px] overflow-auto text-xs">
              {c.sel.map(i => (
                <div key={i.id} className="flex justify-between gap-2.5 text-slate-600">
                  <span className="overflow-hidden text-ellipsis whitespace-nowrap">{i.con} ({KID_NAME[i.kid]})</span>
                  <span className="whitespace-nowrap font-mono text-xs font-medium text-ink">{fmt(i.monto)}</span>
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
            <button onClick={() => void process()} className="flex h-[46px] items-center justify-center gap-2 rounded-md text-sm font-semibold shadow hover:brightness-95"
              style={{ background: c.canPay ? '#2563EB' : '#CBD5E1', color: c.canPay ? '#FFFFFF' : '#64748B', cursor: c.canPay ? 'pointer' : 'not-allowed' }}>
              <span className="rounded bg-slate-900/20 px-1.5 py-0.5 font-mono text-[10px] font-semibold">F12</span>
              {c.abono ? 'Procesar Abono e Imprimir Recibo' : 'Procesar e Imprimir Recibo'}
            </button>
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

      {histOpen && (
        <SideDrawer width={760} z={65} onClose={() => setHistOpen(false)}>
          <div className="flex items-center justify-between gap-2.5 border-b border-slate-200 px-[18px] py-3.5">
            <div>
              <div className="text-[15px] font-semibold">Historial de turno · Caja 02</div>
              <div className="text-xs text-slate-500">Anular requiere clave de supervisor (el cajero no tiene permiso D)</div>
            </div>
            <div className="flex items-center gap-2">
              <button onClick={() => runPrint('cuadre', docCuadre())} className="flex h-[34px] items-center gap-1.5 rounded-md border border-slate-300 bg-white px-3 text-[13px] font-medium hover:bg-slate-100"><i className={pbc.icon} style={{ animation: pbc.spin }} />{pbc.label}</button>
              <button onClick={() => setHistOpen(false)} aria-label="Cerrar" className="h-[34px] w-[34px] rounded-md border border-slate-300 bg-white"><i className="ph ph-x" /></button>
            </div>
          </div>
          <div className="flex gap-6 border-b border-slate-200 px-[18px] py-2.5 text-xs text-slate-600">
            <span>Recibos: <b className="font-mono text-ink">{recibos.length}</b></span>
            <span>Cobrado neto: <b className="font-mono text-ink">{fmt(recibos.filter(r => r.est !== 'Anulado').reduce((a, r) => a + r.monto, 0))}</b></span>
          </div>
          <div className="flex-1 overflow-auto">
            {histRecs.map(rc => {
              const an = rc.est === 'Anulado';
              const t = an ? TONE.bad : TONE.ok;
              return (
                <div key={rc.id} className="grid grid-cols-[84px_minmax(0,1fr)_120px_140px_74px] items-center gap-2.5 border-b border-slate-100 px-[18px] py-2.5 text-xs">
                  <div className="flex flex-col gap-0.5"><span className="font-mono text-xs font-semibold">{rc.id}</span><span className="font-mono text-[11px] text-slate-500">{rc.hora}</span></div>
                  <div className="flex min-w-0 flex-col gap-0.5"><span className="overflow-hidden text-ellipsis whitespace-nowrap font-medium">{rc.tutor}</span><span className="font-mono text-[11px] text-slate-500">{rc.ncf} · {rc.metodo}</span></div>
                  <span className="text-right font-mono text-xs font-semibold" style={{ textDecoration: an ? 'line-through' : 'none' }}>{fmt(rc.monto)}</span>
                  <span><Pill tone={t} w={148}>{an ? 'Anulado · ' + rc.nc : rc.abono ? 'Abono · saldo ' + fmt(rc.saldo) : 'Activo'}</Pill></span>
                  <button disabled={an} onClick={() => anular(rc)} className="h-7 rounded-[5px] border border-red-300 bg-white text-xs font-medium text-red-600 hover:bg-bad-bg" style={{ opacity: an ? 0.4 : 1 }}>Anular</button>
                </div>
              );
            })}
          </div>
        </SideDrawer>
      )}

      {receipt && (
        <div className="fixed inset-0 z-[70] grid place-items-center bg-slate-900/50 p-5">
          <div className="w-[420px] max-w-full overflow-hidden rounded-[10px] bg-white shadow-2xl">
            <div className="flex items-center gap-3 border-b border-slate-200 px-5 py-[18px]">
              <i className="ph-fill ph-check-circle text-[28px] text-green-600" />
              <div><div className="text-base font-semibold">{receipt.abono ? 'Abono registrado' : 'Pago procesado'}</div><div className="text-xs text-slate-600">Factura electrónica firmada · XML/PDF generados</div></div>
            </div>
            <div className="flex flex-col gap-1.5 px-5 py-4 text-[13px]">
              <div className="flex justify-between"><span className="text-slate-500">Recibo</span><span className="font-mono">{receipt.id}</span></div>
              <div className="flex justify-between"><span className="text-slate-500">NCF</span><span className="font-mono">{receipt.ncf}</span></div>
              <div className="flex justify-between"><span className="text-slate-500">Tutor</span><span>{receipt.tutor}</span></div>
              <div className="my-1.5 border-t border-dashed border-slate-200" />
              {receipt.items.map((ri, k) => <div key={k} className="flex justify-between gap-2.5"><span className="text-slate-700">{ri.con}</span><span className="font-mono">{fmt(ri.monto)}</span></div>)}
              <div className="my-1.5 border-t border-dashed border-slate-200" />
              {receipt.pays.map((rp, k) => <div key={k} className="flex justify-between"><span className="text-slate-500">{rp.m} <span className="font-mono">{rp.r}</span></span><span className="font-mono">{fmt(rp.amt)}</span></div>)}
              <div className="mt-1 flex justify-between text-[15px] font-semibold"><span>{receipt.abono ? 'Abono' : 'Total'}</span><span className="font-mono">{fmt(receipt.monto)}</span></div>
              {receipt.abono && <div className="flex justify-between font-semibold text-warn-fg"><span>Saldo pendiente</span><span className="font-mono">{fmt(receipt.saldo)}</span></div>}
              {receipt.change > 0 && <div className="flex justify-between text-ok-fg"><span>Cambio a devolver</span><span className="font-mono font-semibold">{fmt(receipt.change)}</span></div>}
            </div>
            <div className="flex justify-end gap-2 border-t border-slate-200 bg-slate-50 px-5 py-3.5">
              <button onClick={() => setReceipt(null)} className="h-9 rounded-md border border-slate-300 bg-white px-3.5 text-[13px] font-medium">Cerrar</button>
              <button onClick={() => toast('Recibo enviado por correo a c.mendoza@correo.do', 'ok')} className="flex h-[34px] items-center gap-1.5 rounded-md border border-slate-300 bg-white px-3 text-[13px] font-medium hover:bg-slate-100"><i className="ph ph-envelope-simple" />Enviar por Correo</button>
              <button onClick={() => runPrint('rcpt', docTirilla(receipt, user?.nombre))} className="flex h-9 items-center gap-1.5 rounded-md border border-accent bg-white px-3.5 text-[13px] font-semibold text-accent hover:bg-blue-50"><i className={pbr.icon} style={{ animation: pbr.spin }} />{pbr.label}</button>
            </div>
          </div>
        </div>
      )}

      {guard && <SupervisorGuardModal cfg={guard} onClose={() => setGuard(null)} />}
      {toasts}
    </div>
  );
}
