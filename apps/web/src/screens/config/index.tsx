import { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import type { CfgAssets, CfgCiclo, CfgPerfil, ConfigGlobal, ScreenId } from '@stodia/shared';
import { btn, btnPrimary, card, input, pill, pillBase, td, th, type PillTone } from '../../components/system/styles';
import { useToast, useUi } from '../../components/system/UiProvider';
import { ACCESS, NAV, setAccessOverride } from '../../lib/access';
import { api } from '../../lib/api';
import { rncValido } from '../../lib/rnc';
import SupervisorPin from './SupervisorPin';
import Fiscal from './Fiscal';
import Canales from './Canales';
import { loadFinCfg } from '../../components/finanzas/finConfig';

type Tab = 'inst' | 'fiscal' | 'finanzas' | 'ciclos' | 'rbac';
const TABS: [Tab, string][] = [['inst', 'Perfil institucional'], ['fiscal', 'Gestión fiscal (DGII)'], ['finanzas', 'Finanzas'], ['ciclos', 'Ciclos lectivos'], ['rbac', 'Roles y permisos']];
const label = 'flex flex-col gap-1 text-xs font-medium text-slate-600';

type Reload = () => Promise<void>;
interface TabProps { cfg: ConfigGlobal; reload: Reload }

function useAction(reload: Reload) {
  const toast = useToast();
  return async (fn: () => Promise<unknown>, ok: string, tone: 'ok' | 'warn' = 'ok') => {
    try { await fn(); await reload(); toast(ok, tone); return true; } catch (e) { toast((e as Error).message, 'bad'); return false; }
  };
}

/** Indicador de solo lectura: el RNC lo verifica el instalador contra la DGII; no se puede marcar desde la web. */
function RncEstado({ saved, actual }: { saved: CfgPerfil; actual: string }) {
  const dg = (v: string) => (v ?? '').replace(/\D/g, '');
  const cambiado = dg(actual) !== dg(saved.rnc);
  if (!cambiado && saved.rncVerificado) {
    const f = saved.rncVerificadoAt ? new Date(saved.rncVerificadoAt) : null;
    const fecha = f && !Number.isNaN(f.getTime()) ? f.toLocaleDateString('es-DO') : '';
    return <span className="text-xs font-normal text-ok-fg"><i className="ph ph-seal-check" /> Verificado en la DGII{saved.razonSocial ? ` · ${saved.razonSocial}` : ''}{fecha ? ` · ${fecha}` : ''}</span>;
  }
  return <span className="text-xs font-normal text-warn-fg"><i className="ph ph-warning" /> RNC no verificado{cambiado ? ' (cambiado: se marcará como no verificado al guardar)' : ''}</span>;
}

function Inst({ cfg, reload }: TabProps) {
  const toast = useToast();
  const run = useAction(reload);
  const [p, setP] = useState<CfgPerfil>(cfg.perfil);
  const set = (k: keyof CfgPerfil) => (e: React.ChangeEvent<HTMLInputElement>) => setP({ ...p, [k]: e.target.value });
  const save = () => {
    if (!p.nombre.trim() || !rncValido(p.rnc)) return toast('Razón social obligatoria y RNC de 9 u 11 dígitos', 'bad');
    void run(() => api.put('/config/perfil', p), 'Perfil institucional guardado · se usará en recibos y documentos');
  };
  const ASSETS: [keyof CfgAssets, string, string][] = [['logo', 'Logotipo institucional', 'ph-image'], ['fAcad', 'Firma · Director Académico', 'ph-signature'], ['fFin', 'Firma · Director Financiero', 'ph-signature']];
  return (
    <section className={`${card} flex max-w-[860px] flex-col gap-4 p-[18px]`}>
      <div className="grid grid-cols-[repeat(auto-fit,minmax(min(240px,100%),1fr))] gap-3">
        <label className={label}>Razón social<input value={p.nombre} onChange={set('nombre')} className={input} /></label>
        <label className={label}>RNC<input value={p.rnc} onChange={set('rnc')} className={`${input} font-mono`} />
          <RncEstado saved={cfg.perfil} actual={p.rnc} />
        </label>
        <label className={label}>Teléfono<input value={p.tel} onChange={set('tel')} className={input} /></label>
        <label className={label}>Dirección física<input value={p.dir} onChange={set('dir')} className={input} /></label>
      </div>
      <div className="grid grid-cols-[repeat(auto-fit,minmax(min(240px,100%),1fr))] gap-3">
        {ASSETS.map(([k, l, icon]) => (
          <div key={k} className="flex items-center gap-3 rounded-lg border border-slate-200 p-3">
            <span className="grid h-11 w-11 flex-none place-items-center rounded-lg bg-slate-100 text-xl text-slate-600"><i className={`ph ${icon}`} /></span>
            <div className="min-w-0 flex-1">
              <div className="text-[13px] font-medium">{l}</div>
              <div className={`text-xs ${cfg.assets[k] ? 'text-ok-fg' : 'text-warn-fg'}`}>{cfg.assets[k] ? 'Cargado' : 'Sin cargar'}</div>
            </div>
            <button onClick={() => run(() => api.post('/config/assets/' + k), l + ' cargado')} className="h-[30px] rounded-md border border-slate-300 bg-white px-2.5 text-xs font-medium hover:bg-slate-100">{cfg.assets[k] ? 'Reemplazar' : 'Cargar'}</button>
          </div>
        ))}
      </div>
      <div className="flex justify-end"><button onClick={save} className={btnPrimary}><i className="ph ph-floppy-disk" />Guardar perfil</button></div>
    </section>
  );
}

const CICLO_TONE: Record<CfgCiclo['estado'], PillTone> = { Activo: 'ok', Cerrado: 'mute', Planificado: 'info' };
const CICLO_NOTE: Record<CfgCiclo['estado'], string> = {
  Cerrado: 'Histórico congelado · solo lectura', Activo: 'En curso · inscripciones y cartera abiertas', Planificado: 'Listo para activarse al cerrar el ciclo actual',
};

function Ciclos({ cfg, reload }: TabProps) {
  const { toast, openGuard } = useUi();
  const run = useAction(reload);
  const [nuevo, setNuevo] = useState('');
  const add = async () => {
    const n = nuevo.trim().replace('-', '–');
    if (!/^\d{4}–\d{4}$/.test(n)) return toast('Formato inválido. Usa 2027–2028', 'bad');
    if (cfg.ciclos.some(c => c.n === n)) return toast('Ese ciclo ya existe', 'bad');
    if (await run(() => api.post('/config/ciclos', { n }), `Ciclo ${n} creado`)) setNuevo('');
  };
  const eoy = (c: CfgCiclo) => {
    const next = cfg.ciclos.find(x => x.estado === 'Planificado');
    if (!next) return toast('Crea primero el ciclo siguiente para poder cerrar este', 'warn');
    const code = 'CERRAR-' + c.n.replace('–', '-');
    openGuard({
      title: 'Cierre de año (EOY) · ' + c.n, code, pin: true, label: 'Ejecutar cierre',
      desc: `Promueve a cada estudiante activo al grado siguiente, gradúa a 6to y congela ${c.n}. No se puede deshacer.`,
      onOk: async () => {
        try {
          const r = await api.post<{ promovidos: number; egresados: number; activo: string }>(`/config/ciclos/${encodeURIComponent(c.n)}/eoy`, { code });
          await reload();
          toast(`Cierre ${c.n} completado · ${r.promovidos} promovidos, ${r.egresados} egresados · ${r.activo} activo`, 'ok');
        } catch (e) { toast((e as Error).message, 'bad'); }
      },
    });
  };
  return (
    <div className="flex max-w-[860px] flex-col gap-3.5">
      <section className={`${card} overflow-hidden`}>
        <div className="flex flex-wrap items-center justify-between gap-2.5 border-b border-slate-200 px-4 py-3">
          <span className="text-sm font-semibold">Ciclos lectivos</span>
          <div className="flex gap-2">
            <input value={nuevo} onChange={e => setNuevo(e.target.value)} placeholder="2028–2029" className="h-[34px] w-[120px] rounded-md border border-slate-300 px-2.5 font-mono text-[13px] text-ink" />
            <button onClick={add} className={btn}><i className="ph ph-plus" />Crear ciclo</button>
          </div>
        </div>
        {cfg.ciclos.map(c => (
          <div key={c.n} className="flex flex-wrap items-center gap-3 border-b border-slate-100 px-4 py-3">
            <span className="w-[100px] font-mono text-sm font-semibold">{c.n}</span>
            <span className={`${pillBase} w-[84px] ${pill[CICLO_TONE[c.estado]]}`}>{c.estado}</span>
            <span className="min-w-[160px] flex-1 text-xs text-slate-500">{CICLO_NOTE[c.estado]}</span>
            {c.estado === 'Activo' && (
              <button onClick={() => eoy(c)} className="inline-flex h-8 items-center gap-1.5 rounded-md border border-[#FCA5A5] bg-white px-3 text-[13px] font-medium text-[#DC2626] hover:bg-bad-bg"><i className="ph ph-arrow-fat-lines-up" />Ejecutar cierre (EOY)</button>
            )}
          </div>
        ))}
      </section>
      <div className="rounded-lg border border-slate-200 bg-slate-50 px-3.5 py-3 text-xs leading-relaxed text-slate-600">
        El proceso EOY promueve a cada estudiante activo al grado siguiente, gradúa a 6to y congela el histórico del ciclo cerrado. Requiere un ciclo siguiente creado, confirmación escrita y clave de supervisor.
      </div>
    </div>
  );
}

const FLAT = NAV.flatMap(g => g.items);

function Rbac({ cfg, reload }: TabProps) {
  const toast = useToast();
  const run = useAction(reload);
  const [newRole, setNewRole] = useState('');
  const base: Record<string, ScreenId[]> = Object.keys(cfg.access).length ? cfg.access : Object.fromEntries(Object.entries(ACCESS).map(([k, v]) => [k, [...v]]));
  const roles = Object.keys(base);
  const put = (next: Record<string, ScreenId[]>, ok: string, tone: 'ok' | 'warn' = 'ok') => run(async () => { await api.put('/config/access', { access: next, base }); setAccessOverride(next); }, ok, tone);
  const toggle = (r: string, id: ScreenId) => put({ ...base, [r]: base[r].includes(id) ? base[r].filter(x => x !== id) : [...base[r], id] }, `Permiso de ${r} actualizado`);
  const addRole = async () => {
    const n = newRole.trim();
    if (!n) return toast('Escribe el nombre del rol', 'warn');
    if (base[n]) return toast('Ese rol ya existe', 'bad');
    if (await put({ ...base, [n]: [] }, `Rol «${n}» creado sin permisos`)) setNewRole('');
  };
  const delRole = (r: string) => { const { [r]: _, ...rest } = base; void put(rest, `Rol «${r}» eliminado`, 'warn'); };
  return (
    <section className={`${card} overflow-hidden`}>
      <div className="flex flex-wrap items-center justify-between gap-2.5 border-b border-slate-200 px-4 py-3">
        <span className="text-sm font-semibold">Matriz de roles y permisos</span>
        <div className="flex gap-2">
          <input value={newRole} onChange={e => setNewRole(e.target.value)} placeholder="Nuevo rol (ej. Secretaria)" className="h-[34px] w-[200px] rounded-md border border-slate-300 px-2.5 text-[13px] text-ink" />
          <button onClick={addRole} className={btn}><i className="ph ph-plus" />Crear rol</button>
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[760px] border-collapse text-[13px]">
          <thead><tr>
            <th className={th}>Pantalla</th>
            {roles.map(r => (
              <th key={r} className={`${th} !text-center`}>
                <div className="flex flex-col items-center gap-0.5">{r}
                  {!cfg.rolesBase.includes(r as never) && <button onClick={() => delRole(r)} className="cursor-pointer border-0 bg-transparent p-0 text-[10px] normal-case tracking-normal text-[#DC2626]">Eliminar</button>}
                </div>
              </th>
            ))}
          </tr></thead>
          <tbody>
            {FLAT.map(([id, l, icon]) => (
              <tr key={id} className="h-[42px]">
                <td className={td}><div className="flex items-center gap-2"><i className={`ph ${icon} text-slate-600`} /><span className="font-medium">{l}</span></div></td>
                {roles.map(r => {
                  const lock = r === 'Super Admin';
                  return (
                    <td key={r} className={`${td} text-center`}>
                      <input type="checkbox" aria-label={`${r}: ${l}`} checked={base[r].includes(id)} disabled={lock} onChange={() => toggle(r, id)} className={`h-4 w-4 accent-accent ${lock ? 'cursor-not-allowed' : 'cursor-pointer'}`} />
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="border-t border-slate-200 bg-slate-50 px-4 py-2.5 text-xs text-slate-500">
        Super Admin siempre conserva acceso total. Los cambios aplican de inmediato: cambia de rol desde tu perfil para comprobarlos.
      </div>
    </section>
  );
}

function Finanzas({ cfg, reload }: TabProps) {
  const toast = useToast();
  const run = useAction(reload);
  const f = cfg.finanzas;
  const [v, setV] = useState({ matricula: String(f.matricula || ''), inscripcion: String(f.inscripcion || ''), itbis: String(+(f.itbis * 100).toFixed(2)), recargoMoraPct: String(f.recargoMoraPct || ''), descuentoProntoPct: String(f.descuentoProntoPct || ''), diaCorte: String(f.diaCorte || '') });
  const set = (k: keyof typeof v) => (e: React.ChangeEvent<HTMLInputElement>) => setV({ ...v, [k]: e.target.value.replace(/[^\d.]/g, '') });
  const save = () => {
    const n = (s: string) => parseFloat(s) || 0;
    if (n(v.itbis) > 100 || n(v.recargoMoraPct) > 100 || n(v.descuentoProntoPct) > 100) return toast('Los porcentajes no pueden superar 100', 'bad');
    if (n(v.diaCorte) > 28) return toast('El día de corte debe estar entre 1 y 28', 'bad');
    void run(async () => { await api.put('/config/finanzas', { matricula: n(v.matricula), inscripcion: n(v.inscripcion), itbis: n(v.itbis) / 100, recargoMoraPct: n(v.recargoMoraPct), descuentoProntoPct: n(v.descuentoProntoPct), diaCorte: n(v.diaCorte) }); await loadFinCfg(true); }, 'Configuración financiera guardada · aplica a cobros, inscripción y kiosko');
  };
  const F: [keyof typeof v, string, string][] = [
    ['matricula', 'Matrícula (RD$)', 'Se cobra una vez por alumno en la inscripción.'], ['inscripcion', 'Inscripción (RD$)', 'Cargo de inscripción anual.'],
    ['itbis', 'ITBIS (%)', 'Se aplica en el kiosko a los artículos gravados.'], ['recargoMoraPct', 'Recargo por mora (%)', 'Valor por defecto al crear planes de pago.'],
    ['descuentoProntoPct', 'Descuento por pronto pago (%)', 'Se ofrece en la terminal de cobros; 0 = no se ofrece.'], ['diaCorte', 'Día de corte', 'Día del mes (1–28) en que se cierra la facturación.'],
  ];
  return (
    <section className={`${card} flex max-w-[860px] flex-col gap-4 p-[18px]`}>
      <div className="grid grid-cols-[repeat(auto-fit,minmax(min(240px,100%),1fr))] gap-3">
        {F.map(([k, l, h]) => (
          <label key={k} className={label}>{l}<input value={v[k]} onChange={set(k)} inputMode="decimal" className={`${input} text-right font-mono`} /><span className="text-[11px] font-normal text-slate-500">{h}</span></label>
        ))}
      </div>
      <div className="flex justify-end"><button onClick={save} className={btnPrimary}><i className="ph ph-floppy-disk" />Guardar configuración financiera</button></div>
    </section>
  );
}

export default function Screen() {
  const [sp] = useSearchParams();
  const [tab, setTab] = useState<Tab>(() => (TABS.some(t => t[0] === sp.get('tab')) ? (sp.get('tab') as Tab) : 'inst'));
  const [cfg, setCfg] = useState<ConfigGlobal | null>(null);
  const toast = useToast();
  const reload = useCallback(async () => { setCfg(await api.get<ConfigGlobal>('/config')); window.dispatchEvent(new Event('stodia:ciclos')); }, []); // avisa al selector de ciclo lectivo (lib/ciclo.tsx)
  useEffect(() => { reload().catch(e => toast((e as Error).message, 'bad')); }, [reload, toast]);

  return (
    <div className="flex flex-col gap-3.5">
      <div>
        <h1 className="m-0 text-xl font-semibold tracking-[-0.01em]">Configuración Global</h1>
        <p className="mt-1 text-[13px] text-slate-600">Parámetros del tenant: nada de esto está codificado en el sistema.</p>
      </div>
      <div className="flex gap-0.5 overflow-auto border-b border-slate-200" role="tablist">
        {TABS.map(([k, l]) => (
          <button key={k} role="tab" aria-selected={tab === k} onClick={() => setTab(k)} className={`h-[38px] whitespace-nowrap border-0 bg-transparent px-3.5 text-[13px] font-medium hover:text-ink ${tab === k ? 'text-ink shadow-[inset_0_-2px_0_#2563EB]' : 'text-slate-500'}`}>{l}</button>
        ))}
      </div>
      {!cfg ? <div className="text-sm text-slate-500">Cargando…</div> : tab === 'inst' ? <div className="flex flex-col gap-3.5"><Inst key={JSON.stringify(cfg.perfil)} cfg={cfg} reload={reload} /><SupervisorPin /><Canales /></div> : tab === 'fiscal' ? <Fiscal cfg={cfg} reload={reload} /> : tab === 'finanzas' ? <Finanzas key={JSON.stringify(cfg.finanzas)} cfg={cfg} reload={reload} /> : tab === 'ciclos' ? <Ciclos cfg={cfg} reload={reload} /> : <Rbac cfg={cfg} reload={reload} />}
    </div>
  );
}
