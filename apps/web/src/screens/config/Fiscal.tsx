import { useMemo, useState, type ReactNode } from 'react';
import type { CfgNcf, ConfigGlobal, ModalidadFiscal, SecuenciaNuevaReq, TipoLogico } from '@stodia/shared';
import SegTabs from '../../components/SegTabs';
import { btn, btnPrimary, card, input, pill, pillBase, td, th, type PillTone } from '../../components/system/styles';
import { Modal, useToast } from '../../components/system/UiProvider';
import { api } from '../../lib/api';

/**
 * Configuración › Gestión fiscal (DGII): «Secuencias de comprobantes fiscales» (físicos B / electrónicos E), «Modalidad por tipo de comprobante» y certificado e-CF.
 * Registrar / desactivar / reactivar / prorrogar / eliminar y cambiar la modalidad exigen el PIN de supervisor (también al Super Admin). Este sistema NO firma ni
 * transmite e-NCF a la DGII (docs/fiscal-ncf.md): los e-NCF quedan «Pendiente de envío».
 */
const label = 'flex flex-col gap-1 text-xs font-medium text-slate-600';
const n0 = (n: number) => n.toLocaleString('en-US');
const fmtFecha = (iso?: string | null) => (iso ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}` : '—');
const diasHasta = (iso: string) => Math.round((Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10)) - Date.UTC(new Date().getFullYear(), new Date().getMonth(), new Date().getDate())) / 86_400_000);
const LARGO: Record<ModalidadFiscal, number> = { FISICA: 8, ELECTRONICA: 10 };

/** Tipos que se usan en Cobros (y notas, etapa 2) con su par físico/electrónico, en el orden del panel de modalidad. */
const PARES: { logico: TipoLogico; nombre: string; b: string; e: string; nota?: string }[] = [
  { logico: 'CREDITO_FISCAL', nombre: 'Crédito fiscal', b: 'B01', e: 'E31' },
  { logico: 'CONSUMO', nombre: 'Consumo', b: 'B02', e: 'E32' },
  { logico: 'REGIMEN_ESPECIAL', nombre: 'Régimen especial', b: 'B14', e: 'E44' },
  { logico: 'GUBERNAMENTAL', nombre: 'Gubernamental', b: 'B15', e: 'E45' },
  { logico: 'NOTA_DEBITO', nombre: 'Nota de débito', b: 'B03', e: 'E33', nota: 'Etapa 2' },
  { logico: 'NOTA_CREDITO', nombre: 'Nota de crédito', b: 'B04', e: 'E34', nota: 'Etapa 2 · hoy se usa al anular un recibo' },
];

function PinModal({ title, desc, confirmLabel, warn, onClose, onConfirm, danger }: { title: string; desc?: ReactNode; confirmLabel: string; warn?: string; danger?: boolean; onClose: () => void; onConfirm: (pin: string) => Promise<boolean> }) {
  const [pin, setPin] = useState('');
  const [busy, setBusy] = useState(false);
  const go = async () => { setBusy(true); try { if (await onConfirm(pin)) onClose(); } finally { setBusy(false); } };
  return (
    <Modal onClose={onClose} width={420} z={90}>
      <div className="flex flex-col gap-3 p-5">
        <div className="text-base font-semibold">{title}</div>
        {desc && <div className="text-[13px] leading-normal text-slate-600">{desc}</div>}
        {warn && <div className="flex gap-2 rounded-md bg-warn-bg px-3 py-2 text-xs font-medium text-warn-fg"><i className="ph ph-warning mt-px" /><span>{warn}</span></div>}
        <label className={label}>Clave de supervisor
          <input type="password" autoFocus autoComplete="off" value={pin} onChange={e => setPin(e.target.value)} onKeyDown={e => e.key === 'Enter' && pin.length >= 4 && !busy && void go()} className={`${input} font-mono`} data-testid="fiscal-pin" />
        </label>
        <div className="flex justify-end gap-2">
          <button onClick={onClose} className={btn}>Cancelar</button>
          <button onClick={() => void go()} disabled={pin.length < 4 || busy} className={`${danger ? 'inline-flex h-[34px] items-center gap-1.5 rounded-md bg-[#DC2626] px-3.5 text-[13px] font-medium text-white disabled:opacity-50' : btnPrimary}`} data-testid="fiscal-pin-ok">{confirmLabel}</button>
        </div>
      </div>
    </Modal>
  );
}

interface Form { modalidad: ModalidadFiscal; tipo: string; serie: string; desde: string; hasta: string; actual: string; vence: string; autorizacion: string; umbral: string; pin: string }

function RegistrarModal({ cfg, modalidad, onClose, onDone }: { cfg: ConfigGlobal; modalidad: ModalidadFiscal; onClose: () => void; onDone: () => Promise<void> }) {
  const toast = useToast();
  const tiposDe = (m: ModalidadFiscal) => cfg.tiposComprobante.filter(t => t.modalidad === m);
  const [f, setF] = useState<Form>({ modalidad, tipo: (tiposDe(modalidad).find(t => t.logico === 'CONSUMO') ?? tiposDe(modalidad)[0]).codigo, serie: '', desde: '1', hasta: '', actual: '', vence: '', autorizacion: '', umbral: '10', pin: '' });
  const [busy, setBusy] = useState(false);
  const set = (k: keyof Form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setF({ ...f, [k]: e.target.value });
  const num = (k: 'desde' | 'hasta' | 'actual') => (e: React.ChangeEvent<HTMLInputElement>) => setF({ ...f, [k]: e.target.value.replace(/\D/g, '') });
  const tipo = cfg.tiposComprobante.find(t => t.codigo === f.tipo);
  const L = LARGO[f.modalidad], max = 10 ** L - 1;
  const desde = parseInt(f.desde, 10), hasta = parseInt(f.hasta, 10), actual = f.actual === '' ? desde - 1 : parseInt(f.actual, 10);
  const choca = cfg.ncf.find(s => s.pref === f.tipo && s.modalidad === f.modalidad && desde <= s.hasta && hasta >= s.desde);
  const hoy = new Date().toISOString().slice(0, 10);
  const err = !(desde >= 1) ? 'Indica «desde» (1 o más)' : !(hasta >= desde) ? '«Hasta» debe ser mayor o igual que «desde»' : hasta > max ? `Máximo ${n0(max)} (${L} dígitos de secuencial)` : !(actual >= desde - 1 && actual <= hasta) ? '«Último usado» debe estar entre desde−1 y hasta' : choca ? `Se solapa con ${n0(choca.desde)}–${n0(choca.hasta)}` : f.vence && f.vence < hoy ? 'El vencimiento ya pasó' : !(+f.umbral >= 1 && +f.umbral <= 50) ? 'El umbral va de 1 a 50 %' : f.pin.length < 4 ? 'Escribe la clave de supervisor' : '';
  const ejemplo = tipo ? tipo.codigo + String(Number.isFinite(desde) && desde >= 1 ? desde : 1).padStart(L, '0') : '';
  const submit = async () => {
    setBusy(true);
    try {
      const body: SecuenciaNuevaReq = { tipo: f.tipo, modalidad: f.modalidad, prefijo: f.modalidad === 'ELECTRONICA' ? 'E' : 'B', serie: f.serie.trim(), desde, hasta, ...(f.actual !== '' ? { actual } : {}), ...(f.vence ? { vence: f.vence } : {}), autorizacion: f.autorizacion.trim(), umbral: +f.umbral, pin: f.pin };
      await api.post('/config/fiscal/secuencias', body);
      await onDone();
      toast(`Autorización ${f.tipo} registrada (${n0(desde)}–${n0(hasta)})`, 'ok');
      onClose();
    } catch (e) { toast((e as Error).message, 'bad'); } finally { setBusy(false); }
  };
  return (
    <Modal onClose={onClose} width={560} z={90}>
      <div className="flex max-h-[88vh] flex-col overflow-y-auto">
        <div className="border-b border-slate-200 px-5 py-4"><div className="text-base font-semibold">Registrar autorización DGII</div><div className="text-xs text-slate-500">Rango de comprobantes autorizado por la DGII. Se usa en orden de vencimiento; al agotarse o vencer pasa a la siguiente.</div></div>
        <div className="grid grid-cols-2 gap-3 px-5 py-4 max-[560px]:grid-cols-1">
          <div className={`${label} col-span-2 max-[560px]:col-span-1`}>Modalidad
            <SegTabs<ModalidadFiscal> value={f.modalidad} onChange={m => setF({ ...f, modalidad: m, tipo: (tiposDe(m).find(t => t.logico === (tipo?.logico ?? 'CONSUMO')) ?? tiposDe(m)[0]).codigo })} options={[{ k: 'FISICA', label: 'Física · NCF serie B' }, { k: 'ELECTRONICA', label: 'Electrónica · e-NCF serie E' }]} />
          </div>
          <label className={`${label} col-span-2 max-[560px]:col-span-1`}>Tipo de comprobante
            <select value={f.tipo} onChange={set('tipo')} className={input} data-testid="fiscal-tipo">
              {tiposDe(f.modalidad).map(t => <option key={t.codigo} value={t.codigo}>{t.codigo} · {t.nombre}</option>)}
            </select>
            {tipo?.nota && <span className="text-[11px] font-normal text-slate-500">{tipo.nota}</span>}
          </label>
          <label className={label}>Prefijo<input value={f.modalidad === 'ELECTRONICA' ? 'E' : 'B'} readOnly className={`${input} bg-slate-50 font-mono`} /></label>
          <label className={label}>Serie (opcional)<input value={f.serie} onChange={set('serie')} maxLength={10} className={`${input} font-mono`} /></label>
          <label className={label}>Desde<input value={f.desde} onChange={num('desde')} className={`${input} font-mono`} data-testid="fiscal-desde" /></label>
          <label className={label}>Hasta<input value={f.hasta} onChange={num('hasta')} className={`${input} font-mono`} data-testid="fiscal-hasta" /></label>
          <label className={label}>Último número usado (opcional)<input value={f.actual} onChange={num('actual')} placeholder={String(Number.isFinite(desde) ? desde - 1 : 0)} className={`${input} font-mono`} /></label>
          <label className={label}>Vence (autorización DGII)<input type="date" value={f.vence} min={hoy} onChange={set('vence')} className={input} data-testid="fiscal-vence" /></label>
          <label className={label}>Número de autorización DGII<input value={f.autorizacion} onChange={set('autorizacion')} maxLength={60} className={`${input} font-mono`} data-testid="fiscal-aut" /></label>
          <label className={label}>Alerta al quedar (%)<input value={f.umbral} onChange={e => setF({ ...f, umbral: e.target.value.replace(/D/g, '') })} className={`${input} font-mono`} /></label>
          <label className={`${label} col-span-2 max-[560px]:col-span-1`}>Clave de supervisor<input type="password" autoComplete="off" value={f.pin} onChange={set('pin')} className={`${input} font-mono`} data-testid="fiscal-pin" /></label>
        </div>
        <div className="mx-5 mb-3 rounded-md bg-slate-50 px-3 py-2 text-xs text-slate-600">
          Formato: <b className="font-mono">{tipo?.codigo ?? '—'} + {L} dígitos = {3 + L} caracteres</b> · primer número <span className="font-mono">{ejemplo}</span>
          {f.modalidad === 'ELECTRONICA' && <div className="mt-1 text-warn-fg">Un e-NCF necesita certificado digital y transmisión a la DGII, que este sistema no realiza: los recibos quedan «Pendiente de envío».</div>}
        </div>
        {err && f.hasta !== '' && <div className="mx-5 mb-3 text-xs font-medium text-[#DC2626]" data-testid="fiscal-err">{err}</div>}
        <div className="flex justify-end gap-2 border-t border-slate-200 bg-slate-50 px-5 py-3">
          <button onClick={onClose} className={btn}>Cancelar</button>
          <button onClick={() => void submit()} disabled={!!err || busy} className={btnPrimary} data-testid="fiscal-registrar-ok"><i className="ph ph-check" />Registrar</button>
        </div>
      </div>
    </Modal>
  );
}

function estadoInfo(s: CfgNcf): { tone: PillTone; txt: string; bar: string; fg: string; bajo: boolean } {
  const total = s.total ?? s.hasta - s.desde + 1, disp = s.disponibles ?? 0, bajo = s.estado === 'Activa' && total > 0 && (disp / total) * 100 <= s.umbral;
  const tone: PillTone = s.estado === 'Activa' ? (bajo ? 'warn' : 'ok') : s.estado === 'Inactiva' ? 'mute' : 'bad';
  return { tone, txt: s.estado ?? 'Activa', bajo, bar: tone === 'ok' ? 'bg-[#16A34A]' : tone === 'warn' ? 'bg-[#D97706]' : tone === 'mute' ? 'bg-slate-400' : 'bg-[#DC2626]', fg: tone === 'ok' ? 'text-ok-fg' : tone === 'warn' ? 'text-warn-fg' : tone === 'mute' ? 'text-slate-500' : 'text-bad-fg' };
}

export default function Fiscal({ cfg, reload }: { cfg: ConfigGlobal; reload: () => Promise<void> }) {
  const toast = useToast();
  const [tab, setTab] = useState<ModalidadFiscal>('FISICA');
  const [reg, setReg] = useState(false);
  const [pin, setPin] = useState<null | { title: string; desc?: ReactNode; label: string; warn?: string; danger?: boolean; run: (pin: string) => Promise<boolean> }>(null);
  const [vence, setVence] = useState<{ s: CfgNcf; fecha: string } | null>(null);
  const [um, setUm] = useState<Record<string, string>>({});
  const filas = useMemo(() => cfg.ncf.filter(s => (s.modalidad ?? 'FISICA') === tab), [cfg.ncf, tab]);
  const nF = cfg.ncf.filter(s => (s.modalidad ?? 'FISICA') === 'FISICA').length, nE = cfg.ncf.length - nF;
  const tipoPor = (pref: string) => cfg.tiposComprobante.find(t => t.codigo === pref);

  const withPin = (title: string, label: string, run: (pin: string) => Promise<boolean>, o: { desc?: ReactNode; warn?: string; danger?: boolean } = {}) => setPin({ title, label, run, ...o });
  const exec = (fn: (pin: string) => Promise<unknown>, ok: string) => async (p: string) => {
    try { await fn(p); await reload(); toast(ok, 'ok'); return true; } catch (e) { toast((e as Error).message, 'bad'); return false; }
  };
  const saveUm = async (s: CfgNcf) => {
    const raw = um[s.id!] ?? String(s.umbral), v = parseInt(raw, 10);
    if (!(v >= 1 && v <= 50)) return toast('El umbral debe estar entre 1 y 50 %', 'bad');
    if (v === s.umbral) return;
    try { await api.put('/config/fiscal/secuencias/' + encodeURIComponent(s.id!), { umbral: v }); await reload(); toast(`Alerta de ${s.pref} al ${v}% restante`, 'ok'); } catch (e) { toast((e as Error).message, 'bad'); }
  };
  const cambiarEstado = (s: CfgNcf, estado: 'Activa' | 'Inactiva') => withPin(estado === 'Inactiva' ? `Desactivar ${s.pref} ${fmtRango(s)}` : `Reactivar ${s.pref} ${fmtRango(s)}`, estado === 'Inactiva' ? 'Desactivar' : 'Reactivar',
    exec(p => api.put('/config/fiscal/secuencias/' + encodeURIComponent(s.id!), { estado, pin: p }), estado === 'Inactiva' ? 'Secuencia desactivada: no se usará al cobrar' : 'Secuencia reactivada'),
  { desc: estado === 'Inactiva' ? 'Mientras esté inactiva no se emitirán comprobantes con este rango.' : undefined, danger: estado === 'Inactiva' });
  const eliminar = (s: CfgNcf) => withPin(`Eliminar ${s.pref} ${fmtRango(s)}`, 'Eliminar', exec(p => api.del('/config/fiscal/secuencias/' + encodeURIComponent(s.id!), { pin: p }), 'Secuencia eliminada'), { desc: 'Solo se puede eliminar una secuencia que nunca emitió comprobantes.', danger: true });
  const fmtRango = (s: CfgNcf) => `${n0(s.desde)}–${n0(s.hasta)}`;

  const modalidadDe = (l: TipoLogico): ModalidadFiscal => cfg.modalidadFiscal?.[l] ?? 'FISICA';
  const hayElectronica = (cod: string) => cfg.ncf.some(s => s.pref === cod && s.modalidad === 'ELECTRONICA' && s.estado === 'Activa');
  const cambiarModalidad = (p: (typeof PARES)[number], m: ModalidadFiscal) => {
    if (modalidadDe(p.logico) === m) return;
    const sinCert = m === 'ELECTRONICA' && !cfg.ecf;
    withPin(`${p.nombre}: pasar a ${m === 'ELECTRONICA' ? `electrónico (${p.e})` : `físico (${p.b})`}`, 'Confirmar cambio', exec(async pin => {
      await api.put('/config/fiscal/modalidad', { tipo: p.logico, modalidad: m, confirmar: sinCert, pin });
    }, `${p.nombre} se emitirá como ${m === 'ELECTRONICA' ? p.e + ' (e-NCF)' : p.b + ' (NCF)'}`), {
      desc: `Desde ahora, cobrar ${p.nombre.toLowerCase()} usará ${m === 'ELECTRONICA' ? `la serie ${p.e} (13 caracteres)` : `la serie ${p.b} (11 caracteres)`}.`,
      warn: sinCert ? 'No hay certificado digital e-CF cargado: los comprobantes no podrán firmarse ni transmitirse a la DGII y quedarán «Pendiente de envío». Confirma solo si lo preparas para después.' : m === 'ELECTRONICA' ? 'Este sistema no transmite a la DGII: los e-NCF quedan «Pendiente de envío».' : undefined,
    });
  };

  return (
    <div className="flex flex-col gap-3.5">
      <section className={`${card} overflow-hidden`}>
        <div className="flex flex-wrap items-center justify-between gap-2.5 border-b border-slate-200 px-4 py-3">
          <span className="text-sm font-semibold">Secuencias de comprobantes fiscales</span>
          <div className="flex flex-wrap items-center gap-2.5">
            <SegTabs<ModalidadFiscal> value={tab} onChange={setTab} options={[{ k: 'FISICA', label: 'Físicos', icon: 'ph ph-printer', n: nF }, { k: 'ELECTRONICA', label: 'Electrónicos', icon: 'ph ph-lightning', n: nE }]} />
            <button onClick={() => setReg(true)} className={btn} data-testid="fiscal-registrar"><i className="ph ph-plus" />Registrar autorización DGII</button>
          </div>
        </div>
        {tab === 'ELECTRONICA' && (
          <div className="flex flex-wrap items-center gap-2 border-b border-slate-200 bg-warn-bg px-4 py-2 text-xs font-medium text-warn-fg">
            <i className="ph ph-info" />
            <span>Facturación electrónica: este sistema reserva y asigna el e-NCF, pero <b>no genera el XML firmado ni lo transmite a la DGII</b>. Los recibos quedan «Pendiente de envío». {cfg.ecf ? '' : 'Además no hay certificado e-CF cargado.'}</span>
          </div>
        )}
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1080px] border-collapse text-[13px]" data-testid="fiscal-tabla">
            <thead><tr>
              {['Tipo', 'Rango', 'Actual', 'Disponibles', 'Consumo', 'Vence', 'Estado', 'Autorización', 'Alerta %', ''].map((c, i) => <th key={c + i} className={`${th} ${[1, 2, 3, 8].includes(i) ? '!text-right' : ''}`}>{c}</th>)}
            </tr></thead>
            <tbody>
              {filas.length === 0 && (
                <tr><td colSpan={10} className="px-4 py-8 text-center text-[13px] text-slate-500">
                  {tab === 'FISICA' ? 'Registra tus autorizaciones DGII (B01, B02…): sin una secuencia disponible no se puede emitir ningún comprobante.' : 'No hay secuencias electrónicas. Registra una autorización (E31, E32…) para emitir e-NCF.'}
                </td></tr>
              )}
              {filas.map(s => {
                const e = estadoInfo(s), total = s.total ?? 0, pct = total ? ((s.usados ?? 0) >= total ? 100 : Math.min(99, Math.floor(((s.usados ?? 0) / total) * 100))) : 0;
                const dias = s.vence ? diasHasta(s.vence) : null, usada = (s.actual ?? 0) >= s.desde;
                return (
                  <tr key={s.id} className="h-[52px]" data-seq={s.id}>
                    <td className={td}><span className="font-mono font-semibold">{s.pref}</span> <span className="text-slate-600">{tipoPor(s.pref)?.nombre ?? s.tipo}</span></td>
                    <td className={`${td} whitespace-nowrap text-right font-mono text-xs text-slate-600`}>{n0(s.desde)} – {n0(s.hasta)}</td>
                    <td className={`${td} text-right font-mono font-medium`}>{(s.actual ?? 0) >= s.desde ? n0(s.actual ?? 0) : '—'}</td>
                    <td className={`${td} text-right font-mono font-semibold ${e.fg}`}>{n0(s.disponibles ?? 0)}</td>
                    <td className={`${td} w-32`}><div className="h-1.5 overflow-hidden rounded-full bg-slate-200"><div className={`h-full ${e.bar}`} style={{ width: pct + '%' }} /></div><div className="mt-0.5 text-[10px] text-slate-500">{pct}% usado</div></td>
                    <td className={`${td} whitespace-nowrap`}>
                      <div className="font-mono text-xs">{fmtFecha(s.vence)}</div>
                      {dias !== null && dias < 0 && <span className={`${pillBase} mt-0.5 px-2 ${pill.bad}`}>Vencida</span>}
                      {dias !== null && dias >= 0 && dias <= 30 && <span className={`${pillBase} mt-0.5 px-2 ${pill.warn}`} data-testid="vence-pronto">Vence en {dias} día{dias === 1 ? '' : 's'}</span>}
                    </td>
                    <td className={td}><span className={`${pillBase} w-[76px] ${pill[e.tone]}`}>{e.txt}</span>{e.bajo && <span className={`${pillBase} ml-1 px-2 ${pill.warn}`}>Por agotar</span>}</td>
                    <td className={`${td} max-w-[180px] truncate font-mono text-xs text-slate-600`} title={s.autorizacion}>{s.autorizacion || '—'}</td>
                    <td className={`${td} text-right`}>
                      <input value={um[s.id!] ?? String(s.umbral)} onChange={ev => setUm({ ...um, [s.id!]: ev.target.value })} onBlur={() => void saveUm(s)} className="h-[30px] w-14 rounded-md border border-slate-300 px-1.5 text-right font-mono text-[13px] text-ink" aria-label={'Alerta ' + s.pref} />
                    </td>
                    <td className={`${td} whitespace-nowrap text-right`}>
                      {s.estado === 'Inactiva' ? <button onClick={() => cambiarEstado(s, 'Activa')} className="h-[28px] rounded-md border border-slate-300 bg-white px-2 text-xs font-medium hover:bg-slate-100">Reactivar</button>
                        : s.estado === 'Agotada' ? null : <button onClick={() => cambiarEstado(s, 'Inactiva')} className="h-[28px] rounded-md border border-slate-300 bg-white px-2 text-xs font-medium hover:bg-slate-100">Desactivar</button>}
                      {s.estado !== 'Agotada' && <button onClick={() => setVence({ s, fecha: s.vence ?? '' })} title="Cambiar vencimiento (prórroga)" className="ml-1 h-[28px] rounded-md border border-slate-300 bg-white px-2 text-xs hover:bg-slate-100"><i className="ph ph-calendar" /></button>}
                      <button onClick={() => (usada ? toast('Esta secuencia ya emitió comprobantes: por trazabilidad fiscal no se elimina. Desactívala para que no se use más.', 'warn') : eliminar(s))} title={usada ? 'Ya emitió comprobantes: no se elimina' : 'Eliminar (sin uso)'} className={`ml-1 h-[28px] rounded-md border border-slate-300 bg-white px-2 text-xs ${usada ? 'opacity-40' : 'hover:bg-bad-bg'}`}><i className="ph ph-trash" /></button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      <section className={`${card} overflow-hidden`}>
        <div className="border-b border-slate-200 px-4 py-3">
          <div className="text-sm font-semibold">Modalidad por tipo de comprobante</div>
          <div className="text-xs text-slate-500">Define si Cobros emite cada tipo como NCF físico (serie B) o e-NCF electrónico (serie E). Solo se puede pasar a electrónico con una secuencia electrónica activa del tipo.</div>
        </div>
        {PARES.map(p => {
          const m = modalidadDe(p.logico), puedeE = hayElectronica(p.e);
          return (
            <div key={p.logico} className="flex flex-wrap items-center gap-3 border-b border-slate-100 px-4 py-2.5" data-modalidad={p.logico}>
              <span className="w-[150px] text-[13px] font-medium">{p.nombre}</span>
              <span className={`${pillBase} w-[92px] ${m === 'ELECTRONICA' ? pill.info : pill.mute}`}><span className="font-mono">{m === 'ELECTRONICA' ? p.e : p.b}</span>&nbsp;· {m === 'ELECTRONICA' ? 'e-NCF' : 'NCF'}</span>
              <div className="flex gap-0.5 rounded-lg bg-mute-bg p-[3px]" role="group" aria-label={'Modalidad ' + p.nombre}>
                <button onClick={() => cambiarModalidad(p, 'FISICA')} className={`h-7 rounded-md px-3 text-xs font-medium ${m === 'FISICA' ? 'bg-white text-ink shadow-[0_1px_2px_rgba(15,23,42,0.12)]' : 'text-slate-600'}`}>Físico {p.b}</button>
                <button onClick={() => (puedeE || m === 'ELECTRONICA' ? cambiarModalidad(p, 'ELECTRONICA') : toast(`Registra primero una autorización electrónica activa de ${p.e} (pestaña Electrónicos)`, 'warn'))} title={puedeE ? '' : `Sin secuencia ${p.e} activa`}
                  className={`h-7 rounded-md px-3 text-xs font-medium ${m === 'ELECTRONICA' ? 'bg-white text-ink shadow-[0_1px_2px_rgba(15,23,42,0.12)]' : puedeE ? 'text-slate-600' : 'text-slate-400'}`}>Electrónico {p.e}</button>
              </div>
              <span className="min-w-[160px] flex-1 text-[11px] text-slate-500">{p.nota ?? (m === 'ELECTRONICA' && !cfg.ecf ? 'Sin certificado e-CF: queda pendiente de envío' : '')}</span>
            </div>
          );
        })}
      </section>

      <section className={`${card} flex flex-wrap items-center gap-3.5 p-4`}>
        <span className="grid h-11 w-11 place-items-center rounded-lg bg-slate-100 text-[22px] text-slate-600"><i className="ph ph-certificate" /></span>
        <div className="min-w-[220px] flex-1">
          <div className="text-sm font-semibold">Certificado digital e-CF</div>
          <div className={`text-xs ${cfg.ecf ? 'text-ok-fg' : 'text-warn-fg'}`}>{cfg.ecf ? [cfg.ecfInfo?.archivo || 'Certificado cargado', cfg.ecfInfo?.vence ? `vence ${cfg.ecfInfo.vence}` : ''].filter(Boolean).join(' · ') : 'Sin certificado: no se pueden firmar comprobantes electrónicos'}</div>
          <div className="mt-0.5 flex items-center gap-1.5 text-[11px] text-slate-500"><i className="ph ph-lock-key" />Almacenado cifrado (AES-256) en Key Vault · nunca se muestra ni se descarga</div>
        </div>
        <button onClick={async () => { try { await api.post('/config/ecf'); await reload(); toast('Certificado cargado y cifrado en el Key Vault', 'ok'); } catch (e) { toast((e as Error).message, 'bad'); } }} className={btn}><i className="ph ph-upload-simple" />{cfg.ecf ? 'Reemplazar certificado' : 'Cargar certificado'}</button>
      </section>

      {reg && <RegistrarModal cfg={cfg} modalidad={tab} onClose={() => setReg(false)} onDone={reload} />}
      {pin && <PinModal title={pin.title} desc={pin.desc} warn={pin.warn} danger={pin.danger} confirmLabel={pin.label} onClose={() => setPin(null)} onConfirm={pin.run} />}
      {vence && (
        <PinModal title={`Vencimiento de ${vence.s.pref} ${fmtRango(vence.s)}`} confirmLabel="Guardar vencimiento"
          desc={<label className={label}>Nueva fecha de vencimiento de la autorización<input type="date" value={vence.fecha} onChange={e => setVence({ ...vence, fecha: e.target.value })} className={input} /></label>}
          onClose={() => setVence(null)} onConfirm={exec(p => api.put('/config/fiscal/secuencias/' + encodeURIComponent(vence.s.id!), { vence: vence.fecha || null, pin: p }), 'Vencimiento actualizado')} />
      )}
    </div>
  );
}
