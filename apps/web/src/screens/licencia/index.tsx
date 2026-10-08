import { useState } from 'react';
import type { LicenciaInfo, LicPlan } from '@stodia/shared';
import { useLicense } from '../../components/system/License';
import { card, input, sectionLabel } from '../../components/system/styles';
import { useToast } from '../../components/system/UiProvider';
import { api } from '../../lib/api';
import { useSession } from '../../lib/session';

const PLANS: [LicPlan, string, string][] = [
  ['Básico', 'Operación esencial', 'Cobro en ventanilla, registro académico simple y stock básico.'],
  ['Intermedio', 'Gestión integral', 'Cobranza estructurada, control docente diario y circulares.'],
  ['Avanzado', 'Full ecosystem', 'Comedor, transporte, portal del tutor, e-CF y seguridad.'],
];
const QUOTAS: ['alumnos' | 'usuarios' | 'campus', string][] = [['alumnos', 'Alumnos activos'], ['usuarios', 'Usuarios simultáneos'], ['campus', 'Campus / sucursales']];
const fdate = (d: string) => d.split('-').reverse().join('/');

/** Pantalla de SOLO LECTURA: el plan, módulos, cuotas y vencimiento salen de la clave firmada por el proveedor. */
export default function Screen() {
  const { info, reload } = useLicense();
  const { user } = useSession();
  const toast = useToast();
  const [clave, setClave] = useState('');
  const [busy, setBusy] = useState(false);
  if (!info) return <div className="text-sm text-slate-500">Cargando…</div>;

  const isSA = user?.rol === 'Super Admin';
  const activar = async () => {
    if (!clave.trim() || busy) return;
    setBusy(true);
    try {
      await api.put<LicenciaInfo>('/licencia/clave', { clave: clave.trim() });
      setClave('');
      await reload();
      toast('Licencia activada', 'ok');
    } catch (e) { toast((e as Error).message, 'bad'); }
    setBusy(false);
  };

  const nOn = info.features.filter(f => f.on).length;
  const blocked = info.estado === 'vencida' || info.estado === 'invalida' || info.estado === 'sin_licencia';
  const stTxt = info.estado === 'vencida' ? 'Vencida' : info.estado === 'invalida' ? 'Inválida' : info.estado === 'sin_licencia' ? 'Sin licencia' : info.estado === 'por_vencer' ? `Vence en ${info.diasRestantes} días` : 'Vigente';
  const stCls = blocked ? 'bg-bad-bg text-bad-fg' : info.estado === 'por_vencer' ? 'bg-[#FEF3C7] text-[#92400E]' : 'bg-ok-bg text-ok-fg';
  const cats = [...new Set(info.features.map(f => f.cat))];
  const tierName = (t: number) => PLANS[t - 1][0];

  return (
    <div className="flex max-w-[980px] flex-col gap-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="m-0 text-xl font-semibold tracking-[-0.01em]">Licenciamiento</h1>
          <p className="mt-1 text-[13px] text-slate-600">{info.cliente ?? 'Sin licencia activa'} · plan, módulos habilitados, cuotas y vigencia del servicio.</p>
        </div>
        <span className={`inline-flex h-6 min-w-24 items-center justify-center rounded-full px-2.5 text-xs font-semibold ${stCls}`}>{stTxt}</span>
      </div>

      {blocked && (
        <div className="flex items-start gap-3.5 rounded-lg border border-[#FECACA] bg-[#FEF2F2] p-5">
          <i className="ph-fill ph-lock-key text-[28px] text-[#DC2626]" />
          <div className="flex flex-col gap-1.5">
            <div className="text-[15px] font-semibold text-[#991B1B]">{info.estado === 'vencida' ? `Licencia vencida el ${fdate(info.vence ?? '')}` : info.estado === 'invalida' ? 'Licencia inválida' : 'Sin licencia activa'}</div>
            <div className="max-w-[560px] text-[13px] leading-normal text-[#7F1D1D]">{info.detalle ? info.detalle + '. ' : ''}El acceso operacional está bloqueado para todos los usuarios de la institución. Contacta a tu ejecutivo de cuenta de STODIA para obtener una clave de licencia y pégala abajo.</div>
          </div>
        </div>
      )}

      <div className="flex flex-col gap-2">
        <div className={sectionLabel}>Plan base</div>
        <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-3">
          {PLANS.map(([n, sub, d]) => {
            const on = info.plan === n;
            return (
              <div key={n} className={`flex flex-col gap-1.5 rounded-lg border p-3.5 text-left ${on ? 'border-accent bg-[#EFF6FF]' : 'border-slate-200 bg-white'}`}>
                <div className="flex items-center gap-2">
                  <span className={`grid h-4 w-4 flex-none place-items-center rounded-full border-2 ${on ? 'border-accent' : 'border-slate-300'}`}>{on && <span className="h-2 w-2 rounded-full bg-accent" />}</span>
                  <span className="text-sm font-semibold text-ink">{n}</span>
                  <span className="ml-auto text-[11px] text-slate-500">{info.features.filter(f => f.tier <= PLANS.findIndex(p => p[0] === n) + 1).length} módulos</span>
                </div>
                <div className="text-xs font-medium text-info-fg">{sub}</div>
                <div className="text-xs leading-snug text-slate-600">{d}</div>
              </div>
            );
          })}
        </div>
        <div className="text-xs text-slate-500">{nOn} de {info.features.length} módulos activos{info.licId ? ` · licencia ${info.licId}` : ''}. El plan, los módulos y las cuotas los define la clave de licencia emitida por STODIA.</div>
      </div>

      <div className="flex flex-col gap-2">
        <div className={sectionLabel}>Módulos y funciones</div>
        <div className="grid grid-cols-[repeat(auto-fit,minmax(min(300px,100%),1fr))] gap-3">
          {cats.map(c => (
            <div key={c} className={`${card} flex flex-col content-start gap-0.5 px-3.5 py-3`}>
              <div className="mb-1.5 text-[13px] font-semibold text-ink">{c}</div>
              {info.features.filter(f => f.cat === c).map(f => (
                <div key={f.id} className="flex min-h-10 items-center gap-2.5">
                  <i className={`ph-fill ${f.on ? 'ph-check-circle text-accent' : 'ph-minus-circle text-slate-300'} flex-none text-xl`} aria-label={f.on ? 'Incluido' : 'No incluido'} />
                  <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                    <span className={`text-[13px] leading-tight ${f.on ? 'text-ink' : 'text-slate-500'}`}>{f.label}</span>
                    <span className="text-[11px] text-slate-500">Desde plan {tierName(f.tier)}</span>
                  </div>
                  {(f.on !== f.incluido) && <span className={`inline-flex h-5 flex-none items-center rounded-full px-2 text-[11px] font-semibold ${f.on ? 'bg-info-bg text-info-fg' : 'bg-[#FEF3C7] text-[#92400E]'}`}>{f.on ? 'Add-on' : 'No incluido'}</span>}
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-[repeat(auto-fit,minmax(min(240px,100%),1fr))] gap-3">
        {QUOTAS.map(([k, l]) => {
          const lim = parseInt(info.q[k]) || 0, use = info.uso[k], over = lim > 0 && use > lim;
          return (
            <div key={k} className={`${card} flex flex-col gap-2 px-3.5 py-3`}>
              <div className={sectionLabel}>Límite · {l}</div>
              <div className="text-sm text-ink" style={{ fontFamily: "'Geist Mono',ui-monospace,monospace" }}>{lim || '—'}</div>
              <div className="h-1.5 overflow-hidden rounded-[3px] bg-slate-200"><div className={`h-full ${over ? 'bg-[#DC2626]' : 'bg-accent'}`} style={{ width: Math.min(100, lim ? Math.round(use / lim * 100) : 0) + '%' }} /></div>
              <div className={`text-xs ${over ? 'text-bad-fg' : 'text-slate-600'}`}>En uso: {use}</div>
            </div>
          );
        })}
        <div className={`${card} flex flex-col gap-2 px-3.5 py-3`}>
          <div className={sectionLabel}>Vigencia de la licencia</div>
          <div className="text-sm text-ink">{info.vence ? fdate(info.vence) : '—'}</div>
          <div className="text-xs text-slate-600">{info.vence ? (info.diasRestantes >= 0 ? `${info.diasRestantes} días restantes. ` : `Vencida hace ${-info.diasRestantes} días. `) : ''}Al vencer, el acceso operacional se bloquea hasta activar una clave renovada.</div>
        </div>
      </div>

      <div className={`${card} flex flex-col gap-2 px-3.5 py-3`}>
        <div className={sectionLabel}>Pegar clave de licencia</div>
        {isSA ? (
          <>
            <div className="flex flex-wrap items-center gap-2">
              <input value={clave} onChange={e => setClave(e.target.value)} onKeyDown={e => e.key === 'Enter' && void activar()} placeholder="STODIA1.…" spellCheck={false} autoComplete="off" className={`${input} min-w-0 flex-1 text-sm`} style={{ fontFamily: "'Geist Mono',ui-monospace,monospace" }} />
              <button onClick={() => void activar()} disabled={!clave.trim() || busy} className="h-[34px] rounded-md bg-accent px-3.5 text-[13px] font-medium text-white hover:bg-accent-dark disabled:cursor-not-allowed disabled:opacity-50">Activar</button>
            </div>
            <div className="text-xs text-slate-600">Pega la clave renovada que te entregó STODIA. Se verifica su firma, que no esté vencida y que corresponda a esta institución.</div>
          </>
        ) : <div className="text-xs text-slate-600">Solo el Super Admin puede activar una clave de licencia.</div>}
      </div>
    </div>
  );
}
