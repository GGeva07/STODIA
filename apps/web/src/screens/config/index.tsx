import { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import type { CfgAssets, CfgCiclo, CfgPerfil, ConfigGlobal, ResultadoVerifRnc, ScreenId, VerifRncResp } from '@stodia/shared';
import { btn, btnPrimary, card, input, pill, pillBase, td, th, type PillTone } from '../../components/system/styles';
import { Modal, useToast, useUi } from '../../components/system/UiProvider';
import { ACCESS, NAV, setAccessOverride, setPapeleriaAbierta } from '../../lib/access';
import { api } from '../../lib/api';
import { AvisoBorrador, useDraft } from '../../lib/useDraft';
import { rncValido } from '../../lib/rnc';
import SupervisorPin from './SupervisorPin';
import Fiscal from './Fiscal';
import Canales from './Canales';
import Firmas from './Firmas';
import { CierreModal } from './CierreCiclo';
import Promocion from './Promocion';
import Reinscripcion from './Reinscripcion';
import { loadFinCfg } from '../../components/finanzas/finConfig';

type Tab = 'inst' | 'fiscal' | 'finanzas' | 'ciclos' | 'promocion' | 'reinscripcion' | 'firmas' | 'rbac';
const TABS: [Tab, string][] = [['inst', 'Perfil institucional'], ['fiscal', 'Gestión fiscal (DGII)'], ['finanzas', 'Finanzas'], ['ciclos', 'Ciclos lectivos'], ['promocion', 'Promoción de curso'], ['reinscripcion', 'Reinscripción'], ['firmas', 'Firmas'], ['rbac', 'Roles y permisos']];
const label = 'flex flex-col gap-1 text-xs font-medium text-slate-600';

type Reload = () => Promise<void>;
interface TabProps { cfg: ConfigGlobal; reload: Reload }

// Borradores de Configuración: no son por ciclo (porCiclo:false); se descartan al guardar con éxito (antes de recargar). Los secretos (contraseñas SMTP, claves API, PIN) no se guardan.
const CFG = { porCiclo: false } as const;

function useAction(reload: Reload) {
  const toast = useToast();
  return async (fn: () => Promise<unknown>, ok: string, tone: 'ok' | 'warn' = 'ok') => {
    try { await fn(); await reload(); toast(ok, tone); return true; } catch (e) { toast((e as Error).message, 'bad'); return false; }
  };
}

/** Estado de la verificación del RNC (lo escribe el servidor tras consultar la API de la DGII con el botón «Verificar con la DGII» o el instalador). */
function RncEstado({ saved, actual }: { saved: CfgPerfil; actual: string }) {
  const dg = (v: string) => (v ?? '').replace(/D/g, '');
  const cambiado = dg(actual) !== dg(saved.rnc);
  if (!cambiado && saved.rncVerificado) {
    const f = saved.rncVerificadoAt ? new Date(saved.rncVerificadoAt) : null;
    const fecha = f && !Number.isNaN(f.getTime()) ? f.toLocaleDateString('es-DO') : '';
    return <span className="text-xs font-normal text-ok-fg"><i className="ph ph-seal-check" /> RNC verificado{fecha ? ` el ${fecha}` : ''}{saved.rncEstado ? ` · ${saved.rncEstado}` : ''}{saved.razonSocial ? ` · razón social registrada: ${saved.razonSocial}` : ''}</span>;
  }
  return <span className="text-xs font-normal text-warn-fg"><i className="ph ph-warning" /> RNC no verificado{cambiado ? ' (cambiado: se marcará como no verificado al guardar)' : ''}{!cambiado && saved.rncEstado ? ` · DGII: ${saved.rncEstado}` : ''}</span>;
}

function useOnline() {
  const [on, setOn] = useState(() => typeof navigator === 'undefined' || navigator.onLine !== false);
  useEffect(() => {
    const up = () => setOn(true), down = () => setOn(false);
    window.addEventListener('online', up); window.addEventListener('offline', down);
    return () => { window.removeEventListener('online', up); window.removeEventListener('offline', down); };
  }, []);
  return on;
}

function Inst({ cfg, reload }: TabProps) {
  const toast = useToast();
  const run = useAction(reload);
  const [p, setP, limP, metaP] = useDraft<CfgPerfil>('config:perfil', cfg.perfil, CFG);
  const online = useOnline();
  const [verif, setVerif] = useState(false);
  const [rv, setRv] = useState<ResultadoVerifRnc | null>(null); // último resultado (solo en pantalla; no se persiste)
  const verificar = async () => {
    if (!rncValido(p.rnc)) return toast('RNC de 9 u 11 dígitos para verificar', 'bad');
    setVerif(true);
    try {
      const r = await api.post<VerifRncResp>('/config/perfil/verificar-rnc', { rnc: p.rnc });
      setRv(r.resultado);
      if (r.resultado.guardado) await reload();
      toast(r.resultado.mensaje, r.resultado.estado === 'verificado' ? 'ok' : 'warn');
    } catch (e) { setRv(null); toast((e as Error).message, 'bad'); } finally { setVerif(false); }
  };
  const dg = (v: string) => (v ?? '').replace(/D/g, '');
  // Nombre registrado en la DGII (de la última verificación en pantalla o del perfil guardado si el RNC no cambió)
  const enDgii = rv && rv.rnc === dg(p.rnc) ? rv.razonSocial : dg(p.rnc) === dg(cfg.perfil.rnc) ? cfg.perfil.razonSocial : undefined;
  const norm = (v: string) => v.trim().replace(/s+/g, ' ').toUpperCase();
  const difiere = !!enDgii && norm(enDgii) !== norm(p.nombre);
  const set = (k: keyof CfgPerfil) => (e: React.ChangeEvent<HTMLInputElement>) => setP({ ...p, [k]: e.target.value });
  const save = () => {
    if (!p.nombre.trim() || !rncValido(p.rnc)) return toast('Razón social obligatoria y RNC de 9 u 11 dígitos', 'bad');
    void run(async () => { await api.put('/config/perfil', p); limP(); }, 'Perfil institucional guardado · se usará en recibos y documentos');
  };
  const ASSETS: [keyof CfgAssets, string, string][] = [['logo', 'Logotipo institucional', 'ph-image'], ['fAcad', 'Firma · Director Académico', 'ph-signature'], ['fFin', 'Firma · Director Financiero', 'ph-signature']];
  return (
    <section className={`${card} flex max-w-[860px] flex-col gap-4 p-[18px]`}>
      <AvisoBorrador meta={metaP} className="w-fit" />
      <div className="grid grid-cols-[repeat(auto-fit,minmax(min(240px,100%),1fr))] gap-3">
        <label className={label}>Razón social<input value={p.nombre} onChange={set('nombre')} className={input} /></label>
        <label className={label}>RNC<input value={p.rnc} onChange={set('rnc')} className={`${input} font-mono`} />
          <RncEstado saved={cfg.perfil} actual={p.rnc} />
          <button type="button" onClick={verificar} disabled={verif || !online || !rncValido(p.rnc)} title={online ? undefined : 'Sin conexión a la red'} className="inline-flex h-[30px] w-fit items-center gap-1.5 rounded-md border border-slate-300 bg-white px-2.5 text-xs font-medium hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-60">
            <i className={`ph ${verif ? 'ph-spinner animate-spin' : 'ph-seal-check'}`} />{verif ? 'Consultando…' : 'Verificar con la DGII'}
          </button>
          {rv && rv.rnc === dg(p.rnc) && <span role="status" className={`text-xs font-normal ${rv.estado === 'verificado' ? 'text-ok-fg' : 'text-warn-fg'}`}>{rv.mensaje}</span>}
          {difiere && (
            <span className="flex flex-wrap items-center gap-2 text-xs font-normal text-slate-600">
              En la DGII: <b className="font-semibold">{enDgii}</b>
              <button type="button" onClick={() => setP({ ...p, nombre: enDgii! })} className="h-[26px] rounded-md border border-slate-300 bg-white px-2 text-xs font-medium hover:bg-slate-100">Usar este nombre</button>
            </span>
          )}
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
  const { toast } = useUi();
  const [modal, setModal] = useState(false);
  const [nuevo, setNuevo] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const abrir = () => {
    const ult = cfg.ciclos.map(c => parseInt(c.n.slice(0, 4), 10)).filter(Number.isFinite).sort((a, b) => b - a)[0];
    setNuevo(ult ? `${ult + 1}–${ult + 2}` : ''); setErr(''); setModal(true);
  };
  const add = async () => {
    const n = nuevo.trim().replace(/\s*[-–—]\s*/, '–');
    if (!/^\d{4}–\d{4}$/.test(n)) return setErr('Formato inválido. Usa 2027–2028');
    if (+n.slice(5) !== +n.slice(0, 4) + 1) return setErr('El año final debe ser el siguiente al inicial (ej. 2027–2028)');
    if (cfg.ciclos.some(c => c.n === n)) return setErr('Ese ciclo ya existe');
    setBusy(true); setErr('');
    try { await api.post('/config/ciclos', { n }); await reload(); toast(`Año escolar ${n} creado · 4 periodos académicos generados`, 'ok'); setModal(false); }
    catch (e) { setErr((e as Error).message); } finally { setBusy(false); }
  };
  // Cierre del año escolar = cierre CONTABLE y de edición (no promueve: ver Promoción de curso). Vista previa con totales → confirmación → resultado.
  const [cierre, setCierre] = useState<string | null>(null);
  const eoy = (c: CfgCiclo) => {
    if (!cfg.ciclos.some(x => x.estado === 'Planificado')) return toast('Crea primero el ciclo siguiente para poder cerrar este', 'warn');
    setCierre(c.n);
  };
  return (
    <div className="flex max-w-[860px] flex-col gap-3.5">
      <section className={`${card} overflow-hidden`}>
        <div className="flex flex-wrap items-center justify-between gap-2.5 border-b border-slate-200 px-4 py-3">
          <span className="text-sm font-semibold">Ciclos lectivos</span>
          <button onClick={abrir} className={btn}><i className="ph ph-plus" />Nuevo año escolar</button>
        </div>
        {cfg.ciclos.map(c => (
          <div key={c.n} className="flex flex-wrap items-center gap-3 border-b border-slate-100 px-4 py-3">
            <span className="w-[100px] font-mono text-sm font-semibold">{c.n}</span>
            <span className={`${pillBase} w-[84px] ${pill[CICLO_TONE[c.estado]]}`}>{c.estado}</span>
            <span className="min-w-[160px] flex-1 text-xs text-slate-500">{CICLO_NOTE[c.estado]}</span>
            {c.estado === 'Activo' && (
              <button onClick={() => eoy(c)} className="inline-flex h-8 items-center gap-1.5 rounded-md border border-[#FCA5A5] bg-white px-3 text-[13px] font-medium text-[#DC2626] hover:bg-bad-bg"><i className="ph ph-lock-key" />Cerrar año escolar</button>
            )}
            {c.estado === 'Cerrado' && c.datos && (
              <button onClick={() => setCierre(c.n)} className={btn}><i className="ph ph-receipt" />Resumen del cierre</button>
            )}
          </div>
        ))}
      </section>
      {modal && (
        <Modal onClose={() => !busy && setModal(false)} width={420}>
          <form onSubmit={e => { e.preventDefault(); void add(); }}>
            <div className="border-b border-slate-200 px-5 py-3.5 text-sm font-semibold">Nuevo año escolar</div>
            <div className="flex flex-col gap-2 px-5 py-4">
              <label htmlFor="nuevo-ciclo" className="text-xs font-medium text-slate-600">Ciclo lectivo (formato 2027–2028)</label>
              <input id="nuevo-ciclo" autoFocus value={nuevo} onChange={e => { setNuevo(e.target.value); setErr(''); }} placeholder="2027–2028" className={`${input} font-mono`} />
              <p className="m-0 text-xs text-slate-500">Se crea como Planificado con sus 4 periodos académicos. No afecta al ciclo activo ni cierra el año.</p>
              {err && <div role="alert" className="rounded-md bg-bad-bg px-2.5 py-2 text-xs text-[#DC2626]">{err}</div>}
            </div>
            <div className="flex justify-end gap-2 border-t border-slate-200 px-5 py-3">
              <button type="button" disabled={busy} onClick={() => setModal(false)} className={btn}>Cancelar</button>
              <button type="submit" disabled={busy} className={btnPrimary}>{busy ? 'Creando…' : 'Crear año escolar'}</button>
            </div>
          </form>
        </Modal>
      )}
      {cierre && <CierreModal ciclo={cierre} onClose={() => setCierre(null)} onDone={reload} />}
      <div className="rounded-lg border border-slate-200 bg-slate-50 px-3.5 py-3 text-xs leading-relaxed text-slate-600">
        El cierre del año escolar es <b>contable y de edición</b>: guarda el resumen financiero del ciclo (facturado, cobrado, pendiente, mora, notas y deuda por alumno), deja el ciclo en solo lectura y activa el siguiente. <b>No pasa estudiantes de curso</b>: eso se hace en la pestaña «Promoción de curso», según las notas. La deuda pendiente del ciclo cerrado se sigue cobrando desde el ciclo activo. Requiere un ciclo siguiente creado, confirmación escrita y clave de supervisor.
      </div>
    </div>
  );
}

const FLAT = NAV.flatMap(g => g.items);

function Rbac({ cfg, reload }: TabProps) {
  const toast = useToast();
  const run = useAction(reload);
  const [newRole, setNewRole] = useDraft('config:newRole', '', CFG);
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
  const [v, setV, limV, metaV] = useDraft('config:finanzas', { matricula: String(f.matricula || ''), inscripcion: String(f.inscripcion || ''), itbis: String(+(f.itbis * 100).toFixed(2)), recargoMoraPct: String(f.recargoMoraPct || ''), descuentoProntoPct: String(f.descuentoProntoPct || ''), diaCorte: String(f.diaCorte || ''), notaPlazoDias: String(f.notaPlazoDias ?? 30), notaCicloAnterior: String(f.notaCicloAnterior ?? 0) }, CFG);
  const set = (k: keyof typeof v) => (e: React.ChangeEvent<HTMLInputElement>) => setV({ ...v, [k]: e.target.value.replace(/[^\d.]/g, '') });
  const [modo, setModo, limM] = useDraft<'fija' | 'plan'>('config:finanzas:modo', f.inscripcionModo === 'plan' ? 'plan' : 'fija', CFG);
  const save = () => {
    const n = (s: string) => parseFloat(s) || 0;
    if (n(v.itbis) > 100 || n(v.recargoMoraPct) > 100 || n(v.descuentoProntoPct) > 100) return toast('Los porcentajes no pueden superar 100', 'bad');
    if (n(v.diaCorte) > 28) return toast('El día de corte debe estar entre 1 y 28', 'bad');
    void run(async () => { await api.put('/config/finanzas', { matricula: n(v.matricula), inscripcion: n(v.inscripcion), itbis: n(v.itbis) / 100, recargoMoraPct: n(v.recargoMoraPct), descuentoProntoPct: n(v.descuentoProntoPct), diaCorte: n(v.diaCorte), notaPlazoDias: n(v.notaPlazoDias), notaCicloAnterior: n(v.notaCicloAnterior) ? 1 : 0, inscripcionModo: modo }); limV(); limM(); await loadFinCfg(true); }, 'Configuración financiera guardada · aplica a cobros, inscripción y kiosko');
  };
  const F: [keyof typeof v, string, string][] = [
    ['matricula', 'Matrícula (RD$)', 'Se cobra una vez por alumno en la inscripción.'], ['inscripcion', modo === 'plan' ? 'Inscripción de respaldo (RD$)' : 'Inscripción fija (RD$)', modo === 'plan' ? 'Se usa solo si el plan elegido no tiene su propia cuota de inscripción.' : 'Cargo de inscripción anual, igual para todos.'],
    ['itbis', 'ITBIS (%)', 'Se aplica en el kiosko a los artículos gravados.'], ['recargoMoraPct', 'Recargo por mora (%)', 'Valor por defecto al crear planes de pago.'],
    ['descuentoProntoPct', 'Descuento por pronto pago (%)', 'Ya no se usa para calcular: el pronto pago se define en cada plan de pago (porcentaje y día límite).'], ['diaCorte', 'Día de corte', 'Día del mes (1–28) en que se cierra la facturación.'],
    ['notaPlazoDias', 'Plazo para notas de crédito (días)', 'Pasado este plazo desde el recibo, la nota exige un motivo escrito y la clave de supervisor (0 = sin plazo; A VALIDAR con el contador).'],
    ['notaCicloAnterior', 'Notas sobre ciclos anteriores (1 = sí)', '0 = solo recibos del ciclo activo. Un ciclo cerrado siempre es solo lectura.'],
  ];
  const abierta = cfg.papeleriaAbierta;
  const togglePapeleria = () => void run(async () => { const r = await api.put<{ papeleriaAbierta: boolean }>('/config/papeleria', { abierta: !abierta }); setPapeleriaAbierta(r.papeleriaAbierta); }, abierta ? 'Papelería cerrada al público · Venta Rápida desactivada' : 'Papelería abierta al público · Venta Rápida activada');
  return (
    <div className="flex max-w-[860px] flex-col gap-3.5">
    <section className={`${card} flex items-center justify-between gap-4 p-[18px]`}>
      <div className="flex flex-col gap-1">
        <span className="text-sm font-semibold">Papelería abierta al público · <span style={{ color: abierta ? '#16A34A' : '#64748B' }}>{abierta ? 'Activada' : 'Desactivada'}</span></span>
        <span className="text-xs text-slate-500">Activa la pantalla Venta Rápida (ventas al contado a público general). Apagada: los artículos y servicios se cargan al alumno desde su expediente y se cobran en Cobros.</span>
      </div>
      <button role="switch" aria-checked={abierta} aria-label="Papelería abierta al público" onClick={togglePapeleria} className={`relative h-6 w-11 shrink-0 cursor-pointer rounded-full border-0 transition-colors ${abierta ? 'bg-accent' : 'bg-slate-300'}`}><span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all ${abierta ? 'left-[22px]' : 'left-0.5'}`} /></button>
    </section>
    <section className={`${card} flex max-w-[860px] flex-col gap-4 p-[18px]`}>
      <AvisoBorrador meta={{ ...metaV, descartar: () => { limV(); limM(); } }} className="w-fit" />
      <fieldset className="flex flex-col gap-2 rounded-md border border-slate-200 p-3">
        <legend className="px-1 text-xs font-semibold uppercase tracking-wide text-slate-600">Modalidad de cuota de inscripción</legend>
        <div role="radiogroup" aria-label="Modalidad de cuota de inscripción" className="grid gap-2 [grid-template-columns:repeat(auto-fit,minmax(240px,1fr))]">
          {([['fija', 'Cuota fija para todos', 'Todos los alumnos pagan el monto de «Inscripción fija» sin importar el plan.'], ['plan', 'Según el plan de pago', 'Cada plan define su cuota de inscripción (puede variar). Si un plan no la tiene, se usa la cuota fija como respaldo.']] as const).map(([k, l, d]) => (
            <label key={k} className={`flex cursor-pointer items-start gap-2.5 rounded-md border px-3 py-2.5 text-[13px] ${modo === k ? 'border-accent bg-blue-50' : 'border-slate-200 bg-white'}`}>
              <input type="radio" name="inscripcionModo" checked={modo === k} onChange={() => setModo(k)} className="mt-0.5 h-4 w-4 accent-accent" data-testid={`ins-modo-${k}`} />
              <span className="flex flex-col gap-0.5"><span className="font-semibold">{l}</span><span className="text-xs text-slate-500">{d}</span></span>
            </label>
          ))}
        </div>
      </fieldset>
      <div className="grid grid-cols-[repeat(auto-fit,minmax(min(240px,100%),1fr))] gap-3">
        {F.map(([k, l, h]) => (
          <label key={k} className={label}>{l}<input value={v[k]} onChange={set(k)} inputMode="decimal" className={`${input} text-right font-mono`} /><span className="text-[11px] font-normal text-slate-500">{h}</span></label>
        ))}
      </div>
      <div className="flex justify-end"><button onClick={save} className={btnPrimary}><i className="ph ph-floppy-disk" />Guardar configuración financiera</button></div>
    </section>
    </div>
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
      {!cfg ? <div className="text-sm text-slate-500">Cargando…</div> : tab === 'inst' ? <div className="flex flex-col gap-3.5"><Inst key={JSON.stringify(cfg.perfil)} cfg={cfg} reload={reload} /><SupervisorPin /><Canales /></div> : tab === 'fiscal' ? <Fiscal cfg={cfg} reload={reload} /> : tab === 'finanzas' ? <Finanzas key={JSON.stringify(cfg.finanzas)} cfg={cfg} reload={reload} /> : tab === 'ciclos' ? <Ciclos cfg={cfg} reload={reload} /> : tab === 'promocion' ? <Promocion /> : tab === 'reinscripcion' ? <Reinscripcion /> : tab === 'firmas' ? <Firmas /> : <Rbac cfg={cfg} reload={reload} />}
    </div>
  );
}
