import { useState, type CSSProperties, type FormEvent } from 'react';
import { SITE } from '../../lib/site';
import { Arrow } from './Doodles';

export default function FinalCta() {
  const [sent, setSent] = useState(false);
  function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const v = (k: string) => String(f.get(k) ?? '').trim();
    const body = ['Hola, quisiera solicitar una demo de STODIA.', '', `Nombre: ${v('nombre')}`, `Colegio: ${v('colegio')}`, `Teléfono: ${v('telefono') || '(no indicado)'}`, '', v('mensaje') || '(sin mensaje adicional)'].join('\n');
    window.location.href = `mailto:${SITE.email}?subject=${encodeURIComponent('Solicitud de demo STODIA')}&body=${encodeURIComponent(body)}`;
    setSent(true);
  }
  const field = 'w-full rounded-xl border border-white/20 bg-white px-4 py-3 text-base text-ink placeholder:text-slate-500 focus:border-yellow-300';
  const label = 'mb-1.5 block text-sm font-semibold text-white';
  return <section id="demo" aria-labelledby="demo-title" className="curve-top on-dark relative overflow-hidden bg-ink px-4 pb-24 text-white sm:px-6">
    <div className="shape -left-24 top-10 h-96 w-96 rounded-full bg-accent/30 blur-3xl" data-parallax="0.12" aria-hidden="true" /><div className="shape -right-16 bottom-10 h-72 w-72 rounded-full bg-yellow-300/10 blur-3xl" data-parallax="0.2" aria-hidden="true" />
    <div className="relative mx-auto grid max-w-6xl items-center gap-12 lg:grid-cols-2 lg:gap-16"><div data-reveal="left"><h2 id="demo-title" className="font-hand text-5xl font-bold leading-[1.02] sm:text-7xl">Libera el <span className="marker">potencial</span> de tu colegio</h2><p className="mt-6 max-w-lg text-lg text-slate-200">Cuéntanos cómo trabaja tu colegio hoy. Te mostramos STODIA con datos de ejemplo y te decimos con honestidad si es lo que necesitas.</p><ul className="mt-6 space-y-2 text-slate-200">{['Demostración sin compromiso', 'En tu servidor o alojado por nosotros', 'Tus datos son tuyos y exportables'].map(t => <li key={t} className="flex items-center gap-2"><i className="ph-fill ph-check-circle text-xl text-yellow-300" aria-hidden="true" />{t}</li>)}</ul><Arrow className="mt-6 hidden rotate-[100deg] lg:block" color="#FDE047" delay={600} /></div>
      <div data-reveal="right" style={{ ['--d' as string]: '120ms' } as CSSProperties}><form onSubmit={submit} className="rounded-3xl border border-white/10 bg-white/[0.07] p-6 sm:p-8" aria-describedby="demo-note"><div className="grid gap-4"><div><label htmlFor="d-nombre" className={label}>Tu nombre</label><input id="d-nombre" name="nombre" required autoComplete="name" className={field} placeholder="Nombre y apellido" /></div><div><label htmlFor="d-colegio" className={label}>Colegio</label><input id="d-colegio" name="colegio" required autoComplete="organization" className={field} placeholder="Nombre del colegio" /></div><div><label htmlFor="d-tel" className={label}>Teléfono <span className="font-normal text-slate-300">(opcional)</span></label><input id="d-tel" name="telefono" type="tel" autoComplete="tel" className={field} placeholder="809-000-0000" /></div><div><label htmlFor="d-msg" className={label}>¿Qué te gustaría resolver? <span className="font-normal text-slate-300">(opcional)</span></label><textarea id="d-msg" name="mensaje" rows={3} className={`${field} resize-y`} placeholder="Cobros, notas, asistencia…" /></div></div><button type="submit" className="btn mt-6 w-full bg-yellow-300 text-ink hover:bg-yellow-200">Solicitar demo <i className="ph ph-arrow-right" aria-hidden="true" /></button><p id="demo-note" className="mt-4 text-sm leading-relaxed text-slate-300">Al enviar se abrirá tu aplicación de correo con el mensaje listo para {SITE.email}. No guardamos ni enviamos tus datos desde esta página.</p><p role="status" className="mt-2 text-sm font-medium text-yellow-200">{sent ? 'Si no se abrió tu correo, escríbenos directamente a ' + SITE.email + '.' : ''}</p></form></div>
    </div>
  </section>;
}
