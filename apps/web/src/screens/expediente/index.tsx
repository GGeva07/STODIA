import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { Navigate, Route, Routes, useNavigate, useParams } from 'react-router-dom';
import type { ExpDoc, ExpedienteResp } from '@stodia/shared';
import { api } from '../../lib/api';
import { canAccess } from '../../lib/access';
import { useSession } from '../../lib/session';
import { useToast } from '../../components/system/UiProvider';
import { btn, card, pill, pillBase, type PillTone } from '../../components/system/styles';
import { errMsg, fmt } from '../../components/finanzas/fin';
import { cartaDoc, printCarta } from '../../components/personas/printCarta';
import { descargarPdf, hoyDMY } from '../../components/finanzas/print';
import { usePerfil } from '../../components/finanzas/perfil';
import Servicios from './Servicios';

const TABS = [['personal', 'Datos personales'], ['academico', 'Historial académico'], ['cuenta', 'Estado de cuenta'], ['servicios', 'Servicios y Contrato'], ['medico', 'Médico y alimenticio'], ['docs', 'Documentación'], ['familia', 'Red familiar']] as const;
type Tab = (typeof TABS)[number][0];
const DOC_TONE: Record<ExpDoc['est'], PillTone> = { Validado: 'ok', Pendiente: 'bad', 'En revisión': 'warn' };
const READONLY = ['Docente', 'Encargado Comedor', 'Tutor'];

const Field = ({ k, children, span }: { k: string; children: ReactNode; span?: boolean }) => (
  <div className={span ? 'col-span-2' : ''}><div className="text-xs text-slate-500">{k}</div>{children}</div>
);
const Grid = ({ children }: { children: ReactNode }) => <section className={`${card} grid grid-cols-[repeat(auto-fill,minmax(220px,1fr))] gap-x-6 gap-y-[18px] p-[18px]`}>{children}</section>;
const dmy = (iso: string) => iso.split('-').reverse().join('/');
const edad = (iso: string) => { const d = new Date(iso), n = new Date(); let a = n.getFullYear() - d.getFullYear(); if (n < new Date(n.getFullYear(), d.getMonth(), d.getDate())) a--; return a; };
const mono = 'font-mono';

function Expediente() {
  const { id = '' } = useParams();
  const { user } = useSession();
  const navigate = useNavigate();
  const toast = useToast();
  const perfil = usePerfil();
  const colegio = (perfil?.nombre ?? '').toUpperCase(), rncP = perfil?.rnc ?? '';
  const [data, setData] = useState<ExpedienteResp | null>(null);
  const [error, setError] = useState('');
  const [tab, setTab] = useState<Tab>('personal');
  const [menu, setMenu] = useState(false);

  const reload = useCallback(async () => {
    try { setData(await api.get<ExpedienteResp>(`/expediente/${id}`)); setError(''); } catch (e) { setData(null); setError(errMsg(e)); }
  }, [id]);
  useEffect(() => { setData(null); setTab('personal'); void reload(); }, [reload]);

  if (error) return <div className={`${card} p-6 text-sm text-red-600`}>{error}</div>;
  if (!data) return <p className="text-sm text-slate-500">Cargando expediente…</p>;

  const { alumno: a, ficha, tutor, legal, cuenta, docs, hermanos } = data;
  const nombre = `${a.nombres.split(' ')[0]} ${a.apellidos}`;
  const curso = `${a.grado} ${a.sec}`;
  const canWrite = !!user && !READONLY.includes(user.rol);
  const vencido = cuenta.filter(i => !i.paid && i.est === 'Vencida').reduce((t, i) => t + i.monto, 0);
  const pendiente = cuenta.filter(i => !i.paid && i.est !== 'Vencida').reduce((t, i) => t + i.monto, 0);
  const mora = vencido > 0 || (cuenta.length === 0 && a.cuenta === 'mora');
  const caja = !!user && canAccess(user.rol, 'pos');
  const estadoItem = (i: (typeof cuenta)[number]): [string, PillTone] => (i.paid ? ['Pagado', 'ok'] : i.est === 'Vencida' ? ['Vencida', 'bad'] : [i.est, 'mute']);

  const ciclo = data.ref.ciclos[0] ?? '';
  const planAct = data.ref.planes[ficha.contrato.plan];
  const planLbl = planAct?.name ?? 'Sin plan asignado';
  const docEstado = () => printCarta([{
    title: 'Estado de cuenta', sub: `Corte al ${hoyDMY()}${ciclo ? ` · Ciclo ${ciclo}` : ''}`,
    blocks: [
      { t: 'kv', rows: [['Estudiante', nombre], ['Matrícula', a.code], ['Curso', `${curso} · ${a.tanda}`], ['Tutor financiero', tutor ? `${tutor.nombre} · ${tutor.cedula}` : '—']] },
      { t: 'table', head: ['Concepto', 'Vence', 'Estado', 'Monto'], rows: cuenta.map(i => [i.con, i.vence, estadoItem(i)[0], fmt(i.monto)]), widths: ['1fr', '82px', '74px', '100px'], aligns: ['left', 'left', 'left', 'right'] },
      { t: 'total', rows: [['Total vencido', fmt(vencido)], ['Por vencer / pendiente', fmt(pendiente)], ['BALANCE CONSOLIDADO', fmt(vencido + pendiente), true]] },
    ],
  }], ['Firma del cajero', 'Firma de dirección'], `Estado de cuenta · ${a.nombres.split(' ')[0]} ${a.apellidos.split(' ')[0]}`, 'estado', `estado_cuenta_${a.code}.pdf`);

  const docContrato = () => {
    const p = planAct, b = data.ref.becas[ficha.contrato.beca] ?? { pct: 0 };
    if (!p) { toast('Asigna un plan de pago al contrato antes de imprimirlo (pestaña Servicios y Contrato)', 'warn'); return; }
    const net = p.gross * (1 - b.pct);
    printCarta([{
      title: 'Contrato de servicios educativos', sub: `Ciclo lectivo ${ficha.contrato.ciclo || ciclo} · ${ficha.contrato.ctr || a.code}`,
      blocks: [
        { t: 'text', s: `Entre ${colegio}, RNC ${rncP}, en lo adelante EL COLEGIO, y ${(tutor?.nombre ?? '—').toUpperCase()}, cédula ${tutor?.cedula ?? '—'}, en calidad de tutor financiero, en lo adelante EL TUTOR, se acuerda lo siguiente respecto al estudiante ${nombre.toUpperCase()}, matrícula ${a.code}, inscrito en ${curso}, tanda ${a.tanda.toLowerCase()}.` },
        { t: 'kv', rows: [['Plan de pago', p.name], ['Cuota base', fmt(p.gross)], ['Descuento / beca', b.pct ? `${Math.round(b.pct * 10000) / 100}%` : 'Ninguno'], ['Cuota neta facturable', fmt(net)]] },
        { t: 'text', s: `PRIMERO: EL TUTOR se obliga a pagar las cuotas el día ${p.dia} de ${p.freq === 1 ? 'cada mes' : 'cada vencimiento'}. SEGUNDO: ${p.mora ? `transcurridos ${p.gracia} días de gracia, las cuotas vencidas generan un recargo ${p.mora}` : 'las cuotas vencidas no generan recargo por mora'}. TERCERO: la inscripción no es reembolsable. CUARTO: EL TUTOR declara conocer el reglamento interno y autoriza el uso de los datos del estudiante para fines académicos y administrativos conforme a la ley.` },
      ],
    }], ['Tutor financiero', 'Dirección del colegio'], 'Contrato de inscripción', 'contrato', `contrato_${a.code}.pdf`);
  };

  const docNoAdeudo = () => {
    if (vencido > 0) { toast(`No se puede emitir la certificación: saldo vencido de ${fmt(vencido)}. Cobra o abona en caja.`, 'bad'); return; }
    printCarta([{
      title: 'Certificación de no adeudo', sub: `Emitida el ${hoyDMY()}`,
      blocks: [
        { t: 'text', s: `Por medio de la presente, ${colegio}, RNC ${rncP}, certifica que el estudiante ${nombre.toUpperCase()}, matrícula ${a.code}, cuyo tutor financiero es ${(tutor?.nombre ?? '—').toUpperCase()}, NO MANTIENE ADEUDOS VENCIDOS con la institución al día de la fecha.` },
        { t: 'text', s: 'Se expide a solicitud de la parte interesada para los fines que estime convenientes.' },
      ],
    }], ['Administración financiera', 'Dirección del colegio'], 'Certificación de no adeudo', 'noadeudo', `no_adeudo_${a.code}.pdf`);
  };

  /** Boletín histórico: PDF real con folio + SHA-256 + QR de verificación (no es firma digital con certificado). */
  const boletin = async (h: ExpedienteResp['ficha']['hist'][number]) => {
    const doc = cartaDoc([{
      title: 'Boletín de calificaciones', sub: `Ciclo ${h.c}${h.btn === 'Parcial' ? ' · parcial (en curso)' : ''}`,
      blocks: [
        { t: 'kv', rows: [['Estudiante', nombre], ['Matrícula', a.code], ['Ciclo lectivo', h.c], ['Grado', h.g]] },
        { t: 'total', rows: [['Promedio general', h.prom], ['Calificación', h.l, true]] },
        { t: 'text', s: h.btn === 'Parcial' ? 'Promedio parcial del ciclo en curso; el asterisco indica que aún no se han cerrado todos los períodos.' : 'Promedio final del ciclo lectivo según el registro académico de la institución.' },
      ],
    }], ['Dirección académica', 'Firma del tutor'], `Boletín ${h.c} · ${nombre}`, `boletin_${a.code}_${h.c.replace('–', '-')}.pdf`, 'BOL');
    try { toast('Generando boletín…', 'info'); await descargarPdf(doc); toast(`Boletín ${h.c} descargado (PDF con folio de verificación)`, 'info'); } catch (e) { toast(errMsg(e), 'bad'); }
  };


  const subirDoc = async (d: ExpDoc) => {
    try { await api.put(`/expediente/${a.id}/documentos/${d.id}`); await reload(); toast(`${d.n} cargado · pendiente de validación`, 'info'); } catch (e) { toast(errMsg(e), 'bad'); }
  };

  const menuBtn = 'flex h-[34px] w-full items-center gap-2 rounded-md px-2.5 text-left text-[13px] hover:bg-slate-100';

  return (
    <div className="flex flex-col gap-3.5">
      <div className="flex flex-wrap items-center gap-4">
        <div className="grid h-[72px] w-[72px] place-items-center rounded-xl bg-slate-200 text-2xl font-semibold text-slate-700">{(a.nombres[0] + a.apellidos[0]).toUpperCase()}</div>
        <div className="min-w-[240px] flex-1">
          <h1 className="m-0 text-xl font-semibold tracking-tight">{a.nombres.split(' ')[0]} {a.apellidos}</h1>
          <div className="mt-1.5 flex flex-wrap items-center gap-2">
            <span className={`${mono} text-xs font-medium text-slate-600`}>{a.code}</span>
            <span className="inline-flex h-[22px] items-center rounded-full bg-mute-bg px-2 text-[11px] font-medium text-slate-700">{curso} · {a.tanda}</span>
            <span className={`${pillBase} w-[84px] ${pill[mora ? 'bad' : 'ok']}`}>{mora ? 'EN MORA' : 'AL DÍA'}</span>
            {a.alg && <span className="inline-flex h-[22px] items-center gap-1 rounded-full bg-red-600 px-2 text-[11px] font-bold tracking-[0.02em] text-white"><i className="ph-fill ph-warning" />ALERGIAS SEVERAS</span>}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {caja && <button onClick={() => navigate('/pos')} className={btn}><i className="ph ph-cash-register" />Abrir en caja</button>}
          <div className="relative z-30">
            <button onClick={() => setMenu(m => !m)} className={btn}><i className="ph ph-dots-three-vertical" />Acciones</button>
            {menu && (
              <>
                <div className="fixed inset-0 z-30" onClick={() => setMenu(false)} />
                <div className="absolute right-0 top-10 z-40 w-[270px] rounded-lg border border-slate-200 bg-white p-1.5 shadow-[0_12px_32px_rgba(15,23,42,0.18)]">
                  <div className="px-2.5 py-1.5 text-[11px] font-medium uppercase tracking-wide text-slate-500">Documentos oficiales</div>
                  {([['ph-file-text', 'Imprimir Estado de Cuenta', docEstado], ['ph-signature', 'Imprimir Contrato de Inscripción', docContrato], ['ph-seal-check', 'Imprimir Certificación de No Adeudo', docNoAdeudo]] as const).map(([ic, l, fn]) => (
                    <button key={l} onClick={() => { setMenu(false); fn(); }} className={menuBtn}><i className={`ph ${ic} text-base text-slate-600`} />{l}</button>
                  ))}
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      <div className="flex gap-0.5 overflow-auto border-b border-slate-200" role="tablist">
        {TABS.map(([k, l]) => (
          <button key={k} role="tab" aria-selected={tab === k} onClick={() => setTab(k)} className={`h-[38px] whitespace-nowrap px-3.5 text-[13px] font-medium hover:text-ink ${tab === k ? 'text-ink shadow-[inset_0_-2px_0_#2563EB]' : 'text-slate-500'}`}>{l}</button>
        ))}
      </div>

      {tab === 'personal' && (
        <Grid>
          <Field k="Nombres"><div className="font-medium">{a.nombres}</div></Field>
          <Field k="Apellidos"><div className="font-medium">{a.apellidos}</div></Field>
          <Field k="Fecha de nacimiento"><div className="font-medium">{dmy(a.fnac)} · {edad(a.fnac)} años</div></Field>
          <Field k="Código de estudiante"><div className={`${mono} text-sm font-medium`}>{a.code}</div></Field>
          <Field k="Carnet (código de barras)"><div className={`${mono} text-sm font-medium`}>{ficha.carnet || '—'}</div></Field>
          <Field k="Ingreso"><div className="font-medium">{ficha.ingreso || '—'}</div></Field>
          <Field k="Dirección de residencia" span>
            <div className="font-medium">{a.dir ? (a.dir.includes('Santo Domingo') ? a.dir : a.dir + ', Santo Domingo D.N.') : '—'}</div>
            {ficha.geo && <div className={`${mono} mt-0.5 text-xs text-slate-600`}>{ficha.geo}</div>}
          </Field>
        </Grid>
      )}

      {tab === 'academico' && (
        <div className="grid items-start gap-3.5 [grid-template-columns:repeat(auto-fit,minmax(min(100%,360px),1fr))]">
          <section className={card}>
            <div className="border-b border-slate-200 px-3.5 py-3 text-sm font-semibold">Promedios históricos</div>
            <div className="grid grid-cols-[110px_70px_1fr_60px_110px] gap-2 border-b border-slate-200 bg-slate-50 px-3.5 py-2 text-[11px] font-semibold uppercase text-slate-600"><span>Ciclo</span><span>Grado</span><span className="text-right">Promedio</span><span className="text-center">Letra</span><span /></div>
            {ficha.hist.map(h => (
              <div key={h.c} className="grid h-9 grid-cols-[110px_70px_1fr_60px_110px] items-center gap-2 border-b border-slate-100 px-3.5 text-[13px]">
                <span className={`${mono} text-xs`}>{h.c}</span><span>{h.g}</span><span className={`${mono} text-right text-[13px] font-medium`}>{h.prom}</span><span className={`${mono} text-center text-xs font-semibold`}>{h.l}</span>
                <span className="text-right"><button onClick={() => boletin(h)} className="inline-flex h-[26px] items-center gap-1 rounded-md px-2 text-xs font-medium text-accent hover:bg-blue-50"><i className="ph ph-download-simple" />{h.btn}</button></span>
              </div>
            ))}
            {ficha.hist.length === 0 && <div className="px-3.5 py-6 text-center text-[13px] text-slate-500">Sin historial académico registrado.</div>}
          </section>
          <section className={card}>
            <div className="border-b border-slate-200 px-3.5 py-3 text-sm font-semibold">Conducta y observaciones</div>
            <div className="flex flex-col gap-3 p-3.5">
              {ficha.conducta.obs.map((o, i) => (
                <div key={i} className="flex gap-2.5"><i className={`ph ${o.icon} text-lg ${o.tone === 'ok' ? 'text-green-600' : 'text-amber-600'}`} /><div className="text-[13px] leading-[1.45]">{o.txt}<div className="text-xs text-slate-500">{o.fecha}</div></div></div>
              ))}
              <div className="text-xs text-slate-600">Récord de conducta: <b>{ficha.conducta.record.split(" (")[0]}</b>{ficha.conducta.record.includes(" (") ? " (" + ficha.conducta.record.split(" (").slice(1).join(" (") : ""}</div>
            </div>
          </section>
        </div>
      )}

      {tab === 'cuenta' && (
        <div className="flex flex-col gap-3.5">
          <div className="flex flex-wrap gap-7">
            <div><div className="text-xs text-slate-500">Balance consolidado al día</div><div className={`${mono} text-[22px] font-semibold ${vencido > 0 ? 'text-red-600' : 'text-green-600'}`}>{fmt(vencido)}</div></div>
            <div><div className="text-xs text-slate-500">Tutor financiero</div><div className="mt-1 font-medium">{tutor?.nombre ?? '—'}</div></div>
            <div><div className="text-xs text-slate-500">Plan de pago</div><div className={`mt-1 font-medium ${planAct ? '' : 'text-slate-500'}`}>{planLbl}</div></div>
            <div><div className="text-xs text-slate-500">Becas activas</div><div className={`mt-1 font-medium ${data.becasActivas.length ? '' : 'text-slate-500'}`}>{data.becasActivas.join(' · ') || 'Ninguna'}</div></div>
          </div>
          <section className={card}>
            {cuenta.map(i => {
              const [lbl, tone] = estadoItem(i);
              return (
                <div key={i.id} className="grid h-9 grid-cols-[minmax(0,1fr)_110px_110px_130px] items-center gap-2 border-b border-slate-100 px-3.5 text-[13px]">
                  <span>{i.con}</span><span className={`${mono} text-xs text-slate-600`}>{i.vence}</span>
                  <span><span className={`${pillBase.replace('font-semibold', 'font-medium')} w-[81px] ${pill[tone]}`}>{lbl}</span></span>
                  <span className={`${mono} text-right text-[13px] font-medium`}>{fmt(i.monto)}</span>
                </div>
              );
            })}
            {cuenta.length === 0 && <div className="px-3.5 py-6 text-center text-[13px] text-slate-500">Sin movimientos en cuentas por cobrar para este alumno.</div>}
          </section>
        </div>
      )}

      {tab === 'servicios' && <Servicios data={data} reload={reload} canWrite={canWrite} />}

      {tab === 'medico' && (
        <div className="flex flex-col gap-3.5">
          {a.alg && (
            <div className="flex items-center gap-3.5 rounded-lg bg-red-600 px-[18px] py-3.5 text-white">
              <i className="ph-fill ph-warning-octagon text-[32px]" />
              <div><div className="text-base font-bold tracking-[0.02em]">ALÉRGICO A {a.alg.toUpperCase().replace(/,\s*/g, ' · ')}</div>{ficha.medico.alertaDetalle && <div className="text-[13px] opacity-95">{ficha.medico.alertaDetalle}</div>}</div>
            </div>
          )}
          <Grid>
            <Field k="Tipo de sangre"><div className={`${mono} text-base font-semibold`}>{ficha.medico.sangre || '—'}</div></Field>
            <Field k="Seguro médico"><div className="font-medium">{ficha.medico.seguro || '—'}</div>{ficha.medico.poliza && <div className={`${mono} text-xs text-slate-600`}>Póliza {ficha.medico.poliza}</div>}</Field>
            <Field k="Condiciones especiales"><div className="font-medium">{ficha.medico.condiciones || 'Ninguna registrada'}</div></Field>
            <Field k="Plan alimenticio"><div className="font-medium">{ficha.medico.planAlim || '—'}</div>{ficha.medico.planAlimExtra && <div className="text-xs text-slate-600">{ficha.medico.planAlimExtra}</div>}</Field>
            <Field k="Contacto de emergencia"><div className="font-medium">{ficha.medico.emergenciaNombre || '—'}</div><div className={`${mono} text-xs text-slate-600`}>{ficha.medico.emergenciaTel || a.tel}</div></Field>
            <Field k="Protección de datos"><div className="flex items-center gap-1.5 text-[13px] text-slate-600"><i className="ph ph-lock-key" />Cifrado AES-256 en reposo</div></Field>
          </Grid>
        </div>
      )}

      {tab === 'docs' && (
        <section className={card}>
          {docs.map(d => (
            <div key={d.id} className="flex min-h-14 flex-wrap items-center gap-3 border-b border-slate-100 px-3.5 py-2">
              <i className="ph ph-file-text text-[22px] text-slate-500" />
              <div className="min-w-[180px] flex-1"><div className="font-medium">{d.n}</div><div className={`${mono} text-xs text-slate-500`}>{d.f}</div></div>
              <span className={`${pillBase} w-[81px] ${pill[DOC_TONE[d.est]]}`}>{d.est}</span>
              {canWrite && <button onClick={() => subirDoc(d)} className="flex h-[30px] items-center gap-1 rounded-md border border-slate-300 bg-white px-2.5 text-xs font-medium hover:bg-slate-100"><i className="ph ph-upload-simple" />{d.est === 'Pendiente' ? 'Cargar' : 'Reemplazar'}</button>}
            </div>
          ))}
        </section>
      )}

      {tab === 'familia' && (
        <div className="grid gap-3.5 [grid-template-columns:repeat(auto-fit,minmax(300px,1fr))]">
          <section className={`${card} flex flex-col gap-2.5 p-4`}>
            <span className="inline-flex h-[22px] items-center self-start rounded-full bg-info-bg px-2 text-[11px] font-semibold text-info-fg">TUTOR LEGAL</span>
            {(legal ?? tutor) ? (
              <div><div className="text-base font-semibold">{(legal ?? tutor)!.nombre}</div><div className="text-[13px] text-slate-600">{(legal ?? tutor)!.parentesco} · <span className={mono}>{(legal ?? tutor)!.cedula}</span> · {(legal ?? tutor)!.tel}</div></div>
            ) : <div className="text-[13px] text-slate-500">Sin tutor registrado.</div>}
            <div className="text-xs font-medium text-slate-500">Autorizada para</div>
            <div className="flex flex-col gap-1.5 text-[13px]">
              {['Firma de boletines', 'Retiro físico de la institución', 'Permisos de salidas pedagógicas', 'Recepción de reportes disciplinarios'].map(t => (
                <span key={t} className="flex items-center gap-2"><i className="ph ph-check text-green-600" />{t}</span>
              ))}
            </div>
          </section>
          <section className={`${card} flex flex-col gap-2.5 p-4`}>
            <span className="inline-flex h-[22px] items-center self-start rounded-full bg-warn-bg px-2 text-[11px] font-semibold text-warn-fg">TUTOR FINANCIERO · RESPONSABLE DE PAGO</span>
            {tutor ? <div><div className="text-base font-semibold">{tutor.nombre}</div><div className="text-[13px] text-slate-600">{tutor.parentesco} · <span className={mono}>{tutor.cedula}</span> · {tutor.tel}</div></div> : <div className="text-[13px] text-slate-500">Sin tutor financiero.</div>}
            <div className="flex flex-col gap-1.5 text-[13px]">
              <span className="flex items-center gap-2"><i className="ph ph-receipt text-slate-600" />Facturas y NCF emitidos a su nombre</span>
              <span className="flex items-center gap-2"><i className="ph ph-signature text-slate-600" />{ficha.contrato.firmado ? `Contrato y pagaré firmados · ${ficha.contrato.firmado}` : 'Contrato pendiente de firma'}</span>
              <span className="flex items-center gap-2"><i className="ph ph-scales text-slate-600" />Titular del registro de deuda contable</span>
            </div>
            {caja && <button onClick={() => navigate('/pos')} className="h-8 self-start rounded-md border border-blue-200 bg-white px-3 text-[13px] font-medium text-accent hover:bg-blue-50">Ver estado de cuenta en caja</button>}
          </section>
          <section className={`${card} flex flex-col gap-2.5 p-4`}>
            <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Hermanos en la institución</span>
            {hermanos.map(h => (
              <button key={h.id} onClick={() => navigate(`/expediente/${h.id}`)} className="flex items-center gap-2.5 text-left">
                <span className="grid h-9 w-9 place-items-center rounded-lg bg-slate-200 text-[13px] font-semibold text-slate-700">{h.nombre.split(' ').map((w, i, arr) => (i === 0 || i === arr.length - 2 ? w[0] : '')).join('').slice(0, 2).toUpperCase()}</span>
                <div><div className="font-medium hover:text-accent">{h.nombre}</div><div className="text-xs text-slate-600">{h.curso}{h.beca ? ` · ${h.beca}` : ''}</div></div>
              </button>
            ))}
            {hermanos.length === 0 && <div className="text-[13px] text-slate-500">Sin hermanos registrados.</div>}
          </section>
        </div>
      )}
    </div>
  );
}

export default function Screen() {
  return (
    <Routes>
      {/* Sin alumno seleccionado no hay expediente: se elige desde el Directorio. */}
      <Route index element={<Navigate to="/directorio" replace />} />
      <Route path=":id" element={<Expediente />} />
    </Routes>
  );
}
