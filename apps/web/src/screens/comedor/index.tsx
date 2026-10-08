import { useEffect, useRef, useState } from 'react';
import type { ComCarnetDto, ComEscaneoRes, ComLecturaDto, ComedorEstado } from '@stodia/shared';
import { api } from '../../lib/api';
import { useToastStack } from '../../components/useToastStack';

const fmt = (n: number) => 'RD$ ' + n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const BUYS: [string, number][] = [['Merienda', 120], ['Jugo natural', 80], ['Sándwich', 175]];
const LOG_ICON = { ok: ['ph-fill ph-check-circle', '#16A34A'], alert: ['ph-fill ph-warning', '#D97706'], no: ['ph-fill ph-x-circle', '#DC2626'] } as const;
const ORDER = ['EST-0412', 'EST-0398', 'EST-0455', 'EST-0501']; // orden de los chips del prototipo
const LBL = 'text-xs font-semibold uppercase tracking-wide text-slate-500';

export default function Screen() {
  const { toast, toasts } = useToastStack();
  const [carnets, setCarnets] = useState<Record<string, ComCarnetDto>>({});
  const [log, setLog] = useState<ComLecturaDto[]>([]);
  const [scan, setScan] = useState('EST-0412');
  const [input, setInput] = useState('');
  const [ms, setMs] = useState(142);
  const ref = useRef<HTMLInputElement>(null);

  useEffect(() => {
    api.get<ComedorEstado>('/comedor').then(e => {
      setCarnets(Object.fromEntries(e.carnets.map(c => [c.code, c])));
      setLog(e.log);
      if (e.carnets[0] && !e.carnets.some(c => c.code === 'EST-0412')) setScan(e.carnets[0].code);
    }).catch(e => toast(e.message, 'bad'));
  }, [toast]);
  const ready = !!carnets[scan];
  useEffect(() => { if (ready) ref.current?.focus(); }, [ready]);

  const doScan = async (raw: string) => {
    const code = raw.trim().toUpperCase();
    const t0 = performance.now();
    try {
      const r = await api.post<ComEscaneoRes>('/comedor/escanear', { code });
      setMs(Math.round(performance.now() - t0));
      setCarnets(m => ({ ...m, [r.carnet.code]: r.carnet }));
      setLog(r.log); setScan(r.carnet.code);
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Carnet ' + code + ' no reconocido', 'bad');
    }
    setInput('');
    ref.current?.focus();
  };

  const buy = async (precio: number) => {
    try {
      const r = await api.post<{ carnet: ComCarnetDto }>('/comedor/consumo', { code: scan, precio });
      setCarnets(m => ({ ...m, [scan]: r.carnet }));
      toast('Debitado ' + fmt(precio) + ' del monedero', 'ok');
    } catch (e) {
      toast(e instanceof Error ? e.message : 'No se pudo debitar', 'bad');
    }
  };

  const K = carnets[scan];
  if (!K) return <>{toasts}<p className="text-sm text-slate-500">Cargando…</p></>;
  const w = K.name.split(' ');
  const ini = ((w[0]?.[0] ?? '') + (w[1]?.[0] ?? '')).toUpperCase();
  const pct = Math.min(100, Math.round((K.spent / K.limit) * 100));
  const hasAllergy = K.allergies.length > 0;

  return (
    <div className="flex flex-col gap-3.5">
      <style>{'@keyframes alertFlash{0%,100%{background:#DC2626}50%{background:#991B1B}}'}</style>
      {toasts}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Punto de Verificación · Comedor</h1>
          <p className="mt-1 text-[13px] text-slate-600">Comedor Central · Turno almuerzo 12:00–13:30 · Escáner QR / NFC conectado</p>
        </div>
        <span className="flex items-center gap-1.5 text-xs text-slate-600">
          Respuesta <b className="font-mono" style={{ color: ms < 300 ? '#15803D' : '#DC2626' }}>{ms} ms</b>
        </span>
      </div>

      {hasAllergy && (
        <div className="flex items-center gap-4 rounded-lg px-5 py-4 text-white" style={{ animation: 'alertFlash 0.9s ease-in-out infinite' }}>
          <i className="ph-fill ph-warning-octagon flex-none" style={{ fontSize: 44 }} />
          <div>
            <div className="text-[22px] font-bold tracking-wide">¡ALERTA MÉDICA CRÍTICA!</div>
            <div className="text-lg font-semibold">ALÉRGICO A {K.allergies.join(' / ')}</div>
            <div className="mt-0.5 text-sm">Acción requerida: verificar componentes de los alimentos antes de entregar la bandeja.</div>
          </div>
        </div>
      )}

      <div className="grid items-start gap-3.5" style={{ gridTemplateColumns: 'repeat(auto-fit,minmax(min(100%,380px),1fr))' }}>
        <section className="overflow-hidden rounded-lg border border-slate-200 bg-white">
          <div className="flex flex-wrap gap-5 p-5">
            <div className="grid h-60 w-[200px] flex-none place-items-center rounded-[10px] bg-slate-200 text-[56px] font-semibold text-slate-700">{ini}</div>
            <div className="flex min-w-[200px] flex-1 flex-col gap-2.5">
              <div className="text-2xl font-semibold leading-tight">{K.name}</div>
              <div className="text-[15px] text-slate-600">{K.grado}</div>
              <div className="font-mono text-[13px] font-medium text-slate-500">{K.code}</div>
              <div className={LBL + ' mt-1.5'}>Restricciones del día</div>
              <div className="text-sm leading-normal">{K.restr}</div>
              <div className={LBL + ' mt-1.5'}>Plan</div>
              <div className="text-sm">{K.plan}</div>
            </div>
          </div>
          <div className="flex items-center gap-3 px-5 py-4 text-white" style={{ background: K.ok ? '#16A34A' : '#DC2626' }}>
            <i className={K.ok ? 'ph-fill ph-check-circle' : 'ph-fill ph-prohibit'} style={{ fontSize: 28 }} />
            <div>
              <div className="text-lg font-bold tracking-wide">{K.ok ? 'SERVICIO AUTORIZADO · PLAN ACTIVO' : 'SIN PLAN / ALMUERZO NO PAGADO'}</div>
              <div className="text-[13px]">{K.ok ? (hasAllergy ? 'Entregar bandeja solo tras verificar alérgenos' : 'Entregar bandeja estándar') : K.motivo}</div>
            </div>
          </div>
        </section>

        <div className="flex flex-col gap-3.5">
          <section className="flex flex-col gap-2.5 rounded-lg border border-slate-200 bg-white p-3.5">
            <label className="flex flex-col gap-1 text-xs font-medium text-slate-600">
              Escanear carnet (o escribir código y Enter)
              <input
                ref={ref} value={input} onChange={e => setInput(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') void doScan(input); }}
                placeholder="EST-0000"
                className="h-[42px] rounded-md border border-slate-300 px-3 font-mono text-base font-medium text-ink outline-none focus:border-accent focus:ring-[3px] focus:ring-accent-soft"
              />
            </label>
            <div className="text-xs text-slate-500">Simular lectura:</div>
            <div className="flex flex-wrap gap-1.5">
              {Object.keys(carnets).sort((a, b) => (ORDER.indexOf(a) + 1 || 99) - (ORDER.indexOf(b) + 1 || 99)).map(code => (
                <button key={code} onClick={() => void doScan(code)} className="h-[30px] rounded-md border border-slate-300 bg-white px-2.5 font-mono text-xs font-medium text-ink hover:bg-slate-100">{code}</button>
              ))}
            </div>
          </section>

          <section className="flex flex-col gap-2.5 rounded-lg border border-slate-200 bg-white p-3.5">
            <div className="flex items-baseline justify-between"><span className="text-[13px] font-semibold">Monedero virtual</span><span className="font-mono text-lg font-semibold">{fmt(K.wallet)}</span></div>
            <div className="text-xs text-slate-600">Consumido hoy <span className="font-mono">{fmt(K.spent)}</span> de <span className="font-mono">{fmt(K.limit)}</span> (límite fijado por el tutor)</div>
            <div className="h-1.5 overflow-hidden rounded-full bg-slate-200"><div className="h-full" style={{ width: pct + '%', background: K.spent / K.limit >= 0.8 ? '#D97706' : '#16A34A' }} /></div>
            <div className="flex flex-wrap gap-1.5">
              {BUYS.map(([l, p]) => (
                <button key={l} onClick={() => void buy(p)} className="h-8 rounded-md border border-slate-300 bg-white px-2.5 text-xs text-ink hover:bg-slate-100">{l} · <span className="font-mono">{fmt(p)}</span></button>
              ))}
            </div>
          </section>

          <section className="rounded-lg border border-slate-200 bg-white">
            <div className="border-b border-slate-200 px-3.5 py-2.5 text-[13px] font-semibold">Últimas lecturas</div>
            {log.map((l, i) => (
              <div key={i} className="flex items-center gap-2.5 border-b border-slate-100 px-3.5 py-[7px] text-xs">
                <span className="font-mono text-slate-500">{l.t}</span><span className="flex-1">{l.n}</span>
                <i className={LOG_ICON[l.s][0]} style={{ color: LOG_ICON[l.s][1], fontSize: 15 }} />
              </div>
            ))}
          </section>
        </div>
      </div>
    </div>
  );
}
