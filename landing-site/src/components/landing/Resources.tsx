import { Suspense, lazy, useEffect, useRef, useState } from 'react';
import { Underline } from './Doodles';

const ResourcesList = lazy(() => import('./ResourcesList'));

/**
 * "Recursos para directores": enlaza al blog. La lista (artículos) se importa de forma diferida al acercarse la sección,
 * y el contenedor reserva altura mínima para no provocar CLS.
 */
export default function Resources() {
  const host = useRef<HTMLDivElement>(null);
  const [load, setLoad] = useState(false);

  useEffect(() => {
    const el = host.current;
    if (!el || load) return;
    if (!('IntersectionObserver' in window)) { setLoad(true); return; }
    const io = new IntersectionObserver(es => { if (es.some(e => e.isIntersecting)) { setLoad(true); io.disconnect(); } }, { rootMargin: '800px 0px' });
    io.observe(el);
    return () => io.disconnect();
  }, [load]);

  return (
    <section id="recursos" aria-labelledby="rec-title" className="curve-top relative bg-[#F1F5F9] px-4 pb-32 sm:px-6 lg:pb-40">
      <div className="mx-auto max-w-6xl">
        <div className="text-center" data-reveal="">
          <h2 id="rec-title" className="font-hand text-5xl font-bold leading-none text-ink sm:text-6xl">
            Recursos para <span className="relative inline-block">directores<Underline color="#2563EB" /></span>
          </h2>
          <p className="mx-auto mt-6 max-w-2xl text-lg text-slate-700">Guías prácticas sobre cobros, normativa y administración escolar, para decidir con más información.</p>
        </div>
        <div ref={host} className="min-h-[52rem] md:min-h-[24rem]">
          {load && <Suspense fallback={null}><ResourcesList /></Suspense>}
        </div>
      </div>
    </section>
  );
}
