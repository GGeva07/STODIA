import type { CSSProperties } from 'react';
import { Squiggle } from './Doodles';
import { MODULES } from './data';

/** Franja infinita de módulos (decorativa; la lista real está en la cuadrícula inferior). */
export function ModulesMarquee() {
  const group = (clone: boolean) => (
    <div className={`flex gap-3 ${clone ? 'marquee-clone' : ''}`} aria-hidden={clone ? 'true' : undefined}>
      {MODULES.map(m => (
        <span key={m.id} className="inline-flex shrink-0 items-center gap-2 rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-800 shadow-sm">
          <i className={`ph-fill ${m.icon} text-lg`} style={{ color: m.c[1] }} aria-hidden="true" />
          {m.name}
        </span>
      ))}
    </div>
  );
  return (
    <div className="relative z-10">
      <div className="marquee" role="presentation">
        <div className="marquee-track">
          {group(false)}
          {group(true)}
        </div>
      </div>
    </div>
  );
}

export default function Modules() {
  return (
    <section id="modulos" aria-labelledby="mod-title" className="curve-top relative z-0 bg-[#F1F5F9] px-4 pb-32 sm:px-6 lg:pb-40">
      <div className="mx-auto max-w-6xl">
        <div className="mx-auto max-w-3xl text-center" data-reveal="">
          <h2 id="mod-title" className="font-hand text-5xl font-bold leading-none text-ink sm:text-6xl">
            Todo lo que tu colegio necesita, <span className="marker">en un solo sistema</span>
          </h2>
          <p className="mt-5 text-lg text-slate-700">Veinte módulos que comparten el mismo directorio de alumnos y tutores: cada dato se captura una sola vez y se usa en todas partes.</p>
        </div>

        <ul className="mt-12 grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 lg:grid-cols-4 xl:grid-cols-5" aria-label="Módulos de STODIA">
          {MODULES.map((m, i) => (
            <li key={m.id} data-reveal="" style={{ ['--d' as string]: `${(i % 5) * 60}ms` } as CSSProperties}>
              <div className="module-card tilt flex h-full flex-col gap-3 rounded-2xl p-4 sm:p-5" style={{ background: m.c[0] }}>
                <span className="module-icon flex h-12 w-12 items-center justify-center rounded-xl bg-white/80" style={{ color: m.c[1] }}>
                  <i className={`ph-fill ${m.icon} text-3xl`} aria-hidden="true" />
                </span>
                <div>
                  <h3 className="text-base font-bold leading-tight text-ink">{m.name}</h3>
                  <p className="mt-1 text-sm leading-snug text-slate-700">{m.desc}</p>
                </div>
              </div>
            </li>
          ))}
        </ul>

        <div className="mx-auto mt-12 max-w-2xl text-center" data-reveal="">
          <Squiggle className="mx-auto mb-3" />
          <p className="text-lg text-slate-700">
            Empieza por lo que necesitas hoy y crece a tu ritmo. Cada rol, desde Dirección hasta el Tutor, ve solamente las pantallas que le corresponden.
          </p>
        </div>
      </div>
    </section>
  );
}
