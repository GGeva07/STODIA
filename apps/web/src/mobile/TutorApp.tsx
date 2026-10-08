import { useCallback, useEffect, useState } from 'react';
import type { MobHijo, MobTutorData } from '@stodia/shared';
import { api, getConfig } from '../lib/api';
import { useSession } from '../lib/session';

const fmt = (n: number) => 'RD$ ' + n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const letter = (v: number) => (v >= 90 ? 'A' : v >= 80 ? 'B' : v >= 70 ? 'C' : 'F');
const LTONE: Record<string, string> = { A: 'bg-ok-bg text-ok-fg', B: 'bg-info-bg text-info-fg', C: 'bg-warn-bg text-warn-fg', F: 'bg-bad-bg text-bad-fg' };
const ESTADO_FG: Record<string, string> = { Vencida: 'text-bad-fg', 'Por vencer': 'text-warn-fg', Pendiente: 'text-mute-fg' };
const ASIS: Record<string, [string, string]> = { P: ['Presente', 'bg-ok-bg text-ok-fg'], T: ['Tardanza', 'bg-warn-bg text-warn-fg'], AJ: ['Ausencia justificada', 'bg-info-bg text-info-fg'], AI: ['Ausencia injustificada', 'bg-bad-bg text-bad-fg'] };
const TABS = [['inicio', 'Inicio', 'ph-house'], ['notas', 'Notas', 'ph-graduation-cap'], ['comedor', 'Comedor', 'ph-fork-knife']] as const;
type Tab = (typeof TABS)[number][0];

const dkey = (v: string) => v.split('/').reverse().join('-');
const balance = (k: MobHijo) => k.cargos.filter(c => c.estado !== 'Pendiente').reduce((a, c) => a + c.monto, 0);

/** Portal Tutor (prototipo L1649-1742). Pantalla completa en dispositivo; marco 390x800 solo en escritorio ancho. */
export default function TutorApp() {
  const { user } = useSession();
  const [data, setData] = useState<MobTutorData | null>(null);
  const [error, setError] = useState('');
  const [kidId, setKidId] = useState('');
  const [tab, setTab] = useState<Tab>('inicio');
  const [pay, setPay] = useState(false);
  const [msg, setMsg] = useState('');

  const load = useCallback(
    () => api.get<MobTutorData>('/movil/tutor').then(d => { setData(d); setKidId(k => k || d.hijos[0]?.id || ''); }).catch(e => setError(e.message)),
    [],
  );
  useEffect(() => { load(); }, [load]);

  const kid: MobHijo | undefined = data?.hijos.find(h => h.id === kidId);
  const flash = (m: string) => { setMsg(m); setTimeout(() => setMsg(''), 3000); };
  const run = (p: Promise<unknown>, ok: string) => p.then(() => { flash(ok); return load(); }).catch(e => flash(e.message));

  return (
    <div className="mx-auto flex min-h-0 w-full flex-1 flex-col lg:w-[390px] lg:flex-none lg:rounded-[48px] lg:bg-ink lg:p-3 lg:shadow-2xl">
      <div className="relative flex min-h-0 flex-1 flex-col overflow-hidden bg-canvas lg:h-[776px] lg:flex-none lg:rounded-[38px]">
        <div className="shrink-0 space-y-3 px-5 pb-3 pt-2">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-[13px] text-slate-500">{getConfig().institutionName || 'Colegio Los Pinos'}</div>
              <div className="text-xl font-semibold">Hola, {(data?.tutor ?? user?.nombre ?? '').split(' ')[0]}</div>
            </div>
            <span className="grid h-10 w-10 place-items-center rounded-full bg-slate-200 text-[13px] font-semibold text-slate-700">
              {(data?.tutor ?? user?.nombre ?? '').split(' ').map(x => x[0]).join('').slice(0, 2).toUpperCase()}
            </span>
          </div>
          {data && data.hijos.length > 1 && (
            <div className="flex gap-0.5 rounded-[10px] bg-slate-200 p-[3px]">
              {data.hijos.map(h => (
                <button key={h.id} onClick={() => setKidId(h.id)} className={`h-9 flex-1 rounded-lg text-sm font-medium ${h.id === kidId ? 'bg-white text-ink shadow-sm' : 'text-slate-600'}`}>
                  {h.nombre.split(' ')[0]} · {h.grado} {h.sec}
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="min-h-0 flex-1 space-y-3 overflow-y-auto overscroll-contain px-5 pb-4">
          {error && <p className="rounded-xl bg-bad-bg p-3 text-sm text-bad-fg">{error}</p>}
          {!data && !error && <p className="text-sm text-slate-500">Cargando…</p>}
          {kid && tab === 'inicio' && <Inicio kid={kid} onPay={() => setPay(true)} />}
          {kid && tab === 'notas' && <Notas kid={kid} />}
          {kid && data && tab === 'comedor' && (
            <Comedor
              kid={kid}
              menu={data.menu}
              onRecarga={v => run(api.put(`/movil/tutor/wallet/${kid.id}`, { recarga: v }), `Recarga de ${fmt(v)} aplicada al monedero de ${kid.nombre.split(' ')[0]}`)}
              onLimite={v => run(api.put(`/movil/tutor/wallet/${kid.id}`, { limite: v }), 'Límite actualizado')}
            />
          )}
        </div>

        {msg && <div role="status" className="absolute inset-x-5 bottom-24 z-20 rounded-xl bg-ink px-4 py-3 text-center text-sm text-white shadow-lg">{msg}</div>}

        <nav className="z-10 flex h-[72px] flex-none border-t border-slate-200 bg-white pb-[max(14px,env(safe-area-inset-bottom))]">
          {TABS.map(([k, l, icon]) => (
            <button key={k} onClick={() => setTab(k)} className={`flex min-w-12 flex-1 flex-col items-center justify-center gap-0.5 text-[11px] font-medium ${tab === k ? 'text-accent' : 'text-slate-500'}`}>
              <i className={`ph${tab === k ? '-fill' : ''} ${icon} text-[22px]`} />
              {l}
            </button>
          ))}
        </nav>

        {pay && kid && (
          <div className="absolute inset-0 z-30 flex items-end bg-ink/40" onClick={() => setPay(false)}>
            <div className="w-full space-y-3 rounded-t-3xl bg-white p-5 pb-8" onClick={e => e.stopPropagation()}>
              <div className="flex items-center justify-between">
                <span className="text-[17px] font-semibold">Pago con tarjeta</span>
                <button onClick={() => setPay(false)} aria-label="Cerrar" className="h-8 w-8 rounded-full bg-slate-100"><i className="ph ph-x" /></button>
              </div>
              <label className="flex flex-col gap-1 text-xs text-slate-600">Número de tarjeta<input defaultValue="4111 1111 1111 1111" inputMode="numeric" className="h-[46px] rounded-[10px] border border-slate-300 px-3 font-mono text-[15px] text-ink" /></label>
              <div className="flex gap-2">
                <label className="flex flex-1 flex-col gap-1 text-xs text-slate-600">Vence<input defaultValue="08/29" className="h-[46px] w-full rounded-[10px] border border-slate-300 px-3 font-mono text-[15px] text-ink" /></label>
                <label className="flex flex-1 flex-col gap-1 text-xs text-slate-600">CVV<input defaultValue="•••" className="h-[46px] w-full rounded-[10px] border border-slate-300 px-3 font-mono text-[15px] text-ink" /></label>
              </div>
              <button
                className="h-[52px] w-full rounded-xl bg-accent text-[15px] font-semibold text-white"
                onClick={() => { setPay(false); run(api.post('/movil/tutor/pagar', { alumnoId: kid.id }), 'Pago en línea aprobado · ' + fmt(balance(kid))); }}
              >
                Pagar {fmt(balance(kid))}
              </button>
              <span className="block text-center text-[11px] text-slate-500">Conexión cifrada TLS 1.3 · Recibo electrónico con NCF por correo</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function Inicio({ kid, onPay }: { kid: MobHijo; onPay: () => void }) {
  const bal = balance(kid);
  const due = kid.cargos.filter(c => c.estado !== 'Pendiente');
  const note =
    bal === 0 ? ['Estás al día. ¡Gracias!', 'text-green-300']
    : due.some(c => c.estado === 'Vencida') ? ['Incluye cuotas vencidas con recargo por mora', 'text-red-300']
    : ['Próximo vencimiento: ' + due[0].vence, 'text-amber-300'];
  return (
    <>
      <div className="flex flex-col gap-1.5 rounded-2xl bg-ink p-[18px] text-canvas">
        <span className="text-[13px] text-slate-400">Balance pendiente · {kid.nombre.split(' ')[0]}</span>
        <span className="font-mono text-[28px] font-semibold tracking-tight">{fmt(bal)}</span>
        <span className={`text-xs ${note[1]}`}>{note[0]}</span>
        <button disabled={bal === 0} onClick={onPay} className="mt-2 h-12 rounded-xl bg-accent text-[15px] font-semibold text-white disabled:opacity-40">Pagar ahora</button>
      </div>
      <div className="text-[13px] font-semibold text-slate-600">Cuotas</div>
      {[...kid.cargos].sort((a, b) => dkey(a.vence).localeCompare(dkey(b.vence))).map(c => (
        <div key={c.id} className="flex items-center justify-between gap-2.5 rounded-xl border border-slate-200 bg-white px-3.5 py-3">
          <div>
            <div className="text-sm font-medium">{c.concepto}</div>
            <div className={`text-xs ${ESTADO_FG[c.estado]}`}>{c.estado} · vence {c.vence}</div>
          </div>
          <span className="font-mono text-[13px] font-semibold">{fmt(c.monto)}</span>
        </div>
      ))}
      {kid.cargos.length === 0 && <p className="text-sm text-slate-500">Sin cargos pendientes.</p>}
      {kid.asistencia.length > 0 && (
        <>
          <div className="text-[13px] font-semibold text-slate-600">Asistencia reciente</div>
          <div className="flex flex-wrap gap-2">
            {kid.asistencia.map(a => (
              <span key={a.fecha} className={`rounded-full px-2.5 py-1 text-xs font-medium ${ASIS[a.estado][1]}`}>{a.fecha.slice(5)} · {ASIS[a.estado][0]}</span>
            ))}
          </div>
        </>
      )}
    </>
  );
}

function Notas({ kid }: { kid: MobHijo }) {
  return (
    <div className="flex flex-col gap-2">
      <div className="text-[13px] font-semibold text-slate-600">Período 1 · {kid.nombre.split(' ')[0]}</div>
      {kid.notas.map(n => {
        const l = letter(n.valor);
        return (
          <div key={n.materia} className="flex items-center justify-between rounded-xl border border-slate-200 bg-white px-3.5 py-3">
            <span className="text-sm">{n.materia}</span>
            <span className="flex items-center gap-2">
              <span className="font-mono text-sm font-semibold">{n.valor.toFixed(1)}</span>
              <span className={`grid h-[22px] min-w-[26px] place-items-center rounded-md font-mono text-xs font-semibold ${LTONE[l]}`}>{l}</span>
            </span>
          </div>
        );
      })}
    </div>
  );
}

function Comedor({ kid, menu, onRecarga, onLimite }: { kid: MobHijo; menu: MobTutorData['menu']; onRecarga: (v: number) => void; onLimite: (v: number) => void }) {
  const [lim, setLim] = useState(kid.wallet.limite);
  useEffect(() => setLim(kid.wallet.limite), [kid.id, kid.wallet.limite]);
  const alg = kid.alergias.toLowerCase();
  const commit = () => { if (lim !== kid.wallet.limite) onLimite(lim); };
  return (
    <>
      <div className="space-y-2.5 rounded-2xl border border-slate-200 bg-white p-4">
        <span className="text-[13px] text-slate-500">Monedero de {kid.nombre.split(' ')[0]}</span>
        <div className="font-mono text-[26px] font-semibold">{fmt(kid.wallet.saldo)}</div>
        <div className="flex gap-1.5">
          {[500, 1000, 2000].map(v => (
            <button key={v} onClick={() => onRecarga(v)} className="h-10 flex-1 rounded-[10px] border border-blue-200 bg-blue-50 font-mono text-[13px] font-semibold text-info-fg">+{v.toLocaleString('en-US')}</button>
          ))}
        </div>
        <div className="flex justify-between pt-1 text-[13px]"><span>Límite de gasto diario</span><b className="font-mono">{fmt(lim)}</b></div>
        <input type="range" min={100} max={1000} step={50} value={lim} onChange={e => setLim(Number(e.target.value))} onPointerUp={commit} onKeyUp={commit} className="h-8 w-full accent-accent" />
      </div>
      <div className="text-[13px] font-semibold text-slate-600">Menú de la semana</div>
      {menu.map(m => {
        const warn = !!m.alergeno && alg.includes(m.alergeno.slice(0, 4));
        return (
          <div key={m.dia} className={`space-y-1 rounded-xl border bg-white px-3.5 py-3 ${warn ? 'border-red-300' : 'border-slate-200'}`}>
            <div className="flex justify-between">
              <span className="text-xs font-semibold text-slate-500">{m.dia}</span>
              {warn && <span className="text-[11px] font-semibold text-bad-fg">⚠ Contiene {m.alergeno}</span>}
            </div>
            <span className="text-sm">{m.plato}</span>
          </div>
        );
      })}
    </>
  );
}
