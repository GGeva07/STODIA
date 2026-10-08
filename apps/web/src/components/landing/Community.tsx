import type { CSSProperties } from 'react';
import { Squiggle } from './Doodles';

/** Datos del producto (verificables en el código), NO métricas de clientes. */
const STATS = [
  { n: 22, suffix: '', label: 'pantallas de trabajo', hint: 'de Inscripción a Auditoría' },
  { n: 6, suffix: '', label: 'roles con acceso a medida', hint: 'Dirección, Docente, Caja, Comedor, Tutor y Admin' },
  { n: 3, suffix: '', label: 'formas de usarlo', hint: 'Web/PWA, Android y Windows' },
  { n: 2, suffix: '', label: 'modalidades de despliegue', hint: 'en tu servidor o alojado por nosotros' },
];

/** Compromisos de STODIA (declaración de la marca, no un testimonio de clientes). */
const COMMITMENTS = [
  { icon: 'ph-hard-drives', title: 'Una instancia por colegio', text: 'Tus datos están aislados de los de cualquier otro colegio, en tu servidor o en nuestra instancia gestionada.' },
  { icon: 'ph-export', title: 'Tus datos son tuyos', text: 'Puedes exportarlos y pedir su devolución al terminar el servicio.' },
  { icon: 'ph-chat-circle-dots', title: 'Soporte en español dominicano', text: 'Hablamos tu idioma y entendemos cómo trabaja un colegio dominicano.' },
];

/** Mosaico decorativo: formas de color con los perfiles de la comunidad escolar. */
const TILES: { icon: string; bg: string; fg: string; shape: string; label: string }[] = [
  { icon: 'ph-chalkboard-teacher', bg: '#FDE047', fg: '#713F12', shape: 'rounded-[2rem_0.5rem_2rem_0.5rem]', label: 'Docentes' },
  { icon: 'ph-student', bg: '#93C5FD', fg: '#1E3A8A', shape: 'rounded-full', label: 'Estudiantes' },
  { icon: 'ph-users-three', bg: '#FDA4AF', fg: '#881337', shape: 'rounded-2xl', label: 'Familias' },
  { icon: 'ph-cash-register', bg: '#86EFAC', fg: '#14532D', shape: 'rounded-[0.5rem_2rem_0.5rem_2rem]', label: 'Caja' },
  { icon: 'ph-briefcase', bg: '#C4B5FD', fg: '#4C1D95', shape: 'rounded-2xl', label: 'Dirección' },
  { icon: 'ph-fork-knife', bg: '#FDBA74', fg: '#7C2D12', shape: 'rounded-full', label: 'Comedor' },
];

export default function Community() {
  return (
    <section id="comunidad" aria-labelledby="com-title" className="curve-top on-dark relative overflow-hidden bg-[#0F2A6B] px-4 pb-32 text-white sm:px-6 lg:pb-40">
      <div className="shape -right-24 top-24 h-80 w-80 rounded-full bg-blue-500/25 blur-3xl" data-parallax="0.15" aria-hidden="true" />
      <div className="shape -left-20 bottom-20 h-72 w-72 rounded-full bg-yellow-300/10 blur-3xl" data-parallax="0.1" aria-hidden="true" />

      <div className="relative mx-auto max-w-6xl">
        <div className="mx-auto max-w-3xl text-center" data-reveal="">
          <h2 id="com-title" className="font-hand text-5xl font-bold leading-[1.02] sm:text-6xl">
            Una plataforma para <span className="marker text-ink">toda la comunidad</span> escolar
          </h2>
          <p className="mt-5 text-lg text-blue-100">Dirección, docentes, caja, comedor y familias trabajan sobre la misma información, cada quien desde su rol.</p>
        </div>

        <ul className="mt-14 grid grid-cols-2 gap-4 lg:grid-cols-4">
          {STATS.map((s, i) => (
            <li key={s.label} className="rounded-3xl border border-white/10 bg-white/5 p-5 text-center sm:p-6" data-reveal="" style={{ ['--d' as string]: `${i * 90}ms` } as CSSProperties}>
              <p className="tabnum font-hand text-6xl font-bold leading-none text-yellow-300 sm:text-7xl" data-count={s.n} data-suffix={s.suffix}>{s.n}{s.suffix}</p>
              <p className="mt-3 text-base font-semibold">{s.label}</p>
              <p className="mt-1 text-sm text-blue-100">{s.hint}</p>
            </li>
          ))}
        </ul>

        <div className="mt-20 grid items-center gap-12 lg:grid-cols-2">
          <div className="grid grid-cols-3 gap-3" aria-label="Perfiles de la comunidad escolar" role="list">
            {TILES.map((t, i) => (
              <div key={t.label} role="listitem" data-reveal="zoom" style={{ ['--d' as string]: `${i * 70}ms` } as CSSProperties}>
                <div className={`tilt flex aspect-square flex-col items-center justify-center gap-1 ${t.shape}`} style={{ background: t.bg, color: t.fg }}>
                  <i className={`ph-fill ${t.icon} float text-4xl sm:text-5xl`} style={{ ['--fd' as string]: `${i * 0.4}s` } as CSSProperties} aria-hidden="true" />
                  <span className="text-xs font-bold sm:text-sm">{t.label}</span>
                </div>
              </div>
            ))}
          </div>

          <figure className="relative" data-reveal="right">
            <span className="absolute -left-2 -top-10 select-none font-serif text-[9rem] leading-none text-yellow-300/90" aria-hidden="true">&ldquo;</span>
            <p className="inline-flex items-center gap-2 rounded-full bg-yellow-300 px-3 py-1 text-xs font-bold uppercase tracking-wide text-ink">
              <i className="ph-fill ph-handshake" aria-hidden="true" /> Nuestro compromiso
            </p>
            <blockquote className="relative mt-5 font-hand text-3xl font-semibold leading-snug sm:text-4xl">
              Cada colegio tiene su propia instancia. Tus datos son tuyos y se pueden exportar. Y te atendemos en español dominicano.
            </blockquote>
            <ul className="mt-6 space-y-3 text-blue-50">
              {COMMITMENTS.map(c => (
                <li key={c.title} className="flex items-start gap-3">
                  <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white/15"><i className={`ph-fill ${c.icon} text-lg text-yellow-300`} aria-hidden="true" /></span>
                  <span><strong className="block text-white">{c.title}</strong><span className="text-sm text-blue-100">{c.text}</span></span>
                </li>
              ))}
            </ul>
            <div className="mt-7 rounded-3xl border border-yellow-300/40 bg-white/5 p-5">
              <p className="font-hand text-3xl font-bold leading-tight text-yellow-300">Programa de colegios pioneros</p>
              <p className="mt-2 text-blue-100">Sé de los primeros colegios en implementarlo y ayúdanos a darle forma a STODIA con tu experiencia del día a día.</p>
              <a href="#demo" className="mt-4 inline-flex items-center gap-2 rounded-full bg-yellow-300 px-5 py-3 text-sm font-bold text-ink transition hover:bg-yellow-200">
                Quiero ser colegio pionero <i className="ph-bold ph-arrow-right" aria-hidden="true" />
              </a>
            </div>
            <Squiggle className="mt-6" color="#FDE047" />
          </figure>
        </div>
      </div>
    </section>
  );
}
