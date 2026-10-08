import { useRef, useState, type KeyboardEvent } from 'react';
import { Link } from 'react-router-dom';
import { Underline } from './Doodles';
import { FAQ } from './data';

export default function Faq() {
  const [open, setOpen] = useState<number | null>(0);
  const heads = useRef<Array<HTMLButtonElement | null>>([]);

  const onKey = (e: KeyboardEvent, i: number) => {
    const last = FAQ.length - 1;
    const to = e.key === 'ArrowDown' ? (i === last ? 0 : i + 1) : e.key === 'ArrowUp' ? (i === 0 ? last : i - 1) : e.key === 'Home' ? 0 : e.key === 'End' ? last : -1;
    if (to < 0) return;
    e.preventDefault();
    heads.current[to]?.focus();
  };

  return (
    <section id="faq" aria-labelledby="faq-title" className="curve-top relative bg-white px-4 pb-32 sm:px-6 lg:pb-40">
      <div className="mx-auto max-w-3xl">
        <div className="text-center" data-reveal="">
          <h2 id="faq-title" className="font-hand text-5xl font-bold leading-none text-ink sm:text-6xl">
            Preguntas <span className="relative inline-block">frecuentes<Underline color="#F59E0B" /></span>
          </h2>
          <p className="mt-6 text-lg text-slate-700">Lo que más nos preguntan los directores y administradores antes de empezar.</p>
        </div>

        <div className="mt-12 divide-y divide-slate-200 rounded-3xl border border-slate-200 bg-white shadow-sm" data-reveal="">
          {FAQ.map((f, i) => {
            const isOpen = open === i;
            return (
              <div key={f.q}>
                <h3>
                  <button
                    ref={el => { heads.current[i] = el; }}
                    id={`faq-h-${i}`}
                    type="button"
                    aria-expanded={isOpen}
                    aria-controls={`faq-p-${i}`}
                    onClick={() => setOpen(isOpen ? null : i)}
                    onKeyDown={e => onKey(e, i)}
                    className="flex min-h-[64px] w-full items-center justify-between gap-4 px-5 py-4 text-left text-base font-semibold text-ink transition-colors hover:bg-slate-50 sm:px-7 sm:text-lg"
                  >
                    <span>{f.q}</span>
                    <i className="ph-bold ph-caret-down faq-chev shrink-0 text-xl text-accent" aria-hidden="true" />
                  </button>
                </h3>
                <div id={`faq-p-${i}`} role="region" aria-labelledby={`faq-h-${i}`} className={`faq-panel ${isOpen ? 'open' : ''}`}>
                  <div>
                    <div className="px-5 pb-6 text-slate-700 sm:px-7">
                      <p className="leading-relaxed">{f.a}</p>
                      {f.link && <Link to={f.link.to} className="mt-3 inline-flex items-center gap-1 font-semibold text-accent underline underline-offset-4 hover:text-accent-dark">{f.link.label} <i className="ph ph-arrow-right" aria-hidden="true" /></Link>}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
