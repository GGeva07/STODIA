import { useCallback, useEffect, useState, type ReactNode } from 'react';
import type { AliCatalogos, AliData, AliMenuDto, AliPlanDto, AliPlanInput } from '@stodia/shared';
import { api } from '../../lib/api';
import { useSession } from '../../lib/session';
import { useToastStack } from '../../components/useToastStack';
import { td } from '../../components/system/styles';

const fmt = (n: number | string) => 'RD$ ' + Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const errMsg = (e: unknown) => (e instanceof Error ? e.message : 'Error inesperado');

const blank = (cat: AliCatalogos): AliPlanInput => ({
  name: '', modelo: 'sub', meals: cat.comidas.map(c => /almuerzo/i.test(c)), precio: '', freq: 'Mensual', dias: 'Lunes a Viernes', mora: 'si',
  recarga: '500', limite: '300', canal: 'Portal y Caja', saldo: 'Se transfiere', diets: cat.dietas.map(() => false), estado: 'Activo',
});
const TH = 'whitespace-nowrap border-b border-slate-200 bg-slate-50 px-3 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wide text-slate-600';
const TD = td;
const INPUT = 'h-9 w-full rounded-md border px-2.5 text-[13px] text-ink outline-none focus:border-accent';

function Pill({ bg, fg, w, children }: { bg: string; fg: string; w: number; children: string }) {
  return <span className="inline-flex h-[19px] flex-none items-center justify-center overflow-hidden text-ellipsis whitespace-nowrap rounded-full px-[5px] text-[10px] font-semibold leading-none" style={{ background: bg, color: fg, width: w }}>{children}</span>;
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return <label className="flex flex-col gap-1 text-xs font-medium text-slate-600">{label}{children}</label>;
}

export default function Screen() {
  const { user } = useSession();
  const canEdit = user?.rol === 'Super Admin' || user?.rol === 'Encargado Comedor';
  const { toast, toasts } = useToastStack();
  const [data, setData] = useState<AliData | null>(null);
  const [tab, setTab] = useState<'cat' | 'menu'>('cat');
  const [ad, setAd] = useState<{ id: string | null; mode: 'view' | 'edit' | 'create'; f: AliPlanInput; inscritos: number; err: string } | null>(null);
  const [menuEdit, setMenuEdit] = useState<number | null>(null);
  const [draft, setDraft] = useState('');
  const [draftAlgs, setDraftAlgs] = useState<string[]>([]);

  const load = useCallback(() => api.get<AliData>('/alimentacion').then(setData).catch(e => toast(errMsg(e), 'bad')), [toast]);
  useEffect(() => { void load(); }, [load]);
  if (!data) return <>{toasts}<p className="text-sm text-slate-500">Cargando…</p></>;

  const { planes, menu } = data;
  const { comidas: MEALS, dietas: DIETS, alergias: ALGS } = data.catalogos;
  const subs = planes.filter(p => p.modelo === 'sub' && p.estado === 'Activo');
  const stats: [string, string | number, string][] = [
    ['Suscritos a comedor', subs.reduce((a, p) => a + p.inscritos, 0), '#0F172A'],
    ['Monederos activos', planes.filter(p => p.modelo === 'wal').reduce((a, p) => a + p.inscritos, 0), '#0F172A'],
    ['Ingreso mensual comedor', fmt(subs.reduce((a, p) => a + (p.inscritos * (Number(p.precio) || 0)) / (p.freq === 'Semestral' ? 5 : 1), 0)), '#0F172A'],
    ['Alumnos con alergias', data.alumnosConAlergia, '#DC2626'],
  ];

  const openAd = (p: AliPlanDto | null, mode: 'view' | 'edit' | 'create') =>
    setAd({ id: p?.id ?? null, mode, inscritos: p?.inscritos ?? 0, err: '', f: p ? { ...p, meals: p.meals.slice(), diets: p.diets.slice() } : blank(data.catalogos) });

  const del = async (p: AliPlanDto) => {
    if (p.inscritos > 0) { toast(`No se puede eliminar: ${p.inscritos} alumnos inscritos. Márcalo Inactivo para cerrar nuevas inscripciones.`, 'bad'); return; }
    if (!window.confirm(`Eliminar plan ${p.id}\nSe eliminará «${p.name}» del catálogo de comedor.`)) return;
    try { await api.del('/alimentacion/planes/' + p.id); setAd(null); await load(); toast(`Plan ${p.id} eliminado`, 'warn'); } catch (e) { toast(errMsg(e), 'bad'); }
  };

  const save = async () => {
    if (!ad) return;
    if (ad.mode === 'view') { setAd({ ...ad, mode: 'edit' }); return; }
    try {
      const saved = ad.mode === 'create' ? await api.post<AliPlanDto>('/alimentacion/planes', ad.f) : await api.put<AliPlanDto>('/alimentacion/planes/' + ad.id, ad.f);
      await load();
      if (ad.mode === 'create') { setAd(null); toast(`Plan alimenticio ${saved.id} creado`, 'ok'); }
      else { setAd({ ...ad, mode: 'view', f: ad.f, err: '' }); toast(`Plan ${ad.id} actualizado · registrado en auditoría`, 'ok'); }
    } catch (e) { setAd({ ...ad, err: errMsg(e) }); }
  };

  const saveMenu = async (i: number) => {
    if (!draft.trim()) { toast('El plato no puede quedar vacío', 'bad'); return; }
    try {
      await api.put('/alimentacion/menu/' + i, { plato: draft.trim(), algs: draftAlgs });
      await load(); setMenuEdit(null);
      toast(`Menú del ${menu[i].dia} actualizado · notificado en el portal de tutores`, 'ok');
    } catch (e) { toast(errMsg(e), 'bad'); }
  };

  const f = ad?.f; const ro = ad?.mode === 'view'; const sub = f?.modelo === 'sub';
  const setF = (p: Partial<AliPlanInput>) => setAd(a => (a ? { ...a, f: { ...a.f, ...p }, err: '' } : a));
  const tog = (k: 'meals' | 'diets', i: number) => () => { if (ro || !f) return; const arr = f[k].slice(); arr[i] = !arr[i]; setF({ [k]: arr }); };
  const bd = ro ? 'border-slate-200 bg-slate-50' : 'border-slate-300 bg-white';

  const chips = (k: 'meals' | 'diets', labels: string[]) => (
    <div className="flex flex-wrap gap-1.5">
      {labels.map((l, i) => {
        const on = f![k][i];
        return (
          <button key={l} type="button" disabled={ro} onClick={tog(k, i)} className={`flex h-[30px] items-center gap-1 rounded-full border px-2.5 text-xs font-medium ${on ? 'border-accent bg-blue-50 text-info-fg' : 'border-slate-300 bg-white text-slate-600'}`}>
            <i className={on ? 'ph-bold ph-check' : 'ph ph-plus'} />{l}
          </button>
        );
      })}
    </div>
  );

  const impact = !f ? '' : sub
    ? Number(f.precio) > 0
      ? `Al asignarlo se generan cuotas de ${fmt(f.precio)}${f.freq === 'Semestral' ? ' por semestre' : ' por mes'} en la cartera del tutor financiero${f.mora === 'si' ? ', con recargo por mora según la política del plan de pago.' : ', sin recargo por mora.'}`
      : 'Define el precio para ver el impacto en cartera.'
    : `El tutor recarga desde ${f.canal.toLowerCase()} (mínimo ${fmt(f.recarga)}). El operador de cafetería bloquea consumos que superen ${fmt(f.limite || 0)} al día. Saldo al cierre: ${f.saldo.toLowerCase()}.`;

  const sel = (k: keyof AliPlanInput, opts: (string | [string, string])[]) => (
    <select value={String(f![k])} onChange={e => setF({ [k]: e.target.value })} disabled={ro} className={`${INPUT} px-2 ${bd}`}>
      {opts.map(o => { const [v, l] = Array.isArray(o) ? o : [o, o]; return <option key={v} value={v}>{l}</option>; })}
    </select>
  );
  const mono = (k: 'precio' | 'recarga' | 'limite') => <input value={f![k]} onChange={e => setF({ [k]: e.target.value })} disabled={ro} className={`${INPUT} text-right font-mono ${bd}`} />;

  return (
    <div className="flex flex-col gap-3.5">
      {toasts}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Planes de Alimentación</h1>
          <p className="mt-1 text-[13px] text-slate-600">Suscripciones de comedor integradas al plan de pago y monederos virtuales para cafetería.</p>
        </div>
        {tab === 'cat' && canEdit && (
          <button onClick={() => openAd(null, 'create')} className="flex h-[34px] items-center gap-1.5 rounded-md bg-accent px-3.5 text-[13px] font-medium text-white hover:bg-accent-dark"><i className="ph ph-plus" />Nuevo Plan Alimenticio</button>
        )}
      </div>
      <div className="flex flex-wrap gap-7">
        {stats.map(([l, v, c]) => <div key={l}><div className="text-xs text-slate-500">{l}</div><div className="font-mono text-xl font-semibold" style={{ color: c }}>{v}</div></div>)}
      </div>
      <div className="flex gap-0.5 border-b border-slate-200">
        {([['cat', 'Catálogo de planes'], ['menu', 'Menú semanal']] as const).map(([k, l]) => (
          <button key={k} onClick={() => setTab(k)} className={`h-[38px] px-3.5 text-[13px] font-medium hover:text-ink ${tab === k ? 'text-ink shadow-[inset_0_-2px_0_#2563EB]' : 'text-slate-500'}`}>{l}</button>
        ))}
      </div>

      {tab === 'cat' && (
        <section className="overflow-hidden rounded-lg border border-slate-200 bg-white">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1000px] border-collapse text-[13px]">
              <thead><tr>
                {['Plan', 'Modelo', 'Incluye', 'Dietas especiales'].map(h => <th key={h} className={TH}>{h}</th>)}
                <th className={TH + ' text-right'}>Precio / Límite</th><th className={TH}>Cobro</th><th className={TH + ' text-right'}>Inscritos</th><th className={TH}>Estado</th><th className={TH + ' text-right'}>Acciones</th>
              </tr></thead>
              <tbody>
                {planes.map(p => {
                  const isSub = p.modelo === 'sub', act = p.estado === 'Activo';
                  const ds = DIETS.filter((_, i) => p.diets[i]);
                  return (
                    <tr key={p.id} className="h-12 hover:bg-slate-50" style={{ opacity: act ? 1 : 0.75 }}>
                      <td className={TD}>
                        <div className="flex items-center gap-2.5 py-1.5">
                          <span className="grid h-[30px] w-[30px] flex-none place-items-center rounded-md bg-slate-100 text-base text-slate-700"><i className={isSub ? 'ph ph-fork-knife' : 'ph ph-wallet'} /></span>
                          <div className="flex flex-col leading-snug">
                            <button onClick={() => openAd(p, 'view')} className="p-0 text-left text-[13px] font-semibold text-ink hover:text-accent hover:underline">{p.name}</button>
                            <span className="font-mono text-[11px] text-slate-500">{p.id}</span>
                          </div>
                        </div>
                      </td>
                      <td className={TD}><Pill bg={isSub ? '#DBEAFE' : '#FEF3C7'} fg={isSub ? '#1D4ED8' : '#B45309'} w={101}>{isSub ? 'Suscripción' : 'Monedero virtual'}</Pill></td>
                      <td className={TD + ' text-xs text-slate-600'}>{isSub ? MEALS.filter((_, i) => p.meals[i]).join(' · ') + ' · ' + p.dias : 'Consumo libre en cafetería'}</td>
                      <td className={TD + ' text-xs text-slate-600'}>{ds.length ? ds.join(', ') : '—'}</td>
                      <td className={TD + ' whitespace-nowrap text-right font-mono text-[13px] font-semibold'}>{isSub ? fmt(p.precio) + (p.freq === 'Semestral' ? '/sem' : '/mes') : 'Límite ' + fmt(p.limite) + '/día'}</td>
                      <td className={TD + ' whitespace-nowrap text-xs text-slate-600'}>{isSub ? p.freq + ' · ' + (p.mora === 'si' ? 'con mora' : 'sin mora') : 'Recarga mín. ' + fmt(p.recarga)}</td>
                      <td className={TD + ' text-right font-mono text-[13px] font-medium'}>{p.inscritos}</td>
                      <td className={TD}><Pill bg={act ? '#DCFCE7' : '#F1F5F9'} fg={act ? '#15803D' : '#475569'} w={76}>{p.estado}</Pill></td>
                      <td className={TD + ' whitespace-nowrap text-right'}>
                        <div className="inline-flex gap-0.5">
                          <button onClick={() => openAd(p, 'view')} title="Ver detalle" className="grid h-[30px] w-[30px] place-items-center rounded-md text-base text-slate-600 hover:bg-slate-100"><i className="ph ph-eye" /></button>
                          {canEdit && <>
                            <button onClick={() => openAd(p, 'edit')} title="Editar" className="grid h-[30px] w-[30px] place-items-center rounded-md text-base text-accent hover:bg-blue-50"><i className="ph ph-pencil-simple" /></button>
                            <button onClick={() => void del(p)} title="Eliminar" className="grid h-[30px] w-[30px] place-items-center rounded-md text-base text-red-600 hover:bg-red-100"><i className="ph ph-trash" /></button>
                          </>}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {planes.length === 0 && (
              <div className="flex flex-col items-start gap-2.5 px-6 py-10">
                <span className="grid h-[52px] w-[52px] place-items-center rounded-full bg-blue-50 text-[26px] text-accent"><i className="ph ph-bowl-food" /></span>
                <div className="text-[15px] font-semibold">No hay planes alimenticios configurados.</div>
                <div className="text-[13px] text-slate-600">Crea una suscripción de comedor o un monedero virtual para ofrecerlo en la inscripción.</div>
                {canEdit && <button onClick={() => openAd(null, 'create')} className="flex h-[34px] items-center gap-1.5 rounded-md bg-accent px-3.5 text-[13px] font-medium text-white"><i className="ph ph-plus" />Nuevo Plan Alimenticio</button>}
              </div>
            )}
          </div>
        </section>
      )}

      {tab === 'menu' && (
        <div className="flex flex-col gap-2.5">
          <div className="flex flex-wrap items-center justify-between gap-2.5">
            <span className="text-[13px] text-slate-600">{data.semana.label} · visible para tutores en el portal</span>
            <span className="flex items-center gap-1.5 text-xs text-slate-500"><i className="ph-fill ph-warning text-red-600" />Se cruzan los alérgenos con los alumnos inscritos</span>
          </div>
          <section className="overflow-hidden rounded-lg border border-slate-200 bg-white">
            {menu.map((d: AliMenuDto, i) => {
              const ed = menuEdit === i;
              const aff = Object.entries(d.afectados);
              const nAff = aff.reduce((a, [, n]) => a + n, 0);
              return (
                <div key={d.dia} className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-slate-100 px-4 py-3">
                  <div className="w-[100px] flex-none text-[13px] font-semibold">{d.dia}</div>
                  <div className="flex min-w-0 flex-[3_1_260px] flex-col gap-1.5">
                    {ed ? (
                      <div className="flex flex-col gap-1.5">
                        <input value={draft} onChange={e => setDraft(e.target.value)} className="h-8 rounded-md border border-accent px-2.5 text-[13px] text-ink outline-none" />
                        <div className="flex flex-wrap gap-1">
                          {ALGS.map(a => {
                            const on = draftAlgs.includes(a);
                            return <button key={a} onClick={() => setDraftAlgs(x => (on ? x.filter(y => y !== a) : [...x, a]))} className={`h-6 rounded-full border px-2 text-[11px] font-semibold ${on ? 'border-red-300 bg-red-100 text-red-700' : 'border-slate-300 bg-white text-slate-600'}`}>{a}</button>;
                          })}
                        </div>
                      </div>
                    ) : (
                      <>
                        <span className="text-[13px]">{d.plato || <span className="text-slate-400">Sin definir · edítalo para publicarlo</span>}</span>
                        <div className="flex flex-wrap gap-1">{d.algs.map(a => <span key={a} className="inline-flex h-5 items-center whitespace-nowrap rounded-full bg-red-100 px-[7px] text-[11px] font-semibold text-red-700">Contiene {a}</span>)}</div>
                      </>
                    )}
                  </div>
                  <div className="flex-[2_1_180px] text-xs font-medium" style={{ color: nAff ? '#B91C1C' : '#15803D' }}>
                    {nAff ? `${nAff} alumno(s) con alergia: ${aff.map(([a, n]) => `${a} (${n})`).join(', ')} → menú alterno` : 'Sin conflictos con alumnos inscritos'}
                  </div>
                  {canEdit && (
                    <div className="flex-none text-right">
                      <button
                        onClick={() => (ed ? void saveMenu(i) : (setMenuEdit(i), setDraft(d.plato), setDraftAlgs(d.algs.slice())))}
                        className={`h-7 rounded-md border px-2.5 text-xs font-semibold ${ed ? 'border-accent bg-accent text-white' : 'border-slate-300 bg-white text-ink'}`}
                      >{ed ? 'Guardar' : 'Editar'}</button>
                    </div>
                  )}
                </div>
              );
            })}
          </section>
        </div>
      )}

      {ad && f && (
        <div onClick={() => setAd(null)} className="fixed inset-0 z-[66] flex justify-end bg-slate-900/40">
          <div onClick={e => e.stopPropagation()} className="flex h-full w-[min(520px,100vw)] flex-col bg-white shadow-[-12px_0_32px_rgba(15,23,42,0.2)]">
            <div className="flex items-center gap-3 border-b border-slate-200 px-5 py-4">
              <div className="min-w-0 flex-1">
                <div className="text-[15px] font-semibold">{ad.mode === 'create' ? 'Nuevo plan alimenticio' : (ad.mode === 'edit' ? 'Editar · ' : '') + f.name}</div>
                <div className="text-xs text-slate-500">{ad.mode === 'create' ? 'Quedará disponible en Inscripción y en el expediente (Servicios y Contrato)' : `${ad.id} · ${ad.inscritos} alumnos inscritos`}</div>
              </div>
              <button onClick={() => setAd(null)} aria-label="Cerrar" className="h-8 w-8 rounded-md border border-slate-300 bg-white"><i className="ph ph-x" /></button>
            </div>
            <div className="flex flex-1 flex-col gap-3.5 overflow-auto px-5 py-[18px]">
              <Field label="Nombre del plan *"><input value={f.name} onChange={e => setF({ name: e.target.value })} disabled={ro} className={`${INPUT} ${bd}`} /></Field>
              <div className="flex flex-col gap-1.5">
                <span className="text-xs font-medium text-slate-600">Modelo</span>
                <div className="grid grid-cols-2 gap-2">
                  {([['sub', 'Suscripción', 'Se cobra con el plan de pago mensual', 'ph ph-fork-knife'], ['wal', 'Monedero virtual', 'El tutor recarga saldo; consumo con límite diario', 'ph ph-wallet']] as const).map(([k, l, d, icon]) => (
                    <button key={k} type="button" disabled={ro} onClick={() => setF({ modelo: k })} className={`flex flex-col gap-0.5 rounded-lg border-2 px-3 py-2.5 text-left ${f.modelo === k ? 'border-accent bg-blue-50' : 'border-slate-200 bg-white'}`}>
                      <span className="flex items-center gap-1.5 text-[13px] font-semibold text-ink"><i className={icon} />{l}</span>
                      <span className="text-[11px] text-slate-600">{d}</span>
                    </button>
                  ))}
                </div>
              </div>
              {sub ? (
                <div className="flex flex-col gap-3.5">
                  <div className="flex flex-col gap-1.5"><span className="text-xs font-medium text-slate-600">Comidas incluidas *</span>{chips('meals', MEALS)}</div>
                  <div className="grid grid-cols-2 gap-2.5">
                    <Field label="Precio mensual (RD$) *">{mono('precio')}</Field>
                    <Field label="Frecuencia de cobro">{sel('freq', ['Mensual', 'Semestral'])}</Field>
                    <Field label="Días de servicio">{sel('dias', ['Lunes a Viernes', 'Lunes a Jueves'])}</Field>
                    <Field label="Aplica recargo por mora">{sel('mora', [['si', 'Sí'], ['no', 'No']])}</Field>
                  </div>
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-2.5">
                  <Field label="Recarga mínima (RD$) *">{mono('recarga')}</Field>
                  <Field label="Límite diario sugerido (RD$)">{mono('limite')}</Field>
                  <Field label="Recarga desde">{sel('canal', ['Portal y Caja', 'Solo Caja'])}</Field>
                  <Field label="Saldo al cierre de ciclo">{sel('saldo', ['Se transfiere', 'Se reembolsa'])}</Field>
                </div>
              )}
              <div className="flex flex-col gap-1.5"><span className="text-xs font-medium text-slate-600">Dietas especiales disponibles</span>{chips('diets', DIETS)}</div>
              <Field label="Estado">{sel('estado', ['Activo', 'Inactivo'])}</Field>
              <div className="rounded-md border border-slate-200 bg-slate-50 p-3 text-xs leading-normal text-slate-600">{impact}</div>
              {ad.err && <div className="flex items-center gap-1.5 text-xs font-medium text-red-600"><i className="ph ph-warning-circle" />{ad.err}</div>}
            </div>
            <div className="flex justify-between gap-2 border-t border-slate-200 bg-slate-50 px-5 py-3.5">
              {ad.mode !== 'create' && canEdit && (
                <button onClick={() => void del(planes.find(p => p.id === ad.id)!)} className="flex h-9 items-center gap-1.5 rounded-md border border-red-300 bg-white px-3 text-[13px] font-medium text-red-600"><i className="ph ph-trash" />Eliminar</button>
              )}
              <span className="flex-1" />
              <div className="flex gap-2">
                <button onClick={() => setAd(null)} className="h-9 rounded-md border border-slate-300 bg-white px-3.5 text-[13px] font-medium text-ink">{ro ? 'Cerrar' : 'Cancelar'}</button>
                {(canEdit || !ro) && (
                  <button onClick={() => void save()} className="flex h-9 items-center gap-1.5 rounded-md bg-accent px-4 text-[13px] font-semibold text-white">
                    <i className={ro ? 'ph ph-pencil-simple' : 'ph ph-floppy-disk'} />{ro ? 'Editar' : ad.mode === 'create' ? 'Crear plan' : 'Guardar cambios'}
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
