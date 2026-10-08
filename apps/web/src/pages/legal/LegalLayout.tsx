import { useEffect, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { SITE, LEGAL_ROUTES } from '../../lib/site';

export interface LegalSection { id: string; title: string }

/** Marca visible para datos pendientes (placeholders). */
export function Ph({ children }: { children: ReactNode }) {
  return <mark className="rounded bg-yellow-200 px-1 text-slate-900 print:bg-transparent print:underline">{children}</mark>;
}
/** Valor de SITE: si es un placeholder entre corchetes lo resalta. */
export function Site({ v }: { v: string }) {
  return v.startsWith('[') ? <Ph>{v}</Ph> : <>{v}</>;
}
export function Brand() {
  return <b>{SITE.legal.name}</b>;
}
/** Nombre comercial con enlace al sitio de marca. */
export function Trade() {
  return <a href={SITE.brandUrl} target="_blank" rel="noopener" className="font-semibold">{SITE.legal.tradeName}</a>;
}
export function S({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <section id={id} className="scroll-mt-24 mb-10">
      <h2 className="mb-3 text-xl font-semibold text-slate-900">{title}</h2>
      <div className="space-y-3 text-[15px] leading-7 text-slate-700 [&_a]:text-[#2563EB] [&_a]:underline [&_ol]:list-decimal [&_ol]:space-y-1.5 [&_ol]:pl-6 [&_ul]:list-disc [&_ul]:space-y-1.5 [&_ul]:pl-6 [&_h3]:mt-4 [&_h3]:font-semibold [&_h3]:text-slate-900">
        {children}
      </div>
    </section>
  );
}

const DOCS = [
  { to: LEGAL_ROUTES.terminos, label: 'Términos y Condiciones' },
  { to: LEGAL_ROUTES.privacidad, label: 'Política de Privacidad' },
  { to: LEGAL_ROUTES.cookies, label: 'Política de Cookies' },
  { to: LEGAL_ROUTES.arco, label: 'Derechos ARCO' },
];

function setMeta(name: string, content: string) {
  let el = document.head.querySelector<HTMLMetaElement>(`meta[name="${name}"]`);
  if (!el) { el = document.createElement('meta'); el.name = name; document.head.appendChild(el); }
  el.content = content;
}

export default function LegalLayout({ title, description, sections, children }: {
  title: string; description: string; sections: LegalSection[]; children: ReactNode;
}) {
  useEffect(() => {
    const prev = document.title;
    document.title = `${title} | ${SITE.name}`;
    setMeta('description', description);
    window.scrollTo(0, 0);
    return () => { document.title = prev; };
  }, [title, description]);

  const goTo = (e: React.MouseEvent, id: string) => {
    e.preventDefault();
    const el = document.getElementById(id);
    if (!el) return;
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    el.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' });
    history.replaceState(null, '', `#${id}`);
    el.setAttribute('tabindex', '-1'); el.focus({ preventScroll: true });
  };

  const date = new Date(SITE.updated + 'T12:00:00').toLocaleDateString('es-DO', { day: 'numeric', month: 'long', year: 'numeric' });

  return (
    <div className="min-h-screen bg-white font-sans text-slate-800 print:bg-white">
      <a href="#contenido" className="sr-only focus:not-sr-only focus:absolute focus:left-2 focus:top-2 focus:z-50 focus:rounded focus:bg-white focus:px-3 focus:py-2 print:hidden">Saltar al contenido</a>
      <header className="border-b border-slate-200 bg-white print:border-0">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-3">
          <Link to="/" aria-label="STODIA, ir al inicio"><span className="flex items-center gap-2"><img src="/brand/stodia-mark.svg" alt="" className="h-8 w-auto" /><img src="/brand/stodia-wordmark.svg" alt="" className="h-8 w-auto" /></span></Link>
          <div className="flex items-center gap-2 print:hidden">
            <button type="button" onClick={() => window.print()} className="rounded-md border border-slate-300 px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#2563EB]">Imprimir</button>
            <Link to="/" className="rounded-md bg-[#2563EB] px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-[#2563EB]">&larr; Volver al inicio</Link>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-6xl gap-10 px-4 py-8 lg:grid lg:grid-cols-[240px_minmax(0,1fr)]">
        <aside className="mb-8 lg:mb-0 print:hidden">
          <nav aria-label="Índice del documento" className="lg:sticky lg:top-6 lg:max-h-[calc(100vh-3rem)] lg:overflow-y-auto">
            <details className="rounded-lg border border-slate-200 p-3 lg:border-0 lg:p-0" open={typeof window !== 'undefined' && window.innerWidth >= 1024}>
              <summary className="cursor-pointer text-sm font-semibold text-slate-900 lg:cursor-default">Contenido</summary>
              <ol className="mt-2 space-y-1 text-sm">
                {sections.map(s => (
                  <li key={s.id}><a href={`#${s.id}`} onClick={e => goTo(e, s.id)} className="block rounded px-2 py-1 text-slate-600 hover:bg-slate-100 hover:text-[#2563EB] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#2563EB]">{s.title}</a></li>
                ))}
              </ol>
            </details>
            <div className="mt-6 border-t border-slate-200 pt-4 text-sm">
              <p className="mb-1 font-semibold text-slate-900">Otros documentos</p>
              <ul className="space-y-1">
                {DOCS.map(d => <li key={d.to}><Link to={d.to} className="text-[#2563EB] hover:underline">{d.label}</Link></li>)}
              </ul>
            </div>
          </nav>
        </aside>

        <main id="contenido" className="min-w-0 max-w-3xl">
          <h1 className="text-3xl font-bold tracking-tight text-slate-900">{title}</h1>
          <p className="mt-1 text-sm text-slate-500">Última actualización: {date}</p>

          <div className="mt-8">{children}</div>
        </main>
      </div>

      <footer className="border-t border-slate-200 py-6 text-center text-xs text-slate-500">
        <nav aria-label="Documentos legales" className="mb-2 flex flex-wrap justify-center gap-x-4 gap-y-1 print:hidden">
          {DOCS.map(d => <Link key={d.to} to={d.to} className="hover:text-[#2563EB] hover:underline">{d.label}</Link>)}
          <button type="button" onClick={() => window.dispatchEvent(new Event('stodia:open-cookie-preferences'))} className="hover:text-[#2563EB] hover:underline">Preferencias de cookies</button>
        </nav>
        <p>&copy; {new Date().getFullYear()} {SITE.legal.name}, RNC {SITE.legal.rnc} · nombre comercial <Trade /> · {SITE.name}</p>
      </footer>

      <style>{`@media print{ details>summary{display:none} a{color:inherit!important;text-decoration:none!important} section{break-inside:avoid-page} h1,h2{break-after:avoid} body{font-size:11pt} }`}</style>
    </div>
  );
}
