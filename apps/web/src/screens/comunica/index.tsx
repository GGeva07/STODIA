import { SL_MSG, useSoloLectura } from '../../lib/ciclo';
import { AvisoBorrador, useDraft } from '../../lib/useDraft';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { CmnCanal, CmnDestinatarios, CmnEnviarRes, CmnMensajeDto } from '@stodia/shared';
import { api } from '../../lib/api';
import { useToastStack } from '../../components/useToastStack';

const fmt = (n: number) => 'RD$ ' + n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const errMsg = (e: unknown) => (e instanceof Error ? e.message : 'Error inesperado');
const CN: CmnCanal[] = ['Correo', 'Push', 'SMS', 'WhatsApp'];
const CI: Record<CmnCanal, string> = { Correo: 'ph ph-envelope-simple', Push: 'ph ph-bell', SMS: 'ph ph-chat-text', WhatsApp: 'ph ph-whatsapp-logo' };
const OF: [string, string][] = [['', 'Todos'], ['En cola', 'En cola'], ['Entregado', 'Entregados'], ['Fallido', 'Fallidos'], ['Canal no configurado', 'Sin canal']];
const TONE = { Entregado: ['#DCFCE7', '#15803D'], Fallido: ['#FEE2E2', '#B91C1C'], 'En cola': ['#FEF3C7', '#B45309'], Enviando: ['#DBEAFE', '#1D4ED8'], 'Canal no configurado': ['#F1F5F9', '#475569'] } as const;
const SEL = 'h-9 w-full rounded-md border border-slate-300 bg-white px-2 text-[13px] text-ink';
const TH = 'whitespace-nowrap border-b border-slate-200 bg-slate-50 px-3 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wide text-slate-600';

interface Bandeja { rows: CmnMensajeDto[]; conteos: Record<string, number> }

export default function Screen() {
  const { toast, toasts } = useToastStack();
  const sl = useSoloLectura(); // Fase 2D: en otro ciclo los destinatarios se consultan pero no se envía nada
  // Mensaje en redacción: se conserva al navegar; al enviarlo con éxito se vacían asunto y mensaje.
  const [tab, setTab] = useDraft<'write' | 'out'>('comunica:tab', 'write');
  const [f, setF, , metaF] = useDraft('comunica:form', { grado: '', tanda: '', cuenta: 'mora', canales: [true, true, false, false], asunto: '', msg: '' });
  const [dest, setDest] = useState<CmnDestinatarios>({ tutores: [], muestra: null });
  const [filtro, setFiltro] = useDraft('comunica:filtro', '');
  const [band, setBand] = useState<Bandeja>({ rows: [], conteos: {} });
  const [batch, setBatch] = useState<string | null>(null);
  const [progress, setProgress] = useState({ hechos: 0, total: 0 });
  const [polling, setPolling] = useState(false);
  const batchRef = useRef<string | null>(null);
  batchRef.current = batch;

  useEffect(() => {
    const q = new URLSearchParams({ grado: f.grado, tanda: f.tanda, cuenta: f.cuenta });
    api.get<CmnDestinatarios>('/comunica/destinatarios?' + q).then(setDest).catch(e => toast(errMsg(e), 'bad'));
  }, [f.grado, f.tanda, f.cuenta, toast]);

  const loadBandeja = useCallback(
    () => api.get<Bandeja>('/comunica/bandeja' + (filtro ? '?estado=' + encodeURIComponent(filtro) : '')).then(setBand).catch(e => toast(errMsg(e), 'bad')),
    [filtro, toast],
  );
  useEffect(() => { void loadBandeja(); }, [loadBandeja]);

  // Cola de envío: el servidor procesa lotes pequeños; no bloquea la interfaz.
  useEffect(() => {
    if (!polling) return;
    let busy = false;
    const iv = setInterval(async () => {
      if (busy) return; // un envío SMTP puede tardar varios segundos: no se solapan llamadas
      busy = true;
      try {
        const r = await api.post<{ restantes: number; lote: { total: number; hechos: number; fallidos: number; sinCanal: number } }>('/comunica/procesar' + (batchRef.current ? '?batch=' + batchRef.current : ''));
        setProgress({ hechos: r.lote.hechos, total: r.lote.total });
        void loadBandeja();
        if (r.restantes === 0) {
          setPolling(false);
          const malos = r.lote.fallidos + r.lote.sinCanal;
          toast('Cola procesada' + (r.lote.fallidos ? ` · ${r.lote.fallidos} envíos fallidos (reintenta desde la bandeja)` : '') + (r.lote.sinCanal ? ` · ${r.lote.sinCanal} sin canal configurado` : '') + (malos ? '' : ' · todos entregados'), malos ? 'warn' : 'ok');
        }
      } catch (e) { setPolling(false); toast(errMsg(e), 'bad'); } finally { busy = false; }
    }, 350);
    return () => clearInterval(iv);
  }, [polling, loadBandeja, toast]);

  const nCan = f.canales.filter(Boolean).length;
  const fill = (t: string) => t
    .replace(/\{tutor\}/g, dest.muestra?.tutor ?? '{tutor}').replace(/\{alumno\}/g, dest.muestra?.alumno ?? '{alumno}').replace(/\{saldo\}/g, dest.muestra ? fmt(dest.muestra.saldo) : '{saldo}');
  const n = dest.total ?? dest.tutores.length;
  const sample = n ? dest.tutores.slice(0, 2).join(', ') + (n > 2 ? ` y ${n - 2} más` : '') : 'Sin destinatarios';

  const send = async () => {
    if (!f.asunto.trim() || !f.msg.trim()) { toast('Completa asunto y mensaje', 'warn'); return; }
    if (!nCan) { toast('Elige al menos un canal', 'warn'); return; }
    if (!n) { toast('El filtro no tiene destinatarios', 'warn'); return; }
    try {
      const r = await api.post<CmnEnviarRes>('/comunica/enviar', { grado: f.grado, tanda: f.tanda, cuenta: f.cuenta, canales: CN.filter((_, i) => f.canales[i]), asunto: f.asunto, mensaje: f.msg });
      setF(x => ({ ...x, asunto: '', msg: '' }));
      setBatch(r.batch); setProgress({ hechos: 0, total: r.total }); setPolling(r.enCola > 0); void loadBandeja();
      if (r.sinCanal) toast(`${r.sinCanal} mensajes quedaron como «Canal no configurado» (no se enviaron)${r.enCola ? ` · ${r.enCola} en cola` : ''}`, 'warn');
      else toast(`${r.total} mensajes en cola · puedes seguir trabajando`, 'info');
    } catch (e) { toast(errMsg(e), 'bad'); }
  };

  const retry = async () => {
    if (!band.conteos.Fallido) { toast('No hay envíos fallidos', 'info'); return; }
    try {
      const r = await api.post<{ reintentados: number }>('/comunica/reintentar');
      toast(`${r.reintentados} envíos reintentados`, 'info'); setPolling(true); void loadBandeja();
    } catch (e) { toast(errMsg(e), 'bad'); }
  };

  const queueOn = !!batch && polling && progress.hechos < progress.total;

  return (
    <div className="flex flex-col gap-3.5">
      {toasts}
      <div>
        <h1 className="text-xl font-semibold tracking-[-0.01em]">Centro de Comunicaciones</h1>
        <p className="mt-1 text-[13px] text-slate-600">Circulares a tutores y auditoría de todo lo que el sistema envía.</p>
      </div>
      <div className="flex gap-0.5 overflow-auto border-b border-slate-200">
        {([['write', 'Redactar circular'], ['out', 'Bandeja de salida']] as const).map(([k, l]) => (
          <button key={k} onClick={() => setTab(k)} className={`h-[38px] whitespace-nowrap px-3.5 text-[13px] font-medium hover:text-ink ${tab === k ? 'text-ink shadow-[inset_0_-2px_0_#2563EB]' : 'text-slate-500'}`}>{l}</button>
        ))}
      </div>

      {tab === 'write' && (
        <div className="grid items-start gap-3.5" style={{ gridTemplateColumns: 'repeat(auto-fit,minmax(340px,1fr))' }}>
          <section className="flex flex-col gap-3 rounded-lg border border-slate-200 bg-white p-4">
            <AvisoBorrador meta={metaF} className="w-fit" />
            <div className="text-xs font-semibold uppercase tracking-wide text-slate-600">Destinatarios</div>
            <div className="grid grid-cols-3 gap-2.5">
              <label className="flex flex-col gap-1 text-xs font-medium text-slate-600">Grado
                <select value={f.grado} onChange={e => setF({ ...f, grado: e.target.value })} className={SEL}><option value="">Todos</option>{['1ro', '2do', '3ro', '4to', '5to', '6to'].map(g => <option key={g}>{g}</option>)}</select>
              </label>
              <label className="flex flex-col gap-1 text-xs font-medium text-slate-600">Tanda
                <select value={f.tanda} onChange={e => setF({ ...f, tanda: e.target.value })} className={SEL}><option value="">Todas</option><option>Matutina</option><option>Vespertina</option><option>Extendida</option></select>
              </label>
              <label className="flex flex-col gap-1 text-xs font-medium text-slate-600">Estado de cuenta
                <select value={f.cuenta} onChange={e => setF({ ...f, cuenta: e.target.value })} className={SEL}><option value="">Todos</option><option value="mora">En mora</option><option value="ok">Al día</option></select>
              </label>
            </div>
            <div className="flex flex-wrap gap-2">
              {CN.map((c, i) => {
                const on = f.canales[i];
                return (
                  <button key={c} onClick={() => setF({ ...f, canales: f.canales.map((x, j) => (j === i ? !x : x)) })} className={`flex h-[30px] items-center gap-1.5 rounded-full border px-3 text-xs font-medium ${on ? 'border-accent bg-blue-50 text-info-fg' : 'border-slate-300 bg-white text-slate-600'}`}>
                    <i className={CI[c]} />{c}
                  </button>
                );
              })}
            </div>
            <label className="flex flex-col gap-1 text-xs font-medium text-slate-600">Asunto
              <input value={f.asunto} onChange={e => setF({ ...f, asunto: e.target.value })} className="h-9 w-full rounded-md border border-slate-300 px-2.5 text-[13px] text-ink outline-none focus:border-accent" />
            </label>
            <label className="flex flex-col gap-1 text-xs font-medium text-slate-600">Mensaje
              <textarea value={f.msg} onChange={e => setF({ ...f, msg: e.target.value })} rows={6} className="w-full resize-y rounded-md border border-slate-300 p-2.5 text-[13px] leading-normal text-ink outline-none" />
            </label>
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-xs text-slate-500">Insertar:</span>
              {['{tutor}', '{alumno}', '{saldo}'].map(t => <button key={t} onClick={() => setF({ ...f, msg: f.msg + t })} className="h-[26px] rounded-md border border-slate-300 bg-slate-50 px-2 font-mono text-xs text-slate-700">{t}</button>)}
            </div>
          </section>

          <section className="flex flex-col gap-3 rounded-lg border border-slate-200 bg-white p-4">
            <div className="flex items-baseline justify-between">
              <span className="text-sm font-semibold">Vista previa</span>
              <span className="text-xs text-slate-600"><b className="font-mono text-ink">{n}</b> tutores · <b className="font-mono text-ink">{n * nCan}</b> mensajes</span>
            </div>
            <div className="flex flex-col gap-1.5 rounded-lg border border-slate-200 bg-slate-50 p-3.5">
              <div className="text-[11px] text-slate-500">Para: {sample}</div>
              <div className="text-sm font-semibold">{f.asunto ? fill(f.asunto) : 'Sin asunto'}</div>
              <div className="whitespace-pre-wrap text-[13px] leading-relaxed text-slate-700">{f.msg ? fill(f.msg) : 'Escribe el mensaje. Usa {tutor}, {alumno} y {saldo} para personalizarlo.'}</div>
            </div>
            {queueOn && (
              <div className="flex flex-col gap-1">
                <div className="flex justify-between text-xs text-slate-600"><span>Cola de envío (no bloquea la interfaz)</span><span className="font-mono">{progress.hechos} / {progress.total}</span></div>
                <div className="h-1.5 overflow-hidden rounded-full bg-slate-200"><div className="h-full bg-accent" style={{ width: Math.round((progress.hechos / (progress.total || 1)) * 100) + '%' }} /></div>
              </div>
            )}
            <div className="flex justify-end">
              <button onClick={() => void send()} disabled={sl} title={sl ? SL_MSG : undefined} className="flex h-[34px] items-center gap-1.5 whitespace-nowrap rounded-md bg-accent px-3.5 text-[13px] font-medium text-white hover:bg-accent-dark disabled:opacity-50"><i className="ph ph-paper-plane-tilt" />Enviar circular</button>
            </div>
          </section>
        </div>
      )}

      {tab === 'out' && (
        <section className="overflow-hidden rounded-lg border border-slate-200 bg-white">
          <div className="flex flex-wrap items-center gap-2.5 border-b border-slate-200 px-4 py-3">
            <div className="flex gap-0.5 rounded-lg bg-slate-100 p-[3px]">
              {OF.map(([k, l]) => (
                <button key={k} onClick={() => setFiltro(k)} className={`h-7 rounded-md px-2.5 text-xs font-medium ${filtro === k ? 'bg-white text-ink shadow-sm' : 'text-slate-600'}`}>
                  {l} <span className="font-mono text-slate-400">{band.conteos[k || 'todos'] ?? 0}</span>
                </button>
              ))}
            </div>
            <span className="flex-1" />
            <button onClick={() => void retry()} className="flex h-[34px] items-center gap-1.5 whitespace-nowrap rounded-md border border-slate-300 bg-white px-3 text-[13px] font-medium text-ink hover:bg-slate-100"><i className="ph ph-arrow-clockwise" />Reintentar fallidos</button>
          </div>
          <div className="max-h-[calc(100vh-330px)] overflow-auto">
            <table className="w-full min-w-[900px] border-collapse text-[13px]">
              <thead><tr>{['Fecha / hora', 'Destinatario', 'Canal', 'Asunto', 'Entrega', 'Disparado por'].map(h => <th key={h} className={TH}>{h}</th>)}</tr></thead>
              <tbody>
                {band.rows.map(o => (
                  <tr key={o.id} className="h-11">
                    <td className="whitespace-nowrap border-b border-slate-100 px-3 font-mono text-xs text-slate-600">{o.t}</td>
                    <td className="border-b border-slate-100 px-3">{o.to}</td>
                    <td className="border-b border-slate-100 px-3 text-slate-600"><i className={CI[o.canal] + ' mr-1.5'} />{o.canal}</td>
                    <td className="max-w-[260px] overflow-hidden text-ellipsis whitespace-nowrap border-b border-slate-100 px-3 text-slate-600">{o.asunto}{o.error && <div title={o.error} className="overflow-hidden text-ellipsis text-[11px] text-red-600">{o.error}</div>}</td>
                    <td className="border-b border-slate-100 px-3">
                      <span title={o.error || o.estado} className={`inline-flex h-[19px] items-center whitespace-nowrap justify-center rounded-full px-[5px] text-[10px] font-semibold leading-none ${o.estado === 'Canal no configurado' ? 'min-w-[128px]' : 'w-[84px]'}`} style={{ background: TONE[o.estado][0], color: TONE[o.estado][1] }}>{o.estado}</span>
                    </td>
                    <td className="border-b border-slate-100 px-3 font-mono text-xs text-slate-600">{o.by}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  );
}
