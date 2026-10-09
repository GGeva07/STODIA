import { useEffect, useState } from 'react';
import { api } from '../../lib/api';
import { ACCESS } from '../../lib/access';
import { Modal, useToast } from '../../components/system/UiProvider';
import { errMsg, fmt, norm } from '../../components/finanzas/fin';
import { pill, pillBase } from '../../components/system/styles';
import CatalogoForm from './CatalogoForm';
import Credenciales, { type Acceso, type AccesoLote } from './Credenciales';
import { CAT_DEF, CAT_GROUPS, type Cat, type ColKind, type Row } from './defs';

const ROLES = Object.keys(ACCESS).filter(r => r !== 'Tutor');
const th = 'whitespace-nowrap border-b border-slate-200 bg-slate-50 px-3 py-2.5 text-[11px] font-semibold uppercase tracking-[0.04em] text-slate-600';

export default function Screen() {
  const toast = useToast();
  const [cat, setCat] = useState<Cat | null>(null);
  const [k, setK] = useState('secciones');
  const [q, setQ] = useState('');
  const [form, setForm] = useState<{ row: Row | null } | null>(null);
  const [delId, setDelId] = useState<string | null>(null);
  const [page, setPage] = useState(0);
  const [creds, setCreds] = useState<{ items: Acceso[]; omitidos: AccesoLote['omitidos'] } | null>(null);
  const [lote, setLote] = useState<'ask' | 'busy' | null>(null);
  const [pendientes, setPendientes] = useState(0); // docentes/empleados activos sin cuenta (servidor: excluye usuarios ya existentes)
  const cargarPend = () => api.get<{ n: number }>('/catalogos/acceso/pendientes').then(r => setPendientes(r.n)).catch(() => setPendientes(0));

  useEffect(() => {
    api.get<Cat>('/catalogos').then(setCat).catch(e => toast(errMsg(e), 'bad'));
    cargarPend();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  if (!cat) return <div className="text-[13px] text-slate-500">Cargando catálogos…</div>;

  const def = CAT_DEF[k];
  const L = (c: string, id: string): string => { const r = cat[c]?.find(x => x.id === id); if (!r) return '—'; const b = CAT_DEF[c].label(r, L); return c === 'secciones' ? b + ' · ' + L('tandas', String(r.tanda)) : b; }; // la tanda desambigua las secciones homónimas
  const touch = (tipo: string, fn: (rows: Row[]) => Row[]) => setCat(c => ({ ...c!, [tipo]: fn(c![tipo]) }));

  /** Registros que referencian a `id` (bloquean la eliminación). */
  const deps = (tipo: string, id: string) => {
    const out: { l: string; n: number; names: string }[] = [];
    Object.entries(CAT_DEF).forEach(([k2, d2]) => d2.fields.filter(f => f.ref === tipo).forEach(f => {
      const hits = cat[k2].filter(r => (f.t === 'multi' ? ((r[f.k] as string[]) || []).includes(id) : r[f.k] === id));
      if (hits.length) out.push({ l: `${d2.l} · ${f.l.toLowerCase()}`, n: hits.length, names: hits.slice(0, 4).map(r => d2.label(r, L)).join(', ') + (hits.length > 4 ? '…' : '') });
    }));
    return out;
  };

  const save = async (payload: Record<string, unknown>, id: string | null) => {
    const { _acceso, ...body } = payload;
    let r = id ? await api.put<Row>(`/catalogos/${k}/${id}`, body) : await api.post<Row>(`/catalogos/${k}`, body);
    touch(k, rows => (id ? rows.map(x => (x.id === id ? r : x)) : [...rows, r]));
    if (_acceso) {
      try {
        const a = await api.post<Acceso>(`/catalogos/${k}/${r.id}/acceso`);
        r = { ...r, password: 'set' }; touch(k, rows => rows.map(x => (x.id === r.id ? r : x)));
        setCreds({ items: [a], omitidos: [] }); cargarPend();
      } catch (e) { toast('Registro guardado, pero el acceso no se creó: ' + errMsg(e), 'bad'); }
    }
    setForm(null);
    const lbl = def.label(r, L);
    toast(id ? lbl + (def.fem ? ' actualizada' : ' actualizado') : `${lbl}${def.fem ? ' creada' : ' creado'} en ${def.l.toLowerCase()}`, 'ok');
  };

  const delRow = delId ? cat[k].find(r => r.id === delId) ?? null : null;
  const delDeps = delRow ? deps(k, delRow.id) : [];
  const delLbl = delRow ? def.label(delRow, L) : '';
  const remove = async () => {
    try { await api.del(`/catalogos/${k}/${delRow!.id}`); touch(k, rows => rows.filter(r => r.id !== delRow!.id)); setDelId(null); toast(delLbl + (def.fem ? ' eliminada' : ' eliminado'), 'ok'); } catch (e) { toast(errMsg(e), 'bad'); }
  };
  const deactivate = async () => {
    try { const r = await api.post<Row>(`/catalogos/${k}/${delRow!.id}/desactivar`); touch(k, rows => rows.map(x => (x.id === r.id ? r : x))); setDelId(null); toast(delLbl + (def.fem ? ' desactivada' : ' desactivado'), 'ok'); } catch (e) { toast(errMsg(e), 'bad'); }
  };

  const conAcceso = k === 'docentes' || k === 'staff';
  const crearPendientes = async () => {
    setLote('busy');
    try {
      const res = await api.post<AccesoLote>('/catalogos/acceso/pendientes');
      const ids = new Set(res.creados.map(a => a.tipo + ':' + a.id));
      setCat(c => ({ ...c!, docentes: c!.docentes.map(x => (ids.has('docentes:' + x.id) ? { ...x, password: 'set' } : x)), staff: c!.staff.map(x => (ids.has('staff:' + x.id) ? { ...x, password: 'set' } : x)) }));
      setLote(null); setCreds({ items: res.creados, omitidos: res.omitidos }); cargarPend();
    } catch (e) { setLote(null); toast(errMsg(e), 'bad'); }
  };
  const cols = def.cols;
  const refOf = (key: string) => def.fields.find(f => f.k === key)?.ref ?? '';
  const nq = norm(q.trim());
  const rows = cat[k].map(r => {
    const cells = cols.map(([key, , kind]) => cell(r, key, kind));
    return { r, cells, hay: norm(cells.map(c => c.txt).join(' ') + ' ' + r.id + ' ' + r.estado) };
  }).filter(x => !nq || x.hay.includes(nq));
  const PAGE = 50, pages = Math.max(1, Math.ceil(rows.length / PAGE)), pg = Math.min(page, pages - 1);
  const shown = rows.slice(pg * PAGE, (pg + 1) * PAGE);

  function cell(r: Row, key: string, kind?: ColKind) {
    if (kind === 'occ') { const p = Math.min(100, Number(r.insc) / Number(r.cap) * 100); return { txt: '', node: (
      <div className="flex min-w-[150px] items-center gap-2"><div className="h-1.5 flex-1 overflow-hidden rounded-full bg-slate-200"><div className={`h-full ${p >= 100 ? 'bg-red-600' : p >= 90 ? 'bg-amber-600' : 'bg-accent'}`} style={{ width: p + '%' }} /></div><span className={`whitespace-nowrap font-mono text-xs font-medium ${p >= 100 ? 'text-red-600' : 'text-slate-600'}`}>{String(r.insc)} / {String(r.cap)}</span></div>) }; }
    if (kind === 'pwd') { const v = r[key] ? '••••••••' : '—'; return { txt: v, node: <span className="whitespace-nowrap font-mono text-xs font-medium">{v}</span> }; }
    if (kind === 'chips') {
      const ch = ((r[key] as string[]) || []).map(id => L(refOf(key), id));
      return { txt: ch.join(' '), node: <div className="flex flex-wrap gap-1 py-1.5">{(ch.length ? ch : ['—']).slice(0, 3).map((c, i) => <span key={i} className="inline-flex h-5 items-center whitespace-nowrap rounded bg-mute-bg px-[7px] text-[11px] font-medium text-slate-700">{c}</span>)}{ch.length > 3 && <span title={ch.join(', ')} className="inline-flex h-5 items-center whitespace-nowrap rounded bg-blue-50 px-[7px] text-[11px] font-semibold text-blue-700">+{ch.length - 3} más</span>}</div> };
    }
    const v = key === '_label' ? def.label(r, L) : kind === 'ref' ? (r[key] ? L(refOf(key), String(r[key])) : '—') : kind === 'money' ? fmt(Number(r[key])) : String(r[key] ?? '') || '—';
    if (kind === 'mono' || kind === 'money') return { txt: v, right: kind === 'money', node: <span className="whitespace-nowrap font-mono text-xs font-medium">{v}</span> };
    return { txt: v, node: <span className={`${kind === 'bold' ? 'font-medium' : ''} ${v === '—' ? 'text-slate-400' : 'text-ink'}`}>{v}</span> };
  }

  return (
    <div className="flex flex-col gap-3.5">
      <div>
        <h1 className="m-0 text-xl font-semibold tracking-[-0.01em]">Catálogos maestros</h1>
        <p className="mt-1 text-[13px] text-slate-600">Las entidades base que alimentan los selectores y las validaciones de todo el ERP.</p>
      </div>
      <div className="flex flex-wrap items-start gap-3.5">
        <aside className="flex w-60 flex-none flex-col gap-0.5 rounded-lg border border-slate-200 bg-white px-2 pb-2 pt-1.5">
          {CAT_GROUPS.map(([g, ks]) => (
            <div key={g} className="flex flex-col gap-0.5">
              <div className="px-2 pb-1 pt-2.5 text-[11px] font-semibold uppercase tracking-[0.04em] text-slate-500">{g}</div>
              {ks.map(key => (
                <button key={key} onClick={() => { setK(key); setQ(''); setPage(0); }} className={`flex h-[34px] items-center gap-2 rounded-md px-2 text-left text-[13px] font-medium hover:bg-slate-100 ${key === k ? 'bg-blue-50 text-blue-700' : 'text-slate-700'}`}>
                  <i className={`${CAT_DEF[key].icon} text-base`} /><span className="flex-1">{CAT_DEF[key].l}</span><span className="font-mono text-[11px] text-slate-500">{cat[key].length}</span>
                </button>
              ))}
            </div>
          ))}
        </aside>
        <section className="min-w-[min(100%,520px)] flex-1 overflow-hidden rounded-lg border border-slate-200 bg-white">
          <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-200 px-4 py-3.5">
            <div className="flex min-w-[220px] flex-1 items-start gap-2.5">
              <span className="grid h-9 w-9 flex-none place-items-center rounded-lg bg-blue-50 text-lg text-accent"><i className={def.icon} /></span>
              <div><div className="text-[15px] font-semibold">{def.l}</div><div className="mt-0.5 text-xs text-slate-600">{def.desc}</div></div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <div className="relative"><i className="ph ph-magnifying-glass absolute left-2.5 top-2.5 text-slate-400" /><input value={q} onChange={e => { setQ(e.target.value); setPage(0); }} placeholder="Buscar…" className="h-[34px] w-[200px] rounded-md border border-slate-300 bg-white pl-[30px] pr-2.5 text-[13px] outline-none focus:border-accent" /></div>
              {conAcceso && pendientes > 0 && <button onClick={() => setLote('ask')} className="flex h-[34px] items-center gap-1.5 whitespace-nowrap rounded-md border border-slate-300 bg-white px-3 text-[13px] font-medium text-slate-700 hover:bg-slate-50"><i className="ph ph-key" />Crear accesos pendientes ({pendientes})</button>}
              <button onClick={() => setForm({ row: null })} className="flex h-[34px] items-center gap-1.5 whitespace-nowrap rounded-md bg-accent px-3 text-[13px] font-medium text-white hover:bg-accent-dark"><i className="ph ph-plus" />{(def.fem ? 'Nueva ' : 'Nuevo ') + def.one}</button>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] border-collapse text-[13px]">
              <thead><tr>
                {cols.map(([key, l, kind]) => <th key={key} className={`${th} ${kind === 'money' ? 'text-right' : 'text-left'}`}>{l}</th>)}
                <th className={`${th} text-left`}>Estado</th><th className={`${th} text-right`}>Acciones</th>
              </tr></thead>
              <tbody>
                {shown.map(({ r, cells }) => {
                  const full = k === 'secciones' && Number(r.insc) >= Number(r.cap) && r.estado === 'Activo';
                  const tone = full ? 'bad' : /^(Activ|Abiert)/.test(r.estado) ? 'ok' : 'mute';
                  return (
                    <tr key={r.id} className={`h-12 hover:bg-slate-50 ${/^Inact/.test(r.estado) ? 'opacity-60' : ''}`}>
                      {cells.map((c, i) => <td key={i} className={`border-b border-slate-100 px-3 ${'right' in c && c.right ? 'text-right' : ''}`}>{c.node}</td>)}
                      <td className="border-b border-slate-100 px-3"><span className={`${pillBase} !w-[84px] ${pill[tone]}`}>{full ? 'Llena' : r.estado}</span></td>
                      <td className="whitespace-nowrap border-b border-slate-100 px-3 text-right">
                        <div className="inline-flex gap-3">
                          <button onClick={() => setForm({ row: r })} className="p-0 text-[13px] font-medium text-accent hover:text-accent-dark">Editar</button>
                          <button onClick={() => setDelId(r.id)} className="p-0 text-[13px] font-medium text-red-600 hover:text-red-700">Eliminar</button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {rows.length === 0 && <div className="px-4 py-8 text-center text-[13px] text-slate-500">Sin resultados para la búsqueda.</div>}
          <div className="flex flex-wrap justify-between gap-2.5 border-t border-slate-200 bg-slate-50 px-4 py-2.5 text-xs text-slate-500"><span>{rows.length} de {cat[k].length} registros</span>{pages > 1 && <span className="flex items-center gap-2"><button disabled={pg === 0} onClick={() => setPage(pg - 1)} aria-label="Página anterior" className="h-7 w-7 rounded-md border border-slate-300 bg-white disabled:opacity-40"><i className="ph ph-caret-left" /></button><span className="font-mono">{pg * PAGE + 1}–{Math.min(rows.length, (pg + 1) * PAGE)} · pág. {pg + 1}/{pages}</span><button disabled={pg >= pages - 1} onClick={() => setPage(pg + 1)} aria-label="Página siguiente" className="h-7 w-7 rounded-md border border-slate-300 bg-white disabled:opacity-40"><i className="ph ph-caret-right" /></button></span>}<span className="font-mono">GET /api/catalog/{k}</span></div>
        </section>
      </div>

      {form && <CatalogoForm key={k + (form.row?.id ?? 'new')} k={k} row={form.row} cat={cat} roles={ROLES} L={L} onClose={() => setForm(null)} onSave={save} />}

      {creds && <Credenciales items={creds.items} omitidos={creds.omitidos} onClose={() => setCreds(null)} />}
      {lote && (
        <Modal width={460} z={90} onClose={() => lote === 'ask' && setLote(null)}>
          <div className="p-5">
            <div className="text-base font-semibold">Crear accesos pendientes</div>
            <div className="mt-1 text-[13px] leading-normal text-slate-600">Se creará un usuario para los {pendientes} docentes y empleados activos que aún no tienen acceso, con una contraseña temporal aleatoria que deberán cambiar en su primer ingreso. Las contraseñas se mostrarán e imprimirán una sola vez. No se modifica ningún usuario existente.</div>
          </div>
          <div className="flex justify-end gap-2 border-t border-slate-200 bg-slate-50 px-5 py-3.5">
            <button onClick={() => setLote(null)} disabled={lote === 'busy'} className="h-9 rounded-md border border-slate-300 bg-white px-3.5 text-[13px] font-medium">Cancelar</button>
            <button onClick={crearPendientes} disabled={lote === 'busy'} className="h-9 rounded-md bg-accent px-4 text-[13px] font-semibold text-white hover:bg-accent-dark disabled:opacity-60">{lote === 'busy' ? 'Creando…' : 'Crear accesos'}</button>
          </div>
        </Modal>
      )}

      {delRow && (
        <Modal width={460} z={86} onClose={() => setDelId(null)}>
          <div className="flex items-start gap-3 p-5">
            <span className={`grid h-10 w-10 flex-none place-items-center rounded-full text-xl ${delDeps.length ? 'bg-amber-100 text-amber-700' : 'bg-red-100 text-red-600'}`}><i className={delDeps.length ? 'ph ph-link-break' : 'ph ph-trash'} /></span>
            <div className="min-w-0 flex-1">
              <div className="text-base font-semibold">Eliminar {delLbl}</div>
              <div className="mt-1 text-[13px] leading-normal text-slate-600">{delDeps.length ? 'No se puede eliminar: otros registros dependen de él. Puedes desactivarlo para que deje de aparecer en los selectores sin romper el histórico.' : `Se eliminará de ${def.l.toLowerCase()}. La acción queda registrada en Auditoría.`}</div>
              {delDeps.length > 0 && (
                <div className="mt-2.5 flex flex-col gap-1.5">
                  {delDeps.map(d => <div key={d.l} className="flex items-baseline gap-2 rounded-md bg-warn-bg px-2.5 py-2 text-xs text-amber-800"><b className="whitespace-nowrap">{d.l} ({d.n})</b><span className="min-w-0">{d.names}</span></div>)}
                </div>
              )}
            </div>
          </div>
          <div className="flex flex-wrap justify-end gap-2 border-t border-slate-200 bg-slate-50 px-5 py-3.5">
            <button onClick={() => setDelId(null)} className="h-9 rounded-md border border-slate-300 bg-white px-3.5 text-[13px] font-medium">Cancelar</button>
            {delDeps.length > 0 ? <button onClick={deactivate} className="h-9 rounded-md border border-amber-300 bg-white px-3.5 text-[13px] font-semibold text-amber-700 hover:bg-warn-bg">Desactivar en su lugar</button>
              : <button onClick={remove} className="h-9 rounded-md bg-red-600 px-4 text-[13px] font-semibold text-white hover:bg-red-700">Eliminar</button>}
          </div>
        </Modal>
      )}
    </div>
  );
}
