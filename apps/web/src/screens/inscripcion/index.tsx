import { usePerfil } from '../../components/finanzas/perfil';
import { useEffect, useId, useRef, useState } from 'react';
import type { InsConfigResp, InsPlan, InsReq, InsResp, InsTutorBusq, InsTutoresResp, InsTutorDatos, InsTutorLookup } from '@stodia/shared';
import { api } from '../../lib/api';
import { useToast } from '../../components/system/UiProvider';
import { pillBase } from '../../components/system/styles';
import { errMsg, fmt } from '../../components/finanzas/fin';
import { SL_MSG, useCiclo } from '../../lib/ciclo';
import { AvisoBorrador, limpiarPrefijo, useDraft } from '../../lib/useDraft';
import { descargarPdf, runPrint, usePrintBusy } from '../../components/finanzas/print';
import { docContratoInscripcion, introContrato } from '../../components/personas/printContrato';

/** Borrador del asistente: se conserva al navegar/recargar; se borra al emitir con éxito y al pulsar «Nueva inscripción». Sin contraseñas/PIN/archivos: solo datos del formulario. */
const DRAFT = 'inscripcion:';
// Los documentos marcados por defecto (el primero) no cuentan como cambio del usuario.
const sinDocsPorDefecto = (v: InsReq): InsReq => ({ ...v, docs: v.docs.every((d, i) => d === (i === 0)) ? [] : v.docs });

const STEPS = ['Datos del alumno', 'Tutores', 'Curso y tanda', 'Plan de pago', 'Cierre y factura'];
const inp = 'h-[38px] rounded-md border border-slate-300 px-2.5 text-sm text-ink outline-none focus:border-accent focus:ring-[3px] focus:ring-accent-soft';
const fmtCed = (v: string) => {
  const d = v.replace(/\D/g, '').slice(0, 11);
  return d.length <= 3 ? d : d.length <= 10 ? `${d.slice(0, 3)}-${d.slice(3)}` : `${d.slice(0, 3)}-${d.slice(3, 10)}-${d.slice(10)}`;
};
const PARENTESCOS = ['Padre', 'Madre', 'Tutor legal', 'Abuelo(a)', 'Otro'];
const datosVacios = (): InsTutorDatos => ({ parentesco: '', tel: '', email: '', rnc: '' });
/** Mismas reglas que la pantalla Tutores (y que valida el servidor). Devuelve el primer error o null. */
const errDatos = (rol: string, d: InsTutorDatos) => {
  const dg = (x: string) => x.replace(/\D/g, '');
  if (!d.parentesco) return `${rol}: indica el parentesco`;
  if (dg(d.tel).length < 7) return `${rol}: teléfono requerido (ej. 809-555-0000)`;
  if (d.email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(d.email.trim())) return `${rol}: formato de correo inválido`;
  if (d.rnc.trim() && ![9, 11].includes(dg(d.rnc).length)) return `${rol}: el RNC debe tener 9 u 11 dígitos`;
  return null;
};
const blank = (): InsReq => ({ nombre: '', apellido: '', fnac: '', docs: [], legalCed: '', legalName: '', finSame: true, finCed: '', finName: '', legalDatos: datosVacios(), finDatos: datosVacios(), cupo: '', tanda: '', grado: '', sec: '', plan: '', serv: [], firma: 'digital' });
type Look = InsTutorLookup | { found: false; empty: true };

/** Consulta de duplicados por documento; 'empty' mientras no haya 11 dígitos. */
function useLookup(ced: string): Look {
  const [res, setRes] = useState<InsTutorLookup | null>(null);
  const ok = ced.replace(/\D/g, '').length >= 11;
  useEffect(() => {
    if (!ok) { setRes(null); return; }
    let live = true;
    api.post<InsTutorLookup>('/inscripcion/tutor', { ced }).then(r => live && setRes(r)).catch(() => live && setRes({ found: false }));
    return () => { live = false; };
  }, [ced, ok]);
  return ok && res ? res : { found: false, empty: true };
}
const isNew = (l: Look) => !l.found && !('empty' in l);

type Modo = 'existente' | 'nuevo';
type BecaH = InsTutoresResp['becaHermano'];
const datosDe = (t: InsTutorBusq): InsTutorDatos => ({ parentesco: t.parentesco, tel: t.tel, email: t.email, rnc: t.rnc });
const fmtTel = (v: string) => { const d = v.replace(/\D/g, '').slice(0, 10); return d.length <= 3 ? d : d.length <= 6 ? `${d.slice(0, 3)}-${d.slice(3)}` : `${d.slice(0, 3)}-${d.slice(3, 6)}-${d.slice(6)}`; };

/** Campos de contacto del tutor (mismos que la pantalla Tutores). */
function DatosFields({ datos, onDatos }: { datos: InsTutorDatos; onDatos: (d: InsTutorDatos) => void }) {
  return (
    <div className="grid gap-3 [grid-template-columns:repeat(auto-fit,minmax(200px,1fr))]">
      <label className="flex flex-col gap-1 text-xs font-medium text-slate-600">Parentesco *
        <select value={datos.parentesco} onChange={e => onDatos({ ...datos, parentesco: e.target.value })} className={`${inp} bg-white`}>
          <option value="">Selecciona…</option>{PARENTESCOS.map(p => <option key={p}>{p}</option>)}
        </select>
      </label>
      <label className="flex flex-col gap-1 text-xs font-medium text-slate-600">Teléfono *
        <input value={datos.tel} onChange={e => onDatos({ ...datos, tel: fmtTel(e.target.value) })} placeholder="809-555-0000" inputMode="tel" className={`${inp} font-mono`} />
      </label>
      <label className="flex flex-col gap-1 text-xs font-medium text-slate-600">Correo electrónico
        <input type="email" value={datos.email} onChange={e => onDatos({ ...datos, email: e.target.value })} placeholder="nombre@correo.com" className={inp} />
      </label>
      <label className="flex flex-col gap-1 text-xs font-medium text-slate-600">RNC (factura con crédito fiscal)
        <input value={datos.rnc} onChange={e => onDatos({ ...datos, rnc: e.target.value.replace(/[^\d-]/g, '').slice(0, 13) })} placeholder="Opcional" className={`${inp} font-mono`} />
      </label>
    </div>
  );
}

const estadoCuenta = (v: number) => (v > 0
  ? <span className="rounded-full bg-red-50 px-2 py-0.5 text-[11px] font-semibold text-red-700">En mora · {fmt(v)}</span>
  : <span className="rounded-full bg-ok-bg px-2 py-0.5 text-[11px] font-semibold text-green-800">Al día</span>);

/** Buscador con autocompletado de tutores ya registrados (combobox accesible, resultados de 10 en 10). */
function TutorBuscador({ draftKey, excluirId, excluirMsg, onPick, onMeta }: { draftKey: string; excluirId?: string; excluirMsg?: string; onPick: (t: InsTutorBusq) => void; onMeta: (b: BecaH) => void }) {
  const uid = useId();
  const [q, setQ] = useDraft(DRAFT + 'q:' + draftKey, ''); // solo el texto buscado; los resultados se piden de nuevo al servidor
  const [page, setPage] = useState(1), [res, setRes] = useState<InsTutoresResp | null>(null);
  const [loading, setLoading] = useState(false), [err, setErr] = useState(''), [act, setAct] = useState(0);
  const t = q.trim();
  useEffect(() => {
    if (t.length < 2) { setRes(null); setErr(''); setLoading(false); return; }
    let live = true;
    setLoading(true);
    const h = setTimeout(() => {
      api.get<InsTutoresResp>(`/inscripcion/tutores?q=${encodeURIComponent(t)}&page=${page}`)
        .then(r => { if (!live) return; setRes(r); setErr(''); setAct(0); onMeta(r.becaHermano); })
        .catch(e => { if (live) { setRes(null); setErr(errMsg(e)); } })
        .finally(() => { if (live) setLoading(false); });
    }, 250);
    return () => { live = false; clearTimeout(h); };
  }, [t, page]); // eslint-disable-line react-hooks/exhaustive-deps
  const rows = res?.rows ?? [];
  const pick = (r: InsTutorBusq) => { if (r.disponible && r.id !== excluirId) onPick(r); };
  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') { setQ(''); return; }
    if (!rows.length) return;
    if (e.key === 'ArrowDown') { e.preventDefault(); setAct(i => Math.min(rows.length - 1, i + 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setAct(i => Math.max(0, i - 1)); }
    else if (e.key === 'Enter') { e.preventDefault(); pick(rows[act]); }
  };
  const pages = res ? Math.max(1, Math.ceil(res.total / res.size)) : 1;
  const status = loading ? 'Buscando…' : err ? `Error: ${err}` : t.length < 2 ? 'Escribe al menos 2 caracteres para buscar' : res ? (res.total ? `${res.total} tutor${res.total === 1 ? '' : 'es'} encontrado${res.total === 1 ? '' : 's'}` : 'No hay tutores con ese criterio: elige Nuevo tutor') : '';
  return (
    <div className="flex flex-col gap-2">
      <label className="flex flex-col gap-1 text-xs font-medium text-slate-600">Buscar tutor existente
        <div className="relative">
          <i className="ph ph-magnifying-glass pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-base text-slate-400" aria-hidden />
          <input role="combobox" aria-expanded={rows.length > 0} aria-controls={`${uid}-lb`} aria-autocomplete="list" aria-activedescendant={rows.length ? `${uid}-o${act}` : undefined} autoComplete="off"
            value={q} onChange={e => { setQ(e.target.value); setPage(1); }} onKeyDown={onKey} placeholder="Nombre, cédula, teléfono, correo o nombre de un hijo" className={`${inp} w-full pl-8`} />
        </div>
      </label>
      <div aria-live="polite" className={err || (res && res.total === 0 && !loading) ? 'sr-only' : 'text-xs text-slate-500'}>{status}</div>
      {err && <div role="alert" className="flex items-center gap-2 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-[13px] text-red-800"><i className="ph ph-warning-circle" />{err}</div>}
      {res && !err && res.total === 0 && !loading && <div className="rounded-md border border-dashed border-slate-300 bg-slate-50 px-3 py-3 text-[13px] text-slate-600">No hay tutores con ese criterio: elige <b>Nuevo tutor</b>.</div>}
      {rows.length > 0 && (
        <ul id={`${uid}-lb`} role="listbox" aria-label="Tutores encontrados" className={`m-0 flex max-h-[280px] list-none flex-col gap-1.5 overflow-y-auto p-0 pr-1 ${loading ? 'opacity-60' : ''}`}>
          {rows.map((r, i) => {
            const bloq = !r.disponible || r.id === excluirId;
            return (
              <li key={r.id} id={`${uid}-o${i}`} role="option" aria-selected={i === act} aria-disabled={bloq} onMouseEnter={() => setAct(i)} onClick={() => pick(r)}
                className={`flex flex-col gap-1.5 rounded-md border px-3 py-2.5 text-[13px] ${bloq ? 'cursor-not-allowed border-slate-200 bg-slate-50 opacity-60' : i === act ? 'cursor-pointer border-accent bg-blue-50' : 'cursor-pointer border-slate-200 bg-white hover:bg-slate-50'}`}>
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                  <b className="text-ink">{r.nombre}</b><span className="font-mono text-xs text-slate-600">{r.cedula}</span><span className="font-mono text-xs text-slate-600">{r.tel}</span>
                  <span className="ml-auto">{!r.disponible ? <span className="rounded-full bg-slate-200 px-2 py-0.5 text-[11px] font-semibold text-slate-700">No disponible · inactivo</span> : r.id === excluirId ? <span className="rounded-full bg-slate-200 px-2 py-0.5 text-[11px] font-semibold text-slate-700">{excluirMsg}</span> : estadoCuenta(r.vencido)}</span>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {r.hijos.length ? r.hijos.map(h => <span key={h.nombre + h.seccion} className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] text-slate-700">{h.nombre} · {h.seccion}</span>) : <span className="text-[11px] text-slate-500">Sin hijos inscritos</span>}
                </div>
              </li>
            );
          })}
        </ul>
      )}
      {res && pages > 1 && (
        <div className="flex items-center justify-between text-xs text-slate-600">
          <button type="button" disabled={page <= 1} onClick={() => setPage(page - 1)} className="h-8 rounded-md border border-slate-300 bg-white px-3 font-medium disabled:opacity-40">Anterior</button>
          <span>Página {res.page} de {pages}</span>
          <button type="button" disabled={!res.hayMas} onClick={() => setPage(page + 1)} className="h-8 rounded-md border border-slate-300 bg-white px-3 font-medium disabled:opacity-40">Siguiente</button>
        </div>
      )}
    </div>
  );
}

/** Tarjeta «Familia seleccionada»: contacto, hijos, saldo y acciones Cambiar / Editar datos de contacto. */
function FamiliaCard({ t, datos, onDatos, onCambiar, resp }: { t: InsTutorBusq; datos: InsTutorDatos; onDatos: (d: InsTutorDatos) => void; onCambiar: () => void; resp: string }) {
  const [edit, setEdit] = useState(false);
  return (
    <div className="flex flex-col gap-2.5 rounded-md border border-green-200 bg-ok-bg p-3 text-[13px]" role="group" aria-label="Familia seleccionada">
      <div className="flex flex-wrap items-center gap-2">
        <i className="ph ph-user-check text-lg text-green-700" aria-hidden />
        <span className="text-xs font-semibold uppercase tracking-wide text-green-800">Familia seleccionada</span>
        <span className="ml-auto flex gap-2">
          <button type="button" onClick={() => setEdit(v => !v)} aria-expanded={edit} className="h-8 rounded-md border border-slate-300 bg-white px-3 text-xs font-medium hover:bg-slate-100">{edit ? 'Listo' : 'Editar datos de contacto'}</button>
          <button type="button" onClick={onCambiar} className="h-8 rounded-md border border-slate-300 bg-white px-3 text-xs font-medium hover:bg-slate-100">Cambiar</button>
        </span>
      </div>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
        <b className="text-ink">{t.nombre}</b><span className="font-mono text-xs text-slate-700">{t.cedula}</span>
        <span className="text-xs text-slate-700">{datos.parentesco || '—'} · <span className="font-mono">{datos.tel || '—'}</span>{datos.email ? <> · {datos.email}</> : null}</span>
      </div>
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="text-xs font-medium text-slate-600">{t.hijos.length ? `Familia con ${t.hijos.length} hijo${t.hijos.length === 1 ? '' : 's'}:` : 'Sin hijos inscritos'}</span>
        {t.hijos.map(h => <span key={h.nombre + h.seccion} className="rounded-full bg-white px-2 py-0.5 text-[11px] text-slate-700 ring-1 ring-slate-200">{h.nombre} · {h.seccion}</span>)}
      </div>
      <div className="flex items-center gap-2 text-xs text-slate-600">Estado de cuenta: {estadoCuenta(t.vencido)}</div>
      {t.vencido > 0 && <div role="status" className="flex items-center gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-[13px] text-amber-800"><i className="ph ph-warning" />Este tutor tiene {fmt(t.vencido)} vencidos. Es informativo: la inscripción de otro hijo es una decisión del colegio.</div>}
      {edit && <DatosFields datos={datos} onDatos={onDatos} />}
      <div className="text-xs text-slate-500">Responsabilidad: <b className="text-slate-700">{resp}</b> · Si cambias el contacto, se actualiza en la ficha del tutor y queda en Auditoría.</div>
    </div>
  );
}

export default function Screen() {
  const perfil = usePerfil();
  const toast = useToast();
  const { soloLecturaFin: sl, cicloSeleccionado, cicloActivo, volverAlActivo, ciclos: ciclosApp } = useCiclo(); // un ciclo CERRADO es solo lectura; el activo y el planificado (inscripción anticipada) admiten inscribir
  const [destino, setDestino] = useDraft<string>(DRAFT + 'destino', () => (ciclosApp.find(c => c.n === cicloSeleccionado)?.estado === 'Planificado' ? cicloSeleccionado : '')); // '' = ciclo activo
  const [cfg, setCfg] = useState<InsConfigResp | null>(null);
  const [done, setDone] = useState<InsResp | null>(null);
  const act = !done; // inscripción emitida: ya no hay borrador que conservar
  const [step, setStep] = useDraft(DRAFT + 'step', 1, { activo: act });
  const [servQ, setServQ] = useDraft(DRAFT + 'servQ', '', { activo: act }); // buscador de servicios recurrentes (paso Plan de pago)
  const [w, setW, , metaW] = useDraft<InsReq>(DRAFT + 'w', blank, { activo: act, transformar: sinDocsPorDefecto });
  const [busy, setBusy] = useState(false);
  const pbtn = usePrintBusy();
  const set = (p: Partial<InsReq>) => setW(s => ({ ...s, ...p }));
  // Tutor existente (buscador) o nuevo (cédula), por tutor. En modo existente el id elegido viaja en tutorLegalId / tutorFinancieroId.
  const dopt = { activo: act };
  const [legalMode, setLegalMode] = useDraft<Modo>(DRAFT + 'legalMode', 'nuevo', dopt), [finMode, setFinMode] = useDraft<Modo>(DRAFT + 'finMode', 'nuevo', dopt);
  const [legalSel, setLegalSel] = useDraft<InsTutorBusq | null>(DRAFT + 'legalSel', null, dopt), [finSel, setFinSel] = useDraft<InsTutorBusq | null>(DRAFT + 'finSel', null, dopt);
  const [becaH, setBecaH] = useDraft<BecaH>(DRAFT + 'becaH', null, dopt), [aplicarBeca, setAplicarBeca] = useDraft(DRAFT + 'aplicarBeca', false, dopt);

  const loadCfg = (d = destino) => api.get<InsConfigResp>('/inscripcion/config' + (d ? '?ciclo=' + encodeURIComponent(d) : '')).then(c => { setCfg(c); setW(s => (s.docs.length ? s : { ...s, docs: c.docs.map((_, i) => i === 0) })); }).catch(e => toast(errMsg(e), 'bad'));
  useEffect(() => { void loadCfg(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const L = useLookup(legalMode === 'nuevo' ? w.legalCed : '');
  const Fl = useLookup(finMode === 'nuevo' ? w.finCed : '');
  const F = w.finSame ? L : Fl;
  // Tutor existente: se precargan sus datos guardados (editables). Al cambiar a un tutor nuevo se limpian.
  const keyL = L.found ? L.id : '', keyF = Fl.found ? Fl.id : '';
  const prevKeys = useRef({ l: keyL, f: keyF }); // en el primer render no se pisan los datos de contacto restaurados del borrador
  useEffect(() => { if (prevKeys.current.l === keyL) return; prevKeys.current.l = keyL; setW(s => ({ ...s, legalDatos: L.found && L.datos ? { ...L.datos } : datosVacios() })); }, [keyL]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (prevKeys.current.f === keyF) return; prevKeys.current.f = keyF; setW(s => ({ ...s, finDatos: Fl.found && Fl.datos ? { ...Fl.datos } : datosVacios() })); }, [keyF]); // eslint-disable-line react-hooks/exhaustive-deps
  const legalName = legalMode === 'existente' ? legalSel?.nombre ?? '' : L.found ? L.nombre! : w.legalName.trim();
  const finName = w.finSame ? legalName : finMode === 'existente' ? finSel?.nombre ?? '' : F.found ? F.nombre! : w.finName.trim();
  const legalId = legalMode === 'existente' ? legalSel?.id ?? '' : L.found ? L.id ?? '' : '';
  const finId = finMode === 'existente' ? finSel?.id ?? '' : Fl.found ? Fl.id ?? '' : '';
  // Familia: hijos de los tutores existentes elegidos (sin repetir). Con hijos y tipo de beca de hermanos en el catálogo se ofrece «Aplicar beca Plan Hermano».
  const familia = [...new Map([legalSel, w.finSame ? null : finSel].flatMap(t => t?.hijos ?? []).map(h => [h.nombre + h.seccion, h])).values()];
  const hermanoOk = familia.length > 0 && !!becaH;
  const reset = () => { setLegalMode('nuevo'); setFinMode('nuevo'); setLegalSel(null); setFinSel(null); setAplicarBeca(false); setBecaH(null); setServQ(''); limpiarPrefijo(DRAFT); };
  const tanda = w.tanda || cfg?.tandas[0] || '';
  const gradoId = w.grado || cfg?.grados[0]?.id || '';
  const gradoLbl = cfg?.grados.find(g => g.id === gradoId)?.label ?? '';
  const sinTildes = (t: string) => t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  const serviciosVis = (cfg?.servicios ?? []).filter(s => !servQ.trim() || sinTildes(s.n).includes(sinTildes(servQ.trim())));
  const servM = (cfg?.servicios ?? []).reduce((a, s) => a + (w.serv.includes(s.k) ? s.price : 0), 0);
  const money = (n: number) => Math.round(n * 100) / 100;
  const totalDe = (p: InsPlan) => money((p.anual[tanda] ?? p.anual['*'] ?? 0) * (1 - p.desc / 100));
  const cuotaDe = (p: InsPlan) => money(totalDe(p) / p.n);
  const planes = cfg?.planes ?? [];
  const plan = planes.find(p => p.id === w.plan) ?? planes[0];
  const planOk = !!plan && totalDe(plan) > 0;
  const cuotaPer = !plan ? 0 : plan.freq === 1 ? cuotaDe(plan) + servM : plan.n === 1 ? servM : cuotaDe(plan);
  // Cuota de inscripcion segun la modalidad (el servidor la resuelve por plan) y cuota de materiales del plan (cargo aparte, no va en la factura inicial).
  const INS = plan?.inscripcion ?? cfg?.inscripcion ?? 0, MAT = plan?.materiales ?? 0;
  const insOrigen = !plan ? '' : plan.inscripcionOrigen === 'plan' ? `definida por el plan «${plan.name}»` : plan.inscripcionOrigen === 'respaldo' ? `el plan «${plan.name}» no tiene cuota propia: se usa la fija` : 'cuota fija para todos';
  const factura = INS + (plan && plan.n === 1 ? totalDe(plan) : 0);
  const ok: (string | null)[] = [null,
    w.nombre.trim() && w.apellido.trim() && w.fnac ? null : 'Completa nombres, apellidos y fecha de nacimiento',
    !(legalName && finName) ? (legalMode === 'existente' && !legalSel ? 'Tutor legal: elige un tutor existente o cambia a Nuevo tutor' : !w.finSame && finMode === 'existente' && !finSel ? 'Tutor financiero: elige un tutor existente o cambia a Nuevo tutor' : 'Identifica al tutor legal y financiero')
      : !w.finSame && ((legalId && legalId === finId) || (legalMode === 'nuevo' && finMode === 'nuevo' && w.legalCed.replace(/\D/g, '') === w.finCed.replace(/\D/g, ''))) ? 'El tutor legal y el financiero son la misma persona: marca que son la misma persona'
      : errDatos('Tutor legal', w.legalDatos) ?? (w.finSame ? null : errDatos('Tutor financiero', w.finDatos)),
    w.cupo ? null : 'Selecciona una sección con cupo', !plan ? 'Configura planes y precios para poder inscribir' : !planOk ? `El plan ${plan.name} no tiene monto para la tanda ${tanda}` : null, null];
  const grado = gradoLbl.split(' · ').pop() ?? '';
  const fullName = `${w.nombre} ${w.apellido}`.trim() || '—';
  const secs = (cfg?.cupos ?? []).filter(c => c.tanda === tanda && c.grado === gradoId);
  const blocked = step < 5 && !!ok[step];

  /** Documento oficial del contrato con lo que devolvió el servidor (tutores, calendario real, regla del plan) y lo capturado en el asistente. */
  const contratoDe = (r: InsResp) => {
    const c = r.contrato;
    if (!c) return null;
    return docContratoInscripcion({
      ciclo: c.ciclo, ctr: c.ctr, fecha: c.fecha,
      alumno: { nombre: fullName, code: r.code, fnac: w.fnac, grado, sec: w.sec, tanda, docs: (cfg?.docs ?? []).map((n, i) => ({ n, ok: !!w.docs[i] })) },
      legal: c.tutorLegal, financiero: w.finSame || c.tutorLegal.cedula === c.tutorFinanciero.cedula ? null : c.tutorFinanciero,
      plan: c.plan, calendario: c.calendario, servicios: c.servicios,
      pago: { inscripcion: r.inscripcion ?? INS, inscripcionOrigen: insOrigen, materiales: r.materiales, beca: r.becaId && becaH ? `${becaH.nombre} (${becaH.pct}%)` : undefined, factura: r.factura, ncf: r.ncf, metodo: 'Factura emitida · el cobro se registra en Caja' },
    });
  };
  const [pdfBusy, setPdfBusy] = useState(false);
  const bajarContrato = async (r: InsResp) => { const d = contratoDe(r); if (!d) return; setPdfBusy(true); try { toast('Descargado · ' + await descargarPdf(d), 'ok'); } catch (e) { toast(errMsg(e), 'bad'); } finally { setPdfBusy(false); } };
  const abrirContrato = (r: InsResp) => { const d = contratoDe(r); if (d) runPrint('ins-contrato', d); else toast('El servidor no devolvió los datos del contrato', 'warn'); };

  const next = async () => {
    if (step < 5) { if (ok[step]) { toast(ok[step]!, 'warn'); return; } setStep(step + 1); return; }
    if (done) { setW(blank()); reset(); setStep(1); setDone(null); void loadCfg(); return; } // «Nueva inscripción»: empieza de cero
    setBusy(true);
    try {
      const res = await api.post<InsResp>('/inscripcion', { ...w, ciclo: destino || undefined, tutorLegalId: legalMode === 'existente' ? legalSel?.id : undefined, tutorFinancieroId: !w.finSame && finMode === 'existente' ? finSel?.id : undefined, becaHermano: aplicarBeca && hermanoOk ? true : undefined, tanda, grado: gradoId, plan: plan?.id ?? '' });
      setDone(res);
      limpiarPrefijo(DRAFT); // emitida con éxito: el borrador se descarta (act=false impide que se reescriba)
      toast('Contrato firmado y factura de inscripción emitida', 'ok');
      abrirContrato(res); // el documento se abre una sola vez al emitir; después se reabre con «Imprimir contrato»
    } catch (e) { toast(errMsg(e), 'bad'); } finally { setBusy(false); }
  };

  type CardP = { role: string; desc: string; tag: string; ced: string; onCed: (v: string) => void; look: Look; name: string; onName: (v: string) => void; datos: InsTutorDatos; onDatos: (d: InsTutorDatos) => void; resp: string;
    mode: Modo; onMode: (m: Modo) => void; sel: InsTutorBusq | null; onSel: (t: InsTutorBusq | null) => void; excluirId?: string; excluirMsg?: string };
  const TutorCard = ({ role, desc, tag, ced, onCed, look, name, onName, datos, onDatos, resp, mode, onMode, sel, onSel, excluirId, excluirMsg }: CardP) => (
    <div className="flex flex-col gap-2 rounded-lg border border-slate-200 p-3.5">
      <div className="flex flex-wrap items-center gap-2"><span className={`${pillBase} w-[81px] ${tag}`}>{role}</span><span className="text-xs text-slate-500">{desc}</span></div>
      <div role="radiogroup" aria-label={`Origen del ${role.toLowerCase()}`} className="inline-flex w-fit overflow-hidden rounded-md border border-slate-300">
        {([['existente', 'Tutor existente'], ['nuevo', 'Nuevo tutor']] as const).map(([k, l]) => (
          <button key={k} type="button" role="radio" aria-checked={mode === k} onClick={() => mode !== k && onMode(k)} className={`h-8 px-3.5 text-xs font-semibold ${mode === k ? 'bg-accent text-white' : 'bg-white text-slate-700 hover:bg-slate-100'}`}>{l}</button>
        ))}
      </div>
      {mode === 'existente' && (sel
        ? <FamiliaCard key={sel.id} t={sel} datos={datos} onDatos={onDatos} onCambiar={() => onSel(null)} resp={resp} />
        : <TutorBuscador draftKey={role} excluirId={excluirId} excluirMsg={excluirMsg} onPick={onSel} onMeta={setBecaH} />)}
      {mode === 'nuevo' && <>
        <label className="flex max-w-[280px] flex-col gap-1 text-xs font-medium text-slate-600">Cédula / Pasaporte
          <input value={ced} onChange={e => onCed(fmtCed(e.target.value))} placeholder="000-0000000-0" className={`${inp} font-mono`} />
        </label>
        {look.found && (
          <div className="flex items-center gap-2.5 rounded-md bg-ok-bg px-3 py-2.5 text-[13px] text-green-900"><i className="ph ph-user-check text-lg" /><div><b>{look.nombre}</b> ya existe en el sistema · {look.info}. Se vinculará sin crear duplicado.</div></div>
        )}
        {isNew(look) && (
          <label className="flex max-w-[420px] flex-col gap-1 text-xs font-medium text-slate-600">Nuevo tutor · nombre completo
            <input value={name} onChange={e => onName(e.target.value)} placeholder="Nombre y apellidos" className={inp} />
          </label>
        )}
        {(look.found || isNew(look)) && (
          <div className="flex flex-col gap-2">
            <DatosFields datos={datos} onDatos={onDatos} />
            <div className="text-xs text-slate-500">Responsabilidad: <b className="text-slate-700">{resp}</b>{look.found ? ' · Datos precargados del sistema; si cambian, se actualizan en la ficha del tutor.' : ''}</div>
          </div>
        )}
      </>}
    </div>
  );
  const pickLegal = (t: InsTutorBusq | null) => { setLegalSel(t); setAplicarBeca(false); set(t ? { tutorLegalId: t.id, legalCed: '', legalName: '', legalDatos: datosDe(t) } : { tutorLegalId: undefined, legalDatos: datosVacios() }); };
  const pickFin = (t: InsTutorBusq | null) => { setFinSel(t); setAplicarBeca(false); set(t ? { tutorFinancieroId: t.id, finCed: '', finName: '', finDatos: datosDe(t) } : { tutorFinancieroId: undefined, finDatos: datosVacios() }); };
  const modeLegal = (m: Modo) => { setLegalMode(m); pickLegal(null); set({ legalCed: '', legalName: '' }); };
  const modeFin = (m: Modo) => { setFinMode(m); pickFin(null); set({ finCed: '', finName: '' }); };

  const summary: [string, string][] = [['Alumno', fullName], ['Tutor legal', legalName ? legalName + (legalMode === 'existente' ? ' (existente)' : '') : '—'], ['Tutor financiero', finName ? finName + ((w.finSame ? legalMode : finMode) === 'existente' ? ' (existente)' : '') : '—'],
    ['Curso', w.sec ? `${grado} ${w.sec} · ${tanda}` : '—'], ['Plan', plan?.name ?? '—'], ['Servicios', servM ? fmt(servM) + '/mes' : 'Ninguno'], ...(aplicarBeca && hermanoOk ? [['Beca', `${becaH!.nombre} · pendiente`] as [string, string]] : [])];

  return (
    <div className="flex max-w-[1100px] flex-col gap-4">
      <div>
        <h1 className="m-0 text-xl font-semibold tracking-tight">Inscripción y Prematrícula</h1>
        <AvisoBorrador meta={{ ...metaW, descartar: () => { setW(blank()); reset(); setStep(1); setDestino(''); void loadCfg(''); } }} className="mt-2 w-fit" />
        <p className="mb-0 mt-1 text-[13px] text-slate-600">Nuevo ingreso{cfg?.ciclo ? ` · Ciclo ${cfg.ciclo}${cfg.anticipada ? ' (planificado)' : ''}` : ''}</p>
        {cfg && (cfg.ciclosDestino?.length ?? 0) > 1 && (
          <label className="mt-2 flex items-center gap-2 text-[13px] text-slate-700">
            <span className="font-medium">Ciclo destino</span>
            <select value={destino || cicloActivo} disabled={step > 1 || !!done || busy} title={step > 1 ? 'Vuelve al primer paso para cambiar el ciclo destino' : undefined}
              onChange={e => { const n = e.target.value, d = n === cicloActivo ? '' : n; setDestino(d); void loadCfg(d); }}
              className="h-8 rounded-md border border-slate-300 bg-white px-2 text-[13px]">
              {cfg.ciclosDestino!.map(c => <option key={c.n} value={c.n}>{c.estado === 'Activo' ? `${c.n} (activo)` : `Inscripción anticipada ${c.n}`}</option>)}
            </select>
          </label>
        )}
        {cfg?.anticipada && <p className="mb-0 mt-1.5 text-xs text-sky-700"><i className="ph ph-calendar-dots" /> Pre-inscripción: el alumno se matricula en el ciclo planificado y sus cargos se generan allí; el ciclo activo no cambia.</p>}
      </div>

      {sl && (
        <div className="flex flex-wrap items-center gap-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-[13px] text-amber-800">
          <i className="ph ph-lock-simple" /><span className="min-w-0 flex-1">El ciclo {cicloSeleccionado} está cerrado: no admite inscripciones (solo lectura). La inscripción se realiza en el ciclo activo ({cicloActivo}) o en un ciclo planificado.</span>
          <button onClick={volverAlActivo} className="h-8 rounded-md border border-amber-400 bg-white px-3 text-xs font-semibold text-amber-900 hover:bg-amber-100">Ir al ciclo activo</button>
        </div>
      )}

      {cfg && cfg.avisos.length > 0 && (
        <div className="flex flex-col gap-1 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-[13px] text-amber-800">
          {cfg.avisos.map(a => <div key={a} className="flex items-center gap-2"><i className="ph ph-warning" />{a}</div>)}
        </div>
      )}

      <ol className="m-0 flex list-none items-center overflow-auto rounded-lg border border-slate-200 bg-white px-[18px] py-3.5">
        {STEPS.map((l, i) => {
          const n = i + 1, fin = n < step || !!done, act = n === step && !done;
          return (
            <li key={l} className="flex min-w-[150px] flex-1 items-center">
              <button onClick={() => n < step && !done && setStep(n)} aria-current={act ? 'step' : undefined} className="flex items-center gap-2 whitespace-nowrap border-0 bg-transparent p-0">
                <span className={`grid h-7 w-7 flex-none place-items-center rounded-full border-2 text-xs font-semibold ${fin ? 'border-accent bg-accent text-white' : act ? 'border-accent bg-white text-accent' : 'border-slate-300 bg-white text-slate-400'}`}>{fin ? <i className="ph-bold ph-check" /> : n}</span>
                <span className={`text-[13px] font-medium ${act ? 'text-ink' : 'text-slate-500'}`}>{l}</span>
              </button>
              {i < 4 && <span className={`mx-2.5 h-0.5 min-w-4 flex-1 ${fin ? 'bg-accent' : 'bg-slate-200'}`} />}
            </li>
          );
        })}
      </ol>

      <div className="grid items-start gap-3.5 [grid-template-columns:repeat(auto-fit,minmax(min(100%,300px),1fr))]">
        <section className="flex flex-col gap-4 rounded-lg border border-slate-200 bg-white p-5">
          {step === 1 && (
            <div className="flex flex-col gap-3.5">
              <div className="text-[15px] font-semibold">Datos del alumno</div>
              <div className="grid gap-3 [grid-template-columns:repeat(auto-fit,minmax(200px,1fr))]">
                <label className="flex flex-col gap-1 text-xs font-medium text-slate-600">Nombres *<input value={w.nombre} onChange={e => set({ nombre: e.target.value })} placeholder="Ej. Lucía María" className={inp} /></label>
                <label className="flex flex-col gap-1 text-xs font-medium text-slate-600">Apellidos *<input value={w.apellido} onChange={e => set({ apellido: e.target.value })} placeholder="Ej. Reyes Batista" className={inp} /></label>
                <label className="flex flex-col gap-1 text-xs font-medium text-slate-600">Fecha de nacimiento *<input type="date" value={w.fnac} onChange={e => set({ fnac: e.target.value })} className={`${inp} font-mono`} /></label>
              </div>
              <div className="mt-1 text-xs font-semibold uppercase tracking-wide text-slate-600">Documentos requeridos</div>
              <div className="grid gap-2 [grid-template-columns:repeat(auto-fit,minmax(220px,1fr))]">
                {(cfg?.docs ?? []).map((n, i) => (
                  <label key={n} className={`flex cursor-pointer items-center gap-2.5 rounded-md border px-3 py-2.5 text-[13px] ${w.docs[i] ? 'border-green-200 bg-green-50' : 'border-slate-200 bg-white'}`}>
                    <input type="checkbox" checked={!!w.docs[i]} onChange={() => set({ docs: w.docs.map((d, j) => (j === i ? !d : d)) })} className="h-4 w-4 accent-accent" />
                    <span className="flex-1">{n}</span><span className={`text-[11px] font-semibold ${w.docs[i] ? 'text-green-700' : 'text-amber-700'}`}>{w.docs[i] ? 'RECIBIDO' : 'PENDIENTE'}</span>
                  </label>
                ))}
              </div>
            </div>
          )}

          {step === 2 && (
            <div className="flex flex-col gap-3.5">
              <div className="text-[15px] font-semibold">Tutores</div>
              <div className="text-[13px] text-slate-600">Para inscribir otro hijo a una familia, elige <b>Tutor existente</b>. Con <b>Nuevo tutor</b> se consulta el documento de identidad para evitar duplicados. {import.meta.env.DEV && <> Prueba con <span className="font-mono">001-0023940-1</span>.</>}</div>
              {TutorCard({ role: 'TUTOR LEGAL', desc: 'Firma boletines, retiro físico, permisos', tag: 'bg-info-bg text-info-fg', ced: w.legalCed, onCed: v => set({ legalCed: v }), look: L, name: w.legalName, onName: v => set({ legalName: v }), datos: w.legalDatos, onDatos: d => set({ legalDatos: d }), resp: w.finSame ? 'Financiero y académico' : 'Académico', mode: legalMode, onMode: modeLegal, sel: legalSel, onSel: pickLegal, excluirId: !w.finSame ? finId : undefined, excluirMsg: 'Ya elegido como tutor financiero' })}
              {!w.finSame && TutorCard({ role: 'TUTOR FINANCIERO', desc: 'Titular del contrato · facturas NCF a su nombre', tag: 'bg-warn-bg text-warn-fg', ced: w.finCed, onCed: v => set({ finCed: v }), look: Fl, name: w.finName, onName: v => set({ finName: v }), datos: w.finDatos, onDatos: d => set({ finDatos: d }), resp: 'Financiero', mode: finMode, onMode: modeFin, sel: finSel, onSel: pickFin, excluirId: legalId, excluirMsg: 'Ya elegido como tutor legal' })}
              {hermanoOk && (
                <label className={`flex cursor-pointer items-start gap-2.5 rounded-md border px-3 py-2.5 text-[13px] ${aplicarBeca ? 'border-blue-200 bg-blue-50' : 'border-slate-200 bg-white'}`}>
                  <input type="checkbox" checked={aplicarBeca} onChange={() => setAplicarBeca(v => !v)} className="mt-0.5 h-4 w-4 accent-accent" />
                  <span className="flex-1"><b>Aplicar beca Plan Hermano</b> · Familia con {familia.length} hijo{familia.length === 1 ? '' : 's'}.<span className="block text-xs text-slate-500">Registra la solicitud ({becaH!.nombre}, {becaH!.pct}%) en estado Pendiente: no se aplica descuento hasta que se apruebe en Becas.</span></span>
                </label>
              )}
              <label className="flex cursor-pointer items-center gap-2 text-[13px]"><input type="checkbox" checked={w.finSame} onChange={() => set({ finSame: !w.finSame })} className="h-4 w-4 accent-accent" />El tutor financiero (responsable de pago) es la misma persona que el tutor legal</label>
            </div>
          )}

          {step === 3 && (
            <div className="flex flex-col gap-3.5">
              <div className="text-[15px] font-semibold">Curso y tanda</div>
              <div className="flex flex-wrap gap-3">
                <label className="flex flex-col gap-1 text-xs font-medium text-slate-600">Tanda
                  <select value={tanda} onChange={e => set({ tanda: e.target.value, cupo: '', sec: '' })} className={`${inp} min-w-[180px] bg-white`}>{(cfg?.tandas ?? []).map(t => <option key={t}>{t}</option>)}</select>
                </label>
                <label className="flex flex-col gap-1 text-xs font-medium text-slate-600">Nivel · Grado
                  <select value={gradoId} onChange={e => set({ grado: e.target.value, cupo: '', sec: '' })} className={`${inp} min-w-[200px] bg-white`}>{(cfg?.grados ?? []).map(g => <option key={g.id} value={g.id}>{g.label}</option>)}</select>
                </label>
              </div>
              <div className="grid gap-2.5 [grid-template-columns:repeat(auto-fill,minmax(200px,1fr))]">
                {secs.map(c => {
                  const pct = c.used / c.cap, full = c.used >= c.cap, sel = w.cupo === c.id;
                  return (
                    <button key={c.id} disabled={full} onClick={() => set({ cupo: c.id, sec: c.seccion })} className={`flex flex-col gap-2 rounded-lg border-2 p-3 text-left ${sel ? 'border-accent bg-blue-50' : 'border-slate-200 bg-white'} ${full ? 'cursor-not-allowed opacity-55' : 'cursor-pointer'}`}>
                      <div className="flex items-baseline justify-between"><span className="text-[15px] font-semibold text-ink">Sección {c.seccion}</span><span className="font-mono text-xs font-medium text-slate-600">{c.used}/{c.cap}</span></div>
                      <div className="h-1.5 overflow-hidden rounded-full bg-slate-200"><div className="h-full" style={{ width: `${Math.round(pct * 100)}%`, background: pct >= 1 ? '#DC2626' : pct >= 0.8 ? '#D97706' : '#16A34A' }} /></div>
                      <span className={`text-xs font-medium ${full ? 'text-red-700' : pct >= 0.8 ? 'text-amber-700' : 'text-green-700'}`}>{full ? 'Sin cupo' : `${c.cap - c.used} cupos disponibles`}</span>
                    </button>
                  );
                })}
              </div>
              {cfg && secs.length === 0 && <div className="text-[13px] text-amber-700">No hay secciones configuradas para este grado y tanda (Catálogos → Secciones).</div>}
            </div>
          )}

          {step === 4 && (
            <div className="flex flex-col gap-3.5">
              <div className="text-[15px] font-semibold">Plan de pago</div>
              <div className="grid gap-2.5 [grid-template-columns:repeat(auto-fit,minmax(200px,1fr))]">
                {planes.map(p => (
                  <button key={p.id} onClick={() => set({ plan: p.id })} className={`flex cursor-pointer flex-col gap-1.5 rounded-lg border-2 p-3.5 text-left ${plan?.id === p.id ? 'border-accent bg-blue-50' : 'border-slate-200 bg-white'}`}>
                    <span className="text-sm font-semibold text-ink">{p.name}</span>{totalDe(p) > 0 ? <span className="font-mono text-base font-semibold text-ink">{p.n === 1 ? fmt(totalDe(p)) : `${p.n} × ${fmt(cuotaDe(p))}`}</span> : <span className="flex items-center gap-1 text-[13px] font-semibold text-amber-700"><i className="ph ph-warning" />Sin precio en {tanda}</span>}<span className="text-xs text-slate-600">{p.detalle}</span>
                  </button>
                ))}
                {cfg && planes.length === 0 && <div className="text-[13px] text-amber-700">Configura planes y precios (Finanzas → Planes de Pago) para poder inscribir.</div>}
              </div>
              <div className="flex items-center justify-between gap-2">
                <div className="text-xs font-semibold uppercase tracking-wide text-slate-600">Servicios recurrentes opcionales</div>
                {w.serv.length > 0 && <span className="rounded-full bg-blue-50 px-2 py-0.5 text-[11px] font-semibold text-blue-700">{w.serv.length} {w.serv.length === 1 ? 'seleccionado' : 'seleccionados'}</span>}
              </div>
              <div className="relative">
                <i className="ph ph-magnifying-glass pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
                <input value={servQ} onChange={e => setServQ(e.target.value)} placeholder="Buscar servicio (transporte, ruta, comedor…)" aria-label="Buscar servicio" className="h-9 w-full rounded-md border border-slate-300 bg-white pl-8 pr-2.5 text-[13px] outline-none focus:border-accent" />
              </div>
              {serviciosVis.length === 0 && (cfg?.servicios ?? []).length > 0 && <div className="text-xs text-slate-500">Ningún servicio coincide con «{servQ}».</div>}
              <div className="flex max-h-[320px] flex-col gap-2 overflow-y-auto pr-1">
                {serviciosVis.map(s => (
                  <label key={s.k} className={`flex cursor-pointer items-center gap-2.5 rounded-md border px-3 py-2.5 text-[13px] ${w.serv.includes(s.k) ? 'border-blue-200 bg-blue-50' : 'border-slate-200 bg-white'}`}>
                    <input type="checkbox" checked={w.serv.includes(s.k)} onChange={() => set({ serv: w.serv.includes(s.k) ? w.serv.filter(k => k !== s.k) : [...w.serv, s.k] })} className="h-4 w-4 accent-accent" />
                    <span className="flex-1">{s.n}</span><span className="font-mono text-[13px] font-medium">{fmt(s.price)}/mes</span>
                  </label>
                ))}
              </div>
            </div>
          )}

          {step === 5 && (
            <div className="flex flex-col gap-3.5">
              <div className="text-[15px] font-semibold">Cierre: contrato y factura</div>
              <div className="rounded-md border border-slate-200 bg-slate-50 px-5 py-[18px] text-[13px] leading-[1.6] text-slate-700">
                <div className="text-xs font-bold tracking-[0.06em] text-ink">CONTRATO DE SERVICIOS EDUCATIVOS{cfg?.ciclo ? ` · ${cfg.ciclo}` : ''}</div>
                {introContrato({ colegio: perfil?.nombre ?? '', rnc: perfil?.rnc ?? '', tutor: finName, alumno: fullName, curso: `${grado} ${w.sec || '?'} · ${tanda}`, plan: plan?.name ?? '', mora: plan?.mora, gracia: plan?.gracia })}
              </div>
              <div className="flex flex-wrap gap-2">
                {([['digital', 'Firma digitalizada', 'ph-signature'], ['fisica', 'Imprimir para firma física', 'ph-printer']] as const).map(([k, l, ic]) => (
                  <button key={k} disabled={!!done} onClick={() => set({ firma: k })} className={`flex h-9 items-center gap-1.5 rounded-md border px-3.5 text-[13px] font-medium ${w.firma === k ? 'border-accent bg-blue-50 text-info-fg' : 'border-slate-300 bg-white text-ink'}`}><i className={`ph ${ic}`} />{l}</button>
                ))}
              </div>
              {done && (
                <div className="flex items-center gap-3 rounded-lg bg-ok-bg p-3.5 text-green-900">
                  <i className="ph-fill ph-check-circle text-[28px] text-green-600" />
                  <div className="text-[13px] leading-normal"><b>Inscripción completada.</b> Matrícula <span className="font-mono">{done.code}</span> · Factura de inscripción NCF <span className="font-mono">{done.ncf}</span> por <b className="font-mono">{fmt(done.factura)}</b>. Cartera de {done.cuotas} cuotas generada{done.materiales ? <> más la <b>cuota de materiales</b> de <span className="font-mono">{fmt(done.materiales)}</span> como cargo aparte</> : null} (las que ya cumplieron su fecha de vencimiento se muestran como Vencidas).{done.becaId && <> Solicitud de beca Plan Hermano registrada como <b>Pendiente</b>: se aprueba en Becas.</>}</div>
                </div>
              )}
              {done?.contrato && (() => { const pb = pbtn('ins-contrato', 'Imprimir contrato', 'ph ph-printer'); return (
                <div className="flex flex-col gap-2 rounded-lg border border-slate-200 bg-white p-3.5">
                  <div className="text-[13px] text-slate-700"><b>Contrato de servicios educativos e inscripción</b> generado ({done.contrato.ctr}). Incluye datos del estudiante, tutores con cédula, plan y calendario de cuotas, servicios, información de pago, cláusulas y firmas. Ya se abrió en la vista previa; desde aquí puedes reabrirlo, imprimirlo o descargar el PDF (con folio de verificación).</div>
                  <div className="flex flex-wrap gap-2">
                    <button onClick={() => abrirContrato(done)} className="flex h-9 items-center gap-1.5 rounded-md border border-accent bg-blue-50 px-3.5 text-[13px] font-medium text-info-fg"><i className={pb.icon} style={{ animation: pb.spin }} />{pb.label}</button>
                    <button onClick={() => void bajarContrato(done)} disabled={pdfBusy} className="flex h-9 items-center gap-1.5 rounded-md border border-slate-300 bg-white px-3.5 text-[13px] font-medium text-ink disabled:opacity-60"><i className={pdfBusy ? 'ph ph-circle-notch' : 'ph ph-file-pdf'} style={{ animation: pdfBusy ? 'spin 0.8s linear infinite' : 'none' }} />{pdfBusy ? 'Generando…' : 'Descargar PDF'}</button>
                  </div>
                </div>
              ); })()}
            </div>
          )}

          {/* Pegada al borde inferior de la vista: Atrás / Continuar siempre a mano sin bajar hasta el final del paso. */}
          <div className="sticky bottom-0 z-10 flex items-center justify-between gap-2.5 border-t border-slate-200 bg-white pb-1 pt-3">
            <button onClick={() => step > 1 && !done && setStep(step - 1)} className={`h-[38px] rounded-md border border-slate-300 bg-white px-3.5 text-[13px] font-medium hover:bg-slate-100 ${step > 1 && !done ? 'visible' : 'invisible'}`}>Atrás</button>
            <span className="text-xs text-amber-700">{step < 5 ? ok[step] ?? '' : ''}</span>
            <button onClick={next} disabled={busy || sl} title={sl ? SL_MSG : undefined} className={`h-[38px] rounded-md px-[18px] text-[13px] font-semibold text-white hover:brightness-95 ${blocked ? 'cursor-not-allowed bg-blue-300' : 'cursor-pointer bg-accent'}`}>{step < 5 ? 'Continuar' : done ? 'Nueva inscripción' : 'Emitir contrato y factura'}</button>
          </div>
        </section>

        <aside className="sticky top-0 flex flex-col gap-2.5 rounded-lg border border-slate-200 bg-white p-4">
          <div className="text-xs font-semibold uppercase tracking-wide text-slate-600">Resumen</div>
          {summary.map(([k, v]) => <div key={k} className="flex justify-between gap-2.5 text-[13px]"><span className="text-slate-500">{k}</span><span className="text-right font-medium">{v}</span></div>)}
          <div className="flex flex-col gap-1.5 border-t border-dashed border-slate-200 pt-2.5">
            <div className="flex justify-between text-[13px]"><span className="text-slate-500">Cuota periódica</span><span className="font-mono text-[13px] font-semibold">{fmt(cuotaPer)}</span></div>
            <div className="flex justify-between text-[13px]"><span className="text-slate-500">Inscripción</span><span className="font-mono text-[13px] font-semibold" data-testid="ins-monto">{fmt(INS)}</span></div>
            {insOrigen && <div className="text-right text-[11px] text-slate-500" data-testid="ins-origen">{insOrigen}</div>}
            {MAT > 0 && <div className="flex justify-between text-[13px]"><span className="text-slate-500">Cuota de materiales (aparte)</span><span className="font-mono text-[13px] font-semibold" data-testid="ins-materiales">{fmt(MAT)}</span></div>}
            <div className="flex justify-between text-[13px]"><span className="text-slate-500">Factura inicial</span><span className="font-mono text-[15px] font-semibold">{fmt(factura)}</span></div>
          </div>
        </aside>
      </div>
    </div>
  );
}
