import { Fragment, useEffect, useRef, useState, type KeyboardEvent, type RefObject } from 'react';
import { Link } from 'react-router-dom';
import type { Block } from '../../content/blog/types';
import { getArticle } from '../../content/blog';
import { parseInline } from '../../lib/inline';

const reduced = () => typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const linkCls = 'font-medium text-accent-dark underline decoration-accent/40 underline-offset-4 hover:decoration-accent-dark';

/** Texto en línea: [[slug|texto]] interno, [texto](https://…) externo, **negrita**. React escapa todo (sin HTML crudo). */
export function Rich({ text }: { text: string }) {
  return (
    <>
      {parseInline(text, s => !!getArticle(s)).map((t, i) => {
        if (t.k === 'int') return <Link key={i} to={`/blog/${t.slug}`} className={linkCls}>{t.v}</Link>;
        if (t.k === 'ext') return <a key={i} href={t.href} target="_blank" rel="noopener noreferrer" className={linkCls}>{t.v}<span className="sr-only"> (se abre en una pestaña nueva)</span></a>;
        if (t.k === 'b') return <strong key={i} className="font-semibold text-ink">{t.v}</strong>;
        return <Fragment key={i}>{t.v}</Fragment>;
      })}
    </>
  );
}

export function BlockView({ b }: { b: Block }) {
  switch (b.t) {
    case 'p': return <p><Rich text={b.text} /></p>;
    case 'h3': return <h3 className="mt-8 text-xl font-bold text-ink">{b.text}</h3>;
    case 'ul': return <ul className="list-disc space-y-2 pl-6 marker:text-accent">{b.items.map((x, i) => <li key={i}><Rich text={x} /></li>)}</ul>;
    case 'ol': return <ol className="list-decimal space-y-2 pl-6 marker:font-semibold marker:text-accent-dark">{b.items.map((x, i) => <li key={i}><Rich text={x} /></li>)}</ol>;
    case 'callout':
      return (
        <aside className="blog-callout rounded-2xl border-l-4 border-amber-500 bg-amber-50 p-5 text-amber-950" aria-label={b.title}>
          <p className="font-bold">{b.title}</p>
          <p className="mt-1 leading-relaxed"><Rich text={b.text} /></p>
        </aside>
      );
    case 'table':
      return (
        <div className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0" tabIndex={0} role="region" aria-label={b.caption ?? 'Tabla'}>
          <table className="w-full min-w-[34rem] text-left text-[15px] leading-6">
            {b.caption && <caption className="pb-3 text-left text-sm font-semibold text-slate-700">{b.caption}</caption>}
            <thead>
              <tr>{b.head.map((h, i) => <th key={i} scope="col" className="border-b-2 border-slate-300 bg-slate-100 px-3 py-2.5 font-bold text-ink">{h}</th>)}</tr>
            </thead>
            <tbody>
              {b.rows.map((r, ri) => (
                <tr key={ri} className="odd:bg-white even:bg-slate-50">
                  {r.map((c, ci) => ci === 0
                    ? <th key={ci} scope="row" className="border-b border-slate-200 px-3 py-2.5 align-top font-semibold text-ink"><Rich text={c} /></th>
                    : <td key={ci} className="border-b border-slate-200 px-3 py-2.5 align-top"><Rich text={c} /></td>)}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
  }
}

/** Desplazamiento suave con foco en el destino (respeta prefers-reduced-motion). */
export function goTo(e: { preventDefault(): void }, id: string) {
  e.preventDefault();
  const el = document.getElementById(id);
  if (!el) return;
  el.scrollIntoView({ behavior: reduced() ? 'auto' : 'smooth', block: 'start' });
  history.replaceState(null, '', `#${id}`);
  el.setAttribute('tabindex', '-1');
  el.focus({ preventScroll: true });
}

/** Sección activa según el scroll (IntersectionObserver sobre los h2). */
export function useActiveId(ids: string[]): string {
  const [active, setActive] = useState(ids[0] ?? '');
  const key = ids.join('|');
  useEffect(() => {
    setActive(ids[0] ?? '');
    if (!('IntersectionObserver' in window)) return;
    const els = ids.map(id => document.getElementById(id)).filter((x): x is HTMLElement => !!x);
    const io = new IntersectionObserver(entries => {
      const vis = entries.filter(en => en.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0];
      if (vis) setActive(vis.target.id);
    }, { rootMargin: '-90px 0px -65% 0px' });
    els.forEach(el => io.observe(el));
    return () => io.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return active;
}

export function Toc({ items, active, variant }: { items: { id: string; title: string }[]; active: string; variant: 'mobile' | 'desktop' }) {
  const list = (
    <ol className="space-y-1 text-sm">
      {items.map(it => {
        const on = it.id === active;
        return (
          <li key={it.id}>
            <a href={`#${it.id}`} onClick={e => goTo(e, it.id)} aria-current={on ? 'location' : undefined}
               className={`block rounded-lg border-l-2 py-1.5 pl-3 pr-2 leading-snug transition-colors ${on ? 'border-accent bg-accent-soft/60 font-semibold text-accent-dark' : 'border-slate-200 text-slate-700 hover:border-slate-400 hover:text-ink'}`}>
              {it.title}
            </a>
          </li>
        );
      })}
    </ol>
  );
  return variant === 'mobile' ? (
      <details className="blog-noprint mb-8 rounded-2xl border border-slate-200 bg-white p-4 lg:hidden">
        <summary className="cursor-pointer text-base font-bold text-ink">En este artículo</summary>
        <nav aria-label="Contenido del artículo (móvil)" className="mt-3">{list}</nav>
      </details>
  ) : (
      <aside className="blog-noprint hidden lg:block">
        <nav aria-label="Contenido del artículo" className="sticky top-24 max-h-[calc(100vh-7rem)] overflow-y-auto pr-1">
          <p className="mb-3 text-sm font-bold uppercase tracking-wider text-slate-600">En este artículo</p>
          {list}
        </nav>
      </aside>
  );
}

export function ReadingProgress({ target }: { target: RefObject<HTMLElement> }) {
  const bar = useRef<HTMLDivElement>(null);
  useEffect(() => {
    let raf = 0;
    const update = () => {
      raf = 0;
      const el = target.current, b = bar.current;
      if (!el || !b) return;
      const r = el.getBoundingClientRect();
      const total = r.height - window.innerHeight * 0.6;
      const p = total > 0 ? Math.min(1, Math.max(0, -r.top / total)) : 0;
      b.style.transform = `scaleX(${p.toFixed(4)})`;
    };
    const on = () => { if (!raf) raf = requestAnimationFrame(update); };
    update();
    window.addEventListener('scroll', on, { passive: true });
    window.addEventListener('resize', on);
    return () => { window.removeEventListener('scroll', on); window.removeEventListener('resize', on); if (raf) cancelAnimationFrame(raf); };
  }, [target]);
  return <div ref={bar} className="blog-reading-bar blog-noprint fixed inset-x-0 top-0 z-[70] h-[3px] scale-x-0 bg-gradient-to-r from-accent via-sky-400 to-yellow-400" aria-hidden="true" />;
}

/** Compartir sin SDK de terceros: WhatsApp, copiar enlace y correo. */
export function ShareBar({ title }: { title: string }) {
  const [copied, setCopied] = useState(false);
  const url = () => window.location.href.split('#')[0];
  const copy = async () => {
    const u = url();
    try { await navigator.clipboard.writeText(u); }
    catch {
      const ta = document.createElement('textarea');
      ta.value = u;
      ta.setAttribute('readonly', '');
      ta.className = 'fixed left-0 top-0 h-px w-px opacity-0';
      document.body.appendChild(ta);
      ta.select();
      try { document.execCommand('copy'); } catch { /* sin portapapeles */ }
      ta.remove();
    }
    setCopied(true);
    window.setTimeout(() => setCopied(false), 2500);
  };
  const btn = 'inline-flex min-h-[44px] items-center gap-2 rounded-full border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-ink transition hover:border-ink';
  return (
    <div className="blog-noprint flex flex-wrap items-center gap-2" role="group" aria-label="Compartir este artículo">
      <span className="mr-1 text-sm font-semibold text-slate-700">Compartir</span>
      <a className={btn} target="_blank" rel="noopener noreferrer" href={`https://wa.me/?text=${encodeURIComponent(`${title} ${url()}`)}`}><i className="ph-bold ph-whatsapp-logo text-lg text-green-700" aria-hidden="true" />WhatsApp<span className="sr-only"> (se abre en una pestaña nueva)</span></a>
      <button type="button" className={btn} onClick={copy}><i className={`ph-bold ${copied ? 'ph-check' : 'ph-link'} text-lg text-accent-dark`} aria-hidden="true" />{copied ? 'Enlace copiado' : 'Copiar enlace'}</button>
      <a className={btn} href={`mailto:?subject=${encodeURIComponent(title)}&body=${encodeURIComponent(`${title}\n${url()}`)}`}><i className="ph-bold ph-envelope-simple text-lg text-accent-dark" aria-hidden="true" />Correo</a>
      <span role="status" className="sr-only">{copied ? 'Enlace copiado al portapapeles' : ''}</span>
    </div>
  );
}

/** Acordeón de preguntas frecuentes del artículo (mismo patrón accesible que el FAQ de la landing). */
export function FaqList({ items }: { items: { q: string; a: string }[] }) {
  const [open, setOpen] = useState<number | null>(0);
  const heads = useRef<Array<HTMLButtonElement | null>>([]);
  const onKey = (e: KeyboardEvent, i: number) => {
    const last = items.length - 1;
    const to = e.key === 'ArrowDown' ? (i === last ? 0 : i + 1) : e.key === 'ArrowUp' ? (i === 0 ? last : i - 1) : e.key === 'Home' ? 0 : e.key === 'End' ? last : -1;
    if (to < 0) return;
    e.preventDefault();
    heads.current[to]?.focus();
  };
  return (
    <div className="divide-y divide-slate-200 rounded-2xl border border-slate-200 bg-white">
      {items.map((f, i) => {
        const isOpen = open === i;
        return (
          <div key={f.q}>
            <h3>
              <button ref={el => { heads.current[i] = el; }} id={`bfaq-h-${i}`} type="button" aria-expanded={isOpen} aria-controls={`bfaq-p-${i}`}
                onClick={() => setOpen(isOpen ? null : i)} onKeyDown={e => onKey(e, i)}
                className="flex min-h-[56px] w-full items-center justify-between gap-4 px-5 py-3 text-left text-base font-semibold text-ink transition-colors hover:bg-slate-50">
                <span>{f.q}</span>
                <i className="ph-bold ph-caret-down faq-chev shrink-0 text-xl text-accent" aria-hidden="true" />
              </button>
            </h3>
            <div id={`bfaq-p-${i}`} role="region" aria-labelledby={`bfaq-h-${i}`} className={`faq-panel ${isOpen ? 'open' : ''}`}>
              <div><div className="px-5 pb-5 leading-relaxed text-slate-700"><Rich text={f.a} /></div></div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
