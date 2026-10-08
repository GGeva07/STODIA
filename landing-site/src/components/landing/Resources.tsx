import { SITE, absUrl } from '../../lib/site';
import { Underline } from './Doodles';

/** Enlaza al blog original, sin importar ni duplicar la app de artículos. */
export default function Resources() {
  return (
    <section id="recursos" aria-labelledby="rec-title" className="curve-top relative bg-[#F1F5F9] px-4 pb-32 sm:px-6 lg:pb-40">
      <div className="mx-auto max-w-6xl text-center" data-reveal="">
        <h2 id="rec-title" className="font-hand text-5xl font-bold leading-none text-ink sm:text-6xl">Recursos para <span className="relative inline-block">directores<Underline color="#2563EB" /></span></h2>
        <p className="mx-auto mt-6 max-w-2xl text-lg text-slate-700">Guías prácticas sobre cobros, normativa y administración escolar, para decidir con más información.</p>
        <a className="btn btn-primary mt-8" href={absUrl('/blog')}>Leer el blog de {SITE.name} <i className="ph ph-arrow-right" aria-hidden="true" /></a>
      </div>
    </section>
  );
}
