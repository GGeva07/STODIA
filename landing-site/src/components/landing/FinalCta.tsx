import { useEffect, useRef, useState, type CSSProperties, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { LEGAL_ROUTES, SITE } from '../../lib/site';
import { Arrow } from './Doodles';

type Status = 'idle' | 'sending' | 'success' | 'error' | 'fallback';
type FieldKey = 'nombre' | 'colegio' | 'correo' | 'telefono' | 'mensaje' | 'consentimiento';
type Errors = Partial<Record<FieldKey, string>>;
const FIELD_ORDER: FieldKey[] = ['nombre', 'colegio', 'correo', 'telefono', 'mensaje', 'consentimiento'];
const FIELD_ID: Record<FieldKey, string> = { nombre: 'd-nombre', colegio: 'd-colegio', correo: 'd-correo', telefono: 'd-tel', mensaje: 'd-msg', consentimiento: 'd-consent' };
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_RE = /^[+0-9()\-.\s]{7,25}$/;

export default function FinalCta() {
  const [status, setStatus] = useState<Status>('idle');
  const [message, setMessage] = useState('');
  const [errors, setErrors] = useState<Errors>({});
  const [mailto, setMailto] = useState(`mailto:${SITE.email}`);
  const renderedAt = useRef(Date.now());
  const statusRef = useRef<HTMLParagraphElement>(null);
  const successRef = useRef<HTMLHeadingElement>(null);
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (status === 'success') successRef.current?.focus();
    else if (status === 'fallback' || (status === 'error' && Object.keys(errors).length === 0)) statusRef.current?.focus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status]);

  function mailtoHref(v: (k: string) => string) {
    const body = ['Hola, quisiera solicitar una demo de STODIA.', '', `Nombre: ${v('nombre')}`, `Colegio: ${v('colegio')}`, `Correo: ${v('correo')}`, `Teléfono: ${v('telefono') || '(no indicado)'}`, '', v('mensaje') || '(sin mensaje adicional)'].join('\n');
    return `mailto:${SITE.email}?subject=${encodeURIComponent('Solicitud de demo STODIA')}&body=${encodeURIComponent(body)}`;
  }

  function focusFirstError(errs: Errors) {
    const first = FIELD_ORDER.find((k) => errs[k]);
    if (first) document.getElementById(FIELD_ID[first])?.focus();
  }

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (status === 'sending') return;
    const f = new FormData(e.currentTarget);
    const v = (k: string) => String(f.get(k) ?? '').trim();
    setMailto(mailtoHref(v));
    const errs: Errors = {};
    if (!v('nombre')) errs.nombre = 'Escribe tu nombre.';
    if (!v('colegio')) errs.colegio = 'Escribe el nombre del colegio.';
    if (!v('correo')) errs.correo = 'Escribe tu correo.';
    else if (!EMAIL_RE.test(v('correo'))) errs.correo = 'Escribe un correo válido, por ejemplo nombre@colegio.edu.do.';
    if (v('telefono') && !PHONE_RE.test(v('telefono'))) errs.telefono = 'Escribe un teléfono válido, por ejemplo 809-000-0000.';
    if (f.get('consentimiento') !== 'on') errs.consentimiento = 'Debes aceptar el tratamiento de tus datos para enviar la solicitud.';
    setErrors(errs);
    if (Object.keys(errs).length) { setStatus('error'); setMessage('Revisa los campos marcados.'); focusFirstError(errs); return; }

    setStatus('sending'); setMessage('Enviando tu solicitud…');
    const ctrl = new AbortController();
    const timer = window.setTimeout(() => ctrl.abort(), 20000);
    try {
      const res = await fetch('/api/solicitar-demo', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, signal: ctrl.signal,
        body: JSON.stringify({
          nombre: v('nombre'), colegio: v('colegio'), correo: v('correo'), telefono: v('telefono'), mensaje: v('mensaje'),
          consentimiento: true, website: v('website'), renderedAt: renderedAt.current, submittedAt: Date.now(),
        }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string; message?: string; fields?: Errors };
      if (res.ok) { setStatus('success'); setMessage(''); formRef.current?.reset(); return; }
      if (res.status === 503 || res.status === 404 || data.error === 'not_configured') {
        setStatus('fallback'); setMessage('Por ahora no podemos recibir solicitudes desde esta página.'); return;
      }
      const fieldErrs = data.fields ?? {};
      setErrors(fieldErrs);
      setStatus('error'); setMessage(data.message || 'No pudimos enviar tu solicitud. Inténtalo de nuevo.');
      if (Object.keys(fieldErrs).length) focusFirstError(fieldErrs);
    } catch {
      setStatus('fallback'); setMessage('No pudimos conectar con el servidor.');
    } finally { window.clearTimeout(timer); }
  }

  function again() { setStatus('idle'); setMessage(''); setErrors({}); renderedAt.current = Date.now(); }

  const sending = status === 'sending';
  const field = 'w-full rounded-xl border border-white/20 bg-white px-4 py-3 text-base text-ink placeholder:text-slate-500 focus:border-yellow-300';
  const label = 'mb-1.5 block text-sm font-semibold text-white';
  const err = (k: FieldKey) => errors[k] ? <p id={`${FIELD_ID[k]}-err`} className="mt-1.5 text-sm font-medium text-yellow-200">{errors[k]}</p> : null;
  const aria = (k: FieldKey) => ({ 'aria-invalid': errors[k] ? true : undefined, 'aria-describedby': errors[k] ? `${FIELD_ID[k]}-err` : undefined });
  return <section id="demo" aria-labelledby="demo-title" className="curve-top on-dark relative overflow-hidden bg-ink px-4 pb-24 text-white sm:px-6">
    <div className="shape -left-24 top-10 h-96 w-96 rounded-full bg-accent/30 blur-3xl" data-parallax="0.12" aria-hidden="true" /><div className="shape -right-16 bottom-10 h-72 w-72 rounded-full bg-yellow-300/10 blur-3xl" data-parallax="0.2" aria-hidden="true" />
    <div className="relative mx-auto grid max-w-6xl items-center gap-12 lg:grid-cols-2 lg:gap-16"><div data-reveal="left"><h2 id="demo-title" className="font-hand text-5xl font-bold leading-[1.02] sm:text-7xl">Libera el <span className="marker">potencial</span> de tu colegio</h2><p className="mt-6 max-w-lg text-lg text-slate-200">Cuéntanos cómo trabaja tu colegio hoy. Te mostramos STODIA con datos de ejemplo y te decimos con honestidad si es lo que necesitas.</p><ul className="mt-6 space-y-2 text-slate-200">{['Demostración sin compromiso', 'En tu servidor o alojado por nosotros', 'Tus datos son tuyos y exportables'].map(t => <li key={t} className="flex items-center gap-2"><i className="ph-fill ph-check-circle text-xl text-yellow-300" aria-hidden="true" />{t}</li>)}</ul><Arrow className="mt-6 hidden rotate-[100deg] lg:block" color="#FDE047" delay={600} /></div>
      <div data-reveal="right" style={{ ['--d' as string]: '120ms' } as CSSProperties}>
        {status === 'success' ? <div className="rounded-3xl border border-white/10 bg-white/[0.07] p-6 text-center sm:p-8">
          <i className="ph-fill ph-check-circle text-5xl text-yellow-300" aria-hidden="true" />
          <h3 ref={successRef} tabIndex={-1} className="mt-3 font-hand text-4xl font-bold outline-none">¡Solicitud enviada!</h3>
          <p role="status" className="mt-3 text-slate-200">Recibimos tu solicitud de demo. Te escribiremos pronto al correo que indicaste.</p>
          <button type="button" onClick={again} className="btn mt-6 w-full bg-yellow-300 text-ink hover:bg-yellow-200">Enviar otra solicitud</button>
        </div> : <form ref={formRef} onSubmit={submit} noValidate className="relative rounded-3xl border border-white/10 bg-white/[0.07] p-6 sm:p-8" aria-describedby="demo-note" aria-busy={sending}>
          <div className="grid gap-4">
            <div><label htmlFor="d-nombre" className={label}>Tu nombre</label><input id="d-nombre" name="nombre" required maxLength={100} autoComplete="name" className={field} placeholder="Nombre y apellido" {...aria('nombre')} />{err('nombre')}</div>
            <div><label htmlFor="d-colegio" className={label}>Colegio</label><input id="d-colegio" name="colegio" required maxLength={150} autoComplete="organization" className={field} placeholder="Nombre del colegio" {...aria('colegio')} />{err('colegio')}</div>
            <div><label htmlFor="d-correo" className={label}>Correo</label><input id="d-correo" name="correo" type="email" required maxLength={254} autoComplete="email" inputMode="email" className={field} placeholder="nombre@colegio.edu.do" {...aria('correo')} />{err('correo')}</div>
            <div><label htmlFor="d-tel" className={label}>Teléfono <span className="font-normal text-slate-300">(opcional)</span></label><input id="d-tel" name="telefono" type="tel" maxLength={25} autoComplete="tel" className={field} placeholder="809-000-0000" {...aria('telefono')} />{err('telefono')}</div>
            <div><label htmlFor="d-msg" className={label}>¿Qué te gustaría resolver? <span className="font-normal text-slate-300">(opcional)</span></label><textarea id="d-msg" name="mensaje" rows={3} maxLength={2000} className={`${field} resize-y`} placeholder="Cobros, notas, asistencia…" {...aria('mensaje')} />{err('mensaje')}</div>
            <div aria-hidden="true" className="absolute -left-[9999px] top-auto h-px w-px overflow-hidden"><label htmlFor="d-website">No completar este campo</label><input id="d-website" name="website" type="text" tabIndex={-1} autoComplete="off" /></div>
            <div><div className="flex items-start gap-3"><input id="d-consent" name="consentimiento" type="checkbox" required className="mt-1 h-5 w-5 shrink-0 accent-yellow-300" {...aria('consentimiento')} /><label htmlFor="d-consent" className="text-sm leading-relaxed text-slate-200">Acepto que usen mis datos para responder esta solicitud, según la <Link to={LEGAL_ROUTES.privacidad} target="_blank" className="font-semibold text-yellow-200 underline underline-offset-2">política de privacidad<span className="sr-only"> (se abre en una pestaña nueva)</span></Link>.</label></div>{err('consentimiento')}</div>
          </div>
          <button type="submit" disabled={sending} className="btn mt-6 w-full bg-yellow-300 text-ink hover:bg-yellow-200 disabled:cursor-not-allowed disabled:opacity-70">{sending ? <><svg className="h-5 w-5 animate-spin" viewBox="0 0 24 24" fill="none" aria-hidden="true"><circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="3" opacity=".25" /><path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" /></svg>Enviando…</> : <>Solicitar demo <i className="ph ph-arrow-right" aria-hidden="true" /></>}</button>
          <p id="demo-note" className="mt-4 text-sm leading-relaxed text-slate-300">Tu mensaje llega directamente a nuestro equipo y solo lo usamos para responderte.</p>
          <div aria-live="polite" aria-atomic="true">
            <p ref={statusRef} tabIndex={-1} className={`mt-2 text-sm font-medium outline-none ${status === 'error' || status === 'fallback' ? 'text-yellow-200' : 'text-slate-200'}`}>{message}</p>
            {status === 'fallback' && <p className="mt-1 text-sm text-slate-200">También puedes escribirnos a <a href={mailto} className="font-semibold text-yellow-200 underline underline-offset-2">{SITE.email}</a>.</p>}
          </div>
        </form>}
      </div>
    </div>
  </section>;
}
