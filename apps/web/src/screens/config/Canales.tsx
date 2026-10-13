import { useEffect, useState } from 'react';
import type { CmnCanalesCfg, MobPasarelaCfg } from '@stodia/shared';
import { btn, btnPrimary, card, input } from '../../components/system/styles';
import { useToast } from '../../components/system/UiProvider';
import { api } from '../../lib/api';
import { useSession } from '../../lib/session';
import { AvisoBorrador, useDraft } from '../../lib/useDraft';

const label = 'flex flex-col gap-1 text-xs font-medium text-slate-600';

/** Canales de comunicación (SMTP) y pagos del portal (instrucciones, recargas, modo demo). Solo Super Admin. */
export default function Canales() {
  const { user } = useSession();
  const toast = useToast();
  const [d, setD] = useState<{ c: CmnCanalesCfg; p: MobPasarelaCfg; v: number } | null>(null);
  const sa = user?.rol === 'Super Admin';
  useEffect(() => {
    if (!sa) return;
    Promise.all([api.get<CmnCanalesCfg>('/comunica/canales'), api.get<MobPasarelaCfg>('/movil/pasarela')]).then(([a, b]) => setD(x => ({ c: a, p: b, v: (x?.v ?? 0) + 1 }))).catch(e => toast((e as Error).message, 'bad'));
  }, [sa, toast]);
  if (!sa || !d) return null;
  return <CanalesForm key={d.v} c={d.c} p={d.p} onFill={(a, b) => setD(x => ({ c: a, p: b, v: (x?.v ?? 0) + 1 }))} />;
}

/** Borradores: correo (sin la contraseña SMTP) e instrucciones de pago se conservan al salir; se descartan al guardar con éxito. Al guardar se vuelve a montar con los datos del servidor. */
function CanalesForm({ c, p, onFill }: { c: CmnCanalesCfg; p: MobPasarelaCfg; onFill: (a: CmnCanalesCfg, b: MobPasarelaCfg) => void }) {
  const toast = useToast();
  const [em, setEm, limEm, metaEm] = useDraft('config:canales:email', { activo: c.email.activo, host: c.email.host, port: String(c.email.port), user: c.email.user, pass: '', from: c.email.from }, { porCiclo: false, omitir: ['pass'] });
  const [pay, setPay, limPay, metaPay] = useDraft('config:canales:pay', { instr: p.instruccionesPago, recargas: p.recargas.join(', ') }, { porCiclo: false });
  const [busy, setBusy] = useState(false);
  const fill = (cc: CmnCanalesCfg, pp: MobPasarelaCfg, que: 'email' | 'pay' | 'todo') => { if (que !== 'pay') limEm(); if (que !== 'email') limPay(); onFill(cc, pp); };

  const run = async (fn: () => Promise<void>, ok: string) => {
    setBusy(true);
    try { await fn(); toast(ok, 'ok'); } catch (e) { toast((e as Error).message, 'bad'); } finally { setBusy(false); }
  };
  const saveEmail = () => run(async () => {
    const r = await api.put<CmnCanalesCfg>('/comunica/canales', { email: { activo: em.activo, host: em.host, port: Number(em.port), user: em.user, pass: em.pass, from: em.from } });
    fill(r, p, 'email');
  }, 'Canal de correo guardado');
  const probar = () => run(async () => { await api.post('/comunica/canales/probar'); }, 'Conexión SMTP correcta');
  const savePay = () => run(async () => {
    const recargas = pay.recargas.split(/[,\s]+/).filter(Boolean).map(Number);
    const r = await api.put<MobPasarelaCfg>('/movil/pasarela', { instruccionesPago: pay.instr, recargas });
    fill(c, r, 'pay');
  }, 'Pagos del portal guardados');
  const setDemo = (demo: boolean) => run(async () => {
    const [a, b] = await Promise.all([api.put<CmnCanalesCfg>('/comunica/canales', { demo }), api.put<MobPasarelaCfg>('/movil/pasarela', { demo })]);
    fill(a, b, 'todo');
  }, demo ? 'Modo demo activado (envíos y pagos simulados)' : 'Modo demo desactivado');

  return (
    <section className={`${card} flex max-w-[860px] flex-col gap-4 p-[18px]`}>
      <div>
        <div className="text-sm font-semibold">Canales y pasarela</div>
        <div className="mt-0.5 text-xs text-slate-500">Sin canal configurado, los mensajes quedan como «Canal no configurado». Sin pasarela, el portal del tutor registra el pago y el cajero lo verifica. SMS, WhatsApp y Push aún no tienen proveedor.</div>
      </div>

      <div className="flex flex-col gap-3">
        <AvisoBorrador meta={metaEm} className="w-fit" />
        <label className="flex items-center gap-2 text-[13px] font-medium"><input type="checkbox" checked={em.activo} onChange={e => setEm({ ...em, activo: e.target.checked })} />Correo (SMTP) activo{c.email.fuente === 'env' && c.email.host ? <span className="text-xs font-normal text-slate-500"> · valores iniciales desde SMTP_* del servidor</span> : null}</label>
        <div className="grid grid-cols-[repeat(auto-fit,minmax(min(200px,100%),1fr))] gap-3">
          <label className={label}>Servidor SMTP<input value={em.host} onChange={e => setEm({ ...em, host: e.target.value })} placeholder="smtp.ejemplo.com" className={input} /></label>
          <label className={label}>Puerto<input value={em.port} onChange={e => setEm({ ...em, port: e.target.value })} inputMode="numeric" className={`${input} font-mono`} /></label>
          <label className={label}>Usuario<input value={em.user} onChange={e => setEm({ ...em, user: e.target.value })} autoComplete="off" className={input} /></label>
          <label className={label}>Contraseña<input type="password" value={em.pass} onChange={e => setEm({ ...em, pass: e.target.value })} autoComplete="new-password" placeholder={c.email.passSet ? '•••••••• (sin cambios)' : ''} className={input} /></label>
          <label className={label}>Remitente (From)<input value={em.from} onChange={e => setEm({ ...em, from: e.target.value })} placeholder="colegio@ejemplo.do" className={input} /></label>
        </div>
        <div className="flex justify-end gap-2">
          <button onClick={probar} disabled={busy || !em.host} className={btn}><i className="ph ph-plug" />Probar conexión</button>
          <button onClick={saveEmail} disabled={busy} className={btnPrimary}><i className="ph ph-floppy-disk" />Guardar correo</button>
        </div>
      </div>

      <div className="flex flex-col gap-3 border-t border-slate-200 pt-3">
        <AvisoBorrador meta={metaPay} className="w-fit" />
        <label className={label}>Instrucciones de pago (cuentas bancarias, teléfono) · se muestran al tutor al pulsar «Pagar ahora»
          <textarea value={pay.instr} onChange={e => setPay({ ...pay, instr: e.target.value })} rows={3} className="w-full resize-y rounded-md border border-slate-300 bg-white p-2.5 text-[13px] text-ink outline-none focus:border-accent" />
        </label>
        <label className={label}>Montos de recarga del monedero (separados por coma)<input value={pay.recargas} onChange={e => setPay({ ...pay, recargas: e.target.value })} className={`${input} font-mono`} /></label>
        <div className="flex justify-end"><button onClick={savePay} disabled={busy} className={btnPrimary}><i className="ph ph-floppy-disk" />Guardar pagos</button></div>
      </div>

      {c.demoDisponible && (
        <label className="flex items-center gap-2 border-t border-slate-200 pt-3 text-[13px]"><input type="checkbox" checked={c.demo && p.demo} onChange={e => void setDemo(e.target.checked)} />Modo demo: envíos y pagos simulados para presentaciones (no usar con datos reales)</label>
      )}
    </section>
  );
}
