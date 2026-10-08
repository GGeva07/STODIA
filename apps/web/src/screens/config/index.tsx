import { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import type { CfgAssets, CfgCiclo, CfgNcf, CfgPerfil, ConfigGlobal, ScreenId } from '@stodia/shared';
import { btn, btnPrimary, card, input, pill, pillBase, td, th, type PillTone } from '../../components/system/styles';
import { useToast, useUi } from '../../components/system/UiProvider';
import { ACCESS, NAV, setAccessOverride } from '../../lib/access';
import { api } from '../../lib/api';
import SupervisorPin from './SupervisorPin';

type Tab = 'inst' | 'fiscal' | 'ciclos' | 'rbac';
const TABS: [Tab, string][] = [['inst', 'Perfil institucional'], ['fiscal', 'Gestión fiscal (DGII)'], ['ciclos', 'Ciclos lectivos'], ['rbac', 'Roles y permisos']];
const label = 'flex flex-col gap-1 text-xs font-medium text-slate-600';

type Reload = () => Promise<void>;
interface TabProps { cfg: ConfigGlobal; reload: Reload }

function useAction(reload: Reload) {
  const toast = useToast();
  return async (fn: () => Promise<unknown>, ok: string, tone: 'ok' | 'warn' = 'ok') => {
    try { await fn(); await reload(); toast(ok, tone); return true; } catch (e) { toast((e as Error).message, 'bad'); return false; }
  };
}

function Inst({ cfg, reload }: TabProps) {
  const toast = useToast();
  const run = useAction(reload);
  const [p, setP] = useState<CfgPerfil>(cfg.perfil);
  const set = (k: keyof CfgPerfil) => (e: React.ChangeEvent<HTMLInputElement>) => setP({ ...p, [k]: e.target.value });
  const save = () => {
    if (!p.nombre.trim() || p.rnc.replace(/\D/g, '').length !== 9) return toast('Razón social obligatoria y RNC de 9 dígitos', 'bad');
    void run(() => api.put('/config/perfil', p), 'Perfil institucional guardado · se usará en recibos y documentos');
  };
  const ASSETS: [keyof CfgAssets, string, string][] = [['logo', 'Logotipo institucional', 'ph-image'], ['fAcad', 'Firma · Director Académico', 'ph-signature'], ['fFin', 'Firma · Director Financiero', 'ph-signature']];
  return (
    <section className={`${card} flex max-w-[860px] flex-col gap-4 p-[18px]`}>
      <div className="grid grid-cols-[repeat(auto-fit,minmax(min(240px,100%),1fr))] gap-3">
        <label className={label}>Razón social<input value={p.nombre} onChange={set('nombre')} className={input} /></label>
        <label className={label}>RNC<input value={p.rnc} onChange={set('rnc')} className={`${input} font-mono`} /></label>
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

function ncfRow(n: CfgNcf) {
  const act = n.act ?? n.desde, total = n.hasta - n.desde + 1, rem = n.hasta - act, remPct = rem / total * 100;
  const st = rem <= 0 ? 'Agotada' : remPct <= n.umbral ? 'Por agotar' : 'Vigente';
  const tone: PillTone = st === 'Vigente' ? 'ok' : st === 'Por agotar' ? 'warn' : 'bad';
  const bar = tone === 'ok' ? 'bg-[#16A34A]' : tone === 'warn' ? 'bg-[#D97706]' : 'bg-[#DC2626]';
  const fg = tone === 'ok' ? 'text-ok-fg' : tone === 'warn' ? 'text-warn-fg' : 'text-bad-fg';
  return { act, total, rem, st, tone, bar, fg, pct: Math.min(100, Math.round((act - n.desde) / total * 100)) };
}

function Fiscal({ cfg, reload }: TabProps) {
  const toast = useToast();
  const run = useAction(reload);
  const [form, setForm] = useState<{ pref: string; desde: string; hasta: string } | null>(null);
  const [um, setUm] = useState<Record<number, string>>({});
  const saveNcf = async () => {
    if (!form) return;
    const d = parseInt(form.desde), h = parseInt(form.hasta);
    if (!(d >= 1) || !(h > d)) return toast('El rango debe ser válido: «hasta» mayor que «desde»', 'bad');
    if (await run(() => api.post('/config/ncf', { pref: form.pref, desde: d, hasta: h }), `Resolución ${form.pref} registrada (${d}–${h})`)) setForm(null);
  };
  const saveUm = (i: number, n: CfgNcf) => {
    const v = parseInt(um[i] ?? String(n.umbral));
    if (!(v >= 1 && v <= 50)) return toast('El umbral debe estar entre 1 y 50 %', 'bad');
    if (v !== n.umbral) void run(() => api.put('/config/ncf/' + i, { umbral: v }), `Alerta de ${n.pref} al ${v}% restante`);
  };
  const digits = (k: 'desde' | 'hasta') => (e: React.ChangeEvent<HTMLInputElement>) => setForm({ ...form!, [k]: e.target.value.replace(/\D/g, '') });
  return (
    <div className="flex flex-col gap-3.5">
      <section className={`${card} overflow-hidden`}>
        <div className="flex flex-wrap items-center justify-between gap-2.5 border-b border-slate-200 px-4 py-3">
          <span className="text-sm font-semibold">Secuencias de NCF (DGII)</span>
          <button onClick={() => setForm({ pref: 'B01', desde: '1', hasta: '500' })} className={btn}><i className="ph ph-plus" />Registrar resolución</button>
        </div>
        {form && (
          <div className="grid grid-cols-[repeat(auto-fit,minmax(140px,1fr))] items-end gap-2.5 border-b border-slate-200 bg-slate-50 px-4 py-3">
            <label className={label}>Prefijo
              <select value={form.pref} onChange={e => setForm({ ...form, pref: e.target.value })} className={input}>
                <option value="B01">B01 · Crédito fiscal</option><option value="B02">B02 · Consumo</option><option value="B04">B04 · Nota de crédito</option><option value="B14">B14 · Regímenes especiales</option>
              </select>
            </label>
            <label className={label}>Desde<input value={form.desde} onChange={digits('desde')} className={input} /></label>
            <label className={label}>Hasta<input value={form.hasta} onChange={digits('hasta')} className={input} /></label>
            <div className="flex gap-1.5">
              <button onClick={saveNcf} className="h-9 rounded-md bg-accent px-3.5 text-[13px] font-semibold text-white">Registrar</button>
              <button onClick={() => setForm(null)} className="h-9 rounded-md border border-slate-300 bg-white px-3 text-[13px]">Cancelar</button>
            </div>
          </div>
        )}
        <div className="overflow-x-auto">
          <table className="w-full min-w-[820px] border-collapse text-[13px]">
            <thead><tr>
              {['Prefijo', 'Tipo', 'Rango', 'Actual', 'Uso', 'Restantes', 'Alerta al (%)', 'Estado'].map((c, i) => <th key={c} className={`${th} ${[2, 3, 5, 6].includes(i) ? '!text-right' : ''}`}>{c}</th>)}
            </tr></thead>
            <tbody>
              {cfg.ncf.map((n, i) => {
                const r = ncfRow(n);
                return (
                  <tr key={i} className="h-12">
                    <td className={`${td} font-mono font-semibold`}>{n.pref}</td>
                    <td className={td}>{n.tipo}</td>
                    <td className={`${td} whitespace-nowrap text-right font-mono text-xs text-slate-600`}>{n.desde} – {n.hasta}</td>
                    <td className={`${td} text-right font-mono font-medium`}>{r.act}</td>
                    <td className={`${td} w-40`}><div className="h-1.5 overflow-hidden rounded-full bg-slate-200"><div className={`h-full ${r.bar}`} style={{ width: r.pct + '%' }} /></div></td>
                    <td className={`${td} text-right font-mono font-semibold ${r.fg}`}>{r.rem}</td>
                    <td className={`${td} text-right`}>
                      <input value={um[i] ?? String(n.umbral)} onChange={e => setUm({ ...um, [i]: e.target.value })} onBlur={() => saveUm(i, n)} className="h-[30px] w-14 rounded-md border border-slate-300 px-1.5 text-right font-mono text-[13px] text-ink" />
                    </td>
                    <td className={td}><span className={`${pillBase} w-[92px] ${pill[r.tone]}`}>{r.st}</span></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
      <section className={`${card} flex flex-wrap items-center gap-3.5 p-4`}>
        <span className="grid h-11 w-11 place-items-center rounded-lg bg-slate-100 text-[22px] text-slate-600"><i className="ph ph-certificate" /></span>
        <div className="min-w-[220px] flex-1">
          <div className="text-sm font-semibold">Certificado digital e-CF</div>
          <div className={`text-xs ${cfg.ecf ? 'text-ok-fg' : 'text-warn-fg'}`}>{cfg.ecf ? [cfg.ecfInfo?.archivo || 'Certificado cargado', cfg.ecfInfo?.vence ? `vence ${cfg.ecfInfo.vence}` : ''].filter(Boolean).join(' · ') : 'Sin certificado: no se pueden firmar e-CF'}</div>
          <div className="mt-0.5 flex items-center gap-1.5 text-[11px] text-slate-500"><i className="ph ph-lock-key" />Almacenado cifrado (AES-256) en Key Vault · nunca se muestra ni se descarga</div>
        </div>
        <button onClick={() => run(() => api.post('/config/ecf'), 'Certificado cargado y cifrado en el Key Vault')} className={btn}><i className="ph ph-upload-simple" />{cfg.ecf ? 'Reemplazar certificado' : 'Cargar certificado'}</button>
      </section>
    </div>
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

export default function Screen() {
  const [sp] = useSearchParams();
  const [tab, setTab] = useState<Tab>(() => (TABS.some(t => t[0] === sp.get('tab')) ? (sp.get('tab') as Tab) : 'inst'));
  const [cfg, setCfg] = useState<ConfigGlobal | null>(null);
  const toast = useToast();
  const reload = useCallback(async () => { setCfg(await api.get<ConfigGlobal>('/config')); }, []);
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
      {!cfg ? <div className="text-sm text-slate-500">Cargando…</div> : tab === 'inst' ? <div className="flex flex-col gap-3.5"><Inst key={JSON.stringify(cfg.perfil)} cfg={cfg} reload={reload} /><SupervisorPin /></div> : tab === 'fiscal' ? <Fiscal cfg={cfg} reload={reload} /> : tab === 'ciclos' ? <Ciclos cfg={cfg} reload={reload} /> : <Rbac cfg={cfg} reload={reload} />}
    </div>
  );
}
