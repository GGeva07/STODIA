import { Link } from 'react-router-dom';

/** CTA no agresivo hacia la demo (STODIA como solución, sin urgencia ni promesas). */
export default function BlogCta({ variant }: { variant: 'inline' | 'final' }) {
  if (variant === 'inline') {
    return (
      <aside aria-label="Sobre STODIA" className="blog-noprint my-10 flex flex-col gap-4 rounded-2xl border border-accent/25 bg-accent-soft/50 p-5 sm:flex-row sm:items-center sm:justify-between sm:p-6">
        <p className="text-base leading-relaxed text-slate-800"><strong className="text-ink">Si esto ya se te hace cuesta arriba en hojas de cálculo,</strong> STODIA reúne cobros, notas y asistencia en un solo sistema pensado para colegios dominicanos.</p>
        <Link to="/#demo" className="btn btn-ghost shrink-0 !min-h-0 !py-2.5 !text-sm">Ver una demo <i className="ph ph-arrow-right" aria-hidden="true" /></Link>
      </aside>
    );
  }
  return (
    <aside aria-labelledby="blog-cta-t" className="blog-noprint on-dark relative my-14 overflow-hidden rounded-3xl bg-ink p-8 text-white sm:p-12">
      <div className="pointer-events-none absolute -right-16 -top-16 h-56 w-56 rounded-full bg-accent/40 blur-3xl" aria-hidden="true" />
      <h2 id="blog-cta-t" className="font-hand relative text-4xl font-bold leading-none sm:text-5xl">Lleva esto a tu <span className="marker">colegio</span></h2>
      <p className="relative mt-4 max-w-xl text-lg text-slate-200">Te mostramos STODIA con datos de ejemplo, resolvemos tus dudas y te decimos con honestidad si es lo que necesitas. Sin compromiso.</p>
      <div className="relative mt-6 flex flex-wrap gap-3">
        <Link to="/#demo" className="btn bg-yellow-300 text-ink hover:bg-yellow-200">Solicitar una demo <i className="ph ph-arrow-right" aria-hidden="true" /></Link>
        <Link to="/blog" className="btn text-white shadow-[inset_0_0_0_2px_rgba(255,255,255,.4)] hover:shadow-[inset_0_0_0_2px_#fff]">Más recursos</Link>
      </div>
    </aside>
  );
}
